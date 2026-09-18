import { createProviders } from './providers'
import { createPoller } from './scheduler/poller'
import { settingsRepository } from './store'
import { broadcast } from './ipc/typed'

export const usagePoller = createPoller({
  providers: createProviders(),
  getConfig: () => {
    const settings = settingsRepository.get()
    return {
      intervalMs: settings.refreshIntervalSeconds * 1000,
      isEnabled: (id) => settings.providers[id].enabled
    }
  },
  onChange: (snapshots) => broadcast('usage:changed', snapshots)
})
