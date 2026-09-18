import { nativeTheme } from 'electron'
import type { Settings } from '@shared/settings'

/**
 * The theme setting drives Electron's own theme source. Every window's
 * prefers-color-scheme follows it, and so do native menus, scrollbars and
 * title bars, so the renderer only has to watch that one media query.
 */
export function applyTheme(settings: Settings): void {
  nativeTheme.themeSource = settings.theme
}

/** Paint colour for a window before its page loads, so it doesn't flash. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#17191e' : '#fcfcfd'
}
