import { useState, type JSX, type KeyboardEvent } from 'react'
import { ClipboardIcon, PlusIcon } from './Icons'

export interface UrlInputProps {
  onAdd: (text: string) => Promise<void>
}

export default function UrlInput({ onAdd }: UrlInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onAdd(trimmed)
      setValue('')
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter adds; Shift+Enter keeps the newline so a batch can be typed by hand.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit(value)
    }
  }

  const pasteFromClipboard = async (): Promise<void> => {
    const text = await window.api.system.readClipboard()
    if (!text.trim()) return
    setValue((current) => (current.trim() ? `${current.trim()}\n${text.trim()}` : text.trim()))
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        autoFocus
        rows={2}
        value={value}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste one or more video links — one per line, or separated by spaces"
        className="min-h-[62px] flex-1 resize-none rounded-lg border border-[#1f2a3d] bg-[#0e1420] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
      />
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void submit(value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          <PlusIcon className="size-4" />
          Add
        </button>
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#1f2a3d] px-3 text-sm text-slate-300 transition-colors hover:border-[#2a3a55] hover:text-slate-100"
        >
          <ClipboardIcon className="size-4" />
          Paste
        </button>
      </div>
    </div>
  )
}
