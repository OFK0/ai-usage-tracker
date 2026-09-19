import type { ProviderId } from '@shared/app-info'
import type { ProviderSnapshot } from '@shared/usage'
import { ProviderError, type UsageProvider } from '../providers/types'

export interface PollerConfig {
  intervalMs: number
  isEnabled(id: ProviderId): boolean
}

export interface PollerOptions {
  providers: UsageProvider[]
  getConfig(): PollerConfig
  onChange(snapshots: ProviderSnapshot[]): void
  now?: () => number
  fetchTimeoutMs?: number
}

export interface Poller {
  start(): void
  stop(): void
  /**
   * Polls every enabled provider now, or just `only`, except ones still inside
   * a rate-limit backoff.
   */
  refresh(only?: ProviderId): Promise<ProviderSnapshot[]>
  setVisible(visible: boolean): void
  /** Picks up changed settings: enabled providers and the refresh interval. */
  reconfigure(): void
  snapshots(): ProviderSnapshot[]
}

/** Nobody is looking while the widget is hidden, so there is no point polling often. */
export const HIDDEN_INTERVAL_MS = 5 * 60_000
export const MAX_BACKOFF_MS = 30 * 60_000
const MAX_RETRY_AFTER_MS = 60 * 60_000
/** Checks just after a reset, not on it, so the provider has already rolled over. */
const RESET_GRACE_MS = 5_000
const DEFAULT_FETCH_TIMEOUT_MS = 15_000

interface ProviderState {
  provider: UsageProvider
  snapshot: ProviderSnapshot
  lastGood: ProviderSnapshot | null
  failures: number
  timer: ReturnType<typeof setTimeout> | undefined
  dueAt: number
  inFlight: Promise<void> | null
  /** No request may go out before this, set when the provider rate limits us. */
  backoffUntil: number
}

