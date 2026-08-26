import { useState, type JSX } from 'react'
import type { QueueItem } from '@shared/types'
import StatusBadge from './StatusBadge'
import {
  AlertIcon,
  ExternalIcon,
  FilmIcon,
  FolderIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon
} from './Icons'
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatUploadDate,
  hostnameOf
} from '../format'

export interface QueueCardProps {
  item: QueueItem
  onStart: (id: string) => void
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onReveal: (path: string) => void
  onOpenFile: (path: string) => void
  onOpenSource: (url: string) => void
}

const ACTIVE: QueueItem['status'][] = ['fetching', 'queued', 'downloading', 'processing']
const STARTABLE: QueueItem['status'][] = ['ready', 'canceled', 'error']

function Thumbnail({ item }: { item: QueueItem }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const duration = formatDuration(item.duration)

  return (
    <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-slate-800/60 ring-1 ring-white/5">
      {item.thumbnail && !failed ? (
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-slate-600">
          <FilmIcon className="size-7" />
        </div>
      )}
      {duration && (
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
          {duration}
        </span>
      )}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  children,
  tone = 'default'
}: {
  label: string
  onClick: () => void
  children: JSX.Element
  tone?: 'default' | 'primary' | 'danger'
}): JSX.Element {
  const tones = {
    default: 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
    primary: 'text-sky-300 hover:bg-sky-500/15 hover:text-sky-200',
    danger: 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-300'
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

function ProgressRow({ item }: { item: QueueItem }): JSX.Element {
  const progress = item.progress
  const percent = item.status === 'processing' ? 100 : (progress?.percent ?? 0)
  const downloaded = formatBytes(progress?.downloaded)
  const total = formatBytes(progress?.total)

  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            item.status === 'processing' ? 'animate-pulse bg-violet-400' : 'bg-sky-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] tabular-nums text-slate-400">
        {item.status === 'processing' ? (
          <span>Merging streams with ffmpeg…</span>
        ) : (
          <>
            <span className="font-medium text-slate-300">{percent.toFixed(1)}%</span>
            {downloaded && total && (
              <span>
                {downloaded} / {total}
              </span>
            )}
            {progress?.speed && <span>{progress.speed}</span>}
            {progress?.eta && <span>ETA {progress.eta}</span>}
          </>
        )}
      </div>
    </div>
  )
}

export default function QueueCard({
  item,
  onStart,
  onCancel,
  onRemove,
  onRetry,
  onReveal,
  onOpenFile,
  onOpenSource
}: QueueCardProps): JSX.Element {
  const meta = [
    item.uploader,
    item.resolution,
    formatBytes(item.filesizeApprox),
    formatCount(item.viewCount) && `${formatCount(item.viewCount)} views`,
    formatUploadDate(item.uploadDate)
  ].filter(Boolean) as string[]

  const isActive = ACTIVE.includes(item.status)
  const canStart = STARTABLE.includes(item.status)
  const metadataMissing = item.status === 'error' && !item.title

  return (
    <li className="flex gap-4 rounded-xl border border-[#1f2a3d] bg-[#121826] p-3 transition-colors hover:border-[#2a3a55]">
      <Thumbnail item={item} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3
            title={item.title ?? item.url}
            className="line-clamp-2 text-sm leading-snug font-medium text-slate-100"
          >
            {item.title ?? item.url}
          </h3>
          <StatusBadge status={item.status} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
          <span className="text-slate-500">{item.extractor ?? hostnameOf(item.url)}</span>
          {meta.map((entry) => (
            <span key={entry} className="before:mr-2 before:text-slate-600 before:content-['·']">
              {entry}
            </span>
          ))}
        </div>

        {(item.status === 'downloading' || item.status === 'processing') && (
          <ProgressRow item={item} />
        )}

        {item.status === 'error' && item.error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300/90">
            <AlertIcon className="mt-px size-3.5 shrink-0" />
            <span className="line-clamp-2" title={item.error}>
              {item.error}
            </span>
          </p>
        )}

        {item.status === 'completed' && item.filePath && (
          <button
            type="button"
            onClick={() => onOpenFile(item.filePath as string)}
            title={item.filePath}
            className="mt-2 truncate text-left text-xs text-emerald-300/80 hover:text-emerald-200 hover:underline"
          >
            {item.filePath}
          </button>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        {canStart && !metadataMissing && (
          <ActionButton label="Start download" tone="primary" onClick={() => onStart(item.id)}>
            <PlayIcon className="size-4" />
          </ActionButton>
        )}
        {metadataMissing && (
          <ActionButton label="Retry metadata" tone="primary" onClick={() => onRetry(item.id)}>
            <RefreshIcon className="size-4" />
          </ActionButton>
        )}
        {isActive && (
          <ActionButton label="Cancel" onClick={() => onCancel(item.id)}>
            <StopIcon className="size-4" />
          </ActionButton>
        )}
        {item.status === 'completed' && item.filePath && (
          <ActionButton label="Show in folder" onClick={() => onReveal(item.filePath as string)}>
            <FolderIcon className="size-4" />
          </ActionButton>
        )}
        <ActionButton
          label="Open source page"
          onClick={() => onOpenSource(item.webpageUrl ?? item.url)}
        >
          <ExternalIcon className="size-4" />
        </ActionButton>
        <ActionButton label="Remove from list" tone="danger" onClick={() => onRemove(item.id)}>
          <TrashIcon className="size-4" />
        </ActionButton>
      </div>
    </li>
  )
}
