// The stateful drawing manager.
//
// Holds the current tool/color/width, a History of committed strokes, and the
// single in-progress "wet" stroke. Its core logic has NO canvas dependency so
// it is fully unit-testable; `render(ctx, now)` is the only canvas-aware method
// and is written defensively so a minimal stub ctx never throws.
//
// Tool semantics:
//  - pen / eraser / highlighter / laser : freehand (points accumulate as the
//    pointer moves). Eraser renders with destination-out; highlighter renders
//    translucent; laser carries an expiry and fades.
//  - line / rect / ellipse / arrow      : shapes. The wet stroke's points are
//    recomputed from the start anchor to the live cursor via `shapePoints`.

import type { Stroke, ToolKind, Point } from '../shared/types';
import { History } from './history';
import { createStroke, addPoint, shapePoints, isExpired } from './strokeModel';

/** Tools whose geometry is derived from a start/end pair rather than freehand. */
const SHAPE_TOOLS: ReadonlySet<ToolKind> = new Set<ToolKind>([
  'line',
  'rect',
  'ellipse',
  'arrow',
]);

/** Opacity applied to highlighter strokes at render time. */
const HIGHLIGHTER_ALPHA = 0.35;

function isShape(tool: ToolKind): boolean {
  return SHAPE_TOOLS.has(tool);
}

export class DrawingEngine {
  private tool: ToolKind = 'pen';
  private color = '#ff3b30';
  private width = 4;

  private readonly history = new History();

  /** The in-progress stroke, or null when not drawing. */
  private wet: Stroke | null = null;
  /** Anchor point captured at beginStroke (used to recompute shape geometry). */
  private anchor: Point | null = null;

  setTool(tool: ToolKind): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  setWidth(width: number): void {
    this.width = width;
  }

  getTool(): ToolKind {
    return this.tool;
  }

  getColor(): string {
    return this.color;
  }

  getWidth(): number {
    return this.width;
  }

  /** Whether a stroke is currently being drawn. */
  get isDrawing(): boolean {
    return this.wet !== null;
  }

  /**
   * Start a stroke at `p`. For freehand tools this seeds the first point; for
   * shape tools it records the anchor (geometry fills in during extendStroke).
   */
  beginStroke(p: Point): void {
    const stroke = createStroke(this.tool, this.color, this.width, p.t);
    this.anchor = p;
    if (isShape(this.tool)) {
      // A click with no drag still yields a degenerate shape at the anchor.
      stroke.points = shapePoints(this.tool, p, p);
    } else {
      addPoint(stroke, p);
    }
    this.wet = stroke;
  }

  /**
   * Continue the active stroke to `p`. Freehand appends; shapes recompute the
   * whole polyline from the anchor. No-op if no stroke is active.
   */
  extendStroke(p: Point): void {
    if (this.wet === null || this.anchor === null) {
      return;
    }
    if (isShape(this.wet.tool)) {
      this.wet.points = shapePoints(this.wet.tool, this.anchor, p);
    } else {
      addPoint(this.wet, p);
    }
  }

  /**
   * Commit the active stroke to history. Returns the committed stroke, or
   * undefined if nothing was in progress.
   */
  endStroke(): Stroke | undefined {
    if (this.wet === null) {
      return undefined;
    }
    const stroke = this.wet;
    this.wet = null;
    this.anchor = null;
    this.history.push(stroke);
    return stroke;
  }

  /** Discard all committed strokes (and any redo branch). */
  clear(): void {
    this.history.clear();
  }

  /**
   * Object-eraser: remove any committed stroke that passes within `radius`
   * (normalized 0..1 units) of (x, y). Deterministic and renderer-agnostic — works
   * identically on the local overlay and the composited stream (unlike a
   * destination-out eraser, which is fragile across canvases). Returns count removed.
   */
  eraseAt(x: number, y: number, radius = 0.035): number {
    const r2 = radius * radius;
    return this.history.removeWhere(
      (s) =>
        s.tool !== 'eraser' &&
        s.points.some((p) => {
          const dx = p.x - x;
          const dy = p.y - y;
          return dx * dx + dy * dy <= r2;
        }),
    );
  }

  /** Undo the last committed stroke. */
  undo(): Stroke | undefined {
    return this.history.undo();
  }

