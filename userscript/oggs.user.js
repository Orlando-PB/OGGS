// ==UserScript==
// @name         OGGS - Orlando's GeoGuessr Scripts
// @namespace    https://github.com/Orlando-PB/OGGS
// @version      1.4.1
// @description  A collection of fun GeoGuessr extension scripts. Made by Orlando with love.
// @author       Orlando
// @homepageURL  https://github.com/Orlando-PB/OGGS
// @icon         https://oggs.orlandopb.com/icon-128.png
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/Orlando-PB/OGGS/main/userscript/oggs.user.js
// @downloadURL  https://raw.githubusercontent.com/Orlando-PB/OGGS/main/userscript/oggs.user.js
// ==/UserScript==

// Built by tools/build.mjs from extension/ in https://github.com/Orlando-PB/OGGS: don't edit
// this file, edit those. Each section below is one file from there, unchanged, except
// userscript/bridge.js, which stands in for the extension's bridge.js and popup.
//
// What talks to the network, and with what:
//   core/game.js          geoguessr.com's own game API (your session), to read the game's mode
//                         and map, and the round's location for the drawing board's nudge
//   userscript/bridge.js  loads the drawing board and the sign-text detector from https://oggs.orlandopb.com/
//   scripts/radio         radio-browser.info (station search) and the station streams
//   scripts/minecraft     https://oggs.orlandopb.com/minecraft.php: a Street View panorama id, its size, a random
//                         per-install id and the optional code; gets the redrawn picture back
// Nothing else leaves the page. Settings stay in geoguessr.com's localStorage ("ggs-settings").

// ==================== userscript/bridge.js ========================================
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

  const CSS = `/* Same look as the store images: cream paper with a faint dot grid, dark ink, one flat accent
   per script, hard offset shadows, no glows. */
body { width: 320px; margin: 0; padding: 14px; font: 13px/1.4 "Avenir Next", Avenir, -apple-system, system-ui, "Segoe UI", sans-serif;
       color: #1c1a2e; background-color: #f5f1e8;
       background-image: radial-gradient(rgba(28, 26, 46, .09) 1.3px, transparent 1.5px);
       background-size: 22px 22px; background-position: 11px 11px; }
main { display: flex; flex-direction: column; gap: 14px; }

header { display: flex; align-items: center; gap: 10px; margin: 0 2px 14px; }
header img { width: 32px; height: 32px; }
h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; }

/* one card per script; the accent is its colour from the store images */
section { --accent: #fecd19; border-radius: 10px; background: #fff; border: 2px solid #1c1a2e;
          box-shadow: 5px 5px 0 var(--accent); transition: box-shadow .15s, transform .15s; }
section.off { background: #f5f1e8; border-color: rgba(28, 26, 46, .3); box-shadow: none; }
section.off .name { color: rgba(28, 26, 46, .7); }
section[data-id="draw-guess"] { --accent: #3fae62; }
section[data-id="radio"] { --accent: #6b4fd8; }
section[data-id="ghana-tape"] { --accent: #e0973a; }
section[data-id="lying-signs"] { --accent: #d64040; }
section[data-id="minecraft"] { --accent: #4a8f2a; }

.row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; }
.text { flex: 1; min-width: 0; }
.name { display: block; font-weight: 700; font-size: 13px; }
.desc { display: block; margin-top: 2px; font-size: 12px; color: rgba(28, 26, 46, .6); }

/* options sit under a rule, indented by a bar in the script's colour */
.opts { margin: 0 12px 6px; padding-top: 4px; border-top: 1px dashed rgba(28, 26, 46, .2); }
.opts:empty { display: none; }
.opts .row { padding: 5px 4px 5px 10px; margin-left: -2px; border-left: 2px solid var(--accent); border-radius: 0;
             font-size: 12px; color: rgba(28, 26, 46, .85); }
.opts .row:hover { background: rgba(28, 26, 46, .04); }
section.off .opts { display: none; }
.opts .more summary { padding: 4px 10px; font-size: 11px; color: rgba(28, 26, 46, .45); cursor: pointer; list-style: none; }
.opts .more summary::before { content: '▸ '; }
.opts .more[open] summary::before { content: '▾ '; }

/* sliders */
.opts .slider { flex-wrap: wrap; row-gap: 4px; cursor: default; }
.slider .text { flex-basis: 100%; }
.slider input[type=range] { flex-basis: 100%; margin: 0; accent-color: var(--accent); cursor: pointer; }
.slider .marks { flex-basis: 100%; display: flex; justify-content: space-between; font-size: 11px;
                 color: rgba(28, 26, 46, .5); }

/* switches */
.switch { appearance: none; flex: none; position: relative; width: 34px; height: 20px; margin: 0; border-radius: 999px;
          background: rgba(28, 26, 46, .2); cursor: pointer; transition: background .15s; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
                 background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .35); transition: transform .15s; }
.switch:checked { background: #1c1a2e; }
.switch:checked::after { transform: translateX(14px); }
.opts .switch { width: 28px; height: 16px; }
.opts .switch::after { width: 12px; height: 12px; }
.opts .switch:checked { background: var(--accent); }
.opts .switch:checked::after { transform: translateX(12px); }
.switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* dropdowns */
.opts select { flex: none; max-width: 150px; font: inherit; font-size: 12px; color: #1c1a2e; background: #fff;
  border: 1.5px solid #1c1a2e; border-radius: 6px; padding: 3px 6px; cursor: pointer; }

/* text fields and status lines */
.opts .field { flex: none; width: 110px; font: inherit; font-size: 12px; color: #1c1a2e; background: #fff;
  border: 1.5px solid #1c1a2e; border-radius: 6px; padding: 3px 6px; }
.opts .field:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.opts .status { padding: 2px 4px 6px 10px; font-size: 11px; color: rgba(28, 26, 46, .5); }
.opts .status:empty { display: none; }
`;
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

// ==================== src/form.js =================================================
// Settings form: one card per script in ggs.registry. Rendered by the popup (saved to
// chrome.storage.sync) and by the userscript's in-page panel (saved to localStorage).
//   ggs.settingsForm(container, { settings, save(id, key, value) }) -> { setStatus(id, text) }
(() => {
  const ggs = (globalThis.__ggs ??= {});

  ggs.settingsForm = (container, { settings, save }) => {
    const { registry, config } = ggs;
    const statusEls = {};

    function option(o) { return o.type === 'text'
        ? `<label class="row"><span class="text">${o.label}</span>
             <input type="${o.secret ? 'password' : 'text'}" class="field" data-key="${o.key}" placeholder="${o.placeholder ?? ''}" autocomplete="off"></label>`
        : o.type === 'select'
        ? `<label class="row"><span class="text">${o.label}</span>
             <select data-key="${o.key}">${o.choices.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></label>`
        : o.type === 'slider'
        ? `<label class="row slider"><span class="text">${o.label}</span>
             <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="1">
             <span class="marks">${o.marks.map(m => `<span>${m}</span>`).join('')}</span></label>`
        : `<label class="row"><span class="text">${o.label}</span><input type="checkbox" class="switch" data-key="${o.key}"></label>`; }

    for (const meta of registry) {
      const cfg = config(meta, settings);
      const card = document.createElement('section');
      card.dataset.id = meta.id;
      card.classList.toggle('off', !cfg.enabled);
      card.innerHTML = `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${meta.options.map(o => o.hidden ? '' : option(o)).join('')}${meta.options.some(o => o.hidden)
          ? `<details class="more"><summary>More</summary>${meta.options.filter(o => o.hidden).map(option).join('')}</details>` : ''}<div class="status"></div></div>`;
      statusEls[meta.id] = card.querySelector('.status');
      for (const box of card.querySelectorAll('input[data-key], select[data-key]')) {
        const key = box.dataset.key, range = box.type === 'range', select = box.tagName === 'SELECT';
        const text = box.type === 'text' || box.type === 'password';
        if (range || select || text) box.value = cfg[key]; else box.checked = !!cfg[key];
        box.addEventListener('change', () => {
          const value = range ? Number(box.value) : select || text ? box.value : box.checked;
          settings[meta.id] = { ...settings[meta.id], [key]: value };
          save(meta.id, key, value);
          if (key === 'enabled') card.classList.toggle('off', !box.checked);
        });
      }
      container.append(card);
    }

    return {
      setStatus(id, text) { if (statusEls[id]) statusEls[id].textContent = text ?? ''; },
    };
  };
})();

// ==================== src/registry.js =============================================
// Catalogue of scripts, shared by the settings UI and the in-page loader. Each
// src/scripts/<id>/meta.js pushes its entry onto ggs.registry.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  ggs.registry ??= [];

  // Stored settings are { "<id>": { enabled, <option>: value } }; gaps get the defaults.
  ggs.config = (meta, all) => ({
    enabled: meta.defaultEnabled,
    ...Object.fromEntries(meta.options.map(o => [o.key, o.default])),
    ...(all?.[meta.id] ?? {}),
  });
})();

// ==================== src/core/base.js ============================================
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

// ==================== src/core/maps.js ============================================
// GeoGuessr's guess map (a Google Maps instance): find it and put a guess on it. A guess
// is a synthetic 'click' on the map, so GeoGuessr's own click handler places it.
(() => {
  const ggs = globalThis.__ggs;

  const isGoogleMap = o =>
    o != null && typeof o === 'object' && typeof o.getDiv === 'function' && typeof o.panTo === 'function';

  // Class names are CSS-module hashed (guess-map_canvas__cvpqv), so match on the prefix.
  const GUESS_MAP_SELECTORS = ['[class*="guess-map_canvas"]', '[data-qa="guess-map"]', '[class*="guess-map_"]'];
  const GUESS_BUTTON_SELECTORS = ['[data-qa="perform-guess"]', 'button[class*="guess-map_guessButton"]'];
  const first = sels => sels.map(s => document.querySelector(s)).find(Boolean) ?? null;
  const guessMapElement = () => first(GUESS_MAP_SELECTORS);
  const guessButton = () => first(GUESS_BUTTON_SELECTORS);

  // ---- constructor hooks: see every Map / StreetViewPanorama GeoGuessr makes ----
  // hook('StreetViewPanorama', (instance, args) => ...). Wrapped once google.maps exists;
  // callbacks also get the instances made before they registered.
  const hooks = {}; // name -> { fns, made: [[instance, args]] }
  function hook(name, fn) {
    const h = (hooks[name] ??= { fns: [], made: [] });
    h.fns.push(fn);
    for (const [inst, args] of h.made) fn(inst, args);
  }
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.Map || !gm.StreetViewPanorama) return;
    clearInterval(hookTimer);
    for (const name of ['Map', 'StreetViewPanorama']) {
      const h = (hooks[name] ??= { fns: [], made: [] });
      try {
        const Orig = gm[name];
        gm[name] = class extends Orig {
          constructor(...args) {
            super(...args);
            h.made.push([this, args]);
            for (const fn of h.fns) { try { fn(this, args); } catch (err) { ggs.log(`${name} hook failed`, err); } }
          }
        };
      } catch (err) { ggs.log(`could not hook google.maps.${name}`, err); }
    }
  }, 10);
  const created = [];
  hook('Map', m => created.push(m));

  // Walk up from the guess-map node through GeoGuessr's React fibers to a prop or hook
  // state holding the map.
  function mapFromFiber(el) {
    let node = el, key;
    while (node && !(key = Object.keys(node).find(k => k.startsWith('__reactFiber$')))) node = node.parentElement;
    if (!node) return null;
    for (let f = node[key], depth = 0; f && depth < 40; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (props && typeof props === 'object') {
        for (const v of Object.values(props)) if (isGoogleMap(v)) return v;
      }
      for (let h = f.memoizedState, i = 0; h && typeof h === 'object' && i < 40; h = h.next, i++) {
        const s = h.memoizedState;
        if (isGoogleMap(s)) return s;
        if (isGoogleMap(s?.current)) return s.current;
      }
    }
    return null;
  }

  function findGuessMap() {
    const el = guessMapElement();
    if (!el) return null;
    return mapFromFiber(el) ?? created.find(m => el.contains(m.getDiv()) || m.getDiv().contains(el)) ?? null;
  }

  function placeGuess(lat, lng, { pan = true } = {}) {
    const map = findGuessMap();
    if (!map) throw new Error(guessMapElement() ? 'Found the guess map but not its Google Map' : 'No guess map on screen');
    const gm = window.google.maps;
    const latLng = new gm.LatLng(lat, lng);
    gm.event.trigger(map, 'click', { latLng, domEvent: new MouseEvent('click'), stop() {} });
    if (pan) map.panTo(latLng);
  }

  function submitGuess() {
    const btn = guessButton();
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }

  // __ggs.maps.debug() in the console shows what was found.
  function debug() {
    const el = guessMapElement();
    const info = {
      googleMapsLoaded: !!window.google?.maps?.Map,
      guessMapElement: el,
      mapViaFiber: el && mapFromFiber(el),
      mapsSeenByHook: created.length,
      guessButton: guessButton(),
    };
    console.table(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v ? (v instanceof Element ? v.className || v.tagName : String(v)) : v])));
    return info;
  }

  ggs.maps = { guessMapElement, findGuessMap, placeGuess, submitGuess, guessButton, hook, debug };
})();

