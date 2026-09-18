import { join } from 'node:path'
import { shell, type BrowserWindow, type WebPreferences } from 'electron'
import { is } from '@electron-toolkit/utils'

/** The same locked-down preferences for every window the app opens. */
export function secureWebPreferences(): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  }
}

/** Loads the renderer; `view` picks which screen it shows, through the URL hash. */
export function loadRenderer(window: BrowserWindow, view?: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  if (is.dev && devUrl) {
    void window.loadURL(view ? `${devUrl}#${view}` : devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), view ? { hash: view } : {})
  }
}

export function hardenWindow(window: BrowserWindow): void {
  // Our windows have no chrome to navigate with, so anything that asks for a
  // new window is a link and belongs in the user's browser. Only web links,
  // though: openExternal would happily launch file: or custom protocol handlers.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // IPC trusts the sender by its URL, which only holds if a window can never
  // leave the page it was given.
  window.webContents.on('will-navigate', (event) => event.preventDefault())
}
