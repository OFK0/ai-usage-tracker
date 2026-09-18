import type { Credits, LimitWindow, ProviderSnapshot } from '@shared/usage'
import { Progress } from '@/components/ui/progress'
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

function usageLabel(window: LimitWindow, resetSinceFetch: boolean): string {
  if (resetSinceFetch) return 'Reset'
  if (window.unlimited) return 'Unlimited'
  if (window.exhausted) return 'Limit reached'
  return `${Math.round(window.usedPercent)}%`
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

  if (!window.applicable) {
    return (
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{label}</span>
        <span>Not in plan</span>
      </div>
    )
  }

  // Once a window has reset, numbers from before it are no longer true.
  const resetSinceFetch = !fresh && hasReset(window, now)
  const reset = resetText(window, now, fresh)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span
          className={cn(
            window.exhausted && !resetSinceFetch && 'text-destructive font-medium',
            resetSinceFetch && 'text-muted-foreground'
          )}
        >
          {usageLabel(window, resetSinceFetch)}
        </span>
      </div>
      {!window.unlimited && (
        <Progress
          value={resetSinceFetch ? 0 : window.usedPercent}
          aria-label={`${provider} ${label} usage`}
        />
      )}
      {reset && <p className="text-muted-foreground text-[11px]">{reset}</p>}
    </div>
  )
}

function CreditsRow({ credits }: { credits: Credits }): React.JSX.Element {
  const used = formatMoney(credits.used, credits.currency)
  const limit = credits.limit === null ? null : formatMoney(credits.limit, credits.currency)

  return (
    <div className="flex justify-between text-xs">
      <span>Credits</span>
      <span>{limit ? `${used} of ${limit}` : used}</span>
    </div>
  )
}

export function ProviderCard({
  snapshot,
  now
}: {
  snapshot: ProviderSnapshot
  now: number
}): React.JSX.Element {
  const name = providerName(snapshot.providerId)
  const status = statusText(snapshot, now)
  const fresh = snapshot.status === 'ok'

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{name}</span>
        {snapshot.planLabel && (
          <span className="text-muted-foreground bg-muted rounded px-1.5 text-[10px]">
            {snapshot.planLabel}
          </span>
        )}
      </div>

      {status && (
        <p className="text-muted-foreground text-xs" title={snapshot.detail ?? undefined}>
          {status}
        </p>
      )}

      {snapshot.windows.map((window) => (
        <WindowRow key={window.key} window={window} provider={name} now={now} fresh={fresh} />
      ))}

      {snapshot.activity && (
        <p className="text-muted-foreground text-[11px]" title="From the local session logs">
          {activityText(snapshot.providerId, snapshot.activity, now)}
        </p>
      )}

      {snapshot.credits?.enabled && <CreditsRow credits={snapshot.credits} />}

      {snapshot.apiSpend && (
        <div className="flex justify-between gap-2 text-xs" title="Anthropic API, UTC days">
          <span>API spend</span>
          <span>{spendText(snapshot.apiSpend)}</span>
        </div>
      )}
    </li>
  )
}
