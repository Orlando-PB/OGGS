// ==UserScript==
// @name         OGGS - Orlando's GeoGuessr Scripts
// @namespace    https://github.com/Orlando-PB/OGGS
// @version      1.4.0
// @description  A collection of fun GeoGuessr extension scripts. Made by Orlando with love.
// @author       Orlando
// @homepageURL  https://github.com/Orlando-PB/OGGS
// @icon         https://oggs.orlandopb.com/icon-128.png
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://oggs.orlandopb.com/oggs.user.js
// @downloadURL  https://oggs.orlandopb.com/oggs.user.js
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
// Userscript stand-in for the extension's bridge.js and popup. Settings live in this
// site's localStorage and reach the scripts through the same postMessage the extension
// uses, so every file after this one is identical to the extension's. The board and the
// text detector, which the extension carries as files, are loaded from BASE instead.
// Alt+O (or the OGGS tab, bottom left) opens the settings panel.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  const BASE = 'https://oggs.orlandopb.com/';
  const KEY = 'ggs-settings';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  let settings = read();
  const send = () => window.postMessage({ ggs: 'settings', settings, base: BASE }, location.origin);
  window.addEventListener('message', e => { if (e.source === window && e.data?.ggs === 'hello') send(); });

  // ---- settings panel ----
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

  // The tab and the hotkey wait for the page body and ggs.ui (core/ui.js runs after this file).
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

// ==================== src/form.js =================================================
// Settings form: one card per script in ggs.registry (each src/scripts/<id>/meta.js).
// The popup (popup/popup.js) renders it into its page and saves to chrome.storage.sync;
// the userscript (userscript/bridge.js) renders it into an in-page panel and saves to
// localStorage. Styled by popup/popup.css in both.
//
//   ggs.settingsForm(container, { settings, save(id, key, value) }) -> { setStatus(id, text) }
//
// settings: { "<id>": { enabled, <option>: value } } as stored; it's updated in place
// before save is called.
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
      // options with hidden: true sit inside a collapsed "More" block
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
// Catalogue of scripts, shared by the popup (settings UI) and the in-page loader.
// Each script lives in src/scripts/<id>/: meta.js pushes its entry onto ggs.registry,
// main.js sets __ggs.scripts[<id>] = { start(cfg) { ...; return { stop, update } } }.
// List both in manifest.json before src/boot.js (the popup finds meta.js files there).
(() => {
  const ggs = (globalThis.__ggs ??= {});

  ggs.registry ??= [];

  // Stored settings look like { "<id>": { enabled: true, <option>: value } }; fill gaps with defaults.
  ggs.config = (meta, all) => ({
    enabled: meta.defaultEnabled,
    ...Object.fromEntries(meta.options.map(o => [o.key, o.default])),
    ...(all?.[meta.id] ?? {}),
  });
})();

// ==================== src/core/base.js ============================================
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

// ==================== src/core/maps.js ============================================
// Find GeoGuessr's guess map (a Google Maps instance) and put a guess on it.
//
// Two ways of getting hold of the map, tried in order:
//   1. React fiber: walk up from the guess-map DOM node through GeoGuessr's React
//      components until one has the map in its props or hook state.
//   2. Constructor hook: wrap google.maps.Map as soon as it exists and remember
//      every map created afterwards.
// A guess is placed by firing a synthetic 'click' on the map, which runs GeoGuessr's
// own click handler — exactly as if the player had clicked there.
(() => {
  const ggs = globalThis.__ggs;

  const isGoogleMap = o =>
    o != null && typeof o === 'object' && typeof o.getDiv === 'function' && typeof o.panTo === 'function';

  // Class names are CSS-module hashed (e.g. guess-map_canvas__cvpqv), so match on the prefix.
  const GUESS_MAP_SELECTORS = ['[class*="guess-map_canvas"]', '[data-qa="guess-map"]', '[class*="guess-map_"]'];
  const GUESS_BUTTON_SELECTORS = ['[data-qa="perform-guess"]', 'button[class*="guess-map_guessButton"]'];

  const first = sels => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  function guessMapElement() {
    return first(GUESS_MAP_SELECTORS);
  }

  function mapFromFiber(el) {
    // Nearest ancestor (or self) that React rendered.
    let node = el, key;
    while (node && !(key = Object.keys(node).find(k => k.startsWith('__reactFiber$')))) node = node.parentElement;
    if (!node) return null;

    for (let f = node[key], depth = 0; f && depth < 40; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (props && typeof props === 'object') {
        for (const v of Object.values(props)) if (isGoogleMap(v)) return v;
      }
      // Hooks: useState(map) / useRef(map)
      for (let h = f.memoizedState, i = 0; h && typeof h === 'object' && i < 40; h = h.next, i++) {
        const s = h.memoizedState;
        if (isGoogleMap(s)) return s;
        if (isGoogleMap(s?.current)) return s.current;
      }
    }
    return null;
  }

  const created = [];
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.Map) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.Map;
      gm.Map = class extends Orig {
        constructor(...args) {
          super(...args);
          created.push(this);
        }
      };
    } catch (err) {
      ggs.log('could not hook google.maps.Map', err);
    }
  }, 10);

  function findGuessMap() {
    const el = guessMapElement();
    if (!el) return null;
    const viaFiber = mapFromFiber(el);
    if (viaFiber) return viaFiber;
    return created.find(m => el.contains(m.getDiv()) || m.getDiv().contains(el)) ?? null;
  }

  function guessButton() {
    return first(GUESS_BUTTON_SELECTORS);
  }

  function placeGuess(lat, lng, { pan = true } = {}) {
    const map = findGuessMap();
    if (!map) {
      throw new Error(guessMapElement() ? 'Found the guess map but not its Google Map — see console' : 'No guess map on screen');
    }
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

  // Run __ggs.maps.debug() in the console on a game page to see what was found.
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

  ggs.maps = { guessMapElement, findGuessMap, placeGuess, submitGuess, guessButton, debug };
})();

// ==================== src/core/game.js ============================================
// Which game is open and which map it's being played on. Best effort: each mode has
// its own endpoint and response shape. First step towards auto-picking a country
// pool from the map (e.g. a Europe map only suggests European countries).
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

  // Standard games have { map: "<id>", mapName }, challenges { map: { name, ... } },
  // duels { options: { map: { name, slug } } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }

  const cache = new Map(); // token -> Promise<{id, name} | null>
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!cache.has(ctx.token)) {
      cache.set(ctx.token, fetch(ctx.api, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(pickMap));
    }
    return cache.get(ctx.token);
  }

  // Identifies the current round: game token + how often the guess map has appeared in
  // this game. GeoGuessr's HUD markup changes (its round counter went in 2026), so the
  // page isn't read for this at all.
  let entries = 0, entryToken = null, hadMap = false;
  setInterval(() => {
    const token = context()?.token ?? null, hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) { entryToken = token; entries = 0; hadMap = false; }
    if (hasMap && !hadMap) entries++;
    hadMap = hasMap;
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // The current round (standard games only): { n, total, lat, lng }. Scripts may use the
  // location for gameplay (draw-guess's nudge, radio's station pick) but must never show,
  // log or place it before the player has guessed.
  async function round() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    const n = j.round ?? j.rounds?.length, cur = j?.rounds?.[n - 1];
    if (!(n > 0)) return null;
    return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
  }
  const roundLocation = () => round().then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  // Whether the game is over (standard games only): { finished, round, roundCount }.
  async function state() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    const finished = j.state === 'finished' || (j.roundCount > 0 && j.player?.guesses?.length >= j.roundCount);
    return { finished, round: j.round, roundCount: j.roundCount };
  }

  // ---- competitive guard ----
  // Ranked/competitive games must never run scripts; friendly party games may. Party and
  // ranked duels share /duels/<id> URLs, so two signals decide:
  //   - the lobby you came through: /party or /join (friendly) vs matchmaking pages, and
  //   - party/rated fields in the game-server response, where present.
  // Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

  // Called on every navigation, so we know which lobby led into the next game.
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
      let j = null;
      try {
        const r = await fetch(ctx.api, { credentials: 'include' });
        if (r.ok) j = await r.json();
      } catch {}
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
// Floating, draggable panel inside a shadow root, so GeoGuessr's CSS can't reach it
// (and ours can't leak out). Position is remembered per panel.
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
    place(pos.x, pos.y);
    try {
      const saved = JSON.parse(localStorage.getItem(posKey));
      if (saved) place(saved.x, saved.y);
    } catch {}

    const head = root.querySelector('.head');
    head.addEventListener('pointerdown', e => {
      const r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = ev => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        try {
          const b = host.getBoundingClientRect();
          localStorage.setItem(posKey, JSON.stringify({ x: b.left, y: b.top }));
        } catch {}
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
      // pull the panel back on screen (e.g. after it grew)
      clamp() {
        const r = host.getBoundingClientRect();
        place(r.left, Math.min(r.top, innerHeight - host.offsetHeight - 8));
      },
      get visible() { return !host.hidden; },
      destroy() { host.remove(); },
    };
  }

  ggs.ui = { panel };
})();

// ==================== src/scripts/draw-guess/meta.js ==============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Replaces the guess map with a drawing board. Sketch the country, pin your spot, and it snaps to the closest real country as your guess.',
    defaultEnabled: false,
    options: [
      // How far behind the best match the round's real country can be and still get lifted
      // past it (percentage points). Right = easier = more help; 0 = no help at all (no
      // lift and no extra rotation/stretch leeway for the real country).
      { key: 'nudge', label: 'Correct country sensitivity', type: 'slider', min: 0, max: 20, default: 7,
        marks: ['Off', 'Medium', 'Easier'] },
      { key: 'hardMode', label: 'Hard mode: matches against all 193 countries', type: 'checkbox', default: false },
    ],
  });
})();

