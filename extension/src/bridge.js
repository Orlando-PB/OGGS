// Extension only (isolated world): relays chrome.storage settings to the page scripts
// with postMessage, writes the in-page panel's saves back to it, and mirrors each script's
// status line back for the popup.
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
  let statusWrites = Promise.resolve();
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.ggs === 'hello' && current) send();
    if (e.data?.ggs === 'save') chrome.storage.sync.set({ settings: e.data.settings ?? {} }); // onChanged sends it back
    if (e.data?.ggs === 'status') {
      // one at a time, so two lines close together don't each overwrite the other
      const { id, text } = e.data;
      statusWrites = statusWrites.then(() => chrome.storage.local.get('status'))
        .then(({ status }) => chrome.storage.local.set({ status: { ...status, [id]: text } })).catch(() => {});
    }
  });
})();
