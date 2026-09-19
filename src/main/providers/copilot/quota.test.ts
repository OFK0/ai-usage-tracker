// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ProviderError } from '../types'
import fixture from './__fixtures__/copilot-user.json'
import { copilotPlanLabel, parseCopilotUser } from './quota'

function snapshot(overrides: object = {}): object {
  return {
    entitlement: 300,
    remaining: 240,
    percent_remaining: 80,
    has_quota: true,
    unlimited: false,
    ...overrides
  }
}

describe('parseCopilotUser', () => {
  it('reads the quotas of a real response in a stable order', () => {
    const { windows } = parseCopilotUser(fixture)

    expect(windows.map((w) => w.key)).toEqual(['chat', 'completions', 'premium_interactions'])
  })

  it('turns percent remaining into percent used and keeps the counts', () => {
    const completions = parseCopilotUser(fixture).windows.find((w) => w.key === 'completions')

    expect(completions).toMatchObject({ usedPercent: 1.3, used: 26, limit: 2000, applicable: true })
  })

  it('marks a quota the plan does not have as not applicable, never as used up', () => {
    // On the real response premium_interactions reads 0% remaining.
    const premium = parseCopilotUser(fixture).windows.find((w) => w.key === 'premium_interactions')

    expect(premium).toMatchObject({ applicable: false, exhausted: false, usedPercent: 0 })
  })

  it('uses the monthly reset date for every quota', () => {
    const { windows } = parseCopilotUser(fixture)

    expect(new Set(windows.map((w) => w.resetsAt))).toEqual(new Set(['2026-10-01T00:00:00.000Z']))
  })

  it('names the plan from the SKU', () => {
    expect(parseCopilotUser(fixture).planLabel).toBe('Free')
  })

  it('reports a quota that has run out', () => {
    const { windows } = parseCopilotUser({
      quota_snapshots: { chat: snapshot({ remaining: 0, percent_remaining: 0 }) }
    })

    expect(windows[0]).toMatchObject({ exhausted: true, usedPercent: 100, used: 300 })
  })

  it('never reports an unlimited quota as used up', () => {
    const { windows } = parseCopilotUser({
      quota_snapshots: {
        chat: snapshot({ unlimited: true, entitlement: 0, remaining: 0, percent_remaining: 0 })
      }
    })

    expect(windows[0]).toMatchObject({ unlimited: true, applicable: true, exhausted: false })
  })

  it('keeps quotas it does not know about, after the known ones', () => {
    const { windows } = parseCopilotUser({
      quota_snapshots: { agent_sessions: snapshot(), chat: snapshot() }
    })

    expect(windows.map((w) => w.key)).toEqual(['chat', 'agent_sessions'])
  })

  it('falls back to the plain reset date', () => {
    const { windows } = parseCopilotUser({
      quota_reset_date: '2026-11-01',
      quota_snapshots: { chat: snapshot() }
    })

    expect(windows[0]?.resetsAt).toBe('2026-11-01T00:00:00.000Z')
  })

  it.each([
    ['a body without quota snapshots', { copilot_plan: 'individual' }],
    ['empty quota snapshots', { quota_snapshots: {} }],
    ['something that is not an object', 'Not Found']
  ])('rejects %s', (_, body) => {
    expect(() => parseCopilotUser(body)).toThrow(ProviderError)
  })
})

describe('copilotPlanLabel', () => {
  it.each([
    ['free_limited_copilot', 'individual', 'Free'],
    ['copilot_pro', 'individual', 'Pro'],
    ['copilot_pro_plus', 'individual', 'Pro+'],
    ['copilot_for_business_seat', 'business', 'Business'],
    [undefined, 'enterprise', 'Enterprise']
  ])('%s / %s -> %s', (sku, plan, label) => {
    expect(copilotPlanLabel(sku, plan)).toBe(label)
  })

  it('has no label with nothing to go on', () => {
    expect(copilotPlanLabel(undefined, undefined)).toBeNull()
  })
})
