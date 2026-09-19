import { LANGUAGES, type Language, type LanguageSetting } from '../settings'

/** Each language in its own words, so it can be found whatever the current one is. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  tr: 'Türkçe',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  ar: 'العربية'
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * The language to show. For "system", the first of the system's preferred
 * languages the app has, matched on the language alone, so "de-AT" gets German;
 * English when there is none.
 */
export function resolveLanguage(setting: LanguageSetting, system: readonly string[]): Language {
  if (setting !== 'system') return setting

  for (const tag of system) {
    const primary = tag.toLowerCase().split(/[-_]/)[0]
    if (isLanguage(primary)) return primary
  }
  return 'en'
}

export function textDirection(language: Language): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr'
}

/**
 * The main process hands each window its language on the command line, so the
 * first paint is already in the right one. The system languages come along to
 * resolve "system" later, when the setting changes.
 */
const LANGUAGE_FLAG = '--ait-language='
const SYSTEM_LANGUAGES_FLAG = '--ait-system-languages='

export interface WindowLocale {
  language: Language
  systemLanguages: string[]
}

export function localeArguments(locale: WindowLocale): string[] {
  return [
    `${LANGUAGE_FLAG}${locale.language}`,
    `${SYSTEM_LANGUAGES_FLAG}${locale.systemLanguages.join(',')}`
  ]
}

export function parseLocaleArguments(argv: readonly string[]): WindowLocale {
  const value = (flag: string): string =>
    argv.find((arg) => arg.startsWith(flag))?.slice(flag.length) ?? ''

  const language = value(LANGUAGE_FLAG)
  return {
    language: isLanguage(language) ? language : 'en',
    // Language tags only ever hold letters, digits and hyphens (or underscores).
    systemLanguages: value(SYSTEM_LANGUAGES_FLAG)
      .split(',')
      .filter((tag) => /^[A-Za-z0-9_-]{1,35}$/.test(tag))
  }
}
