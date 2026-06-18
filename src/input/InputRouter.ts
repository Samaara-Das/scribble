// Arbitrates finger-tracking vs mouse into one unified pointer stream.
// Finger is the hero; mouse always works as a fallback (even in finger mode, when
// no hand is being tracked). Coordinates are NORMALIZED (0..1).
import type { HandSample } from '../pipeline/HandTracker';

export type InputMode = 'finger' | 'mouse';

export interface PointerSink {
  begin(x: number, y: number): void;
  move(x: number, y: number): void;
  end(): void;
}

export class InputRouter {
  private modeValue: InputMode = 'finger';
  private fingerActive = false;
  private mouseActive = false;
  private handPresent = false;

  constructor(private readonly sink: PointerSink) {}

  get mode(): InputMode {
    return this.modeValue;
  }

  /** Is a hand currently visible to the tracker? (drives the confidence dot) */
  get fingerPresent(): boolean {
    return this.handPresent;
  }

  setMode(m: InputMode): void {
    this.modeValue = m;
    if (m === 'mouse' && this.fingerActive) {
      this.fingerActive = false;
      this.sink.end();
    }
  }

  toggleMode(): InputMode {
    this.setMode(this.modeValue === 'finger' ? 'mouse' : 'finger');
    return this.modeValue;
  }

  onMouseDown(x: number, y: number): void {
    if (this.fingerActive) return; // an active air-stroke wins
    this.mouseActive = true;
    this.sink.begin(x, y);
  }

  onMouseMove(x: number, y: number): void {
    if (this.mouseActive) this.sink.move(x, y);
  }

  onMouseUp(): void {
    if (this.mouseActive) {
      this.mouseActive = false;
      this.sink.end();
    }
  }

  onHand(s: HandSample): void {
    this.handPresent = s.present;
    if (this.modeValue !== 'finger') return;
    if (this.mouseActive) return; // don't fight an active mouse stroke
    if (!s.present) {
      if (this.fingerActive) {
        this.fingerActive = false;
        this.sink.end();
      }
      return;
    }
    if (s.down) {
      if (!this.fingerActive) {
        this.fingerActive = true;
        this.sink.begin(s.x, s.y);
      } else {
        this.sink.move(s.x, s.y);
      }
    } else if (this.fingerActive) {
      this.fingerActive = false;
      this.sink.end();
    }
  }
}
