import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_PROVIDERS, type ProviderId } from '@shared/app-info'
import { LANGUAGE_NAMES, resolveLanguage } from '@shared/i18n/language'
import { tokenProblem, type SecretStorageStatus } from '@shared/secrets'
import {
  LANGUAGES,
  SETTINGS_RANGES,
  THEMES,
  type LanguageSetting,
  type ProviderSettings,
  type Settings,
  type SettingsPatch
} from '@shared/settings'
import type { ProviderSnapshot } from '@shared/usage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUsage } from '@/features/usage/hooks'
import { providerName, statusText } from '@/features/usage/labels'
import { i18n } from '@/i18n'
import { formatPercent } from '@/lib/format'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import { cn } from '@/lib/utils'
import { applyAccentHue } from '@/theme/accent'
import { ipcErrorMessage, useSecret, useSettings } from './hooks'

type SecretKind = 'key' | 'token'

/**
 * Providers with a connect switch, and what the optional secret next to it is:
 * an Anthropic Admin API key for Claude, a GitHub token for Copilot.
 */
const SECRET_KIND = {
  claude: 'key',
  copilot: 'token'
} as const satisfies Partial<Record<ProviderId, SecretKind>>

type ConnectableProvider = keyof typeof SECRET_KIND

function isConnectable(provider: ProviderId): provider is ConnectableProvider {
  return provider in SECRET_KIND
}

const STORAGE_UNAVAILABLE = {
  'encryption-unavailable': 'encryption',
  'no-keyring': 'keyring'
} as const satisfies Record<Extract<SecretStorageStatus, { available: false }>['reason'], string>

function connectionSummary(
  provider: ProviderId,
  settings: ProviderSettings,
  snapshot: ProviderSnapshot | undefined
): string {
  if (!snapshot || snapshot.status === 'loading') {
    return settings.connected
      ? i18n.t('settings.provider.connecting')
      : i18n.t('status.disconnected')
  }
  // Reading without the switch is possible too, with a token typed in below.
  if (snapshot.status === 'ok') {
    return snapshot.planLabel
      ? i18n.t('settings.provider.connectedPlan', { plan: snapshot.planLabel })
      : i18n.t('settings.provider.connected')
  }
  return statusText(snapshot, Date.now()) ?? providerName(provider)
}

function SecretField({
  provider,
  kind,
  label,
  help
}: {
  provider: ProviderId
  kind: SecretKind
  label: string
  help: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const { status, info, save, clear } = useSecret(provider)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = useId()

  const unavailable =
    status && !status.available
      ? t(`settings.secret.unavailable.${STORAGE_UNAVAILABLE[status.reason]}`)
      : null

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
      ? t(`settings.secret.${kind}.saved`, { hint: info.hint })
      : t(`settings.secret.${kind}.savedNoHint`)
    : t(`settings.secret.${kind}.paste`)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <p className="text-muted-foreground text-xs">{help}</p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          // Checked here too so the reason reads in the user's language; main
          // checks again before storing anything.
          const problem = tokenProblem(draft)
          if (problem) {
            setError(t(`settings.secret.invalid.${problem}`))
            return
          }
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
          {t('settings.secret.save')}
        </Button>
        {info?.saved && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(clear)}
          >
            {t('settings.secret.remove')}
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
  const { t } = useTranslation()
  const name = providerName(provider)
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
            {t('settings.provider.showInWidget')}
          </span>
          <Switch
            checked={settings.enabled}
            aria-label={t('settings.provider.showInWidgetLabel', { name })}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
        </div>
      </div>

      {isConnectable(provider) && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={connectId}>{t(`settings.provider.${provider}.connect`)}</Label>
              <p className="text-muted-foreground text-xs">
                {t(`settings.provider.${provider}.connectHelp`)}
              </p>
            </div>
            <Switch
              id={connectId}
              checked={settings.connected}
              onCheckedChange={(connected) => onChange({ connected })}
            />
          </div>

          <SecretField
            provider={provider}
            kind={SECRET_KIND[provider]}
            label={t(`settings.provider.${provider}.key`)}
            help={t(`settings.provider.${provider}.keyHelp`)}
          />
        </>
      )}
    </section>
  )
}

