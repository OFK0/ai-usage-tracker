// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCodexAuth } from './auth'
import { createSessionLog } from './session-log'

let home: string
let sessions: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-home-'))
  sessions = join(home, 'sessions')
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

function tokenCount(timestamp: string, used: number): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: { primary: { used_percent: used }, secondary: { used_percent: used * 2 } }
    }
  })
}

async function writeRollout(
  day: string,
  name: string,
  lines: string[],
  modified: Date
): Promise<string> {
  const dir = join(sessions, ...day.split('/'))
  await mkdir(dir, { recursive: true })
  const path = join(dir, `rollout-${name}.jsonl`)
  await writeFile(path, lines.join('\n') + '\n')
  await utimes(path, modified, modified)
  return path
}

describe('createSessionLog', () => {
  it('finds nothing when Codex has no sessions yet', async () => {
    expect(await createSessionLog(sessions).latest()).toBeNull()
  })

  it('reads the file written last, even from an earlier day', async () => {
    // Started yesterday and still running today.
    await writeRollout(
      '2025/09/18',
      'long',
      [tokenCount('2025-09-19T09:00:00Z', 40)],
      new Date('2025-09-19T09:00:00Z')
    )
    await writeRollout(
      '2025/09/19',
      'short',
      [tokenCount('2025-09-19T07:00:00Z', 10)],
      new Date('2025-09-19T07:00:00Z')
    )

    const found = await createSessionLog(sessions).latest()

    expect(found?.windows[0]?.usedPercent).toBe(40)
  })

  it('moves on to an older file when the newest has no counts yet', async () => {
    await writeRollout(
      '2025/09/19',
      'a',
      [tokenCount('2025-09-19T07:00:00Z', 10)],
      new Date('2025-09-19T07:00:00Z')
    )
    await writeRollout(
      '2025/09/19',
      'b',
      ['{"type":"session_meta","payload":{}}'],
      new Date('2025-09-19T08:00:00Z')
    )

    expect((await createSessionLog(sessions).latest())?.windows[0]?.usedPercent).toBe(10)
  })

  it('reads only the end of a long session', async () => {
    const filler = JSON.stringify({ type: 'response_item', payload: { text: 'x'.repeat(1000) } })
    const lines = [
      tokenCount('2025-09-19T06:00:00Z', 5),
      ...Array.from({ length: 800 }, () => filler),
      tokenCount('2025-09-19T09:00:00Z', 55)
    ]
    await writeRollout('2025/09/19', 'big', lines, new Date('2025-09-19T09:00:00Z'))

    expect((await createSessionLog(sessions).latest())?.windows[0]?.usedPercent).toBe(55)
  })

  it('reads the file again once Codex has written to it', async () => {
    const path = await writeRollout(
      '2025/09/19',
      'live',
      [tokenCount('2025-09-19T07:00:00Z', 10)],
      new Date('2025-09-19T07:00:00Z')
    )
    const log = createSessionLog(sessions)
    expect((await log.latest())?.windows[0]?.usedPercent).toBe(10)

    await writeFile(path, (await readFile(path, 'utf8')) + tokenCount('2025-09-19T08:00:00Z', 20))
    await utimes(path, new Date('2025-09-19T08:00:00Z'), new Date('2025-09-19T08:00:00Z'))

    expect((await log.latest())?.windows[0]?.usedPercent).toBe(20)
  })
})

describe('readCodexAuth', () => {
  it('reports not installed without a Codex folder', async () => {
    expect(await readCodexAuth(join(home, 'missing'))).toEqual({ missing: 'not_installed' })
  })

  it('reports signed out when the folder has no auth.json', async () => {
    expect(await readCodexAuth(home)).toEqual({ missing: 'signed_out' })
  })

  it('reads the sign-in from auth.json', async () => {
    await writeFile(
      join(home, 'auth.json'),
      JSON.stringify({ tokens: { access_token: 'eyJ.a', account_id: 'acc' } })
    )

    expect(await readCodexAuth(home)).toEqual({ accessToken: 'eyJ.a', accountId: 'acc' })
  })

  it('reports an API key sign-in as such', async () => {
    await writeFile(join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-x' }))

    expect(await readCodexAuth(home)).toEqual({ missing: 'api_key' })
  })
})
