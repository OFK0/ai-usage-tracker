import type { ProviderId } from '@shared/app-info'
import type { ApiSpend, Credits, LimitWindow, LocalActivity, SnapshotSource } from '@shared/usage'

/** What a provider returns on success. The poller turns it into a snapshot. */
export interface ProviderReading {
  source: SnapshotSource
  planLabel: string | null
  windows: LimitWindow[]
  credits: Credits | null
  activity: LocalActivity | null
  apiSpend: ApiSpend | null
}

export interface UsageProvider {
  id: ProviderId
  read: (signal: AbortSignal) => Promise<ProviderReading>
}

/**
 * `not_installed` and `unauthenticated` describe the user's setup and are shown
 * as they are. The rest are transient, so the poller keeps showing the last good
 * data as stale and backs off.
 */
export type ProviderErrorKind =
  'not_installed' | 'unauthenticated' | 'rate_limited' | 'unavailable' | 'unexpected_response'

/** Facts a provider still knows after its main source failed, such as local logs. */
export type Salvage = Partial<Pick<ProviderReading, 'activity' | 'apiSpend'>>

export class ProviderError extends Error {
  readonly retryAfterMs: number | null
  readonly salvage: Salvage | null

  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    options: { retryAfterMs?: number | null; salvage?: Salvage | null } = {}
  ) {
    super(message)
    this.name = 'ProviderError'
    this.retryAfterMs = options.retryAfterMs ?? null
    this.salvage = options.salvage ?? null
  }

  withSalvage(salvage: Salvage): ProviderError {
    return new ProviderError(this.kind, this.message, { retryAfterMs: this.retryAfterMs, salvage })
  }
}
