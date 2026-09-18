// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderId } from '@shared/app-info'
import type { ProviderSnapshot } from '@shared/usage'
import { createLimitWindow } from '../providers/normalize'
import { ProviderError, type ProviderReading, type UsageProvider } from '../providers/types'
import { createPoller, HIDDEN_INTERVAL_MS, type Poller } from './poller'

const INTERVAL = 60_000

function reading(usedPercent = 24, resetsAt: string | null = null): ProviderReading {
  return {
    source: 'oauth',
    planLabel: 'Pro',
    windows: [createLimitWindow({ key: 'session', usedPercent, resetsAt })],
    credits: null,
    activity: null,
    apiSpend: null
  }
}

type Step = ProviderReading | Error

/** Plays back the given steps in order, then repeats the last one. */
function scriptedProvider(
  id: ProviderId,
  ...steps: Step[]
): UsageProvider & { read: ReturnType<typeof vi.fn> } {
  let last: Step = steps[steps.length - 1] ?? reading()
  const read = vi.fn(() => {
    const step = steps.shift() ?? last
    last = step
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step)
  })
  return { id, read }
}

let poller: Poller | undefined
let enabled: Set<ProviderId>
let emitted: ProviderSnapshot[][]

function start(...providers: UsageProvider[]): Poller {
  poller = createPoller({
    providers,
    getConfig: () => ({ intervalMs: INTERVAL, isEnabled: (id) => enabled.has(id) }),
    onChange: (snapshots) => emitted.push(snapshots)
  })
  poller.start()
  return poller
}

const latest = (): ProviderSnapshot[] => emitted[emitted.length - 1] ?? []

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-18T10:00:00Z'))
  enabled = new Set(['claude', 'codex', 'copilot'])
  emitted = []
})

afterEach(() => {
  poller?.stop()
  poller = undefined
  vi.useRealTimers()
})

