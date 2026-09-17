import { useDeferredValue, useMemo, useState } from 'react'
import { StreamingPlayer } from './audio/StreamingPlayer'
import { PlayerControls } from './components/PlayerControls'
import { chunkText } from './text/chunk'
import { cleanText, detectFormatting, needsCleanup, type Formatting } from './text/cleanup'
import { useTts } from './tts/useTts'

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]

function textToSpeak(text: string, formatting: Formatting, cleanup: boolean): string {
  if (!cleanup) return text
  // Cleanup forced on for text that looked fine: at least rejoin broken lines.
  return cleanText(text, needsCleanup(formatting) ? formatting : { ...formatting, hardWrapped: true })
}

function describeFormatting(f: Formatting): string {
  const found = [
    f.lineNumbers && 'line numbers',
    f.speakerLabels && 'speaker labels',
    f.hardWrapped && 'wrapped lines',
  ].filter(Boolean)
  return found.length ? `Transcript formatting detected (${found.join(', ')})` : 'No cleanup needed'
}

export default function App() {
  const [player] = useState(() => new StreamingPlayer())
  const tts = useTts(player)

  const [text, setText] = useState('')
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1)
  // null = follow detection; true/false = the user's choice for this text.
  const [cleanupOverride, setCleanupOverride] = useState<boolean | null>(null)

  const deferredText = useDeferredValue(text)
  const formatting = useMemo(() => detectFormatting(deferredText), [deferredText])
  const cleanup = cleanupOverride ?? needsCleanup(formatting)
  const spokenText = useMemo(
    () => textToSpeak(deferredText, formatting, cleanup),
    [deferredText, formatting, cleanup],
  )

  const generating = tts.status === 'generating'

  function handleGenerate() {
    if (generating) {
      tts.cancel()
      return
    }
    const current = detectFormatting(text)
    const chunks = chunkText(textToSpeak(text, current, cleanupOverride ?? needsCleanup(current)))
    if (chunks.length > 0) tts.generate(chunks, voice, speed)
  }

  let modelStatus: string
  if (tts.status === 'error') {
    modelStatus = `Error: ${tts.error}`
  } else if (tts.status === 'loading') {
    modelStatus = tts.loadPct < 100 ? `Loading voice model… ${tts.loadPct}%` : 'Preparing voice model…'
  } else {
    modelStatus = `Voice model ready (${tts.device === 'webgpu' ? 'WebGPU' : 'WASM, slower'})`
  }

  let buttonLabel = 'Generate audio'
  if (tts.status === 'loading') buttonLabel = 'Loading…'
  if (generating) buttonLabel = `Stop (generating ${tts.progress.done} / ${tts.progress.total})`

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Text to Speech</h1>
      <p>{modelStatus}</p>

      <textarea
        className="min-h-64 rounded border p-2"
        placeholder="Paste text here…"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setCleanupOverride(null)
        }}
      />

      {deferredText.trim() && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cleanup}
              onChange={(e) => setCleanupOverride(e.target.checked)}
            />
            Clean up formatting before reading
          </label>
          <p className="text-sm">
            {describeFormatting(formatting)}
            {cleanupOverride !== null && ` (cleanup turned ${cleanup ? 'on' : 'off'} manually)`}
          </p>
          <details>
            <summary className="cursor-pointer text-sm">Text to be spoken</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border p-2 text-sm">
              {spokenText}
            </pre>
          </details>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          Voice
          <select
            className="rounded border p-1"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={tts.voices.length === 0}
          >
            {tts.voices.length === 0 && <option value={voice}>af_heart</option>}
            {tts.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.language === 'en-us' ? 'US' : 'UK'} {v.gender.toLowerCase()}, grade {v.grade})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Speed
          <select
            className="rounded border p-1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded border px-4 py-2 font-semibold disabled:opacity-50"
          onClick={handleGenerate}
          disabled={tts.status === 'loading' || tts.status === 'error' || (!generating && !text.trim())}
        >
          {buttonLabel}
        </button>
      </div>

      {tts.status !== 'error' && tts.error && <p>Error: {tts.error}</p>}

      <PlayerControls player={player} />

      {tts.download && (
        <p className="flex items-center gap-2">
          <a className="rounded border px-4 py-2" href={tts.download.url} download={tts.download.filename}>
            Download MP3
          </a>
          {tts.download.cancelled && <span>(partial: generation was stopped)</span>}
        </p>
      )}
    </main>
  )
}
