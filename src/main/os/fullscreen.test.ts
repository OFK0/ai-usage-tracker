// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFullscreenGuard, isFullscreenState } from './fullscreen'

describe('isFullscreenState', () => {
  it.each([
    [1, false], // screen saver, locked, or switching users
    [2, true], // a fullscreen app
    [3, true], // a Direct3D exclusive fullscreen game
    [4, true], // presentation mode
    [5, false], // the normal desktop
    [6, false], // quiet time after an update
    [7, false] // QUNS_APP, from Windows 8's full-screen Store apps
  ])('%d -> %s', (state, expected) => {
    expect(isFullscreenState(state)).toBe(expected)
  })
})

describe('createFullscreenGuard', () => {
  let fullscreen: boolean
  let visible: boolean
  let onTop: boolean
  const hideWidget = vi.fn(() => {
    visible = false
  })
  const showWidgetInactive = vi.fn(() => {
    visible = true
  })
  const probe = vi.fn(() => fullscreen)

  function guard(): ReturnType<typeof createFullscreenGuard> {
    const g = createFullscreenGuard({
      probe,
      isWidgetVisible: () => visible,
      hideWidget: () => {
        hideWidget()
        // Hiding fires the widget's visibility listener, which calls update().
        g.update()
      },
      showWidgetInactive,
      keepsOnTop: () => onTop,
      intervalMs: 1000
    })
    return g
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    fullscreen = false
    visible = true
    onTop = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the widget when something goes fullscreen and brings it back after', () => {
    const g = guard()
    g.update()

    fullscreen = true
    vi.advanceTimersByTime(1000)
    expect(hideWidget).toHaveBeenCalledOnce()
    expect(visible).toBe(false)

    fullscreen = false
    vi.advanceTimersByTime(1000)
    expect(showWidgetInactive).toHaveBeenCalledOnce()
    expect(visible).toBe(true)
  })

  it('checks straight away rather than a second later', () => {
    fullscreen = true

    guard().update()

    expect(hideWidget).toHaveBeenCalledOnce()
  })

  it('does not poll while the user has hidden the widget', () => {
    visible = false

    guard().update()
    vi.advanceTimersByTime(5000)

    expect(probe).not.toHaveBeenCalled()
  })

  it('never brings back a widget the user hid', () => {
    const g = guard()
    g.update()
    visible = false
    g.update()

    fullscreen = true
    vi.advanceTimersByTime(1000)
    fullscreen = false
    vi.advanceTimersByTime(1000)

    expect(showWidgetInactive).not.toHaveBeenCalled()
  })

  it('leaves a widget alone when it is not kept on top', () => {
    onTop = false
    fullscreen = true

    guard().update()
    vi.advanceTimersByTime(5000)

    expect(probe).not.toHaveBeenCalled()
    expect(hideWidget).not.toHaveBeenCalled()
  })

  it('brings the widget back if always-on-top is turned off while it is hidden', () => {
    const g = guard()
    fullscreen = true
    g.update()
    expect(visible).toBe(false)

    onTop = false
    g.update()

    expect(showWidgetInactive).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(5000)
    expect(probe).toHaveBeenCalledOnce()
  })

  it('treats a failing probe as no fullscreen', () => {
    probe.mockImplementation(() => {
      throw new Error('boom')
    })

    guard().update()
    vi.advanceTimersByTime(3000)

    expect(hideWidget).not.toHaveBeenCalled()
  })
})
