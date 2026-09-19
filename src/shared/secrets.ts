/** What the renderer may know about secret storage. It never sees a token itself. */

export type SecretStorageStatus =
  | { available: true }
  | {
      available: false
      /**
       * `encryption-unavailable`: the OS offers no encryption to Electron.
       * `no-keyring`: Linux without a keyring, where Chromium falls back to a
       * hardcoded key. That is obfuscation, not encryption, so it counts as off.
       */
      reason: 'encryption-unavailable' | 'no-keyring'
    }

export interface TokenInfo {
  saved: boolean
  /** Last four characters, shown so the user can tell which token is stored. */
  hint: string | null
}

export const MAX_TOKEN_LENGTH = 4096

export type TokenProblem = 'empty' | 'tooLong' | 'whitespace'

/**
 * Why a pasted value can't be a key or token, or null if it can. Checked in the
 * settings window to explain the problem in the user's language, and again in
 * the main process before anything is stored.
 */
export function tokenProblem(raw: string): TokenProblem | null {
  const token = raw.trim()
  if (token.length === 0) return 'empty'
  if (token.length > MAX_TOKEN_LENGTH) return 'tooLong'
  // Tokens never contain whitespace, so one that does is almost certainly a
  // bad paste and worth catching before it gets stored.
  if (/\s/.test(token)) return 'whitespace'
  return null
}
