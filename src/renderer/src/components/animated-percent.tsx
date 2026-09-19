import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { formatPercent } from '@/lib/format'
import { useStillMotion } from '@/theme/motion'

interface Props {
  value: number
  className?: string
}

function RollingPercent({
  value,
  className,
  locale
}: Props & { locale: string }): React.JSX.Element {
  const still = useStillMotion()
  const spring = useSpring(still ? value : 0, { stiffness: 90, damping: 20, mass: 0.8 })
  const text = useTransform(spring, (current) => formatPercent(current, locale))

  useEffect(() => {
    if (still) spring.jump(value)
    else spring.set(value)
  }, [spring, value, still])

  return <motion.span className={className}>{text}</motion.span>
}

/** A percentage that rolls from its old value to its new one, and up from zero at first. */
export function AnimatedPercent(props: Props): React.JSX.Element {
  const { i18n } = useTranslation()
  // The number is formatted frame by frame outside React, so a new language
  // starts a new roll rather than leaving the old format in place.
  return <RollingPercent key={i18n.language} locale={i18n.language} {...props} />
}
