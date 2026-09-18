import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PROVIDER_IDS } from '@shared/app-info'

const hideWidget = vi.fn()

beforeEach(() => {
  hideWidget.mockClear()
  vi.stubGlobal('api', { hideWidget })
})

describe('App', () => {
  it('renders a row for every known provider', () => {
    render(<App />)

    for (const id of PROVIDER_IDS) {
      expect(screen.getByText(id)).toBeInTheDocument()
    }
  })

  it('renders a usage progress bar per provider', () => {
    render(<App />)

    expect(screen.getAllByRole('progressbar')).toHaveLength(PROVIDER_IDS.length)
  })

  it('asks the main process to hide the widget', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Hide widget' }))

    expect(hideWidget).toHaveBeenCalledOnce()
  })
})
