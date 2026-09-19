import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LimitWindow } from '@shared/usage'
import { codexPlanLabel, codexWindows, isRecord } from './rate-limits'

/** The rate limits Codex last recorded, and when. */
export interface LoggedRateLimits {
  observedAt: number
  planLabel: string | null
  windows: LimitWindow[]
}

/**
 * One line of a rollout file. Codex writes a `token_count` event after every
 * turn, carrying the limits the server just reported:
 *
 *   {"timestamp":"…","type":"event_msg","payload":{"type":"token_count","rate_limits":{…}}}
 *
 * Current versions nest `primary` and `secondary` windows; early ones had flat
 * `primary_used_percent` fields with no reset time.
 */
export function parseTokenCountLine(line: string): LoggedRateLimits | null {
  // Most lines are something else; skip them before paying for JSON.parse.
  if (!line.includes('token_count')) return null

  let entry: unknown
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(entry) || !isRecord(entry['payload'])) return null

  const payload = entry['payload']
  const limits = payload['rate_limits']
  if (payload['type'] !== 'token_count' || !isRecord(limits)) return null

  const observedAt = typeof entry['timestamp'] === 'string' ? Date.parse(entry['timestamp']) : NaN
  if (Number.isNaN(observedAt)) return null

  const windows =
    'primary_used_percent' in limits
      ? codexWindows(
          {
            used_percent: limits['primary_used_percent'],
            window_minutes: limits['primary_window_minutes']
          },
          {
            used_percent: limits['secondary_used_percent'],
            window_minutes: limits['secondary_window_minutes']
          },
          observedAt
        )
      : codexWindows(limits['primary'], limits['secondary'], observedAt)

  if (windows.length === 0) return null
  return { observedAt, planLabel: codexPlanLabel(limits['plan_type']), windows }
}

/** The last `token_count` in some rollout text, reading from the end. */
export function latestInText(text: string): LoggedRateLimits | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const found = parseTokenCountLine(lines[i] ?? '')
    if (found) return found
  }
  return null
}

/** A turn logs one every few lines, so the end of a file is where to look. */
const TAIL_BYTES = 512 * 1024
/** How many of the newest day folders to look through. */
const RECENT_DAYS = 2

async function names(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort().reverse()
  } catch {
    return []
  }
}

/** Rollout files in the newest day folders, most recently written first. */
async function recentRollouts(sessionsDir: string): Promise<string[]> {
  const days: string[] = []
  // sessions/YYYY/MM/DD/rollout-….jsonl
  outer: for (const year of await names(sessionsDir)) {
    for (const month of await names(join(sessionsDir, year))) {
      for (const day of await names(join(sessionsDir, year, month))) {
        days.push(join(sessionsDir, year, month, day))
        if (days.length === RECENT_DAYS) break outer
      }
    }
  }

  const files: { path: string; mtimeMs: number }[] = []
  for (const day of days) {
    for (const name of await names(day)) {
      if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
      const path = join(day, name)
      try {
        files.push({ path, mtimeMs: (await stat(path)).mtimeMs })
      } catch {
        // Gone since the listing.
      }
    }
  }
  // A session started yesterday may be the one still being written today.
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((file) => file.path)
}

async function readTail(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - TAIL_BYTES)
    const buffer = Buffer.alloc(size - start)
    await file.read(buffer, 0, buffer.length, start)
    const text = buffer.toString('utf8')
    // A tail that starts mid-file starts mid-line; that first line is cut off.
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } finally {
    await file.close()
  }
}

export interface CodexSessionLog {
  latest(): Promise<LoggedRateLimits | null>
  /** Forgets what was read, for when the user disconnects Codex. */
  clear(): void
}

export function createSessionLog(sessionsDir: string): CodexSessionLog {
  // The newest file only changes when Codex runs, so its result is kept until it does.
  let cache: { path: string; size: number; mtimeMs: number; found: LoggedRateLimits } | null = null

  return {
    async latest() {
      for (const path of await recentRollouts(sessionsDir)) {
        const info = await stat(path).catch(() => null)
        if (!info) continue
        if (cache?.path === path && cache.size === info.size && cache.mtimeMs === info.mtimeMs) {
          return cache.found
        }

        const found = latestInText(await readTail(path).catch(() => ''))
        if (found) {
          cache = { path, size: info.size, mtimeMs: info.mtimeMs, found }
          return found
        }
      }
      return null
    },

    clear() {
      cache = null
    }
  }
}
