import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type Settings } from '@shared/settings'
import { Appearance } from './appearance'

function stubColorScheme(dark: boolean): { set: (next: boolean) => void } {
  const listeners = new Set<() => void>()
  const media = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media)
  )
  return {
    set(next) {
      media.matches = next
      for (const listener of listeners) listener()
    }
  }
}

let pushSettings: (settings: Settings) => void = () => {}

beforeEach(() => {
  document.documentElement.className = ''
  document.documentElement.style.removeProperty('--accent-h')
  vi.stubGlobal('api', {
    settings: {
      get: vi.fn(() => Promise.resolve({ ...defaultSettings(), accentHue: 200 })),
      onChange: vi.fn((listener: (settings: Settings) => void) => {
        pushSettings = listener
        return () => {}
      })
    }
  })
})

describe('Appearance', () => {
  it('applies the accent hue from settings', async () => {
    stubColorScheme(false)

    render(<Appearance>content</Appearance>)

    await vi.waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('200')
    )
  })

  it('follows a new accent hue pushed from main', async () => {
    stubColorScheme(false)
    render(<Appearance>content</Appearance>)
    await vi.waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('200')
    )

    act(() => pushSettings({ ...defaultSettings(), accentHue: 30 }))

    expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('30')
  })

  it('switches to dark along with the colour scheme', () => {
    const scheme = stubColorScheme(false)
    render(<Appearance>content</Appearance>)

    expect(document.documentElement).not.toHaveClass('dark')

    act(() => scheme.set(true))

    expect(document.documentElement).toHaveClass('dark')
  })
})
