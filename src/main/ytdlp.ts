import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { ffmpegLocation, ytdlpPath, ytdlpPluginDir } from './binaries'
import type { Progress } from '../shared/types'

const MARK_PROGRESS = '@@P@@'
const MARK_FILE = '@@F@@'
const MARK_POST = '@@PP@@'

/** Postprocessor banners that mean "yt-dlp is done downloading and is now muxing". */
const POSTPROCESS_RE =
  /^\[(Merger|ExtractAudio|VideoRemuxer|VideoConvertor|EmbedSubtitle|Metadata|ffmpeg|Fixup\w*)\]/

// Strip terminal escape sequences, should any slip through despite NO_COLOR.
// Built from a char code so no literal control character lives in the source.
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g')

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' }
}

// The bundled yt-dlp.exe is a PyInstaller build, which ignores PYTHONIOENCODING and
// writes in the Windows ANSI code page (e.g. cp1251). Characters outside that code page
// were dropped or garbled, so file names with accents, emoji, CJK, or the full-width
// lookalikes yt-dlp substitutes for | ? * came back as paths that don't exist.
const ENCODING_ARGS = ['--encoding', 'utf-8']

/** Load our bundled yt-dlp plugins (site fixes) for both metadata and downloads. */
function pluginArgs(): string[] {
  const dir = ytdlpPluginDir()
  return dir ? ['--plugin-dirs', dir] : []
}

/** Splits a stream into lines and hands each one to `onLine`, keeping any partial tail. */
function lineReader(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    // --newline makes progress newline-terminated, but tolerate bare \r too.
    const parts = buffer.split(/\r\n|\r|\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.replace(ANSI_RE, '').trim()
      if (line) onLine(line)
    }
  }
}

function num(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function parseProgress(payload: string): Progress {
  const [percent, speed, eta, downloaded, total, totalEstimate] = payload.split('|')
  const pct = parseFloat((percent ?? '').replace('%', '').trim())
  return {
    percent: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0,
    speed: (speed ?? '').trim().replace(/^NA$/, ''),
    eta: (eta ?? '').trim().replace(/^NA$/, ''),
    downloaded: num(downloaded ?? ''),
    total: num(total ?? '') || num(totalEstimate ?? '')
  }
}

export interface Metadata {
  title?: string
  thumbnail?: string
  duration?: number
  uploader?: string
  extractor?: string
  webpageUrl?: string
  uploadDate?: string
  viewCount?: number
  filesizeApprox?: number
  resolution?: string
  ext?: string
}

interface RawFormat {
  filesize?: number
  filesize_approx?: number
  height?: number
  ext?: string
}

interface RawInfo {
  title?: string
  thumbnail?: string
  thumbnails?: { url?: string; preference?: number; width?: number }[]
  duration?: number
  uploader?: string
  channel?: string
  uploader_id?: string
  extractor_key?: string
  extractor?: string
  webpage_url?: string
  original_url?: string
  upload_date?: string
  release_date?: string
  view_count?: number
  filesize?: number
  filesize_approx?: number
  resolution?: string
  height?: number
  width?: number
  ext?: string
  requested_formats?: RawFormat[]
  entries?: RawInfo[]
}

function pickThumbnail(info: RawInfo): string | undefined {
  if (info.thumbnail) return info.thumbnail
  const list = info.thumbnails ?? []
  if (!list.length) return undefined
  // Prefer the largest thumbnail that actually has a usable URL.
  const best = [...list]
    .filter((t) => typeof t.url === 'string')
    .sort((a, b) => (b.width ?? b.preference ?? 0) - (a.width ?? a.preference ?? 0))[0]
  return best?.url
}

function normalize(raw: RawInfo): Metadata {
  // A playlist URL that survived --no-playlist still comes back as a container.
  const info = raw.entries?.length ? (raw.entries[0] as RawInfo) : raw

  const formats = info.requested_formats ?? []
  const summedSize = formats.reduce((total, f) => total + (f.filesize ?? f.filesize_approx ?? 0), 0)
  const maxHeight = formats.reduce((h, f) => Math.max(h, f.height ?? 0), info.height ?? 0)

  return {
    title: info.title,
    thumbnail: pickThumbnail(info),
    duration: typeof info.duration === 'number' ? info.duration : undefined,
    uploader: info.uploader ?? info.channel ?? info.uploader_id,
    extractor: info.extractor_key ?? info.extractor,
    webpageUrl: info.webpage_url ?? info.original_url,
    uploadDate: info.upload_date ?? info.release_date,
    viewCount: info.view_count,
    filesizeApprox: summedSize || info.filesize || info.filesize_approx || undefined,
    resolution: info.resolution ?? (maxHeight ? `${maxHeight}p` : undefined),
    ext: info.ext
  }
}

export class YtDlpError extends Error {
  readonly detail?: string

  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'YtDlpError'
    this.detail = detail
  }
}

