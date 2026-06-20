// MAIN-world driver for hand-tracking. MediaPipe runs in a hidden extension-origin
// iframe (src/tracker/tracker.ts) to dodge the meeting site's Trusted Types.
//
// Two modes, chosen by the iframe at runtime:
//   'self'   — the iframe opened the camera itself (lowest latency); we do nothing but
//              relay the {x,y,down,present} coords it sends.
//   'frames' — the iframe couldn't open the camera (Meet Permissions-Policy), so we pump
//              downscaled frames to it from a hidden <video> on the call's camera track,
//              driven by requestVideoFrameCallback (frame-synced, not a 30fps timer).
import type { HandSample } from '../shared/types';

export type HandCallback = (s: HandSample) => void;

const FRAME_W = 256;
const FRAME_H = 192;

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
};

export class FingerTracker {
  private readonly video: RVFCVideo;
  private readonly iframe: HTMLIFrameElement;
  private readonly cb: HandCallback;
  private readonly iframeOrigin: string;
  private readonly onMessage: (e: MessageEvent) => void;
  private pendingStream: MediaStream | null = null;
  private mode: 'pending' | 'self' | 'frames' = 'pending';
  private ready = false;
  private pumping = false;
  // latency instrumentation
  private latSum = 0;
  private latN = 0;
  private latLogAt = 0;

  constructor(baseUrl: string, cb: HandCallback) {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.cb = cb;
    try {
      this.iframeOrigin = new URL(base).origin;
    } catch {
      this.iframeOrigin = '*';
    }

    this.video = document.createElement('video') as RVFCVideo;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;

    this.iframe = document.createElement('iframe');
    this.iframe.allow = 'camera'; // lets the extension-origin iframe open the camera (self mode)
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
      const d = e.data as {
        type?: string;
        sample?: HandSample;
        ts?: number;
        mode?: string;
        delegate?: string;
        error?: string;
      };
      if (!d) return;
      if (d.type === 'scribble:tracker-ready') {
        this.mode = 'self';
        this.ready = true;
        console.debug('[Scribble] hand tracker: self-capture mode, delegate', d.delegate);
      } else if (d.type === 'scribble:tracker-need-frames') {
        this.mode = 'frames';
        this.ready = true;
        console.debug('[Scribble] hand tracker: frame-transfer mode, delegate', d.delegate);
        if (this.pendingStream) this.attachAndPump(this.pendingStream);
      } else if (d.type === 'scribble:hand' && d.sample) {
        if (typeof d.ts === 'number' && d.sample.present) this.logLatency(performance.now() - d.ts);
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
    this.pendingStream = stream;
    window.addEventListener('message', this.onMessage);
    (document.body || document.documentElement).appendChild(this.iframe);
    // The iframe will report 'self' or 'need-frames'; handlers take it from there.
  }

  /** Camera toggled/switched. Self mode is unaffected (iframe owns its own stream);
   *  frame mode re-points at the new stream. */
  async restart(stream: MediaStream): Promise<void> {
    this.pendingStream = stream;
    if (this.mode === 'frames') this.attachAndPump(stream);
  }

  private async attachAndPump(stream: MediaStream): Promise<void> {
    this.video.srcObject = new MediaStream(stream.getVideoTracks()); // shared track, no clone
    try {
      await this.video.play();
    } catch {
      /* loop guards on readyState */
    }
    if (this.pumping) return;
    this.pumping = true;
    const pump = (): void => {
      if (!this.pumping) return;
      if (this.video.readyState >= 2) this.pushFrame();
      if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(pump);
      else requestAnimationFrame(pump);
    };
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(pump);
    else requestAnimationFrame(pump);
  }

  private pushFrame(): void {
    createImageBitmap(this.video, {
      resizeWidth: FRAME_W,
      resizeHeight: FRAME_H,
      resizeQuality: 'low',
    })
      .then((bitmap) => {
        const win = this.iframe.contentWindow;
        if (!this.pumping || !win) {
          bitmap.close();
          return;
        }
        win.postMessage({ type: 'scribble:frame', bitmap, ts: performance.now() }, this.iframeOrigin, [bitmap]);
      })
      .catch(() => {
        /* transient; next frame retries */
      });
  }

  private logLatency(ms: number): void {
    this.latSum += ms;
    this.latN += 1;
    const now = performance.now();
    if (now - this.latLogAt > 2000) {
      console.debug(`[Scribble] finger latency ~${Math.round(this.latSum / this.latN)}ms (n=${this.latN})`);
      this.latSum = 0;
      this.latN = 0;
      this.latLogAt = now;
    }
  }

  stop(): void {
    this.pumping = false;
    window.removeEventListener('message', this.onMessage);
    this.iframe.remove();
    this.video.srcObject = null;
  }
}
