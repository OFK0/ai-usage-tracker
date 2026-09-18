import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** Surface exposed to the renderer. A typed contract replaces this in #10. */
const api = {
  hideWidget: (): void => ipcRenderer.send('widget:hide')
}

export type PreloadApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  throw new Error('contextIsolation must stay enabled')
}
