# Scribble — Roadmap

Living backlog of future / deferred work. v1 (camera + screen-share annotation, finger + mouse, Zoom/
Meet/Teams web, headlessly proven) is built. Next, roughly in priority order:

| # | Item | Status | Why |
|---|------|--------|-----|
| 1 | **📱 Mobile version** (iOS/Android air-gesture app) | Planned | "You need it on mobile as well as web." Native MediaPipe SDK via React Native (`@thinksys/react-native-mediapipe`) or Flutter; the web `@mediapipe/tasks-vision` build can't run directly in RN/Flutter JS. Different UX: pinch = draw, two-finger tap = clear. |
| 2 | **Virtual-camera desktop helper** | Planned | Reliability hedge — a tiny desktop app that registers a system virtual camera (webcam → MediaPipe → annotate → virtual cam). Eliminates the load-time race AND works in **native** Zoom/Teams desktop apps. Tradeoff: it's a download. Build only if the camera-toggle proves too annoying. |
| 3 | **Second Cortex capture pipe** | Planned | Wire the existing `SessionRecorder` seam (`onSessionExport` / exported JSON+PNG) to the second-brain ingestion endpoint (auth + transport). Realizes "this tool is an input mode for the 2nd brain." |
| 4 | **Per-platform hardening** (Meet/Teams) | Ongoing | Thicken `src/platforms/*` adapters as real-world quirks surface (activation hints, DOM anchors, timing). Zoom is the most permissive; validate each on live calls. |
| 5 | **Text labels tool** | Planned | Type short labels onto the screen (keyboard handling inside the overlay). Cut from v1. |
| 6 | **Object model — Edit / Move / Scale** | Planned | Upgrade from raster freehand to a vector/object model so users can select, move, scale, and edit shapes (akshay's "Draw, Edit, Move, Scale objects"). The v1 vector stroke model is designed to make this a clean upgrade (likely Fabric.js). |
| 7 | **Save / replay sessions** | Idea | Export a session (strokes + timing) and replay; share a recording. |
| 8 | **Multi-user shared canvas** | Idea | Everyone in the call draws on a shared layer (needs a transport). |
| 9 | **Firefox / Edge ports** | Idea | MV3 is broadly portable; per-browser `world: MAIN` + injection quirks to verify. |
| 10 | **Onboarding + Chrome Web Store listing** | Planned | First-run flow that teaches the camera-toggle activation + gestures; store packaging, icons, privacy disclosures, listing copy. |
| 11 | **Real on-device finger-tracking tuning** | Planned | Tune 1€ filter params + pinch thresholds + camera-subregion gain on real webcams/lighting; the only true-hardware residual. |

## How to use this file
Each item: keep a one-line **why**. Promote an item to the built-in task list / a PR when you start it.
When v1 ships to the store, items 1–3 are the highest-leverage next moves (mobile reach, native-app
reliability, and the second-brain tie-in that's the whole strategic point).
