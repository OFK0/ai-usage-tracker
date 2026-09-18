import { errorMessage, parseRetryAfter } from '../../lib/http'
import { ProviderError, type UsageProvider } from '../types'
import type { ClaudeCredentials } from './credentials'
import { parseClaudeUsage } from './usage-response'

export const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

export interface ClaudeProviderDeps {
  readCredentials(): Promise<ClaudeCredentials | null>
  /** Whether Claude Code has ever run here, to tell "not installed" from "signed out". */
  isInstalled(): Promise<boolean>
  fetch(url: string, init: RequestInit): Promise<Response>
  userAgent: string
  now?: () => number
}

/** `pro` -> `Pro`, `max` with a `max_5x` tier -> `Max 5x`. */
export function claudePlanLabel(credentials: ClaudeCredentials): string | null {
  const type = credentials.subscriptionType
  if (!type) return null

  const name = type.charAt(0).toUpperCase() + type.slice(1)
  const multiplier = /max_(\d+)x/.exec(credentials.rateLimitTier ?? '')?.[1]
  return multiplier ? `${name} ${multiplier}x` : name
}

export function createClaudeProvider(deps: ClaudeProviderDeps): UsageProvider {
  const now = deps.now ?? Date.now
  // Once the server refuses a token it stays refused. Until Claude Code writes a
  // new one, asking again would only be another 401.
  let rejectedToken: string | null = null

  return {
    id: 'claude',

    read: async (signal) => {
      const credentials = await deps.readCredentials()

      if (!credentials) {
        throw (await deps.isInstalled())
          ? new ProviderError('unauthenticated', 'Not signed in to Claude Code')
          : new ProviderError('not_installed', 'Claude Code was not found')
      }
      // Claude Code refreshes the token whenever it runs. We never use the
      // refresh token ourselves, so an expired one means waiting for that.
      if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
        throw new ProviderError('unauthenticated', 'Claude Code sign-in has expired')
      }
      if (credentials.accessToken === rejectedToken) {
        throw new ProviderError('unauthenticated', 'Claude Code sign-in was rejected')
      }

      let response: Response
      try {
        response = await deps.fetch(CLAUDE_USAGE_URL, {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': deps.userAgent,
            Accept: 'application/json'
          },
          signal
        })
      } catch (error) {
        throw new ProviderError('unavailable', `Request failed: ${errorMessage(error)}`)
      }

      if (response.status === 401 || response.status === 403) {
        rejectedToken = credentials.accessToken
        throw new ProviderError('unauthenticated', `Sign-in was rejected (HTTP ${response.status})`)
      }
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now())
        throw new ProviderError('rate_limited', 'Rate limited (HTTP 429)', retryAfter)
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

      const { windows, credits } = parseClaudeUsage(body)
      return { source: 'oauth', planLabel: claudePlanLabel(credentials), windows, credits }
    }
  }
}
