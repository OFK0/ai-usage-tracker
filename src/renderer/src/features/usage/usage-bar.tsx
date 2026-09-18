import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useStillMotion } from '@/theme/motion'
import type { UsageLevel } from './usage-level'

/**
 * A thin usage bar. The fill uses the accent gradient and switches to amber and
 * then red past the thresholds; colours live in main.css keyed on data-level,
 * as do the shimmer on stale data and the pulse on an exhausted limit.
 *
 * The fill springs to its value, from empty the first time, and grows from the
 * inline start, so it reads correctly right to left too.
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
  const still = useStillMotion()
  const percent = Math.min(Math.max(value, 0), 100)
  const width = `${percent}%`

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
      <motion.div
        className="usage-fill h-full rounded-full"
        initial={{ width: still ? width : 0 }}
        animate={{ width }}
        transition={
          still ? { duration: 0 } : { type: 'spring', stiffness: 70, damping: 18, mass: 0.9 }
        }
      />
    </div>
  )
}
