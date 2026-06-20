// Runs INSIDE a hidden iframe whose origin is chrome-extension://<id> (a Scribble
// page), embedded into the meeting page. Because it's our own origin, the meeting
// site's Trusted Types / CSP do NOT apply here, so MediaPipe loads cleanly (loading
// it directly in the meeting page's MAIN world throws "requires TrustedScriptURL").
//
// Protocol (postMessage with the parent window):
//   parent -> iframe: { type:'scribble:frame', bitmap:ImageBitmap, ts:number }
//   iframe -> parent: { type:'scribble:tracker-ready' }
//                     { type:'scribble:hand', sample:HandSample }
//                     { type:'scribble:tracker-error', error:string }
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark, HandSample } from '../shared/types';
import { OneEuroFilter2D } from '../pipeline/oneEuroFilter';
import { PinchDetector } from '../pipeline/pinchDetector';
import { CoordMapper } from '../pipeline/coordMapper';

// Assets live next to this page (same extension dir).
const ASSET_BASE = location.href.replace(/tracker\.html.*$/, '');

let landmarker: HandLandmarker | null = null;
// Less smoothing lag (higher minCutoff + much higher beta so it tracks fast moves).
const filter = new OneEuroFilter2D({ minCutoff: 2.6, beta: 1.2 });
const pinch = new PinchDetector();
// mirror:false — we draw on the RAW camera frame, so the cursor follows the hand
// correctly in BOTH the user's mirrored self-view AND what others see. (mirror:true
// inverted it → "drawings don't happen where I want".) Gain near 1:1 for precision.
const mapper = new CoordMapper({ width: 1, height: 1, gain: 1.15, deadZone: 0.06, mirror: false });
const work = document.createElement('canvas');
const workCtx = work.getContext('2d');
let lastSeen = 0;

function post(msg: unknown): void {
  parent.postMessage(msg, '*');
}

async function init(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(ASSET_BASE + 'mediapipe/wasm');
  const modelAssetPath = ASSET_BASE + 'mediapipe/hand_landmarker.task';
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  } catch {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  }
  post({ type: 'scribble:tracker-ready' });
}

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

  let res: ReturnType<HandLandmarker['detectForVideo']> | null = null;
  try {
    res = landmarker.detectForVideo(work, ts);
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
});

init().catch((err) => post({ type: 'scribble:tracker-error', error: String(err) }));
