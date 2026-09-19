/** Metadata shared between the main and renderer processes. */
export const APP_ID = 'com.ofk0.ai-usage-tracker'
export const APP_NAME = 'AI Usage Tracker'

/** Providers the tracker knows about. Individual providers land in later milestones. */
export const PROVIDER_IDS = ['claude', 'codex', 'copilot'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

/** Providers that already have an implementation. Codex joins with its milestone. */
export const SUPPORTED_PROVIDERS: readonly ProviderId[] = ['claude', 'copilot']

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
