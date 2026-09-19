import { app } from 'electron'
import { createInstance } from 'i18next'
import { resolveLanguage } from '@shared/i18n/language'
import { i18nOptions } from '@shared/i18n/resources'
import type { Language, LanguageSetting } from '@shared/settings'

/**
 * The main process's own instance, for the tray menu. It reads the same
 * locale files and resolves the same setting the same way as the windows do,
 * so the menu and the widget never disagree.
 */
export const i18n = createInstance()
void i18n.init(i18nOptions('en'))

export function appLanguage(setting: LanguageSetting): Language {
  return resolveLanguage(setting, app.getPreferredSystemLanguages())
}

export function applyLanguage(setting: LanguageSetting): void {
  void i18n.changeLanguage(appLanguage(setting))
}
