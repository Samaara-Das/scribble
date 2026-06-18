// Monkey-patches getUserMedia + getDisplayMedia in the page (MAIN world) so the
// outbound camera and screen-share streams are routed through Scribble's compositor.
// Runs at document_start; the one-time camera off->on toggle re-invokes getUserMedia
// to beat the load-time race when the app grabbed the camera before us.
import type { AnnotationTarget } from '../shared/types';

export interface StreamWrapper {
  wrapStream(stream: MediaStream, target: AnnotationTarget): Promise<MediaStream>;
}

const patchedDevices = new WeakSet<MediaDevices>();

export function installMediaPatch(wrapper: StreamWrapper): void {
  const md = navigator.mediaDevices;
  if (!md) return;
  if (patchedDevices.has(md)) return; // idempotent across re-injection / all_frames
  patchedDevices.add(md);

  const origGUM = md.getUserMedia ? md.getUserMedia.bind(md) : null;
  const origGDM = md.getDisplayMedia ? md.getDisplayMedia.bind(md) : null;

  if (origGUM) {
    md.getUserMedia = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
      const stream = await origGUM(constraints);
      if (!constraints || !constraints.video) return stream; // audio-only: leave alone
      try {
        return await wrapper.wrapStream(stream, 'camera');
      } catch (e) {
        console.warn('[Scribble] camera wrap failed, passing original', e);
        return stream;
      }
    };
  }

  if (origGDM) {
    md.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
      const stream = await origGDM(constraints);
      try {
        return await wrapper.wrapStream(stream, 'screen');
      } catch (e) {
        console.warn('[Scribble] screen wrap failed, passing original', e);
        return stream;
      }
    };
  }
}
