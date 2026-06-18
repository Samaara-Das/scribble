// Webcam -> MediaPipe HandLandmarker -> smoothed fingertip + pinch pen-down.
// Runs on a CLONE of the camera track so it never contends with the compositor.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmark } from '../shared/types';
import { OneEuroFilter2D } from './oneEuroFilter';
import { PinchDetector } from './pinchDetector';
import { CoordMapper } from './coordMapper';

export interface HandSample {
  /** normalized 0..1 canvas coords */
  x: number;
  y: number;
  down: boolean;
  present: boolean;
  score: number;
}

export type HandCallback = (s: HandSample) => void;

const DETECT_INTERVAL = 1000 / 30;

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private running = false;
  private raf = 0;
  private lastDetect = 0;
  private lastSeen = 0;
  private readonly filter = new OneEuroFilter2D({ minCutoff: 1.2, beta: 0.02 });
  private readonly pinch = new PinchDetector();
  private readonly mapper = new CoordMapper({ width: 1, height: 1, gain: 1.4, deadZone: 0.08, mirror: true });
  private readonly cb: HandCallback;
  private readonly baseUrl: string;

  constructor(baseUrl: string, cb: HandCallback) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.cb = cb;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(this.baseUrl + 'mediapipe/wasm');
    const modelAssetPath = this.baseUrl + 'mediapipe/hand_landmarker.task';
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    } catch {
      // headless / no-GPU fallback
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    }
  }

  async start(source: MediaStream): Promise<void> {
    await this.init();
    const tracks = source.getVideoTracks().map((t) => t.clone());
    this.stream = new MediaStream(tracks);
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      /* ignore; loop guards on readyState */
    }
    this.running = true;
    this.loop();
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    if (this.landmarker && this.video.readyState >= 2 && now - this.lastDetect >= DETECT_INTERVAL) {
      this.lastDetect = now;
      let res: ReturnType<HandLandmarker['detectForVideo']> | null = null;
      try {
        res = this.landmarker.detectForVideo(this.video, now);
      } catch {
        res = null;
      }
      const hand = res && res.landmarks && res.landmarks.length ? res.landmarks[0] : null;
      if (hand) {
        const lm = hand as unknown as HandLandmark[];
        const down = this.pinch.update(lm);
        const tip = lm[8];
        const mapped = this.mapper.map(tip.x, tip.y);
        const sm = this.filter.filter(mapped, now);
        const score = res && res.handedness?.[0]?.[0]?.score ? res.handedness[0][0].score : 1;
        this.cb({ x: sm.x, y: sm.y, down, present: true, score });
        this.lastSeen = now;
      } else if (now - this.lastSeen > 400) {
        this.pinch.reset();
        this.cb({ x: 0, y: 0, down: false, present: false, score: 0 });
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }

  /**
   * Test/diagnostic probe: load the bundled model + wasm and run a single
   * inference on a synthetic frame in-browser. Proves the MediaPipe pipeline
   * initializes and runs from our local assets (no CDN). Returns landmark count
   * (0 on a hand-less synthetic frame is expected — the pinch/smoothing math is
   * covered by unit tests).
   */
  static async probe(baseUrl: string): Promise<{ initialized: boolean; landmarks: number }> {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm');
    const modelAssetPath = base + 'mediapipe/hand_landmarker.task';
    let landmarker: HandLandmarker;
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
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = '#888';
      g.fillRect(0, 0, 256, 256);
    }
    const res = landmarker.detectForVideo(canvas, performance.now());
    const count = res.landmarks?.[0]?.length ?? 0;
    landmarker.close();
    return { initialized: true, landmarks: count };
  }
}
