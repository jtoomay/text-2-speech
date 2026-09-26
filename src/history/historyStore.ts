import { notify } from '../notify'

export type HistoryEntry = { id: string; title: string; text: string; createdAt: number; updatedAt: number }

const STORAGE_KEY = 'readback:history'
const TITLE_MAX = 60

function titleFrom(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? ''
  if (!firstLine) return 'Untitled'
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX).trimEnd()}…` : firstLine
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

class HistoryStore {
  private entries = load()
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.entries

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
    } catch {
      notify('Couldn’t save history', { tone: 'error', description: 'Your device storage may be full.' })
    }
  }

  private emit() {
    this.persist()
    for (const listener of this.listeners) listener()
  }

  add(text: string): HistoryEntry | undefined {
    const trimmed = text.trim()
    if (!trimmed || this.entries[0]?.text === trimmed) return undefined
    const now = Date.now()
    const entry: HistoryEntry = { id: crypto.randomUUID(), title: titleFrom(trimmed), text: trimmed, createdAt: now, updatedAt: now }
    this.entries = [entry, ...this.entries]
    this.emit()
    return entry
  }

  update(id: string, patch: { title?: string; text?: string }) {
    this.entries = this.entries.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: Date.now() } : entry))
    this.emit()
  }

  remove(id: string): HistoryEntry | undefined {
    const entry = this.entries.find((e) => e.id === id)
    this.entries = this.entries.filter((e) => e.id !== id)
    this.emit()
    return entry
  }

  restore(entry: HistoryEntry) {
    this.entries = [entry, ...this.entries.filter((e) => e.id !== entry.id)]
    this.emit()
  }
}

export const historyStore = new HistoryStore()
