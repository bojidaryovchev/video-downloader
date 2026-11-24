import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddResult,
  BinariesInfo,
  QueueItem,
  Settings,
  UpdateResult
} from '../shared/types'

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:choose-folder')
  },
  queue: {
    list: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:list'),
    add: (text: string): Promise<AddResult> => ipcRenderer.invoke('queue:add', text),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('queue:remove', id),
    start: (id?: string): Promise<void> => ipcRenderer.invoke('queue:start', id),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('queue:cancel', id),
    cancelAll: (): Promise<void> => ipcRenderer.invoke('queue:cancel-all'),
    clearFinished: (): Promise<void> => ipcRenderer.invoke('queue:clear-finished'),
    retryMetadata: (id: string): Promise<void> => ipcRenderer.invoke('queue:retry-metadata', id),
    /** Subscribe to queue updates; returns an unsubscribe function. */
    onChange: (handler: (items: QueueItem[]) => void): (() => void) => {
      const listener = (_event: unknown, items: QueueItem[]): void => handler(items)
      ipcRenderer.on('queue:changed', listener)
      return () => ipcRenderer.removeListener('queue:changed', listener)
    }
  },
  binaries: {
    info: (): Promise<BinariesInfo> => ipcRenderer.invoke('binaries:info'),
    updateYtDlp: (): Promise<UpdateResult> => ipcRenderer.invoke('binaries:update-ytdlp')
  },
  system: {
    reveal: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:reveal', filePath),
    openPath: (target: string): Promise<string> => ipcRenderer.invoke('shell:open-path', target),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
    readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read')
  },
  captcha: {
    solve: (id: string): Promise<void> => ipcRenderer.invoke('captcha:solve', id)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
