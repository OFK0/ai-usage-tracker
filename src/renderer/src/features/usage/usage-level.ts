import type { LimitWindow } from '@shared/usage'

export type UsageLevel = 'normal' | 'warning' | 'critical' | 'exhausted' | 'inactive'

export const WARNING_PERCENT = 75
export const CRITICAL_PERCENT = 90

type WindowState = Pick<LimitWindow, 'usedPercent' | 'exhausted' | 'applicable' | 'unlimited'>

export function usageLevel(window: WindowState): UsageLevel {
  // A limit outside the plan, or one without a ceiling, has nothing to warn about.
  if (!window.applicable || window.unlimited) return 'inactive'
  if (window.exhausted) return 'exhausted'
  if (window.usedPercent >= CRITICAL_PERCENT) return 'critical'
  if (window.usedPercent >= WARNING_PERCENT) return 'warning'
  return 'normal'
}

/**
 * The window that matters most right now: the one closest to running out.
 * The compact card shows only this one.
 */
export function headlineWindow(windows: LimitWindow[]): LimitWindow | null {
  const limited = windows.filter((window) => window.applicable && !window.unlimited)
  if (limited.length === 0) return windows[0] ?? null

  return limited.reduce((most, window) => (window.usedPercent > most.usedPercent ? window : most))
}
