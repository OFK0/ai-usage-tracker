import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { TokenCounts } from '@shared/usage'

export interface UsageEntry {
  /** message id and request id; the same message is written on several lines. */
  key: string
  timestamp: number
  tokens: TokenCounts
}

export interface SessionLog {
  /** Entries from the lookback period, oldest first. */
  collect(now: number): Promise<UsageEntry[]>
  /** Forgets everything read so far; the next collect starts from scratch. */
  clear(): void
}

/** Two session windows' worth, enough to tell where the current window began. */
export const LOOKBACK_MS = 24 * 60 * 60_000
const CHUNK_BYTES = 1024 * 1024
const NEWLINE = 0x0a

interface FileState {
  offset: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function parseUsageLine(line: string): UsageEntry | null {
  // Most lines are prompts, tool output and the like. Skip them before paying
  // for a JSON.parse, which matters on a log that runs to tens of megabytes.
  if (!line.includes('"usage"')) return null

  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }

  if (!isRecord(entry) || entry['type'] !== 'assistant') return null
  const message = entry['message']
  if (!isRecord(message) || !isRecord(message['usage'])) return null
  // Placeholders Claude Code writes for errors; they carry no real usage.
  if (message['model'] === '<synthetic>') return null

  const id = message['id']
  const timestamp = Date.parse(String(entry['timestamp']))
  if (typeof id !== 'string' || Number.isNaN(timestamp)) return null

  const requestId = typeof entry['requestId'] === 'string' ? entry['requestId'] : ''
  const usage = message['usage']

  return {
    key: `${id}:${requestId}`,
    timestamp,
    tokens: {
      input: count(usage['input_tokens']),
      output: count(usage['output_tokens']),
      cacheCreation: count(usage['cache_creation_input_tokens']),
      cacheRead: count(usage['cache_read_input_tokens'])
    }
  }
}

async function findLogFiles(dir: string): Promise<string[]> {
  try {
    // Subagent transcripts sit in nested folders and count against limits too.
    const names = await readdir(dir, { recursive: true })
    return names.filter((name) => name.endsWith('.jsonl')).map((name) => join(dir, name))
  } catch {
    return []
  }
}

/**
 * Reads Claude Code's session logs incrementally. The files only ever grow, so
 * each one is read from where the last pass stopped instead of from the start.
 */
export function createSessionLog(projectsDir: string): SessionLog {
  const files = new Map<string, FileState>()
  const entries = new Map<string, UsageEntry>()

  function add(line: string, since: number): void {
    const entry = parseUsageLine(line)
    if (!entry || entry.timestamp < since) return
    // Keep the first sighting: that's when the message actually happened.
    if (!entries.has(entry.key)) entries.set(entry.key, entry)
  }

  async function readAppended(path: string, size: number, since: number): Promise<void> {
    const state = files.get(path) ?? { offset: 0 }
    // A file shorter than where we stopped has been rewritten. Start over; the
    // de-duplication keeps already counted messages from being counted twice.
    if (size < state.offset) state.offset = 0
    if (size === state.offset) return

    const handle = await open(path, 'r')
    try {
      let carry = Buffer.alloc(0)
      let position = state.offset

      while (position < size) {
        const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, size - position))
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
        if (bytesRead === 0) break
        position += bytesRead

        const buffer = Buffer.concat([carry, chunk.subarray(0, bytesRead)])
        const lastNewline = buffer.lastIndexOf(NEWLINE)
        if (lastNewline === -1) {
          carry = buffer
          continue
        }

        // Splitting on the newline byte never cuts a multi-byte character in
        // half, because 0x0A can't appear inside one.
        for (const line of buffer.subarray(0, lastNewline).toString('utf8').split('\n')) {
          add(line, since)
        }
        carry = buffer.subarray(lastNewline + 1)
      }

      // Whatever follows the last newline is a line still being written. Leave
      // it for the next pass rather than parse half of it.
      state.offset = position - carry.length
      files.set(path, state)
    } finally {
      await handle.close()
    }
  }

  return {
    clear() {
      files.clear()
      entries.clear()
    },

    async collect(now) {
      const since = now - LOOKBACK_MS

      for (const path of await findLogFiles(projectsDir)) {
        try {
          const info = await stat(path)
          // Untouched for a day means nothing in it can be recent.
          if (info.mtimeMs < since) continue
          await readAppended(path, info.size, since)
        } catch {
          // A file can vanish or be locked between listing and reading. It is
          // picked up again on the next pass if it's still there.
        }
      }

      for (const [key, entry] of entries) {
        if (entry.timestamp < since) entries.delete(key)
      }

      return [...entries.values()].sort((a, b) => a.timestamp - b.timestamp)
    }
  }
}
