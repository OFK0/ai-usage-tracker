import type { ApiSpend } from '@shared/usage'
import { errorMessage } from '../lib/http'

/** Cost reports lag behind real usage by a while, so asking often gains nothing. */
export const SPEND_CACHE_MS = 15 * 60_000
const MAX_PAGES = 3

export interface CostBucket {
  startingAt: number
  currency: string
  amount: number
}

export interface CostPage {
  buckets: CostBucket[]
  nextPage: string | null
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

/** What an Admin API spend reader needs; each provider supplies its own. */
export interface AdminSpendDeps {
  /** The Admin API key from settings, or null when none is stored. */
  readKey: () => Promise<string | null>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  userAgent: string
  now?: () => number
}

export interface SpendReader {
  /** Month-to-date spend, or null when no Admin API key is set. */
  read(signal: AbortSignal): Promise<ApiSpend | null>
}

/**
 * Reads this month's daily costs page by page and keeps the result for a
 * while. What differs between providers is only how a page is asked for and
 * read, which `fetchPage` does.
 */
export function createSpendReader(options: {
  readKey: () => Promise<string | null>
  fetchPage: (
    key: string,
    monthStart: number,
    page: string | null,
    signal: AbortSignal
  ) => Promise<CostPage>
  now?: () => number
}): SpendReader {
  const now = options.now ?? Date.now
  let cached: { key: string; spend: ApiSpend; fetchedAt: number } | null = null

  async function fetchSpend(key: string, signal: AbortSignal): Promise<ApiSpend> {
    const monthStart = startOfUtcMonth(now())
    const buckets: CostBucket[] = []
    let page: string | null = null

    for (let i = 0; i < MAX_PAGES; i++) {
      const parsed = await options.fetchPage(key, monthStart, page, signal)
      buckets.push(...parsed.buckets)
      page = parsed.nextPage
      if (!page) break
    }

    return summarizeSpend(buckets, now())
  }

  return {
    async read(signal) {
      const key = await options.readKey()
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
