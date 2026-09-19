// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../types'
import summaryFixture from './__fixtures__/quota-summary.json'
import statusFixture from './__fixtures__/user-status.json'
import type { ServerEndpoint } from './discovery'
import { createAntigravityProvider, type AntigravityProviderDeps } from './index'

const FIRST: ServerEndpoint = { port: 52101, csrfToken: 'first', scheme: 'https' }
const SECOND: ServerEndpoint = { port: 60444, csrfToken: 'second', scheme: 'https' }

const healthy: AntigravityProviderDeps['call'] = (_endpoint, method) =>
  Promise.resolve({
    status: 200,
    body: method === 'GetUserStatus' ? statusFixture : summaryFixture
  })

function provider(overrides: Partial<AntigravityProviderDeps> = {}) {
  const deps = {
    isConnected: vi.fn(() => true),
    findServer: vi.fn<AntigravityProviderDeps['findServer']>(() => Promise.resolve(FIRST)),
    isInstalled: vi.fn(() => Promise.resolve(true)),
    call: vi.fn<AntigravityProviderDeps['call']>(healthy),
    ...overrides
  }
  const p = createAntigravityProvider(deps)
  return { ...deps, read: () => p.read(new AbortController().signal) }
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ProviderError)
  return error as ProviderError
}

describe('createAntigravityProvider', () => {
  it('reads the plan and the windows of each model group', async () => {
    const reading = await provider().read()

    expect(reading.planLabel).toBe('Pro')
    expect(reading.source).toBe('local')
    expect(reading.windows.map((window) => `${window.key} · ${window.scope}`)).toEqual([
      'session · Gemini Models',
      'weekly · Gemini Models',
      'session · Claude and GPT models',
      'weekly · Claude and GPT models'
    ])
  })

  it('looks for nothing until Antigravity is connected', async () => {
    const p = provider({ isConnected: vi.fn(() => false) })

    expect((await failure(p.read())).kind).toBe('disconnected')
    expect(p.findServer).not.toHaveBeenCalled()
  })

  it('asks to open Antigravity when it is installed but not running', async () => {
    const p = provider({ findServer: vi.fn(() => Promise.resolve(null)) })

    const error = await failure(p.read())

    expect(error.kind).toBe('unauthenticated')
    expect(error.message).toContain('not running')
  })

  it('says it is not installed when there is no trace of it', async () => {
    const p = provider({
      findServer: vi.fn(() => Promise.resolve(null)),
      isInstalled: vi.fn(() => Promise.resolve(false))
    })

    expect((await failure(p.read())).kind).toBe('not_installed')
  })

  it('keeps the server it found instead of listing processes on every read', async () => {
    const call = vi.fn<AntigravityProviderDeps['call']>(healthy)
    const p = provider({ call })

    await p.read()
    await p.read()

    expect(p.findServer).toHaveBeenCalledOnce()
    expect(call.mock.calls.every(([endpoint]) => endpoint === FIRST)).toBe(true)
  })

  it('finds the server again when Antigravity has restarted', async () => {
    let restarted = false
    const findServer = vi.fn<AntigravityProviderDeps['findServer']>(() =>
      Promise.resolve(restarted ? SECOND : FIRST)
    )
    // After a restart the old port and token are gone; the new ones answer.
    const call = vi.fn<AntigravityProviderDeps['call']>((endpoint, ...rest) =>
      restarted && endpoint === FIRST
        ? Promise.resolve({ status: 401, body: null })
        : healthy(endpoint, ...rest)
    )
    const p = provider({ findServer, call })
    await p.read()

    restarted = true
    const reading = await p.read()

    expect(reading.windows).toHaveLength(4)
    expect(findServer).toHaveBeenCalledTimes(2)
    expect(call.mock.calls.at(-1)?.[0]).toBe(SECOND)
  })

  it('gives up for this read when a server it just found does not answer either', async () => {
    const p = provider({ call: vi.fn(() => Promise.resolve({ status: 401, body: null })) })

    expect((await failure(p.read())).kind).toBe('unavailable')
    expect(p.findServer).toHaveBeenCalledOnce()
  })

  it('reports a failure to look for processes as transient', async () => {
    const p = provider({ findServer: vi.fn(() => Promise.reject(new Error('powershell missing'))) })

    const error = await failure(p.read())

    expect(error.kind).toBe('unavailable')
    expect(error.message).toContain('powershell missing')
  })
})
