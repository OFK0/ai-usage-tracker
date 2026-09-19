// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ProviderError } from '../types'
import fixture from './__fixtures__/oauth-usage.json'
import { parseClaudeUsage } from './usage-response'

describe('parseClaudeUsage', () => {
  it('reads the session and weekly windows from a real response', () => {
    const { windows } = parseClaudeUsage(fixture)

    expect(windows.map((w) => w.key)).toEqual(['session', 'weekly'])
    for (const window of windows) {
      expect(window.usedPercent).toBeGreaterThanOrEqual(0)
      expect(window.usedPercent).toBeLessThanOrEqual(100)
      expect(window.resetsAt).toMatch(/Z$/)
    }
  })

  it('reads credits from the spend block of a real response', () => {
    expect(parseClaudeUsage(fixture).credits).toEqual({
      used: 0,
      limit: 40,
      currency: 'USD',
      enabled: false
    })
  })

  it('keeps unknown limit kinds and their scope', () => {
    const { windows } = parseClaudeUsage({
      limits: [
        { kind: 'weekly_model', percent: 60, resets_at: null, scope: 'Opus' },
        { kind: 'session', percent: 12, resets_at: '2026-09-18T12:40:00+00:00' }
      ]
    })

    expect(windows[0]).toMatchObject({ key: 'weekly_model', scope: 'Opus', usedPercent: 60 })
    expect(windows[1]).toMatchObject({ key: 'session', resetsAt: '2026-09-18T12:40:00.000Z' })
  })

  it('shows a weekly limit of its own for one model, as Fable has', () => {
    const { windows } = parseClaudeUsage({
      limits: [
        { kind: 'session', group: 'session', percent: 12 },
        { kind: 'weekly_all', group: 'weekly', percent: 30 },
        { kind: 'weekly_model', group: 'weekly', percent: 64, scope: 'Fable' }
      ]
    })

    expect(windows.map((window) => [window.key, window.scope, window.usedPercent])).toEqual([
      ['session', null, 12],
      ['weekly', null, 30],
      ['weekly', 'Fable', 64]
    ])
  })

  it.each([
    ['a scope object', { scope: { type: 'model', display_name: 'Fable' } }],
    ['a display name on the entry', { scope: null, display_name: 'Fable' }]
  ])('finds the model name in %s', (_, fields) => {
    const { windows } = parseClaudeUsage({
      limits: [{ kind: 'weekly_scoped', group: 'weekly', percent: 5, ...fields }]
    })

    expect(windows[0]).toMatchObject({ key: 'weekly', scope: 'Fable' })
  })

  it('does not let a new kind without a model pass for the main weekly limit', () => {
    const { windows } = parseClaudeUsage({
      limits: [{ kind: 'weekly_oauth_apps', group: 'weekly', percent: 5, scope: null }]
    })

    expect(windows[0]).toMatchObject({ key: 'weekly_oauth_apps', scope: null })
  })

  it('marks a full window as exhausted', () => {
    const { windows } = parseClaudeUsage({ limits: [{ kind: 'session', percent: 100 }] })

    expect(windows[0]?.exhausted).toBe(true)
  })

  it('falls back to the legacy fields when there is no limits list', () => {
    const { windows } = parseClaudeUsage({
      five_hour: { utilization: 1, resets_at: '2026-09-18T12:40:00+00:00' },
      seven_day: { utilization: 9, resets_at: null },
      seven_day_opus: null
    })

    // utilization 1 is 1%, not a fraction to be scaled up to 100%.
    expect(windows.map((w) => [w.key, w.usedPercent])).toEqual([
      ['session', 1],
      ['weekly', 9]
    ])
  })

  it('reads credits from extra_usage when there is no spend block', () => {
    const { credits } = parseClaudeUsage({
      limits: [{ kind: 'session', percent: 5 }],
      extra_usage: {
        is_enabled: true,
        monthly_limit: 5000,
        used_credits: 1234,
        currency: 'EUR',
        decimal_places: 2
      }
    })

    expect(credits).toEqual({ used: 12.34, limit: 50, currency: 'EUR', enabled: true })
  })

  it('skips malformed entries instead of failing the whole response', () => {
    const { windows } = parseClaudeUsage({
      limits: [{ kind: 'session' }, 'noise', { kind: 'weekly_all', percent: 30 }]
    })

    expect(windows.map((w) => w.key)).toEqual(['weekly'])
  })

  it.each([
    ['a non-object body', 'Not Found'],
    ['a body without any windows', { limits: [], five_hour: null }]
  ])('rejects %s as an unexpected response', (_, body) => {
    expect(() => parseClaudeUsage(body)).toThrow(ProviderError)
  })
})
