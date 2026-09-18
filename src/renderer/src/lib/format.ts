const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact duration for countdowns: `45m`, `2h 40m`, `3d 4h`. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return '<1m'

  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`

  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR)
    const minutes = Math.floor((ms % HOUR) / MINUTE)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

/** Uses the system locale unless one is given. */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  } catch {
    // An unknown currency code makes Intl throw; the number alone still helps.
    return `${amount.toFixed(2)} ${currency}`
  }
}
