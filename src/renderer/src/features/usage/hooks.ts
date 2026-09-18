import { useCallback, useEffect, useState } from 'react'
import type { ProviderSnapshot } from '@shared/usage'

export function useUsage(): {
  snapshots: ProviderSnapshot[] | null
  refreshing: boolean
  refresh: () => Promise<void>
} {
  const [snapshots, setSnapshots] = useState<ProviderSnapshot[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    const unsubscribe = window.api.usage.onChange(setSnapshots)

    void window.api.usage.get().then((initial) => {
      // A push may already have arrived while this was in flight, and it's newer.
      if (active) setSnapshots((current) => current ?? initial)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setSnapshots(await window.api.usage.refresh())
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { snapshots, refreshing, refresh }
}

/** The current time, updated on an interval, for countdowns. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
