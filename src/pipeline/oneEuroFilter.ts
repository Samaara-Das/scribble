// The 1€ filter (Casiez, Roussel, Vogel — CHI 2012).
//
// A speed-adaptive low-pass filter for noisy signals sampled at an irregular
// rate. It trades off jitter (noise at rest) against lag (latency in motion):
// at low speeds the cutoff is low (heavy smoothing, kills jitter); as the
// signal's derivative grows the cutoff rises (light smoothing, low lag).
//
// Dependency-free and deterministic.

export interface OneEuroFilterOptions {
  /** Minimum cutoff frequency (Hz). Lower => more smoothing at rest. */
  minCutoff?: number;
  /** Speed coefficient. Higher => less lag when moving fast. */
  beta?: number;
  /** Cutoff frequency (Hz) for the derivative low-pass. */
  dCutoff?: number;
}

/** A first-order low-pass filter that exposes its last raw + filtered values. */
class LowPassFilter {
  private hasLast = false;
  private lastFiltered = 0;

  /** Apply the filter with smoothing factor `alpha` in (0, 1]. */
  filter(value: number, alpha: number): number {
    const out = this.hasLast
      ? alpha * value + (1 - alpha) * this.lastFiltered
      : value;
    this.lastFiltered = out;
    this.hasLast = true;
    return out;
  }

  get lastFilteredValue(): number {
    return this.lastFiltered;
  }

  reset(): void {
    this.hasLast = false;
    this.lastFiltered = 0;
  }
}

/**
 * Convert a cutoff frequency (Hz) and sample period dt (s) into the
 * exponential-smoothing alpha used by the underlying low-pass filters.
 */
function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * Scalar 1€ filter.
 *
 * Timestamps are in **milliseconds**. The first sample seeds the filter and is
 * returned unchanged. dt is derived from consecutive timestamps; if two samples
 * share a timestamp (dt <= 0) a tiny positive dt is substituted to stay stable.
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  private readonly xFilter = new LowPassFilter();
  private readonly dxFilter = new LowPassFilter();

  private hasLast = false;
  private lastTimestampMs = 0;

  constructor(options: OneEuroFilterOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0;
    this.beta = options.beta ?? 0.007;
    this.dCutoff = options.dCutoff ?? 1.0;
  }

  /**
   * Filter one sample.
   * @param value     raw scalar value
   * @param timestamp time of the sample, in **milliseconds**
   */
  filter(value: number, timestamp: number): number {
    if (!this.hasLast) {
      this.hasLast = true;
      this.lastTimestampMs = timestamp;
      // Seed both low-pass filters; the first output is the raw value.
      this.xFilter.filter(value, 1);
      // Derivative is unknown on the first sample => 0.
      this.dxFilter.filter(0, 1);
      return value;
    }

    // dt in seconds; guard against zero / negative gaps.
    let dt = (timestamp - this.lastTimestampMs) / 1000;
    if (!(dt > 0)) {
      dt = 1e-6;
    }
    this.lastTimestampMs = timestamp;

    // Estimate the derivative and low-pass it.
    const prevFiltered = this.xFilter.lastFilteredValue;
    const dxRaw = (value - prevFiltered) / dt;
    const edx = this.dxFilter.filter(dxRaw, smoothingAlpha(this.dCutoff, dt));

    // Speed-adaptive cutoff.
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(value, smoothingAlpha(cutoff, dt));
  }

  reset(): void {
    this.hasLast = false;
    this.lastTimestampMs = 0;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

/** Two independent 1€ filters for a 2D point (x, y). */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(options: OneEuroFilterOptions = {}) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  /**
   * Filter a 2D point.
   * @param p point to filter
   * @param t timestamp in **milliseconds**
   */
  filter(p: { x: number; y: number }, t: number): { x: number; y: number } {
    return {
      x: this.fx.filter(p.x, t),
      y: this.fy.filter(p.y, t),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
