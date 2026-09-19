import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type TokenSource = 'settings' | 'gh' | 'editor'

export type TokenResolution =
  | { token: string; source: TokenSource }
  /** Neither the GitHub CLI nor an editor's Copilot sign-in is on this machine. */
  | { missing: 'not_installed' }
  /** Something is installed, but nobody is signed in to it. */
  | { missing: 'signed_out' }
  /** No token was typed in and the user hasn't connected GitHub in settings. */
  | { missing: 'disconnected' }

export interface GhProbe {
  installed: boolean
  token: string | null
}

export interface EditorProbe {
  found: boolean
  token: string | null
}

export interface CopilotTokenSources {
  /** A token the user typed into settings. */
  readSavedToken: () => string | null
  /** Whether the user has allowed reading the GitHub CLI's and editors' sign-ins. */
  isConnected: () => boolean
  probeGh: () => Promise<GhProbe>
  probeEditor: () => Promise<EditorProbe>
}

/**
 * Finds a GitHub token, first hit wins: one typed into settings, then the
 * GitHub CLI's sign-in, then the one an editor's Copilot extension keeps. A typed
 * token is explicit and is used as is; the other two belong to other apps and are
 * only looked at once the user has connected GitHub in settings.
 */
export async function resolveCopilotToken(sources: CopilotTokenSources): Promise<TokenResolution> {
  const saved = sources.readSavedToken()
  if (saved) return { token: saved, source: 'settings' }

  if (!sources.isConnected()) return { missing: 'disconnected' }

  const gh = await sources.probeGh()
  if (gh.token) return { token: gh.token, source: 'gh' }

  const editor = await sources.probeEditor()
  if (editor.token) return { token: editor.token, source: 'editor' }

  return gh.installed || editor.found ? { missing: 'signed_out' } : { missing: 'not_installed' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the token out of an editor's apps.json or hosts.json. Both map a key
 * starting with the host to an object holding `oauth_token`; apps.json keys
 * also carry the OAuth app id, as in "github.com:Iv1.b507a08c87ecfe98".
 */
export function parseEditorToken(raw: string): string | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data)) return null

  for (const [host, entry] of Object.entries(data)) {
    if (!host.startsWith('github.com') || !isRecord(entry)) continue
    const token = entry['oauth_token']
    if (typeof token === 'string' && token.length > 0) return token
  }
  return null
}

/** Where editors' Copilot extensions keep their sign-in. */
export function editorConfigDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string
): string {
  if (platform === 'win32') {
    return join(env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local'), 'github-copilot')
  }
  return join(env['XDG_CONFIG_HOME'] || join(home, '.config'), 'github-copilot')
}

export function createGhProbe(): () => Promise<GhProbe> {
  return () =>
    new Promise((resolve) => {
      // execFile, not exec: nothing goes through a shell.
      execFile(
        'gh',
        ['auth', 'token', '--hostname', 'github.com'],
        { timeout: 5_000, windowsHide: true },
        (error, stdout) => {
          if (!error) {
            resolve({ installed: true, token: stdout.trim() || null })
            return
          }
          // ENOENT: there is no gh to run. Any other failure means gh ran but
          // has no sign-in for github.com.
          const installed = (error as NodeJS.ErrnoException).code !== 'ENOENT'
          resolve({ installed, token: null })
        }
      )
    })
}

export function createEditorProbe(dir: string): () => Promise<EditorProbe> {
  return async () => {
    let found = false
    for (const file of ['apps.json', 'hosts.json']) {
      let raw: string
      try {
        raw = await readFile(join(dir, file), 'utf8')
      } catch {
        continue
      }
      found = true
      const token = parseEditorToken(raw)
      if (token) return { found, token }
    }
    return { found, token: null }
  }
}
