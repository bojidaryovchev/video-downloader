#!/usr/bin/env node
/**
 * Downloads the third-party binaries the packaged app ships with.
 *
 *   node scripts/fetch-binaries.mjs [--force]
 *
 * They land in resources/bin/<platform>/ and are copied into the installer by
 * electron-builder's `extraResources`. They are deliberately not committed —
 * run this once after cloning, and again whenever you want fresher builds.
 */
import { execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const FORCE = process.argv.includes('--force')

const PLATFORM = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform]
if (!PLATFORM) {
  console.error(`Unsupported platform: ${process.platform}`)
  process.exit(1)
}

const OUT_DIR = join(ROOT, 'resources', 'bin', PLATFORM)

const YTDLP_ASSET = {
  win: 'yt-dlp.exe',
  mac: 'yt-dlp_macos',
  linux: 'yt-dlp_linux'
}[PLATFORM]

// LGPL rather than GPL (simpler to redistribute) and *shared* rather than static:
// ffmpeg.exe and ffprobe.exe share one set of DLLs, which cuts the payload from
// ~290 MB of executables down to ~150 MB. Everything yt-dlp needs — remuxing,
// merging, AAC/MP3 audio extraction — is present in the LGPL build.
const FFMPEG_ARCHIVE = {
  win: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl-shared.zip',
  linux:
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-lgpl.tar.xz',
  mac: null
}[PLATFORM]

const EXE = PLATFORM === 'win' ? '.exe' : ''

function log(message) {
  process.stdout.write(`${message}\n`)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function fetchYtDlp() {
  const target = join(OUT_DIR, `yt-dlp${EXE}`)
  if (!FORCE && (await exists(target))) {
    log('yt-dlp: already present (use --force to refresh)')
    return
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`
  log(`yt-dlp: downloading ${YTDLP_ASSET}…`)
  const temp = `${target}.part`
  await download(url, temp)
  await rename(temp, target)
  if (PLATFORM !== 'win') await chmod(target, 0o755)

  const version = execFileSync(target, ['--version'], { encoding: 'utf8' }).trim()
  log(`yt-dlp: ${version}`)
}

/** Unpack an archive using whatever the host provides — no npm dependency needed. */
function extract(archive, into) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${into}' -Force`
      ],
      { stdio: 'inherit' }
    )
    return
  }
  execFileSync('tar', ['-xf', archive, '-C', into], { stdio: 'inherit' })
}

/** Locate the directory inside the extracted tree that holds ffmpeg. */
async function findBinDir(root) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  const hit = entries.find((entry) => entry.isFile() && entry.name === `ffmpeg${EXE}`)
  return hit ? (hit.parentPath ?? hit.path) : null
}

async function fetchFfmpeg() {
  const required = [`ffmpeg${EXE}`, `ffprobe${EXE}`]
  const present = await Promise.all(required.map((name) => exists(join(OUT_DIR, name))))
  if (!FORCE && present.every(Boolean)) {
    log('ffmpeg: already present (use --force to refresh)')
    return
  }

  if (!FFMPEG_ARCHIVE) {
    log(`ffmpeg: no automated source for ${PLATFORM}; place ffmpeg${EXE} in ${OUT_DIR} manually`)
    return
  }

  const work = await mkdtemp(join(tmpdir(), 'vd-ffmpeg-'))
  try {
    const archive = join(work, FFMPEG_ARCHIVE.endsWith('.zip') ? 'ffmpeg.zip' : 'ffmpeg.tar.xz')
    log('ffmpeg: downloading build (~65 MB)...')
    await download(FFMPEG_ARCHIVE, archive)

    log('ffmpeg: extracting...')
    const unpacked = join(work, 'unpacked')
    await mkdir(unpacked, { recursive: true })
    extract(archive, unpacked)

    const binDir = await findBinDir(unpacked)
    if (!binDir) throw new Error('ffmpeg not found inside the downloaded archive')

    // Copy the whole bin folder: a shared build needs its DLLs beside the exe.
    // ffplay is the only thing in there we have no use for.
    let copied = 0
    for (const entry of await readdir(binDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('ffplay')) continue
      const target = join(OUT_DIR, entry.name)
      await rm(target, { force: true })
      await copyFile(join(binDir, entry.name), target)
      if (PLATFORM !== 'win') await chmod(target, 0o755)
      copied += 1
    }
    log(`ffmpeg: installed ${copied} file${copied === 1 ? '' : 's'}`)

    const version = execFileSync(join(OUT_DIR, `ffmpeg${EXE}`), ['-version'], { encoding: 'utf8' })
    log(`ffmpeg: ${version.split(/\r?\n/)[0].trim()}`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

await mkdir(OUT_DIR, { recursive: true })
await fetchYtDlp()
await fetchFfmpeg()
log(`\nBinaries ready in ${OUT_DIR}`)
