import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID, PROVIDER_IDS } from '@shared/app-info'
import { registerIpcHandlers } from './ipc'
import { broadcast } from './ipc/typed'
import { settingsRepository } from './store'
import { migrateLegacySettings } from './store/migrate-legacy'
import { applyTheme } from './theme'
import { createTray, destroyTray } from './tray'
import { usagePoller } from './usage'
import { openSettingsWindow } from './windows/settings'
import {
  applyWidgetSettings,
  createWidgetWindow,
  onWidgetVisibilityChange,
  showWidgetWindow
} from './windows/widget'

// A second launch should surface the widget that is already running rather than
// start a rival instance with its own tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWidgetWindow())

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId(APP_ID)

    // Before anything reads the settings, so a renamed install starts with them.
    await migrateLegacySettings(app.getPath('appData'), app.getPath('userData')).catch(
      (error: unknown) => console.error('Could not carry settings over from the old name', error)
    )

    // The widget is a tray application, so it does not belong in the dock.
    app.dock?.hide()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()

    let previous = settingsRepository.get()
    applyTheme(previous)
    settingsRepository.onChange((settings) => {
      broadcast('settings:changed', settings)
      applyTheme(settings)
      applyWidgetSettings(settings)
      usagePoller.reconfigure()

      // Connecting or disconnecting a provider should show straight away, not
      // on the next poll a minute later.
      const connectionChanged = PROVIDER_IDS.some(
        (id) => settings.providers[id].connected !== previous.providers[id].connected
      )
      if (connectionChanged) void usagePoller.refresh()
      previous = settings
    })
    onWidgetVisibilityChange((visible) => usagePoller.setVisible(visible))

    createWidgetWindow()
    createTray({
      refresh: () => void usagePoller.refresh(),
      openSettings: () => openSettingsWindow()
    })
    usagePoller.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWidgetWindow()
      } else {
        showWidgetWindow()
      }
    })
  })

  // Closing the widget leaves the app alive in the tray, which is the whole
  // point of a tray application, so window-all-closed deliberately does nothing.

  app.on('before-quit', () => {
    usagePoller.stop()
    destroyTray()
  })
}
