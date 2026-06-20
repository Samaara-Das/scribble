// Central orchestrator (MAIN world). Owns the drawing state, the local overlay,
// input arbitration, the per-target compositors, hand-tracking, the toolbar, and
// the localhost test hook. Implements StreamWrapper (for the media patch) and
// ToolbarController (for the UI).
import { DrawingEngine } from '../drawing/DrawingEngine';
import { renderStrokes } from '../drawing/renderStrokes';
import { SessionRecorder } from '../session/SessionRecorder';
import { Compositor } from '../pipeline/Compositor';
import { FingerTracker } from '../pipeline/FingerTracker';
import { InputRouter, type InputMode } from '../input/InputRouter';
import { Toolbar, type ToolbarController } from '../ui/Toolbar';
import { installMediaPatch, type StreamWrapper } from './mediaPatch';
import { SCRIBBLE_EVENT, SCRIBBLE_BASE_ATTR } from '../shared/types';
import type { AnnotationTarget, ToolKind, Point, ScribbleTestApi, HandSample } from '../shared/types';

export class ScribbleApp implements StreamWrapper, ToolbarController {
  private readonly engine = new DrawingEngine();
  private readonly recorder = new SessionRecorder();
  private readonly input: InputRouter;
  private readonly toolbar: Toolbar;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly compositors = new Map<AnnotationTarget, Compositor>();
  private tracker: FingerTracker | null = null;
  private readonly isTest: boolean;
  private drawActive = false;
  private lastFinger: { x: number; y: number; down: boolean } | null = null;
  private started = false;
  private alive = true;
  private overlayRaf = 0;
  private readonly onResize = () => this.sizeOverlay();
  // (stroke timestamps are absolute performance.now() so laser fade compares clocks correctly)

