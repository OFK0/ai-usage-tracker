import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import type {
  EventArgs,
  EventChannel,
  InvokeChannel,
  InvokeResult,
  SendChannel
} from '@shared/ipc-contract'
import { isTrustedRendererUrl } from './sender'

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  return isTrustedRendererUrl(event.senderFrame?.url ?? '', devServerUrl)
}

/**
 * Registers an invoke handler. Arguments arrive as unknown on purpose: the
 * contract types what the preload sends, but the renderer is the untrusted side
 * of the boundary, so each handler validates what it actually received.
 */
export function handle<C extends InvokeChannel>(
  channel: C,
  handler: (...args: unknown[]) => InvokeResult<C> | Promise<InvokeResult<C>>
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event)) {
      throw new Error(`Refused "${channel}" from an untrusted sender`)
    }
    return handler(...args)
  })
}

export function listen<C extends SendChannel>(
  channel: C,
  handler: (...args: unknown[]) => void
): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (isTrustedSender(event)) handler(...args)
  })
}

export function broadcast<C extends EventChannel>(channel: C, ...args: EventArgs<C>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, ...args)
  }
}
