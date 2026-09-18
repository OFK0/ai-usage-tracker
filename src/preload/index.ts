import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ProviderId } from '@shared/app-info'
import type {
  EventArgs,
  EventChannel,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  SendArgs,
  SendChannel
} from '@shared/ipc-contract'
import type { Settings, SettingsPatch } from '@shared/settings'

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
}

function send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
  ipcRenderer.send(channel, ...args)
}

/** Returns an unsubscribe function. The IPC event itself is never handed over. */
function subscribe<C extends EventChannel>(
  channel: C,
  listener: (...args: EventArgs<C>) => void
): () => void {
  const forward = (_event: IpcRendererEvent, ...args: unknown[]): void => {
    listener(...(args as EventArgs<C>))
  }
  ipcRenderer.on(channel, forward)
  return () => {
    ipcRenderer.removeListener(channel, forward)
  }
}

/**
 * Everything the renderer can do. Raw ipcRenderer is not exposed, so the
 * renderer is limited to the channels in the contract, and there is no way to
 * read a stored token back out.
 */
const api = {
  widget: {
    hide: (): void => send('widget:hide')
  },
  settings: {
    get: (): Promise<Settings> => invoke('settings:get'),
    update: (patch: SettingsPatch): Promise<Settings> => invoke('settings:update', patch),
    onChange: (listener: (settings: Settings) => void): (() => void) =>
      subscribe('settings:changed', listener)
  },
  secrets: {
    status: () => invoke('secrets:status'),
    describe: (provider: ProviderId) => invoke('secrets:describe', provider),
    save: (provider: ProviderId, token: string) => invoke('secrets:save', provider, token),
    clear: (provider: ProviderId) => invoke('secrets:clear', provider)
  }
}

export type PreloadApi = typeof api

if (!process.contextIsolated) {
  throw new Error('contextIsolation must stay enabled')
}

contextBridge.exposeInMainWorld('api', api)
