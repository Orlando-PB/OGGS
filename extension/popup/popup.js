// Settings popup: the shared form (src/form.js) over the scripts listed in the manifest,
// saved to chrome.storage.sync. Status lines come from chrome.storage.local, where
// bridge.js mirrors what each script reports on the page.
const list = document.getElementById('list');

const metaFiles = chrome.runtime.getManifest().content_scripts.flatMap(c => c.js).filter(p => p.endsWith('/meta.js'));
Promise.all(metaFiles.map(p => new Promise((res, rej) => {
  const s = Object.assign(document.createElement('script'), { src: `../${p}`, async: false, onload: res, onerror: rej });
  document.head.append(s);
}))).then(() => Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('status')]))
  .then(([{ settings = {} }, { status = {} }]) => {
    const form = globalThis.__ggs.settingsForm(list, { settings, save: () => chrome.storage.sync.set({ settings }) });
    const show = s => { for (const [id, text] of Object.entries(s ?? {})) form.setStatus(id, text); };
    show(status);
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.status) show(changes.status.newValue); });
  });
