# Video Downloader

A desktop app for queueing video downloads. Paste one or more links, see what each one
actually is (thumbnail, title, channel, duration, size) before committing, then start the
downloads when you're ready.

Built on Electron + React, driving `yt-dlp` and `ffmpeg` — both of which are **bundled into
the shipped build**, so the installed app needs nothing preinstalled on the target machine.

## What it does

- **Paste in bulk.** One link or twenty, newline- or space-separated. Duplicates already in
  flight are skipped.
- **Metadata first.** Each link is resolved with `yt-dlp -J` before anything downloads, so
  you can confirm you queued the right thing.
- **Manual start.** Nothing downloads until you press Start — per item or for the whole
  queue. There's an opt-in "start as soon as a link is added" toggle in settings.
- **Live progress.** Percent, transferred/total, speed and ETA, plus a distinct state while
  ffmpeg merges the separate video and audio streams.
- **Survives restarts.** The queue is persisted; anything interrupted comes back as ready to
  start rather than silently lost.

Downloads use yt-dlp's default format selection — the same thing you get from a bare
`yt-dlp <url>`, which is best-quality video plus best audio, merged.

## Getting started

```bash
npm install
npm run fetch:bin   # downloads yt-dlp + ffmpeg into resources/bin/ (~80 MB, once)
npm run dev
```

`fetch:bin` is required before `dev` or a packaged build. The binaries are deliberately not
committed — rerun it with `--force` whenever you want fresher ones:

```bash
node scripts/fetch-binaries.mjs --force
```

## Building something shippable

```bash
npm run dist:win        # NSIS installer + portable exe, both into dist/
npm run dist:portable   # just the single-file portable exe
```

The portable target produces one self-contained `.exe` you can hand to someone: it carries
Electron, the app, yt-dlp and ffmpeg inside it, and needs no installation. It lands at about
**170 MB** — Electron accounts for most of that, ffmpeg for the rest.

## How the binaries are shipped

`resources/bin/<platform>/` is copied into the package by electron-builder's
`extraResources`, landing at `resources/bin/` inside the installed app. At runtime
[`binaries.ts`](src/main/binaries.ts) resolves each tool in this order:

1. **`userData/bin/`** — a newer copy downloaded by the in-app updater
2. **the bundled copy** — what shipped with this build
3. **`PATH`** — whatever the machine already has

That first step matters: yt-dlp breaks whenever a site changes its player, and a shipped app
that can only ever use the yt-dlp it was built with has a short shelf life. Settings has an
**Update yt-dlp** button that pulls the latest release into `userData/bin/`, where it takes
precedence over the bundled one. No reinstall, no admin rights.

