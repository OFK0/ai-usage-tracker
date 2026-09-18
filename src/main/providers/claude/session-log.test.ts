// @vitest-environment node
import { appendFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSessionLog, LOOKBACK_MS, parseUsageLine } from './session-log'

const NOW = Date.parse('2026-09-18T12:00:00Z')

function line(id: string, minutesAgo: number, output = 100, extra: object = {}): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: `req_${id}`,
    timestamp: new Date(NOW - minutesAgo * 60_000).toISOString(),
    message: {
      id: `msg_${id}`,
      model: 'claude-opus-5',
      usage: {
        input_tokens: 2,
        output_tokens: output,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 500
      }
    },
    ...extra
  })
}

describe('parseUsageLine', () => {
  it('reads the token counts of an assistant message', () => {
    expect(parseUsageLine(line('a', 5))).toEqual({
      key: 'msg_a:req_a',
      timestamp: NOW - 5 * 60_000,
      tokens: { input: 2, output: 100, cacheCreation: 10, cacheRead: 500 }
    })
  })

  it.each([
    ['a user prompt', JSON.stringify({ type: 'user', message: { content: 'hi' } })],
    ['a line that is not JSON', '{"usage": oops'],
    [
      'a synthetic error placeholder',
      line('s', 1, 0, { message: { id: 'x', model: '<synthetic>', usage: {} } })
    ],
    ['an entry without a timestamp', line('t', 1, 1, { timestamp: 'never' })]
  ])('ignores %s', (_, raw) => {
    expect(parseUsageLine(raw)).toBeNull()
  })
})

describe('createSessionLog', () => {
  let dir: string
  let project: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'claude-projects-'))
    project = join(dir, 'C--work-app')
    await mkdir(project)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('counts a message once even though it is written on several lines', async () => {
    await writeFile(
      join(project, 'session.jsonl'),
      [line('a', 30), line('a', 30), line('a', 30), line('b', 10), ''].join('\n')
    )

    const entries = await createSessionLog(dir).collect(NOW)

    expect(entries.map((e) => e.key)).toEqual(['msg_a:req_a', 'msg_b:req_b'])
  })

  it('picks up only what was appended since the last pass', async () => {
    const file = join(project, 'session.jsonl')
    await writeFile(file, `${line('a', 30)}\n`)
    const log = createSessionLog(dir)
    await log.collect(NOW)

    await appendFile(file, `${line('b', 5)}\n`)

    expect((await log.collect(NOW)).map((e) => e.key)).toEqual(['msg_a:req_a', 'msg_b:req_b'])
  })

  it('leaves a half-written last line for the next pass', async () => {
    const file = join(project, 'session.jsonl')
    const full = line('b', 5)
    await writeFile(file, `${line('a', 30)}\n${full.slice(0, 40)}`)
    const log = createSessionLog(dir)

    expect(await log.collect(NOW)).toHaveLength(1)

    await appendFile(file, `${full.slice(40)}\n`)

    expect(await log.collect(NOW)).toHaveLength(2)
  })

  it('reads subagent transcripts in nested folders', async () => {
    const nested = join(project, 'session-id', 'subagents')
    await mkdir(nested, { recursive: true })
    await writeFile(join(nested, 'agent-1.jsonl'), `${line('sub', 3)}\n`)

    expect((await createSessionLog(dir).collect(NOW)).map((e) => e.key)).toEqual([
      'msg_sub:req_sub'
    ])
  })

  it('skips files nobody has touched within the lookback period', async () => {
    const file = join(project, 'old.jsonl')
    await writeFile(file, `${line('old', 5)}\n`)
    const longAgo = new Date(NOW - LOOKBACK_MS - 60_000)
    await utimes(file, longAgo, longAgo)

    expect(await createSessionLog(dir).collect(NOW)).toEqual([])
  })

  it('drops entries older than the lookback period', async () => {
    await writeFile(
      join(project, 'session.jsonl'),
      `${line('ancient', LOOKBACK_MS / 60_000 + 5)}\n${line('recent', 5)}\n`
    )

    expect((await createSessionLog(dir).collect(NOW)).map((e) => e.key)).toEqual([
      'msg_recent:req_recent'
    ])
  })

  it('starts over when a file has been rewritten shorter', async () => {
    const file = join(project, 'session.jsonl')
    await writeFile(file, `${line('a', 30)}\n${line('b', 20)}\n`)
    const log = createSessionLog(dir)
    await log.collect(NOW)

    await writeFile(file, `${line('c', 1)}\n`)

    expect((await log.collect(NOW)).map((e) => e.key)).toContain('msg_c:req_c')
  })

  it('returns nothing when there is no projects folder', async () => {
    expect(await createSessionLog(join(dir, 'missing')).collect(NOW)).toEqual([])
  })
})
