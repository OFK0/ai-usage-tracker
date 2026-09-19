import { createFullscreenGuard, createWindowsFullscreenProbe } from '../os/fullscreen'
import { settingsRepository } from '../store'
import {
  hideWidgetWindow,
  isWidgetVisible,
  onWidgetVisibilityChange,
  showWidgetInactive
} from './widget'

/**
 * Keeps the always-on-top widget off fullscreen apps on Windows. macOS does it
 * with a window setting instead, and Linux has no reliable way to tell across
 * window managers, so there the widget simply stays on top.
 */
export async function startFullscreenGuard(): Promise<void> {
  if (process.platform !== 'win32') return

  const probe = await createWindowsFullscreenProbe()
  if (!probe) return

  const guard = createFullscreenGuard({
    probe,
    isWidgetVisible,
    hideWidget: hideWidgetWindow,
    showWidgetInactive,
    keepsOnTop: () => settingsRepository.get().alwaysOnTop
  })
  onWidgetVisibilityChange(() => guard.update())
  settingsRepository.onChange(() => guard.update())
  guard.update()
}
