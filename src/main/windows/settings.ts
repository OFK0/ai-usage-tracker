import { BrowserWindow, nativeTheme } from 'electron'
import { windowBackground } from '../theme'
import { hardenWindow, loadRenderer, secureWebPreferences } from './common'

let settingsWindow: BrowserWindow | null = null

/** Opens the settings window, or brings the one already open to the front. */
export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 620,
    minWidth: 400,
    minHeight: 440,
    show: false,
    autoHideMenuBar: true,
    // Matches the surface the renderer paints, so opening doesn't flash.
    backgroundColor: windowBackground(),
    webPreferences: secureWebPreferences()
  })

  // The page repaints itself for a new theme; this is the colour behind it,
  // which shows while the window resizes.
  const repaint = (): void => settingsWindow?.setBackgroundColor(windowBackground())
  nativeTheme.on('updated', repaint)

  settingsWindow.on('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    nativeTheme.off('updated', repaint)
    settingsWindow = null
  })

  hardenWindow(settingsWindow)
  loadRenderer(settingsWindow, 'settings')
}
