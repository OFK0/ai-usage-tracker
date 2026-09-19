import type { ProviderId } from '@shared/app-info'
import {
  tokenProblem,
  type SecretStorageStatus,
  type TokenInfo,
  type TokenProblem
} from '@shared/secrets'

/** The part of Electron's safeStorage this module uses. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
  getSelectedStorageBackend(): string
}

export interface StoredSecret {
  ciphertext: string
  hint: string | null
}

export interface SecretBackend {
  read(provider: ProviderId): unknown
  write(provider: ProviderId, secret: StoredSecret): void
  remove(provider: ProviderId): void
}

export interface SecretVault {
  status(): SecretStorageStatus
  describe(provider: ProviderId): TokenInfo
  save(provider: ProviderId, token: unknown): TokenInfo
  /** Main process only. There is deliberately no IPC channel that exposes this. */
  read(provider: ProviderId): string | null
  clear(provider: ProviderId): TokenInfo
}

const MIN_LENGTH_FOR_HINT = 12

const PROBLEM_MESSAGES: Record<TokenProblem, string> = {
  empty: 'Token is empty',
  tooLong: 'Token is too long',
  whitespace: 'Token must not contain whitespace'
}

export function parseToken(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Token must be a string')

  const problem = tokenProblem(raw)
  if (problem) throw new Error(PROBLEM_MESSAGES[problem])

  return raw.trim()
}

export function tokenHint(token: string): string | null {
  // On a short value the last four characters give away too much of it.
  return token.length >= MIN_LENGTH_FOR_HINT ? token.slice(-4) : null
}

function isStoredSecret(value: unknown): value is StoredSecret {
  if (typeof value !== 'object' || value === null) return false
  const { ciphertext, hint } = value as Record<string, unknown>
  return (
    typeof ciphertext === 'string' &&
    ciphertext.length > 0 &&
    (hint === null || typeof hint === 'string')
  )
}

export function createSecretVault(options: {
  safeStorage: SafeStorageLike
  backend: SecretBackend
  platform: NodeJS.Platform
}): SecretVault {
  const { safeStorage, backend, platform } = options

  function status(): SecretStorageStatus {
    if (!safeStorage.isEncryptionAvailable()) {
      return { available: false, reason: 'encryption-unavailable' }
    }
    if (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
      return { available: false, reason: 'no-keyring' }
    }
    return { available: true }
  }

  function stored(provider: ProviderId): StoredSecret | null {
    const value = backend.read(provider)
    return isStoredSecret(value) ? value : null
  }

  function describe(provider: ProviderId): TokenInfo {
    const secret = stored(provider)
    return secret ? { saved: true, hint: secret.hint } : { saved: false, hint: null }
  }

  function save(provider: ProviderId, raw: unknown): TokenInfo {
    const current = status()
    if (!current.available) {
      throw new Error(`Secure storage is unavailable (${current.reason})`)
    }

    const token = parseToken(raw)
    backend.write(provider, {
      ciphertext: safeStorage.encryptString(token).toString('base64'),
      hint: tokenHint(token)
    })

    return describe(provider)
  }

  function read(provider: ProviderId): string | null {
    const secret = stored(provider)
    if (!secret || !safeStorage.isEncryptionAvailable()) return null

    try {
      return safeStorage.decryptString(Buffer.from(secret.ciphertext, 'base64'))
    } catch {
      // A token that no longer decrypts, for example after the OS keychain was
      // reset, is as good as missing. The user is asked for it again.
      return null
    }
  }

  function clear(provider: ProviderId): TokenInfo {
    backend.remove(provider)
    return describe(provider)
  }

  return { status, describe, save, read, clear }
}
