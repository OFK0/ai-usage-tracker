import { MotionGlobalConfig, useReducedMotionConfig } from 'motion/react'

/**
 * True when things should appear in their final state instead of animating:
 * the user asked for less motion (in settings or in the OS), or animations are
 * switched off globally, as they are in tests.
 */
export function useStillMotion(): boolean {
  return (useReducedMotionConfig() ?? false) || MotionGlobalConfig.skipAnimations === true
}

/** The spring used for anything that settles into place. */
export const SETTLE = { type: 'spring', stiffness: 260, damping: 26, mass: 0.7 } as const
