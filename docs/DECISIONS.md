# Scribble — Decisions (ADR) + session journal

Architecture decision records + the build journal, kept in-repo so they're durable and
get mined into MemPalace (wing `scribble`).

## Session journal — 2026-06-18 night → 2026-06-19

Scribble was **conceived and built v1 in a single overnight session.** [[daniel]] (Discord, eve of
2026-06-18) shared akshay/Contour (@thede_plandude)'s tweet — a browser plugin to draw on screen
while talking on a call — and pitched a **free finger-tracking app** that goes **viral in meetings**
(1 user → 10 watchers → …) → huge userbase → **foot-in-the-door to sell the 2nd brain (Second Cortex)**,
and doubles as an **input mode** for it. Samaara named it **Scribble**, planned it with Claude
(name/features/architecture via Q&A), authored a `/goal` prompt via `/goal-writer`, and ran an
**autonomous `/goal`** that shipped v1: headlessly proven (camera + screen composite pixel-proofs 9/9,
MediaPipe in-browser load, 40 unit + 5 e2e, 0 console errors), repo `Samaara-Das/scribble`, **PR #1**.
Adversarial review mid-build fixed the P0s. Remaining = the live 2-account call (human check) →
onboarding + Chrome Web Store.

## KG-style facts (for recall)

- Scribble **is** a free Chrome MV3 extension to draw/annotate on video calls (camera + screen-share).
- Scribble **technique:** wraps `getUserMedia`/`getDisplayMedia` → composited `canvas.captureStream` so
  annotations are in the **outbound** stream others receive.
- Scribble **hand-tracking:** MediaPipe `@mediapipe/tasks-vision` HandLandmarker, **pinch = pen down**.
- Scribble **funnels_to** → second-brain-product (Second Cortex) — the strategic point.
- Scribble **idea_from** → Daniel (off akshay/Contour's tweet). **License:** MIT. **Repo:** Samaara-Das/scribble.
- Scribble **build tooling:** esbuild + TypeScript (not Vite — reliable MAIN-world IIFE content scripts).

---

## ADR-001 — Chrome MV3 extension, NOT a desktop Electron overlay

**Decision.** Ship Scribble as a Chrome MV3 extension.

**Why.** People take these meetings **in the browser** → one-click install (no download). And the hero
use case — **air-drawing over your camera video while you're only on camera** — requires the drawing to
be **baked into the outbound media stream**, which a `getUserMedia`/`getDisplayMedia`-wrapping extension
does (composite → `canvas.captureStream`). A local screen overlay is invisible to other participants and
can't do camera-only annotation at all. Bonus: we reuse the app's own camera (no second-camera contention).

**Alternatives.** Electron transparent overlay (rejected — local-only, requires a download); pure web
app / whiteboard (rejected — only annotates its own tab); virtual-camera desktop helper (deferred to
Phase 2 as a reliability hedge for native apps).

**Revisit if.** Native desktop Zoom/Teams users become the priority, or the camera-toggle activation
proves too annoying → then ship the virtual-camera helper.

## ADR-002 — Build fresh on MediaPipe `tasks-vision`, don't fork the candidate repos

**Decision.** Use Google's `@mediapipe/tasks-vision` HandLandmarker (bundled locally), written fresh.

**Why.** Daniel's listed repos (harsh2hell/Finger-Tracking-Web = GPL, handtracking-io/yoha = unmaintained
since 2022, OpenCV_mouse = Python 2.7, …) were GPL/stale/Python — wrong license or stack for a free MIT
web product. `tasks-vision` is actively maintained, runs 30–60fps in-browser, Apache-2.0. Finger feel =
**1€ filter** (jitter) + **pinch hysteresis** (depth-invariant, two thresholds).

**Alternatives.** Fork harsh2hell (GPL copyleft blocks a free closed funnel); yoha (unmaintained).

**Revisit if.** A materially better in-browser hand model ships.

## ADR-003 — Reliability: pure extension + one-time camera toggle

**Decision.** v1 ships as a pure extension; the user toggles their camera off→on once to activate.

**Why.** Meeting apps grab the camera at page load, sometimes before our patch installs (a load-time
race). The off→on toggle re-invokes `getUserMedia` so our hook catches it — the **proven UX of the
200k-user "Virtual Backgrounds for Meet"** extension. Keeps the one-click-install advantage.

**Alternatives.** Virtual-camera desktop helper (no race, works in native apps) — kept as a Phase-2
hedge because it's a download that kills easy install.

**Revisit if.** The toggle proves too annoying in real use → ship the helper.

## ADR-004 — Prove the crux headlessly; the live call is the human check

**Decision.** Prove "annotations are in the outbound stream" with a Playwright pixel-assertion harness,
not a claim. The live 2-account call is a documented human check.

**Why.** "Other participants see it" can only be *fully* verified in a live call (an autonomous run
can't do that). So the harness loads the unpacked extension with Chrome's fake camera, draws a known
red stroke via a localhost-only test hook, and asserts the **outbound** `getUserMedia`/`getDisplayMedia`
track contains the annotation pixels (absent from the source). Result: 9/9 camera + 9/9 screen.

**Revisit if.** Ever tempted to claim "works" without the live-call check — don't. Headless-green ≠
works-end-to-end (the Elder Shield dead-scaffold lesson).
