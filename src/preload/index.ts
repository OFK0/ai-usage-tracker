import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** Surface exposed to the renderer. Grows as providers and settings land. */
const api = {
  getVersions: (): NodeJS.ProcessVersions => process.versions
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
