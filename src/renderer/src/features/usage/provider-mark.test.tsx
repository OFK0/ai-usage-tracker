import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PROVIDER_IDS } from '@shared/app-info'
import { ProviderMark } from './provider-mark'

describe('ProviderMark', () => {
  it('draws a different logo for each provider, not a letter', () => {
    const drawn = PROVIDER_IDS.map((provider) => {
      const { container } = render(<ProviderMark provider={provider} />)
      const mark = container.querySelector(`[data-provider="${provider}"]`)
      expect(mark?.textContent).toBe('')
      return mark?.querySelector('path')?.getAttribute('d')
    })

    expect(new Set(drawn).size).toBe(PROVIDER_IDS.length)
  })

  it('points each Codex logo at its own gradient, even with two on a page', () => {
    const { container } = render(
      <>
        <ProviderMark provider="codex" />
        <ProviderMark provider="codex" />
      </>
    )

    const fills = [...container.querySelectorAll('path')].map((path) => path.getAttribute('fill'))
    expect(new Set(fills).size).toBe(2)
    for (const fill of fills) {
      const id = /^url\(#([\w-]+)\)$/.exec(fill ?? '')?.[1]
      expect(id && container.querySelector(`linearGradient#${id}`)).toBeTruthy()
    }
  })
})
