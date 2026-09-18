// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claudeConfigDir,
  createCredentialSources,
  directoryExists,
  parseClaudeCredentials,
  readClaudeCredentials,
  type CredentialSources
} from './credentials'

function credentialsJson(accessToken = 'sk-ant-oat01-file', extra: object = {}): string {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken,
      refreshToken: 'sk-ant-ort01-never-used',
      expiresAt: 1789700000000,
      scopes: ['user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_5x',
      ...extra
    }
  })
}

function sources(file: string | null, keychain: string | null): CredentialSources {
  return {
    readFile: vi.fn(() => Promise.resolve(file)),
    readKeychain: vi.fn(() => Promise.resolve(keychain))
  }
}

describe('parseClaudeCredentials', () => {
  it('reads the fields it needs and nothing else', () => {
    expect(parseClaudeCredentials(credentialsJson())).toEqual({
      accessToken: 'sk-ant-oat01-file',
      expiresAt: 1789700000000,
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_5x'
    })
  })

  it('tolerates missing optional fields', () => {
    const raw = JSON.stringify({ claudeAiOauth: { accessToken: 'token' } })

    expect(parseClaudeCredentials(raw)).toEqual({
      accessToken: 'token',
      expiresAt: null,
      subscriptionType: null,
      rateLimitTier: null
    })
  })

  it.each([
    ['not json', '{'],
    ['no oauth block', JSON.stringify({ primaryApiKey: 'sk-ant-api' })],
    ['empty token', JSON.stringify({ claudeAiOauth: { accessToken: '' } })]
  ])('returns null for %s', (_, raw) => {
    expect(parseClaudeCredentials(raw)).toBeNull()
  })
})

describe('readClaudeCredentials', () => {
  it('reads the file on Windows and Linux without touching the keychain', async () => {
    const s = sources(credentialsJson(), credentialsJson('keychain'))

    expect((await readClaudeCredentials('win32', s))?.accessToken).toBe('sk-ant-oat01-file')
    expect(s.readKeychain).not.toHaveBeenCalled()
  })

  it('prefers the keychain on macOS', async () => {
    const s = sources(credentialsJson(), credentialsJson('keychain'))

    expect((await readClaudeCredentials('darwin', s))?.accessToken).toBe('keychain')
  })

  it('falls back to the file on macOS when the keychain has nothing', async () => {
    const s = sources(credentialsJson(), null)

    expect((await readClaudeCredentials('darwin', s))?.accessToken).toBe('sk-ant-oat01-file')
  })

  it('returns null when there is no sign-in anywhere', async () => {
    expect(await readClaudeCredentials('darwin', sources(null, null))).toBeNull()
  })
})

describe('claudeConfigDir', () => {
  it('uses ~/.claude by default', () => {
    expect(claudeConfigDir({}, '/home/ada')).toBe(join('/home/ada', '.claude'))
  })

  it('honours CLAUDE_CONFIG_DIR', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/work/claude' }, '/home/ada')).toBe('/work/claude')
  })
})

describe('file source', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'claude-config-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when the credentials file does not exist', async () => {
    expect(await createCredentialSources(dir).readFile()).toBeNull()
  })

  it('returns the file contents when it exists', async () => {
    await writeFile(join(dir, '.credentials.json'), credentialsJson())

    expect(await createCredentialSources(dir).readFile()).toBe(credentialsJson())
  })

  it('tells an existing config directory from a missing one', async () => {
    expect(await directoryExists(dir)).toBe(true)
    expect(await directoryExists(join(dir, 'missing'))).toBe(false)
  })
})
