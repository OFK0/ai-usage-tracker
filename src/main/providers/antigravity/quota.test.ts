// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../types'
import summaryFixture from './__fixtures__/quota-summary.json'
import statusFixture from './__fixtures__/user-status.json'
import {
  parseQuotaSummary,
  parseUserStatus,
  readAntigravityQuota,
  REQUEST_METADATA,
  ServerGoneError,
  type CallServer
} from './quota'

const shape = (windows: ReturnType<typeof parseQuotaSummary>): unknown[] =>
  windows.map((window) => [window.key, window.scope, window.usedPercent, window.resetsAt])

describe('parseQuotaSummary', () => {
  it('reads each group as its 5 hour and weekly windows, short one first', () => {
    expect(shape(parseQuotaSummary(summaryFixture))).toEqual([
      ['session', 'Gemini Models', 10, '2026-09-20T11:39:34.000Z'],
      ['weekly', 'Gemini Models', 20, '2026-09-25T08:45:39.000Z'],
      ['session', 'Claude and GPT models', 75, '2026-09-20T12:52:10.000Z'],
      ['weekly', 'Claude and GPT models', 40, '2026-09-26T00:39:54.000Z']
    ])
  })

  it('takes the remaining share as what is left, not what is used', () => {
    const [window] = parseQuotaSummary({
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [{ bucketId: 'gemini-5h', remaining: { remainingFraction: 0 } }]
        }
      ]
    })

    expect(window).toMatchObject({ usedPercent: 100, exhausted: true })
  })

  it('skips buckets that are switched off or say nothing about what is left', () => {
    const windows = parseQuotaSummary({
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            // Protobuf JSON leaves zeros out, so a missing share could mean
            // anything; it isn't taken for used up.
            { bucketId: 'gemini-weekly', displayName: 'Weekly Limit' },
            { bucketId: 'gemini-5h', disabled: true, remaining: { remainingFraction: 0.5 } }
          ]
        }
      ]
    })

    expect(windows).toEqual([])
  })

  it('reads reset times given as Unix seconds too', () => {
    const [window] = parseQuotaSummary({
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            { bucketId: 'gemini-5h', remaining: { remainingFraction: 1 }, resetTime: 1790000000 }
          ]
        }
      ]
    })

    expect(window?.resetsAt).toBe(new Date(1790000000 * 1000).toISOString())
  })

  it.each([[null], [{}], [{ response: { groups: 'nope' } }], ['text']])(
    'has nothing to say about %j',
    (body) => {
      expect(parseQuotaSummary(body)).toEqual([])
    }
  )
})

describe('parseUserStatus', () => {
  it('reads the plan, and one 5 hour window per model pool', () => {
    const { planLabel, windows } = parseUserStatus(statusFixture)

    expect(planLabel).toBe('Pro')
    // The two Gemini Pro modes share a pool; the more used one speaks for it.
    expect(shape(windows)).toEqual([
      ['session', 'Gemini Models', 30, '2026-09-20T11:39:34.000Z'],
      ['session', 'Claude and GPT models', 50, '2026-09-20T12:52:10.000Z']
    ])
  })

  it('has nothing for a body without a user status', () => {
    expect(parseUserStatus({ code: 5 })).toEqual({ planLabel: null, windows: [] })
  })
})

describe('readAntigravityQuota', () => {
  function server(
    answers: Record<string, { status: number; body: unknown } | Error>
  ): CallServer & ReturnType<typeof vi.fn> {
    return vi.fn<CallServer>((method) => {
      const answer = answers[method]
      if (answer === undefined) return Promise.resolve({ status: 404, body: null })
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    })
  }

  it('reads the quota summary, with the plan from the user status', async () => {
    const call = server({
      RetrieveUserQuotaSummary: { status: 200, body: summaryFixture },
      GetUserStatus: { status: 200, body: statusFixture }
    })

    const usage = await readAntigravityQuota(call)

    expect(usage.planLabel).toBe('Pro')
    expect(usage.windows).toHaveLength(4)
    expect(call).toHaveBeenCalledWith('GetUserStatus', REQUEST_METADATA)
  })

  it('falls back to the per-model quotas where there is no summary', async () => {
    const usage = await readAntigravityQuota(
      server({ GetUserStatus: { status: 200, body: statusFixture } })
    )

    expect(usage.windows.map((window) => window.scope)).toEqual([
      'Gemini Models',
      'Claude and GPT models'
    ])
  })

  it('takes a refused token for a restarted Antigravity', async () => {
    const call = server({ RetrieveUserQuotaSummary: { status: 401, body: null } })

    await expect(readAntigravityQuota(call)).rejects.toBeInstanceOf(ServerGoneError)
  })

  it('takes a server that no longer answers for a restarted Antigravity too', async () => {
    const gone = new Error('connect ECONNREFUSED')
    const call = server({ RetrieveUserQuotaSummary: gone, GetUserStatus: gone })

    await expect(readAntigravityQuota(call)).rejects.toBeInstanceOf(ServerGoneError)
  })

  it('says so when the server answers but reports no quotas', async () => {
    const call = server({ GetUserStatus: { status: 200, body: { userStatus: {} } } })

    const error: unknown = await readAntigravityQuota(call).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ProviderError)
    expect((error as ProviderError).kind).toBe('unexpected_response')
  })
})
