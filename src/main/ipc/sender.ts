/**
 * Decides whether an IPC message came from one of our own pages.
 *
 * Packaged builds load the renderer from disk, so only file: URLs qualify. In
 * development the renderer is served by Vite, and its origin is trusted too.
 * Anything else, such as a page reached through a link, is refused.
 */
export function isTrustedRendererUrl(url: string, devServerUrl?: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol === 'file:') return true

  if (!devServerUrl) return false

  try {
    return parsed.origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}
