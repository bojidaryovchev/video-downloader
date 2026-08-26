import { app } from 'electron'
import { execFile } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { BinaryInfo, BinariesInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

const IS_WIN = process.platform === 'win32'

export function exeName(base: string): string {
  return IS_WIN ? `${base}.exe` : base
}

function platformDir(): string {
  if (IS_WIN) return 'win'
  return process.platform === 'darwin' ? 'mac' : 'linux'
}

/** Directory we download self-updated binaries into. Always user-writable. */
export function userBinDir(): string {
  return join(app.getPath('userData'), 'bin')
}

/** Binaries shipped inside the package (extraResources) or sitting in ./resources during dev. */
function bundledBinDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), 'resources', 'bin', platformDir())
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, IS_WIN ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Minimal `which`: scan PATH (respecting PATHEXT on Windows) for an executable. */
function whichSync(base: string): string | null {
  const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const exts = IS_WIN ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean) : ['']
  for (const dir of paths) {
    for (const ext of exts) {
      const candidate = join(dir, base + ext)
      if (existsSync(candidate) && isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Resolve a binary, preferring (1) a user-updated copy in userData, then
 * (2) the copy we ship, then (3) whatever is on PATH.
 */
export function resolveBinary(base: string): { path: string; source: BinaryInfo['source'] } {
  const userCopy = join(userBinDir(), exeName(base))
  if (existsSync(userCopy) && isExecutable(userCopy)) return { path: userCopy, source: 'user' }

  const bundled = join(bundledBinDir(), exeName(base))
  if (existsSync(bundled) && isExecutable(bundled)) return { path: bundled, source: 'bundled' }

  const onPath = whichSync(base)
  if (onPath) return { path: onPath, source: 'path' }

  // Last resort: hand the bare name to spawn and let the OS fail loudly.
  return { path: exeName(base), source: 'missing' }
}

export function ytdlpPath(): string {
  return resolveBinary('yt-dlp').path
}

export function ffmpegPath(): string {
  return resolveBinary('ffmpeg').path
}

/** yt-dlp wants the *directory* holding ffmpeg/ffprobe, not the executable itself. */
export function ffmpegLocation(): string | null {
  const { path, source } = resolveBinary('ffmpeg')
  return source === 'missing' ? null : dirname(path)
}

async function probeVersion(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

async function describe(base: string, versionArgs: string[]): Promise<BinaryInfo> {
  const { path, source } = resolveBinary(base)
  const version = source === 'missing' ? null : await probeVersion(path, versionArgs)
  return { path, source, version, found: version !== null }
}

export async function getBinariesInfo(): Promise<BinariesInfo> {
  const [ytdlp, ffmpeg] = await Promise.all([
    describe('yt-dlp', ['--version']),
    describe('ffmpeg', ['-version'])
  ])
  // `ffmpeg -version` prints a whole banner line; keep just the version token, and
  // shorten the "N-126264-g007cd1fd43-20260825" form git builds use.
  if (ffmpeg.version) {
    const token = /ffmpeg version (\S+)/.exec(ffmpeg.version)?.[1] ?? ffmpeg.version
    ffmpeg.version = /^N-\d+/.exec(token)?.[0] ?? token
  }
  return { ytdlp, ffmpeg }
}
