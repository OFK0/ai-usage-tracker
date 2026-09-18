import type { LocalActivity, TokenCounts } from '@shared/usage'
import type { UsageEntry } from './session-log'

export const SESSION_MS = 5 * 60 * 60_000
const HOUR = 60 * 60_000

function sumTokens(entries: UsageEntry[]): TokenCounts {
  return entries.reduce<TokenCounts>(
    (total, { tokens }) => ({
      input: total.input + tokens.input,
      output: total.output + tokens.output,
      cacheCreation: total.cacheCreation + tokens.cacheCreation,
      cacheRead: total.cacheRead + tokens.cacheRead
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
  )
}

/**
 * Estimates the session window in progress from message times alone: a window
 * opens with the first message after the previous one closed, rounded down to
 * the hour, and lasts five hours. Returns null when no window is open.
 */
export function estimateCurrentBlock(
  entries: UsageEntry[],
  now: number
): { start: number; end: number } | null {
  let block: { start: number; end: number } | null = null

  for (const { timestamp } of entries) {
    if (!block || timestamp >= block.end) {
      const start = Math.floor(timestamp / HOUR) * HOUR
      block = { start, end: start + SESSION_MS }
    }
  }

  return block && block.end > now ? block : null
}

/**
 * Summarises local activity for the session window in progress.
 *
 * `knownResetAt` is the reset time from the last successful API read. While it
 * is still ahead, the window is known exactly. Once it has passed it still helps:
 * nothing before it can belong to the next window, so the estimate starts after it.
 */
export function summarizeActivity(
  entries: UsageEntry[],
  now: number,
  knownResetAt: number | null
): LocalActivity {
  const last = entries[entries.length - 1]
  const lastActivityAt = last ? new Date(last.timestamp).toISOString() : null

  let window: { start: number; end: number; exact: boolean } | null
  if (knownResetAt !== null && knownResetAt > now) {
    window = { start: knownResetAt - SESSION_MS, end: knownResetAt, exact: true }
  } else {
    const after =
      knownResetAt === null ? entries : entries.filter((e) => e.timestamp >= knownResetAt)
    const estimate = estimateCurrentBlock(after, now)
    window = estimate && { ...estimate, exact: false }
  }

  if (!window) return { block: null, lastActivityAt }

  const { start, end, exact } = window
  const inWindow = entries.filter((e) => e.timestamp >= start && e.timestamp < end)

  return {
    block: {
      startedAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      exact,
      messages: inWindow.length,
      tokens: sumTokens(inWindow)
    },
    lastActivityAt
  }
}
