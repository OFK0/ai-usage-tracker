// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autostartDir,
  createDesktopEntryAutostart,
  createLoginItemAutostart,
  DESKTOP_FILE_NAME,
  desktopEntry,
  launchCommand,
  quoteExecArg,
  type LoginItems
} from './autostart'

describe('launchCommand', () => {
  const base = { execPath: '/opt/app/ai-usage-tracker', appPath: '/src/app', env: {} }

  it('is the executable itself once packaged', () => {
    expect(launchCommand({ ...base, isPackaged: true })).toEqual({
      executable: '/opt/app/ai-usage-tracker',
      args: []
    })
  })

  it('points at the AppImage file rather than inside its mount', () => {
    const env = { APPIMAGE: '/home/ada/Apps/AI Usage Tracker.AppImage' }

    expect(launchCommand({ ...base, isPackaged: true, env }).executable).toBe(env.APPIMAGE)
  })

  it('is Electron plus the app folder in development', () => {
    expect(launchCommand({ ...base, isPackaged: false })).toEqual({
      executable: '/opt/app/ai-usage-tracker',
      args: ['/src/app']
    })
  })
})

describe('login items', () => {
  function fakeApp(settings: ReturnType<LoginItems['getLoginItemSettings']>) {
    return {
      getLoginItemSettings: vi.fn<LoginItems['getLoginItemSettings']>(() => settings),
      setLoginItemSettings: vi.fn<LoginItems['setLoginItemSettings']>()
    }
  }
  const command = { executable: 'C:\\Apps\\AI Usage Tracker.exe', args: [] }

  it('registers the command line it will later look for', async () => {
    const app = fakeApp({ openAtLogin: false })

    await createLoginItemAutostart(app, 'win32', command).setEnabled(true)

    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: command.executable,
      args: []
    })
  })

  it('counts an entry switched off in Task Manager as off on Windows', async () => {
    const app = fakeApp({ openAtLogin: true, executableWillLaunchAtLogin: false })

    expect(await createLoginItemAutostart(app, 'win32', command).isEnabled()).toBe(false)
    expect(app.getLoginItemSettings).toHaveBeenCalledWith({ path: command.executable, args: [] })
  })

  it('goes by openAtLogin on macOS', async () => {
    const app = fakeApp({ openAtLogin: true })

    expect(await createLoginItemAutostart(app, 'darwin', command).isEnabled()).toBe(true)
  })
})

describe('desktop entries', () => {
  it('uses XDG_CONFIG_HOME, then ~/.config', () => {
    expect(autostartDir({ XDG_CONFIG_HOME: '/cfg' }, '/home/ada')).toBe(join('/cfg', 'autostart'))
    expect(autostartDir({}, '/home/ada')).toBe(join('/home/ada', '.config', 'autostart'))
  })

  it.each([
    ['/usr/bin/app', '/usr/bin/app'],
    ['/home/ada/My Apps/app', '"/home/ada/My Apps/app"'],
    ['100%', '100%%'],
    ['say "hi" $HOME `x` \\', '"say \\"hi\\" \\$HOME \\`x\\` \\\\"'],
    ['', '""']
  ])('quotes %j as %s', (arg, expected) => {
    expect(quoteExecArg(arg)).toBe(expected)
  })

  it('writes an entry that starts the app', () => {
    const entry = desktopEntry('AI Usage Tracker', {
      executable: '/home/ada/Apps/AI Usage Tracker.AppImage',
      args: []
    })

    expect(entry).toBe(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=AI Usage Tracker',
        'Exec="/home/ada/Apps/AI Usage Tracker.AppImage"',
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        ''
      ].join('\n')
    )
  })

  it('doubles backslashes once more for the Exec string itself', () => {
    const entry = desktopEntry('x', { executable: '/a\\b', args: [] })

    expect(entry).toContain('Exec="/a\\\\\\\\b"')
  })

  describe('on disk', () => {
    let dir: string

    beforeEach(async () => {
      dir = join(await mkdtemp(join(tmpdir(), 'autostart-')), 'autostart')
    })

    afterEach(async () => {
      await rm(join(dir, '..'), { recursive: true, force: true })
    })

    it('creates the folder and the file when turned on, and removes the file when turned off', async () => {
      const autostart = createDesktopEntryAutostart({
        dir,
        name: 'AI Usage Tracker',
        command: { executable: '/usr/bin/ai-usage-tracker', args: [] }
      })
      expect(await autostart.isEnabled()).toBe(false)

      await autostart.setEnabled(true)
      expect(await autostart.isEnabled()).toBe(true)
      expect(await readFile(join(dir, DESKTOP_FILE_NAME), 'utf8')).toContain(
        'Exec=/usr/bin/ai-usage-tracker'
      )

      await autostart.setEnabled(false)
      expect(await autostart.isEnabled()).toBe(false)
    })

    it('turning off when nothing is there is fine', async () => {
      const autostart = createDesktopEntryAutostart({
        dir,
        name: 'x',
        command: { executable: '/x', args: [] }
      })

      await expect(autostart.setEnabled(false)).resolves.toBeUndefined()
    })
  })
})
