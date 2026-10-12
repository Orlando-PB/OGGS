// In-page settings: the OGGS tab (bottom left) or Alt+O opens the popup's form in a panel.
// Saves go to the bridge ("save" message), which stores them (chrome.storage.sync, or
// localStorage for the userscript) and sends them back as the usual "settings" message.
// settings.panel.hideTab hides the tab for recording; the hotkey still works.
(() => {
  const ggs = globalThis.__ggs;
  let panel = null, form = null, tab = null, settings = null;

  const save = () => window.postMessage({ ggs: 'save', settings }, location.origin);
  const showTab = () => { if (tab) tab.style.display = settings?.panel?.hideTab ? 'none' : ''; }; // inline `all: initial` would beat the hidden attribute

  async function open() {
    if (panel) { panel.show(!panel.visible); return; }
    if (!settings) return;
    // the popup's stylesheet, inlined by the userscript build or fetched from the extension
    const css = ggs.panelCss ?? await fetch(ggs.extBase + 'popup/popup.css').then(r => r.text()).catch(() => '');
    if (panel) { panel.show(true); return; } // opened twice while the fetch was out
    // same look as the popup: its stylesheet, its header (logo and title) as the drag bar
    const paper = 'color: #1c1a2e; background-color: #f5f1e8; background-image: radial-gradient(rgba(28, 26, 46, .09) 1.3px, transparent 1.5px); background-size: 22px 22px; background-position: 11px 11px;';
    panel = ggs.ui.panel({ id: 'settings', title: `<img src="${ggs.extBase}icons/icon-128.png" alt=""><h1>Orlando's GeoGuessr Scripts</h1>`, css: `
      ${css.replace(/\bbody\b/g, '.body').replace(/\bmain\b/g, '.scroll')}
      .panel { width: 348px; background: none; border: 0; box-shadow: none; backdrop-filter: none; overflow: visible; }
      .head { display: flex; align-items: center; gap: 10px; padding: 14px 10px 0 14px; font: inherit; letter-spacing: 0; text-transform: none;
              ${paper} border: 2px solid #1c1a2e; border-bottom: 0; border-radius: 10px 10px 0 0; }
      .head img { width: 32px; height: 32px; }
      .head h1 { flex: 1; margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; }
      .body { width: auto; padding: 0; border: 2px solid #1c1a2e; border-top: 0; border-radius: 0 0 10px 10px; background-position: 11px -3px; }
      .scroll { display: flex; flex-direction: column; gap: 14px; padding: 14px; max-height: 75vh; overflow: auto; }
      .close { flex: none; width: 28px; height: 28px; font: 700 16px/1 inherit; color: inherit;
               background: none; border: 0; border-radius: 6px; cursor: pointer; }
      .close:hover { background: rgba(28, 26, 46, .15); }`, html: '<div class="scroll"></div>' });
    panel.$('.head').insertAdjacentHTML('beforeend', '<button class="close" title="Close (Alt+O)">✕</button>');
    panel.$('.close').addEventListener('click', () => panel.show(false));
    form = ggs.settingsForm(panel.$('.scroll'), { settings, save });
    ggs.onStatus((id, text) => form.setStatus(id, text));
    panel.clamp();
  }

  ggs.onSettings(all => {
    settings = all;
    showTab();
    if (!form) return;
    form.update(settings);
  });

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
