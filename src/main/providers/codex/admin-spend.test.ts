// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createOpenAiSpendReader, OPENAI_COSTS_URL, parseOpenAiCosts } from './admin-spend'

const NOW = Date.parse('2026-09-18T15:00:00Z')
const day = (d: number): number => Date.UTC(2026, 8, d) / 1000

function bucket(start: number, ...values: number[]): object {
  return {
    object: 'bucket',
    start_time: start,
    end_time: start + 86_400,
    results: values.map((value) => ({
      object: 'organization.costs.result',
      amount: { value, currency: 'usd' },
      line_item: null,
      project_id: null
    }))
  }
}

function page(buckets: object[], nextPage: string | null = null): object {
  return { object: 'page', data: buckets, has_more: nextPage !== null, next_page: nextPage }
}

describe('parseOpenAiCosts', () => {
  it('reads amounts as dollars, and start times as Unix seconds', () => {
    const { buckets } = parseOpenAiCosts(page([bucket(day(1), 1.25)]))

    expect(buckets).toEqual([{ startingAt: Date.UTC(2026, 8, 1), currency: 'USD', amount: 1.25 }])
  })

  it('keeps every result of every bucket', () => {
    expect(parseOpenAiCosts(page([bucket(day(1), 1, 2), bucket(day(2))])).buckets).toHaveLength(2)
  })

  it('passes on the next page cursor', () => {
    expect(parseOpenAiCosts(page([], 'page_2')).nextPage).toBe('page_2')
  })

  it('rejects a body without a data list', () => {
    expect(() => parseOpenAiCosts({ error: { message: 'nope' } })).toThrow()
  })
})

describe('createOpenAiSpendReader', () => {
  it('does nothing without an Admin API key', async () => {
    const fetch = vi.fn()
    const reader = createOpenAiSpendReader({
      readKey: () => Promise.resolve(null),
      fetch,
      userAgent: 'ua'
    })

    expect(await reader.read(new AbortController().signal)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks for this month in daily buckets and adds up today and the month', async () => {
    const fetch = vi.fn((url: string, init: RequestInit) => {
      void url
      void init
      return Promise.resolve(Response.json(page([bucket(day(2), 3.5), bucket(day(18), 0.4, 0.1)])))
    })
    const reader = createOpenAiSpendReader({
      readKey: () => Promise.resolve('sk-admin-x'),
      fetch,
      userAgent: 'ua',
      now: () => NOW
    })

    expect(await reader.read(new AbortController().signal)).toEqual({
      currency: 'USD',
      today: 0.5,
      month: 4
    })
    const [url, init] = fetch.mock.calls[0] ?? []
    const asked = new URL(url ?? '')
    expect(`${asked.origin}${asked.pathname}`).toBe(OPENAI_COSTS_URL)
    expect(asked.searchParams.get('start_time')).toBe(String(day(1)))
    expect(asked.searchParams.get('bucket_width')).toBe('1d')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-admin-x' })
  })
})
