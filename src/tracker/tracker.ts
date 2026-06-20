// Runs INSIDE a hidden extension-origin iframe (immune to the meeting site's
// Trusted Types — loading MediaPipe directly in the page's MAIN world throws
// "requires TrustedScriptURL"). The iframe does NOT open its own camera: on Meet,
// the meeting already holds the camera, so a second getUserMedia returns a black/
// frozen feed and detection finds no hand. Instead the parent (which owns the
// meeting's real camera via the wrapped getUserMedia) transfers downscaled frames
// in (zero-copy ImageBitmap, requestVideoFrameCallback-driven). We post back only
// {x,y,down,present} coords — never pixels.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark, HandSample } from '../shared/types';
import { OneEuroFilter2D } from '../pipeline/oneEuroFilter';
import { PinchDetector } from '../pipeline/pinchDetector';
import { CoordMapper } from '../pipeline/coordMapper';

const ASSET_BASE = location.href.replace(/tracker\.html.*$/, '');

let landmarker: HandLandmarker | null = null;
let delegate = 'unknown';
const filter = new OneEuroFilter2D({ minCutoff: 3.0, beta: 1.5 });
const pinch = new PinchDetector();
const mapper = new CoordMapper({ width: 1, height: 1, gain: 1.15, deadZone: 0.06, mirror: false });
const work = document.createElement('canvas');
const workCtx = work.getContext('2d', { willReadFrequently: true });
let lastSeen = 0;

// Forward prediction: extrapolate the fingertip by its velocity to hide the
// pipeline latency (what stylus drawing apps do). Modest + clamped so it doesn't
// overshoot on direction changes.
const PREDICT_MS = 55;
const MAX_PRED = 0.05; // normalized clamp
let lastP: { x: number; y: number; t: number } | null = null;

function predict(x: number, y: number, t: number): { x: number; y: number } {
  let px = x;
  let py = y;
  if (lastP) {
    const dt = t - lastP.t;
    if (dt > 0 && dt < 200) {
      let dx = ((x - lastP.x) / dt) * PREDICT_MS;
      let dy = ((y - lastP.y) / dt) * PREDICT_MS;
      const m = Math.hypot(dx, dy);
      if (m > MAX_PRED) {
        dx = (dx / m) * MAX_PRED;
        dy = (dy / m) * MAX_PRED;
      }
      px = Math.max(0, Math.min(1, x + dx));
      py = Math.max(0, Math.min(1, y + dy));
    }
  }
  lastP = { x, y, t };
  return { x: px, y: py };
}

function post(msg: unknown): void {
  parent.postMessage(msg, '*');
}

async function initModel(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(ASSET_BASE + 'mediapipe/wasm');
  const modelAssetPath = ASSET_BASE + 'mediapipe/hand_landmarker.task';
  const opts = { runningMode: 'VIDEO' as const, numHands: 1, minHandDetectionConfidence: 0.6 };
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'GPU' },
      ...opts,
    });
    delegate = 'GPU';
  } catch {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      ...opts,
    });
    delegate = 'CPU';
  }
}

function detect(source: HTMLCanvasElement, ts: number): void {
  if (!landmarker) return;
  let res: ReturnType<HandLandmarker['detectForVideo']> | null = null;
  try {
    res = landmarker.detectForVideo(source, ts);
  } catch {
    res = null;
  }
  const hand = res && res.landmarks && res.landmarks.length ? res.landmarks[0] : null;
  if (hand) {
    const lm = hand as unknown as HandLandmark[];
    const down = pinch.update(lm);
    const tip = lm[8];
    const mapped = mapper.map(tip.x, tip.y);
    const sm = filter.filter(mapped, ts);
    const p = predict(sm.x, sm.y, ts);
    lastSeen = ts;
    const sample: HandSample = { x: p.x, y: p.y, down, present: true, score: 1 };
    post({ type: 'scribble:hand', sample, ts }); // echo capture ts for latency measurement
  } else if (ts - lastSeen > 400) {
    pinch.reset();
    lastP = null;
    const sample: HandSample = { x: 0, y: 0, down: false, present: false, score: 0 };
    post({ type: 'scribble:hand', sample, ts });
  }
}

// Detect on frames the parent transfers in.
window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== parent) return;
  const data = e.data as { type?: string; bitmap?: ImageBitmap; ts?: number };
  if (!data || data.type !== 'scribble:frame' || !data.bitmap) return;
  const bitmap = data.bitmap;
  const ts = data.ts ?? performance.now();
  if (!landmarker || !workCtx) {
    bitmap.close();
    return;
  }
  if (work.width !== bitmap.width || work.height !== bitmap.height) {
    work.width = bitmap.width;
    work.height = bitmap.height;
  }
  workCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  detect(work, ts);
});

initModel()
  .then(() => post({ type: 'scribble:tracker-need-frames', delegate }))
  .catch((err) => post({ type: 'scribble:tracker-error', error: String(err) }));
