import { describe, expect, it } from 'vitest'
import { anchorTopRight, clampToWorkArea } from './position'

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
