import { readFileSync } from 'node:fs'
import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { APP_NAME } from '@shared/app-info'
import { isWidgetVisible, toggleWidgetWindow } from '../windows/widget'

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

/** Rebuilt on every open so the show/hide label matches the current state. */
function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: isWidgetVisible() ? 'Hide widget' : 'Show widget',
      click: () => toggleWidgetWindow()
    },
    { type: 'separator' },
    // Enabled once the provider engine and the settings window exist.
    { label: 'Refresh', enabled: false },
    { label: 'Settings', enabled: false },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ])
}

export function createTray(): Tray {
  tray = new Tray(buildIcon())
  tray.setToolTip(APP_NAME)
  tray.on('click', () => toggleWidgetWindow())
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()))

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