function emptySnapshot(providerId: ProviderId): ProviderSnapshot {
  return {
    providerId,
    status: 'loading',
    source: null,
    planLabel: null,
    windows: [],
    credits: null,
    activity: null,
    apiSpend: null,
    fetchedAt: null,
    detail: null
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  // A provider that throws something unexpected must not take the others down.
  const message = error instanceof Error ? error.message : String(error)
  return new ProviderError('unavailable', message)
}

export function createPoller(options: PollerOptions): Poller {
  const now = options.now ?? Date.now
  const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS

  let running = false
  let visible = true
  let abort = new AbortController()

  const states: ProviderState[] = options.providers.map((provider) => ({
    provider,
    snapshot: emptySnapshot(provider.id),
    lastGood: null,
    failures: 0,
    timer: undefined,
    dueAt: 0,
    inFlight: null,
    backoffUntil: 0
  }))

  const isEnabled = (state: ProviderState): boolean =>
    options.getConfig().isEnabled(state.provider.id)

  const enabledStates = (): ProviderState[] => states.filter(isEnabled)

  function snapshots(): ProviderSnapshot[] {
    return enabledStates().map((state) => state.snapshot)
  }

  function emit(): void {
    options.onChange(snapshots())
  }

  function baseInterval(): number {
    const { intervalMs } = options.getConfig()
    return visible ? intervalMs : Math.max(intervalMs, HIDDEN_INTERVAL_MS)
  }

  function delayAfterSuccess(snapshot: ProviderSnapshot): number {
    const untilNextReset = snapshot.windows
      .map((window) => (window.resetsAt ? Date.parse(window.resetsAt) - now() : Infinity))
      .filter((ms) => ms > 0)
      .reduce((soonest, ms) => Math.min(soonest, ms), Infinity)

    // Without this the widget would keep showing a window as full for up to a
    // whole interval after it has already reset.
    return Math.min(baseInterval(), untilNextReset + RESET_GRACE_MS)
  }

  function delayAfterFailure(state: ProviderState, failure: ProviderError): number {
    if (
      failure.kind === 'disconnected' ||
      failure.kind === 'not_installed' ||
      failure.kind === 'unauthenticated'
    ) {
      // These are about the user's setup, not a struggling server, so there is
      // nothing to back off from. Checking again picks up a fresh sign-in.
      state.failures = 0
      return baseInterval()
    }

    state.failures += 1
    const exponential = Math.min(baseInterval() * 2 ** (state.failures - 1), MAX_BACKOFF_MS)
    const delay = Math.min(failure.retryAfterMs ?? exponential, MAX_RETRY_AFTER_MS)

    if (failure.kind === 'rate_limited') {
      state.backoffUntil = now() + delay
    }
    return delay
  }

  function snapshotAfterFailure(state: ProviderState, failure: ProviderError): ProviderSnapshot {
    const { id } = state.provider
    // Whatever the provider could still work out locally is fresher than
    // anything carried over from the last good read.
    const salvaged = { detail: failure.message, ...failure.salvage }

    if (failure.kind === 'disconnected') {
      // Data read under a permission the user has since withdrawn must not
      // linger on screen, or come back later as "stale".
      state.lastGood = null
      return { ...emptySnapshot(id), status: 'disconnected', ...salvaged }
    }
    if (failure.kind === 'not_installed') {
      return { ...emptySnapshot(id), status: 'not_installed', ...salvaged }
    }
    if (failure.kind === 'unauthenticated') {
      // The last numbers are still worth seeing next to the sign-in prompt.
      const base = state.lastGood ?? emptySnapshot(id)
      return { ...base, status: 'unauthenticated', ...salvaged }
    }
    // Limits recovered from a log are as good as a last read, just as old.
    if (state.lastGood || failure.salvage?.windows?.length) {
      return { ...(state.lastGood ?? emptySnapshot(id)), status: 'stale', ...salvaged }
    }
    return { ...emptySnapshot(id), status: 'error', ...salvaged }
  }

  function schedule(state: ProviderState, delay: number): void {
    clearTimeout(state.timer)
    state.timer = undefined
    if (!running || !isEnabled(state)) return

    state.dueAt = now() + delay
    state.timer = setTimeout(() => {
      state.timer = undefined
      void poll(state)
    }, delay)
  }

  async function run(state: ProviderState): Promise<void> {
    let delay: number

    try {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(fetchTimeoutMs)])
      const reading = await state.provider.read(signal)

      state.failures = 0
      state.backoffUntil = 0
      state.snapshot = {
        providerId: state.provider.id,
        status: 'ok',
        ...reading,
        fetchedAt: new Date(now()).toISOString(),
        detail: null
      }
      state.lastGood = state.snapshot
      delay = delayAfterSuccess(state.snapshot)
    } catch (error) {
      const failure = toProviderError(error)
      state.snapshot = snapshotAfterFailure(state, failure)
      delay = delayAfterFailure(state, failure)
    }

    if (!running) return
    emit()
    schedule(state, delay)
  }

  function poll(state: ProviderState): Promise<void> {
    if (!running || !isEnabled(state)) return Promise.resolve()
    // A slow response must not pile up a second request behind it.
    if (state.inFlight) return state.inFlight

    clearTimeout(state.timer)
    state.timer = undefined
    state.inFlight = run(state).finally(() => {
      state.inFlight = null
    })
    return state.inFlight
  }

  return {
    start() {
      if (running) return
      running = true
      abort = new AbortController()
      for (const state of enabledStates()) void poll(state)
    },

    stop() {
      running = false
      abort.abort()
      for (const state of states) {
        clearTimeout(state.timer)
        state.timer = undefined
      }
    },

    async refresh(only) {
      await Promise.all(
        enabledStates()
          .filter((state) => only === undefined || state.provider.id === only)
          // Asking again while rate limited would only extend the ban.
          .filter((state) => state.backoffUntil <= now())
          .map((state) => poll(state))
      )
      return snapshots()
    },

    setVisible(nextVisible) {
      if (visible === nextVisible) return
      visible = nextVisible
      if (!visible) return

      // Coming back into view: anything that went quiet while hidden is
      // refreshed now instead of at the end of the long hidden interval.
      for (const state of enabledStates()) {
        const fetchedAt = state.snapshot.fetchedAt ? Date.parse(state.snapshot.fetchedAt) : 0
        if (now() - fetchedAt >= baseInterval() && state.backoffUntil <= now()) {
          void poll(state)
        }
      }
    },

    reconfigure() {
      for (const state of states) {
        if (!isEnabled(state)) {
          clearTimeout(state.timer)
          state.timer = undefined
        } else if (state.timer === undefined && !state.inFlight) {
          void poll(state)
        } else if (state.failures === 0 && state.dueAt - now() > baseInterval()) {
          // A shorter interval takes effect now rather than after the old one.
          schedule(state, baseInterval())
        }
      }
      emit()
    },

    snapshots
  }
}
