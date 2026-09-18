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
