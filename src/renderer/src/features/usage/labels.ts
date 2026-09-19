import type { ProviderId } from '@shared/app-info'
import type { ApiSpend, LimitWindow, LocalActivity, ProviderSnapshot } from '@shared/usage'
import { formatDuration, formatMoney } from '@/lib/format'

/** English only for now; these move into the locale files with i18n. */

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

/**
 * What to do about a sign-in that is missing or no longer accepted. Claude Code
 * and Codex renew their own sign-in when opened; GitHub's has to be redone.
 */
const SIGN_IN_TEXT: Record<ProviderId, string> = {
  claude: 'Open Claude Code to update usage',
  codex: 'Open Codex CLI to update usage',
  copilot: 'Sign in to GitHub to see usage'
}

const NOT_INSTALLED_TEXT: Record<ProviderId, string> = {
  claude: 'Claude Code not found',
  codex: 'Codex CLI not found',
  copilot: 'No GitHub sign-in found'
}

const WINDOW_LABELS = new Map([
  ['session', 'Session'],
  ['weekly', 'Weekly'],
  ['weekly_opus', 'Weekly · Opus'],
  ['weekly_sonnet', 'Weekly · Sonnet'],
  ['chat', 'Chat'],
  ['completions', 'Code completions'],
  ['premium_interactions', 'Premium requests']
])

export function providerName(id: ProviderId): string {
  return PROVIDER_NAMES[id]
}

function humanize(key: string): string {
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function windowLabel(window: LimitWindow): string {
  const base = WINDOW_LABELS.get(window.key) ?? humanize(window.key)
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
  if (hasReset(window, now)) return fresh ? 'Resetting…' : 'Reset · waiting for fresh data'
  return `Resets in ${formatDuration(Date.parse(window.resetsAt) - now)}`
}

/** The raw count behind the percentage, for providers that report one. */
export function countText(window: LimitWindow, locale?: string): string | null {
  if (window.used === null || window.limit === null || !window.applicable || window.unlimited) {
    return null
  }
  const format = new Intl.NumberFormat(locale)
  return `${format.format(window.used)} of ${format.format(window.limit)}`
}

export function activityText(providerId: ProviderId, activity: LocalActivity, now: number): string {
  const { block } = activity
  if (!block) return `No ${PROVIDER_TOOLS[providerId]} activity in the last 5 hours`

  const messages = block.messages === 1 ? '1 message' : `${block.messages} messages`
  const remaining = Date.parse(block.endsAt) - now
  // An estimated window is marked as such; the API's own is shown as is.
  const endsIn = `${block.exact ? '' : '~'}${formatDuration(Math.max(remaining, 0))}`
  return `${messages} this session · ends in ${endsIn}`
}

export function spendText(spend: ApiSpend, locale?: string): string {
  const today = formatMoney(spend.today, spend.currency, locale)
  const month = formatMoney(spend.month, spend.currency, locale)
  return `${today} today · ${month} this month`
}

/** A line under the provider name, or null when there is nothing to say. */
export function statusText(snapshot: ProviderSnapshot, now: number): string | null {
  switch (snapshot.status) {
    case 'loading':
      return 'Loading…'
    case 'ok':
      return null
    case 'stale': {
      const age = snapshot.fetchedAt ? now - Date.parse(snapshot.fetchedAt) : null
      return age === null
        ? "Couldn't refresh"
        : `Couldn't refresh · updated ${formatDuration(age)} ago`
    }
    case 'unauthenticated':
      return SIGN_IN_TEXT[snapshot.providerId]
    case 'not_installed':
      return NOT_INSTALLED_TEXT[snapshot.providerId]
    case 'disconnected':
      return 'Not connected'
    case 'error':
      return "Couldn't load usage"
  }
}
