import type { LimitWindow } from '@shared/usage'
import { createLimitWindow, toIsoOrNull, usedFromRemaining } from '../normalize'
import { ProviderError } from '../types'

export interface CopilotUsage {
  planLabel: string | null
  windows: LimitWindow[]
}

/** The quotas worth showing, in the order they're shown. Others follow as they come. */
const KNOWN_QUOTAS = ['chat', 'completions', 'premium_interactions']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The plan is in `access_type_sku`; `copilot_plan` only says "individual" for
 * Free and Pro alike. The SKU names aren't documented, so this goes by the words
 * in them and falls back to `copilot_plan` for the business plans.
 */
export function copilotPlanLabel(sku: unknown, plan: unknown): string | null {
  const name = typeof sku === 'string' ? sku.toLowerCase() : ''
  if (name.includes('free')) return 'Free'
  if (name.includes('pro_plus') || name.includes('proplus')) return 'Pro+'
  if (name.includes('pro')) return 'Pro'

  if (typeof plan !== 'string' || plan === '') return null
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

function toWindow(key: string, snapshot: unknown, resetsAt: string | null): LimitWindow | null {
  if (!isRecord(snapshot)) return null

  const unlimited = snapshot['unlimited'] === true
  const entitlement = count(snapshot['entitlement'])
  const remaining = count(snapshot['remaining'])
  const percentRemaining = count(snapshot['percent_remaining'])

  // A quota the plan doesn't include comes back as has_quota false with 0 of 0
  // and 0% remaining. Taken at face value that reads as used up.
  const applicable = snapshot['has_quota'] !== false && (unlimited || (entitlement ?? 0) > 0)

  const used =
    entitlement !== null && remaining !== null
      ? Math.max(entitlement - remaining, 0)
      : count(snapshot['credits_used'])

  return createLimitWindow({
    key,
    // Copilot reports what's left, not what's used.
    usedPercent: percentRemaining === null ? 0 : usedFromRemaining(percentRemaining),
    used,
    limit: entitlement,
    resetsAt,
    applicable,
    unlimited
  })
}

/** Parses GET https://api.github.com/copilot_internal/user. */
export function parseCopilotUser(body: unknown): CopilotUsage {
  if (!isRecord(body) || !isRecord(body['quota_snapshots'])) {
    throw new ProviderError(
      'unexpected_response',
      'Unexpected Copilot response: no quota snapshots'
    )
  }

  const snapshots = body['quota_snapshots']
  // Quotas renew on a calendar date, unlike the rolling windows of the others.
  const resetsAt =
    toIsoOrNull(body['quota_reset_date_utc']) ?? toIsoOrNull(body['quota_reset_date'])

  const keys = [
    ...KNOWN_QUOTAS.filter((key) => key in snapshots),
    ...Object.keys(snapshots).filter((key) => !KNOWN_QUOTAS.includes(key))
  ]
  const windows = keys.flatMap((key) => toWindow(key, snapshots[key], resetsAt) ?? [])

  if (windows.length === 0) {
    throw new ProviderError('unexpected_response', 'Unexpected Copilot response: empty quotas')
  }

  return {
    planLabel: copilotPlanLabel(body['access_type_sku'], body['copilot_plan']),
    windows
  }
}
