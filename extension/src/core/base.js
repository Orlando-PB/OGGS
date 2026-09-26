// Shared namespace (globalThis.__ggs): settings, status lines, hotkeys and small helpers.
// Runs in the page's own JS world, like every file after it.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  ggs.scripts ??= {};
  ggs.log = (...args) => console.log('%c[OGGS]', 'color:#40c057;font-weight:bold', ...args);
  ggs.debug = () => {};

  // JSON in this site's localStorage; fails quietly (private mode, quota).
  ggs.store = {
    get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  if (ggs.store.get('ggsDebug')) ggs.debug = ggs.log; // localStorage.ggsDebug = 1 for chatter
  ggs.esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

  // Street View tiles: the URLs the Maps API loads them from, and the pano/x/y/zoom in them.
  ggs.TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  ggs.tileKey = url => {
    const m = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/.exec(url);
    return m && { pano: m[1], x: +m[2], y: +m[3], z: +m[4] };
  };
  // [bind target, binding parameter] for a texImage2D target
  ggs.glBinding = (gl, target) =>
    target === gl.TEXTURE_2D ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D] : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];

  // ---- settings, relayed from bridge.js ----
  const listeners = [];
  ggs.settings = null;
  ggs.onSettings = fn => {
    listeners.push(fn);
    if (ggs.settings) fn(ggs.settings);
  };
  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.ggs !== 'settings') return;
    ggs.extBase = e.data.base;
    ggs.settings = e.data.settings ?? {};
    listeners.forEach(fn => fn(ggs.settings));
  });
  window.postMessage({ ggs: 'hello' }, location.origin);

  // ---- status lines: one line per script, shown under its options in the settings UI ----
  const status = {}, statusFns = [];
  ggs.status = (id, text) => {
    status[id] = text;
    statusFns.forEach(fn => fn(id, text));
    window.postMessage({ ggs: 'status', id, text }, location.origin);
  };
  ggs.onStatus = fn => { statusFns.push(fn); for (const [id, text] of Object.entries(status)) fn(id, text); };

  // ---- keys ----
  // Key events inside our panels (data-ggs-ui) stop here, so GeoGuessr's hotkeys don't fire.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, e => {
      const host = e.composedPath().find(n => n instanceof Element && n.hasAttribute('data-ggs-ui'));
      if (!host) return;
      host.onGgsKey?.(e);
      e.stopImmediatePropagation();
    }, true);
  }
  ggs.isTyping = e => {
    const t = e.composedPath()[0];
    return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  };
  // ggs.hotkey(match, fn) -> unregister; runs before GeoGuessr's own handlers
  const hotkeys = new Set();
  ggs.hotkey = (match, fn) => {
    const h = { match, fn };
    hotkeys.add(h);
    return () => hotkeys.delete(h);
  };
  window.addEventListener('keydown', e => {
    if (ggs.isTyping(e)) return;
    for (const h of hotkeys) {
      if (!h.match(e)) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      h.fn(e);
      return;
    }
  }, true);
})();
