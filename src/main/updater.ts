import { net } from 'electron'
import { execFile } from 'node:child_process'
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { exeName, userBinDir } from './binaries'
import type { UpdateResult } from '../shared/types'

const execFileAsync = promisify(execFile)

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

/** The release asset name yt-dlp publishes for this platform. */
function assetName(): string | null {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  if (process.platform === 'linux') return 'yt-dlp_linux'
  return null
}

/**
 * Download the newest yt-dlp into userData/bin. `resolveBinary` prefers that copy
 * over the bundled one, so the app can outlive the yt-dlp version it shipped with —
 * which matters, because extractors break whenever a site changes.
 */
export async function updateYtDlp(): Promise<UpdateResult> {
  const asset = assetName()
  if (!asset) {
    return { ok: false, message: `No yt-dlp release build for ${process.platform}` }
  }

  const targetDir = userBinDir()
  const target = join(targetDir, exeName('yt-dlp'))
  const temp = `${target}.download`

  try {
    mkdirSync(targetDir, { recursive: true })

    const response = await net.fetch(`${RELEASE_BASE}/${asset}`)
    if (!response.ok) {
      return { ok: false, message: `Download failed: HTTP ${response.status}` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength < 1024 * 512) {
      return { ok: false, message: 'Download looked truncated; kept the existing version' }
    }

    writeFileSync(temp, buffer)
    if (process.platform !== 'win32') chmodSync(temp, 0o755)
    renameSync(temp, target)

    const { stdout } = await execFileAsync(target, ['--version'], {
      timeout: 20_000,
      windowsHide: true
    })
    const version = stdout.trim()
    return { ok: true, version, message: `Updated yt-dlp to ${version}` }
  } catch (err) {
    try {
      rmSync(temp, { force: true })
    } catch {
      // Nothing useful to do if the temp file cannot be cleaned up.
    }
    return { ok: false, message: (err as Error).message }
  }
}
