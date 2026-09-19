import { readFileSync } from 'node:fs'
import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { APP_NAME } from '@shared/app-info'
import { i18n } from '../i18n'
import { isWidgetVisible, toggleWidgetWindow } from '../windows/widget'
import { trayMenuTemplate } from './menu'

import trayIcon from '../../../resources/tray/tray.png?asset'
import trayIcon2x from '../../../resources/tray/tray@2x.png?asset'
import trayTemplateIcon from '../../../resources/tray/trayTemplate.png?asset'
import trayTemplateIcon2x from '../../../resources/tray/trayTemplate@2x.png?asset'

let tray: Tray | null = null

function buildIcon(): NativeImage {
  const isMac = process.platform === 'darwin'
  const base = isMac ? trayTemplateIcon : trayIcon
  const retina = isMac ? trayTemplateIcon2x : trayIcon2x

  const image = nativeImage.createFromPath(base)
  // The @2x file is renamed by the bundler, so it no longer matches the naming
  // convention nativeImage uses to find retina variants on its own.
  image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(retina) })

  if (isMac) {
    // Lets macOS recolour the icon for light and dark menu bars.
    image.setTemplateImage(true)
  }

  return image
}

export interface TrayActions {
  refresh(): void
  openSettings(): void
}

/** Rebuilt on every open, so it has the current language and show/hide state. */
function buildMenu(actions: TrayActions): Menu {
  return Menu.buildFromTemplate(
    trayMenuTemplate({
      t: i18n.t,
      widgetVisible: isWidgetVisible(),
      toggleWidget: () => toggleWidgetWindow(),
      refresh: () => actions.refresh(),
      openSettings: () => actions.openSettings()
    })
  )
}

export function createTray(actions: TrayActions): Tray {
  tray = new Tray(buildIcon())
  tray.setToolTip(APP_NAME)
  tray.on('click', () => toggleWidgetWindow())
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu(actions)))

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
