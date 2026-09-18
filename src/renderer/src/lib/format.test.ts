import { describe, expect, it } from 'vitest'
import { formatDuration, formatMoney } from './format'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatDuration', () => {
  it.each([
    [0, '<1m'],
    [59_999, '<1m'],
    [MINUTE, '1m'],
    [45 * MINUTE, '45m'],
    [2 * HOUR, '2h'],
    [2 * HOUR + 40 * MINUTE, '2h 40m'],
    [DAY, '1d'],
    [3 * DAY + 4 * HOUR + 59 * MINUTE, '3d 4h']
  ])('%d ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('formatMoney', () => {
  it('formats a known currency in the given locale', () => {
    expect(formatMoney(12.5, 'USD', 'en-US')).toBe('$12.50')
    expect(formatMoney(12.5, 'USD', 'tr-TR')).toBe('$12,50')
  })

  it('still shows the amount for a currency Intl does not know', () => {
    expect(formatMoney(3, 'NOT-A-CODE')).toBe('3.00 NOT-A-CODE')
  })
})
