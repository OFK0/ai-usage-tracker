// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../types'
import fixture from './__fixtures__/oauth-usage.json'
import type { ClaudeCredentials } from './credentials'
import { claudePlanLabel, CLAUDE_USAGE_URL, createClaudeProvider } from './index'

const NOW = Date.parse('2026-09-18T10:00:00Z')

const credentials: ClaudeCredentials = {
  accessToken: 'sk-ant-oat01-test',
  expiresAt: NOW + 3_600_000,
  subscriptionType: 'pro',
  rateLimitTier: 'default_claude_ai'
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

function provider(
  options: {
    creds?: ClaudeCredentials | null
    installed?: boolean
    fetch?: (url: string, init: RequestInit) => Promise<Response>
  } = {}
) {
  const fetch = vi.fn(options.fetch ?? (() => Promise.resolve(jsonResponse(fixture))))
  const p = createClaudeProvider({
    readCredentials: () =>
      Promise.resolve(options.creds === undefined ? credentials : options.creds),
    isInstalled: () => Promise.resolve(options.installed ?? true),
    fetch,
    userAgent: 'llm-usage-tracker/0.1.0',
    now: () => NOW
  })
  return { read: () => p.read(new AbortController().signal), fetch }
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProviderError)
  return error as ProviderError
}

describe('createClaudeProvider', () => {
  it('reads usage with the Claude Code sign-in', async () => {
    const { read, fetch } = provider()

    const result = await read()

    expect(result.source).toBe('oauth')
    expect(result.planLabel).toBe('Pro')
    expect(result.windows.map((w) => w.key)).toEqual(['session', 'weekly'])

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe(CLAUDE_USAGE_URL)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-ant-oat01-test',
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'llm-usage-tracker/0.1.0'
    })
  })

  it('reports not installed when Claude Code has never run here', async () => {
    const { read, fetch } = provider({ creds: null, installed: false })

    expect((await failure(read())).kind).toBe('not_installed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports unauthenticated when Claude Code is there but signed out', async () => {
    const { read } = provider({ creds: null, installed: true })

    expect((await failure(read())).kind).toBe('unauthenticated')
  })

  it('does not send an expired token', async () => {
    const { read, fetch } = provider({ creds: { ...credentials, expiresAt: NOW - 1 } })

    expect((await failure(read())).kind).toBe('unauthenticated')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops sending a token once the server has rejected it', async () => {
    const { read, fetch } = provider({
      fetch: () => Promise.resolve(new Response('', { status: 401 }))
    })

    expect((await failure(read())).kind).toBe('unauthenticated')
    expect((await failure(read())).kind).toBe('unauthenticated')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('passes Retry-After through on a 429', async () => {
    const { read } = provider({
      fetch: () =>
        Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '90' } }))
    })

    const error = await failure(read())

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(90_000)
  })

  it('treats a server error as transient', async () => {
    const { read } = provider({ fetch: () => Promise.resolve(new Response('', { status: 503 })) })

    expect((await failure(read())).kind).toBe('unavailable')
  })

  it('treats a network failure as transient', async () => {
    const { read } = provider({ fetch: () => Promise.reject(new TypeError('fetch failed')) })

    const error = await failure(read())

    expect(error.kind).toBe('unavailable')
    expect(error.message).toContain('fetch failed')
  })

  it('reports a body it cannot read as an unexpected response', async () => {
    const { read } = provider({
      fetch: () => Promise.resolve(new Response('<html>', { status: 200 }))
    })

    expect((await failure(read())).kind).toBe('unexpected_response')
  })
})

describe('claudePlanLabel', () => {
  it.each([
    ['pro', 'default_claude_ai', 'Pro'],
    ['max', 'default_claude_max_5x', 'Max 5x'],
    ['max', 'default_claude_max_20x', 'Max 20x'],
    ['team', null, 'Team']
  ])('%s / %s -> %s', (subscriptionType, rateLimitTier, expected) => {
    expect(claudePlanLabel({ ...credentials, subscriptionType, rateLimitTier })).toBe(expected)
  })

  it('has no label without a subscription type', () => {
    expect(claudePlanLabel({ ...credentials, subscriptionType: null })).toBeNull()
  })
})
