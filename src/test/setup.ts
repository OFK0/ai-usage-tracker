import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

// Tests check where things end up, not how they got there.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
})
