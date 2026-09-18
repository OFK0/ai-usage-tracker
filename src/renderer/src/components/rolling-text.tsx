import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Text that rolls upward when it changes, like an odometer: the old line slides
 * out the top as the new one comes in from below. Used for countdowns, which
 * change by themselves every minute.
 */
export function RollingText({
  text,
  className
}: {
  text: string
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
