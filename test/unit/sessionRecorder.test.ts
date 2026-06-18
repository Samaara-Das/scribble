/// <reference types="vitest/globals" />
import type { Stroke } from '../../src/shared/types';
import {
  SessionRecorder,
  __resetSessionIds,
} from '../../src/session/SessionRecorder';

function stroke(id: string): Stroke {
  return {
    id,
    tool: 'pen',
    color: '#ff3b30',
    width: 4,
    points: [{ x: 0, y: 0, t: 0 }],
    createdAt: 0,
  };
}

beforeEach(() => {
  __resetSessionIds();
});

describe('SessionRecorder', () => {
  it('start + record(2 strokes) + exportSession returns a complete SessionExport', () => {
    const rec = new SessionRecorder();
    rec.start('screen', 100);

    const a = stroke('a');
    const b = stroke('b');
    rec.record(a);
    rec.record(b);

    const exported = rec.exportSession(undefined, 500);

    expect(exported.source).toBe('scribble');
    expect(exported.target).toBe('screen');
    expect(exported.startedAt).toBe(100);
    expect(exported.endedAt).toBe(500);
    expect(exported.strokes).toHaveLength(2);
    expect(exported.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(exported.sessionId).toBe('session-0');
  });

  it('fires onSessionExport with the same SessionExport object', () => {
    const rec = new SessionRecorder();
    const seen: unknown[] = [];
    rec.onSessionExport((s) => {
      seen.push(s);
    });

    rec.start('camera', 0);
    rec.record(stroke('a'));
    const exported = rec.exportSession('data:image/png;base64,AAAA', 10);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(exported);
    expect(exported.target).toBe('camera');
    expect(exported.pngDataUrl).toBe('data:image/png;base64,AAAA');
  });

  it('honors an explicitly-set next session id', () => {
    const rec = new SessionRecorder();
    rec.setNextSessionId('custom-123');
    rec.start('screen', 0);
    const exported = rec.exportSession(undefined, 1);
    expect(exported.sessionId).toBe('custom-123');
  });

  it('ignores records before start', () => {
    const rec = new SessionRecorder();
    rec.record(stroke('ghost'));
    rec.start('screen', 0);
    rec.record(stroke('real'));
    const exported = rec.exportSession(undefined, 1);
    expect(exported.strokes.map((s) => s.id)).toEqual(['real']);
  });
});
