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

/** Groups the card has names for, which a limit on some models is shown under. */
const GROUP_KEYS = new Map([
  ['session', 'session'],
  ['weekly', 'weekly']
])

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The models a limit covers, when it doesn't cover them all. Fable, for one, has
 * a weekly limit of its own, and the server names it with a display name ("Fable"),
 * either as the scope itself or on a scope object or the entry.
 */
function scopeLabel(entry: Record<string, unknown>): string | null {
  const scope = entry['scope']
  if (isRecord(scope)) {
    return text(scope['display_name']) ?? text(scope['name']) ?? text(scope['model'])
  }
  return text(scope) ?? text(entry['display_name'])
}

function fromLimits(raw: unknown): LimitWindow[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return []
    const { kind, group, percent, resets_at: resetsAt } = entry
    if (typeof kind !== 'string' || typeof percent !== 'number') return []

    const scope = scopeLabel(entry)
    // A limit on one model, say a weekly one on Fable, reads as "Weekly · Fable".
    // Without a model it keeps its own kind, so it can't pass for the main one.
    const groupKey = scope && typeof group === 'string' ? GROUP_KEYS.get(group) : undefined

    return [
      createLimitWindow({
        key: LIMIT_KIND_KEYS.get(kind) ?? groupKey ?? kind,
        usedPercent: percent,
        resetsAt: toIsoOrNull(resetsAt),
        scope
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
