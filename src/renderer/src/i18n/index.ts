import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nOptions } from '@shared/i18n/resources'
import type { Language } from '@shared/settings'

/**
 * The renderer's instance. It starts in English, which is what tests see;
 * main.tsx switches it to the window's language before the first render.
 */
export const i18n = createInstance()
void i18n.use(initReactI18next).init(i18nOptions('en'))

/** Numbers, money and dates follow the language the UI is shown in. */
export function uiLocale(): string {
  return i18n.language
}

/** Switches the UI language and tells the document, for fonts, hyphenation and screen readers. */
export function applyLanguage(language: Language): void {
  if (i18n.language !== language) void i18n.changeLanguage(language)
  document.documentElement.lang = language
}
