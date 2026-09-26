// Runs in the extension's isolated world, the only part that can read chrome.storage.
// Relays settings to the page-world scripts (src/core/base.js) with window.postMessage,
// and mirrors each script's status line (ggs.status) into chrome.storage.local for the popup.
// The userscript build replaces this file with userscript/bridge.js, which keeps settings
// in localStorage instead.
(() => {
  let current = null;
  const base = chrome.runtime.getURL(''); // so page scripts can load extension pages (iframes)
  const send = () => window.postMessage({ ggs: 'settings', settings: current, base }, location.origin);

  chrome.storage.sync.get('settings', ({ settings }) => {
    current = settings ?? {};
    send();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    current = changes.settings.newValue ?? {};
    send();
  });
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    // Page world asks on startup in case it loaded after our first send.
    if (e.data?.ggs === 'hello' && current) send();
    if (e.data?.ggs === 'status') {
      chrome.storage.local.get('status', ({ status }) => chrome.storage.local.set({ status: { ...status, [e.data.id]: e.data.text } }));
    }
  });
})();
