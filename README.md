# Scribble ✏️

**Draw on your video calls — with your finger or your mouse. Free.**

Scribble is a Chrome extension that lets you annotate live during a video meeting. Doodle a circle,
throw an arrow, highlight a line — over your **camera video** while you talk, or over your
**screen-share** — and everyone in the call sees it. Draw with your **mouse**, or wave your hand and
**air-draw with your finger** (webcam hand-tracking).

It works by intercepting your camera/screen stream in the browser and compositing your drawings onto
it, so the annotations are baked into the video other people receive — no extra app, no second camera.

> Works on **Zoom (web)**, **Google Meet**, and **Microsoft Teams (web)**. Free and open-source (MIT).

## How it works

```
getUserMedia / getDisplayMedia          your drawing (mouse or MediaPipe finger-tracking)
        │                                          │
        ▼                                          ▼
   ┌─────────────────────────────────────────────────────┐
   │  Compositor: source video frame + annotation layer   │  → canvas.captureStream()
   └─────────────────────────────────────────────────────┘
        │
        ▼
   the stream the meeting app sends to everyone — annotations included
```

A `world: MAIN` content script patches `navigator.mediaDevices.getUserMedia` / `getDisplayMedia` at
`document_start`, so the stream the meeting app sends is the composited one. Finger-tracking uses
Google's MediaPipe `HandLandmarker` (bundled locally, runs in-browser); pinch = pen down.

## Develop

```bash
npm install
npm run fetch-assets     # download MediaPipe model + wasm into public/mediapipe
npm run build            # bundle into dist/
npm test                 # vitest unit tests
npm run test:e2e         # Playwright: compositing + hand-tracking proofs (headful Chrome)
```

Load it: `chrome://extensions` → **Developer mode** → **Load unpacked** → select `dist/`.

## Activate in a call

Join your meeting **in the browser**, then **toggle your camera off and on once** — that hands Scribble
your camera stream (it beats a browser load-time race). Hit **Ctrl+Shift+D** (or the toolbar) to draw.

## Status

v1 — see [`docs/PRD.md`](docs/PRD.md) for the spec, [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's next
(mobile, native-app support, and more), and [`docs/BUILD-RESULTS.md`](docs/BUILD-RESULTS.md) for the
verification evidence.

## License

MIT © 2026 Samaara Das
