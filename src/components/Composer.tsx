import { useId, useMemo, useState, type ComponentProps } from 'react'
import type { Formatting } from '../text/cleanup'
import type { VoiceInfo } from '../tts/messages'
import { ChevronIcon, PlayIcon } from './icons'

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]
/** Kokoro's approximate pace at 1×, including pauses. */
const WORDS_PER_MINUTE = 140
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)
const canReadClipboard = typeof navigator.clipboard?.readText === 'function'

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })
const numberFormat = new Intl.NumberFormat('en')

function foundFormatting(f: Formatting): string {
  const found = [
    f.lineNumbers && 'line numbers',
    f.speakerLabels && 'speaker labels',
    f.hardWrapped && 'wrapped lines',
  ].filter((item) => typeof item === 'string')
  return listFormat.format(found)
}

function describeCleanup(f: Formatting, cleanup: boolean): string {
  const found = foundFormatting(f)
  if (cleanup) return found ? `Found ${found}.` : 'Line breaks inside paragraphs will be joined.'
  if (!found) return 'No transcript formatting found.'
  return `Off, so ${found} will be read as written.`
}

function describeLength(text: string, speed: number): string {
  const words = text.match(/\S+/g)?.length ?? 0
  const minutes = Math.round(words / (WORDS_PER_MINUTE * speed))
  let length = 'under a minute'
  if (minutes >= 60) {
    const m = minutes % 60
    length = `about ${Math.floor(minutes / 60)} h${m ? ` ${m} min` : ''}`
  } else if (minutes >= 1) {
    length = `about ${minutes} min`
  }
  return `${numberFormat.format(words)} ${words === 1 ? 'word' : 'words'}, ${length}`
}

// Kokoro grades voices A (best) to F; sort each group best first.
function gradeRank(grade: string): number {
  const letter = 'ABCDEF'.indexOf(grade.charAt(0))
  const modifier = grade.endsWith('+') ? 0 : grade.endsWith('-') ? 2 : 1
  return letter * 3 + modifier
}

function groupVoices(voices: VoiceInfo[]): [string, VoiceInfo[]][] {
  const groups = new Map<string, VoiceInfo[]>()
  for (const voice of voices) {
    const accent = voice.language === 'en-us' ? 'American' : 'British'
    const label = `${accent} ${voice.gender.toLowerCase()}`
    groups.set(label, [...(groups.get(label) ?? []), voice])
  }
  for (const list of groups.values()) list.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))
  return [...groups]
}

function PillSelect({ label, ...props }: { label: string } & ComponentProps<'select'>) {
  return (
    <label className="pill relative pr-3">
      <span className="text-pencil">{label}</span>
      <select {...props} />
      <ChevronIcon className="pointer-events-none absolute right-3 size-4 text-pencil" />
    </label>
  )
}

type Props = {
  hidden: boolean
  text: string
  onTextChange: (text: string) => void
  /** Text as it will be spoken, derived from a deferred copy of `text`. */
  spokenText: string
  formatting: Formatting
  cleanup: boolean
  onCleanupChange: (cleanup: boolean) => void
  voice: string
  voices: VoiceInfo[]
  onVoiceChange: (voice: string) => void
  speed: number
  onSpeedChange: (speed: number) => void
  showMargin: boolean
  onShowMarginChange: (showMargin: boolean) => void
  loading: boolean
  canRead: boolean
  onRead: () => void
}

export function Composer(props: Props) {
  const { text, spokenText, cleanup, voices } = props
  const cleanupId = useId()
  const [showCleaned, setShowCleaned] = useState(false)
  const previewing = showCleaned && cleanup
  const hasText = text.trim() !== ''
  const voiceGroups = useMemo(() => groupVoices(voices), [voices])

  async function pasteFromClipboard() {
    try {
      props.onTextChange(await navigator.clipboard.readText())
    } catch {
      // Permission denied or unsupported; the text box still accepts a normal paste.
    }
  }

  return (
    <div hidden={props.hidden} className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="sheet flex min-h-0 flex-1 flex-col">
        <div className={`flex min-h-0 flex-1 flex-col ${props.showMargin ? 'sheet-ruled' : ''}`}>
          {previewing && (
            <div
              tabIndex={0}
              aria-label="Cleaned text preview"
              className="sheet-text min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap"
            >
              {spokenText}
            </div>
          )}
          {/* Stays mounted while previewing so the browser keeps its undo history. */}
          <textarea
            hidden={previewing}
            autoFocus
            aria-label="Text to read aloud"
            className="sheet-text min-h-0 flex-1 resize-none bg-transparent focus-visible:outline-none"
            placeholder="Paste a transcript or any text you want to hear. Line numbers and speaker labels from court transcripts are tidied up automatically."
            value={text}
            onChange={(e) => props.onTextChange(e.target.value)}
            onKeyDown={(e) => {
              // Handled by the app-wide shortcut; keep the textarea from inserting a newline.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.preventDefault()
            }}
          />
        </div>

        {hasText ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-rule px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <button
                  id={cleanupId}
                  type="button"
                  role="switch"
                  aria-checked={cleanup}
                  className="switch mt-0.5"
                  onClick={() => props.onCleanupChange(!cleanup)}
                />
                <div>
                  <label htmlFor={cleanupId} className="cursor-pointer font-semibold">
                    Clean up transcript formatting
                  </label>
                  <p className="text-[13px] text-pencil">{describeCleanup(props.formatting, cleanup)}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 pl-[calc(2.25rem+0.75rem)] text-[13px] text-pencil">
                <input
                  type="checkbox"
                  checked={props.showMargin}
                  onChange={(e) => props.onShowMarginChange(e.target.checked)}
                />
                Show ruled margin
              </label>
            </div>
            <div className="flex items-center gap-5 text-[13px] text-pencil">
              <span className="tabular-nums">{describeLength(spokenText, props.speed)}</span>
              {cleanup && (
                <button type="button" className="link-button" onClick={() => setShowCleaned(!previewing)}>
                  {previewing ? 'Show original' : 'Show cleaned text'}
                </button>
              )}
            </div>
          </footer>
        ) : (
          canReadClipboard && (
            <footer className="shrink-0 border-t border-rule px-5 py-4 text-[13px] sm:px-6">
              <button type="button" className="link-button" onClick={pasteFromClipboard}>
                Paste from clipboard
              </button>
            </footer>
          )
        )}
      </section>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap">
        <PillSelect
          label="Voice"
          value={props.voice}
          onChange={(e) => props.onVoiceChange(e.target.value)}
          disabled={voices.length === 0}
        >
          {voices.length === 0 && <option value={props.voice}>Heart</option>}
          {voiceGroups.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (quality {v.grade})
                </option>
              ))}
            </optgroup>
          ))}
        </PillSelect>

        <PillSelect
          label="Speed"
          value={props.speed}
          onChange={(e) => props.onSpeedChange(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </PillSelect>

        <button
          type="button"
          className="pill pill-primary col-span-2 sm:ml-auto"
          onClick={props.onRead}
          disabled={!props.canRead}
        >
          {props.loading ? (
            'Loading voice…'
          ) : (
            <>
              <PlayIcon className="-ml-1 size-[18px]" />
              Read aloud
              <kbd className="ml-1 text-[12px] font-medium opacity-60 pointer-coarse:hidden">
                {IS_MAC ? '⌘↵' : 'Ctrl+Enter'}
              </kbd>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