function GeneralSection({
  settings,
  update
}: {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}): React.JSX.Element {
  const { t } = useTranslation()
  const languageId = useId()
  const launchId = useId()
  const systemLanguage = resolveLanguage('system', window.api.locale.systemLanguages)

  return (
    <section
      aria-label={t('settings.section.general')}
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={languageId}>{t('settings.language.label')}</Label>
        <select
          id={languageId}
          value={settings.language}
          className="border-input bg-background rounded-md border px-2 py-1 text-xs"
          onChange={(event) => void update({ language: event.target.value as LanguageSetting })}
        >
          <option value="system">
            {t('settings.language.system', { language: LANGUAGE_NAMES[systemLanguage] })}
          </option>
          {/* Each language is listed in its own words, so it can be found from any other. */}
          {LANGUAGES.map((language) => (
            <option key={language} value={language} lang={language}>
              {LANGUAGE_NAMES[language]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={launchId}>{t('settings.launchAtLogin.label')}</Label>
          <p className="text-muted-foreground text-xs">{t('settings.launchAtLogin.help')}</p>
        </div>
        <Switch
          id={launchId}
          checked={settings.launchAtLogin}
          onCheckedChange={(launchAtLogin) => void update({ launchAtLogin })}
        />
      </div>
    </section>
  )
}

function AppearanceSection({
  settings,
  update
}: {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}): React.JSX.Element {
  const { t } = useTranslation()
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
      aria-label={t('settings.section.appearance')}
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t('settings.theme.label')}</span>
        <div
          role="radiogroup"
          aria-label={t('settings.theme.label')}
          className="bg-muted flex rounded-md p-0.5"
        >
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={settings.theme === theme}
              className={cn(
                'rounded px-3 py-1 text-xs transition-colors',
                settings.theme === theme
                  ? 'bg-card text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => void update({ theme })}
            >
              {t(`settings.theme.${theme}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={hueId}>{t('settings.accent')}</Label>
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
          <Label htmlFor={motionId}>{t('settings.reduceMotion.label')}</Label>
          <p className="text-muted-foreground text-xs">{t('settings.reduceMotion.help')}</p>
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
  if (seconds < 60 || seconds % 60 !== 0) {
    return i18n.t('settings.refresh.seconds', { count: seconds })
  }
  const minutes = seconds / 60
  return minutes === 1
    ? i18n.t('settings.refresh.everyMinute')
    : i18n.t('settings.refresh.minutes', { count: minutes })
}

function WidgetSection({
  settings,
  update
}: {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}): React.JSX.Element {
  const { t } = useTranslation()
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
      aria-label={t('settings.section.widget')}
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={onTopId}>{t('settings.alwaysOnTop.label')}</Label>
          <p className="text-muted-foreground text-xs">{t('settings.alwaysOnTop.help')}</p>
        </div>
        <Switch
          id={onTopId}
          checked={settings.alwaysOnTop}
          onCheckedChange={(alwaysOnTop) => void update({ alwaysOnTop })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={opacityId}>{t('settings.opacity.label')}</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatPercent(opacity * 100)}
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
        <p className="text-muted-foreground text-xs">{t('settings.opacity.help')}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={intervalId}>{t('settings.refresh.label')}</Label>
          <p className="text-muted-foreground text-xs">{t('settings.refresh.help')}</p>
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

function SectionHeading({ children }: { children: string }): React.JSX.Element {
  return (
    // Letter spacing would pull Arabic's joined letters apart.
    <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase rtl:tracking-normal">
      {children}
    </h2>
  )
}

export function SettingsApp(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const { snapshots } = useUsage()
  const title = t('settings.title')

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <div className="bg-background h-screen overflow-y-auto">
      <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
        <h1 className="text-lg font-semibold">{title}</h1>

        {settings && (
          <div className="flex flex-col gap-3">
            <SectionHeading>{t('settings.section.general')}</SectionHeading>
            <GeneralSection settings={settings} update={update} />
          </div>
        )}

        {settings && (
          <div className="flex flex-col gap-3">
            <SectionHeading>{t('settings.section.appearance')}</SectionHeading>
            <AppearanceSection settings={settings} update={update} />
          </div>
        )}

        {settings && (
          <div className="flex flex-col gap-3">
            <SectionHeading>{t('settings.section.widget')}</SectionHeading>
            <WidgetSection settings={settings} update={update} />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <SectionHeading>{t('settings.section.providers')}</SectionHeading>

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