  constructor() {
    this.isTest =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    this.overlay = document.createElement('canvas');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '2147483646',
    } as CSSStyleDeclaration);
    this.overlay.id = 'scribble-overlay';
    const ctx = this.overlay.getContext('2d');
    if (!ctx) throw new Error('Scribble: overlay 2D context unavailable');
    this.octx = ctx;

    this.input = new InputRouter({
      begin: (x, y) => this.sinkBegin(x, y),
      move: (x, y) => this.engine.extendStroke(this.pt(x, y)),
      end: () => this.sinkEnd(),
    });

    this.toolbar = new Toolbar(this);
  }

  /** Idempotent: install the media patch immediately, mount UI when the DOM is ready. */
  start(): void {
    if (this.started) return;
    this.started = true;
    installMediaPatch(this);
    // The test hook is stripped from production builds (esbuild dead-code-eliminates
    // this when NODE_ENV==='production'), so it can never inject on a real site.
    if (this.isTest && process.env.NODE_ENV !== 'production') this.exposeTestApi();
    const boot = () => {
      this.sizeOverlay();
      (document.body || document.documentElement).appendChild(this.overlay);
      if (window.top === window) this.toolbar.mount(); // toolbar only in the top frame
      this.recorder.start('camera');
      this.attachInput();
      this.listenHotkeys();
      window.addEventListener('resize', this.onResize);
      window.addEventListener('pagehide', () => this.dispose(), { once: true });
      this.overlayLoop();
    };
    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  // ---- StreamWrapper -------------------------------------------------------
  async wrapStream(stream: MediaStream, target: AnnotationTarget): Promise<MediaStream> {
    this.compositors.get(target)?.stop();
    const comp = new Compositor(stream, {
      fps: 30,
      draw: (ctx, now) => renderStrokes(ctx, this.engine.getRenderList(now), now),
    });
    const out = await comp.start();
    this.compositors.set(target, comp);

    if (target === 'camera') {
      if (!this.tracker) {
        const tracker = new FingerTracker(this.resolveBase(), (s) => this.onHand(s));
        this.tracker = tracker;
        tracker.start(stream).catch((e) => {
          console.warn('[Scribble] hand tracker unavailable, mouse still works', e);
          if (this.tracker === tracker) this.tracker = null; // allow retry next wrap
        });
      } else {
        // camera toggled/switched — re-point tracking at the new stream
        this.tracker.restart(stream).catch((e) =>
          console.warn('[Scribble] hand tracker restart failed', e),
        );
      }
    }
    return out;
  }

  // ---- ToolbarController ----------------------------------------------------
  setTool(tool: ToolKind): void {
    this.engine.setTool(tool);
  }
  setColor(color: string): void {
    this.engine.setColor(color);
  }
  setWidth(width: number): void {
    this.engine.setWidth(width);
  }
  undo(): void {
    this.engine.undo();
  }
  clearAll(): void {
    this.engine.clear();
  }
  toggleInput(): InputMode {
    return this.input.toggleMode();
  }
  toggleDraw(): boolean {
    this.setDrawActive(!this.drawActive);
    return this.drawActive;
  }

  // ---- internals ------------------------------------------------------------
  /** Extension base URL for bundled assets, supplied by the ISOLATED bridge via a DOM attr. */
  private resolveBase(): string {
    return document.documentElement.getAttribute(SCRIBBLE_BASE_ATTR) || '';
  }

  private setDrawActive(active: boolean): void {
    this.drawActive = active;
    this.overlay.style.pointerEvents = active ? 'auto' : 'none';
    this.overlay.style.cursor = active ? 'crosshair' : 'default';
    this.overlay.style.boxShadow = active ? 'inset 0 0 0 3px rgba(10,132,255,0.5)' : 'none';
    this.toolbar.setDrawActive(active);
  }

  private sinkBegin(x: number, y: number): void {
    this.engine.beginStroke(this.pt(x, y));
  }
  private sinkEnd(): void {
    const s = this.engine.endStroke();
    if (s) this.recorder.record(s);
  }
  private pt(x: number, y: number): Point {
    // absolute clock so laser's expiresAt (createdAt + LASER_MS) compares against
    // the same performance.now() the renderer uses — otherwise it expires instantly
    return { x, y, t: performance.now(), pressure: 1 };
  }

  private attachInput(): void {
    const o = this.overlay;
    o.addEventListener('pointerdown', (e) => {
      if (!this.drawActive) return;
      o.setPointerCapture(e.pointerId);
      this.input.onMouseDown(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    });
    o.addEventListener('pointermove', (e) => {
      if (!this.drawActive) return;
      this.input.onMouseMove(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    });
    const up = () => this.input.onMouseUp();
    o.addEventListener('pointerup', up);
    o.addEventListener('pointercancel', up);
  }

  private onHand(s: HandSample): void {
    this.toolbar.setFingerPresent(s.present);
    this.lastFinger = s.present ? { x: s.x, y: s.y, down: s.down } : null;
    if (this.drawActive) this.input.onHand(s);
  }

  private listenHotkeys(): void {
    window.addEventListener(SCRIBBLE_EVENT.toggleDraw, () => this.toggleDraw());
    window.addEventListener(SCRIBBLE_EVENT.toggleInput, () => {
      const mode = this.input.toggleMode();
      console.debug('[Scribble] input mode:', mode);
    });
  }

  private sizeOverlay(): void {
    this.overlay.width = window.innerWidth;
    this.overlay.height = window.innerHeight;
  }

  private overlayLoop = (): void => {
    if (!this.alive) return;
    const now = performance.now();
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    renderStrokes(this.octx, this.engine.getRenderList(now), now);
    this.drawFingerCursor();
    this.overlayRaf = requestAnimationFrame(this.overlayLoop);
  };

  /** Live dot at the fingertip — instant local feedback (the self-view tile lags ~150ms). */
  private drawFingerCursor(): void {
    if (!this.drawActive || !this.lastFinger || this.input.mode !== 'finger') return;
    const x = this.lastFinger.x * this.overlay.width;
    const y = this.lastFinger.y * this.overlay.height;
    const ctx = this.octx;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = this.lastFinger.down ? 'rgba(10,132,255,0.55)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, this.lastFinger.down ? 7 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Tear down everything (called on pagehide) so nothing leaks across SPA nav. */
  private dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    if (this.overlayRaf) cancelAnimationFrame(this.overlayRaf);
    window.removeEventListener('resize', this.onResize);
    this.tracker?.stop();
    for (const c of this.compositors.values()) c.stop();
    this.compositors.clear();
    this.overlay.remove();
  }

  private exposeTestApi(): void {
    const api: ScribbleTestApi = {
      setTool: (t) => this.engine.setTool(t),
      setColor: (c) => this.engine.setColor(c),
      setWidth: (w) => this.engine.setWidth(w),
      drawStroke: (points) => {
        if (points.length === 0) return;
        this.engine.beginStroke(this.pt(points[0].x, points[0].y));
        for (let i = 1; i < points.length; i++) {
          this.engine.extendStroke(this.pt(points[i].x, points[i].y));
        }
        this.sinkEnd();
      },
      clear: () => this.engine.clear(),
      flush: () => {
        const now = performance.now();
        this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        renderStrokes(this.octx, this.engine.getRenderList(now), now);
      },
      strokeCount: () => this.engine.getStrokes().length,
      trackerReady: () => this.tracker?.isReady ?? false,
    };
    (window as unknown as { __scribbleTest?: ScribbleTestApi }).__scribbleTest = api;
  }
}
