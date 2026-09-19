import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isRecord } from './rate-limits'

export interface CodexCredentials {
  accessToken: string
  /** The ChatGPT account the token belongs to; the usage API wants it in a header. */
  accountId: string | null
}

export type CodexAuth =
  | CodexCredentials
  /** No ~/.codex at all. */
  | { missing: 'not_installed' }
  /** Codex is there but nobody has signed in. */
  | { missing: 'signed_out' }
  /** Signed in with an OpenAI API key, which has spend but no plan limits. */
  | { missing: 'api_key' }

/** Where Codex keeps its files: $CODEX_HOME, or ~/.codex. */
export function codexHome(env: NodeJS.ProcessEnv, home: string): string {
  return env['CODEX_HOME'] || join(home, '.codex')
}

/**
 * Reads auth.json, which Codex writes when you sign in with ChatGPT:
 * `{"OPENAI_API_KEY": null, "tokens": {"access_token": "…", "account_id": "…"}}`.
 * Only read, never written, and the refresh token is left alone: Codex
 * renews the access token itself whenever it runs.
 */
export function parseCodexAuth(raw: string): CodexCredentials | 'api_key' | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data)) return null

  const tokens = data['tokens']
  if (isRecord(tokens) && typeof tokens['access_token'] === 'string' && tokens['access_token']) {
    const accountId = tokens['account_id']
    return {
      accessToken: tokens['access_token'],
      accountId: typeof accountId === 'string' && accountId ? accountId : null
    }
  }

  const apiKey = data['OPENAI_API_KEY']
  return typeof apiKey === 'string' && apiKey ? 'api_key' : null
}

export async function readCodexAuth(home: string): Promise<CodexAuth> {
  try {
    await stat(home)
  } catch {
    return { missing: 'not_installed' }
  }

  let raw: string
  try {
    raw = await readFile(join(home, 'auth.json'), 'utf8')
  } catch {
    return { missing: 'signed_out' }
  }

  const parsed = parseCodexAuth(raw)
  if (parsed === 'api_key') return { missing: 'api_key' }
  return parsed ?? { missing: 'signed_out' }
}
