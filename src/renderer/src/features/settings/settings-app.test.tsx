import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretStorageStatus, TokenInfo } from '@shared/secrets'
import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@shared/settings'
import type { ProviderSnapshot } from '@shared/usage'
import { i18n } from '@/i18n'
import { ipcErrorMessage } from './hooks'
import { SettingsApp } from './settings-app'

function withClaude(patch: Partial<Settings['providers']['claude']>): Settings {
  const settings = defaultSettings()
  settings.providers.claude = { ...settings.providers.claude, ...patch }
  return settings
}

const noKey: TokenInfo = { saved: false, hint: null }

const api = {
  locale: { language: 'en', systemLanguages: ['tr-TR', 'en-US'] },
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

  it('explains a pasted value with spaces without sending it', async () => {
    const section = await claudeSection()

    await userEvent.type(within(section).getByLabelText('Anthropic Admin API key'), 'abc def')
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Keys and tokens never contain spaces.'
    )
    expect(api.secrets.save).not.toHaveBeenCalled()
  })

  it('shows why the main process refused a key, without the IPC wrapper', async () => {
    api.secrets.save.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'secrets:save': Error: Secure storage is unavailable (no-keyring)"
      )
    )
    const section = await claudeSection()

    await userEvent.type(within(section).getByLabelText('Anthropic Admin API key'), 'sk-ant-x9Kq')
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Secure storage is unavailable (no-keyring)'
    )
  })

  it('locks the key field when there is no secure storage', async () => {
    api.secrets.status.mockResolvedValueOnce({ available: false, reason: 'no-keyring' })
    const section = await claudeSection()

    expect(await within(section).findByText(/No system keyring was found/)).toBeInTheDocument()
    expect(within(section).getByLabelText('Anthropic Admin API key')).toBeDisabled()
  })
})

describe('language', () => {
  async function generalSection(): Promise<HTMLElement> {
    render(<SettingsApp />)
    return screen.findByRole('region', { name: 'General' })
  }

  it('offers the system language by name, then every language in its own words', async () => {
    const select = within(await generalSection()).getByLabelText('Language')

    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'System (Türkçe)',
      'English',
      'Türkçe',
      'Français',
      'Deutsch',
      'Italiano',
      'Русский',
      'العربية'
    ])
  })

  it('saves the language the user picks', async () => {
    const select = within(await generalSection()).getByLabelText('Language')

    await userEvent.selectOptions(select, 'de')

    expect(api.settings.update).toHaveBeenCalledWith({ language: 'de' })
  })

  it('turns on launch at login', async () => {
    const section = await generalSection()

    await userEvent.click(within(section).getByRole('switch', { name: 'Launch at login' }))

    expect(api.settings.update).toHaveBeenCalledWith({ launchAtLogin: true })
  })

  it('shows the screen in the current language', async () => {
    await i18n.changeLanguage('tr')
    render(<SettingsApp />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ayarlar' })).toBeInTheDocument()
    expect(await screen.findByRole('switch', { name: "GitHub'ı bağla" })).toBeInTheDocument()
  })
})

describe('Codex', () => {
  it('connects Codex CLI only when the user turns it on, with no key to enter', async () => {
    render(<SettingsApp />)
    const section = await screen.findByRole('region', { name: 'Codex' })

    await userEvent.click(within(section).getByRole('switch', { name: 'Connect Codex CLI' }))

    expect(api.settings.update).toHaveBeenCalledWith({ providers: { codex: { connected: true } } })
    expect(within(section).queryByRole('textbox')).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

describe('Copilot', () => {
  async function copilotSection(): Promise<HTMLElement> {
    render(<SettingsApp />)
    return screen.findByRole('region', { name: 'Copilot' })
  }

  it('connects GitHub only when the user turns it on', async () => {
    const section = await copilotSection()

    await userEvent.click(within(section).getByRole('switch', { name: 'Connect GitHub' }))

    expect(api.settings.update).toHaveBeenCalledWith({
      providers: { copilot: { connected: true } }
    })
  })

  it('saves a GitHub token under Copilot', async () => {
    const section = await copilotSection()
    const input = within(section).getByLabelText('GitHub token')

    expect(input).toHaveAttribute('placeholder', 'Paste your token')
    await userEvent.type(input, 'github_pat_secret')
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }))

    expect(api.secrets.save).toHaveBeenCalledWith('copilot', 'github_pat_secret')
  })

  it('counts as connected when a typed token works without the switch', async () => {
    api.usage.get.mockResolvedValueOnce([
      {
        providerId: 'copilot',
        status: 'ok',
        source: 'oauth',
        planLabel: 'Free',
        windows: [],
        credits: null,
        activity: null,
        apiSpend: null,
        fetchedAt: new Date().toISOString(),
        detail: null
      }
    ])

    const section = await copilotSection()

    expect(await within(section).findByText('Connected · Free')).toBeInTheDocument()
    expect(within(section).getByRole('switch', { name: 'Connect GitHub' })).not.toBeChecked()
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

describe('widget', () => {
  async function widgetSection(): Promise<HTMLElement> {
    render(<SettingsApp />)
    return screen.findByRole('region', { name: 'Widget' })
  }

  it('turns always-on-top off', async () => {
    const section = await widgetSection()

    await userEvent.click(within(section).getByRole('switch', { name: 'Always on top' }))

    expect(api.settings.update).toHaveBeenCalledWith({ alwaysOnTop: false })
  })

  it('saves opacity once the slider settles', async () => {
    const section = await widgetSection()
    const slider = within(section).getByLabelText('Opacity')

    fireEvent.change(slider, { target: { value: '80' } })
    fireEvent.change(slider, { target: { value: '60' } })

    expect(within(section).getByText('60%')).toBeInTheDocument()
    await vi.waitFor(() => expect(api.settings.update).toHaveBeenCalledTimes(1))
    expect(api.settings.update).toHaveBeenCalledWith({ opacity: 0.6 })
  })

  it('changes how often usage is checked', async () => {
    const section = await widgetSection()

    await userEvent.selectOptions(within(section).getByLabelText('Refresh'), 'Every 5 minutes')

    expect(api.settings.update).toHaveBeenCalledWith({ refreshIntervalSeconds: 300 })
  })

  it('still shows an interval that is not one of the presets', async () => {
    api.settings.get.mockResolvedValueOnce({ ...defaultSettings(), refreshIntervalSeconds: 90 })
    const section = await widgetSection()

    expect(within(section).getByLabelText('Refresh')).toHaveDisplayValue('Every 90 seconds')
  })
})

describe('ipcErrorMessage', () => {
  it('keeps a message that has no wrapper', () => {
    expect(ipcErrorMessage(new Error('plain'))).toBe('plain')
  })
})
