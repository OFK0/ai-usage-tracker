import { parseProviderId } from '@shared/app-info'
import { parseSettingsPatch } from '@shared/settings'
import { secretVault, settingsRepository } from '../store'
import { usagePoller } from '../usage'
import { openSettingsWindow } from '../windows/settings'
import { fitWidgetToContent, hideWidgetWindow } from '../windows/widget'
import { handle, listen } from './typed'

export function registerIpcHandlers(): void {
  handle('settings:get', () => settingsRepository.get())
  handle('settings:update', (patch) => settingsRepository.update(parseSettingsPatch(patch)))

  handle('secrets:status', () => secretVault.status())
  handle('secrets:describe', (provider) => secretVault.describe(parseProviderId(provider)))
  handle('secrets:save', (provider, token) => secretVault.save(parseProviderId(provider), token))
  handle('secrets:clear', (provider) => secretVault.clear(parseProviderId(provider)))

  handle('usage:get', () => usagePoller.snapshots())
  handle('usage:refresh', () => usagePoller.refresh())

  listen('widget:hide', () => hideWidgetWindow())
  listen('widget:fit', (height) => {
    if (typeof height === 'number' && Number.isFinite(height)) fitWidgetToContent(height)
  })
  listen('settings:open', () => openSettingsWindow())
}
