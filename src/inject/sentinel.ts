// MAIN-world entry, injected at document_start. Boots the Scribble runtime so the
// getUserMedia / getDisplayMedia patch is installed before the meeting app grabs
// the camera. Kept tiny; all logic lives in ScribbleApp.
import { ScribbleApp } from './ScribbleApp';

declare global {
  interface Window {
    __scribbleApp?: ScribbleApp;
  }
}

(function bootScribble() {
  if (window.__scribbleApp) return; // guard against double-injection (all_frames / re-inject)
  try {
    const app = new ScribbleApp();
    window.__scribbleApp = app;
    app.start();
  } catch (e) {
    console.error('[Scribble] failed to start', e);
  }
})();
