import { BrowserWindow, screen } from 'electron'
import { debounce } from '../lib/debounce'
import { windowState } from '../store'
import { hardenWindow, loadRenderer, secureWebPreferences } from './common'
import { anchorTopRight, clampToWorkArea, type Point } from './position'

export const WIDGET_SIZE = { width: 340, height: 420 }

let widget: BrowserWindow | null = null

const visibilityListeners = new Set<(visible: boolean) => void>()

function notifyVisibility(visible: boolean): void {
  for (const listener of visibilityListeners) listener(visible)
}

/** Lets the poller slow down while nobody can see the widget. */
export function onWidgetVisibilityChange(listener: (visible: boolean) => void): () => void {
  visibilityListeners.add(listener)
  return () => {
    visibilityListeners.delete(listener)
  }
}

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
    webPreferences: secureWebPreferences()
  })

  // 'floating' sits above normal windows without covering menus or the screen
  // saver. Keeping the widget off fullscreen spaces is handled separately.
  widget.setAlwaysOnTop(true, 'floating')

  // The widget appears on its own, often at login, so it must not take focus
  // away from whatever the user is doing. Opening it from the tray does focus it.
  widget.on('ready-to-show', () => widget?.showInactive())
  widget.on('show', () => notifyVisibility(true))
  widget.on('hide', () => notifyVisibility(false))
  widget.on('move', () => persistPosition())
  // Quitting right after a drag would otherwise lose the last position.
  widget.on('close', () => persistPosition.flush())
  widget.on('closed', () => {
    widget = null
  })

  hardenWindow(widget)
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
