// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '../types'
import usageFixture from './__fixtures__/wham-usage.json'
import { codexHome, parseCodexAuth } from './auth'
import { codexPlanLabel, codexResetTime, codexWindows } from './rate-limits'
import { latestInText, parseTokenCountLine } from './session-log'
import { parseCodexUsage } from './usage-response'

const NOW = Date.parse('2025-09-19T10:00:00Z')
const rollout = readFileSync(join(__dirname, '__fixtures__', 'rollout.jsonl'), 'utf8')

describe('codexResetTime', () => {
  it('takes an absolute Unix time', () => {
    expect(codexResetTime({ resets_at: 1758283200 }, NOW)).toBe('2025-09-19T12:00:00.000Z')
    expect(codexResetTime({ reset_at: 1758283200 }, NOW)).toBe('2025-09-19T12:00:00.000Z')
  })

  it('counts a relative one from when the numbers were taken', () => {
    expect(codexResetTime({ resets_in_seconds: 3600 }, NOW)).toBe('2025-09-19T11:00:00.000Z')
    expect(codexResetTime({ reset_after_seconds: 60 }, NOW)).toBe('2025-09-19T10:01:00.000Z')
  })

  it('has nothing to say without either', () => {
    expect(codexResetTime({ used_percent: 3 }, NOW)).toBeNull()
  })
})

describe('codexWindows', () => {
  it('takes used_percent as percent used, as it already is', () => {
    const [session] = codexWindows({ used_percent: 42.5 }, null, NOW)

    expect(session).toMatchObject({ key: 'session', usedPercent: 42.5, exhausted: false })
  })

  it('names windows by their length when Codex gives it', () => {
    // A plan with only a weekly limit still gets it called weekly.
    const windows = codexWindows({ used_percent: 5, window_minutes: 10080 }, null, NOW)

    expect(windows.map((window) => window.key)).toEqual(['weekly'])
  })

  it('falls back to position: primary is the 5 hour window, secondary the weekly one', () => {
    const windows = codexWindows({ used_percent: 1 }, { used_percent: 2 }, NOW)

    expect(windows.map((window) => window.key)).toEqual(['session', 'weekly'])
  })

  it('marks a window at 100% as exhausted', () => {
    expect(codexWindows({ used_percent: 100 }, null, NOW)[0]?.exhausted).toBe(true)
  })

  it('skips windows without a percentage', () => {
    expect(codexWindows({ window_minutes: 300 }, 'nonsense', NOW)).toEqual([])
  })
})

describe('codexPlanLabel', () => {
  it.each([
    ['plus', 'Plus'],
    ['pro', 'Pro'],
    ['team', 'Team'],
    ['something_new', 'Something_new'],
    [null, null]
  ])('%s -> %s', (plan, label) => {
    expect(codexPlanLabel(plan)).toBe(label)
  })
})

describe('parseCodexUsage', () => {
  it('reads the plan and both windows', () => {
    const { planLabel, windows } = parseCodexUsage(usageFixture, NOW)

    expect(planLabel).toBe('Plus')
    expect(windows).toEqual([
      expect.objectContaining({
        key: 'session',
        usedPercent: 12,
        resetsAt: '2025-09-19T12:00:00.000Z'
      }),
      expect.objectContaining({
        key: 'weekly',
        usedPercent: 34,
        resetsAt: '2025-09-23T10:00:00.000Z'
      })
    ])
  })

  it('accepts the rate_limits / primary spelling too', () => {
    const body = { rate_limits: { primary: { used_percent: 7 }, secondary: { used_percent: 9 } } }

    expect(parseCodexUsage(body, NOW).windows.map((window) => window.usedPercent)).toEqual([7, 9])
  })

  it('refuses a response without limits rather than showing nothing as fine', () => {
    expect(() => parseCodexUsage({ plan_type: 'plus' }, NOW)).toThrow(ProviderError)
    expect(() => parseCodexUsage({ plan_type: 'plus' }, NOW)).toThrow('no rate limits')
  })
})

describe('session log lines', () => {
  it('reads the limits from a token_count event, as of its timestamp', () => {
    const found = latestInText(rollout)

    expect(found?.observedAt).toBe(Date.parse('2025-09-19T08:05:02.000Z'))
    expect(found?.planLabel).toBe('Plus')
    expect(found?.windows.map((window) => [window.key, window.usedPercent])).toEqual([
      ['session', 11],
      ['weekly', 33]
    ])
  })

  it('counts relative reset times from the event, not from now', () => {
    const line = JSON.stringify({
      timestamp: '2025-09-19T08:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        rate_limits: { primary: { used_percent: 20, resets_in_seconds: 600 } }
      }
    })

    expect(parseTokenCountLine(line)?.windows[0]?.resetsAt).toBe('2025-09-19T08:10:00.000Z')
  })

  it('reads the flat fields of early Codex versions', () => {
    const line = JSON.stringify({
      timestamp: '2025-08-20T08:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        rate_limits: {
          primary_used_percent: 15,
          secondary_used_percent: 40,
          primary_window_minutes: 300,
          secondary_window_minutes: 10080
        }
      }
    })

    expect(parseTokenCountLine(line)?.windows.map((window) => window.usedPercent)).toEqual([15, 40])
  })

  it.each([
    [
      'another event',
      '{"timestamp":"2025-09-19T08:00:00Z","type":"event_msg","payload":{"type":"agent_message"}}'
    ],
    [
      'a count with no limits',
      '{"timestamp":"2025-09-19T08:00:00Z","type":"event_msg","payload":{"type":"token_count","rate_limits":null}}'
    ],
    ['broken JSON mentioning token_count', '{"token_count": '],
    [
      'a line with no timestamp',
      '{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":1}}}}'
    ]
  ])('ignores %s', (_, line) => {
    expect(parseTokenCountLine(line)).toBeNull()
  })
})

describe('auth.json', () => {
  it('reads the ChatGPT token and account', () => {
    const raw = JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: {
        id_token: 'x',
        access_token: 'eyJ.access',
        refresh_token: 'r',
        account_id: 'acc-1'
      },
      last_refresh: '2025-09-19T08:00:00Z'
    })

    expect(parseCodexAuth(raw)).toEqual({ accessToken: 'eyJ.access', accountId: 'acc-1' })
  })

  it('tells an API key sign-in apart, since it has no plan limits', () => {
    expect(parseCodexAuth(JSON.stringify({ OPENAI_API_KEY: 'sk-…', tokens: null }))).toBe('api_key')
  })

  it.each([['{'], ['[]'], [JSON.stringify({ tokens: { access_token: '' } })]])(
    'finds no sign-in in %s',
    (raw) => {
      expect(parseCodexAuth(raw)).toBeNull()
    }
  )

  it('lives in CODEX_HOME, or ~/.codex', () => {
    expect(codexHome({ CODEX_HOME: '/custom' }, '/home/ada')).toBe('/custom')
    expect(codexHome({}, '/home/ada')).toBe(join('/home/ada', '.codex'))
  })
})