// ==================== src/core/game.js ============================================
// Which game is open, on which map, and whether it's competitive. Reads geoguessr.com's
// own game API with the player's session; nothing is sent anywhere else.
(() => {
  const ggs = globalThis.__ggs;

  const ROUTES = [
    [/\/game\/([^/?#]+)/, 'standard', t => `/api/v3/games/${t}`],
    [/\/challenge\/([^/?#]+)/, 'challenge', t => `/api/v3/challenges/${t}`],
    [/\/(?:team-)?duels\/([^/?#]+)/, 'duels', t => `https://game-server.geoguessr.com/api/duels/${t}`],
    [/\/battle-royale\/([^/?#]+)/, 'battle-royale', t => `https://game-server.geoguessr.com/api/battle-royale/${t}`],
  ];

  function context() {
    for (const [re, mode, api] of ROUTES) {
      const m = location.pathname.match(re);
      if (m) return { mode, token: m[1], api: api(m[1]) };
    }
    return null;
  }
  const fetchGame = async ctx => {
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  // Standard games have { map: "<id>", mapName }, challenges { map: { name } }, duels { options: { map } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }
  const mapCache = new Map(); // token -> Promise<{ id, name } | null>
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!mapCache.has(ctx.token)) mapCache.set(ctx.token, fetchGame(ctx).then(pickMap));
    return mapCache.get(ctx.token);
  }

  // The current round is the game token plus how many times the guess map has appeared
  // (GeoGuessr's round counter markup keeps changing, so the page isn't read).
  let entries = 0, entryToken = null, hadMap = false;
  setInterval(() => {
    const token = context()?.token ?? null, hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) { entryToken = token; entries = 0; hadMap = false; }
    if (hasMap && !hadMap) entries++;
    hadMap = hasMap;
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // Standard games only: { n, total, lat, lng }. Scripts may use the location for
  // gameplay (draw-guess's nudge, radio's station pick) but never show it before the guess.
  async function round() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const j = await fetchGame(ctx).catch(() => null);
    const n = j?.round ?? j?.rounds?.length, cur = j?.rounds?.[n - 1];
    if (!(n > 0)) return null;
    return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
  }
  const roundLocation = () => round().then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  async function state() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const j = await fetchGame(ctx).catch(() => null);
    if (!j) return null;
    const finished = j.state === 'finished' || (j.roundCount > 0 && j.player?.guesses?.length >= j.roundCount);
    return { finished, round: j.round, roundCount: j.roundCount };
  }

  // ---- competitive guard ----
  // Party and ranked duels share /duels/<id> URLs, so two signals decide: the lobby you came
  // through (/party or /join vs matchmaking pages) and party/rated fields in the game data.
  // Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

  function noteLobby(path = location.pathname) {
    const lobby = PARTY_PAGES.test(path) ? 'party' : COMPETITIVE_PAGES.test(path) ? 'competitive' : null;
    if (lobby) try { sessionStorage.setItem(LOBBY_KEY, lobby); } catch {}
  }

  const guardCache = new Map(); // token -> Promise<{ competitive, why }>
  function competitive() {
    const path = location.pathname;
    if (COMPETITIVE_PAGES.test(path)) return Promise.resolve({ competitive: true, why: 'matchmaking page' });
    const ctx = context();
    if (!ctx || ctx.mode === 'standard' || ctx.mode === 'challenge') {
      return Promise.resolve({ competitive: false, why: ctx ? `${ctx.mode} game` : 'not in a game' });
    }
    if (!guardCache.has(ctx.token)) guardCache.set(ctx.token, (async () => {
      let lobby = null;
      try { lobby = sessionStorage.getItem(LOBBY_KEY); } catch {}
      const j = await fetchGame(ctx).catch(() => null);
      const o = j?.options ?? {};
      const rated = [j?.isRated, o.isRated, j?.competitive, o.competitive, j?.isRanked, o.isRanked].some(v => v === true)
        || [j?.gameContext?.type, o.gameContext?.type].some(t => /rank|competitive|matchmak/i.test(t ?? ''));
      const party = [j?.partyId, o.partyId, j?.party, j?.lobbyId, o.lobbyId, j?.gameContext?.partyId].some(Boolean)
        || [j?.gameContext?.type, o.gameContext?.type].some(t => /party|private|friend/i.test(t ?? ''));
      const why = `${ctx.mode}: lobby=${lobby ?? '?'} party-field=${party} rated-field=${rated}${j ? '' : ' (no game data)'}`;
      if (rated) return { competitive: true, why };
      return { competitive: !(party || lobby === 'party'), why };
    })());
    return guardCache.get(ctx.token);
  }

  ggs.game = { context, roundKey, round, mapInfo, roundLocation, state, competitive, noteLobby };
})();

// ==================== src/core/ui.js ==============================================
// Floating, draggable panel in a shadow root (GeoGuessr's CSS can't reach it). Its
// position is remembered per panel id.
(() => {
  const ggs = globalThis.__ggs;

  const BASE_CSS = `
    :host { all: initial; position: fixed; left: 16px; top: 120px; z-index: 2147483000; }
    :host([hidden]) { display: none !important; }
    .panel { width: 260px; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
             background: rgba(20, 16, 48, .9); border: 1px solid rgba(255, 255, 255, .14); border-radius: 12px;
             box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6); backdrop-filter: blur(8px); overflow: hidden; }
    .head { padding: 7px 12px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
            color: rgba(255, 255, 255, .6); background: rgba(255, 255, 255, .05); cursor: grab; user-select: none; }
    .head:active { cursor: grabbing; }
    .body { padding: 10px 12px 12px; }
  `;

  let zTop = 2147483000; // last-used panel sits on top

  function panel({ id, title, html = '', css = '', onKey, pos = { x: 16, y: 120 } }) {
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', id);
    host.onGgsKey = onKey;
    const front = () => { host.style.zIndex = String(++zTop); };
    host.addEventListener('pointerdown', front, true);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${BASE_CSS}${css}</style>
      <div class="panel"><div class="head">${title}</div><div class="body">${html}</div></div>`;
    document.body.append(host);

    const posKey = `ggs-pos-${id}`;
    const place = (x, y) => {
      host.style.left = `${Math.max(0, Math.min(x, innerWidth - host.offsetWidth))}px`;
      host.style.top = `${Math.max(0, Math.min(y, innerHeight - 30))}px`;
    };
    const saved = ggs.store.get(posKey, pos);
    place(saved.x, saved.y);

    const head = root.querySelector('.head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;  // a button in the header (close) gets the click, not a drag
      const r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = ev => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        const b = host.getBoundingClientRect();
        ggs.store.set(posKey, { x: b.left, y: b.top });
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    return {
      host,
      root,
      $: sel => root.querySelector(sel),
      show(visible) { host.hidden = !visible; },
      front,
      clamp() { // pull the panel back on screen (e.g. after it grew)
        const r = host.getBoundingClientRect();
        place(r.left, Math.min(r.top, innerHeight - host.offsetHeight - 8));
      },
      get visible() { return !host.hidden; },
      destroy() { host.remove(); },
    };
  }

  ggs.ui = { panel };
})();

// ==================== src/core/tiles.js ===========================================
// The one WebGL hook. The Maps API uploads every Street View tile with
// texImage2D/texSubImage2D from an <img>; this wraps those two methods (and
// generateMipmap, to know which textures need it again after a re-upload).
//
// For each tile upload a record is made ({ gl, name, args, url, key, img, tex, ... }) and
// the registered filters (minecraft, lying-signs) get a turn, in order, to swap the source
// for a canvas. A filter that needs time can keep the record and later push a new source
// into the same texture with upload(rec, source). Uploads of anything else pass straight
// through. The API never re-uploads a tile already on screen, so replay() loads every
// remembered tile again (browser cache) and runs it through the same path: that's how
// switching a script on or off mid-round takes effect.
(() => {
  const ggs = globalThis.__ggs;
  const MAX = 1200;                           // records kept (zoom 4 is 512 tiles per panorama)
  const records = [];
  const mipTex = new WeakSet();
  const filters = [];                         // [{ fn, order }], lowest order first
  const orig = {};                            // prototype -> { texImage2D, texSubImage2D }

  // filter((rec, source) => source, order): source is the <img> or what an earlier filter returned
  function filter(fn, order = 0) {
    filters.push({ fn, order });
    filters.sort((a, b) => a.order - b.order);
  }
  // A record is live while its texture exists and nothing newer has gone into the same
  // slot; a record replaced by a later upload is marked stale so a filter finishing late
  // can't write an old tile over the one now on screen.
  const live = rec => !rec.stale && !rec.gl.isContextLost() && rec.gl.isTexture(rec.tex);

  function makeRecord(gl, name, args, img) {
    const url = img.currentSrc || img.src;
    if (!ggs.TILE.test(url)) return null;
    const [target, param] = ggs.glBinding(gl, args[0]);
    const tex = gl.getParameter(param);
    if (!tex) return null;
    return {
      gl, name, args, url, img, tex, target, key: ggs.tileKey(url),
      crossOrigin: img.crossOrigin, referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
  }
  function remember(rec) {
    // one record per (texture, face, level, offset): a re-upload replaces the older one
    const same = r => r.gl === rec.gl && r.tex === rec.tex && r.name === rec.name && r.args[0] === rec.args[0] && r.args[1] === rec.args[1]
      && (rec.name !== 'texSubImage2D' || (r.args[2] === rec.args[2] && r.args[3] === rec.args[3]));
    const i = records.findIndex(same);
    if (i >= 0) records.splice(i, 1)[0].stale = true;
    records.push(rec);
    if (records.length > MAX) records.splice(0, records.length - MAX);
  }
  // What goes into WebGL right now for this upload.
  function handle(rec) {
    remember(rec);
    let source = rec.img;
    for (const f of filters) {
      try { source = f.fn(rec, source) ?? source; } catch (err) { ggs.log('tiles: filter failed', err); }
    }
    return source;
  }

  // Later upload of `source` into the texture a record went to, with the same arguments.
  function upload(rec, source) {
    const { gl } = rec;
    if (!live(rec)) return false;
    const [, param] = ggs.glBinding(gl, rec.target);
    const prevTex = gl.getParameter(param);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.bindTexture(rec.target, rec.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, rec.flip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, rec.premul);
    try {
      orig[rec.name].call(gl, ...rec.args, source);
      if (mipTex.has(rec.tex)) gl.generateMipmap(rec.target);
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
      gl.bindTexture(rec.target, prevTex);
    }
    return true;
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] ??= fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try {
              const rec = makeRecord(this, name, a.slice(0, i), a[i]);
              if (rec) a[i] = handle(rec);
            } catch (err) { ggs.log('tiles: hook failed', err); }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(ggs.glBinding(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('tiles: hook failed', err); }

  // The renderer only redraws on a view change, so nudge it after an upload: a heading
  // change held for a frame, and a mouse move over the canvas (either alone can be swallowed).
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  async function repaint(panoId) {
    const nudged = [];
    for (const p of panos) {
      try {
        if (panoId && p.getPano() !== panoId) continue;
        const pov = p.getPov();
        p.setPov({ ...pov, heading: pov.heading + 0.05 });
        nudged.push([p, pov]);
      } catch {}
    }
    await new Promise(r => requestAnimationFrame(r));
    for (const [p, pov] of nudged) { try { p.setPov(pov); } catch {} }
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 200) continue; // the guess map and our own canvases are small or hidden
      const init = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      c.dispatchEvent(new MouseEvent('mousemove', init));
      c.dispatchEvent(new PointerEvent('pointermove', init));
    }
  }

  // Calls made in the same tick are merged into one replay.
  let scheduled = null;
  function replay() {
    if (scheduled) return scheduled;
    scheduled = new Promise(r => setTimeout(r, 0)).then(async () => {
      scheduled = null;
      const old = records.filter(live);
      records.length = 0;
      for (const r of old) r.stale = true;      // the copies made below take their place
      let n = 0;
      await Promise.all(old.map(async r => {
        const img = new Image();
        if (r.crossOrigin != null) img.crossOrigin = r.crossOrigin;
        if (r.referrerPolicy) img.referrerPolicy = r.referrerPolicy;
        img.src = r.url;
        try { await img.decode(); } catch { return; }
        try {
          const rec = { ...r, img, stale: false };
          if (upload(rec, handle(rec))) n++;
        } catch (err) { ggs.log('tiles: replay failed', err); }
      }));
      if (n) ggs.debug(`tiles: replayed ${n} of ${old.length}`);
      await repaint();
      return n;
    });
    return scheduled;
  }

  ggs.tiles = { filter, upload, live, replay, repaint, count: () => records.length };
})();

// ==================== src/scripts/draw-guess/meta.js ==============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Replaces the guess map with a drawing board. Sketch the country, pin your spot, and it snaps to the closest real country as your guess.',
    defaultEnabled: false,
    options: [
      // percentage points the round's real country may trail the best match by and still win; 0 = no help
      { key: 'nudge', label: 'Correct country sensitivity', type: 'slider', min: 0, max: 20, default: 7,
        marks: ['Off', 'Medium', 'Easier'] },
      { key: 'hardMode', label: 'Hard mode: matches against all 193 countries', type: 'checkbox', default: false },
    ],
  });
})();

// ==================== src/scripts/draw-guess/summary.js ===========================
// Drawing summaries on GeoGuessr's result screens (which reveal the answer anyway):
// after each round that round's drawing and the correct country, after the last round
// every round's. Kept in sessionStorage per game, so it survives a refresh.
(() => {
  const ggs = globalThis.__ggs;
  const KEY = 'ggs-drawings';

  const CSS = `
    .panel { width: auto; max-width: min(720px, calc(100vw - 32px)); }
    .avg { margin-bottom: 10px; color: rgba(255, 255, 255, .75); }
    .avg b { color: #fff; font-size: 15px; }
    .grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .card { width: 118px; }
    .card svg { display: block; width: 118px; height: 118px; border-radius: 8px; }
    .card.big { width: 180px; }
    .card.big svg { width: 180px; height: 180px; }
    .r { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255, 255, 255, .5);
         margin-bottom: 4px; }
    .stats { margin-top: 6px; padding: 4px 6px; border: 1.5px solid transparent; border-radius: 7px; }
    .card.hit .stats { border-color: #fcc419; background: rgba(252, 196, 25, .12); }
    .c { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card.hit .c { color: #ffd43b; }
    .s { font-variant-numeric: tabular-nums; }
    .s.good { color: #69db7c; } .s.ok { color: #ffd43b; } .s.bad { color: #ff8787; }
    .ans { margin-top: 4px; font-size: 12px; color: rgba(255, 255, 255, .6); }
    .ans b { color: #fff; }
    .none { width: 118px; height: 118px; border-radius: 8px; display: grid; place-items: center;
            background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .45); }`;

  const esc = ggs.esc;
  const grade = score => (score >= 70 ? 'good' : score >= 50 ? 'ok' : 'bad');

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }
  function game() {
    const token = ggs.game.context()?.token;
    if (!token) return null;
    const data = load();
    return data.token === token ? data : { token, rounds: {} };
  }

  function record(drawing) {
    const g = game();
    if (!g || !drawing) return;
    g.rounds[g.seen ?? Object.keys(g.rounds).length + 1] = drawing;
    save(g);
  }

  const bbox = pts => {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const pathD = rings => rings.map(r => 'M' + r.map(p => p.join(',')).join('L') + 'Z').join('');

  // The drawing with its pin, and the correct country's outline dashed over it.
  function thumb({ rings, pin, answer }) {
    let over = null;
    if (answer?.outline?.length) {
      const [dx0, dy0, dx1, dy1] = bbox(rings.flat()), [ox0, oy0, ox1, oy1] = bbox(answer.outline.flat());
      const s = Math.max(dx1 - dx0, dy1 - dy0) / Math.max(ox1 - ox0, oy1 - oy0, 1e-9);
      const mx = (dx0 + dx1) / 2, my = (dy0 + dy1) / 2, ox = (ox0 + ox1) / 2, oy = (oy0 + oy1) / 2;
      over = answer.outline.map(r => r.map(([x, y]) => [Math.round(mx + (x - ox) * s), Math.round(my + (y - oy) * s)]));
    }
    const [x0, y0, x1, y1] = bbox(rings.flat().concat([pin], over ? over.flat() : []));
    const size = Math.max(x1 - x0, y1 - y0, 60) * 1.18, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pr = size * 0.035;
    return `<svg viewBox="${cx - size / 2} ${cy - size / 2} ${size} ${size}">
      <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="#cfe7f5"/>
      <path d="${pathD(rings)}" fill="rgba(81,207,102,.55)" stroke="#2b8a3e" stroke-width="1.5" vector-effect="non-scaling-stroke"
            stroke-linejoin="round"/>
      ${over ? `<path d="${pathD(over)}" fill="none" stroke="#1f2a44" stroke-width="1.6" stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke" stroke-linejoin="round" opacity=".85"><title>${esc(answer.name)}</title></path>` : ''}
      <circle cx="${pin[0]}" cy="${pin[1]}" r="${pr}" fill="#d9480f" stroke="#fff" stroke-width="1.5"
              vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  const isHit = d => !!d.answer && (d.answer.code === d.code || d.answer.name === d.country);

  function card(n, d, big = false) {
    if (!d) return `<div class="card"><div class="r">Round ${n}</div><div class="none">no drawing</div></div>`;
    const a = d.answer, hit = isHit(d);
    return `<div class="card${hit ? ' hit' : ''}${big ? ' big' : ''}"><div class="r">Round ${n}</div>${thumb(d)}
      <div class="stats">
        <div class="c" title="${esc(d.country)}">${esc(d.country)}${hit ? ' \u2713' : ''}</div>
        <div class="s ${grade(d.score)}">${d.score}% match</div>
        ${a && !hit ? `<div class="ans">Correct: <b>${esc(a.name)}</b> <span class="s ${grade(a.score)}">${a.score}%</span></div>` : ''}
      </div></div>`;
  }

  function gameHtml(g) {
    const total = g.total ?? Math.max(...Object.keys(g.rounds).map(Number));
    const drawn = Object.values(g.rounds);
    const withAnswer = drawn.filter(d => d.answer);
    const plural = n => `${n} drawing${n === 1 ? '' : 's'}`;
    const mean = xs => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
    const avg = withAnswer.length
      ? `Average match with the correct country <b>${mean(withAnswer.map(d => d.answer.score))}%</b> over ${plural(withAnswer.length)}
         \u00b7 ${withAnswer.filter(isHit).length}/${withAnswer.length} right`
      : `Average shape match <b>${mean(drawn.map(d => d.score))}%</b> over ${plural(drawn.length)}`;
    const cards = [];
    for (let n = 1; n <= total; n++) cards.push(card(n, g.rounds[n]));
    return `<div class="avg">${avg}</div><div class="grid">${cards.join('')}</div>`;
  }

  let panel = null, shown = '';
  function hide() {
    panel?.destroy();
    panel = null;
    shown = '';
  }

  // Called from the draw-guess tick.
  let asked = '';
  function sync(inRound) {
    const g = game();
    if (!g) return hide();
    if (inRound) {
      const key = ggs.game.roundKey();
      if (asked !== key) {
        asked = key;
        ggs.game.round().then(r => {
          const g = game();
          if (!r || !g || ggs.game.roundKey() !== key) return;
          if (g.seen !== r.n || g.total !== r.total) { g.seen = r.n; g.total = r.total; save(g); }
        }).catch(() => {});
      }
      return hide();
    }
    const last = !!g.total && g.seen === g.total;
    if (last ? !Object.keys(g.rounds).length : !g.rounds[g.seen]) return hide();
    const title = last ? 'Your drawings' : `Round ${g.seen} drawing`;
    const body = last ? gameHtml(g) : card(g.seen, g.rounds[g.seen], true);
    if (title + body === shown) return;
    hide();
    panel = ggs.ui.panel({ id: 'draw-summary', title, html: body, css: CSS, pos: { x: 16, y: 80 } });
    panel.clamp();
    shown = title + body;
  }

  ggs.drawSummary = { record, sync, hide };
})();

// ==================== src/scripts/draw-guess/main.js ==============================
// Draw your country: a drawing board (app/, in an iframe) over GeoGuessr's guess map.
// Sketch the country, pin your spot, and the board snaps the drawing onto the closest
// real country; the pin becomes the guess on the (invisible) map, and a few seconds after
// the animation the script presses GeoGuessr's own hidden Guess button.
(() => {
  const ggs = globalThis.__ggs;

  // The real map stays in the page (the guess goes through it), just invisible, as does
  // its Guess button (the auto-guess and Space still press it).
  const HIDE_MAP_CSS = `
    [class*="guess-map_canvas"] { opacity: 0 !important; pointer-events: none !important; }
    [class*="guess-map_guessMap"] > :not(:has([data-qa="perform-guess"])):not([data-qa="perform-guess"]),
    [class*="guess-map_controls"], [class*="guess-map_zoom"],
    [data-qa="perform-guess"] { visibility: hidden !important; pointer-events: none !important; }`;
  const CSS = `
    :host { all: initial; position: fixed; z-index: 2147483000; transform-origin: bottom right;
            transition: transform .18s ease-out, opacity .18s ease-out; }
    :host(.collapsed) { opacity: .6; }
    :host([hidden]) { display: none !important; }
    iframe { display: block; width: 100%; height: 100%; border: 0; border-radius: 12px; background: #f4efe6;
             box-shadow: 0 16px 40px -12px rgba(0, 0, 0, .6); }
    .status { position: absolute; left: 0; bottom: 100%; margin-bottom: 6px; padding: 4px 10px; border-radius: 999px;
              font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; background: #c92a2a; }
    .status:empty { display: none; }`;
  const MAX_H = 640, MARGIN = 16;
  const COLLAPSED_W = 320, COLLAPSE_DELAY = 600; // small until hovered, like GeoGuessr's map
  const AUTO_GUESS_MS = 3000;

  function start(cfg) {
    const origin = new URL(ggs.extBase).origin;
    let host = null, frame, status;
    let ready = false, queued = [], placed = false, wasInRound = false, lastRound, lastToken;
    let expanded = false, collapseTimer = 0, answerRound;
    let boardH = 0, guessTimer = 0;
    let spot = null, spotKey = ''; // where the board sits; measured once per round and window size

    const hideMap = document.createElement('style');
    hideMap.textContent = HIDE_MAP_CSS;
    (document.head ?? document.documentElement).append(hideMap);

    const post = msg => (ready ? frame.contentWindow.postMessage(msg, origin) : queued.push(msg));

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', 'draw-guess');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="status"></div><iframe></iframe>`;
      frame = root.querySelector('iframe');
      status = root.querySelector('.status');
      frame.src = `${ggs.extBase}src/scripts/draw-guess/app/index.html`;
      post({ ggs: 'hard', on: !!cfg.hardMode });
      post({ ggs: 'nudge', points: cfg.nudge });
      host.addEventListener('mouseenter', () => { clearTimeout(collapseTimer); setExpanded(true); });
      host.addEventListener('mouseleave', () => {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => setExpanded(false), COLLAPSE_DELAY);
      });
      setExpanded(false);
      document.body.append(host);
    }

    function setExpanded(on) {
      expanded = on;
      host.classList.toggle('collapsed', !on);
      if (host.style.width) layout();
    }

    // Right-aligned with the guess map, down to the bottom of its hidden Guess button.
    function layout() {
      const key = `${innerWidth}x${innerHeight}|${lastRound}`;
      if (!spot || key !== spotKey) {
        const anchor = (ggs.maps.guessButton() ?? ggs.maps.guessMapElement()).getBoundingClientRect();
        const right = Math.max(MARGIN, innerWidth - anchor.right);
        const bottom = Math.max(MARGIN, innerHeight - anchor.bottom);
        const h = Math.min(MAX_H, innerHeight - bottom - MARGIN), w = Math.min(h - 52, innerWidth - right - MARGIN); // board is 52px taller than wide
        spot = { right, bottom, w, h };
        spotKey = key;
      }
      const { right, bottom, w } = spot;
      const h = boardH ? Math.min(boardH, innerHeight - bottom - MARGIN) : spot.h;
      const scale = expanded ? 1 : Math.min(1, COLLAPSED_W / w);
      Object.assign(host.style, { right: `${right}px`, bottom: `${bottom}px`, width: `${w}px`, height: `${h}px`,
                                  transform: `scale(${scale})` });
    }

    const onMessage = async e => {
      if (!frame || e.origin !== origin || e.source !== frame.contentWindow) return;
      const d = e.data ?? {};
      if (d.ggs === 'ready') {
        ready = true;
        queued.splice(0).forEach(post);
      } else if (d.ggs === 'height') {
        boardH = d.h;
        if (host.style.width) layout();
      } else if (d.ggs === 'pool') {
        ggs.debug(`draw-guess: map "${d.map}" -> ${d.pool} (${d.how}): ${d.count} countries possible`);
      } else if (d.ggs === 'guess') { // the moment Guess is pressed, before the animation
        try {
          ggs.maps.placeGuess(d.guess.lat, d.guess.lng);
        } catch (err) {
          status.textContent = err.message;
          ggs.maps.debug();
          return;
        }
        placed = true;
        status.textContent = '';
        ggs.drawSummary.record(d.drawing);
      } else if (d.ggs === 'done' && placed) { // animation finished
        clearTimeout(guessTimer);
        const round = ggs.game.roundKey();
        guessTimer = setTimeout(() => {
          if (ggs.game.roundKey() !== round || !ggs.maps.guessMapElement()) return; // already guessed or moved on
          if (!ggs.maps.submitGuess()) status.textContent = "Guess placed, but couldn't press Guess";
        }, AUTO_GUESS_MS);
      }
    };
    window.addEventListener('message', onMessage);

    const tick = setInterval(() => {
      const inRound = !!ggs.maps.guessMapElement();
      ggs.drawSummary.sync(inRound);
      if (inRound && !host) create();
      if (!host) return;
      const round = ggs.game.roundKey();
      if (inRound && placed && (!wasInRound || round !== lastRound)) { // next round: blank board
        post({ ggs: 'reset' });
        clearTimeout(guessTimer);
        placed = false;
        status.textContent = '';
      }
      if (inRound && round !== answerRound) { // tell the board the round's country, for the nudge
        answerRound = round;
        post({ ggs: 'answer', lat: null });
        ggs.game.roundLocation()
          .then(loc => loc && ggs.game.roundKey() === round && post({ ggs: 'answer', lat: loc.lat, lng: loc.lng }))
          .catch(() => {});
      }
      wasInRound = inRound;
      lastRound = round;
      host.hidden = !inRound;
      if (!inRound) return;
      layout();
      const token = ggs.game.context()?.token;
      if (token !== lastToken) { // new game: pick the country pool from the map name
        lastToken = token;
        ggs.game.mapInfo()
          .then(m => (m?.name ? post({ ggs: 'map', name: m.name }) : ggs.debug('draw-guess: no map name, using world coverage')))
          .catch(err => ggs.log('draw-guess: could not read the map, using world coverage', err));
      }
    }, 500);

    return {
      update(next) {
        if (host && !!next.hardMode !== !!cfg.hardMode) post({ ggs: 'hard', on: !!next.hardMode });
        if (host && next.nudge !== cfg.nudge) post({ ggs: 'nudge', points: next.nudge });
        cfg = next;
      },
      stop() {
        clearInterval(tick);
        clearTimeout(collapseTimer);
        clearTimeout(guessTimer);
        window.removeEventListener('message', onMessage);
        host?.remove();
        hideMap.remove();
        ggs.drawSummary.hide();
      },
    };
  }

  ggs.scripts['draw-guess'] = { start };
})();

// ==================== src/scripts/radio/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'radio',
    name: 'Radio mode',
    description: "Hides Street View. Instead you hear a live radio station from near the round's location.",
    defaultEnabled: false,
    options: [
      { key: 'showStreetView', label: 'Show Street View', type: 'checkbox', default: false },
      { key: 'streamerMode', label: 'Streamer / YouTube mode: talk & news stations only', type: 'checkbox', default: false },
    ],
  });
})();

// ==================== src/scripts/radio/shapes.js =================================
// Generated by dev/tools/radio_shapes.py: country outlines for radio mode, each 64 points as flat [x, y, ...] in -100..100.
(() => { globalThis.__ggs.radioShapes = [[-2,-46,8,-44,8,-37,9,-36,19,-35,32,-35,36,-29,47,-32,56,-32,62,-30,75,-23,88,-25,100,-20,94,-13,95,-6,82,-1,78,9,72,20,68,8,79,-5,74,-5,63,3,52,1,43,14,49,18,45,36,35,46,40,31,30,23,21,22,7,27,-7,21,-18,25,-30,23,-39,17,-50,14,-56,22,-68,21,-74,31,-74,44,-83,43,-86,33,-90,25,-96,14,-100,1,-97,-9,-99,-24,-87,-23,-93,-18,-87,-12,-79,-16,-75,-18,-66,-22,-54,-25,-49,-28,-41,-27,-44,-17,-34,-20,-39,-31,-36,-31,-28,-27,-26,-36,-23,-38,-11,-42],[6,-63,15,-56,20,-49,28,-45,36,-55,40,-46,34,-40,22,-38,26,-34,14,-30,15,-25,9,-15,14,-3,27,4,38,13,45,26,46,13,51,-2,49,-16,56,-22,68,-17,68,-8,75,-7,80,-14,84,-6,86,2,91,8,90,15,100,17,91,28,74,31,66,40,54,53,41,63,38,52,26,39,10,35,-6,34,-26,34,-46,34,-59,32,-65,28,-69,21,-70,19,-73,15,-74,5,-85,-9,-96,-15,-100,-30,-100,-50,-87,-51,-78,-55,-81,-51,-69,-57,-60,-55,-45,-52,-36,-46,-23,-42,-18,-50,-15,-49,1,-47,6,-48,7,-47,10,-54],[58,-68,72,-67,78,-55,88,-49,98,-46,100,-39,90,-32,88,-24,79,-18,69,-13,57,-7,60,-16,49,-9,50,-1,62,-1,55,4,55,14,57,22,58,27,59,32,56,38,51,46,47,52,41,59,32,60,25,65,19,68,14,65,5,58,-4,60,-9,64,-16,58,-21,51,-18,39,-25,34,-34,35,-45,38,-53,38,-64,36,-74,28,-84,23,-84,13,-91,5,-96,-1,-100,-11,-90,-16,-79,-21,-79,-32,-72,-36,-62,-41,-54,-50,-45,-44,-40,-33,-28,-29,-17,-23,-3,-21,9,-22,23,-25,29,-33,41,-37,53,-40,42,-45,44,-53,53,-59],[-29,-100,-28,-87,-17,-85,-8,-89,5,-88,14,-99,19,-86,16,-76,11,-68,20,-66,26,-66,35,-72,46,-68,49,-61,56,-64,71,-62,83,-54,96,-49,99,-34,91,-22,84,-12,78,-4,78,10,74,24,67,36,58,44,49,45,37,51,29,57,29,70,21,82,11,91,18,82,12,89,4,100,-1,89,-12,83,-11,76,0,67,-1,58,-5,49,-12,40,-19,32,-17,20,-22,9,-31,3,-38,-5,-51,-11,-56,-23,-67,-21,-81,-19,-86,-24,-95,-29,-99,-41,-91,-52,-79,-56,-77,-71,-76,-80,-72,-85,-64,-83,-53,-83,-50,-91,-48,-97,-36,-100],[-91,-51,-77,-51,-62,-51,-48,-51,-33,-51,-19,-51,-4,-51,7,-49,20,-47,33,-44,43,-37,47,-25,51,-21,61,-27,73,-33,87,-35,95,-43,100,-34,93,-29,87,-22,87,-19,77,-15,75,-9,71,-8,70,-2,69,-9,67,-4,68,-3,67,1,70,6,67,6,67,9,62,15,55,21,50,29,53,41,55,47,50,51,47,42,42,33,32,31,27,30,21,32,20,35,12,34,4,34,-2,39,-6,47,-13,45,-20,33,-31,33,-41,25,-53,27,-67,21,-77,17,-87,10,-94,-1,-94,-2,-100,-13,-100,-26,-98,-39,-100,-44,-95,-45,-94,-43],[-8,-76,3,-72,12,-71,15,-66,9,-56,20,-49,31,-41,39,-50,40,-64,42,-75,48,-72,51,-59,59,-52,62,-39,70,-30,78,-21,84,-14,91,-5,98,6,100,20,97,33,90,44,85,55,82,68,69,73,62,76,57,71,47,75,34,71,28,60,24,56,18,56,22,47,17,48,8,53,3,44,-7,38,-20,36,-33,40,-47,44,-58,49,-71,51,-84,55,-93,47,-90,37,-94,23,-99,11,-100,6,-97,4,-100,-9,-97,-14,-86,-23,-73,-27,-61,-32,-56,-44,-50,-44,-45,-48,-43,-53,-40,-59,-34,-62,-27,-54,-19,-56,-17,-66,-9,-71],[-40,-99,-30,-97,-24,-85,-26,-77,-17,-68,-16,-58,-8,-48,7,-43,21,-39,36,-35,41,-47,48,-38,64,-38,68,-46,81,-55,95,-58,99,-50,100,-41,87,-34,82,-20,76,-11,70,-4,64,-12,64,-19,63,-26,51,-31,41,-36,43,-26,43,-16,45,-2,40,0,35,1,26,12,19,16,7,28,-4,40,-16,46,-16,61,-19,74,-23,86,-28,94,-39,99,-43,90,-49,75,-55,59,-61,45,-66,30,-67,18,-69,3,-68,-4,-74,5,-89,2,-88,-6,-93,-9,-100,-16,-87,-19,-83,-28,-91,-39,-80,-46,-67,-55,-58,-68,-50,-79,-58,-89,-56,-98],[3,-100,10,-92,19,-87,28,-81,30,-73,28,-65,38,-63,46,-68,50,-76,52,-67,45,-61,38,-54,32,-46,30,-36,28,-26,28,-16,33,-9,36,0,30,9,19,12,9,12,8,18,4,27,-6,25,-7,34,-1,34,-5,36,-7,41,-11,50,-18,55,-19,64,-12,70,-16,75,-22,84,-28,86,-30,92,-28,97,-31,100,-42,99,-46,92,-52,87,-49,79,-46,70,-43,61,-42,53,-41,49,-43,41,-43,33,-44,23,-41,14,-40,5,-38,-4,-36,-14,-33,-23,-36,-32,-35,-41,-34,-50,-30,-60,-25,-68,-26,-78,-21,-86,-19,-95,-12,-100,-4,-95],[10,-53,20,-52,26,-45,34,-44,38,-40,48,-46,53,-40,60,-30,66,-19,73,-21,83,-21,91,-13,100,-11,100,-3,94,5,86,9,79,15,77,23,66,25,69,34,67,43,60,41,48,40,37,38,30,42,21,45,11,52,6,53,-2,48,-5,40,-14,35,-26,34,-34,26,-44,21,-55,26,-55,38,-55,50,-62,46,-72,48,-76,39,-81,30,-78,27,-72,21,-69,14,-76,9,-87,13,-91,10,-99,3,-100,-7,-96,-16,-91,-18,-82,-25,-72,-25,-63,-19,-56,-18,-46,-21,-37,-17,-27,-21,-34,-28,-28,-36,-27,-40,-23,-44,-12,-46,-1,-49],[-86,-65,-75,-60,-62,-56,-48,-55,-38,-58,-25,-54,-17,-44,-6,-39,4,-43,12,-32,19,-21,31,-15,29,-5,28,9,30,15,32,23,40,34,48,38,60,38,71,37,76,28,82,18,95,16,100,21,96,31,92,38,85,42,73,44,75,52,67,57,63,65,53,55,48,54,39,58,26,55,14,50,2,43,-10,38,-21,30,-22,20,-25,8,-34,-2,-41,-8,-45,-14,-50,-21,-57,-30,-67,-38,-73,-50,-81,-56,-84,-51,-77,-40,-71,-30,-65,-22,-59,-12,-54,-4,-52,6,-61,-3,-67,-14,-75,-22,-85,-28,-80,-32,-88,-42,-95,-52,-100,-63],[58,-99,69,-98,66,-90,67,-79,62,-70,59,-61,66,-53,73,-45,76,-35,78,-24,80,-15,81,-4,81,7,81,17,80,25,84,35,92,40,100,46,97,54,88,60,79,66,69,72,60,78,52,85,44,93,34,97,23,99,16,97,11,89,2,85,-4,77,-13,71,-22,64,-30,57,-39,51,-48,44,-57,38,-66,31,-75,25,-84,19,-93,13,-100,6,-100,-5,-92,-13,-83,-17,-74,-20,-65,-25,-56,-30,-52,-37,-45,-42,-36,-45,-27,-47,-30,-55,-32,-65,-34,-75,-31,-80,-21,-85,-12,-90,-2,-94,9,-95,19,-97,30,-98,40,-96,49,-99],[47,-100,60,-99,69,-91,81,-93,90,-87,96,-79,100,-69,95,-59,87,-50,84,-38,79,-26,77,-15,79,-3,81,9,82,22,90,32,96,44,83,46,74,52,73,63,71,76,76,87,86,87,85,100,75,96,66,88,57,80,47,84,37,77,27,77,18,74,6,76,4,65,0,53,0,40,-8,34,-17,30,-26,37,-35,41,-47,41,-53,29,-59,19,-72,19,-85,18,-98,19,-100,13,-93,5,-84,3,-77,8,-67,-1,-60,-11,-58,-23,-50,-33,-44,-43,-42,-56,-39,-69,-34,-81,-33,-93,-23,-99,-12,-92,1,-90,10,-95,23,-97,36,-98],[44,-100,49,-92,56,-99,63,-99,67,-97,72,-99,87,-92,75,-87,87,-82,76,-73,70,-83,54,-81,47,-64,30,-67,18,-71,11,-61,-1,-55,-11,-44,-18,-27,-24,-12,-26,5,-38,16,-38,35,-35,52,-37,69,-43,87,-49,76,-56,86,-68,100,-81,94,-80,85,-84,83,-81,73,-75,63,-84,74,-86,63,-84,53,-69,51,-79,52,-87,42,-80,40,-78,33,-69,30,-74,24,-65,21,-58,14,-45,11,-52,15,-49,1,-40,-10,-38,-16,-28,-27,-28,-36,-17,-43,-16,-46,-17,-54,-10,-56,-8,-62,1,-75,9,-82,16,-84,18,-83,24,-88,36,-86],[-28,-47,-19,-45,-11,-42,-8,-34,0,-30,8,-33,17,-32,25,-29,30,-23,39,-22,48,-23,56,-25,63,-30,72,-30,80,-29,80,-22,76,-13,78,-9,86,-8,94,-10,100,-4,99,2,91,2,84,5,79,10,71,14,64,18,56,17,50,21,52,28,45,34,39,39,30,41,21,42,12,46,5,47,-2,46,-11,43,-18,39,-27,39,-36,38,-45,38,-50,31,-53,24,-61,20,-69,17,-78,16,-81,9,-80,1,-84,-7,-90,-11,-97,-15,-100,-21,-93,-25,-87,-29,-80,-33,-72,-36,-66,-35,-59,-32,-52,-28,-44,-28,-36,-29,-36,-36,-34,-44],[-59,-83,-49,-82,-40,-78,-32,-73,-24,-67,-16,-61,-8,-55,1,-52,10,-51,20,-50,27,-45,34,-41,39,-34,45,-28,49,-22,49,-14,54,-6,59,-1,65,6,71,13,80,15,90,17,98,19,100,28,97,37,93,46,84,49,75,52,66,56,56,57,46,59,37,60,28,65,23,74,16,75,7,74,-3,72,-12,73,-19,74,-22,83,-26,76,-32,68,-37,60,-41,51,-47,44,-54,38,-58,30,-59,20,-62,12,-66,4,-74,-1,-77,-10,-82,-18,-87,-26,-93,-34,-99,-41,-100,-47,-96,-53,-87,-53,-80,-60,-72,-64,-74,-71,-77,-77,-68,-80],[10,-100,12,-90,14,-81,17,-73,15,-65,13,-56,11,-47,6,-37,4,-28,4,-19,6,-9,4,0,0,9,-1,19,-3,28,-4,38,-2,47,-4,51,-2,59,-5,68,-9,76,-9,85,-4,91,6,93,9,94,1,100,-5,99,-2,97,-8,97,-5,96,-9,96,-13,93,-6,94,-7,91,-12,89,-16,83,-12,86,-13,81,-13,77,-15,72,-11,69,-14,67,-17,61,-17,59,-12,57,-12,59,-10,55,-7,50,-8,42,-6,36,-9,34,-12,27,-10,16,-9,7,-5,-3,-2,-13,-2,-24,0,-34,1,-44,3,-55,3,-66,5,-76,5,-87,4,-98],[-96,-91,-88,-83,-76,-80,-66,-87,-57,-86,-58,-79,-50,-72,-44,-63,-34,-57,-22,-52,-10,-54,2,-56,2,-61,12,-66,23,-70,35,-72,45,-67,56,-64,65,-57,76,-52,79,-43,77,-31,73,-23,74,-14,73,-4,74,8,83,13,81,24,76,34,82,44,92,51,96,61,100,68,91,73,84,82,79,91,69,88,57,87,45,84,37,78,33,67,21,68,11,74,-1,70,-11,63,-21,57,-28,48,-32,38,-39,28,-49,26,-50,29,-59,25,-63,16,-64,5,-72,-3,-80,-10,-87,-19,-84,-29,-81,-38,-85,-43,-91,-52,-96,-63,-98,-72,-100,-83],[-27,-95,-15,-95,-4,-91,6,-84,16,-77,26,-70,36,-63,46,-56,56,-50,63,-41,72,-34,83,-30,87,-22,95,-19,100,-13,100,-1,99,11,96,22,87,28,76,29,64,30,54,33,43,32,32,37,23,43,13,47,8,55,-2,55,-6,63,-12,71,-16,81,-19,91,-27,92,-33,89,-39,94,-48,95,-53,85,-54,79,-60,70,-66,68,-76,69,-85,69,-90,66,-92,55,-97,48,-100,37,-96,30,-88,28,-79,27,-67,27,-59,27,-47,27,-35,27,-23,27,-17,19,-21,8,-22,-4,-23,-16,-25,-28,-26,-40,-27,-52,-28,-64,-30,-76,-31,-88],[-3,-100,6,-95,14,-88,20,-80,26,-75,36,-77,47,-75,53,-69,47,-59,55,-54,46,-55,35,-51,26,-45,21,-37,17,-28,13,-20,15,-12,21,-3,24,3,31,9,42,8,48,5,48,16,54,20,62,25,68,35,66,44,67,55,62,63,62,73,66,80,59,88,57,96,49,100,40,93,32,86,22,81,12,76,2,71,-6,63,-13,55,-14,46,-19,36,-24,27,-30,18,-35,8,-40,-2,-45,-12,-51,-22,-59,-29,-67,-36,-67,-44,-68,-54,-60,-62,-58,-57,-57,-53,-48,-49,-41,-50,-37,-60,-32,-67,-22,-71,-12,-77,-6,-86,-3,-94],[41,-100,47,-96,56,-91,66,-92,74,-93,83,-90,88,-82,89,-72,91,-62,97,-54,92,-48,82,-49,73,-45,63,-42,66,-33,57,-29,48,-23,40,-17,31,-16,22,-13,13,-8,5,-2,4,9,3,17,-4,21,-13,24,-23,22,-28,28,-34,36,-39,44,-42,54,-50,60,-57,67,-62,76,-63,87,-68,95,-76,100,-86,99,-97,100,-95,91,-89,83,-86,73,-84,69,-78,61,-71,54,-70,44,-66,34,-58,28,-53,19,-48,10,-38,8,-29,3,-21,-4,-14,-11,-8,-20,-10,-29,-9,-40,-4,-49,0,-58,8,-65,17,-69,26,-74,32,-83,36,-93],[16,-84,25,-83,37,-83,50,-83,62,-83,74,-83,82,-77,85,-69,86,-57,88,-45,96,-37,100,-30,90,-24,83,-17,80,-6,76,6,76,18,73,29,66,37,59,47,57,59,50,64,47,76,45,67,36,59,36,47,31,41,24,45,26,56,19,65,9,72,-1,67,-9,72,-19,78,-29,74,-41,75,-50,69,-59,65,-66,73,-70,84,-81,84,-80,73,-85,63,-89,52,-94,43,-100,35,-97,27,-94,17,-92,8,-87,-3,-76,-4,-76,-17,-76,-29,-76,-41,-76,-53,-68,-57,-64,-66,-64,-78,-56,-83,-44,-83,-32,-83,-19,-83,-7,-83,5,-83],[-72,-96,-60,-92,-49,-93,-37,-89,-26,-85,-22,-74,-11,-69,1,-67,12,-63,22,-56,33,-59,37,-70,36,-81,44,-89,56,-93,67,-92,76,-86,86,-82,98,-80,99,-72,99,-60,98,-49,100,-37,100,-25,100,-13,100,-1,100,11,100,23,100,36,100,48,100,60,100,72,100,84,97,93,87,95,81,96,70,91,59,85,49,79,38,73,27,67,17,61,6,56,-4,50,-15,44,-26,48,-36,54,-46,49,-57,45,-69,42,-74,31,-85,27,-93,21,-98,10,-98,0,-97,-10,-95,-22,-96,-34,-98,-46,-100,-55,-91,-63,-92,-74,-83,-82,-74,-89],[74,-98,85,-94,90,-83,100,-78,100,-66,88,-61,75,-63,63,-61,68,-52,64,-42,73,-34,81,-27,71,-19,70,-7,63,3,55,13,46,23,38,33,27,39,16,37,8,48,13,57,16,69,23,77,26,89,15,90,3,91,-5,96,-16,98,-22,88,-29,79,-36,73,-42,75,-55,77,-67,75,-79,77,-91,78,-92,68,-85,58,-74,53,-79,47,-79,33,-91,27,-98,16,-100,10,-87,14,-73,14,-60,14,-47,12,-34,7,-33,-6,-23,-12,-15,-17,-3,-19,4,-27,8,-39,15,-46,17,-53,27,-58,32,-68,31,-80,35,-89,47,-95,61,-96],[58,-88,70,-87,82,-86,85,-74,89,-63,91,-51,90,-39,83,-38,76,-28,80,-18,90,-17,97,-22,100,-15,97,-3,90,6,82,14,76,25,70,35,61,44,53,53,44,61,35,69,24,74,12,76,3,79,-8,79,-20,80,-31,80,-42,84,-54,86,-64,88,-73,84,-78,83,-79,72,-85,62,-79,54,-83,43,-89,33,-94,22,-98,10,-100,1,-93,-3,-87,5,-75,6,-65,4,-59,-4,-59,-16,-59,-28,-59,-40,-58,-51,-51,-42,-49,-30,-46,-23,-35,-25,-26,-33,-21,-44,-11,-41,0,-37,11,-41,15,-52,25,-58,30,-69,39,-76,48,-83],[15,-100,19,-93,9,-87,1,-78,-2,-66,-1,-60,6,-51,6,-39,16,-35,28,-35,38,-29,47,-25,60,-25,64,-19,61,-7,64,4,63,14,67,20,72,31,70,31,62,28,56,30,43,30,37,36,45,41,36,43,36,54,42,63,40,76,38,88,36,100,28,97,32,87,28,80,17,78,6,80,-3,75,-9,66,-18,59,-27,51,-37,47,-47,48,-57,42,-67,36,-72,28,-68,21,-58,16,-52,6,-55,1,-54,-9,-53,-19,-54,-29,-60,-39,-54,-44,-54,-54,-48,-45,-46,-55,-37,-63,-33,-72,-29,-79,-19,-83,-16,-85,-5,-86,6,-93],[49,-79,59,-78,69,-76,77,-69,86,-71,90,-66,91,-56,96,-47,100,-39,99,-30,98,-20,97,-10,96,0,94,10,88,18,81,25,75,34,70,43,71,52,62,56,54,61,44,57,34,57,24,60,16,64,6,62,-3,57,-12,61,-19,56,-28,52,-37,52,-47,53,-51,62,-57,70,-57,79,-65,72,-73,73,-76,72,-79,66,-87,64,-90,57,-95,53,-100,44,-100,35,-90,34,-81,31,-71,31,-62,30,-54,25,-50,16,-49,6,-49,-4,-49,-15,-45,-22,-35,-24,-26,-28,-19,-34,-11,-41,-3,-47,6,-53,15,-58,23,-63,32,-69,41,-74],[17,-100,24,-98,32,-92,39,-87,40,-79,41,-72,41,-63,44,-55,37,-52,32,-51,26,-47,25,-41,26,-32,21,-25,14,-19,8,-16,5,-11,2,-7,-2,-2,-2,6,-3,13,-3,22,3,26,9,33,4,41,5,43,-1,49,-9,52,-7,56,-8,65,-8,74,-10,83,-15,89,-22,91,-24,100,-33,100,-34,91,-34,85,-36,78,-39,70,-42,62,-44,54,-43,46,-41,42,-38,34,-35,25,-36,17,-35,10,-37,2,-38,-8,-39,-17,-35,-25,-26,-27,-26,-34,-24,-42,-21,-51,-19,-58,-14,-65,-9,-73,-8,-80,-2,-87,3,-90,9,-93,17,-93],[58,-100,57,-90,58,-79,59,-70,59,-58,62,-52,59,-42,52,-32,44,-25,34,-21,24,-16,15,-8,8,-1,0,6,-9,13,-11,20,-6,30,-3,42,-1,44,-1,55,-1,64,-8,73,-19,77,-29,82,-34,91,-32,97,-40,100,-42,90,-42,79,-44,67,-48,56,-51,45,-42,37,-37,28,-32,18,-33,7,-31,-3,-31,-14,-31,-26,-42,-29,-52,-34,-61,-37,-62,-48,-50,-51,-39,-55,-28,-59,-20,-53,-12,-49,-15,-38,-11,-29,-5,-21,-4,-31,3,-38,3,-50,-3,-59,-12,-67,-14,-78,-11,-89,0,-89,10,-88,21,-88,30,-93,41,-95,51,-99],[-34,-78,-26,-72,-17,-75,-9,-73,0,-71,8,-66,14,-59,21,-52,27,-45,21,-37,19,-28,25,-25,34,-25,32,-17,38,-10,43,-2,51,3,60,6,69,9,78,12,87,15,97,16,100,19,93,25,86,32,79,39,73,46,66,53,59,58,50,58,41,60,33,66,24,68,16,71,7,69,-1,70,-9,75,-17,78,-27,76,-35,73,-43,68,-52,65,-61,62,-62,54,-69,50,-74,42,-78,34,-85,27,-91,21,-100,18,-95,10,-86,9,-85,0,-84,-10,-83,-19,-76,-22,-73,-30,-69,-39,-64,-47,-58,-51,-55,-60,-52,-70,-44,-72,-38,-70],[-32,-100,-23,-96,-14,-91,-6,-87,3,-82,12,-78,20,-73,29,-69,38,-64,46,-60,55,-56,64,-51,64,-41,64,-32,64,-22,64,-12,62,-3,53,-3,49,5,45,12,42,19,41,28,40,35,45,40,47,49,50,56,42,58,36,64,29,70,23,77,14,80,4,81,3,87,-4,93,-14,94,-22,98,-28,97,-37,100,-41,93,-46,85,-53,79,-57,71,-48,69,-38,69,-43,62,-45,52,-45,43,-49,35,-56,30,-62,22,-64,13,-59,4,-53,-4,-47,-11,-40,-18,-39,-27,-38,-37,-37,-47,-36,-57,-36,-65,-40,-73,-43,-81,-45,-91,-41,-97],[9,-100,15,-92,20,-86,20,-75,15,-68,9,-60,9,-50,20,-52,22,-45,28,-39,28,-31,35,-24,45,-27,39,-19,35,-11,27,-9,18,-5,11,0,7,8,11,17,18,26,22,33,18,42,18,51,25,60,26,71,30,81,24,91,19,100,20,90,20,82,20,72,17,61,14,58,12,49,10,39,9,30,3,22,0,28,-4,30,-12,37,-16,37,-21,35,-24,35,-24,26,-23,15,-25,6,-29,4,-29,0,-32,-7,-37,-10,-40,-13,-45,-16,-42,-22,-40,-30,-37,-37,-34,-47,-29,-50,-23,-58,-21,-67,-17,-77,-9,-84,1,-87,3,-91],[-81,-98,-71,-95,-60,-92,-49,-92,-37,-92,-25,-92,-13,-91,-2,-91,8,-85,19,-84,31,-83,42,-82,53,-83,65,-85,76,-87,88,-90,100,-89,100,-84,90,-81,81,-74,73,-81,62,-79,50,-77,40,-75,40,-63,40,-51,40,-39,40,-28,40,-16,28,-16,25,-8,25,4,25,16,25,28,25,39,25,51,25,63,25,75,25,86,18,93,9,98,-2,97,-13,94,-17,85,-24,91,-33,89,-41,80,-46,70,-48,58,-52,48,-53,36,-56,25,-58,14,-59,2,-58,-8,-64,-17,-70,-28,-76,-38,-80,-49,-85,-59,-91,-69,-98,-79,-100,-90,-92,-94],[-29,-100,-27,-91,-26,-80,-24,-69,-16,-63,-6,-58,5,-55,14,-50,23,-44,34,-43,45,-38,47,-27,45,-18,49,-10,52,0,64,0,76,0,75,10,82,19,87,28,85,38,82,48,83,57,77,53,67,46,55,46,43,48,32,50,24,57,19,67,17,79,13,90,3,87,-7,90,-12,99,-18,90,-30,89,-40,85,-47,92,-55,100,-63,96,-67,85,-70,74,-74,65,-74,57,-72,47,-80,39,-82,27,-87,18,-85,10,-78,1,-85,-7,-83,-17,-82,-27,-80,-36,-80,-48,-75,-58,-81,-68,-87,-79,-80,-81,-70,-82,-60,-87,-51,-93,-40,-99],[-57,-85,-49,-81,-35,-77,-27,-66,-14,-64,1,-65,14,-59,29,-58,43,-63,40,-65,55,-66,71,-67,58,-64,60,-58,67,-55,76,-54,88,-45,80,-34,85,-33,100,-33,95,-22,91,-11,87,-6,81,5,87,17,85,29,72,34,58,38,49,39,36,35,29,38,36,50,42,62,43,68,32,77,19,85,10,85,-3,82,-9,69,-16,57,-13,48,-19,35,-20,20,-14,7,-26,4,-41,5,-52,-5,-65,-10,-81,-9,-91,-18,-92,-32,-100,-44,-100,-51,-96,-66,-86,-77,-74,-84,-82,-75,-79,-63,-84,-50,-75,-41,-70,-54,-77,-67,-65,-74,-51,-78],[37,-100,48,-93,58,-87,68,-80,79,-74,89,-67,88,-64,75,-64,68,-59,69,-47,71,-35,72,-22,73,-10,75,2,76,15,77,27,79,39,80,51,81,64,85,75,84,87,74,89,61,89,49,89,37,89,26,86,17,91,5,91,-3,89,-11,93,-18,100,-26,92,-33,83,-42,78,-51,70,-62,71,-74,73,-81,81,-81,74,-77,62,-74,51,-75,38,-81,28,-78,21,-79,9,-85,2,-89,1,-82,-5,-69,-5,-57,-5,-45,-5,-32,-5,-29,-14,-30,-26,-24,-35,-14,-40,-14,-53,-14,-65,-14,-77,-4,-80,9,-80,21,-80,33,-80,36,-89],[-76,-100,-63,-100,-49,-100,-36,-100,-23,-99,-18,-87,-13,-75,-6,-64,6,-65,19,-65,26,-74,34,-82,43,-79,54,-76,64,-72,65,-59,64,-46,68,-34,71,-21,73,-13,86,-15,98,-17,98,-4,98,9,94,18,81,18,67,18,66,30,66,43,66,56,67,70,73,80,83,89,83,95,70,98,56,100,43,100,31,98,17,97,7,90,-7,90,-20,90,-33,90,-47,90,-60,90,-71,84,-84,86,-96,87,-98,77,-98,64,-93,52,-89,39,-86,27,-79,15,-70,7,-66,-6,-66,-19,-72,-30,-76,-42,-76,-50,-74,-62,-80,-74,-85,-86,-88,-96],[-73,-64,-62,-60,-52,-54,-42,-47,-35,-38,-25,-33,-13,-35,-1,-34,8,-32,15,-24,18,-16,23,-10,25,2,36,3,42,10,48,7,56,-2,66,-8,75,-14,72,-8,69,-1,78,4,83,-2,89,5,100,8,92,13,84,19,73,18,72,12,67,8,57,9,55,18,52,20,47,28,36,28,37,36,41,44,43,54,38,64,29,63,23,56,17,49,7,45,-3,37,-12,31,-22,24,-27,14,-32,3,-43,2,-52,-2,-53,-11,-62,-16,-70,-20,-71,-14,-79,-13,-88,-7,-90,2,-100,-1,-100,-13,-100,-25,-100,-37,-100,-49,-96,-58,-84,-61],[71,-100,74,-95,73,-86,72,-78,76,-78,70,-74,69,-65,65,-58,61,-50,56,-43,52,-35,47,-28,44,-20,41,-12,36,-4,31,2,26,10,20,17,14,23,8,29,2,35,-4,41,-12,45,-20,50,-27,55,-33,61,-40,67,-46,73,-52,79,-57,86,-63,93,-67,100,-72,93,-75,85,-75,77,-75,68,-76,59,-76,50,-76,42,-75,33,-69,27,-64,19,-58,14,-49,12,-43,7,-35,3,-27,3,-18,3,-12,-3,-6,-10,0,-16,6,-22,12,-28,19,-34,25,-40,30,-47,35,-55,40,-62,41,-70,41,-79,41,-88,47,-91,56,-94,64,-97],[42,-75,51,-75,56,-68,54,-57,58,-48,68,-53,77,-59,85,-58,94,-60,100,-58,95,-53,84,-51,73,-50,63,-47,54,-41,54,-32,56,-22,49,-13,48,-3,37,-2,34,2,35,11,26,17,23,27,19,37,9,35,0,40,-5,45,-14,48,-19,58,-20,68,-31,71,-42,73,-52,75,-64,75,-75,75,-86,71,-94,67,-87,58,-81,48,-89,41,-96,36,-96,24,-99,13,-96,5,-100,-3,-96,-10,-91,-19,-89,-29,-80,-27,-71,-23,-63,-30,-56,-35,-46,-40,-41,-50,-34,-57,-26,-63,-15,-59,-5,-57,4,-53,14,-56,23,-55,28,-63,37,-66],[25,-59,34,-52,34,-44,43,-40,48,-31,55,-26,65,-25,74,-20,84,-19,94,-14,100,-7,98,1,97,9,93,17,83,20,79,30,68,33,58,37,47,42,46,42,42,50,37,48,27,47,16,46,9,42,10,39,11,38,7,28,6,37,-3,39,-9,49,-17,55,-22,58,-32,59,-27,51,-24,40,-16,41,-13,36,-19,26,-22,16,-31,12,-40,6,-50,10,-60,15,-71,18,-82,15,-92,15,-100,7,-96,-3,-94,-10,-88,-20,-79,-28,-81,-38,-81,-47,-71,-51,-59,-52,-47,-49,-38,-45,-28,-45,-20,-43,-9,-42,-6,-49,4,-55,14,-58],[-19,-100,-14,-94,-8,-90,-3,-81,-5,-70,-5,-61,4,-69,14,-67,23,-72,33,-72,40,-63,43,-52,49,-42,55,-34,54,-22,46,-18,34,-18,22,-17,14,-8,13,1,16,12,17,16,9,10,-1,6,-8,2,-13,-6,-20,0,-21,12,-26,23,-30,34,-32,46,-26,53,-21,61,-16,70,-14,81,-18,76,-10,84,1,87,7,96,-2,100,-6,97,-14,91,-21,89,-26,80,-33,73,-41,67,-44,58,-40,47,-37,35,-30,25,-27,14,-32,4,-32,-8,-40,-18,-45,-28,-40,-37,-37,-45,-42,-54,-50,-64,-55,-73,-52,-81,-47,-92,-36,-92,-27,-98],[-73,-99,-62,-99,-51,-99,-40,-99,-28,-99,-17,-99,-7,-94,3,-89,12,-83,22,-78,32,-72,42,-66,52,-61,53,-52,61,-44,71,-38,80,-31,78,-21,74,-10,75,0,82,9,84,16,82,26,83,35,85,46,88,55,91,66,98,71,100,78,91,84,80,88,70,92,60,91,52,97,41,97,31,99,21,95,11,96,2,94,-4,85,-5,74,-8,64,-16,59,-25,60,-35,56,-45,51,-54,47,-63,42,-72,38,-77,28,-82,18,-88,9,-96,1,-96,-9,-98,-20,-100,-31,-93,-36,-85,-43,-79,-53,-74,-61,-80,-67,-74,-73,-73,-84,-78,-93],[-80,-89,-66,-87,-53,-82,-40,-79,-27,-75,-15,-83,-3,-87,-2,-86,9,-88,21,-85,20,-82,27,-81,40,-80,53,-83,59,-74,64,-61,66,-48,62,-35,58,-21,48,-24,39,-35,33,-47,28,-59,29,-48,33,-35,42,-24,47,-12,51,1,57,13,64,26,70,38,77,50,77,57,80,71,91,79,100,89,86,89,72,89,58,89,44,89,30,89,16,89,8,87,-5,89,-19,89,-33,89,-47,89,-61,89,-74,89,-88,89,-98,84,-98,71,-98,57,-98,43,-98,29,-98,15,-98,1,-98,-13,-98,-27,-98,-41,-100,-55,-100,-68,-99,-81,-93,-88],[-19,-42,-8,-42,-1,-38,8,-36,16,-33,26,-29,36,-28,46,-28,57,-30,66,-35,76,-34,83,-32,89,-25,90,-16,100,-12,97,-7,94,0,97,9,98,17,100,25,94,23,84,22,75,25,66,26,55,26,46,31,35,31,25,30,15,30,13,38,6,42,7,33,3,31,-6,30,-15,36,-24,39,-34,37,-42,31,-52,30,-56,37,-66,37,-73,31,-80,31,-82,30,-83,27,-85,24,-89,17,-94,11,-97,5,-91,8,-91,2,-93,-6,-100,-7,-97,-16,-88,-21,-82,-22,-74,-20,-70,-23,-61,-25,-68,-30,-58,-31,-48,-30,-39,-35,-29,-40],[46,-86,55,-81,66,-76,76,-71,88,-66,95,-59,100,-48,95,-39,94,-28,96,-15,92,-9,90,2,86,12,92,17,80,21,68,25,55,29,43,33,45,45,32,45,21,51,16,61,4,67,-4,76,-13,86,-25,86,-37,84,-48,79,-61,78,-74,80,-84,73,-94,64,-99,54,-100,41,-100,28,-100,15,-100,2,-91,-2,-78,-2,-66,-3,-65,-15,-65,-28,-65,-39,-59,-30,-47,-33,-41,-26,-30,-21,-17,-20,-9,-25,-2,-15,10,-11,18,-1,27,4,35,4,35,-9,30,-15,21,-15,12,-24,12,-36,15,-49,14,-61,15,-72,20,-82,33,-84],[-50,-81,-39,-78,-31,-69,-21,-69,-11,-72,-1,-67,10,-64,20,-68,30,-73,42,-73,53,-71,64,-69,72,-76,83,-79,90,-70,92,-59,100,-52,98,-41,88,-36,82,-27,77,-16,73,-7,69,3,61,10,57,21,52,31,48,40,40,42,33,34,24,35,16,43,8,50,3,61,-1,71,-6,72,-14,77,-23,76,-27,79,-31,76,-35,79,-42,81,-51,75,-54,66,-55,62,-56,57,-63,52,-72,46,-83,45,-84,42,-94,45,-99,40,-99,29,-100,18,-99,6,-94,-1,-89,-11,-85,-20,-82,-28,-86,-39,-85,-48,-84,-60,-77,-68,-72,-78,-61,-80],[22,-66,31,-65,38,-58,43,-50,43,-40,42,-32,51,-30,55,-24,64,-20,67,-13,75,-7,82,-1,86,6,92,12,99,18,100,25,91,26,82,24,72,22,65,28,56,27,47,30,38,32,29,33,24,41,15,39,5,38,-4,36,-11,29,-19,25,-28,28,-33,36,-35,44,-37,49,-45,50,-54,48,-64,50,-68,57,-71,66,-74,65,-78,57,-85,51,-91,43,-92,36,-96,28,-97,19,-100,11,-94,5,-90,-4,-85,-11,-76,-13,-68,-17,-62,-14,-54,-18,-44,-20,-35,-21,-29,-28,-30,-35,-20,-36,-11,-38,-3,-41,4,-48,10,-54,14,-62],[13,-100,23,-93,31,-83,39,-76,50,-79,56,-68,69,-63,80,-56,92,-55,100,-48,94,-34,94,-20,82,-15,75,-5,70,8,72,8,81,13,82,24,82,36,84,45,85,57,93,63,84,73,73,82,59,80,48,77,35,72,24,82,23,97,13,100,1,96,-11,90,-22,92,-36,90,-48,84,-55,76,-48,64,-46,49,-46,40,-42,28,-36,38,-43,25,-44,16,-52,6,-59,-6,-55,-12,-65,-17,-75,-21,-88,-26,-100,-31,-95,-36,-100,-43,-86,-46,-72,-46,-60,-44,-48,-45,-52,-58,-52,-68,-42,-62,-27,-60,-25,-66,-13,-73,-2,-82,0,-96],[11,-100,19,-97,26,-91,23,-82,22,-77,20,-68,27,-61,32,-53,27,-44,26,-35,30,-26,33,-16,30,-9,29,-1,33,7,37,15,33,24,39,32,45,40,43,49,37,58,31,66,25,74,19,82,12,89,3,91,1,91,-4,93,-13,97,-21,100,-25,100,-29,98,-30,92,-37,88,-40,80,-39,70,-40,62,-41,52,-41,43,-38,35,-32,31,-27,24,-21,16,-15,8,-8,2,-7,-5,-11,-14,-17,-16,-21,-26,-19,-35,-21,-45,-22,-52,-23,-61,-29,-68,-38,-73,-45,-80,-42,-85,-35,-81,-29,-74,-20,-76,-11,-72,-4,-78,-2,-88,2,-97],[-9,-100,-2,-92,11,-89,15,-84,16,-76,20,-67,11,-71,0,-65,-5,-60,-4,-51,-3,-38,7,-29,18,-21,22,-8,29,3,40,12,53,14,56,20,63,28,76,34,87,41,96,51,92,59,84,50,72,46,66,58,72,68,75,80,66,87,60,98,51,100,55,88,58,78,54,65,47,56,40,47,30,44,24,37,15,29,4,25,-6,16,-15,6,-23,0,-32,-9,-36,-21,-42,-33,-53,-39,-66,-39,-75,-29,-81,-32,-89,-37,-91,-47,-96,-57,-90,-65,-91,-75,-78,-75,-70,-85,-63,-79,-58,-77,-52,-87,-42,-84,-39,-90,-33,-96,-22,-98],[-9,-100,0,-95,11,-94,11,-85,18,-79,28,-76,19,-70,11,-67,6,-58,-1,-49,-1,-38,7,-30,9,-23,17,-14,26,-6,33,1,40,10,43,21,45,30,47,41,45,48,43,55,39,63,29,69,19,75,13,75,8,77,8,82,8,82,3,84,4,86,-4,93,-13,100,-14,91,-10,81,-18,75,-11,68,0,68,2,65,4,57,12,53,22,49,22,37,20,26,22,15,20,6,19,-2,10,-8,5,-18,-3,-26,-10,-35,-18,-41,-24,-48,-16,-51,-15,-59,-18,-65,-28,-65,-38,-70,-40,-80,-47,-85,-43,-92,-34,-92,-26,-91,-18,-94],[-15,-69,-5,-63,5,-59,7,-51,11,-41,22,-40,32,-38,37,-28,42,-17,51,-10,60,-2,70,3,80,10,90,14,100,20,98,30,87,27,78,32,72,41,67,51,57,56,50,62,41,69,32,65,23,61,22,49,16,43,7,38,-3,31,-11,24,-22,22,-32,18,-42,14,-52,17,-63,19,-70,28,-81,30,-82,18,-82,6,-85,-4,-92,-9,-88,-12,-94,-18,-97,-21,-96,-32,-90,-33,-80,-31,-72,-33,-74,-42,-80,-52,-89,-57,-97,-50,-97,-42,-100,-52,-90,-59,-79,-61,-68,-55,-62,-45,-52,-42,-40,-42,-37,-49,-31,-58,-23,-64,-18,-63],[33,-100,38,-96,42,-88,45,-80,47,-72,48,-63,51,-55,50,-47,45,-46,40,-50,41,-41,42,-33,38,-26,37,-18,36,-9,33,-1,30,7,28,15,25,23,23,32,20,40,17,48,15,56,13,65,10,73,7,81,4,89,-2,94,-11,96,-18,100,-26,99,-34,96,-40,90,-44,83,-45,74,-45,66,-49,59,-51,50,-48,42,-44,35,-40,28,-36,20,-34,12,-37,4,-38,-4,-40,-13,-41,-21,-36,-28,-34,-36,-28,-40,-21,-42,-14,-45,-7,-44,-5,-50,2,-54,3,-55,8,-62,11,-60,14,-64,16,-71,17,-78,23,-80,28,-86,28,-94],[57,-79,61,-73,61,-62,61,-52,70,-46,76,-37,77,-28,79,-19,76,-10,65,-10,59,-1,68,4,77,9,84,18,91,25,95,35,100,45,92,52,84,60,77,68,69,76,59,74,48,77,39,79,31,77,21,79,14,77,6,70,-1,62,-10,65,-20,63,-30,64,-37,57,-45,49,-48,39,-58,34,-62,25,-68,17,-78,12,-82,3,-90,-4,-100,-8,-99,-16,-93,-23,-90,-34,-85,-43,-75,-45,-68,-40,-60,-32,-51,-30,-40,-31,-32,-27,-21,-26,-14,-31,-4,-35,3,-42,12,-38,21,-34,30,-38,38,-46,45,-54,47,-63,44,-73,51,-75],[-82,-80,-71,-79,-61,-78,-49,-78,-38,-77,-26,-74,-15,-76,-4,-74,7,-73,18,-74,23,-67,33,-64,43,-61,54,-59,63,-61,70,-54,80,-52,90,-53,100,-51,98,-42,89,-36,79,-29,68,-26,59,-20,55,-13,49,-4,42,6,44,17,48,25,39,32,35,43,29,48,20,54,14,64,4,65,-7,66,-19,66,-28,71,-38,75,-46,80,-53,72,-54,62,-61,59,-69,56,-74,48,-68,39,-70,32,-68,22,-70,13,-72,4,-64,-2,-63,-11,-64,-22,-57,-31,-57,-37,-64,-43,-74,-41,-85,-41,-89,-46,-96,-47,-95,-55,-97,-61,-100,-70,-89,-73],[87,-91,90,-82,95,-69,100,-56,99,-43,93,-31,87,-21,81,-10,83,4,77,17,75,31,77,41,70,53,61,57,65,44,58,47,53,50,47,61,42,58,36,58,27,65,13,66,10,62,7,56,2,66,1,74,-7,84,-17,91,-25,80,-20,68,-31,63,-44,65,-56,70,-69,74,-79,78,-87,79,-100,79,-100,71,-88,65,-77,56,-68,46,-55,45,-41,44,-28,40,-18,45,-8,38,-4,26,4,14,7,1,13,3,9,14,20,11,33,5,42,-6,52,-15,57,-28,62,-40,65,-54,63,-62,64,-75,70,-86,77,-79,87,-83,79,-87],[32,-100,39,-94,44,-85,47,-75,47,-64,50,-54,57,-46,46,-45,36,-46,28,-40,35,-31,44,-25,50,-16,55,-7,50,2,45,11,40,20,39,27,39,38,41,48,47,57,50,65,57,73,65,80,66,91,65,100,55,95,45,94,36,92,25,92,15,90,4,90,-6,90,-17,89,-26,92,-37,92,-45,87,-42,76,-47,67,-46,62,-50,60,-59,57,-63,49,-66,46,-62,36,-59,26,-51,18,-44,10,-35,9,-27,8,-21,17,-14,10,-10,2,-5,-7,-1,-18,6,-24,9,-34,15,-42,19,-52,23,-62,32,-68,38,-75,38,-86,31,-92],[56,-85,68,-84,74,-77,74,-72,65,-70,71,-61,76,-54,84,-45,81,-36,90,-28,100,-20,96,-14,84,-17,79,-12,73,-1,73,12,69,21,59,27,55,32,51,39,53,47,49,55,46,62,43,72,33,79,22,85,15,81,11,73,5,70,-5,70,-13,66,-20,68,-32,70,-41,72,-44,62,-56,64,-64,64,-73,61,-76,48,-78,37,-81,25,-92,20,-96,12,-95,1,-100,-10,-97,-22,-95,-30,-86,-38,-83,-28,-74,-19,-63,-16,-50,-18,-39,-20,-31,-28,-18,-28,-8,-23,3,-26,15,-28,18,-39,26,-48,28,-58,34,-66,35,-78,44,-84],[13,-100,17,-90,23,-82,27,-72,32,-62,40,-55,50,-50,55,-41,63,-38,63,-27,69,-18,79,-15,89,-12,95,-5,90,-1,82,5,72,10,65,18,57,24,49,30,46,41,38,49,29,53,24,62,20,72,10,76,0,77,-10,73,-20,69,-30,66,-37,73,-41,83,-49,90,-57,97,-66,100,-77,100,-82,92,-78,83,-81,72,-86,62,-94,55,-95,44,-95,33,-95,23,-95,12,-95,1,-91,-7,-80,-7,-74,-12,-74,-23,-74,-34,-74,-45,-74,-56,-74,-67,-74,-78,-74,-88,-63,-90,-52,-91,-41,-93,-31,-95,-23,-89,-16,-89,-7,-95,3,-98],[-53,-100,-45,-100,-41,-92,-38,-83,-29,-81,-19,-80,-10,-74,-1,-69,8,-64,18,-63,28,-62,37,-65,44,-72,54,-76,62,-73,72,-71,78,-70,72,-61,66,-53,61,-45,62,-35,62,-24,62,-14,62,-4,62,7,62,17,63,27,70,35,71,43,62,47,59,54,50,58,46,66,41,75,38,85,33,94,27,100,18,94,10,88,2,82,-5,75,-6,66,-15,61,-24,56,-33,51,-42,46,-51,41,-60,36,-69,31,-78,27,-78,17,-78,7,-74,-3,-68,-11,-61,-17,-57,-26,-58,-36,-61,-46,-66,-54,-68,-63,-74,-70,-75,-78,-68,-86,-60,-93]]; })();

// ==================== src/scripts/radio/main.js ===================================
// Radio mode: Street View is hidden and a live station from near the round's location
// plays instead (Radio Browser, radio-browser.info: the round's coordinates go there to
// find stations, the audio streams from each station's own server). Nothing about the
// station shows until the guess is in.
(() => {
  const ggs = globalThis.__ggs;

  const API = 'https://de1.api.radio-browser.info/json/stations/search';
  const RADII_KM = [50, 250, 1000, 3000]; // widen until there are a few stations
  const PANO_SELECTORS = ['[class*="game_panorama"]', '[data-qa="panorama"]'];
  const HIDE_PANO_CSS = `
    ${PANO_SELECTORS.join(', ')}, .widget-scene-canvas { visibility: hidden !important; }
    body { background: #0d0a2a !important; }`;

  // Stream networks that insert ads into the audio itself; tried last.
  const AD_STREAMS = /zeno\.fm|zenomedia|adswizz|streamtheworld\.com|tritondigital|[?&]aw_0_/i;

  // Streamer mode: talk stations only, by Radio Browser's tags.
  const TALK_TAGS = /\b(news|talk|sports?|speech|information|info|noticias|nachrichten|actualit|informa|notizie|public radio|comedy|debate|politics)/i;
  const MUSIC_TAGS = /\b(music|musica|música|musik|musique|hits?|pop|rock|dance|jazz|classical|country|oldies|top ?40|chart|r&b|hip ?hop|electronic|house|latin|reggae|metal|disco|[5-9]0s|schlager|soul|funk|blues|folk|indie|christian|gospel)\b/i;
  const isTalk = s => TALK_TAGS.test(s.tags) && !MUSIC_TAGS.test(s.tags);

  const START_MS = 8000; // a stream that hasn't started playing by now is skipped
  const STALL_MS = 8000; // ...and so is one that has been buffering this long

  // ---- silence GeoGuessr's own music and sounds while radio mode is on ----
  // Wrapped at document_start so every AudioContext and media element the page makes is
  // seen: contexts are suspended and other <audio>/<video> elements muted while `muting`.
  const RealAudioContext = window.AudioContext;
  const contexts = new Set(), ours = new WeakSet();
  let muting = false;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Orig = window[name];
    if (!Orig) continue;
    window[name] = class extends Orig {
      constructor(...args) {
        super(...args);
        contexts.add(this);
        if (muting) this.suspend().catch(() => {});
      }
    };
    const resume = Orig.prototype.resume;
    Orig.prototype.resume = function (...args) {
      return muting && !ours.has(this) ? Promise.resolve() : resume.apply(this, args);
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (muting && !ours.has(this)) this.muted = true;
    return play.apply(this, args);
  };
  function muteGame(on) {
    muting = on;
    for (const c of contexts) (on ? c.suspend() : c.resume()).catch(() => {});
    for (const m of document.querySelectorAll('audio, video')) if (!ours.has(m)) m.muted = on;
    window.Howler?.mute?.(on);
  }

  async function search(params) {
    const q = new URLSearchParams({ is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', ...params });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) return [];
    // http streams are blocked on an https page; HLS needs a library
    return (await r.json()).filter(s => s.url_resolved?.startsWith('https://') && !s.hls);
  }
  const near = (lat, lng, dist, limit) => search({ geo_lat: lat, geo_long: lng, geo_distance: dist * 1000, limit });

  async function findStations(lat, lng, talkOnly) {
    let list = [];
    if (!talkOnly) {
      for (const d of RADII_KM) {
        list = await near(lat, lng, d, 30);
        if (list.length >= 3) break;
      }
    } else {
      // Talk stations are sparser: the round's country first, then nearby, then wider.
      const close = await near(lat, lng, 250, 300);
      const pool = close.length ? close : await near(lat, lng, 1000, 300);
      const dist = s => km({ lat, lng }, { lat: s.geo_lat, lng: s.geo_long });
      const cc = pool.filter(s => s.geo_lat != null).sort((a, b) => dist(a) - dist(b))[0]?.countrycode;
      const talkClose = close.filter(isTalk);
      list = talkClose.filter(s => s.countrycode === cc);
      if (cc) list.push(...(await search({ countrycode: cc, limit: 300 })).filter(isTalk));
      list.push(...talkClose.filter(s => s.countrycode !== cc));
      for (const d of RADII_KM.slice(2)) {
        if (list.length >= 3) break;
        list.push(...(await near(lat, lng, d, 300)).filter(isTalk));
      }
    }
    // one entry per station (many are listed once per bitrate)
    const seen = new Set();
    list = list.filter(s => {
      const k = s.name.split(/\s[|–-]\s|\(/)[0].trim().toLowerCase();
      return !seen.has(k) && seen.add(k);
    });
    const ads = s => AD_STREAMS.test(s.url_resolved) || AD_STREAMS.test(s.url);
    return [...list.filter(s => !ads(s)), ...list.filter(ads)]; // keeps popularity order within each
  }

  const km = (a, b) => {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(12742 * Math.asin(Math.sqrt(h)));
  };
  const esc = ggs.esc;
  const describe = (s, loc) => {
    const where = [s.state, s.country].filter(Boolean).join(', ');
    const dist = s.geo_lat != null && loc ? ` · ${km(loc, { lat: s.geo_lat, lng: s.geo_long })} km from the spot` : '';
    return where + dist;
  };

  // ---- the player: "stage" in Street View's place, or a "mini" bar top-left ----
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 5l9 7-9 7zM16 5h2v14h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5l-9 7 9 7zM6 5h2v14H6z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const YELLOW = '#fecd19', GREEN = '#6cb928';
  const CSS = `
    :host { all: initial; visibility: visible !important; color: #fff;
            font: 14px/1.3 neo-sans, var(--default-font, system-ui), system-ui, -apple-system, sans-serif; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .label { font-size: 11px; font-weight: 700; font-style: italic; letter-spacing: .08em; text-transform: uppercase;
             color: rgba(255, 255, 255, .55); }
    .status { font-size: 13px; color: rgba(255, 255, 255, .85); font-variant-numeric: tabular-nums; min-height: 17px; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { all: unset; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
             cursor: pointer; color: #fff; }
    button:hover { background: rgba(255, 255, 255, .12); }
    button.play { background: ${GREEN}; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .2); }
    button.play:hover { background: #7fd13a; }
    svg { width: 18px; height: 18px; fill: currentColor; }
    .vol { display: flex; align-items: center; gap: 6px; margin-left: 4px; color: rgba(255, 255, 255, .6); }
    input[type=range] { width: 90px; accent-color: ${YELLOW}; }
    canvas { display: block; aspect-ratio: 1; cursor: pointer; }

    /* stage: fills the panorama's space, GeoGuessr-purple, outline in the middle */
    :host(.stage) { position: absolute; inset: 0;
                    background: radial-gradient(circle at 50% 42%, #33277e 0%, #1a1450 42%, #0d0a2a 100%); }
    :host(.stage) .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                          justify-content: center; gap: 10px; }
    :host(.stage) canvas { width: min(56vh, 48vw, 560px); }
    :host(.stage) .side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    :host(.stage) .info { text-align: center; }
    :host(.stage) .controls { padding: 6px 12px 6px 6px; border-radius: 999px; background: rgba(16, 12, 48, .7);
                              border: 1px solid rgba(255, 255, 255, .12); }
    :host(.stage) .extra { display: none; }

    /* mini: compact bar top-left */
    :host(.mini) { position: fixed; left: 16px; top: 84px; z-index: 2147483000; } /* below GeoGuessr's logo */
    :host(.mini) .wrap { display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; align-items: center;
                         width: 330px; padding: 8px 12px 8px 8px; border-radius: 14px;
                         background: linear-gradient(180deg, rgba(60, 48, 140, .85), rgba(22, 17, 62, .9));
                         border: 1px solid rgba(255, 255, 255, .14); box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .7); }
    :host(.mini) canvas { width: 64px; }
    :host(.mini) .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    :host(.mini) .status { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.mini) button { width: 28px; height: 28px; }
    :host(.mini) svg { width: 15px; height: 15px; }
    :host(.mini) input[type=range] { width: 70px; }
    :host(.mini) .extra { grid-column: 1 / -1; }
    .reveal:empty, .hist:empty { display: none; }
    .reveal { padding: 8px 4px 2px; border-top: 1px solid rgba(255, 255, 255, .12); margin-top: 4px; }
    .reveal b { display: block; font-size: 15px; font-style: italic; }
    .reveal span { font-size: 12px; color: rgba(255, 255, 255, .65); }
    .hist { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .hist .row { display: grid; grid-template-columns: 22px 1fr; gap: 0 8px; padding: 5px 6px;
                 border-radius: 8px; cursor: pointer; }
    .hist .row:hover { background: rgba(255, 255, 255, .08); }
    .hist .row.on { background: rgba(254, 205, 25, .14); }
    .hist .n { grid-row: span 2; align-self: center; font-weight: 700; font-style: italic; color: ${YELLOW}; }
    .hist .name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hist .where { font-size: 11px; color: rgba(255, 255, 255, .55); }`;

  // ---- the visual: a shape always blending between random country outlines (never the
  // round's), rippling with the volume; a circle while loading, an icon on play/pause/skip ----
  const MORPH_MS = 3000;
  const SPIN_STEP = (Math.PI * 3) / 8; // turn per blend
  const ICON_POLYS = {
    play: [[[-0.4, -0.55], [0.55, 0], [-0.4, 0.55]]],
    pause: [[[-0.45, -0.55], [-0.13, -0.55], [-0.13, 0.55], [-0.45, 0.55]], [[0.13, -0.55], [0.45, -0.55], [0.45, 0.55], [0.13, 0.55]]],
    skip: [[[-0.55, -0.5], [0.2, 0], [-0.55, 0.5]], [[0.25, -0.5], [0.5, -0.5], [0.5, 0.5], [0.25, 0.5]]],
    back: [[[-0.5, -0.5], [-0.25, -0.5], [-0.25, 0.5], [-0.5, 0.5]], [[0.55, -0.5], [0.55, 0.5], [-0.2, 0]]],
  };
  // rounds a polygon's corners
  function soften(poly, r = 0.06) {
    const out = [];
    poly.forEach((p, i) => {
      const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const d = Math.min(r, la / 2.2, lb / 2.2);
      const st = [p[0] + (a[0] - p[0]) * d / la, p[1] + (a[1] - p[1]) * d / la];
      const en = [p[0] + (b[0] - p[0]) * d / lb, p[1] + (b[1] - p[1]) * d / lb];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, u = 1 - t;
        out.push([u * u * st[0] + 2 * u * t * p[0] + t * t * en[0], u * u * st[1] + 2 * u * t * p[1] + t * t * en[1]]);
      }
    });
    return out;
  }
  // m points evenly spaced round a closed polygon
  function loop(poly, m) {
    const seg = poly.map((p, i) => Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]));
    const total = seg.reduce((a, v) => a + v, 0), out = [];
    for (let j = 0, i = 0, acc = 0; j < m; j++) {
      const d = (j / m) * total;
      while (acc + seg[i] < d) acc += seg[i++];
      const t = (d - acc) / seg[i], a = poly[i], b = poly[(i + 1) % poly.length];
      out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
    return out;
  }
  function blob(canvas) {
    const g = canvas.getContext('2d');
    const all = (ggs.radioShapes ?? []).map(a => Float32Array.from(a, v => v / 100));
    const n = all[0]?.length ?? 0, K = n / 2;
    const circle = new Float32Array(n); // same start (top) and winding as the outlines
    for (let i = 0; i < K; i++) {
      const a = -Math.PI / 2 + (i / K) * Math.PI * 2;
      circle[2 * i] = Math.cos(a) * 0.8; circle[2 * i + 1] = Math.sin(a) * 0.8;
    }
    const base = new Float32Array(n), shape = new Float32Array(n), ring = new Float32Array(n);
    const icons = {};
    for (const [name, polys] of Object.entries(ICON_POLYS)) {
      icons[name] = { parts: polys.length, pts: Float32Array.from(polys.flatMap(p => loop(soften(p), K / polys.length))) };
    }
    let flashName = null, flashUntil = 0, iconMix = 0, iconTarget = null, parts = 1, partsAt = 0;
    const iconCur = new Float32Array(n); // the icon on show, easing from one icon to the next
    const pick = prev => {
      let s;
      do s = all[Math.floor(Math.random() * all.length)]; while (all.length > 1 && s === prev);
      return s;
    };
    let from = pick(), to = pick(from), since = performance.now(), load = 1, level = 0;

    function trace(p, c, s, parts = 1) {
      g.beginPath();
      const per = K / parts;
      for (let q = 0; q < parts; q++) {
        const o = q * per;
        for (let i = 0; i <= per; i++) {
          const j = (o + (i % per)) * 2, k = (o + ((i + 1) % per)) * 2;
          const mx = c + (p[j] + p[k]) / 2 * s, my = c + (p[j + 1] + p[k + 1]) / 2 * s;
          if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(c + p[j] * s, c + p[j + 1] * s, mx, my);
        }
        g.closePath();
      }
    }
    // outward normal at point i
    let nx = 0, ny = 0;
    function normal(p, i) {
      const a = ((i + K - 2) % K) * 2, b = ((i + 2) % K) * 2;
      const tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], len = Math.hypot(tx, ty) || 1;
      nx = ty / len; ny = -tx / len;
    }
    const wave = (i, t, ph) => {
      const th = (i / K) * Math.PI * 2;
      return Math.sin(3 * th + t * 1.3 + ph) * 0.5 + Math.sin(7 * th - t * 2.1 + ph) * 0.3
           + Math.sin(13 * th + t * 3.4 + ph * 2) * 0.2;
    };

    // vol: 0..1 loudness; loading: finding/connecting; hold: an icon to keep showing
    function draw(now, { vol, loading, hold }) {
      const dpr = devicePixelRatio || 1, cw = canvas.clientWidth || 1, W = Math.round(cw * dpr);
      if (canvas.width !== W || canvas.height !== W) canvas.width = canvas.height = W;
      const px = W / 300, t = now / 1000, c = W / 2;
      g.clearRect(0, 0, W, W);
      if (!n) return;

      let p = (now - since) / MORPH_MS;
      if (p >= 1) { from = to; to = pick(from); since = now; p = 0; }
      const m = p * p * (3 - 2 * p);
      load += ((loading ? 1 : 0) - load) * 0.05;
      level += (vol - level) * (vol > level ? 0.35 : 0.07);
      // slowly spinning, timed so each outline is north up when the blend reaches it
      const a0 = SPIN_STEP * p, a1 = SPIN_STEP * (p - 1);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let i = 0; i < n; i += 2) {
        const x0 = from[i] * c0 - from[i + 1] * s0, y0 = from[i] * s0 + from[i + 1] * c0;
        const x1 = to[i] * c1 - to[i + 1] * s1, y1 = to[i] * s1 + to[i + 1] * c1;
        const x = x0 + (x1 - x0) * m, y = y0 + (y1 - y0) * m;
        base[i] = x + (circle[i] - x) * load;
        base[i + 1] = y + (circle[i + 1] - y) * load;
      }
      // icons ease in and out
      const want = hold ?? (now < flashUntil ? flashName : null), target = icons[want];
      if (target) {
        if (iconMix < 0.01) iconCur.set(base); // start from the shape as it is
        for (let i = 0; i < n; i++) iconCur[i] += (target.pts[i] - iconCur[i]) * 0.18;
        if (iconTarget !== want) { iconTarget = want; partsAt = now + 150; } // split/join once it's partway there
      } else iconTarget = null;
      iconMix += ((target ? 1 : 0) - iconMix) * 0.18;
      if (iconMix > 0.001) for (let i = 0; i < n; i++) base[i] += (iconCur[i] - base[i]) * iconMix;
      if (iconMix <= 0.5) parts = 1;
      else if (target && now >= partsAt) parts = target.parts;
      const plain = 1 - iconMix; // icons stay crisp: no ripples or echoes

      const breathe = Math.sin(t * 3.1);
      const s = W * 0.34 * (1 + (level * 0.07 + load * 0.035 * breathe) * plain);
      const amp = (0.015 + level * 0.14 + load * 0.035 * (0.7 + 0.3 * breathe)) * plain;

      for (let i = 0; i < K; i++) {
        normal(base, i);
        const d = amp * wave(i, t, 0);
        shape[2 * i] = base[2 * i] + nx * d;
        shape[2 * i + 1] = base[2 * i + 1] + ny * d;
      }

      // echoes, pushed outward
      g.lineJoin = 'round';
      for (const [k, alpha] of [[1, 0.14], [2, 0.07]]) {
        for (let i = 0; i < K; i++) {
          normal(shape, i);
          const d = 0.06 * k + amp * k * (0.5 + 0.5 * wave(i, t, k * 2.3));
          ring[2 * i] = shape[2 * i] + nx * d;
          ring[2 * i + 1] = shape[2 * i + 1] + ny * d;
        }
        trace(ring, c, s, parts);
        g.strokeStyle = `rgba(255, 255, 255, ${alpha * (0.6 + level) * plain})`;
        g.lineWidth = 1.2 * px;
        g.stroke();
      }

      trace(shape, c, s, parts);
      const fill = g.createRadialGradient(c, c - s * 0.3, s * 0.1, c, c, s * 1.1);
      fill.addColorStop(0, `rgba(254, 205, 25, ${0.1 + level * 0.25})`);
      fill.addColorStop(1, `rgba(120, 90, 230, ${0.08 + level * 0.15})`);
      g.fillStyle = fill;
      g.fill();
      g.shadowColor = 'rgba(254, 205, 25, .5)';
      g.shadowBlur = (4 + level * 18) * px;
      g.lineWidth = 2 * px;
      g.strokeStyle = 'rgba(255, 255, 255, .92)';
      g.stroke();
      g.shadowBlur = 0;

      if (load * plain > 0.02) {
        for (let i = 0; i < 3; i++) {
          const a = t * 2.4 + (i * Math.PI * 2) / 3;
          g.fillStyle = `rgba(254, 205, 25, ${load * plain * (0.9 - i * 0.2)})`;
          g.beginPath();
          g.arc(c + Math.cos(a) * s * 1.02, c + Math.sin(a) * s * 1.02, (4 - i) * px, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    draw.flash = (name, ms) => { flashName = name; flashUntil = performance.now() + ms; };
    return draw;
  }

  // ---- streamer mode: skip music ----
  // Music puts far more of its energy below 90 Hz than speech. A new station is listened
  // to silently for PRE_MS first, then the last BASS_MS are checked every quarter second.
  const PRE_MS = 3000, BASS_MS = 7000, BASS_EVERY_MS = 250, BASS_SHARE = 0.2;
  function musicCheck() {
    let recent = [];
    return {
      reset() { recent = []; },
      span(now) { return recent.length ? now - recent[0][0] : 0; },
      // per frame: loudness, energy below 90 Hz, energy up to 10 kHz
      push(rms, low, all, now) {
        recent.push([now, rms, low, all]);
        while (now - recent[0][0] > BASS_MS) recent.shift();
      },
      music(now, ms) {
        if (this.span(now) < ms * 0.95) return false;
        let r = 0, l = 0, a = 0, k = 0;
        for (const f of recent) if (now - f[0] <= ms) { r += f[1]; l += f[2]; a += f[3]; k++; }
        return k > 0 && r / k >= 0.005 && a > 0 && l / a > BASS_SHARE;
      },
    };
  }

  function start(cfg) {
    const hidePano = document.createElement('style');
    hidePano.textContent = HIDE_PANO_CSS;
    const setPano = show => (show ? hidePano.remove() : (document.head ?? document.documentElement).append(hidePano));
    setPano(cfg.showStreetView);

    muteGame(true);
    let audio = null, node = null, ctx = null, analyser = null, gain = null, td = null, fd = null, tuning = false;
    let preListen = false, allowMusic = false, lastCheck = 0;
    const music = musicCheck();
    let volume = 0.6, watchdog = 0, stallTimer = 0, waitingSince = 0, blocked = false, userPaused = false, skipping = 0;
    let host = null, root = null, draw = null, raf = 0, lastT = 0, lastMove = 0, live = false;
    let round = null, loc = null, stations = [], idx = 0;
    // history: this game's rounds { n, loc, stations, idx }; cur: the one playing
    let game = null, history = [], cur = null, histSig = '', finished = false, checked = null;

    const $ = sel => root.querySelector(sel);
    const setStatus = t => { $('.status').textContent = t; };

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', 'radio');
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
        <div class="wrap">
          <canvas></canvas>
          <div class="side">
            <div class="info"><div class="label">${cfg.streamerMode ? 'Talk radio' : 'Live radio'}</div><div class="status"></div></div>
            <div class="controls">
              <button class="prev" title="Previous station">${ICON.prev}</button>
              <button class="play">${ICON.pause}</button>
              <button class="next" title="Next station">${ICON.next}</button>
              <label class="vol">${ICON.vol}<input type="range" min="0" max="1" step="0.02" value="${volume}"></label>
            </div>
          </div>
          <div class="extra"><div class="reveal"></div><div class="hist"></div></div>
        </div>`;
      const togglePlay = () => {
        if (!audio) return;
        if (audio.paused) {
          userPaused = false;
          ctx?.resume();
          audio.play().catch(() => {});
          draw.flash('play', 700);
        } else {
          userPaused = true;
          audio.pause();
        }
      };
      $('.play').onclick = togglePlay;
      $('canvas').onclick = togglePlay;
      $('.wrap').onclick = e => { if (e.target === e.currentTarget) togglePlay(); };
      $('.prev').onclick = () => { draw.flash('back', 600); tune(idx - 1); };
      $('.next').onclick = () => { draw.flash('skip', 600); tune(idx + 1); };
      $('input').oninput = e => { volume = +e.target.value; if (audio) audio.volume = volume; };
      $('.hist').onclick = e => {
        const h = history[e.target.closest('.row')?.dataset.i];
        if (!h?.stations.length) return;
        cur = h; stations = h.stations; loc = h.loc;
        tune(h.idx);
      };
      draw = blob($('canvas'));
      let playing = null;
      const frame = now => {
        raf = requestAnimationFrame(frame);
        if (host.hidden) return;
        const t = audio?.currentTime ?? 0;
        if (t !== lastT) { lastT = t; lastMove = now; }
        live = !!audio && !audio.paused && now - lastMove < 400; // sound is arriving
        const isPlaying = !!audio && !audio.paused;
        if (isPlaying !== playing) $('.play').innerHTML = (playing = isPlaying) ? ICON.pause : ICON.play;
        // loudness: measured when the stream allows it (CORS), otherwise a made-up wobble
        let vol = 0;
        if (node && live) {
          analyser.getByteTimeDomainData(td);
          let sum = 0;
          for (const v of td) sum += (v - 128) ** 2;
          const rms = Math.sqrt(sum / td.length) / 128;
          vol = Math.min(1, rms * 4);
          if (cfg.streamerMode && !allowMusic && !skipping) {
            analyser.getFloatFrequencyData(fd);
            const hz = ctx.sampleRate / analyser.fftSize;
            let low = 0, all = 0;
            for (let i = 1; i * hz < 10000; i++) {
              const p = 10 ** (fd[i] / 10);
              all += p;
              if (i * hz < 90) low += p;
            }
            music.push(rms, low, all, now);
            if (preListen) {
              if (music.span(now) >= PRE_MS * 0.95) { if (music.music(now, PRE_MS)) musicSkip(); else unmute(); }
            } else if (now - lastCheck >= BASS_EVERY_MS) {
              lastCheck = now;
              if (music.music(now, BASS_MS)) musicSkip();
            }
          }
        } else if (live) {
          vol = 0.3 + 0.25 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1));
        }
        const wait = waitingSince && !blocked ? (Date.now() - waitingSince) / START_MS : 0;
        if (wait) setStatus(`Station ${idx + 1} of ${stations.length} · waiting for audio ${Math.max(0, Math.ceil(START_MS / 1000 * (1 - wait)))}s`);
        else if (live && cfg.streamerMode && !skipping) {
          const note = allowMusic ? '' : !node ? " · can't check this one for music"
            : preListen ? ' · checking for music…' : '';
          const text = `Station ${idx + 1} of ${stations.length}${note}`;
          if ($('.status').textContent !== text) setStatus(text);
        }
        draw(now, { vol, loading: tuning || (!!waitingSince && !blocked) || preListen, hold: userPaused && audio?.paused ? 'pause' : null });
      };
      raf = requestAnimationFrame(frame);
    }

    function place(inRound) {
      const pano = !cfg.showStreetView && inRound && PANO_SELECTORS.map(s => document.querySelector(s)).find(Boolean);
      if (pano?.parentElement) {
        if (host.previousElementSibling !== pano) pano.after(host);
        host.className = 'stage';
      } else {
        if (host.parentElement !== document.body) document.body.append(host);
        host.className = 'mini';
      }
    }

    // Our own AudioContext (the real constructor, so muteGame leaves it alone), made only
    // after a click or key press (Chrome's rule).
    function ensureCtx() {
      if (ctx || !RealAudioContext || navigator.userActivation?.hasBeenActive === false) return;
      ctx = new RealAudioContext();
      ours.add(ctx);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      td = new Uint8Array(analyser.fftSize);
      fd = new Float32Array(analyser.frequencyBinCount);
      gain = ctx.createGain();
      analyser.connect(gain);
      gain.connect(ctx.destination);
    }

    function drop() {
      if (!audio) return;
      const a = audio;
      audio = null;
      a.onerror = a.onplaying = a.onwaiting = a.onstalled = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
      node?.disconnect();
      node = null;
    }

    // With CORS first (so the sound can be read); if the stream refuses, again without.
    function load(url, cors, startPaused = false) {
      drop();
      const a = audio = new Audio();
      ours.add(a);
      a.volume = volume;
      if (cors) ensureCtx();
      const readable = cors && !!ctx;
      if (readable) {
        a.crossOrigin = 'anonymous';
        node = ctx.createMediaElementSource(a);
        node.connect(analyser);
      }
      preListen = readable && !!cfg.streamerMode && !allowMusic;
      if (gain) { gain.gain.cancelScheduledValues(0); gain.gain.value = preListen ? 0 : 1; }
      let failed = false;
      const fail = () => {
        if (failed || a !== audio) return;
        failed = true;
        // no CORS, so streamer mode can't check it: prefer stations it can
        if (readable && cfg.streamerMode && !allowMusic && !startPaused && tryCheckable()) return;
        if (readable) load(url, false, startPaused);
        else skip('stream failed');
      };
      a.onerror = fail;
      a.onplaying = () => {
        clearTimeout(watchdog); clearTimeout(stallTimer);
        waitingSince = 0;
        setStatus(`Station ${idx + 1} of ${stations.length}`);
      };
      a.onwaiting = a.onstalled = () => {
        clearTimeout(stallTimer);
        if (!a.paused && !waitingSince) waitingSince = Date.now();
        stallTimer = setTimeout(() => a === audio && !a.paused && skip('stopped'), STALL_MS);
      };
      a.src = url;
      if (startPaused) return;
      ctx?.resume().catch(() => {});
      a.play().catch(err => {
        if (a !== audio) return;
        if (err.name !== 'NotAllowedError') return fail();
        // no click on the page yet: start on the first one
        blocked = true;
        clearTimeout(watchdog);
        setStatus('Click anywhere to start the radio');
      });
    }

    function tune(i, { paused = false } = {}) {
      if (!stations.length) return;
      idx = ((i % stations.length) + stations.length) % stations.length;
      if (cur) cur.idx = idx;
      music.reset();
      userPaused = paused;
      allowMusic = paused;
      lastCheck = 0;
      clearTimeout(skipping); skipping = 0;
      $('.reveal').innerHTML = '';
      clearTimeout(watchdog); clearTimeout(stallTimer);
      blocked = false;
      if (cfg.streamerMode && !paused && navigator.userActivation?.hasBeenActive === false) {
        // the music check needs a click first, so wait rather than play unchecked
        blocked = true;
        waitingSince = 0;
        return setStatus('Click anywhere to start the radio');
      }
      const cors = !setFor(uncheckableFor).has(stations[idx]);
      if (paused) {
        waitingSince = 0;
        load(stations[idx].url_resolved, cors, true);
        return setStatus('Only music stations nearby · press play to hear it anyway');
      }
      waitingSince = Date.now();
      watchdog = setTimeout(() => !blocked && (!audio || audio.currentTime < 0.5) && skip('no audio'), START_MS);
      load(stations[idx].url_resolved, cors);
    }
    function unmute() {
      preListen = false;
      gain?.gain.setTargetAtTime(1, ctx.currentTime, 0.08);
    }

    // Music in streamer mode: skip to the next station not yet caught playing music; if all
    // have been, back to the first, paused.
    const flaggedFor = new WeakMap(); // station list -> stations caught playing music
    const uncheckableFor = new WeakMap(); // station list -> stations whose sound can't be read
    const setFor = map => { const set = map.get(stations) ?? new Set(); map.set(stations, set); return set; };
    // moves an uncheckable station to the back; false if no checkable one is left after it
    function tryCheckable() {
      const st = stations[idx], bad = setFor(uncheckableFor), music = setFor(flaggedFor);
      bad.add(st);
      if (!stations.slice(idx + 1).some(s => !bad.has(s) && !music.has(s))) return false;
      stations.splice(idx, 1);
      stations.push(st);
      let j = idx;
      while (bad.has(stations[j]) || music.has(stations[j])) j++;
      tune(j);
      return true;
    }
    function musicSkip() {
      const flagged = setFor(flaggedFor);
      flagged.add(stations[idx]);
      audio?.pause();
      draw?.flash('skip', 900);
      setStatus('Music detected, skipping…');
      let next = null;
      for (let k = 1; k < stations.length && next == null; k++) {
        if (!flagged.has(stations[(idx + k) % stations.length])) next = (idx + k) % stations.length;
      }
      skipping = setTimeout(() => {
        skipping = 0;
        if (next != null) tune(next);
        else tune(stations.findIndex(s => flagged.has(s)), { paused: true });
      }, 600);
    }
    function skip(why) {
      if (stations.length < 2) { waitingSince = 0; return setStatus(`Station ${why}`); }
      tune(idx + 1);
    }
    const unblock = () => {
      if (!blocked) return;
      ctx?.resume().catch(() => {});
      tune(idx);
    };
    window.addEventListener('pointerdown', unblock, true);
    window.addEventListener('keydown', unblock, true);

    async function newRound(key) {
      round = key;
      const token = ggs.game.context()?.token;
      if (token !== game) { game = token; history = []; }
      stations = []; loc = null; cur = null;
      drop();
      clearTimeout(watchdog); clearTimeout(stallTimer);
      waitingSince = 0; blocked = false;
      $('.reveal').innerHTML = '';
      setStatus('Tuning…');
      tuning = true;
      loc = await ggs.game.roundLocation().catch(() => null);
      if (round !== key) return;
      if (!loc) { tuning = false; return setStatus('No location (standard games only)'); }
      stations = await findStations(loc.lat, loc.lng, !!cfg.streamerMode).catch(() => []);
      if (round !== key) return;
      tuning = false;
      history = history.filter(h => h.key !== key); // re-tuned (streamer mode switched)
      cur = { key, n: history.length + 1, loc, stations, idx: 0 };
      history.push(cur);
      if (!stations.length) return setStatus(cfg.streamerMode ? 'No talk station found nearby' : 'No station found nearby');
      tune(0);
    }

    // Result screens: the guess is in, so name the stations.
    function reveal() {
      const s = stations[idx];
      if (s && !$('.reveal').innerHTML) {
        $('.reveal').innerHTML = `<b>${esc(s.name.trim())}</b><span>${esc(describe(s, loc))}</span>`;
      }
      const sig = history.map(h => h.idx).join() + '|' + history.indexOf(cur) + '|' + finished;
      if (sig === histSig) return;
      histSig = sig;
      $('.hist').innerHTML = !finished || history.length < 2 ? '' : `<div class="label">Stations this game</div>` +
        history.map((h, i) => {
          const st = h.stations[h.idx];
          const title = st ? ` title="${esc(new URL(st.url_resolved).hostname)}"` : '';
          return `<div class="row${h === cur ? ' on' : ''}" data-i="${i}"${title}><span class="n">${h.n}</span>
            <span class="name">${esc(st ? st.name.trim() : 'No station found')}</span>
            <span class="where">${esc(st ? describe(st, h.loc) : '')}</span></div>`;
        }).join('');
    }

    const tick = setInterval(() => {
      const inGame = !!ggs.game.context();
      const inRound = !!ggs.maps.guessMapElement();
      if (!inGame) { drop(); if (host) host.hidden = true; round = null; return; }
      if (inRound && !host) create();
      if (!host) return;
      host.hidden = false;
      place(inRound);
      const key = ggs.game.roundKey();
      if (inRound && key !== round) newRound(key);
      if (inRound) { $('.hist').innerHTML = ''; histSig = ''; finished = false; checked = null; }
      else {
        if (checked !== key) {
          checked = key;
          ggs.game.state().then(st => { if (checked === key) finished = !!st?.finished; }).catch(() => {});
        }
        reveal();
      }
    }, 500);

    return {
      update(next) {
        if (!!next.showStreetView !== !!cfg.showStreetView) setPano(next.showStreetView);
        const retune = !!next.streamerMode !== !!cfg.streamerMode;
        cfg = next;
        if (host) $('.label').textContent = cfg.streamerMode ? 'Talk radio' : 'Live radio';
        if (retune) round = null; // retune this round
      },
      stop() {
        clearInterval(tick);
        cancelAnimationFrame(raf);
        clearTimeout(skipping);
        window.removeEventListener('pointerdown', unblock, true);
        window.removeEventListener('keydown', unblock, true);
        clearTimeout(watchdog); clearTimeout(stallTimer);
        drop();
        ctx?.close().catch(() => {});
        muteGame(false);
        host?.remove();
        hidePano.remove();
      },
    };
  }

  ggs.scripts.radio = { start };
})();

// ==================== src/scripts/ghana-tape/meta.js ==============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'ghana-tape',
    name: 'Add new Ghana black tape',
    description: "Paints Ghana's black tape on new Gen 4 coverage, which doesn't have it.",
    defaultEnabled: false,
    options: [],
  });
})();

// ==================== src/scripts/ghana-tape/ghana.js =============================
// Ghana's outline (lng, lat), thinned from draw-guess's country data.
(() => {
  globalThis.__ggs.GHANA = [[-0.07,11.12],[0.01,11.02],[-0.06,10.8],[-0.09,10.67],[0.04,10.56],[0.15,10.46],[0.33,10.31],[0.38,10.27],[0.35,9.93],[0.34,9.8],[0.31,9.67],[0.27,9.67],[0.27,9.62],[0.33,9.59],[0.25,9.54],[0.23,9.46],[0.26,9.43],[0.37,9.49],[0.45,9.48],[0.53,9.36],[0.47,9.12],[0.49,8.89],[0.45,8.81],[0.38,8.72],[0.48,8.57],[0.69,8.36],[0.65,8.25],[0.58,8.15],[0.5,7.55],[0.51,7.43],[0.59,7.39],[0.62,7.23],[0.59,7.03],[0.54,6.98],[0.53,6.89],[0.55,6.8],[0.67,6.59],[0.71,6.55],[0.74,6.45],[0.91,6.33],[1.0,6.27],[1.08,6.17],[1.19,6.14],[1.11,6.05],[1.01,5.91],[0.75,5.76],[0.26,5.76],[-0.35,5.5],[-0.67,5.32],[-1.06,5.18],[-1.64,4.98],[-2.0,4.76],[-2.27,4.87],[-2.72,5.01],[-3.08,5.08],[-3.09,5.13],[-2.95,5.12],[-2.82,5.15],[-2.79,5.26],[-2.76,5.36],[-2.79,5.6],[-2.96,5.64],[-3.0,5.71],[-3.06,5.93],[-3.2,6.35],[-3.24,6.54],[-3.22,6.69],[-3.24,6.81],[-3.04,7.11],[-2.99,7.21],[-2.96,7.46],[-2.86,7.77],[-2.8,7.9],[-2.67,8.02],[-2.6,8.08],[-2.61,8.15],[-2.54,8.17],[-2.56,8.49],[-2.6,8.8],[-2.65,8.96],[-2.75,9.04],[-2.69,9.22],[-2.7,9.3],[-2.69,9.43],[-2.71,9.53],[-2.78,9.75],[-2.75,9.91],[-2.79,10.19],[-2.78,10.28],[-2.82,10.36],[-2.79,10.43],[-2.88,10.51],[-2.91,10.73],[-2.83,11.0],[-2.75,10.99],[-2.23,10.99],[-1.6,11.0],[-1.54,11.02],[-1.04,11.01],[-0.9,10.98],[-0.7,10.99],[-0.63,10.93],[-0.55,10.98],[-0.45,11.06],[-0.4,11.09],[-0.31,11.12],[-0.07,11.12]];
})();

// ==================== src/scripts/ghana-tape/main.js ==============================
// Ghana black tape: old (Gen 3) Ghana coverage has tape on the car's roof bar, Gen 4
// doesn't. On Gen 4 panoramas inside Ghana (tile width 16384) the tape is drawn on a
// canvas over Street View, projected so it turns and zooms with the view.
(() => {
  const ggs = globalThis.__ggs;

  // The car in its own frame: x right, y forward, z up, camera at the origin. Two roof
  // bars with four ends poking out from under the blurred car; tape on the front-left tip.
  const CAR = {
    bars: { ys: [-0.85, 0.85], inner: 1.0, outer: 1.5, w: 0.07, z: -1 },
    tape: { bar: 1, side: 1, len: 0.22, w: 0.085 },
  };
  const GEN4_WIDTH = 16384;
  const NEAR_DEG = 0.05; // ~5 km leeway at Ghana's coarse outline

  const panos = new Map(); // pano -> container div (StreetViewPanorama has no getDiv())
  let active = null;
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    if (!(args[0] instanceof HTMLElement)) return;
    panos.set(p, args[0]);
    active?.attach(p);
  });

  function nearEdge([x, y], poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2));
      if (Math.hypot(x - (xi + t * dx), y - (yi + t * dy)) < NEAR_DEG) return true;
    }
    return false;
  }
  function insidePolygon([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inGhana = pt => insidePolygon(pt, ggs.GHANA) || nearEdge(pt, ggs.GHANA);

  // pano id -> Promise<{ width, centerHeading } | null>, from the page's own Maps API
  const tileCache = new Map();
  function tiles(id) {
    if (!tileCache.has(id)) {
      tileCache.set(id, new window.google.maps.StreetViewService().getPanorama({ pano: id })
        .then(({ data }) => ({ width: data.tiles.worldSize.width, centerHeading: data.tiles.centerHeading }))
        .catch(() => null));
    }
    return tileCache.get(id);
  }

  const rad = d => (d * Math.PI) / 180;
  function toCamera([x, y, z], pov) {
    const a = rad(pov.heading), t = rad(pov.pitch);
    const cx = x * Math.cos(a) - y * Math.sin(a), cy = z, cz = x * Math.sin(a) + y * Math.cos(a);
    return [cx, cy * Math.cos(t) - cz * Math.sin(t), cy * Math.sin(t) + cz * Math.cos(t)];
  }
  // Projects a polygon onto the screen, clipping the part behind the camera.
  const NEAR = 0.05;
  function project(pts, pov, fov, w, h) {
    const cam = pts.map(p => toCamera(p, pov));
    const clipped = [];
    for (let i = 0; i < cam.length; i++) {
      const p = cam[i], q = cam[(i + 1) % cam.length];
      const pin = p[2] > NEAR, qin = q[2] > NEAR;
      if (pin) clipped.push(p);
      if (pin !== qin) {
        const k = (NEAR - p[2]) / (q[2] - p[2]);
        clipped.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, NEAR]);
      }
    }
    if (clipped.length < 3) return null;
    const f = w / 2 / Math.tan(rad(fov) / 2);
    return clipped.map(([x, y, z]) => [w / 2 + (f * x) / z, h / 2 - (f * y) / z]);
  }

  function start(cfg) {
    const attached = new Map(); // pano -> { canvas, listeners, resize, info }

    function draw(pano) {
      const st = attached.get(pano);
      if (!st) return;
      const { canvas } = st;
      const div = panos.get(pano);
      const w = div.clientWidth, h = div.clientHeight, dpr = devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!st.info || !pano.getVisible()) return;

      const pov = pano.getPov();
      const rel = { heading: pov.heading - st.info.centerHeading + 180, pitch: pov.pitch }; // centerHeading points at the back of the car
      const fov = Math.min(127, 180 / 2 ** (pano.getZoom() ?? 1));
      const P = pts => project(pts, rel, fov, w, h);
      const rect = (x0, x1, y0, y1, z) => P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
      const path = pts => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      const fill = (pts, color) => { // stroked in the same colour so adjacent strips don't show a seam
        if (!pts) return;
        path(pts);
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      };
      const cap = (cx, cy, r, side, z) => P(Array.from({ length: 9 }, (_, i) => {
        const a = ((i / 8) - 0.5) * Math.PI;
        return [cx + side * r * Math.cos(a), cy + r * Math.sin(a), z];
      }));
      // strips across a bar's width, lit from above
      const shade = (x0, x1, y, hw, z, colors) => {
        const n = colors.length;
        colors.forEach((c, i) => fill(rect(x0, x1, y - hw + (2 * hw * i) / n, y - hw + (2 * hw * (i + 1)) / n, z), c));
      };
      // fades the inner end of a bar into the blurred car
      const fade = (x0, x1, y, hw, z) => {
        const r = rect(x0, x1, y - hw, y + hw, z);
        const ends = P([[x0, y, z], [x1, y, z], [x1, y + 0.001, z]]);
        if (!r || !ends || ends.length < 2) return;
        const g = ctx.createLinearGradient(ends[0][0], ends[0][1], ends[1][0], ends[1][1]);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        fill(r, g);
        ctx.restore();
      };

      const { bars, tape } = CAR;
      bars.ys.forEach((y, i) => {
        for (const side of [-1, 1]) {
          const x0 = side * bars.inner, x1 = side * bars.outer, hw = bars.w;
          if (!rect(x0, x1, y - hw, y + hw, bars.z)) continue;

          ctx.save();
          ctx.filter = 'blur(3px)';
          fill(rect(x0, x1 + side * 0.03, y - hw * 0.6 + 0.05, y + hw * 1.4 + 0.05, bars.z - 0.01), 'rgba(0,0,0,.28)');
          ctx.restore();

          shade(x0, x1, y, hw, bars.z, ['#8e8f90', '#c9cacb', '#e9eaea', '#f4f4f4', '#dcdddd', '#b5b6b7', '#828384']);
          fill(rect(x0, x1, y - hw * 0.12, y + hw * 0.12, bars.z + 0.001), '#5a5b5c');
          fill(rect(x0, x1, y + hw * 0.12, y + hw * 0.2, bars.z + 0.001), 'rgba(255,255,255,.35)');
          fill(cap(x1, y, hw, side, bars.z), '#b9babb');
          fill(cap(x1, y, hw * 0.55, side, bars.z + 0.001), '#8a8b8c');

          if (i === tape.bar && side === tape.side) {
            const tx0 = side * (bars.outer - tape.len), tx1 = x1 + side * 0.015, tw = tape.w;
            shade(tx0, tx1, y, tw, bars.z + 0.002, ['#161616', '#2a2a2a', '#383838', '#2c2c2c', '#1b1b1b', '#111']);
            fill(cap(tx1, y, tw, side, bars.z + 0.002), '#1f1f1f');
            for (const k of [0.3, 0.62]) {
              const x = side * (bars.outer - tape.len * k);
              fill(rect(x, x + side * 0.006, y - tw, y + tw, bars.z + 0.003), 'rgba(255,255,255,.07)');
            }
          }

          fade(x0, side * (bars.inner + (bars.outer - bars.inner) * 0.35), y, hw * 1.6, bars.z);
        }
      });
    }

    async function refresh(pano) {
      const st = attached.get(pano);
      if (!st) return;
      st.info = null;
      const pos = pano.getPosition(), id = pano.getPano();
      if (pos && id && inGhana([pos.lng(), pos.lat()])) {
        const t = await tiles(id);
        if (attached.get(pano) !== st || pano.getPano() !== id) return;
        if (t && t.width >= GEN4_WIDTH) st.info = t;
      }
      draw(pano);
    }

    function attach(pano) {
      if (attached.has(pano)) return;
      const div = panos.get(pano);
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1000';
      if (getComputedStyle(div).position === 'static') div.style.position = 'relative';
      div.append(canvas);
      const redraw = () => { try { draw(pano); } catch (err) { ggs.log('ghana-tape draw failed', err); } };
      const st = { canvas, info: null, listeners: [] };
      attached.set(pano, st);
      const ev = window.google.maps.event;
      st.listeners = [
        ev.addListener(pano, 'pano_changed', () => refresh(pano)),
        ev.addListener(pano, 'position_changed', () => refresh(pano)),
        ev.addListener(pano, 'pov_changed', redraw),
        ev.addListener(pano, 'zoom_changed', redraw),
        ev.addListener(pano, 'visible_changed', redraw),
      ];
      st.resize = new ResizeObserver(redraw);
      st.resize.observe(div);
      refresh(pano);
    }

    active = { attach };
    panos.forEach((_, p) => attach(p));

    return {
      stop() {
        active = null;
        for (const st of attached.values()) {
          st.listeners.forEach(l => l.remove());
          st.resize.disconnect();
          st.canvas.remove();
        }
        attached.clear();
      },
    };
  }

  ggs.scripts['ghana-tape'] = { start };
})();

// ==================== src/scripts/lying-signs/meta.js =============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'lying-signs',
    name: 'Lying signs',
    description: 'Rewrites the text on signs.',
    defaultEnabled: false,
    options: [
      // index into WORDS in main.js; 0 = a different one for every sign
      { key: 'script', label: 'Script to write in', type: 'select', default: 0,
        choices: ['Random', 'Thai', 'Georgian', 'Korean', 'Arabic', 'Cyrillic', 'Greek', 'Hebrew', 'Japanese', 'Hindi', 'Armenian',
          'English (wrong words)', 'German', 'Spanish', 'French', 'Minecraft'].map((label, value) => ({ value, label })) },
      { key: 'noZoom', label: 'Disable zoom', type: 'checkbox', default: false },
    ],
  });
})();

// ==================== src/scripts/lying-signs/main.js =============================
// Lying signs: every Street View tile (via ggs.tiles, core/tiles.js) has its text found
// by a detector in a worker (worker.js, PP-OCRv4 on onnxruntime-web, loaded from
// ggs.extBase), painted over, and new text in another script written on top. A blurred
// copy goes up while the detector works, then the edited tile replaces it in the same
// texture.
(() => {
  const ggs = globalThis.__ggs;
  const DET_SIZE = 768;                       // detector input; 512-px tiles are upscaled so small text is found
  const MIN_CONTRAST = 45;                    // below this text-vs-sign RGB difference a box is ignored
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  const ENGLISH = [
    'JackSucksAtLife', 'JackSucksAtStuff', 'JackSucksAtGeography', 'Jack Massey Welsh', 'JackSucksAtGuessing', 'JackSucksAtClips',
    'JackSucksAtPopUpPirate', 'JackSucksAtEspañol', 'JackApestaEnEspañol', 'No Context JackSucksAtLife', 'turd boi420',
    'SamSmellsOfApricots', 'SamSmellsOfApricot', 'ejsafc', 'Fufik', 'pretty woman kitchen', 'Geography Stuff', 'Jack & Oscar',
    'Minecraft', 'Becky', 'Rick', 'Kai', 'Kong', 'Flossy', 'Kazoo', 'Toothbrush', 'Spudger', 'Rhombus', 'Unicycle', 'Beanie',
    'Lovely', 'Guinness', 'Playbutton', 'PewDiePie', 'Tesla', 'Autopilot', 'Geography', 'Flag', 'Europe', 'Luxembourg',
    'Seychelles', 'Car Bar', 'Black tape', 'Vatican', 'Australia', 'Nottinghamshire', 'Welsh', 'Spanish', 'Español', 'Reddit',
    'Jackoffs', 'Diddle', 'Nelly', 'Jeremy', 'Vampire', 'Harmony Hollow', 'Minecraft Monday', 'Piglin', 'Skyblock',
    'Hacker Trolling', 'Misprint', 'Briefcase', 'Wigs', 'Recycling', 'Bush', 'Urinate', 'Weel', 'Toilet', 'zi8gzag',
    'Oscar', 'zi8gzag Was Here', 'Oscar Sucks At Life', 'Jack Was Here', 'Sucks At Life', 'Sucks At Geography', 'Not Luxembourg',
    'Definitely Kyrgyzstan', 'Probably Ohio', 'Bolivia?', 'Wrong Country', 'Trust The Bollard', 'Follow The Tape', 'Guess Again',
    'Plonk Here', '5000 Points', '4,999', 'Zero Points', 'Round 5', 'Gen 4', 'Trekker', 'Snow Cam', 'Rifts', 'Google Car',
    'Kiwicraft', 'Bingo', 'Big Bang', 'Nature Websites', 'Pop Up Pirate', 'Jacksucks Merch', 'Silver Playbutton', 'Diamond Playbutton',
    'Jack Massey Welch', 'Jaxsucksatlife', 'Sucks', 'Massey', 'Apricots', 'Toothbrush Factory', 'Kazoo Kid', 'Beanie Baby',
    'Rhombus Road', 'Unicycle Lane', 'Spudger Street', 'Flossy Avenue', 'Guinness Bar', 'Vampire Weekend', 'Piglin Bank',
    'Skyblock Island', 'Harmony Hollow Hotel', 'Misprint Museum', 'Briefcase Depot', 'Wig Emporium', 'Recycling Centre',
    'Bush Tucker', 'Weel Deel', 'Toilet Tour', 'Nelly The Elephant', 'Jeremy Fisher', 'Becky Lynch', 'Kong King', 'Rick Roll',
    'Kai Cenat', 'Cheese', 'Left Only', 'Badger', 'Toast', 'No Parking', 'Sheep', 'Bus Stop', 'Pancakes', 'Otter', 'Gravy',
    'Wrong Way', 'Mild Peril', 'Beware Of Jack', 'Oscar Crossing', 'Free Points', 'Actually Chile', 'Nice Try', 'Welcome To Wales',
  ];
  // Indexed by the "script" option; 0 is random (one script per panorama).
  const WORDS = [
    null,
    ['สวัสดี', 'ถนน', 'ตลาด', 'โรงเรียน', 'วัด', 'ร้านอาหาร', 'ทางออก', 'ระวัง', 'หยุด', 'กรุงเทพ', 'เชียงใหม่', 'ภูเก็ต', 'ห้ามจอด', 'โรงแรม', 'ธนาคาร', 'สถานี', 'ตำรวจ', 'ยินดีต้อนรับ', 'ก๋วยเตี๋ยว', 'ชายหาด',
      'ขอนแก่น', 'พัทยา', 'อยุธยา', 'หาดใหญ่', 'นครราชสีมา', 'ซอย', 'ทางเข้า', 'ห้องน้ำ', 'ร้านกาแฟ', 'ร้านขายยา', 'โรงพยาบาล', 'ตลาดน้ำ', 'ปั๊มน้ำมัน', 'มหาวิทยาลัย', 'สนามบิน', 'ท่าเรือ', 'ลดความเร็ว', 'ทางม้าลาย', 'ห้ามเข้า', 'ส้มตำ', 'ผัดไทย', 'ข้าวมันไก่', 'ชาเย็น', 'เซเว่น', 'นวดแผนไทย', 'ร้านซ่อมรถ', 'ร้านทอง', 'อู่รถ', 'บ้านพัก', 'ที่จอดรถ'],
    ['გამარჯობა', 'ქუჩა', 'ბაზარი', 'სკოლა', 'თბილისი', 'გასასვლელი', 'ფრთხილად', 'გაჩერდი', 'ბათუმი', 'ქუთაისი', 'სასტუმრო', 'ბანკი', 'აფთიაქი', 'პოლიცია', 'რესტორანი', 'ღვინო', 'ხაჭაპური', 'მოგესალმებით',
      'რუსთავი', 'გორი', 'ზუგდიდი', 'ფოთი', 'თელავი', 'მცხეთა', 'ბორჯომი', 'გუდაური', 'სვანეთი', 'კახეთი', 'შესასვლელი', 'ტუალეტი', 'კაფე', 'საავადმყოფო', 'უნივერსიტეტი', 'აეროპორტი', 'სადგური', 'მეტრო', 'ავტოსადგომი', 'გაჩერება', 'შეამცირე სიჩქარე', 'ხინკალი', 'ჩურჩხელა', 'ლობიანი', 'ჭაჭა', 'მაღაზია', 'ბაზრობა', 'ეკლესია', 'მუზეუმი', 'თეატრი', 'სამრეცხაო'],
    ['안녕하세요', '도로', '시장', '학교', '서울', '출구', '주의', '정지', '부산', '식당', '주차금지', '호텔', '은행', '약국', '경찰', '편의점', '지하철', '환영합니다', '김치', '노래방',
      '인천', '대구', '대전', '광주', '제주도', '수원', '울산', '강남', '홍대', '명동', '입구', '화장실', '카페', '병원', '대학교', '공항', '기차역', '버스정류장', '주차장', '서행', '횡단보도', '진입금지', '치킨', '삼겹살', '비빔밥', '떡볶이', '소주', '피시방', '찜질방', '세탁소', '미용실', '부동산', '치과', '교회', '박물관'],
    ['مرحبا', 'شارع', 'سوق', 'مدرسة', 'مخرج', 'انتبه', 'قف', 'مطعم', 'القاهرة', 'دبي', 'فندق', 'بنك', 'صيدلية', 'شرطة', 'ممنوع الوقوف', 'أهلا وسهلا', 'مسجد', 'محطة',
      'الرياض', 'جدة', 'عمّان', 'بيروت', 'الدوحة', 'مسقط', 'الرباط', 'تونس', 'بغداد', 'الإسكندرية', 'مدخل', 'حمام', 'مقهى', 'مستشفى', 'جامعة', 'مطار', 'محطة القطار', 'موقف الباص', 'موقف سيارات', 'خفف السرعة', 'ممنوع الدخول', 'شاورما', 'فلافل', 'كنافة', 'قهوة', 'بقالة', 'مخبز', 'جزار', 'كنيسة', 'متحف', 'مغسلة', 'صالون', 'عقارات', 'ميناء'],
    ['привет', 'улица', 'рынок', 'школа', 'выход', 'осторожно', 'стоп', 'Москва', 'магазин', 'аптека', 'банк', 'гостиница', 'полиция', 'вокзал', 'добро пожаловать', 'Новосибирск', 'шаурма', 'парковка запрещена',
      'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Владивосток', 'Сочи', 'Омск', 'Минск', 'Киев', 'Алматы', 'Бишкек', 'вход', 'туалет', 'кафе', 'больница', 'университет', 'аэропорт', 'станция', 'остановка', 'парковка', 'въезд запрещён', 'пешеходный переход', 'продукты', 'пельмени', 'борщ', 'блины', 'квас', 'пекарня', 'мясо', 'церковь', 'музей', 'театр', 'прачечная', 'парикмахерская', 'шиномонтаж', 'автосервис', 'почта', 'дом культуры'],
    ['Αθήνα', 'οδός', 'αγορά', 'σχολείο', 'έξοδος', 'προσοχή', 'στοπ', 'ταβέρνα', 'λιμάνι', 'ξενοδοχείο', 'τράπεζα', 'φαρμακείο', 'αστυνομία', 'καλώς ήρθατε', 'Θεσσαλονίκη', 'σουβλάκι', 'παραλία',
      'Πάτρα', 'Ηράκλειο', 'Λάρισα', 'Βόλος', 'Ρόδος', 'Κέρκυρα', 'Χανιά', 'Σαντορίνη', 'Μύκονος', 'Λευκωσία', 'είσοδος', 'τουαλέτα', 'καφενείο', 'νοσοκομείο', 'πανεπιστήμιο', 'αεροδρόμιο', 'σταθμός', 'στάση', 'πάρκινγκ', 'απαγορεύεται η στάθμευση', 'γύρος', 'μουσακάς', 'φέτα', 'ούζο', 'φούρνος', 'κρεοπωλείο', 'εκκλησία', 'μουσείο', 'θέατρο', 'περίπτερο', 'κομμωτήριο', 'βουλκανιζατέρ', 'ταχυδρομείο', 'πλατεία', 'λεωφόρος'],
    ['שלום', 'רחוב', 'שוק', 'בית ספר', 'יציאה', 'זהירות', 'עצור', 'מסעדה', 'תל אביב', 'ירושלים', 'מלון', 'בנק', 'בית מרקחת', 'משטרה', 'ברוכים הבאים', 'חניה אסורה', 'פלאפל', 'תחנה',
      'חיפה', 'באר שבע', 'אילת', 'נתניה', 'הרצליה', 'צפת', 'טבריה', 'כניסה', 'שירותים', 'בית קפה', 'בית חולים', 'אוניברסיטה', 'שדה תעופה', 'תחנת רכבת', 'תחנת אוטובוס', 'חניון', 'האט', 'מעבר חצייה', 'אין כניסה', 'שווארמה', 'חומוס', 'סביח', 'מאפייה', 'מכולת', 'קצבייה', 'בית כנסת', 'מוזיאון', 'תיאטרון', 'מכבסה', 'מספרה', 'דואר', 'שדרות', 'כיכר', 'גן ילדים', 'קופת חולים'],
    ['東京', '駅', '市場', '学校', '出口', '注意', '止まれ', '食堂', '大阪', '銀行', '駐車禁止', 'ホテル', '薬局', '警察', 'ようこそ', 'ラーメン', '温泉', '京都', '北海道', 'コンビニ',
      '名古屋', '福岡', '札幌', '神戸', '横浜', '広島', '仙台', '沖縄', '奈良', '長崎', '入口', 'トイレ', '喫茶店', '病院', '大学', '空港', 'バス停', '駐車場', '徐行', '横断歩道', '進入禁止', '寿司', 'うどん', 'カレー', '焼肉', '居酒屋', 'パン屋', '肉屋', '神社', '寺', '博物館', '交番', '郵便局', '美容室', 'ガソリンスタンド', '自動販売機', '商店街', '一方通行', '踏切', '公園'],
    ['नमस्ते', 'सड़क', 'बाज़ार', 'विद्यालय', 'निकास', 'सावधान', 'रुकिए', 'दिल्ली', 'होटल', 'मुंबई', 'बैंक', 'दवाखाना', 'पुलिस', 'स्वागत है', 'पार्किंग नहीं', 'चाय', 'रेलवे स्टेशन', 'मंदिर',
      'कोलकाता', 'चेन्नई', 'बेंगलुरु', 'जयपुर', 'लखनऊ', 'वाराणसी', 'आगरा', 'पुणे', 'गोवा', 'काठमांडू', 'प्रवेश', 'शौचालय', 'ढाबा', 'अस्पताल', 'विश्वविद्यालय', 'हवाई अड्डा', 'बस अड्डा', 'धीरे चलें', 'प्रवेश निषेध', 'समोसा', 'चाट', 'बिरयानी', 'दाल', 'लस्सी', 'मिठाई', 'किराना', 'मस्जिद', 'गुरुद्वारा', 'संग्रहालय', 'डाकघर', 'नाई', 'पंचर', 'साइकिल', 'रिक्शा', 'गली', 'चौक', 'नगर पालिका', 'जल'],
    ['Երևան', 'փողոց', 'շուկա', 'դպրոց', 'ելք', 'զգույշ', 'կանգ', 'ռեստորան', 'հյուրանոց', 'բանկ', 'դեղատուն', 'ոստիկանություն', 'բարի գալուստ', 'Գյումրի', 'լավաշ', 'կայարան',
      'Վանաձոր', 'Դիլիջան', 'Սևան', 'Գորիս', 'Ջերմուկ', 'Էջմիածին', 'Արարատ', 'մուտք', 'զուգարան', 'սրճարան', 'հիվանդանոց', 'համալսարան', 'օդանավակայան', 'կանգառ', 'ավտոկայանատեղի', 'կայանելն արգելված է', 'խորոված', 'դոլմա', 'թան', 'կոնյակ', 'հացատուն', 'մսավաճառ', 'եկեղեցի', 'թանգարան', 'թատրոն', 'փոստ', 'վարսավիրանոց', 'անվադող', 'պողոտա', 'հրապարակ', 'դպրոց թիվ 5', 'մանկապարտեզ'],
    ENGLISH,
    ['Ausfahrt', 'Bäckerei', 'Achtung', 'Bahnhof', 'Schule', 'Markt', 'Apotheke', 'Einbahnstraße', 'Halt', 'Willkommen', 'Rathaus', 'Gasthaus', 'Metzgerei', 'Parkverbot', 'Polizei', 'Tankstelle', 'Biergarten', 'Umleitung', 'Vorsicht', 'Schnitzel', 'Kindergarten', 'Wurst',
      'Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Nürnberg', 'Bremen', 'Wien', 'Zürich', 'Hauptstraße', 'Bahnhofstraße', 'Kirchgasse', 'Am Markt', 'Dorfplatz', 'Einfahrt', 'Ausgang', 'Eingang', 'Toilette', 'Krankenhaus', 'Universität', 'Flughafen', 'Haltestelle', 'Parkplatz', 'Fußgängerzone', 'Sackgasse', 'Baustelle', 'Spielstraße', 'Anlieger frei', 'Zone 30', 'Feuerwehr', 'Sparkasse', 'Volksbank', 'Friseur', 'Fahrschule', 'Imbiss', 'Döner', 'Currywurst', 'Brezel', 'Konditorei', 'Eisdiele', 'Weinstube', 'Brauerei', 'Bierstube', 'Kirche', 'Friedhof', 'Museum', 'Schwimmbad', 'Sporthalle', 'Gemeinde', 'Landkreis', 'Autobahn', 'Radweg', 'Wanderweg', 'Bushaltestelle', 'Zahnarzt', 'Reifen', 'Autohaus', 'Werkstatt', 'Blumen', 'Getränkemarkt', 'Postfiliale', 'Bürgeramt', 'Freibad', 'Schloss', 'Burg', 'Zum Hirschen', 'Zum Löwen', 'Gasthof Adler'],
    ['Salida', 'Panadería', 'Cuidado', 'Escuela', 'Mercado', 'Farmacia', 'Playa', 'Alto', 'Calle', 'Bienvenidos', 'Ayuntamiento', 'Carnicería', 'Prohibido aparcar', 'Policía', 'Gasolinera', 'Desvío', 'Peligro', 'Churros', 'Cerveza', 'Iglesia', 'Estación',
      'Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Granada', 'Zaragoza', 'Ciudad de México', 'Buenos Aires', 'Bogotá', 'Lima', 'Santiago', 'Quito', 'La Paz', 'Montevideo', 'Calle Mayor', 'Avenida', 'Plaza', 'Paseo', 'Carretera', 'Entrada', 'Baños', 'Bar', 'Cafetería', 'Hospital', 'Universidad', 'Aeropuerto', 'Parada', 'Aparcamiento', 'Estacionamiento', 'Ceda el paso', 'Despacio', 'Obras', 'Zona escolar', 'Bomberos', 'Banco', 'Caja', 'Peluquería', 'Autoescuela', 'Tapas', 'Paella', 'Tortilla', 'Jamón', 'Bodega', 'Frutería', 'Pescadería', 'Ferretería', 'Papelería', 'Museo', 'Piscina', 'Polideportivo', 'Cementerio', 'Correos', 'Taller', 'Neumáticos', 'Llantas', 'Farmacia de guardia', 'Se vende', 'Se alquila', 'Abierto', 'Cerrado', 'Rebajas', 'Empanadas', 'Arepas', 'Tacos', 'Ceviche'],
    ['Sortie', 'Boulangerie', 'Attention', 'École', 'Marché', 'Pharmacie', 'Gare', 'Arrêt', 'Rue', 'Bienvenue', 'Mairie', 'Boucherie', 'Stationnement interdit', 'Police', 'Tabac', 'Déviation', 'Danger', 'Croissant', 'Fromage', 'Église', 'Plage',
      'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Lille', 'Strasbourg', 'Nice', 'Montpellier', 'Bruxelles', 'Genève', 'Montréal', 'Québec', 'Dakar', 'Abidjan', 'Rue de la Gare', 'Grande Rue', 'Place de la Mairie', 'Avenue', 'Route de', 'Chemin', 'Impasse', 'Entrée', 'Toilettes', 'Café', 'Brasserie', 'Hôpital', 'Université', 'Aéroport', 'Parking', 'Cédez le passage', 'Ralentir', 'Travaux', 'Zone 30', 'Pompiers', 'Banque', 'Crédit Agricole', 'Coiffeur', 'Auto-école', 'Pâtisserie', 'Charcuterie', 'Fromagerie', 'Poissonnerie', 'Épicerie', 'Cave', 'Baguette', 'Crêperie', 'Pain', 'Vin', 'Musée', 'Piscine', 'Gymnase', 'Cimetière', 'La Poste', 'Garage', 'Pneus', 'Fleuriste', 'Librairie', 'Presse', 'À vendre', 'À louer', 'Ouvert', 'Fermé', 'Soldes', 'Salle des fêtes', 'Camping', 'Château', 'Abbaye', 'Office de tourisme'],
    'galactic',
  ];
  const GALACTIC_INDEX = WORDS.length - 1;

  // Minecraft's enchanting-table letters as strokes on a 10x10 grid (a single point is a dot).
  const GALACTIC = [
    [[[1,3],[9,3]],[[1,3],[1,6]],[[9,3],[9,9]]],          // ᔑ
    [[[3,1],[3,9],[7,9],[7,6]]],                          // ʖ
    [[[8,2],[2,2],[2,9],[8,9]]],                          // ᓵ
    [[[2,8],[2,2],[8,2]],[[2,2],[8,8]]],                  // ↸
    [[[2,2],[8,2],[8,9]],[[2,5],[8,5]]],                  // ᒷ
    [[[2,3],[8,3]],[[2,7],[8,7]],[[5,5]]],                // ⎓
    [[[9,1],[9,9]],[[2,5],[9,5]]],                        // ⊣
    [[[2,3],[8,3]],[[5,3],[5,9]],[[5,1]]],                // ⍑
    [[[5,1],[5,4]],[[5,6],[5,9]]],                        // ╎
    [[[5,2]],[[5,5]],[[5,8]]],                            // ⋮
    [[[2,9],[2,2],[8,2]],[[5,2],[5,6]]],                  // ꖌ
    [[[2,1],[2,9],[8,9]],[[5,5],[8,5]]],                  // ꖎ
    [[[2,9],[2,2],[8,2],[8,5]]],                          // ᒲ
    [[[2,2],[2,6]],[[8,1],[8,9],[5,9]]],                  // リ
    [[[2,2],[8,2]],[[6,2],[6,9],[3,9]]],                  // 𝙹
    [[[3,1],[3,6]],[[3,9]],[[7,1]],[[7,4],[7,9]]],        // !¡
    [[[2,2],[8,2],[8,9]],[[2,6],[8,6]]],                  // ᑑ
    [[[3,3]],[[7,3]],[[3,7]],[[7,7]]],                    // ∷
    [[[2,2],[8,2],[8,5],[2,5],[2,9],[8,9]]],              // ᓭ
    [[[2,2],[8,2],[8,9]],[[5,9]]],                        // ℸ
    [[[3,1],[3,9]],[[7,1],[7,9]],[[5,3]],[[5,7]]],        // ⚍
    [[[2,9],[8,9]],[[5,9],[5,3]],[[5,1]]],                // ⍊
    [[[5,2]],[[2,8]],[[8,8]]],                            // ∴
    [[[3,1],[3,9]],[[7,1],[7,9]]],                        // ||
    [[[2,9],[2,2],[8,2],[8,9]]],                          // ⨅
  ];
  function drawGalactic(g, b, rand = Math.random) {
    const h = b.h * 0.72, adv = h * 0.62, gap = h * 0.16;
    const n = Math.max(1, Math.floor((b.w - 2) / adv));
    const x0 = b.x + (b.w - n * adv + gap) / 2, y0 = b.y + (b.h - h) / 2;
    g.lineWidth = Math.max(1, h * 0.11);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    for (let i = 0; i < n; i++) {
      const glyph = GALACTIC[Math.floor(rand() * GALACTIC.length)];
      const gx = x0 + i * adv, s = (adv - gap) / 10;
      for (const line of glyph) {
        if (line.length === 1) { g.beginPath(); g.arc(gx + line[0][0] * s, y0 + line[0][1] * (h / 10), g.lineWidth * 0.7, 0, 7); g.fill(); continue; }
        g.beginPath();
        line.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, gx + x * s, y0 + y * (h / 10)));
        g.stroke();
      }
    }
  }

  // Randomness seeded on a sign's place in the panorama, so it reads the same at every zoom.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function boxSeed(k, raw, W) {
    if (!k) return hash(`${raw.cx | 0},${raw.cy | 0}`);
    const scale = 1 / (W * 2 ** k.z) * 4096;
    return hash(`${k.pano}:${Math.round((k.x * W + raw.cx) * scale)}:${Math.round((k.y * W + raw.cy) * scale)}`);
  }

  let active = null;                          // cfg while the script is on
  const stats = { seen: 0, edited: 0, boxes: 0, failed: 0, detectMs: 0, detected: 0, paths: {} };
  ggs.lyingSigns = { stats };

  // ---- detector worker ----
  let worker = null, workerReady = null, nextId = 0;
  const waiting = new Map();                  // id -> resolve
  function detector() {
    if (workerReady) return workerReady;
    workerReady = (async () => {
      if (!ggs.extBase) throw new Error('extension base URL not known yet');
      const u = f => ggs.extBase + VENDOR + f;
      const blobUrl = async (url, type) => URL.createObjectURL(new Blob([await (await fetch(url)).arrayBuffer()], { type }));
      const [src, ort, mjs, wasm, model] = await Promise.all([
        fetch(ggs.extBase + 'src/scripts/lying-signs/worker.js').then(r => r.text()),
        blobUrl(u('ort.webgpu.min.js'), 'text/javascript'),
        blobUrl(u('ort-wasm-simd-threaded.asyncify.mjs'), 'text/javascript'),
        blobUrl(u('ort-wasm-simd-threaded.asyncify.wasm'), 'application/wasm'),
        fetch(u('ch_PP-OCRv4_det.onnx')).then(r => r.arrayBuffer()),
      ]);
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'boxes') { stats.detected++; stats.detectMs += m.ms; waiting.get(m.id)?.(m.boxes); waiting.delete(m.id); }
        else if (m.type === 'error') { stats.failed++; ggs.log('lying-signs: detector error', m.message); waiting.get(m.id)?.(null); waiting.delete(m.id); }
      };
      const backend = await new Promise((res, rej) => {
        const onmsg = e => { if (e.data.type === 'ready') { worker.removeEventListener('message', onmsg); res(e.data.backend); } else if (e.data.type === 'error') rej(new Error(e.data.message)); };
        worker.addEventListener('message', onmsg);
        worker.postMessage({ type: 'init', ort, mjs, wasm, model }, [model]);
      });
      stats.backend = backend;
      ggs.debug(`lying-signs: text detector ready (${backend})`);
    })();
    workerReady.catch(err => { ggs.log('lying-signs: text detector failed to load', err); workerReady = null; });
    return workerReady;
  }
  // Detection queue: the tile nearest to where you're looking first. A queued tile whose
  // textures are gone or overwritten (pano changed) is dropped unrun, tiles of panoramas
  // no longer shown are dropped as soon as the panorama moves on, and the queue is capped
  // so moving quickly never builds a backlog (a dropped tile is detected again if it is
  // uploaded again).
  const queue = [];                           // [{ img, cfg, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2, MAX_QUEUE = 300;
  ggs.lyingSigns.debug = () => ({ queue: queue.length, inflight, waiting: waiting.size, tiles: tiles.size });
  function detect(img, cfg, alive, url) {
    return new Promise(res => {
      queue.push({ img, cfg, res, alive, url });
      while (queue.length > MAX_QUEUE) { stats.skipped = (stats.skipped || 0) + 1; queue.shift().res(null); }
      pump();
    });
  }
  function pruneQueue() {
    const shown = new Set();
    for (const p of panos) { try { shown.add(p.getPano()); } catch {} }
    for (let i = queue.length - 1; i >= 0; i--) {
      const id = ggs.tileKey(queue[i].url)?.pano;
      if (id && !shown.has(id)) { stats.skipped = (stats.skipped || 0) + 1; queue.splice(i, 1)[0].res(null); }
    }
  }
  function tileDistance(url) {
    const k = ggs.tileKey(url);
    if (!k) return null;
    const { pano: id, x, y, z } = k;
    for (const p of panos) {
      let pov, centre;
      try { if (p.getPano() !== id) continue; pov = p.getPov(); centre = p.getPhotographerPov?.()?.heading; } catch { continue; }
      if (!pov || centre == null) return null;
      const cols = 2 ** z, rows = Math.max(1, 2 ** (z - 1));
      const heading = centre + ((+x + 0.5) / cols - 0.5) * 360;
      const pitch = (0.5 - (+y + 0.5) / rows) * 180;
      const dh = Math.abs(((heading - pov.heading) % 360 + 540) % 360 - 180);
      return Math.hypot(dh * Math.cos(pov.pitch * Math.PI / 180), pitch - pov.pitch);
    }
    return null;
  }
  function pickJob() {
    let best = queue.length - 1, bestD = Infinity;
    for (let i = queue.length - 1; i >= 0; i--) {
      const d = tileDistance(queue[i].url);
      if (d === null) break;                  // no view info: newest first
      if (d < bestD) { bestD = d; best = i; }
    }
    return queue.splice(best, 1)[0];
  }
  async function pump() {
    if (inflight >= MAX_INFLIGHT || !queue.length) return;
    inflight++;
    try {
      await detector();
      const job = pickJob();
      if (!job.alive()) { stats.skipped = (stats.skipped || 0) + 1; job.res(null); return; }
      const bitmap = await createImageBitmap(job.img);
      const boxes = await new Promise(r => {
        const id = ++nextId;
        waiting.set(id, r);
        worker.postMessage({ type: 'detect', id, bitmap, size: DET_SIZE, thresh: 0.25, boxThresh: 0.45 }, [bitmap]);
      });
      job.res(boxes);
    } catch (err) {
      stats.failed++;
      for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length) pump();
    }
  }

  // ---- tiles ----
  const tiles = new Map();                    // url -> { boxes, cfg, canvas, pending: [upload records] }
  const grid = new Map();                     // "pano/zoom/x/y" -> same entry, for finding a tile's children
  const gridKey = ggs.tileKey;

  // Zooming out: a parent tile is assembled from its four edited children (or grandchildren).
  function childCanvas(k, depth) {
    const t = grid.get(`${k.pano}/${k.z}/${k.x}/${k.y}`);
    if (t?.canvas) return t.canvas;
    if (depth === 0) return null;
    const parts = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = childCanvas({ pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy }, depth - 1);
      if (!c) return null;
      parts.push([dx, dy, c]);
    }
    const c = new OffscreenCanvas(parts[0][2].width, parts[0][2].height), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for (const [dx, dy, src] of parts) g.drawImage(src, (dx * c.width) / 2, (dy * c.height) / 2, c.width / 2, c.height / 2);
    return c;
  }
  // Zooming in: a detected parent's boxes, scaled into this tile.
  function inheritedBoxes(k, W, H) {
    for (let up = 1; up <= 2; up++) {
      const f = 2 ** up, px = Math.floor(k.x / f), py = Math.floor(k.y / f);
      const t = grid.get(`${k.pano}/${k.z - up}/${px}/${py}`);
      if (!t?.boxes) continue;
      const ox = (k.x - px * f) * (W / f), oy = (k.y - py * f) * (H / f); // this tile's origin in the parent
      const out = [];
      for (const b of t.boxes) {
        const cx = (b.cx - ox) * f, cy = (b.cy - oy) * f, w = b.w * f, h = b.h * f;
        const r = Math.hypot(w, h) / 2;
        if (cx + r < 0 || cy + r < 0 || cx - r > W || cy - r > H) continue;
        out.push({ ...b, cx, cy, w, h, mask: { ...b.mask, x: (b.mask.x - ox) * f, y: (b.mask.y - oy) * f, w: b.mask.w * f, h: b.mask.h * f } });
      }
      return out;
    }
    return null;
  }
  // Draws whichever edited children exist onto `canvas`; true if all four were there.
  function overlayChildren(canvas, k) {
    if (!k) return false;
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    let n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = childCanvas({ pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy }, 1);
      if (!c) continue;
      g.drawImage(c, (dx * canvas.width) / 2, (dy * canvas.height) / 2, canvas.width / 2, canvas.height / 2);
      n++;
    }
    return n === 4;
  }
  // What goes into WebGL now for this tile: the edit if known, otherwise a blur while the
  // detector works. Skips tiles another script already swapped for a canvas.
  ggs.tiles.filter((rec, img) => {
    if (!active || !(img instanceof HTMLImageElement)) return img;
    const url = rec.url;
    stats.paths.gl = (stats.paths.gl || 0) + 1;
    let t = tiles.get(url);
    if (t && t.cfg !== active) { t.canvas = null; t.cfg = active; if (t.boxes) t.canvas = editSync(img, t.boxes, active, t.key); }
    if (t?.canvas) return t.canvas;
    const k = gridKey(url);
    if (!t) {
      t = { boxes: null, cfg: active, canvas: null, pending: [], key: k };
      tiles.set(url, t);
      if (k) grid.set(`${k.pano}/${k.z}/${k.x}/${k.y}`, t);
      if (tiles.size > 800) { const [oldUrl, old] = tiles.entries().next().value; tiles.delete(oldUrl); if (old.key) grid.delete(`${old.key.pano}/${old.key.z}/${old.key.x}/${old.key.y}`); }
      stats.seen++;
      // all four children already edited: assemble, no detection needed
      const fromKids = k && childCanvas(k, 2);
      if (fromKids && fromKids !== t.canvas) { t.canvas = fromKids; t.boxes = []; stats.assembled = (stats.assembled || 0) + 1; return t.canvas; }
      // parent already detected: its boxes now, and this zoom's detection adds small text
      const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      const inherited = k && inheritedBoxes(k, W, H);
      if (inherited) { t.inherited = inherited; t.boxes = inherited; t.canvas = editSync(img, inherited, active, k); stats.inherited = (stats.inherited || 0) + 1; }
      const alive = () => t.pending.some(ggs.tiles.live);
      detect(img, active, alive, url).then(boxes => {
        if (!boxes) { if (!t.inherited) tiles.delete(url); t.pending = []; return; } // skipped or failed; a later upload retries
        t.boxes = t.inherited ? merge(t.inherited, boxes) : boxes;
        stats.boxes += boxes.length;
        flush(t, img);
      });
    }
    t.pending.push(rec);
    if (t.canvas) return t.canvas;
    const ph = blurred(img);
    overlayChildren(ph, k);
    return ph;
  }, 1);
  // Inherited boxes win; a detected box is added only if it isn't over one of them.
  function merge(inherited, detected) {
    const out = inherited.slice();
    for (const b of detected) {
      const hit = inherited.some(i => Math.abs(b.cx - i.cx) < (b.w + i.w) / 2 && Math.abs(b.cy - i.cy) < (b.h + i.h) / 2);
      if (!hit) out.push(b);
    }
    return out;
  }

  // Boxes are in: edit the tile and push it into every texture it went to.
  function flush(t, img) {
    if (!active) { t.pending = []; return; }
    t.cfg = active;
    t.canvas = editSync(img, t.boxes, active, t.key);
    overlayChildren(t.canvas, t.key);
    for (const r of t.pending) {
      try { if (ggs.tiles.upload(r, t.canvas)) stats.edited++; }
      catch (err) { stats.failed++; if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err); }
    }
    t.pending = [];
  }


  // ---- the edits ----
  // Placeholder while the detector works: the tile at 1/10 size, scaled back up.
  function blurred(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const small = new OffscreenCanvas(Math.max(1, W / 10 | 0), Math.max(1, H / 10 | 0));
    small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    return c;
  }

  // Edits a tile with the detector's boxes; returns an OffscreenCanvas.
  function editSync(src, boxes, cfg, key) {
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    nadir(g, key, W, H);
    for (const raw of boxes) {
      if (raw.h < 4 || raw.w < 4) continue;
      const rand = rng(boxSeed(key, raw, W));
      let script = cfg.script | 0;
      if (!WORDS[script]) script = 0;
      if (script === 0) script = 1 + hash('script:' + (key?.pano || '')) % (WORDS.length - 1); // one script per panorama
      const list = WORDS[script];
      const pick = list === 'galactic' ? null : () => list[Math.floor(rand() * list.length)];
      try { replaceBox(g, src, raw, script, pick, rand); } catch (err) { stats.failed++; if (stats.failed < 4) ggs.log('lying-signs: box failed', err); }
    }
    return c;
  }

  // The bottom of the panorama (the car) is stretched too much for the detector, so
  // everything below NADIR_PITCH is smeared into a coarse mosaic instead.
  const NADIR_PITCH = -68;
  function nadir(g, k, W, H) {
    if (!k) return;
    const rows = Math.max(1, 2 ** (k.z - 1));
    const top = Math.max(0, ((90 - NADIR_PITCH) / 180 * rows - k.y) * H); // tile y where the cap starts
    if (top >= H) return;
    const band = H - top, fade = Math.min(10, band);
    const small = new OffscreenCanvas(Math.max(1, W / 16 | 0), Math.max(1, band / 16 | 0));
    small.getContext('2d').drawImage(g.canvas, 0, top, W, band, 0, 0, small.width, small.height);
    const layer = new OffscreenCanvas(W, band), l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    l.drawImage(small, 0, 0, W, band);
    const grad = l.createLinearGradient(0, 0, 0, fade);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in';
    l.fillStyle = grad; l.fillRect(0, 0, W, fade);
    l.fillStyle = '#000'; l.fillRect(0, fade, W, band - fade);
    g.drawImage(layer, 0, top);
    stats.nadir = (stats.nadir || 0) + 1;
  }

  function replaceBox(g, src, raw, script, pick, rand) {
    const p = raw.h * 0.12;                  // the detector's box hugs the strokes; give them room
    const bw = Math.ceil(raw.w + 2 * p), bh = Math.ceil(raw.h + 2 * p);
    const feather = Math.max(3, Math.min(12, Math.round(bh * 0.35)));
    const ring = Math.max(3, Math.round(bh * 0.25)), gap = 2;
    const pad = gap + ring + feather + 2;
    const tw = bw + 2 * pad, th = bh + 2 * pad;
    const box = { x: pad, y: pad, w: bw, h: bh };
    // the tile, rotated so this text runs level; outside the tile stays transparent
    const temp = new OffscreenCanvas(tw, th), t = temp.getContext('2d', { willReadFrequently: true });
    const toLevel = ctx => { ctx.translate(tw / 2, th / 2); ctx.rotate(-raw.angle); ctx.translate(-raw.cx, -raw.cy); };
    t.save(); toLevel(t); t.drawImage(src, 0, 0); t.restore();

    const { bg, fg, contrast } = colours(t, box, tw, th);
    if (contrast < MIN_CONTRAST) { stats.lowContrast = (stats.lowContrast || 0) + 1; return; } // clouds, brickwork, foliage: not text
    const layer = edgeFill(t, box, bg, tw, th, gap, ring, feather);

    // new text, on its own layer (its shape also goes into the mask)
    const text = new OffscreenCanvas(tw, th), x = text.getContext('2d');
    x.fillStyle = `rgb(${fg.join(',')})`;
    if (script === GALACTIC_INDEX) drawGalactic(x, box, rand);
    else {
      const word = pick();
      let size = Math.max(5, Math.floor(box.h)), m;
      const fits = () => { x.font = `bold ${size}px sans-serif`; m = x.measureText(word); return m.width <= box.w - 2 && m.actualBoundingBoxAscent + m.actualBoundingBoxDescent <= box.h - 2; };
      while (!fits() && size > 5) size--;
      const glyphH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      x.fillText(word, box.x + (box.w - m.width) / 2, box.y + (box.h - glyphH) / 2 + m.actualBoundingBoxAscent);
    }
    layer.getContext('2d').drawImage(text, 0, 0);

    // mask: the old text's blob (from the detector) and the new glyphs, both grown so
    // every stroke is covered, then feathered a long way out
    const mask = new OffscreenCanvas(tw, th), mk = mask.getContext('2d', { willReadFrequently: true });
    const old = raw.mask;
    const small = new OffscreenCanvas(old.cols, old.rows), sd = new ImageData(old.cols, old.rows);
    for (let i = 0; i < old.data.length; i++) sd.data[i * 4 + 3] = old.data[i] ? 255 : 0;
    small.getContext('2d').putImageData(sd, 0, 0);
    mk.save(); toLevel(mk);
    mk.filter = `blur(${Math.max(2, bh * 0.22)}px)`;
    mk.drawImage(small, old.x, old.y, old.w, old.h);
    mk.restore();
    mk.filter = `blur(${Math.max(1.5, bh * 0.08)}px)`;
    mk.drawImage(text, 0, 0);
    mk.filter = 'none';
    // grown blobs become solid where there's any coverage, then the edge is feathered
    const md = mk.getImageData(0, 0, tw, th), core = new Uint8ClampedArray(md.data.length);
    for (let i = 3; i < md.data.length; i += 4) core[i] = md.data[i] > 20 ? 255 : 0;
    mk.putImageData(new ImageData(core, tw, th), 0, 0);
    const soft = new OffscreenCanvas(tw, th), sf = soft.getContext('2d', { willReadFrequently: true });
    sf.filter = `blur(${feather / 2}px)`;
    sf.drawImage(mask, 0, 0);
    const fd = sf.getImageData(0, 0, tw, th);
    // ...but never past the sign: everything is confined to a soft rounded region a
    // little larger than the box, so the fill can't spill onto whatever is behind it
    const lim = new OffscreenCanvas(tw, th), lc = lim.getContext('2d', { willReadFrequently: true });
    const grow = Math.max(2, bh * 0.15);
    lc.filter = `blur(${Math.max(1.5, bh * 0.08)}px)`;
    lc.fillStyle = '#000';
    lc.beginPath();
    lc.roundRect(box.x - grow, box.y - grow, box.w + 2 * grow, box.h + 2 * grow, Math.min(box.w, box.h) * 0.45);
    lc.fill();
    const ld = lc.getImageData(0, 0, tw, th).data;
    for (let i = 3; i < fd.data.length; i += 4) fd.data[i] = ((core[i] ? 255 : fd.data[i]) * ld[i]) / 255;
    sf.putImageData(fd, 0, 0);

    const l = layer.getContext('2d');
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(soft, 0, 0);

    g.save();
    g.translate(raw.cx, raw.cy); g.rotate(raw.angle);
    g.drawImage(layer, -tw / 2, -th / 2);
    g.restore();
  }

  // Fill for the box from the pixels just outside it: each pixel a distance-weighted mix
  // of the smoothed border colours, so lighting gradients carry across; the border's own
  // noise is added back as grain.
  function edgeFill(t, b, bg, w, h, gap, ring, feather) {
    const d = t.getImageData(0, 0, w, h).data;
    const sample = (xa, xb, ya, yb) => {
      xa = Math.max(0, xa); ya = Math.max(0, ya); xb = Math.min(w, xb); yb = Math.min(h, yb);
      const c = [0, 0, 0]; let n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 200) continue; c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; n++; }
      if (!n) return null;
      const v = [c[0] / n, c[1] / n, c[2] / n];
      return Math.abs(v[0] - bg[0]) + Math.abs(v[1] - bg[1]) + Math.abs(v[2] - bg[2]) < 90 ? v : null; // a different surface: ignore
    };
    const smooth = arr => arr.map((_, i) => {
      const c = [0, 0, 0]; let n = 0;
      for (let k = -3; k <= 3; k++) { const v = arr[i + k]; if (v) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; n++; } }
      return n ? [c[0] / n, c[1] / n, c[2] / n] : null;
    });
    const L = smooth(Array.from({ length: b.h }, (_, y) => sample(b.x - gap - ring, b.x - gap, b.y + y, b.y + y + 1)));
    const R = smooth(Array.from({ length: b.h }, (_, y) => sample(b.x + b.w + gap, b.x + b.w + gap + ring, b.y + y, b.y + y + 1)));
    const T = smooth(Array.from({ length: b.w }, (_, x) => sample(b.x + x, b.x + x + 1, b.y - gap - ring, b.y - gap)));
    const B = smooth(Array.from({ length: b.w }, (_, x) => sample(b.x + x, b.x + x + 1, b.y + b.h + gap, b.y + b.h + gap + ring)));
    let dev = 0, dn = 0;
    for (const arr of [L, R, T, B]) for (const v of arr) if (v) { dev += Math.abs(v[0] - bg[0]) + Math.abs(v[1] - bg[1]) + Math.abs(v[2] - bg[2]); dn++; }
    const grain = dn ? Math.min(6, dev / dn / 3) : 0;
    const fill = new ImageData(w, h), f = fill.data;
    const pad = gap + ring + feather + 2;
    for (let y = Math.max(0, b.y - pad); y < Math.min(h, b.y + b.h + pad); y++) {
      for (let x = Math.max(0, b.x - pad); x < Math.min(w, b.x + b.w + pad); x++) {
        const yy = Math.min(b.h - 1, Math.max(0, y - b.y)), xx = Math.min(b.w - 1, Math.max(0, x - b.x));
        const parts = [[L[yy], x - b.x + gap + 1], [R[yy], b.x + b.w + gap - x], [T[xx], y - b.y + gap + 1], [B[xx], b.y + b.h + gap - y]];
        const c = [0, 0, 0]; let ws = 0;
        for (const [v, dist] of parts) { if (!v) continue; const wgt = 1 / Math.max(1, dist); c[0] += v[0] * wgt; c[1] += v[1] * wgt; c[2] += v[2] * wgt; ws += wgt; }
        const i = (y * w + x) * 4, n = (Math.random() - 0.5) * 2 * grain;
        if (ws) { f[i] = c[0] / ws + n; f[i + 1] = c[1] / ws + n; f[i + 2] = c[2] / ws + n; }
        else { f[i] = bg[0] + n; f[i + 1] = bg[1] + n; f[i + 2] = bg[2] + n; }
        f[i + 3] = d[i + 3] < 200 ? 0 : 255;   // nothing outside the tile
      }
    }
    const layer = new OffscreenCanvas(w, h);
    layer.getContext('2d').putImageData(fill, 0, 0);
    return layer;
  }

  // Sign colour: the dominant colour inside the box. Text colour: the pixels that differ most from it.
  function colours(g, b, W, H) {
    const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(W, b.x + b.w), y1 = Math.min(H, b.y + b.h);
    const w = x1 - x0, h = y1 - y0, d = g.getImageData(x0, y0, w, h).data;
    const bins = new Map();                   // 32-level colour cube -> [count, r, g, b]
    const inner = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      inner.push(i);
      const k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5);
      const e = bins.get(k) || [0, 0, 0, 0];
      e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2];
      bins.set(k, e);
    }
    if (!inner.length) return { bg: [128, 128, 128], fg: [255, 255, 255], contrast: 0 };
    let best = null;
    for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
    const bg = [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round);
    inner.sort((a, c) => dist(d, c, bg) - dist(d, a, bg));
    const top = inner.slice(0, Math.max(1, inner.length / 8 | 0));
    const fg = [0, 0, 0];
    for (const i of top) { fg[0] += d[i]; fg[1] += d[i + 1]; fg[2] += d[i + 2]; }
    for (let k = 0; k < 3; k++) fg[k] = Math.round(fg[k] / top.length);
    const contrast = dist(d, top[Math.floor(top.length / 2)], bg); // typical text pixel vs the sign colour
    return { bg, fg, contrast };
  }
  function dist(d, i, c) { return Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]); }

  // which way you're looking, for the queue order
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => {
    panos.add(p);
    if (active?.noZoom) lockZoom(p);
    try { p.addListener('pano_changed', pruneQueue); } catch {}
  });

  // "Disable zoom": the wheel and zoom buttons are switched off on every panorama and any zoom
  // that still gets through (GeoGuessr's own buttons and keys call setZoom) is put straight back
  // to the level it was at, so signs are only ever read at the zoom the tiles were drawn for.
  const locks = new Map(); // pano -> { listener, options to restore }
  function lockZoom(p) {
    if (locks.has(p)) return;
    const ev = window.google?.maps?.event;
    if (!ev) return;
    const was = { scrollwheel: p.get('scrollwheel'), zoomControl: p.get('zoomControl') };
    const zoom = p.getZoom();
    const listener = ev.addListener(p, 'zoom_changed', () => { if (p.getZoom() !== zoom) p.setZoom(zoom); });
    p.setOptions({ scrollwheel: false, zoomControl: false });
    locks.set(p, { listener, was });
  }
  function unlockZoom() {
    for (const [p, { listener, was }] of locks) { listener.remove(); p.setOptions(was); }
    locks.clear();
  }
  function applyZoom() { if (active?.noZoom) panos.forEach(lockZoom); else unlockZoom(); }

  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    detector();
    ggs.tiles.replay();
    applyZoom();
    return {
      stop() { active = null; unlockZoom(); ggs.tiles.replay(); },
      update(next) { const changed = next.script !== active.script; active = next; applyZoom(); if (changed) ggs.tiles.replay(); },
    };
  }
  ggs.scripts['lying-signs'] = { start };
})();

// ==================== src/scripts/minecraft/meta.js ===============================
(() => {
  const ggs = globalThis.__ggs;
  ggs.registry.push({
    id: 'minecraft',
    name: 'Minecraft world',
    description: 'The round is redrawn in Minecraft.',
    defaultEnabled: false,
    options: [
      { key: 'hq', label: 'High quality (slower; a few rounds a day)', type: 'checkbox', default: false },
      { key: 'code', label: 'Code', type: 'text', default: '', placeholder: 'optional', secret: true, hidden: true },
    ],
  });
})();

// ==================== src/scripts/minecraft/main.js ===============================
// Minecraft world: each panorama is redrawn once, by server/minecraft.php, and wrapped
// back over the Street View sphere.
//
// Street View tiles arrive through ggs.tiles (core/tiles.js). The first tile of a new
// panorama starts one generation: the panorama id and size go to SERVER, which fetches
// the tiles from Google, stitches them and calls the image API with the key it holds.
// Nothing but that id, the size, a random per-install client id and the optional code
// leaves the page. Until the picture is back, tiles go up black; then every tile is
// swapped for the matching crop, so looking around and zooming never generate again.
// Generation waits until the panorama has stayed still for a moment, so walking through
// several positions only redraws the one you stop at; the ones passed through get their
// real tiles back.
(() => {
  const ggs = globalThis.__ggs;
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php'; // holds the prompt, models and daily limits

  function clientId() {
    let id = ggs.store.get('ggs-client');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      ggs.store.set('ggs-client', id);
    }
    return id;
  }
  async function server(fields, post = false) {
    const body = new URLSearchParams({ ...fields, client: clientId(), code: active?.code ?? '' });
    const r = post ? await fetch(SERVER, { method: 'POST', body }) : await fetch(`${SERVER}?caps=1&${body}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `server HTTP ${r.status}`);
    return j;
  }

  // Typical seconds per generation, from the last rounds; drives the loading bar.
  const ETA_DEFAULT = { normal: 15, hq: 40 };
  const eta = ggs.store.get('ggs-minecraft-eta', {});

  // panoId -> Promise<{ worldWidth, tileWidth, zmax }> (metaSync: the resolved value)
  const meta = new Map(), metaSync = new Map();
  function panoMeta(id) {
    if (!meta.has(id)) meta.set(id, new window.google.maps.StreetViewService().getPanorama({ pano: id })
      .then(({ data }) => {
        const worldWidth = data.tiles.worldSize.width, tileWidth = data.tiles.tileSize.width;
        const m = { worldWidth, tileWidth, zmax: Math.ceil(Math.log2(worldWidth / tileWidth)) };
        metaSync.set(id, m);
        return m;
      }));
    return meta.get(id);
  }
  const widthAt = (m, zoom) => Math.ceil(m.worldWidth / 2 ** (m.zmax - zoom));

  const gens = new Map(); // `${panoId}/${mode}` -> { promise, image, pending: [uploads waiting], error }
  let active = null, overlay = null; // active: the cfg while the script is on
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  function shownPano() {
    for (const p of panos) { try { const id = p.getPano(); if (id) return id; } catch {} }
    return null;
  }

  // Tiles of a panorama that has no generation yet wait here (black on screen) until the
  // view has stayed on one panorama for SETTLE ms; then that panorama is generated and the
  // others get their real tiles back.
  const SETTLE = 800;
  const waitingPanos = new Map(); // panoId -> [{ rec, img, tw, th }]
  let settleTimer = null, latestPano = null;
  function waitFor(id, entry) {
    if (!waitingPanos.has(id)) waitingPanos.set(id, []);
    waitingPanos.get(id).push(entry);
    if (id !== latestPano || !settleTimer) { latestPano = id; clearTimeout(settleTimer); settleTimer = setTimeout(settled, SETTLE); }
  }
  function settled() {
    settleTimer = null;
    const id = shownPano() ?? latestPano;
    for (const [pid, entries] of [...waitingPanos]) {
      waitingPanos.delete(pid);
      if (pid === id && active) {
        const g = generation(pid);
        g.pending.push(...entries);
        if (g.image || g.error) flush(g);
      } else {
        for (const { rec, img } of entries) { try { ggs.tiles.upload(rec, img); } catch {} }
      }
    }
  }

  // ---- daily limits ----
  // The server counts per client id. A copy of its log ({ normal: [ms], hq: [ms] }, rolling
  // 24 h) is kept here so a round isn't started once today's limit is used up; the two are
  // merged on every call.
  const DAY = 24 * 3600 * 1000, QKEY = 'ggs-minecraft-quota';
  const Q = {
    tidy(log, other) {
      const now = Date.now(), out = {};
      for (const k of ['normal', 'hq']) {
        const all = new Set([...(log?.[k] ?? []), ...(other?.[k] ?? [])].filter(t => now - t < DAY));
        out[k] = [...all].sort((a, b) => a - b);
      }
      return out;
    },
    left(log, mode, cap) {
      const l = Q.tidy(log)[mode];
      return { left: Math.max(0, cap - l.length), resetAt: l.length ? l[0] + DAY : null };
    },
    until(at) {
      const m = Math.max(1, Math.ceil((at - Date.now()) / 60000));
      return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    },
  };
  let log = {}, caps = { normal: 100, hq: 10 }, limitShownFor = null;
  function saveLog(other) {
    log = Q.tidy(log, other);
    ggs.store.set(QKEY, log);
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    ggs.status('minecraft', `Today: ${part('rounds', Q.left(log, 'normal', caps.normal))} · ${part('high quality', Q.left(log, 'hq', caps.hq))}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    log = ggs.store.get(QKEY, {});
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      ggs.status('minecraft', 'Server not reachable');
      ggs.debug('minecraft: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  const allowed = mode => Q.left(log, mode, caps[mode]).left > 0;
  const stats = { uploads: 0, tiles: 0, swapped: 0 };
  ggs.minecraft = { debug: () => ({ active: !!active, tiles: ggs.tiles.count(), ...stats,
    gens: [...gens].map(([id, g]) => ({ id, image: !!g.image, pending: g.pending.length, error: g.error?.message ?? null })) }) };

  function generation(id) {
    const mode = modeOf(active), key = `${id}/${mode}`;
    if (gens.has(key)) return gens.get(key);
    const g = { image: null, pending: [], error: null };
    gens.set(key, g);
    if (gens.size > 20) { const k = gens.keys().next().value; gens.get(k).image?.close?.(); gens.delete(k); }
    const t0 = Date.now();
    (log[mode] ??= []).push(t0); // counted when it starts; the server's log replaces it once it answers
    saveLog();
    g.promise = (async () => {
      progressStart(eta[mode] ?? ETA_DEFAULT[mode], key);
      const m = await panoMeta(id);
      const r = await server({ pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode }, true);
      if (r.log) saveLog(r.log);
      const img = new Image();
      img.src = r.image;
      await img.decode();
      g.image = await createImageBitmap(img);
      ggs.debug(`minecraft: generated ${id} (${mode}) in ${(r.ms / 1000).toFixed(1)} s`);
      await flush(g);
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      eta[mode] = Math.round((Date.now() - t0) / 1000 * 0.7 + (eta[mode] ?? (Date.now() - t0) / 1000) * 0.3);
      ggs.store.set('ggs-minecraft-eta', eta);
      progressDone(false, undefined, key);
    })().catch(err => {
      g.error = err;
      ggs.log('minecraft: generation failed', err);
      progressDone(true, undefined, key);
      flush(g).then(() => ggs.tiles.repaint(id)); // put the real tiles back
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom.
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom), H = Math.ceil(W / 2), img = g.image;
    const sx = (x * tw / W) * img.width, sy = (y * th / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width), sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw * sw / ((tw / W) * img.width), th * sh / ((th / H) * img.height));
    return c;
  }

  // ---- tile filter: what goes into WebGL for each tile ----
  ggs.tiles.filter((rec, source) => {
    stats.uploads++;
    if (!active || !rec.key || !(source instanceof HTMLImageElement)) return source;
    const k = rec.key, img = source;
    stats.tiles++;
    const id = k.pano, mode = modeOf(active);
    if (!gens.has(`${id}/${mode}`) && !allowed(mode)) {
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, mode, caps[mode]);
        notice(`${active.hq ? 'High quality' : 'Minecraft'} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const g = gens.get(`${id}/${mode}`);
    if (!g) { waitFor(id, { rec, img, tw, th }); return blank(tw, th); }
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, k.x, k.y, k.z, tw, th);
    if (g.error) return img;
    g.pending.push({ rec, img, tw, th });
    return blank(tw, th);
  }, 0); // before lying-signs, which then sees a canvas and leaves it alone

  // The picture is in (or failed): push the crops (or the real tiles) into the textures.
  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = recs[0].rec.key.pano;
    const m = g.image ? await panoMeta(id).catch(() => null) : null;
    for (const { rec, img, tw, th } of recs) {
      try {
        const k = rec.key;
        if (ggs.tiles.upload(rec, m ? crop(g, m, k.x, k.y, k.z, tw, th) : img)) stats.swapped++;
      } catch (err) { ggs.log('minecraft: re-upload failed', err); }
    }
  }

  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      blankTile.getContext('2d').fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  // ---- loading bar: eases towards 90% over the last rounds' time, fills when tiles are swapped ----
  const CSS = `
    :host { all: initial; position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2147483000; pointer-events: none;
            opacity: 0; transition: opacity .25s; }
    :host([data-on]) { opacity: 1; }
    .box { width: 300px; padding: 16px 20px; border-radius: 16px; background: rgba(20, 16, 48, .85); backdrop-filter: blur(8px);
           box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6); font: 700 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
           text-align: center; letter-spacing: .02em; }
    .bar[hidden] { display: none; }
    .bar { height: 10px; margin-top: 12px; border-radius: 5px; background: rgba(255, 255, 255, .12); overflow: hidden; }
    .fill { height: 100%; width: 0; border-radius: 5px; background: #fecd19; transition: width .1s linear, background .3s; }
  `;
  // The bar belongs to the latest generation started (`owner`); an older one finishing
  // or failing later leaves it alone.
  let progressTimer = null, owner = null;
  function progressStart(seconds, key) {
    if (!overlay) return;
    owner = key;
    clearInterval(progressTimer);
    const fill = overlay.fill, t0 = Date.now();
    overlay.text.textContent = 'Loading round…';
    overlay.bar.hidden = false;
    fill.style.width = '0%';
    fill.style.background = '';
    overlay.host.dataset.on = '';
    progressTimer = setInterval(() => {
      const x = (Date.now() - t0) / 1000 / seconds;
      fill.style.width = `${Math.min(90, 100 * (1 - Math.exp(-2.3 * x)))}%`;
    }, 100);
  }
  function progressDone(failed, message, key) {
    if (!overlay || (key && key !== owner)) return;
    owner = null;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) { overlay.fill.style.background = '#e03131'; overlay.text.textContent = message ?? 'Could not redraw this round'; }
    setTimeout(() => { if (overlay) delete overlay.host.dataset.on; }, failed ? 4000 : 400);
  }
  function notice(message) {
    if (!overlay) return;
    clearInterval(progressTimer);
    overlay.text.textContent = message;
    overlay.bar.hidden = true;
    overlay.host.dataset.on = '';
    setTimeout(() => { if (overlay) { delete overlay.host.dataset.on; setTimeout(() => { if (overlay) overlay.bar.hidden = false; }, 300); } }, 4000);
  }

  function start(cfg) {
    active = cfg;
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div><div class="bar"><div class="fill"></div></div></div>`;
    document.body.append(host);
    overlay = { host, text: root.querySelector('.text'), bar: root.querySelector('.bar'), fill: root.querySelector('.fill') };
    loadQuota().finally(() => ggs.tiles.replay());
    return {
      stop() { active = null; clearTimeout(settleTimer); settleTimer = null; waitingPanos.clear(); clearInterval(progressTimer); host.remove(); overlay = null; ggs.tiles.replay(); },
      update(c) {
        const codeChanged = c.code !== active?.code, hqChanged = !!c.hq !== !!active?.hq;
        active = c;
        if (codeChanged) loadQuota();
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }

  ggs.scripts.minecraft = { start };
})();

// ==================== src/boot.js =================================================
// Starts and stops each script to match the settings, live. In competitive games
// (ggs.game.competitive) every script is stopped, whatever the settings say.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null, blocked = false, path = null, check = 0;

  function apply() {
    if (!settings) return;
    for (const meta of ggs.registry) {
      const impl = ggs.scripts[meta.id];
      if (!impl) { ggs.log(`no implementation loaded for "${meta.id}"`); continue; }
      const cfg = ggs.config(meta, settings);
      const on = cfg.enabled && !blocked;
      const inst = running.get(meta.id);
      try {
        if (on && !inst) {
          running.set(meta.id, impl.start(cfg));
          ggs.debug(`started ${meta.id}`);
        } else if (!on && inst) {
          inst.stop();
          running.delete(meta.id);
          ggs.debug(`stopped ${meta.id}`);
        } else if (inst) {
          inst.update?.(cfg);
        }
      } catch (err) {
        ggs.log(`${meta.id} failed`, err);
      }
    }
  }

  // Single-page app, so watch the path. A game that might be competitive is blocked at
  // once and only unblocked when the check says it's friendly.
  function onPath() {
    if (location.pathname === path) return;
    path = location.pathname;
    ggs.game.noteLobby(path);
    const ctx = ggs.game.context();
    const maybe = ctx && ctx.mode !== 'standard' && ctx.mode !== 'challenge';
    if (maybe && !blocked) { blocked = true; apply(); }
    const id = ++check;
    ggs.game.competitive().then(({ competitive, why }) => {
      if (id !== check) return;
      if (competitive || maybe) ggs.debug(competitive ? 'competitive game: all scripts off' : 'friendly game: scripts on', why);
      if (competitive !== blocked) { blocked = competitive; apply(); }
    });
  }
  setInterval(onPath, 500);

  ggs.onSettings(all => {
    settings = all;
    onPath();
    apply();
  });
})();