ffmpeg comes from [BtbN's builds](https://github.com/BtbN/FFmpeg-Builds) — the **LGPL shared**
variant. Shared rather than static because `ffmpeg.exe` and `ffprobe.exe` then share one set
of DLLs (~146 MB instead of ~290 MB), and LGPL rather than GPL because it is the less
demanding license to redistribute. Everything yt-dlp needs — muxing, remuxing, audio
extraction — is present in the LGPL build; only GPL-only *encoders* like x264 are missing,
and downloading never re-encodes.

## Site fixes (yt-dlp plugins)

`resources/yt-dlp-plugins/` holds yt-dlp plugins for sites the current yt-dlp release can't
handle yet. electron-builder ships the folder next to the binaries, and every yt-dlp run gets
it via `--plugin-dirs`, so the plugins also apply to a yt-dlp pulled in by the updater.

- **`kvs.py`** overrides parts of the generic extractor for KVS (Kernel Video Sharing)
  sites. Pages that match none of these cases pass through unchanged.
  - yt-dlp looks for embedded videos before it looks for a KVS player, and stops at the
    first it finds. On x-x-x.tube that is an autoplaying ad clip in a `<video>` tag, which
    yt-dlp downloaded instead of the video, with no error. When a page loads
    `kt_player.js`, the plugin tries the KVS player first and falls back to yt-dlp's usual
    order if that fails.
  - yt-dlp titles KVS videos from the page's `<title>`. On x-x-x.tube that wraps the title in
    SEO text ("Watch … XXX Porn Video in HD | X-X-X.tube"), so for that site the plugin uses
    `og:title` instead.
  - Newer KVS player builds (kt_player 2.7.x, e.g. x-fetish.tube) give the player config a
    random name on each page load instead of `flashvars`, and yt-dlp fails with "Unable to
    extract flashvars". The plugin finds the real name in the `kt_player(...)` call and
    aliases it to `flashvars`.
  - Some pages show a video from another site through an iframe in KVS's `embed-wrap` player
    slot (old camwhores.tv videos, embedded from camvideos.org). The embed only shows its
    player when the parent page is the Referer, so yt-dlp reported "Unsupported URL". When
    nothing else is found on a page, the plugin follows that iframe with the page as Referer.
- **`noodlemagazine.py`**: noodlemagazine.com answers yt-dlp's default HTTP client with 403
  Forbidden. The plugin makes yt-dlp's NoodleMagazine extractor request pages with Chrome
  impersonation (curl_cffi, bundled in the Windows yt-dlp build). Video files download
  normally.
- **`cam_archives.py`** adds extractors for archivebate.live and livecamrips.to. Neither
  site, nor the file hosts they embed, is supported by yt-dlp. Each page embeds its video
  from a file host in an iframe, and the plugin names the file after the model, platform
  and show time. livecamrips pages are requested with Chrome impersonation, because
  Cloudflare rejects yt-dlp's default client there. The hosts switch domains often, so the
  plugin recognises each one by its player page rather than its URL:
  - MixDrop: a packed script holds the direct MP4 URL. The file server rejects the
    embedding site as Referer, so downloads send MixDrop's own player page instead.
  - Uqload, abstream, and hosts with the same JW Player setup: a script holds an HLS
    playlist, packed on Uqload and plain on abstream.
  - Streamcash: a base64 JSON config holds an HLS playlist.
  - Not supported: hosts that hand out the stream only in exchange for a CAPTCHA token
    (vinovo). The error message says so.

Each plugin is a workaround. Once a yt-dlp release handles the site itself, delete the
plugin. Run yt-dlp with `-v` to see which plugins loaded (`[debug] Extractor Plugins: ...`).

## Project layout

```
src/
  main/           Electron main process
    binaries.ts   locate yt-dlp/ffmpeg (userData > bundled > PATH)
    ytdlp.ts      spawn yt-dlp, parse progress, kill process trees
    queue.ts      queue state machine, concurrency, persistence
    updater.ts    pull a newer yt-dlp into userData
    store.ts      debounced atomic JSON persistence
    index.ts      window lifecycle + IPC surface
  preload/        contextBridge API (sandboxed, no node in the renderer)
  renderer/       React UI
  shared/         types used by all three
resources/
  bin/<platform>/ yt-dlp + ffmpeg, fetched by fetch:bin (not committed)
  yt-dlp-plugins/ yt-dlp plugins we maintain (site fixes)
scripts/
  fetch-binaries.mjs
```

### How progress is read

yt-dlp is spawned with a machine-readable `--progress-template` carrying a `@@P@@` marker,
plus `--print after_move:@@F@@%(filepath)s` to learn the final filename. One wrinkle worth
knowing: `--print` implies `--quiet`, which suppresses the postprocessor banners — hence the
explicit `--no-quiet` and a second `postprocess:` template, which is what drives the
"Merging" state.

yt-dlp also gets `--encoding utf-8`. The bundled `yt-dlp.exe` is a PyInstaller build, which
ignores `PYTHONIOENCODING` and otherwise writes in the Windows ANSI code page. File names with
characters outside that code page then came back mangled, so the app recorded paths that
didn't exist and "Show in folder" failed for those downloads.

Cancelling kills the whole process tree (`taskkill /T` on Windows). Killing only yt-dlp
leaves an orphaned ffmpeg holding the output file open.

`--ignore-config` is passed to every invocation, so a personal `yt-dlp.conf` on the machine
can't change what the app does. If you rely on a global yt-dlp config, that's the line to
remove.

## Notes

- **`ELECTRON_RUN_AS_NODE`.** Some editor-integrated terminals export this. Electron then
  boots as plain Node and the app dies with `Cannot read properties of undefined (reading
  'isPackaged')`. `electron.vite.config.ts` deletes the variable so `npm run dev` works from
  any terminal.
- **Windows only, so far.** The code paths are platform-agnostic and `fetch-binaries.mjs`
  knows about Linux, but only Windows has been built and exercised.
- Playlist URLs resolve to their first video (`--no-playlist`). Expanding a playlist into
  individual queue entries is not implemented.
