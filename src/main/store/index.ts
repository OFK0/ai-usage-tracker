import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { ProviderId } from '@shared/app-info'
import type { Settings } from '@shared/settings'
import { createSecretVault, type StoredSecret } from './secret-vault'
import { createSettingsRepository } from './settings-repository'

interface ConfigSchema {
  settings?: Settings
}

type SecretsSchema = Partial<Record<ProviderId, StoredSecret>>

// Created on first use rather than at import, so nothing touches the disk until
// the app actually asks for a value.
let config: Store<ConfigSchema> | null = null
let secrets: Store<SecretsSchema> | null = null

function configStore(): Store<ConfigSchema> {
  config ??= new Store<ConfigSchema>({ name: 'config', clearInvalidConfig: true })
  return config
}

function secretsStore(): Store<SecretsSchema> {
  // Tokens live in their own file, readable by the owner only, so resetting the
  // settings never wipes them and vice versa.
  secrets ??= new Store<SecretsSchema>({
    name: 'secrets',
    clearInvalidConfig: true,
    configFileMode: 0o600
  })
  return secrets
}

export const settingsRepository = createSettingsRepository({
  read: () => configStore().get('settings'),
  write: (settings) => configStore().set('settings', settings)
})

export const secretVault = createSecretVault({
  safeStorage,
  platform: process.platform,
  backend: {
    read: (provider) => secretsStore().get(provider),
    write: (provider, secret) => secretsStore().set(provider, secret),
    remove: (provider) => secretsStore().delete(provider)
  }
})
