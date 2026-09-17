// Copies the ONNX Runtime files that Transformers.js needs into public/ort/
// so the browser loads them from this app instead of a CDN.
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules/@huggingface/transformers/dist')
const destDir = join(root, 'public/ort')
const files = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']

try {
  await stat(srcDir)
} catch {
  console.log('[copy-ort] @huggingface/transformers not installed yet, skipping')
  process.exit(0)
}

await mkdir(destDir, { recursive: true })
for (const file of files) {
  await copyFile(join(srcDir, file), join(destDir, file))
}
console.log(`[copy-ort] copied ${files.length} files to public/ort/`)
