// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { estimateCurrentBlock, SESSION_MS, summarizeActivity } from './activity'
import type { UsageEntry } from './session-log'

const at = (time: string): number => Date.parse(`2026-09-18T${time}:00Z`)

function entry(time: string, output = 100): UsageEntry {
  return {
    key: `msg_${time}`,
    timestamp: at(time),
    tokens: { input: 10, output, cacheCreation: 5, cacheRead: 1000 }
  }
}

describe('estimateCurrentBlock', () => {
  it('opens a window at the hour of the first message and keeps it for five hours', () => {
    const block = estimateCurrentBlock([entry('07:42'), entry('09:10')], at('10:00'))

    expect(block).toEqual({ start: at('07:00'), end: at('07:00') + SESSION_MS })
  })

  it('opens a new window with the first message after the last one closed', () => {
    const block = estimateCurrentBlock(
      [entry('01:15'), entry('06:30'), entry('07:05')],
      at('08:00')
    )

    expect(block?.start).toBe(at('06:00'))
  })

  it('returns null once the last window has closed', () => {
    expect(estimateCurrentBlock([entry('01:15')], at('06:30'))).toBeNull()
  })

  it('returns null without any messages', () => {
    expect(estimateCurrentBlock([], at('10:00'))).toBeNull()
  })
})

describe('summarizeActivity', () => {
  it('uses the reset time from the API when it is still ahead', () => {
    const activity = summarizeActivity([entry('07:50'), entry('11:00')], at('12:00'), at('12:40'))

    expect(activity.block).toMatchObject({
      startedAt: new Date(at('07:40')).toISOString(),
      endsAt: new Date(at('12:40')).toISOString(),
      exact: true,
      messages: 2
    })
  })

  it('estimates the window once the known reset has passed, starting after it', () => {
    // 11:50 belongs to the window that closed at 12:40, so it must not pull the
    // estimate back to 11:00. The new window opens with the 13:05 message.
    const activity = summarizeActivity([entry('11:50'), entry('13:05')], at('13:30'), at('12:40'))

    expect(activity.block).toMatchObject({
      startedAt: new Date(at('13:00')).toISOString(),
      exact: false,
      messages: 1
    })
  })

  it('counts messages and tokens inside the window only', () => {
    const activity = summarizeActivity(
      [entry('01:00', 999), entry('07:10', 100), entry('08:20', 50)],
      at('09:00'),
      null
    )

    expect(activity.block?.messages).toBe(2)
    expect(activity.block?.tokens).toEqual({
      input: 20,
      output: 150,
      cacheCreation: 10,
      cacheRead: 2000
    })
  })

  it('reports when there has been no recent activity, and when the last message was', () => {
    const activity = summarizeActivity([entry('01:00')], at('09:00'), null)

    expect(activity).toEqual({ block: null, lastActivityAt: new Date(at('01:00')).toISOString() })
  })
})
