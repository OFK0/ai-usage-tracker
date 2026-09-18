// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from './debounce'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('debounce', () => {
  it('runs once after a burst of calls settles', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced()
    vi.advanceTimersByTime(300)
    debounced()
    vi.advanceTimersByTime(300)
    debounced()

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs a pending call immediately on flush', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced()
    debounced.flush()

    expect(fn).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('does nothing on flush when no call is pending', () => {
    const fn = vi.fn()

    debounce(fn, 500).flush()

    expect(fn).not.toHaveBeenCalled()
  })

  it('drops a pending call on cancel', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(500)

    expect(fn).not.toHaveBeenCalled()
  })
})
