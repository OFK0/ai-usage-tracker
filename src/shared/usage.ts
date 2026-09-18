import type { ProviderId } from './app-info'

/**
 * `loading`: nothing fetched yet.
 * `stale`: the last fetch failed, so the data shown is from an earlier one.
 * `unauthenticated`: the provider's CLI is installed but its sign-in is missing or expired.
 * `not_installed`: no trace of the provider's CLI on this machine.
 * `disconnected`: the user hasn't connected the provider in settings, so nothing was read.
 * `error`: the fetch failed and there is no earlier data to fall back on.
 */
export type ProviderStatus =
  'loading' | 'ok' | 'stale' | 'unauthenticated' | 'not_installed' | 'disconnected' | 'error'

export type SnapshotSource = 'oauth' | 'local' | 'admin-api'

export interface LimitWindow {
  /** `session`, `weekly`, or a provider-specific kind such as `weekly_opus`. */
  key: string
  /** Narrows a limit to part of the product, such as a model name. */
  scope: string | null
  /** Always the share already used, 0 to 100, whichever way the provider reports it. */
  usedPercent: number
  used: number | null
  limit: number | null
  /** As reported by the provider. Never computed on our side. */
  resetsAt: string | null
  exhausted: boolean
  /** False when the plan doesn't include this limit. It must never render as exhausted. */
  applicable: boolean
  unlimited: boolean
}

/** Pay-as-you-go credits that take over once plan limits run out. */
export interface Credits {
  used: number
  limit: number | null
  currency: string
  enabled: boolean
}

export interface TokenCounts {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

/**
 * What the CLI's own session logs say, used when the provider's API can't be
 * reached. It has no limits in it, so it can't give a percentage.
 */
export interface LocalActivity {
  /** The session window in progress, or null when there has been no recent activity. */
  block: {
    startedAt: string
    endsAt: string
    /** True when the window times come from the provider rather than an estimate. */
    exact: boolean
    messages: number
    tokens: TokenCounts
  } | null
  lastActivityAt: string | null
}

/** Pay-as-you-go API spend, separate from any subscription. Days are UTC. */
export interface ApiSpend {
  currency: string
  today: number
  month: number
}

export interface ProviderSnapshot {
  providerId: ProviderId
  status: ProviderStatus
  source: SnapshotSource | null
  planLabel: string | null
  windows: LimitWindow[]
  credits: Credits | null
  activity: LocalActivity | null
  apiSpend: ApiSpend | null
  /** When the data shown was fetched. Older than the last attempt while stale. */
  fetchedAt: string | null
  /** Short technical reason behind the status, meant for a tooltip. */
  detail: string | null
}
