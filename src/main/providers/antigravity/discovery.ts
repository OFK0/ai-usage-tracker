import { stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Antigravity has no public usage API. While it runs, its language server
 * answers on 127.0.0.1, guarded by a CSRF token it was started with. This finds
 * that server: the process, the token on its command line, and the port that
 * answers.
 */

export interface LanguageServer {
  pid: number
  commandLine: string
}

export interface ServerEndpoint {
  port: number
  csrfToken: string
  /** The language server itself speaks HTTPS; its extension server plain HTTP. */
  scheme: 'https' | 'http'
}

/** What the language server's executable is called on each platform. */
export function languageServerNames(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case 'win32':
      return ['language_server_windows_x64.exe', 'language_server_windows_arm.exe']
    case 'darwin':
      return ['language_server_macos', 'language_server_macos_arm']
    default:
      return ['language_server_linux_x64', 'language_server_linux_arm']
  }
}

/**
 * Other editors built on the same language server run one too; Antigravity's
 * says so on its command line, or runs from inside Antigravity's folders.
 */
export function isAntigravityServer(commandLine: string): boolean {
  return (
    /--app_data_dir[=\s]+"?antigravity(-ide)?"?(\s|$)/i.test(commandLine) ||
    /[\\/]antigravity[\\/]/i.test(commandLine)
  )
}

export function csrfToken(commandLine: string): string | null {
  return /--csrf_token[=\s]+"?([A-Za-z0-9-]+)/.exec(commandLine)?.[1] ?? null
}

export function extensionServerPort(commandLine: string): number | null {
  const port = Number(/--extension_server_port[=\s]+(\d+)/.exec(commandLine)?.[1])
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

/** Parses `ps -axww -o pid=,command=`, keeping the named executables. */
export function parsePsOutput(stdout: string, names: string[]): LanguageServer[] {
  return stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (!match?.[1] || !match[2]) return []
    const commandLine = match[2].trim()
    return names.some((name) => commandLine.includes(name))
      ? [{ pid: Number(match[1]), commandLine }]
      : []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout.trim())
  } catch {
    return null
  }
}

/** Parses Win32_Process rows from ConvertTo-Json: one object, or an array of them. */
export function parseWindowsProcesses(stdout: string): LanguageServer[] {
  const data = parseJson(stdout)
  const rows: unknown[] = Array.isArray(data) ? data : [data]
  return rows.flatMap((row) => {
    if (!isRecord(row)) return []
    const pid = row['ProcessId']
    const commandLine = row['CommandLine']
    return typeof pid === 'number' && typeof commandLine === 'string' ? [{ pid, commandLine }] : []
  })
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536
}

function uniqueSorted(ports: number[]): number[] {
  return [...new Set(ports)].sort((a, b) => a - b)
}

/** Parses LocalPort values from ConvertTo-Json: one number, or an array. */
export function parseWindowsPorts(stdout: string): number[] {
  const data = parseJson(stdout)
  return uniqueSorted((Array.isArray(data) ? data : [data]).filter(isPort))
}

/** Parses `lsof -nP -a -iTCP -sTCP:LISTEN -p <pid>`. */
export function parseLsofPorts(stdout: string): number[] {
  return uniqueSorted(
    [...stdout.matchAll(/TCP\s+\S*:(\d+)\s+\(LISTEN\)/g)].map((match) => Number(match[1]))
  )
}

/** Parses `ss -tlnpH`, keeping sockets owned by `pid`. */
export function parseSsPorts(stdout: string, pid: number): number[] {
  return uniqueSorted(
    stdout.split('\n').flatMap((line) => {
      if (!line.includes(`pid=${pid},`)) return []
      // State, Recv-Q, Send-Q, then the local address and port.
      const local = line.trim().split(/\s+/)[3] ?? ''
      const port = Number(local.slice(local.lastIndexOf(':') + 1))
      return isPort(port) ? [port] : []
    })
  )
}

/** Runs a program without a shell and returns what it printed. */
export type Run = (file: string, args: string[]) => Promise<string>

export interface DiscoveryDeps {
  platform: NodeJS.Platform
  run: Run
  /** Whether the language server answers at this endpoint. */
  probe: (endpoint: ServerEndpoint) => Promise<boolean>
}

async function listServers(deps: DiscoveryDeps): Promise<LanguageServer[]> {
  const names = languageServerNames(deps.platform)
  if (deps.platform === 'win32') {
    // The names are our own constants, so nothing from outside ends up in the command.
    const filter = names.map((name) => `Name='${name}'`).join(' OR ')
    const stdout = await deps.run('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`
    ])
    return parseWindowsProcesses(stdout)
  }
  return parsePsOutput(await deps.run('ps', ['-axww', '-o', 'pid=,command=']), names)
}

async function listeningPorts(deps: DiscoveryDeps, pid: number): Promise<number[]> {
  const orEmpty = (promise: Promise<string>): Promise<string> => promise.catch(() => '')

  if (deps.platform === 'win32') {
    return parseWindowsPorts(
      await orEmpty(
        deps.run('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | ConvertTo-Json -Compress`
        ])
      )
    )
  }
  const lsof = (): Promise<number[]> =>
    orEmpty(deps.run('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', String(pid)])).then(
      parseLsofPorts
    )
  if (deps.platform === 'darwin') return lsof()

  const viaSs = parseSsPorts(await orEmpty(deps.run('ss', ['-tlnpH'])), pid)
  return viaSs.length > 0 ? viaSs : lsof()
}

/** Finds the endpoint of a running Antigravity language server, or null when none answers. */
export async function findLanguageServer(deps: DiscoveryDeps): Promise<ServerEndpoint | null> {
  const servers = (await listServers(deps)).filter((server) =>
    isAntigravityServer(server.commandLine)
  )

  for (const server of servers) {
    const token = csrfToken(server.commandLine)
    if (!token) continue

    for (const port of await listeningPorts(deps, server.pid)) {
      const endpoint: ServerEndpoint = { port, csrfToken: token, scheme: 'https' }
      if (await deps.probe(endpoint)) return endpoint
    }

    // Some versions answer over plain HTTP on their extension server instead.
    const fallback = extensionServerPort(server.commandLine)
    if (fallback !== null) {
      const endpoint: ServerEndpoint = { port: fallback, csrfToken: token, scheme: 'http' }
      if (await deps.probe(endpoint)) return endpoint
    }
  }
  return null
}

/**
 * Where Antigravity leaves traces once installed, to tell "not running" from
 * "not installed". A guess by nature: an unusual install location reads as
 * not installed.
 */
export function antigravityInstallPaths(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string
): string[] {
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
    const roaming = env['APPDATA'] ?? join(home, 'AppData', 'Roaming')
    return [join(local, 'Programs', 'Antigravity'), join(roaming, 'Antigravity')]
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Antigravity.app',
      join(home, 'Applications', 'Antigravity.app'),
      join(home, 'Library', 'Application Support', 'Antigravity')
    ]
  }
  return [
    join(env['XDG_CONFIG_HOME'] || join(home, '.config'), 'Antigravity'),
    '/usr/share/antigravity',
    '/opt/Antigravity'
  ]
}

export async function isAntigravityInstalled(paths: string[]): Promise<boolean> {
  for (const path of paths) {
    if (
      await stat(path).then(
        () => true,
        () => false
      )
    )
      return true
  }
  return false
}
