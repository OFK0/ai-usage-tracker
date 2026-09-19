// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  antigravityInstallPaths,
  csrfToken,
  extensionServerPort,
  findLanguageServer,
  isAntigravityInstalled,
  isAntigravityServer,
  languageServerNames,
  parseLsofPorts,
  parsePsOutput,
  parseSsPorts,
  parseWindowsPorts,
  parseWindowsProcesses,
  type Run,
  type ServerEndpoint
} from './discovery'
import { callLanguageServer, probeLanguageServer } from './loopback'

const TOKEN = '0f8c2a1e-7b3d-4c55-9e10-2d6f4a8b9c01'
const WINDOWS_COMMAND = `C:\\Users\\ada\\AppData\\Local\\Programs\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe --enable_lsp --extension_server_port 52100 --csrf_token ${TOKEN} --app_data_dir antigravity`
const WINDSURF_COMMAND = `C:\\Users\\ada\\AppData\\Local\\Programs\\Windsurf\\resources\\app\\extensions\\windsurf\\bin\\language_server_windows_x64.exe --csrf_token 11111111-2222-3333-4444-555555555555 --app_data_dir windsurf`

describe('telling Antigravity apart', () => {
  it.each([
    ['its app data dir', 'language_server_macos_arm --app_data_dir antigravity --csrf_token x'],
    ['the IDE build', 'language_server_linux_x64 --app_data_dir antigravity-ide'],
    ['its install folder', WINDOWS_COMMAND],
    [
      'a path inside the app bundle',
      '/Applications/Antigravity.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm'
    ]
  ])('recognises %s', (_, commandLine) => {
    expect(isAntigravityServer(commandLine)).toBe(true)
  })

  it('leaves other editors on the same language server alone', () => {
    expect(isAntigravityServer(WINDSURF_COMMAND)).toBe(false)
    expect(isAntigravityServer('language_server_linux_x64 --app_data_dir antigravity-tools')).toBe(
      false
    )
  })

  it('reads the token and the extension server port', () => {
    expect(csrfToken(WINDOWS_COMMAND)).toBe(TOKEN)
    expect(csrfToken('--csrf_token="abc-123"')).toBe('abc-123')
    expect(csrfToken('no token here')).toBeNull()
    expect(extensionServerPort(WINDOWS_COMMAND)).toBe(52100)
    expect(extensionServerPort('--extension_server_port 99999')).toBeNull()
  })

  it('knows the executable on each platform', () => {
    expect(languageServerNames('win32')).toContain('language_server_windows_x64.exe')
    expect(languageServerNames('darwin')).toContain('language_server_macos_arm')
    expect(languageServerNames('linux')).toContain('language_server_linux_x64')
  })
})

describe('parsing process lists', () => {
  it('reads ps output, keeping only the language servers', () => {
    const stdout = [
      '  101 /usr/bin/zsh -l',
      `  202 /opt/Antigravity/resources/app/extensions/antigravity/bin/language_server_linux_x64 --csrf_token ${TOKEN}`,
      '  303 /usr/lib/firefox/firefox'
    ].join('\n')

    expect(parsePsOutput(stdout, languageServerNames('linux'))).toEqual([
      { pid: 202, commandLine: expect.stringContaining('language_server_linux_x64') as string }
    ])
  })

  it('reads one Windows process or several', () => {
    const one = JSON.stringify({ ProcessId: 4242, CommandLine: WINDOWS_COMMAND })
    const two = JSON.stringify([
      { ProcessId: 4242, CommandLine: WINDOWS_COMMAND },
      { ProcessId: 5151, CommandLine: WINDSURF_COMMAND }
    ])

    expect(parseWindowsProcesses(one)).toEqual([{ pid: 4242, commandLine: WINDOWS_COMMAND }])
    expect(parseWindowsProcesses(two).map((server) => server.pid)).toEqual([4242, 5151])
    expect(parseWindowsProcesses('')).toEqual([])
  })

  it('skips a process whose command line it may not read', () => {
    // Win32_Process leaves CommandLine empty for processes of other users.
    expect(parseWindowsProcesses(JSON.stringify({ ProcessId: 7, CommandLine: null }))).toEqual([])
  })
})

describe('parsing listening ports', () => {
  it('reads Get-NetTCPConnection output', () => {
    expect(parseWindowsPorts('52101')).toEqual([52101])
    expect(parseWindowsPorts('[52103,52101,52101]')).toEqual([52101, 52103])
    expect(parseWindowsPorts('')).toEqual([])
  })

  it('reads lsof output', () => {
    const stdout = [
      'COMMAND     PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
      'language_ 4242  ada   25u  IPv4 0x1234      0t0  TCP 127.0.0.1:52101 (LISTEN)',
      'language_ 4242  ada   26u  IPv6 0x5678      0t0  TCP [::1]:52102 (LISTEN)'
    ].join('\n')

    expect(parseLsofPorts(stdout)).toEqual([52101, 52102])
  })

  it('reads ss output for the right process only', () => {
    const stdout = [
      'LISTEN 0 4096 127.0.0.1:52101 0.0.0.0:* users:(("language_server",pid=4242,fd=25))',
      'LISTEN 0 4096 [::1]:52102 [::]:* users:(("language_server",pid=4242,fd=26))',
      'LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=900,fd=3))'
    ].join('\n')

    expect(parseSsPorts(stdout, 4242)).toEqual([52101, 52102])
  })
})

