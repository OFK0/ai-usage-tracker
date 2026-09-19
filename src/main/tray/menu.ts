import type { MenuItemConstructorOptions } from 'electron'
import type { TFunction } from 'i18next'

export interface TrayMenuOptions {
  t: TFunction
  widgetVisible: boolean
  toggleWidget: () => void
  refresh: () => void
  openSettings: () => void
}

/** The tray's context menu, in the current language. */
export function trayMenuTemplate(options: TrayMenuOptions): MenuItemConstructorOptions[] {
  const { t } = options
  return [
    {
      label: options.widgetVisible ? t('tray.hideWidget') : t('tray.showWidget'),
      click: () => options.toggleWidget()
    },
    { type: 'separator' },
    { label: t('tray.refresh'), click: () => options.refresh() },
    { label: t('tray.settings'), click: () => options.openSettings() },
    { type: 'separator' },
    { label: t('tray.quit'), role: 'quit' }
  ]
}
