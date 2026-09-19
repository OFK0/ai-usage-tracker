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
  // A new or removed key can change what the provider shows, so it is read
  // again straight away rather than at the next poll.
  handle('secrets:save', (provider, token) => {
    const id = parseProviderId(provider)
    const info = secretVault.save(id, token)
    void usagePoller.refresh(id)
    return info
  })
  handle('secrets:clear', (provider) => {
    const id = parseProviderId(provider)
    const info = secretVault.clear(id)
    void usagePoller.refresh(id)
    return info
  })

  handle('usage:get', () => usagePoller.snapshots())
  handle('usage:refresh', (provider) =>
    usagePoller.refresh(provider === undefined ? undefined : parseProviderId(provider))
  )

  listen('widget:hide', () => hideWidgetWindow())
  listen('widget:fit', (height) => {
    if (typeof height === 'number' && Number.isFinite(height)) fitWidgetToContent(height)
  })
  listen('settings:open', () => openSettingsWindow())
}
