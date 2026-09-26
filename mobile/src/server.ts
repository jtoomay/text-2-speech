// Serves the mirrored dist/ tree from local disk over http://127.0.0.1, so the
// WebView's fetches to /models/... and /ort/... resolve from device storage
// instead of the network — src/tts/worker.ts (the shared web code) needs no changes.
import Server from '@dr.pogodin/react-native-static-server'

// Matches the headers netlify.toml sets for the web app. Cross-origin isolation
// lets onnxruntime-web use multithreaded WASM *if* the WebView engine allows it;
// as of late 2026, Android WebView cannot expose SharedArrayBuffer at all (a
// platform limitation, not a header problem), so Kokoro runs single-threaded WASM
// there regardless. Worth re-testing on iOS as WKWebView evolves.
const COOP_COEP_CONFIG = `
  server.modules += ("mod_setenv")
  setenv.add-response-header = (
    "Cross-Origin-Opener-Policy" => "same-origin",
    "Cross-Origin-Embedder-Policy" => "require-corp"
  )
`

let server: Server | null = null

/** Starts (or reuses) the local server rooted at `fileDir`. Returns its origin. */
export async function startLocalServer(fileDir: string): Promise<string> {
  if (server) return server.origin ?? (await server.start())
  server = new Server({ fileDir, extraConfig: COOP_COEP_CONFIG })
  return server.start()
}

export async function stopLocalServer(): Promise<void> {
  await server?.stop()
  server = null
}
