// MAIN-world driver for hand-tracking. MediaPipe itself runs in a hidden
// extension-origin iframe (see src/tracker/tracker.ts) to dodge the meeting site's
// Trusted Types. This class owns the iframe + a hidden <video> on the camera track,
// grabs downscaled frames, transfers them (zero-copy ImageBitmap) to the iframe, and
// relays the iframe's HandSamples to the InputRouter.
import type { HandSample } from '../shared/types';

export type HandCallback = (s: HandSample) => void;

const SEND_INTERVAL = 1000 / 30; // 30fps for lower perceived lag
const FRAME_W = 320;
const FRAME_H = 240;

export class FingerTracker {
  private readonly video: HTMLVideoElement;
  private readonly iframe: HTMLIFrameElement;
  private readonly cb: HandCallback;
  private readonly iframeOrigin: string;
  private readonly onMessage: (e: MessageEvent) => void;
  private stream: MediaStream | null = null;
  private running = false;
  private raf = 0;
  private lastSend = 0;
  private ready = false;

  constructor(baseUrl: string, cb: HandCallback) {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.cb = cb;
    try {
      this.iframeOrigin = new URL(base).origin;
    } catch {
      this.iframeOrigin = '*';
    }

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;

    this.iframe = document.createElement('iframe');
    this.iframe.src = base + 'tracker.html';
    Object.assign(this.iframe.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      left: '-10px',
      top: '-10px',
      opacity: '0',
      border: '0',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    this.iframe.setAttribute('aria-hidden', 'true');

    this.onMessage = (e: MessageEvent) => {
      if (e.source !== this.iframe.contentWindow) return;
      const d = e.data as { type?: string; sample?: HandSample; error?: string };
      if (!d) return;
      if (d.type === 'scribble:tracker-ready') {
        this.ready = true;
      } else if (d.type === 'scribble:hand' && d.sample) {
        this.cb(d.sample);
      } else if (d.type === 'scribble:tracker-error') {
        console.warn('[Scribble] hand tracker iframe error', d.error);
      }
    };
  }

  get isReady(): boolean {
    return this.ready;
  }

  async start(stream: MediaStream): Promise<void> {
    window.addEventListener('message', this.onMessage);
    (document.body || document.documentElement).appendChild(this.iframe);
    await this.attach(stream);
  }

  /** Re-point at a new camera stream (camera toggled/switched) — iframe stays. */
  async restart(stream: MediaStream): Promise<void> {
    await this.attach(stream);
  }

  private async attach(stream: MediaStream): Promise<void> {
    // Share the app's camera tracks (no clone) so we never hold the camera open.
    this.stream = new MediaStream(stream.getVideoTracks());
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      /* loop guards on readyState */
    }
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    if (this.ready && this.video.readyState >= 2 && now - this.lastSend >= SEND_INTERVAL) {
      this.lastSend = now;
      createImageBitmap(this.video, {
        resizeWidth: FRAME_W,
        resizeHeight: FRAME_H,
        resizeQuality: 'low',
      })
        .then((bitmap) => {
          const win = this.iframe.contentWindow;
          if (!this.running || !win) {
            bitmap.close();
            return;
          }
          win.postMessage({ type: 'scribble:frame', bitmap, ts: now }, this.iframeOrigin, [bitmap]);
        })
        .catch(() => {
          /* frame grab can fail transiently; next tick retries */
        });
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('message', this.onMessage);
    this.iframe.remove();
    this.video.srcObject = null;
  }
}
