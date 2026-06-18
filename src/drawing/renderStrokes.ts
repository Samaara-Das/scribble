// Authoritative production renderer. Strokes are stored in NORMALIZED [0..1] space
// (resolution-independent) so the SAME strokes render correctly onto both the local
// overlay canvas (viewport-sized) and the composite output canvas (video-sized).
// Width is px on a 1000px-wide reference canvas, scaled to the target.
import type { Stroke, Point } from '../shared/types';

const WIDTH_REF = 1000;
const LASER_MS = 1200;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function px(p: Point, w: number, h: number): { x: number; y: number } {
  return { x: p.x * w, y: p.y * h };
}

function strokePolyline(ctx: Ctx2D, pts: Point[], w: number, h: number, smooth: boolean): void {
  if (pts.length === 0) return;
  const p0 = px(pts[0], w, h);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  if (pts.length === 1) {
    // a dot
    ctx.lineTo(p0.x + 0.01, p0.y + 0.01);
    ctx.stroke();
    return;
  }
  if (!smooth || pts.length === 2) {
    for (let i = 1; i < pts.length; i++) {
      const p = px(pts[i], w, h);
      ctx.lineTo(p.x, p.y);
    }
  } else {
    // quadratic smoothing through midpoints for buttery freehand
    for (let i = 1; i < pts.length - 1; i++) {
      const c = px(pts[i], w, h);
      const n = px(pts[i + 1], w, h);
      const mx = (c.x + n.x) / 2;
      const my = (c.y + n.y) / 2;
      ctx.quadraticCurveTo(c.x, c.y, mx, my);
    }
    const last = px(pts[pts.length - 1], w, h);
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

/** Render every visible stroke onto ctx. now drives laser fade. */
export function renderStrokes(ctx: Ctx2D, strokes: Stroke[], now: number): void {
  const canvas = ctx.canvas as { width: number; height: number };
  const w = canvas.width;
  const h = canvas.height;
  const scale = w / WIDTH_REF;

  for (const s of strokes) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(1, s.width * scale);

    const isShape = s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse' || s.tool === 'arrow';
    const smooth = !isShape && s.tool !== 'eraser';

    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(8, s.width * scale * 2);
    } else if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = Math.max(10, s.width * scale * 3);
    } else if (s.tool === 'laser') {
      const remaining = s.expiresAt ? s.expiresAt - now : LASER_MS;
      ctx.globalAlpha = Math.max(0, Math.min(1, remaining / LASER_MS));
      // glow
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12 * scale;
    }

    strokePolyline(ctx, s.points, w, h, smooth);
    ctx.restore();
  }
}
