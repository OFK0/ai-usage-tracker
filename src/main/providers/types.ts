import type { ProviderId } from '@shared/app-info'
import type { Credits, LimitWindow, SnapshotSource } from '@shared/usage'

/** What a provider returns on success. The poller turns it into a snapshot. */
export interface ProviderReading {
  source: SnapshotSource
  planLabel: string | null
  windows: LimitWindow[]
  credits: Credits | null
}

export interface UsageProvider {
  id: ProviderId
  read(signal: AbortSignal): Promise<ProviderReading>
}

/**
 * `not_installed` and `unauthenticated` describe the user's setup and are shown
 * as they are. The rest are transient, so the poller keeps showing the last good
 * data as stale and backs off.
 */
export type ProviderErrorKind =
  'not_installed' | 'unauthenticated' | 'rate_limited' | 'unavailable' | 'unexpected_response'

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfterMs: number | null = null
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
