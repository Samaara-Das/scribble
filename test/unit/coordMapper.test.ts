import { CoordMapper, mapNormalizedToCanvas } from '../../src/pipeline/coordMapper';

const W = 1000;
const H = 800;

describe('CoordMapper', () => {
  it('maps the frame center to the canvas center', () => {
    const m = new CoordMapper({ width: W, height: H });
    const c = m.map(0.5, 0.5);
    expect(c.x).toBeCloseTo(W / 2, 6);
    expect(c.y).toBeCloseTo(H / 2, 6);
  });

  it('mirrors x by default: nx=0 lands on the right edge', () => {
    const m = new CoordMapper({ width: W, height: H }); // mirror defaults true
    const right = m.map(0, 0.5);
    expect(right.x).toBeCloseTo(W, 6); // flipped to the right side
    const left = m.map(1, 0.5);
    expect(left.x).toBeCloseTo(0, 6);
  });

  it('does not flip x when mirror is disabled', () => {
    const m = new CoordMapper({ width: W, height: H, mirror: false });
    expect(m.map(0, 0.5).x).toBeCloseTo(0, 6);
    expect(m.map(1, 0.5).x).toBeCloseTo(W, 6);
  });

  it('reaches all four corners with default gain/deadZone (mirror off)', () => {
    const m = new CoordMapper({ width: W, height: H, mirror: false });
    expect(m.map(0, 0)).toEqual({ x: 0, y: 0 }); // top-left
    expect(m.map(1, 0)).toEqual({ x: W, y: 0 }); // top-right
    expect(m.map(0, 1)).toEqual({ x: 0, y: H }); // bottom-left
    expect(m.map(1, 1)).toEqual({ x: W, y: H }); // bottom-right
  });

  it('clamps out-of-range normalized values to the canvas bounds', () => {
    const m = new CoordMapper({ width: W, height: H, mirror: false });
    const lo = m.map(-5, -5);
    expect(lo.x).toBe(0);
    expect(lo.y).toBe(0);
    const hi = m.map(5, 5);
    expect(hi.x).toBe(W);
    expect(hi.y).toBe(H);
    // Every output stays within bounds for arbitrary inputs.
    for (const [nx, ny] of [
      [-1, 0.2],
      [2, 0.9],
      [0.5, -3],
      [0.1, 7],
    ] as Array<[number, number]>) {
      const p = m.map(nx, ny);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H);
    }
  });

  it('a smaller gain shrinks the usable region so the center still reaches edges', () => {
    // gain 1.0, deadZone 0 -> usable half-extent 0.5 (full frame): edges at 0/1.
    const full = new CoordMapper({ width: W, height: H, mirror: false, gain: 1, deadZone: 0 });
    expect(full.map(0, 0.5).x).toBeCloseTo(0, 6);
    expect(full.map(1, 0.5).x).toBeCloseTo(W, 6);

    // gain 1.0, deadZone 0.25 -> usable region [0.25, 0.75]; 0.25 -> left edge.
    const inset = new CoordMapper({ width: W, height: H, mirror: false, gain: 1, deadZone: 0.25 });
    expect(inset.map(0.25, 0.5).x).toBeCloseTo(0, 6);
    expect(inset.map(0.75, 0.5).x).toBeCloseTo(W, 6);
    expect(inset.map(0.5, 0.5).x).toBeCloseTo(W / 2, 6);
    // A value left of the region clamps to the left edge.
    expect(inset.map(0.1, 0.5).x).toBe(0);
  });

  it('gain amplifies a centered region so it reaches edges before the frame edge', () => {
    // gain 2, deadZone 0 -> half-extent clamped to 0.5 anyway; use deadZone to
    // exercise amplification: base 0.3, *2 = 0.6 -> clamps to 0.5 (full frame).
    // Pick params that stay below the 0.5 clamp to verify true amplification:
    // base 0.2 (deadZone 0.3), gain 2 -> half-extent 0.4 -> region [0.1, 0.9].
    const m = new CoordMapper({ width: W, height: H, mirror: false, gain: 2, deadZone: 0.3 });
    expect(m.map(0.1, 0.5).x).toBeCloseTo(0, 6);
    expect(m.map(0.9, 0.5).x).toBeCloseTo(W, 6);
    expect(m.map(0.5, 0.5).x).toBeCloseTo(W / 2, 6);
  });
});

describe('mapNormalizedToCanvas', () => {
  it('matches the class for the same options', () => {
    const opts = { width: W, height: H, mirror: true, gain: 1.4, deadZone: 0.08 };
    const m = new CoordMapper(opts);
    for (const [nx, ny] of [
      [0.5, 0.5],
      [0, 0],
      [1, 1],
      [0.3, 0.7],
    ] as Array<[number, number]>) {
      expect(mapNormalizedToCanvas(nx, ny, opts)).toEqual(m.map(nx, ny));
    }
  });

  it('honors default mirror=true', () => {
    const p = mapNormalizedToCanvas(0, 0.5, { width: W, height: H });
    expect(p.x).toBeCloseTo(W, 6);
  });
});
