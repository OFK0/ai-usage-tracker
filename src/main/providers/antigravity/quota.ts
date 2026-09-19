import type { LimitWindow } from '@shared/usage'
import { createLimitWindow, toIsoOrNull, usedFromRemaining } from '../normalize'
import { ProviderError } from '../types'

export interface AntigravityUsage {
  planLabel: string | null
  windows: LimitWindow[]
}

/** What each call sends: which client is asking, as Antigravity's own extension says. */
export const REQUEST_METADATA = {
  metadata: {
    ideName: 'antigravity',
    extensionName: 'antigravity',
    ideVersion: 'unknown',
    locale: 'en'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The share of a quota left, 0 to 1, from either `{ remainingFraction }` or the
 * oneof shape `{ case: 'remainingFraction', value }`. Null when it isn't said:
 * the server's protobuf JSON leaves out zero values, so a missing fraction is
 * ambiguous and is treated as unknown rather than as used up.
 */
function remainingFraction(raw: unknown): number | null {
  if (!isRecord(raw)) return null
  const value =
    raw['case'] === 'remainingFraction' ? raw['value'] : (raw['remainingFraction'] ?? null)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A reset time as ISO text, or as Unix seconds in some versions. */
function resetTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString()
  }
  return toIsoOrNull(value)
}

/** Which of the card's windows a bucket is: its 5 hour limit or its weekly one. */
function bucketKey(bucket: Record<string, unknown>): string | null {
  const name =
    `${text(bucket['bucketId']) ?? ''} ${text(bucket['displayName']) ?? ''}`.toLowerCase()
  if (/week/.test(name)) return 'weekly'
  if (/\b5h\b|5-hour|five[ -]hour|session/.test(name)) return 'session'
  return null
}

const WINDOW_ORDER = ['session', 'weekly']

/**
 * Parses RetrieveUserQuotaSummary (Antigravity 2.x): model groups, each with a
 * 5 hour and a weekly limit. The group names the models it covers.
 */
export function parseQuotaSummary(body: unknown): LimitWindow[] {
  const root = isRecord(body) && isRecord(body['response']) ? body['response'] : body
  if (!isRecord(root) || !Array.isArray(root['groups'])) return []

  return root['groups'].flatMap((group: unknown) => {
    if (!isRecord(group) || !Array.isArray(group['buckets'])) return []
    const scope = text(group['displayName'])

    const windows = group['buckets'].flatMap((bucket: unknown) => {
      if (!isRecord(bucket) || bucket['disabled'] === true) return []
      const key = bucketKey(bucket)
      const fraction = remainingFraction(bucket['remaining'])
      if (key === null || fraction === null) return []

      return [
        createLimitWindow({
          key,
          scope,
          usedPercent: usedFromRemaining(fraction * 100),
          resetsAt: resetTime(bucket['resetTime'])
        })
      ]
    })
    // The short window first, as for the other providers.
    return windows.sort((a, b) => WINDOW_ORDER.indexOf(a.key) - WINDOW_ORDER.indexOf(b.key))
  })
}

/** The pools models share their quotas in, named as the quota summary names them. */
function modelPool(label: string): string {
  if (/claude|gpt/i.test(label)) return 'Claude and GPT models'
  if (/gemini/i.test(label)) return 'Gemini Models'
  return label
}

/**
 * Parses GetUserStatus, which older versions answer instead: the plan, and a
 * 5 hour quota per model. Models in one pool share a quota, so each pool is
 * shown once, by its most used model.
 */
export function parseUserStatus(body: unknown): AntigravityUsage {
  const status = isRecord(body) ? body['userStatus'] : null
  if (!isRecord(status)) return { planLabel: null, windows: [] }

  const planStatus = status['planStatus']
  const planInfo = isRecord(planStatus) ? planStatus['planInfo'] : null
  const planLabel = isRecord(planInfo) ? text(planInfo['planName']) : null

  const data = status['cascadeModelConfigData']
  const models =
    isRecord(data) && Array.isArray(data['clientModelConfigs']) ? data['clientModelConfigs'] : []

  const pools = new Map<string, LimitWindow>()
  for (const model of models) {
    if (!isRecord(model)) continue
    const quota = model['quotaInfo'] ?? model['quota_info']
    const fraction = remainingFraction(quota)
    const label = text(model['label'])
    if (!isRecord(quota) || fraction === null || label === null) continue

    const scope = modelPool(label)
    const window = createLimitWindow({
      key: 'session',
      scope,
      usedPercent: usedFromRemaining(fraction * 100),
      resetsAt: resetTime(quota['resetTime'] ?? quota['reset_time'])
    })
    const known = pools.get(scope)
    if (!known || window.usedPercent > known.usedPercent) pools.set(scope, window)
  }

  return { planLabel, windows: [...pools.values()] }
}

/** Calls one method of the language server. */
export type CallServer = (
  method: string,
  payload: object
) => Promise<{ status: number; body: unknown }>

/** The server turned the token down or stopped answering: Antigravity has likely restarted. */
export class ServerGoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerGoneError'
  }
}

/**
 * Reads the quotas, from the summary where there is one and the per-model
 * status otherwise, and the plan from the status either way.
 */
export async function readAntigravityQuota(call: CallServer): Promise<AntigravityUsage> {
  const [summary, status] = await Promise.allSettled([
    call('RetrieveUserQuotaSummary', REQUEST_METADATA),
    call('GetUserStatus', REQUEST_METADATA)
  ])

  const answers = [summary, status]
  const refused = answers.some(
    (answer) =>
      answer.status === 'fulfilled' && (answer.value.status === 401 || answer.value.status === 403)
  )
  if (refused || answers.every((answer) => answer.status === 'rejected')) {
    throw new ServerGoneError('Antigravity’s language server stopped answering')
  }

  const ok = (answer: (typeof answers)[number]): unknown =>
    answer.status === 'fulfilled' && answer.value.status === 200 ? answer.value.body : null

  const fromStatus = parseUserStatus(ok(status))
  const fromSummary = parseQuotaSummary(ok(summary))
  const windows = fromSummary.length > 0 ? fromSummary : fromStatus.windows

  if (windows.length === 0) {
    throw new ProviderError('unexpected_response', 'Antigravity reported no quotas')
  }
  return { planLabel: fromStatus.planLabel, windows }
}
