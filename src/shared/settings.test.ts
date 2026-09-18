// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  mergeSettings,
  normalizeSettings,
  parseSettingsPatch,
  SettingsValidationError
} from './settings'

describe('normalizeSettings', () => {
  it('returns the defaults when nothing has been saved yet', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings())
  })

  it('keeps valid saved values', () => {
    const settings = normalizeSettings({ theme: 'dark', accentHue: 200, reduceMotion: true })

    expect(settings.theme).toBe('dark')
    expect(settings.accentHue).toBe(200)
    expect(settings.reduceMotion).toBe(true)
  })

  it('fills in fields that an older settings file does not have', () => {
    const settings = normalizeSettings({ theme: 'light' })

    expect(settings.opacity).toBe(1)
    expect(settings.providers.copilot).toEqual({ enabled: true, connected: false })
  })

  it('never treats a provider as connected unless that was saved explicitly', () => {
    // A settings file from before the connect switch existed must not turn on
    // reading anyone's credentials.
    const settings = normalizeSettings({ providers: { claude: { enabled: true } } })

    expect(settings.providers.claude.connected).toBe(false)
  })

  it('falls back to the default for values it cannot use', () => {
    const settings = normalizeSettings({ theme: 'sepia', opacity: 'high', language: 42 })

    expect(settings.theme).toBe('system')
    expect(settings.opacity).toBe(1)
    expect(settings.language).toBe('en')
  })

  it('clamps numbers that were edited out of range', () => {
    const settings = normalizeSettings({ opacity: 0.05, refreshIntervalSeconds: 5 })

    expect(settings.opacity).toBe(0.3)
    expect(settings.refreshIntervalSeconds).toBe(30)
  })

  it('reads provider flags and ignores providers it does not know', () => {
    const settings = normalizeSettings({
      providers: { codex: { enabled: false }, gemini: { enabled: false } }
    })

    expect(settings.providers.codex.enabled).toBe(false)
    expect(settings.providers).not.toHaveProperty('gemini')
  })

  it('keeps a saved connection', () => {
    const settings = normalizeSettings({ providers: { claude: { connected: true } } })

    expect(settings.providers.claude).toEqual({ enabled: true, connected: true })
  })
})

describe('parseSettingsPatch', () => {
  it('accepts a valid partial patch', () => {
    expect(
      parseSettingsPatch({ theme: 'dark', providers: { claude: { enabled: false } } })
    ).toEqual({ theme: 'dark', providers: { claude: { enabled: false } } })
  })

  it('clamps numbers instead of rejecting them', () => {
    expect(parseSettingsPatch({ opacity: 1.2 })).toEqual({ opacity: 1 })
  })

  it('rounds the refresh interval to whole seconds', () => {
    expect(parseSettingsPatch({ refreshIntervalSeconds: 90.6 })).toEqual({
      refreshIntervalSeconds: 91
    })
  })

  it('rejects something that is not an object', () => {
    expect(() => parseSettingsPatch('dark')).toThrow(SettingsValidationError)
    expect(() => parseSettingsPatch(null)).toThrow(SettingsValidationError)
  })

  it('rejects unknown settings rather than dropping them', () => {
    expect(() => parseSettingsPatch({ fontSize: 14 })).toThrow('unknown setting "fontSize"')
  })

  it('rejects values of the wrong type', () => {
    expect(() => parseSettingsPatch({ alwaysOnTop: 'yes' })).toThrow(
      'invalid value for "alwaysOnTop"'
    )
  })

  it('rejects unknown providers and unknown provider fields', () => {
    expect(() => parseSettingsPatch({ providers: { gemini: { enabled: true } } })).toThrow(
      'unknown provider "gemini"'
    )
    expect(() => parseSettingsPatch({ providers: { claude: { colour: 'red' } } })).toThrow(
      'unknown setting "providers.claude.colour"'
    )
  })

  it('accepts connecting a provider', () => {
    expect(parseSettingsPatch({ providers: { claude: { connected: true } } })).toEqual({
      providers: { claude: { connected: true } }
    })
  })

  it('rejects a connection flag that is not a boolean', () => {
    expect(() => parseSettingsPatch({ providers: { claude: { connected: 'yes' } } })).toThrow(
      'invalid value for "providers.claude.connected"'
    )
  })

  it('reports every problem at once', () => {
    try {
      parseSettingsPatch({ theme: 'sepia', fontSize: 14 })
      expect.unreachable()
    } catch (error) {
      expect((error as SettingsValidationError).issues).toHaveLength(2)
    }
  })
})

describe('mergeSettings', () => {
  it('applies top-level fields', () => {
    const next = mergeSettings(defaultSettings(), { theme: 'dark' })

    expect(next.theme).toBe('dark')
  })

  it('merges provider flags without touching the others', () => {
    const next = mergeSettings(defaultSettings(), { providers: { codex: { enabled: false } } })

    expect(next.providers.codex.enabled).toBe(false)
    expect(next.providers.claude.enabled).toBe(true)
  })

  it('does not mutate the settings it was given', () => {
    const current = defaultSettings()

    mergeSettings(current, { theme: 'dark', providers: { claude: { enabled: false } } })

    expect(current).toEqual(defaultSettings())
  })
})
