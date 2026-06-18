// Service worker. Turns the keyboard command into a message the active tab's
// bridge relays to the MAIN-world runtime.
import { detectPlatform } from './platforms';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-draw') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'scribble:toggle-draw' }).catch(() => {
      /* no content script on this page */
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Scribble] installed — platforms:', ['zoom', 'meet', 'teams'].join(', '));
});

// Exposed for potential popup/options use later.
export { detectPlatform };
