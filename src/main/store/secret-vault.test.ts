// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ProviderId } from '@shared/app-info'
import {
  createSecretVault,
  parseToken,
  tokenHint,
  type SafeStorageLike,
  type SecretBackend
} from './secret-vault'

const TOKEN = 'ghp_abcdefghijklmnop1234'

function fakeSafeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    // Reversible but visibly not the plaintext, so tests can tell the difference.
    encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
    decryptString: (encrypted) => [...encrypted.toString().slice(4)].reverse().join(''),
    getSelectedStorageBackend: () => 'gnome_libsecret',
    ...overrides
  }
}

function memoryBackend(): SecretBackend & { data: Map<ProviderId, unknown> } {
  const data = new Map<ProviderId, unknown>()
  return {
    data,
    read: (provider) => data.get(provider),
    write: (provider, secret) => data.set(provider, secret),
    remove: (provider) => data.delete(provider)
  }
}

function vault(
  options: { safeStorage?: SafeStorageLike; platform?: NodeJS.Platform } = {}
): ReturnType<typeof createSecretVault> & { backend: ReturnType<typeof memoryBackend> } {
  const backend = memoryBackend()
  return {
    backend,
    ...createSecretVault({
      safeStorage: options.safeStorage ?? fakeSafeStorage(),
      backend,
      platform: options.platform ?? 'win32'
    })
  }
}

describe('status', () => {
  it('is available when the OS provides encryption', () => {
    expect(vault().status()).toEqual({ available: true })
  })

  it('is unavailable when the OS provides no encryption', () => {
    const safeStorage = fakeSafeStorage({ isEncryptionAvailable: () => false })

    expect(vault({ safeStorage }).status()).toEqual({
      available: false,
      reason: 'encryption-unavailable'
    })
  })

  it('treats the Linux basic_text fallback as unavailable', () => {
    const safeStorage = fakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' })

    expect(vault({ safeStorage, platform: 'linux' }).status()).toEqual({
      available: false,
      reason: 'no-keyring'
    })
  })

  it('only asks about the storage backend on Linux', () => {
    const safeStorage = fakeSafeStorage({
      getSelectedStorageBackend: () => {
        throw new Error('not available on this platform')
      }
    })

    expect(vault({ safeStorage, platform: 'darwin' }).status()).toEqual({ available: true })
  })
})

describe('save and read', () => {
  it('stores ciphertext, never the token itself', () => {
    const v = vault()

    v.save('copilot', TOKEN)

    expect(JSON.stringify(v.backend.data.get('copilot'))).not.toContain(TOKEN)
  })

  it('reads back the original token', () => {
    const v = vault()

    v.save('copilot', TOKEN)

    expect(v.read('copilot')).toBe(TOKEN)
  })

  it('trims surrounding whitespace from a pasted token', () => {
    const v = vault()

    v.save('copilot', `  ${TOKEN}\n`)

    expect(v.read('copilot')).toBe(TOKEN)
  })

  it('refuses to save when secure storage is unavailable', () => {
    const v = vault({ safeStorage: fakeSafeStorage({ isEncryptionAvailable: () => false }) })

    expect(() => v.save('copilot', TOKEN)).toThrow('Secure storage is unavailable')
    expect(v.backend.data.size).toBe(0)
  })

  it('returns null when a stored token no longer decrypts', () => {
    const v = vault({
      safeStorage: fakeSafeStorage({
        decryptString: () => {
          throw new Error('keychain was reset')
        }
      })
    })

    v.save('copilot', TOKEN)

    expect(v.read('copilot')).toBeNull()
  })

  it('ignores a stored entry that has the wrong shape', () => {
    const v = vault()
    v.backend.data.set('claude', { something: 'else' })

    expect(v.read('claude')).toBeNull()
    expect(v.describe('claude')).toEqual({ saved: false, hint: null })
  })
})

describe('describe and clear', () => {
  it('reports a saved token by its last four characters only', () => {
    const v = vault()

    expect(v.save('copilot', TOKEN)).toEqual({ saved: true, hint: '1234' })
  })

  it('reports nothing for a provider without a token', () => {
    expect(vault().describe('claude')).toEqual({ saved: false, hint: null })
  })

  it('forgets a cleared token', () => {
    const v = vault()
    v.save('copilot', TOKEN)

    expect(v.clear('copilot')).toEqual({ saved: false, hint: null })
    expect(v.read('copilot')).toBeNull()
  })
})

describe('parseToken', () => {
  it.each([
    [42, 'Token must be a string'],
    ['   ', 'Token is empty'],
    ['abc def', 'Token must not contain whitespace'],
    ['x'.repeat(4097), 'Token is too long']
  ])('rejects %j', (raw, message) => {
    expect(() => parseToken(raw)).toThrow(message)
  })
})

describe('tokenHint', () => {
  it('withholds a hint for short values', () => {
    expect(tokenHint('short-key')).toBeNull()
  })

  it('gives the last four characters of a real token', () => {
    expect(tokenHint(TOKEN)).toBe('1234')
  })
})
