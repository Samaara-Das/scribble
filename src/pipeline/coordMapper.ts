// Map a normalized fingertip position (0..1 in the camera frame) to canvas
// pixels.
//
// Two ergonomic adjustments:
//   * mirror   — the webcam image is mirrored, so moving your hand right should
//                move the cursor right; we flip nx for that.
//   * gain + deadZone — a person can't comfortably reach the extreme corners of
//                the camera frame. We treat a smaller centered sub-rectangle as
//                the "usable" region and stretch it to fill the whole canvas, so
//                a relaxed centered hand motion still reaches every screen edge.
//
// The usable region is symmetric about the frame center (0.5, 0.5). Its
// half-extent is `(0.5 - deadZone) * gain`, clamped so it never exceeds the
// full [0,1] frame. Values inside the region map linearly to [0, size]; values
// outside clamp to the canvas bounds.

export interface CoordMapperOptions {
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
  /** Amplification of the usable region around center. Default 1.4. */
  gain?: number;
  /** Inset (in normalized units) trimmed from each edge before gain. Default 0.08. */
  deadZone?: number;
  /** Flip x to match a mirrored camera. Default true. */
  mirror?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Map one normalized axis value to a pixel coordinate on [0, size].
 *
 * @param n         normalized value in [0,1]
 * @param size      axis length in pixels
 * @param halfExtent half-width of the usable region around 0.5 (already gained
 *                   and clamped to <= 0.5)
 */
function mapAxis(n: number, size: number, halfExtent: number): number {
  const lo = 0.5 - halfExtent;
  const span = halfExtent * 2;
  // Fraction across the usable region; clamps outside-region values to 0..1.
  const frac = span > 0 ? (n - lo) / span : 0.5;
  return clamp(frac, 0, 1) * size;
}

/** Compute the usable half-extent shared by both axes. */
function computeHalfExtent(gain: number, deadZone: number): number {
  const base = 0.5 - deadZone;
  return clamp(base * gain, 0, 0.5);
}

export class CoordMapper {
  private readonly width: number;
  private readonly height: number;
  private readonly gain: number;
  private readonly deadZone: number;
  private readonly mirror: boolean;
  private readonly halfExtent: number;

  constructor(options: CoordMapperOptions) {
    this.width = options.width;
    this.height = options.height;
    this.gain = options.gain ?? 1.4;
    this.deadZone = options.deadZone ?? 0.08;
    this.mirror = options.mirror ?? true;
    this.halfExtent = computeHalfExtent(this.gain, this.deadZone);
  }

  /**
   * Map a normalized fingertip (nx, ny) to canvas pixels, clamped to bounds.
   */
  map(nx: number, ny: number): { x: number; y: number } {
    const mx = this.mirror ? 1 - nx : nx;
    return {
      x: mapAxis(mx, this.width, this.halfExtent),
      y: mapAxis(ny, this.height, this.halfExtent),
    };
  }
}

/** Functional form of {@link CoordMapper.map}. */
export function mapNormalizedToCanvas(
  nx: number,
  ny: number,
  opts: CoordMapperOptions,
): { x: number; y: number } {
  const gain = opts.gain ?? 1.4;
  const deadZone = opts.deadZone ?? 0.08;
  const mirror = opts.mirror ?? true;
  const halfExtent = computeHalfExtent(gain, deadZone);
  const mx = mirror ? 1 - nx : nx;
  return {
    x: mapAxis(mx, opts.width, halfExtent),
    y: mapAxis(ny, opts.height, halfExtent),
  };
}
