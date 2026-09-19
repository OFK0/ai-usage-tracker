import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

let app: ElectronApplication
let userData: string
let mainErrors: string[]

test.beforeEach(async () => {
  // A profile of its own: nothing connected, so nothing of anyone's is read,
  // and English whatever the machine's language is.
  userData = await mkdtemp(join(tmpdir(), 'ai-usage-tracker-e2e-'))
  await writeFile(join(userData, 'config.json'), JSON.stringify({ settings: { language: 'en' } }))

  // Set in some shells, and it would start Electron as plain Node.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE'
    )
  )
  app = await electron.launch({
    args: [
      '.',
      `--user-data-dir=${userData}`,
      // CI's Linux runners can't set up Chromium's sandbox.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
    ],
    env
  })

  mainErrors = []
  app.on('console', (message) => {
    if (message.type() === 'error') mainErrors.push(message.text())
  })
})

test.afterEach(async () => {
  await app.close()
  await rm(userData, { recursive: true, force: true })
})

test('starts with the widget up, and opens settings from it', async () => {
  const widget = await app.firstWindow()

  await expect(widget.getByRole('heading', { name: 'AI Usage' })).toBeVisible()
  await expect(widget.getByRole('button', { name: 'Connect in settings' }).first()).toBeVisible()

  const opening = app.waitForEvent('window')
  await widget.getByRole('button', { name: 'Open settings' }).click()
  const settings = await opening

  await expect(settings.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  // The tray is set up after the widget, so a failure there shows up as an
  // error from the main process.
  expect(mainErrors).toEqual([])
})
