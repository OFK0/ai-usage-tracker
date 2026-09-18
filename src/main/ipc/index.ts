import { parseProviderId } from '@shared/app-info'
import { parseSettingsPatch } from '@shared/settings'
import { secretVault, settingsRepository } from '../store'
import { hideWidgetWindow } from '../windows/widget'
import { broadcast, handle, listen } from './typed'

export function registerIpcHandlers(): void {
  handle('settings:get', () => settingsRepository.get())

  handle('settings:update', (patch) => {
    const next = settingsRepository.update(parseSettingsPatch(patch))
    broadcast('settings:changed', next)
    return next
  })

  handle('secrets:status', () => secretVault.status())
  handle('secrets:describe', (provider) => secretVault.describe(parseProviderId(provider)))
  handle('secrets:save', (provider, token) => secretVault.save(parseProviderId(provider), token))
  handle('secrets:clear', (provider) => secretVault.clear(parseProviderId(provider)))

  listen('widget:hide', () => hideWidgetWindow())
}
