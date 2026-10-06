import { useSyncExternalStore, type ComponentProps, type CSSProperties } from 'react'
import { PLAYBACK_RATES } from '../audio/rateSetting'
import type { StreamingPlayer } from '../audio/StreamingPlayer'
import type { Download } from '../tts/useTts'
import { ChevronIcon, DownloadIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, StopIcon } from './icons'

function formatTime(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function SkipButton({ label, ...props }: { label: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/8 disabled:opacity-35 disabled:hover:bg-transparent"
      {...props}
    />
  )
}

function RateSelect({ rate, disabled, onChange }: { rate: number; disabled: boolean; onChange: (rate: number) => void }) {
  return (
    <label
      className="pill relative ml-1 h-10 min-h-0 px-2.5 text-[13px] has-[select:disabled]:opacity-35"
      title="Playback speed ([ and ])"
    >
      <select
        aria-label="Playback speed"
        className="text-center"
        value={rate}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {PLAYBACK_RATES.map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-2 size-3.5 text-pencil" />
    </label>
  )
}

type Props = {
  player: StreamingPlayer
  generating: boolean
  progress: { done: number; total: number }
  download?: Download
  onStop: () => void
  /** Show the sentence being read, for when the reading view is out of sight. */
  showSentence: boolean
}

export function PlayerControls({ player, generating, progress, download, onStop, showSentence }: Props) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot)
  const hasAudio = state.sectionCount > 0
  const position = Math.min(state.position, state.duration)
  const fill = state.duration > 0 ? (position / state.duration) * 100 : 0

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
      <div className="mx-auto max-w-[57.6rem] px-4 py-3 sm:px-6">
        {showSentence && hasAudio && (
          <p className="mb-1.5 truncate font-serif text-sm text-pencil" aria-live="off">
            {state.sectionText}
          </p>
        )}

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="col-span-2 flex items-center gap-3 text-[13px] text-pencil tabular-nums sm:order-2 sm:col-span-1">
            <span className="min-w-[3.25rem] text-right">{formatTime(position)}</span>
            <input
              type="range"
              aria-label="Seek"
              aria-valuetext={`${formatTime(position)} of ${formatTime(state.duration)}`}
              className="scrubber flex-1"
              style={{ '--fill': `${fill}%` } as CSSProperties}
              min={0}
              max={state.duration}
              step={0.1}
              value={position}
              disabled={!hasAudio}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <span className="min-w-[3.25rem]">{formatTime(state.duration)}</span>
          </div>

          <div className="flex items-center gap-1 sm:order-1">
            <SkipButton label="Previous section (←)" onClick={() => player.prevSection()} disabled={!hasAudio}>
              <PreviousIcon className="size-[18px]" />
            </SkipButton>
            <button
              type="button"
              aria-label={state.playing ? 'Pause' : 'Play'}
              title={state.playing ? 'Pause (Space)' : 'Play (Space)'}
              className="relative mx-1 grid size-12 place-items-center rounded-full bg-ink text-paper transition-transform active:scale-95"
              onClick={() => (state.playing ? player.pause() : player.play())}
            >
              {state.waiting && <span className="waiting-ring" />}
              {state.playing ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
            </button>
            <SkipButton label="Next section (→)" onClick={() => player.nextSection()} disabled={!hasAudio}>
              <NextIcon className="size-[18px]" />
            </SkipButton>
            <RateSelect rate={state.rate} disabled={!hasAudio} onChange={(rate) => player.setRate(rate)} />
          </div>

          <div className="flex items-center justify-end gap-4 sm:order-3">
            {generating ? (
              <>
                <div className="flex flex-col items-end gap-1.5 text-[13px] text-pencil tabular-nums" role="status">
                  <span className="whitespace-nowrap">
                    <span className="max-sm:hidden">Generating </span>
                    {Math.min(progress.done + 1, progress.total)} of {progress.total}
                  </span>
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-rule sm:w-24">
                    <span
                      className="block h-full rounded-full bg-ink transition-[width] duration-300"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </span>
                </div>
                <button type="button" className="pill" aria-label="Stop generating" onClick={onStop}>
                  <StopIcon className="-ml-1 size-4" />
                  Stop
                </button>
              </>
            ) : (
              download && (
                <a className="pill" href={download.url} download={download.filename}>
                  <DownloadIcon className="-ml-1 size-[18px]" />
                  {download.cancelled ? 'Download partial MP3' : 'Download MP3'}
                </a>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
