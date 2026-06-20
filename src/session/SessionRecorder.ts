// The 2nd-brain (Second Cortex) capture seam.
//
// LOCAL ONLY — this never touches the network in v1. It records committed
// strokes for the active annotation session and produces a SessionExport blob
// (optionally with a PNG snapshot) that downstream code can persist or hand to
// the second-brain pipeline. Session ids are deterministic (injectable counter
// or an explicitly set id) so tests can assert on them.

import type {
  Stroke,
  SessionExport,
  AnnotationTarget,
} from '../shared/types';

/** Called with each SessionExport produced by `exportSession`. */
export type SessionExportCallback = (session: SessionExport) => void;

// Module-level counter backing the default id scheme. Deterministic and
// resettable so test runs start from a known value.
let sessionCounter = 0;

function nextSessionId(): string {
  const id = `session-${sessionCounter}`;
  sessionCounter += 1;
  return id;
}

/** Test-only: reset the default session-id counter to start from 0. */
export function __resetSessionIds(): void {
  sessionCounter = 0;
}

export class SessionRecorder {
  private sessionId = '';
  private startedAt = 0;
  private target: AnnotationTarget = 'screen';
  private strokes: Stroke[] = [];
  private active = false;

  /** Explicitly-set id for the next session, overriding the counter once. */
  private pendingId: string | null = null;

  private readonly exportListeners: SessionExportCallback[] = [];

  /** Subscribe to export events; fired whenever `exportSession` runs. */
  onSessionExport(cb: SessionExportCallback): void {
    this.exportListeners.push(cb);
  }

  /**
   * Force the id of the *next* started session (test seam / explicit control).
   * Cleared once consumed by `start`.
   */
  setNextSessionId(id: string): void {
    this.pendingId = id;
  }

  /** Begin recording for `target`. Clears any prior strokes. */
  start(target: AnnotationTarget, now: number = Date.now()): void {
    this.sessionId = this.pendingId ?? nextSessionId();
    this.pendingId = null;
    this.startedAt = now;
    this.target = target;
    this.strokes = [];
    this.active = true;
  }

  /** Record a committed stroke into the active session. */
  record(stroke: Stroke): void {
    if (!this.active) {
      return;
    }
    this.strokes.push(stroke);
  }

  /** Whether a session is currently recording. */
  get isRecording(): boolean {
    return this.active;
  }

  /** Strokes captured so far this session (copy). */
  getStrokes(): Stroke[] {
    return this.strokes.slice();
  }

  /**
   * Snapshot the session into a SessionExport and notify listeners. Does not
   * stop recording — callers may export mid-session.
   * @param pngDataUrl optional rasterized snapshot of the canvas.
   * @param now        end timestamp for the export.
   */
  exportSession(
    pngDataUrl?: string,
    now: number = Date.now(),
  ): SessionExport {
    const session: SessionExport = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: now,
      target: this.target,
      strokes: this.strokes.slice(),
      source: 'scribble',
    };
    if (pngDataUrl !== undefined) {
      session.pngDataUrl = pngDataUrl;
    }
    for (const cb of this.exportListeners) {
      cb(session);
    }
    return session;
  }
}
