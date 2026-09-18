import type { LimitWindow } from '@shared/usage'

/**
 * Providers disagree on how they report usage. Everything passes through here
 * so the rest of the app only ever sees "percent used, 0 to 100".
 *
 *   Claude   utilization / percent   already percent used
 *   Codex    used_percent            already percent used
 *   Copilot  percent_remaining       the opposite, so 100 - x
 */

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  // One decimal is as precise as any provider reports, and keeps float noise
  // such as 100 - 98.7 = 1.2999999999999972 out of the UI.
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10
}

export function usedFromRemaining(percentRemaining: number): number {
  return clampPercent(100 - percentRemaining)
}

/** Normalises an ISO-ish timestamp, or returns null for anything unparseable. */
export function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

export function createLimitWindow(input: {
  key: string
  usedPercent: number
  resetsAt: string | null
  scope?: string | null
  used?: number | null
  limit?: number | null
  applicable?: boolean
  unlimited?: boolean
}): LimitWindow {
  const applicable = input.applicable ?? true
  const unlimited = input.unlimited ?? false
  const usedPercent = applicable && !unlimited ? clampPercent(input.usedPercent) : 0

  return {
    key: input.key,
    scope: input.scope ?? null,
    usedPercent,
    used: input.used ?? null,
    limit: input.limit ?? null,
    resetsAt: input.resetsAt,
    exhausted: applicable && !unlimited && usedPercent >= 100,
    applicable,
    unlimited
  }
}
