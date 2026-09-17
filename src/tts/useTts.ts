import { useCallback, useEffect, useRef, useState } from 'react'
import type { StreamingPlayer } from '../audio/StreamingPlayer'
import type { Chunk } from '../text/chunk'
import type { Device, FromWorker, ToWorker, VoiceInfo } from './messages'

export type TtsStatus = 'loading' | 'ready' | 'generating' | 'error'

export type Download = { url: string; filename: string; cancelled: boolean }

function downloadName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `speech-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.mp3`
}

export function useTts(player: StreamingPlayer) {
  const workerRef = useRef<Worker | null>(null)
  const jobRef = useRef(0)
  const [status, setStatus] = useState<TtsStatus>('loading')
  const [loadPct, setLoadPct] = useState(0)
  const [device, setDevice] = useState<Device>()
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [download, setDownload] = useState<Download>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data
      if ('jobId' in msg && msg.jobId !== undefined && msg.jobId !== jobRef.current) return

      switch (msg.type) {
        case 'loadProgress':
          setLoadPct(msg.pct)
          break
        case 'ready':
          setDevice(msg.device)
          setVoices(msg.voices)
          setStatus('ready')
          break
        case 'chunk':
          player.append(msg.pcm, msg.sampleRate, msg.text)
          setProgress({ done: msg.index + 1, total: msg.total })
          break
        case 'done':
          player.markComplete()
          if (msg.mp3.size > 0) {
            setDownload({
              url: URL.createObjectURL(msg.mp3),
              filename: downloadName(new Date()),
              cancelled: msg.cancelled,
            })
          }
          setStatus('ready')
          break
        case 'error':
          setError(msg.message)
          // A failed job leaves the model usable; a failed load does not.
          if (msg.jobId === undefined) setStatus('error')
          break
      }
    }
    worker.onerror = (event) => {
      setError(event.message || 'The speech worker failed to start.')
      setStatus('error')
    }

    const forceWasm = new URLSearchParams(location.search).get('device') === 'wasm'
    worker.postMessage({ type: 'load', device: forceWasm ? 'wasm' : undefined } satisfies ToWorker)

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [player])

  // Release the previous MP3 when it is replaced or the app unmounts.
  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url)
    }
  }, [download])

  /** Call from a click handler so audio playback is allowed to start. */
  const generate = useCallback(
    (chunks: Chunk[], voice: string, speed: number) => {
      const jobId = ++jobRef.current
      setDownload(undefined)
      setError(undefined)
      setProgress({ done: 0, total: chunks.length })
      setStatus('generating')
      player.reset()
      player.play()
      workerRef.current?.postMessage({ type: 'generate', jobId, chunks, voice, speed } satisfies ToWorker)
    },
    [player],
  )

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: 'cancel', jobId: jobRef.current } satisfies ToWorker)
  }, [])

  return { status, loadPct, device, voices, progress, download, error, generate, cancel }
}
