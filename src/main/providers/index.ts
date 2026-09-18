import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, net } from 'electron'
import { secretVault } from '../store'
import { createClaudeProvider } from './claude'
import { summarizeActivity } from './claude/activity'
import { createAdminSpendReader } from './claude/admin-spend'
import {
  claudeConfigDir,
  createCredentialSources,
  directoryExists,
  readClaudeCredentials
} from './claude/credentials'
import { createSessionLog } from './claude/session-log'
import type { UsageProvider } from './types'

export function createProviders(): UsageProvider[] {
  const userAgent = `llm-usage-tracker/${app.getVersion()}`
  // Chromium's network stack rather than Node's, so system proxy settings and
  // the OS certificate store apply, as they would in a browser.
  const fetch = (url: string, init: RequestInit): Promise<Response> => net.fetch(url, init)

  const claudeDir = claudeConfigDir(process.env, homedir())
  const claudeSources = createCredentialSources(claudeDir)
  const claudeLog = createSessionLog(join(claudeDir, 'projects'))
  const claudeSpend = createAdminSpendReader({
    // The key stored for Claude in settings is the Anthropic Admin API key.
    readKey: () => Promise.resolve(secretVault.read('claude')),
    fetch,
    userAgent
  })

  return [
    createClaudeProvider({
      readCredentials: () => readClaudeCredentials(process.platform, claudeSources),
      isInstalled: () => directoryExists(claudeDir),
      fetch,
      readLocalActivity: async (knownResetAt) => {
        const now = Date.now()
        return summarizeActivity(await claudeLog.collect(now), now, knownResetAt)
      },
      readApiSpend: (signal) => claudeSpend.read(signal),
      userAgent
    })
  ]
}
