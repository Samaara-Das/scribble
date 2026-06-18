import { OneEuroFilter, OneEuroFilter2D } from '../../src/pipeline/oneEuroFilter';

/** Simple deterministic PRNG so noise tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function variance(xs: number[]): number {
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  return xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
}

const DT_MS = 1000 / 60; // 60 Hz sampling

describe('OneEuroFilter', () => {
  it('returns the input unchanged on the first sample', () => {
    const f = new OneEuroFilter();
    expect(f.filter(42, 0)).toBe(42);
  });

  it('converges to a constant signal', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 100; i++) {
      out = f.filter(7, i * DT_MS);
    }
    expect(out).toBeCloseTo(7, 6);
  });

  it('reduces jitter: output variance < input variance', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0, dCutoff: 1.0 });
    const rng = mulberry32(123);
    const mean = 100;
    const inputs: number[] = [];
    const outputs: number[] = [];

    for (let i = 0; i < 400; i++) {
      const noisy = mean + (rng() - 0.5) * 10; // +-5 around the mean
      inputs.push(noisy);
      outputs.push(f.filter(noisy, i * DT_MS));
    }

    // Drop the warm-up so the seeded first sample doesn't skew variance.
    const inVar = variance(inputs.slice(50));
    const outVar = variance(outputs.slice(50));
    expect(outVar).toBeLessThan(inVar);
    // Meaningful, not marginal, smoothing.
    expect(outVar).toBeLessThan(inVar * 0.5);
  });

  it('tracks a linear ramp with low lag', () => {
    // beta lifts the cutoff with speed, keeping a steady ramp close to truth.
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 1.0, dCutoff: 1.0 });
    const slope = 2; // units per sample
    let last = 0;
    let input = 0;
    for (let i = 0; i < 60; i++) {
      input = i * slope;
      last = f.filter(input, i * DT_MS);
    }
    // After warm-up the filtered ramp should sit within a couple of samples
    // worth of value of the true signal.
    expect(Math.abs(last - input)).toBeLessThan(slope * 2);
  });

  it('reset() clears state so the next sample is returned raw', () => {
    const f = new OneEuroFilter();
    f.filter(5, 0);
    f.filter(6, DT_MS);
    f.reset();
    expect(f.filter(99, 5 * DT_MS)).toBe(99);
  });
});

describe('OneEuroFilter2D', () => {
  it('returns the input point on the first sample', () => {
    const f = new OneEuroFilter2D();
    expect(f.filter({ x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it('converges both axes to a constant point', () => {
    const f = new OneEuroFilter2D();
    let out = { x: 0, y: 0 };
    for (let i = 0; i < 100; i++) {
      out = f.filter({ x: 10, y: -3 }, i * DT_MS);
    }
    expect(out.x).toBeCloseTo(10, 6);
    expect(out.y).toBeCloseTo(-3, 6);
  });
});
