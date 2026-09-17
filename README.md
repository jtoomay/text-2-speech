# Readback

Paste text, get natural-sounding speech and an MP3. Everything runs in the browser with the
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) model via [kokoro-js](https://www.npmjs.com/package/kokoro-js).
No API keys, no servers: the model and runtime files are served by this app.

## Setup

```sh
npm install            # also copies the ONNX runtime files into public/ort/
npm run setup:model    # one-time ~413 MB download of the model into public/models/
npm run dev
```

Open http://localhost:5173. After `setup:model`, the app never contacts an outside server;
the worker blocks any request that would leave the page's origin.

Chrome, Edge, or Safari with WebGPU runs about 10× faster than real time. Other browsers fall
back to WASM (about 1.4× real time on an M4 Pro). Add `?device=wasm` to the URL to force the fallback.

## Using it

Paste text and press **Read aloud** (⌘↵ / Ctrl+Enter). Audio starts as soon as the first sentence is
ready, and the **Read along** view highlights the sentence being read. Text still generating is shown
faded; click any sentence that's ready to play from there. **Space** plays or pauses, and **←** / **→**
move between sentences. **Download MP3** appears in the player when generation finishes.

## How it works

- `src/text/cleanup.ts` detects court-transcript formatting (margin line numbers, `Q.`/`A.` and
  `THE COURT:` speaker labels, hard-wrapped lines) and only cleans text that has it.
- `src/text/chunk.ts` splits text into sentence-based chunks of ≤250 characters, safely under
  Kokoro's input limit, so long transcripts aren't truncated.
- `src/tts/worker.ts` generates each chunk in a Web Worker and encodes an MP3 as it goes.
- `src/audio/StreamingPlayer.ts` plays sections as soon as they're ready, with seek and
  section skipping while generation continues.
- Fonts (Mona Sans, Literata) are bundled from `@fontsource-variable` packages, so the UI
  loads nothing from outside the app either.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build and local server for it |
| `npm test` | Unit tests for transcript cleanup and chunking |
| `npm run lint` | Oxlint |
| `npm run setup:model` | Download model files (skips files already present) |

`public/models/` and `public/ort/` are git-ignored; the scripts above recreate them.
To host the built app elsewhere, deploy `dist/` (it includes the model files) and send the
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers
so the WASM fallback can use multiple threads.
