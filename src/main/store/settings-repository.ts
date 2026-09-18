import {
  mergeSettings,
  normalizeSettings,
  type Settings,
  type SettingsPatch
} from '@shared/settings'

export interface SettingsBackend {
  read(): unknown
  write(settings: Settings): void
}

export interface SettingsRepository {
  get(): Settings
  update(patch: SettingsPatch): Settings
  /** Called after every update. Returns an unsubscribe function. */
  onChange(listener: (settings: Settings) => void): () => void
}

export function createSettingsRepository(backend: SettingsBackend): SettingsRepository {
  let current: Settings | null = null
  const listeners = new Set<(settings: Settings) => void>()

  function get(): Settings {
    current ??= normalizeSettings(backend.read())
    return current
  }

  function update(patch: SettingsPatch): Settings {
    const next = mergeSettings(get(), patch)
    backend.write(next)
    current = next
    for (const listener of listeners) listener(next)
    return next
  }

  function onChange(listener: (settings: Settings) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { get, update, onChange }
}