  /** Redo the last undone stroke. */
  redo(): Stroke | undefined {
    return this.history.redo();
  }

  /**
   * Committed strokes. With `now` supplied, expired laser strokes are hidden;
   * without it, the full committed list is returned.
   */
  getStrokes(now?: number): Stroke[] {
    return now === undefined ? this.history.strokes : this.history.visible(now);
  }

  /**
   * Visible committed strokes PLUS the in-progress wet stroke — what should be
   * painted each frame (used by the normalized-space renderStrokes renderer).
   */
  getRenderList(now: number): Stroke[] {
    const list = this.history.visible(now);
    return this.wet !== null ? [...list, this.wet] : list;
  }

  /**
   * Render visible strokes (plus the wet stroke) into a Canvas2D context.
   *
   * NOT unit-tested for pixels — jsdom has no real canvas. Every ctx call is
   * feature-guarded so a minimal stub object won't throw; the method aims to be
   * correct in a real browser while staying defensive here.
   */
  render(ctx: CanvasRenderingContext2D, now: number): void {
    if (!ctx) {
      return;
    }
    const strokes = this.history.visible(now);
    for (const s of strokes) {
      this.drawStroke(ctx, s, now);
    }
    if (this.wet !== null) {
      this.drawStroke(ctx, this.wet, now);
    }
  }

  /** Draw a single stroke, guarding each ctx capability. */
  private drawStroke(
    ctx: CanvasRenderingContext2D,
    s: Stroke,
    now: number,
  ): void {
    if (s.points.length === 0) {
      return;
    }

    const save = (ctx as Partial<CanvasRenderingContext2D>).save;
    const restore = (ctx as Partial<CanvasRenderingContext2D>).restore;
    if (typeof save === 'function') {
      save.call(ctx);
    }

    try {
      this.applyStyle(ctx, s, now);
      this.tracePath(ctx, s);

      if (typeof (ctx as Partial<CanvasRenderingContext2D>).stroke === 'function') {
        (ctx as CanvasRenderingContext2D).stroke();
      }
    } finally {
      if (typeof restore === 'function') {
        restore.call(ctx);
      }
    }
  }

  /** Set line style / compositing / alpha for a stroke (all guarded). */
  private applyStyle(
    ctx: CanvasRenderingContext2D,
    s: Stroke,
    now: number,
  ): void {
    const c = ctx as unknown as Record<string, unknown>;

    c.lineWidth = s.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = s.color;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    if (s.tool === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
    } else if (s.tool === 'highlighter') {
      c.globalAlpha = HIGHLIGHTER_ALPHA;
    } else if (s.tool === 'laser' && s.expiresAt !== undefined) {
      // Fade linearly over the laser's remaining lifetime.
      const remaining = s.expiresAt - now;
      const total = s.expiresAt - s.createdAt;
      const ratio = total > 0 ? remaining / total : 0;
      c.globalAlpha = Math.max(0, Math.min(1, ratio));
    }
  }

  /**
   * Trace a stroke's path. Freehand pen-like tools are quadratic-smoothed;
   * shapes are drawn as plain polylines (their points already encode geometry).
   */
  private tracePath(ctx: CanvasRenderingContext2D, s: Stroke): void {
    const c = ctx as unknown as {
      beginPath?: () => void;
      moveTo?: (x: number, y: number) => void;
      lineTo?: (x: number, y: number) => void;
      quadraticCurveTo?: (
        cpx: number,
        cpy: number,
        x: number,
        y: number,
      ) => void;
    };

    const pts = s.points;
    if (typeof c.beginPath === 'function') {
      c.beginPath();
    }
    if (typeof c.moveTo === 'function') {
      c.moveTo(pts[0].x, pts[0].y);
    }

    const smooth = !isShape(s.tool) && typeof c.quadraticCurveTo === 'function';
    if (smooth && pts.length > 2) {
      for (let i = 1; i < pts.length - 1; i += 1) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        c.quadraticCurveTo?.(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      c.lineTo?.(last.x, last.y);
    } else {
      for (let i = 1; i < pts.length; i += 1) {
        c.lineTo?.(pts[i].x, pts[i].y);
      }
    }
  }

  /** Test/inspection helper: is `s` expired at `now`? */
  static expired(s: Stroke, now: number): boolean {
    return isExpired(s, now);
  }
}
