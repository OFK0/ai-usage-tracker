import { useEffect, useId, useState } from 'react'
import { SUPPORTED_PROVIDERS, type ProviderId } from '@shared/app-info'
import type { SecretStorageStatus } from '@shared/secrets'
import type { ProviderSettings } from '@shared/settings'
import type { ProviderSnapshot } from '@shared/usage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUsage } from '@/features/usage/hooks'
import { providerName, statusText } from '@/features/usage/labels'
import { ipcErrorMessage, useSecret, useSettings } from './hooks'

/** English only for now; these move into the locale files with i18n. */
const PROVIDER_TEXT: Partial<
  Record<ProviderId, { connect: string; connectHelp: string; key: string; keyHelp: string }>
> = {
  claude: {
    connect: 'Connect Claude Code',
    connectHelp:
      'Reads the sign-in Claude Code keeps on this computer to show your plan limits, and its ' +
      "session logs when the usage API can't be reached. Only the usage request itself goes to " +
      'Anthropic. Your system may ask for permission the first time.',
    key: 'Anthropic Admin API key',
    keyHelp: 'Optional. Adds your API spend for this month. Stored encrypted on this computer.'
  }
}

const STORAGE_UNAVAILABLE: Record<
  Extract<SecretStorageStatus, { available: false }>['reason'],
  string
> = {
  'encryption-unavailable':
    "Secure storage isn't available on this system, so keys can't be saved.",
  'no-keyring':
    'No system keyring was found (such as GNOME Keyring or KWallet), so keys can’t be stored securely.'
}

function connectionSummary(
  provider: ProviderId,
  settings: ProviderSettings,
  snapshot: ProviderSnapshot | undefined
): string {
  if (!settings.connected) return 'Not connected'
  if (!snapshot || snapshot.status === 'loading') return 'Connecting…'
  if (snapshot.status === 'ok') {
    return snapshot.planLabel ? `Connected · ${snapshot.planLabel}` : 'Connected'
  }
  return statusText(snapshot, Date.now()) ?? providerName(provider)
}

function SecretField({
  provider,
  label,
  help
}: {
  provider: ProviderId
  label: string
  help: string
}): React.JSX.Element {
  const { status, info, save, clear } = useSecret(provider)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = useId()

  const unavailable = status && !status.available ? STORAGE_UNAVAILABLE[status.reason] : null

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(ipcErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const placeholder = info?.saved
    ? info.hint
      ? `Saved key ending in ${info.hint}`
      : 'A key is saved'
    : 'Paste your key'

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <p className="text-muted-foreground text-xs">{help}</p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await save(draft)
            setDraft('')
          })
        }}
      >
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={draft}
          disabled={busy || unavailable !== null}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || draft.trim() === ''}>
          Save
        </Button>
        {info?.saved && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(clear)}
          >
            Remove
          </Button>
        )}
      </form>

      {unavailable && <p className="text-muted-foreground text-xs">{unavailable}</p>}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}

function ProviderSection({
  provider,
  settings,
  snapshot,
  onChange
}: {
  provider: ProviderId
  settings: ProviderSettings
  snapshot: ProviderSnapshot | undefined
  onChange: (patch: Partial<ProviderSettings>) => void
}): React.JSX.Element {
  const name = providerName(provider)
  const text = PROVIDER_TEXT[provider]
  const connectId = useId()

  return (
    <section
      aria-label={name}
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-muted-foreground text-xs">
            {connectionSummary(provider, settings, snapshot)}
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          aria-label={`Show ${name} in the widget`}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </div>

      {text && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={connectId}>{text.connect}</Label>
              <p className="text-muted-foreground text-xs">{text.connectHelp}</p>
            </div>
            <Switch
              id={connectId}
              checked={settings.connected}
              onCheckedChange={(connected) => onChange({ connected })}
            />
          </div>

          <SecretField provider={provider} label={text.key} help={text.keyHelp} />
        </>
      )}
    </section>
  )
}

export function SettingsApp(): React.JSX.Element {
  const { settings, update } = useSettings()
  const { snapshots } = useUsage()

  useEffect(() => {
    document.title = 'Settings'
  }, [])

  return (
    <div className="bg-background h-screen overflow-y-auto">
      <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
        <h1 className="text-lg font-semibold">Settings</h1>

        <div className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Providers
          </h2>

          {settings &&
            SUPPORTED_PROVIDERS.map((provider) => (
              <ProviderSection
                key={provider}
                provider={provider}
                settings={settings.providers[provider]}
                snapshot={snapshots?.find((snapshot) => snapshot.providerId === provider)}
                onChange={(patch) => void update({ providers: { [provider]: patch } })}
              />
            ))}
        </div>
      </main>
    </div>
  )
}
