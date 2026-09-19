import { copyFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** The data folder the app used while it was called LLM Usage Tracker. */
export const LEGACY_FOLDER = 'llm-usage-tracker'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Carries the settings over from the folder the app used under its old name.
 *
 * Only config.json comes along, which holds the settings and the widget
 * position. Stored tokens can't: the key that encrypts them belongs to the old
 * profile (on Windows it sits in that folder's Local State, on macOS and Linux
 * in a keychain entry named after the app), so under the new name they would
 * only ever fail to decrypt. They have to be entered again.
 *
 * Nothing is deleted, and once the new folder has settings of its own this does
 * nothing, so it is safe to run on every start.
 *
 * Only the app's own data folder takes them over. A folder given with
 * --user-data-dir, as tests do, starts fresh rather than with someone's
 * settings, connected providers included.
 */
export async function migrateLegacySettings(
  appData: string,
  userData: string,
  appName: string
): Promise<boolean> {
  if (userData !== join(appData, appName)) return false

  const from = join(appData, LEGACY_FOLDER, 'config.json')
  const to = join(userData, 'config.json')

  if (from === to || (await exists(to)) || !(await exists(from))) return false

  await mkdir(userData, { recursive: true })
  await copyFile(from, to)
  return true
}
