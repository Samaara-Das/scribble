/// <reference types="vitest/globals" />
import type { Point } from '../../src/shared/types';
import { DrawingEngine } from '../../src/drawing/DrawingEngine';
import { LASER_MS, __resetIds } from '../../src/drawing/strokeModel';

function pt(x: number, y: number, t = 0): Point {
  return { x, y, t };
}

beforeEach(() => {
  __resetIds();
});

describe('DrawingEngine — freehand pen', () => {
  it('begin + extend + extend + end commits one stroke with 3 points', () => {
    const e = new DrawingEngine();
    e.setTool('pen');

    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(5, 5));
    e.extendStroke(pt(10, 10));
    const committed = e.endStroke();

    expect(committed).toBeDefined();
    expect(committed?.tool).toBe('pen');
    expect(committed?.points).toHaveLength(3);

    const strokes = e.getStrokes();
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [5, 5],
      [10, 10],
    ]);
  });

  it('reflects setColor and setWidth on the committed stroke', () => {
    const e = new DrawingEngine();
    e.setTool('pen');
    e.setColor('#00ff00');
    e.setWidth(9);

    e.beginStroke(pt(1, 1));
    e.extendStroke(pt(2, 2));
    const s = e.endStroke();

    expect(s?.color).toBe('#00ff00');
    expect(s?.width).toBe(9);
  });
});

describe('DrawingEngine — shapes', () => {
  it('rect commits a closed 4-corner box', () => {
    const e = new DrawingEngine();
    e.setTool('rect');

    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(10, 10));
    const s = e.endStroke();

    expect(s?.tool).toBe('rect');
    // 4 corners + close back to the first => 5 points.
    const coords = s?.points.map((p) => [p.x, p.y]);
    expect(coords).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it('arrow commits shaft plus arrowhead points', () => {
    const e = new DrawingEngine();
    e.setTool('arrow');

    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(10, 0));
    const s = e.endStroke();

    expect(s?.tool).toBe('arrow');
    const pts = s?.points ?? [];
    // shaft (2) + two barb segments emitted as [tip, barbA, tip, barbB] => 6.
    expect(pts).toHaveLength(6);

    // Shaft runs start -> end.
    expect([pts[0].x, pts[0].y]).toEqual([0, 0]);
    expect([pts[1].x, pts[1].y]).toEqual([10, 0]);

    // Barbs point back from the tip (x < 10), one above and one below the axis.
    const barbA = pts[3];
    const barbB = pts[5];
    expect(barbA.x).toBeLessThan(10);
    expect(barbB.x).toBeLessThan(10);
    expect(Math.sign(barbA.y)).not.toBe(Math.sign(barbB.y));
  });

  it('ellipse commits a closed sampled outline', () => {
    const e = new DrawingEngine();
    e.setTool('ellipse');

    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(20, 10));
    const s = e.endStroke();

    expect(s?.tool).toBe('ellipse');
    const pts = s?.points ?? [];
    expect(pts.length).toBeGreaterThan(8);
    // Closed: first and last samples coincide.
    expect(pts[0].x).toBeCloseTo(pts[pts.length - 1].x, 6);
    expect(pts[0].y).toBeCloseTo(pts[pts.length - 1].y, 6);
  });
});

describe('DrawingEngine — tool variants', () => {
  it('highlighter commits with tool=highlighter', () => {
    const e = new DrawingEngine();
    e.setTool('highlighter');
    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(3, 3));
    const s = e.endStroke();
    expect(s?.tool).toBe('highlighter');
  });

  it('laser commits with expiresAt > createdAt', () => {
    const e = new DrawingEngine();
    e.setTool('laser');
    e.beginStroke(pt(0, 0, 1000));
    e.extendStroke(pt(5, 5, 1000));
    const s = e.endStroke();

    expect(s?.tool).toBe('laser');
    expect(s?.createdAt).toBe(1000);
    expect(s?.expiresAt).toBe(1000 + LASER_MS);
    expect((s?.expiresAt ?? 0) > (s?.createdAt ?? 0)).toBe(true);
  });
});

describe('DrawingEngine — history', () => {
  it('undo removes the last committed stroke and redo restores it', () => {
    const e = new DrawingEngine();
    e.setTool('pen');

    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(1, 1));
    const first = e.endStroke();

    e.beginStroke(pt(5, 5));
    e.extendStroke(pt(6, 6));
    const second = e.endStroke();

    expect(e.getStrokes()).toHaveLength(2);

    const undone = e.undo();
    expect(undone?.id).toBe(second?.id);
    expect(e.getStrokes()).toHaveLength(1);
    expect(e.getStrokes()[0].id).toBe(first?.id);

    const redone = e.redo();
    expect(redone?.id).toBe(second?.id);
    expect(e.getStrokes()).toHaveLength(2);
  });

  it('clear empties the committed list', () => {
    const e = new DrawingEngine();
    e.setTool('pen');
    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(1, 1));
    e.endStroke();

    e.clear();
    expect(e.getStrokes()).toHaveLength(0);
  });

  it('getStrokes(now) hides an expired laser stroke', () => {
    const e = new DrawingEngine();
    e.setTool('laser');
    e.beginStroke(pt(0, 0, 0));
    e.extendStroke(pt(2, 2, 0));
    e.endStroke();

    // Still alive just before expiry.
    expect(e.getStrokes(LASER_MS - 1)).toHaveLength(1);
    // Hidden at/after expiry.
    expect(e.getStrokes(LASER_MS)).toHaveLength(0);
    // Without a `now`, the committed list is unfiltered.
    expect(e.getStrokes()).toHaveLength(1);
  });
});

describe('DrawingEngine — render is defensive', () => {
  it('does not throw with a minimal stub ctx and issues path/stroke calls', () => {
    const e = new DrawingEngine();
    e.setTool('pen');
    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(5, 5));
    e.extendStroke(pt(10, 0));
    e.endStroke();

    const calls: string[] = [];
    const record = (name: string) => () => {
      calls.push(name);
    };
    const stub = {
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      stroke: record('stroke'),
    } as unknown as CanvasRenderingContext2D;

    expect(() => e.render(stub, 0)).not.toThrow();
    expect(calls).toContain('beginPath');
    expect(calls).toContain('moveTo');
    expect(calls).toContain('stroke');
  });

  it('tolerates a bare stub ctx missing most methods', () => {
    const e = new DrawingEngine();
    e.setTool('rect');
    e.beginStroke(pt(0, 0));
    e.extendStroke(pt(4, 4));
    e.endStroke();

    // Only globalAlpha-ish props; no drawing methods at all.
    const bare = {} as unknown as CanvasRenderingContext2D;
    expect(() => e.render(bare, 0)).not.toThrow();
  });
});
