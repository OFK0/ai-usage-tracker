/** Metadata shared between the main and renderer processes. */
export const APP_ID = 'com.ofk0.llm-usage-tracker'
export const APP_NAME = 'LLM Usage Tracker'

/** Providers the tracker knows about. Individual providers land in later milestones. */
export const PROVIDER_IDS = ['claude', 'codex', 'copilot'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]
