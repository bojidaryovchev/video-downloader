import type { JSX } from 'react'
import type { ItemStatus, QueueItem } from '@shared/types'

export type StatusFilterKey =
  | 'all'
  | 'ready'
  | 'queued'
  | 'downloading'
  | 'done'
  | 'failed'
  | 'canceled'

interface FilterView {
  key: StatusFilterKey
  label: string
  /** Statuses shown in this view; null shows every item. */
  statuses: ItemStatus[] | null
  /** Shown when the view is selected but has no items. */
  empty: string
}

// Lifecycle order. Labels match StatusBadge; the brief "Reading" state folds into
// Ready and "Merging" into Downloading, so a view never flickers in for a second.
const VIEWS: FilterView[] = [
  { key: 'all', label: 'All', statuses: null, empty: 'Nothing queued' },
  { key: 'ready', label: 'Ready', statuses: ['fetching', 'ready'], empty: 'Nothing waiting to start' },
  { key: 'queued', label: 'Queued', statuses: ['queued'], empty: 'Nothing queued' },
  {
    key: 'downloading',
    label: 'Downloading',
    statuses: ['downloading', 'processing'],
    empty: 'Nothing downloading right now'
  },
  { key: 'done', label: 'Done', statuses: ['completed'], empty: 'No finished downloads yet' },
  { key: 'failed', label: 'Failed', statuses: ['error'], empty: 'No failed items' },
  { key: 'canceled', label: 'Canceled', statuses: ['canceled'], empty: 'Nothing canceled' }
]

function viewFor(key: StatusFilterKey): FilterView {
  return VIEWS.find((view) => view.key === key) ?? VIEWS[0]
}

export function matchesFilter(item: QueueItem, key: StatusFilterKey): boolean {
  const { statuses } = viewFor(key)
  return statuses === null || statuses.includes(item.status)
}

export function countByFilter(items: QueueItem[]): Record<StatusFilterKey, number> {
  const counts = Object.fromEntries(VIEWS.map((view) => [view.key, 0])) as Record<
    StatusFilterKey,
    number
  >
  for (const item of items) {
    for (const view of VIEWS) {
      if (view.statuses === null || view.statuses.includes(item.status)) counts[view.key] += 1
    }
  }
  return counts
}

export function emptyMessage(key: StatusFilterKey): string {
  return viewFor(key).empty
}

export default function StatusFilter({
  value,
  counts,
  onChange
}: {
  value: StatusFilterKey
  counts: Record<StatusFilterKey, number>
  onChange: (key: StatusFilterKey) => void
}): JSX.Element {
  // Hide empty views, but never the selected one: it would vanish under the cursor
  // the moment its last item moves on (e.g. the final download finishing).
  const shown = VIEWS.filter((view) => view.key === 'all' || view.key === value || counts[view.key] > 0)

  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1">
      {shown.map((view) => {
        const selected = view.key === value
        return (
          <button
            key={view.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(view.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
              selected
                ? 'bg-white/10 text-slate-100'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {view.label}
            <span
              className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                selected ? 'bg-white/10 text-slate-200' : 'bg-white/5 text-slate-500'
              }`}
            >
              {counts[view.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
