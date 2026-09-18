import { isProviderId, PROVIDER_IDS, type ProviderId } from './app-info'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const LANGUAGES = ['en', 'tr', 'fr', 'de', 'it', 'ru', 'ar'] as const
export type Language = (typeof LANGUAGES)[number]

export interface ProviderSettings {
  enabled: boolean
}

export interface Settings {
  theme: Theme
  /** Hue in degrees, fed into the --accent-h CSS token. */
  accentHue: number
  language: Language
  /** Whole-window opacity, applied with BrowserWindow.setOpacity. */
  opacity: number
  alwaysOnTop: boolean
  launchAtLogin: boolean
  refreshIntervalSeconds: number
  reduceMotion: boolean
  providers: Record<ProviderId, ProviderSettings>
}

type FieldKey = Exclude<keyof Settings, 'providers'>

export type SettingsPatch = Partial<Pick<Settings, FieldKey>> & {
  providers?: Partial<Record<ProviderId, Partial<ProviderSettings>>>
}

export const SETTINGS_RANGES = {
  accentHue: { min: 0, max: 360 },
  opacity: { min: 0.3, max: 1 },
  refreshIntervalSeconds: { min: 30, max: 3600 }
} as const

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    accentHue: 250,
    language: 'en',
    opacity: 1,
    alwaysOnTop: true,
    launchAtLogin: false,
    refreshIntervalSeconds: 60,
    reduceMotion: false,
    providers: Object.fromEntries(PROVIDER_IDS.map((id) => [id, { enabled: true }])) as Record<
      ProviderId,
      ProviderSettings
    >
  }
}

export class SettingsValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid settings: ${issues.join('; ')}`)
    this.name = 'SettingsValidationError'
  }
}

interface Range {
  readonly min: number
  readonly max: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readNumber(value: unknown, range: Range): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(Math.max(value, range.min), range.max)
}

function readOption<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

/**
 * One reader per field. A reader returns undefined for a value it cannot use.
 * Numbers are clamped rather than rejected so a slider rounding past its end
 * still lands on a valid value.
 */
const FIELD_READERS: { [K in FieldKey]: (value: unknown) => Settings[K] | undefined } = {
  theme: (value) => readOption(THEMES, value),
  accentHue: (value) => readNumber(value, SETTINGS_RANGES.accentHue),
  language: (value) => readOption(LANGUAGES, value),
  opacity: (value) => readNumber(value, SETTINGS_RANGES.opacity),
  alwaysOnTop: readBoolean,
  launchAtLogin: readBoolean,
  refreshIntervalSeconds: (value) => {
    const seconds = readNumber(value, SETTINGS_RANGES.refreshIntervalSeconds)
    return seconds === undefined ? undefined : Math.round(seconds)
  },
  reduceMotion: readBoolean
}

const FIELD_KEYS = Object.keys(FIELD_READERS) as FieldKey[]

function isFieldKey(key: string): key is FieldKey {
  return (FIELD_KEYS as string[]).includes(key)
}

function assignField<K extends FieldKey>(target: SettingsPatch, key: K, raw: unknown): boolean {
  const value = FIELD_READERS[key](raw)
  if (value === undefined) return false
  target[key] = value
  return true
}

/**
 * Turns whatever is on disk into complete settings. Lenient on purpose: the file
 * may predate a field or have been edited by hand, and neither should stop the
 * app from starting. Anything missing or unusable falls back to its default.
 */
export function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {}
  const fields: Partial<Pick<Settings, FieldKey>> = {}

  for (const key of FIELD_KEYS) {
    assignField(fields, key, source[key])
  }

  const settings: Settings = { ...defaultSettings(), ...fields }
  const providers = isRecord(source['providers']) ? source['providers'] : {}

  for (const id of PROVIDER_IDS) {
    const entry = providers[id]
    const enabled = isRecord(entry) ? readBoolean(entry['enabled']) : undefined
    if (enabled !== undefined) settings.providers[id] = { enabled }
  }

  return settings
}

function parseProvidersPatch(
  raw: unknown,
  issues: string[]
): NonNullable<SettingsPatch['providers']> {
  const providers: NonNullable<SettingsPatch['providers']> = {}

  if (!isRecord(raw)) {
    issues.push('"providers" must be an object')
    return providers
  }

  for (const [id, entry] of Object.entries(raw)) {
    if (!isProviderId(id)) {
      issues.push(`unknown provider "${id}"`)
      continue
    }
    if (!isRecord(entry)) {
      issues.push(`"providers.${id}" must be an object`)
      continue
    }

    const next: Partial<ProviderSettings> = {}
    for (const [field, value] of Object.entries(entry)) {
      if (field !== 'enabled') {
        issues.push(`unknown setting "providers.${id}.${field}"`)
        continue
      }
      const enabled = readBoolean(value)
      if (enabled === undefined) {
        issues.push(`invalid value for "providers.${id}.enabled"`)
      } else {
        next.enabled = enabled
      }
    }
    providers[id] = next
  }

  return providers
}

/**
 * Validates a patch sent by the renderer. Strict, unlike normalizeSettings: an
 * unknown key or a value of the wrong type is a bug on the calling side, so it
 * is reported instead of quietly dropped.
 */
export function parseSettingsPatch(raw: unknown): SettingsPatch {
  if (!isRecord(raw)) {
    throw new SettingsValidationError(['a settings patch must be an object'])
  }

  const issues: string[] = []
  const patch: SettingsPatch = {}

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'providers') {
      patch.providers = parseProvidersPatch(value, issues)
    } else if (!isFieldKey(key)) {
      issues.push(`unknown setting "${key}"`)
    } else if (!assignField(patch, key, value)) {
      issues.push(`invalid value for "${key}"`)
    }
  }

  if (issues.length > 0) {
    throw new SettingsValidationError(issues)
  }

  return patch
}

/** Applies a validated patch without mutating the current settings. */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  const { providers, ...fields } = patch
  const next: Settings = { ...current, ...fields, providers: { ...current.providers } }

  for (const id of PROVIDER_IDS) {
    const update = providers?.[id]
    if (update) next.providers[id] = { ...next.providers[id], ...update }
  }

  return next
}
