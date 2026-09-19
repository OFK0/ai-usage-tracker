import { errorMessage, parseRetryAfter } from '../../lib/http'
import { ProviderError, type ProviderReading, type UsageProvider } from '../types'
import type { CodexAuth } from './auth'
import type { LoggedRateLimits } from './session-log'
import { parseCodexUsage } from './usage-response'

/** What `codex /status` reads its limits from. */
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

export interface CodexProviderDeps {
  /** The user's connect switch in settings. Nothing of Codex's is read while it's off. */
  isConnected: () => boolean
  /** Throws away anything already read from Codex, once the user disconnects. */
  forgetLocalData: () => void
  readAuth: () => Promise<CodexAuth>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** The limits Codex last wrote to its session log. */
  readLoggedLimits: () => Promise<LoggedRateLimits | null>
  userAgent: string
  now?: () => number
}

export function createCodexProvider(deps: CodexProviderDeps): UsageProvider {
  const now = deps.now ?? Date.now
  // As with Claude: a refused token stays refused until Codex writes a new one.
  let rejectedToken: string | null = null
  // When the API last answered, so the log is only used when it knows better.
  let lastApiReadAt = 0

  async function readApi(signal: AbortSignal): Promise<ProviderReading> {
    const auth = await deps.readAuth()

    if ('missing' in auth) {
      switch (auth.missing) {
        case 'not_installed':
          throw new ProviderError('not_installed', 'Codex was not found')
        case 'signed_out':
          throw new ProviderError('unauthenticated', 'Not signed in to Codex with ChatGPT')
        case 'api_key':
          throw new ProviderError(
            'unauthenticated',
            'Codex is signed in with an API key, which has no plan limits'
          )
      }
    }
    if (auth.accessToken === rejectedToken) {
      throw new ProviderError('unauthenticated', 'Codex sign-in was rejected')
    }

    let response: Response
    try {
      response = await deps.fetch(CODEX_USAGE_URL, {
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          ...(auth.accountId ? { 'ChatGPT-Account-Id': auth.accountId } : {}),
          'User-Agent': deps.userAgent,
          Accept: 'application/json'
        },
        signal
      })
    } catch (error) {
      throw new ProviderError('unavailable', `Request failed: ${errorMessage(error)}`)
    }

    // chatgpt.com sits behind Cloudflare, whose challenges and blocks are 403s
    // too, but HTML ones that say nothing about the token. The API itself
    // answers in JSON.
    const isApiAnswer = response.headers.get('content-type')?.includes('json') ?? false
    if (
      response.headers.get('cf-mitigated') === 'challenge' ||
      (response.status === 403 && !isApiAnswer)
    ) {
      throw new ProviderError(
        'unavailable',
        `Blocked before reaching the API (HTTP ${response.status})`
      )
    }
    if (response.status === 401 || response.status === 403) {
      rejectedToken = auth.accessToken
      throw new ProviderError('unauthenticated', `Sign-in was rejected (HTTP ${response.status})`)
    }
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now())
      throw new ProviderError('rate_limited', 'Rate limited (HTTP 429)', { retryAfterMs })
    }
    if (response.status >= 500) {
      throw new ProviderError('unavailable', `HTTP ${response.status}`)
    }
    if (!response.ok) {
      throw new ProviderError('unexpected_response', `HTTP ${response.status}`)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProviderError('unexpected_response', 'Response was not JSON')
    }

    const { planLabel, windows } = parseCodexUsage(body, now())
    return { source: 'oauth', planLabel, windows, credits: null, activity: null, apiSpend: null }
  }

  return {
    id: 'codex',

    read: async (signal) => {
      if (!deps.isConnected()) {
        rejectedToken = null
        lastApiReadAt = 0
        deps.forgetLocalData()
        throw new ProviderError('disconnected', 'Codex is not connected in settings')
      }

      try {
        const reading = await readApi(signal)
        lastApiReadAt = now()
        return reading
      } catch (error) {
        const failure =
          error instanceof ProviderError
            ? error
            : new ProviderError('unavailable', errorMessage(error))
        if (failure.kind === 'not_installed') throw failure

        // Codex logs the limits after every turn, so with the API out of reach
        // the log still says where things stood, as of its last turn. Only
        // worth showing if that's newer than what the API last said.
        const logged = await deps.readLoggedLimits().catch(() => null)
        if (!logged || logged.observedAt <= lastApiReadAt) throw failure

        throw failure.withSalvage({
          source: 'local',
          windows: logged.windows,
          fetchedAt: new Date(logged.observedAt).toISOString(),
          ...(logged.planLabel ? { planLabel: logged.planLabel } : {})
        })
      }
    }
  }
}
