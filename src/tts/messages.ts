import type { Chunk } from '../text/chunk'

export type Device = 'webgpu' | 'wasm'

export type VoiceInfo = {
  id: string
  name: string
  language: string
  gender: string
  grade: string
}

export type ToWorker =
  | { type: 'load'; device?: Device }
  | { type: 'generate'; jobId: number; chunks: Chunk[]; voice: string; speed: number }
  | { type: 'cancel'; jobId: number }

export type FromWorker =
  | { type: 'loadProgress'; pct: number }
  | { type: 'ready'; device: Device; voices: VoiceInfo[] }
  | {
      type: 'chunk'
      jobId: number
      index: number
      total: number
      text: string
      pcm: Int16Array<ArrayBuffer>
      sampleRate: number
    }
  | { type: 'done'; jobId: number; mp3: Blob; cancelled: boolean }
  | { type: 'error'; message: string; jobId?: number }
