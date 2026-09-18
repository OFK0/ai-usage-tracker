// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseRetryAfter } from './http'

const NOW = Date.parse('2026-09-18T10:00:00Z')

describe('parseRetryAfter', () => {
  it('reads a number of seconds', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120_000)
  })

  it('reads an HTTP date', () => {
    expect(parseRetryAfter('Fri, 18 Sep 2026 10:02:00 GMT', NOW)).toBe(120_000)
  })

  it('does not return a negative wait for a date in the past', () => {
    expect(parseRetryAfter('Fri, 18 Sep 2026 09:00:00 GMT', NOW)).toBe(0)
  })

  it.each([[null], [''], ['  '], ['soon'], ['-5']])('returns null for %j', (header) => {
    expect(parseRetryAfter(header, NOW)).toBeNull()
  })
})
