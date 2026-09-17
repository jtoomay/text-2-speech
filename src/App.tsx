import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { StreamingPlayer } from './audio/StreamingPlayer'
import { Composer } from './components/Composer'
import { Mark } from './components/icons'
import { ModelStatus } from './components/ModelStatus'
import { PlayerControls } from './components/PlayerControls'
import { ReadingView, type Script } from './components/ReadingView'
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

  const [text, setText] = useState('')
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1)
  // null = follow detection; true/false = the user's choice for this text.
  const [cleanupOverride, setCleanupOverride] = useState<boolean | null>(null)
  const [script, setScript] = useState<Script>()
  const [view, setView] = useState<View>('text')

  const deferredText = useDeferredValue(text)
  const formatting = useMemo(() => detectFormatting(deferredText), [deferredText])
  const cleanup = cleanupOverride ?? needsCleanup(formatting)
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
    setScript({ chunks, transcript: clean && (current.lineNumbers || current.speakerLabels) })
    setView('listen')
    window.scrollTo({ top: 0 })
    tts.generate(chunks, voice, speed)
  }

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
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-5 sm:px-6 sm:pt-8">
        <h1 className="flex items-center gap-2.5">
          <Mark />
          <span className="wordmark">Readback</span>
        </h1>
        <ModelStatus status={tts.status} loadPct={tts.loadPct} device={tts.device} />
      </header>

      <main className={`mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-6 sm:px-6 sm:pt-10 ${script ? 'pb-48 sm:pb-40' : 'pb-16'}`}>
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
          docked={script !== undefined}
          text={text}
          onTextChange={(value) => {
            setText(value)
            setCleanupOverride(null)
          }}
          spokenText={spokenText}
          formatting={formatting}
          cleanup={cleanup}
          onCleanupChange={setCleanupOverride}
          voice={voice}
          voices={tts.voices}
          onVoiceChange={setVoice}
          speed={speed}
          onSpeedChange={setSpeed}
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
