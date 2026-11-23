import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { BinariesInfo, QueueItem, Settings } from '@shared/types'
import UrlInput from './components/UrlInput'
import QueueCard from './components/QueueCard'
import SettingsPanel from './components/SettingsPanel'
import StatusFilter, {
  countByFilter,
  emptyMessage,
  matchesFilter,
  type StatusFilterKey
} from './components/StatusFilter'
import { DownloadIcon, GearIcon, PlayIcon, StopIcon, TrashIcon } from './components/Icons'

const STARTABLE: QueueItem['status'][] = ['ready', 'canceled', 'error']
const ACTIVE: QueueItem['status'][] = ['fetching', 'queued', 'downloading', 'processing']
const FINISHED: QueueItem['status'][] = ['completed', 'error', 'canceled']

function ToolbarButton({
  onClick,
  disabled,
  icon,
  children,
  primary = false
}: {
  onClick: () => void
  disabled?: boolean
  icon: JSX.Element
  children: string
  primary?: boolean
}): JSX.Element {
  const base =
    'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed'
  const style = primary
    ? 'bg-sky-500 text-white hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500'
    : 'border border-[#1f2a3d] text-slate-300 hover:border-[#2a3a55] hover:text-slate-100 disabled:text-slate-600 disabled:hover:border-[#1f2a3d]'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {icon}
      {children}
    </button>
  )
}

export default function App(): JSX.Element {
  const [items, setItems] = useState<QueueItem[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [binaries, setBinaries] = useState<BinariesInfo | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilterKey>('all')
  const listRef = useRef<HTMLElement>(null)

  // A new view starts at its top, not at wherever the previous one was scrolled.
  const selectFilter = useCallback((key: StatusFilterKey): void => {
    setFilter(key)
    listRef.current?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    void window.api.queue.list().then(setItems)
    void window.api.binaries.info().then(setBinaries)
    return window.api.queue.onChange(setItems)
  }, [])

  // Auto-dismiss the "added N links" style messages.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const counts = useMemo(
    () => ({
      startable: items.filter((item) => STARTABLE.includes(item.status)).length,
      active: items.filter((item) => ACTIVE.includes(item.status)).length,
      finished: items.filter((item) => FINISHED.includes(item.status)).length,
      byFilter: countByFilter(items)
    }),
    [items]
  )

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [items, filter]
  )

  const handleAdd = useCallback(async (text: string): Promise<void> => {
    const result = await window.api.queue.add(text)
    // Show what was just added, whichever view was open.
    if (result.added) selectFilter('all')
    const parts: string[] = []
    if (result.added) parts.push(`Added ${result.added} link${result.added === 1 ? '' : 's'}`)
    if (result.duplicates) parts.push(`${result.duplicates} already queued`)
    if (result.invalid.length) parts.push(`${result.invalid.length} not a valid URL`)
    setNotice(parts.join(' · ') || null)
  }, [selectFilter])

  const updateSettings = useCallback(async (patch: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.settings.set(patch))
  }, [])

  const chooseFolder = useCallback(async (): Promise<void> => {
    const chosen = await window.api.settings.chooseFolder()
    if (chosen) setSettings((current) => (current ? { ...current, downloadDir: chosen } : current))
  }, [])

  const updateYtDlp = useCallback(async (): Promise<string> => {
    const result = await window.api.binaries.updateYtDlp()
    setBinaries(await window.api.binaries.info())
    return result.message
  }, [])

  if (!settings) {
    return <div className="grid h-full place-items-center text-sm text-slate-500">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-[#1f2a3d] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-sky-500/15 text-sky-400">
            <DownloadIcon className="size-4.5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Video Downloader</h1>
            <p className="text-[11px] text-slate-500">
              {binaries?.ytdlp.version ? `yt-dlp ${binaries.ytdlp.version}` : 'yt-dlp unavailable'}
              {binaries?.ffmpeg.version ? ` · ffmpeg ${binaries.ffmpeg.version}` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSettings((open) => !open)}
          aria-label="Settings"
          className={`grid size-8 place-items-center rounded-lg transition-colors ${
            showSettings
              ? 'bg-white/10 text-slate-100'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
          }`}
        >
          <GearIcon className="size-4.5" />
        </button>
      </header>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          binaries={binaries}
          onChange={(patch) => void updateSettings(patch)}
          onChooseFolder={() => void chooseFolder()}
          onOpenFolder={() => void window.api.system.openPath(settings.downloadDir)}
          onUpdateYtDlp={updateYtDlp}
        />
      )}

      <div className="border-b border-[#1f2a3d] px-5 py-4">
        <UrlInput onAdd={handleAdd} />
        {notice && <p className="mt-2 text-xs text-slate-400">{notice}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#1f2a3d] px-5 py-2.5">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing queued</p>
        ) : (
          <StatusFilter value={filter} counts={counts.byFilter} onChange={selectFilter} />
        )}
        {/* ml-auto keeps the actions right-aligned when a narrow window wraps the row */}
        <div className="ml-auto flex items-center gap-2">
          <ToolbarButton
            primary
            icon={<PlayIcon className="size-4" />}
            disabled={counts.startable === 0}
            onClick={() => void window.api.queue.start()}
          >
            Start all
          </ToolbarButton>
          <ToolbarButton
            icon={<StopIcon className="size-4" />}
            disabled={counts.active === 0}
            onClick={() => void window.api.queue.cancelAll()}
          >
            Cancel all
          </ToolbarButton>
          <ToolbarButton
            icon={<TrashIcon className="size-4" />}
            disabled={counts.finished === 0}
            onClick={() => void window.api.queue.clearFinished()}
          >
            Clear finished
          </ToolbarButton>
        </div>
      </div>

      <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <DownloadIcon className="mx-auto size-10 text-slate-700" />
              <p className="mt-3 text-sm text-slate-400">Paste a video link to get started</p>
              <p className="mt-1 text-xs text-slate-600">
                Metadata is read first, then you decide when to download
              </p>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-slate-400">{emptyMessage(filter)}</p>
              <button
                type="button"
                onClick={() => selectFilter('all')}
                className="mt-2 text-xs text-sky-400 hover:text-sky-300 hover:underline"
              >
                Show all {items.length} item{items.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visibleItems.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onStart={(id) => void window.api.queue.start(id)}
                onCancel={(id) => void window.api.queue.cancel(id)}
                onRemove={(id) => void window.api.queue.remove(id)}
                onRetry={(id) => void window.api.queue.retryMetadata(id)}
                onReveal={(path) => void window.api.system.reveal(path)}
                onOpenFile={(path) => void window.api.system.openPath(path)}
                onOpenSource={(url) => void window.api.system.openExternal(url)}
              />
            ))}
          </ul>
        )}
      </main>

      <footer className="flex items-center gap-2 border-t border-[#1f2a3d] px-5 py-2 text-[11px] text-slate-500">
        <span className="shrink-0">Saving to</span>
        <button
          type="button"
          onClick={() => void window.api.system.openPath(settings.downloadDir)}
          title={settings.downloadDir}
          className="truncate text-slate-400 hover:text-slate-200 hover:underline"
        >
          {settings.downloadDir}
        </button>
      </footer>
    </div>
  )
}
