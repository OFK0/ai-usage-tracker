import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import { ProviderCard } from './provider-card'

const NOW = Date.parse('2026-09-19T10:00:00Z')

function window(key: string, usedPercent: number, scope: string | null = null): LimitWindow {
  return {
    key,
    scope,
    usedPercent,
    used: null,
    limit: null,
    resetsAt: '2026-09-24T12:00:00Z',
    exhausted: false,
    applicable: true,
    unlimited: false
  }
}

const snapshot: ProviderSnapshot = {
  providerId: 'claude',
  status: 'ok',
  source: 'oauth',
  planLabel: 'Max 5x',
  windows: [window('session', 12), window('weekly', 30), window('weekly', 64, 'Fable')],
  credits: null,
  activity: null,
  apiSpend: null,
  fetchedAt: new Date(NOW).toISOString(),
  detail: null
}

describe('ProviderCard', () => {
  it('shows a model’s own weekly limit next to the overall one', () => {
    render(
      <ul>
        <ProviderCard snapshot={snapshot} now={NOW} />
      </ul>
    )

    expect(screen.getByText('Weekly')).toBeInTheDocument()
    expect(screen.getByText('Weekly · Fable')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Claude Weekly · Fable usage' })
    ).toHaveAttribute('aria-valuenow', '64')
  })
})
