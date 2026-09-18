// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clampPercent, createLimitWindow, toIsoOrNull, usedFromRemaining } from './normalize'

describe('clampPercent', () => {
  it.each([
    [24, 24],
    [-5, 0],
    [140, 100],
    [33.333, 33.3],
    [Number.NaN, 0]
  ])('%d -> %d', (input, expected) => {
    expect(clampPercent(input)).toBe(expected)
  })

  it('treats Claude utilization as a percent, not a fraction', () => {
    // utilization: 1 means 1% used. Scaling it by 100 is the classic bug that
    // shows a barely used window as exhausted.
    expect(clampPercent(1)).toBe(1)
  })
})

describe('usedFromRemaining', () => {
  it('turns Copilot percent_remaining into percent used', () => {
    expect(usedFromRemaining(98.7)).toBe(1.3)
    expect(usedFromRemaining(100)).toBe(0)
    expect(usedFromRemaining(0)).toBe(100)
  })
})

describe('toIsoOrNull', () => {
  it('accepts microsecond precision with an explicit offset', () => {
    expect(toIsoOrNull('2026-09-18T12:40:00.497688+00:00')).toBe('2026-09-18T12:40:00.497Z')
  })

  it.each([[null], [''], ['soon'], [1726660800]])('returns null for %j', (value) => {
    expect(toIsoOrNull(value)).toBeNull()
  })
})

describe('createLimitWindow', () => {
  it('marks a full window as exhausted', () => {
    expect(createLimitWindow({ key: 'session', usedPercent: 100, resetsAt: null }).exhausted).toBe(
      true
    )
  })

  it('does not mark a nearly full window as exhausted', () => {
    expect(createLimitWindow({ key: 'session', usedPercent: 99.9, resetsAt: null }).exhausted).toBe(
      false
    )
  })

  it('never reports a limit outside the plan as exhausted', () => {
    // Copilot returns percent_remaining 0 for a quota the plan doesn't have,
    // which reads as fully used unless it is flagged as not applicable.
    const window = createLimitWindow({
      key: 'premium_interactions',
      usedPercent: 100,
      resetsAt: null,
      applicable: false
    })

    expect(window.exhausted).toBe(false)
    expect(window.usedPercent).toBe(0)
  })

  it('never reports an unlimited quota as exhausted', () => {
    const window = createLimitWindow({
      key: 'chat',
      usedPercent: 100,
      resetsAt: null,
      unlimited: true
    })

    expect(window.exhausted).toBe(false)
  })
})
