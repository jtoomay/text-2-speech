# Readback mobile (spike)

A thin native shell around the existing web app (`../src`, `../dist` once built). It does
**not** reimplement Kokoro/onnxruntime-web — it downloads the web app's own build output to
the device once, serves it from local disk, and points a WebView at it. See
`../.claude/plans/i-want-you-to-typed-aho.md` (or ask Claude) for the full write-up; this file
is just the "how do I actually run it" cheat sheet.

## Before running

1. Deploy the root app to Netlify (or run `vite preview` locally) so there's a real origin to
   mirror from — building alone isn't enough, the manifest has to be fetched over HTTP.
2. Set `ORIGIN` in `src/config.ts` to that URL.
3. `npm install` in `mobile/` if you haven't (already done by this spike).

## First run (device download)

The app fetches `${ORIGIN}/mirror-manifest.json`, then downloads every file it lists (the built
web app + Kokoro's quantized WASM model + voices + the ONNX Runtime WASM binary — **not** the
310MB fp32/WebGPU model, mobile WebViews don't have WebGPU) into the app's document directory.
That's a one-time ~100MB download; every later launch checks the manifest against what's on
disk and, if it matches, skips straight to starting the local server — no network involved.

## Building

This project uses a custom dev client (not Expo Go), because `react-native-webview` and
`@dr.pogodin/react-native-static-server` are native modules Expo Go doesn't ship.

```bash
# iOS (needs Xcode + CocoaPods, both already on this machine)
npx expo prebuild --platform ios
npx expo run:ios

# Android (needs Android Studio + an SDK install — not present on this machine yet)
npx expo prebuild --platform android
npx expo run:android
```

`@dr.pogodin/react-native-static-server` also needs **CMake** on the build host (for iOS via
Homebrew; for Android it should ship inside Android Studio's SDK Manager under "SDK Tools"). See
its README for known CMake-version gotchas if a native build fails oddly.

**No paid Apple Developer account is needed** to build and run this on your own iPhone via
Xcode — a free Apple ID works for local device installs (Xcode just re-signs the app, and it
expires after 7 days, so you re-run `expo run:ios` occasionally). The $99/year Apple Developer
Program is only needed for TestFlight or App Store distribution.

**No local Android Studio install is strictly required either** if you'd rather not set one up:
`eas build --profile development --platform android` builds an installable APK in Expo's cloud
and you just sideload it — run it via `npx eas-cli@latest build ...`. See
[Expo's EAS docs](https://docs.expo.dev/eas/index.md).

## Known limitations (spike-stage, not yet verified on a physical device)

- **Single-threaded WASM only.** Android WebView cannot expose `SharedArrayBuffer` /
  cross-origin isolation at all (a platform limitation as of late 2026, not something the COOP/
  COEP headers this server sends can fix); iOS WKWebView has also been reported to pin
  onnxruntime-web to one thread even when threaded WASM loads. Practically: Kokoro will run
  noticeably slower per sentence here than the desktop threaded-WASM/WebGPU paths. Still
  correct, just not fast — confirm this is acceptable before investing further.
- **Audio autoplay.** iOS WKWebView's autoplay/gesture policies are the main open question for
  whether `StreamingPlayer`'s Web Audio playback "just works" or needs a tap-to-start affordance.
  Untested on a real device so far.
- **Backgrounding.** WebView-hosted audio generally doesn't survive the app being backgrounded.
  Not addressed in this pass; flagged in the plan as a possible reason to eventually move to a
  fully-native `onnxruntime-react-native` port (bigger rewrite, out of scope for now).
- `mirror-manifest.json` generation (root `vite.config.ts`) and this app were written and
  typechecked, but the end-to-end flow (real device, real Netlify origin, real model download)
  has not yet been run — that's the next step once `ORIGIN` points at a live deployment.
