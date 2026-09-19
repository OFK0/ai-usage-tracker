import { i18n, uiLocale } from '@/i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact duration for countdowns, such as `45m`, `2h 40m` and `3d 4h` in English. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return i18n.t('duration.underMinute')

  if (ms < HOUR) return i18n.t('duration.m', { m: Math.floor(ms / MINUTE) })

  if (ms < DAY) {
    const h = Math.floor(ms / HOUR)
    const m = Math.floor((ms % HOUR) / MINUTE)
    return m > 0 ? i18n.t('duration.hm', { h, m }) : i18n.t('duration.h', { h })
  }

  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  return h > 0 ? i18n.t('duration.dh', { d, h }) : i18n.t('duration.d', { d })
}

/** In the UI language unless a locale is given. */
export function formatMoney(amount: number, currency: string, locale = uiLocale()): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  } catch {
    // An unknown currency code makes Intl throw; the number alone still helps.
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** A whole percentage, where the sign goes in the language: `24%`, `%24`. */
export function formatPercent(value: number, locale = uiLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    value / 100
  )
}

export function formatNumber(value: number, locale = uiLocale()): string {
  return new Intl.NumberFormat(locale).format(value)
}
