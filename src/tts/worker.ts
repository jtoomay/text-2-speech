import { Mp3Encoder } from '@breezystack/lamejs'
import { env as transformersEnv } from '@huggingface/transformers'
import { KokoroTTS, env as kokoroEnv, type GenerateOptions } from 'kokoro-js'
import type { Chunk } from '../text/chunk'
import type { Device, FromWorker, ToWorker, VoiceInfo } from './messages'

type VoiceId = NonNullable<GenerateOptions['voice']>

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const MODELS_PATH = '/models/'
const SETUP_HINT = 'Model files not found. Run `npm run setup:model` and reload.'
const MP3_KBPS = 64
const MP3_FRAME = 1152

// --- Self-hosting: every file comes from this app, never from an outside server.
transformersEnv.allowRemoteModels = false
transformersEnv.allowLocalModels = true
transformersEnv.localModelPath = MODELS_PATH
transformersEnv.useBrowserCache = false
// A full URL: Vite's dev server rewrites root-relative dynamic imports and would break this one.
kokoroEnv.wasmPaths = `${self.location.origin}/ort/`

// kokoro-js hardcodes the Hugging Face URL for voice files, so redirect those to
// the local copy and refuse any other request that would leave this origin.
const REMOTE_VOICES = `https://huggingface.co/${MODEL_ID}/resolve/main/voices/`
const LOCAL_VOICES = `${MODELS_PATH}${MODEL_ID}/voices/`
const nativeFetch = self.fetch.bind(self)

// Builds split large model files into parts (see vite.config.ts); the dev server serves them whole.
type PartsManifest = Record<string, { size: number; parts: number }>
let partsManifest: Promise<PartsManifest> | undefined

function loadPartsManifest(): Promise<PartsManifest> {
  partsManifest ??= nativeFetch(`${MODELS_PATH}parts.json`)
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
  return partsManifest
}

/** Streams the parts of a split file back as a single response. */
function joinParts(path: string, size: number, parts: number, signal?: AbortSignal | null): Response {
  let next = 0
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (!reader) {
          if (next === parts) return controller.close()
          const part = `${path}.part${next++}`
          const res = await nativeFetch(part, { signal })
          if (!res.ok || !res.body) throw new Error(`Model file ${part} not found (HTTP ${res.status}).`)
          reader = res.body.getReader()
        }
        const { done, value } = await reader.read()
        if (!done) return controller.enqueue(value)
        reader = undefined
      }
    },
    cancel: (reason) => reader?.cancel(reason),
  })
  // Content-Length lets Transformers.js size its buffer and report load progress.
  return new Response(body, { headers: { 'Content-Length': String(size) } })
}

self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input, self.location.href)
  if (url.origin === self.location.origin) {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.pathname.startsWith(MODELS_PATH) && method.toUpperCase() === 'GET') {
      const split = (await loadPartsManifest())[decodeURIComponent(url.pathname)]
      if (split) return joinParts(url.pathname, split.size, split.parts, init?.signal)
    }
    return nativeFetch(input, init)
  }
  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return nativeFetch(input, init)
  }
  if (url.href.startsWith(REMOTE_VOICES)) {
    const file = url.href.slice(REMOTE_VOICES.length)
    const res = await nativeFetch(LOCAL_VOICES + file, init)
    if (!res.ok) throw new Error(`Voice file ${file} not found. ${SETUP_HINT}`)
    return res
  }
  throw new Error(`Blocked external request: ${url.href}`)
}

// --- Messaging

function post(message: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return /not found locally/i.test(message) ? SETUP_HINT : message
}

let tts: KokoroTTS | null = null
let currentJob = 0
// Jobs run one at a time; the model can't serve overlapping requests.
let queue: Promise<void> = Promise.resolve()

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  switch (msg.type) {
    case 'load':
      load(msg.device).catch((err) => post({ type: 'error', message: errorMessage(err) }))
      break
    case 'generate':
      currentJob = msg.jobId
      queue = queue.then(() => generate(msg.jobId, msg.chunks, msg.voice as VoiceId, msg.speed))
      break
    case 'cancel':
      if (currentJob === msg.jobId) currentJob = 0
      break
  }
})

// --- Model loading

async function pickDevice(requested?: Device): Promise<Device> {
  if (requested === 'wasm') return 'wasm'
  try {
    if (await navigator.gpu?.requestAdapter()) return 'webgpu'
  } catch {
    // Fall through to WASM.
  }
  return 'wasm'
}

async function load(requested?: Device) {
  const device = await pickDevice(requested)
  const files = new Map<string, { loaded: number; total: number }>()
  let lastPct = -1

  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    // Pairings from the official kokoro-js demo: q8 is fastest on CPU, fp32 is reliable on GPU.
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    device,
    progress_callback: (info) => {
      if (info.status !== 'progress') return
      files.set(info.file, { loaded: info.loaded, total: info.total })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      const pct = total ? Math.floor((loaded / total) * 100) : 0
      if (pct !== lastPct) {
        lastPct = pct
        post({ type: 'loadProgress', pct })
      }
    },
  })

  const voices: VoiceInfo[] = Object.entries(tts.voices)
    .filter(([, v]) => v.language.startsWith('en'))
    .map(([id, v]) => ({ id, name: v.name, language: v.language, gender: v.gender, grade: v.overallGrade }))
  post({ type: 'ready', device, voices })
}

// --- Generation

function toInt16(samples: Float32Array, silence: number): Int16Array<ArrayBuffer> {
  const out = new Int16Array(samples.length + silence)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

async function generate(jobId: number, chunks: Chunk[], voice: VoiceId, speed: number) {
  // A newer job replaced this one before it started.
  if (currentJob !== jobId) return
  if (!tts) {
    post({ type: 'error', jobId, message: 'The voice model is not loaded yet.' })
    return
  }

  let encoder: Mp3Encoder | null = null
  const mp3Parts: BlobPart[] = []
  let cancelled = false

  try {
    for (let index = 0; index < chunks.length; index++) {
      if (currentJob !== jobId) {
        cancelled = true
        break
      }
      const chunk = chunks[index]
      const audio = await tts.generate(chunk.text, { voice, speed })
      const sampleRate = audio.sampling_rate
      encoder ??= new Mp3Encoder(1, sampleRate, MP3_KBPS)

      const pcm = toInt16(audio.audio, Math.round((chunk.pauseAfterMs / 1000) * sampleRate))
      for (let i = 0; i < pcm.length; i += MP3_FRAME) {
        const bytes = encoder.encodeBuffer(pcm.subarray(i, i + MP3_FRAME))
        if (bytes.length) mp3Parts.push(bytes as Uint8Array<ArrayBuffer>)
      }

      post({ type: 'chunk', jobId, index, total: chunks.length, text: chunk.text, pcm, sampleRate }, [pcm.buffer])
    }
  } catch (err) {
    post({ type: 'error', jobId, message: errorMessage(err) })
    cancelled = true
  }

  if (encoder) {
    const tail = encoder.flush()
    if (tail.length) mp3Parts.push(tail as Uint8Array<ArrayBuffer>)
  }
  post({ type: 'done', jobId, mp3: new Blob(mp3Parts, { type: 'audio/mpeg' }), cancelled })
}
