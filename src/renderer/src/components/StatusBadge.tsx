import type { JSX } from 'react'
import type { ItemStatus } from '@shared/types'

const STYLES: Record<ItemStatus, { label: string; className: string }> = {
  fetching: { label: 'Reading', className: 'bg-amber-500/10 text-amber-300 ring-amber-500/30' },
  ready: { label: 'Ready', className: 'bg-slate-500/10 text-slate-300 ring-slate-500/30' },
  queued: { label: 'Queued', className: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30' },
  downloading: { label: 'Downloading', className: 'bg-sky-500/10 text-sky-300 ring-sky-500/30' },
  processing: { label: 'Merging', className: 'bg-violet-500/10 text-violet-300 ring-violet-500/30' },
  completed: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
  error: { label: 'Failed', className: 'bg-rose-500/10 text-rose-300 ring-rose-500/30' },
  canceled: { label: 'Canceled', className: 'bg-slate-500/10 text-slate-400 ring-slate-500/30' }
}

const PULSING: ItemStatus[] = ['fetching', 'downloading', 'processing']

export default function StatusBadge({ status }: { status: ItemStatus }): JSX.Element {
  const { label, className } = STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      <span
        className={`size-1.5 rounded-full bg-current ${PULSING.includes(status) ? 'animate-pulse' : ''}`}
      />
      {label}
    </span>
  )
}
