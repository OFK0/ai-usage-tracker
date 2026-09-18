// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Point } from '../windows/position'
import { createWindowStateRepository } from './window-state'

function repository(initial?: unknown): {
  repo: ReturnType<typeof createWindowStateRepository>
  written: Point[]
} {
  const written: Point[] = []
  const repo = createWindowStateRepository({
    read: () => initial,
    write: (position) => {
      written.push(position)
    }
  })
  return { repo, written }
}

describe('createWindowStateRepository', () => {
  it('has no position before the widget has ever moved', () => {
    expect(repository().repo.getPosition()).toBeNull()
  })

  it('returns a saved position', () => {
    expect(repository({ x: 1200, y: 40 }).repo.getPosition()).toEqual({ x: 1200, y: 40 })
  })

  it('accepts negative coordinates from a display left of or above the primary one', () => {
    expect(repository({ x: -1500, y: -200 }).repo.getPosition()).toEqual({ x: -1500, y: -200 })
  })

  it.each([[null], ['1200,40'], [{ x: 1200 }], [{ x: '1200', y: 40 }], [{ x: NaN, y: 40 }]])(
    'ignores an unusable saved value %j',
    (value) => {
      expect(repository(value).repo.getPosition()).toBeNull()
    }
  )

  it('saves whole pixels', () => {
    const { repo, written } = repository()

    repo.savePosition({ x: 100.6, y: 20.2 })

    expect(written).toEqual([{ x: 101, y: 20 }])
  })
})
