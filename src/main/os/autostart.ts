import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface LaunchCommand {
  executable: string
  args: string[]
}

/**
 * What starts the app. A packaged app is its own executable, or on Linux the
 * AppImage file, which APPIMAGE points at because execPath is inside the
 * temporary mount. In development it's Electron plus the app folder.
 */
export function launchCommand(options: {
  isPackaged: boolean
  execPath: string
  appPath: string
  env: NodeJS.ProcessEnv
}): LaunchCommand {
  if (!options.isPackaged) return { executable: options.execPath, args: [options.appPath] }
  return { executable: options.env['APPIMAGE'] || options.execPath, args: [] }
}

export interface Autostart {
  isEnabled(): Promise<boolean>
  setEnabled(enabled: boolean): Promise<void>
}

/** The part of Electron's app this module uses. */
export interface LoginItems {
  getLoginItemSettings: (options?: { path?: string; args?: string[] }) => {
    openAtLogin: boolean
    executableWillLaunchAtLogin?: boolean
  }
  setLoginItemSettings: (settings: { openAtLogin: boolean; path?: string; args?: string[] }) => void
}

/** Windows and macOS keep login items themselves. */
export function createLoginItemAutostart(
  app: LoginItems,
  platform: NodeJS.Platform,
  command: LaunchCommand
): Autostart {
  // Windows files the entry under the command line, so the same one is needed
  // to find it again. macOS goes by the app bundle and ignores both.
  const entry = { path: command.executable, args: command.args }

  return {
    isEnabled: () => {
      const settings = app.getLoginItemSettings(entry)
      // On Windows the user can switch an entry off in Task Manager without
      // removing it, which only this field reflects.
      return Promise.resolve(
        platform === 'win32'
          ? (settings.executableWillLaunchAtLogin ?? settings.openAtLogin)
          : settings.openAtLogin
      )
    },
    setEnabled: (enabled) => {
      app.setLoginItemSettings({ openAtLogin: enabled, ...entry })
      return Promise.resolve()
    }
  }
}

/** XDG autostart folder: $XDG_CONFIG_HOME/autostart, or ~/.config/autostart. */
export function autostartDir(env: NodeJS.ProcessEnv, home: string): string {
  return join(env['XDG_CONFIG_HOME'] || join(home, '.config'), 'autostart')
}

export const DESKTOP_FILE_NAME = 'ai-usage-tracker.desktop'

/**
 * One argument of a desktop entry's Exec key. Arguments with reserved
 * characters are quoted, with ", `, $ and \ escaped inside the quotes, and a
 * literal % is doubled so it isn't read as a field code.
 */
export function quoteExecArg(arg: string): string {
  const literal = arg.replace(/%/g, '%%')
  if (literal !== '' && !/[\s"'\\><~|&;$*?#()`]/.test(literal)) return literal
  return `"${literal.replace(/(["`$\\])/g, '\\$1')}"`
}

/**
 * The whole entry. Exec is also a string value, whose own escaping doubles
 * every backslash on top of the quoting above: the spec's "four backslashes".
 */
export function desktopEntry(name: string, command: LaunchCommand): string {
  const exec = [command.executable, ...command.args].map(quoteExecArg).join(' ')
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${name}`,
    `Exec=${exec.replace(/\\/g, '\\\\')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

/** Linux has no login item API; desktops start whatever is in the XDG autostart folder. */
export function createDesktopEntryAutostart(options: {
  dir: string
  name: string
  command: LaunchCommand
}): Autostart {
  const file = join(options.dir, DESKTOP_FILE_NAME)

  return {
    isEnabled: () =>
      access(file).then(
        () => true,
        () => false
      ),
    setEnabled: async (enabled) => {
      if (!enabled) {
        await rm(file, { force: true })
        return
      }
      await mkdir(options.dir, { recursive: true })
      await writeFile(file, desktopEntry(options.name, options.command), 'utf8')
    }
  }
}
