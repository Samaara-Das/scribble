# Scribble — Product Requirements (v1)

## 1. Vision

A **free, viral, dead-simple tool** to draw/annotate live during video meetings, with **finger-tracking
via webcam** as the wow factor. One person uses it in a meeting, ~10 people see it, they want it too —
it spreads meeting-to-meeting. It's a **foot-in-the-door** product: a genuinely useful free tool that
builds a large user base, and later doubles as a **human-interface / input mode** for a separate
"second brain" product (everything drawn can be captured and fed in).

Reference inspiration: akshay/Contour (@thede_plandude) drawing arrows/circles over his **camera video**
while talking.

## 2. Target users

Anyone who explains things on video calls — trainers, teachers, team leads, designers, salespeople,
support. They take meetings **in the browser** (Zoom web, Google Meet, Teams web).

## 3. The core mechanism (what makes it work)

Other participants only see what's **in the video stream you send them**. So Scribble — a Chrome MV3
extension — patches `navigator.mediaDevices.getUserMedia` (camera) and `getDisplayMedia` (screen-share)
in the page (`world: MAIN`, `run_at: document_start`) and returns a **composited** `canvas.captureStream()`:
the original video frame with the annotation layer drawn on top. The annotations are therefore baked
into the outbound stream everyone receives. We reuse the **same** camera stream the app opened — no
second camera, no contention.

## 4. v1 scope

- **Camera air-draw (hero):** draw over your camera video while talking (no screen-share needed).
- **Screen-share annotation:** draw over your shared screen too.
- **Input:** finger-tracking (MediaPipe `HandLandmarker`, **pinch = pen down**) as the hero, **mouse**
  as the always-available fallback.
- **Platforms:** Zoom web, Google Meet, Teams web (one generic patch + thin per-client adapters).
- **Tools:** pen, colors, widths, eraser, undo, clear, on/off hotkey (Ctrl+Shift+D); **shapes
  (arrow / box / circle / line)**, **highlighter**, **laser pointer** (ink that fades).
- **Toolbar:** a floating Shadow-DOM toolbar (can't clash with the meeting app's CSS).
- **2nd-brain seam:** strokes are recorded locally as serializable `SessionExport` data — **no network
  pipe in v1**, just a clean seam for a later "second brain" integration.

## 5. Reliability

A browser may grab the camera before the extension installs its hook (a load-time race). v1 mitigates
with two-stage early injection plus a **one-time camera off→on toggle** to (re)trigger the hook — the
same UX the 200k-user "Virtual Backgrounds for Meet" extension uses. A **virtual-camera desktop helper**
(works in native apps too, no race) is a documented Phase-2 hedge.

## 6. Non-goals (v1)

- Native desktop Zoom/Teams apps (only browser-based meetings) — covered later by the virtual-camera helper.
- Text labels and movable/scalable objects (Edit/Move/Scale) — roadmap.
- Any networked second-brain upload — only the local seam exists.
- Mobile — roadmap (top item).

## 7. Architecture

```
src/inject/sentinel.ts     MAIN-world entry; boots ScribbleApp at document_start
src/inject/mediaPatch.ts   wraps getUserMedia / getDisplayMedia
src/inject/ScribbleApp.ts  orchestrator: engine + overlay + input + compositors + tracker + toolbar
src/pipeline/Compositor.ts source video + annotations -> canvas.captureStream
src/pipeline/HandTracker.ts MediaPipe HandLandmarker loop -> fingertip + pinch
src/pipeline/{oneEuroFilter,pinchDetector,coordMapper}.ts  finger math
src/drawing/{DrawingEngine,strokeModel,history}.ts  stroke state (normalized coords)
src/drawing/renderStrokes.ts  normalized -> px renderer (overlay + composite)
src/input/InputRouter.ts   finger/mouse arbitration (mouse always works)
src/ui/Toolbar.ts          Shadow-DOM toolbar
src/session/SessionRecorder.ts  the 2nd-brain seam (local only)
src/content/bridge.ts      ISOLATED: publishes asset base URL, relays hotkey
src/background.ts          service worker: Ctrl+Shift+D command
```

Strokes live in **normalized [0..1] space** so the same strokes render correctly on both the local
overlay (viewport-sized) and the composited output (video-sized). Finger jitter is tamed with a **1€
filter**; pinch uses **two-threshold hysteresis** with hand-size scaling (depth-invariant).

## 8. Success metric

Virality: meetings where a non-installer sees Scribble and installs it. (Product-analytics later.)

## 9. Risks

1. **Load-time race** → camera-toggle activation + early injection; virtual-camera helper hedge.
2. **Per-platform DOM/timing drift** (Meet/Teams) → thin `platforms/*` adapters; Zoom validated first.
3. **Finger precision/jitter** → 1€ filter, pinch hysteresis, mouse fallback.
4. **Store review / E2E encryption** → only hook getUserMedia/getDisplayMedia; never touch WebRTC internals.

## 10. Verification

Proven **headlessly** (no live call): a Playwright harness loads the unpacked extension with Chrome's
fake camera, draws a known stroke, and asserts the **outbound** camera and screen-share tracks contain
the annotation pixels (absent from the source). MediaPipe load+inference proven in-browser; the finger
math proven in unit tests. The one step a machine can't self-verify — a **live 2-account call** — is the
human check (see BUILD-RESULTS).
