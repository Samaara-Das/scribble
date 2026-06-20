import { PinchDetector, pinchRatio } from '../../src/pipeline/pinchDetector';
import type { HandLandmark } from '../../src/shared/types';

/**
 * Build a 21-entry landmark array. Only indices 0 (wrist), 4 (thumb tip),
 * 8 (index tip) and 9 (middle MCP) are meaningful; the rest are filler.
 *
 * Geometry: wrist at origin, middle MCP one unit up (reference bone length 1),
 * thumb and index symmetric about x with separation `pinchSep`. So the pinch
 * ratio is exactly `pinchSep` for scale = 1.
 */
function makeHand(pinchSep: number, scale = 1, offset = { x: 0, y: 0 }): HandLandmark[] {
  const lm: HandLandmark[] = [];
  for (let i = 0; i < 21; i++) {
    lm.push({ x: 0, y: 0, z: 0 });
  }
  const place = (i: number, x: number, y: number) => {
    lm[i] = { x: (x + offset.x) * scale, y: (y + offset.y) * scale, z: 0 };
  };
  place(0, 0, 0); // wrist
  place(9, 0, 1); // middle MCP -> reference bone length 1 (pre-scale)
  place(4, -pinchSep / 2, 0.5); // thumb tip
  place(8, pinchSep / 2, 0.5); // index tip
  return lm;
}

describe('pinchRatio', () => {
  it('equals the thumb-index separation over the reference bone', () => {
    expect(pinchRatio(makeHand(0.3))).toBeCloseTo(0.3, 6);
    expect(pinchRatio(makeHand(0.9))).toBeCloseTo(0.9, 6);
  });

  it('is depth-invariant: uniform scaling does not change it', () => {
    const near = pinchRatio(makeHand(0.4, 1));
    const far = pinchRatio(makeHand(0.4, 2));
    expect(far).toBeCloseTo(near, 6);
  });
});

describe('PinchDetector', () => {
  it('reports pen-up for an open hand', () => {
    const d = new PinchDetector(); // down 0.45 / up 0.65
    expect(d.update(makeHand(0.9))).toBe(false);
    expect(d.isDown).toBe(false);
  });

  it('reports pen-down for a pinched hand', () => {
    const d = new PinchDetector();
    expect(d.update(makeHand(0.2))).toBe(true);
    expect(d.isDown).toBe(true);
  });

  it('applies hysteresis: a mid-range ratio after a pinch stays DOWN', () => {
    const d = new PinchDetector({ downRatio: 0.45, upRatio: 0.65 });

    // Engage with a clear pinch.
    expect(d.update(makeHand(0.2))).toBe(true);

    // 0.55 is between downRatio and upRatio -> must NOT release (no flicker).
    expect(d.update(makeHand(0.55))).toBe(true);
    expect(d.update(makeHand(0.6))).toBe(true);

    // Only above upRatio does it release.
    expect(d.update(makeHand(0.7))).toBe(false);

    // And in the open state, 0.55 (between thresholds) must NOT re-engage.
    expect(d.update(makeHand(0.55))).toBe(false);

    // Drops below downRatio -> engages again.
    expect(d.update(makeHand(0.3))).toBe(true);
  });

  it('makes the same decision regardless of hand depth (scale)', () => {
    const near = new PinchDetector();
    const far = new PinchDetector();

    // Same gesture, hand twice as close/large: identical decisions.
    expect(near.update(makeHand(0.2, 1))).toBe(far.update(makeHand(0.2, 2)));
    expect(near.update(makeHand(0.9, 1))).toBe(far.update(makeHand(0.9, 2)));

    // A full sequence stays in lockstep across scales.
    const seq = [0.2, 0.55, 0.7, 0.3, 0.9];
    const n2 = new PinchDetector();
    const f2 = new PinchDetector();
    for (const sep of seq) {
      expect(n2.update(makeHand(sep, 1))).toBe(f2.update(makeHand(sep, 2)));
    }
  });

  it('is unaffected by translation of the whole hand', () => {
    const d = new PinchDetector();
    // Pinched hand shifted far across the frame -> still down.
    expect(d.update(makeHand(0.2, 1, { x: 5, y: -3 }))).toBe(true);
  });

  it('reset() returns to pen-up', () => {
    const d = new PinchDetector();
    d.update(makeHand(0.2));
    expect(d.isDown).toBe(true);
    d.reset();
    expect(d.isDown).toBe(false);
  });
});
