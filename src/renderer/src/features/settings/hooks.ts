import { useCallback, useEffect, useState } from 'react'
import type { ProviderId } from '@shared/app-info'
import type { SecretStorageStatus, TokenInfo } from '@shared/secrets'
import type { Settings, SettingsPatch } from '@shared/settings'

/** Strips Electron's "Error invoking remote method '…': Error: " wrapper. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export function useSettings(): {
  settings: Settings | null
  update: (patch: SettingsPatch) => Promise<void>
} {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = window.api.settings.onChange(setSettings)

    void window.api.settings.get().then((initial) => {
      if (active) setSettings((current) => current ?? initial)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const update = useCallback(async (patch: SettingsPatch) => {
    setSettings(await window.api.settings.update(patch))
  }, [])

  return { settings, update }
}

export function useSecret(provider: ProviderId): {
  status: SecretStorageStatus | null
  info: TokenInfo | null
  save: (token: string) => Promise<void>
  clear: () => Promise<void>
} {
  const [status, setStatus] = useState<SecretStorageStatus | null>(null)
  const [info, setInfo] = useState<TokenInfo | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([window.api.secrets.status(), window.api.secrets.describe(provider)]).then(
      ([nextStatus, nextInfo]) => {
        if (!active) return
        setStatus(nextStatus)
        setInfo(nextInfo)
      }
    )
    return () => {
      active = false
    }
  }, [provider])

  const save = useCallback(
    async (token: string) => setInfo(await window.api.secrets.save(provider, token)),
    [provider]
  )
  const clear = useCallback(
    async () => setInfo(await window.api.secrets.clear(provider)),
    [provider]
  )

  return { status, info, save, clear }
}
