// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../types'
import usageFixture from './__fixtures__/wham-usage.json'
import type { CodexAuth } from './auth'
import { CODEX_USAGE_URL, createCodexProvider } from './index'
import type { LoggedRateLimits } from './session-log'

const NOW = Date.parse('2025-09-19T10:00:00Z')

const logged: LoggedRateLimits = {
  observedAt: NOW - 60 * 60_000,
  planLabel: 'Plus',
  windows: [
    {
      key: 'session',
      scope: null,
      usedPercent: 11,
      used: null,
      limit: null,
      resetsAt: '2025-09-19T12:00:00.000Z',
      exhausted: false,
      applicable: true,
      unlimited: false
    }
  ]
}

function provider(
  options: {
    connected?: boolean
    auth?: CodexAuth
    fetch?: (url: string, init: RequestInit) => Promise<Response>
    log?: LoggedRateLimits | null
  } = {}
) {
  let clock = NOW
  const deps = {
    isConnected: vi.fn(() => options.connected ?? true),
    forgetLocalData: vi.fn(),
    readAuth: vi.fn(() =>
      Promise.resolve<CodexAuth>(options.auth ?? { accessToken: 'eyJ.a', accountId: 'acc-1' })
    ),
    fetch: vi.fn(options.fetch ?? (() => Promise.resolve(Response.json(usageFixture)))),
    readLoggedLimits: vi.fn(() => Promise.resolve(options.log === undefined ? logged : options.log))
  }
  const p = createCodexProvider({ ...deps, userAgent: 'ai-usage-tracker/0.1.0', now: () => clock })
  return {
    ...deps,
    read: () => p.read(new AbortController().signal),
    advance: (ms: number) => {
      clock += ms
    }
  }
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProviderError)
  return error as ProviderError
}

const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    Promise.resolve(new Response('', { status: code, headers }))

describe('createCodexProvider', () => {
  it('reads the plan and limits with the ChatGPT sign-in', async () => {
    const p = provider()

    const reading = await p.read()

    expect(reading.planLabel).toBe('Plus')
    expect(reading.windows.map((window) => [window.key, window.usedPercent])).toEqual([
      ['session', 12],
      ['weekly', 34]
    ])
    const [url, init] = p.fetch.mock.calls[0] ?? []
    expect(url).toBe(CODEX_USAGE_URL)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer eyJ.a',
      'ChatGPT-Account-Id': 'acc-1'
    })
  })

  it('reads nothing of Codex until it is connected, and forgets what it read', async () => {
    const p = provider({ connected: false })

    expect((await failure(p.read())).kind).toBe('disconnected')
    expect(p.readAuth).not.toHaveBeenCalled()
    expect(p.readLoggedLimits).not.toHaveBeenCalled()
    expect(p.forgetLocalData).toHaveBeenCalled()
  })

  it('says Codex is not installed, without looking for logs', async () => {
    const p = provider({ auth: { missing: 'not_installed' } })

    expect((await failure(p.read())).kind).toBe('not_installed')
    expect(p.readLoggedLimits).not.toHaveBeenCalled()
  })

  it.each([['signed_out'], ['api_key']] as const)(
    'treats a %s sign-in as needing a ChatGPT sign-in',
    async (missing) => {
      const p = provider({ auth: { missing }, log: null })

      expect((await failure(p.read())).kind).toBe('unauthenticated')
      expect(p.fetch).not.toHaveBeenCalled()
    }
  )

  it('stops sending a token the server has rejected', async () => {
    const p = provider({ fetch: status(401), log: null })

    expect((await failure(p.read())).kind).toBe('unauthenticated')
    expect((await failure(p.read())).kind).toBe('unauthenticated')
    expect(p.fetch).toHaveBeenCalledOnce()
  })

  it('does not take a Cloudflare challenge for a rejected sign-in', async () => {
    const p = provider({ fetch: status(403, { 'cf-mitigated': 'challenge' }), log: null })

    expect((await failure(p.read())).kind).toBe('unavailable')
    await failure(p.read())
    expect(p.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not take an HTML 403 from in front of the API for a rejected sign-in', async () => {
    const p = provider({ fetch: status(403, { 'content-type': 'text/html' }), log: null })

    expect((await failure(p.read())).kind).toBe('unavailable')
  })

  it('does take a JSON 403 from the API itself as a rejected sign-in', async () => {
    const p = provider({ fetch: status(403, { 'content-type': 'application/json' }), log: null })

    expect((await failure(p.read())).kind).toBe('unauthenticated')
  })

  it('waits as long as a 429 says', async () => {
    const error = await failure(provider({ fetch: status(429, { 'retry-after': '30' }) }).read())

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(30_000)
  })

  it('falls back to the session log, as of when Codex wrote it', async () => {
    const error = await failure(provider({ fetch: status(503) }).read())

    expect(error.kind).toBe('unavailable')
    expect(error.salvage).toMatchObject({
      source: 'local',
      planLabel: 'Plus',
      windows: logged.windows,
      fetchedAt: new Date(logged.observedAt).toISOString()
    })
  })

  it('keeps the numbers from the log next to an expired sign-in', async () => {
    const error = await failure(provider({ fetch: status(401) }).read())

    expect(error.kind).toBe('unauthenticated')
    expect(error.salvage?.windows).toEqual(logged.windows)
  })

  it('ignores a log older than what the API last said', async () => {
    let answer: () => Promise<Response> = () => Promise.resolve(Response.json(usageFixture))
    const p = provider({ fetch: () => answer() })
    await p.read()

    p.advance(60_000)
    answer = status(503)
    const error = await failure(p.read())

    expect(error.salvage).toBeNull()
  })
})
