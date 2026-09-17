import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { PROVIDER_IDS } from '@shared/app-info'

describe('App', () => {
  it('renders a row for every known provider', () => {
    render(<App />)

    for (const id of PROVIDER_IDS) {
      expect(screen.getByText(id)).toBeInTheDocument()
    }
  })
})
