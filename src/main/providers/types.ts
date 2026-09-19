import type { ProviderId } from '@shared/app-info'
import type {
  ApiSpend,
  Credits,
  LimitWindow,
  LocalActivity,
  ProviderSnapshot,
  SnapshotSource
} from '@shared/usage'

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
 * `disconnected`, `not_installed` and `unauthenticated` describe the user's
 * setup and are shown as they are. The rest are transient, so the poller keeps
 * showing the last good data as stale and backs off.
 */
export type ProviderErrorKind =
  | 'disconnected'
  | 'not_installed'
  | 'unauthenticated'
  | 'rate_limited'
  | 'unavailable'
  | 'unexpected_response'

/**
 * Facts a provider still knows after its main source failed, such as local
 * logs. Limits read back from a log come with the time they were true as
 * `fetchedAt`, so they show as stale from then rather than as fresh.
 */
export type Salvage = Partial<
  Pick<ProviderSnapshot, 'activity' | 'apiSpend' | 'windows' | 'planLabel' | 'source' | 'fetchedAt'>
>

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
