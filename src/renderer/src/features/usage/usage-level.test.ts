import { describe, expect, it } from 'vitest'
import type { LimitWindow } from '@shared/usage'
import { headlineWindow, usageLevel } from './usage-level'

function window(overrides: Partial<LimitWindow> = {}): LimitWindow {
  return {
    key: 'session',
    scope: null,
    usedPercent: 24,
    used: null,
    limit: null,
    resetsAt: null,
    exhausted: false,
    applicable: true,
    unlimited: false,
    ...overrides
  }
}

describe('usageLevel', () => {
  it.each([
    [0, 'normal'],
    [74.9, 'normal'],
    [75, 'warning'],
    [89.9, 'warning'],
    [90, 'critical'],
    [99.9, 'critical']
  ])('%d%% is %s', (usedPercent, level) => {
    expect(usageLevel(window({ usedPercent }))).toBe(level)
  })

  it('calls a used up window exhausted', () => {
    expect(usageLevel(window({ usedPercent: 100, exhausted: true }))).toBe('exhausted')
  })

  it('never warns about a limit outside the plan, whatever the number says', () => {
    expect(usageLevel(window({ usedPercent: 100, applicable: false }))).toBe('inactive')
  })

  it('never warns about an unlimited quota', () => {
    expect(usageLevel(window({ usedPercent: 95, unlimited: true }))).toBe('inactive')
  })
})

describe('headlineWindow', () => {
  it('picks the window closest to running out', () => {
    const weekly = window({ key: 'weekly', usedPercent: 81 })

    expect(headlineWindow([window({ usedPercent: 39 }), weekly])).toBe(weekly)
  })

  it('ignores limits the plan does not have', () => {
    const session = window({ usedPercent: 10 })

    expect(
      headlineWindow([session, window({ key: 'premium', usedPercent: 100, applicable: false })])
    ).toBe(session)
  })

  it('falls back to the first window when none has a limit', () => {
    const chat = window({ key: 'chat', unlimited: true })

    expect(headlineWindow([chat])).toBe(chat)
  })

  it('has nothing to show without windows', () => {
    expect(headlineWindow([])).toBeNull()
  })
})
