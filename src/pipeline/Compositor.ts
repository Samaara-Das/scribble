// Composites a source video MediaStream + an annotation draw callback into an output
// canvas, and exposes the canvas as a MediaStream (canvas.captureStream). The output
// stream is what the meeting app sends to other participants — so annotations drawn
// here are seen by everyone, with NO second camera opened (we reuse the app's stream).
type DrawFn = (ctx: CanvasRenderingContext2D, now: number) => void;

export interface CompositorOptions {
  fps?: number;
  draw: DrawFn;
}

export class Compositor {
  private readonly source: MediaStream;
  private readonly fps: number;
  private readonly draw: DrawFn;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private out: MediaStream | null = null;
  private raf = 0;
  private running = false;

  constructor(source: MediaStream, opts: CompositorOptions) {
    this.source = source;
    this.fps = opts.fps ?? 30;
    this.draw = opts.draw;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Scribble: 2D context unavailable');
    this.ctx = ctx;
  }

  async start(): Promise<MediaStream> {
    this.video.srcObject = new MediaStream(this.source.getVideoTracks());
    try {
      await this.video.play();
    } catch {
      /* play() can reject without a gesture; the loop still pulls frames once ready */
    }
    await this.waitForFrame();
    this.syncSize();
    this.running = true;
    this.loop();

    const captured = this.canvas.captureStream(this.fps);
    this.out = new MediaStream();
    for (const t of captured.getVideoTracks()) this.out.addTrack(t);
    for (const t of this.source.getAudioTracks()) this.out.addTrack(t); // pass audio through untouched
    return this.out;
  }

  private waitForFrame(): Promise<void> {
    return new Promise((resolve) => {
      const ready = () => this.video.videoWidth > 0 && this.video.readyState >= 2;
      if (ready()) return resolve();
      const onReady = () => {
        if (ready()) {
          this.video.removeEventListener('loadeddata', onReady);
          resolve();
        }
      };
      this.video.addEventListener('loadeddata', onReady);
      // safety timeout so we never hang the patched getUserMedia
      setTimeout(resolve, 1500);
    });
  }

  private syncSize(): void {
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    this.syncSize();
    const { ctx, canvas } = this;
    if (this.video.readyState >= 2) {
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    try {
      this.draw(ctx, performance.now());
    } catch {
      /* never let an annotation error break the call's video */
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  get stream(): MediaStream | null {
    return this.out;
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.out?.getVideoTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}
