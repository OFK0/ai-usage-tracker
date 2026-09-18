import type { Credits, LimitWindow, ProviderSnapshot } from '@shared/usage'
import { Progress } from '@/components/ui/progress'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { providerName, resetText, statusText, windowLabel } from './labels'

function WindowRow({
  window,
  provider,
  now
}: {
  window: LimitWindow
  provider: string
  now: number
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

  const reset = resetText(window, now)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className={cn(window.exhausted && 'text-destructive font-medium')}>
          {window.unlimited
            ? 'Unlimited'
            : window.exhausted
              ? 'Limit reached'
              : `${Math.round(window.usedPercent)}%`}
        </span>
      </div>
      {!window.unlimited && (
        <Progress value={window.usedPercent} aria-label={`${provider} ${label} usage`} />
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
        <WindowRow key={window.key} window={window} provider={name} now={now} />
      ))}

      {snapshot.credits?.enabled && <CreditsRow credits={snapshot.credits} />}
    </li>
  )
}
