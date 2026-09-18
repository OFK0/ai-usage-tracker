import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { useStillMotion } from '@/theme/motion'

/** A percentage that rolls from its old value to its new one, and up from zero at first. */
export function AnimatedPercent({
  value,
  className
}: {
  value: number
  className?: string
}): React.JSX.Element {
  const still = useStillMotion()
  const spring = useSpring(still ? value : 0, { stiffness: 90, damping: 20, mass: 0.8 })
  const text = useTransform(spring, (current) => `${Math.round(current)}%`)

  useEffect(() => {
    if (still) spring.jump(value)
    else spring.set(value)
  }, [spring, value, still])

  return <motion.span className={className}>{text}</motion.span>
}
