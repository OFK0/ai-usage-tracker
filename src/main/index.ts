import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID } from '@shared/app-info'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { createWidgetWindow, showWidgetWindow } from './windows/widget'

// A second launch should surface the widget that is already running rather than
// start a rival instance with its own tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWidgetWindow())

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)

    // The widget is a tray application, so it does not belong in the dock.
    app.dock?.hide()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()
    createWidgetWindow()
    createTray()

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

  app.on('before-quit', () => destroyTray())
}
