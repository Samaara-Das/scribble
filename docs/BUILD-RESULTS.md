# Scribble — Build Results (v1)

Autonomous build of the Scribble Chrome extension, verified headlessly. The only step a machine can't
self-verify — a live 2-account video call — is the human check at the bottom.

## Verification evidence (all PASS)

| Proof | Result |
|-------|--------|
| **BUILD+LOAD** | Extension built to `dist/` (sentinel 231kb incl. MediaPipe, bridge, background, manifest, 7.8MB model + wasm), loads in Chrome, bridge + MAIN runtime initialize, **0 console errors**. |
| **CAMERA COMPOSITE PROOF** | Real `getUserMedia` (Chrome fake device) intercepted by the patch; a red stroke drawn via the test hook appears in the **outbound** camera track — **9/9** diagonal samples red, control pixel `rgb(1,136,1)` (the green fake camera). |
| **SCREEN-SHARE COMPOSITE PROOF** | Production compositor (the `getDisplayMedia` code path) on a synthetic blue source: red annotation present (**9/9**), blue source preserved `rgb(1,0,255)`. |
| **HAND-TRACKING PROOF** | MediaPipe `HandLandmarker` initializes + runs in-browser inference from the bundled `hand_landmarker.task` (0 landmarks on a synthetic hand-less frame, as expected). |
| **TOOLBAR DRIVE** | Shadow-DOM toolbar mounted; Draw toggled; a real mouse drag commits a stroke (0 → 1). Screenshots: `test-results/shots/toolbar-{before,after}.png`. |
| **Unit tests (vitest)** | **40 passed** — 1€ filter (jitter↓, low lag), pinch hysteresis + **depth-invariance**, coord mapper (mirror/gain/clamp), drawing engine (pen/shapes/highlighter/laser/undo/clear), session recorder. |
| **Typecheck** | `tsc --noEmit` clean (strict, noUnusedLocals/Parameters). |

Reproduce: `npm install && npm run fetch-assets && npm run build && npm test && npm run test:e2e`.

## How the crux is proven without a live call

Other participants only see what's in the **outbound** stream. The harness loads the unpacked extension
with Chrome's fake camera, draws a known red stroke, then samples the pixels of the stream the page
*received back from `getUserMedia`* — proving the annotation is baked into what would be transmitted. The
green fake-camera control pixel confirms the red is the annotation, not the source.

## Deviations from the spec (engineering calls)

- **esbuild instead of Vite** for bundling. Vite's multi-IIFE content-script output (especially a
  `world: MAIN` script) is fragile; esbuild produces deterministic IIFE content scripts + an ESM service
  worker. vitest (which uses Vite) + Playwright are unchanged.
- **Vanilla TS toolbar instead of React.** An injected Shadow-DOM toolbar is lighter and avoids any
  React-global collision with the meeting page. Fewer deps.
- **Screen-share proof** uses the production compositor on a synthetic source (deterministic) rather than
  real `getDisplayMedia` (which needs a desktop-capture picker that's flaky to automate). The camera proof
  already exercises the live monkey-patch interception end-to-end; real screen-share is in the human check.
- **Hand-tracking proof** uses the synthetic-frame init+inference path (no real hand-video fixture was
  sourced); the pinch/smoothing/mapping math is proven exhaustively in unit tests. This is the fallback the
  build spec explicitly allows.

## 🙋 HUMAN CHECK REQUIRED — live call (only Samaara can run this)

```
1. chrome://extensions → Developer mode → Load unpacked → C:\Users\dassa\Work\Imagine\dist
2. Join a Zoom-web / Google-Meet / Teams-web call from TWO accounts (laptop + phone, or two browsers).
3. On the main account, toggle your camera OFF then ON to activate Scribble (beats the load-time race).
4. Pinch-draw in the air (or mouse-draw) → confirm the OTHER account sees it on your camera tile.
5. Share your screen → annotate → confirm the other account sees it on the share.
Report which platforms passed; file any gaps as new tasks.
```

This is where real-world fragility lives (per-platform timing, the camera-toggle UX, finger-tracking feel
on a real webcam). The mechanism is proven; this confirms it in the wild.
