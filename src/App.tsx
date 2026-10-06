import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { stepRate } from './audio/rateSetting'
import { StreamingPlayer } from './audio/StreamingPlayer'
import { Composer } from './components/Composer'
import { HistoryPanel } from './components/HistoryPanel'
import { Mark } from './components/icons'
import { ModelStatus } from './components/ModelStatus'
import { PlayerControls } from './components/PlayerControls'
import { ReadingView, type Script } from './components/ReadingView'
import { historyStore } from './history/historyStore'
import { notify } from './notify'
import { chunkText } from './text/chunk'
import { cleanText, detectFormatting, needsCleanup, type Formatting } from './text/cleanup'
import { useTts } from './tts/useTts'

type View = 'text' | 'listen'

function textToSpeak(text: string, formatting: Formatting, cleanup: boolean): string {
  if (!cleanup) return text
  // Cleanup forced on for text that looked fine: at least rejoin broken lines.
  return cleanText(text, needsCleanup(formatting) ? formatting : { ...formatting, hardWrapped: true })
}

/** Renders `code` spans in messages such as the model setup hint. */
function Message({ text }: { text: string }) {
  return text.split('`').map((part, i) =>
    i % 2 ? (
      <code key={i} className="rounded bg-danger/10 px-1.5 py-0.5 text-[0.9em]">
        {part}
      </code>
    ) : (
      part
    ),
  )
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]') !== null
}

export default function App() {
  const [player] = useState(() => new StreamingPlayer())
  const tts = useTts(player)
  const mainRef = useRef<HTMLElement>(null)

  const [text, setText] = useState('')
  const [voice, setVoice] = useState('af_heart')
  // How fast the voice speaks while generating; playback speed lives in the player.
  const [voicePace, setVoicePace] = useState(1)
  // null = follow detection; true/false = the user's choice for this text.
  const [cleanupOverride, setCleanupOverride] = useState<boolean | null>(null)
  // null = follow the cleanup toggle; true/false = the user's choice for this text.
  const [marginOverride, setMarginOverride] = useState<boolean | null>(null)
  const [script, setScript] = useState<Script>()
  const [view, setView] = useState<View>('text')

  const deferredText = useDeferredValue(text)
  const formatting = useMemo(() => detectFormatting(deferredText), [deferredText])
  const cleanup = cleanupOverride ?? needsCleanup(formatting)
  const showMargin = marginOverride ?? cleanup
  const spokenText = useMemo(
    () => textToSpeak(deferredText, formatting, cleanup),
    [deferredText, formatting, cleanup],
  )

  const generating = tts.status === 'generating'
  // Reading again while generating replaces the current audio.
  const canRead = (tts.status === 'ready' || generating) && text.trim() !== ''
  const listening = view === 'listen' && script !== undefined

  function handleRead() {
    const current = detectFormatting(text)
    const clean = cleanupOverride ?? needsCleanup(current)
    const chunks = chunkText(textToSpeak(text, current, clean))
    if (chunks.length === 0) return
    historyStore.add(text)
    setScript({ chunks, transcript: clean && (current.lineNumbers || current.speakerLabels) })
    setView('listen')
    mainRef.current?.scrollTo({ top: 0 })
    tts.generate(chunks, voice, voicePace)
  }

  const lastDownloadUrl = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!tts.download || tts.download.url === lastDownloadUrl.current) return
    lastDownloadUrl.current = tts.download.url
    notify(tts.download.cancelled ? 'Partial speech ready to download' : 'Speech ready to download')
  }, [tts.download])

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (view === 'text' && canRead) handleRead()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey || !script || isTyping(event.target)) return

    const onButton = event.target instanceof Element && event.target.closest('button, a, summary')
    if (event.key === ' ' && !onButton) {
      event.preventDefault()
      if (player.getSnapshot().playing) player.pause()
      else player.play()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      player.prevSection()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      player.nextSection()
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault()
      player.setRate(stepRate(player.getSnapshot().rate, event.key === '[' ? -1 : 1))
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Toaster position="top-center" containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} />

      <HistoryPanel
        onSelect={(value) => {
          setText(value)
          setCleanupOverride(null)
          setMarginOverride(null)
          setView('text')
        }}
      />

      <header className="mx-auto flex w-full shrink-0 max-w-[57.6rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-5 sm:px-6 sm:pt-8">
        <h1 className="flex items-center gap-2.5">
          <Mark />
          <span className="wordmark">Readback</span>
        </h1>
        <ModelStatus status={tts.status} loadPct={tts.loadPct} device={tts.device} />
      </header>

      <main
        ref={mainRef}
        className={`mx-auto flex w-full min-h-0 max-w-[57.6rem] flex-1 flex-col gap-4 overflow-y-auto px-4 pt-6 sm:px-6 sm:pt-10 ${script ? 'pb-48 sm:pb-40' : 'pb-16'}`}
      >
        {tts.error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-danger">
            <Message text={tts.error} />
          </p>
        )}

        {script && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex rounded-full bg-ink/8 p-1" role="group" aria-label="View">
              {(
                [
                  ['text', 'Text'],
                  ['listen', 'Read along'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  className="rounded-full px-4 py-1.5 font-medium text-pencil transition-colors hover:text-ink aria-pressed:bg-paper aria-pressed:text-ink dark:aria-pressed:bg-ink/15 aria-pressed:shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {listening && (
              <p className="text-[13px] text-pencil">
                <span className="pointer-coarse:hidden">Click</span>
                <span className="hidden pointer-coarse:inline">Tap</span> a sentence to play from there
              </p>
            )}
          </div>
        )}

        <Composer
          hidden={listening}
          text={text}
          onTextChange={(value) => {
            setText(value)
            setCleanupOverride(null)
            setMarginOverride(null)
          }}
          spokenText={spokenText}
          formatting={formatting}
          cleanup={cleanup}
          onCleanupChange={setCleanupOverride}
          voice={voice}
          voices={tts.voices}
          onVoiceChange={setVoice}
          voicePace={voicePace}
          onVoicePaceChange={setVoicePace}
          showMargin={showMargin}
          onShowMarginChange={setMarginOverride}
          loading={tts.status === 'loading'}
          canRead={canRead}
          onRead={handleRead}
        />

        {listening && <ReadingView script={script} player={player} />}
      </main>

      {script && (
        <PlayerControls
          player={player}
          generating={generating}
          progress={tts.progress}
          download={tts.download}
          onStop={tts.cancel}
          showSentence={!listening}
        />
      )}
    </div>
  )
}
