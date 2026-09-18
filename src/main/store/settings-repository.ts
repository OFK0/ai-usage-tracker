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
}

export function createSettingsRepository(backend: SettingsBackend): SettingsRepository {
  let current: Settings | null = null

  function get(): Settings {
    current ??= normalizeSettings(backend.read())
    return current
  }

  function update(patch: SettingsPatch): Settings {
    const next = mergeSettings(get(), patch)
    backend.write(next)
    current = next
    return next
  }

  return { get, update }
}
