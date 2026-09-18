import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type Settings } from '@shared/settings'
import { Appearance } from './appearance'

type Query = 'dark' | 'reducedMotion'

const QUERIES: Record<string, Query> = {
  '(prefers-color-scheme: dark)': 'dark',
  '(prefers-reduced-motion: reduce)': 'reducedMotion'
}

/** A matchMedia whose answers the test controls, one per media query. */
function stubMedia(initial: Partial<Record<Query, boolean>> = {}): {
  set: (query: Query, matches: boolean) => void
} {
  const state: Record<Query, boolean> = { dark: false, reducedMotion: false, ...initial }
  const listeners: Record<Query, Set<() => void>> = { dark: new Set(), reducedMotion: new Set() }

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const name = QUERIES[query] ?? 'dark'
      return {
        get matches() {
          return state[name]
        },
        addEventListener: (_: string, listener: () => void) => listeners[name].add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners[name].delete(listener)
      }
    })
  )

  return {
    set(query, matches) {
      state[query] = matches
      for (const listener of listeners[query]) listener()
    }
  }
}

let pushSettings: (settings: Settings) => void = () => {}

function stubSettings(settings: Partial<Settings> = {}): void {
  vi.stubGlobal('api', {
    settings: {
      get: vi.fn(() => Promise.resolve({ ...defaultSettings(), accentHue: 200, ...settings })),
      onChange: vi.fn((listener: (next: Settings) => void) => {
        pushSettings = listener
        return () => {}
      })
    }
  })
}

const root = document.documentElement

beforeEach(() => {
  root.className = ''
  root.style.removeProperty('--accent-h')
  delete root.dataset['motion']
  stubSettings()
})

describe('Appearance', () => {
  it('applies the accent hue from settings', async () => {
    stubMedia()

    render(<Appearance>content</Appearance>)

    await vi.waitFor(() => expect(root.style.getPropertyValue('--accent-h')).toBe('200'))
  })

  it('follows a new accent hue pushed from main', async () => {
    stubMedia()
    render(<Appearance>content</Appearance>)
    await vi.waitFor(() => expect(root.style.getPropertyValue('--accent-h')).toBe('200'))

    act(() => pushSettings({ ...defaultSettings(), accentHue: 30 }))

    expect(root.style.getPropertyValue('--accent-h')).toBe('30')
  })

  it('switches to dark along with the colour scheme', () => {
    const media = stubMedia()
    render(<Appearance>content</Appearance>)

    expect(root).not.toHaveClass('dark')

    act(() => media.set('dark', true))

    expect(root).toHaveClass('dark')
  })

  it('allows full motion by default', async () => {
    stubMedia()
    render(<Appearance>content</Appearance>)

    await vi.waitFor(() => expect(root.dataset['motion']).toBe('full'))
  })

  it('reduces motion when the setting asks for it', async () => {
    stubMedia()
    stubSettings({ reduceMotion: true })

    render(<Appearance>content</Appearance>)

    await vi.waitFor(() => expect(root.dataset['motion']).toBe('reduce'))
  })

  it('reduces motion when the OS asks for it, whatever the setting says', () => {
    const media = stubMedia()
    render(<Appearance>content</Appearance>)

    act(() => media.set('reducedMotion', true))

    expect(root.dataset['motion']).toBe('reduce')
  })
})
