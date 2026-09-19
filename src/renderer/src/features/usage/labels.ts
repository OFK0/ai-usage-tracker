import type { ProviderId } from '@shared/app-info'
import type en from '@shared/i18n/locales/en.json'
import type { ApiSpend, LimitWindow, LocalActivity, ProviderSnapshot } from '@shared/usage'
import { i18n } from '@/i18n'
import { formatDuration, formatMoney, formatNumber } from '@/lib/format'

/** Product names stay as they are in every language. */
const PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot'
}

/** What the user has to open or sign in to for each provider. */
const PROVIDER_TOOLS: Record<ProviderId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  copilot: 'GitHub'
}

type WindowKey = keyof (typeof en)['window']

export function providerName(id: ProviderId): string {
  return PROVIDER_NAMES[id]
}

function isKnownWindow(key: string): key is WindowKey {
  return i18n.exists(`window.${key}`)
}

/** A window the app has no name for is shown as the API calls it, made readable. */
function humanize(key: string): string {
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function windowLabel(window: LimitWindow): string {
  const base = isKnownWindow(window.key) ? i18n.t(`window.${window.key}`) : humanize(window.key)
  return window.scope ? `${base} · ${window.scope}` : base
}

export function hasReset(window: LimitWindow, now: number): boolean {
  return window.resetsAt !== null && Date.parse(window.resetsAt) <= now
}

/**
 * `fresh` is false while the snapshot is stale or signed out. A window that
 * resets in that state has certainly started over, so the old number is wrong,
 * but there's no new one yet either.
 */
export function resetText(window: LimitWindow, now: number, fresh = true): string | null {
  if (!window.resetsAt) return null
  if (hasReset(window, now)) return fresh ? i18n.t('reset.resetting') : i18n.t('reset.waiting')
  return i18n.t('reset.in', { duration: formatDuration(Date.parse(window.resetsAt) - now) })
}

/** The raw count behind the percentage, for providers that report one. */
export function countText(window: LimitWindow): string | null {
  if (window.used === null || window.limit === null || !window.applicable || window.unlimited) {
    return null
  }
  return i18n.t('common.xOfY', {
    used: formatNumber(window.used),
    limit: formatNumber(window.limit)
  })
}

export function activityText(providerId: ProviderId, activity: LocalActivity, now: number): string {
  const { block } = activity
  if (!block) return i18n.t('activity.none', { tool: PROVIDER_TOOLS[providerId] })

  const remaining = Date.parse(block.endsAt) - now
  // An estimated window is marked as such; the API's own is shown as is.
  const endsIn = `${block.exact ? '' : '~'}${formatDuration(Math.max(remaining, 0))}`
  return i18n.t('activity.session', {
    messages: i18n.t('activity.messages', { count: block.messages }),
    duration: endsIn
  })
}

export function spendText(spend: ApiSpend, locale?: string): string {
  return i18n.t('spend', {
    today: formatMoney(spend.today, spend.currency, locale),
    month: formatMoney(spend.month, spend.currency, locale)
  })
}

/** A line under the provider name, or null when there is nothing to say. */
export function statusText(snapshot: ProviderSnapshot, now: number): string | null {
  switch (snapshot.status) {
    case 'loading':
      return i18n.t('status.loading')
    case 'ok':
      return null
    case 'stale': {
      const age = snapshot.fetchedAt ? now - Date.parse(snapshot.fetchedAt) : null
      return age === null
        ? i18n.t('status.stale')
        : i18n.t('status.staleSince', { duration: formatDuration(age) })
    }
    case 'unauthenticated':
      // Claude Code and Codex renew their sign-in when opened; GitHub's has to be redone.
      return i18n.t(`status.signIn.${snapshot.providerId}`)
    case 'not_installed':
      return i18n.t(`status.notInstalled.${snapshot.providerId}`)
    case 'disconnected':
      return i18n.t('status.disconnected')
    case 'error':
      return i18n.t('status.error')
  }
}
