import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import App from './App'

function window(overrides: Partial<LimitWindow> = {}): LimitWindow {
  return {
    key: 'session',
    scope: null,
    usedPercent: 24,
    used: null,
    limit: null,
    // A little over 2h 40m, so the countdown reads the same for the whole test.
    resetsAt: new Date(Date.now() + (2 * 60 + 40) * 60_000 + 30_000).toISOString(),
    exhausted: false,
    applicable: true,
    unlimited: false,
    ...overrides
  }
}

function claude(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    providerId: 'claude',
    status: 'ok',
    source: 'oauth',
    planLabel: 'Pro',
    windows: [window(), window({ key: 'weekly', usedPercent: 9, resetsAt: null })],
    credits: null,
    activity: null,
    apiSpend: null,
    fetchedAt: new Date().toISOString(),
    detail: null,
    ...overrides
  }
}

let pushUsage: (snapshots: ProviderSnapshot[]) => void
const api = {
  widget: { hide: vi.fn(), fit: vi.fn() },
  settings: { open: vi.fn() },
  usage: {
    get: vi.fn(() => Promise.resolve([claude()])),
    refresh: vi.fn(() => Promise.resolve([claude()])),
    onChange: vi.fn((listener: (snapshots: ProviderSnapshot[]) => void) => {
      pushUsage = listener
      return () => {}
    })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('api', api)
  // Cards remember being collapsed; each test starts from a clean slate.
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('window size', () => {
  function stubLayoutApis(): { resize: () => void } {
    let callback: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb
        }
        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      cb()
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    return { resize: () => callback() }
  }

  function setBox(element: Element, box: Record<string, number>): void {
    for (const [name, value] of Object.entries(box)) {
      Object.defineProperty(element, name, { configurable: true, value })
    }
  }

  it('asks for the height the content needs, including what is scrolled out of view', async () => {
    const layout = stubLayoutApis()
    const { container } = render(<App />)
    await screen.findByText('Claude')

    const [shell, scroller] = [
      container.querySelector('section'),
      container.querySelector('.overflow-y-auto')
    ]
    setBox(shell!, { offsetHeight: 300 })
    setBox(scroller!, { scrollHeight: 460, clientHeight: 260 })
    layout.resize()

    // 300 visible + 200 scrolled out of view + 16 of room for the shadow.
    expect(api.widget.fit).toHaveBeenLastCalledWith(516)
  })

  it('does not ask again while the height stays the same', async () => {
    const layout = stubLayoutApis()
    render(<App />)
    await screen.findByText('Claude')
    const calls = api.widget.fit.mock.calls.length

    layout.resize()
    layout.resize()

    expect(api.widget.fit).toHaveBeenCalledTimes(calls)
  })
})

describe('App', () => {
  it('shows each window with its usage and countdown', async () => {
    render(<App />)

    expect(await screen.findByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('24%')).toBeInTheDocument()
    expect(screen.getByText('Resets in 2h 40m')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Claude Weekly usage' })).toBeInTheDocument()
  })

  it('collapses a card down to the window closest to running out, and remembers it', async () => {
    api.usage.get.mockResolvedValue([
      claude({ windows: [window({ usedPercent: 24 }), window({ key: 'weekly', usedPercent: 81 })] })
    ])
    const { unmount } = render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Hide Claude details' }))

    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar', { name: 'Claude Weekly usage' })).toBeInTheDocument()
    expect(screen.getByText('81%')).toBeInTheDocument()

    unmount()
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Show Claude details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    api.usage.get.mockResolvedValue([claude()])
  })

  it('marks the level of a window nearing its limit', async () => {
    api.usage.get.mockResolvedValueOnce([claude({ windows: [window({ usedPercent: 92 })] })])

    render(<App />)

    expect(await screen.findByRole('progressbar')).toHaveAttribute('data-level', 'critical')
  })

  it('opens settings from the header', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }))

    expect(api.settings.open).toHaveBeenCalledOnce()
  })

  it('updates when main pushes new usage', async () => {
    render(<App />)
    await screen.findByText('24%')

    act(() => pushUsage([claude({ windows: [window({ usedPercent: 100, exhausted: true })] })]))

    expect(screen.getByText('Limit reached')).toBeInTheDocument()
  })

  it('sends the user to settings while a provider is not connected', async () => {
    api.usage.get.mockResolvedValueOnce([claude({ status: 'disconnected', windows: [] })])

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Connect in settings' }))

    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(api.settings.open).toHaveBeenCalledOnce()
  })

  it('says so when the sign-in is missing', async () => {
    api.usage.get.mockResolvedValueOnce([claude({ status: 'unauthenticated', windows: [] })])

    render(<App />)

    expect(await screen.findByText('Open Claude Code to update usage')).toBeInTheDocument()
  })

  it('stops showing an old number once the window has reset while signed out', async () => {
    const resetsAt = new Date(Date.now() - 60_000).toISOString()
    api.usage.get.mockResolvedValueOnce([
      claude({
        status: 'unauthenticated',
        windows: [window({ usedPercent: 100, exhausted: true, resetsAt })]
      })
    ])

    render(<App />)

    expect(await screen.findByText('Reset')).toBeInTheDocument()
    expect(screen.getByText('Reset · waiting for fresh data')).toBeInTheDocument()
    expect(screen.queryByText('Limit reached')).not.toBeInTheDocument()
  })

  it('shows local activity and API spend when they are known', async () => {
    api.usage.get.mockResolvedValueOnce([
      claude({
        status: 'unauthenticated',
        activity: { block: null, lastActivityAt: null },
        apiSpend: { currency: 'USD', today: 1, month: 2 }
      })
    ])

    render(<App />)

    expect(
      await screen.findByText('No Claude Code activity in the last 5 hours')
    ).toBeInTheDocument()
    expect(screen.getByText('API spend')).toBeInTheDocument()
  })

  it('marks a limit outside the plan instead of showing it as used up', async () => {
    api.usage.get.mockResolvedValueOnce([
      claude({ windows: [window({ key: 'weekly_opus', applicable: false, usedPercent: 0 })] })
    ])

    render(<App />)

    expect(await screen.findByText('Not in plan')).toBeInTheDocument()
    expect(screen.queryByText('Limit reached')).not.toBeInTheDocument()
  })

  it('shows credits only when they are switched on', async () => {
    api.usage.get.mockResolvedValueOnce([
      claude({ credits: { used: 12.5, limit: 50, currency: 'USD', enabled: true } })
    ])

    render(<App />)

    expect(await screen.findByText('Credits')).toBeInTheDocument()
  })

  it('refreshes on demand', async () => {
    render(<App />)
    await screen.findByText('Claude')

    await userEvent.click(screen.getByRole('button', { name: 'Refresh usage' }))

    expect(api.usage.refresh).toHaveBeenCalledOnce()
  })

  it('asks the main process to hide the widget', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Hide widget' }))

    expect(api.widget.hide).toHaveBeenCalledOnce()
  })
})
