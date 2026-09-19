import type { InitOptions } from 'i18next'
import type { Language } from '../settings'
import ar from './locales/ar.json'
import de from './locales/de.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import it from './locales/it.json'
import ru from './locales/ru.json'
import tr from './locales/tr.json'

/** Every locale is bundled: together they're a few dozen kilobytes. */
export const LOCALES: Record<Language, Record<string, unknown>> = { en, tr, fr, de, it, ru, ar }

export const resources = Object.fromEntries(
  Object.entries(LOCALES).map(([language, translation]) => [language, { translation }])
)

/** The options both processes start their i18next instance with. */
export function i18nOptions(language: Language): InitOptions {
  return {
    lng: language,
    fallbackLng: 'en',
    resources,
    // The resources are right here, so there is nothing to wait for.
    initAsync: false,
    // React escapes what it renders, and the main process only fills menus.
    interpolation: { escapeValue: false }
  }
}
