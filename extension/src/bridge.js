// Extension only, isolated world. Relays chrome.storage settings to the page scripts,
// writes the in-page panel's saves back, and mirrors each script's status line for the popup.
(() => {
  let current = null;
  // So page scripts can load the extension's own pages.
  const base = chrome.runtime.getURL('');
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
  // One write 250 ms after the last change. chrome.storage.sync allows about 120 writes a
  // minute, and a dragged slider saves at every stop. After an extension reload this old copy
  // can't reach chrome.storage, so errors are ignored. The page needs a refresh anyway.
  let saveTimer = 0;
  const write = settings => {
    try {
      chrome.storage.sync.set({ settings }).catch(() => {});
    } catch {}
  };
  let statusWrites = Promise.resolve();
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.ggs === 'hello' && current) send();
    // onChanged sends the save back to the page.
    if (e.data?.ggs === 'save') {
      const settings = e.data.settings ?? {};
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => write(settings), 250);
    }
    if (e.data?.ggs === 'status') {
      // One write at a time, so two lines close together don't overwrite each other.
      const { id, text } = e.data;
      statusWrites = statusWrites
        .then(() => chrome.storage.local.get('status'))
        .then(({ status }) => chrome.storage.local.set({ status: { ...status, [id]: text } }))
        .catch(() => {});
    }
  });
})();
