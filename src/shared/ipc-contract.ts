import type { ProviderId } from './app-info'
import type { SecretStorageStatus, TokenInfo } from './secrets'
import type { Settings, SettingsPatch } from './settings'
import type { ProviderSnapshot } from './usage'

/**
 * Every message between main and renderer is listed here. The preload builds
 * its API from these signatures, so a channel that is not in this file cannot
 * be reached from the renderer at all.
 */

/** Renderer asks, main answers. */
export interface InvokeChannels {
  'settings:get': () => Settings
  'settings:update': (patch: SettingsPatch) => Settings
  'secrets:status': () => SecretStorageStatus
  'secrets:describe': (provider: ProviderId) => TokenInfo
  'secrets:save': (provider: ProviderId, token: string) => TokenInfo
  'secrets:clear': (provider: ProviderId) => TokenInfo
  'usage:get': () => ProviderSnapshot[]
  /** Asks every provider, or just `provider`, and resolves once they have answered. */
  'usage:refresh': (provider?: ProviderId) => ProviderSnapshot[]
}

/** Renderer tells main, no answer. */
export interface SendChannels {
  'widget:hide': () => void
  /** The height the widget's content needs, in CSS pixels. */
  'widget:fit': (height: number) => void
  'settings:open': () => void
}

/** Main pushes to every open window. */
export interface EventChannels {
  'settings:changed': (settings: Settings) => void
  'usage:changed': (snapshots: ProviderSnapshot[]) => void
}

export type InvokeChannel = keyof InvokeChannels
export type InvokeArgs<C extends InvokeChannel> = Parameters<InvokeChannels[C]>
export type InvokeResult<C extends InvokeChannel> = ReturnType<InvokeChannels[C]>

export type SendChannel = keyof SendChannels
export type SendArgs<C extends SendChannel> = Parameters<SendChannels[C]>

export type EventChannel = keyof EventChannels
export type EventArgs<C extends EventChannel> = Parameters<EventChannels[C]>
