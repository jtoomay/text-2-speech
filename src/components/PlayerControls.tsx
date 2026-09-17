import { useSyncExternalStore } from 'react'
import type { StreamingPlayer } from '../audio/StreamingPlayer'

function formatTime(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function PlayerControls({ player }: { player: StreamingPlayer }) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot)
  if (state.sectionCount === 0) return null

  return (
    <section className="flex flex-col gap-2 rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded border px-3 py-1" onClick={() => player.prevSection()}>
          ⟨ Prev
        </button>
        <button
          className="rounded border px-3 py-1"
          onClick={() => (state.playing ? player.pause() : player.play())}
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <button className="rounded border px-3 py-1" onClick={() => player.nextSection()}>
          Next ⟩
        </button>
        <span className="tabular-nums">
          {formatTime(state.position)} / {formatTime(state.duration)}
          {!state.complete && ' generated so far'}
        </span>
        {state.waiting && <span>Waiting for more audio…</span>}
      </div>

      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={state.duration}
        step={0.1}
        value={Math.min(state.position, state.duration)}
        onChange={(e) => player.seek(Number(e.target.value))}
      />

      <p>
        <span className="text-sm">
          Section {state.sectionIndex + 1} of {state.sectionCount}:
        </span>{' '}
        {state.sectionText}
      </p>
    </section>
  )
}
