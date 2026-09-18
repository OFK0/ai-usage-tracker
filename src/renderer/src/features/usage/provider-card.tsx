import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ProviderId } from '@shared/app-info'
import type { LimitWindow, ProviderSnapshot } from '@shared/usage'
import { AnimatedPercent } from '@/components/animated-percent'
import { RollingText } from '@/components/rolling-text'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SETTLE } from '@/theme/motion'
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

/** Details fade and settle in rather than growing, so the window resizes once. */
const REVEAL = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.12 } },
  transition: SETTLE
} as const

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

interface WindowReading {
  /** Shown as is, unless `percent` is set, in which case the number rolls. */
  text: string
  percent: number | null
  level: UsageLevel
  value: number
  resetSinceFetch: boolean
}

/** How a window reads right now, including the case where it reset since the last fetch. */
function describeWindow(window: LimitWindow, now: number, fresh: boolean): WindowReading {
  // Once a window has reset, numbers from before it are no longer true.
  const resetSinceFetch = !fresh && hasReset(window, now)
  const level = usageLevel(window)
  const plain = (text: string, value: number): WindowReading => ({
    text,
    percent: null,
    level: resetSinceFetch ? 'normal' : level,
    value,
    resetSinceFetch
  })

  if (resetSinceFetch) return plain('Reset', 0)
  if (!window.applicable) return plain('Not in plan', 0)
  if (window.unlimited) return plain('Unlimited', 0)
  if (window.exhausted) return plain('Limit reached', 100)
  return {
    text: `${Math.round(window.usedPercent)}%`,
    percent: window.usedPercent,
    level,
    value: window.usedPercent,
    resetSinceFetch
  }
}

function Reading({
  reading,
  className
}: {
  reading: WindowReading
  className?: string
}): React.JSX.Element {
  const classes = cn(
    'tabular-nums',
    reading.resetSinceFetch ? 'text-muted-foreground' : LEVEL_TEXT[reading.level],
    className
  )
  return reading.percent === null ? (
    <span className={classes}>{reading.text}</span>
  ) : (
    <AnimatedPercent value={reading.percent} className={classes} />
  )
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
  const reading = describeWindow(window, now, fresh)
  const reset = window.applicable ? resetText(window, now, fresh) : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-foreground/85">{label}</span>
        <Reading reading={reading} />
      </div>
      {window.applicable && !window.unlimited && (
        <UsageBar
          value={reading.value}
          level={reading.level}
          stale={!fresh}
          label={`${provider} ${label} usage`}
        />
      )}
      {reset && <RollingText text={reset} className="text-muted-foreground text-[11px]" />}
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
  now,
  index = 0
}: {
  snapshot: ProviderSnapshot
  now: number
  /** Position in the list, used to stagger the cards as they come in. */
  index?: number
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
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ ...SETTLE, delay: index * 0.06 }}
      className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0"
    >
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

        {summary && <Reading reading={summary} className="text-xs" />}

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
              className={cn(
                'size-3.5 transition-transform duration-200',
                compact && '-rotate-90 rtl:rotate-90'
              )}
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

      <AnimatePresence mode="popLayout" initial={false}>
        {compact && headline && summary && (
          <motion.div key="compact" {...REVEAL} className="flex flex-col gap-1 ps-8.5">
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
          </motion.div>
        )}

        {!compact && hasDetails && (
          <motion.div key="details" {...REVEAL} className="flex flex-col gap-3 ps-8.5">
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}
