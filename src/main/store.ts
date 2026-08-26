import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Tiny debounced JSON store. Writes go to a temp file first and are renamed into
 * place, so a crash mid-write can never leave a half-written settings file behind.
 */
export class JsonStore<T extends object> {
  private readonly filePath: string
  private readonly defaults: T
  private data: T
  private timer: NodeJS.Timeout | null = null

  constructor(fileName: string, defaults: T) {
    this.filePath = join(app.getPath('userData'), fileName)
    this.defaults = defaults
    this.data = { ...defaults }

    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<T>
        this.data = { ...defaults, ...parsed }
      }
    } catch {
      // Corrupt or unreadable file: fall back to defaults rather than failing to boot.
      this.data = { ...defaults }
    }
  }

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.schedule()
    return this.data
  }

  replace(next: T): T {
    this.data = next
    this.schedule()
    return this.data
  }

  reset(): T {
    return this.replace({ ...this.defaults })
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.filePath)
    } catch {
      // Persistence is best-effort; losing it must never take the app down.
    }
  }
}
