import { useEffect, type RefObject } from 'react'

/** Transparent room around the shell for its shadow: the wrapper's p-2, top and bottom. */
const SHADOW_ROOM = 16

/**
 * Tells the main process how tall the widget needs to be, whenever that changes.
 *
 * `shell` is the visible card, capped at the window's height; `scroller` is the
 * part of it that scrolls, and `content` sits inside that. Measuring `content`
 * keeps the natural height right even while the shell is capped and scrolling,
 * which is exactly when the window may be allowed to grow again.
 */
export function useFitWindowToContent(
  shell: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const shellEl = shell.current
    const scrollerEl = scroller.current
    const contentEl = content.current
    if (!shellEl || !scrollerEl || !contentEl || typeof ResizeObserver === 'undefined') return

    let frame = 0
    let reported = -1

    const report = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // What the shell would measure with nothing hidden behind a scrollbar.
        const hidden = scrollerEl.scrollHeight - scrollerEl.clientHeight
        const height = Math.ceil(shellEl.offsetHeight + hidden + SHADOW_ROOM)
        if (height === reported) return
        reported = height
        window.api.widget.fit(height)
      })
    }

    const observer = new ResizeObserver(report)
    observer.observe(shellEl)
    observer.observe(contentEl)
    report()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [shell, scroller, content])
}
