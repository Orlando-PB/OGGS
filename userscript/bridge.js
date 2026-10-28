// Userscript only. Stands in for the extension's bridge.js. Settings live in this site's
// localStorage ("ggs-settings") and travel by the same postMessage the extension uses.
// src/panel.js sends saves back the same way. The boards and the text detector load from BASE.
(() => {
  globalThis.__ggs ??= {};
  const ggs = globalThis.__ggs;
  const BASE = 'https://oggs.orlandopb.com/';
  const KEY = 'ggs-settings';
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) ?? {};
    } catch {
      return {};
    }
  };
  let settings = read();
  // 1.4.1 kept hide-tab under its own key.
  try {
    if (localStorage.getItem('ggs-hide-tab') === '1' && !settings.panel) settings.panel = { hideTab: true };
  } catch {}
  const send = () => window.postMessage({ ggs: 'settings', settings, base: BASE }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.ggs === 'hello') send();
    if (e.data?.ggs === 'save') {
      settings = e.data.settings ?? {};
      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch {}
      send();
    }
  });
  ggs.panelCss = `__POPUP_CSS__`;
})();
