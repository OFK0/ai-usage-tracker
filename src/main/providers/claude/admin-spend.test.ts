// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  COST_REPORT_URL,
  createAdminSpendReader,
  parseCostReport,
  SPEND_CACHE_MS,
  summarizeSpend
} from './admin-spend'

const NOW = Date.parse('2026-09-18T15:00:00Z')

function bucket(day: string, ...amounts: string[]): object {
  return {
    starting_at: `2026-09-${day}T00:00:00Z`,
    ending_at: `2026-09-${day}T23:59:59Z`,
    results: amounts.map((amount) => ({ amount, currency: 'USD' }))
  }
}

function report(buckets: object[], nextPage: string | null = null): object {
  return { data: buckets, has_more: nextPage !== null, next_page: nextPage }
}

describe('parseCostReport', () => {
  it('reads amounts as cents, not dollars', () => {
    // The documented example: "123.45" in USD is $1.23.
    const { buckets } = parseCostReport(report([bucket('01', '123.45')]))

    expect(buckets[0]?.amount).toBeCloseTo(1.2345)
  })

  it('keeps every result of every bucket', () => {
    const { buckets } = parseCostReport(report([bucket('01', '100', '50'), bucket('02')]))

    expect(buckets).toHaveLength(2)
  })

  it('passes on the next page cursor', () => {
    expect(parseCostReport(report([], 'page_abc')).nextPage).toBe('page_abc')
    expect(parseCostReport(report([])).nextPage).toBeNull()
  })

  it('rejects a body without a data list', () => {
    expect(() => parseCostReport({ error: 'nope' })).toThrow('Unexpected cost report response')
  })
})

describe('summarizeSpend', () => {
  it('adds up today and the month so far in UTC', () => {
    const { buckets } = parseCostReport(
      report([bucket('01', '1000'), bucket('17', '250'), bucket('18', '199.9', '0.1')])
    )

    expect(summarizeSpend(buckets, NOW)).toEqual({ currency: 'USD', today: 2, month: 14.5 })
  })

  it('reports zero rather than nothing on a month without spend', () => {
    expect(summarizeSpend([], NOW)).toEqual({ currency: 'USD', today: 0, month: 0 })
  })
})

describe('createAdminSpendReader', () => {
  function reader(
    options: {
      key?: string | null
      fetch?: (url: string, init: RequestInit) => Promise<Response>
    } = {}
  ) {
    let time = NOW
    const fetch = vi.fn(
      options.fetch ?? (() => Promise.resolve(Response.json(report([bucket('18', '500')]))))
    )
    const r = createAdminSpendReader({
      readKey: () => Promise.resolve(options.key === undefined ? 'sk-ant-admin01-x' : options.key),
      fetch,
      userAgent: 'llm-usage-tracker/0.1.0',
      now: () => time
    })
    return {
      read: () => r.read(new AbortController().signal),
      fetch,
      advance: (ms: number) => {
        time += ms
      }
    }
  }

  it('does nothing without an Admin API key', async () => {
    const r = reader({ key: null })

    expect(await r.read()).toBeNull()
    expect(r.fetch).not.toHaveBeenCalled()
  })

  it('asks for this month in daily buckets with the admin key', async () => {
    const r = reader()

    expect(await r.read()).toEqual({ currency: 'USD', today: 5, month: 5 })

    const [url, init] = r.fetch.mock.calls[0] ?? []
    const params = new URL(url ?? '').searchParams
    expect(url?.startsWith(COST_REPORT_URL)).toBe(true)
    expect(params.get('starting_at')).toBe('2026-09-01T00:00:00.000Z')
    expect(params.get('bucket_width')).toBe('1d')
    expect(init?.headers).toMatchObject({
      'x-api-key': 'sk-ant-admin01-x',
      'anthropic-version': '2023-06-01'
    })
  })

  it('follows the next page cursor', async () => {
    const r = reader({
      fetch: (url) =>
        Promise.resolve(
          Response.json(
            url.includes('page=p2')
              ? report([bucket('18', '300')])
              : report([bucket('17', '200')], 'p2')
          )
        )
    })

    expect(await r.read()).toEqual({ currency: 'USD', today: 3, month: 5 })
    expect(r.fetch).toHaveBeenCalledTimes(2)
  })

  it('serves the cached figures until they are fifteen minutes old', async () => {
    const r = reader()
    await r.read()

    r.advance(SPEND_CACHE_MS - 1)
    await r.read()
    expect(r.fetch).toHaveBeenCalledOnce()

    r.advance(1)
    await r.read()
    expect(r.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the last figures when a later request fails', async () => {
    let fail = false
    const r = reader({
      fetch: () =>
        Promise.resolve(
          fail ? new Response('', { status: 500 }) : Response.json(report([bucket('18', '500')]))
        )
    })
    await r.read()

    fail = true
    r.advance(SPEND_CACHE_MS)

    expect(await r.read()).toEqual({ currency: 'USD', today: 5, month: 5 })
  })

  it('fails when the very first request fails', async () => {
    const r = reader({ fetch: () => Promise.resolve(new Response('', { status: 401 })) })

    await expect(r.read()).rejects.toThrow('HTTP 401')
  })
})