describe('findLanguageServer', () => {
  function fakeRun(outputs: Record<string, string>) {
    return vi.fn<Run>((file, args) => {
      const command = [file, ...args].join(' ')
      const key = Object.keys(outputs).find((part) => command.includes(part))
      return key === undefined
        ? Promise.reject(new Error('not found'))
        : Promise.resolve(outputs[key] ?? '')
    })
  }

  it('finds the port that answers, among the ones the process listens on', async () => {
    const run = fakeRun({
      Win32_Process: JSON.stringify([
        { ProcessId: 5151, CommandLine: WINDSURF_COMMAND },
        { ProcessId: 4242, CommandLine: WINDOWS_COMMAND }
      ]),
      '-OwningProcess 4242': '[52101,52102]'
    })
    const probe = vi.fn((endpoint: ServerEndpoint) => Promise.resolve(endpoint.port === 52102))

    const found = await findLanguageServer({ platform: 'win32', run, probe })

    expect(found).toEqual({ port: 52102, csrfToken: TOKEN, scheme: 'https' })
    // Windsurf's server was never asked anything.
    expect(run.mock.calls.some(([, args]) => args.join(' ').includes('5151'))).toBe(false)
  })

  it('falls back to the extension server over plain HTTP', async () => {
    const run = fakeRun({
      'ps -axww': `4242 ${WINDOWS_COMMAND.replace('language_server_windows_x64.exe', 'language_server_linux_x64')}`,
      'ss -tlnpH':
        'LISTEN 0 4096 127.0.0.1:52101 0.0.0.0:* users:(("language_server",pid=4242,fd=25))'
    })
    const probe = vi.fn((endpoint: ServerEndpoint) => Promise.resolve(endpoint.scheme === 'http'))

    const found = await findLanguageServer({ platform: 'linux', run, probe })

    expect(found).toEqual({ port: 52100, csrfToken: TOKEN, scheme: 'http' })
  })

  it('finds nothing when Antigravity is not running', async () => {
    const run = fakeRun({ 'ps -axww': '  101 /usr/bin/zsh -l' })

    expect(await findLanguageServer({ platform: 'darwin', run, probe: vi.fn() })).toBeNull()
  })

  it('finds nothing when the process has no token to ask with', async () => {
    const run = fakeRun({
      Win32_Process: JSON.stringify({
        ProcessId: 4242,
        CommandLine: WINDOWS_COMMAND.replace(`--csrf_token ${TOKEN}`, '')
      })
    })
    const probe = vi.fn()

    expect(await findLanguageServer({ platform: 'win32', run, probe })).toBeNull()
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('installation', () => {
  it('looks where each platform keeps Antigravity', () => {
    expect(antigravityInstallPaths('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\Users\\ada')).toContain(
      join('C:\\L', 'Programs', 'Antigravity')
    )
    expect(antigravityInstallPaths('darwin', {}, '/Users/ada')).toContain(
      '/Applications/Antigravity.app'
    )
    expect(antigravityInstallPaths('linux', {}, '/home/ada')).toContain(
      join('/home/ada', '.config', 'Antigravity')
    )
  })

  it('counts it as installed when any of those exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'antigravity-'))
    try {
      expect(await isAntigravityInstalled([join(dir, 'missing'), dir])).toBe(true)
      expect(await isAntigravityInstalled([join(dir, 'missing')])).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('calling the language server', () => {
  let server: Server | undefined

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
    server = undefined
  })

  async function listen(
    handle: (request: { url?: string; headers: Record<string, unknown>; body: string }) => {
      status: number
      body: string
    }
  ): Promise<number> {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        const answer = handle({ url: req.url, headers: req.headers, body })
        res.writeHead(answer.status, { 'Content-Type': 'application/json' }).end(answer.body)
      })
    })
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    return typeof address === 'object' && address ? address.port : 0
  }

  it('posts JSON to the method with the CSRF token', async () => {
    const seen: { url?: string; headers: Record<string, unknown>; body: string }[] = []
    const port = await listen((request) => {
      seen.push(request)
      return { status: 200, body: '{"ok":true}' }
    })

    const answer = await callLanguageServer(
      { port, csrfToken: TOKEN, scheme: 'http' },
      'GetUserStatus',
      { metadata: { ideName: 'antigravity' } }
    )

    expect(answer).toEqual({ status: 200, body: { ok: true } })
    expect(seen[0]?.url).toBe('/exa.language_server_pb.LanguageServerService/GetUserStatus')
    expect(seen[0]?.headers).toMatchObject({
      'x-codeium-csrf-token': TOKEN,
      'connect-protocol-version': '1',
      'content-type': 'application/json'
    })
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ metadata: { ideName: 'antigravity' } })
  })

  it('counts an endpoint as the language server only when it answers in JSON', async () => {
    const port = await listen(({ url }) =>
      url?.endsWith('/GetUnleashData') ? { status: 200, body: '{}' } : { status: 404, body: '' }
    )

    expect(await probeLanguageServer({ port, csrfToken: TOKEN, scheme: 'http' })).toBe(true)
  })

  it('does not count an endpoint that turns the token down', async () => {
    const port = await listen(() => ({ status: 401, body: '{"code":"unauthenticated"}' }))

    expect(await probeLanguageServer({ port, csrfToken: 'wrong', scheme: 'http' })).toBe(false)
  })

  it('does not count a port nobody listens on', async () => {
    expect(await probeLanguageServer({ port: 1, csrfToken: TOKEN, scheme: 'http' })).toBe(false)
  })
})
