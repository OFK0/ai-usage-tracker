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

const WINDOW_LABELS = new Map([
  ['session', 'Session'],
  ['weekly', 'Weekly'],
  ['weekly_opus', 'Weekly · Opus'],
  ['weekly_sonnet', 'Weekly · Sonnet']
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
  const tool = PROVIDER_TOOLS[snapshot.providerId]

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
      // Usually the sign-in has just expired, and opening the tool renews it.
      return `Open ${tool} to update usage`
    case 'not_installed':
      return `${tool} not found`
    case 'error':
      return "Couldn't load usage"
  }
}
