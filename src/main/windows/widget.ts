import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { debounce } from '../lib/debounce'
import { windowState } from '../store'
import { anchorTopRight, clampToWorkArea, type Point } from './position'

export const WIDGET_SIZE = { width: 340, height: 420 }

let widget: BrowserWindow | null = null

function initialPosition(): Point {
  const saved = windowState.getPosition()

  if (saved) {
    // The display the widget was left on may be gone or rearranged since, so
    // bring it back onto whichever display is now closest.
    const { workArea } = screen.getDisplayNearestPoint(saved)
    return clampToWorkArea(saved, workArea, WIDGET_SIZE)
  }

  return anchorTopRight(screen.getPrimaryDisplay().workArea, WIDGET_SIZE)
}

// Dragging fires move events continuously; only the spot it comes to rest in
// is worth writing to disk.
const persistPosition = debounce(() => {
  const window = getWidgetWindow()
  if (!window) return
  const [x, y] = window.getPosition()
  if (x !== undefined && y !== undefined) windowState.savePosition({ x, y })
}, 500)

function loadRenderer(window: BrowserWindow): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  if (is.dev && devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export function createWidgetWindow(): BrowserWindow {
  const { x, y } = initialPosition()

  widget = new BrowserWindow({
    ...WIDGET_SIZE,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    // Fully transparent, so the renderer draws the only visible surface.
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 'floating' sits above normal windows without covering menus or the screen
  // saver. Keeping the widget off fullscreen spaces is handled separately.
  widget.setAlwaysOnTop(true, 'floating')

  widget.on('ready-to-show', () => widget?.show())
  widget.on('move', () => persistPosition())
  // Quitting right after a drag would otherwise lose the last position.
  widget.on('close', () => persistPosition.flush())
  widget.on('closed', () => {
    widget = null
  })

  // The widget has no chrome to navigate with, so anything that asks for a new
  // window is a link and belongs in the user's browser. Only web links, though:
  // openExternal would happily launch file: or custom protocol handlers too.
  widget.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // IPC trusts the sender by its URL, which only holds if the window can never
  // leave the page it was given.
  widget.webContents.on('will-navigate', (event) => event.preventDefault())

  loadRenderer(widget)

  return widget
}

export function getWidgetWindow(): BrowserWindow | null {
  return widget && !widget.isDestroyed() ? widget : null
}

export function showWidgetWindow(): void {
  const window = getWidgetWindow() ?? createWidgetWindow()

  // A saved or dragged position can end up off screen when displays change.
  const bounds = window.getBounds()
  const { workArea } = screen.getDisplayMatching(bounds)
  const { x, y } = clampToWorkArea(bounds, workArea, WIDGET_SIZE)
  window.setPosition(x, y)

  window.show()
  window.focus()
}

export function hideWidgetWindow(): void {
  getWidgetWindow()?.hide()
}

export function toggleWidgetWindow(): void {
  const window = getWidgetWindow()

  if (window?.isVisible()) {
    window.hide()
  } else {
    showWidgetWindow()
  }
}

export function isWidgetVisible(): boolean {
  return getWidgetWindow()?.isVisible() ?? false
}
