import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ProviderId } from '@shared/app-info'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  activityText,
  hasReset,
  providerName,
  resetText,
  spendText,
  statusText,
  windowLabel
} from './labels'
import { UsageBar } from './usage-bar'
import { headlineWindow, usageLevel, type UsageLevel } from './usage-level'

const LEVEL_TEXT: Record<UsageLevel, string> = {
  normal: '',
  warning: 'text-usage-warn',
  critical: 'text-usage-critical',
  exhausted: 'text-usage-critical font-semibold',
  inactive: 'text-muted-foreground'
}

/** Remembered per provider across restarts; a failing storage just means no memory. */
function useCollapsed(provider: ProviderId): [boolean, () => void] {
  const key = `card-collapsed:${provider}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, collapsed ? '1' : '0')
    } catch {
      // Nothing to do: the card simply opens expanded next time.
    }
  }, [key, collapsed])

  return [collapsed, () => setCollapsed((current) => !current)]
}

/** How a window reads right now, including the case where it reset since the last fetch. */
function describeWindow(
  window: LimitWindow,
  now: number,
  fresh: boolean
): { text: string; level: UsageLevel; value: number; resetSinceFetch: boolean } {
  // Once a window has reset, numbers from before it are no longer true.
  const resetSinceFetch = !fresh && hasReset(window, now)
  const level = usageLevel(window)

  if (resetSinceFetch) return { text: 'Reset', level: 'normal', value: 0, resetSinceFetch }
  if (!window.applicable) return { text: 'Not in plan', level, value: 0, resetSinceFetch }
  if (window.unlimited) return { text: 'Unlimited', level, value: 0, resetSinceFetch }
  if (window.exhausted) return { text: 'Limit reached', level, value: 100, resetSinceFetch }
  return {
    text: `${Math.round(window.usedPercent)}%`,
    level,
    value: window.usedPercent,
    resetSinceFetch
  }
}

function WindowRow({
  window,
  provider,
  now,
  fresh
}: {
  window: LimitWindow
  provider: string
  now: number
  fresh: boolean
}): React.JSX.Element {
  const label = windowLabel(window)
  const { text, level, value, resetSinceFetch } = describeWindow(window, now, fresh)
  const reset = window.applicable ? resetText(window, now, fresh) : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-foreground/85">{label}</span>
        <span
          className={cn(
            'tabular-nums',
            resetSinceFetch ? 'text-muted-foreground' : LEVEL_TEXT[level]
          )}
        >
          {text}
        </span>
      </div>
      {window.applicable && !window.unlimited && (
        <UsageBar value={value} level={level} stale={!fresh} label={`${provider} ${label} usage`} />
      )}
      {reset && <p className="text-muted-foreground text-[11px]">{reset}</p>}
    </div>
  )
}

function DetailRow({
  label,
  value,
  title
}: {
  label: string
  value: string
  title?: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs" title={title}>
      <span className="text-foreground/85">{label}</span>
      <span className="text-muted-foreground text-end tabular-nums">{value}</span>
    </div>
  )
}

function Monogram({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="accent-gradient text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold shadow-sm"
    >
      {name.charAt(0)}
    </span>
  )
}

export function ProviderCard({
  snapshot,
  now
}: {
  snapshot: ProviderSnapshot
  now: number
}): React.JSX.Element {
  const { providerId, windows, credits, activity, apiSpend } = snapshot
  const name = providerName(providerId)
  const status = statusText(snapshot, now)
  const fresh = snapshot.status === 'ok'
  const [collapsed, toggle] = useCollapsed(providerId)

  const headline = headlineWindow(windows)
  const hasDetails =
    windows.length > 0 || credits?.enabled || activity !== null || apiSpend !== null
  const compact = collapsed && hasDetails
  const summary = compact && headline ? describeWindow(headline, now, fresh) : null

  return (
    <li className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Monogram name={name} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{name}</span>
            {snapshot.planLabel && (
              <span className="bg-primary/10 text-primary rounded px-1.5 py-px text-[10px] font-medium">
                {snapshot.planLabel}
              </span>
            )}
          </div>
          {status && (
            <p
              className="text-muted-foreground truncate text-[11px]"
              title={snapshot.detail ?? undefined}
            >
              {status}
            </p>
          )}
        </div>

        {summary && headline && (
          <span className={cn('text-xs tabular-nums', LEVEL_TEXT[summary.level])}>
            {summary.text}
          </span>
        )}

        {hasDetails && (
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground size-6"
            aria-expanded={!compact}
            aria-label={compact ? `Show ${name} details` : `Hide ${name} details`}
            onClick={toggle}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', compact && '-rotate-90 rtl:rotate-90')}
            />
          </Button>
        )}
      </div>

      {snapshot.status === 'disconnected' && (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => window.api.settings.open()}
        >
          Connect in settings
        </Button>
      )}

      {compact && headline && summary && (
        <div className="flex flex-col gap-1 ps-8.5">
          <UsageBar
            value={summary.value}
            level={summary.level}
            stale={!fresh}
            label={`${name} ${windowLabel(headline)} usage`}
          />
          <p className="text-muted-foreground text-[11px]">
            {windowLabel(headline)}
            {resetText(headline, now, fresh) ? ` · ${resetText(headline, now, fresh)}` : ''}
          </p>
        </div>
      )}

      {!compact && hasDetails && (
        <div className="flex flex-col gap-3 ps-8.5">
          {windows.map((window) => (
            <WindowRow key={window.key} window={window} provider={name} now={now} fresh={fresh} />
          ))}

          {activity && (
            <p className="text-muted-foreground text-[11px]" title="From the local session logs">
              {activityText(providerId, activity, now)}
            </p>
          )}

          {credits?.enabled && (
            <DetailRow
              label="Credits"
              value={
                credits.limit === null
                  ? formatMoney(credits.used, credits.currency)
                  : `${formatMoney(credits.used, credits.currency)} of ${formatMoney(credits.limit, credits.currency)}`
              }
            />
          )}

          {apiSpend && (
            <DetailRow
              label="API spend"
              value={spendText(apiSpend)}
              title="Anthropic API, UTC days"
            />
          )}
        </div>
      )}
    </li>
  )
}