// ==================== src/scripts/draw-guess/summary.js ===========================
// Drawing summaries for Draw your country, shown on GeoGuessr's result screens (which
// reveal the answer anyway, so the correct country can be shown here):
//   - after each round: that round's drawing, what it matched and the correct country,
//   - after the last round: every round's drawing plus the average match with the
//     correct country.
// Kept in sessionStorage per game, so it survives a refresh.
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

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grade = score => (score >= 70 ? 'good' : score >= 50 ? 'ok' : 'bad');

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }
  // This game's record, started fresh when the game changes.
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

  // The drawing (green, with its pin) and, dashed on top, the correct country's outline
  // scaled and centred onto the drawing so the two shapes can be compared.
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

  // One round: what the drawing matched, and the correct country's match if it was a different one.
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

  // Called from the draw-guess tick. In a round: ask the game API once which round it is.
  // On a result screen: that round's card, or the whole game after the last round.
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
// Draw your country: replaces GeoGuessr's guess map with a drawing board. Sketch the
// country you think you're in, pin your spot, and the drawing snaps onto the closest
// real country. The pin becomes the marker on the (now invisible) guess map, and a few
// seconds after the animation the script presses GeoGuessr's own (hidden) Guess button.
// The board is the country-matcher app running in an extension iframe (app/, generated
// by tools/sync_draw.py).
(() => {
  const ggs = globalThis.__ggs;

  // The real map stays in the page (placing the guess goes through it), just invisible,
  // along with its controls (zoom +/-, size arrows), which would show through the faded
  // board. GeoGuessr's Guess button is hidden too (the board takes its space); it still
  // works, so the auto-guess and the Space key can press it.
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
  // Like GeoGuessr's own map: a small thumbnail until the mouse is over it. It's scaled
  // rather than resized, so the drawing stays exactly as it is.
  const COLLAPSED_W = 320, COLLAPSE_DELAY = 600;
  // After the snap-to-map animation, press GeoGuessr's own Guess button this much later.
  const AUTO_GUESS_MS = 3000;

  function start(cfg) {
    const origin = new URL(ggs.extBase).origin;
    let host = null, frame, status;
    let ready = false, queued = [], placed = false, wasInRound = false, lastRound, lastToken;
    let expanded = false, collapseTimer = 0, answerRound;
    let boardH = 0; // the board's own height, reported by the frame
    let guessTimer = 0;
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

    // Sit where the guess map is: right-aligned with it, down to the bottom of GeoGuessr's
    // (hidden) Guess button, so the board takes that space too. Measured once per round and
    // window size: GeoGuessr's map grows when hovered, which moves its button, and following
    // it made the board jump around.
    function layout() {
      const key = `${innerWidth}x${innerHeight}|${lastRound}`;
      if (!spot || key !== spotKey) {
        const anchor = (ggs.maps.guessButton() ?? ggs.maps.guessMapElement()).getBoundingClientRect();
        const right = Math.max(MARGIN, innerWidth - anchor.right);
        const bottom = Math.max(MARGIN, innerHeight - anchor.bottom);
        // The board is a square stage plus a toolbar: 52px taller than wide (see app/embed.css).
        const h = Math.min(MAX_H, innerHeight - bottom - MARGIN), w = Math.min(h - 52, innerWidth - right - MARGIN);
        spot = { right, bottom, w, h };
        spotKey = key;
      }
      const { right, bottom, w } = spot;
      // Fit the frame to the board once it has reported its height; until then, the estimate.
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
      } else if (d.ggs === 'guess') { // sent the moment our Guess is pressed, before the animation
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
      } else if (d.ggs === 'done' && placed) { // animation finished: press Guess shortly after
        clearTimeout(guessTimer);
        const round = ggs.game.roundKey();
        guessTimer = setTimeout(() => {
          // skip if the player already pressed Guess or the round moved on
          if (ggs.game.roundKey() !== round || !ggs.maps.guessMapElement()) return;
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
      if (inRound && round !== answerRound) { // new round: tell the board its country, for the nudge
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
      if (token !== lastToken) { // new game: preselect the matching map pool
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
// Generated by tools/radio_shapes.py: country outlines for radio mode, each 128 points as flat [x, y, ...] in -1000..1000.
(() => { globalThis.__ggs.radioShapes = [[309,-922,330,-890,332,-839,375,-825,426,-823,477,-821,529,-818,574,-798,619,-774,668,-761,706,-727,750,-706,801,-702,850,-687,898,-667,939,-638,987,-627,969,-580,975,-529,993,-481,996,-430,992,-378,989,-327,989,-275,992,-224,997,-174,981,-125,968,-76,926,-48,935,-2,962,36,949,85,954,134,975,181,1000,226,993,275,970,321,944,366,915,408,875,440,867,489,858,538,837,583,846,626,809,662,774,700,739,738,704,776,669,814,634,852,600,889,559,922,514,899,463,891,411,893,360,900,309,896,259,885,212,866,161,855,111,857,61,863,21,832,-22,812,-21,761,-67,742,-116,727,-166,714,-217,704,-268,697,-301,662,-325,617,-359,578,-372,532,-366,480,-367,429,-394,398,-446,397,-475,374,-483,323,-515,285,-563,266,-610,246,-654,219,-694,188,-734,155,-770,121,-791,75,-812,27,-819,-22,-852,-62,-872,-109,-907,-146,-937,-187,-959,-234,-992,-273,-1000,-322,-959,-325,-908,-323,-862,-310,-817,-289,-769,-302,-718,-298,-670,-279,-620,-269,-571,-279,-528,-305,-494,-344,-459,-382,-426,-421,-395,-463,-367,-506,-338,-548,-301,-583,-256,-608,-210,-631,-163,-652,-115,-670,-78,-702,-67,-752,-64,-803,-33,-841,11,-867,57,-891,105,-909,155,-920,206,-921,258,-921],[517,-869,550,-814,611,-802,656,-765,713,-745,760,-716,818,-693,876,-667,911,-620,953,-592,969,-537,1000,-485,1000,-432,949,-397,965,-337,944,-280,955,-220,957,-158,981,-123,924,-94,899,-46,898,17,865,71,864,110,902,158,923,162,861,183,800,204,738,224,677,245,617,267,554,285,492,303,432,327,439,384,454,446,389,446,325,449,263,469,207,501,188,558,157,609,97,632,39,662,-7,706,-43,759,-85,808,-129,856,-191,869,-252,851,-315,857,-372,834,-435,826,-484,785,-548,776,-613,773,-676,784,-740,796,-793,770,-842,727,-889,683,-935,638,-977,593,-994,531,-1000,467,-1000,402,-1000,337,-1000,273,-1000,208,-1000,143,-1000,79,-1000,14,-972,-23,-907,-23,-842,-23,-778,-23,-713,-23,-658,-34,-664,-94,-654,-156,-656,-221,-649,-284,-649,-347,-646,-398,-598,-366,-591,-310,-535,-315,-472,-330,-427,-323,-413,-263,-356,-241,-295,-219,-231,-210,-167,-206,-130,-252,-95,-252,-56,-203,-20,-153,43,-139,102,-114,132,-59,178,-19,208,36,268,38,322,34,350,31,350,-34,350,-98,350,-163,300,-158,266,-130,209,-154,163,-199,119,-245,107,-306,124,-368,145,-428,145,-490,148,-555,142,-619,113,-677,148,-721,190,-770,202,-826,266,-836,330,-846,394,-856,458,-866],[774,-635,799,-608,817,-567,834,-527,851,-486,869,-445,886,-404,904,-363,921,-323,946,-290,964,-249,982,-208,1000,-168,958,-153,917,-137,878,-117,846,-86,829,-46,831,-3,823,36,784,55,744,73,707,97,666,114,624,127,581,138,537,147,496,161,457,183,415,193,371,201,329,214,288,231,249,252,219,282,192,317,158,346,117,358,73,361,29,353,-9,371,-49,390,-82,420,-121,438,-164,449,-205,465,-248,476,-292,477,-336,478,-380,483,-424,492,-457,521,-488,550,-528,567,-555,599,-598,608,-639,604,-677,627,-721,633,-763,635,-803,617,-845,620,-855,578,-877,539,-893,500,-887,456,-887,412,-908,374,-921,335,-930,292,-935,249,-949,207,-955,167,-976,130,-1000,104,-977,94,-987,51,-986,8,-973,-34,-973,-78,-970,-118,-935,-146,-907,-177,-914,-217,-913,-261,-897,-296,-882,-329,-841,-340,-805,-315,-764,-304,-723,-315,-679,-321,-635,-320,-591,-324,-547,-324,-504,-317,-463,-300,-419,-295,-375,-291,-331,-287,-287,-286,-243,-291,-207,-273,-181,-237,-141,-228,-101,-249,-76,-283,-60,-324,-33,-359,-5,-394,22,-428,50,-463,88,-486,127,-506,167,-526,206,-546,247,-561,291,-568,335,-574,379,-580,423,-586,467,-592,511,-598,555,-605,599,-611,642,-617,686,-623,730,-629],[-92,-1000,-45,-987,0,-954,51,-949,106,-944,96,-906,106,-855,135,-821,179,-789,227,-775,278,-761,226,-739,194,-698,142,-688,115,-669,93,-621,63,-575,16,-544,-5,-490,-20,-434,-13,-383,21,-335,66,-298,82,-248,95,-226,134,-182,172,-139,217,-103,257,-63,300,-37,333,6,365,54,399,100,418,156,432,212,449,268,446,301,449,359,468,414,460,437,452,477,441,519,435,546,418,591,388,630,340,662,291,691,246,720,194,748,153,721,128,749,118,749,82,767,116,796,79,816,39,778,78,822,79,867,32,836,6,817,42,864,13,903,-41,928,-75,975,-126,1000,-135,966,-135,906,-128,848,-101,806,-149,781,-181,749,-128,732,-107,685,-57,677,-4,682,40,693,17,647,-2,595,41,571,74,552,119,529,168,500,216,486,220,429,221,372,223,316,200,261,204,206,218,152,233,101,204,57,177,11,188,-23,142,-59,105,-81,87,-135,51,-180,7,-219,-30,-264,-64,-308,-100,-351,-125,-386,-177,-412,-226,-445,-239,-476,-218,-512,-161,-507,-126,-553,-152,-585,-193,-616,-180,-655,-231,-684,-279,-654,-334,-667,-378,-704,-386,-758,-400,-800,-427,-813,-467,-855,-468,-898,-427,-924,-380,-891,-339,-925,-302,-919,-262,-909,-226,-936,-177,-935,-135,-967],[-489,-855,-465,-785,-403,-766,-329,-754,-265,-714,-250,-647,-194,-610,-119,-619,-44,-630,31,-633,89,-603,154,-570,226,-549,297,-569,363,-605,435,-614,362,-622,406,-637,481,-637,556,-645,630,-647,705,-649,653,-629,580,-621,591,-585,604,-564,641,-515,675,-535,730,-491,759,-521,818,-476,874,-437,831,-382,793,-327,783,-310,850,-316,923,-319,992,-319,1000,-265,946,-217,893,-172,909,-109,931,-75,863,-53,819,-10,803,54,818,112,868,168,902,229,850,280,784,303,720,338,648,347,585,374,552,428,498,377,426,377,365,347,296,332,300,370,356,420,365,493,393,563,431,603,488,625,432,666,383,712,328,752,264,784,205,830,163,852,114,835,45,855,-13,806,-46,743,-71,673,-91,605,-143,554,-168,524,-112,473,-132,411,-167,347,-182,275,-175,200,-152,134,-122,68,-167,22,-240,37,-315,42,-386,49,-444,15,-492,-43,-551,-79,-622,-98,-695,-85,-770,-87,-827,-122,-875,-170,-863,-243,-881,-309,-915,-374,-956,-424,-1000,-433,-959,-496,-944,-570,-919,-640,-876,-701,-823,-750,-770,-796,-703,-816,-771,-787,-786,-732,-762,-682,-751,-613,-797,-555,-806,-490,-770,-429,-718,-400,-666,-448,-671,-521,-713,-582,-735,-654,-686,-692,-617,-722,-545,-743,-483,-757,-510,-787,-543,-832],[-726,-644,-671,-634,-621,-602,-570,-570,-520,-538,-469,-506,-419,-474,-386,-426,-345,-383,-305,-338,-250,-335,-191,-344,-132,-348,-72,-343,-12,-339,42,-363,83,-322,124,-281,154,-236,182,-224,177,-164,173,-105,226,-96,238,-41,250,17,298,35,358,31,408,44,417,96,470,118,482,66,524,23,562,-16,610,-48,659,-80,704,-103,750,-136,769,-114,724,-82,679,-44,687,-11,729,11,779,37,806,6,835,-25,859,26,895,54,944,75,1000,84,963,115,916,131,885,150,842,188,792,170,734,180,686,159,717,115,706,72,669,78,616,106,566,94,552,144,545,185,486,185,518,202,496,230,471,275,417,283,359,280,331,329,367,364,419,379,412,436,441,486,426,537,394,587,382,644,338,643,287,628,232,622,233,563,223,520,172,490,117,482,69,446,19,414,-26,374,-78,354,-120,312,-167,276,-215,240,-247,192,-266,137,-291,84,-320,33,-372,25,-428,20,-486,18,-519,-22,-506,-67,-532,-110,-565,-144,-618,-160,-665,-188,-703,-202,-738,-185,-714,-142,-759,-173,-790,-125,-848,-115,-884,-70,-877,-10,-901,15,-960,11,-1000,-11,-1000,-71,-1000,-131,-1000,-191,-1000,-251,-1000,-311,-1000,-370,-1000,-430,-1000,-490,-1000,-550,-956,-577,-898,-594,-841,-612,-784,-628],[-370,-1000,-329,-969,-292,-933,-255,-897,-217,-860,-179,-825,-141,-789,-110,-747,-79,-706,-77,-655,-79,-603,-31,-600,9,-632,46,-667,82,-681,119,-644,151,-603,176,-558,208,-519,253,-505,292,-487,335,-459,384,-441,429,-418,457,-374,488,-332,525,-296,567,-266,616,-248,661,-225,702,-194,725,-149,744,-101,763,-52,798,-13,838,19,885,41,924,74,910,116,877,157,844,197,805,232,790,281,790,333,791,385,789,437,800,485,846,508,814,548,797,597,773,643,742,685,714,728,697,776,654,807,614,839,580,879,535,892,493,922,445,943,397,964,350,985,302,1000,251,988,199,987,157,958,107,945,56,939,4,945,-45,960,-93,982,-143,991,-193,978,-230,944,-276,924,-326,910,-376,893,-415,860,-455,826,-499,802,-551,802,-603,801,-655,806,-707,812,-739,777,-768,734,-806,698,-844,662,-877,622,-910,582,-921,531,-924,480,-918,428,-910,376,-900,325,-898,275,-852,254,-820,214,-803,166,-814,115,-823,64,-832,13,-836,-36,-816,-84,-828,-133,-830,-183,-834,-234,-818,-276,-785,-316,-770,-366,-782,-414,-782,-461,-755,-505,-734,-553,-727,-605,-733,-654,-707,-693,-709,-746,-727,-795,-710,-842,-676,-881,-651,-926,-632,-959,-593,-932,-541,-927,-491,-932,-468,-979,-422,-1000],[20,-526,67,-496,130,-485,196,-476,263,-482,328,-450,385,-409,425,-378,466,-327,466,-257,448,-198,513,-219,582,-242,614,-280,676,-301,735,-340,807,-340,869,-352,899,-412,945,-438,976,-394,1000,-345,962,-318,932,-300,891,-283,869,-230,896,-209,870,-192,832,-179,766,-157,753,-140,746,-98,706,-100,710,-86,711,-32,698,-22,688,-59,688,-92,674,-82,673,-47,653,-64,676,-32,664,-25,672,1,664,4,701,52,695,45,665,57,693,75,671,87,667,110,623,142,581,168,546,205,519,230,497,279,514,349,531,406,525,392,548,461,535,526,502,503,477,458,466,412,457,377,417,320,361,327,325,301,302,296,272,291,216,311,210,316,224,347,198,340,156,350,120,338,66,321,35,333,1,375,-24,387,-57,417,-61,462,-80,492,-130,447,-161,386,-201,329,-253,355,-309,328,-347,270,-407,241,-460,261,-533,261,-601,235,-667,208,-727,206,-769,165,-822,132,-870,98,-911,43,-935,-15,-916,-34,-942,-29,-975,-70,-1000,-134,-995,-198,-1000,-266,-990,-330,-980,-392,-988,-405,-999,-446,-987,-479,-949,-459,-938,-460,-937,-439,-935,-488,-915,-515,-842,-515,-769,-515,-696,-515,-624,-515,-551,-515,-478,-515,-405,-515,-332,-515,-260,-515,-187,-515,-114,-515,-41,-515],[-128,-1000,-133,-935,-192,-885,-249,-833,-251,-783,-223,-761,-149,-783,-73,-779,4,-780,54,-732,17,-665,-9,-592,-50,-526,-116,-491,-120,-477,-69,-444,-132,-408,-205,-401,-163,-384,-91,-391,-17,-374,38,-322,79,-259,97,-183,118,-108,172,-57,230,-7,282,50,285,117,294,163,225,143,261,155,317,209,340,281,311,340,368,322,443,322,509,359,532,430,514,506,462,551,425,588,418,637,355,667,419,692,487,701,448,758,393,797,324,831,248,820,172,826,105,803,60,839,19,868,-53,863,-124,846,-179,891,-214,954,-277,921,-350,944,-401,1000,-467,995,-424,946,-375,886,-326,828,-290,771,-240,724,-163,730,-103,694,-55,633,-66,631,-132,670,-198,668,-263,644,-291,614,-357,624,-406,585,-374,536,-305,500,-257,442,-253,376,-291,334,-332,335,-282,277,-215,239,-142,239,-115,219,-102,227,-111,156,-106,94,-109,39,-165,10,-189,-61,-152,-128,-154,-145,-224,-119,-288,-116,-355,-117,-393,-108,-386,-163,-355,-234,-355,-303,-356,-372,-361,-402,-391,-384,-413,-399,-402,-425,-436,-362,-447,-286,-483,-234,-471,-309,-466,-363,-455,-440,-430,-512,-425,-549,-488,-512,-532,-557,-497,-595,-461,-657,-493,-720,-483,-769,-445,-823,-424,-848,-417,-910,-393,-953,-346,-973,-281,-978,-205,-991],[898,-783,913,-739,906,-689,904,-637,920,-593,965,-597,992,-554,993,-502,994,-451,995,-399,996,-348,1000,-297,969,-265,935,-228,895,-196,855,-195,830,-238,842,-278,794,-281,759,-244,756,-194,760,-142,748,-93,751,-42,757,7,751,50,801,57,829,95,819,132,769,144,718,145,668,157,623,181,644,223,639,273,620,321,600,369,581,416,561,464,543,512,524,560,508,609,506,660,505,711,493,760,454,783,403,776,352,769,301,762,250,755,199,748,148,742,97,735,46,728,-5,721,-56,714,-107,707,-158,701,-209,694,-260,687,-311,680,-363,673,-414,666,-465,659,-516,653,-567,646,-607,620,-638,580,-670,539,-701,498,-732,457,-763,416,-795,375,-826,334,-857,293,-889,253,-920,212,-951,171,-982,130,-999,82,-1000,31,-977,19,-938,38,-913,70,-907,121,-873,157,-823,166,-771,169,-721,159,-674,138,-628,115,-580,95,-530,86,-479,87,-428,88,-376,92,-326,101,-275,110,-224,114,-172,118,-121,121,-69,124,-19,115,28,96,76,76,120,50,168,31,200,-7,218,-55,246,-97,274,-139,296,-185,332,-221,374,-252,415,-282,457,-312,494,-348,530,-385,557,-427,590,-465,624,-503,660,-540,700,-571,741,-603,781,-634,820,-668,848,-711,866,-759],[253,-599,309,-585,338,-531,348,-490,342,-445,368,-413,427,-406,467,-374,478,-317,498,-265,554,-273,602,-245,655,-261,708,-262,742,-213,784,-206,837,-195,891,-177,939,-149,993,-134,1000,-78,957,-38,984,-1,948,35,971,80,967,129,931,163,870,160,826,197,793,237,788,289,728,290,679,318,630,352,575,360,518,372,473,413,433,456,461,408,422,435,419,491,408,503,366,475,314,450,273,457,220,447,160,457,106,434,91,413,54,387,97,386,151,378,114,373,91,322,70,270,86,329,56,364,30,366,-29,377,-54,429,-89,479,-137,515,-168,546,-163,593,-216,576,-263,599,-315,583,-293,549,-269,497,-240,448,-237,392,-207,399,-157,398,-116,399,-135,347,-175,305,-189,254,-223,209,-220,150,-261,121,-306,108,-345,82,-398,56,-452,73,-504,91,-547,124,-601,145,-659,162,-708,170,-759,148,-817,141,-875,127,-923,141,-959,103,-1000,66,-984,16,-960,-40,-932,-56,-944,-113,-919,-165,-880,-213,-837,-257,-790,-289,-792,-341,-810,-390,-833,-443,-814,-479,-766,-502,-715,-523,-654,-531,-593,-528,-533,-516,-474,-501,-427,-473,-383,-453,-334,-474,-280,-457,-237,-474,-200,-438,-141,-449,-91,-432,-59,-444,-56,-502,-18,-549,39,-560,98,-549,137,-589,196,-585],[600,-1000,624,-949,648,-898,666,-858,712,-826,761,-801,755,-746,753,-691,764,-636,798,-596,818,-544,865,-513,885,-461,916,-418,919,-365,928,-309,943,-255,950,-199,952,-143,944,-88,910,-43,885,5,876,53,824,74,783,112,759,162,727,208,692,251,655,291,638,344,611,393,586,442,581,498,581,554,581,611,579,667,576,723,573,780,574,836,518,836,461,836,405,836,349,836,292,836,236,836,179,836,123,836,67,836,10,836,-46,836,-102,836,-159,836,-215,836,-272,836,-328,836,-384,836,-441,836,-497,836,-550,846,-604,858,-660,859,-698,896,-736,938,-778,976,-827,1000,-856,956,-910,965,-946,953,-950,897,-952,841,-941,786,-936,730,-923,675,-924,619,-916,564,-905,508,-898,453,-869,406,-847,354,-822,305,-825,248,-816,194,-767,168,-728,128,-699,81,-651,55,-605,24,-564,-15,-524,-54,-483,-93,-444,-134,-406,-175,-370,-219,-351,-270,-384,-314,-433,-334,-478,-361,-531,-374,-537,-423,-519,-477,-500,-529,-525,-577,-524,-629,-501,-680,-483,-730,-488,-770,-450,-811,-403,-842,-350,-841,-298,-820,-244,-813,-193,-838,-148,-838,-118,-790,-70,-764,-29,-779,14,-814,67,-830,123,-838,179,-847,230,-868,279,-866,329,-842,385,-837,439,-844,481,-882,521,-921,561,-961],[-145,-690,-102,-650,-53,-626,-3,-603,51,-589,55,-538,69,-507,66,-453,106,-415,162,-410,220,-401,273,-414,324,-384,348,-330,372,-277,397,-225,417,-170,464,-134,512,-99,559,-63,602,-21,652,10,700,34,750,67,798,101,847,136,902,139,954,168,1000,198,984,254,976,305,919,288,868,271,844,322,784,325,738,356,722,413,707,471,669,515,625,549,568,563,510,578,498,625,466,669,413,690,372,682,323,655,268,643,232,606,221,552,223,494,217,436,159,434,101,431,69,381,20,347,-28,314,-58,270,-111,244,-166,251,-216,224,-271,202,-324,183,-358,146,-417,138,-469,155,-517,170,-577,168,-630,193,-675,232,-702,283,-757,304,-812,300,-821,241,-824,182,-820,122,-819,63,-821,5,-853,-38,-905,-60,-920,-85,-880,-96,-875,-125,-887,-174,-944,-176,-949,-155,-974,-209,-976,-268,-960,-325,-944,-361,-899,-326,-846,-322,-798,-307,-747,-313,-719,-334,-699,-379,-742,-420,-785,-460,-803,-517,-828,-570,-886,-566,-940,-549,-967,-497,-964,-441,-971,-418,-1000,-470,-1000,-522,-956,-562,-902,-587,-844,-602,-785,-609,-733,-582,-685,-548,-653,-498,-621,-448,-576,-413,-517,-424,-458,-421,-398,-417,-359,-435,-374,-491,-355,-540,-311,-577,-253,-585,-226,-637,-176,-611,-179,-634,-193,-674],[-32,-424,-12,-381,38,-375,76,-354,113,-318,160,-324,205,-300,258,-289,308,-273,361,-280,414,-292,465,-282,517,-275,567,-295,614,-319,656,-353,705,-350,758,-342,797,-352,833,-318,867,-288,894,-243,883,-195,901,-153,954,-148,996,-115,991,-108,968,-67,930,-49,941,0,955,49,973,91,949,139,984,170,993,217,1000,250,955,276,937,232,887,242,836,225,786,227,747,256,712,246,660,260,607,260,554,267,506,292,456,311,402,318,350,311,302,287,253,307,202,322,155,304,124,331,128,380,97,413,59,424,47,381,68,337,74,291,29,309,-13,328,-62,304,-108,319,-145,358,-189,388,-242,396,-294,403,-338,375,-373,335,-421,311,-472,295,-521,302,-530,354,-564,372,-615,390,-665,369,-686,321,-732,309,-776,313,-801,309,-853,316,-815,301,-774,270,-827,272,-878,276,-850,247,-885,212,-885,174,-898,133,-942,108,-982,92,-974,48,-948,83,-906,79,-923,60,-911,19,-923,-16,-930,-60,-947,-78,-1000,-69,-999,-118,-972,-159,-935,-198,-883,-205,-838,-188,-819,-213,-789,-195,-735,-195,-688,-203,-695,-230,-642,-240,-610,-248,-662,-259,-683,-302,-634,-309,-581,-303,-528,-302,-475,-294,-432,-317,-388,-347,-343,-376,-294,-397,-243,-415,-190,-419,-136,-415,-82,-414],[25,-1000,69,-1000,68,-965,90,-966,117,-982,160,-969,161,-926,183,-888,185,-848,225,-841,252,-876,295,-889,330,-918,365,-923,379,-880,353,-849,329,-810,307,-771,269,-747,238,-714,229,-671,240,-627,262,-588,298,-563,335,-536,352,-500,360,-456,377,-415,357,-377,334,-339,311,-299,285,-262,255,-229,220,-200,184,-174,149,-145,127,-106,135,-62,153,-21,184,12,223,34,268,29,283,56,311,75,341,46,374,71,386,115,410,143,428,162,470,170,464,215,459,260,458,305,472,347,468,388,429,410,389,432,351,456,312,480,279,510,253,544,226,579,183,592,157,629,147,670,157,714,168,758,177,802,168,846,144,884,119,922,93,959,53,981,12,1000,-4,971,-13,926,-23,882,-33,838,-42,793,-51,749,-61,705,-70,661,-80,616,-89,572,-99,528,-108,484,-142,454,-178,427,-214,400,-250,371,-277,338,-287,294,-301,251,-323,212,-358,185,-398,163,-420,127,-435,84,-452,42,-468,0,-472,-45,-464,-89,-431,-119,-403,-153,-376,-187,-337,-211,-308,-244,-294,-287,-289,-332,-276,-375,-265,-415,-279,-458,-277,-504,-287,-547,-296,-591,-289,-635,-281,-680,-273,-725,-293,-761,-287,-791,-258,-824,-227,-854,-217,-890,-176,-904,-138,-927,-102,-955,-61,-972,-18,-986],[-335,-1000,-294,-992,-253,-983,-212,-973,-171,-963,-138,-945,-101,-945,-60,-953,-18,-954,24,-956,14,-915,-1,-876,-21,-840,-24,-798,-27,-756,-30,-714,-1,-687,34,-663,69,-640,104,-617,139,-593,174,-570,199,-540,200,-498,200,-456,201,-414,204,-373,214,-332,221,-292,245,-257,273,-227,295,-192,302,-151,302,-109,303,-67,303,-25,304,17,306,59,309,100,311,142,311,184,311,226,311,268,311,310,311,352,311,394,311,436,311,478,311,520,311,562,311,604,311,646,275,652,292,690,297,732,293,771,309,808,334,840,357,875,369,916,344,936,306,948,282,966,241,976,200,985,161,1000,137,995,103,979,73,951,52,918,13,905,-21,881,-48,850,-58,812,-81,780,-102,743,-124,708,-125,667,-100,636,-95,594,-87,553,-82,511,-110,488,-133,457,-130,417,-109,381,-94,343,-96,301,-98,259,-100,217,-99,176,-76,143,-61,106,-80,69,-107,39,-141,14,-169,-17,-185,-56,-154,-81,-139,-117,-150,-157,-149,-199,-138,-239,-128,-280,-128,-320,-157,-349,-196,-344,-233,-330,-232,-364,-207,-391,-225,-406,-206,-430,-201,-472,-195,-513,-193,-555,-191,-597,-190,-639,-187,-676,-223,-696,-256,-722,-285,-752,-315,-781,-349,-806,-369,-841,-357,-881,-338,-918,-331,-959,-349,-994],[736,-508,774,-495,812,-483,852,-477,892,-470,932,-464,968,-446,1000,-422,977,-395,947,-368,916,-341,886,-315,856,-288,823,-265,789,-242,756,-220,722,-198,688,-175,651,-161,612,-148,574,-136,534,-128,495,-119,457,-106,421,-87,387,-67,358,-38,329,-10,295,9,258,25,220,38,179,43,139,48,100,57,61,66,24,82,-12,101,-47,122,-81,143,-115,165,-151,180,-191,184,-231,185,-270,196,-309,208,-347,221,-385,235,-423,248,-461,262,-499,276,-537,289,-575,303,-610,322,-644,344,-678,366,-712,388,-745,410,-778,434,-810,459,-842,484,-874,508,-884,469,-894,430,-906,392,-928,358,-954,327,-966,289,-961,250,-926,237,-886,235,-846,232,-822,200,-806,165,-806,124,-822,90,-856,80,-893,97,-929,114,-966,122,-1000,102,-1000,63,-997,22,-966,-3,-934,-28,-905,-55,-884,-90,-864,-125,-844,-160,-819,-191,-790,-220,-756,-239,-718,-254,-680,-269,-642,-282,-603,-292,-564,-300,-524,-308,-484,-316,-445,-324,-405,-332,-366,-339,-326,-347,-286,-355,-247,-362,-206,-364,-166,-366,-126,-366,-85,-365,-45,-365,-5,-365,36,-364,76,-365,117,-367,157,-369,197,-371,238,-373,278,-376,318,-378,359,-380,399,-385,438,-391,477,-403,515,-416,553,-430,590,-446,627,-462,662,-482,698,-500],[-240,-1000,-187,-999,-150,-996,-140,-944,-133,-893,-77,-902,-44,-869,-34,-810,-57,-755,-52,-700,-75,-644,-47,-615,0,-654,44,-689,94,-702,142,-669,185,-679,225,-719,267,-738,324,-724,359,-675,399,-630,437,-585,428,-526,442,-468,480,-423,514,-388,545,-345,527,-290,529,-231,494,-186,455,-187,396,-188,336,-186,276,-193,217,-179,175,-138,137,-91,106,-58,124,-2,139,54,157,104,178,160,166,143,131,120,93,91,46,55,-10,52,-69,49,-84,6,-77,-54,-126,-75,-184,-61,-194,-13,-208,45,-204,105,-228,160,-254,214,-270,272,-295,326,-311,381,-315,441,-301,498,-257,509,-216,534,-208,594,-176,622,-160,680,-147,739,-139,785,-166,741,-182,735,-152,786,-104,815,-50,837,5,848,42,896,70,939,36,986,-15,976,-60,1000,-59,948,-93,914,-138,889,-183,871,-210,868,-243,823,-259,777,-295,748,-331,708,-368,667,-406,648,-438,624,-432,564,-420,505,-399,448,-379,391,-367,332,-335,286,-299,237,-267,186,-265,131,-284,74,-311,24,-313,-32,-318,-93,-348,-145,-393,-185,-428,-235,-446,-292,-399,-321,-395,-380,-370,-428,-368,-459,-398,-494,-418,-549,-459,-594,-498,-640,-511,-695,-545,-735,-514,-759,-509,-811,-496,-868,-468,-920,-412,-914,-353,-924,-322,-970,-270,-982],[-734,-973,-679,-972,-624,-972,-568,-972,-513,-972,-457,-972,-402,-972,-347,-972,-291,-972,-236,-972,-180,-972,-130,-954,-81,-927,-33,-900,15,-873,64,-846,112,-818,160,-791,209,-764,257,-737,305,-710,354,-683,402,-656,450,-628,499,-601,502,-548,513,-509,550,-470,595,-437,640,-405,685,-372,730,-340,774,-307,769,-259,755,-207,740,-153,717,-103,709,-49,727,2,768,38,797,84,839,115,818,161,795,212,800,255,823,295,804,346,804,401,827,450,844,495,857,545,872,598,882,650,911,676,955,702,1000,733,975,771,931,804,883,830,830,847,782,872,727,878,678,903,630,906,577,895,535,919,498,957,446,972,395,953,343,954,293,973,238,966,198,932,150,939,98,950,43,948,7,923,-28,887,-49,839,-41,786,-56,734,-64,679,-89,632,-127,592,-168,583,-201,591,-256,593,-305,571,-354,554,-405,532,-453,507,-505,493,-542,466,-593,453,-628,414,-682,410,-725,378,-748,328,-771,278,-795,228,-815,176,-841,128,-879,88,-924,56,-954,10,-972,-42,-961,-94,-961,-146,-980,-198,-1000,-250,-996,-304,-977,-346,-924,-351,-880,-384,-848,-429,-815,-473,-787,-519,-755,-554,-738,-597,-778,-622,-798,-659,-789,-707,-741,-724,-724,-773,-735,-826,-739,-880,-776,-918,-787,-961],[-222,-715,-169,-674,-136,-624,-161,-575,-216,-529,-187,-484,-140,-443,-72,-451,-128,-418,-167,-365,-216,-396,-281,-423,-348,-436,-416,-415,-454,-366,-499,-362,-517,-294,-501,-225,-438,-227,-369,-228,-298,-229,-237,-230,-167,-232,-124,-178,-57,-185,0,-218,63,-241,94,-193,126,-147,187,-156,241,-124,287,-153,355,-171,426,-163,497,-165,561,-192,618,-178,616,-108,655,-49,634,7,656,75,712,109,761,69,830,84,894,114,921,170,913,239,939,304,951,372,958,436,1000,490,947,536,896,497,828,488,764,495,703,523,634,540,643,493,585,464,517,480,455,514,398,555,357,610,288,624,226,659,170,703,105,715,72,655,53,586,57,516,66,445,76,375,81,309,12,315,21,246,-1,182,-61,145,-129,147,-174,202,-211,262,-262,311,-254,378,-286,437,-351,418,-421,424,-471,469,-468,538,-515,578,-566,528,-621,526,-682,551,-746,581,-794,620,-856,618,-897,561,-884,492,-866,425,-825,367,-786,309,-747,251,-769,190,-811,133,-821,63,-798,-4,-846,-41,-916,-44,-949,-98,-1000,-131,-980,-199,-925,-241,-857,-240,-787,-227,-716,-221,-679,-278,-644,-321,-619,-358,-594,-398,-632,-417,-656,-437,-585,-448,-515,-438,-499,-482,-520,-550,-497,-606,-446,-627,-388,-595,-324,-627,-261,-660],[939,-916,984,-899,1000,-846,968,-803,930,-762,891,-723,850,-685,804,-656,751,-642,701,-620,674,-572,664,-518,664,-463,681,-410,695,-356,691,-302,670,-250,656,-197,651,-141,648,-86,648,-30,641,24,616,74,592,123,553,160,500,174,451,201,404,230,356,259,309,288,262,317,214,346,167,375,119,404,72,433,24,462,-23,491,-70,520,-118,549,-164,579,-211,609,-258,639,-305,669,-351,700,-397,731,-444,762,-490,793,-536,823,-582,854,-629,885,-675,916,-728,916,-783,907,-832,885,-877,854,-924,829,-956,784,-995,759,-977,707,-978,657,-985,604,-997,552,-970,507,-934,466,-948,427,-928,379,-879,359,-824,361,-846,321,-807,282,-769,245,-763,194,-780,141,-827,115,-805,76,-844,49,-890,66,-942,62,-957,8,-967,-46,-965,-102,-951,-155,-960,-210,-986,-258,-1000,-306,-988,-360,-966,-411,-915,-391,-878,-402,-840,-438,-822,-484,-790,-523,-739,-533,-758,-584,-765,-637,-754,-692,-730,-738,-676,-729,-633,-700,-583,-684,-527,-681,-474,-690,-423,-712,-370,-729,-319,-751,-269,-775,-214,-768,-165,-744,-121,-710,-68,-698,-12,-696,43,-694,99,-696,153,-707,207,-721,260,-738,311,-759,360,-785,410,-810,461,-832,513,-850,569,-852,623,-843,679,-838,734,-843,788,-853,843,-866,895,-883],[135,-631,189,-624,233,-587,282,-584,326,-560,384,-565,441,-564,490,-534,539,-503,589,-472,633,-435,624,-379,599,-326,580,-271,569,-215,585,-170,642,-164,698,-149,741,-115,773,-72,825,-45,879,-38,920,-79,960,-118,998,-79,1000,-23,986,33,980,90,999,144,959,166,909,140,861,124,829,167,821,223,846,274,859,330,844,374,805,340,776,290,721,294,668,318,613,331,570,297,551,242,521,207,470,217,470,275,467,333,442,385,407,431,373,478,354,532,368,588,349,631,309,604,281,555,264,510,255,469,199,454,156,416,118,372,103,318,105,260,68,237,28,278,-13,319,-56,357,-37,410,-65,460,-95,509,-139,545,-189,576,-243,555,-298,539,-350,565,-404,585,-461,598,-515,588,-546,541,-582,496,-618,451,-639,402,-623,346,-643,292,-663,250,-720,241,-778,242,-832,261,-875,298,-873,348,-896,394,-944,425,-1000,427,-989,378,-945,341,-934,284,-960,237,-939,183,-918,129,-876,90,-831,53,-801,7,-794,-50,-775,-100,-722,-125,-682,-164,-645,-208,-607,-252,-569,-296,-541,-346,-581,-376,-557,-424,-506,-449,-466,-425,-413,-409,-358,-425,-326,-473,-283,-507,-230,-502,-172,-500,-114,-499,-56,-505,-2,-526,55,-525,111,-520,160,-544,116,-556,94,-592],[208,-1000,241,-972,277,-941,318,-919,361,-899,389,-866,400,-831,400,-784,419,-753,414,-710,430,-669,414,-626,421,-582,442,-541,413,-531,370,-519,334,-527,316,-505,291,-486,265,-462,264,-445,252,-404,250,-364,261,-320,229,-286,211,-242,175,-213,141,-184,113,-182,84,-153,61,-128,56,-102,24,-92,18,-67,2,-39,-16,-20,-12,17,-17,64,-32,85,-31,130,-30,177,-26,223,7,244,36,265,61,300,88,335,73,374,40,408,40,419,56,428,30,462,-7,487,-42,517,-88,520,-64,530,-67,559,-65,604,-75,645,-69,692,-80,737,-84,784,-100,828,-112,874,-147,884,-193,887,-218,909,-236,951,-235,994,-278,1000,-323,998,-320,953,-338,910,-353,868,-341,851,-329,818,-356,781,-374,737,-390,701,-404,659,-416,618,-426,573,-438,536,-442,489,-429,465,-407,468,-402,421,-403,376,-380,338,-353,302,-347,255,-360,210,-354,171,-329,139,-346,98,-375,64,-369,17,-371,-29,-377,-76,-374,-121,-384,-165,-371,-209,-345,-248,-307,-273,-260,-267,-240,-302,-261,-340,-258,-375,-235,-417,-217,-460,-212,-508,-210,-554,-187,-579,-149,-604,-138,-645,-110,-683,-84,-722,-103,-764,-73,-795,-55,-838,-18,-863,22,-851,34,-895,49,-932,95,-922,140,-907,175,-921,178,-951,174,-994],[-87,-1000,-41,-998,-1,-974,39,-950,79,-927,118,-903,158,-879,198,-855,238,-832,279,-810,319,-787,360,-765,401,-742,441,-720,482,-698,526,-710,569,-728,607,-702,648,-679,688,-657,701,-616,705,-570,707,-524,703,-478,700,-431,694,-386,682,-341,677,-295,682,-249,690,-204,702,-159,714,-114,728,-70,744,-26,750,19,751,66,752,112,753,158,754,205,755,251,756,298,757,344,758,390,723,381,678,368,633,368,617,405,609,451,601,496,593,542,588,588,584,634,580,680,576,727,571,773,567,819,570,865,574,912,577,958,571,995,525,996,479,997,432,998,386,999,339,1000,293,998,247,995,200,992,154,990,108,987,61,984,16,980,-29,965,-73,951,-117,936,-161,922,-204,906,-243,881,-282,855,-320,829,-359,803,-397,778,-436,752,-462,714,-485,674,-508,634,-531,593,-554,553,-577,513,-596,471,-613,428,-630,385,-648,341,-691,334,-737,328,-751,285,-753,238,-755,192,-756,146,-758,99,-757,53,-757,7,-757,-40,-757,-86,-745,-131,-724,-172,-699,-211,-673,-249,-648,-288,-622,-327,-597,-366,-571,-405,-546,-444,-521,-482,-496,-521,-472,-561,-454,-604,-436,-647,-418,-690,-392,-728,-364,-764,-336,-801,-307,-838,-279,-875,-242,-903,-205,-931,-168,-959,-131,-987],[471,-1000,531,-999,591,-996,650,-986,710,-976,769,-967,828,-955,886,-940,941,-917,959,-863,952,-804,930,-748,902,-695,857,-655,817,-610,782,-561,761,-508,747,-451,755,-392,770,-335,761,-276,773,-218,786,-159,811,-109,816,-52,848,-1,887,45,929,86,959,138,975,185,964,243,932,294,897,343,884,398,893,457,885,517,860,570,830,623,800,675,760,717,720,760,663,768,633,721,579,712,530,685,500,639,447,665,390,670,334,690,285,716,225,721,165,727,109,713,56,685,13,701,-11,753,-51,795,-10,829,28,876,53,926,44,984,-10,1000,-69,988,-128,974,-186,962,-239,937,-294,917,-342,886,-372,834,-401,782,-435,733,-458,678,-480,624,-510,574,-545,527,-568,477,-578,419,-599,367,-605,308,-626,262,-684,270,-743,270,-783,234,-795,180,-840,140,-876,95,-899,40,-937,-7,-968,-56,-975,-116,-946,-168,-921,-222,-905,-280,-883,-336,-888,-392,-903,-445,-863,-486,-812,-515,-753,-523,-693,-524,-633,-530,-612,-579,-568,-618,-607,-651,-607,-704,-584,-759,-550,-790,-535,-848,-523,-906,-500,-962,-456,-999,-396,-995,-336,-988,-276,-981,-217,-975,-158,-962,-99,-949,-42,-931,16,-913,56,-876,64,-900,63,-957,113,-988,172,-996,232,-991,292,-984,351,-988,411,-998],[575,-791,626,-788,615,-734,605,-682,610,-628,617,-573,615,-521,663,-498,704,-461,746,-427,762,-377,750,-326,766,-287,786,-252,788,-197,790,-142,760,-101,705,-99,651,-101,618,-62,594,-13,625,21,678,33,728,52,770,87,795,134,836,170,876,205,908,247,926,299,946,349,964,400,1000,439,961,478,922,516,883,555,844,594,806,632,767,671,728,710,690,749,637,755,588,734,538,754,484,762,440,791,396,779,359,755,309,767,257,750,213,781,184,781,147,760,108,726,65,695,27,655,-5,611,-52,604,-93,639,-143,623,-196,626,-243,653,-294,638,-337,605,-370,564,-412,529,-444,485,-455,432,-482,387,-529,359,-578,338,-605,292,-616,243,-644,205,-680,164,-727,136,-775,110,-817,75,-816,27,-854,-11,-893,-49,-946,-62,-996,-81,-1000,-131,-988,-167,-941,-189,-922,-239,-906,-289,-898,-341,-865,-383,-850,-435,-799,-445,-745,-456,-699,-449,-675,-405,-637,-367,-601,-326,-560,-292,-508,-308,-455,-314,-400,-312,-345,-311,-316,-272,-265,-263,-210,-262,-164,-269,-137,-312,-87,-335,-37,-354,-19,-402,30,-427,77,-417,123,-388,165,-353,212,-341,266,-348,305,-385,344,-424,378,-466,405,-513,447,-549,485,-586,470,-637,472,-692,438,-735,453,-753,508,-753,539,-772],[157,-844,192,-825,252,-825,313,-825,374,-825,435,-825,495,-825,556,-825,617,-825,678,-825,738,-825,799,-825,815,-774,849,-724,842,-689,847,-630,851,-569,856,-510,871,-451,910,-411,956,-372,1000,-342,994,-299,951,-265,897,-242,858,-206,821,-179,813,-121,797,-63,775,-7,756,49,762,109,759,169,749,228,724,283,711,339,656,359,625,411,592,461,577,520,567,578,517,578,496,631,484,688,470,747,450,711,447,654,400,615,358,580,354,521,355,462,364,402,306,403,272,428,238,440,260,493,265,550,219,589,187,640,146,684,94,710,43,691,-6,656,-59,664,-90,710,-147,731,-183,764,-243,764,-284,731,-345,729,-404,738,-454,722,-495,678,-524,629,-583,638,-626,664,-653,716,-669,772,-693,822,-744,844,-802,831,-803,779,-791,721,-810,665,-845,616,-884,569,-879,511,-922,473,-933,421,-941,362,-989,344,-1000,301,-962,257,-976,199,-929,162,-944,108,-906,69,-874,19,-859,-34,-799,-40,-751,-50,-751,-111,-751,-171,-751,-232,-751,-293,-751,-354,-751,-414,-751,-475,-751,-536,-729,-574,-668,-574,-630,-598,-630,-659,-630,-719,-630,-780,-614,-825,-553,-825,-493,-825,-432,-825,-371,-825,-310,-825,-250,-825,-189,-825,-128,-825,-67,-825,-7,-825,54,-825,115,-825],[-417,-1000,-372,-997,-327,-998,-282,-992,-252,-960,-224,-924,-192,-893,-158,-864,-123,-835,-88,-806,-53,-778,-26,-743,-1,-705,23,-667,48,-629,62,-587,91,-557,125,-529,150,-491,175,-453,199,-416,219,-375,221,-331,256,-309,294,-288,306,-245,316,-201,323,-157,335,-115,360,-77,385,-40,410,-3,436,35,455,75,466,117,489,155,507,197,531,234,545,276,555,320,556,365,556,410,556,455,550,500,539,543,527,587,511,629,494,671,473,711,444,745,410,774,373,801,337,827,300,853,260,873,217,888,175,903,132,918,89,933,48,951,7,969,-34,988,-79,994,-123,1000,-168,1000,-211,988,-255,976,-293,954,-327,925,-360,894,-377,853,-395,811,-409,769,-421,725,-433,681,-447,639,-462,596,-478,554,-483,509,-487,464,-491,419,-495,375,-499,330,-503,285,-507,240,-511,195,-515,150,-522,105,-528,61,-536,16,-545,-28,-553,-72,-556,-117,-552,-162,-538,-204,-536,-175,-536,-130,-536,-85,-505,-86,-501,-131,-497,-176,-493,-221,-485,-265,-473,-308,-459,-351,-445,-394,-436,-438,-442,-483,-443,-527,-417,-565,-392,-602,-370,-641,-357,-684,-350,-728,-348,-773,-351,-818,-360,-862,-336,-868,-295,-849,-257,-826,-214,-827,-197,-843,-229,-873,-269,-893,-313,-902,-358,-911,-399,-926,-429,-959],[-756,-802,-705,-782,-654,-759,-596,-766,-539,-767,-481,-772,-427,-764,-369,-756,-313,-742,-256,-731,-198,-734,-142,-745,-87,-747,-33,-726,19,-737,74,-722,131,-712,186,-728,230,-700,237,-657,277,-651,332,-632,378,-602,433,-602,483,-581,539,-580,577,-601,628,-599,683,-581,701,-531,753,-537,800,-510,854,-515,902,-518,957,-529,1000,-501,982,-462,982,-412,937,-377,886,-348,837,-317,793,-283,736,-270,681,-252,628,-229,588,-189,598,-154,555,-124,524,-75,488,-29,455,18,427,70,426,125,442,181,482,220,487,260,439,292,394,328,368,376,352,431,354,479,299,489,244,502,200,540,173,591,145,641,101,645,48,658,-8,660,-65,664,-121,660,-179,662,-236,670,-277,711,-334,719,-374,757,-400,794,-448,802,-496,773,-524,723,-550,677,-527,628,-558,630,-600,590,-627,552,-679,565,-716,546,-727,489,-704,437,-666,395,-649,360,-688,325,-694,272,-666,225,-650,174,-688,135,-712,85,-714,49,-656,44,-632,-7,-651,-57,-620,-99,-618,-156,-629,-213,-607,-256,-566,-296,-524,-335,-561,-365,-577,-411,-626,-423,-678,-422,-726,-400,-782,-409,-835,-398,-833,-448,-880,-453,-930,-424,-945,-460,-933,-494,-937,-537,-961,-558,-955,-600,-1000,-632,-989,-684,-940,-712,-884,-718,-850,-751,-811,-786],[198,-1000,220,-949,242,-898,265,-847,289,-797,320,-750,350,-703,382,-657,416,-613,449,-568,476,-520,504,-471,531,-422,556,-373,573,-319,585,-265,589,-210,600,-155,594,-101,592,-46,591,9,575,62,574,118,578,173,605,207,641,205,633,260,620,314,607,368,592,422,573,475,551,526,522,573,484,611,433,633,377,639,322,635,267,632,219,655,214,706,199,744,147,726,92,719,62,674,11,693,-42,704,-86,731,-61,776,-69,820,-109,804,-137,759,-179,781,-168,834,-164,878,-192,924,-237,917,-258,876,-230,831,-254,814,-296,850,-333,892,-363,939,-404,927,-446,936,-481,978,-511,1000,-519,946,-550,903,-591,865,-596,818,-542,828,-520,806,-493,776,-523,772,-554,739,-572,687,-592,635,-577,588,-558,536,-539,484,-507,442,-489,410,-524,381,-479,348,-435,316,-432,266,-458,231,-463,184,-500,142,-499,89,-501,33,-505,-22,-519,-76,-542,-105,-592,-101,-641,-117,-637,-170,-604,-213,-556,-239,-507,-262,-458,-243,-409,-225,-383,-177,-350,-209,-368,-241,-400,-283,-418,-335,-412,-386,-435,-433,-462,-479,-470,-532,-493,-582,-469,-623,-456,-673,-424,-715,-390,-758,-356,-803,-319,-844,-269,-868,-214,-872,-158,-870,-102,-873,-47,-875,8,-867,64,-871,113,-896,141,-944,166,-994],[629,-880,685,-862,745,-863,802,-851,820,-795,834,-736,849,-680,874,-626,890,-569,891,-509,892,-449,888,-389,868,-354,815,-381,777,-337,746,-286,756,-235,787,-185,842,-164,887,-177,897,-232,956,-226,1000,-213,984,-156,970,-98,959,-39,932,15,889,56,842,91,804,137,777,190,746,241,717,294,685,345,648,392,602,430,560,472,520,517,478,560,431,597,387,637,338,671,288,705,233,730,175,733,119,746,83,773,27,775,-23,793,-80,777,-140,769,-197,781,-256,772,-313,787,-361,823,-420,828,-478,829,-534,848,-582,880,-639,866,-669,831,-723,822,-749,782,-775,813,-775,759,-785,707,-818,659,-843,607,-800,587,-785,531,-795,473,-822,420,-855,370,-884,317,-910,263,-931,207,-948,149,-971,94,-1000,42,-990,0,-964,-47,-923,-39,-904,5,-863,40,-806,56,-746,53,-688,64,-649,30,-601,-2,-582,-45,-582,-105,-582,-165,-582,-225,-582,-285,-582,-345,-582,-405,-582,-465,-576,-512,-531,-472,-505,-418,-484,-362,-489,-305,-502,-249,-457,-230,-398,-229,-351,-252,-308,-290,-261,-327,-239,-382,-215,-436,-158,-442,-109,-408,-56,-389,1,-372,59,-380,108,-407,128,-464,146,-521,203,-539,245,-580,269,-632,292,-686,342,-715,383,-752,419,-797,470,-825,520,-853,570,-877],[663,-1000,704,-995,746,-982,734,-942,724,-901,729,-858,730,-814,717,-778,747,-790,754,-772,713,-769,694,-734,690,-691,685,-648,669,-609,648,-572,623,-536,606,-496,584,-459,555,-427,535,-390,519,-349,497,-312,472,-276,451,-238,436,-197,426,-155,404,-117,382,-79,359,-43,332,-8,306,27,284,65,261,101,232,134,204,167,174,199,145,231,115,263,84,294,53,325,22,355,-9,386,-44,412,-82,434,-120,455,-158,476,-195,499,-230,524,-265,550,-297,580,-330,608,-364,636,-395,667,-425,698,-455,730,-485,762,-515,793,-544,825,-571,859,-602,890,-625,927,-645,965,-671,1000,-688,962,-715,928,-742,893,-752,853,-753,809,-753,766,-753,722,-753,679,-753,635,-753,591,-754,548,-754,504,-754,461,-754,417,-754,373,-749,332,-718,301,-689,268,-665,232,-640,197,-615,161,-579,139,-536,132,-493,124,-464,95,-431,67,-392,48,-350,35,-308,26,-264,29,-221,31,-177,33,-147,2,-118,-30,-88,-62,-59,-94,-30,-127,1,-158,31,-189,62,-220,94,-250,125,-280,156,-311,188,-341,219,-371,250,-402,279,-434,303,-471,326,-507,350,-544,374,-580,398,-617,409,-657,409,-701,409,-744,409,-788,409,-832,409,-875,430,-900,473,-910,513,-926,556,-934,597,-947,634,-969],[-96,-487,-69,-462,-48,-425,-25,-389,15,-377,30,-340,23,-298,44,-277,83,-287,123,-270,139,-307,164,-341,202,-361,241,-377,283,-378,325,-381,365,-367,401,-343,443,-344,472,-375,504,-395,546,-401,590,-400,633,-397,676,-393,714,-374,755,-361,791,-338,811,-302,840,-274,879,-255,919,-239,959,-223,1000,-211,985,-171,961,-135,945,-95,933,-54,918,-13,892,21,864,54,859,96,857,139,823,158,781,168,739,178,702,166,678,131,654,95,619,69,578,71,537,85,495,91,452,84,411,71,368,69,325,70,283,79,264,115,246,154,228,194,195,219,157,240,120,262,84,285,44,281,8,258,-32,244,-66,268,-87,304,-128,315,-170,324,-213,328,-256,332,-296,346,-326,374,-336,415,-333,454,-364,477,-407,479,-450,482,-493,485,-536,487,-579,487,-622,486,-665,485,-706,474,-743,452,-777,426,-809,396,-840,367,-881,356,-918,343,-935,304,-956,267,-973,227,-988,186,-1000,145,-991,104,-972,66,-964,23,-949,-17,-930,-56,-902,-88,-862,-92,-820,-85,-777,-81,-734,-87,-696,-107,-661,-132,-634,-165,-598,-186,-568,-213,-562,-256,-550,-297,-518,-324,-481,-346,-455,-379,-423,-407,-390,-434,-347,-434,-305,-445,-268,-432,-259,-389,-221,-385,-186,-400,-164,-437,-129,-460],[750,-656,803,-654,854,-649,871,-600,881,-548,908,-506,914,-455,944,-412,975,-369,1000,-323,951,-343,899,-352,852,-338,823,-300,829,-247,811,-207,759,-213,710,-200,680,-156,639,-125,590,-106,542,-83,493,-63,442,-49,416,-4,421,45,454,87,463,138,462,191,455,243,431,290,381,305,330,320,283,344,236,369,214,403,251,441,238,479,215,522,228,572,248,620,207,644,156,648,103,642,55,620,7,598,-43,612,-90,620,-134,591,-170,553,-204,512,-225,464,-266,469,-287,517,-314,563,-348,602,-397,611,-450,609,-503,611,-555,614,-603,591,-630,623,-669,656,-719,653,-770,639,-822,625,-862,598,-843,567,-802,534,-756,520,-705,512,-694,470,-719,424,-755,385,-792,348,-838,321,-877,292,-867,241,-854,190,-874,157,-925,154,-932,104,-900,63,-862,27,-837,-18,-880,-40,-928,-63,-976,-61,-1000,-106,-985,-157,-947,-193,-906,-227,-863,-258,-818,-285,-798,-330,-755,-336,-702,-332,-650,-322,-599,-309,-548,-291,-497,-281,-445,-271,-392,-264,-340,-258,-289,-247,-242,-239,-204,-273,-158,-298,-116,-330,-83,-371,-49,-410,0,-427,51,-441,103,-447,156,-453,209,-452,261,-447,314,-443,364,-460,410,-486,456,-508,509,-516,561,-508,612,-495,653,-505,657,-556,662,-607,700,-643],[315,-1000,372,-988,401,-937,439,-893,482,-853,515,-804,547,-755,580,-706,615,-659,652,-613,691,-570,703,-517,678,-464,673,-411,730,-396,756,-355,758,-296,772,-241,800,-189,825,-138,788,-94,747,-51,725,3,700,55,721,84,779,90,828,62,866,17,908,-22,965,-19,956,39,944,97,924,152,889,196,832,211,786,245,767,299,752,356,740,414,715,462,672,501,632,544,592,587,544,621,495,653,448,689,408,732,363,770,321,810,285,856,252,905,224,957,186,1000,143,972,96,936,50,900,-1,870,-54,845,-107,820,-162,799,-217,778,-272,757,-327,736,-382,716,-438,698,-441,649,-417,595,-444,545,-458,493,-465,457,-511,489,-570,483,-617,452,-666,421,-705,380,-717,323,-730,265,-749,210,-790,169,-847,160,-887,129,-911,75,-947,28,-940,-20,-889,2,-834,20,-795,-23,-751,-62,-714,-104,-742,-109,-798,-107,-850,-94,-899,-86,-920,-141,-924,-199,-907,-251,-848,-257,-834,-279,-889,-295,-936,-331,-965,-379,-917,-396,-860,-385,-808,-413,-775,-459,-756,-515,-706,-538,-655,-565,-615,-608,-583,-657,-559,-710,-527,-760,-497,-809,-474,-863,-453,-916,-399,-939,-341,-951,-286,-944,-231,-922,-174,-933,-116,-946,-83,-981,-38,-998,21,-998,80,-998,139,-999,197,-999,256,-999],[-478,-1000,-418,-990,-358,-996,-298,-989,-245,-965,-213,-914,-166,-877,-120,-839,-87,-789,-53,-770,-56,-710,-54,-652,-10,-611,34,-570,88,-547,139,-517,195,-495,193,-447,159,-405,205,-371,202,-339,161,-314,219,-295,262,-255,319,-237,377,-223,421,-184,470,-178,512,-222,565,-248,619,-230,663,-191,617,-175,580,-132,597,-77,644,-40,632,5,616,61,573,98,539,141,531,200,541,260,570,313,588,370,632,409,681,444,714,494,753,535,728,588,687,632,652,681,592,686,559,731,562,789,567,847,590,899,559,951,510,965,457,963,400,973,341,976,287,1000,232,999,234,947,265,899,290,844,302,788,244,774,187,754,175,705,125,671,94,622,53,577,0,550,-35,506,-78,504,-108,543,-106,599,-153,637,-162,688,-211,704,-238,655,-291,626,-340,592,-396,570,-449,543,-500,514,-537,466,-579,423,-626,386,-619,332,-566,323,-526,306,-533,248,-565,197,-602,149,-584,115,-524,119,-493,84,-536,41,-577,-3,-627,-37,-660,-80,-655,-140,-628,-194,-598,-246,-579,-303,-595,-351,-654,-351,-704,-345,-671,-376,-675,-435,-659,-479,-622,-488,-562,-491,-583,-539,-640,-561,-689,-594,-698,-648,-710,-683,-726,-731,-741,-788,-753,-838,-726,-881,-681,-918,-626,-906,-573,-934,-526,-971],[-165,-734,-98,-732,-32,-733,32,-712,86,-674,136,-629,169,-574,228,-570,285,-561,337,-527,369,-468,387,-404,435,-363,484,-332,516,-275,550,-226,605,-191,654,-149,705,-107,735,-49,725,16,768,67,793,126,800,190,792,249,791,307,832,360,868,388,922,388,946,449,982,505,989,565,980,631,1000,688,953,703,887,710,821,710,755,717,691,734,628,719,564,700,506,670,448,678,427,629,360,626,293,620,226,618,159,617,92,617,26,617,-41,616,-108,616,-175,616,-242,616,-303,641,-362,672,-426,690,-493,696,-559,692,-623,708,-687,727,-753,725,-766,667,-703,642,-677,630,-729,617,-771,630,-769,565,-768,498,-726,454,-659,454,-592,453,-525,453,-462,449,-443,393,-377,383,-310,375,-258,342,-207,329,-146,358,-85,385,-23,409,42,424,107,414,172,397,189,346,129,323,63,334,-1,331,-56,295,-120,274,-176,238,-242,234,-306,250,-350,296,-410,307,-477,306,-544,305,-611,304,-678,307,-715,267,-763,222,-739,171,-759,164,-790,121,-823,63,-862,11,-898,-44,-954,-78,-1000,-63,-992,-99,-931,-127,-879,-166,-837,-219,-795,-271,-761,-328,-727,-386,-697,-446,-680,-510,-665,-575,-630,-629,-599,-688,-539,-684,-472,-678,-406,-682,-343,-704,-277,-710,-223,-733],[-577,-820,-531,-818,-483,-810,-437,-796,-394,-772,-352,-749,-309,-725,-270,-697,-232,-666,-194,-636,-155,-606,-117,-576,-78,-546,-39,-517,9,-513,58,-509,106,-505,155,-505,203,-498,232,-468,269,-448,317,-448,336,-404,352,-362,392,-338,416,-305,453,-275,469,-255,486,-216,473,-182,492,-138,517,-98,542,-57,577,-34,593,-12,617,16,646,55,676,94,705,133,750,145,799,151,847,158,895,164,944,171,975,186,1000,228,994,273,980,320,966,367,952,413,930,452,884,469,838,485,792,502,747,519,701,535,655,552,607,559,559,566,511,574,462,581,414,588,367,599,324,622,285,649,255,688,229,729,199,764,162,746,120,737,71,733,23,726,-23,716,-72,718,-118,726,-160,707,-185,738,-186,783,-213,820,-231,792,-257,753,-276,710,-312,677,-341,639,-364,597,-381,552,-400,508,-425,469,-460,436,-503,415,-534,379,-562,339,-571,295,-587,250,-578,202,-586,156,-606,122,-627,78,-653,38,-691,8,-731,-12,-756,-54,-758,-98,-782,-141,-807,-180,-835,-216,-860,-258,-888,-297,-915,-337,-939,-379,-978,-403,-1000,-417,-988,-464,-978,-511,-948,-530,-900,-522,-855,-527,-820,-560,-786,-591,-738,-600,-713,-638,-694,-666,-726,-702,-760,-737,-763,-763,-716,-776,-669,-789,-622,-802],[568,-867,621,-865,604,-848,600,-796,623,-749,651,-704,683,-662,716,-621,748,-579,792,-553,840,-532,873,-492,901,-447,924,-399,941,-350,947,-298,953,-245,947,-193,940,-140,933,-88,937,-36,943,17,964,64,990,110,996,162,1000,215,991,267,981,319,965,369,938,412,891,432,839,424,787,434,737,452,685,460,635,448,590,421,550,386,503,383,451,396,400,409,350,416,305,444,264,476,214,468,169,439,124,411,75,400,58,439,53,492,49,545,44,597,36,649,28,702,11,751,-23,788,-69,815,-117,836,-167,853,-220,852,-272,856,-325,860,-378,864,-430,867,-483,864,-522,835,-544,786,-565,738,-609,710,-655,685,-705,670,-757,657,-804,670,-830,716,-846,766,-886,764,-935,744,-964,701,-970,650,-977,598,-992,547,-1000,497,-975,452,-934,419,-891,388,-848,357,-805,327,-761,297,-731,254,-718,203,-718,151,-721,98,-723,45,-728,-7,-733,-60,-724,-111,-700,-158,-674,-204,-644,-247,-613,-290,-581,-332,-548,-373,-515,-414,-464,-427,-418,-454,-376,-484,-335,-518,-290,-545,-238,-551,-186,-563,-135,-575,-83,-587,-34,-590,-9,-546,8,-496,46,-466,96,-477,143,-501,186,-532,229,-562,267,-599,302,-638,336,-679,373,-716,410,-754,437,-799,471,-840,516,-863],[-17,-459,24,-445,83,-438,118,-412,75,-371,34,-345,91,-366,125,-333,190,-357,254,-343,319,-350,314,-323,364,-290,436,-300,472,-321,526,-332,563,-323,579,-324,620,-299,703,-291,753,-232,815,-252,877,-250,944,-261,1000,-203,975,-126,944,-129,984,-96,951,-65,881,-18,818,-8,773,25,780,91,753,137,717,195,685,177,684,81,737,16,790,-51,775,-46,741,-54,669,-12,631,24,589,8,516,12,452,79,431,140,454,156,485,176,480,264,448,353,398,433,351,454,369,378,403,309,350,287,301,224,250,163,208,222,149,257,71,273,-6,251,-69,205,-110,255,-178,249,-235,268,-298,230,-340,180,-390,164,-432,135,-504,134,-564,167,-559,222,-625,229,-681,211,-734,257,-745,312,-743,368,-744,433,-766,459,-832,424,-882,375,-856,326,-845,279,-901,245,-946,201,-958,142,-999,87,-1000,7,-999,-23,-970,-96,-980,-170,-985,-240,-942,-250,-872,-229,-837,-171,-925,-179,-912,-153,-871,-118,-840,-135,-789,-165,-780,-226,-753,-182,-683,-226,-659,-218,-591,-224,-542,-256,-463,-228,-492,-287,-435,-339,-415,-272,-421,-190,-437,-169,-389,-228,-337,-203,-396,-241,-389,-315,-360,-295,-360,-316,-299,-310,-277,-277,-293,-324,-259,-360,-230,-356,-228,-385,-154,-412,-108,-418,-63,-428],[385,-698,426,-667,453,-624,476,-578,492,-529,522,-487,548,-443,578,-402,605,-359,642,-323,666,-279,683,-231,690,-181,688,-131,675,-81,665,-30,666,21,674,72,659,114,687,157,720,195,768,214,805,213,843,202,889,179,938,166,983,190,1000,234,991,285,976,334,931,352,881,364,869,336,860,299,833,330,823,377,813,426,815,454,785,495,780,545,781,597,771,647,745,678,695,670,649,648,619,606,575,603,525,593,480,569,435,550,384,558,334,570,286,588,241,613,200,644,164,680,116,698,65,696,14,689,-37,678,-87,668,-138,667,-189,667,-239,659,-290,647,-341,640,-392,642,-441,644,-432,601,-424,565,-467,538,-498,500,-524,459,-490,429,-494,400,-541,389,-580,421,-619,418,-662,394,-709,378,-751,352,-740,332,-756,306,-747,269,-758,233,-804,211,-848,187,-885,152,-889,103,-900,70,-929,30,-971,1,-1000,-41,-956,-59,-909,-58,-874,-90,-825,-90,-798,-131,-783,-172,-752,-210,-735,-253,-707,-297,-688,-341,-664,-387,-637,-428,-624,-476,-587,-511,-550,-543,-501,-549,-462,-583,-423,-615,-385,-646,-341,-623,-291,-619,-241,-609,-190,-602,-142,-595,-92,-601,-53,-569,-15,-534,31,-552,73,-579,122,-595,173,-604,223,-614,265,-636,284,-683,334,-695],[-143,-1000,-104,-992,-95,-949,-108,-904,-69,-885,-23,-909,27,-909,76,-898,127,-890,177,-903,203,-944,252,-935,302,-938,352,-930,389,-906,389,-854,417,-823,467,-813,492,-771,460,-732,418,-700,375,-672,340,-634,306,-596,281,-559,299,-511,307,-459,307,-408,303,-356,313,-307,274,-273,246,-233,281,-195,281,-144,264,-95,235,-54,184,-47,132,-47,100,-28,128,15,157,54,172,104,195,150,236,176,254,219,234,266,198,302,170,343,161,394,159,443,188,486,217,530,263,535,254,581,212,605,174,639,147,684,119,726,104,776,113,827,123,878,133,929,88,948,43,976,-2,1000,-51,989,-99,971,-151,967,-203,961,-252,966,-303,973,-345,991,-328,944,-312,895,-296,845,-293,794,-289,742,-289,691,-304,641,-302,592,-289,542,-292,490,-310,441,-266,442,-270,420,-318,411,-367,429,-412,431,-415,380,-402,342,-357,321,-345,274,-332,226,-292,194,-324,206,-354,247,-379,293,-411,327,-462,336,-492,304,-484,253,-475,202,-465,152,-457,102,-436,61,-403,22,-380,-25,-361,-73,-341,-121,-320,-169,-299,-217,-311,-264,-300,-314,-289,-365,-275,-415,-254,-462,-250,-514,-245,-566,-249,-618,-266,-667,-277,-717,-287,-769,-290,-820,-302,-841,-311,-889,-281,-932,-241,-965,-194,-986],[-158,-947,-103,-916,-73,-885,-127,-917,-119,-870,-90,-815,-34,-790,29,-797,87,-816,146,-817,209,-813,271,-809,334,-806,397,-803,459,-800,522,-797,585,-794,648,-791,710,-789,766,-798,815,-766,864,-728,875,-668,886,-607,899,-545,920,-486,940,-427,956,-366,962,-303,952,-244,897,-214,849,-175,815,-123,859,-84,906,-46,901,15,888,74,900,134,912,193,942,247,967,304,1000,354,991,398,995,459,954,499,903,529,859,574,818,622,779,671,744,723,710,775,722,836,720,898,742,947,683,930,625,907,577,872,532,834,473,817,410,817,364,851,308,829,247,830,198,866,159,883,133,860,101,818,70,765,22,794,-23,825,-58,788,-82,734,-110,681,-158,653,-209,626,-260,634,-302,589,-280,545,-327,544,-380,518,-436,492,-435,533,-465,573,-511,582,-546,529,-584,487,-544,443,-593,419,-643,409,-700,384,-758,363,-786,312,-831,315,-867,348,-842,290,-827,229,-840,169,-885,130,-894,72,-898,14,-880,-45,-892,-102,-916,-155,-915,-214,-957,-260,-1000,-305,-975,-355,-948,-410,-954,-472,-970,-533,-970,-584,-913,-558,-918,-617,-979,-632,-960,-651,-902,-673,-844,-695,-784,-716,-724,-735,-664,-753,-603,-766,-559,-807,-517,-854,-456,-868,-402,-899,-343,-920,-282,-935,-221,-946],[-271,-1000,-211,-976,-155,-944,-98,-914,-37,-895,25,-904,61,-956,110,-932,106,-870,72,-816,67,-751,64,-687,84,-626,127,-581,147,-523,174,-480,155,-419,129,-360,100,-302,80,-241,46,-192,-16,-175,-74,-145,-117,-100,-110,-40,-137,16,-170,71,-164,130,-136,188,-105,245,-95,297,-99,357,-78,418,-57,479,-12,524,48,549,100,534,80,485,130,449,188,424,251,434,308,463,345,515,354,577,390,614,430,575,427,519,475,542,536,564,596,585,576,624,517,641,537,695,579,744,594,804,627,826,685,853,699,899,688,962,655,1000,617,955,636,894,583,894,521,883,464,851,428,814,408,756,371,706,315,673,271,627,227,581,171,554,176,615,201,670,228,729,219,787,179,762,150,705,102,663,55,618,3,582,-54,551,-115,567,-160,608,-202,647,-265,640,-319,610,-362,567,-415,590,-426,538,-426,474,-391,422,-343,379,-322,323,-366,279,-424,255,-448,280,-437,344,-466,384,-504,339,-538,287,-584,260,-609,203,-617,139,-639,78,-649,14,-655,-50,-676,-109,-699,-166,-692,-230,-644,-211,-595,-171,-540,-150,-499,-190,-515,-252,-526,-315,-522,-380,-497,-439,-490,-503,-490,-568,-498,-629,-505,-692,-488,-754,-471,-817,-450,-877,-434,-940,-394,-979,-335,-992],[-23,-1000,25,-987,65,-950,89,-902,137,-876,167,-836,202,-805,213,-756,265,-750,319,-750,366,-770,417,-755,467,-755,515,-729,529,-691,499,-643,469,-596,517,-586,551,-544,510,-549,457,-547,408,-525,353,-515,305,-489,260,-456,229,-419,211,-367,206,-316,175,-280,137,-241,127,-200,131,-162,152,-123,181,-79,213,-36,211,11,238,24,292,37,311,86,363,90,418,81,461,46,483,48,478,101,478,158,490,193,539,197,594,195,621,243,649,292,677,341,677,389,658,436,650,490,668,541,641,583,615,628,629,674,615,724,641,773,656,795,630,839,592,877,592,921,569,958,538,1000,487,994,443,959,399,926,368,885,319,859,276,825,224,804,173,780,122,757,74,730,26,701,-18,669,-54,626,-98,593,-129,547,-131,505,-133,452,-162,404,-190,356,-226,316,-241,264,-281,226,-296,173,-326,125,-348,74,-368,22,-394,-28,-415,-79,-446,-125,-479,-168,-503,-219,-536,-264,-581,-296,-630,-323,-664,-362,-633,-391,-662,-439,-677,-487,-673,-540,-635,-582,-596,-621,-562,-614,-574,-570,-578,-544,-563,-531,-514,-518,-479,-488,-435,-462,-404,-502,-387,-550,-366,-600,-345,-626,-319,-668,-270,-694,-218,-713,-167,-735,-121,-769,-84,-810,-53,-856,-37,-907,-23,-943,-55,-987],[-142,-1000,-95,-972,-49,-943,-3,-913,43,-884,70,-841,68,-787,88,-737,103,-687,126,-643,137,-595,137,-542,128,-491,119,-439,115,-385,107,-333,146,-309,194,-301,247,-291,300,-288,353,-277,406,-285,444,-322,482,-290,530,-273,583,-266,605,-218,633,-175,628,-122,641,-70,650,-17,651,36,671,84,683,136,735,146,788,131,836,106,885,113,928,147,923,189,928,242,917,296,903,348,893,402,880,453,857,501,855,556,853,611,848,665,838,719,819,770,782,806,743,842,700,864,662,897,639,941,599,972,551,949,499,957,466,1000,420,986,367,987,316,981,262,979,209,967,156,951,102,942,48,939,-6,945,-40,919,-8,877,28,840,50,796,58,746,68,693,100,652,131,611,157,563,192,524,188,474,154,432,112,398,61,378,14,366,-34,341,-84,320,-133,295,-180,268,-222,233,-266,201,-312,170,-361,148,-415,143,-468,130,-520,112,-568,86,-601,45,-647,16,-687,-18,-733,-48,-772,-86,-803,-132,-828,-180,-861,-224,-905,-255,-928,-296,-912,-348,-897,-401,-882,-453,-867,-506,-852,-559,-849,-613,-849,-668,-831,-717,-801,-763,-771,-809,-752,-860,-734,-911,-681,-922,-627,-934,-574,-946,-521,-958,-467,-970,-414,-981,-360,-993,-306,-998,-251,-998,-197,-999],[-950,-810,-892,-789,-836,-764,-780,-741,-725,-714,-667,-693,-609,-673,-549,-661,-488,-650,-436,-620,-385,-586,-328,-567,-269,-562,-224,-525,-177,-485,-127,-454,-77,-426,-34,-382,-12,-328,-17,-267,16,-231,76,-217,133,-193,188,-167,244,-141,305,-137,355,-103,394,-56,400,4,345,21,284,22,228,37,240,89,266,145,309,187,352,231,401,267,454,297,474,355,502,404,532,454,569,497,629,487,682,499,672,558,718,594,778,602,832,620,784,648,822,692,881,710,941,723,1000,728,947,747,931,767,942,801,883,810,829,787,780,751,719,743,658,735,597,727,540,717,481,706,422,702,364,683,327,635,284,592,233,557,219,501,176,487,140,439,105,388,73,337,33,291,-23,268,-84,260,-143,244,-195,219,-242,198,-288,213,-341,228,-398,206,-438,171,-405,222,-396,267,-429,279,-457,295,-485,326,-546,338,-606,336,-666,342,-711,311,-698,332,-646,345,-587,358,-534,387,-495,434,-519,482,-575,507,-629,537,-684,527,-743,515,-804,520,-865,518,-923,518,-978,503,-978,441,-978,380,-978,318,-978,257,-978,195,-978,134,-978,72,-1000,18,-983,-41,-978,-101,-978,-163,-978,-224,-978,-286,-978,-348,-978,-409,-978,-471,-978,-532,-978,-594,-978,-655,-978,-717,-978,-778],[213,-413,273,-405,331,-394,388,-380,438,-358,498,-359,557,-350,613,-328,669,-305,722,-279,772,-245,814,-203,853,-159,902,-124,951,-88,918,-39,944,9,972,62,1000,115,999,167,959,207,941,257,893,293,852,268,815,258,818,317,785,363,761,403,723,357,685,311,653,260,623,208,598,154,614,117,643,78,666,32,706,23,751,61,802,91,784,65,735,31,705,-21,665,-2,619,-19,605,-5,579,-6,561,-63,523,-106,473,-138,423,-169,372,-200,314,-213,254,-211,203,-185,152,-155,124,-102,125,-63,75,-30,24,4,-28,32,-87,43,-116,90,-87,138,-51,186,-9,229,28,276,27,327,-30,341,-79,365,-125,398,-184,411,-244,413,-269,365,-284,307,-308,252,-320,194,-358,197,-368,256,-414,262,-470,240,-502,190,-532,138,-562,91,-620,74,-678,64,-724,51,-767,44,-826,41,-885,30,-939,52,-942,108,-962,70,-1000,25,-953,-11,-938,-64,-962,-118,-922,-160,-913,-202,-965,-228,-971,-284,-971,-344,-942,-389,-901,-401,-848,-396,-806,-381,-772,-338,-762,-280,-712,-273,-730,-219,-679,-190,-621,-191,-574,-200,-611,-246,-570,-228,-525,-189,-485,-146,-426,-132,-366,-134,-308,-147,-251,-166,-204,-203,-152,-233,-95,-252,-37,-269,16,-295,63,-331,116,-356,160,-397],[720,-961,784,-950,831,-922,873,-874,875,-814,926,-790,973,-764,1000,-703,976,-654,920,-628,859,-605,795,-607,730,-621,664,-634,611,-598,621,-547,658,-517,629,-469,626,-414,667,-367,709,-341,742,-301,793,-267,736,-235,692,-190,693,-124,681,-77,636,-30,617,26,560,60,532,118,501,178,450,219,405,266,370,322,326,363,260,377,207,365,157,356,120,412,76,463,64,526,125,551,143,605,152,667,209,687,226,750,253,812,255,869,198,883,149,880,90,900,27,887,-31,886,-55,930,-108,961,-156,952,-194,917,-216,857,-251,808,-285,769,-308,708,-350,709,-343,713,-409,728,-476,732,-537,749,-598,734,-658,725,-709,748,-775,744,-836,758,-896,761,-920,720,-904,657,-882,598,-834,564,-771,543,-725,518,-717,460,-779,451,-775,385,-778,318,-827,287,-890,264,-930,211,-957,150,-1000,98,-980,89,-916,110,-851,131,-785,139,-718,133,-651,134,-591,128,-525,119,-459,112,-394,93,-335,64,-335,1,-328,-65,-284,-114,-226,-123,-162,-136,-151,-171,-95,-205,-35,-193,19,-204,34,-265,50,-327,73,-388,136,-406,149,-457,111,-511,164,-519,231,-521,264,-568,266,-622,313,-670,327,-727,305,-790,290,-838,342,-875,395,-914,459,-934,526,-940,594,-942,657,-946],[107,-1000,124,-952,148,-908,177,-866,208,-827,242,-789,282,-758,328,-739,377,-724,426,-712,476,-704,523,-688,571,-682,617,-670,650,-634,682,-596,707,-552,741,-515,768,-472,803,-436,850,-419,881,-390,872,-340,845,-297,823,-253,797,-210,774,-165,734,-134,695,-102,662,-63,635,-20,611,24,589,70,554,99,517,82,506,51,472,86,443,127,430,175,416,224,404,273,412,322,415,373,425,423,386,445,335,448,285,457,238,474,196,502,164,540,152,589,139,638,106,676,57,688,7,692,-43,699,-93,710,-127,746,-152,789,-144,835,-169,879,-207,910,-256,923,-304,908,-354,908,-405,913,-448,937,-494,957,-540,976,-590,982,-637,1000,-658,953,-678,907,-698,860,-726,822,-746,776,-765,729,-785,682,-804,635,-823,588,-843,541,-862,495,-881,448,-852,423,-804,406,-757,388,-709,372,-661,354,-613,337,-566,320,-518,303,-470,286,-423,269,-375,252,-327,235,-279,218,-232,201,-203,166,-188,117,-173,69,-158,20,-143,-28,-128,-76,-113,-125,-98,-173,-83,-222,-68,-270,-79,-315,-105,-359,-131,-402,-158,-445,-163,-494,-159,-544,-140,-591,-121,-638,-101,-684,-88,-733,-82,-768,-32,-774,15,-787,-11,-822,-27,-851,-33,-900,-28,-950,-14,-995,21,-985,33,-947,74,-975],[655,-1000,661,-944,678,-876,714,-965,793,-943,860,-895,785,-853,739,-845,802,-794,856,-798,810,-767,747,-704,749,-747,693,-810,617,-827,538,-789,518,-695,465,-622,383,-641,295,-646,241,-726,178,-689,150,-629,108,-593,15,-610,-7,-528,-79,-501,-108,-423,-136,-339,-174,-257,-218,-197,-234,-102,-277,-14,-253,66,-337,84,-379,167,-384,258,-372,354,-372,448,-343,530,-359,604,-368,699,-411,777,-421,871,-477,805,-486,765,-512,853,-555,866,-606,938,-675,1000,-744,996,-796,938,-811,855,-790,853,-761,769,-833,830,-825,749,-802,731,-766,647,-741,637,-783,658,-832,739,-838,688,-845,638,-843,608,-828,539,-735,527,-683,516,-710,522,-779,523,-854,497,-860,427,-782,426,-791,412,-837,367,-767,337,-770,304,-679,306,-680,281,-727,252,-645,234,-645,217,-627,155,-569,152,-500,168,-440,120,-462,96,-517,159,-534,99,-481,18,-423,-39,-391,-89,-339,-115,-376,-148,-325,-219,-272,-257,-319,-272,-279,-343,-247,-393,-170,-415,-213,-448,-155,-445,-188,-483,-165,-518,-130,-563,-102,-543,-64,-584,-75,-601,-38,-651,10,-723,60,-738,92,-801,119,-760,162,-815,151,-741,173,-808,240,-830,236,-858,295,-882,351,-838,390,-907,430,-974,505,-976,479,-899,498,-889,557,-967,574,-916,620,-961],[687,-1000,740,-1000,789,-973,798,-916,836,-868,881,-830,913,-778,903,-738,846,-735,795,-701,757,-655,717,-609,688,-555,649,-507,634,-449,656,-393,650,-332,645,-271,647,-210,600,-175,544,-149,499,-108,467,-55,413,-25,361,6,324,53,276,90,223,118,162,124,115,160,64,193,15,227,12,287,11,349,-25,375,-30,434,27,459,83,482,121,531,166,573,215,609,254,657,221,707,190,760,133,779,72,773,10,778,-52,775,-112,784,-159,823,-195,873,-235,920,-249,976,-305,954,-361,953,-403,991,-433,943,-485,915,-529,923,-566,972,-618,1000,-645,952,-704,935,-704,903,-658,870,-717,863,-775,854,-802,834,-762,792,-746,734,-709,684,-656,652,-598,636,-589,615,-648,606,-680,561,-654,505,-628,448,-607,391,-620,331,-662,296,-719,275,-770,241,-804,252,-836,260,-863,207,-913,170,-909,113,-877,62,-828,24,-786,-20,-733,-45,-691,-84,-636,-113,-583,-140,-535,-173,-487,-204,-431,-223,-397,-275,-353,-317,-319,-368,-284,-414,-269,-474,-230,-518,-178,-544,-130,-514,-104,-460,-46,-441,13,-428,73,-419,134,-423,187,-397,222,-448,215,-503,178,-552,154,-607,199,-636,260,-636,322,-638,383,-645,436,-667,484,-705,506,-761,551,-797,604,-786,646,-820,656,-881,668,-942],[-553,-811,-499,-807,-444,-790,-389,-777,-347,-738,-314,-691,-265,-672,-213,-690,-163,-718,-108,-722,-58,-695,-8,-666,45,-646,102,-639,159,-637,199,-678,246,-711,301,-725,359,-730,416,-731,473,-728,528,-713,578,-686,635,-685,672,-726,723,-754,774,-778,829,-789,863,-742,896,-696,914,-642,924,-586,963,-558,1000,-519,992,-462,983,-409,934,-379,882,-358,848,-312,817,-263,803,-208,772,-162,765,-105,727,-70,703,-21,693,35,653,74,613,106,594,159,572,212,551,263,524,309,511,351,485,397,446,437,403,423,374,377,329,341,290,370,244,353,197,385,165,431,119,465,78,506,47,553,33,609,18,664,-11,714,-47,720,-64,727,-80,764,-137,769,-187,755,-229,766,-261,745,-274,789,-307,759,-313,765,-325,801,-352,794,-402,805,-420,811,-471,787,-514,750,-539,698,-540,661,-534,626,-554,618,-562,591,-559,572,-596,571,-628,526,-670,487,-719,458,-776,449,-833,450,-860,439,-838,421,-887,444,-941,454,-998,456,-988,401,-992,346,-991,289,-996,236,-1000,179,-999,122,-994,65,-988,8,-939,-9,-926,-63,-894,-108,-858,-143,-846,-195,-824,-230,-816,-280,-828,-336,-858,-383,-857,-436,-846,-482,-843,-539,-835,-594,-791,-630,-767,-682,-758,-739,-717,-775,-664,-795,-607,-796],[493,-788,542,-784,591,-772,640,-761,689,-749,731,-721,769,-688,812,-684,856,-708,889,-706,898,-656,906,-606,911,-556,926,-511,954,-469,962,-425,995,-388,1000,-346,981,-300,977,-249,973,-199,968,-148,964,-98,960,-47,956,3,952,54,940,101,906,138,872,176,837,213,804,251,775,293,747,335,723,379,696,422,700,470,711,519,664,532,618,553,577,582,537,603,492,583,444,568,394,565,343,567,293,573,247,592,211,629,165,638,115,632,68,613,25,586,-21,569,-66,588,-113,605,-156,600,-184,558,-222,525,-271,514,-319,498,-365,513,-416,513,-463,530,-496,564,-505,613,-533,655,-559,693,-560,744,-565,788,-603,757,-635,718,-676,701,-722,719,-724,755,-754,715,-741,681,-774,653,-821,663,-861,632,-898,602,-885,568,-896,545,-939,521,-969,482,-982,437,-1000,394,-987,349,-937,352,-890,338,-850,309,-799,306,-749,304,-698,303,-648,301,-606,293,-572,279,-532,249,-515,202,-496,156,-489,106,-484,57,-484,7,-484,-44,-484,-95,-484,-145,-485,-196,-447,-216,-397,-226,-347,-236,-298,-245,-257,-274,-219,-308,-181,-341,-144,-375,-106,-409,-67,-441,-24,-468,19,-495,63,-521,106,-548,149,-574,192,-601,235,-628,278,-654,321,-681,364,-708,407,-734,450,-761],[878,-974,939,-973,1000,-969,964,-921,935,-893,906,-919,901,-870,943,-838,958,-779,974,-720,983,-661,957,-606,924,-555,885,-509,867,-450,850,-392,839,-332,829,-272,819,-211,825,-151,834,-90,841,-30,837,31,832,92,837,152,840,210,794,194,805,137,808,77,786,122,740,160,754,215,780,269,771,329,764,385,728,389,711,442,736,479,772,515,769,570,729,614,698,667,686,725,698,785,724,840,761,886,777,928,728,962,669,974,610,962,550,953,516,905,471,864,412,858,355,837,296,838,242,867,187,866,129,846,72,825,14,804,-43,784,-99,773,-137,820,-171,786,-211,740,-254,697,-301,658,-349,619,-396,581,-443,542,-486,499,-523,451,-559,401,-589,348,-626,301,-674,263,-724,228,-772,191,-813,146,-858,104,-902,63,-950,25,-1000,-11,-990,-60,-942,-66,-899,-23,-854,-50,-793,-53,-732,-57,-687,-94,-675,-154,-629,-185,-582,-208,-593,-268,-602,-328,-605,-389,-556,-411,-495,-410,-434,-405,-390,-442,-352,-490,-307,-531,-264,-509,-215,-473,-163,-446,-138,-492,-88,-524,-39,-560,3,-605,49,-645,101,-672,99,-731,134,-778,161,-818,197,-864,253,-883,298,-845,349,-814,409,-808,462,-835,507,-847,560,-845,607,-873,667,-874,722,-899,779,-918,824,-952],[589,-1000,540,-979,552,-915,607,-881,619,-815,634,-750,691,-775,747,-814,801,-852,834,-849,811,-799,811,-759,841,-812,873,-840,910,-822,869,-770,898,-775,931,-786,890,-736,863,-682,865,-625,909,-595,875,-538,833,-484,807,-427,762,-376,725,-320,698,-258,663,-200,610,-160,558,-119,528,-85,509,-45,541,-36,570,20,630,45,613,103,552,85,488,89,484,52,442,97,392,54,402,87,374,131,314,162,252,180,210,225,200,264,185,330,178,397,143,439,160,477,121,533,104,598,77,660,75,719,50,762,-13,782,-52,837,-101,884,-147,933,-193,979,-258,997,-325,1000,-390,982,-455,991,-500,965,-535,913,-602,915,-645,869,-702,849,-759,875,-826,872,-882,847,-846,793,-877,810,-880,769,-931,783,-921,732,-854,721,-837,699,-848,660,-850,647,-871,608,-846,577,-796,596,-774,565,-809,538,-782,487,-775,467,-728,420,-703,444,-689,387,-639,342,-605,341,-594,282,-549,232,-504,181,-450,142,-386,137,-331,98,-309,83,-259,40,-198,11,-145,-18,-125,-56,-76,-102,-25,-137,-21,-160,39,-158,47,-197,71,-209,113,-262,136,-235,140,-278,170,-338,196,-379,208,-443,226,-508,246,-573,301,-602,347,-651,376,-711,392,-777,401,-844,427,-906,472,-956,523,-999],[623,-1000,682,-999,722,-954,762,-911,819,-892,852,-859,850,-799,850,-739,850,-679,832,-622,810,-566,793,-509,782,-450,760,-402,700,-402,641,-397,632,-344,637,-290,687,-259,747,-260,779,-212,775,-152,758,-95,718,-51,671,-13,632,27,664,75,652,127,601,155,545,178,489,185,440,180,383,159,331,185,283,218,299,274,331,325,353,377,383,429,396,486,383,545,361,600,341,656,367,699,324,740,280,781,244,804,290,837,327,883,316,941,303,1000,243,997,184,990,148,945,162,893,188,844,207,787,226,730,191,688,134,669,91,628,46,611,-13,619,-67,594,-107,550,-121,492,-156,485,-204,513,-237,478,-278,462,-323,500,-372,470,-420,484,-424,538,-477,541,-533,518,-587,493,-644,496,-701,504,-755,479,-811,465,-852,422,-826,380,-767,373,-707,375,-651,394,-603,430,-555,466,-498,468,-513,433,-567,407,-599,370,-540,362,-544,320,-581,272,-619,226,-615,175,-594,119,-561,69,-516,30,-480,-18,-444,-67,-412,-118,-384,-170,-363,-227,-347,-285,-335,-344,-324,-403,-312,-462,-301,-521,-283,-578,-255,-630,-201,-607,-147,-634,-96,-666,-48,-701,1,-737,32,-787,59,-840,103,-880,157,-907,211,-934,266,-958,324,-974,384,-979,444,-982,504,-988,563,-997],[-603,-562,-560,-556,-517,-547,-493,-513,-471,-476,-433,-454,-395,-433,-361,-405,-326,-378,-289,-355,-247,-346,-211,-324,-183,-291,-157,-255,-127,-225,-85,-234,-44,-251,-4,-236,13,-196,28,-154,61,-128,95,-100,133,-78,166,-52,208,-55,251,-62,250,-26,249,15,289,27,333,30,377,30,413,51,437,87,456,127,486,114,500,77,529,106,567,127,599,106,625,80,658,103,699,117,735,141,775,157,818,158,862,159,904,150,946,139,989,144,997,183,982,224,970,266,964,310,959,353,978,391,997,431,1000,473,987,515,971,556,932,550,889,553,846,556,805,558,765,562,732,536,704,522,665,541,624,540,584,521,543,505,500,498,459,492,417,500,395,465,370,435,329,448,288,461,259,434,220,419,182,397,143,377,135,335,114,301,73,284,32,269,-7,253,-49,266,-85,279,-127,265,-170,261,-203,284,-244,269,-287,258,-329,246,-349,212,-384,198,-425,191,-462,168,-498,143,-538,139,-578,134,-615,111,-652,88,-687,61,-716,29,-749,1,-787,-20,-825,-41,-861,-67,-895,-67,-932,-77,-968,-102,-1000,-130,-994,-173,-972,-209,-954,-248,-952,-291,-937,-333,-919,-372,-893,-408,-865,-441,-831,-468,-798,-498,-761,-493,-732,-465,-699,-490,-677,-528,-646,-554],[-760,-958,-715,-926,-668,-894,-611,-895,-553,-895,-496,-895,-438,-895,-381,-895,-323,-895,-266,-895,-208,-895,-151,-895,-93,-895,-36,-894,13,-873,54,-834,110,-828,167,-819,224,-817,282,-816,334,-794,391,-804,446,-799,503,-809,559,-821,616,-832,672,-843,728,-855,784,-867,841,-877,898,-877,955,-871,1000,-837,959,-826,910,-798,860,-795,811,-765,770,-726,737,-764,695,-796,639,-787,582,-776,526,-765,469,-757,412,-748,371,-729,371,-672,372,-614,372,-557,372,-499,372,-442,372,-384,372,-327,372,-270,372,-212,371,-155,315,-153,258,-153,224,-130,224,-72,224,-15,224,43,224,100,224,158,224,215,224,273,224,330,224,388,224,445,224,502,224,560,224,617,224,675,224,732,224,790,224,847,205,886,155,911,120,948,71,958,15,951,-43,954,-97,938,-152,924,-161,872,-191,832,-237,835,-257,888,-304,909,-346,869,-388,831,-421,784,-451,735,-475,683,-491,628,-493,573,-520,525,-530,469,-535,413,-540,356,-547,300,-572,248,-589,193,-589,136,-592,79,-599,22,-587,-16,-592,-73,-616,-124,-651,-170,-680,-219,-707,-270,-738,-318,-761,-371,-779,-425,-806,-475,-832,-526,-857,-578,-882,-630,-912,-678,-952,-720,-977,-771,-996,-824,-1000,-882,-976,-921,-923,-924,-867,-929,-816,-956],[557,-1000,576,-977,577,-933,567,-881,575,-825,574,-768,575,-717,580,-679,580,-623,584,-565,589,-519,610,-501,595,-449,581,-399,546,-354,515,-307,487,-273,439,-241,394,-208,340,-192,288,-169,236,-144,188,-111,153,-68,115,-25,82,4,43,29,1,68,-39,110,-86,135,-96,151,-101,209,-70,256,-52,311,-35,365,-28,422,-20,446,-3,445,-7,502,-10,557,-22,614,-6,643,-31,694,-73,733,-126,756,-181,774,-235,795,-286,822,-326,861,-336,911,-304,908,-309,966,-336,1000,-394,998,-406,949,-413,895,-417,843,-416,786,-417,728,-427,672,-449,619,-469,566,-481,510,-497,454,-456,414,-416,372,-377,329,-363,282,-347,230,-313,184,-304,131,-322,78,-333,30,-308,-16,-303,-72,-303,-130,-306,-187,-305,-242,-355,-265,-411,-277,-459,-306,-511,-328,-569,-331,-601,-360,-610,-416,-604,-461,-550,-481,-495,-497,-440,-517,-386,-536,-331,-555,-276,-574,-244,-528,-197,-514,-142,-525,-120,-474,-120,-417,-143,-364,-136,-317,-105,-272,-65,-231,-46,-192,-36,-239,-35,-292,11,-317,29,-368,28,-425,33,-481,6,-530,-29,-577,-66,-621,-114,-649,-122,-705,-132,-762,-132,-817,-109,-869,-52,-873,5,-872,55,-880,103,-856,156,-874,209,-857,260,-882,301,-910,352,-902,405,-923,457,-943,511,-964],[451,-1000,467,-955,506,-921,555,-904,606,-911,656,-914,707,-912,739,-922,776,-895,828,-893,863,-857,878,-816,888,-771,889,-719,897,-669,904,-620,922,-572,963,-539,945,-499,917,-477,865,-479,813,-481,761,-476,731,-441,682,-424,632,-416,634,-366,657,-328,611,-312,568,-282,519,-264,482,-231,449,-191,402,-170,350,-162,306,-152,271,-130,220,-129,178,-101,134,-74,91,-44,50,-12,42,36,42,88,40,138,28,175,17,214,-35,215,-79,242,-126,241,-174,235,-224,227,-274,242,-281,281,-313,321,-343,357,-373,391,-387,441,-399,492,-422,538,-465,568,-498,606,-525,650,-572,672,-602,712,-615,763,-624,814,-629,866,-656,909,-678,952,-703,995,-754,998,-806,993,-858,991,-910,993,-962,1000,-963,956,-947,907,-909,875,-888,827,-868,781,-852,735,-829,689,-841,686,-820,651,-781,616,-747,577,-712,540,-707,489,-694,439,-675,390,-659,341,-621,308,-575,284,-542,245,-526,195,-506,147,-478,105,-429,90,-378,78,-330,59,-287,31,-251,-7,-207,-35,-168,-69,-136,-110,-106,-153,-79,-197,-75,-248,-101,-290,-97,-341,-91,-393,-67,-438,-37,-481,-26,-532,3,-571,38,-610,76,-645,123,-668,171,-688,218,-711,261,-739,290,-783,315,-829,336,-876,355,-925,373,-973,414,-994],[-379,-1000,-329,-996,-279,-978,-229,-993,-176,-995,-175,-942,-153,-894,-108,-866,-65,-835,-24,-802,17,-768,50,-726,83,-684,115,-642,149,-601,189,-566,239,-551,285,-524,329,-495,378,-476,430,-464,482,-452,527,-425,571,-395,614,-364,658,-334,704,-306,752,-284,797,-257,839,-224,849,-173,825,-136,774,-120,728,-99,706,-55,653,-60,600,-60,566,-26,593,20,611,70,614,121,605,174,571,200,524,225,477,249,427,267,375,279,329,265,307,218,309,165,306,112,273,77,228,105,199,149,172,195,147,242,118,287,86,329,55,372,26,417,-2,462,-28,508,-54,555,-77,603,-99,651,-64,692,-42,739,-30,790,-33,842,-32,894,-40,947,-44,1000,-74,998,-117,967,-161,937,-194,897,-214,848,-235,799,-267,757,-302,717,-337,678,-373,638,-408,598,-443,558,-487,529,-531,499,-576,469,-620,439,-664,410,-683,366,-670,323,-722,328,-771,337,-802,296,-831,252,-849,204,-823,168,-784,131,-755,88,-759,37,-785,-10,-810,-57,-827,-106,-833,-159,-837,-212,-840,-265,-841,-318,-812,-360,-761,-372,-708,-380,-684,-412,-684,-465,-682,-518,-663,-568,-643,-617,-610,-657,-572,-694,-531,-728,-490,-762,-439,-771,-397,-744,-370,-699,-324,-709,-318,-762,-332,-811,-357,-858,-381,-905,-402,-954],[-285,-471,-245,-452,-201,-446,-160,-427,-117,-418,-103,-381,-92,-341,-54,-320,-13,-305,28,-314,71,-327,113,-330,156,-321,195,-305,234,-290,255,-262,288,-234,332,-231,376,-221,418,-216,459,-229,502,-238,545,-248,579,-270,614,-297,654,-316,696,-304,733,-281,775,-291,793,-262,774,-221,758,-179,744,-138,731,-102,762,-91,805,-98,843,-80,875,-110,917,-104,950,-76,977,-42,1000,-5,972,16,931,5,889,11,851,19,821,40,786,57,769,97,733,123,689,129,657,147,622,175,582,182,541,166,500,159,479,198,479,239,504,276,473,303,436,328,409,364,370,384,328,397,283,398,238,402,194,409,152,425,112,446,76,471,40,461,8,456,-33,446,-74,430,-117,418,-149,388,-194,383,-238,376,-282,384,-326,378,-371,372,-416,365,-460,371,-484,338,-504,300,-521,258,-539,231,-580,215,-618,193,-652,167,-697,162,-741,158,-785,152,-816,130,-815,87,-807,48,-802,5,-826,-31,-842,-73,-869,-95,-906,-112,-945,-124,-973,-154,-994,-180,-1000,-216,-972,-243,-934,-249,-900,-258,-876,-287,-840,-308,-802,-328,-763,-346,-724,-360,-693,-357,-662,-347,-617,-344,-593,-317,-561,-296,-521,-284,-483,-290,-442,-283,-404,-269,-368,-292,-348,-330,-367,-365,-370,-407,-348,-441,-315,-470],[-349,-1000,-298,-992,-251,-971,-215,-935,-170,-911,-129,-885,-99,-853,-48,-851,-10,-828,-4,-792,31,-774,60,-774,102,-789,152,-779,193,-757,216,-711,245,-669,288,-653,333,-674,364,-636,379,-588,384,-537,377,-486,363,-437,347,-388,356,-340,395,-310,436,-279,469,-240,514,-221,536,-181,527,-131,526,-82,545,-37,557,11,599,40,644,65,688,90,710,136,714,186,711,237,714,285,754,318,793,350,774,387,724,394,673,403,643,367,605,344,565,372,518,353,475,342,430,331,407,369,380,370,379,318,352,289,305,311,264,340,256,389,262,440,278,488,284,536,269,584,244,627,205,660,168,690,162,740,131,780,91,813,61,854,66,903,61,954,16,969,-34,976,-72,1000,-97,955,-126,913,-101,880,-95,832,-105,781,-114,732,-118,681,-119,629,-115,578,-108,528,-94,478,-81,429,-67,379,-58,330,-63,280,-59,229,-69,180,-89,132,-106,84,-120,35,-135,-14,-172,-50,-210,-84,-244,-121,-267,-167,-297,-208,-332,-245,-359,-288,-381,-334,-406,-379,-438,-419,-470,-459,-494,-504,-509,-553,-522,-602,-544,-649,-567,-694,-594,-738,-622,-781,-653,-820,-695,-850,-742,-866,-793,-865,-762,-903,-719,-931,-674,-944,-624,-938,-573,-938,-521,-939,-481,-969,-436,-970,-393,-998],[-862,-646,-819,-622,-753,-600,-687,-578,-622,-555,-554,-547,-485,-547,-415,-547,-379,-580,-309,-579,-255,-544,-201,-501,-172,-440,-119,-399,-61,-393,-21,-442,43,-431,90,-382,121,-323,167,-272,187,-209,241,-175,305,-154,307,-113,288,-47,282,22,276,89,304,151,297,148,296,163,323,225,367,279,398,338,420,363,476,378,531,396,598,383,662,364,710,371,726,336,759,280,767,213,821,177,887,161,954,162,987,155,1000,212,963,268,963,310,951,354,924,378,896,382,852,419,792,429,730,436,708,474,753,523,737,555,674,566,658,626,629,646,581,596,528,551,527,557,478,539,454,548,393,578,328,571,263,550,204,520,139,498,75,472,20,432,-42,411,-103,381,-156,338,-209,299,-240,240,-223,203,-229,146,-249,82,-296,31,-339,-22,-364,-44,-406,-84,-430,-111,-455,-143,-487,-170,-496,-214,-546,-246,-572,-299,-625,-333,-672,-381,-702,-439,-732,-501,-756,-544,-808,-562,-847,-576,-841,-510,-823,-446,-773,-400,-736,-353,-710,-297,-668,-246,-648,-216,-620,-179,-595,-118,-576,-56,-542,-40,-499,10,-520,61,-555,9,-609,-33,-660,-74,-668,-138,-708,-188,-746,-220,-802,-243,-853,-284,-812,-295,-801,-318,-827,-375,-879,-417,-913,-470,-945,-524,-967,-578,-1000,-634,-931,-640],[348,-1000,400,-967,452,-934,504,-901,557,-868,609,-835,661,-802,713,-769,766,-737,818,-704,869,-669,916,-637,854,-637,792,-637,731,-637,669,-637,658,-591,665,-530,671,-468,678,-407,684,-345,691,-284,697,-223,704,-161,711,-100,717,-38,724,23,730,85,737,146,743,207,750,269,757,330,763,392,770,453,776,515,783,576,789,637,796,699,826,750,830,806,819,867,776,890,715,890,653,890,591,890,529,890,467,890,406,890,344,890,282,890,240,864,210,898,149,909,88,900,30,909,-7,936,-52,893,-99,879,-132,929,-149,988,-200,1000,-246,961,-286,921,-323,880,-353,831,-389,786,-442,781,-480,734,-533,705,-595,704,-646,715,-705,728,-767,727,-809,752,-831,807,-838,802,-832,741,-817,681,-793,625,-772,566,-762,505,-766,444,-777,383,-791,323,-831,277,-813,247,-803,206,-794,146,-811,91,-840,63,-873,24,-908,-1,-916,13,-903,-47,-841,-48,-780,-48,-718,-48,-656,-48,-594,-48,-532,-48,-471,-48,-409,-48,-347,-49,-312,-73,-316,-135,-320,-197,-328,-258,-314,-314,-265,-350,-207,-370,-161,-402,-160,-464,-160,-526,-160,-588,-160,-649,-160,-711,-160,-773,-123,-798,-61,-798,0,-798,62,-798,124,-798,186,-798,248,-798,309,-798,340,-829,340,-891,340,-953],[-268,-947,-208,-947,-147,-947,-90,-938,-40,-905,10,-871,59,-837,109,-803,159,-769,208,-735,258,-701,308,-667,357,-632,407,-598,457,-564,506,-530,556,-496,606,-462,627,-412,678,-381,719,-344,772,-324,827,-305,874,-275,872,-219,893,-180,952,-190,999,-187,999,-127,1000,-67,1000,-7,1000,53,994,112,978,169,959,225,917,264,873,278,822,287,761,290,701,292,641,296,595,333,535,332,482,331,427,322,373,339,321,368,268,396,233,433,176,425,133,466,104,501,83,545,33,550,-20,545,-33,594,-58,634,-70,686,-121,714,-161,750,-159,808,-181,856,-190,913,-241,934,-270,917,-295,881,-330,892,-358,925,-392,939,-438,915,-483,947,-519,911,-527,853,-571,836,-543,790,-588,756,-601,700,-633,653,-659,681,-708,708,-764,687,-809,721,-847,687,-895,709,-903,661,-906,606,-925,552,-964,533,-974,483,-983,426,-1000,375,-979,354,-956,300,-922,253,-877,283,-835,298,-787,274,-727,282,-668,272,-648,265,-588,266,-528,266,-468,266,-407,266,-347,266,-287,266,-227,266,-183,246,-172,187,-194,137,-207,80,-213,20,-220,-40,-226,-100,-233,-160,-239,-219,-246,-279,-252,-339,-259,-399,-265,-459,-272,-519,-278,-579,-285,-638,-292,-698,-298,-758,-305,-818,-311,-878,-318,-938],[496,-626,497,-575,517,-565,547,-610,586,-614,599,-564,647,-540,677,-498,665,-452,647,-409,680,-411,729,-430,761,-405,727,-378,773,-378,822,-383,861,-350,907,-326,956,-307,1000,-292,980,-246,930,-226,878,-213,825,-223,785,-199,804,-156,847,-124,842,-89,789,-80,737,-66,687,-84,652,-49,603,-69,552,-84,498,-85,445,-86,398,-85,346,-82,297,-85,259,-48,239,1,235,55,235,107,224,159,191,193,148,212,138,262,149,300,105,333,73,369,81,418,53,458,29,506,-20,506,-73,512,-122,530,-166,555,-216,539,-267,521,-298,491,-352,490,-405,493,-455,513,-474,562,-517,586,-564,603,-616,604,-669,596,-722,605,-771,626,-821,624,-862,590,-903,555,-942,518,-980,480,-1000,435,-984,399,-951,439,-901,459,-848,461,-799,477,-750,498,-700,511,-663,521,-696,485,-670,441,-654,390,-662,343,-638,319,-612,295,-597,245,-549,222,-496,214,-443,203,-391,190,-338,176,-289,156,-255,114,-221,72,-188,29,-150,-9,-114,-49,-89,-95,-70,-135,-31,-99,1,-67,34,-24,74,-47,88,-93,73,-144,98,-182,127,-180,134,-127,162,-88,179,-115,169,-167,166,-202,216,-219,238,-263,208,-302,242,-342,286,-332,316,-376,347,-419,368,-467,404,-507,439,-549,465,-596],[-315,-1000,-275,-982,-233,-972,-197,-951,-153,-955,-112,-943,-79,-950,-63,-979,-26,-955,8,-926,33,-890,58,-854,70,-811,78,-768,80,-724,94,-683,99,-640,86,-598,95,-557,119,-520,151,-496,171,-458,146,-442,102,-439,82,-404,65,-363,42,-325,22,-286,32,-242,44,-200,54,-156,60,-112,66,-68,69,-24,74,20,101,54,145,61,180,88,211,120,240,153,268,188,295,223,322,258,348,294,375,330,399,366,403,411,399,451,391,494,391,538,393,582,391,627,387,671,378,714,343,737,299,745,262,763,246,804,229,845,246,884,256,927,257,971,237,1000,200,983,211,946,186,918,153,888,124,854,92,824,64,789,33,760,29,717,0,684,6,645,30,610,44,567,66,529,72,485,72,441,67,397,61,353,39,315,5,295,-39,303,-80,314,-124,321,-164,331,-194,299,-221,264,-244,225,-270,191,-302,182,-332,175,-356,139,-370,112,-403,86,-372,61,-348,24,-329,-15,-327,-59,-324,-102,-329,-143,-301,-174,-259,-188,-219,-207,-192,-242,-233,-250,-252,-290,-251,-333,-244,-377,-246,-421,-264,-459,-249,-497,-230,-537,-239,-577,-255,-619,-221,-643,-185,-667,-154,-699,-172,-738,-187,-779,-211,-812,-242,-843,-232,-887,-261,-920,-284,-954,-323,-951,-337,-992],[324,-1000,350,-991,377,-958,396,-919,420,-883,436,-844,447,-802,458,-761,467,-718,469,-675,473,-632,484,-591,504,-553,508,-510,494,-470,472,-433,443,-460,429,-501,395,-497,399,-455,403,-412,419,-374,413,-332,400,-297,374,-265,363,-224,370,-181,368,-138,357,-97,346,-55,331,-14,315,26,301,66,288,108,276,149,264,190,249,231,236,272,224,314,214,356,201,397,187,438,171,478,155,518,144,559,136,602,125,644,113,685,103,727,88,767,69,806,59,847,42,887,14,920,-24,939,-67,941,-108,954,-147,974,-183,996,-226,1000,-264,983,-301,961,-343,954,-377,928,-404,898,-419,858,-444,824,-452,782,-453,739,-444,698,-456,658,-473,619,-495,583,-505,541,-508,498,-503,455,-484,417,-475,375,-440,352,-420,315,-401,277,-379,240,-359,202,-347,161,-342,118,-345,76,-366,39,-370,-3,-383,-44,-398,-84,-402,-127,-404,-170,-408,-211,-388,-249,-366,-286,-344,-323,-345,-366,-324,-396,-281,-399,-245,-423,-212,-421,-175,-435,-144,-455,-102,-464,-71,-438,-76,-465,-53,-500,-18,-525,18,-538,34,-511,32,-553,59,-586,83,-618,80,-579,105,-599,133,-629,140,-637,132,-676,153,-713,145,-749,164,-783,199,-769,228,-800,263,-824,282,-862,288,-904,274,-945,298,-965],[415,-788,454,-761,492,-734,521,-696,550,-657,580,-619,610,-582,645,-549,682,-519,723,-493,765,-471,810,-454,850,-429,876,-390,891,-344,907,-299,922,-253,940,-209,968,-173,1000,-141,992,-94,975,-49,959,-4,955,44,952,92,949,140,946,188,943,236,930,280,881,279,834,283,803,315,795,363,787,410,769,450,725,469,680,487,634,499,587,507,538,504,492,494,445,482,399,470,351,468,307,486,259,490,212,494,168,514,136,549,108,588,80,627,52,666,16,696,-27,716,-71,737,-111,763,-154,756,-199,738,-246,730,-287,752,-329,772,-377,773,-425,775,-473,779,-521,785,-569,788,-603,772,-627,733,-673,718,-721,725,-769,731,-802,701,-815,655,-829,608,-845,564,-882,534,-911,496,-929,451,-947,407,-965,362,-973,316,-973,267,-970,220,-982,173,-993,126,-1000,80,-971,43,-951,5,-952,-43,-958,-90,-953,-138,-942,-184,-931,-231,-918,-277,-876,-272,-829,-266,-788,-283,-772,-327,-770,-375,-768,-423,-754,-469,-723,-501,-680,-522,-636,-543,-593,-563,-550,-584,-504,-597,-457,-597,-423,-564,-386,-533,-345,-526,-330,-571,-309,-614,-271,-643,-225,-656,-178,-666,-131,-676,-83,-671,-37,-684,9,-698,50,-723,95,-739,140,-754,188,-752,235,-741,281,-744,327,-757,371,-778],[-613,-765,-563,-761,-512,-755,-462,-748,-411,-749,-362,-760,-319,-737,-279,-720,-236,-741,-186,-734,-135,-727,-85,-723,-34,-720,14,-705,61,-686,111,-685,161,-691,211,-697,250,-729,292,-757,340,-764,360,-721,385,-676,415,-638,464,-625,513,-614,563,-603,610,-584,648,-550,685,-516,726,-486,764,-451,796,-412,825,-371,866,-341,912,-321,937,-291,928,-241,915,-192,898,-144,906,-101,956,-95,1000,-77,965,-43,944,3,901,12,851,9,813,32,797,80,763,116,714,128,674,156,652,201,638,250,634,300,635,351,611,395,591,441,575,490,600,517,641,544,648,594,610,619,562,609,562,563,537,530,493,551,448,571,418,611,370,620,325,627,312,676,296,720,245,719,202,745,155,765,111,750,67,739,18,743,-32,750,-82,757,-132,750,-150,710,-150,659,-165,611,-199,574,-241,545,-286,523,-316,489,-360,465,-400,487,-420,440,-430,390,-424,340,-411,291,-394,243,-378,195,-398,151,-437,119,-462,77,-499,56,-550,54,-601,56,-651,51,-699,36,-745,14,-790,-10,-835,-34,-874,-66,-919,-68,-943,-102,-940,-152,-938,-202,-950,-251,-962,-300,-978,-349,-993,-397,-997,-448,-998,-499,-1000,-549,-970,-585,-930,-616,-888,-646,-846,-673,-803,-701,-757,-720,-710,-740,-663,-759],[-708,-965,-655,-940,-598,-924,-540,-931,-483,-927,-425,-916,-371,-892,-316,-873,-260,-856,-243,-802,-218,-747,-172,-712,-114,-699,-55,-694,3,-678,60,-659,114,-635,160,-598,210,-565,268,-568,318,-600,355,-646,363,-703,342,-757,349,-815,387,-861,436,-894,490,-918,546,-933,602,-937,660,-926,716,-907,746,-866,787,-835,846,-825,901,-808,960,-807,1000,-768,974,-721,974,-664,977,-607,949,-554,962,-497,974,-439,983,-380,983,-320,983,-261,983,-201,983,-141,983,-82,983,-22,983,38,983,98,983,157,983,217,983,277,983,336,983,396,983,456,983,516,983,575,983,635,983,695,983,754,983,814,983,874,950,901,890,901,856,926,844,965,791,937,739,908,687,879,635,850,582,821,530,792,478,764,425,735,373,706,321,677,268,648,216,620,164,591,111,562,59,533,7,504,-45,475,-98,447,-150,418,-203,430,-257,456,-310,484,-362,513,-411,509,-455,469,-506,442,-564,428,-622,413,-678,396,-704,342,-732,289,-787,269,-844,254,-895,245,-921,191,-932,134,-966,84,-998,34,-973,-12,-941,-57,-956,-113,-950,-171,-942,-229,-948,-288,-949,-347,-952,-407,-970,-464,-1000,-515,-989,-555,-936,-583,-901,-631,-902,-689,-905,-745,-859,-778,-820,-820,-768,-849,-735,-887,-740,-945],[-317,-1000,-287,-961,-235,-979,-184,-996,-142,-998,-112,-985,-75,-950,-30,-921,-28,-868,-9,-819,3,-767,7,-713,26,-663,43,-611,38,-557,16,-508,9,-465,62,-465,109,-440,145,-400,187,-379,236,-401,280,-412,303,-462,337,-504,349,-555,376,-599,423,-591,455,-549,491,-511,506,-459,523,-407,540,-355,556,-303,549,-250,541,-196,519,-148,483,-107,444,-69,413,-31,463,-10,508,11,547,48,597,68,651,68,705,71,752,98,771,150,793,197,819,241,870,253,918,279,960,294,969,348,979,402,974,454,971,507,956,558,941,609,911,648,902,698,895,752,895,806,899,861,901,915,902,970,898,1000,845,988,795,967,745,946,694,925,642,909,590,892,541,870,493,844,445,818,397,792,349,767,301,741,253,715,204,689,156,663,113,630,70,597,28,562,-10,523,-49,485,-87,446,-127,409,-168,373,-208,336,-249,299,-289,263,-330,226,-370,190,-413,157,-460,128,-513,115,-565,99,-613,74,-645,33,-667,-16,-714,-44,-762,-70,-812,-92,-861,-115,-903,-149,-941,-188,-979,-227,-944,-267,-918,-315,-884,-359,-847,-398,-806,-433,-767,-472,-723,-503,-677,-532,-639,-572,-602,-612,-565,-648,-554,-702,-540,-754,-517,-802,-468,-823,-427,-853,-409,-904,-398,-958,-368,-989],[327,-1000,367,-985,388,-943,418,-907,453,-875,489,-844,529,-820,561,-786,591,-749,621,-713,658,-683,694,-653,731,-624,768,-594,805,-565,846,-541,888,-519,921,-491,939,-448,961,-406,980,-363,988,-317,982,-270,970,-225,957,-179,941,-135,925,-90,908,-46,879,-8,844,23,809,53,778,88,770,135,762,182,754,228,745,275,722,313,686,343,647,369,606,394,565,417,522,437,479,456,436,475,391,490,345,501,298,496,251,500,205,509,159,518,121,543,89,578,61,616,36,656,11,696,-14,736,-40,776,-69,813,-76,859,-87,905,-108,947,-136,985,-179,1000,-225,992,-272,983,-318,975,-365,966,-408,951,-446,922,-481,891,-512,856,-542,819,-568,779,-603,748,-640,720,-681,697,-715,667,-735,625,-736,578,-734,531,-761,492,-788,453,-815,414,-840,374,-863,333,-885,291,-908,250,-929,208,-946,163,-963,119,-980,75,-988,30,-964,-7,-922,-29,-880,-49,-837,-69,-794,-88,-761,-121,-730,-158,-705,-198,-681,-238,-658,-280,-631,-317,-600,-353,-574,-392,-549,-432,-525,-473,-500,-513,-475,-553,-450,-593,-425,-634,-392,-664,-348,-680,-303,-696,-258,-710,-215,-728,-179,-758,-143,-789,-106,-819,-66,-843,-25,-868,16,-891,59,-909,103,-927,147,-945,191,-963,236,-977,282,-988],[481,-1000,526,-987,568,-967,600,-932,588,-895,558,-858,525,-824,500,-788,541,-775,585,-758,629,-739,666,-710,691,-671,705,-626,719,-581,734,-535,748,-490,763,-445,753,-401,733,-358,711,-316,680,-280,650,-243,611,-220,570,-197,531,-170,499,-136,468,-100,449,-57,463,-16,504,8,538,37,507,60,460,52,413,49,366,46,318,46,271,53,231,75,193,105,160,138,130,175,113,219,101,264,124,306,160,334,194,364,170,401,129,426,95,459,75,501,46,536,9,566,-26,598,-59,632,-95,662,-133,691,-173,717,-213,743,-243,778,-268,772,-304,772,-331,806,-343,852,-355,898,-366,944,-404,971,-445,997,-491,1000,-538,998,-585,992,-632,984,-679,984,-727,988,-763,985,-741,942,-720,900,-702,856,-684,812,-666,768,-653,722,-640,677,-626,631,-608,588,-582,548,-556,508,-531,468,-513,424,-496,379,-479,335,-462,291,-445,246,-428,202,-411,158,-394,113,-377,69,-360,25,-341,-19,-318,-60,-295,-102,-272,-144,-249,-185,-239,-231,-232,-278,-226,-325,-219,-372,-213,-419,-205,-466,-178,-505,-152,-544,-125,-584,-98,-623,-71,-662,-44,-701,-3,-725,38,-749,79,-773,110,-809,136,-846,135,-894,135,-941,182,-941,230,-941,277,-941,325,-942,372,-944,420,-946,450,-975],[154,-605,186,-593,219,-594,259,-563,304,-542,343,-514,389,-497,415,-455,446,-416,478,-377,521,-351,568,-356,615,-374,662,-382,705,-356,753,-343,802,-339,818,-294,857,-261,895,-229,900,-180,879,-137,867,-88,859,-39,851,6,899,-3,916,42,935,86,952,133,978,174,990,223,1000,272,999,322,981,362,936,383,901,418,869,457,842,498,821,538,771,535,722,529,672,525,637,558,603,592,555,605,508,589,466,561,438,519,406,481,368,449,330,415,293,381,247,363,198,352,149,339,115,307,93,262,65,227,20,248,-17,282,-65,291,-115,298,-162,287,-209,271,-259,265,-309,261,-359,253,-405,260,-445,257,-486,236,-535,244,-585,241,-635,234,-685,230,-733,240,-779,260,-826,278,-868,306,-909,335,-949,366,-988,397,-996,354,-1000,304,-999,254,-998,204,-997,153,-995,103,-989,53,-976,6,-942,-30,-913,-72,-897,-119,-889,-169,-881,-218,-861,-264,-836,-307,-810,-350,-769,-373,-721,-388,-675,-408,-628,-425,-580,-440,-554,-406,-530,-364,-494,-329,-457,-294,-423,-258,-400,-214,-383,-166,-366,-119,-323,-93,-279,-67,-232,-67,-184,-81,-146,-114,-108,-146,-74,-183,-57,-229,-58,-279,-62,-330,-65,-380,-73,-429,-83,-478,-68,-516,-27,-543,19,-564,67,-579,112,-601],[-494,-1000,-448,-989,-391,-983,-352,-935,-312,-886,-278,-837,-244,-838,-207,-814,-222,-755,-215,-696,-180,-644,-126,-615,-67,-594,-17,-615,39,-644,96,-622,147,-585,126,-542,148,-517,183,-472,233,-448,209,-396,173,-346,116,-341,54,-348,41,-306,4,-261,56,-231,109,-196,160,-159,217,-133,277,-112,272,-56,312,-8,364,25,389,81,426,132,469,178,518,218,559,265,593,315,606,375,648,406,682,434,732,471,783,506,756,549,752,597,797,641,840,686,820,742,813,796,794,851,746,871,695,899,644,903,595,863,548,881,501,903,482,937,496,994,444,1000,396,962,337,964,295,921,336,885,363,832,373,770,361,709,382,653,392,593,340,558,323,509,265,483,233,431,200,379,194,316,200,254,202,193,161,147,113,107,75,56,42,3,-6,-24,-65,-45,-127,-49,-156,-9,-188,43,-246,65,-286,76,-332,42,-381,3,-432,29,-477,58,-526,97,-575,135,-625,167,-657,129,-632,71,-611,12,-630,-46,-606,-100,-587,-160,-586,-221,-597,-282,-622,-326,-681,-320,-740,-312,-777,-358,-754,-416,-761,-470,-802,-513,-840,-493,-827,-555,-796,-608,-736,-620,-744,-661,-712,-712,-662,-743,-616,-785,-597,-746,-570,-705,-511,-705,-466,-717,-479,-773,-477,-836,-507,-890,-525,-949],[-84,-488,-38,-460,9,-433,59,-411,111,-397,164,-390,205,-419,259,-416,313,-415,367,-420,420,-428,472,-412,526,-410,579,-405,633,-401,687,-402,738,-386,791,-377,825,-348,861,-308,914,-300,963,-280,1000,-241,998,-198,944,-193,906,-160,855,-140,806,-121,758,-96,712,-68,666,-39,643,8,602,38,549,46,497,52,443,48,391,52,363,97,343,146,315,192,279,192,231,208,181,221,164,176,135,150,90,180,38,181,21,210,-23,232,-66,265,-118,278,-151,317,-154,366,-162,416,-212,428,-262,443,-315,452,-368,447,-421,455,-458,488,-498,454,-546,467,-568,430,-593,395,-641,412,-682,439,-733,435,-768,397,-820,407,-868,404,-922,400,-974,410,-997,377,-1000,326,-966,317,-950,272,-898,254,-847,256,-798,278,-760,305,-731,264,-690,238,-637,227,-588,244,-545,252,-503,223,-466,186,-425,184,-406,164,-361,146,-318,116,-308,89,-359,85,-403,60,-451,45,-471,9,-521,3,-537,-48,-569,-74,-580,-24,-606,-5,-634,17,-686,5,-726,-25,-757,-56,-805,-65,-821,-95,-779,-128,-740,-165,-706,-199,-657,-221,-662,-254,-702,-269,-679,-316,-646,-358,-599,-380,-548,-390,-495,-382,-442,-373,-391,-354,-345,-330,-292,-321,-246,-297,-235,-322,-230,-374,-216,-426,-177,-459,-131,-481],[132,-943,188,-942,242,-928,294,-910,344,-886,395,-862,445,-838,495,-814,509,-770,519,-716,533,-662,551,-610,577,-560,602,-511,628,-461,654,-412,679,-362,683,-310,628,-319,578,-343,524,-358,479,-340,439,-301,399,-262,360,-223,318,-186,276,-149,245,-107,285,-84,339,-70,394,-62,449,-62,503,-75,553,-72,593,-37,613,15,630,68,640,123,657,176,673,229,690,283,707,336,724,389,752,436,786,480,816,527,843,576,869,624,895,674,915,726,933,779,949,832,975,881,1000,931,944,932,889,932,833,933,777,934,722,935,666,936,610,936,554,937,499,939,443,940,387,941,332,941,276,942,220,943,174,924,139,880,104,837,86,785,72,731,59,677,44,623,29,570,4,520,-21,470,-46,421,-84,389,-139,381,-194,373,-250,365,-305,358,-360,350,-415,342,-470,334,-525,326,-580,318,-636,311,-691,304,-746,297,-801,290,-857,283,-912,276,-967,269,-1000,254,-964,212,-927,170,-891,128,-854,85,-819,42,-786,-3,-753,-48,-724,-95,-694,-142,-664,-189,-635,-236,-607,-285,-585,-336,-562,-386,-539,-437,-518,-489,-498,-541,-477,-593,-456,-644,-434,-695,-412,-746,-384,-794,-347,-835,-300,-865,-250,-889,-199,-910,-146,-924,-90,-930,-35,-936,21,-941,76,-942],[-528,-1000,-503,-990,-454,-995,-410,-974,-414,-924,-411,-874,-380,-833,-340,-808,-289,-807,-237,-805,-187,-799,-143,-772,-99,-744,-56,-716,-13,-688,30,-660,78,-644,129,-641,179,-632,230,-623,281,-615,332,-614,367,-651,397,-692,442,-716,489,-737,537,-758,583,-767,622,-734,665,-708,716,-712,768,-715,784,-696,754,-654,725,-612,695,-570,660,-532,623,-496,615,-448,615,-397,615,-345,615,-294,615,-242,616,-191,616,-139,616,-88,616,-36,616,15,617,67,617,118,617,170,617,221,634,267,666,308,697,348,727,390,706,433,663,460,617,465,603,495,585,539,551,575,501,580,464,614,462,665,447,713,413,751,393,797,377,846,354,891,332,938,305,982,266,1000,224,971,182,940,141,910,99,880,57,850,15,820,-23,787,-48,752,-36,704,-62,665,-107,640,-152,615,-197,589,-242,564,-287,539,-332,514,-377,489,-422,464,-467,439,-512,414,-557,389,-602,364,-647,339,-692,313,-736,288,-784,271,-783,219,-780,168,-780,117,-779,65,-761,19,-742,-28,-709,-66,-680,-107,-653,-150,-607,-173,-597,-220,-572,-263,-572,-314,-582,-365,-586,-415,-608,-458,-635,-499,-659,-541,-682,-583,-679,-633,-708,-665,-737,-697,-760,-743,-748,-783,-712,-820,-675,-856,-638,-892,-602,-928,-565,-964],[88,-539,145,-531,194,-523,205,-466,251,-458,276,-450,330,-446,319,-402,367,-411,414,-442,467,-466,466,-448,511,-409,551,-365,582,-313,613,-261,639,-207,672,-238,706,-218,752,-201,804,-220,847,-183,887,-147,926,-115,972,-126,1000,-85,971,-50,921,-23,916,36,890,78,838,76,789,68,771,125,756,183,745,206,695,207,639,225,658,257,670,315,667,361,650,401,626,408,579,382,519,375,460,373,405,377,354,353,318,392,285,395,228,384,196,423,153,455,104,487,80,539,51,506,-5,504,-22,450,-46,413,-56,376,-90,329,-140,325,-200,324,-254,319,-290,271,-337,234,-386,199,-439,187,-496,206,-541,235,-541,295,-541,356,-541,416,-541,476,-578,478,-612,430,-667,424,-712,454,-706,395,-747,368,-773,326,-801,274,-799,248,-772,246,-767,197,-709,192,-698,179,-681,122,-701,77,-752,74,-805,82,-857,107,-898,108,-891,78,-922,26,-974,12,-1000,-36,-982,-90,-976,-142,-942,-169,-899,-140,-899,-192,-856,-227,-807,-260,-763,-256,-713,-260,-659,-247,-617,-205,-607,-221,-557,-190,-510,-220,-457,-217,-408,-211,-363,-184,-320,-197,-271,-220,-295,-260,-340,-292,-295,-324,-279,-367,-254,-380,-268,-404,-287,-438,-232,-442,-175,-455,-118,-467,-70,-487,-13,-495,45,-511],[678,-1000,695,-952,710,-899,725,-846,739,-793,754,-740,769,-686,783,-633,797,-580,774,-549,790,-496,839,-504,882,-496,881,-448,841,-411,800,-373,756,-341,703,-325,650,-310,597,-294,544,-279,491,-263,439,-247,386,-232,333,-216,280,-201,227,-185,174,-170,121,-154,68,-139,15,-123,-38,-108,-42,-78,-5,-37,33,3,70,44,108,85,145,125,181,167,216,209,252,252,288,294,323,336,353,377,305,404,257,432,214,465,193,517,173,568,148,616,94,628,40,640,-14,651,-68,663,-122,674,-169,699,-196,747,-224,795,-252,842,-289,882,-331,918,-374,953,-416,988,-467,1000,-521,990,-575,980,-630,971,-684,961,-738,951,-793,941,-847,931,-882,908,-873,854,-871,799,-860,745,-849,691,-839,637,-821,585,-809,532,-807,477,-806,422,-795,369,-777,317,-757,265,-737,214,-716,163,-697,111,-689,58,-697,6,-687,-48,-679,-103,-668,-157,-649,-208,-639,-260,-645,-315,-646,-370,-638,-424,-633,-478,-639,-533,-635,-588,-631,-643,-595,-680,-542,-697,-491,-680,-456,-638,-421,-597,-368,-582,-324,-550,-278,-523,-224,-512,-169,-504,-115,-499,-69,-529,-22,-559,24,-589,71,-618,117,-648,164,-678,210,-708,256,-738,303,-767,350,-797,396,-827,443,-856,490,-884,537,-913,584,-942,631,-971],[804,-905,863,-879,899,-861,894,-792,901,-723,941,-669,972,-608,994,-542,1000,-474,989,-406,964,-346,925,-296,913,-228,862,-197,816,-150,812,-82,825,-14,824,56,810,122,771,179,753,245,748,313,778,376,766,416,720,464,704,529,646,567,611,570,610,502,653,450,612,420,578,476,582,536,531,502,483,542,474,610,428,653,425,588,416,543,365,580,324,636,274,651,204,646,136,658,145,640,105,622,78,624,78,559,32,599,29,661,78,706,24,737,-31,774,-62,836,-96,897,-161,905,-203,854,-238,795,-240,728,-190,681,-227,649,-291,633,-357,626,-418,653,-477,685,-544,700,-606,725,-671,740,-734,719,-763,776,-785,830,-841,789,-909,796,-971,792,-1000,760,-972,706,-907,693,-855,648,-801,605,-750,559,-701,510,-654,462,-587,443,-530,456,-461,456,-393,443,-327,423,-259,411,-214,425,-167,451,-103,435,-69,384,-69,318,-23,267,20,213,50,151,51,83,81,25,145,0,136,42,83,84,103,146,161,168,209,120,273,95,336,66,386,18,421,-41,465,-91,522,-131,545,-195,572,-258,607,-318,624,-385,650,-448,648,-517,595,-549,635,-597,634,-663,642,-728,694,-766,699,-834,756,-832,767,-764,819,-777,865,-804,840,-841,785,-839],[-85,-1000,-62,-973,-20,-921,45,-906,111,-894,178,-886,146,-846,170,-810,161,-764,185,-721,198,-678,169,-719,109,-718,56,-683,-4,-653,-28,-660,-50,-602,-12,-549,-36,-512,-43,-454,-27,-389,14,-338,71,-303,123,-260,174,-219,201,-158,219,-93,245,-31,288,20,337,66,391,105,454,127,521,124,586,132,555,183,566,235,626,266,687,294,748,322,800,365,860,396,908,441,952,491,950,555,910,573,875,517,828,482,765,461,715,443,678,499,652,561,654,624,712,655,740,712,744,776,683,791,650,845,637,906,591,955,552,1000,502,974,530,921,540,856,590,821,576,761,564,695,537,633,518,569,467,536,408,508,392,455,357,402,293,416,286,370,241,352,207,294,150,273,86,274,35,233,-16,192,-61,142,-111,97,-150,44,-210,17,-227,-14,-273,-62,-320,-102,-330,-162,-359,-222,-371,-288,-410,-337,-472,-363,-528,-400,-591,-421,-652,-400,-696,-350,-741,-301,-805,-282,-799,-327,-817,-363,-879,-378,-915,-426,-896,-482,-930,-525,-952,-579,-892,-599,-888,-653,-929,-706,-894,-753,-831,-755,-768,-753,-721,-798,-695,-849,-665,-836,-620,-791,-591,-746,-574,-771,-537,-826,-514,-876,-474,-834,-415,-839,-395,-853,-384,-905,-343,-909,-324,-957,-263,-938,-216,-981,-150,-988],[336,-1000,318,-963,316,-923,330,-886,328,-846,341,-808,352,-769,340,-733,330,-693,313,-655,274,-644,236,-627,218,-591,215,-550,212,-508,195,-483,159,-501,136,-533,96,-543,56,-552,21,-529,-6,-500,-20,-461,-29,-421,-42,-381,-44,-341,-39,-300,-35,-258,-37,-217,-35,-188,4,-195,41,-178,52,-151,15,-132,-19,-109,-49,-79,-61,-40,-75,-1,-81,39,-43,47,-2,43,38,33,77,18,115,0,151,-18,163,10,156,51,149,91,153,131,158,170,146,210,132,249,115,287,101,326,86,365,70,403,56,443,43,482,33,522,34,563,31,605,31,646,24,686,9,725,-2,764,-10,805,-19,846,-26,887,-34,927,-45,967,-70,1000,-83,962,-94,922,-105,882,-116,842,-127,802,-138,762,-150,722,-163,683,-175,643,-191,605,-207,566,-224,528,-236,489,-245,448,-257,409,-270,369,-283,330,-297,291,-311,252,-325,212,-338,173,-352,134,-335,102,-311,70,-301,32,-273,2,-244,-29,-247,-61,-240,-96,-220,-132,-200,-168,-181,-205,-163,-242,-149,-282,-135,-321,-121,-360,-109,-399,-99,-440,-89,-480,-80,-521,-70,-561,-60,-601,-46,-641,-33,-680,-18,-719,-2,-757,10,-796,24,-832,66,-835,107,-829,148,-827,184,-848,195,-888,214,-922,240,-922,272,-947,306,-971],[271,-1000,338,-959,361,-912,303,-859,245,-806,221,-730,167,-675,93,-659,139,-607,71,-568,22,-517,77,-458,123,-401,193,-366,270,-363,321,-422,339,-489,400,-475,433,-403,476,-353,530,-326,605,-341,598,-298,577,-240,607,-166,628,-88,636,-9,637,69,658,147,668,227,649,303,621,378,611,459,573,530,556,585,538,635,460,629,394,646,370,650,295,666,217,684,171,746,98,778,39,830,-26,796,-43,830,-77,890,-147,924,-215,962,-292,985,-368,987,-445,1000,-492,989,-440,929,-445,904,-524,922,-587,938,-533,879,-472,828,-461,815,-538,842,-615,851,-668,816,-625,752,-557,710,-557,669,-638,673,-660,629,-589,594,-514,614,-507,568,-498,507,-438,455,-359,441,-280,422,-203,396,-228,365,-279,396,-354,418,-429,408,-500,441,-486,413,-427,358,-378,294,-375,229,-328,164,-253,143,-262,99,-342,97,-419,89,-473,53,-493,21,-567,13,-587,-45,-530,-77,-484,-96,-524,-150,-455,-187,-434,-234,-513,-228,-513,-289,-532,-334,-565,-383,-566,-431,-488,-439,-410,-454,-333,-440,-272,-419,-203,-436,-125,-416,-129,-473,-73,-529,-6,-566,6,-624,-73,-610,-149,-637,-139,-688,-77,-731,-63,-801,-30,-871,38,-903,117,-914,160,-943,198,-880,181,-815,214,-829,209,-904,248,-961],[-176,-1000,-124,-996,-72,-987,-21,-968,34,-965,83,-986,111,-947,130,-909,174,-942,223,-945,239,-893,266,-849,277,-797,314,-764,332,-713,357,-671,404,-648,450,-629,504,-627,506,-599,469,-566,486,-517,501,-467,458,-437,421,-396,404,-347,372,-323,368,-273,375,-221,356,-175,391,-134,424,-94,447,-66,485,-33,498,17,500,63,553,73,599,102,642,137,685,171,736,182,765,227,793,272,824,318,834,366,817,419,811,473,811,528,859,537,878,573,878,628,897,670,937,703,956,750,978,787,927,777,875,772,831,760,778,753,724,764,689,803,669,854,645,904,616,950,581,992,527,1000,473,995,418,990,363,984,308,979,254,974,202,962,160,927,117,892,75,856,33,821,-9,785,-51,750,-93,714,-135,679,-176,643,-217,606,-258,570,-299,533,-343,501,-390,472,-437,444,-484,415,-531,387,-578,358,-625,329,-675,306,-729,296,-783,286,-837,277,-891,267,-884,239,-911,214,-940,188,-935,145,-950,92,-964,39,-978,-14,-958,-53,-910,-81,-863,-109,-816,-138,-769,-166,-722,-194,-675,-222,-627,-251,-578,-273,-534,-300,-509,-349,-495,-401,-494,-456,-490,-511,-474,-563,-464,-616,-480,-669,-484,-722,-469,-774,-424,-801,-372,-818,-332,-855,-293,-894,-262,-937,-215,-964],[-964,-907,-918,-876,-877,-832,-822,-806,-761,-804,-712,-836,-662,-873,-607,-901,-569,-862,-568,-820,-584,-785,-539,-745,-505,-717,-489,-657,-436,-628,-375,-617,-335,-571,-281,-539,-221,-523,-159,-520,-98,-535,-38,-550,20,-557,32,-549,22,-610,82,-619,122,-660,172,-696,234,-702,284,-721,345,-718,387,-686,448,-671,502,-650,560,-642,600,-602,655,-573,694,-524,755,-523,783,-484,791,-427,788,-368,774,-314,744,-263,732,-233,715,-179,742,-140,727,-99,729,-40,746,20,744,82,773,122,834,131,850,190,814,240,775,288,762,337,800,386,824,442,866,487,921,513,948,551,955,613,978,647,1000,683,970,721,910,733,865,766,844,820,830,878,791,907,731,890,688,882,628,874,569,872,512,852,451,843,396,829,367,782,353,721,327,666,268,653,211,677,161,705,108,737,52,712,-8,704,-56,667,-108,634,-149,591,-205,571,-254,536,-275,479,-297,427,-320,379,-357,330,-386,278,-441,294,-492,260,-491,240,-504,290,-555,295,-588,249,-598,193,-632,164,-624,103,-638,48,-671,-3,-724,-30,-777,-64,-796,-104,-827,-148,-868,-187,-865,-242,-844,-286,-802,-330,-812,-382,-790,-420,-846,-434,-884,-474,-910,-524,-936,-578,-958,-627,-982,-674,-979,-721,-989,-769,-1000,-826,-998,-866],[544,-849,606,-849,669,-842,726,-816,728,-777,767,-731,728,-719,680,-709,638,-704,687,-665,698,-616,741,-579,746,-549,783,-507,823,-458,803,-408,792,-370,833,-322,884,-284,937,-250,982,-206,1000,-164,941,-146,878,-151,825,-181,812,-175,771,-132,741,-78,719,-19,711,44,717,106,730,167,677,197,631,240,578,257,566,256,540,303,503,350,493,375,501,429,512,458,524,511,478,537,488,580,449,607,451,654,419,708,379,750,321,776,263,802,206,828,149,849,139,789,127,727,103,714,85,667,40,679,-10,704,-56,688,-91,660,-141,641,-180,617,-209,668,-265,698,-326,682,-380,714,-417,706,-418,643,-449,601,-505,607,-564,625,-616,615,-641,621,-691,601,-737,594,-744,531,-757,470,-768,408,-785,357,-780,296,-807,240,-858,204,-919,192,-909,146,-957,107,-950,45,-946,-4,-990,-49,-1000,-110,-998,-173,-970,-225,-976,-252,-946,-306,-912,-358,-857,-387,-858,-338,-833,-283,-787,-241,-739,-199,-691,-158,-632,-170,-572,-190,-509,-186,-448,-185,-393,-205,-352,-244,-313,-285,-251,-294,-188,-292,-147,-259,-87,-243,-32,-244,22,-272,85,-279,135,-292,157,-351,173,-398,198,-444,249,-482,235,-533,264,-585,314,-603,326,-664,328,-726,339,-787,375,-835,427,-843,487,-849],[-334,-1000,-300,-941,-268,-896,-243,-823,-266,-779,-268,-741,-242,-700,-178,-656,-116,-615,-163,-558,-150,-495,-83,-457,-10,-427,61,-410,135,-394,197,-365,267,-339,340,-333,363,-384,389,-450,420,-404,463,-363,537,-363,616,-363,625,-409,658,-437,715,-484,781,-522,850,-532,919,-551,942,-522,957,-481,990,-439,970,-390,900,-378,846,-324,814,-256,796,-185,741,-155,731,-96,715,-26,674,-31,659,-111,620,-101,587,-107,613,-169,657,-221,609,-241,526,-242,488,-295,440,-318,394,-344,382,-287,414,-242,368,-198,408,-147,423,-81,429,-5,414,-6,382,15,361,-32,328,19,290,77,249,135,197,153,174,174,120,237,58,290,-7,340,-47,401,-108,438,-167,464,-170,545,-166,609,-164,660,-194,737,-192,807,-231,857,-240,924,-282,936,-326,1000,-394,983,-433,911,-427,895,-458,820,-490,744,-530,673,-549,592,-582,517,-605,457,-638,385,-652,303,-664,223,-666,188,-674,115,-684,40,-672,14,-676,-25,-721,-3,-739,58,-816,83,-879,30,-935,-31,-868,-47,-845,-80,-923,-75,-965,-133,-990,-146,-934,-177,-857,-178,-795,-189,-820,-262,-856,-316,-900,-367,-856,-436,-793,-434,-725,-469,-668,-525,-628,-595,-579,-651,-553,-712,-501,-762,-557,-801,-582,-857,-593,-904,-557,-945,-476,-928,-403,-956],[538,-677,596,-617,635,-548,712,-577,785,-612,761,-580,717,-508,772,-473,791,-399,791,-345,853,-328,841,-270,919,-284,982,-250,964,-176,981,-113,1000,-53,949,-2,929,79,857,102,841,165,805,239,737,289,654,305,579,346,512,400,455,464,376,492,295,519,216,549,192,624,140,643,70,677,-15,668,-97,644,-178,615,-252,584,-251,524,-311,529,-376,485,-419,455,-494,484,-580,487,-665,493,-688,419,-650,421,-571,395,-520,328,-474,260,-511,264,-545,261,-541,196,-480,146,-550,181,-611,146,-630,83,-713,74,-798,63,-876,96,-923,39,-847,18,-771,-14,-702,-29,-621,-33,-535,-35,-525,-87,-605,-77,-622,-129,-552,-178,-559,-227,-631,-248,-711,-260,-788,-236,-868,-205,-943,-217,-1000,-251,-931,-266,-921,-281,-927,-353,-853,-312,-797,-345,-878,-364,-833,-396,-878,-465,-823,-468,-816,-527,-745,-482,-701,-442,-664,-417,-630,-427,-663,-495,-724,-547,-643,-562,-708,-589,-738,-623,-658,-641,-592,-593,-527,-539,-468,-477,-448,-425,-434,-351,-486,-322,-439,-271,-422,-209,-392,-131,-368,-207,-336,-285,-277,-262,-249,-335,-252,-421,-221,-491,-167,-428,-116,-359,-82,-399,-69,-482,5,-521,70,-485,118,-414,152,-337,156,-408,126,-489,186,-513,245,-456,299,-474,350,-536,422,-512,472,-572,458,-653],[560,-611,601,-599,632,-567,658,-529,699,-523,744,-534,787,-548,825,-540,842,-497,878,-474,912,-445,946,-417,985,-407,1000,-368,996,-330,964,-297,929,-268,884,-269,842,-252,811,-221,783,-185,749,-155,746,-110,717,-77,698,-35,683,8,653,43,643,85,621,125,596,163,591,205,556,235,532,271,528,315,503,346,483,385,442,398,397,394,369,423,332,447,290,436,245,446,207,448,162,440,117,440,71,440,27,435,-6,463,-42,491,-82,513,-123,501,-155,531,-198,546,-243,548,-271,582,-309,606,-353,611,-399,609,-445,608,-490,601,-531,583,-560,549,-600,531,-642,514,-668,478,-700,445,-738,420,-767,385,-793,348,-828,319,-868,296,-899,266,-926,229,-941,190,-949,145,-987,130,-1000,115,-968,82,-926,69,-899,41,-908,5,-913,-37,-909,-79,-892,-109,-854,-132,-842,-174,-869,-205,-913,-220,-885,-250,-846,-254,-807,-230,-763,-237,-724,-247,-732,-292,-719,-333,-700,-372,-656,-369,-621,-341,-586,-311,-549,-285,-506,-269,-461,-268,-415,-267,-369,-268,-323,-271,-277,-274,-232,-277,-218,-315,-214,-358,-181,-387,-137,-396,-91,-400,-46,-408,-5,-424,20,-462,62,-459,102,-435,143,-439,182,-463,222,-485,257,-512,277,-554,296,-595,336,-610,382,-610,427,-604,471,-592,516,-597],[96,-507,142,-502,187,-488,231,-472,277,-468,324,-471,368,-481,412,-496,457,-482,501,-467,539,-441,582,-436,561,-457,607,-448,651,-435,687,-405,723,-375,759,-346,795,-316,779,-315,738,-339,693,-331,712,-299,755,-294,791,-264,823,-242,864,-252,881,-253,845,-281,863,-279,905,-259,939,-230,961,-190,1000,-164,953,-166,907,-166,868,-145,830,-126,787,-106,744,-91,699,-90,661,-77,630,-63,588,-53,544,-46,502,-64,470,-97,426,-91,393,-60,377,-25,347,8,347,52,308,74,273,105,241,139,203,165,169,194,144,216,104,190,73,157,34,169,3,204,-24,242,-68,247,-115,243,-161,251,-164,295,-157,342,-150,388,-180,409,-216,432,-226,477,-261,505,-308,507,-350,504,-363,465,-390,429,-399,387,-441,374,-486,377,-482,353,-492,316,-483,270,-475,225,-514,204,-561,208,-595,179,-639,182,-681,202,-721,213,-737,173,-782,161,-820,136,-855,106,-891,77,-925,46,-969,39,-1000,20,-971,-16,-941,-48,-949,-93,-953,-137,-940,-182,-900,-205,-860,-228,-823,-257,-786,-286,-750,-315,-714,-345,-678,-375,-642,-406,-600,-405,-562,-432,-524,-459,-478,-468,-435,-463,-400,-431,-356,-442,-310,-440,-264,-431,-218,-422,-172,-429,-126,-432,-79,-433,-32,-428,8,-452,51,-467,96,-481],[119,-704,181,-699,244,-691,305,-682,363,-656,420,-630,479,-607,538,-587,598,-568,660,-562,723,-556,785,-550,847,-536,906,-548,929,-490,943,-429,955,-367,949,-306,925,-249,957,-198,1000,-153,982,-96,939,-50,894,-7,902,51,938,101,938,163,909,217,866,263,809,281,750,292,784,344,819,397,860,443,911,479,936,536,917,595,915,658,907,704,863,660,814,620,761,587,701,569,638,570,575,571,512,573,450,574,387,577,329,600,268,614,206,624,143,626,81,617,19,604,-42,592,-103,578,-164,563,-227,553,-289,555,-352,560,-414,568,-473,591,-522,629,-551,681,-595,700,-639,655,-686,613,-736,575,-792,546,-850,523,-909,501,-967,479,-1000,426,-990,368,-963,312,-926,266,-866,247,-804,248,-742,259,-682,279,-622,297,-560,310,-498,314,-436,322,-379,349,-317,355,-254,362,-192,368,-129,375,-67,381,-4,388,58,394,121,402,183,413,242,398,284,352,337,326,400,323,462,318,502,275,484,223,431,189,382,150,334,109,287,67,246,20,205,-28,187,-74,221,-120,207,-181,218,-242,237,-302,232,-351,177,-382,122,-411,65,-438,8,-465,-54,-473,-117,-480,-179,-486,-240,-503,-267,-557,-243,-615,-189,-647,-130,-667,-69,-682,-6,-691,56,-698],[-275,-1000,-238,-962,-198,-961,-152,-935,-107,-907,-63,-877,-23,-842,17,-807,55,-770,92,-732,124,-690,130,-638,124,-586,100,-539,94,-486,85,-435,100,-445,112,-495,142,-539,190,-549,242,-537,285,-508,323,-471,365,-438,398,-400,447,-381,480,-342,487,-289,482,-236,477,-185,452,-139,472,-103,449,-65,413,-40,360,-39,313,-19,286,19,298,67,280,117,260,166,247,215,273,259,300,304,332,344,355,387,393,412,444,406,456,452,471,500,481,550,513,591,534,637,558,684,586,728,614,773,664,790,638,804,586,814,534,805,493,783,442,795,405,832,367,864,314,866,265,882,235,916,186,900,152,925,126,956,92,980,45,1000,1,979,-48,961,-93,936,-129,899,-166,863,-195,829,-218,790,-216,737,-239,696,-265,653,-281,602,-282,549,-274,497,-256,447,-239,398,-243,347,-199,318,-172,274,-181,230,-207,185,-204,135,-244,105,-296,97,-318,69,-293,23,-286,-29,-300,-73,-337,-105,-385,-94,-437,-91,-488,-94,-523,-133,-559,-173,-594,-213,-630,-252,-664,-293,-633,-334,-594,-370,-600,-422,-614,-473,-580,-508,-531,-523,-481,-523,-436,-552,-389,-576,-376,-625,-426,-627,-458,-658,-469,-705,-466,-747,-440,-792,-395,-813,-353,-844,-307,-870,-278,-910,-239,-941,-270,-984],[28,-579,84,-579,141,-579,198,-579,254,-578,311,-578,367,-578,424,-578,481,-577,537,-577,594,-577,651,-576,707,-576,764,-576,820,-576,877,-576,934,-576,963,-549,974,-496,1000,-445,996,-389,979,-335,939,-298,883,-298,832,-273,834,-231,873,-190,916,-153,959,-121,963,-65,964,-8,962,48,915,71,861,89,807,104,750,109,694,111,637,108,584,120,535,148,486,177,432,193,377,207,324,218,286,260,258,309,233,360,209,411,184,462,158,512,126,559,91,579,69,531,85,477,60,462,25,506,-19,528,-17,471,-47,443,-98,434,-133,393,-134,337,-103,294,-152,285,-180,261,-151,213,-99,191,-47,169,9,161,65,151,54,115,4,95,-52,94,-99,120,-148,133,-183,88,-202,39,-182,-13,-132,-36,-76,-36,-19,-35,33,-56,79,-85,39,-93,-12,-74,-69,-78,-125,-82,-181,-77,-231,-52,-276,-18,-325,8,-379,26,-433,33,-489,22,-478,-29,-478,-80,-530,-89,-585,-75,-639,-74,-690,-97,-731,-134,-744,-186,-725,-235,-693,-280,-747,-282,-801,-265,-852,-278,-901,-305,-951,-333,-1000,-361,-944,-365,-888,-358,-832,-365,-778,-381,-726,-404,-673,-423,-617,-429,-561,-425,-504,-422,-448,-418,-392,-424,-336,-435,-281,-446,-228,-464,-177,-490,-127,-516,-76,-541,-26,-567],[-642,-754,-580,-751,-519,-745,-461,-736,-437,-706,-385,-691,-327,-673,-269,-660,-210,-672,-149,-678,-89,-679,-28,-683,-25,-646,-14,-597,37,-572,82,-613,134,-610,165,-557,209,-559,248,-607,305,-624,363,-602,420,-579,465,-605,520,-632,553,-668,566,-703,624,-685,657,-635,679,-578,695,-520,710,-469,748,-425,803,-399,777,-356,741,-306,779,-298,830,-280,830,-220,842,-160,884,-120,925,-79,893,-30,878,25,879,86,894,143,946,153,944,212,965,248,931,293,962,334,1000,378,998,435,948,409,888,403,851,437,872,486,915,515,887,569,876,627,835,656,780,658,736,627,715,680,682,731,632,754,587,724,533,706,540,660,539,600,524,542,506,485,489,432,444,412,400,405,350,407,296,405,246,429,194,448,197,406,235,358,210,304,202,246,176,211,168,159,131,110,97,59,56,13,8,-13,-53,-12,-115,-12,-160,9,-219,17,-278,12,-317,51,-347,104,-377,157,-428,188,-458,238,-515,246,-526,201,-560,153,-604,113,-624,83,-635,24,-667,18,-716,-19,-752,-49,-809,-71,-851,-112,-883,-165,-879,-225,-912,-231,-944,-280,-980,-242,-1000,-275,-966,-326,-940,-382,-904,-431,-844,-443,-790,-473,-729,-473,-670,-486,-643,-529,-663,-580,-703,-623,-648,-642,-628,-698],[-305,-1000,-244,-1000,-183,-1000,-122,-1000,-61,-1000,1,-1000,62,-1000,123,-1000,184,-1000,245,-1000,306,-1000,368,-1000,429,-1000,490,-1000,512,-962,509,-900,507,-839,505,-778,502,-717,500,-656,498,-595,495,-534,493,-473,491,-411,488,-350,486,-289,484,-228,481,-167,479,-106,485,-52,545,-56,606,-52,665,-41,720,-16,775,10,806,-37,788,-77,840,-45,892,-12,944,20,919,58,873,98,826,137,779,176,732,215,683,253,635,291,584,324,528,348,501,400,486,458,505,516,509,576,461,613,424,661,374,671,317,689,328,748,287,782,245,824,197,853,144,879,99,921,66,970,51,1000,-5,975,-61,950,-117,927,-177,914,-238,915,-299,915,-360,915,-422,916,-481,900,-539,883,-594,856,-649,829,-701,797,-752,763,-800,725,-848,687,-896,649,-944,611,-916,557,-917,499,-908,440,-896,383,-877,338,-914,289,-923,234,-893,180,-862,127,-831,74,-801,21,-770,-32,-739,-84,-709,-138,-649,-140,-588,-140,-527,-140,-466,-141,-405,-141,-344,-141,-282,-141,-221,-141,-160,-141,-99,-142,-101,-200,-89,-259,-97,-313,-153,-335,-185,-379,-209,-435,-251,-478,-303,-510,-356,-540,-403,-579,-443,-626,-483,-671,-531,-708,-519,-724,-458,-723,-396,-723,-355,-742,-355,-803,-354,-864,-353,-926,-353,-987],[896,-1000,974,-950,973,-860,898,-806,900,-712,838,-637,763,-663,668,-680,575,-701,489,-702,402,-680,317,-688,243,-627,148,-629,165,-557,202,-499,282,-451,277,-424,196,-473,127,-449,198,-384,160,-350,104,-429,26,-421,83,-346,54,-329,4,-403,-63,-461,-132,-524,-156,-557,-198,-487,-218,-393,-174,-310,-124,-227,-65,-153,-7,-75,-31,0,-57,-67,-137,-57,-97,27,-128,67,-219,91,-130,125,-44,167,25,223,102,271,186,312,215,399,225,496,181,522,113,452,37,423,-55,450,-47,518,11,576,39,642,-50,673,-108,607,-169,615,-131,703,-94,794,-69,887,-57,978,-91,989,-146,910,-215,908,-242,1000,-275,953,-309,865,-367,795,-407,869,-460,863,-509,779,-484,693,-511,604,-588,547,-644,475,-589,403,-531,354,-457,312,-370,318,-283,360,-193,395,-115,433,-59,394,-88,342,-173,308,-256,259,-337,283,-430,276,-524,296,-586,236,-642,281,-680,193,-738,119,-714,63,-641,55,-717,28,-797,-4,-866,-71,-917,-149,-974,-225,-904,-225,-876,-295,-847,-368,-780,-418,-745,-508,-679,-572,-696,-663,-603,-674,-513,-676,-435,-731,-358,-779,-264,-772,-172,-796,-119,-854,-28,-865,65,-874,159,-895,238,-928,334,-931,402,-885,487,-869,572,-824,665,-841,761,-848,844,-884,822,-976],[251,-1000,301,-989,323,-947,308,-899,296,-850,334,-816,370,-780,409,-747,437,-716,434,-665,432,-614,425,-563,405,-526,409,-505,400,-462,445,-479,485,-451,478,-401,467,-351,472,-301,453,-260,450,-219,485,-183,522,-148,532,-102,505,-61,506,-10,509,42,501,90,478,136,497,178,517,215,509,265,489,308,490,357,517,401,544,442,565,484,608,512,642,542,684,568,667,599,638,640,607,677,557,690,506,690,454,691,403,691,357,714,311,737,264,756,215,771,174,803,127,823,84,851,36,864,-15,873,-63,890,-112,906,-160,924,-205,948,-248,976,-293,1000,-341,993,-385,966,-433,948,-482,935,-532,923,-583,916,-632,903,-612,888,-563,881,-543,843,-533,795,-544,745,-589,728,-614,687,-626,638,-642,589,-659,540,-675,492,-684,441,-679,391,-672,342,-645,299,-616,258,-602,209,-596,158,-583,109,-565,61,-545,14,-506,-19,-489,-56,-457,-87,-466,-138,-474,-188,-482,-239,-495,-288,-514,-334,-524,-372,-513,-418,-512,-466,-528,-514,-539,-563,-532,-612,-541,-663,-537,-713,-551,-756,-567,-793,-582,-840,-574,-891,-560,-940,-520,-948,-469,-949,-418,-949,-366,-950,-315,-950,-264,-951,-213,-951,-163,-957,-112,-956,-61,-952,-10,-955,41,-948,92,-950,132,-934,175,-961,215,-980],[-263,-1000,-201,-976,-136,-983,-83,-950,-98,-892,-50,-878,10,-863,71,-859,89,-815,63,-764,129,-756,185,-775,244,-804,299,-836,347,-884,412,-873,457,-827,516,-801,557,-761,585,-704,631,-668,647,-602,650,-536,610,-482,641,-428,685,-378,683,-313,709,-256,689,-193,708,-131,741,-83,751,-18,730,47,688,70,652,27,643,61,581,88,517,110,470,143,419,176,362,192,310,230,273,216,289,274,336,322,327,381,358,441,409,479,453,530,499,574,549,615,544,679,494,688,464,744,403,773,392,828,407,889,427,938,387,950,345,922,285,907,239,935,174,953,118,981,65,962,5,949,-22,1000,-56,994,-100,951,-160,954,-216,916,-277,906,-333,893,-324,929,-388,936,-455,942,-491,898,-479,831,-468,766,-450,701,-424,640,-391,582,-444,553,-503,526,-567,530,-614,520,-652,471,-688,426,-664,364,-711,323,-726,260,-687,209,-717,158,-740,108,-745,46,-744,11,-728,-41,-719,-105,-751,-163,-711,-198,-650,-198,-625,-240,-584,-286,-585,-349,-627,-381,-577,-401,-561,-466,-548,-532,-565,-592,-556,-655,-498,-680,-430,-681,-387,-639,-366,-637,-331,-625,-324,-646,-321,-712,-264,-719,-198,-716,-155,-663,-137,-654,-181,-706,-237,-737,-263,-792,-286,-844,-288,-872,-263,-915,-300,-972],[-955,-508,-911,-500,-867,-490,-823,-489,-781,-482,-741,-461,-702,-440,-659,-425,-615,-417,-575,-399,-538,-374,-495,-363,-450,-359,-405,-355,-361,-360,-317,-368,-272,-367,-234,-343,-190,-342,-147,-337,-106,-317,-83,-283,-45,-259,-4,-240,38,-224,79,-206,118,-184,140,-153,129,-114,171,-101,212,-114,253,-130,293,-151,335,-167,379,-173,416,-151,439,-129,458,-170,496,-163,539,-148,575,-123,604,-89,648,-87,692,-83,721,-56,710,-12,696,30,719,63,758,86,791,116,834,130,877,140,916,162,923,195,895,229,861,251,872,290,894,325,928,354,966,378,999,408,1000,450,978,488,940,508,902,484,864,461,821,466,778,460,737,442,717,407,685,386,643,369,600,357,561,372,526,401,489,426,447,434,433,452,388,452,344,459,299,454,255,453,212,466,168,475,124,486,79,490,35,494,12,461,-32,457,-50,424,-77,396,-109,364,-145,339,-168,304,-212,301,-239,334,-272,356,-315,344,-359,337,-404,336,-443,354,-482,348,-525,335,-531,308,-504,272,-482,234,-470,191,-469,146,-485,104,-502,62,-512,18,-523,-25,-534,-69,-545,-113,-562,-154,-597,-180,-638,-197,-669,-226,-696,-261,-731,-289,-771,-308,-815,-319,-857,-334,-892,-362,-927,-390,-963,-417,-1000,-443,-988,-480],[162,-250,212,-244,261,-232,302,-203,343,-174,386,-149,435,-137,483,-123,525,-97,566,-67,609,-43,658,-31,707,-36,756,-50,804,-62,854,-64,904,-65,949,-41,988,-13,1000,35,982,79,933,90,884,102,836,115,787,128,738,141,689,140,640,131,590,122,543,104,496,87,449,70,402,50,356,30,310,10,265,-11,220,-35,174,-56,127,-72,86,-53,65,-7,32,30,-16,40,-66,45,-116,50,-166,56,-216,62,-266,71,-315,81,-332,121,-337,171,-362,200,-412,200,-462,199,-513,199,-563,198,-613,198,-664,198,-714,199,-764,200,-814,201,-865,201,-911,217,-948,250,-965,233,-973,184,-986,135,-1000,87,-980,46,-946,10,-903,-17,-863,9,-853,58,-824,99,-775,111,-726,122,-677,113,-627,106,-577,113,-569,66,-533,40,-483,32,-433,25,-383,21,-333,16,-284,8,-234,-1,-185,-9,-134,-8,-84,-11,-97,-27,-147,-34,-197,-32,-246,-24,-296,-17,-346,-10,-396,-7,-446,-5,-497,-3,-546,1,-591,24,-636,46,-681,69,-731,67,-769,39,-801,0,-816,-47,-828,-96,-778,-98,-727,-100,-677,-102,-627,-103,-577,-102,-526,-101,-476,-101,-426,-100,-375,-99,-325,-98,-275,-98,-225,-97,-174,-96,-124,-96,-99,-139,-74,-183,-32,-207,14,-226,63,-239,113,-246],[-24,-1000,50,-997,125,-995,199,-995,273,-996,346,-985,420,-983,494,-986,551,-954,528,-885,510,-814,520,-741,526,-673,575,-662,646,-685,716,-707,789,-706,858,-682,882,-613,919,-550,902,-483,855,-429,795,-400,753,-340,746,-267,737,-194,793,-163,845,-114,912,-86,934,-23,919,50,921,123,929,197,915,268,913,339,871,394,847,463,841,524,781,563,745,523,712,457,661,491,600,533,527,527,456,506,420,443,385,378,320,348,270,395,282,466,247,517,175,533,107,516,36,530,-7,546,-3,620,-7,679,49,722,35,785,97,825,84,888,86,951,18,943,-37,902,-102,938,-143,998,-185,1000,-223,937,-278,887,-326,833,-372,776,-424,723,-482,677,-539,630,-594,580,-574,571,-507,587,-563,551,-633,535,-667,471,-716,415,-735,370,-694,368,-763,345,-784,276,-823,214,-814,204,-766,260,-703,280,-713,247,-750,216,-769,200,-831,168,-867,103,-904,40,-934,-28,-915,-29,-853,-39,-795,-76,-752,-137,-742,-210,-743,-284,-741,-354,-705,-307,-635,-287,-585,-285,-526,-314,-598,-313,-666,-343,-713,-398,-731,-452,-670,-450,-645,-481,-657,-554,-620,-601,-562,-567,-493,-577,-419,-576,-344,-576,-270,-576,-196,-576,-122,-575,-88,-615,-88,-689,-89,-764,-89,-838,-89,-912,-82,-985],[134,-1000,163,-935,229,-932,265,-872,313,-831,380,-824,389,-761,451,-747,500,-786,500,-715,563,-683,620,-648,687,-630,755,-626,796,-564,853,-556,920,-548,992,-530,1000,-478,962,-415,941,-343,930,-271,935,-203,876,-165,824,-153,805,-99,750,-51,719,12,699,75,686,130,723,81,792,66,805,130,833,189,822,243,861,304,817,358,793,396,840,445,815,509,849,569,917,588,929,633,898,684,839,729,787,781,729,821,660,830,592,802,535,769,485,766,413,745,351,724,295,773,240,823,215,892,232,965,188,979,127,999,57,1000,6,960,-44,939,-106,904,-163,908,-224,923,-291,908,-359,898,-419,861,-478,837,-492,795,-546,759,-496,710,-481,636,-470,562,-458,488,-457,463,-456,402,-448,328,-422,281,-381,341,-357,381,-379,311,-425,254,-433,220,-441,155,-457,89,-524,58,-571,2,-588,-64,-601,-123,-548,-121,-618,-133,-653,-166,-705,-189,-749,-210,-813,-235,-883,-260,-952,-265,-1000,-310,-959,-343,-949,-365,-988,-379,-1000,-426,-930,-453,-856,-459,-788,-488,-724,-460,-671,-432,-600,-445,-553,-443,-484,-448,-513,-512,-523,-585,-556,-652,-515,-680,-464,-661,-420,-617,-345,-608,-273,-601,-204,-628,-248,-656,-200,-707,-130,-733,-61,-762,-16,-818,-18,-892,1,-962,69,-991],[152,-1000,186,-964,231,-940,261,-904,245,-862,226,-818,206,-788,217,-771,203,-725,200,-678,222,-636,267,-614,294,-572,319,-531,298,-487,270,-445,245,-401,258,-354,279,-308,296,-261,316,-215,329,-167,300,-139,298,-94,302,-55,288,-16,309,27,328,62,329,108,364,143,357,191,326,230,347,269,383,303,419,338,443,382,439,429,422,477,394,518,364,558,336,600,309,643,280,684,251,725,216,761,184,799,155,840,119,872,77,867,33,888,34,849,10,888,-9,895,-39,907,-78,927,-124,945,-162,964,-211,975,-248,1000,-247,977,-266,936,-285,960,-307,936,-297,899,-337,880,-369,856,-393,833,-397,783,-387,734,-386,684,-380,647,-394,598,-402,552,-405,504,-419,458,-405,411,-380,372,-373,336,-328,327,-316,292,-300,255,-265,224,-229,189,-203,151,-177,109,-149,68,-127,25,-83,12,-64,-16,-70,-64,-69,-113,-108,-143,-126,-179,-165,-172,-178,-220,-203,-261,-198,-309,-185,-357,-194,-402,-209,-449,-204,-492,-216,-525,-220,-575,-227,-614,-252,-651,-289,-684,-336,-701,-376,-731,-412,-765,-443,-799,-430,-811,-419,-845,-373,-849,-345,-807,-317,-766,-282,-741,-235,-731,-194,-756,-151,-744,-107,-721,-80,-755,-41,-784,-32,-831,-22,-880,-10,-929,23,-966,66,-982,110,-996],[-341,-774,-301,-750,-267,-719,-221,-726,-181,-743,-143,-729,-96,-729,-51,-723,-9,-703,34,-683,69,-653,99,-616,134,-584,171,-554,197,-515,233,-485,255,-447,228,-408,201,-369,176,-330,178,-282,195,-246,242,-253,288,-263,331,-252,304,-213,311,-172,334,-131,367,-100,387,-57,422,-27,458,3,498,28,543,43,588,58,633,73,678,88,723,103,769,118,814,133,859,149,905,156,952,156,1000,156,984,182,950,215,916,248,882,282,848,315,814,348,781,382,748,416,715,451,683,487,651,522,620,557,581,576,533,574,486,571,439,579,394,595,352,617,324,654,279,667,232,674,194,700,148,704,101,707,63,680,23,670,-21,690,-64,710,-96,743,-130,774,-177,768,-224,761,-271,753,-318,747,-358,721,-397,695,-437,669,-478,644,-525,640,-573,639,-609,616,-631,576,-626,529,-664,508,-696,497,-727,461,-741,416,-759,372,-779,331,-814,299,-850,269,-873,229,-911,201,-958,191,-1000,172,-982,129,-954,95,-907,97,-862,87,-854,42,-855,-6,-856,-53,-844,-99,-825,-143,-829,-190,-802,-228,-763,-218,-741,-255,-734,-301,-723,-347,-697,-386,-673,-427,-648,-467,-605,-484,-580,-513,-570,-559,-549,-602,-538,-647,-528,-694,-484,-702,-446,-716,-410,-702,-381,-694,-362,-738],[-114,-866,-57,-860,0,-864,56,-851,112,-838,168,-825,224,-812,280,-799,337,-798,388,-775,435,-742,487,-719,544,-713,601,-713,658,-712,716,-706,773,-698,830,-691,887,-684,931,-715,966,-721,1000,-675,985,-631,948,-591,899,-568,883,-513,865,-459,846,-404,819,-354,788,-306,749,-264,717,-217,701,-162,702,-105,712,-48,722,9,733,65,743,122,740,179,728,235,730,292,751,345,771,399,787,454,800,510,827,558,841,605,789,627,743,655,723,709,687,753,673,809,666,866,610,860,557,838,510,807,457,807,404,829,350,850,296,857,247,827,204,790,171,744,135,699,100,653,72,608,17,591,-26,556,-77,534,-125,502,-170,466,-219,439,-241,481,-280,439,-327,446,-378,474,-432,490,-485,513,-537,537,-586,566,-630,580,-617,524,-598,470,-578,415,-567,360,-563,302,-546,251,-540,199,-584,169,-631,179,-660,229,-709,256,-756,232,-808,208,-860,185,-888,137,-899,81,-928,34,-961,-11,-978,-65,-959,-116,-914,-151,-943,-166,-983,-188,-1000,-243,-999,-294,-978,-345,-992,-396,-978,-450,-983,-505,-934,-535,-882,-560,-826,-573,-769,-579,-737,-603,-734,-649,-681,-663,-638,-702,-592,-729,-536,-720,-482,-733,-429,-756,-375,-772,-317,-771,-260,-771,-202,-771,-146,-775,-121,-819],[-359,-871,-329,-849,-306,-803,-282,-756,-258,-709,-240,-660,-223,-611,-208,-560,-193,-510,-181,-459,-174,-407,-166,-355,-157,-304,-144,-253,-118,-209,-93,-165,-77,-115,-38,-87,-20,-37,3,9,16,-26,18,-76,57,-74,87,-34,104,15,139,52,190,65,240,77,282,108,324,138,374,155,423,172,456,212,489,253,521,295,549,339,582,379,625,409,668,439,711,469,751,501,775,548,790,598,832,610,869,646,900,687,929,725,970,724,1000,735,994,775,945,794,914,831,884,871,840,846,797,835,762,813,732,771,693,736,653,704,626,659,598,615,560,579,518,548,476,516,440,478,404,440,374,398,341,356,303,321,254,304,207,280,164,250,119,225,67,226,17,218,-34,208,-84,204,-135,217,-178,202,-216,171,-257,200,-304,220,-356,230,-406,227,-441,189,-479,154,-528,136,-564,102,-585,150,-605,198,-626,247,-647,295,-680,313,-709,270,-744,231,-789,240,-820,281,-871,272,-923,270,-972,286,-978,234,-983,182,-989,130,-994,78,-1000,26,-977,-18,-957,-67,-942,-117,-927,-167,-903,-214,-884,-262,-868,-312,-856,-362,-859,-414,-856,-465,-836,-512,-832,-565,-797,-585,-745,-586,-697,-597,-680,-646,-643,-678,-599,-707,-550,-723,-502,-733,-454,-749,-419,-787,-395,-833],[-564,-688,-545,-649,-520,-609,-477,-586,-432,-567,-386,-551,-336,-551,-287,-551,-238,-551,-189,-551,-139,-551,-90,-551,-41,-551,8,-551,58,-551,107,-551,156,-551,206,-551,255,-551,304,-551,353,-551,403,-551,452,-551,501,-551,550,-551,600,-550,649,-550,698,-550,747,-550,797,-550,846,-550,895,-550,945,-550,994,-550,994,-501,994,-451,994,-402,995,-353,995,-304,995,-254,995,-205,996,-156,996,-107,996,-57,996,-8,997,41,997,91,997,140,998,189,998,238,999,288,999,337,999,386,1000,435,1000,485,1000,534,1000,583,1000,632,968,650,919,650,870,650,821,650,771,650,722,650,673,650,624,650,574,649,525,649,476,649,427,649,377,649,328,648,279,648,229,648,180,648,131,648,82,648,32,647,-17,647,-66,647,-115,647,-165,646,-214,646,-263,646,-312,646,-362,648,-406,664,-447,688,-492,678,-538,660,-580,641,-604,598,-639,571,-688,570,-731,591,-775,612,-790,591,-831,563,-872,535,-920,528,-968,518,-1000,496,-986,449,-971,402,-957,355,-938,309,-919,264,-899,218,-871,178,-839,141,-807,104,-767,77,-741,39,-725,-8,-706,-53,-687,-99,-668,-144,-645,-187,-618,-229,-592,-270,-573,-313,-582,-362,-591,-410,-598,-459,-593,-508,-589,-557,-584,-606,-580,-655],[-418,-546,-377,-534,-334,-523,-292,-510,-250,-497,-208,-487,-166,-489,-129,-465,-97,-434,-74,-396,-39,-370,-3,-345,33,-320,57,-283,95,-261,134,-240,166,-210,204,-190,248,-181,290,-171,333,-158,346,-118,354,-75,378,-47,418,-63,456,-84,495,-105,534,-125,576,-141,618,-156,659,-156,700,-140,725,-104,760,-78,802,-76,846,-82,890,-82,934,-79,970,-53,1000,-23,997,19,985,62,974,105,964,148,955,191,949,235,981,262,984,301,948,326,911,350,907,388,914,432,894,467,863,499,830,528,787,537,744,543,699,544,655,546,611,546,568,537,525,528,482,518,439,509,396,496,355,480,314,464,273,447,229,446,195,450,234,469,277,477,317,497,356,517,323,526,281,514,238,502,196,489,154,477,111,465,69,453,27,439,-13,419,-52,400,-92,380,-132,361,-171,342,-211,322,-251,303,-291,283,-333,272,-377,267,-420,261,-464,255,-508,250,-551,242,-595,234,-638,225,-682,217,-725,209,-764,192,-800,165,-835,138,-870,111,-908,89,-948,71,-988,53,-1000,12,-999,-32,-971,-67,-942,-100,-910,-130,-877,-160,-843,-187,-807,-213,-764,-221,-723,-227,-692,-257,-670,-295,-640,-328,-601,-347,-560,-365,-533,-392,-544,-435,-556,-477,-545,-517,-505,-531,-461,-539],[-784,-886,-717,-871,-649,-860,-582,-844,-521,-812,-459,-793,-390,-787,-325,-764,-261,-749,-199,-778,-143,-818,-83,-840,-25,-867,4,-869,-16,-851,40,-879,100,-869,166,-872,220,-840,173,-848,202,-813,239,-820,280,-799,345,-797,404,-795,472,-800,537,-823,574,-796,598,-731,618,-665,644,-601,664,-535,659,-474,638,-409,621,-342,600,-277,585,-211,535,-191,484,-237,438,-288,398,-343,381,-409,339,-464,311,-526,287,-585,258,-527,294,-472,302,-404,337,-345,376,-289,420,-236,454,-181,471,-117,506,-60,518,8,547,69,576,132,612,191,641,253,672,315,701,378,733,438,777,491,809,526,775,569,782,638,804,703,851,752,907,787,955,836,1000,885,931,885,862,885,793,886,724,886,655,886,585,886,516,886,447,886,378,886,309,886,240,886,171,886,105,883,85,864,30,886,-40,886,-109,886,-178,886,-247,886,-316,886,-385,886,-454,886,-523,886,-592,886,-661,886,-730,886,-799,886,-869,886,-938,886,-959,837,-959,768,-959,699,-959,630,-959,561,-959,492,-959,423,-959,354,-959,285,-959,216,-959,147,-959,78,-959,8,-959,-61,-959,-130,-959,-199,-959,-268,-959,-337,-959,-406,-968,-474,-983,-541,-1000,-608,-980,-670,-960,-735,-977,-802,-959,-863,-919,-876,-852,-881],[-234,-1000,-194,-973,-148,-937,-98,-905,-49,-870,4,-842,59,-820,117,-813,152,-772,200,-743,213,-685,267,-664,325,-655,380,-634,435,-637,494,-627,527,-663,572,-690,626,-665,669,-625,715,-587,773,-573,823,-541,879,-520,823,-504,771,-507,816,-471,843,-418,886,-378,881,-319,889,-260,840,-264,824,-206,809,-148,794,-90,760,-43,721,3,682,49,643,94,598,133,550,169,502,204,453,239,399,262,342,283,286,303,230,324,173,343,116,363,63,388,23,432,-14,479,-20,529,-62,504,-86,551,-98,608,-120,662,-145,714,-168,769,-174,825,-193,875,-242,908,-256,962,-297,1000,-355,992,-401,958,-432,908,-450,855,-504,840,-559,825,-611,795,-663,803,-710,838,-732,803,-705,758,-744,729,-719,689,-670,676,-656,631,-659,573,-675,517,-656,489,-606,458,-567,413,-549,356,-529,300,-507,245,-529,190,-539,132,-551,107,-554,165,-560,223,-599,240,-592,181,-626,229,-668,270,-712,276,-758,238,-801,196,-856,175,-889,129,-837,99,-827,43,-839,-14,-846,-72,-841,-131,-860,-188,-856,-242,-804,-266,-759,-301,-739,-357,-690,-359,-717,-383,-740,-437,-703,-484,-659,-523,-622,-569,-602,-625,-599,-685,-610,-743,-614,-801,-560,-821,-512,-856,-455,-864,-401,-888,-342,-900,-285,-917,-235,-945],[-453,-658,-404,-653,-358,-635,-316,-607,-272,-584,-222,-580,-171,-580,-127,-559,-87,-528,-41,-508,7,-499,56,-511,105,-520,139,-486,153,-440,163,-391,185,-346,222,-312,269,-304,319,-308,369,-312,419,-315,469,-315,511,-288,483,-253,435,-246,384,-249,334,-249,300,-225,319,-194,369,-189,418,-178,466,-164,515,-151,565,-142,615,-136,664,-127,713,-114,759,-95,806,-76,847,-46,885,-14,924,18,963,50,998,85,1000,131,975,175,946,216,904,242,864,271,839,314,797,330,761,295,734,254,691,227,643,221,593,222,544,211,494,201,445,208,395,213,344,212,295,204,245,200,195,202,145,214,98,231,54,255,17,290,-27,312,-77,318,-127,324,-176,330,-219,303,-257,270,-304,257,-353,263,-401,279,-449,292,-496,308,-509,353,-517,403,-542,446,-571,487,-600,529,-626,572,-650,616,-678,658,-718,655,-751,617,-795,594,-827,561,-829,511,-849,465,-888,434,-887,384,-884,334,-875,286,-901,246,-942,217,-971,176,-999,134,-1000,100,-950,99,-910,70,-877,32,-866,-16,-884,-62,-906,-106,-883,-145,-848,-181,-820,-222,-843,-263,-877,-299,-866,-346,-855,-394,-863,-444,-874,-493,-890,-540,-863,-572,-838,-615,-796,-642,-747,-650,-697,-646,-649,-631,-600,-622,-551,-635,-503,-648],[592,-1000,613,-943,652,-896,691,-849,731,-802,770,-755,805,-705,835,-651,861,-596,879,-537,897,-479,915,-420,899,-361,881,-303,848,-251,807,-206,761,-166,709,-132,657,-99,606,-66,554,-33,501,-2,444,19,386,40,329,62,271,83,220,114,180,160,140,207,99,253,59,299,-2,293,-63,287,-60,336,-20,369,40,363,99,346,156,324,214,302,273,287,333,275,394,269,455,268,516,270,577,281,637,292,686,329,733,368,700,420,668,472,635,523,602,575,570,627,537,679,504,731,471,783,439,835,406,887,372,938,311,939,250,932,196,909,144,877,87,853,27,846,-34,845,-92,867,-150,887,-209,903,-268,919,-328,933,-389,938,-450,944,-510,955,-570,968,-630,983,-689,1000,-749,995,-809,983,-867,963,-883,911,-887,849,-892,788,-896,727,-901,666,-905,605,-910,543,-914,482,-915,421,-914,360,-914,298,-906,238,-890,178,-865,123,-824,78,-781,34,-738,-10,-696,-55,-657,-102,-623,-153,-589,-204,-554,-255,-520,-306,-486,-357,-451,-408,-417,-459,-383,-509,-348,-560,-314,-611,-279,-662,-245,-712,-204,-758,-154,-793,-99,-769,-49,-733,0,-697,50,-661,101,-631,157,-652,203,-690,225,-747,248,-804,273,-860,310,-909,368,-921,427,-940,484,-962,540,-986],[408,-1000,384,-963,358,-916,360,-863,383,-813,380,-760,381,-705,375,-652,346,-606,327,-554,305,-505,294,-454,293,-400,296,-345,293,-290,293,-236,328,-194,377,-170,431,-171,486,-171,524,-140,528,-88,514,-35,482,8,437,38,386,46,351,4,313,29,295,80,281,133,269,186,259,240,239,282,188,271,154,298,188,341,160,377,120,414,90,459,50,496,32,544,43,598,51,652,54,705,28,752,-6,794,-18,840,36,846,76,882,75,933,85,986,36,967,-17,981,-68,1000,-116,982,-166,960,-218,943,-271,935,-321,928,-325,874,-339,821,-351,774,-322,739,-325,685,-331,630,-346,579,-393,551,-440,522,-484,489,-524,455,-519,400,-514,345,-509,291,-503,236,-502,182,-517,130,-528,77,-527,22,-525,-33,-522,-88,-518,-143,-514,-197,-490,-236,-439,-222,-389,-200,-348,-172,-310,-172,-298,-224,-273,-271,-239,-315,-194,-345,-151,-336,-121,-297,-117,-352,-111,-406,-104,-461,-108,-509,-159,-525,-204,-497,-228,-448,-250,-398,-269,-347,-297,-307,-351,-297,-398,-269,-443,-300,-473,-342,-467,-396,-439,-443,-410,-490,-374,-532,-339,-573,-284,-573,-233,-590,-181,-603,-127,-600,-72,-601,-23,-623,17,-660,45,-708,73,-755,101,-802,132,-847,166,-890,218,-904,271,-916,317,-946,360,-979],[-317,-562,-271,-549,-249,-511,-232,-472,-194,-485,-149,-497,-141,-541,-109,-551,-63,-534,-50,-490,-16,-458,31,-445,77,-433,120,-409,155,-381,198,-385,245,-392,282,-361,262,-321,225,-292,253,-262,285,-227,314,-189,338,-147,379,-151,416,-181,454,-207,432,-250,427,-287,474,-275,517,-255,557,-226,600,-210,647,-221,673,-209,650,-173,648,-143,682,-111,717,-79,758,-102,794,-84,834,-59,878,-54,920,-34,928,13,959,50,992,85,1000,133,953,143,909,157,875,190,843,224,801,250,785,295,775,342,733,364,703,400,664,429,618,444,570,443,522,434,484,457,461,499,445,544,426,515,387,495,344,472,299,461,260,488,212,486,166,472,127,444,83,431,37,418,-5,394,-51,381,-93,385,-136,367,-149,411,-156,459,-192,474,-221,514,-238,550,-285,541,-325,562,-374,561,-420,548,-441,505,-481,478,-511,441,-545,407,-586,387,-618,360,-647,322,-688,295,-717,257,-750,221,-793,209,-827,174,-850,131,-870,88,-898,48,-898,7,-875,-36,-897,-77,-936,-106,-967,-142,-985,-186,-1000,-231,-964,-211,-940,-181,-916,-223,-884,-259,-839,-274,-794,-289,-747,-279,-722,-318,-675,-328,-645,-359,-605,-370,-577,-404,-535,-420,-488,-433,-444,-454,-400,-473,-356,-494,-327,-516,-357,-553],[-478,-333,-435,-329,-393,-321,-351,-322,-319,-313,-279,-314,-237,-316,-199,-304,-161,-285,-119,-285,-80,-270,-57,-257,-24,-233,5,-201,41,-178,83,-174,126,-174,165,-162,204,-143,242,-124,276,-98,311,-73,349,-55,363,-66,387,-59,420,-33,423,-14,412,-6,441,-3,472,6,492,34,527,39,565,50,606,60,644,79,687,82,724,98,723,132,698,150,732,160,775,164,817,165,859,174,896,196,927,225,966,241,1000,258,976,289,933,292,891,298,851,312,817,318,794,323,752,327,711,317,669,311,626,308,584,311,541,315,498,319,457,327,414,328,371,333,336,330,360,295,393,269,428,244,448,210,423,176,382,167,339,165,296,162,256,150,224,122,190,96,182,55,168,14,139,-15,98,-14,56,-6,14,-16,-27,-29,-68,-42,-108,-57,-145,-77,-173,-110,-201,-108,-244,-107,-286,-111,-310,-144,-329,-119,-365,-133,-408,-135,-448,-145,-480,-173,-439,-185,-408,-206,-440,-231,-482,-232,-525,-233,-568,-233,-610,-229,-644,-204,-676,-177,-711,-152,-747,-135,-788,-131,-828,-122,-845,-84,-886,-74,-924,-53,-935,-82,-975,-70,-1000,-75,-961,-92,-920,-102,-905,-129,-906,-170,-879,-203,-846,-230,-806,-246,-766,-262,-727,-279,-686,-292,-644,-298,-602,-303,-561,-315,-520,-329],[-27,-863,38,-842,98,-810,147,-763,187,-708,243,-670,286,-617,341,-582,400,-556,451,-513,517,-496,585,-495,653,-488,716,-511,760,-562,827,-569,820,-530,846,-469,850,-405,886,-368,885,-307,942,-270,1000,-239,975,-205,918,-209,900,-158,903,-90,864,-60,803,-81,780,-143,718,-164,653,-182,586,-184,522,-187,463,-164,409,-202,347,-189,281,-206,218,-216,162,-255,109,-220,41,-227,-9,-190,-49,-135,-104,-160,-146,-214,-211,-224,-235,-166,-242,-99,-247,-31,-210,20,-164,71,-118,117,-100,183,-85,250,-48,307,1,354,48,404,85,461,133,510,181,558,234,600,281,640,294,705,336,758,385,806,405,863,351,841,304,792,248,753,199,706,154,654,90,632,27,606,-35,582,-102,596,-166,586,-180,522,-232,478,-288,439,-338,393,-382,341,-426,288,-453,233,-387,220,-353,215,-407,174,-454,125,-501,75,-537,17,-538,-51,-535,-119,-566,-178,-617,-223,-664,-271,-729,-288,-757,-231,-783,-169,-819,-111,-852,-51,-903,-66,-936,-126,-973,-183,-984,-250,-1000,-317,-989,-374,-932,-343,-868,-340,-821,-358,-754,-359,-693,-376,-661,-436,-619,-398,-568,-354,-505,-361,-441,-340,-386,-358,-399,-422,-404,-468,-355,-505,-290,-526,-269,-588,-287,-650,-275,-706,-212,-731,-152,-762,-98,-790,-75,-833],[-227,-1000,-219,-932,-222,-868,-170,-838,-119,-877,-63,-909,4,-906,61,-875,126,-857,160,-799,191,-741,247,-702,312,-688,373,-663,423,-707,488,-730,554,-749,623,-750,691,-740,749,-716,798,-671,835,-612,887,-610,893,-546,871,-482,905,-430,921,-364,931,-295,943,-227,911,-180,875,-134,840,-77,816,-13,801,54,789,121,750,178,718,238,716,305,727,373,750,439,771,504,789,571,837,608,867,663,857,728,813,765,752,748,736,695,698,745,640,757,572,745,506,728,442,708,373,711,304,718,334,729,403,725,464,733,396,740,327,746,258,753,190,761,129,741,60,745,100,755,124,766,55,772,-14,778,-81,793,-147,812,-211,838,-276,863,-340,887,-406,908,-467,940,-530,967,-590,1000,-642,990,-644,921,-647,852,-641,783,-613,728,-597,663,-596,597,-614,538,-678,517,-719,472,-748,412,-814,398,-879,382,-932,345,-943,307,-895,258,-876,194,-877,127,-898,61,-925,-1,-870,-9,-825,-43,-813,-108,-779,-168,-825,-203,-854,-255,-818,-298,-749,-292,-693,-261,-679,-317,-715,-373,-762,-411,-736,-469,-731,-510,-744,-566,-788,-586,-820,-640,-822,-709,-821,-778,-773,-826,-714,-856,-671,-909,-610,-902,-569,-856,-501,-841,-452,-840,-427,-885,-362,-893,-364,-960,-319,-958,-285,-980],[-795,-936,-732,-914,-669,-891,-607,-869,-544,-847,-481,-824,-418,-802,-360,-829,-300,-859,-236,-857,-174,-834,-109,-818,-51,-800,-3,-754,32,-700,97,-692,162,-677,228,-675,291,-695,341,-737,361,-766,386,-705,405,-642,433,-581,461,-521,496,-464,533,-409,575,-357,616,-305,658,-253,715,-220,756,-168,795,-114,841,-67,880,-18,944,3,1000,36,953,79,894,49,836,37,806,93,773,141,772,207,772,274,773,340,825,365,879,405,885,456,829,492,789,544,818,602,832,666,814,727,758,763,727,810,776,854,805,914,798,936,762,880,718,830,667,787,660,723,647,658,600,615,542,582,481,564,473,603,516,652,560,700,546,750,481,737,416,728,360,693,314,645,319,594,356,540,367,475,365,409,338,349,295,299,243,257,190,217,130,188,70,160,17,119,-44,95,-108,79,-172,60,-229,28,-266,-25,-254,-89,-286,-146,-336,-189,-390,-227,-444,-266,-500,-301,-561,-329,-611,-371,-618,-331,-596,-271,-549,-226,-487,-200,-430,-168,-400,-112,-446,-63,-498,-23,-530,29,-577,-10,-619,-61,-664,-109,-728,-128,-792,-147,-853,-171,-894,-223,-931,-279,-959,-338,-980,-402,-967,-467,-927,-520,-887,-573,-871,-634,-886,-694,-943,-728,-1000,-762,-975,-798,-920,-831,-893,-882,-854,-935],[417,-994,480,-980,544,-969,604,-975,646,-927,699,-893,758,-909,817,-909,864,-897,909,-851,954,-818,964,-768,961,-709,1000,-675,995,-625,949,-579,902,-538,874,-487,850,-429,842,-365,836,-300,800,-254,785,-194,772,-145,799,-91,798,-26,817,35,813,99,836,159,829,221,859,277,907,320,934,379,961,438,897,447,832,457,768,468,745,522,722,568,736,631,738,695,717,756,719,817,766,861,823,887,860,865,860,930,857,994,808,985,760,959,722,913,671,878,616,852,583,798,543,838,478,832,416,814,383,769,333,769,287,768,253,723,197,733,134,744,73,754,66,708,60,644,23,591,19,528,24,464,12,401,6,343,-59,341,-120,332,-148,304,-212,315,-238,370,-266,417,-331,411,-392,427,-447,410,-482,355,-507,298,-525,237,-564,191,-629,190,-694,191,-759,193,-824,189,-888,192,-949,199,-1000,179,-969,139,-953,89,-901,59,-848,69,-810,39,-768,46,-742,86,-696,43,-649,1,-599,-37,-579,-98,-579,-163,-559,-220,-524,-274,-480,-320,-429,-358,-415,-417,-398,-480,-399,-544,-381,-606,-372,-670,-344,-728,-323,-789,-322,-854,-306,-906,-267,-957,-207,-974,-151,-943,-103,-903,-42,-890,22,-884,84,-874,119,-928,181,-927,242,-947,304,-961,367,-961],[587,-1000,647,-990,709,-974,768,-962,826,-987,867,-948,858,-885,837,-824,806,-768,775,-712,753,-651,741,-588,740,-524,721,-463,702,-402,700,-338,707,-274,699,-210,677,-150,661,-87,667,-23,624,24,575,66,519,96,467,132,433,187,405,245,368,297,322,342,307,402,309,466,311,531,305,595,293,658,263,715,224,765,164,787,121,833,69,870,27,918,-16,967,-75,975,-108,940,-99,882,-138,853,-197,877,-255,877,-274,932,-327,965,-380,942,-425,917,-473,876,-529,905,-581,934,-626,970,-669,1000,-708,949,-730,891,-777,847,-819,800,-867,757,-838,700,-783,667,-735,704,-699,683,-681,626,-728,588,-727,535,-770,499,-759,437,-741,398,-680,393,-621,402,-561,386,-562,324,-534,277,-480,300,-451,358,-405,396,-341,406,-287,375,-246,363,-229,419,-172,410,-159,359,-134,302,-105,250,-97,189,-102,125,-104,61,-91,-2,-131,-45,-179,-83,-234,-106,-227,-170,-214,-231,-172,-276,-122,-307,-105,-364,-135,-420,-169,-470,-232,-478,-294,-461,-355,-442,-376,-468,-395,-529,-386,-592,-364,-651,-300,-650,-235,-650,-171,-650,-107,-650,-49,-646,5,-627,60,-618,118,-602,181,-599,238,-569,288,-547,280,-606,302,-661,326,-719,355,-777,369,-837,378,-900,400,-960,462,-971,526,-980],[148,-1000,204,-982,193,-932,134,-913,92,-872,47,-833,14,-781,-4,-722,-20,-662,-54,-610,-6,-602,25,-559,60,-510,56,-452,63,-393,102,-353,161,-347,223,-342,282,-350,341,-335,380,-286,420,-238,476,-245,538,-241,599,-250,657,-243,640,-189,616,-135,614,-73,619,-13,640,45,677,93,634,137,632,165,676,205,701,258,719,315,713,361,704,308,673,254,625,278,580,272,560,297,497,297,435,297,376,299,370,356,410,377,453,406,419,419,361,434,344,483,358,540,401,580,419,634,417,694,406,755,395,816,384,878,372,939,361,1000,328,989,279,970,288,926,321,873,333,826,278,798,224,776,168,779,116,785,57,798,-2,796,-27,752,-65,714,-87,661,-138,630,-176,590,-216,545,-265,514,-319,503,-372,473,-423,461,-471,476,-530,462,-568,421,-618,397,-671,364,-719,327,-715,284,-686,263,-674,209,-618,197,-576,158,-550,112,-519,63,-525,32,-546,5,-536,-29,-536,-88,-542,-150,-528,-190,-550,-244,-540,-294,-576,-338,-596,-390,-572,-418,-536,-443,-532,-493,-538,-543,-496,-498,-475,-454,-468,-509,-457,-548,-406,-584,-370,-633,-327,-658,-324,-717,-325,-739,-293,-790,-247,-831,-190,-827,-186,-801,-157,-848,-108,-862,-47,-864,4,-900,60,-926,96,-973],[630,-673,694,-655,731,-606,758,-544,802,-511,859,-481,889,-435,953,-450,1000,-436,973,-378,939,-324,878,-317,884,-249,850,-237,808,-201,770,-176,720,-162,664,-124,606,-98,553,-69,565,-102,577,-154,525,-124,473,-83,443,-47,482,-9,533,-24,596,-10,565,16,525,38,491,88,530,136,560,195,546,215,549,223,556,267,548,287,567,315,567,338,543,376,516,434,494,456,488,483,454,515,429,555,388,587,336,602,300,590,277,627,231,644,200,673,177,670,158,646,121,643,74,609,40,576,-9,596,-53,596,-86,627,-104,638,-148,621,-168,578,-197,536,-217,507,-188,455,-192,391,-228,366,-258,334,-291,332,-348,347,-399,384,-458,373,-505,399,-539,381,-598,373,-641,353,-691,315,-747,279,-794,262,-840,231,-832,197,-839,136,-862,83,-912,52,-950,14,-959,-10,-991,-62,-1000,-105,-951,-139,-906,-152,-847,-177,-790,-209,-776,-256,-794,-314,-746,-335,-719,-355,-689,-410,-625,-406,-603,-463,-550,-492,-515,-454,-458,-428,-437,-366,-412,-325,-344,-312,-290,-281,-251,-230,-180,-225,-110,-222,-45,-200,15,-184,79,-210,150,-216,212,-244,238,-288,275,-318,336,-337,394,-362,448,-389,513,-395,468,-444,405,-440,379,-468,417,-516,482,-527,510,-580,535,-635,560,-664],[71,-1000,102,-981,110,-929,122,-886,124,-843,144,-800,155,-748,179,-713,189,-676,158,-637,132,-599,131,-550,133,-500,112,-467,89,-419,71,-369,66,-319,50,-279,37,-232,52,-188,62,-138,69,-94,48,-48,46,0,20,40,10,89,18,142,-1,180,-12,226,-23,271,-22,325,-31,365,-20,410,-12,453,9,481,-28,500,2,531,-15,571,-24,616,-44,659,-51,702,-78,743,-95,781,-77,830,-40,842,-31,887,15,899,70,902,122,914,94,912,47,936,19,974,-10,1000,-39,969,-14,967,-7,946,-51,976,-66,947,-19,937,-43,931,-75,958,-80,936,-112,938,-118,909,-73,904,-51,915,-67,873,-58,889,-103,890,-112,865,-157,842,-149,811,-109,841,-114,833,-132,810,-116,787,-111,765,-122,746,-134,726,-138,704,-116,681,-101,668,-135,668,-131,652,-131,611,-163,596,-189,616,-161,578,-132,557,-113,550,-124,580,-105,577,-101,576,-93,536,-92,525,-57,489,-82,451,-67,406,-60,366,-49,346,-42,319,-81,333,-111,310,-106,257,-85,210,-94,158,-102,105,-79,70,-63,20,-44,-29,-27,-79,-13,-129,-2,-179,-7,-233,-13,-287,4,-336,1,-386,14,-438,27,-490,33,-543,41,-595,40,-649,38,-699,53,-748,59,-802,56,-856,51,-910,44,-964],[-318,-1000,-275,-978,-231,-956,-188,-933,-144,-911,-101,-889,-58,-867,-14,-844,29,-822,73,-800,116,-778,159,-755,203,-733,246,-711,290,-689,333,-666,376,-644,420,-622,463,-600,507,-578,550,-555,593,-533,637,-511,637,-462,637,-413,637,-365,637,-316,637,-267,637,-218,637,-169,637,-121,637,-72,624,-35,576,-35,528,-31,513,10,493,51,475,93,447,122,458,165,418,192,419,236,414,281,381,315,397,348,441,354,451,401,467,440,469,488,508,515,503,562,460,560,417,580,376,601,362,641,329,674,294,702,265,740,230,773,188,795,141,803,93,809,44,810,28,838,30,873,-3,909,-39,933,-88,938,-136,941,-180,960,-222,983,-258,972,-285,973,-328,991,-373,1000,-386,972,-408,933,-427,888,-456,849,-495,820,-531,788,-562,750,-566,710,-528,687,-479,692,-431,687,-383,688,-403,659,-431,619,-445,573,-448,525,-443,479,-451,431,-469,387,-491,346,-515,307,-562,297,-592,261,-620,221,-632,174,-637,128,-611,87,-588,45,-560,5,-532,-36,-500,-72,-467,-108,-434,-144,-401,-179,-392,-226,-388,-275,-384,-323,-380,-372,-376,-420,-372,-469,-368,-518,-362,-566,-340,-609,-362,-648,-386,-686,-400,-726,-430,-764,-432,-813,-439,-861,-448,-909,-451,-954,-406,-974,-362,-995],[270,-681,313,-665,343,-628,376,-594,403,-554,426,-512,431,-466,427,-419,404,-379,418,-338,463,-326,510,-318,517,-279,554,-252,601,-244,638,-215,674,-184,672,-141,705,-108,747,-85,789,-62,821,-27,854,4,856,48,879,89,922,108,963,132,990,169,998,216,1000,234,955,229,912,244,865,237,818,228,772,217,725,207,692,238,652,261,606,267,560,256,514,267,469,283,424,298,378,308,333,296,291,315,266,356,238,391,192,380,145,371,99,373,53,365,9,347,-38,344,-71,311,-106,280,-148,257,-189,237,-236,243,-276,270,-303,308,-332,346,-356,379,-349,425,-353,473,-369,476,-412,486,-454,483,-500,471,-545,467,-591,480,-638,485,-673,509,-684,555,-688,602,-710,644,-731,681,-743,635,-747,590,-776,554,-814,528,-847,493,-879,457,-906,418,-901,386,-923,346,-957,314,-964,267,-975,221,-974,178,-974,130,-1000,99,-974,66,-944,32,-922,-10,-898,-50,-879,-94,-847,-127,-806,-134,-761,-141,-717,-159,-684,-187,-657,-162,-621,-156,-577,-173,-537,-197,-492,-211,-444,-213,-397,-218,-353,-228,-321,-262,-290,-298,-290,-332,-296,-363,-251,-373,-203,-374,-156,-380,-110,-391,-66,-402,-27,-428,8,-459,36,-497,72,-523,101,-559,133,-589,144,-630,182,-656,225,-673],[64,-631,130,-604,152,-562,182,-540,199,-493,249,-489,280,-454,317,-523,360,-547,394,-513,395,-461,346,-412,342,-398,289,-399,221,-377,192,-382,264,-341,199,-310,138,-296,141,-284,147,-253,123,-219,88,-152,97,-64,137,-29,188,-10,268,43,338,71,383,134,408,211,448,264,460,215,456,128,489,67,510,-24,482,-100,487,-162,480,-233,558,-224,616,-200,676,-173,674,-128,681,-81,708,-54,746,-68,774,-103,797,-136,810,-91,841,-62,853,-22,859,15,895,52,914,83,945,114,903,153,965,122,1000,168,985,225,910,278,822,287,737,306,678,374,662,404,593,469,538,527,464,572,408,631,374,613,376,516,331,447,261,389,177,375,98,354,36,341,-62,341,-161,341,-260,341,-359,341,-457,341,-556,341,-591,323,-615,303,-648,277,-687,249,-691,209,-678,191,-699,186,-699,151,-735,155,-745,90,-742,45,-795,-14,-849,-94,-909,-90,-963,-146,-1000,-200,-1000,-299,-1000,-398,-1000,-496,-953,-537,-866,-507,-839,-544,-781,-554,-764,-545,-807,-510,-755,-540,-691,-570,-647,-537,-604,-546,-539,-550,-448,-516,-369,-496,-356,-462,-265,-466,-225,-425,-216,-450,-177,-502,-230,-501,-150,-486,-63,-464,8,-466,8,-490,56,-478,48,-432,68,-471,100,-508,103,-537,59,-585],[321,-1000,372,-985,395,-938,431,-900,443,-848,467,-799,473,-746,467,-695,466,-641,477,-587,498,-537,531,-494,571,-461,519,-452,465,-453,411,-450,357,-456,308,-441,283,-396,316,-354,351,-312,392,-277,437,-246,476,-209,504,-162,524,-111,554,-70,539,-20,503,20,480,68,454,115,427,162,396,203,360,238,392,274,392,329,390,379,402,431,410,484,450,520,475,567,469,604,501,648,537,688,575,728,619,756,646,801,650,853,664,905,647,952,647,1000,604,972,554,954,502,946,451,943,410,924,362,918,307,917,253,918,198,917,152,903,98,901,44,899,-10,894,-64,895,-119,893,-173,893,-207,916,-262,916,-316,916,-371,916,-424,912,-445,871,-436,818,-425,765,-435,714,-467,673,-479,649,-464,619,-468,583,-501,596,-545,594,-588,569,-603,517,-631,488,-652,503,-664,461,-638,414,-617,364,-605,311,-588,259,-553,218,-514,180,-471,148,-441,104,-395,74,-354,89,-316,61,-272,82,-233,119,-211,166,-162,144,-140,98,-104,60,-103,17,-70,-26,-51,-74,-30,-124,-14,-175,18,-215,64,-240,80,-291,91,-344,132,-376,151,-422,164,-472,191,-518,206,-570,235,-616,266,-661,315,-681,362,-709,384,-752,391,-805,381,-856,332,-873,312,-918,301,-972],[970,-834,962,-777,932,-725,908,-673,899,-613,919,-558,942,-503,965,-446,990,-391,1000,-333,984,-275,965,-217,955,-159,969,-100,980,-41,981,19,964,77,920,115,869,95,817,125,772,165,720,191,668,215,613,230,553,237,550,295,530,340,471,327,413,313,371,347,331,381,340,441,345,500,389,540,436,578,447,627,456,685,399,668,346,661,307,617,250,614,190,624,143,653,92,651,33,640,33,695,5,740,-38,782,-95,791,-154,797,-201,834,-248,798,-303,779,-363,770,-410,741,-449,778,-504,790,-541,748,-503,707,-474,659,-489,602,-527,558,-571,580,-604,630,-661,640,-696,605,-707,546,-706,486,-697,426,-737,380,-748,323,-775,323,-802,268,-828,214,-849,158,-851,98,-844,42,-884,-3,-931,-41,-937,-100,-946,-160,-970,-215,-994,-270,-1000,-330,-997,-388,-937,-396,-911,-432,-868,-474,-832,-522,-798,-573,-768,-624,-722,-663,-668,-690,-608,-701,-550,-718,-492,-715,-433,-701,-373,-699,-313,-707,-253,-710,-193,-706,-133,-714,-74,-725,-16,-710,12,-664,59,-665,89,-673,122,-623,174,-605,231,-615,288,-595,329,-552,383,-530,429,-551,431,-608,398,-658,408,-700,466,-711,502,-740,557,-756,598,-769,645,-732,689,-692,747,-687,790,-724,842,-745,882,-789,934,-787],[93,-1000,137,-974,159,-923,190,-907,209,-860,215,-804,209,-748,196,-709,154,-681,120,-645,101,-598,105,-551,97,-501,149,-520,203,-520,209,-496,229,-447,259,-415,283,-387,266,-335,289,-306,338,-289,355,-243,408,-239,455,-268,437,-225,400,-188,377,-164,356,-113,306,-113,279,-88,241,-66,192,-47,140,-49,118,1,112,55,79,83,104,119,117,171,153,215,188,259,205,312,225,333,197,376,188,425,160,463,185,513,223,555,255,601,258,657,266,710,287,759,304,813,275,860,243,907,218,952,196,1000,189,945,209,895,216,840,204,817,209,764,207,719,198,663,173,613,158,587,148,577,137,523,130,490,118,440,112,385,101,333,99,297,62,268,41,220,24,231,9,282,-37,289,-35,302,-72,330,-108,370,-132,360,-155,373,-178,337,-203,352,-199,303,-229,348,-244,316,-229,263,-212,210,-219,155,-234,101,-247,56,-265,7,-278,40,-316,0,-284,2,-293,-37,-313,-69,-353,-74,-365,-95,-376,-105,-391,-127,-405,-119,-441,-163,-455,-217,-416,-215,-414,-268,-394,-305,-357,-319,-363,-375,-336,-413,-330,-469,-334,-518,-282,-505,-246,-526,-222,-577,-197,-628,-198,-671,-166,-716,-162,-766,-128,-805,-82,-838,-35,-867,18,-866,39,-866,37,-914,70,-951],[466,-1000,506,-966,549,-937,599,-922,570,-878,547,-831,524,-784,501,-737,480,-691,515,-654,508,-608,488,-559,480,-509,502,-465,549,-443,600,-430,651,-419,700,-400,749,-382,801,-376,825,-335,827,-284,838,-233,838,-181,826,-130,795,-96,745,-80,698,-58,658,-26,669,20,638,55,595,86,555,119,516,155,478,190,459,239,444,289,426,338,394,379,355,414,321,453,295,499,269,544,246,591,225,639,194,681,159,720,124,759,89,798,54,837,16,872,-29,899,-73,927,-118,955,-161,985,-208,1000,-260,999,-313,998,-365,997,-418,995,-470,994,-483,948,-492,896,-501,845,-512,794,-524,743,-536,692,-555,643,-581,598,-608,553,-634,507,-649,458,-654,406,-652,354,-650,301,-649,249,-649,196,-649,144,-649,92,-652,39,-655,-13,-655,-65,-652,-118,-647,-170,-642,-222,-642,-274,-652,-324,-683,-366,-714,-409,-748,-449,-782,-489,-817,-527,-838,-572,-838,-624,-824,-675,-799,-721,-754,-738,-703,-725,-654,-709,-608,-684,-569,-653,-547,-605,-526,-557,-478,-540,-425,-540,-373,-544,-321,-548,-269,-552,-216,-553,-166,-564,-117,-582,-72,-609,-34,-642,-16,-691,-7,-743,0,-794,5,-847,9,-899,14,-951,41,-980,88,-961,132,-933,178,-908,226,-920,267,-952,314,-971,365,-978,416,-991],[272,-727,317,-719,366,-716,415,-700,449,-676,445,-625,442,-575,476,-537,489,-493,505,-445,533,-403,568,-369,615,-351,652,-319,693,-290,667,-279,645,-253,648,-202,691,-178,731,-145,770,-112,816,-92,866,-94,911,-116,950,-89,961,-40,922,-18,948,25,979,66,1000,107,977,153,940,188,901,221,851,218,802,223,756,217,726,257,688,277,664,315,626,332,575,334,525,342,482,323,432,311,382,301,332,290,294,308,256,336,217,333,166,334,115,329,64,330,13,325,-36,331,-88,332,-139,332,-190,333,-241,333,-293,334,-328,349,-341,399,-338,449,-313,488,-307,531,-308,581,-302,632,-305,680,-290,727,-329,726,-357,682,-393,649,-430,619,-481,614,-532,611,-582,616,-630,634,-678,653,-715,682,-760,663,-807,650,-848,621,-872,579,-896,534,-937,508,-986,500,-1000,458,-992,408,-992,357,-987,312,-950,278,-936,229,-936,179,-950,130,-921,91,-873,74,-823,62,-778,39,-745,0,-727,-44,-735,-92,-707,-121,-677,-153,-696,-200,-683,-243,-646,-278,-600,-292,-555,-269,-512,-241,-466,-253,-435,-287,-434,-338,-401,-362,-351,-359,-342,-407,-321,-453,-285,-489,-243,-517,-194,-510,-145,-495,-117,-529,-95,-571,-44,-578,1,-602,46,-626,92,-648,139,-669,178,-702,222,-726],[-883,-651,-836,-622,-791,-592,-820,-554,-844,-509,-804,-486,-751,-496,-697,-498,-642,-493,-589,-483,-536,-472,-482,-461,-428,-454,-374,-457,-321,-462,-268,-451,-214,-440,-161,-429,-107,-419,-53,-415,1,-411,54,-425,102,-449,139,-489,182,-522,227,-551,277,-573,328,-593,381,-605,434,-618,488,-625,538,-615,585,-588,633,-565,687,-560,734,-538,782,-541,814,-497,857,-466,908,-450,962,-442,1000,-427,996,-372,984,-321,949,-292,897,-300,850,-279,822,-233,789,-191,781,-137,778,-83,777,-28,748,9,708,42,673,84,657,123,703,152,735,196,764,242,796,286,817,336,764,329,714,339,663,357,620,323,582,286,530,291,481,310,432,331,378,338,344,372,308,404,271,435,230,435,190,465,210,514,218,568,187,608,135,622,82,622,28,627,-24,643,-76,651,-120,618,-170,597,-220,598,-263,578,-299,540,-338,525,-391,529,-445,529,-479,561,-532,569,-583,588,-637,589,-690,590,-738,609,-788,618,-820,598,-817,543,-812,489,-797,438,-827,396,-844,344,-878,305,-926,280,-965,243,-998,199,-980,170,-951,124,-970,77,-975,25,-978,-27,-941,-63,-890,-71,-858,-114,-821,-154,-811,-203,-850,-239,-885,-280,-931,-309,-961,-352,-978,-404,-999,-453,-1000,-507,-984,-559,-936,-583,-922,-632],[-314,-1000,-283,-964,-275,-909,-271,-840,-224,-794,-169,-820,-104,-831,-75,-858,-13,-851,52,-850,98,-889,137,-950,164,-896,190,-830,208,-781,157,-730,119,-671,108,-648,171,-683,202,-633,243,-621,256,-634,294,-668,342,-693,401,-679,452,-647,483,-619,482,-584,510,-600,555,-609,624,-590,695,-588,762,-558,817,-511,877,-472,946,-458,967,-387,970,-316,941,-249,897,-197,849,-147,824,-100,779,-80,762,-23,764,39,763,112,753,184,728,249,699,313,662,375,623,424,570,451,520,457,481,458,435,493,368,520,319,564,285,581,282,633,285,705,244,761,205,824,163,884,112,910,161,869,178,828,151,846,114,894,90,960,39,1000,43,943,-9,895,-67,858,-113,829,-154,815,-104,762,-62,716,-4,681,30,626,-10,586,2,520,-50,504,-65,437,-118,413,-182,399,-183,331,-186,275,-163,211,-199,159,-217,108,-292,106,-306,45,-306,-17,-374,-36,-434,-72,-499,-90,-545,-137,-549,-205,-597,-226,-661,-192,-722,-161,-793,-164,-815,-214,-842,-222,-898,-237,-932,-269,-970,-326,-967,-380,-935,-436,-893,-489,-826,-515,-777,-535,-764,-608,-756,-681,-786,-741,-742,-770,-776,-814,-709,-821,-663,-837,-627,-795,-565,-782,-517,-799,-463,-841,-487,-879,-519,-943,-469,-935,-420,-939,-353,-960],[131,-1000,134,-948,166,-905,192,-857,229,-816,253,-768,272,-720,292,-669,314,-619,357,-587,400,-552,447,-525,498,-504,536,-468,543,-414,591,-408,628,-383,627,-328,625,-274,660,-232,684,-183,730,-162,784,-151,837,-138,889,-121,900,-74,945,-52,948,-27,897,-10,864,33,813,52,761,65,718,98,682,140,648,178,607,205,567,235,522,265,485,303,471,355,457,408,422,447,383,486,338,512,285,526,254,565,237,617,218,668,199,720,157,752,103,757,51,770,-4,765,-57,755,-103,731,-155,718,-198,684,-246,657,-299,654,-346,680,-369,729,-386,781,-407,831,-448,867,-491,899,-522,944,-572,964,-609,1000,-663,996,-718,999,-771,992,-812,975,-816,920,-791,873,-779,822,-791,770,-811,719,-833,668,-858,620,-895,580,-939,547,-947,497,-947,442,-947,387,-947,333,-948,278,-948,223,-948,168,-948,113,-948,58,-948,4,-948,-51,-913,-71,-859,-71,-804,-71,-749,-71,-743,-122,-743,-177,-743,-232,-744,-287,-744,-342,-744,-396,-744,-451,-744,-506,-744,-561,-744,-616,-744,-670,-744,-725,-744,-780,-744,-835,-739,-884,-684,-888,-630,-896,-576,-904,-521,-913,-468,-924,-414,-934,-360,-943,-306,-953,-259,-935,-228,-889,-197,-856,-156,-893,-115,-928,-67,-954,-17,-943,26,-977,76,-996],[-382,-978,-335,-945,-287,-911,-233,-894,-178,-900,-122,-884,-68,-869,-16,-892,34,-878,77,-839,130,-849,176,-883,232,-870,288,-876,345,-872,400,-853,456,-841,513,-837,559,-804,582,-753,604,-703,658,-685,715,-687,768,-709,825,-717,878,-695,873,-639,856,-584,831,-532,802,-482,773,-432,763,-376,758,-318,788,-273,838,-247,883,-210,922,-168,964,-128,1000,-85,967,-48,910,-45,853,-53,833,-14,869,31,902,78,933,127,952,180,944,236,900,249,847,237,804,271,750,284,696,275,667,309,692,361,715,413,692,456,657,416,604,425,561,463,524,506,502,560,501,617,469,648,415,665,410,721,413,779,425,835,452,886,452,940,409,978,356,961,306,932,259,899,214,862,169,827,122,794,83,753,39,725,-13,726,-16,695,-11,646,-49,602,-90,562,-132,522,-166,476,-196,427,-201,370,-221,321,-274,300,-321,268,-362,227,-403,186,-445,146,-487,106,-517,58,-551,11,-590,-32,-631,-72,-674,-111,-711,-155,-744,-202,-762,-256,-775,-313,-788,-369,-805,-424,-848,-459,-885,-503,-922,-547,-966,-584,-1000,-626,-999,-684,-992,-741,-986,-799,-979,-856,-971,-912,-920,-937,-864,-925,-824,-886,-788,-841,-745,-802,-696,-801,-660,-845,-629,-895,-589,-936,-532,-931,-475,-925,-426,-946],[-281,-1000,-254,-970,-258,-913,-266,-858,-256,-801,-253,-746,-232,-695,-199,-660,-150,-628,-112,-588,-53,-578,2,-578,53,-552,93,-528,144,-501,200,-484,238,-447,290,-426,349,-429,404,-413,453,-382,456,-328,474,-273,484,-216,454,-187,469,-153,492,-101,497,-41,525,-7,584,-5,644,-2,703,0,761,-5,753,44,753,101,775,152,825,183,855,220,878,275,872,321,855,377,847,420,821,473,803,525,829,565,796,570,773,522,722,491,671,460,614,452,555,453,496,459,438,472,380,484,322,496,267,510,246,566,214,616,192,668,191,727,174,784,157,841,139,898,100,865,41,865,-17,869,-64,891,-92,943,-112,984,-133,929,-173,890,-231,880,-290,880,-342,860,-389,842,-420,887,-464,918,-505,957,-545,994,-604,1000,-626,957,-637,900,-658,847,-673,791,-688,736,-726,695,-728,647,-746,606,-732,567,-746,517,-713,470,-758,431,-787,384,-798,326,-806,270,-840,232,-865,181,-878,131,-837,92,-795,51,-771,6,-814,-18,-840,-71,-843,-126,-821,-175,-844,-226,-814,-273,-783,-319,-789,-367,-791,-421,-787,-480,-778,-536,-745,-580,-772,-632,-801,-684,-830,-736,-859,-788,-850,-818,-791,-811,-740,-793,-687,-817,-646,-859,-595,-872,-549,-907,-498,-935,-451,-970,-394,-988,-336,-996],[-249,-543,-207,-540,-164,-534,-122,-524,-81,-512,-40,-500,-29,-463,-40,-422,-29,-387,14,-384,57,-382,100,-385,143,-386,186,-382,227,-371,269,-360,309,-346,346,-324,386,-314,424,-332,457,-358,494,-381,535,-380,570,-355,609,-337,649,-322,690,-310,729,-293,740,-256,736,-214,737,-171,723,-130,710,-89,711,-48,733,-12,764,17,800,42,842,45,885,43,927,34,961,54,982,92,1000,130,995,168,974,206,959,246,956,288,980,324,999,363,1000,405,972,435,931,439,888,440,846,448,805,460,765,476,722,476,679,475,646,451,611,435,575,458,538,481,497,483,454,479,411,480,368,484,325,488,282,493,240,496,197,498,154,495,112,487,72,470,35,449,-5,431,-44,422,-84,437,-124,452,-150,485,-181,512,-224,520,-266,528,-308,535,-351,541,-393,543,-436,536,-478,533,-489,495,-529,480,-571,473,-613,461,-652,448,-694,456,-737,465,-776,457,-815,437,-851,415,-888,392,-926,372,-936,331,-948,290,-977,259,-1000,224,-977,189,-943,163,-911,135,-897,95,-883,54,-861,19,-828,-8,-799,-40,-775,-75,-758,-114,-736,-151,-709,-184,-682,-218,-653,-250,-625,-283,-598,-316,-572,-350,-545,-383,-512,-410,-473,-429,-434,-446,-393,-461,-365,-493,-331,-518,-291,-535],[167,-1000,202,-981,233,-952,264,-923,293,-893,318,-859,350,-834,386,-814,413,-782,397,-746,382,-707,390,-668,414,-633,439,-599,457,-563,462,-521,467,-479,489,-443,486,-403,472,-363,433,-360,411,-324,427,-287,423,-248,409,-208,379,-180,340,-167,330,-129,307,-97,279,-65,271,-27,266,15,250,53,218,73,176,79,150,100,144,142,140,184,140,226,137,268,131,309,132,351,130,393,127,435,131,476,135,517,140,558,156,597,145,635,145,678,147,720,136,759,141,801,153,841,140,881,133,922,117,952,76,956,34,960,-8,965,-50,971,-92,977,-133,983,-175,991,-216,1000,-190,981,-170,958,-186,919,-209,884,-229,850,-227,810,-236,770,-226,748,-215,716,-215,674,-215,632,-215,590,-215,548,-215,506,-215,463,-215,421,-215,379,-215,337,-217,295,-220,253,-221,211,-222,169,-222,127,-223,85,-240,47,-269,16,-291,-19,-296,-61,-304,-102,-305,-144,-305,-186,-310,-227,-345,-250,-380,-274,-415,-297,-450,-320,-485,-344,-489,-384,-485,-426,-477,-466,-459,-504,-448,-545,-422,-573,-388,-578,-371,-612,-349,-637,-312,-651,-289,-686,-252,-699,-217,-683,-176,-690,-134,-694,-95,-693,-63,-720,-31,-748,-2,-778,17,-816,32,-855,32,-896,21,-936,50,-960,91,-970,129,-983],[193,-1000,233,-998,268,-990,251,-953,235,-916,258,-898,297,-901,337,-902,377,-901,400,-876,413,-838,424,-800,420,-760,415,-720,400,-682,386,-645,372,-607,358,-570,343,-532,332,-494,327,-454,317,-415,304,-377,291,-339,303,-305,326,-272,329,-237,311,-201,293,-165,282,-127,274,-88,272,-47,271,-7,276,33,281,73,286,112,292,152,291,192,285,232,280,272,274,311,268,351,262,391,255,430,234,464,213,499,192,533,165,563,139,593,116,627,94,660,71,692,33,705,-6,718,-37,740,-61,772,-86,804,-110,836,-134,868,-159,900,-178,935,-179,972,-184,1000,-224,999,-264,997,-304,994,-345,993,-385,997,-424,1000,-424,960,-423,920,-421,880,-420,840,-418,799,-417,759,-415,719,-413,679,-412,639,-410,599,-409,558,-407,518,-406,478,-404,438,-403,398,-401,358,-400,317,-398,277,-396,237,-395,197,-393,157,-392,117,-390,76,-389,36,-387,-4,-386,-44,-384,-84,-383,-125,-381,-165,-380,-205,-378,-245,-377,-285,-375,-325,-374,-366,-372,-406,-371,-446,-369,-486,-369,-526,-365,-566,-350,-603,-315,-619,-278,-623,-243,-603,-208,-583,-174,-564,-137,-580,-106,-605,-86,-640,-67,-675,-45,-709,-22,-742,1,-775,24,-808,47,-841,64,-877,79,-914,93,-952,117,-981,153,-998],[156,-812,192,-781,221,-745,271,-761,309,-796,328,-746,346,-694,387,-656,436,-632,490,-633,543,-645,578,-604,622,-572,675,-555,718,-522,711,-469,689,-418,680,-366,645,-323,629,-275,656,-227,709,-211,765,-209,814,-198,856,-163,890,-120,932,-85,904,-42,927,1,977,22,993,72,1000,127,976,169,930,200,896,241,877,293,853,282,799,274,764,317,733,363,712,414,687,464,675,517,671,570,704,614,729,664,745,713,723,765,680,789,624,795,572,812,526,785,491,742,453,702,413,668,363,644,320,609,270,587,219,578,210,523,200,470,185,421,199,367,213,313,183,290,141,326,118,376,90,420,41,444,-15,451,-70,451,-125,444,-162,412,-137,364,-146,311,-158,263,-142,210,-182,172,-227,141,-282,132,-337,125,-383,147,-411,123,-422,68,-443,19,-496,2,-551,-4,-603,-18,-624,-67,-632,-123,-652,-174,-686,-217,-736,-223,-784,-197,-836,-177,-881,-207,-920,-247,-954,-291,-977,-341,-974,-393,-996,-445,-1000,-496,-952,-525,-905,-554,-857,-583,-809,-612,-761,-640,-711,-665,-662,-691,-610,-712,-570,-707,-558,-653,-522,-614,-474,-637,-422,-643,-369,-626,-327,-591,-273,-589,-222,-612,-176,-642,-135,-679,-115,-731,-64,-709,-24,-726,-20,-776,27,-803,66,-766,115,-775],[7,-857,57,-851,107,-849,154,-822,197,-810,253,-818,303,-788,300,-731,343,-721,396,-747,450,-760,508,-750,553,-712,599,-676,621,-634,603,-579,624,-525,630,-469,601,-417,620,-368,669,-333,660,-280,696,-235,723,-181,772,-147,816,-110,804,-52,845,-35,903,-23,946,13,963,64,1000,108,964,143,924,186,873,216,815,206,768,177,719,195,700,248,734,298,756,348,766,403,762,458,779,512,801,568,741,566,687,585,633,591,593,637,564,688,543,745,558,803,548,857,500,841,470,793,412,796,352,803,296,822,265,773,229,741,180,774,145,791,104,758,46,743,-7,753,-45,787,-69,747,-129,747,-164,703,-217,690,-276,678,-331,658,-390,645,-448,631,-508,629,-569,626,-627,635,-687,643,-747,649,-781,695,-823,738,-874,733,-912,760,-927,732,-912,676,-905,617,-921,563,-971,530,-1000,488,-967,437,-923,398,-869,371,-848,318,-852,258,-863,199,-879,141,-898,84,-917,26,-929,-33,-933,-83,-875,-79,-816,-86,-763,-69,-709,-95,-663,-116,-634,-157,-585,-179,-533,-204,-516,-168,-462,-164,-482,-214,-496,-254,-469,-307,-467,-366,-446,-422,-395,-448,-362,-494,-311,-510,-271,-538,-270,-571,-311,-595,-292,-653,-274,-704,-224,-732,-175,-755,-115,-748,-70,-768,-37,-816],[-577,-1000,-529,-935,-459,-914,-445,-964,-394,-921,-356,-852,-281,-819,-243,-872,-193,-869,-165,-793,-166,-711,-169,-628,-135,-572,-56,-547,25,-530,108,-531,191,-532,274,-535,356,-525,438,-528,521,-532,600,-512,669,-466,654,-422,609,-399,581,-321,546,-254,497,-198,426,-188,355,-157,300,-107,273,-31,277,49,302,128,329,203,359,167,403,232,462,187,465,106,514,43,538,-13,608,-12,629,64,642,145,647,228,677,303,697,383,707,465,713,548,721,630,722,713,733,795,700,809,628,776,595,845,620,922,636,1000,595,930,552,860,542,777,537,695,507,618,490,537,490,457,446,427,404,356,368,284,322,314,257,362,182,351,137,282,101,208,102,126,91,44,73,71,-3,71,34,101,85,153,44,214,43,268,49,343,80,416,76,494,17,551,-22,623,-84,611,-52,538,-94,549,-137,522,-127,443,-146,448,-152,530,-184,605,-244,658,-253,577,-269,495,-269,547,-276,627,-336,679,-395,625,-411,544,-417,462,-442,383,-456,303,-474,222,-464,152,-519,110,-539,39,-557,-35,-528,-113,-514,-194,-567,-241,-637,-279,-710,-303,-733,-374,-693,-445,-628,-460,-602,-538,-520,-534,-446,-559,-489,-618,-554,-646,-617,-696,-676,-752,-717,-807,-678,-879,-621,-939,-637,-999],[-470,-854,-429,-815,-367,-821,-320,-776,-273,-729,-227,-683,-183,-635,-163,-572,-104,-543,-40,-525,26,-517,78,-548,113,-605,155,-652,215,-681,265,-723,297,-781,334,-828,380,-781,421,-729,459,-674,496,-618,530,-561,549,-498,571,-435,611,-382,652,-330,696,-280,746,-236,806,-210,871,-205,931,-176,978,-130,1000,-67,940,-80,874,-84,808,-75,746,-52,692,-15,665,45,652,110,637,175,618,239,611,304,626,369,593,421,574,484,552,546,529,522,479,518,461,581,434,642,434,708,437,775,439,841,374,854,320,832,279,780,223,750,186,697,131,659,123,605,183,580,222,538,179,492,153,437,198,395,222,350,179,299,133,251,77,228,16,254,-38,293,-95,327,-149,366,-202,406,-249,453,-303,487,-352,530,-397,578,-450,610,-454,547,-479,489,-447,466,-439,428,-487,383,-471,338,-468,286,-528,264,-586,252,-634,206,-688,168,-733,119,-790,86,-744,67,-680,60,-654,-1,-673,-54,-731,-86,-786,-123,-830,-172,-865,-229,-848,-284,-795,-324,-826,-375,-873,-419,-936,-433,-987,-466,-948,-496,-1000,-534,-984,-584,-932,-625,-870,-630,-807,-608,-745,-584,-722,-533,-660,-508,-597,-510,-536,-495,-480,-458,-423,-476,-391,-533,-410,-590,-465,-627,-520,-665,-554,-717,-564,-775,-508,-805],[437,-501,478,-499,521,-498,568,-484,612,-461,661,-456,702,-428,747,-410,797,-407,839,-431,884,-413,931,-397,956,-358,946,-312,939,-265,956,-218,978,-173,1000,-129,994,-91,983,-45,983,-2,934,2,890,-7,847,-11,830,20,877,36,879,82,846,115,826,147,820,193,838,232,820,276,774,287,739,323,702,355,695,400,647,388,600,402,554,419,504,415,455,420,408,435,377,474,335,501,292,499,243,492,194,481,146,468,96,462,48,449,-2,447,-51,439,-100,429,-149,417,-198,408,-245,391,-271,349,-300,309,-304,264,-322,249,-369,265,-416,280,-466,276,-515,282,-563,293,-595,330,-625,364,-673,356,-714,333,-756,321,-780,282,-815,315,-857,327,-901,303,-929,266,-977,252,-986,216,-1000,168,-979,123,-988,79,-969,68,-927,55,-883,77,-857,116,-824,139,-805,159,-774,121,-763,73,-726,61,-677,69,-641,87,-606,120,-559,110,-514,95,-475,68,-429,49,-380,41,-330,35,-294,15,-267,1,-222,23,-175,14,-138,38,-116,76,-76,77,-70,28,-96,-4,-97,-40,-105,-87,-134,-128,-139,-171,-101,-203,-57,-227,-10,-243,25,-275,35,-324,68,-335,111,-334,127,-379,141,-415,180,-385,209,-350,258,-344,302,-361,351,-354,372,-388,406,-421,431,-451],[454,-766,482,-710,499,-647,511,-578,566,-563,590,-504,611,-440,626,-378,649,-318,704,-286,762,-250,784,-200,807,-135,843,-133,861,-92,908,-46,949,9,977,67,980,136,1000,203,985,269,972,338,948,402,905,447,882,500,856,558,828,617,820,687,757,707,692,729,633,759,619,766,585,735,572,715,535,739,475,752,410,733,349,715,313,659,287,599,274,578,248,563,226,515,189,563,199,536,221,473,215,432,173,484,123,532,89,531,84,492,38,446,8,400,-59,390,-121,363,-191,368,-258,388,-325,405,-392,416,-457,443,-501,493,-566,493,-635,492,-695,517,-756,548,-824,555,-885,525,-919,479,-885,442,-883,373,-914,310,-922,241,-955,180,-977,115,-1000,66,-986,68,-981,68,-958,50,-989,-12,-982,-78,-976,-145,-956,-135,-907,-181,-851,-222,-785,-233,-722,-262,-656,-275,-598,-313,-558,-369,-553,-430,-515,-444,-491,-429,-489,-466,-442,-467,-442,-496,-424,-522,-402,-541,-387,-577,-368,-599,-326,-612,-274,-568,-261,-533,-214,-539,-184,-551,-190,-596,-165,-650,-129,-682,-82,-693,-42,-714,-77,-751,-22,-737,37,-708,99,-702,123,-699,155,-702,155,-652,125,-610,98,-548,152,-505,207,-477,264,-442,316,-401,370,-424,394,-489,403,-558,402,-626,410,-679,428,-735],[-34,-1000,0,-979,41,-933,95,-905,83,-868,28,-846,77,-817,132,-790,190,-775,248,-761,285,-714,331,-674,362,-625,321,-582,271,-547,230,-503,240,-445,270,-392,306,-342,344,-293,392,-256,443,-221,496,-190,550,-161,602,-130,598,-69,573,-13,548,43,490,52,428,51,368,58,390,92,442,124,490,161,528,210,578,243,625,282,669,326,715,367,764,397,823,382,879,406,931,436,929,497,876,527,866,577,914,615,957,658,995,707,943,728,885,728,902,777,933,828,934,889,936,951,896,969,834,967,776,986,718,1000,683,959,661,901,637,844,612,788,597,731,595,677,547,639,497,603,484,552,493,491,479,435,420,426,361,443,306,470,250,470,196,442,150,401,94,416,82,359,58,304,15,262,-42,275,-100,296,-161,308,-196,258,-238,213,-280,168,-325,126,-372,86,-422,51,-478,29,-539,32,-600,42,-661,47,-719,29,-776,6,-830,-24,-851,-64,-847,-115,-871,-172,-896,-228,-901,-288,-921,-343,-882,-391,-849,-442,-830,-500,-832,-560,-850,-619,-871,-677,-899,-731,-947,-768,-988,-814,-995,-862,-934,-867,-873,-868,-812,-876,-752,-889,-693,-905,-632,-917,-573,-933,-513,-946,-452,-941,-391,-934,-331,-934,-270,-944,-209,-945,-147,-945,-123,-967,-95,-991],[31,-1000,68,-967,96,-921,135,-885,185,-867,228,-834,274,-807,316,-778,297,-731,279,-683,276,-651,329,-641,379,-634,421,-648,454,-684,473,-733,494,-766,521,-727,520,-674,484,-641,445,-612,414,-579,382,-543,351,-499,316,-459,303,-411,295,-361,286,-311,273,-266,272,-214,278,-166,324,-136,329,-91,357,-53,358,-5,327,40,295,80,245,100,192,113,138,121,84,118,72,139,75,178,68,227,36,261,-17,260,-64,241,-78,276,-71,328,-34,348,-9,328,-9,375,-50,355,-54,380,-69,403,-87,450,-106,495,-134,516,-180,541,-210,587,-187,633,-140,655,-115,690,-116,712,-158,745,-201,778,-218,827,-254,850,-281,849,-274,869,-300,914,-289,951,-278,964,-256,1000,-308,990,-361,981,-416,980,-458,958,-457,910,-494,896,-521,857,-520,806,-484,778,-459,736,-460,689,-440,647,-432,600,-427,556,-420,518,-425,503,-408,480,-426,450,-430,406,-449,365,-429,327,-436,275,-433,222,-424,178,-411,134,-382,96,-396,46,-396,-7,-377,-49,-357,-93,-356,-140,-337,-189,-329,-238,-338,-279,-355,-327,-367,-371,-353,-417,-331,-458,-337,-507,-323,-557,-299,-604,-278,-652,-251,-683,-254,-732,-260,-785,-255,-829,-211,-859,-187,-904,-185,-952,-152,-990,-118,-998,-66,-991,-39,-948,-20,-993],[-760,-1000,-694,-999,-628,-1000,-562,-994,-495,-996,-428,-997,-362,-999,-295,-999,-230,-989,-190,-939,-185,-873,-154,-815,-135,-754,-98,-699,-63,-642,-2,-636,60,-645,125,-657,190,-647,236,-676,256,-737,275,-797,337,-815,403,-824,426,-791,473,-766,540,-764,607,-762,635,-717,628,-651,645,-587,644,-521,634,-455,637,-389,677,-337,705,-277,710,-212,695,-155,733,-133,796,-140,861,-146,925,-154,978,-174,987,-108,980,-44,977,22,980,88,969,151,937,177,870,177,804,177,737,177,671,177,658,231,658,297,658,364,658,431,658,497,658,564,658,630,665,696,683,760,733,802,780,849,829,894,880,937,824,952,759,965,693,977,628,989,562,1000,498,998,432,997,370,978,303,979,237,971,171,968,116,933,63,901,-4,900,-70,900,-137,900,-203,900,-270,900,-337,899,-403,899,-470,899,-536,899,-603,901,-663,881,-715,840,-780,833,-840,860,-904,870,-967,873,-987,834,-979,768,-981,702,-984,639,-946,587,-930,523,-909,459,-896,394,-881,330,-864,266,-830,211,-796,155,-749,112,-700,69,-671,10,-662,-56,-655,-122,-665,-185,-696,-242,-725,-301,-752,-361,-767,-425,-787,-486,-761,-502,-729,-556,-743,-619,-772,-679,-797,-740,-815,-804,-849,-859,-884,-916,-886,-963,-821,-976],[574,-993,623,-977,677,-983,649,-943,650,-900,649,-846,658,-794,645,-742,607,-706,573,-665,583,-612,610,-568,645,-530,671,-485,716,-454,732,-403,744,-350,757,-296,767,-244,765,-205,789,-155,800,-102,798,-48,803,7,795,59,797,112,798,163,760,199,783,246,813,292,824,345,855,388,907,389,959,406,986,452,1000,499,955,529,909,559,864,590,818,620,773,650,727,681,682,711,636,741,591,772,548,806,509,843,470,881,430,920,385,947,332,959,279,971,225,982,172,993,154,957,155,905,106,883,62,856,10,842,-26,806,-46,760,-89,727,-133,695,-177,662,-221,630,-265,597,-309,565,-353,532,-397,500,-441,467,-485,435,-529,402,-573,370,-617,338,-662,306,-707,275,-752,245,-798,215,-843,184,-888,154,-934,124,-979,93,-1000,50,-1000,-5,-1000,-60,-969,-99,-925,-131,-878,-156,-831,-176,-789,-191,-741,-200,-688,-214,-650,-252,-609,-284,-561,-308,-511,-327,-525,-368,-510,-405,-457,-418,-420,-450,-366,-452,-311,-450,-279,-469,-276,-509,-306,-551,-316,-602,-321,-655,-327,-707,-342,-751,-362,-780,-311,-795,-268,-828,-220,-854,-169,-860,-130,-895,-81,-918,-30,-937,25,-941,79,-946,129,-964,183,-967,235,-978,290,-978,340,-960,390,-963,442,-979,484,-989,538,-983],[-222,-1000,-214,-961,-213,-920,-186,-893,-146,-901,-107,-916,-71,-936,-35,-928,-11,-895,11,-860,29,-823,55,-794,93,-780,126,-755,157,-727,179,-693,190,-653,200,-613,209,-573,211,-532,205,-491,191,-453,182,-413,173,-372,178,-331,178,-290,151,-261,151,-223,161,-183,165,-142,164,-101,174,-61,190,-23,206,15,232,46,255,78,267,117,283,154,320,159,361,156,396,175,404,214,403,254,419,292,439,329,433,369,417,407,395,441,358,459,322,478,305,515,293,554,275,591,264,631,253,671,235,705,198,721,158,726,121,743,94,773,75,803,90,841,111,877,98,910,66,921,58,961,35,994,-3,1000,-39,982,-76,966,-84,931,-89,891,-103,852,-121,815,-140,778,-158,741,-194,720,-229,698,-265,677,-300,656,-335,635,-364,606,-390,574,-407,536,-425,499,-388,507,-359,504,-364,465,-380,426,-397,389,-414,351,-413,311,-403,271,-391,231,-375,193,-359,155,-356,114,-357,73,-358,32,-353,-9,-347,-50,-353,-90,-361,-131,-364,-172,-357,-212,-345,-252,-327,-287,-303,-320,-297,-360,-296,-401,-306,-438,-338,-464,-374,-479,-415,-484,-412,-525,-406,-566,-408,-607,-416,-646,-439,-680,-433,-716,-415,-752,-394,-788,-372,-823,-348,-857,-323,-890,-301,-924,-281,-960,-258,-995],[463,-762,511,-735,513,-681,556,-668,544,-612,537,-556,546,-500,583,-465,630,-497,682,-518,724,-550,772,-580,826,-597,847,-568,889,-566,939,-588,994,-580,1000,-564,949,-546,952,-514,900,-489,845,-499,788,-497,731,-491,676,-479,627,-455,581,-422,536,-396,501,-354,538,-312,556,-259,560,-208,524,-164,487,-121,484,-77,482,-22,429,-3,373,-6,320,-13,340,34,367,84,345,125,292,142,259,180,240,232,230,285,230,342,191,383,145,366,92,364,47,387,-4,410,2,446,-53,458,-105,449,-142,491,-179,531,-185,587,-192,643,-199,691,-253,709,-308,726,-363,740,-420,738,-475,751,-524,759,-580,751,-637,757,-694,762,-750,758,-804,739,-858,721,-912,702,-940,676,-904,632,-868,587,-833,542,-814,491,-831,438,-884,424,-941,416,-956,369,-955,312,-960,256,-976,201,-990,146,-962,98,-959,64,-1000,36,-999,-20,-971,-63,-961,-90,-935,-127,-914,-178,-908,-229,-890,-279,-852,-257,-797,-256,-752,-222,-708,-220,-658,-244,-630,-289,-611,-325,-557,-341,-502,-353,-459,-386,-426,-430,-410,-485,-393,-540,-340,-559,-287,-566,-260,-614,-210,-587,-154,-577,-97,-578,-47,-555,5,-556,42,-518,92,-522,136,-552,184,-574,228,-538,251,-578,281,-618,336,-612,369,-644,383,-690,416,-736]]; })();

// ==================== src/scripts/radio/main.js ===================================
// Radio mode: Street View is hidden and a live station from near the round's location
// plays instead (Radio Browser, radio-browser.info). Nothing about the station shows
// until the round's guess is in; then the result screen reveals it, and once the game is
// over it lists every round's station so you can go back to one.
(() => {
  const ggs = globalThis.__ggs;

  const API = 'https://de1.api.radio-browser.info/json/stations/search';
  const RADII_KM = [50, 250, 1000, 3000]; // widen until there are a few stations
  // Street View container. Hashed CSS-module class names, so match on the prefix.
  const PANO_SELECTORS = ['[class*="game_panorama"]', '[data-qa="panorama"]'];
  const HIDE_PANO_CSS = `
    ${PANO_SELECTORS.join(', ')}, .widget-scene-canvas { visibility: hidden !important; }
    body { background: #0d0a2a !important; }`;

  // Stream networks that insert ads (often a pre-roll before the station). The ad is inside
  // the audio itself, so it can't be detected; these stations are tried last instead.
  // AdsWizz shows up as aw_0_* query parameters on the stream URL.
  const AD_STREAMS = /zeno\.fm|zenomedia|adswizz|streamtheworld\.com|tritondigital|[?&]aw_0_/i;

  // Streamer mode: only talk stations (news, talk, sport...), going by Radio Browser's tags.
  // Music is what Content ID claims, so this lowers the risk; jingles and the odd song remain.
  const TALK_TAGS = /\b(news|talk|sports?|speech|information|info|noticias|nachrichten|actualit|informa|notizie|public radio|comedy|debate|politics)/i;
  const MUSIC_TAGS = /\b(music|musica|música|musik|musique|hits?|pop|rock|dance|jazz|classical|country|oldies|top ?40|chart|r&b|hip ?hop|electronic|house|latin|reggae|metal|disco|[5-9]0s|schlager|soul|funk|blues|folk|indie|christian|gospel)\b/i;
  const isTalk = s => TALK_TAGS.test(s.tags) && !MUSIC_TAGS.test(s.tags);

  const START_MS = 8000; // a stream that hasn't started playing by now is skipped
  const STALL_MS = 8000; // ...and so is one that has been buffering this long

  // ---- silence GeoGuessr's own music and sounds while radio mode is on ----
  // Installed at document_start whether or not radio mode is on, before GeoGuessr's
  // scripts, so every AudioContext and media element it makes is seen and switching the
  // mode on later needs no refresh. Web Audio contexts are suspended (and kept
  // suspended); <audio>/<video> elements other than ours are muted.
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
    // http streams are blocked on an https page; HLS needs a library Chrome doesn't have built in
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
      // Talk stations are sparser, so the round's country (that of the nearest station) comes
      // first: its talk stations near the spot, then the rest of it, then nearby ones across
      // the border, then wider.
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
  const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`);
  const describe = (s, loc) => {
    const where = [s.state, s.country].filter(Boolean).join(', ');
    const dist = s.geo_lat != null && loc ? ` · ${km(loc, { lat: s.geo_lat, lng: s.geo_long })} km from the spot` : '';
    return where + dist;
  };

  // ---- the player ----
  // Two layouts. "stage": Street View is hidden, so the player takes its place, inside
  // GeoGuessr's own layout (right after the panorama element), with GeoGuessr's HUD and
  // guess map still on top. "mini": a small bar in the top-left, used when Street View is
  // shown and on the result screens (where it also lists the game's stations).
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

  // ---- the visual ----
  // A fluid shape that is always mid-blend from one random country outline to the next, so
  // it only now and then settles near a real country (and never the round's). Its border
  // ripples with the volume, so talk works as well as music, and faint echoes spread out
  // behind it. While a station is loading it melts into a breathing circle with orbiting dots,
  // and it briefly turns into a play, pause or skip sign when those happen.
  const MORPH_MS = 3000;
  const SPIN_STEP = (Math.PI * 3) / 8; // how far it turns during each blend (67.5°)
  // Icons as outlines in the same format: -1..1, clockwise, starting top-left. Two-part icons
  // (pause, skip) use each half of the points for one part.
  const ICON_POLYS = {
    play: [[[-0.4, -0.55], [0.55, 0], [-0.4, 0.55]]],
    pause: [[[-0.45, -0.55], [-0.13, -0.55], [-0.13, 0.55], [-0.45, 0.55]], [[0.13, -0.55], [0.45, -0.55], [0.45, 0.55], [0.13, 0.55]]],
    skip: [[[-0.55, -0.5], [0.2, 0], [-0.55, 0.5]], [[0.25, -0.5], [0.5, -0.5], [0.5, 0.5], [0.25, 0.5]]],
    back: [[[-0.5, -0.5], [-0.25, -0.5], [-0.25, 0.5], [-0.5, 0.5]], [[0.55, -0.5], [0.55, 0.5], [-0.2, 0]]],
  };
  // Round a polygon's corners to radius r (a curve across each corner), so icons blend
  // smoothly with the outlines but keep their shape.
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
    const all = (ggs.radioShapes ?? []).map(a => Float32Array.from(a, v => v / 1000));
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

    // A closed, smooth path through the points (curves through the midpoints), in `parts`
    // separate loops (for two-part icons).
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
    // Outward unit normal at point i, from neighbours a few points away so small kinks don't flip it.
    let nx = 0, ny = 0;
    function normal(p, i) {
      const a = ((i + K - 2) % K) * 2, b = ((i + 2) % K) * 2;
      const tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], len = Math.hypot(tx, ty) || 1;
      nx = ty / len; ny = -tx / len;
    }
    // A wave travelling round the border, -1..1.
    const wave = (i, t, ph) => {
      const th = (i / K) * Math.PI * 2;
      return Math.sin(3 * th + t * 1.3 + ph) * 0.5 + Math.sin(7 * th - t * 2.1 + ph) * 0.3
           + Math.sin(13 * th + t * 3.4 + ph * 2) * 0.2;
    };

    // vol: 0..1 loudness right now; loading: finding or connecting to a station;
    // hold: an icon to show for as long as it's passed (pause while paused)
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
      // Always slowly spinning, at a steady SPIN_STEP per blend, and timed so each outline is
      // exactly north up at the moment the blend reaches it: the current one turns away from
      // upright as the next comes in from SPIN_STEP behind.
      const a0 = SPIN_STEP * p, a1 = SPIN_STEP * (p - 1);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let i = 0; i < n; i += 2) {
        const x0 = from[i] * c0 - from[i + 1] * s0, y0 = from[i] * s0 + from[i + 1] * c0;
        const x1 = to[i] * c1 - to[i + 1] * s1, y1 = to[i] * s1 + to[i + 1] * c1;
        const x = x0 + (x1 - x0) * m, y = y0 + (y1 - y0) * m;
        base[i] = x + (circle[i] - x) * load;
        base[i + 1] = y + (circle[i + 1] - y) * load;
      }
      // icons: the one on show eases into the next (pause -> play), and the shape eases into
      // and back out of it, so nothing snaps
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

      // the shape: border pushed in and out along its normal
      for (let i = 0; i < K; i++) {
        normal(base, i);
        const d = amp * wave(i, t, 0);
        shape[2 * i] = base[2 * i] + nx * d;
        shape[2 * i + 1] = base[2 * i + 1] + ny * d;
      }

      // echoes: always pushed outward from the shape, so they never cut inside it
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

      // loading: dots orbiting the circle
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
    // show an icon for a moment
    draw.flash = (name, ms) => { flashName = name; flashUntil = performance.now() + ms; };
    return draw;
  }

  // ---- streamer mode: skip music ----
  // Music (drums, bass lines) puts a lot of its energy below 90 Hz, speech hardly any.
  // Tuned on 31 real streams (recorded, then replayed offline): talk stations stayed under
  // 0.2 of their energy there over 3 s stretches, while most pop and dance music sits at
  // 0.2-0.6. A new station is first listened to silently for PRE_MS (3 s: shorter windows
  // skipped more talk stations over a jingle or a deep voice). Then, for as long as it
  // plays, the last BASS_MS (7 s, longer again so talk rarely gets cut off mid-show) are
  // checked every quarter second, in case music starts later. Music light on bass (old
  // recordings, acoustic) gets through. Only works on streams whose sound can be read
  // (CORS; about 9 in 10).
  const PRE_MS = 3000, BASS_MS = 7000, BASS_EVERY_MS = 250, BASS_SHARE = 0.2;
  function musicCheck() {
    let recent = [];
    return {
      reset() { recent = []; },
      // how much sound it has heard so far (up to BASS_MS)
      span(now) { return recent.length ? now - recent[0][0] : 0; },
      // feed it every frame: loudness, energy below 90 Hz, energy up to 10 kHz
      push(rms, low, all, now) {
        recent.push([now, rms, low, all]);
        while (now - recent[0][0] > BASS_MS) recent.shift();
      },
      // whether the last `ms` sounded like music (false until it has heard that much)
      music(now, ms) {
        if (this.span(now) < ms * 0.95) return false;
        let r = 0, l = 0, a = 0, k = 0;
        for (const f of recent) if (now - f[0] <= ms) { r += f[1]; l += f[2]; a += f[3]; k++; }
        return k > 0 && r / k >= 0.005 && a > 0 && l / a > BASS_SHARE; // silence is the watchdog's business
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
    // preListen: streamer mode's silent first listen; allowMusic: the streamer chose to hear it anyway
    let preListen = false, allowMusic = false, lastCheck = 0;
    const music = musicCheck();
    let volume = 0.6, watchdog = 0, stallTimer = 0, waitingSince = 0, blocked = false, userPaused = false, skipping = 0;
    let host = null, root = null, draw = null, raf = 0, lastT = 0, lastMove = 0, live = false;
    let round = null, loc = null, stations = [], idx = 0;
    // This game's rounds: { n, loc, stations, idx }; `cur` is the one playing.
    let game = null, history = [], cur = null, histSig = '', finished = false, checked = null;

    const $ = sel => root.querySelector(sel);
    const setStatus = t => { $('.status').textContent = t; };

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', 'radio'); // keeps GeoGuessr's hotkeys out of it
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
          userPaused = true; // the shape holds a pause sign until it plays again
          audio.pause();
        }
      };
      // the play button, the shape, or the empty space around it
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
        live = !!audio && !audio.paused && now - lastMove < 400; // sound is actually arriving
        const isPlaying = !!audio && !audio.paused;
        if (isPlaying !== playing) $('.play').innerHTML = (playing = isPlaying) ? ICON.pause : ICON.play;
        // loudness: measured when the stream allows it, otherwise a talky made-up wobble
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

    // Stage in place of the (hidden) panorama, or the mini bar on top of everything.
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

    // Our own AudioContext (the real constructor, so muteGame leaves it alone) for reading
    // the sound of streams that allow it.
    function ensureCtx() {
      // Only once the player has clicked or typed: before that Chrome refuses (and warns about) it.
      if (ctx || !RealAudioContext || navigator.userActivation?.hasBeenActive === false) return;
      ctx = new RealAudioContext();
      ours.add(ctx);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0; // raw frames, as the music check was tuned on
      td = new Uint8Array(analyser.fftSize);
      fd = new Float32Array(analyser.frequencyBinCount);
      gain = ctx.createGain(); // silent while pre-listening
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

    // Try with CORS first (so the outline can follow it); if the stream refuses, again without.
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
      // streamer mode: hear nothing until the first check says it isn't music
      preListen = readable && !!cfg.streamerMode && !allowMusic;
      if (gain) { gain.gain.cancelScheduledValues(0); gain.gain.value = preListen ? 0 : 1; }
      let failed = false;
      const fail = () => {
        if (failed || a !== audio) return;
        failed = true;
        // The stream won't let its sound be read (CORS), so streamer mode can't check it for
        // music: try the stations it can check first, and only play this one if none are left.
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
        // Chrome won't play sound on a page nobody has clicked or typed in since it loaded.
        // Start on the first click or key press anywhere instead.
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
        // Streamer mode can only check for music once the page has had a click or key press
        // (Chrome's rule for reading audio), so wait for one rather than play unchecked.
        blocked = true;
        waitingSince = 0;
        return setStatus('Click anywhere to start the radio');
      }
      // a station already known to refuse CORS goes straight to plain playback
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

    // Music in streamer mode: turn the shape into a skip sign, cut the sound, and move on to
    // the next station not yet caught playing music. If they all have been, go back to the
    // first of them, paused: the streamer can still press play and hear it anyway.
    // Tracked per station (not per number), as uncheckable stations get moved to the back.
    const flaggedFor = new WeakMap(); // station list -> stations caught playing music
    const uncheckableFor = new WeakMap(); // station list -> stations whose sound can't be read
    const setFor = map => { const set = map.get(stations) ?? new Set(); map.set(stations, set); return set; };
    // A station that can't be checked for music: quietly move it to the back of the list, so
    // the next checkable one takes its number and the count only ever goes forward. False if
    // there's no checkable station left after it (then it plays unchecked).
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

    // Result screens: the guesses are in, so name the stations.
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
          const title = st ? ` title="${esc(new URL(st.url_resolved).hostname)}"` : ''; // which stream network, for ad hunting
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
        // Once per result screen: is the game over? Then list every round's station.
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
        if (retune) round = null; // the next tick finds this round's stations again
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
// Ghana black tape, stuck to the car so it turns with the view like the real thing.
//
// Old (Gen 3) Ghana coverage has black tape on the car; the new Gen 4
// coverage doesn't. On Gen 4 panoramas inside Ghana, a strip of tape is painted in.
// Generation comes from the panorama's tile size (Gen 4 is 16384 px wide, Gen 3 13312).
(() => {
  const ggs = globalThis.__ggs;

  // The car, in its own frame: x right, y forward, z up, with the camera at the origin
  // (units don't matter, only the ratios). Seen looking down: the four ends of two roof
  // bars poking out from under the (blurred) car, and the black tape on the tip of the
  // front-left one.
  const CAR = {
    bars: { ys: [-0.85, 0.85], inner: 1.0, outer: 1.5, w: 0.07, z: -1 }, // y of each bar; where the ends start/stop; half width
    tape: { bar: 1, side: 1, len: 0.22, w: 0.085 },                      // front bar, right side; how far along the tip
  };
  const GEN4_WIDTH = 16384;

  // ---- catch GeoGuessr's Street View ----
  // Installed at document_start whether or not the script is on, so the panorama is
  // seen even if the script is switched on mid-game.
  // StreetViewPanorama has no getDiv(), so remember the container it was built in.
  const panos = new Map(); // pano -> container div
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) {
          super(...args);
          if (!(args[0] instanceof HTMLElement)) return;
          panos.set(this, args[0]);
          // never let an overlay bug break GeoGuessr's Street View
          try { active?.attach(this); } catch (err) { ggs.log('ghana-tape attach failed', err); }
        }
      };
    } catch (err) {
      ggs.log('could not hook google.maps.StreetViewPanorama', err);
    }
  }, 10);

  // Ghana's outline is coarse and coastal spots can fall just outside it, so a point
  // within ~5 km of the edge counts too (the land borders get the same leeway).
  const NEAR_DEG = 0.05;
  function nearEdge([x, y], poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2));
      if (Math.hypot(x - (xi + t * dx), y - (yi + t * dy)) < NEAR_DEG) return true;
    }
    return false;
  }
  function inPolygon(pt, poly) {
    return insidePolygon(pt, poly) || nearEdge(pt, poly);
  }
  function insidePolygon([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // pano id -> Promise<{ width, centerHeading } | null>
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

  // Camera-frame coords of a point in the car's frame: [right, up, depth].
  function toCamera([x, y, z], pov) {
    const a = rad(pov.heading), t = rad(pov.pitch);
    const cx = x * Math.cos(a) - y * Math.sin(a), cy = z, cz = x * Math.sin(a) + y * Math.cos(a);
    return [cx, cy * Math.cos(t) - cz * Math.sin(t), cy * Math.sin(t) + cz * Math.cos(t)];
  }

  // Projects a polygon onto the screen, clipping away the part behind the camera
  // (so a bar that's half behind you still shows its front half).
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

  let active = null;

  function start(cfg) {
    const attached = new Map(); // pano -> { canvas, listeners, info }

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
      // Heading relative to the car. centerHeading points at the back of the car, hence the 180.
      const rel = { heading: pov.heading - st.info.centerHeading + 180, pitch: pov.pitch };
      const fov = Math.min(127, 180 / 2 ** (pano.getZoom() ?? 1));
      const P = pts => project(pts, rel, fov, w, h);
      const rect = (x0, x1, y0, y1, z) => P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
      const path = pts => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      // stroked in the same colour so adjacent strips don't show a seam
      const fill = (pts, color) => {
        if (!pts) return;
        path(pts);
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      };
      // Half-disc on the end of a bar, in the roof plane.
      const cap = (cx, cy, r, side, z) => P(Array.from({ length: 9 }, (_, i) => {
        const a = ((i / 8) - 0.5) * Math.PI;
        return [cx + side * r * Math.cos(a), cy + r * Math.sin(a), z];
      }));
      // Strips across a bar's width, lit from above: bright ridge in the middle, darker sides.
      const shade = (x0, x1, y, hw, z, colors) => {
        const n = colors.length;
        colors.forEach((c, i) => fill(rect(x0, x1, y - hw + (2 * hw * i) / n, y - hw + (2 * hw * (i + 1)) / n, z), c));
      };
      // Fades the inner end of a bar into the blurred car it comes out of.
      const fade = (x0, x1, y, hw, z) => {
        const r = rect(x0, x1, y - hw, y + hw, z);
        // gradient runs from the inner end to the outer end (a clipped rect may have
        // more or fewer than 4 corners, so project the two midpoints separately)
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
          const outline = rect(x0, x1, y - hw, y + hw, bars.z);
          if (!outline) continue;

          // soft shadow on the roof
          ctx.save();
          ctx.filter = 'blur(3px)';
          fill(rect(x0, x1 + side * 0.03, y - hw * 0.6 + 0.05, y + hw * 1.4 + 0.05, bars.z - 0.01), 'rgba(0,0,0,.28)');
          ctx.restore();

          // aluminium tube with a groove down the middle
          shade(x0, x1, y, hw, bars.z, ['#8e8f90', '#c9cacb', '#e9eaea', '#f4f4f4', '#dcdddd', '#b5b6b7', '#828384']);
          fill(rect(x0, x1, y - hw * 0.12, y + hw * 0.12, bars.z + 0.001), '#5a5b5c');
          fill(rect(x0, x1, y + hw * 0.12, y + hw * 0.2, bars.z + 0.001), 'rgba(255,255,255,.35)');
          fill(cap(x1, y, hw, side, bars.z), '#b9babb');
          fill(cap(x1, y, hw * 0.55, side, bars.z + 0.001), '#8a8b8c');

          if (i === tape.bar && side === tape.side) {
            const tx0 = side * (bars.outer - tape.len), tx1 = x1 + side * 0.015, tw = tape.w;
            shade(tx0, tx1, y, tw, bars.z + 0.002, ['#161616', '#2a2a2a', '#383838', '#2c2c2c', '#1b1b1b', '#111']);
            fill(cap(tx1, y, tw, side, bars.z + 0.002), '#1f1f1f');
            // wrap edges of the tape
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
      if (pos && id && inPolygon([pos.lng(), pos.lat()], ggs.GHANA)) {
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
    name: 'Lying signs (experimental)',
    description: 'Rewrites the text on signs.',
    defaultEnabled: false,
    options: [
      // index into WORDS in main.js; 0 = a different one for every sign
      { key: 'script', label: 'Script to write in', type: 'select', default: 0,
        choices: ['Random', 'Thai', 'Georgian', 'Korean', 'Arabic', 'Cyrillic', 'Greek', 'Hebrew', 'Japanese', 'Hindi', 'Armenian',
          'English (wrong words)', 'German', 'Spanish', 'French', 'Minecraft'].map((label, value) => ({ value, label })) },
    ],
  });
})();

// ==================== src/scripts/lying-signs/main.js =============================
// Lying signs: every Street View tile is caught on its way into WebGL, text on it is
// found, painted over, and new text in a different script is written on top.
//
// How the tiles get caught: the Maps API loads each tile as an <img> and uploads it with
// texImage2D/texSubImage2D. That call is wrapped. The tile can't be edited on the spot
// (finding text takes a few hundred ms in a worker), so a blurred copy goes up first
// (nothing legible ever shows), the texture and call arguments are remembered, and once
// the boxes come back the edited tile is uploaded to that same texture. Tiles seen
// before are served edited straight away. Tiles already on screen when the script is
// switched on or off are replayed through the hook by ggs.tiles (core/tiles.js).
//
// Text finding: PP-OCRv4's DBNet text detector on onnxruntime-web, in worker.js.
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  const DET_SIZE = 768;                       // model input; 512-px tiles are upscaled so small text is found
  const MIN_CONTRAST = 45;                    // summed RGB difference text must have from its sign; below it the box is ignored
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  // Indexed by the "script" option; 0 is "random" (one script per panorama, picked from its id).
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
  // Indexed by the "script" option; 0 is "random" (one script per panorama, picked from its id).
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

  // Standard Galactic Alphabet (Minecraft's enchanting table letters), as strokes on a
  // 10x10 grid: each glyph is a list of polylines, a single point being a dot. The
  // "Minecraft" script draws random runs of these instead of words.
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

  // Deterministic randomness keyed on a sign's place in the panorama, so the same sign
  // gets the same script and word on every tile and zoom level it appears in.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // seed for a box: pano + its centre in whole-panorama units (same at every zoom)
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
  // Detection queue. The tile nearest to where you're looking goes first (tile grid
  // position vs the panorama's current heading/pitch; newest first when that's unknown).
  // Two in flight so the worker's CPU prep overlaps the GPU. A queued tile whose
  // textures have all gone (pano changed) is dropped unrun.
  const queue = [];                           // [{ img, cfg, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2;
  ggs.lyingSigns.debug = () => ({ queue: queue.length, inflight, waiting: waiting.size, tiles: tiles.size });
  function detect(img, cfg, alive, url) {
    return new Promise(res => { queue.push({ img, cfg, res, alive, url }); pump(); });
  }
  const TILE_XY = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;
  // Angular distance from the tile's centre to the current view, or null if unknown.
  function tileDistance(url) {
    const m = TILE_XY.exec(url);
    if (!m) return null;
    const [, id, x, y, z] = m;
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

  // ---- tile hook, installed at document_start whether or not the script is on ----
  const tiles = new Map();                    // url -> { boxes, cfg, canvas, pending: [upload records] }
  const grid = new Map();                     // "pano/zoom/x/y" -> same entry, for finding a tile's children
  const TILE_KEY = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;
  const gridKey = url => { const m = TILE_KEY.exec(url); return m && { pano: m[1], x: +m[2], y: +m[3], z: +m[4] }; };

  // Zooming out: a tile's four children one zoom level in are the same picture at
  // twice the detail. Where they've already been edited, the parent is assembled from
  // them (scaled down) instead of being detected again, so the sharper edit and the
  // same words carry over. Grandchildren are used when a child is missing.
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
  // Zooming in: if the tile one zoom level out (or two) has been detected, its boxes
  // are scaled into this tile instead of detecting again, so what's changed stays the
  // same as you zoom. The seeded word picks then match too.
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
  const mipTex = new WeakSet();               // textures the API calls generateMipmap on
  const origFetch = globalThis.fetch;
  const orig = {};

  function bindingFor(gl, target) {
    return target === gl.TEXTURE_2D ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D] : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];
  }

  // Called for every texImage2D/texSubImage2D whose source is an <img>. Returns the
  // source to upload now.
  function onUpload(gl, name, args, img) {
    if (!active) return img;
    const url = img.currentSrc || img.src;
    if (!TILE.test(url)) return img;
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
      // parent already detected: same boxes, scaled, no detection
      const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      // parent already detected: use its boxes now (same words, nothing pops), and
      // still detect at this zoom to add small text the parent couldn't see
      const inherited = k && inheritedBoxes(k, W, H);
      if (inherited) { t.inherited = inherited; t.boxes = inherited; t.canvas = editSync(img, inherited, active, k); stats.inherited = (stats.inherited || 0) + 1; }
      const alive = () => t.pending.some(r => !r.gl.isContextLost() && r.gl.isTexture(r.tex));
      detect(img, active, alive, url).then(boxes => {
        if (!boxes) { if (!t.inherited) tiles.delete(url); t.pending = []; return; } // skipped or failed: the blurred/original stays; a later upload retries
        t.boxes = t.inherited ? merge(t.inherited, boxes) : boxes;
        stats.boxes += boxes.length;
        flush(t, img);
      });
    }
    // remember where this went so the edited tile can replace it later
    const [bindTarget, bindParam] = bindingFor(gl, args[0]);
    t.pending.push({
      gl, name, args, bindTarget, tex: gl.getParameter(bindParam),
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    });
    if (t.canvas) return t.canvas;            // the inherited edit, while this zoom's detection runs
    const ph = blurred(img);
    overlayChildren(ph, k);
    return ph;
  }
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
      const { gl } = r;
      try {
        if (gl.isContextLost() || !gl.isTexture(r.tex)) continue;
        const [, bindParam] = bindingFor(gl, r.args[0]);
        const prevTex = gl.getParameter(bindParam);
        const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        gl.bindTexture(r.bindTarget, r.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
        orig[r.name].call(gl, ...r.args, t.canvas);
        if (mipTex.has(r.tex)) gl.generateMipmap(r.bindTarget);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
        gl.bindTexture(r.bindTarget, prevTex);
        stats.edited++;
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err);
      }
    }
    t.pending = [];
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] = orig[name] || fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { a[i] = onUpload(this, name, a.slice(0, i), a[i]); } catch (err) { stats.failed++; }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingFor(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
    // in case tiles ever arrive as blobs instead of <img>s
    globalThis.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      if (!active || !TILE.test(String(url))) return origFetch.call(this, input, init);
      stats.seen++; stats.paths.fetch = (stats.paths.fetch || 0) + 1;
      const r = await origFetch.call(this, input, init);
      try {
        const bmp = await createImageBitmap(await r.blob());
        const boxes = (await detect(bmp, active, () => true, url)) || [];
        const b = await editSync(bmp, boxes, active, gridKey(url)).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        stats.edited++;
        return new Response(b, { status: 200, headers: { 'content-type': b.type } });
      } catch (err) { stats.failed++; return r; }
    };
  }
  try { install(); } catch (err) { ggs.log('lying-signs: hook failed', err); }

  // ---- the edits ----
  // Placeholder while the detector works: the tile at 1/10 size, scaled back up, so
  // nothing is legible however far you zoom in.
  function blurred(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const small = new OffscreenCanvas(Math.max(1, W / 10 | 0), Math.max(1, H / 10 | 0));
    small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    return c;
  }

  // Edits any drawable source (img, ImageBitmap) with the detector's boxes; returns an
  // OffscreenCanvas. Each box is handled in its own frame, rotated so the text runs
  // level: the source is drawn into a small canvas with the inverse rotation, the patch
  // and the new text are made there, and the result is rotated back onto the tile
  // through a soft mask shaped like the old and new text (not a rectangle).
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

  // The bottom of the panorama (the car, or the logo disc unofficial coverage puts
  // there) is stretched into a wide arc in these tiles, so the detector can't read text
  // in it. It's smeared unconditionally instead: everything below NADIR_PITCH goes to a
  // coarse mosaic, fading in over a few px.
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

  // A fill for the box (and the zone around it) built from the pixels just outside it:
  // every pixel is the distance-weighted mix of the smoothed left/right/top/bottom
  // border colours at its row/column, so lighting gradients carry across and none of
  // the old text bleeds in. Border pixels that aren't the sign's colour (sky past its
  // edge, its frame) are ignored, so the fill falls back to the sign colour there. The
  // border's own noise is added back as grain.
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

  // Sign colour = the dominant colour inside the box (text is the minority of its
  // pixels, and what's outside the box may be a different surface altogether). Text
  // colour = average of the inside pixels that differ most from it.
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

  // ---- which way you're looking: read-only hook on StreetViewPanorama ----
  const panos = new Set();
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) { super(...args); panos.add(this); }
      };
    } catch (err) { ggs.log('lying-signs: could not hook StreetViewPanorama', err); }
  }, 10);

  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    detector();
    ggs.tiles.replay(); // tiles already on screen go through the hook now
    return {
      stop() { active = null; ggs.tiles.replay(); },
      update(next) { const changed = next.script !== active.script; active = next; if (changed) ggs.tiles.replay(); },
    };
  }
  ggs.scripts['lying-signs'] = { start };
})();

// ==================== src/scripts/minecraft/meta.js ===============================
(() => {
  const ggs = globalThis.__ggs;
  ggs.registry.push({
    id: 'minecraft',
    name: 'Minecraft world (experimental)',
    description: 'The round is redrawn in Minecraft.',
    defaultEnabled: false,
    options: [
      { key: 'hq', label: 'High quality (slower; a few rounds a day)', type: 'checkbox', default: false },
      { key: 'code', label: 'Code', type: 'text', default: '', placeholder: 'optional', secret: true, hidden: true },
    ],
    // What's left today shows under the options (ggs.status in main.js).
  });
})();

// ==================== src/scripts/minecraft/main.js ===============================
// Minecraft world: the panorama you're in is sent (once) to OpenAI's image edit API and
// the result is wrapped back over the Street View sphere.
//
// How: every Street View tile goes into WebGL with texImage2D/texSubImage2D from an <img>
// whose URL names the panorama and the tile's x/y/zoom (the same hook as lying-signs).
// The first tile of a new panorama starts one generation: the panorama's id and size go
// to server/minecraft.php, which fetches the tiles from Google, stitches them and posts the
// picture to the API with the key it holds. Nothing but that id, the size, a random
// per-install client id and the optional code leaves the page. Until the picture is back,
// tiles go up black;
// when it is, every tile uploaded so far is replaced by the matching crop of the
// picture, and later tiles (any zoom) are cropped straight away. So zooming and looking
// around never generate again; only a new panorama does. Switching on or off mid-round
// replays the tiles already on screen through the hook (ggs.tiles in core/tiles.js).
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;

  // The prompt, models, sizes and daily limits live in server/minecraft.php.
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php';

  // A random id made once per install, so the server can keep a per-user daily count.
  function clientId() {
    let id = null;
    try { id = localStorage.getItem('ggs-client'); } catch {}
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('ggs-client', id); } catch {}
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

  // Typical seconds from first tile to swapped tiles, from the last rounds; drives the
  // loading bar (the API reports no progress, so the bar is an estimate).
  const ETA_DEFAULT = { normal: 15, hq: 40 };
  let eta = {};
  try { eta = JSON.parse(localStorage.getItem('ggs-minecraft-eta')) ?? {}; } catch {}

  // ---- panorama metadata (tile grid size per zoom) ----
  const meta = new Map(), metaSync = new Map(); // panoId -> Promise<{ worldWidth, tileWidth, zmax }> / resolved value
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

  // ---- generations, one per panorama ----
  const gens = new Map(); // `${panoId}/${mode}` -> { promise, image (ImageBitmap|null), pending: [uploads waiting for it], error }
  let active = null, overlay = null; // active: the cfg while the script is on

  // ---- daily limits ----
  // The server counts per client id; a copy of its log is kept in this site's localStorage
  // so a round isn't started when today's limit is already used up, and the two are merged
  // on every call. The log is { normal: [timestamps], hq: [timestamps] } over a rolling 24 h.
  const DAY = 24 * 3600 * 1000, QKEY = 'ggs-minecraft-quota';
  const Q = {
    // Drops entries older than a day; merges another copy of the log (union of timestamps).
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
  const readLog = () => { try { return JSON.parse(localStorage.getItem(QKEY)) ?? {}; } catch { return {}; } };
  function saveLog(other) {
    log = Q.tidy(log, other);
    try { localStorage.setItem(QKEY, JSON.stringify(log)); } catch {}
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    ggs.status('minecraft', `Today: ${part('rounds', Q.left(log, 'normal', caps.normal))} · ${part('high quality', Q.left(log, 'hq', caps.hq))}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    log = readLog();
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      ggs.status('minecraft', 'Server not reachable');
      ggs.debug('minecraft: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  function allowed(mode) { return Q.left(log, mode, caps[mode]).left > 0; }
  const stats = { uploads: 0, tiles: 0, swapped: 0 }; // WebGL <img> uploads seen, of which Street View tiles, tiles re-uploaded
  ggs.minecraft = { debug: () => ({ active: !!active, hooked: !!orig.texImage2D, tiles: ggs.tiles.count(), ...stats,
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
      progressStart(eta[mode] ?? ETA_DEFAULT[mode]);
      const m = await panoMeta(id);
      const r = await server({ pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode }, true);
      if (r.log) saveLog(r.log);
      const img = new Image();
      img.src = r.image;
      await img.decode();
      g.image = await createImageBitmap(img);
      ggs.debug(`minecraft: generated ${id} (${mode}) in ${(r.ms / 1000).toFixed(1)} s`);
      await flush(g); // the bar only finishes once the tiles on screen have been swapped
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      eta[mode] = Math.round((Date.now() - t0) / 1000 * 0.7 + (eta[mode] ?? (Date.now() - t0) / 1000) * 0.3);
      try { localStorage.setItem('ggs-minecraft-eta', JSON.stringify(eta)); } catch {}
      progressDone();
    })().catch(err => {
      g.error = err;
      ggs.log('minecraft: generation failed', err);
      progressDone(true);
      flush(g).then(() => ggs.tiles.repaint(id)); // put the real tiles back so the game goes on
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom (a 512x512-ish canvas).
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom), H = Math.ceil(W / 2), img = g.image;
    const sx = (x * tw / W) * img.width, sy = (y * th / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width), sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw * sw / ((tw / W) * img.width), th * sh / ((th / H) * img.height));
    return c;
  }

  // ---- tile hook (installed at document_start whether or not the script is on) ----
  const orig = {}, mipTex = new WeakSet();
  const bindingFor = (gl, target) =>
    target === gl.TEXTURE_2D ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D] : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];

  function onUpload(gl, name, args, img) {
    stats.uploads++;
    if (!active) return img;
    const mt = TILE.exec(img.currentSrc || img.src);
    if (!mt) return img;
    stats.tiles++;
    const [, id, x, y, zoom] = mt;
    if (!gens.has(`${id}/${modeOf(active)}`) && !allowed(modeOf(active))) {
      // over today's limit: the real view shows, and a note says when it's back
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, modeOf(active), caps[modeOf(active)]);
        notice(`${active.hq ? 'High quality' : 'Minecraft'} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const g = generation(id);
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const [bindTarget, bindParam] = bindingFor(gl, args[0]);
    const rec = {
      gl, name, args, x: +x, y: +y, zoom: +zoom, tw, th, img, bindTarget, tex: gl.getParameter(bindParam),
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, +x, +y, +zoom, tw, th);
    if (g.error) return img;
    g.pending.push(rec);
    return blank(tw, th);
  }

  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = TILE.exec(recs[0].img.currentSrc || recs[0].img.src)?.[1];
    const m = g.image && id ? await panoMeta(id).catch(() => null) : null;
    for (const r of recs) {
      const { gl } = r;
      try {
        if (gl.isContextLost() || !gl.isTexture(r.tex)) continue;
        const src = m ? crop(g, m, r.x, r.y, r.zoom, r.tw, r.th) : r.img;
        const [, bindParam] = bindingFor(gl, r.args[0]);
        const prevTex = gl.getParameter(bindParam);
        const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        gl.bindTexture(r.bindTarget, r.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
        orig[r.name].call(gl, ...r.args, src);
        if (mipTex.has(r.tex)) gl.generateMipmap(r.bindTarget);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
        gl.bindTexture(r.bindTarget, prevTex);
        stats.swapped++;
      } catch (err) { ggs.log('minecraft: re-upload failed', err); }
    }
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] = orig[name] || fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { a[i] = onUpload(this, name, a.slice(0, i), a[i]); } catch (err) { ggs.log('minecraft: hook failed', err); }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingFor(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('minecraft: hook failed', err); }

  // Placeholder while the picture is made: a plain black tile.
  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      blankTile.getContext('2d').fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  // ---- loading bar, centred over the game while a round is being redrawn ----
  // The API reports no progress, so the bar eases towards 90% over the time the last
  // rounds took, then fills once the new tiles are on screen.
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
  let progressTimer = null;
  function progressStart(seconds) {
    if (!overlay) return;
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
  function progressDone(failed, message) {
    if (!overlay) return;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) { overlay.fill.style.background = '#e03131'; overlay.text.textContent = message ?? 'Could not redraw this round'; }
    setTimeout(() => { if (overlay) delete overlay.host.dataset.on; }, failed ? 4000 : 400);
  }
  // A short message with no bar (limits).
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
    ggs.debug('minecraft: on; tiles seen so far', stats.tiles);
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div><div class="bar"><div class="fill"></div></div></div>`;
    document.body.append(host);
    overlay = { host, text: root.querySelector('.text'), bar: root.querySelector('.bar'), fill: root.querySelector('.fill') };
    loadQuota().finally(() => ggs.tiles.replay()); // tiles already on screen go through the hook once the limits are known
    return {
      stop() { active = null; clearInterval(progressTimer); host.remove(); overlay = null; ggs.tiles.replay(); },
      update(c) {
        const codeChanged = c.code !== active?.code, hqChanged = !!c.hq !== !!active?.hq;
        active = c;
        if (codeChanged) loadQuota();
        // quality switched: replay the tiles on screen, so a panorama already generated in
        // that quality swaps instantly and one that isn't gets generated now
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }

  ggs.scripts.minecraft = { start };
})();

// ==================== src/core/tiles.js ===========================================
// Street View tile ledger, shared by the scripts that repaint tiles (lying-signs,
// minecraft). Those scripts wrap texImage2D/texSubImage2D and edit tiles as the Maps API
// uploads them, but the API never re-uploads a tile that's already on screen, so a
// script switched on or off mid-round would do nothing until the next panorama. This
// file's wrapper is listed after the scripts in manifest.json, so it's the outermost and
// sees the original <img> even while a script is swapping it for a canvas; it only
// records which texture each tile went into and with what arguments. ggs.tiles.replay()
// then loads those tiles again (from the browser cache) and uploads them through the
// same prototype methods, so every script's wrapper sees them as if they'd just arrived:
// scripts that are on edit them, and scripts that are off let the originals through.
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  const MAX = 1200;                           // records kept (zoom 4 is 512 tiles per panorama)
  const records = [];                         // { gl, name, args, url, crossOrigin, referrerPolicy, target, tex, flip, premul }
  const mipTex = new WeakSet();
  const bindingParam = (gl, target) => target === gl.TEXTURE_2D ? gl.TEXTURE_BINDING_2D : gl.TEXTURE_BINDING_CUBE_MAP;
  const bindTarget = (gl, target) => target === gl.TEXTURE_2D ? gl.TEXTURE_2D : gl.TEXTURE_CUBE_MAP;

  function record(gl, name, args, img) {
    const url = img.currentSrc || img.src;
    if (!TILE.test(url)) return;
    const tex = gl.getParameter(bindingParam(gl, args[0]));
    if (!tex) return;
    // one record per (texture, face, level, offset): a re-upload replaces the older one
    const same = r => r.gl === gl && r.tex === tex && r.name === name && r.args[0] === args[0] && r.args[1] === args[1]
      && (name !== 'texSubImage2D' || (r.args[2] === args[2] && r.args[3] === args[3]));
    const i = records.findIndex(same);
    if (i >= 0) records.splice(i, 1);
    records.push({
      gl, name, args, url, tex, target: args[0], crossOrigin: img.crossOrigin, referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    });
    if (records.length > MAX) records.splice(0, records.length - MAX);
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { record(this, name, a.slice(0, i), a[i]); } catch {}
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingParam(this, target))); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('tiles: hook failed', err); }

  // ---- GeoGuessr's Street View instances, so the view can be nudged into repainting ----
  // The renderer only redraws on a view change, so freshly uploaded tiles would sit
  // unseen until the mouse moved. Two nudges, since either alone can be swallowed: a
  // heading change held for a frame, and a mouse move over the canvas.
  const panos = new Set();
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) { super(...args); panos.add(this); }
      };
    } catch (err) { ggs.log('tiles: could not hook StreetViewPanorama', err); }
  }, 10);
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

  // ---- replay ----
  // Uploads every remembered tile again, through whatever the prototype methods are now
  // (every script's wrapper). Calls made in the same tick are merged into one replay.
  let scheduled = null;
  function replay() {
    if (scheduled) return scheduled;
    scheduled = new Promise(r => setTimeout(r, 0)).then(async () => {
      scheduled = null;
      const live = records.filter(r => !r.gl.isContextLost() && r.gl.isTexture(r.tex));
      records.length = 0; // each upload below records itself again
      let n = 0;
      await Promise.all(live.map(async r => {
        const img = new Image();
        if (r.crossOrigin != null) img.crossOrigin = r.crossOrigin;
        if (r.referrerPolicy) img.referrerPolicy = r.referrerPolicy;
        img.src = r.url;
        try { await img.decode(); } catch { return; }
        const { gl } = r;
        try {
          if (gl.isContextLost() || !gl.isTexture(r.tex)) return;
          const param = bindingParam(gl, r.target), target = bindTarget(gl, r.target);
          const prevTex = gl.getParameter(param);
          const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
          gl.bindTexture(target, r.tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
          gl[r.name](...r.args, img);
          if (mipTex.has(r.tex)) gl.generateMipmap(target);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
          gl.bindTexture(target, prevTex);
          n++;
        } catch (err) { ggs.log('tiles: replay failed', err); }
      }));
      if (n) ggs.debug(`tiles: replayed ${n} of ${live.length}`);
      await repaint();
      return n;
    });
    return scheduled;
  }

  ggs.tiles = { replay, repaint, count: () => records.length };
})();

// ==================== src/boot.js =================================================
// Starts and stops each script to match the popup settings. Changes apply live.
// On competitive games (see ggs.game.competitive) every script is stopped, whatever the
// settings say, and starts again once you're out.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null, blocked = false, path = null, check = 0;

  function apply() {
    if (!settings) return;
    for (const meta of ggs.registry) {
      const impl = ggs.scripts[meta.id];
      if (!impl) {
        ggs.log(`no implementation loaded for "${meta.id}" (missing from manifest.json?)`);
        continue;
      }
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

  // GeoGuessr is a single-page app, so watch the path. Games that might be competitive
  // are blocked straight away and only unblocked once the check says they're friendly.
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
