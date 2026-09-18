import { describe, expect, it } from 'vitest'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import { resetText, statusText, windowLabel } from './labels'

const NOW = Date.parse('2026-09-18T10:00:00Z')

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

function snapshot(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    providerId: 'claude',
    status: 'ok',
    source: 'oauth',
    planLabel: 'Pro',
    windows: [],
    credits: null,
    fetchedAt: new Date(NOW).toISOString(),
    detail: null,
    ...overrides
  }
}

describe('windowLabel', () => {
  it('names known windows', () => {
    expect(windowLabel(window({ key: 'weekly' }))).toBe('Weekly')
  })

  it('makes a readable label out of an unknown key and adds its scope', () => {
    expect(windowLabel(window({ key: 'weekly_model', scope: 'Opus' }))).toBe('Weekly model · Opus')
  })
})

describe('resetText', () => {
  it('counts down to the reset', () => {
    const resetsAt = new Date(NOW + (2 * 60 + 40) * 60_000).toISOString()

    expect(resetText(window({ resetsAt }), NOW)).toBe('Resets in 2h 40m')
  })

  it('says it is resetting once the time has passed', () => {
    expect(resetText(window({ resetsAt: new Date(NOW - 1000).toISOString() }), NOW)).toBe(
      'Resetting…'
    )
  })

  it('says nothing without a reset time', () => {
    expect(resetText(window(), NOW)).toBeNull()
  })
})

describe('statusText', () => {
  it('stays quiet when everything is fine', () => {
    expect(statusText(snapshot(), NOW)).toBeNull()
  })

  it('says how old stale data is', () => {
    const fetchedAt = new Date(NOW - 5 * 60_000).toISOString()

    expect(statusText(snapshot({ status: 'stale', fetchedAt }), NOW)).toBe(
      "Couldn't refresh · updated 5m ago"
    )
  })

  it('points at the tool to sign in to', () => {
    expect(statusText(snapshot({ status: 'unauthenticated' }), NOW)).toBe(
      'Sign in to Claude Code to see usage'
    )
    expect(statusText(snapshot({ providerId: 'codex', status: 'not_installed' }), NOW)).toBe(
      'Codex CLI not found'
    )
  })
})
