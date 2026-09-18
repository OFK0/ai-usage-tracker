import type { ProviderId } from '@shared/app-info'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import { formatDuration } from '@/lib/format'

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

export function resetText(window: LimitWindow, now: number): string | null {
  if (!window.resetsAt) return null
  const remaining = Date.parse(window.resetsAt) - now
  return remaining > 0 ? `Resets in ${formatDuration(remaining)}` : 'Resetting…'
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
      return `Sign in to ${tool} to see usage`
    case 'not_installed':
      return `${tool} not found`
    case 'error':
      return "Couldn't load usage"
  }
}
