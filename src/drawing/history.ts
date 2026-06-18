// Undo/redo over an ordered list of committed strokes.
//
// Pure state: a committed list plus a redo stack. `push` commits a stroke and
// clears the redo stack (the classic "new action invalidates the redo branch"
// rule). `undo` pops the last committed stroke onto the redo stack; `redo`
// reverses that. No canvas, no timers — laser expiry is applied only as a
// *view* filter via `visible(now)`, leaving the committed list intact.

import type { Stroke } from '../shared/types';
import { isExpired } from './strokeModel';

export class History {
  private committed: Stroke[] = [];
  private redoStack: Stroke[] = [];

  /** Commit a stroke; invalidates any pending redo branch. */
  push(s: Stroke): void {
    this.committed.push(s);
    this.redoStack.length = 0;
  }

  /** Undo the most recent stroke. Returns it, or undefined if nothing to undo. */
  undo(): Stroke | undefined {
    const s = this.committed.pop();
    if (s !== undefined) {
      this.redoStack.push(s);
    }
    return s;
  }

  /** Redo the most recently undone stroke. Returns it, or undefined. */
  redo(): Stroke | undefined {
    const s = this.redoStack.pop();
    if (s !== undefined) {
      this.committed.push(s);
    }
    return s;
  }

  /** Drop everything — both the committed list and the redo branch. */
  clear(): void {
    this.committed.length = 0;
    this.redoStack.length = 0;
  }

  /** The live committed list (in draw order). */
  get strokes(): Stroke[] {
    return this.committed;
  }

  /** Committed strokes with expired laser marks filtered out at time `now`. */
  visible(now: number): Stroke[] {
    return this.committed.filter((s) => !isExpired(s, now));
  }
}
