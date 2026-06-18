// ISOLATED-world content script. It has chrome.* APIs (which the MAIN-world runtime
// does not), so it does two jobs:
//   1. Publishes the extension's asset base URL to the page via a DOM attribute, so
//      the MAIN-world runtime can load the bundled MediaPipe model/wasm.
//   2. Relays the toggle-draw hotkey (chrome.commands -> background -> here) into a
//      DOM CustomEvent the MAIN-world runtime listens for.
import { SCRIBBLE_BASE_ATTR, SCRIBBLE_EVENT } from '../shared/types';

(function bridge() {
  try {
    const base = chrome.runtime.getURL('');
    document.documentElement.setAttribute(SCRIBBLE_BASE_ATTR, base);
  } catch {
    /* not in an extension context (e.g. unit env) */
  }

  chrome.runtime?.onMessage?.addListener((msg: { type?: string }) => {
    if (msg?.type === 'scribble:toggle-draw') {
      window.dispatchEvent(new CustomEvent(SCRIBBLE_EVENT.toggleDraw));
    } else if (msg?.type === 'scribble:toggle-input') {
      window.dispatchEvent(new CustomEvent(SCRIBBLE_EVENT.toggleInput));
    }
  });
})();
