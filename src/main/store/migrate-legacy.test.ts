// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LEGACY_FOLDER, migrateLegacySettings } from './migrate-legacy'

const APP = 'AI Usage Tracker'

let appData: string
let legacy: string
let userData: string

beforeEach(async () => {
  appData = await mkdtemp(join(tmpdir(), 'app-data-'))
  legacy = join(appData, LEGACY_FOLDER)
  userData = join(appData, APP)
})

afterEach(async () => {
  await rm(appData, { recursive: true, force: true })
})

async function writeLegacy(file: string, content: string): Promise<void> {
  await mkdir(legacy, { recursive: true })
  await writeFile(join(legacy, file), content)
}

describe('migrateLegacySettings', () => {
  it('brings the settings over to the new folder', async () => {
    await writeLegacy('config.json', '{"settings":{"theme":"dark"}}')

    expect(await migrateLegacySettings(appData, userData, APP)).toBe(true)
    expect(await readFile(join(userData, 'config.json'), 'utf8')).toBe(
      '{"settings":{"theme":"dark"}}'
    )
  })

  it('leaves stored tokens behind, since they could not be decrypted anyway', async () => {
    await writeLegacy('config.json', '{}')
    await writeLegacy('secrets.json', '{"claude":{"ciphertext":"djEw…","hint":"x9Kq"}}')

    await migrateLegacySettings(appData, userData, APP)

    expect(await readdir(userData)).toEqual(['config.json'])
  })

  it('never overwrites settings the new folder already has', async () => {
    await writeLegacy('config.json', '{"settings":{"theme":"dark"}}')
    await mkdir(userData, { recursive: true })
    await writeFile(join(userData, 'config.json'), '{"settings":{"theme":"light"}}')

    expect(await migrateLegacySettings(appData, userData, APP)).toBe(false)
    expect(await readFile(join(userData, 'config.json'), 'utf8')).toContain('light')
  })

  it('keeps the old folder as it was', async () => {
    await writeLegacy('config.json', '{}')

    await migrateLegacySettings(appData, userData, APP)

    expect(await readdir(legacy)).toEqual(['config.json'])
  })

  it('leaves a data folder chosen on the command line alone', async () => {
    await writeLegacy('config.json', '{"settings":{"providers":{"claude":{"connected":true}}}}')
    const custom = join(appData, 'test-profile')

    expect(await migrateLegacySettings(appData, custom, APP)).toBe(false)
    await expect(readdir(custom)).rejects.toThrow()
  })

  it('does nothing when there is no old folder', async () => {
    expect(await migrateLegacySettings(appData, userData, APP)).toBe(false)
  })
})
