/**
 * What clicking the tray icon should do to the widget.
 *
 * Normally it toggles. But once the widget isn't always on top, it can be
 * visible and still buried under other windows, and hiding it then would feel
 * like the click did nothing. So a buried widget is brought to the front first,
 * and the next click hides it.
 */
export function trayClickAction(widget: {
  visible: boolean
  focused: boolean
  alwaysOnTop: boolean
}): 'show' | 'hide' {
  if (!widget.visible) return 'show'
  if (!widget.alwaysOnTop && !widget.focused) return 'show'
  return 'hide'
}
