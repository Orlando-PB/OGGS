// Settings popup. Shows the shared form (src/form.js) for the scripts in the manifest and
// saves to chrome.storage.sync. Status lines come from chrome.storage.local, where bridge.js
// mirrors what each script reports on the page.
const list = document.getElementById('list');

const metaFiles = chrome.runtime.getManifest().content_scripts
  .flatMap(c => c.js)
  .filter(p => p.endsWith('/meta.js'));
Promise.all(metaFiles.map(p => new Promise((res, rej) => {
  const s = Object.assign(document.createElement('script'),
    { src: `../${p}`, async: false, onload: res, onerror: rej });
  document.head.append(s);
}))).then(() => Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('status')]))
  .then(([{ settings = {} }, { status = {} }]) => {
    // The object the form edits. Changes made in the in-page panel replace it.
    let current = settings;
    // One write 250 ms after the last change. chrome.storage.sync allows about 120 writes a minute.
    let saveTimer = 0;
    const write = () => {
      clearTimeout(saveTimer);
      saveTimer = 0;
      chrome.storage.sync.set({ settings: current }).catch(() => {});
    };
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(write, 250);
    };
    // Closing the popup saves at once.
    addEventListener('pagehide', () => {
      if (saveTimer) write();
    });
    const form = globalThis.__ggs.settingsForm(list, { settings, save });
    const show = s => {
      for (const [id, text] of Object.entries(s ?? {})) form.setStatus(id, text);
    };
    show(status);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.status) show(changes.status.newValue);
      if (area === 'sync' && changes.settings) form.update(current = changes.settings.newValue ?? {});
    });
  });
