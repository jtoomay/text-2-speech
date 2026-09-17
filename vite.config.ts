import { existsSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// Cross-origin isolation enables multithreaded WASM for the non-WebGPU fallback.
// Safe because every file the app loads is served from this origin.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Serving rules for the self-hosted model and runtime files:
// - Vite answers unknown paths with index.html (200). Transformers.js relies on a
//   real 404 to skip optional files and to report missing model files.
// - `vite preview` gzips responses on the fly, which is slow for a 326 MB model
//   and hides Content-Length (needed for load progress). Serve them as-is.
function localModelAssets(): Plugin {
  const publicDir = join(import.meta.dirname, 'public')
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0])
    if (path.startsWith('/models/') || path.startsWith('/ort/')) {
      if (!existsSync(join(publicDir, path))) {
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
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localModelAssets()],
  worker: { format: 'es' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
