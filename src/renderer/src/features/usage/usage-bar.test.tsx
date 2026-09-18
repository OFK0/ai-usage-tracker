import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UsageBar } from './usage-bar'

describe('UsageBar', () => {
  it('reports its value to assistive technology', () => {
    render(<UsageBar value={39.4} level="normal" label="Claude Session usage" />)

    const bar = screen.getByRole('progressbar', { name: 'Claude Session usage' })
    expect(bar).toHaveAttribute('aria-valuenow', '39')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('carries its level and staleness for the stylesheet', () => {
    render(<UsageBar value={80} level="warning" stale label="bar" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-level', 'warning')
    expect(bar).toHaveAttribute('data-stale', 'true')
  })

  it('never draws past either end', () => {
    const { container } = render(<UsageBar value={140} level="exhausted" label="bar" />)

    expect(container.querySelector('.usage-fill')).toHaveStyle({ width: '100%' })
  })
})
