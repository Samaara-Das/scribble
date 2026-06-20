// Shared contracts across the MAIN-world runtime, the bridge, the SW, and tests.

export interface Point {
  /** canvas-space x (px), origin top-left */
  x: number;
  /** canvas-space y (px), origin top-left */
  y: number;
  /** ms timestamp relative to stroke/session start */
  t: number;
  /** 0..1, optional (mouse = 1) */
  pressure?: number;
}

export type ToolKind =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'highlighter'
  | 'laser';

/** A committed (or in-progress) mark. Source of truth — Canvas2D is just the renderer. */
export interface Stroke {
  id: string;
  tool: ToolKind;
  color: string; // #rrggbb
  width: number; // px
  points: Point[];
  createdAt: number;
  /** laser strokes fade; set when the stroke should fully disappear (ms epoch) */
  expiresAt?: number;
}

export type AnnotationTarget = 'camera' | 'screen';

/** The 2nd-brain (Second Cortex) capture seam — produced locally, never networked in v1. */
export interface SessionExport {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  target: AnnotationTarget;
  strokes: Stroke[];
  pngDataUrl?: string;
  source: 'scribble';
}

/** One MediaPipe hand landmark (normalized 0..1 in the camera frame). */
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  landmarks: HandLandmark[];
  handedness: string;
  score: number;
}

/** Smoothed fingertip + pinch state, in NORMALIZED 0..1 canvas coords. */
export interface HandSample {
  x: number;
  y: number;
  down: boolean;
  present: boolean;
  score: number;
}

/** Cross-world event names (bridge <-> MAIN runtime, via DOM CustomEvents). */
export const SCRIBBLE_EVENT = {
  toggleDraw: 'scribble:toggle-draw',
  toggleInput: 'scribble:toggle-input',
} as const;

/** DOM dataset key on <html> the bridge sets so the MAIN runtime can resolve bundled assets. */
export const SCRIBBLE_BASE_ATTR = 'data-scribble-base';

/** Test-only hook the harness drives (exposed on window only on localhost test builds). */
export interface ScribbleTestApi {
  setTool(tool: ToolKind): void;
  setColor(color: string): void;
  setWidth(width: number): void;
  drawStroke(points: Array<{ x: number; y: number }>): void;
  clear(): void;
  /** force the annotation overlay to render into the active composite target now */
  flush(): void;
  /** number of committed strokes (for drive tests) */
  strokeCount(): number;
  /** is the hand-tracking iframe up and reporting? (true once a sample arrives) */
  trackerReady(): boolean;
}
