import { describe, expect, it } from 'vitest'
import type { LimitWindow, LocalActivity, ProviderSnapshot } from '@shared/usage'
import { i18n } from '@/i18n'
import {
  activityText,
  countText,
  resetText,
  spendSourceText,
  spendText,
  statusText,
  windowLabel
} from './labels'

const NOW = Date.parse('2026-09-18T10:00:00Z')
const MINUTE = 60_000

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
    activity: null,
    apiSpend: null,
    fetchedAt: new Date(NOW).toISOString(),
    detail: null,
    ...overrides
  }
}

function activity(block: Partial<NonNullable<LocalActivity['block']>> | null): LocalActivity {
  return {
    block: block && {
      startedAt: new Date(NOW - 2 * 60 * MINUTE).toISOString(),
      endsAt: new Date(NOW + (3 * 60 - 20) * MINUTE).toISOString(),
      exact: true,
      messages: 42,
      tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      ...block
    },
    lastActivityAt: null
  }
}

describe('windowLabel', () => {
  it('names known windows', () => {
    expect(windowLabel(window({ key: 'weekly' }))).toBe('Weekly')
  })

  it('names a limit on one model after the window and the model', async () => {
    expect(windowLabel(window({ key: 'weekly', scope: 'Fable' }))).toBe('Weekly · Fable')
    await i18n.changeLanguage('tr')
    expect(windowLabel(window({ key: 'weekly', scope: 'Fable' }))).toBe('Haftalık · Fable')
  })

  it('makes a readable label out of an unknown key and adds its scope', () => {
    expect(windowLabel(window({ key: 'weekly_model', scope: 'Opus' }))).toBe('Weekly model · Opus')
  })
})

describe('resetText', () => {
  it('counts down to the reset', () => {
    const resetsAt = new Date(NOW + (2 * 60 + 40) * MINUTE).toISOString()

    expect(resetText(window({ resetsAt }), NOW)).toBe('Resets in 2h 40m')
  })

  it('reads naturally in another language', async () => {
    await i18n.changeLanguage('tr')
    const resetsAt = new Date(NOW + (2 * 60 + 40) * MINUTE).toISOString()

    expect(resetText(window({ resetsAt }), NOW)).toBe('2 sa 40 dk sonra sıfırlanır')
  })

  it('says it is resetting once the time has passed', () => {
    expect(resetText(window({ resetsAt: new Date(NOW - 1000).toISOString() }), NOW)).toBe(
      'Resetting…'
    )
  })

  it('admits there is no new number yet when the data is not fresh', () => {
    const resetsAt = new Date(NOW - 1000).toISOString()

    expect(resetText(window({ resetsAt }), NOW, false)).toBe('Reset · waiting for fresh data')
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
    const fetchedAt = new Date(NOW - 5 * MINUTE).toISOString()

    expect(statusText(snapshot({ status: 'stale', fetchedAt }), NOW)).toBe(
      "Couldn't refresh · updated 5m ago"
    )
  })

  it('points at the tool that renews the sign-in', () => {
    expect(statusText(snapshot({ status: 'unauthenticated' }), NOW)).toBe(
      'Open Claude Code to update usage'
    )
    expect(statusText(snapshot({ providerId: 'codex', status: 'not_installed' }), NOW)).toBe(
      'Codex CLI not found'
    )
  })

  it('asks for a GitHub sign-in, since there is no tool to open for Copilot', () => {
    expect(statusText(snapshot({ providerId: 'copilot', status: 'unauthenticated' }), NOW)).toBe(
      'Sign in to GitHub to see usage'
    )
    expect(statusText(snapshot({ providerId: 'copilot', status: 'not_installed' }), NOW)).toBe(
      'No GitHub sign-in found'
    )
  })
})

describe('spendSourceText', () => {
  it('names the API each Admin key reads spend from', () => {
    expect(spendSourceText('claude')).toBe('Anthropic API, UTC days')
    expect(spendSourceText('codex')).toBe('OpenAI API, UTC days')
  })
})

describe('countText', () => {
  it('shows the raw count behind the percentage', () => {
    expect(countText(window({ used: 1250, limit: 2000 }))).toBe('1,250 of 2,000')
  })

  it.each([
    ['there is no count', window()],
    ['the quota is not in the plan', window({ used: 0, limit: 0, applicable: false })],
    ['the quota is unlimited', window({ used: 3, limit: 0, unlimited: true })]
  ])('says nothing when %s', (_, w) => {
    expect(countText(w)).toBeNull()
  })
})

describe('activityText', () => {
  it('uses the plural form the language needs', async () => {
    await i18n.changeLanguage('ru')

    expect(activityText('claude', activity({ messages: 3 }), NOW)).toBe(
      '3 сообщения в этой сессии · закончится через 2 ч 40 мин'
    )
  })

  it('counts messages and shows when the window ends', () => {
    expect(activityText('claude', activity({}), NOW)).toBe(
      '42 messages this session · ends in 2h 40m'
    )
  })

  it('marks an estimated window', () => {
    expect(activityText('claude', activity({ exact: false, messages: 1 }), NOW)).toBe(
      '1 message this session · ends in ~2h 40m'
    )
  })

  it('says when there has been no recent activity', () => {
    expect(activityText('claude', activity(null), NOW)).toBe(
      'No Claude Code activity in the last 5 hours'
    )
  })
})

describe('spendText', () => {
  it('shows today and the month so far', () => {
    expect(spendText({ currency: 'USD', today: 1.5, month: 42 }, 'en-US')).toBe(
      '$1.50 today · $42.00 this month'
    )
  })
})
