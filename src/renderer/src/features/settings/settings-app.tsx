import { useEffect, useId, useState } from 'react'
import { SUPPORTED_PROVIDERS, type ProviderId } from '@shared/app-info'
import type { SecretStorageStatus } from '@shared/secrets'
import {
  SETTINGS_RANGES,
  type ProviderSettings,
  type Settings,
  type SettingsPatch,
  type Theme
} from '@shared/settings'
import type { ProviderSnapshot } from '@shared/usage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUsage } from '@/features/usage/hooks'
import { providerName, statusText } from '@/features/usage/labels'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import { cn } from '@/lib/utils'
import { applyAccentHue } from '@/theme/accent'
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
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground text-xs">
            Show in widget
          </span>
          <Switch
            checked={settings.enabled}
            aria-label={`Show ${name} in the widget`}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </div>
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

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

function AppearanceSection({
  settings,
  update
}: {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}): React.JSX.Element {
  // While the slider moves, the hue is previewed straight away but saved only
  // once it settles, instead of rewriting the settings file on every pixel.
  const [draftHue, setDraftHue] = useState<number | null>(null)
  const saveHue = useDebouncedCallback((hue: number) => {
    void update({ accentHue: hue }).finally(() => setDraftHue(null))
  }, 200)
  const hue = draftHue ?? settings.accentHue
  const hueId = useId()
  const motionId = useId()

  return (
    <section
      aria-label="Appearance"
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Theme</span>
        <div role="radiogroup" aria-label="Theme" className="bg-muted flex rounded-md p-0.5">
          {THEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.theme === value}
              className={cn(
                'rounded px-3 py-1 text-xs transition-colors',
                settings.theme === value
                  ? 'bg-card text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => void update({ theme: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={hueId}>Accent colour</Label>
          <span aria-hidden className="accent-gradient h-4 w-10 rounded-full" />
        </div>
        <input
          id={hueId}
          type="range"
          min={SETTINGS_RANGES.accentHue.min}
          max={SETTINGS_RANGES.accentHue.max}
          step={1}
          value={hue}
          className="hue-slider w-full"
          onChange={(event) => {
            const next = Number(event.target.value)
            setDraftHue(next)
            applyAccentHue(next)
            saveHue(next)
          }}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={motionId}>Reduce motion</Label>
          <p className="text-muted-foreground text-xs">
            Turns off decorative animation. If your system asks for less motion, that is respected
            either way.
          </p>
        </div>
        <Switch
          id={motionId}
          checked={settings.reduceMotion}
          onCheckedChange={(reduceMotion) => void update({ reduceMotion })}
        />
      </div>
    </section>
  )
}

const REFRESH_INTERVALS = [30, 60, 120, 300, 600, 900, 1800]

function intervalLabel(seconds: number): string {
  // Anything that isn't whole minutes stays in seconds, so no two options can
  // end up with the same label.
  if (seconds < 60 || seconds % 60 !== 0) return `Every ${seconds} seconds`
  const minutes = seconds / 60
  return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`
}

function WidgetSection({
  settings,
  update
}: {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}): React.JSX.Element {
  // Same as the accent: follow the slider on screen, save once it settles.
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null)
  const saveOpacity = useDebouncedCallback((opacity: number) => {
    void update({ opacity }).finally(() => setDraftOpacity(null))
  }, 150)
  const opacity = draftOpacity ?? settings.opacity
  const onTopId = useId()
  const opacityId = useId()
  const intervalId = useId()

  // A hand-edited interval that isn't one of the presets still shows up.
  const intervals = REFRESH_INTERVALS.includes(settings.refreshIntervalSeconds)
    ? REFRESH_INTERVALS
    : [...REFRESH_INTERVALS, settings.refreshIntervalSeconds].sort((a, b) => a - b)

  return (
    <section
      aria-label="Widget"
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={onTopId}>Always on top</Label>
          <p className="text-muted-foreground text-xs">
            Keeps the widget above other windows. When it's off, clicking the tray icon brings the
            widget to the front.
          </p>
        </div>
        <Switch
          id={onTopId}
          checked={settings.alwaysOnTop}
          onCheckedChange={(alwaysOnTop) => void update({ alwaysOnTop })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={opacityId}>Opacity</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <input
          id={opacityId}
          type="range"
          min={SETTINGS_RANGES.opacity.min * 100}
          max={SETTINGS_RANGES.opacity.max * 100}
          step={5}
          value={Math.round(opacity * 100)}
          className="accent-primary w-full"
          onChange={(event) => {
            const next = Number(event.target.value) / 100
            setDraftOpacity(next)
            saveOpacity(next)
          }}
        />
        <p className="text-muted-foreground text-xs">
          The widget turns fully opaque while the pointer is over it.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={intervalId}>Refresh</Label>
          <p className="text-muted-foreground text-xs">
            How often usage is checked while the widget is showing. Hidden, it checks every 5
            minutes at most.
          </p>
        </div>
        <select
          id={intervalId}
          value={settings.refreshIntervalSeconds}
          className="border-input bg-background rounded-md border px-2 py-1 text-xs"
          onChange={(event) => void update({ refreshIntervalSeconds: Number(event.target.value) })}
        >
          {intervals.map((seconds) => (
            <option key={seconds} value={seconds}>
              {intervalLabel(seconds)}
            </option>
          ))}
        </select>
      </div>
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

        {settings && (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Appearance
            </h2>
            <AppearanceSection settings={settings} update={update} />
          </div>
        )}

        {settings && (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Widget
            </h2>
            <WidgetSection settings={settings} update={update} />
          </div>
        )}

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
