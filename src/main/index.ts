import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { JsonStore } from './store'
import { DownloadQueue } from './queue'
import { getBinariesInfo } from './binaries'
import { updateYtDlp } from './updater'
import type { QueueItem, Settings } from '../shared/types'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let settingsStore: JsonStore<Settings>
let queue: DownloadQueue

function defaultSettings(): Settings {
  return {
    downloadDir: app.getPath('downloads'),
    concurrency: 1,
    autoStart: false,
    outputTemplate: '%(title)s [%(id)s].%(ext)s'
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 880,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f17',
    title: 'Video Downloader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Anything that wants a new window (a source link, say) opens in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settingsStore.get())

  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => {
    const next: Partial<Settings> = {}
    if (typeof patch.downloadDir === 'string' && patch.downloadDir.trim()) {
      next.downloadDir = patch.downloadDir
    }
    if (typeof patch.concurrency === 'number') {
      next.concurrency = Math.min(5, Math.max(1, Math.round(patch.concurrency)))
    }
    if (typeof patch.autoStart === 'boolean') next.autoStart = patch.autoStart
    if (typeof patch.outputTemplate === 'string' && patch.outputTemplate.trim()) {
      next.outputTemplate = patch.outputTemplate.trim()
    }
    const updated = settingsStore.set(next)
    if (next.concurrency !== undefined) queue.refresh()
    return updated
  })

  ipcMain.handle('settings:choose-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose download folder',
      defaultPath: settingsStore.get().downloadDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return settingsStore.set({ downloadDir: result.filePaths[0] }).downloadDir
  })

  ipcMain.handle('queue:list', () => queue.list())
  ipcMain.handle('queue:add', (_event, text: string) => queue.add(text))
  ipcMain.handle('queue:remove', (_event, id: string) => queue.remove(id))
  ipcMain.handle('queue:start', (_event, id?: string) => queue.start(id))
  ipcMain.handle('queue:cancel', (_event, id: string) => queue.cancel(id))
  ipcMain.handle('queue:cancel-all', () => queue.cancelAll())
  ipcMain.handle('queue:clear-finished', () => queue.clearFinished())
  ipcMain.handle('queue:retry-metadata', (_event, id: string) => queue.retryMetadata(id))

  ipcMain.handle('binaries:info', () => getBinariesInfo())
  ipcMain.handle('binaries:update-ytdlp', () => updateYtDlp())

  ipcMain.handle('shell:reveal', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
  ipcMain.handle('shell:open-path', (_event, target: string) => shell.openPath(target))
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('clipboard:read', () => clipboard.readText())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    settingsStore = new JsonStore<Settings>('settings.json', defaultSettings())
    queue = new DownloadQueue(() => settingsStore.get())
    queue.on('change', (items: QueueItem[]) => send('queue:changed', items))

    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    queue?.dispose()
    settingsStore?.flush()
  })
}
