export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Parks the widget in the top-right of a display's work area.
 *
 * The work area already excludes the taskbar or dock, so anchoring to it keeps
 * the widget clear of them on every platform. If the display is too small to
 * fit the widget and its margin, the result is clamped to the work area origin
 * rather than drifting off screen.
 */
export function anchorTopRight(workArea: Rect, size: Size, margin = 16): Point {
  const x = workArea.x + workArea.width - size.width - margin
  const y = workArea.y + margin

  return {
    x: Math.round(Math.max(workArea.x, x)),
    y: Math.round(Math.max(workArea.y, y))
  }
}

/** Keeps a saved position usable after monitors are added, removed or rescaled. */
export function clampToWorkArea(position: Point, workArea: Rect, size: Size): Point {
  const maxX = workArea.x + Math.max(0, workArea.width - size.width)
  const maxY = workArea.y + Math.max(0, workArea.height - size.height)

  return {
    x: Math.round(Math.min(Math.max(position.x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(position.y, workArea.y), maxY))
  }
}
