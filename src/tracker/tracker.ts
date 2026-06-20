// Runs INSIDE a hidden extension-origin iframe (immune to the meeting site's
// Trusted Types). Two capture paths, chosen at runtime for lowest latency:
//   SELF  (preferred): the iframe calls getUserMedia itself and detects on its own
//          video via requestVideoFrameCallback — no per-frame transfer from the page.
//   FRAMES (fallback): if the iframe can't open the camera (Meet Permissions-Policy),
//          the parent pumps frames in and we detect on those.
// Either way we post ONLY {x,y,down,present} coords back — never pixels.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark, HandSample } from '../shared/types';
import { OneEuroFilter2D } from '../pipeline/oneEuroFilter';
import { PinchDetector } from '../pipeline/pinchDetector';
import { CoordMapper } from '../pipeline/coordMapper';

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
};

const ASSET_BASE = location.href.replace(/tracker\.html.*$/, '');

let landmarker: HandLandmarker | null = null;
let delegate = 'unknown';
const filter = new OneEuroFilter2D({ minCutoff: 3.0, beta: 1.5 });
const pinch = new PinchDetector();
const mapper = new CoordMapper({ width: 1, height: 1, gain: 1.15, deadZone: 0.06, mirror: false });
const work = document.createElement('canvas');
const workCtx = work.getContext('2d', { willReadFrequently: true });
let lastSeen = 0;

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

function detect(source: HTMLVideoElement | HTMLCanvasElement, ts: number): void {
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
    lastSeen = ts;
    const sample: HandSample = { x: sm.x, y: sm.y, down, present: true, score: 1 };
    post({ type: 'scribble:hand', sample });
  } else if (ts - lastSeen > 400) {
    pinch.reset();
    const sample: HandSample = { x: 0, y: 0, down: false, present: false, score: 0 };
    post({ type: 'scribble:hand', sample });
  }
}

/** Preferred path: open the camera here and detect as fast as frames arrive. */
async function startSelfCapture(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    const video = document.createElement('video') as RVFCVideo;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    const pump = (): void => {
      if (video.readyState >= 2) detect(video, performance.now());
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump);
      else requestAnimationFrame(pump);
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump);
    else requestAnimationFrame(pump);
    return true;
  } catch {
    return false;
  }
}

// Fallback path: detect on frames the parent transfers in.
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

async function main(): Promise<void> {
  await initModel();
  const self = await startSelfCapture();
  if (self) post({ type: 'scribble:tracker-ready', mode: 'self', delegate });
  else post({ type: 'scribble:tracker-need-frames', delegate });
}

main().catch((err) => post({ type: 'scribble:tracker-error', error: String(err) }));
