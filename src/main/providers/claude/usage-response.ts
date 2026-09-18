import type { Credits, LimitWindow } from '@shared/usage'
import { createLimitWindow, toIsoOrNull } from '../normalize'
import { ProviderError } from '../types'

export interface ClaudeUsage {
  windows: LimitWindow[]
  credits: Credits | null
}

/** Maps `limits[].kind` onto our window keys. Unknown kinds are kept as they are. */
const LIMIT_KIND_KEYS = new Map([
  ['session', 'session'],
  ['weekly_all', 'weekly']
])

/** Older responses only have these fields, so they stay as a fallback. */
const LEGACY_FIELDS = [
  ['five_hour', 'session'],
  ['seven_day', 'weekly'],
  ['seven_day_opus', 'weekly_opus'],
  ['seven_day_sonnet', 'weekly_sonnet']
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unexpected(message: string): ProviderError {
  return new ProviderError('unexpected_response', `Unexpected usage response: ${message}`)
}

function fromLimits(raw: unknown): LimitWindow[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return []
    const { kind, percent, resets_at: resetsAt, scope } = entry
    if (typeof kind !== 'string' || typeof percent !== 'number') return []

    return [
      createLimitWindow({
        key: LIMIT_KIND_KEYS.get(kind) ?? kind,
        usedPercent: percent,
        resetsAt: toIsoOrNull(resetsAt),
        scope: typeof scope === 'string' ? scope : null
      })
    ]
  })
}

function fromLegacyFields(body: Record<string, unknown>): LimitWindow[] {
  return LEGACY_FIELDS.flatMap(([field, key]) => {
    const window = body[field]
    if (!isRecord(window) || typeof window['utilization'] !== 'number') return []

    // utilization is already a percent: 1 means 1%, not 100%.
    return [
      createLimitWindow({
        key,
        usedPercent: window['utilization'],
        resetsAt: toIsoOrNull(window['resets_at'])
      })
    ]
  })
}

function money(raw: unknown): number | null {
  if (!isRecord(raw)) return null
  const { amount_minor: minor, exponent } = raw
  if (typeof minor !== 'number' || typeof exponent !== 'number') return null
  return minor / 10 ** exponent
}

function creditsFromSpend(spend: unknown): Credits | null {
  if (!isRecord(spend)) return null

  const used = money(spend['used'])
  if (used === null) return null

  const currency = isRecord(spend['used']) ? spend['used']['currency'] : undefined
  return {
    used,
    limit: money(spend['limit']),
    currency: typeof currency === 'string' ? currency : 'USD',
    enabled: spend['enabled'] === true
  }
}

function creditsFromExtraUsage(extra: unknown): Credits | null {
  if (!isRecord(extra) || typeof extra['used_credits'] !== 'number') return null

  const places = typeof extra['decimal_places'] === 'number' ? extra['decimal_places'] : 2
  const scale = 10 ** places
  const limit = extra['monthly_limit']
  const currency = extra['currency']

  return {
    used: extra['used_credits'] / scale,
    limit: typeof limit === 'number' ? limit / scale : null,
    currency: typeof currency === 'string' ? currency : 'USD',
    enabled: extra['is_enabled'] === true
  }
}

/**
 * Parses GET /api/oauth/usage. The response also carries a number of codenamed
 * fields for unreleased features; only the documented shapes are read.
 */
export function parseClaudeUsage(body: unknown): ClaudeUsage {
  if (!isRecord(body)) throw unexpected('body is not an object')

  const fromList = fromLimits(body['limits'])
  const windows = fromList.length > 0 ? fromList : fromLegacyFields(body)
  if (windows.length === 0) throw unexpected('no usage windows found')

  return {
    windows,
    credits: creditsFromSpend(body['spend']) ?? creditsFromExtraUsage(body['extra_usage'])
  }
}
