import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, net } from 'electron'
import { secretVault, settingsRepository } from '../store'
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
import { createCodexProvider } from './codex'
import { codexHome, readCodexAuth } from './codex/auth'
import { createSessionLog as createCodexSessionLog } from './codex/session-log'
import { createCopilotProvider } from './copilot'
import {
  createEditorProbe,
  createGhProbe,
  editorConfigDir,
  resolveCopilotToken
} from './copilot/token'
import type { UsageProvider } from './types'

export function createProviders(): UsageProvider[] {
  const userAgent = `ai-usage-tracker/${app.getVersion()}`
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

  const codexDir = codexHome(process.env, homedir())
  const codexLog = createCodexSessionLog(join(codexDir, 'sessions'))

  const probeGh = createGhProbe()
  const probeEditor = createEditorProbe(editorConfigDir(process.platform, process.env, homedir()))

  return [
    createClaudeProvider({
      isConnected: () => settingsRepository.get().providers.claude.connected,
      forgetLocalData: () => claudeLog.clear(),
      readCredentials: () => readClaudeCredentials(process.platform, claudeSources),
      isInstalled: () => directoryExists(claudeDir),
      fetch,
      readLocalActivity: async (knownResetAt) => {
        const now = Date.now()
        return summarizeActivity(await claudeLog.collect(now), now, knownResetAt)
      },
      readApiSpend: (signal) => claudeSpend.read(signal),
      userAgent
    }),
    createCodexProvider({
      isConnected: () => settingsRepository.get().providers.codex.connected,
      forgetLocalData: () => codexLog.clear(),
      readAuth: () => readCodexAuth(codexDir),
      fetch,
      readLoggedLimits: () => codexLog.latest(),
      userAgent
    }),
    createCopilotProvider({
      resolveToken: () =>
        resolveCopilotToken({
          // For Copilot the stored key is a GitHub token, used in place of gh's.
          readSavedToken: () => secretVault.read('copilot'),
          isConnected: () => settingsRepository.get().providers.copilot.connected,
          probeGh,
          probeEditor
        }),
      fetch,
      userAgent
    })
  ]
}
