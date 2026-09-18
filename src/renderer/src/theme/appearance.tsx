import { useEffect, type ReactNode } from 'react'
import { useSettings } from '@/features/settings/hooks'
import { applyAccentHue } from './accent'

/**
 * Keeps a window's theme in line with the settings. Light or dark is decided in
 * the main process, which sets Electron's theme source, so this only has to
 * follow prefers-color-scheme. The accent hue comes straight from settings.
 */
export function Appearance({ children }: { children: ReactNode }): ReactNode {
  const { settings } = useSettings()
  const accentHue = settings?.accentHue

  useEffect(() => {
    if (accentHue !== undefined) applyAccentHue(accentHue)
  }, [accentHue])

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', dark.matches)
    }

    apply()
    dark.addEventListener('change', apply)
    return () => dark.removeEventListener('change', apply)
  }, [])

  return children
}
