// Userscript only: stands in for the extension's bridge.js. Settings live in this site's
// localStorage ("ggs-settings") and reach the scripts through the same postMessage the
// extension uses; src/panel.js (the OGGS tab and Alt+O) sends saves back the same way. The
// board and the text detector are loaded from BASE.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  const BASE = 'https://oggs.orlandopb.com/';
  const KEY = 'ggs-settings';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  let settings = read();
  try { if (localStorage.getItem('ggs-hide-tab') === '1' && !settings.panel) settings.panel = { hideTab: true }; } catch {} // 1.4.1's separate key
  const send = () => window.postMessage({ ggs: 'settings', settings, base: BASE }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.ggs === 'hello') send();
    if (e.data?.ggs === 'save') {
      settings = e.data.settings ?? {};
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
      send();
    }
  });
  ggs.panelCss = `__POPUP_CSS__`;
})();
