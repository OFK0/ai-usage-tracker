import { homedir } from 'node:os'
import { app } from 'electron'
import { APP_NAME } from '@shared/app-info'
import {
  autostartDir,
  createDesktopEntryAutostart,
  createLoginItemAutostart,
  launchCommand,
  type Autostart
} from './os/autostart'
import { settingsRepository } from './store'

let autostart: Autostart | null = null

function getAutostart(): Autostart {
  if (autostart) return autostart

  const command = launchCommand({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    env: process.env
  })
  autostart =
    process.platform === 'linux'
      ? createDesktopEntryAutostart({
          dir: autostartDir(process.env, homedir()),
          name: APP_NAME,
          command
        })
      : createLoginItemAutostart(app, process.platform, command)
  return autostart
}

/**
 * Makes the system match the setting. If that didn't take, the setting goes
 * back to what the system actually does, so the switch never claims otherwise.
 */
export async function applyLaunchAtLogin(enabled: boolean): Promise<void> {
  try {
    await getAutostart().setEnabled(enabled)
  } catch (error) {
    console.error('Could not change launch at login', error)
  }
  const actual = await getAutostart()
    .isEnabled()
    .catch(() => enabled)
  if (actual !== enabled) settingsRepository.update({ launchAtLogin: actual })
}

/**
 * At startup the installed app takes the system's word for it, since the user
 * may have switched it off there, in Task Manager or System Settings. Skipped
 * in development, which launches differently and would find nothing.
 */
export async function adoptSystemLaunchAtLogin(): Promise<void> {
  if (!app.isPackaged) return
  const actual = await getAutostart().isEnabled()
  if (actual !== settingsRepository.get().launchAtLogin) {
    settingsRepository.update({ launchAtLogin: actual })
  }
}
