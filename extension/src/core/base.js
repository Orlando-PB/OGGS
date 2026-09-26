// Shared namespace and plumbing. Everything under src/ except bridge.js runs in the
// page's own JS world (manifest "world": "MAIN") so it can reach GeoGuessr's React
// tree and its Google Maps instances. The same files, concatenated, make the userscript.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  ggs.scripts ??= {};
  ggs.log = (...args) => console.log('%c[OGGS]', 'color:#40c057;font-weight:bold', ...args);
  // Chatter for development only: run localStorage.ggsDebug = 1 on geoguessr.com to see it.
  let dbg = false; try { dbg = !!localStorage.getItem('ggsDebug'); } catch {}
  ggs.debug = dbg ? ggs.log : () => {};

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

  // ---- status lines ----
  // A script's one-line status (e.g. what's left of a daily limit), shown under its options
  // in the settings UI. bridge.js mirrors it for the popup; the userscript panel reads it here.
  const status = {}, statusFns = [];
  ggs.status = (id, text) => {
    status[id] = text;
    statusFns.forEach(fn => fn(id, text));
    window.postMessage({ ggs: 'status', id, text }, location.origin);
  };
  ggs.onStatus = fn => { statusFns.push(fn); for (const [id, text] of Object.entries(status)) fn(id, text); };

  // ---- keep typing in our panels away from GeoGuessr's hotkeys ----
  // Registered before any page script, so this runs first. Key events from inside a
  // panel go to that panel's onKey handler and then stop dead. (Default actions like
  // typing a character still happen; only other listeners are skipped.)
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

  // ---- hotkeys ----
  // Also registered before any page script, so a script's hotkey beats GeoGuessr's own.
  // ggs.hotkey(match, fn) returns an unregister function.
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
