// Userscript only: stands in for the extension's bridge.js and popup. Settings live in
// this site's localStorage ("ggs-settings") and reach the scripts through the same
// postMessage the extension uses. The board and the text detector are loaded from BASE.
// Alt+O, or the OGGS tab bottom left, opens the settings panel.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  const BASE = 'https://oggs.orlandopb.com/';
  const KEY = 'ggs-settings';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  let settings = read();
  const send = () => window.postMessage({ ggs: 'settings', settings, base: BASE }, location.origin);
  window.addEventListener('message', e => { if (e.source === window && e.data?.ggs === 'hello') send(); });

  const CSS = `__POPUP_CSS__`;
  let panel = null, form = null;
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
    panel.clamp();
  }

  const ready = () => {
    ggs.hotkey(e => e.altKey && e.code === 'KeyO', open);
    const tab = document.createElement('button');
    tab.setAttribute('data-ggs-ui', 'tab');
    tab.textContent = 'OGGS';
    tab.title = 'OGGS settings (Alt+O)';
    tab.style.cssText = 'all: initial; position: fixed; left: 0; bottom: 96px; z-index: 2147483000; padding: 6px 10px 6px 8px;' +
      ' border-radius: 0 8px 8px 0; background: #fecd19; color: #1c1a2e; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .04em;' +
      ' cursor: pointer; box-shadow: 3px 3px 0 #1c1a2e; opacity: .85;';
    tab.addEventListener('click', open);
    document.body.append(tab);
  };
  if (document.body) queueMicrotask(ready); else document.addEventListener('DOMContentLoaded', ready);
})();
