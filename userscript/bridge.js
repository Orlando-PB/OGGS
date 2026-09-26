// Userscript only: stands in for the extension's bridge.js and popup. Settings live in
// this site's localStorage ("ggs-settings") and reach the scripts through the same
// postMessage the extension uses. The board and the text detector are loaded from BASE.
// Alt+O (Option+O on a Mac), or the OGGS tab bottom left, opens the settings panel; the tab
// can be hidden from the panel ("ggs-hide-tab" in localStorage) for recording.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  const BASE = 'https://oggs.orlandopb.com/';
  const KEY = 'ggs-settings';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  let settings = read();
  const send = () => window.postMessage({ ggs: 'settings', settings, base: BASE }, location.origin);
  window.addEventListener('message', e => { if (e.source === window && e.data?.ggs === 'hello') send(); });

  const CSS = `__POPUP_CSS__`;
  const HIDE = 'ggs-hide-tab';
  let panel = null, form = null, tab = null;
  const showTab = () => { if (tab) tab.style.display = localStorage.getItem(HIDE) === '1' ? 'none' : ''; }; // inline `all: initial` would beat the hidden attribute
  function open() {
    if (panel) { panel.show(!panel.visible); return; }
    panel = ggs.ui.panel({ id: 'settings', title: "Orlando's GeoGuessr Scripts", css: `
      ${CSS.replace(/\bbody\b/g, '.body').replace(/\bmain\b/g, '.body')}
      .panel { width: 348px; background: none; border: 0; box-shadow: none; backdrop-filter: none; }
      .head { color: #1c1a2e; background: #fecd19; border: 2px solid #1c1a2e; border-radius: 10px 10px 0 0; }
      .body { border: 2px solid #1c1a2e; border-top: 0; border-radius: 0 0 10px 10px; max-height: 80vh; overflow: auto; }
      .close { float: right; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }` });
    panel.$('.head').insertAdjacentHTML('beforeend', '<button class="close" title="Close (Alt+O)">✕</button>');
    panel.$('.close').addEventListener('click', () => panel.show(false));
    form = ggs.settingsForm(panel.$('.body'), { settings, save: () => {
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
      send();
    } });
    ggs.onStatus((id, text) => form.setStatus(id, text));
    panel.$('.body').insertAdjacentHTML('beforeend', `
      <label class="hide-tab" style="display: flex; gap: 8px; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(0, 0, 0, .12); font-size: 12px; cursor: pointer;">
        <input type="checkbox"> Hide the OGGS tab (open with Alt+O, Option+O on a Mac)</label>`);
    const box = panel.$('.hide-tab input');
    box.checked = localStorage.getItem(HIDE) === '1';
    box.addEventListener('change', () => { try { localStorage.setItem(HIDE, box.checked ? '1' : '0'); } catch {} showTab(); });
    panel.clamp();
  }

  const ready = () => {
    ggs.hotkey(e => e.altKey && e.code === 'KeyO', open);
    tab = document.createElement('button');
    tab.setAttribute('data-ggs-ui', 'tab');
    tab.textContent = 'OGGS';
    tab.title = 'OGGS settings (Alt+O, Option+O on a Mac)';
    // bottom-left corner, over the Street View "Google" mark
    tab.style.cssText = 'all: initial; position: fixed; left: 0; bottom: 6px; z-index: 2147483000; padding: 6px 10px 6px 8px;' +
      ' border-radius: 0 8px 8px 0; background: #fecd19; color: #1c1a2e; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .04em;' +
      ' cursor: pointer; box-shadow: 3px 3px 0 #1c1a2e; opacity: .85;';
    tab.addEventListener('click', open);
    showTab();
    document.body.append(tab);
  };
  if (document.body) queueMicrotask(ready); else document.addEventListener('DOMContentLoaded', ready);
})();
