/**
 * Background service worker: on toolbar-icon click, inject the overlay
 * stylesheet and content script into the active tab, then ask the content
 * script to toggle visibility.
 *
 * The content script guards against double-injection itself, so re-running
 * `executeScript` on subsequent clicks is safe.
 */

const OVERLAY_CSS = 'overlay.css';
const CONTENT_SCRIPT = 'content.js';

async function injectOverlay(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({ target: { tabId }, files: [OVERLAY_CSS] });
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  await chrome.tabs.sendMessage(tabId, { type: 'toggle' });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await injectOverlay(tab.id);
  } catch (err) {
    console.error('[lab900-display-attributes]', err);
  }
});
