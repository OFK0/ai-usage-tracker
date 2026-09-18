import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface ClaudeCredentials {
  accessToken: string
  /** Epoch milliseconds. */
  expiresAt: number | null
  subscriptionType: string | null
  rateLimitTier: string | null
}

export interface CredentialSources {
  /** The credentials file, or null when there isn't one. */
  readFile: () => Promise<string | null>
  /** The macOS keychain entry, or null when there isn't one or access was refused. */
  readKeychain: () => Promise<string | null>
}

export const KEYCHAIN_SERVICE = 'Claude Code-credentials'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Claude Code honours CLAUDE_CONFIG_DIR, so the sign-in may not be under ~/.claude. */
export function claudeConfigDir(env: NodeJS.ProcessEnv, home: string): string {
  return env['CLAUDE_CONFIG_DIR'] || join(home, '.claude')
}

export function parseClaudeCredentials(raw: string): ClaudeCredentials | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  const oauth = isRecord(data) ? data['claudeAiOauth'] : undefined
  if (!isRecord(oauth)) return null

  const { accessToken, expiresAt, subscriptionType, rateLimitTier } = oauth
  if (typeof accessToken !== 'string' || accessToken.length === 0) return null

  return {
    accessToken,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
    subscriptionType: typeof subscriptionType === 'string' ? subscriptionType : null,
    rateLimitTier: typeof rateLimitTier === 'string' ? rateLimitTier : null
  }
}

/**
 * macOS keeps the sign-in in the keychain and only writes the file when the
 * keychain refuses, for example in an SSH session. Everywhere else it's the file.
 */
export async function readClaudeCredentials(
  platform: NodeJS.Platform,
  sources: CredentialSources
): Promise<ClaudeCredentials | null> {
  if (platform === 'darwin') {
    const fromKeychain = await sources.readKeychain()
    const parsed = fromKeychain ? parseClaudeCredentials(fromKeychain) : null
    if (parsed) return parsed
  }

  const fromFile = await sources.readFile()
  return fromFile ? parseClaudeCredentials(fromFile) : null
}

export function createCredentialSources(configDir: string): CredentialSources {
  return {
    async readFile() {
      try {
        return await readFile(join(configDir, '.credentials.json'), 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },

    readKeychain() {
      return new Promise((resolve) => {
        // execFile, not exec: nothing here goes through a shell. The first read
        // makes macOS ask the user to allow access; a refusal ends up as null.
        execFile(
          'security',
          ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
          { timeout: 5_000 },
          (error, stdout) => resolve(error ? null : stdout.trim() || null)
        )
      })
    }
  }
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
