import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'
import { i18n } from '@/i18n'

// Tests check where things end up, not how they got there.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
  // Tests read English unless they switch; one that does mustn't leak into the next.
  void i18n.changeLanguage('en')
})
