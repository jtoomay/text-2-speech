import { existsSync } from 'node:fs'
import { open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// Cross-origin isolation enables multithreaded WASM for the non-WebGPU fallback.
// Safe because every file the app loads is served from this origin.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Hosts like Netlify recommend deploy files of 10 MB or less, so builds split larger
// model files into parts. src/tts/worker.ts joins them again using the manifest.
const PART_SIZE = 8 * 1024 * 1024
const PARTS_MANIFEST = 'models/parts.json'

// The mobile shell (mobile/) mirrors this build's output onto the device on first
// launch, then serves it from local disk forever after. fp32 model.onnx is WebGPU-only
// (mobile WebViews have no WebGPU), so it's excluded to keep the mobile download small.
const MIRROR_MANIFEST = 'mirror-manifest.json'
const WEBGPU_ONLY_PREFIX = 'models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx'

type PartsManifest = Record<string, { size: number; parts: number }>

async function* walkFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    // Never follow links: the originals are deleted once split.
    if (entry.isDirectory()) yield* walkFiles(path)
    else if (entry.isFile()) yield path
  }
}

async function splitFile(file: string, size: number): Promise<number> {
  const parts = Math.ceil(size / PART_SIZE)
  const source = await open(file)
  try {
    for (let i = 0; i < parts; i++) {
      const buffer = Buffer.alloc(Math.min(PART_SIZE, size - i * PART_SIZE))
      const { bytesRead } = await source.read(buffer, 0, buffer.length, i * PART_SIZE)
      if (bytesRead !== buffer.length) throw new Error(`Short read while splitting ${file}`)
      await writeFile(`${file}.part${i}`, buffer)
    }
  } finally {
    await source.close()
  }
  await rm(file)
  return parts
}

async function splitLargeModelFiles(outDir: string) {
  const modelsDir = join(outDir, 'models')
  if (!existsSync(modelsDir)) return
  const manifestPath = join(outDir, PARTS_MANIFEST)
  const manifest: PartsManifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : {}

  for await (const file of walkFiles(modelsDir)) {
    const { size } = await stat(file)
    if (size <= PART_SIZE) continue
    const parts = await splitFile(file, size)
    manifest[`/${relative(outDir, file).split(sep).join('/')}`] = { size, parts }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function writeMirrorManifest(outDir: string) {
  const manifest: Record<string, number> = {}
  for await (const file of walkFiles(outDir)) {
    const rel = relative(outDir, file).split(sep).join('/')
    if (rel === MIRROR_MANIFEST || rel.startsWith(WEBGPU_ONLY_PREFIX)) continue
    manifest[rel] = (await stat(file)).size
  }
  await writeFile(join(outDir, MIRROR_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
}

// Serving rules for the self-hosted model and runtime files:
// - Vite answers unknown paths with index.html (200). Transformers.js relies on a
//   real 404 to skip optional files and to report missing model files.
// - `vite preview` gzips responses on the fly, which is slow for a 326 MB model
//   and hides Content-Length (needed for load progress). Serve them as-is.
function localModelAssets(): Plugin {
  let publicDir = ''
  let outDir = ''
  let isBuild = false
  const middleware =
    (rootDir: () => string): Connect.NextHandleFunction =>
    (req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0])
      if (path.startsWith('/models/') || path.startsWith('/ort/')) {
        if (!existsSync(join(rootDir(), path))) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        delete req.headers['accept-encoding']
      }
      next()
    }
  return {
    name: 'local-model-assets',
    configResolved(config) {
      publicDir = config.publicDir
      outDir = resolve(config.root, config.build.outDir)
      isBuild = config.command === 'build'
    },
    configureServer: (server) => void server.middlewares.use(middleware(() => publicDir)),
    // Preview serves the build, where large model files exist only as parts.
    configurePreviewServer: (server) => void server.middlewares.use(middleware(() => outDir)),
    // Also called when the dev server stops; only split real build output.
    closeBundle: async () => {
      if (!isBuild) return
      await splitLargeModelFiles(outDir)
      await writeMirrorManifest(outDir)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localModelAssets()],
  worker: { format: 'es' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
