// Thumb–index pinch detector with hysteresis and depth-invariant scaling.
//
// The raw pinch distance (thumb tip <-> index tip) shrinks as the hand moves
// away from the camera, so an absolute threshold would be depth-dependent.
// We normalize by a depth-stable reference bone (wrist <-> middle-finger MCP),
// yielding a scale-free `ratio` that means the same thing at any distance.
//
// Two thresholds (downRatio < upRatio) give hysteresis: the pen goes DOWN when
// the ratio drops below downRatio and only releases once it rises above
// upRatio, so a hand hovering at the boundary never flickers.

import type { HandLandmark } from '../shared/types';

// MediaPipe Hands landmark indices we rely on.
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_MCP = 9;

export interface PinchDetectorOptions {
  /** Ratio at/below which a pinch engages (pen down). */
  downRatio?: number;
  /** Ratio at/above which a pinch releases (pen up). Must exceed downRatio. */
  upRatio?: number;
}

function dist(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Depth-invariant pinch ratio: dist(thumbTip, indexTip) / dist(wrist, middleMCP).
 * Scaling every landmark uniformly leaves this ratio unchanged.
 * Returns +Infinity if the reference bone has zero length (degenerate input).
 */
export function pinchRatio(landmarks: HandLandmark[]): number {
  const refSize = dist(landmarks[WRIST], landmarks[MIDDLE_MCP]);
  const pinch = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);
  if (refSize <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return pinch / refSize;
}

export class PinchDetector {
  private readonly downRatio: number;
  private readonly upRatio: number;
  private down = false;

  constructor(options: PinchDetectorOptions = {}) {
    this.downRatio = options.downRatio ?? 0.45;
    this.upRatio = options.upRatio ?? 0.65;
  }

  /** Current pen-down state. */
  get isDown(): boolean {
    return this.down;
  }

  /**
   * Feed the latest hand landmarks and get the resulting pen-down state.
   * Only indices 0, 4, 8 and 9 are read.
   */
  update(landmarks: HandLandmark[]): boolean {
    const ratio = pinchRatio(landmarks);

    if (this.down) {
      // Stay down until we clearly separate the fingers.
      if (ratio >= this.upRatio) {
        this.down = false;
      }
    } else {
      // Stay up until the fingers clearly come together.
      if (ratio <= this.downRatio) {
        this.down = true;
      }
    }

    return this.down;
  }

  /** Force the detector back to the released (pen-up) state. */
  reset(): void {
    this.down = false;
  }
}
