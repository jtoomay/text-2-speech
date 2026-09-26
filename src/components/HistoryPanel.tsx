import { useEffect, useState, useSyncExternalStore } from 'react'
import { historyStore, type HistoryEntry } from '../history/historyStore'
import { notify } from '../notify'
import { CloseIcon, EditIcon, MenuIcon, TrashIcon } from './icons'

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000000],
  ['month', 2592000000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
]
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

function formatWhen(ts: number): string {
  const diff = ts - Date.now()
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return relativeFormat.format(Math.round(diff / ms), unit)
  }
  if (Math.abs(diff) < 60000) return 'just now'
  return dateFormat.format(ts)
}

function EditForm({ entry, onCancel }: { entry: HistoryEntry; onCancel: () => void }) {
  const [title, setTitle] = useState(entry.title)
  const [text, setText] = useState(entry.text)

  function save() {
    const nextTitle = title.trim() || entry.title
    historyStore.update(entry.id, { title: nextTitle, text })
    notify('Updated', { description: nextTitle })
    onCancel()
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-rule bg-paper px-2 py-1 text-[13px] font-medium text-ink focus-visible:outline-none"
        aria-label="Title"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="resize-none rounded-md border border-rule bg-paper px-2 py-1.5 font-serif text-[13px] leading-normal text-ink focus-visible:outline-none"
        aria-label="Text"
      />
      <div className="flex justify-end gap-4 pt-1 text-[13px]">
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="link-button font-medium" onClick={save}>
          Save
        </button>
      </div>
    </div>
  )
}

function Row({
  entry,
  editing,
  onEdit,
  onCancelEdit,
  onSelect,
}: {
  entry: HistoryEntry
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSelect: (text: string) => void
}) {
  function remove() {
    const removed = historyStore.remove(entry.id)
    if (!removed) return
    notify('Deleted', {
      description: removed.title,
      action: { label: 'Undo', onClick: () => historyStore.restore(removed) },
    })
  }

  if (editing) return <EditForm entry={entry} onCancel={onCancelEdit} />

  return (
    <div className="group flex items-start gap-2 px-4 py-3 hover:bg-ink/[0.03]">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(entry.text)}>
        <p className="truncate font-medium text-ink">{entry.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-pencil">{entry.text}</p>
        <p className="mt-1 text-[12px] text-pencil">{formatWhen(entry.updatedAt)}</p>
      </button>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
        <button
          type="button"
          aria-label={`Edit “${entry.title}”`}
          title="Edit"
          className="grid size-8 place-items-center rounded-full text-pencil hover:bg-ink/8 hover:text-ink"
          onClick={onEdit}
        >
          <EditIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Delete “${entry.title}”`}
          title="Delete"
          className="grid size-8 place-items-center rounded-full text-pencil hover:bg-danger/10 hover:text-danger"
          onClick={remove}
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}

type Props = { onSelect: (text: string) => void }

export function HistoryPanel({ onSelect }: Props) {
  const entries = useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string>()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function close() {
    setOpen(false)
    setEditingId(undefined)
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close history' : 'Open history'}
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-10 grid size-10 place-items-center rounded-full border border-rule bg-paper text-ink shadow-[var(--sheet-shadow)] hover:bg-ink/8 sm:top-6 sm:left-6"
      >
        <MenuIcon className="size-[18px]" />
      </button>

      {open && <div className="fixed inset-0 z-20 bg-ink/20 backdrop-blur-[2px]" onClick={close} />}

      <aside
        aria-hidden={!open}
        aria-label="Generation history"
        className={`fixed inset-y-0 left-0 z-30 flex w-[85vw] max-w-sm flex-col border-r border-rule bg-paper shadow-[var(--sheet-shadow)] transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-rule px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-ink">History</h2>
          <button
            type="button"
            aria-label="Close history"
            onClick={close}
            className="grid size-8 place-items-center rounded-full text-pencil hover:bg-ink/8 hover:text-ink"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>

        <div className="flex-1 divide-y divide-rule overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-pencil">
              No speech generated yet — anything you read aloud will be saved here.
            </p>
          ) : (
            entries.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                editing={editingId === entry.id}
                onEdit={() => setEditingId(entry.id)}
                onCancelEdit={() => setEditingId(undefined)}
                onSelect={(text) => {
                  onSelect(text)
                  close()
                }}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}
