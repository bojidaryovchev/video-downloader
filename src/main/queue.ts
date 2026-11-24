import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { JsonStore } from './store'
import { fetchMetadata, parseCaptchaUrl, startDownload, YtDlpError, type DownloadHandle } from './ytdlp'
import type { AddResult, QueueItem, Settings } from '../shared/types'

/** How many metadata probes may run at once, independent of the download slots. */
const METADATA_CONCURRENCY = 3

/** Progress arrives ~2x/s per item; coalesce renderer updates to keep the UI cheap. */
const EMIT_INTERVAL_MS = 200

interface QueueFile {
  items: QueueItem[]
}

/** States that mean "this URL is already in flight", used for de-duplication. */
const LIVE_STATUSES = new Set<QueueItem['status']>([
  'fetching',
  'ready',
  'queued',
  'downloading',
  'processing'
])

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export class DownloadQueue extends EventEmitter {
  private items: QueueItem[] = []
  private readonly store: JsonStore<QueueFile>
  private readonly downloads = new Map<string, DownloadHandle>()
  private readonly metaAborts = new Map<string, AbortController>()
  private metaRunning = 0
  private emitTimer: NodeJS.Timeout | null = null

  constructor(private readonly getSettings: () => Settings) {
    super()
    this.store = new JsonStore<QueueFile>('queue.json', { items: [] })

    // Nothing survives a restart mid-flight: demote anything that was running.
    this.items = this.store.get().items.map((item) => {
      if (!LIVE_STATUSES.has(item.status)) return item
      if (item.status === 'fetching') {
        return { ...item, status: 'error', error: 'Metadata lookup was interrupted' }
      }
      return { ...item, status: 'ready', progress: undefined }
    })
  }

  list(): QueueItem[] {
    return this.items
  }

  add(rawInput: string): AddResult {
    // Split on whitespace, then again before any embedded scheme so `a,b` pasted on one
    // line still yields two links — without breaking a single URL that contains a comma
    // in its query string.
    const candidates = rawInput
      .split(/\s+/)
      .flatMap((chunk) => chunk.split(/(?=https?:\/\/)/))
      .map((s) => s.trim().replace(/[,;]+$/, ''))
      .filter(Boolean)

    const result: AddResult = { added: 0, duplicates: 0, invalid: [] }

    for (const candidate of candidates) {
      if (!isHttpUrl(candidate)) {
        result.invalid.push(candidate)
        continue
      }
      const existing = this.items.find(
        (item) => item.url === candidate && LIVE_STATUSES.has(item.status)
      )
      if (existing) {
        result.duplicates += 1
        continue
      }

      const item: QueueItem = {
        id: randomUUID(),
        url: candidate,
        status: 'fetching',
        addedAt: Date.now()
      }
      this.items.push(item)
      result.added += 1
      void this.resolveMetadata(item.id)
    }

    if (result.added > 0 || result.duplicates > 0) this.changed()
    return result
  }

  remove(id: string): void {
    this.cancel(id)
    this.items = this.items.filter((item) => item.id !== id)
    this.changed()
  }

  clearFinished(): void {
    const finished = new Set<QueueItem['status']>(['completed', 'error', 'canceled'])
    this.items = this.items.filter((item) => !finished.has(item.status))
    this.changed()
  }

  /** Move one item — or every startable item — into the run queue. */
  start(id?: string): void {
    const startable = new Set<QueueItem['status']>(['ready', 'error', 'canceled'])
    for (const item of this.items) {
      if (id !== undefined && item.id !== id) continue
      if (!startable.has(item.status)) continue
      this.patch(item.id, { status: 'queued', error: undefined, progress: undefined })
    }
    this.changed()
    this.pump()
  }

  cancel(id: string): void {
    const abort = this.metaAborts.get(id)
    if (abort) {
      abort.abort()
      this.metaAborts.delete(id)
    }

    // Keep the slot reserved until the process actually exits; the `finally` in
    // run() releases it. Dropping it here would over-subscribe `concurrency`.
    this.downloads.get(id)?.cancel()

    const item = this.find(id)
    if (item && LIVE_STATUSES.has(item.status)) {
      this.patch(id, { status: 'canceled', progress: undefined })
    }
    this.changed()
    this.pump()
  }

  cancelAll(): void {
    for (const item of [...this.items]) {
      if (LIVE_STATUSES.has(item.status) && item.status !== 'ready') this.cancel(item.id)
    }
  }

  /** Re-run metadata for an item whose lookup failed, then it can be started again. */
  retryMetadata(id: string): void {
    const item = this.find(id)
    if (!item || item.status !== 'error') return
    this.patch(id, { status: 'fetching', error: undefined })
    this.changed()
    void this.resolveMetadata(id)
  }

  /** Resume a CAPTCHA-failed item using cookies extracted from the solver window. */
  retryWithCookies(id: string, cookieFile: string): void {
    const item = this.find(id)
    if (!item || item.status !== 'error') return
    this.patch(id, { status: 'fetching', error: undefined, captchaUrl: undefined, cookieFile })
    this.changed()
    void this.resolveMetadata(id)
  }

  /**
   * Resume a CAPTCHA-failed item using a direct stream URL intercepted from the browser.
   * Skips metadata re-fetch and immediately queues the download, since stream URLs can expire.
   */
  retryWithStream(id: string, streamUrl: string, cookieFile: string | undefined, streamHeaders: string[]): void {
    const item = this.find(id)
    if (!item || item.status !== 'error') return
    this.patch(id, {
      status: 'queued',
      error: undefined,
      captchaUrl: undefined,
      cookieFile,
      streamUrl,
      streamHeaders
    })
    this.changed()
    this.pump()
  }

  /** Re-evaluate free slots — call after `concurrency` changes. */
  refresh(): void {
    this.pump()
  }

  dispose(): void {
    this.cancelAll()
    for (const abort of this.metaAborts.values()) abort.abort()
    this.metaAborts.clear()
    this.flush()
  }

  // ---------------------------------------------------------------- internals

  private find(id: string): QueueItem | undefined {
    return this.items.find((item) => item.id === id)
  }

  private patch(id: string, patch: Partial<QueueItem>): void {
    const index = this.items.findIndex((item) => item.id === id)
    if (index === -1) return
    this.items[index] = { ...this.items[index], ...patch }
  }

  private changed(): void {
    this.store.replace({ items: this.items })
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('change', this.items)
    }, EMIT_INTERVAL_MS)
  }

  private flush(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    this.store.replace({ items: this.items })
    this.store.flush()
  }

  private async resolveMetadata(id: string): Promise<void> {
    if (this.metaRunning >= METADATA_CONCURRENCY) {
      // Retry once a slot frees up; probes are short, so a light poll is fine here.
      setTimeout(() => void this.resolveMetadata(id), 300)
      return
    }

    const item = this.find(id)
    if (!item || item.status !== 'fetching') return

    const controller = new AbortController()
    this.metaAborts.set(id, controller)
    this.metaRunning += 1

    try {
      const meta = await fetchMetadata(item.url, controller.signal, item.cookieFile)
      if (!this.find(id)) return

      const autoStart = this.getSettings().autoStart
      this.patch(id, { ...meta, status: autoStart ? 'queued' : 'ready', error: undefined })
      this.changed()
      if (autoStart) this.pump()
    } catch (err) {
      if (!this.find(id)) return
      if (controller.signal.aborted) {
        this.patch(id, { status: 'canceled' })
      } else {
        const message = err instanceof YtDlpError ? err.message : String(err)
        this.patch(id, { status: 'error', error: message, captchaUrl: parseCaptchaUrl(message) })
      }
      this.changed()
    } finally {
      this.metaRunning -= 1
      this.metaAborts.delete(id)
    }
  }

  /** Fill every free download slot with the next queued item. */
  private pump(): void {
    const { concurrency } = this.getSettings()
    while (this.downloads.size < Math.max(1, concurrency)) {
      const next = this.items.find((item) => item.status === 'queued')
      if (!next) return
      this.run(next.id)
    }
  }

  private run(id: string): void {
    const item = this.find(id)
    if (!item) return

    const settings = this.getSettings()
    try {
      mkdirSync(settings.downloadDir, { recursive: true })
    } catch (err) {
      this.patch(id, {
        status: 'error',
        error: `Cannot create download folder: ${(err as Error).message}`
      })
      this.changed()
      return
    }

    this.patch(id, { status: 'downloading', error: undefined, filePath: undefined })
    this.changed()

    const handle = startDownload(
      {
        url: item.url,
        streamUrl: item.streamUrl,
        downloadDir: settings.downloadDir,
        outputTemplate: settings.outputTemplate,
        cookieFile: item.cookieFile,
        addHeaders: item.streamHeaders
      },
      {
        onProgress: (progress) => {
          const current = this.find(id)
          if (!current || (current.status !== 'downloading' && current.status !== 'processing')) {
            return
          }
          this.patch(id, { status: 'downloading', progress })
          this.changed()
        },
        onProcessing: () => {
          const current = this.find(id)
          if (!current || current.status !== 'downloading') return
          this.patch(id, { status: 'processing' })
          this.changed()
        },
        onLog: (line) => this.emit('log', { id, line })
      }
    )

    this.downloads.set(id, handle)

    handle.done
      .then((filePath) => {
        this.patch(id, {
          status: 'completed',
          filePath,
          progress: { percent: 100, speed: '', eta: '', downloaded: 0, total: 0 }
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        const isCanceled = message === 'Canceled'
        this.patch(id, {
          status: isCanceled ? 'canceled' : 'error',
          error: isCanceled ? undefined : message,
          captchaUrl: isCanceled ? undefined : parseCaptchaUrl(message),
          progress: undefined
        })
      })
      .finally(() => {
        this.downloads.delete(id)
        this.changed()
        this.pump()
      })
  }
}
