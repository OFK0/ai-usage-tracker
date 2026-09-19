import { createSpendReader, type AdminSpendDeps, type CostPage, type SpendReader } from '../spend'

export const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report'

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

/** Anthropic's Admin API cost report, in the shared spend reader. */
export function createAdminSpendReader(deps: AdminSpendDeps): SpendReader {
  return createSpendReader({
    readKey: deps.readKey,
    now: deps.now,
    fetchPage: async (key, monthStart, page, signal) => {
      const url = new URL(COST_REPORT_URL)
      url.searchParams.set('starting_at', new Date(monthStart).toISOString())
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
      return parseCostReport(await response.json())
    }
  })
}
