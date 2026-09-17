// One-time download of the Kokoro model files into public/models/.
// After this runs, the app never contacts Hugging Face again.
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'

// Must match the voice ids in kokoro-js (node_modules/kokoro-js/types/voices.d.ts).
const VOICES = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole',
  'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric',
  'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily',
  'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
]

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx', // fp32, used with WebGPU
  'onnx/model_quantized.onnx', // q8, used with WASM
  ...VOICES.map((id) => `voices/${id}.bin`),
]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destRoot = join(root, 'public/models', REPO)

async function expectedSizes() {
  const res = await fetch(`https://huggingface.co/api/models/${REPO}/tree/${REVISION}?recursive=true`)
  if (!res.ok) throw new Error(`Could not list model files (HTTP ${res.status})`)
  const entries = await res.json()
  return new Map(entries.filter((e) => e.type === 'file').map((e) => [e.path, e.lfs?.size ?? e.size]))
}

async function localSize(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function download(file, size) {
  const dest = join(destRoot, file)
  const part = `${dest}.part`
  await mkdir(dirname(dest), { recursive: true })

  const res = await fetch(`https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`)
  if (!res.ok || !res.body) throw new Error(`Download failed for ${file} (HTTP ${res.status})`)

  let received = 0
  let lastLogged = 0
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length
      if (size > 20_000_000 && received - lastLogged > 25_000_000) {
        lastLogged = received
        process.stdout.write(`  ${file}: ${formatMB(received)} / ${formatMB(size)}\n`)
      }
      cb(null, chunk)
    },
  })

  await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(part))
  if (received !== size) throw new Error(`Size mismatch for ${file}: got ${received}, expected ${size}`)
  await rename(part, dest)
}

const sizes = await expectedSizes()
let downloaded = 0
let skipped = 0

for (const file of FILES) {
  const size = sizes.get(file)
  if (size === undefined) throw new Error(`${file} not found in ${REPO}@${REVISION}`)

  if ((await localSize(join(destRoot, file))) === size) {
    skipped++
    continue
  }
  console.log(`Downloading ${file} (${formatMB(size)})`)
  await download(file, size)
  downloaded++
}

const total = FILES.reduce((sum, f) => sum + sizes.get(f), 0)
console.log(`Done: ${downloaded} downloaded, ${skipped} already present (${formatMB(total)} total) in public/models/`)
