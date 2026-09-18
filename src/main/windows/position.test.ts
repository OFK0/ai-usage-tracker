import { describe, expect, it } from 'vitest'
import { anchorTopRight, clampToWorkArea, fitHeight } from './position'

const size = { width: 340, height: 420 }

describe('anchorTopRight', () => {
  it('parks the widget in the top-right corner of the work area', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

    expect(anchorTopRight(workArea, size)).toEqual({ x: 1564, y: 16 })
  })

  it('respects the origin of a secondary display', () => {
    const workArea = { x: 1920, y: -200, width: 1280, height: 1024 }

    expect(anchorTopRight(workArea, size)).toEqual({ x: 2844, y: -184 })
  })

  it('clamps to the work area origin when the display is narrower than the widget', () => {
    const workArea = { x: 0, y: 0, width: 200, height: 200 }

    expect(anchorTopRight(workArea, size)).toEqual({ x: 0, y: 16 })
  })
})

describe('clampToWorkArea', () => {
  it('leaves a position that is already fully visible alone', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

    expect(clampToWorkArea({ x: 400, y: 300 }, workArea, size)).toEqual({ x: 400, y: 300 })
  })

  it('pulls a position back when the display it used is gone', () => {
    const workArea = { x: 0, y: 0, width: 1280, height: 720 }

    expect(clampToWorkArea({ x: 2600, y: 900 }, workArea, size)).toEqual({ x: 940, y: 300 })
  })

  it('does not push past the origin when the widget is larger than the work area', () => {
    const workArea = { x: 0, y: 0, width: 200, height: 200 }

    expect(clampToWorkArea({ x: -500, y: -500 }, workArea, size)).toEqual({ x: 0, y: 0 })
  })
})

describe('fitHeight', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  const limits = { min: 120, max: 640, margin: 16 }

  it('gives the window the height its content asks for', () => {
    expect(fitHeight(236.4, workArea, limits)).toBe(236)
  })

  it('never goes below the minimum', () => {
    expect(fitHeight(40, workArea, limits)).toBe(120)
  })

  it('stops at the maximum and lets the content scroll from there', () => {
    expect(fitHeight(2000, workArea, limits)).toBe(640)
  })

  it('stays within a short display', () => {
    const laptop = { x: 0, y: 0, width: 1366, height: 400 }

    expect(fitHeight(2000, laptop, limits)).toBe(368)
  })

  it('keeps the minimum even when the display is shorter than that', () => {
    const tiny = { x: 0, y: 0, width: 800, height: 100 }

    expect(fitHeight(300, tiny, limits)).toBe(120)
  })
})
