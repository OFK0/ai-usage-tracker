import type { ApiSpend } from '@shared/usage'
import { errorMessage } from '../../lib/http'

export const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report'
/** Cost reports lag behind real usage by a while, so asking often gains nothing. */
export const SPEND_CACHE_MS = 15 * 60_000
const MAX_PAGES = 3

export interface CostBucket {
  startingAt: number
  currency: string
  amount: number
}

interface CostPage {
  buckets: CostBucket[]
  nextPage: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses one page of GET /v1/organizations/cost_report.
 *
 * `amount` is a decimal string in the lowest currency unit: "123.45" in USD is
 * $1.23, not $123.45. Reading it as dollars would inflate spend a hundredfold.
 */
export function parseCostReport(body: unknown): CostPage {
  if (!isRecord(body) || !Array.isArray(body['data'])) {
    throw new Error('Unexpected cost report response')
  }

  const buckets = body['data'].flatMap((bucket: unknown) => {
    if (!isRecord(bucket) || !Array.isArray(bucket['results'])) return []
    const startingAt = Date.parse(String(bucket['starting_at']))
    if (Number.isNaN(startingAt)) return []

    return bucket['results'].flatMap((result: unknown) => {
      if (!isRecord(result)) return []
      const minor = Number.parseFloat(String(result['amount']))
      if (!Number.isFinite(minor)) return []
      const currency = typeof result['currency'] === 'string' ? result['currency'] : 'USD'
      // The API only reports USD, whose lowest unit is the cent.
      return [{ startingAt, currency, amount: minor / 100 }]
    })
  })

  const nextPage = body['has_more'] === true && typeof body['next_page'] === 'string'
  return { buckets, nextPage: nextPage ? (body['next_page'] as string) : null }
}

function startOfUtcDay(time: number): number {
  const date = new Date(time)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function startOfUtcMonth(time: number): number {
  const date = new Date(time)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

export function summarizeSpend(buckets: CostBucket[], now: number): ApiSpend {
  const today = startOfUtcDay(now)
  const month = startOfUtcMonth(now)
  const inMonth = buckets.filter((bucket) => bucket.startingAt >= month)
  const sum = (items: CostBucket[]): number =>
    Math.round(items.reduce((total, item) => total + item.amount, 0) * 100) / 100

  return {
    currency: inMonth[0]?.currency ?? 'USD',
    today: sum(inMonth.filter((bucket) => bucket.startingAt >= today)),
    month: sum(inMonth)
  }
}

export interface AdminSpendDeps {
  /** The Admin API key from settings, or null when none is stored. */
  readKey: () => Promise<string | null>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  userAgent: string
  now?: () => number
}

export interface AdminSpendReader {
  /** Month-to-date spend, or null when no Admin API key is set. */
  read(signal: AbortSignal): Promise<ApiSpend | null>
}

export function createAdminSpendReader(deps: AdminSpendDeps): AdminSpendReader {
  const now = deps.now ?? Date.now
  let cached: { key: string; spend: ApiSpend; fetchedAt: number } | null = null

  async function fetchSpend(key: string, signal: AbortSignal): Promise<ApiSpend> {
    const buckets: CostBucket[] = []
    let page: string | null = null

    for (let i = 0; i < MAX_PAGES; i++) {
      const url = new URL(COST_REPORT_URL)
      url.searchParams.set('starting_at', new Date(startOfUtcMonth(now())).toISOString())
      url.searchParams.set('bucket_width', '1d')
      url.searchParams.set('limit', '31')
      if (page) url.searchParams.set('page', page)

      const response = await deps.fetch(url.toString(), {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'User-Agent': deps.userAgent,
          Accept: 'application/json'
        },
        signal
      })
      if (!response.ok) throw new Error(`Cost report returned HTTP ${response.status}`)

      const parsed = parseCostReport(await response.json())
      buckets.push(...parsed.buckets)
      page = parsed.nextPage
      if (!page) break
    }

    return summarizeSpend(buckets, now())
  }

  return {
    async read(signal) {
      const key = await deps.readKey()
      if (!key) {
        cached = null
        return null
      }

      if (cached?.key === key && now() - cached.fetchedAt < SPEND_CACHE_MS) {
        return cached.spend
      }

      try {
        const spend = await fetchSpend(key, signal)
        cached = { key, spend, fetchedAt: now() }
        return spend
      } catch (error) {
        // Spend is a side panel. A failure here keeps the last figures for the
        // same key rather than hiding them, and never fails the usage read.
        if (cached?.key === key) return cached.spend
        throw new Error(`Couldn't read API spend: ${errorMessage(error)}`, { cause: error })
      }
    }
  }
}
