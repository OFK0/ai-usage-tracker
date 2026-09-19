import type { LimitWindow } from '@shared/usage'
import { ProviderError } from '../types'
import { codexPlanLabel, codexWindows, isRecord } from './rate-limits'

export interface CodexUsage {
  planLabel: string | null
  windows: LimitWindow[]
}

/** Parses GET https://chatgpt.com/backend-api/wham/usage, what `codex /status` shows. */
export function parseCodexUsage(body: unknown, now: number): CodexUsage {
  if (!isRecord(body)) {
    throw new ProviderError('unexpected_response', 'Unexpected Codex response: not an object')
  }

  const limits = body['rate_limit'] ?? body['rate_limits']
  const windows = isRecord(limits)
    ? codexWindows(
        limits['primary_window'] ?? limits['primary'],
        limits['secondary_window'] ?? limits['secondary'],
        now
      )
    : []

  if (windows.length === 0) {
    throw new ProviderError('unexpected_response', 'Unexpected Codex response: no rate limits')
  }
  return { planLabel: codexPlanLabel(body['plan_type']), windows }
}
