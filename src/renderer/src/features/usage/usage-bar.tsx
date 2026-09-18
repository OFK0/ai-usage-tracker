import { cn } from '@/lib/utils'
import type { UsageLevel } from './usage-level'

/**
 * A thin usage bar. The fill uses the accent gradient and switches to amber and
 * then red past the thresholds; colours live in main.css keyed on data-level.
 * The fill grows from the inline start, so it reads correctly right to left too.
 */
export function UsageBar({
  value,
  level,
  label,
  stale = false,
  className
}: {
  value: number
  level: UsageLevel
  label: string
  stale?: boolean
  className?: string
}): React.JSX.Element {
  const percent = Math.min(Math.max(value, 0), 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      data-level={level}
      data-stale={stale}
      className={cn('bg-usage-track flex h-1.5 w-full overflow-hidden rounded-full', className)}
    >
      <div
        className="usage-fill h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
