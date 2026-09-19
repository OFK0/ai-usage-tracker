/** Answers whether something is running fullscreen right now. */
export type FullscreenProbe = () => boolean

/**
 * SHQueryUserNotificationState results that mean a fullscreen app or a
 * presentation: QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE.
 * The others are the normal desktop, a locked screen or quiet time.
 */
const FULLSCREEN_STATES = new Set([2, 3, 4])

export function isFullscreenState(state: number): boolean {
  return FULLSCREEN_STATES.has(state)
}

/**
 * Asks Windows the same question it asks itself before showing a
 * notification. Null when the call can't be set up, in which case the widget
 * simply stays on top.
 */
export async function createWindowsFullscreenProbe(): Promise<FullscreenProbe | null> {
  try {
    const { default: koffi } = await import('koffi')
    const shell32 = koffi.load('shell32.dll')
    const query = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *state)') as (
      state: [number]
    ) => number

    return () => {
      const state: [number] = [0]
      return query(state) === 0 && isFullscreenState(state[0])
    }
  } catch (error) {
    console.error('Fullscreen detection is unavailable', error)
    return null
  }
}

export interface FullscreenGuardOptions {
  probe: FullscreenProbe
  isWidgetVisible: () => boolean
  hideWidget: () => void
  /** Brings the widget back without taking focus from what the user returned to. */
  showWidgetInactive: () => void
  /** Only an always-on-top widget would cover a fullscreen app. */
  keepsOnTop: () => boolean
  intervalMs?: number
}

export interface FullscreenGuard {
  /** Call when the widget's visibility or the always-on-top setting changes. */
  update(): void
  stop(): void
}

/**
 * Hides the always-on-top widget while something is fullscreen and brings it
 * back afterwards. Dropping always-on-top wouldn't do: Windows then puts the
 * window above every other normal one, fullscreen app included, until that
 * app is clicked again.
 *
 * It only ever brings back a widget it hid itself; one the user hid stays
 * hidden, and nothing is polled while it is.
 */
export function createFullscreenGuard(options: FullscreenGuardOptions): FullscreenGuard {
  const intervalMs = options.intervalMs ?? 1000
  let timer: ReturnType<typeof setInterval> | undefined
  let hiddenForFullscreen = false

  function fullscreenNow(): boolean {
    try {
      return options.probe()
    } catch {
      return false
    }
  }

  function check(): void {
    const fullscreen = fullscreenNow()
    if (fullscreen && !hiddenForFullscreen && options.isWidgetVisible()) {
      hiddenForFullscreen = true
      options.hideWidget()
    } else if (!fullscreen && hiddenForFullscreen) {
      restore()
    }
  }

  function restore(): void {
    hiddenForFullscreen = false
    options.showWidgetInactive()
  }

  function stopPolling(): void {
    clearInterval(timer)
    timer = undefined
  }

  return {
    update() {
      const watch = options.keepsOnTop() && (options.isWidgetVisible() || hiddenForFullscreen)
      if (watch && timer === undefined) {
        timer = setInterval(check, intervalMs)
        check()
      } else if (!watch && timer !== undefined) {
        stopPolling()
        // Turned off always-on-top while hidden: the widget no longer covers
        // anything, so it comes back.
        if (hiddenForFullscreen) restore()
      }
    },

    stop() {
      stopPolling()
      if (hiddenForFullscreen) restore()
    }
  }
}
