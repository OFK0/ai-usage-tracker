import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretStorageStatus, TokenInfo } from '@shared/secrets'
import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@shared/settings'
import type { ProviderSnapshot } from '@shared/usage'
import { ipcErrorMessage } from './hooks'
import { SettingsApp } from './settings-app'

function withClaude(patch: Partial<Settings['providers']['claude']>): Settings {
  const settings = defaultSettings()
  settings.providers.claude = { ...settings.providers.claude, ...patch }
  return settings
}

const noKey: TokenInfo = { saved: false, hint: null }

const api = {
  settings: {
    get: vi.fn(() => Promise.resolve(defaultSettings())),
    update: vi.fn((patch: SettingsPatch) =>
      Promise.resolve(mergeSettings(defaultSettings(), patch))
    ),
    onChange: vi.fn(() => () => {})
  },
  secrets: {
    status: vi.fn((): Promise<SecretStorageStatus> => Promise.resolve({ available: true })),
    describe: vi.fn(() => Promise.resolve(noKey)),
    save: vi.fn(() => Promise.resolve<TokenInfo>({ saved: true, hint: 'x9Kq' })),
    clear: vi.fn(() => Promise.resolve(noKey))
  },
  usage: {
    get: vi.fn((): Promise<ProviderSnapshot[]> => Promise.resolve([])),
    refresh: vi.fn(() => Promise.resolve([])),
    onChange: vi.fn(() => () => {})
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('api', api)
})

async function claudeSection(): Promise<HTMLElement> {
  render(<SettingsApp />)
  return screen.findByRole('region', { name: 'Claude' })
}

describe('SettingsApp', () => {
  it('starts with Claude Code not connected', async () => {
    const section = await claudeSection()

    expect(within(section).getByText('Not connected')).toBeInTheDocument()
    expect(within(section).getByRole('switch', { name: 'Connect Claude Code' })).not.toBeChecked()
  })

  it('connects Claude Code only when the user turns it on', async () => {
    const section = await claudeSection()

    await userEvent.click(within(section).getByRole('switch', { name: 'Connect Claude Code' }))

    expect(api.settings.update).toHaveBeenCalledWith({
      providers: { claude: { connected: true } }
    })
    expect(within(section).getByRole('switch', { name: 'Connect Claude Code' })).toBeChecked()
  })

  it('can hide the provider from the widget', async () => {
    const section = await claudeSection()

    await userEvent.click(
      within(section).getByRole('switch', { name: 'Show Claude in the widget' })
    )

    expect(api.settings.update).toHaveBeenCalledWith({ providers: { claude: { enabled: false } } })
  })

  it('shows the plan once connected and reading', async () => {
    api.settings.get.mockResolvedValueOnce(withClaude({ connected: true }))
    api.usage.get.mockResolvedValueOnce([
      {
        providerId: 'claude',
        status: 'ok',
        source: 'oauth',
        planLabel: 'Pro',
        windows: [],
        credits: null,
        activity: null,
        apiSpend: null,
        fetchedAt: new Date().toISOString(),
        detail: null
      }
    ])

    const section = await claudeSection()

    expect(await within(section).findByText('Connected · Pro')).toBeInTheDocument()
  })

  it('saves the admin key and then only shows its last four characters', async () => {
    const section = await claudeSection()
    const input = within(section).getByLabelText('Anthropic Admin API key')

    await userEvent.type(input, 'sk-ant-admin01-secret-x9Kq')
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))

    expect(api.secrets.save).toHaveBeenCalledWith('claude', 'sk-ant-admin01-secret-x9Kq')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'Saved key ending in x9Kq')
  })

  it('removes a saved key', async () => {
    api.secrets.describe.mockResolvedValueOnce({ saved: true, hint: 'x9Kq' })
    const section = await claudeSection()

    await userEvent.click(await within(section).findByRole('button', { name: 'Remove' }))

    expect(api.secrets.clear).toHaveBeenCalledWith('claude')
  })

  it('shows why a key was refused, without the IPC wrapper', async () => {
    api.secrets.save.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'secrets:save': Error: Token must not contain whitespace"
      )
    )
    const section = await claudeSection()

    await userEvent.type(within(section).getByLabelText('Anthropic Admin API key'), 'abc def')
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Token must not contain whitespace'
    )
  })

  it('locks the key field when there is no secure storage', async () => {
    api.secrets.status.mockResolvedValueOnce({ available: false, reason: 'no-keyring' })
    const section = await claudeSection()

    expect(await within(section).findByText(/No system keyring was found/)).toBeInTheDocument()
    expect(within(section).getByLabelText('Anthropic Admin API key')).toBeDisabled()
  })
})

describe('appearance', () => {
  async function appearanceSection(): Promise<HTMLElement> {
    render(<SettingsApp />)
    return screen.findByRole('region', { name: 'Appearance' })
  }

  it('shows the current theme and switches it', async () => {
    const section = await appearanceSection()

    expect(within(section).getByRole('radio', { name: 'System' })).toBeChecked()

    await userEvent.click(within(section).getByRole('radio', { name: 'Dark' }))

    expect(api.settings.update).toHaveBeenCalledWith({ theme: 'dark' })
    expect(within(section).getByRole('radio', { name: 'Dark' })).toBeChecked()
  })

  it('previews an accent hue at once and saves it once the slider settles', async () => {
    const section = await appearanceSection()
    const slider = within(section).getByLabelText('Accent colour')

    fireEvent.change(slider, { target: { value: '10' } })
    fireEvent.change(slider, { target: { value: '20' } })
    fireEvent.change(slider, { target: { value: '30' } })

    expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('30')
    expect(api.settings.update).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(api.settings.update).toHaveBeenCalledTimes(1))
    expect(api.settings.update).toHaveBeenCalledWith({ accentHue: 30 })
  })

  it('turns down motion', async () => {
    const section = await appearanceSection()

    await userEvent.click(within(section).getByRole('switch', { name: 'Reduce motion' }))

    expect(api.settings.update).toHaveBeenCalledWith({ reduceMotion: true })
  })
})

describe('ipcErrorMessage', () => {
  it('keeps a message that has no wrapper', () => {
    expect(ipcErrorMessage(new Error('plain'))).toBe('plain')
  })
})
