// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../types'
import fixture from './__fixtures__/copilot-user.json'
import { COPILOT_USER_URL, createCopilotProvider, githubRateLimitWait } from './index'
import type { TokenResolution } from './token'

const NOW = Date.parse('2026-09-19T10:00:00Z')

function provider(
  options: {
    resolution?: TokenResolution
    fetch?: (url: string, init: RequestInit) => Promise<Response>
  } = {}
) {
  let resolution: TokenResolution = options.resolution ?? { token: 'gho_cli', source: 'gh' }
  const fetch = vi.fn(options.fetch ?? (() => Promise.resolve(Response.json(fixture))))
  const p = createCopilotProvider({
    resolveToken: () => Promise.resolve(resolution),
    fetch,
    userAgent: 'ai-usage-tracker/0.1.0',
    now: () => NOW
  })
  return {
    read: () => p.read(new AbortController().signal),
    fetch,
    setResolution: (next: TokenResolution) => {
      resolution = next
    }
  }
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProviderError)
  return error as ProviderError
}

describe('createCopilotProvider', () => {
  it('reads the quotas with the resolved token', async () => {
    const { read, fetch } = provider()

    const result = await read()

    expect(result.planLabel).toBe('Free')
    expect(result.windows.map((w) => w.key)).toEqual([
      'chat',
      'completions',
      'premium_interactions'
    ])
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe(COPILOT_USER_URL)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer gho_cli',
      'User-Agent': 'ai-usage-tracker/0.1.0'
    })
  })

  it.each([
    ['disconnected', 'disconnected'],
    ['not_installed', 'not_installed'],
    ['signed_out', 'unauthenticated']
  ] as const)('reports %s as %s without asking GitHub', async (missing, kind) => {
    const { read, fetch } = provider({ resolution: { missing } })

    expect((await failure(read())).kind).toBe(kind)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops sending a token GitHub has rejected', async () => {
    const { read, fetch } = provider({
      fetch: () => Promise.resolve(new Response('', { status: 401 }))
    })

    expect((await failure(read())).kind).toBe('unauthenticated')
    expect((await failure(read())).kind).toBe('unauthenticated')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('tries a rejected token again after the user disconnects and reconnects', async () => {
    const p = provider({ fetch: () => Promise.resolve(new Response('', { status: 401 })) })
    await failure(p.read())

    p.setResolution({ missing: 'disconnected' })
    await failure(p.read())
    p.setResolution({ token: 'gho_cli', source: 'gh' })
    await failure(p.read())

    expect(p.fetch).toHaveBeenCalledTimes(2)
  })

  it('waits for the rate limit to reset when GitHub says it has run out', async () => {
    const reset = Math.floor(NOW / 1000) + 600
    const { read } = provider({
      fetch: () =>
        Promise.resolve(
          new Response('', {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }
          })
        )
    })

    const error = await failure(read())

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(600_000)
  })

  it('does not mistake any 403 for a rate limit', async () => {
    const { read } = provider({ fetch: () => Promise.resolve(new Response('', { status: 403 })) })

    expect((await failure(read())).kind).toBe('unexpected_response')
  })

  it('explains a 404 as an account without Copilot', async () => {
    const { read } = provider({ fetch: () => Promise.resolve(new Response('', { status: 404 })) })

    expect((await failure(read())).message).toContain('no Copilot access')
  })

  it('treats a server error as transient', async () => {
    const { read } = provider({ fetch: () => Promise.resolve(new Response('', { status: 502 })) })

    expect((await failure(read())).kind).toBe('unavailable')
  })
})

describe('githubRateLimitWait', () => {
  it('prefers Retry-After', () => {
    expect(githubRateLimitWait(new Headers({ 'retry-after': '30' }), NOW)).toBe(30_000)
  })

  it('has nothing to say while requests remain', () => {
    expect(
      githubRateLimitWait(
        new Headers({ 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': '1' }),
        NOW
      )
    ).toBeNull()
  })
})
