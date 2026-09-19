import { useEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { resolveLanguage } from '@shared/i18n/language'
import { useSettings } from '@/features/settings/hooks'
import { applyLanguage } from '@/i18n'
import { applyAccentHue } from './accent'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = (): void => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

/**
 * Keeps a window's language, theme and motion in line with the settings.
 *
 * Light or dark is decided in the main process, which sets Electron's theme
 * source, so this only follows prefers-color-scheme. Motion is reduced when
 * either the setting or the OS asks for it: animations in React go through
 * MotionConfig, and CSS ones check the data-motion attribute on the root.
 */
export function Appearance({ children }: { children: ReactNode }): ReactNode {
  const { settings } = useSettings()
  const accentHue = settings?.accentHue
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const osReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const reduceMotion = (settings?.reduceMotion ?? false) || osReducedMotion
  const language = settings
    ? resolveLanguage(settings.language, window.api.locale.systemLanguages)
    : null

  useEffect(() => {
    if (language) applyLanguage(language)
  }, [language])

  useEffect(() => {
    if (accentHue !== undefined) applyAccentHue(accentHue)
  }, [accentHue])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    document.documentElement.dataset['motion'] = reduceMotion ? 'reduce' : 'full'
  }, [reduceMotion])

  return <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>
}
