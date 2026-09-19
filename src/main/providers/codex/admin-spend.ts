import { createSpendReader, type AdminSpendDeps, type CostPage, type SpendReader } from '../spend'
import { isRecord } from './rate-limits'

export const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs'

/**
 * Parses one page of GET /v1/organization/costs. Unlike Anthropic's report,
 * `amount.value` is a number in whole dollars, and buckets start at a Unix
 * time in seconds.
 */
export function parseOpenAiCosts(body: unknown): CostPage {
  if (!isRecord(body) || !Array.isArray(body['data'])) {
    throw new Error('Unexpected costs response')
  }

  const buckets = body['data'].flatMap((bucket: unknown) => {
    if (!isRecord(bucket) || !Array.isArray(bucket['results'])) return []
    const start = bucket['start_time']
    if (typeof start !== 'number' || !Number.isFinite(start)) return []

    return bucket['results'].flatMap((result: unknown) => {
      if (!isRecord(result) || !isRecord(result['amount'])) return []
      const { value, currency } = result['amount']
      if (typeof value !== 'number' || !Number.isFinite(value)) return []
      return [
        {
          startingAt: start * 1000,
          // Reported in lower case; Intl wants ISO codes.
          currency: typeof currency === 'string' ? currency.toUpperCase() : 'USD',
          amount: value
        }
      ]
    })
  })

  const hasMore = body['has_more'] === true && typeof body['next_page'] === 'string'
  return { buckets, nextPage: hasMore ? (body['next_page'] as string) : null }
}

/** OpenAI's organization costs, read with an Admin API key, in the shared spend reader. */
export function createOpenAiSpendReader(deps: AdminSpendDeps): SpendReader {
  return createSpendReader({
    readKey: deps.readKey,
    now: deps.now,
    fetchPage: async (key, monthStart, page, signal) => {
      const url = new URL(OPENAI_COSTS_URL)
      url.searchParams.set('start_time', String(Math.floor(monthStart / 1000)))
      url.searchParams.set('bucket_width', '1d')
      url.searchParams.set('limit', '31')
      if (page) url.searchParams.set('page', page)

      const response = await deps.fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${key}`,
          'User-Agent': deps.userAgent,
          Accept: 'application/json'
        },
        signal
      })
      if (!response.ok) throw new Error(`Costs returned HTTP ${response.status}`)
      return parseOpenAiCosts(await response.json())
    }
  })
}
