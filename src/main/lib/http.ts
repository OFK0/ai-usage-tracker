/**
 * Reads a Retry-After header, which is either a number of seconds or an HTTP
 * date. Returns how long to wait in milliseconds, or null when it's absent or
 * unreadable.
 */
export function parseRetryAfter(header: string | null, now: number): number | null {
  const value = header?.trim()
  if (!value) return null

  // Anything numeric is seconds and nothing else. Date.parse would otherwise
  // happily read "-5" as a date in the year -5.
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const seconds = Number(value)
    return seconds >= 0 ? seconds * 1000 : null
  }

  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - now)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