/** Pull the most human-readable line out of yt-dlp's stderr. */
function summarizeError(stderr: string, code: number | null): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.replace(ANSI_RE, '').trim())
    .filter(Boolean)
  const errorLine = [...lines].reverse().find((l) => /^ERROR:/i.test(l))
  if (errorLine) return errorLine.replace(/^ERROR:\s*/i, '').trim()
  return lines[lines.length - 1] ?? `yt-dlp exited with code ${code ?? 'unknown'}`
}

export async function fetchMetadata(url: string, signal?: AbortSignal): Promise<Metadata> {
  const args = [
    '-J',
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--ignore-config',
    ...ENCODING_ARGS,
    ...pluginArgs(),
    url
  ]

  const child = spawn(ytdlpPath(), args, { windowsHide: true, env: childEnv() })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c: string) => {
    stdout += c
  })
  child.stderr.on('data', (c: string) => {
    stderr += c
  })

  const onAbort = (): void => {
    child.kill()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })

    if (signal?.aborted) throw new YtDlpError('Canceled')
    if (code !== 0) throw new YtDlpError(summarizeError(stderr, code), stderr)

    const firstBrace = stdout.indexOf('{')
    if (firstBrace === -1) throw new YtDlpError('yt-dlp returned no metadata', stderr)

    return normalize(JSON.parse(stdout.slice(firstBrace)) as RawInfo)
  } catch (err) {
    if (err instanceof YtDlpError) throw err
    const message = err instanceof Error ? err.message : String(err)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new YtDlpError('yt-dlp executable not found', message)
    }
    throw new YtDlpError(message, stderr)
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

export interface DownloadHandlers {
  onProgress: (progress: Progress) => void
  onProcessing: () => void
  onLog: (line: string) => void
}

export interface DownloadOptions {
  url: string
  downloadDir: string
  outputTemplate: string
}

export interface DownloadHandle {
  /** Resolves with the final file path, when yt-dlp reported one. */
  done: Promise<string | undefined>
  cancel: () => void
}

/** Kill the whole tree — yt-dlp spawns ffmpeg, and killing only the parent orphans it. */
function killTree(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

export function startDownload(options: DownloadOptions, handlers: DownloadHandlers): DownloadHandle {
  const ffmpegDir = ffmpegLocation()

  const progressTemplate =
    `download:${MARK_PROGRESS}%(progress._percent_str)s|%(progress._speed_str)s` +
    `|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s` +
    `|%(progress.total_bytes_estimate)s`

  // Postprocessing (the ffmpeg merge) reports through its own template. Watching
  // this is more reliable than pattern-matching the `[Merger]` banner.
  const postprocessTemplate = `postprocess:${MARK_POST}%(progress.status)s`

  const args = [
    '--ignore-config',
    ...ENCODING_ARGS,
    '--no-playlist',
    '--newline',
    '--progress',
    '--no-simulate',
    // `--print` implies `--quiet`, which would swallow the postprocessor banners.
    '--no-quiet',
    '--progress-delta',
    '0.5',
    '--progress-template',
    progressTemplate,
    '--progress-template',
    postprocessTemplate,
    '--print',
    `after_move:${MARK_FILE}%(filepath)s`,
    '--paths',
    options.downloadDir,
    '--output',
    options.outputTemplate,
    ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
    ...pluginArgs(),
    options.url
  ]

  const child = spawn(ytdlpPath(), args, { windowsHide: true, env: childEnv() })

  let canceled = false
  let filePath: string | undefined
  const stderrTail: string[] = []

  const handleLine = (line: string, isStderr: boolean): void => {
    if (line.startsWith(MARK_PROGRESS)) {
      handlers.onProgress(parseProgress(line.slice(MARK_PROGRESS.length)))
      return
    }
    if (line.startsWith(MARK_FILE)) {
      filePath = line.slice(MARK_FILE.length).trim()
      return
    }
    if (line.startsWith(MARK_POST)) {
      if (line.slice(MARK_POST.length).trim() === 'started') handlers.onProcessing()
      return
    }
    if (POSTPROCESS_RE.test(line)) handlers.onProcessing()
    if (isStderr) {
      stderrTail.push(line)
      if (stderrTail.length > 60) stderrTail.shift()
    }
    handlers.onLog(line)
  }

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', lineReader((l) => handleLine(l, false)))
  child.stderr.on('data', lineReader((l) => handleLine(l, true)))

  const done = new Promise<string | undefined>((resolve, reject) => {
    child.on('error', (err) => {
      const e = err as NodeJS.ErrnoException
      reject(
        new YtDlpError(
          e.code === 'ENOENT' ? 'yt-dlp executable not found' : e.message,
          stderrTail.join('\n')
        )
      )
    })
    child.on('close', (code) => {
      const detail = stderrTail.join('\n')
      if (canceled) reject(new YtDlpError('Canceled'))
      else if (code === 0) resolve(filePath)
      else reject(new YtDlpError(summarizeError(detail, code), detail))
    })
  })

  return {
    done,
    cancel: () => {
      canceled = true
      killTree(child)
    }
  }
}
