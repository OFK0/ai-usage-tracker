// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEditorProbe,
  editorConfigDir,
  parseEditorToken,
  resolveCopilotToken,
  type CopilotTokenSources,
  type EditorProbe,
  type GhProbe
} from './token'

function sources(
  options: {
    saved?: string | null
    connected?: boolean
    gh?: GhProbe
    editor?: EditorProbe
  } = {}
): CopilotTokenSources & {
  probeGh: ReturnType<typeof vi.fn>
  probeEditor: ReturnType<typeof vi.fn>
} {
  return {
    readSavedToken: () => options.saved ?? null,
    isConnected: () => options.connected ?? true,
    probeGh: vi.fn(() => Promise.resolve(options.gh ?? { installed: true, token: 'gho_cli' })),
    probeEditor: vi.fn(() =>
      Promise.resolve(options.editor ?? { found: true, token: 'ghu_editor' })
    )
  }
}

describe('resolveCopilotToken', () => {
  it('prefers a token typed into settings', async () => {
    expect(await resolveCopilotToken(sources({ saved: 'github_pat_typed' }))).toEqual({
      token: 'github_pat_typed',
      source: 'settings'
    })
  })

  it('uses a typed token even while GitHub is not connected', async () => {
    const s = sources({ saved: 'github_pat_typed', connected: false })

    expect(await resolveCopilotToken(s)).toMatchObject({ source: 'settings' })
  })

  it('does not touch other apps’ sign-ins until GitHub is connected', async () => {
    const s = sources({ connected: false })

    expect(await resolveCopilotToken(s)).toEqual({ missing: 'disconnected' })
    expect(s.probeGh).not.toHaveBeenCalled()
    expect(s.probeEditor).not.toHaveBeenCalled()
  })

  it('takes the GitHub CLI sign-in before the editor one', async () => {
    const s = sources()

    expect(await resolveCopilotToken(s)).toEqual({ token: 'gho_cli', source: 'gh' })
    expect(s.probeEditor).not.toHaveBeenCalled()
  })

  it('falls back to the editor sign-in', async () => {
    const s = sources({ gh: { installed: true, token: null } })

    expect(await resolveCopilotToken(s)).toEqual({ token: 'ghu_editor', source: 'editor' })
  })

  it('reports signed out when something is installed but nobody is signed in', async () => {
    const s = sources({
      gh: { installed: true, token: null },
      editor: { found: false, token: null }
    })

    expect(await resolveCopilotToken(s)).toEqual({ missing: 'signed_out' })
  })

  it('reports not installed when there is neither the CLI nor an editor sign-in', async () => {
    const s = sources({
      gh: { installed: false, token: null },
      editor: { found: false, token: null }
    })

    expect(await resolveCopilotToken(s)).toEqual({ missing: 'not_installed' })
  })
})

describe('parseEditorToken', () => {
  it('reads apps.json, whose keys carry the OAuth app id', () => {
    const raw = JSON.stringify({
      'github.com:Iv1.b507a08c87ecfe98': { user: 'ada', oauth_token: 'ghu_apps', githubAppId: 'x' }
    })

    expect(parseEditorToken(raw)).toBe('ghu_apps')
  })

  it('reads hosts.json', () => {
    expect(parseEditorToken(JSON.stringify({ 'github.com': { oauth_token: 'gho_hosts' } }))).toBe(
      'gho_hosts'
    )
  })

  it('ignores other hosts, such as a GitHub Enterprise server', () => {
    const raw = JSON.stringify({ 'ghe.example.com': { oauth_token: 'ghe_token' } })

    expect(parseEditorToken(raw)).toBeNull()
  })

  it.each([['{'], ['[]'], [JSON.stringify({ 'github.com': { oauth_token: '' } })]])(
    'returns null for %s',
    (raw) => {
      expect(parseEditorToken(raw)).toBeNull()
    }
  )
})

describe('editorConfigDir', () => {
  it('uses LOCALAPPDATA on Windows', () => {
    expect(
      editorConfigDir('win32', { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' }, 'C:\\Users\\ada')
    ).toBe(join('C:\\Users\\ada\\AppData\\Local', 'github-copilot'))
  })

  it('uses XDG_CONFIG_HOME, then ~/.config, elsewhere', () => {
    expect(editorConfigDir('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/ada')).toBe(
      join('/cfg', 'github-copilot')
    )
    expect(editorConfigDir('darwin', {}, '/Users/ada')).toBe(
      join('/Users/ada', '.config', 'github-copilot')
    )
  })
})

describe('editor probe', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'github-copilot-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds nothing in an empty folder', async () => {
    expect(await createEditorProbe(dir)()).toEqual({ found: false, token: null })
  })

  it('reads the token from hosts.json when apps.json is missing', async () => {
    await writeFile(
      join(dir, 'hosts.json'),
      JSON.stringify({ 'github.com': { oauth_token: 'gho_x' } })
    )

    expect(await createEditorProbe(dir)()).toEqual({ found: true, token: 'gho_x' })
  })

  it('reports a sign-in file with no usable token as found but empty', async () => {
    await writeFile(join(dir, 'apps.json'), '{}')

    expect(await createEditorProbe(dir)()).toEqual({ found: true, token: null })
  })
})
