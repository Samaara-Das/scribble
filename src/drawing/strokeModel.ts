// Pure stroke state + shape geometry.
//
// This module owns the *data* of a mark — never the canvas. Everything here is
// deterministic and dependency-free so it can be exhaustively unit-tested in
// jsdom (which has no real Canvas2D). Rendering lives elsewhere.

import type { Stroke, ToolKind, Point } from '../shared/types';

/** How long a laser stroke lives before it fully fades (ms). */
export const LASER_MS = 1200;

// Monotonic id counter. Injectable/resettable so tests are deterministic;
// avoids time- or randomness-based ids that would make assertions flaky.
let idCounter = 0;

/** Mint a unique, deterministic stroke id (`s0`, `s1`, …). */
export function newStrokeId(): string {
  const id = `s${idCounter}`;
  idCounter += 1;
  return id;
}

/** Test-only: reset the id counter so a suite starts from `s0`. */
export function __resetIds(): void {
  idCounter = 0;
}

/**
 * Create a fresh, empty stroke for `tool`.
 * @param now wall-clock ms used for createdAt (and laser expiry).
 */
export function createStroke(
  tool: ToolKind,
  color: string,
  width: number,
  now: number,
): Stroke {
  const stroke: Stroke = {
    id: newStrokeId(),
    tool,
    color,
    width,
    points: [],
    createdAt: now,
  };
  if (tool === 'laser') {
    stroke.expiresAt = now + LASER_MS;
  }
  return stroke;
}

/** Append a point to a stroke (mutates in place). */
export function addPoint(s: Stroke, p: Point): void {
  s.points.push(p);
}

/**
 * Whether a stroke should no longer be visible.
 * Only laser strokes expire; everything else lives forever.
 */
export function isExpired(s: Stroke, now: number): boolean {
  return s.expiresAt !== undefined && now >= s.expiresAt;
}

/** Number of segments used to sample an ellipse outline. */
const ELLIPSE_SEGMENTS = 48;

/** Length of each arrowhead barb, as a fraction of the shaft length. */
const ARROWHEAD_FRACTION = 0.25;

/** Half-angle (radians) between the shaft and each arrowhead barb. */
const ARROWHEAD_ANGLE = Math.PI / 7;

function clonePoint(src: Point, x: number, y: number): Point {
  const p: Point = { x, y, t: src.t };
  if (src.pressure !== undefined) {
    p.pressure = src.pressure;
  }
  return p;
}

/**
 * The polyline/points used to render a shape tool from `start` to `end`.
 *
 * Pure geometry — no canvas, no state:
 *  - `line`    => [start, end]
 *  - `rect`    => 4 corners, closed back to the first (5 points)
 *  - `ellipse` => sampled outline, closed (ELLIPSE_SEGMENTS + 1 points)
 *  - `arrow`   => shaft [start, end] + two barb segments back from the tip,
 *                 emitted as [start, end, end, barbA, end, barbB]
 *
 * Non-shape tools (pen/eraser/highlighter/laser) are freehand and don't pass
 * through here; for them this returns the two endpoints as a sane fallback.
 *
 * Timestamps/pressure are inherited from `end` (the live cursor) so the result
 * is still a valid Point[].
 */
export function shapePoints(
  tool: ToolKind,
  start: Point,
  end: Point,
): Point[] {
  switch (tool) {
    case 'rect': {
      return [
        clonePoint(end, start.x, start.y),
        clonePoint(end, end.x, start.y),
        clonePoint(end, end.x, end.y),
        clonePoint(end, start.x, end.y),
        clonePoint(end, start.x, start.y),
      ];
    }

    case 'ellipse': {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const pts: Point[] = [];
      for (let i = 0; i <= ELLIPSE_SEGMENTS; i += 1) {
        const theta = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        pts.push(
          clonePoint(end, cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)),
        );
      }
      return pts;
    }

    case 'arrow': {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const shaftLen = Math.hypot(end.x - start.x, end.y - start.y);
      const barb = shaftLen * ARROWHEAD_FRACTION;
      const aAngle = angle - ARROWHEAD_ANGLE;
      const bAngle = angle + ARROWHEAD_ANGLE;
      const barbA = clonePoint(
        end,
        end.x - barb * Math.cos(aAngle),
        end.y - barb * Math.sin(aAngle),
      );
      const barbB = clonePoint(
        end,
        end.x - barb * Math.cos(bAngle),
        end.y - barb * Math.sin(bAngle),
      );
      // shaft, then each barb drawn back out from the tip.
      return [
        clonePoint(start, start.x, start.y),
        clonePoint(end, end.x, end.y),
        clonePoint(end, end.x, end.y),
        barbA,
        clonePoint(end, end.x, end.y),
        barbB,
      ];
    }

    case 'line':
    default: {
      return [
        clonePoint(start, start.x, start.y),
        clonePoint(end, end.x, end.y),
      ];
    }
  }
}
