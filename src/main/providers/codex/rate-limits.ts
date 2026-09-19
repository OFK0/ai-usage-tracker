import type { LimitWindow } from '@shared/usage'
import { createLimitWindow } from '../normalize'

/**
 * Codex has two limits: a short window of 5 hours and a long one of a week.
 * They come in two shapes, the usage API's and the one its session log records
 * after every turn, and field names have changed across Codex versions. Both
 * report `used_percent`, already percent used; they differ in how they say
 * when a window resets, so every spelling seen so far is accepted.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const DAY_MINUTES = 24 * 60

/** When a window resets, from an absolute Unix time or seconds after `observedAt`. */
export function codexResetTime(window: Record<string, unknown>, observedAt: number): string | null {
  const absolute = number(window['reset_at']) ?? number(window['resets_at'])
  if (absolute !== null) return new Date(absolute * 1000).toISOString()

  const relative = number(window['reset_after_seconds']) ?? number(window['resets_in_seconds'])
  if (relative !== null) return new Date(observedAt + relative * 1000).toISOString()

  return null
}

function windowMinutes(window: Record<string, unknown>): number | null {
  const minutes = number(window['window_minutes'])
  if (minutes !== null) return minutes
  const seconds = number(window['limit_window_seconds'])
  return seconds === null ? null : seconds / 60
}

/**
 * Named by its length where Codex says it, since a plan might only have one of
 * the two; otherwise by position, primary being the short one.
 */
function windowKey(window: Record<string, unknown>, position: 'primary' | 'secondary'): string {
  const minutes = windowMinutes(window)
  if (minutes !== null && minutes <= DAY_MINUTES) return 'session'
  if (minutes !== null && minutes >= 6 * DAY_MINUTES && minutes <= 8 * DAY_MINUTES) return 'weekly'
  return position === 'primary' ? 'session' : 'weekly'
}

function codexWindow(
  raw: unknown,
  position: 'primary' | 'secondary',
  observedAt: number
): LimitWindow | null {
  if (!isRecord(raw)) return null
  const used = number(raw['used_percent'])
  if (used === null) return null

  return createLimitWindow({
    key: windowKey(raw, position),
    usedPercent: used,
    resetsAt: codexResetTime(raw, observedAt)
  })
}

export function codexWindows(
  primary: unknown,
  secondary: unknown,
  observedAt: number
): LimitWindow[] {
  return [
    codexWindow(primary, 'primary', observedAt),
    codexWindow(secondary, 'secondary', observedAt)
  ].filter((window): window is LimitWindow => window !== null)
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu'
}

/** The ChatGPT plan, as Codex reports it in `plan_type`. */
export function codexPlanLabel(plan: unknown): string | null {
  if (typeof plan !== 'string' || plan === '') return null
  return PLAN_NAMES[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}
