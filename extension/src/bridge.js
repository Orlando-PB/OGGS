// Extension only (isolated world): relays chrome.storage settings to the page scripts
// with postMessage, and mirrors each script's status line back for the popup.
(() => {
  let current = null;
  const base = chrome.runtime.getURL(''); // so page scripts can load the extension's own pages
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
    if (e.data?.ggs === 'hello' && current) send();
    if (e.data?.ggs === 'status') {
      chrome.storage.local.get('status', ({ status }) => chrome.storage.local.set({ status: { ...status, [e.data.id]: e.data.text } }));
    }
  });
})();
