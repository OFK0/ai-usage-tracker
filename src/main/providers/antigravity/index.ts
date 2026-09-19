import { errorMessage } from '../../lib/http'
import { ProviderError, type UsageProvider } from '../types'
import type { ServerEndpoint } from './discovery'
import { readAntigravityQuota, ServerGoneError } from './quota'

export interface AntigravityProviderDeps {
  /** The user's connect switch in settings. Antigravity isn't looked for while it's off. */
  isConnected: () => boolean
  /** Looks for the running language server; null when none answers. */
  findServer: () => Promise<ServerEndpoint | null>
  /** Whether Antigravity is installed at all, to tell "not running" from "not installed". */
  isInstalled: () => Promise<boolean>
  call: (
    endpoint: ServerEndpoint,
    method: string,
    payload: object,
    signal: AbortSignal
  ) => Promise<{ status: number; body: unknown }>
}

/**
 * Antigravity's quotas, read from its own language server while it runs. The
 * server found is kept until it stops answering, since looking for it means
 * listing processes and ports; after a restart its port and token change, and
 * it's looked for once more.
 */
export function createAntigravityProvider(deps: AntigravityProviderDeps): UsageProvider {
  let endpoint: ServerEndpoint | null = null

  async function locate(): Promise<ServerEndpoint> {
    let found: ServerEndpoint | null
    try {
      found = await deps.findServer()
    } catch (error) {
      throw new ProviderError(
        'unavailable',
        `Couldn't look for Antigravity: ${errorMessage(error)}`
      )
    }
    if (found) return found

    // Like a CLI sign-in that has lapsed: the last numbers stay up, next to
    // "Open Antigravity to see usage".
    throw (await deps.isInstalled().catch(() => false))
      ? new ProviderError('unauthenticated', 'Antigravity is not running')
      : new ProviderError('not_installed', 'Antigravity was not found')
  }

  return {
    id: 'antigravity',

    read: async (signal) => {
      if (!deps.isConnected()) {
        endpoint = null
        throw new ProviderError('disconnected', 'Antigravity is not connected in settings')
      }

      // A kept endpoint may be stale; one found just now isn't looked for again.
      for (let attempt = 0; attempt < 2; attempt++) {
        const fresh = endpoint === null
        const current = (endpoint ??= await locate())
        try {
          const { planLabel, windows } = await readAntigravityQuota((method, payload) =>
            deps.call(current, method, payload, signal)
          )
          return {
            source: 'local',
            planLabel,
            windows,
            credits: null,
            activity: null,
            apiSpend: null
          }
        } catch (error) {
          if (!(error instanceof ServerGoneError)) throw error
          endpoint = null
          if (fresh) break
        }
      }
      throw new ProviderError('unavailable', 'Antigravity’s language server didn’t answer')
    }
  }
}
