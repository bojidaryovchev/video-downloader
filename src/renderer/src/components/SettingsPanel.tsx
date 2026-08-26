import { useState, type JSX } from 'react'
import type { BinariesInfo, BinaryInfo, Settings } from '@shared/types'
import { AlertIcon, CheckIcon, FolderIcon, RefreshIcon } from './Icons'

export interface SettingsPanelProps {
  settings: Settings
  binaries: BinariesInfo | null
  onChange: (patch: Partial<Settings>) => void
  onChooseFolder: () => void
  onOpenFolder: () => void
  onUpdateYtDlp: () => Promise<string>
}

const SOURCE_LABEL: Record<BinaryInfo['source'], string> = {
  user: 'updated copy',
  bundled: 'bundled with app',
  path: 'found on PATH',
  missing: 'not found'
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: JSX.Element
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}

function BinaryRow({ name, info }: { name: string; info: BinaryInfo }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#0e1420] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {info.found ? (
          <CheckIcon className="size-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertIcon className="size-4 shrink-0 text-rose-400" />
        )}
        <span className="text-sm text-slate-200">{name}</span>
        <span className="truncate text-xs text-slate-500" title={info.path}>
          {info.version ?? 'unavailable'} · {SOURCE_LABEL[info.source]}
        </span>
      </div>
    </div>
  )
}

export default function SettingsPanel({
  settings,
  binaries,
  onChange,
  onChooseFolder,
  onOpenFolder,
  onUpdateYtDlp
}: SettingsPanelProps): JSX.Element {
  const [updating, setUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  // Edited locally and committed on blur: the main process rejects an empty template,
  // so writing through on every keystroke would make the field impossible to clear.
  const [templateDraft, setTemplateDraft] = useState(settings.outputTemplate)

  const runUpdate = async (): Promise<void> => {
    setUpdating(true)
    setUpdateMessage(null)
    try {
      setUpdateMessage(await onUpdateYtDlp())
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="grid gap-5 border-b border-[#1f2a3d] bg-[#0e1420]/60 px-5 py-4 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Field label="Download folder">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={settings.downloadDir}
              title={settings.downloadDir}
              className="min-w-0 flex-1 truncate rounded-lg border border-[#1f2a3d] bg-[#0b0f17] px-3 py-1.5 text-sm text-slate-300"
            />
            <button
              type="button"
              onClick={onChooseFolder}
              className="rounded-lg border border-[#1f2a3d] px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-[#2a3a55] hover:text-slate-100"
            >
              Change
            </button>
            <button
              type="button"
              title="Open folder"
              aria-label="Open folder"
              onClick={onOpenFolder}
              className="grid size-8 place-items-center rounded-lg border border-[#1f2a3d] text-slate-300 transition-colors hover:border-[#2a3a55] hover:text-slate-100"
            >
              <FolderIcon className="size-4" />
            </button>
          </div>
        </Field>

        <Field
          label="File name template"
          hint="yt-dlp output template, applied when you click away from the field."
        >
          <input
            value={templateDraft}
            spellCheck={false}
            onChange={(event) => setTemplateDraft(event.target.value)}
            onBlur={() => {
              if (templateDraft.trim()) onChange({ outputTemplate: templateDraft })
              else setTemplateDraft(settings.outputTemplate)
            }}
            className="rounded-lg border border-[#1f2a3d] bg-[#0b0f17] px-3 py-1.5 font-mono text-xs text-slate-300 focus:border-sky-500/60 focus:outline-none"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-6">
          <Field label="Parallel downloads">
            <select
              value={settings.concurrency}
              onChange={(event) => onChange({ concurrency: Number(event.target.value) })}
              className="rounded-lg border border-[#1f2a3d] bg-[#0b0f17] px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500/60 focus:outline-none"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(event) => onChange({ autoStart: event.target.checked })}
              className="size-4 accent-sky-500"
            />
            Start downloads as soon as a link is added
          </label>
        </div>

        <Field label="Bundled tools">
          <div className="flex flex-col gap-2">
            {binaries ? (
              <>
                <BinaryRow name="yt-dlp" info={binaries.ytdlp} />
                <BinaryRow name="ffmpeg" info={binaries.ffmpeg} />
              </>
            ) : (
              <p className="text-xs text-slate-500">Checking…</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={updating}
                onClick={() => void runUpdate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1f2a3d] px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-[#2a3a55] hover:text-slate-100 disabled:opacity-50"
              >
                <RefreshIcon className={`size-4 ${updating ? 'animate-spin' : ''}`} />
                {updating ? 'Updating…' : 'Update yt-dlp'}
              </button>
              {updateMessage && (
                <span className="truncate text-xs text-slate-400" title={updateMessage}>
                  {updateMessage}
                </span>
              )}
            </div>
          </div>
        </Field>
      </div>
    </div>
  )
}
