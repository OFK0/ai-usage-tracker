import { errorMessage, parseRetryAfter } from '../../lib/http'
import { ProviderError, type UsageProvider } from '../types'
import { parseCopilotUser } from './quota'
import type { TokenResolution } from './token'

/** Undocumented, but it's what the editor extensions read their quota from. */
export const COPILOT_USER_URL = 'https://api.github.com/copilot_internal/user'

export interface CopilotProviderDeps {
  resolveToken: () => Promise<TokenResolution>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  userAgent: string
  now?: () => number
}

/**
 * How long GitHub wants us to wait, if it said. A secondary limit sends
 * Retry-After; the primary one sends 403 or 429 with no requests remaining and
 * the reset time as epoch seconds.
 */
export function githubRateLimitWait(headers: Headers, now: number): number | null {
  const retryAfter = parseRetryAfter(headers.get('retry-after'), now)
  if (retryAfter !== null) return retryAfter

  if (headers.get('x-ratelimit-remaining') !== '0') return null
  const reset = Number(headers.get('x-ratelimit-reset'))
  return Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now) : null
}

export function createCopilotProvider(deps: CopilotProviderDeps): UsageProvider {
  const now = deps.now ?? Date.now
  // As with Claude: once GitHub refuses a token it stays refused until the
  // user signs in again or types a new one.
  let rejectedToken: string | null = null

  return {
    id: 'copilot',

    read: async (signal) => {
      const resolved = await deps.resolveToken()

      if ('missing' in resolved) {
        switch (resolved.missing) {
          case 'disconnected':
            rejectedToken = null
            throw new ProviderError('disconnected', 'GitHub is not connected in settings')
          case 'not_installed':
            throw new ProviderError(
              'not_installed',
              'Found neither the GitHub CLI nor a Copilot sign-in from an editor'
            )
          case 'signed_out':
            throw new ProviderError('unauthenticated', 'Not signed in to GitHub')
        }
      }

      const { token } = resolved
      if (token === rejectedToken) {
        throw new ProviderError('unauthenticated', 'GitHub rejected this sign-in')
      }

      let response: Response
      try {
        response = await deps.fetch(COPILOT_USER_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'User-Agent': deps.userAgent
          },
          signal
        })
      } catch (error) {
        throw new ProviderError('unavailable', `Request failed: ${errorMessage(error)}`)
      }

      if (response.status === 401) {
        rejectedToken = token
        throw new ProviderError('unauthenticated', 'GitHub rejected this sign-in (HTTP 401)')
      }
      if (response.status === 403 || response.status === 429) {
        const wait = githubRateLimitWait(response.headers, now())
        if (wait !== null || response.status === 429) {
          throw new ProviderError('rate_limited', `Rate limited (HTTP ${response.status})`, {
            retryAfterMs: wait
          })
        }
        throw new ProviderError('unexpected_response', 'GitHub refused the request (HTTP 403)')
      }
      if (response.status === 404) {
        throw new ProviderError(
          'unexpected_response',
          'This GitHub account has no Copilot access (HTTP 404)'
        )
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

      const { planLabel, windows } = parseCopilotUser(body)
      return { source: 'oauth', planLabel, windows, credits: null, activity: null, apiSpend: null }
    }
  }
}
