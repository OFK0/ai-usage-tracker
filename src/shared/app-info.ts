/** Metadata shared between the main and renderer processes. */
export const APP_ID = 'com.ofk0.ai-usage-tracker'
export const APP_NAME = 'AI Usage Tracker'

/** Providers the tracker knows about. Individual providers land in later milestones. */
export const PROVIDER_IDS = ['claude', 'codex', 'copilot', 'antigravity'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

/** Providers that have an implementation, in the order they're listed. */
export const SUPPORTED_PROVIDERS: readonly ProviderId[] = [
  'claude',
  'codex',
  'copilot',
  'antigravity'
]

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}

/** For values arriving over IPC, where the type annotation is only a promise. */
export function parseProviderId(value: unknown): ProviderId {
  if (!isProviderId(value)) {
    throw new Error(`Unknown provider: ${String(value)}`)
  }
  return value
}
