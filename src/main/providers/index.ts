import { homedir } from 'node:os'
import { app, net } from 'electron'
import { createClaudeProvider } from './claude'
import {
  claudeConfigDir,
  createCredentialSources,
  directoryExists,
  readClaudeCredentials
} from './claude/credentials'
import type { UsageProvider } from './types'

export function createProviders(): UsageProvider[] {
  const userAgent = `llm-usage-tracker/${app.getVersion()}`
  const claudeDir = claudeConfigDir(process.env, homedir())
  const claudeSources = createCredentialSources(claudeDir)

  return [
    createClaudeProvider({
      readCredentials: () => readClaudeCredentials(process.platform, claudeSources),
      isInstalled: () => directoryExists(claudeDir),
      // Chromium's network stack rather than Node's, so system proxy settings
      // and the OS certificate store apply, as they would in a browser.
      fetch: (url, init) => net.fetch(url, init),
      userAgent
    })
  ]
}