describe('polling', () => {
  it('starts in loading and turns ok after the first read', async () => {
    const claude = scriptedProvider('claude', reading(24))
    const p = start(claude)

    expect(p.snapshots()[0]?.status).toBe('loading')

    await vi.advanceTimersByTimeAsync(0)

    expect(latest()[0]).toMatchObject({ status: 'ok', planLabel: 'Pro' })
    expect(latest()[0]?.windows[0]?.usedPercent).toBe(24)
  })

  it('polls again after the interval', async () => {
    const claude = scriptedProvider('claude', reading())
    start(claude)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(INTERVAL - 1)
    expect(claude.read).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(claude.read).toHaveBeenCalledTimes(2)
  })

  it('checks again right after a window resets instead of waiting a full interval', async () => {
    const resetsAt = new Date(Date.now() + 10_000).toISOString()
    const claude = scriptedProvider('claude', reading(100, resetsAt), reading(0))
    start(claude)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(15_000)

    expect(claude.read).toHaveBeenCalledTimes(2)
    expect(latest()[0]?.windows[0]?.usedPercent).toBe(0)
  })

  it('polls on the longer hidden interval while the widget is hidden', async () => {
    const claude = scriptedProvider('claude', reading())
    const p = start(claude)
    await vi.advanceTimersByTimeAsync(0)
    p.setVisible(false)

    // The timer already running keeps its delay; the next one uses the hidden interval.
    await vi.advanceTimersByTimeAsync(INTERVAL)
    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(claude.read).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(HIDDEN_INTERVAL_MS - INTERVAL)

    expect(claude.read).toHaveBeenCalledTimes(3)
  })

  it('refreshes straight away when the widget comes back after a long time hidden', async () => {
    const claude = scriptedProvider('claude', reading())
    const p = start(claude)
    await vi.advanceTimersByTimeAsync(0)
    p.setVisible(false)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    const callsWhileHidden = claude.read.mock.calls.length

    vi.setSystemTime(Date.now() + 2 * INTERVAL)
    p.setVisible(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(claude.read).toHaveBeenCalledTimes(callsWhileHidden + 1)
  })
})

describe('failures', () => {
  it('keeps showing the last good data as stale when a later read fails', async () => {
    const claude = scriptedProvider(
      'claude',
      reading(42),
      new ProviderError('unavailable', 'HTTP 503')
    )
    start(claude)
    await vi.advanceTimersByTimeAsync(0)
    const firstFetch = latest()[0]?.fetchedAt

    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(latest()[0]).toMatchObject({
      status: 'stale',
      detail: 'HTTP 503',
      fetchedAt: firstFetch
    })
    expect(latest()[0]?.windows[0]?.usedPercent).toBe(42)
  })

  it('reports an error when there is no earlier data to fall back on', async () => {
    start(scriptedProvider('claude', new ProviderError('unavailable', 'offline')))
    await vi.advanceTimersByTimeAsync(0)

    expect(latest()[0]).toMatchObject({ status: 'error', windows: [], detail: 'offline' })
  })

  it('reports a missing CLI as not installed', async () => {
    start(scriptedProvider('codex', new ProviderError('not_installed', 'no ~/.codex')))
    await vi.advanceTimersByTimeAsync(0)

    expect(latest()[0]?.status).toBe('not_installed')
  })

  it('keeps the last numbers next to an expired sign-in', async () => {
    start(
      scriptedProvider(
        'claude',
        reading(42),
        new ProviderError('unauthenticated', 'sign-in expired')
      )
    )
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(latest()[0]?.status).toBe('unauthenticated')
    expect(latest()[0]?.windows[0]?.usedPercent).toBe(42)
  })

  it('checks a missing sign-in again on the normal interval, without backing off', async () => {
    const claude = scriptedProvider('claude', new ProviderError('unauthenticated', 'expired'))
    start(claude)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(INTERVAL * 3)

    expect(claude.read).toHaveBeenCalledTimes(4)
  })

  it('backs off exponentially on repeated transient failures', async () => {
    const claude = scriptedProvider('claude', new ProviderError('unavailable', 'HTTP 502'))
    start(claude)
    await vi.advanceTimersByTimeAsync(0)

    // Failures so far: 1. Next attempts are after 1x, 2x and 4x the interval.
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(claude.read).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2 * INTERVAL - 1)
    expect(claude.read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(claude.read).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(4 * INTERVAL)
    expect(claude.read).toHaveBeenCalledTimes(4)
  })

  it('waits as long as Retry-After says when rate limited', async () => {
    const claude = scriptedProvider(
      'claude',
      new ProviderError('rate_limited', 'HTTP 429', { retryAfterMs: 180_000 }),
      reading()
    )
    const p = start(claude)
    await vi.advanceTimersByTimeAsync(0)

    await p.refresh()
    await vi.advanceTimersByTimeAsync(179_999)
    expect(claude.read).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(claude.read).toHaveBeenCalledTimes(2)
  })

  it('treats an unexpected exception as transient and keeps other providers running', async () => {
    const claude = scriptedProvider('claude', new TypeError('boom'))
    const codex = scriptedProvider('codex', reading(10))
    start(claude, codex)
    await vi.advanceTimersByTimeAsync(0)

    expect(latest().map((s) => s.status)).toEqual(['error', 'ok'])
  })

  it('shows what the provider could still work out locally after a failure', async () => {
    const apiSpend = { currency: 'USD', today: 1.5, month: 20 }
    start(
      scriptedProvider(
        'claude',
        reading(42),
        new ProviderError('unauthenticated', 'expired', { salvage: { apiSpend, activity: null } })
      )
    )
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(latest()[0]).toMatchObject({ status: 'unauthenticated', apiSpend })
    expect(latest()[0]?.windows[0]?.usedPercent).toBe(42)
  })
})

describe('control', () => {
  it('does not start a second request while one is still in flight', async () => {
    let finish: (value: ProviderReading) => void = () => {}
    const read = vi.fn(
      () =>
        new Promise<ProviderReading>((resolve) => {
          finish = resolve
        })
    )
    const p = start({ id: 'claude', read })

    void p.refresh()
    void p.refresh()
    finish(reading())
    await vi.advanceTimersByTimeAsync(0)

    expect(read).toHaveBeenCalledOnce()
  })

  it('leaves disabled providers alone and out of the snapshots', async () => {
    enabled.delete('codex')
    const codex = scriptedProvider('codex', reading())
    start(scriptedProvider('claude', reading()), codex)
    await vi.advanceTimersByTimeAsync(INTERVAL * 2)

    expect(codex.read).not.toHaveBeenCalled()
    expect(latest().map((s) => s.providerId)).toEqual(['claude'])
  })

  it('starts a provider as soon as it is enabled', async () => {
    enabled.delete('codex')
    const codex = scriptedProvider('codex', reading())
    const p = start(scriptedProvider('claude', reading()), codex)
    await vi.advanceTimersByTimeAsync(0)

    enabled.add('codex')
    p.reconfigure()
    await vi.advanceTimersByTimeAsync(0)

    expect(codex.read).toHaveBeenCalledOnce()
  })

  it('stops polling a provider once it is disabled', async () => {
    const claude = scriptedProvider('claude', reading())
    const p = start(claude)
    await vi.advanceTimersByTimeAsync(0)

    enabled.delete('claude')
    p.reconfigure()
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)

    expect(claude.read).toHaveBeenCalledOnce()
  })

  it('stops polling entirely on stop', async () => {
    const claude = scriptedProvider('claude', reading())
    const p = start(claude)
    await vi.advanceTimersByTimeAsync(0)

    p.stop()
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)

    expect(claude.read).toHaveBeenCalledOnce()
  })
})
