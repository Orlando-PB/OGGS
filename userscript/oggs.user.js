// ==UserScript==
// @name         OGGS - Orlando's GeoGuessr Scripts
// @namespace    https://github.com/Orlando-PB/OGGS
// @version      2.0.0
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

// Developed by Orlando. AI-generated code assisted with this script.
//
// Built by tools/build.mjs from extension/ in https://github.com/Orlando-PB/OGGS: don't edit
// this file, edit those. Each section below is one file from there, unchanged, except
// userscript/bridge.js, which stands in for the extension's bridge.js.
//
// What talks to the network, and with what:
//   core/game.js          geoguessr.com's own game API (your session), to read the game's mode
//                         and map, and the round's location (drawing board boost, map aids)
//   core/aid.js           country outlines (draw-guess's geo.json) from https://oggs.orlandopb.com/
//   userscript/bridge.js  loads the drawing and flag boards, the panel icon and the sign-text
//                         detector from https://oggs.orlandopb.com/
//   scripts/radio         radio-browser.info (station search) and the station streams
//   core/redraw.js        https://oggs.orlandopb.com/minecraft.php (Minecraft world): a Street View panorama
//                         id, its size, the style, a random per-install id and the optional code;
//                         gets the redrawn picture back
// Nothing else leaves the page. Settings stay in geoguessr.com's localStorage ("ggs-settings").

// ==================== userscript/bridge.js ========================================
// Userscript only. Stands in for the extension's bridge.js. Settings live in this site's
// localStorage ("ggs-settings") and travel by the same postMessage the extension uses.
// src/panel.js sends saves back the same way. The boards and the text detector load from BASE.
(() => {
  const ggs = (globalThis.__ggs ??= {});
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
  ggs.panelCss = `/* Same look as the store images: cream paper with a faint dot grid, dark ink, one flat accent
   per script, hard offset shadows, no glows. */
body { width: 320px; margin: 0; padding: 14px;
       font: 13px/1.4 "Avenir Next", Avenir, -apple-system, system-ui, "Segoe UI", sans-serif;
       color: #1c1a2e; background-color: #f5f1e8;
       background-image: radial-gradient(rgba(28, 26, 46, .09) 1.3px, transparent 1.5px);
       background-size: 22px 22px; background-position: 11px 11px; }
main { display: flex; flex-direction: column; gap: 14px; }

header { display: flex; align-items: center; gap: 10px; margin: 0 2px 14px; }
header img { width: 32px; height: 32px; }
h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; }

/* search box over the sections */
.search input { box-sizing: border-box; width: 100%; padding: 8px 12px; font: inherit; font-size: 13px;
  color: #1c1a2e; background: #fff; border: 2px solid #1c1a2e; border-radius: 10px;
  box-shadow: 3px 3px 0 #1c1a2e; outline: none; }
.search input:focus { box-shadow: 3px 3px 0 #fecd19; }
/* hides the suggestions' dropdown arrow; they still show as you type */
.search input::-webkit-calendar-picker-indicator { display: none !important; }
.sec[hidden], .cards > section[hidden] { display: none; }

/* one card per script, its accent its section's colour (below) */
section { --accent: #fecd19; border-radius: 10px; background: #fff; border: 2px solid #1c1a2e;
          box-shadow: 5px 5px 0 var(--accent); transition: box-shadow .15s, transform .15s; }
section.off { background: #f5f1e8; border-color: rgba(28, 26, 46, .3); box-shadow: none; }
section.off .name { color: rgba(28, 26, 46, .7); }

.row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; }
.text { flex: 1; min-width: 0; }
.name { display: block; font-weight: 700; font-size: 13px; }
.desc { display: block; margin-top: 2px; font-size: 12px; color: rgba(28, 26, 46, .6); }
.desc:empty { display: none; }

/* options sit under a rule, indented by a bar in the script's colour */
.opts { margin: 0 12px 6px; padding-top: 4px; border-top: 1px dashed rgba(28, 26, 46, .2); }
.opts:empty { display: none; }
.opts .row { padding: 5px 4px 5px 10px; margin-left: -2px; border-left: 2px solid var(--accent);
             border-radius: 0; font-size: 12px; color: rgba(28, 26, 46, .85); }
.opts .row:hover { background: rgba(28, 26, 46, .04); }
section.off .opts { display: none; }
/* sections: a coloured bar that folds its cards away and counts the ones that are on.
   The cards inside take the section's colour for their shadow. */
.sec { --sec: #e9e4d8; }
.sec[data-section="guessing"] { --sec: #8ec5ff; }
.sec[data-section="controls"] { --sec: #ff9f7a; }
.sec[data-section="streetview"] { --sec: #c4b0ff; }
.sec[data-section="misc"] { --sec: #ffd966; }
/* Chaos mode: its card alone, no fold, on a rainbow */
.sec.lone .cards { margin-top: 0; }
.sec[data-section="chaos"] section, .sec[data-section="chaos"] section.off {
  --accent: #8a5cff; border-color: #1c1a2e;
  background: linear-gradient(120deg, #ff4d4d, #ff9a1f, #ffd51f, #3ecf6a, #2fa8ff, #8a5cff, #ff4fd1); }
/* its name like the section bars, its settings on a light panel so they read on the strong colours */
.sec[data-section="chaos"] .name { font-size: 14px; font-weight: 800; letter-spacing: .06em;
  text-transform: uppercase; color: #1c1a2e; }
.sec[data-section="chaos"] .opts { margin: 0 10px 10px; padding: 6px 4px 2px; border: 0; border-radius: 8px;
  background: rgba(255, 255, 255, .85); }
.sec[data-section="chaos"] section { box-shadow: 5px 5px 0 #1c1a2e; }
/* the microphone warning: a click asks again */
.micnote { display: block; width: calc(100% - 8px); margin: 2px 4px 6px; padding: 6px 8px; font: inherit;
  font-size: 11px; font-weight: 700; color: #1c1a2e; text-align: left; background: #ffe3e3;
  border: 1.5px solid #e03131; border-radius: 6px; cursor: pointer; }
.micnote[hidden] { display: none; }
/* Chaos mode off: raised like the section bars */
.sec[data-section="chaos"] section.off { box-shadow: 3px 3px 0 #1c1a2e; }
.sec[data-section="chaos"] section.off .name { color: #1c1a2e; }
/* Chaos mode on: it runs the other scripts itself, so their sections are out of reach */
.chaos-on .sec:not([data-section="chaos"]):not([data-section="controls"]):not([data-section="ui"]) {
  opacity: .4; pointer-events: none; }
.chaos-on .sec:not([data-section="chaos"]):not([data-section="controls"]):not([data-section="ui"])
  > summary .count { display: none; }
/* in Controls, but chaos runs it */
.chaos-on section[data-id="reverse"] { opacity: .4; pointer-events: none; }
.sec > summary { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer;
                 list-style: none; background: var(--sec); border: 2px solid #1c1a2e; border-radius: 10px;
                 box-shadow: 3px 3px 0 #1c1a2e; font-size: 14px; font-weight: 800; letter-spacing: .06em;
                 text-transform: uppercase; color: #1c1a2e; transition: transform .1s, box-shadow .1s; }
.sec > summary:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #1c1a2e; }
.sec > summary::-webkit-details-marker { display: none; }
.sec > summary::before { content: '▸'; width: 10px; font-size: 12px; }
.sec[open] > summary::before { content: '▾'; }
.sec > summary .count { margin-left: auto; padding: 2px 8px; border: 1.5px solid #1c1a2e; border-radius: 999px;
                        background: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0;
                        text-transform: none; }
.sec > summary .count:empty { display: none; }
.sec .cards { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
.sec section { --accent: var(--sec); }
/* the box strips (Controls, UI): no card, never faded, since the boxes show what's on */
section[data-id="controls"], section[data-id="controls"].off, section[data-id="ui"], section[data-id="ui"].off {
  --accent: #1c1a2e; background: none; border: 0; border-radius: 0; box-shadow: none; }
section[data-id="controls"] .status:empty, section[data-id="ui"] .status:empty { display: none; }
section[data-id="controls"] .status, section[data-id="ui"] .status { padding: 0 0 4px; font-size: 11px;
  color: rgba(28, 26, 46, .5); }
section[data-id="ui"] .part + .part .boxes { padding-top: 0; }
.boxes { gap: 6px; padding: 0 0 6px; cursor: default; flex-wrap: wrap; }
.boxes .tog { flex: 1 1 auto; white-space: nowrap; }
section.flat .row { gap: 6px; cursor: default; }
section.flat .status:empty { display: none; }
.tog { flex: none; padding: 4px 7px; border-radius: 5px; border: 1.5px solid rgba(28, 26, 46, .55);
       background: #ebe5d6; color: #1c1a2e; font: inherit; font-size: 11px; font-weight: 700; line-height: 1.2;
       cursor: pointer; }
.tog[aria-pressed="true"] { background: #1c1a2e; border-color: #1c1a2e; color: #f5f1e8; }
.tog:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* option buttons inside a card: wrap long labels, a lone one is a full-width bar */
.opts .boxes, .opts .boxes:hover { cursor: default; border-left: 0; margin-left: 0; padding-left: 0;
  background: none; }
.opts .boxes .tog { white-space: normal; text-align: center; }
/* off option buttons look inactive */
.opts .tog[aria-pressed="false"] { background: transparent; border: 1.5px dashed rgba(28, 26, 46, .3);
  color: rgba(28, 26, 46, .55); }
.opts .tog[aria-pressed="false"]:hover { border-color: rgba(28, 26, 46, .6); color: #1c1a2e; }
.opts .more summary { padding: 4px 10px; font-size: 11px; color: rgba(28, 26, 46, .45); cursor: pointer;
  list-style: none; }
.opts .more summary::before { content: '▸ '; }
.opts .more[open] summary::before { content: '▾ '; }

/* sliders. Dragging one selects no text. */
.opts .slider { flex-wrap: wrap; row-gap: 4px; cursor: default; user-select: none; }
.slider .text { flex-basis: 100%; }
/* a slider whose marks say it all (Scream to look, Lag) */
.slider .text:empty { display: none; }
.slider input[type=range] { flex-basis: 100%; margin: 0; accent-color: var(--accent); cursor: pointer; }
.slider .marks { flex-basis: 100%; display: flex; justify-content: space-between; font-size: 11px;
                 color: rgba(28, 26, 46, .5); }
.slider .marks .on { color: #1c1a2e; font-weight: 800; }
.slider .stops { flex-basis: 100%; position: relative; padding-top: 14px; cursor: pointer; outline: none;
                 touch-action: none; }
.stops .track { position: absolute; left: 0; right: 0; top: 3px; height: 6px; border-radius: 3px;
                background: #45434f; }
.stops .track i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--x, 0); border-radius: 3px;
                  background: var(--accent); }
.stops .track b { position: absolute; left: var(--x, 0); top: 50%; width: 16px; height: 16px; border-radius: 50%;
                  transform: translate(-50%, -50%); background: var(--accent); border: 2px solid #fff;
                  box-shadow: 0 0 0 1px rgba(28, 26, 46, .25); box-sizing: border-box; }
.stops:focus-visible .track b { outline: 2px solid #1c1a2e; outline-offset: 1px; }
.stops .marks span { white-space: nowrap; }
/* each label is as wide as its bold version, so picking one doesn't shift the others */
.stops .marks span { display: inline-flex; flex-direction: column; align-items: center; }
.stops .marks span::after { content: attr(data-t); font-weight: 800; height: 0; overflow: hidden;
                             visibility: hidden; }

/* switches */
.switch { appearance: none; flex: none; position: relative; width: 34px; height: 20px; margin: 0;
          border-radius: 999px; background: rgba(28, 26, 46, .2); cursor: pointer; transition: background .15s; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
                 border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .35); transition: transform .15s; }
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

  // JSON in this site's localStorage. Fails quietly (private mode, full quota).
  ggs.store = {
    get(key, fallback = null) {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
  };
  // Set localStorage.ggsDebug = 1 for debug logging.
  if (ggs.store.get('ggsDebug')) ggs.debug = ggs.log;
  ggs.esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

  // Street View tile URLs, and the pano/x/y/zoom in them.
  ggs.TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  ggs.tileKey = url => {
    const m = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/.exec(url);
    return m && { pano: m[1], x: +m[2], y: +m[3], z: +m[4] };
  };
  // [bind target, binding parameter] for a texImage2D target.
  ggs.glBinding = (gl, target) => target === gl.TEXTURE_2D
    ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D]
    : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];

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
  ggs.onStatus = fn => {
    statusFns.push(fn);
    for (const [id, text] of Object.entries(status)) fn(id, text);
  };
  // Lets a script change one of its stored settings. Saved like the in-page panel's changes.
  ggs.saveSetting = (id, changes) => {
    const settings = { ...ggs.settings, [id]: { ...ggs.settings?.[id], ...changes } };
    window.postMessage({ ggs: 'save', settings }, location.origin);
  };

  // ---- microphone permission, for the scripts that listen (Scream to look, Speech jammer) ----
  // ggs.mic.state is 'granted', 'denied', 'prompt' or '' (not known yet). It goes out as the
  // '_mic' status line so the settings form can warn. ggs.mic.ask() asks for it and resolves
  // to true or false. The stream is closed at once. The popup asks by saving settings._mic.ask.
  ggs.mic = { state: '' };
  const setMic = s => {
    if (s === ggs.mic.state) return;
    ggs.mic.state = s;
    ggs.status('_mic', s);
  };
  try {
    navigator.permissions.query({ name: 'microphone' }).then(p => {
      setMic(p.state);
      p.onchange = () => setMic(p.state);
    }, () => {});
  } catch {}
  ggs.mic.ask = () => navigator.mediaDevices.getUserMedia({ audio: true }).then(
    s => {
      s.getTracks().forEach(t => t.stop());
      setMic('granted');
      return true;
    },
    err => {
      if (err?.name === 'NotAllowedError') setMic('denied');
      return false;
    });
  // The first settings only set the baseline, so a reload doesn't ask again.
  let askSeen;
  ggs.onSettings(all => {
    const at = all._mic?.ask ?? null;
    if (askSeen !== undefined && at !== askSeen) ggs.mic.ask();
    askSeen = at;
  });

  // ---- keys ----
  // Key events inside our panels (data-ggs-ui) stop here, so GeoGuessr's hotkeys don't fire.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, e => {
      const host = e.composedPath().find(n => n instanceof Element && n.hasAttribute('data-ggs-ui'));
      if (!host) return;
      e.stopImmediatePropagation();
    }, true);
  }
  ggs.isTyping = e => {
    const t = e.composedPath()[0];
    return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  };
  // ggs.hotkey(match, fn) returns an unregister function. Runs before GeoGuessr's own handlers.
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
// Finds GeoGuessr's guess map (a Google Maps instance) and puts guesses on it. A guess is
// a synthetic 'click' on the map, so GeoGuessr's own click handler places it.
(() => {
  const ggs = globalThis.__ggs;

  const isGoogleMap = o => o != null && typeof o === 'object'
    && typeof o.getDiv === 'function' && typeof o.panTo === 'function';

  // Class names are CSS-module hashed (guess-map_canvas__cvpqv), so match on the prefix.
  const GUESS_MAP_SELECTORS = [
    '[class*="guess-map_canvas"]',
    '[data-qa="guess-map"]',
    '[class*="guess-map_"]',
  ];
  const GUESS_BUTTON_SELECTORS = ['[data-qa="perform-guess"]', 'button[class*="guess-map_guessButton"]'];
  const first = sels => sels.map(s => document.querySelector(s)).find(Boolean) ?? null;
  const guessMapElement = () => first(GUESS_MAP_SELECTORS);
  // Fallback for layouts whose button lost those markers: a button labelled Guess near the map.
  const GUESS_AREA = '[class*="guess-map_guessMap"], [class*="guess-map_container"],'
    + ' [class*="guess-map_root"]';
  const labelledGuess = () => {
    const area = guessMapElement()?.closest(GUESS_AREA) ?? document;
    return [...area.querySelectorAll('button')].find(b => /^\s*guess\s*$/i.test(b.textContent)) ?? null;
  };
  const guessButton = () => first(GUESS_BUTTON_SELECTORS) ?? labelledGuess();
  // GeoGuessr's own guess pin (guessed, never seen live). The extra-guesses script hides it
  // so its pins all look the same.
  const GUESS_PIN_SELECTORS = ['[class*="guess-map_"] [class*="marker_"]', '[data-qa="guess-marker"]'];

  // ---- constructor hooks: see every Map / StreetViewPanorama GeoGuessr makes ----
  // hook('StreetViewPanorama', (instance, args) => ...). Wrapped once google.maps exists.
  // Callbacks also get the instances made before they registered.
  // name -> { fns, made: [[instance, args]] }
  const hooks = {};
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
            for (const fn of h.fns) {
              try {
                fn(this, args);
              } catch (err) {
                ggs.log(`${name} hook failed`, err);
              }
            }
          }
        };
      } catch (err) {
        ggs.log(`could not hook google.maps.${name}`, err);
      }
    }
  }, 10);
  const created = [];
  // The last spot clicked on any map this round, by the player or placeGuess, so a script
  // switched on mid-round knows where the pin already is. A shift-click takes it off.
  let last = null;
  hook('Map', m => {
    created.push(m);
    window.google.maps.event.addListener(m, 'click', e => {
      if (!e?.latLng) return;
      last = e.domEvent?.shiftKey
        ? null
        : { lat: e.latLng.lat(), lng: e.latLng.lng(), round: ggs.game?.roundKey() };
    });
  });
  const lastGuess = () => (last && last.round === ggs.game?.roundKey()
    ? { lat: last.lat, lng: last.lng }
    : null);

  // Walk up from the guess-map node through GeoGuessr's React fibers to a prop or hook
  // state holding the map.
  function mapFromFiber(el) {
    let node = el, key;
    while (node && !(key = Object.keys(node).find(k => k.startsWith('__reactFiber$')))) {
      node = node.parentElement;
    }
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
    return mapFromFiber(el)
      ?? created.find(m => el.contains(m.getDiv()) || m.getDiv().contains(el))
      ?? null;
  }

  // placing() is true during our own click, so map-click listeners (core/aid.js) can tell
  // it from the player's.
  let placingNow = false;
  const placing = () => placingNow;
  function placeGuess(lat, lng, { pan = true } = {}) {
    const map = findGuessMap();
    if (!map) {
      throw new Error(guessMapElement() ? 'Found the guess map but not its Google Map' : 'No guess map on screen');
    }
    const gm = window.google.maps;
    const latLng = new gm.LatLng(lat, lng);
    placingNow = true;
    try {
      gm.event.trigger(map, 'click', { latLng, domEvent: new MouseEvent('click'), stop() {} });
    } finally {
      placingNow = false;
    }
    if (pan) map.panTo(latLng);
  }

  // GeoGuessr takes a shift-click on the guess map as "remove the pin".
  function clearGuess() {
    const map = findGuessMap();
    if (!map) return;
    const gm = window.google.maps;
    placingNow = true;
    try {
      const domEvent = new MouseEvent('click', { shiftKey: true });
      gm.event.trigger(map, 'click', { latLng: map.getCenter(), domEvent, stop() {} });
    } finally {
      placingNow = false;
    }
  }

  function submitGuess() {
    const btn = guessButton();
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }

  // Space is GeoGuessr's own "guess" key. Used when the button can't be found.
  function pressSpace() {
    for (const type of ['keydown', 'keyup']) {
      const init = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true };
      document.body.dispatchEvent(new KeyboardEvent(type, init));
    }
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
      guessPin: first(GUESS_PIN_SELECTORS),
      buttonsNearMap: [...(guessMapElement()?.closest(GUESS_AREA)?.querySelectorAll('button') ?? [])]
        .map(b => `${b.dataset.qa ?? ''} "${b.textContent.trim().slice(0, 30)}"${b.disabled ? ' disabled' : ''}`)
        .join(' | ') || null,
      path: location.pathname,
    };
    const shown = v => (v ? (v instanceof Element ? v.className || v.tagName : String(v)) : v);
    console.table(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, shown(v)])));
    return info;
  }

  ggs.maps = {
    guessMapElement, findGuessMap, lastGuess, placeGuess, clearGuess, placing, submitGuess, pressSpace,
    guessButton, GUESS_AREA, GUESS_PIN_SELECTORS, hook, debug,
  };
})();

// ==================== src/core/lock.js ============================================
// Locks on the Street View panorama, shared by the scripts: ggs.lock.zoom / pan / move
// (owner, on). held(kind) says whether one holds. A lock holds while any owner asks for it,
// on every panorama, including ones made later. Each lock blocks the input (wheel, drag,
// keys, arrows) before the Maps API or GeoGuessr see it, and puts the view back if a change
// still gets through. setOptions is wrapped so GeoGuessr can't switch the controls back on.
(() => {
  const ggs = globalThis.__ggs;
  const KEYS = {
    zoom: ['+', '-', '=', '_', 'z', 'x', 'Z', 'X'],
    pan: ['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'],
    move: ['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S', 'Backspace'],
  };
  const OPTS = {
    zoom: { scrollwheel: false, zoomControl: false, disableDoubleClickZoom: true },
    move: { clickToGo: false, linksControl: false },
  };
  const owners = { zoom: new Set(), pan: new Set(), move: new Set() };
  const on = kind => owners[kind].size > 0;
  // panorama -> { el, wanted: options GeoGuessr last asked for, held: { kind: undo }, raw }
  const panos = new Map();

  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    const st = { el: args[0], wanted: { ...(args[1] ?? {}) }, held: {}, raw: p.setOptions.bind(p) };
    panos.set(p, st);
    // Remembers what GeoGuessr wants so a lock can be undone, and keeps the locked values on top.
    const setOptions = st.raw;
    p.setOptions = o => {
      Object.assign(st.wanted, o);
      const forced = {};
      for (const kind of Object.keys(OPTS)) if (on(kind)) Object.assign(forced, OPTS[kind]);
      const kept = Object.keys(o).filter(k => k in forced).map(k => [k, forced[k]]);
      return setOptions({ ...o, ...Object.fromEntries(kept) });
    };
    apply(p);
  });

  const ev = () => window.google?.maps?.event;
  const locks = {
    zoom(p, st) {
      // Held at the zoom the panorama opened with, or at ggs.lock.zoomTo's level
      // (as far as the API allows).
      const hold = () => {
        if (zoomAt != null) {
          // st.before is put back when zoomTo lets go.
          st.before ??= p.getZoom();
          p.setZoom(zoomAt);
        }
        return p.getZoom();
      };
      let zoom = hold();
      const a = ev().addListener(p, 'pano_changed', () => {
        zoom = hold();
      });
      const b = ev().addListener(p, 'zoom_changed', () => {
        if (p.getZoom() !== zoom) p.setZoom(zoom);
      });
      st.raw(OPTS.zoom);
      return () => {
        a.remove();
        b.remove();
        restore(p, st, OPTS.zoom);
      };
    },
    pan(p) {
      // Held at the view the panorama opened with, or level at ggs.lock.face's heading.
      // tiles.js's redraw nudge is put back like anything else.
      const opened = () => (facing == null ? p.getPov() : { heading: facing, pitch: 0 });
      let pov = opened();
      if (facing != null) p.setPov(pov);
      const a = ev().addListener(p, 'pano_changed', () => {
        pov = opened();
        if (facing != null) p.setPov(pov);
      });
      const b = ev().addListener(p, 'pov_changed', () => {
        const now = p.getPov();
        // Only heading and pitch go back. getPov() has no zoom here, and setPov rejects zoom: NaN.
        if (now.heading !== pov.heading || now.pitch !== pov.pitch) {
          p.setPov({ heading: pov.heading, pitch: pov.pitch });
        }
      });
      return () => {
        a.remove();
        b.remove();
      };
    },
    move(p, st) {
      st.raw(OPTS.move);
      return () => restore(p, st, OPTS.move);
    },
  };
  function restore(p, st, keys) {
    const back = {};
    for (const k of Object.keys(keys)) {
      back[k] = st.wanted[k] ?? (k === 'disableDoubleClickZoom' ? false : true);
    }
    st.raw(back);
  }
  function apply(p) {
    const st = panos.get(p);
    for (const kind of Object.keys(locks)) {
      if (on(kind) && !st.held[kind]) {
        try {
          st.held[kind] = locks[kind](p, st);
        } catch (err) {
          ggs.log(`lock ${kind} failed`, err);
        }
      } else if (!on(kind) && st.held[kind]) {
        try {
          st.held[kind]();
        } catch {}
        delete st.held[kind];
      }
    }
  }

  // ---- input, swallowed at the window in the capture phase ----
  // Registered at document_start, so these run before GeoGuessr's and the Maps API's handlers.
  // Our own sheets over the panorama (core/view.js, scratch's foil) keep their input.
  const inPano = t => !t?.closest?.('[data-ggs-view]')
    && [...panos.values()].some(st => st.el?.contains?.(t));
  const stop = e => {
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  window.addEventListener('keydown', e => {
    if (ggs.isTyping(e)) return;
    for (const kind of Object.keys(KEYS)) if (on(kind) && KEYS[kind].includes(e.key)) return stop(e);
  }, true);
  // Zoom: the wheel and pinches over the panorama.
  const stopZoom = e => {
    if (on('zoom') && inPano(e.target)) stop(e);
  };
  window.addEventListener('wheel', stopZoom, { capture: true, passive: false });
  window.addEventListener('dblclick', stopZoom, true);
  for (const t of ['gesturestart', 'gesturechange']) window.addEventListener(t, stopZoom, true);
  // Pan: dragging on the panorama. The press and release still go through, so the arrows
  // (and clicking to move) work when moving is allowed.
  let dragging = false;
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) {
    window.addEventListener(t, e => {
      if (inPano(e.target)) dragging = true;
    }, true);
  }
  for (const t of ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel']) {
    window.addEventListener(t, () => {
      dragging = false;
    }, true);
  }
  for (const t of ['pointermove', 'mousemove', 'touchmove']) {
    window.addEventListener(t, e => {
      if (dragging && (on('pan') || (t === 'touchmove' && on('zoom') && e.touches?.length > 1))) stop(e);
    }, { capture: true, passive: false });
  }

  const set = kind => (owner, want) => {
    if (want) owners[kind].add(owner);
    else owners[kind].delete(owner);
    for (const p of panos.keys()) apply(p);
  };
  // face(owner, heading | null): a pan lock that also turns every panorama to that heading.
  let facing = null;
  function face(owner, heading) {
    facing = heading;
    // Let go of each pan lock so it's held again below at the new heading.
    for (const st of panos.values()) {
      if (st.held.pan) {
        st.held.pan();
        delete st.held.pan;
      }
    }
    set('pan')(owner, heading != null);
    for (const p of panos.keys()) apply(p);
  }
  // zoomTo(owner, level | null): a zoom lock that also sets every panorama to that zoom.
  // null puts each back to the zoom it had, so No zoom doesn't keep it there.
  let zoomAt = null;
  function zoomTo(owner, level) {
    zoomAt = level;
    for (const [p, st] of panos) {
      // Let go so it's held again below at the new level.
      if (st.held.zoom) {
        st.held.zoom();
        delete st.held.zoom;
      }
      if (level == null && st.before != null) {
        try {
          p.setZoom(st.before);
        } catch {}
        delete st.before;
      }
    }
    set('zoom')(owner, level != null);
  }
  ggs.lock = { zoom: set('zoom'), pan: set('pan'), move: set('move'), face, zoomTo, held: on };
})();

// ==================== src/core/game.js ============================================
// Which game is open, on which map, and whether it's competitive. Reads geoguessr.com's
// own game API with the player's session. Nothing is sent anywhere else.
(() => {
  const ggs = globalThis.__ggs;

  const ROUTES = [
    [/\/game\/([^/?#]+)/, 'standard', t => `/api/v3/games/${t}`],
    [/\/challenge\/([^/?#]+)/, 'challenge', t => `/api/v3/challenges/${t}`],
    [/\/(?:team-)?duels\/([^/?#]+)/, 'duels', t => `https://game-server.geoguessr.com/api/duels/${t}`],
    [/\/battle-royale\/([^/?#]+)/, 'battle-royale',
      t => `https://game-server.geoguessr.com/api/battle-royale/${t}`],
  ];

  // Party games play under /party/... without the game id in the address. The id is taken
  // from the page's last request to /api/v4/parties/v2/<party>/game/<id> or the duels API.
  // This only reads the browser's own list of requests the page made.
  const DUEL_REQUEST = /geoguessr\.com\/api\/(?:v4\/parties\/v2\/[^/]+\/game|(?:team-)?duels)\/([^/?#]+)/;
  let partyDuel = null;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const m = e.name.match(DUEL_REQUEST);
        if (m) partyDuel = m[1];
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {}

  function context() {
    for (const [re, mode, api] of ROUTES) {
      const m = location.pathname.match(re);
      if (m) return { mode, token: m[1], api: api(m[1]) };
    }
    if (partyDuel && /^\/party(\/|$)/.test(location.pathname)) {
      const api = `https://game-server.geoguessr.com/api/duels/${partyDuel}`;
      return { mode: 'duels', token: partyDuel, api };
    }
    return null;
  }
  const fetchGame = async ctx => {
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  // Standard games have { map: "<id>", mapName }, challenges { map: { name } },
  // duels { options: { map } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') {
      return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    }
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }
  // token -> Promise<{ id, name } | null>
  const mapCache = new Map();
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!mapCache.has(ctx.token)) mapCache.set(ctx.token, fetchGame(ctx).then(pickMap));
    return mapCache.get(ctx.token);
  }

  // The current round is the game token plus how many times the guess map has appeared.
  // GeoGuessr's round counter markup keeps changing, so it isn't read. The map can blink out
  // for a moment mid-round, so it only counts as gone after GONE_MS.
  const GONE_MS = 1000;
  let entries = 0, entryToken = null, hadMap = false, goneSince = 0;
  setInterval(() => {
    const token = context()?.token ?? null;
    const hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) {
      entryToken = token;
      entries = 0;
      hadMap = false;
    }
    if (hasMap) {
      if (!hadMap) entries++;
      hadMap = true;
      goneSince = 0;
    } else if (hadMap) {
      goneSince ||= Date.now();
      if (Date.now() - goneSince > GONE_MS) hadMap = false;
    }
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // { n, total, lat, lng } in standard games and friendly party duels. total is null in duels,
  // which run until someone's out. Scripts may use the location for gameplay (draw-guess's
  // boost, radio's station pick, core/aid.js) but never show it before the guess. Duels only
  // answer once competitive() has confirmed a friendly game, so ranked duels never get one.
  // One lookup per round, shared by every script so they all agree. A failed lookup isn't
  // kept, so the next call tries again. whyNoRound() says why it failed.
  // roundKey -> Promise<round | null>
  const roundCache = new Map();
  let noRoundWhy = '';
  function round() {
    const key = roundKey();
    if (!roundCache.has(key)) {
      roundCache.set(key, lookupRound(key).then(r => {
        if (!r) roundCache.delete(key);
        return r;
      }, err => {
        roundCache.delete(key);
        return noRound(`game data: ${err.message}`);
      }));
    }
    return roundCache.get(key);
  }
  const whyNoRound = () => noRoundWhy;
  const noRound = why => {
    noRoundWhy = why;
    ggs.log(`no round location: ${why}`);
    return null;
  };

  const DUEL_TRIES = 8;
  // token -> { n, key }: the last duel round handed out, and for which roundKey.
  const duelRounds = new Map();

  async function lookupRound(key) {
    const ctx = context();
    if (!ctx) return noRound('not in a game');
    if (ctx.mode === 'standard') {
      const j = await fetchGame(ctx);
      const n = j?.round ?? j?.rounds?.length;
      const cur = j?.rounds?.[n - 1];
      if (!(n > 0)) return noRound('standard game data has no current round');
      return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
    }
    if (ctx.mode !== 'duels') return noRound(`${ctx.mode} games aren't supported`);
    if ((await competitive()).competitive) return noRound('competitive game');
    // The new round can reach the game data a few seconds after the guess map appears.
    // Until then currentRoundNumber still names the round just played. So a round that has
    // ended, or was already handed out for an earlier round, is waited on. After DUEL_TRIES
    // it's taken anyway, since the roundKey can move on without a new round (e.g. a reload).
    let last = null;
    for (let tries = 0; tries < DUEL_TRIES; tries++) {
      if (tries) await new Promise(r => setTimeout(r, 1000));
      if (roundKey() !== key) return noRound('moved on while waiting');
      const j = await fetchGame(ctx);
      const n = j?.currentRoundNumber;
      const cur = j?.rounds?.find(r => r.roundNumber === n);
      const p = cur?.panorama ?? cur;
      if (!(n > 0) || typeof p?.lat !== 'number') {
        last = `duel data has no location for round ${n}`;
        continue;
      }
      const ended = cur.endTime && Date.parse(cur.endTime) < Date.now();
      const seen = duelRounds.get(ctx.token);
      last = { n, total: null, lat: p.lat, lng: p.lng };
      if (ended || (seen && seen.n >= n && seen.key !== key)) {
        if (tries === DUEL_TRIES - 1) ggs.log(`duel round ${n} still looks old, using it anyway`);
        continue;
      }
      break;
    }
    if (typeof last === 'string' || !last) return noRound(last ?? 'no duel data');
    duelRounds.set(ctx.token, { n: last.n, key });
    return last;
  }
  const roundLocation = () => round()
    .then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  // ---- competitive guard ----
  // Party and ranked duels share /duels/<id> URLs, so two signals decide. One is the lobby you
  // came through (/party or /join vs matchmaking pages), the other is party/rated fields in the
  // game data. Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

  function noteLobby(path = location.pathname) {
    const lobby = PARTY_PAGES.test(path) ? 'party' : COMPETITIVE_PAGES.test(path) ? 'competitive' : null;
    if (!lobby) return;
    try {
      sessionStorage.setItem(LOBBY_KEY, lobby);
    } catch {}
  }

  // token -> Promise<{ competitive, why }>
  const guardCache = new Map();
  function competitive() {
    const path = location.pathname;
    if (COMPETITIVE_PAGES.test(path)) {
      return Promise.resolve({ competitive: true, why: 'matchmaking page' });
    }
    const ctx = context();
    if (!ctx || ctx.mode === 'standard' || ctx.mode === 'challenge') {
      return Promise.resolve({ competitive: false, why: ctx ? `${ctx.mode} game` : 'not in a game' });
    }
    if (!guardCache.has(ctx.token)) guardCache.set(ctx.token, (async () => {
      let lobby = null;
      try {
        lobby = sessionStorage.getItem(LOBBY_KEY);
      } catch {}
      const j = await fetchGame(ctx).catch(() => null);
      const o = j?.options ?? {};
      const types = [j?.gameContext?.type, o.gameContext?.type];
      const rated = [j?.isRated, o.isRated, j?.competitive, o.competitive, j?.isRanked, o.isRanked]
        .some(v => v === true)
        || types.some(t => /rank|competitive|matchmak/i.test(t ?? ''));
      const party = [j?.partyId, o.partyId, j?.party, j?.lobbyId, o.lobbyId, j?.gameContext?.partyId]
        .some(Boolean)
        || types.some(t => /party|private|friend/i.test(t ?? ''));
      const why = `${ctx.mode}: lobby=${lobby ?? '?'} party-field=${party} rated-field=${rated}`
        + (j ? '' : ' (no game data)');
      if (rated) return { competitive: true, why };
      return { competitive: !(party || lobby === 'party'), why };
    })());
    return guardCache.get(ctx.token);
  }

  ggs.game = { context, roundKey, whyNoRound, mapInfo, roundLocation, competitive, noteLobby };
})();

// ==================== src/core/ui.js ==============================================
// Floating, draggable panel in a shadow root, so GeoGuessr's CSS can't reach it.
// Its position is remembered per panel id.
(() => {
  const ggs = globalThis.__ggs;

  const BASE_CSS = `
    :host { all: initial; position: fixed; left: 16px; top: 120px; z-index: 2147483000; }
    :host([hidden]) { display: none !important; }
    .panel { width: 260px; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
             background: rgba(20, 16, 48, .9); border: 1px solid rgba(255, 255, 255, .14);
             border-radius: 12px; box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6);
             backdrop-filter: blur(8px); overflow: hidden; }
    .head { padding: 7px 12px; font-size: 11px; font-weight: 700; letter-spacing: .08em;
            text-transform: uppercase; color: rgba(255, 255, 255, .6); background: rgba(255, 255, 255, .05);
            cursor: grab; user-select: none; }
    .head:active { cursor: grabbing; }
    .body { padding: 10px 12px 12px; }
  `;

  // The last-used panel sits on top.
  let zTop = 2147483000;

  function panel({ id, title, html = '', css = '', pos = { x: 16, y: 120 } }) {
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', id);
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
      // A button in the header (close) gets the click, not a drag.
      if (e.target.closest('button')) return;
      const r = host.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
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
      // Pulls the panel back on screen, e.g. after it grew.
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

// ==================== src/core/tiles.js ===========================================
// The one WebGL hook. The Maps API uploads every Street View tile from an <img> with
// texImage2D or texSubImage2D, and this wraps both. It also wraps generateMipmap, to know
// which textures need it again after a re-upload, and deleteTexture, to know which are gone.
//
// Each tile upload gets a record ({ gl, name, args, url, key, img, tex, ... }). The registered
// filters (redraw, lying-signs, gradient) then get a turn, in order, to swap the source for a
// canvas. A filter that needs time can keep the record and push a new source into the same
// texture later with upload(rec, source). Other uploads pass straight through.
// The API never re-uploads a tile already on screen. So replay() loads every remembered tile
// again (from the browser cache) and runs it through the same path. That's how switching a
// script on or off mid-round takes effect.
//
// Chaos mode makes that instant by preparing a little before it switches something.
// preload() fetches and decodes every remembered tile, so the next replay doesn't wait.
// prerender(fn) runs the panorama on screen through fn ahead of time, one tile per idle
// slice, for a filter to hand out during its first replay.
(() => {
  const ggs = globalThis.__ggs;
  // Records kept. Zoom 4 is 512 tiles per panorama.
  const MAX = 1200;
  const records = [];
  const mipTex = new WeakSet();
  // [{ fn, order }], lowest order first.
  const filters = [];
  // prototype -> the unwrapped { texImage2D, texSubImage2D }.
  const orig = new Map();

  // filter((rec, source) => source, order). source is the <img> or an earlier filter's result.
  function filter(fn, order = 0) {
    filters.push({ fn, order });
    filters.sort((a, b) => a.order - b.order);
  }
  // A record is live while its texture exists and nothing newer has gone into the same slot.
  // A record replaced by a later upload is marked stale, so a filter finishing late can't
  // write an old tile over the one now on screen. Deleted textures are noted as the game
  // deletes them. gl.isTexture would wait on the GPU process, hundreds of times a replay.
  const deleted = new WeakSet();
  const live = rec => !rec.stale && !deleted.has(rec.tex) && !rec.gl.isContextLost();

  function makeRecord(gl, name, args, img) {
    const url = img.currentSrc || img.src;
    if (!ggs.TILE.test(url)) return null;
    const [target, param] = ggs.glBinding(gl, args[0]);
    const tex = gl.getParameter(param);
    if (!tex) return null;
    return {
      gl, name, args, url, img, tex, target, key: ggs.tileKey(url),
      crossOrigin: img.crossOrigin, referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
      premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
  }
  function remember(rec) {
    // One record per (texture, face, level, offset). A re-upload replaces the older one.
    const same = r => r.gl === rec.gl && r.tex === rec.tex && r.name === rec.name
      && r.args[0] === rec.args[0] && r.args[1] === rec.args[1]
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
      try {
        source = f.fn(rec, source) ?? source;
      } catch (err) {
        ggs.log('tiles: filter failed', err);
      }
    }
    return source;
  }

  // Later upload of `source` into the texture a record went to, with the same arguments.
  function upload(rec, source) {
    const { gl } = rec;
    if (!live(rec)) return false;
    const [, param] = ggs.glBinding(gl, rec.target);
    const prevTex = gl.getParameter(param);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    const prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.bindTexture(rec.target, rec.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, rec.flip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, rec.premul);
    try {
      const proto = gl instanceof WebGL2RenderingContext
        ? WebGL2RenderingContext.prototype
        : WebGLRenderingContext.prototype;
      orig.get(proto)[rec.name].call(gl, ...rec.args, source);
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
        if (!orig.has(P)) orig.set(P, {});
        orig.get(P)[name] ??= fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try {
              const rec = makeRecord(this, name, a.slice(0, i), a[i]);
              if (rec) a[i] = handle(rec);
            } catch (err) {
              ggs.log('tiles: hook failed', err);
            }
          }
          return fn.apply(this, a);
        };
      }
      const del = P.deleteTexture;
      P.deleteTexture = function (tex) {
        if (tex) deleted.add(tex);
        return del.call(this, tex);
      };
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try {
          mipTex.add(this.getParameter(ggs.glBinding(this, target)[1]));
        } catch {}
        return gen.call(this, target);
      };
    }
  }
  try {
    install();
  } catch (err) {
    ggs.log('tiles: hook failed', err);
  }

  // The renderer only redraws on a view change, so nudge it after an upload. It gets a heading
  // change held for a frame and a mouse move over the canvas, since either alone can be swallowed.
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
    for (const [p, pov] of nudged) {
      try {
        p.setPov(pov);
      } catch {}
    }
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      // The guess map and our own canvases are small or hidden.
      if (r.width < 200 || r.height < 200) continue;
      const init = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      c.dispatchEvent(new MouseEvent('mousemove', init));
      c.dispatchEvent(new PointerEvent('pointermove', init));
    }
  }

  // A fresh, decoded copy of a remembered tile from the browser cache.
  // Kept until the next replay uses it.
  // url -> Promise<img | null>
  const loaded = new Map();
  function load(r) {
    if (!loaded.has(r.url)) {
      const img = new Image();
      if (r.crossOrigin != null) img.crossOrigin = r.crossOrigin;
      if (r.referrerPolicy) img.referrerPolicy = r.referrerPolicy;
      img.src = r.url;
      loaded.set(r.url, img.decode().then(() => img, () => null));
      if (loaded.size > MAX) loaded.delete(loaded.keys().next().value);
    }
    return loaded.get(r.url);
  }
  function preload() {
    records.filter(live).forEach(load);
  }

  // The live tiles of the newest panorama, the ones on screen first (closest zoom, newest).
  function onScreen() {
    const all = records.filter(r => r.key && live(r));
    const pano = all.at(-1)?.key.pano;
    return all.filter(r => r.key.pano === pano).reverse().sort((a, b) => b.key.z - a.key.z);
  }
  // The game's spare time between frames, or short timer slices without idle callbacks.
  const idle = () => new Promise(res => (window.requestIdleCallback
    ? requestIdleCallback(res, { timeout: 100 })
    : setTimeout(() => res({ timeRemaining: () => 8 }))));
  // prerender(fn(img, key) -> source) -> { ready(), get(url), cancel() }
  function prerender(fn) {
    const out = new Map();
    let stopped = false, done = false;
    (async () => {
      const list = onScreen();
      // Fetched together, drawn one by one.
      const imgs = list.map(load);
      let slice = await idle();
      for (let i = 0; i < list.length; i++) {
        const img = await imgs[i];
        if (stopped) return;
        if (img) {
          try {
            out.set(list[i].url, fn(img, list[i].key));
          } catch (err) {
            ggs.log('tiles: prerender failed', err);
          }
        }
        // Keeps the game smooth.
        if (slice.timeRemaining() < 3) slice = await idle();
      }
      done = true;
    })();
    return {
      ready: () => done,
      get: url => out.get(url),
      cancel() {
        stopped = true;
        out.clear();
      },
    };
  }

  // Calls made in the same tick are merged into one replay. Tiles already loaded go up first,
  // then the rest as they arrive, newest first (the likeliest to be on screen).
  // Each frame does at most SLICE ms of work or PIXELS of texture. The GPU process does the
  // uploads after the calls return, so a time limit alone lets too many through. This way a
  // replay of hundreds of tiles never holds up the game's frames or a click. A repaint now and
  // then shows the ones done. A newer replay stops the running one. Records it hadn't reached
  // are still live, so the new one picks them up.
  const SLICE = 8, PIXELS = 8 * 512 * 512;
  const nextFrame = () => new Promise(r => (document.hidden
    ? setTimeout(r)
    : requestAnimationFrame(() => setTimeout(r))));
  let scheduled = null, current = null, painting = null;
  const showSoFar = () => {
    painting ??= repaint().finally(() => {
      painting = null;
    });
  };
  function replay() {
    if (scheduled) return scheduled;
    scheduled = new Promise(r => setTimeout(r, 0)).then(async () => {
      scheduled = null;
      if (current) current.stopped = true;
      const run = current = { stopped: false };
      const old = records.filter(live).reverse();
      const ready = new Set(loaded.keys());
      const first = old.filter(r => ready.has(r.url));
      const rest = old.filter(r => !ready.has(r.url));
      // Fetched together, put up one by one.
      rest.forEach(load);
      let n = 0, spent = 0, pixels = 0, shown = performance.now();
      for (const [i, r] of [...first, ...rest].entries()) {
        // The loaded ones are up. The rest may take a while.
        if (i === first.length && n) showSoFar();
        const img = await load(r);
        if (run.stopped) return n;
        // Gone, or the game put something newer there.
        if (!img || !live(r)) continue;
        const t = performance.now();
        try {
          // handle() calls remember(), which marks r stale.
          const rec = { ...r, img, stale: false };
          const source = handle(rec);
          if (upload(rec, source)) {
            n++;
            // Tiny tiles cost something too.
            pixels += Math.max(PIXELS / 64, (source.width || 512) * (source.height || 512));
          }
        } catch (err) {
          ggs.log('tiles: replay failed', err);
        }
        spent += performance.now() - t;
        if (spent < SLICE && pixels < PIXELS) continue;
        if (performance.now() - shown > 150) {
          shown = performance.now();
          showSoFar();
        }
        await nextFrame();
        spent = pixels = 0;
        if (run.stopped) return n;
      }
      current = null;
      loaded.clear();
      if (n) ggs.debug(`tiles: replayed ${n} of ${old.length}`);
      await painting;
      await repaint();
      return n;
    });
    return scheduled;
  }

  ggs.tiles = { filter, upload, live, replay, repaint, preload, prerender, count: () => records.length };
})();

// ==================== src/core/redraw.js ==========================================
// Redrawn world (Minecraft world). Each panorama is redrawn once by server/minecraft.php
// and wrapped back over the Street View sphere. ggs.redraw.script(id, style, label) makes
// the { start, prepare } for the script.
//
// Street View tiles arrive through ggs.tiles (core/tiles.js). The first tile of a new
// panorama starts one generation. The panorama id and size go to SERVER, which fetches the
// tiles from Google, stitches them and calls the image API with the key it holds.
// Nothing but that id, the size, a random per-install client id and the optional code
// leaves the page. Tiles go up blue until the picture is back. Then every tile is swapped
// for the matching crop, so looking around and zooming never generate again.
// Generation waits until the panorama has stayed still for a moment. Walking through several
// positions only redraws the one you stop at, and the others get their real tiles back.
// prepare(cfg) (Chaos mode) quietly generates the panorama on screen before the script is
// switched on, so its tiles can go straight up when it is.
(() => {
  const ggs = globalThis.__ggs;
  // Holds the prompts, models and daily limits.
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php';

  function clientId() {
    let id = ggs.store.get('ggs-client');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      ggs.store.set('ggs-client', id);
    }
    return id;
  }
  const code = () => active?.cfg.code || ggs.settings?.minecraft?.code || '';
  async function server(fields, post = false, signal) {
    const body = new URLSearchParams({ ...fields, client: clientId(), code: code() });
    const r = post
      ? await fetch(SERVER, { method: 'POST', body, signal })
      : await fetch(`${SERVER}?caps=1&${body}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `server HTTP ${r.status}`);
    return j;
  }

  // Typical seconds per generation, from the last rounds. Drives the loading bar.
  const ETA_DEFAULT = { normal: 15, hq: 25 };
  const eta = ggs.store.get('ggs-minecraft-eta', {});
  const etaKey = (style, mode) => (style === 'minecraft' ? mode : `${style}/${mode}`);
  const etaOf = (style, mode) => eta[etaKey(style, mode)] ?? ETA_DEFAULT[mode];
  const keyOf = id => `${id}/${active.style}/${modeOf(active.cfg)}`;

  // panoId -> Promise<{ worldWidth, tileWidth, zmax }>. metaSync holds the resolved values.
  const meta = new Map(), metaSync = new Map();
  function panoMeta(id) {
    if (!meta.has(id)) {
      meta.set(id, new window.google.maps.StreetViewService().getPanorama({ pano: id })
        .then(({ data }) => {
          const worldWidth = data.tiles.worldSize.width;
          const tileWidth = data.tiles.tileSize.width;
          const m = { worldWidth, tileWidth, zmax: Math.ceil(Math.log2(worldWidth / tileWidth)) };
          metaSync.set(id, m);
          return m;
        }));
    }
    return meta.get(id);
  }
  const widthAt = (m, zoom) => Math.ceil(m.worldWidth / 2 ** (m.zmax - zoom));

  // `${panoId}/${style}/${mode}` -> { image, pending: [uploads waiting], error, ctrl, mode, t0 }
  const gens = new Map();
  // active is { id, style, label, cfg } while a script is on.
  let active = null, overlay = null;
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  function shownPano() {
    for (const p of panos) {
      try {
        const id = p.getPano();
        if (id) return id;
      } catch {}
    }
    return null;
  }

  // Tiles of a panorama with no generation yet wait here, blue on screen, until the view has
  // stayed on one panorama for SETTLE ms. Then that panorama is generated and the others get
  // their real tiles back.
  const SETTLE = 800;
  // panoId -> [{ rec, img, tw, th }]
  const waitingPanos = new Map();
  let settleTimer = null, latestPano = null;
  function waitFor(id, entry) {
    if (!waitingPanos.has(id)) waitingPanos.set(id, []);
    // The bar shows from the first blue tile.
    progressStart(etaOf(active.style, modeOf(active.cfg)), keyOf(id));
    waitingPanos.get(id).push(entry);
    if (id !== latestPano || !settleTimer) {
      latestPano = id;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settled, SETTLE);
    }
  }
  function settled() {
    settleTimer = null;
    const id = shownPano() ?? latestPano;
    // Cancel generations still in flight for panoramas you've moved away from.
    for (const [key, g] of gens) {
      if (g.ctrl && !g.image && !g.error && !key.startsWith(`${id}/`)) cancel(key, g);
    }
    for (const [pid, entries] of [...waitingPanos]) {
      waitingPanos.delete(pid);
      if (pid === id && active) {
        const g = generation(pid);
        g.pending.push(...entries);
        if (g.image || g.error) flush(g);
      } else {
        for (const { rec, img } of entries) {
          try {
            ggs.tiles.upload(rec, img);
          } catch {}
        }
        // Passed through, so never generated.
        if (active && owner === keyOf(pid)) progressHide();
      }
    }
  }

  // ---- daily limits ----
  // The server counts per client id, and its log ({ normal: [ms], hq: [ms] }, rolling 24 h)
  // is the truth. A copy is kept here so a round isn't started once today's limit is used up.
  // Generations in flight are added on top until the server's answer, which includes them,
  // replaces the copy. So nothing is counted twice.
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
  let serverLog = {}, log = {}, caps = { normal: 100, hq: 10 }, limitShownFor = null;
  // t0 of generations the server hasn't answered yet.
  const inFlight = { normal: [], hq: [] };
  function saveLog(fromServer) {
    if (fromServer) serverLog = Q.tidy(fromServer);
    log = Q.tidy(serverLog, inFlight);
    ggs.store.set(QKEY, serverLog);
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    if (!active) return;
    const normal = part('rounds', Q.left(log, 'normal', caps.normal));
    const hq = part('high quality', Q.left(log, 'hq', caps.hq));
    ggs.status(active.id, `Today: ${normal} · ${hq}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    serverLog = ggs.store.get(QKEY, {});
    saveLog();
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      if (active) ggs.status(active.id, 'Server not reachable');
      ggs.debug('redraw: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  const allowed = mode => Q.left(log, mode, caps[mode]).left > 0;
  const stats = { uploads: 0, tiles: 0, swapped: 0 };
  ggs.redraw = {
    debug: () => ({
      active: active && { id: active.id, style: active.style },
      tiles: ggs.tiles.count(),
      ...stats,
      gens: [...gens].map(([id, g]) => ({
        id, image: !!g.image, pending: g.pending.length, error: g.error?.message ?? null,
      })),
    }),
  };

  // Aborts the request. The server may still finish and count it if it had already reached
  // the image API. The tiles get their real pictures back, and coming back to that panorama
  // generates it again.
  function cancel(key, g) {
    gens.delete(key);
    g.ctrl.abort();
    g.error = new Error('cancelled');
    inFlight[g.mode] = inFlight[g.mode].filter(t => t !== g.t0);
    saveLog();
    progressDone(false, key);
    flush(g).then(() => ggs.tiles.repaint(key.split('/')[0]));
    ggs.debug(`${active?.style}: cancelled ${key}`);
  }
  function generation(id, style = active.style, mode = modeOf(active.cfg)) {
    const key = `${id}/${style}/${mode}`;
    if (gens.has(key)) return gens.get(key);
    const g = { image: null, pending: [], error: null, ctrl: new AbortController(), mode, t0: Date.now() };
    gens.set(key, g);
    if (gens.size > 20) {
      const k = gens.keys().next().value;
      gens.get(k).image?.close?.();
      gens.delete(k);
    }
    const t0 = g.t0;
    // Counted from the start. The server's log takes over once it answers.
    inFlight[mode].push(t0);
    saveLog();
    (async () => {
      const ek = etaKey(style, mode);
      progressStart(etaOf(style, mode), key, t0);
      const m = await panoMeta(id);
      const fields = { pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode, style };
      const r = await server(fields, true, g.ctrl.signal);
      // Cancelled while the server was working.
      if (g.error) return;
      inFlight[mode] = inFlight[mode].filter(t => t !== t0);
      saveLog(r.log);
      const img = new Image();
      img.src = r.image;
      await img.decode();
      g.image = await createImageBitmap(img);
      ggs.debug(`${style}: generated ${id} (${mode}) in ${(r.ms / 1000).toFixed(1)} s`);
      await flush(g);
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const took = (Date.now() - t0) / 1000;
      eta[ek] = Math.round(took * 0.7 + (eta[ek] ?? took) * 0.3);
      ggs.store.set('ggs-minecraft-eta', eta);
      progressDone(false, key);
    })().catch(err => {
      // Cancelled, and already tidied up.
      if (g.error) return;
      g.error = err;
      inFlight[mode] = inFlight[mode].filter(t => t !== t0);
      saveLog();
      ggs.log(`${style}: generation failed`, err);
      progressDone(true, key);
      // Puts the real tiles back.
      flush(g).then(() => ggs.tiles.repaint(id));
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom.
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom), H = Math.ceil(W / 2), img = g.image;
    const sx = (x * tw / W) * img.width, sy = (y * th / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width);
    const sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) {
      const dw = tw * sw / ((tw / W) * img.width), dh = th * sh / ((th / H) * img.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    }
    return c;
  }

  // ---- tile filter: what goes into WebGL for each tile ----
  // One filter for every style, at order 0. lying-signs runs after it, sees a canvas and
  // leaves it alone.
  ggs.tiles.filter((rec, source) => {
    stats.uploads++;
    if (!active || !rec.key || !(source instanceof HTMLImageElement)) return source;
    const k = rec.key, img = source;
    stats.tiles++;
    const id = k.pano, mode = modeOf(active.cfg), gkey = `${id}/${active.style}/${mode}`;
    if (!gens.has(gkey) && !allowed(mode)) {
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, mode, caps[mode]);
        const what = active.cfg.hq ? 'High quality' : active.label;
        notice(`${what} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const g = gens.get(gkey);
    if (!g) {
      waitFor(id, { rec, img, tw, th });
      return blank(tw, th);
    }
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, k.x, k.y, k.z, tw, th);
    if (g.error) return img;
    g.pending.push({ rec, img, tw, th });
    return blank(tw, th);
  }, 0);

  // The picture is in, or failed. Pushes the crops, or the real tiles, into the textures.
  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = recs[0].rec.key.pano;
    const m = g.image ? await panoMeta(id).catch(() => null) : null;
    for (const { rec, img, tw, th } of recs) {
      try {
        const k = rec.key;
        if (ggs.tiles.upload(rec, m ? crop(g, m, k.x, k.y, k.z, tw, th) : img)) stats.swapped++;
      } catch (err) {
        ggs.log('redraw: re-upload failed', err);
      }
    }
  }

  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      const ctx = blankTile.getContext('2d');
      // A calm blue while the picture is on its way. Black flickered.
      ctx.fillStyle = '#35507f';
      ctx.fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  // ---- loading bar: eases towards 90% over the last rounds' time, fills when tiles are swapped ----
  const CSS = `
    :host { all: initial; position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
            z-index: 2147483000; pointer-events: none; opacity: 0; transition: opacity .25s; }
    :host([data-on]) { opacity: 1; }
    .box { width: 300px; padding: 16px 20px; border-radius: 16px; background: rgba(20, 16, 48, .85);
           backdrop-filter: blur(8px); box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6);
           font: 700 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
           text-align: center; letter-spacing: .02em; }
    .bar[hidden] { display: none; }
    .bar { height: 10px; margin-top: 12px; border-radius: 5px; background: rgba(255, 255, 255, .12);
           overflow: hidden; }
    .fill { height: 100%; width: 0; border-radius: 5px; background: #fecd19;
            transition: width .1s linear, background .3s; }
  `;
  // The bar belongs to the latest generation started (`owner`). An older one finishing or
  // failing later leaves it alone. hideTimer is the fade-out after one finished, cancelled
  // when the next one starts.
  let progressTimer = null, owner = null, hideTimer = null;
  function progressStart(seconds, key, t0 = Date.now()) {
    // Already showing this one.
    if (!overlay || key === owner) return;
    owner = key;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    const fill = overlay.fill;
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
  function progressDone(failed, key) {
    if (!overlay || (key && key !== owner)) return;
    owner = null;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) {
      overlay.fill.style.background = '#e03131';
      overlay.text.textContent = 'Could not redraw this round';
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (overlay) delete overlay.host.dataset.on;
    }, failed ? 4000 : 400);
  }
  function progressHide() {
    owner = null;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    if (overlay) delete overlay.host.dataset.on;
  }
  function notice(message) {
    if (!overlay) return;
    owner = null;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    overlay.text.textContent = message;
    overlay.bar.hidden = true;
    overlay.host.dataset.on = '';
    hideTimer = setTimeout(() => {
      if (!overlay) return;
      delete overlay.host.dataset.on;
      hideTimer = setTimeout(() => {
        if (overlay) overlay.bar.hidden = false;
      }, 300);
    }, 4000);
  }

  function teardown() {
    active = null;
    clearTimeout(settleTimer);
    settleTimer = null;
    waitingPanos.clear();
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    owner = null;
    overlay?.host.remove();
    overlay = null;
    ggs.tiles.replay();
  }
  // Starts a generation ahead for the panorama on screen. Returns { ready(), failed(), cancel() },
  // or null when there's nothing to start (no panorama, today's limit used).
  function prepare(style, cfg) {
    const id = shownPano(), mode = modeOf(cfg), key = `${id}/${style}/${mode}`;
    if (active || !id || !allowed(mode)) return null;
    const g = generation(id, style, mode);
    return {
      // Moved on: it starts the usual way.
      ready: () => !!(g.image || g.error) || shownPano() !== id,
      // e.g. the server's limit.
      failed: () => !!g.error,
      cancel: () => {
        if (!active && !g.image && !g.error && gens.get(key) === g) cancel(key, g);
      },
    };
  }
  function start(id, style, label, cfg) {
    // Only one redraw script at a time.
    if (active) teardown();
    active = { id, style, label, cfg };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div>`
      + '<div class="bar"><div class="fill"></div></div></div>';
    document.body.append(host);
    overlay = {
      host,
      text: root.querySelector('.text'),
      bar: root.querySelector('.bar'),
      fill: root.querySelector('.fill'),
    };
    // A picture made ahead (prepare) goes up at once. One still on its way (made ahead, or
    // left running by switching off and on) gets the bar from when it started. The tiles go
    // through at once on the local copy of today's limits. The server checks them anyway,
    // and its answer comes in behind.
    const key = keyOf(shownPano()), g = gens.get(key);
    if (g && !g.image && !g.error) progressStart(etaOf(style, g.mode), key, g.t0);
    loadQuota();
    ggs.tiles.replay();
    return {
      stop() {
        if (active?.id === id) teardown();
      },
      update(c) {
        if (active?.id !== id) return;
        const codeChanged = c.code !== active.cfg.code;
        const hqChanged = !!c.hq !== !!active.cfg.hq;
        active.cfg = c;
        if (codeChanged) loadQuota();
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }
  Object.assign(ggs.redraw, {
    script: (id, style, label) => ({
      start: cfg => start(id, style, label, cfg),
      prepare: cfg => prepare(style, cfg),
    }),
  });
})();

// ==================== src/core/board.js ===========================================
// Drawing boards over GeoGuessr's guess map (draw-guess, flag-guess). An app page in an
// iframe sits where the guess map was. The real map stays in the page, invisible, and the
// guess goes through it. This handles the hidden map, the frame and its messages, the
// hover-to-expand size, a blank board each round, placing the pin and pressing Guess.
//   ggs.board({ id, app, size(roomW, roomH, boardH) -> { w, h }, guessDelay, answer,
//               onMessage(d), onTick(inRound) })
//     -> { post(msg), place(guess) -> ok, press(guess, waitMs), status(text), created, stop() }
// Messages up from the app:
//   'ready', 'height' { h }
//   'guess' { guess: { lat, lng } } when its Guess is pressed. The pin goes down at once.
//   'done' once its animation is over. GeoGuessr's Guess is pressed guessDelay ms later.
//   anything else goes to onMessage.
// Messages down to the app:
//   'reset' each round
//   'answer' { lat, lng } each round when `answer` is set (lat null until it's known)
//   plus whatever the script posts.
(() => {
  const ggs = globalThis.__ggs;

  // The real map and its Guess button stay in the page, only invisible.
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
    iframe { display: block; width: 100%; height: 100%; border: 0; border-radius: 12px;
             background: #f4efe6; box-shadow: 0 16px 40px -12px rgba(0, 0, 0, .6); }
    .status { position: absolute; left: 0; bottom: 100%; margin-bottom: 6px; padding: 4px 10px;
              border-radius: 999px; font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
              color: #fff; background: #c92a2a; }
    .status:empty { display: none; }`;
  const MARGIN = 16;
  // Small until hovered, like GeoGuessr's map.
  const COLLAPSED_W = 320, COLLAPSE_DELAY = 600;
  const RETRY_MS = 500, TRIES = 10;
  // The guess map gone this long means a result screen, so the board clears.
  const AWAY_MS = 1500;

  ggs.board = ({ id, app, size, guessDelay, answer, onMessage, onTick }) => {
    const origin = new URL(ggs.extBase).origin;
    let host = null, frame, statusEl, ready = false, queued = [];
    let expanded = false, collapseTimer = 0, pressTimer = 0, boardH = 0;
    let wasInRound = false, awaySince = 0, placed = false, answerRound, lastGuess = null;
    // Where the board sits. Measured once per round and window size.
    let spot = null, spotKey = '';

    const hideMap = document.createElement('style');
    hideMap.textContent = HIDE_MAP_CSS;
    (document.head ?? document.documentElement).append(hideMap);

    const post = msg => (ready ? frame.contentWindow.postMessage(msg, origin) : queued.push(msg));
    const status = text => {
      if (statusEl) statusEl.textContent = text ?? '';
    };

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', id);
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="status"></div><iframe></iframe>`;
      frame = root.querySelector('iframe');
      statusEl = root.querySelector('.status');
      frame.src = ggs.extBase + app;
      host.addEventListener('mouseenter', () => {
        clearTimeout(collapseTimer);
        setExpanded(true);
      });
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
      const key = `${innerWidth}x${innerHeight}|${ggs.game.roundKey()}`;
      const el = (!spot || key !== spotKey) && (ggs.maps.guessButton() ?? ggs.maps.guessMapElement());
      // With no map on screen (between rounds) the last spot stays.
      if (el) {
        const anchor = el.getBoundingClientRect();
        const right = Math.max(MARGIN, innerWidth - anchor.right);
        const bottom = Math.max(MARGIN, innerHeight - anchor.bottom);
        spot = { right, bottom, roomW: innerWidth - right - MARGIN, roomH: innerHeight - bottom - MARGIN };
        spotKey = key;
      }
      if (!spot) return;
      const { w, h } = size(spot.roomW, spot.roomH, boardH);
      const scale = expanded ? 1 : Math.min(1, COLLAPSED_W / w);
      Object.assign(host.style, {
        right: `${spot.right}px`,
        bottom: `${spot.bottom}px`,
        width: `${w}px`,
        height: `${h}px`,
        transform: `scale(${scale})`,
      });
    }

    const onFrameMessage = e => {
      if (!frame || e.origin !== origin || e.source !== frame.contentWindow) return;
      const d = e.data ?? {};
      if (d.ggs === 'ready') {
        ready = true;
        queued.splice(0).forEach(post);
      } else if (d.ggs === 'height') {
        boardH = d.h;
        if (host.style.width) layout();
      } else if (d.ggs === 'guess') {
        lastGuess = place(d.guess) ? d.guess : null;
      } else if (d.ggs === 'done') {
        if (lastGuess) press(lastGuess, guessDelay);
        lastGuess = null;
      } else {
        onMessage?.(d);
      }
    };
    window.addEventListener('message', onFrameMessage);

    // A guess is a click on the invisible map (maps.js), so GeoGuessr places its own pin.
    function place(guess) {
      try {
        ggs.maps.placeGuess(guess.lat, guess.lng);
      } catch (err) {
        status(err.message);
        ggs.maps.debug();
        return false;
      }
      placed = true;
      status('');
      return true;
    }

    // GeoGuessr's Guess button can take a moment to appear or enable after the pin goes down.
    // So keep trying for a few seconds, and put the pin down again once in case it was missed.
    // With no button on the page at all (some layouts only show it on hover), press Space.
    // A new round clears pressTimer (tick below), so this never presses into the next round.
    function press(guess, wait, n = 1) {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        // Already guessed or moved on.
        if (!ggs.maps.guessMapElement()) return;
        if (ggs.maps.submitGuess()) return;
        if (n === 2) {
          try {
            ggs.maps.placeGuess(guess.lat, guess.lng, { pan: false });
          } catch {}
        }
        if (n >= 3 && !ggs.maps.guessButton()) ggs.maps.pressSpace();
        if (n < TRIES) return press(guess, RETRY_MS, n + 1);
        const why = ggs.maps.guessButton() ? 'button stayed disabled' : 'no Guess button found';
        status(`Guess placed, but couldn't press Guess (${why})`);
        ggs.maps.debug();
      }, wait);
    }

    // The round's real location, for boards that show it once the guess is in.
    function sendAnswer(round) {
      if (round === answerRound) return;
      answerRound = round;
      post({ ggs: 'answer', lat: null });
      ggs.game.roundLocation()
        .then(loc => loc && ggs.game.roundKey() === round
          && post({ ggs: 'answer', lat: loc.lat, lng: loc.lng }))
        .catch(() => {});
    }

    // A new round gets a blank board. The guess map can blink out for a moment mid-round,
    // so the board only clears after a guess or once the map was gone for a while.
    const tick = setInterval(() => {
      const inRound = !!ggs.maps.guessMapElement();
      if (inRound && !host) create();
      if (host) {
        if (!inRound && wasInRound) awaySince = Date.now();
        if (inRound && !wasInRound && (placed || Date.now() - awaySince > AWAY_MS)) {
          post({ ggs: 'reset' });
          clearTimeout(pressTimer);
          placed = false;
          status('');
        }
        wasInRound = inRound;
        host.hidden = !inRound;
        if (inRound) layout();
        if (inRound && answer) sendAnswer(ggs.game.roundKey());
      }
      onTick?.(inRound);
    }, 500);

    return {
      post, place, press, status,
      get created() { return !!host; },
      stop() {
        clearInterval(tick);
        clearTimeout(collapseTimer);
        clearTimeout(pressTimer);
        window.removeEventListener('message', onFrameMessage);
        host?.remove();
        hideMap.remove();
      },
    };
  };
})();

// ==================== src/core/aid.js =============================================
// Map aids: scripts that work on the guess map during a round. One loop per script tracks
// the guess map, the round and its real location, and calls the script's hooks.
//   ggs.aid(id, hooks) -> { start(cfg) } for ggs.scripts. All hooks are optional.
//     shapes(ctx) -> [{ type: 'Polygon' | 'Polyline' | 'Circle' | 'Marker', ...options }], or a
//       Promise of that. Drawn once the location is known, redrawn when the round or settings change.
//     round(ctx): a new round started. Shapes and ctx.add() overlays are already cleared.
//     attach(ctx) -> cleanup?: a guess map was found. GeoGuessr can make a new one mid-game.
//     tick(ctx): every 300 ms while there's a guess map.
//     click(latLng, ctx): the player clicked the guess map (not our own placeGuess).
//     beforeGuess(ctx) -> { lat, lng } | false | null: Guess was pressed. A point moves the guess
//       there first, false stops it. ctx.loc may still be null.
//     usesLocation: false when the script doesn't need the round's location, so it isn't fetched.
//     css: a stylesheet added while the script runs.
//     colour: the shapes' colour, or (ctx) -> colour. The note then shows the script's name on
//       it, so hints drawn together can be told apart. A lie looks just like the truth.
//     name(ctx): the name on that note, when it isn't the script's own.
//     lies: true for a 50% chance each round that ctx.loc is a made-up spot (Lying hints).
//       Settings with `lies` (as Chaos mode's have) do the same.
//     stop(ctx): the script is about to stop. Its overlays are still on the map.
// ctx: { cfg, map, loc (null until known), gm, rand(), pick(), add(spec), remove(overlay),
//   note(text), status(text) }. rand() is a stream seeded by loc. pick() is seeded by the real
//   round, so it's the same whether lying or not. note() puts a badge on the map ('' hides it).
// ggs.aid.hints[id] = { shapes(ctx), random(rand) -> cfg } lists the hint scripts for Lying
// hints to pick from.
// The location is only used to draw an area it's inside, a distance, or to pick between the
// player's own pins. It's never drawn itself.
(() => {
  const ggs = globalThis.__ggs;
  const KM_PER_DEG = 111.32, EARTH_KM = 6371;
  // km. The band sliders' marks, then the hemisphere.
  const BANDS = [0, 5, 25, 50, 100, 500, 1000, 2500];
  // km. The radius slider's first marks.
  const RADII = [5, 25, 50, 100, 500, 1000, 2500];
  const RING_PX = 9;
  // Not clickable, so clicks still reach the map to place the guess.
  const STYLE = {
    strokeColor: '#2b8a3e', strokeOpacity: .9, strokeWeight: 2, fillColor: '#40c057', fillOpacity: .3,
    clickable: false, zIndex: 1,
  };
  // Notes from every script stack in one corner of the map.
  const NOTES_CSS = 'position:absolute;top:8px;left:8px;z-index:10;display:flex;flex-direction:column;'
    + 'align-items:flex-start;gap:6px;pointer-events:none;';
  const NOTE_CSS = 'padding:4px 9px;border-radius:6px;background:#fecd19;color:#1c1a2e;'
    + 'font:800 13px/1.2 system-ui,sans-serif;box-shadow:3px 3px 0 #1c1a2e;';
  function notesIn(div) {
    let box = div.querySelector(':scope > [data-ggs-notes]');
    if (!box) {
      box = document.createElement('div');
      box.dataset.ggsNotes = '';
      box.style.cssText = NOTES_CSS;
      div.append(box);
    }
    return box;
  }

  // A seeded random stream (FNV-1a into mulberry32). Seeded by the game, the round's location
  // and the script, so a reload draws the same shapes and can't be used to average them out.
  function seeded(str) {
    let a = 2166136261;
    for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Every size's band is placed biggest first, each inside the one before and all holding x.
  // So moving the slider mid-round tells you no more than the thinnest band you looked at.
  // The biggest is the hemisphere, 0 to ±half. x, half and the result are in degrees.
  // Widths are km along the axis. For longitude that's at the equator, so a band's width
  // can't give the latitude away.
  function band(x, rand, index, half) {
    let lo = x < 0 ? -half : 0, hi = lo + half;
    for (let i = BANDS.length - 1; i >= index; i--) {
      const w = BANDS[i] / KM_PER_DEG;
      const min = Math.max(lo, x - w), max = Math.min(hi - w, x);
      lo = min + rand() * (max - min);
      hi = lo + w;
    }
    return [lo, hi];
  }

  // The same nesting for circles. Each centre is within 95% of its radius of the location, and
  // close enough to the bigger circle's centre to sit inside it. Offsets are km east and north.
  // If 50 tries miss, the point on the line from the bigger centre towards the location fits.
  function circle(loc, rand, index) {
    let c = [0, 0], room = Infinity;
    for (let i = RADII.length - 1; i >= index; i--) {
      const r = 0.95 * RADII[i];
      let p = null;
      for (let t = 0; t < 50 && !p; t++) {
        const d = r * Math.sqrt(rand()), a = 2 * Math.PI * rand();
        const q = [d * Math.sin(a), d * Math.cos(a)];
        if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= room) p = q;
      }
      if (!p) {
        const d = Math.hypot(...c), k = Math.max(0, 1 - room / d);
        p = [c[0] * k, c[1] * k];
      }
      c = p;
      room = RADII[i] - (RADII[i - 1] ?? 0);
    }
    return { center: destination(loc, Math.hypot(...c), Math.atan2(c[0], c[1])), km: RADII[index] };
  }

  // A lat/lng box as unstroked pieces at most 90 degrees wide, since Google Maps takes the
  // short way between two points. latLine and lngLine draw edges over the joins.
  function box(s, n, w, e) {
    const out = [];
    for (let x = w; x < e; x += 90) {
      const x2 = Math.min(e, x + 90);
      const paths = [{ lat: s, lng: x }, { lat: n, lng: x }, { lat: n, lng: x2 }, { lat: s, lng: x2 }];
      out.push({ type: 'Polygon', strokeWeight: 0, paths });
    }
    return out;
  }
  const latLine = lat => ({ type: 'Polyline', path: [-180, -90, 0, 90, 180].map(lng => ({ lat, lng })) });
  const lngLine = lng => ({ type: 'Polyline', path: [{ lat: -85, lng }, { lat: 85, lng }] });

  // The point km away from a spot along a bearing (radians from north), on a sphere.
  function destination({ lat, lng }, km, bearing) {
    const rad = Math.PI / 180, d = km / EARTH_KM, p1 = lat * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(bearing));
    const l2 = lng * rad + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
  }

  // Great-circle distance in km.
  function distance(a, b) {
    const rad = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Country outlines from draw-guess's geo.json (code -> [[outer ring, ...holes], ...] in
  // [lng, lat]). Fetched once, the first time a script asks.
  let geo = null;
  const loadGeo = () => (geo ??= fetch(ggs.extBase + 'src/scripts/draw-guess/app/data/geo.json')
    .then(r => r.json())
    .catch(err => {
      geo = null;
      throw err;
    }));

  function inside([x, y], ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  // Which country a spot is in: the smallest outline holding it, so the Vatican beats Italy.
  // Failing that, with `near`, the nearest vertex within ~1.5 degrees. That catches coastal
  // roads outside the simplified coastlines.
  function countryAt(geo, { lat, lng }, { near: useNear = true } = {}) {
    let best = null, bestArea = Infinity, near = null, nearD = 1.5 ** 2;
    const k = Math.cos(lat * Math.PI / 180);
    for (const [code, polys] of Object.entries(geo)) {
      for (const [outer, ...holes] of polys) {
        if (inside([lng, lat], outer) && !holes.some(h => inside([lng, lat], h))) {
          const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
          const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
          if (area < bestArea) {
            bestArea = area;
            best = code;
          }
        }
        if (!useNear) continue;
        for (const [x, y] of outer) {
          const d = ((x - lng) * k) ** 2 + (y - lat) ** 2;
          if (d < nearD) {
            nearD = d;
            near = code;
          }
        }
      }
    }
    return best ?? near;
  }

  // Whether any drawn shape holds a spot. Polygons by even-odd, also one turn of the globe
  // either way for pieces drawn past ±180. Circles by distance.
  function covers(specs, p) {
    return specs.some(s => {
      if (s.type === 'Circle') return distance(s.center, p) <= s.radius / 1000;
      if (s.type !== 'Polygon') return false;
      const rings = (s.paths[0]?.lat === undefined ? s.paths : [s.paths])
        .map(r => r.map(q => [q.lng, q.lat]));
      return [p.lng, p.lng - 360, p.lng + 360]
        .some(x => rings.filter(r => inside([x, p.lat], r)).length % 2 === 1);
    });
  }

  // Guess presses (the button's click or Space), caught before GeoGuessr sees them, for the
  // scripts with a beforeGuess hook. `passing` lets our own press afterwards through.
  const guessHooks = new Set();
  let passing = false, swallowUp = false;
  function onPress(e) {
    if (passing || !guessHooks.size) return;
    if (e.type === 'keyup') {
      if (swallowUp && e.code === 'Space') {
        swallowUp = false;
        e.stopImmediatePropagation();
      }
      return;
    }
    const isPress = e.type === 'keydown'
      ? e.code === 'Space' && !ggs.isTyping(e) && !!ggs.maps.guessMapElement()
      : !!ggs.maps.guessButton()?.contains(e.target);
    if (!isPress) return;
    let p = null, block = false;
    for (const fn of guessHooks) {
      const r = fn();
      if (r === false) block = true;
      else p = r ?? p;
    }
    if (!p && !block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'keydown') swallowUp = true;
    if (block) return;
    ggs.maps.placeGuess(p.lat, p.lng, { pan: false });
    passing = true;
    // Waits so GeoGuessr takes the new pin first.
    setTimeout(() => {
      if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
      passing = false;
    }, 150);
  }
  for (const type of ['click', 'keydown', 'keyup']) window.addEventListener(type, onPress, true);

  // A hint that lied says so in its own note ("Area was a lie") once the player has guessed or
  // the round is over. A guess is Guess clicked or Space with a pin down (board guesses press
  // the same button). Over is the guess map gone OVER_MS, and the note stays on the results map.
  const OVER_MS = 1500;
  // Each running aid's own-up, called on a guess.
  const owners = new Set();
  const guessed = () => {
    if (ggs.maps.lastGuess()) owners.forEach(fn => fn());
  };
  window.addEventListener('click', e => {
    if (ggs.maps.guessButton()?.contains(e.target)) guessed();
  }, true);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !ggs.isTyping(e) && ggs.maps.guessMapElement()) guessed();
  }, true);

  // Lying (an aid with `lies`): each round there's a 50% chance it works from a made-up spot
  // instead of the real one. The coin and the spots are seeded like the shapes, so a reload
  // doesn't flip them. Made-up spots are points on random countries' outlines. For aids that
  // draw shapes, the first spot whose shapes leave the real location out is used.
  async function fakes(rand) {
    const geo = await loadGeo(), codes = Object.keys(geo).sort();
    const pick = list => list[Math.floor(rand() * list.length)];
    return Array.from({ length: 20 }, () => {
      const [lng, lat] = pick(pick(pick(geo[pick(codes)])));
      return { lat, lng };
    });
  }

  ggs.aid = (id, hooks) => ({
    start(cfg) {
      let map = null, round = null, real = null, loc = null, lying = null, lies = null, stopped = false;
      let shapes = [], shapesKey = '', extras = [], listener = null, note = null, detach = null;
      const gm = () => window.google.maps;
      const colour = () => (typeof hooks.colour === 'function' ? hooks.colour(ctx) : hooks.colour);
      const look = () => {
        const c = colour();
        return c ? { ...STYLE, strokeColor: c, fillColor: c } : STYLE;
      };
      const make = ({ type, ...o }) => new (gm()[type])({ ...look(), ...o, map });
      const clear = list => {
        list.forEach(o => o.setMap(null));
        list.length = 0;
      };
      const seed = (what, p) => seeded(`${id}|${what}|${ggs.game.context()?.token}|${p?.lat}|${p?.lng}`);
      const ctx = {
        get cfg() { return cfg; },
        get map() { return map; },
        get loc() { return loc; },
        get gm() { return gm(); },
        rand: () => seed('shape', loc),
        pick: () => seed('pick', real),
        // Takes a spec or a ready-made overlay.
        add(spec) {
          const o = spec.setMap ? spec : make(spec);
          if (o === spec) o.setMap(map);
          extras.push(o);
          return o;
        },
        remove(o) {
          o.setMap(null);
          extras = extras.filter(x => x !== o);
        },
        note(text) {
          if (stopped) return;
          if (!note) {
            note = document.createElement('div');
            note.style.cssText = NOTE_CSS;
          }
          note.textContent = text;
          note.hidden = !text;
          if (text && map && note.parentNode?.parentNode !== map.getDiv()) notesIn(map.getDiv()).append(note);
        },
        status: text => ggs.status(id, text),
      };
      const guessHook = hooks.beforeGuess && (() => hooks.beforeGuess(ctx));
      if (guessHook) guessHooks.add(guessHook);
      const css = hooks.css && Object.assign(document.createElement('style'), { textContent: hooks.css });
      if (css) document.head.append(css);

      // The key for a coloured hint: its name on its colour.
      const name = () => hooks.name?.(ctx) ?? ggs.registry.find(m => m.id === id)?.name ?? id;
      // owned is the round whose lie was owned up to.
      let goneSince = 0, owned = null;
      function ownUp() {
        if (!lying || !loc || loc === real || !note?.textContent) return;
        owned = round;
        ctx.note(`${name()} was a lie`);
      }
      owners.add(ownUp);
      function label() {
        ctx.note(name());
        if (note) Object.assign(note.style, { background: colour(), color: '#fff' });
      }

      // A circle's ring shows while the circle is under RING_PX across on screen.
      // Metres per pixel come from the zoom.
      function rings() {
        const z = map?.getZoom();
        for (const o of shapes) {
          if (!o.ring || z == null) continue;
          const px = o.getRadius() / (156543 * Math.cos(o.getCenter().lat() * Math.PI / 180) / 2 ** z);
          o.ring.setVisible(px < RING_PX);
        }
      }

      // The shapes for the current spot. When lying, made-up spots are tried until the shapes
      // miss the real one. loc stays on the one it settled on, for the other hooks too.
      async function draw(want) {
        let specs = await hooks.shapes(ctx);
        for (let i = 1; lies && i < lies.length && covers(specs, real); i++) {
          loc = lies[i];
          specs = await hooks.shapes(ctx);
          if (shapesKey !== want) return null;
        }
        return specs;
      }

      const tick = setInterval(() => {
        const now = ggs.maps.findGuessMap();
        const key = ggs.game.roundKey();
        if (!now) {
          goneSince ||= Date.now();
          if (Date.now() - goneSince > OVER_MS) ownUp();
          return;
        }
        goneSince = 0;
        // GeoGuessr made a new map, so move everything onto it.
        if (now !== map) {
          map = now;
          listener?.remove();
          listener = gm().event.addListener(map, 'click', e => {
            if (!ggs.maps.placing() && e?.latLng) hooks.click?.(e.latLng, ctx);
          });
          extras.forEach(o => o.setMap(map));
          shapesKey = '';
          if (note?.textContent) ctx.note(note.textContent);
          detach?.();
          detach = hooks.attach?.(ctx) ?? null;
        }
        if (key !== round) {
          round = key;
          real = loc = lying = lies = null;
          clear(shapes);
          clear(extras);
          shapesKey = '';
          ctx.note('');
          hooks.round?.(ctx);
          if (hooks.usesLocation !== false) {
            ggs.game.roundLocation().then(l => {
              // Moved on, or stopped.
              if (round !== key) return;
              real = l;
              ctx.status(l ? '' : `Not this round (${ggs.game.whyNoRound()})`);
            });
          }
        }
        hooks.tick?.(ctx);
        rings();
        if (!real) return;
        const lie = !!(hooks.lies || cfg.lies) && seed('lie', real)() < 0.5;
        // First time this round.
        if (lie !== lying) {
          lying = lie;
          lies = null;
          loc = lie ? null : real;
          shapesKey = '';
          if (lie) {
            fakes(seed('fake', real)).then(list => {
              if (round === key && lying === lie) {
                lies = list;
                loc = list[0];
              }
            }, () => {
              // No outlines to lie with, so tell the truth.
              if (round === key && lying === lie) loc = real;
            });
          }
        }
        // A redraw after the guess put the plain name back.
        if (owned === key) ownUp();
        const want = `${round}|${lying}|${JSON.stringify(cfg)}`;
        if (!loc || !hooks.shapes || want === shapesKey) return;
        shapesKey = want;
        if (lies) loc = lies[0];
        draw(want).then(specs => {
          // The settings or round moved on (or it stopped) while it loaded.
          if (!specs || shapesKey !== want) return;
          clear(shapes);
          shapes.push(...specs.map(make));
          // A circle also gets a ring of RING_PX on its centre, so it can be found zoomed out.
          // rings() shows it only while the circle itself is smaller than that.
          for (const o of [...shapes]) {
            if (!(o instanceof gm().Circle)) continue;
            const icon = {
              path: 0, scale: RING_PX, strokeColor: look().strokeColor, strokeWeight: 3,
              fillColor: look().fillColor, fillOpacity: .3,
            };
            o.ring = make({ type: 'Marker', position: o.getCenter(), visible: false, icon });
            shapes.push(o.ring);
          }
          rings();
          if (hooks.colour) label();
        }, err => {
          if (shapesKey === want) ctx.status(`Couldn't draw it (${err.message})`);
        });
      }, 300);

      return {
        update(next) {
          cfg = next;
        },
        stop() {
          try {
            hooks.stop?.(ctx);
          } catch (err) {
            ggs.log(`${id} stop failed`, err);
          }
          stopped = true;
          owners.delete(ownUp);
          // Late promises see this and drop their results.
          round = shapesKey = null;
          clearInterval(tick);
          guessHooks.delete(guessHook);
          listener?.remove();
          detach?.();
          clear(shapes);
          clear(extras);
          const box = note?.parentNode;
          note?.remove();
          // The last script's note takes the corner box with it.
          if (box && !box.children.length) box.remove();
          css?.remove();
          ctx.status('');
        },
      };
    },
  });
  Object.assign(ggs.aid, {
    seeded, band, circle, box, latLine, lngLine, destination, distance, loadGeo, countryAt, covers,
    hints: {},
  });
})();

// ==================== src/core/view.js ============================================
// View modes, shared by the scripts that change how Street View looks. One animation-frame
// loop, running only while something uses it, keeps effects and masks on the current panorama
// (GeoGuessr swaps it) and the guess map (it grows on hover).
//   ggs.view.effect(owner, { filter, transform } | null): CSS on the panorama's picture
//     (Google's .gm-style layer), so the HUD and guess map are never touched. transform may be
//     a function (time ms, w, h) -> string. Owners' effects are combined. null removes one.
//   ggs.view.script(id, cfg => effect): a whole script that only sets one effect.
//   ggs.view.mask({ over: 'pano' | 'screen', look: 'paper' | 'night', cut(w, h) }) -> { stop() }:
//     a sheet over the panorama (inside its element, so the HUD stays on top) or the whole
//     window. It has holes where cut() returns SVG path data, and null hides it. The painted
//     part swallows clicks, wheel and drags. The holes let them through.
//   ggs.view.mirror(owner, { move, turn, zoom, dragX, dragY, flipX, flipY } | null): Street View
//     input sent the other way (see below). Owners cancel out, so two owners flipping the same
//     thing leave it as normal.
//   ggs.view.shape.rect / circle / poly build that path data.
//   guessArea() is the guess map's rect with its Guess button (null outside a round).
//   lastTile() is when the last Street View tile reached the screen (performance.now()).
(() => {
  const ggs = globalThis.__ggs;
  const HOST = 'data-ggs-view';
  // Fallbacks for a panorama made before the hook was in place. radio uses the same pair.
  const PANO_SELECTORS = ['[data-qa="panorama"]', '[class*="game_panorama"]'];

  // ---- finding the panorama ----
  // Container elements of the last few StreetViewPanoramas, newest last.
  let hooked = [];
  // container element -> its StreetViewPanorama
  const panoOf = new WeakMap();
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    if (!(args[0] instanceof Element)) return;
    hooked = [...hooked.filter(e => e.isConnected), args[0]].slice(-5);
    panoOf.set(args[0], p);
  });

  // The Street View element on screen. Never one holding the guess map, so nothing done to
  // it can reach the map.
  function panoElement() {
    const map = ggs.maps.guessMapElement();
    const ok = el => el?.isConnected && el.offsetWidth > 0 && !(map && el.contains(map));
    return [...hooked].reverse().find(ok)
      ?? PANO_SELECTORS.map(s => document.querySelector(s)).find(ok)
      ?? null;
  }
  // The picture inside it: Google's .gm-style layer, or its first child that isn't ours.
  const sceneOf = pano => [...pano.children].find(c => c.classList.contains('gm-style'))
    ?? [...pano.children].find(c => !c.hasAttribute(HOST)) ?? null;

  // The guess map's area: the smallest element holding both the map and its Guess button,
  // so the map's own size buttons are in it too. If that is most of the window, the two
  // rects together instead.
  function guessArea() {
    const map = ggs.maps.guessMapElement();
    if (!map) return null;
    const btn = ggs.maps.guessButton();
    let box = map.closest(ggs.maps.GUESS_AREA) ?? (btn ? map.parentElement : null);
    while (box && btn && !box.contains(btn)) box = box.parentElement;
    const r = box?.getBoundingClientRect();
    if (r && r.width * r.height < innerWidth * innerHeight * 0.6) return r;
    const rects = [map, btn].filter(Boolean).map(e => e.getBoundingClientRect());
    const left = Math.min(...rects.map(q => q.left)), top = Math.min(...rects.map(q => q.top));
    const right = Math.max(...rects.map(q => q.right)), bottom = Math.max(...rects.map(q => q.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  // A filter that changes nothing, last in line: it only notes when tiles arrive.
  let tileAt = 0;
  ggs.tiles.filter((rec, source) => {
    tileAt = performance.now();
    return source;
  }, 99);
  const lastTile = () => tileAt;

  // ---- path data ----
  const n = v => Math.round(v * 10) / 10;
  const shape = {
    poly: pts => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`,
    circle: (cx, cy, r) => `M${n(cx - r)} ${n(cy)}`
      + `a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`,
    rect(x, y, w, h, r = 0) {
      r = Math.min(r, w / 2, h / 2);
      if (!r) return shape.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
      const arc = (dx, dy) => `a${n(r)} ${n(r)} 0 0 1 ${n(dx)} ${n(dy)}`;
      return `M${n(x + r)} ${n(y)}H${n(x + w - r)}${arc(r, r)}V${n(y + h - r)}`
        + `${arc(-r, r)}H${n(x + r)}${arc(-r, -r)}V${n(y + r)}${arc(r, -r)}Z`;
    },
  };

  // ---- effects on the picture ----
  // owner -> { filter, transform }
  const effects = new Map();
  // { scene, pano, saved inline styles, last transform }
  let applied = null;
  const PROPS = { scene: ['filter', 'transform', 'willChange'], pano: ['overflow'] };

  function release() {
    if (!applied) return;
    for (const k of PROPS.scene) applied.scene.style[k] = applied.saved.scene[k];
    for (const k of PROPS.pano) applied.pano.style[k] = applied.saved.pano[k];
    applied = null;
  }

  function paint(now) {
    const pano = effects.size ? panoElement() : null;
    const scene = pano && sceneOf(pano);
    if (applied && applied.scene !== scene) release();
    if (!scene) return;
    if (!applied) {
      const keep = (el, keys) => Object.fromEntries(keys.map(k => [k, el.style[k]]));
      applied = { scene, pano, saved: { scene: keep(scene, PROPS.scene), pano: keep(pano, PROPS.pano) } };
    }
    const { width: w, height: h } = pano.getBoundingClientRect();
    const all = [...effects.values()];
    const filter = all.map(e => e.filter).filter(Boolean).join(' ');
    const transform = all
      .map(e => (typeof e.transform === 'function' ? e.transform(now, w, h) : e.transform))
      .filter(Boolean)
      .join(' ');
    if (scene.style.filter !== filter) scene.style.filter = filter || applied.saved.scene.filter;
    if (applied.transform !== transform) {
      applied.transform = transform;
      scene.style.transform = transform || applied.saved.scene.transform;
      scene.style.willChange = transform ? 'transform' : applied.saved.scene.willChange;
      // A transformed picture is clipped to the panorama's box, so a scaled-up one can't spill out.
      pano.style.overflow = transform ? 'hidden' : applied.saved.pano.overflow;
    }
  }

  function effect(owner, e) {
    if (e) effects.set(owner, e);
    else effects.delete(owner);
    run();
  }
  const script = (id, make) => ({
    start(cfg) {
      const update = c => effect(id, make(c));
      update(cfg);
      return { update, stop: () => effect(id, null) };
    },
  });

  // ---- masks ----
  const masks = new Set();
  const LOOKS = {
    // Cream paper with a faint dot grid and an ink edge with a hard shadow, like the popup.
    paper: {
      paper: '#f5f1e8', dot: 'rgba(28,26,46,.09)', edge: '#1c1a2e', width: 3, shadow: 'rgba(28,26,46,.3)',
    },
    // Near-black with a barely-there dot grid and a thin cream edge round the holes.
    night: {
      paper: '#0b0a12', dot: 'rgba(245,241,232,.06)', edge: 'rgba(245,241,232,.8)', width: 2, shadow: null,
    },
  };
  const BLOCKED = [
    'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
    'wheel', 'touchstart', 'touchmove',
  ];

  function mask({ over, look: lookName, cut }) {
    const look = LOOKS[lookName] ?? LOOKS.paper, screen = over === 'screen';
    const host = document.createElement('div');
    host.setAttribute(HOST, '');
    host.style.cssText = `all: initial; position: ${screen ? 'fixed' : 'absolute'}; inset: 0; display: block;`
      + ` z-index: ${screen ? 2147482000 : 2147483000}; pointer-events: none;`;
    // Events on the painted sheet stop here, so neither Street View nor GeoGuessr see them.
    for (const type of BLOCKED) host.addEventListener(type, e => e.stopPropagation());
    const root = host.attachShadow({ mode: 'open' });
    const shadow = look.shadow
      ? `<path class="shadow" fill-rule="evenodd" fill="${look.shadow}" transform="translate(5 5)"/>`
      : '';
    root.innerHTML = `<style>
        svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden;
              pointer-events: none; }
        .sheet { pointer-events: visiblePainted; cursor: default; }
      </style>
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id="paper" width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill="${look.paper}"/><circle cx="11" cy="11" r="1.4" fill="${look.dot}"/>
        </pattern></defs>
        ${shadow}
        <path class="sheet" fill-rule="evenodd" fill="url(#paper)" stroke="${look.edge}"
              stroke-width="${look.width}" stroke-linejoin="round"/>
      </svg>`;
    const m = { last: null, pano: null, saved: null };

    // Puts back the panorama's own isolation and position.
    function unpin() {
      if (m.pano) Object.assign(m.pano.style, m.saved);
      m.pano = null;
    }

    m.draw = () => {
      const parent = screen ? document.body : panoElement();
      if (!parent) {
        host.remove();
        unpin();
        return;
      }
      if (host.parentElement !== parent) {
        unpin();
        parent.append(host);
        m.last = null;
        // The panorama becomes its own stacking layer, so the sheet's z-index stays inside it
        // and GeoGuessr's HUD keeps drawing above it.
        if (!screen) {
          m.pano = parent;
          m.saved = { isolation: parent.style.isolation, position: parent.style.position };
          parent.style.isolation = 'isolate';
          if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
        }
      }
      const w = host.clientWidth, h = host.clientHeight, holes = cut(w, h);
      host.hidden = holes === null;
      // The outer edge is 20px past the box so its stroke is off screen. Only the holes' edges show.
      const d = holes === null ? '' : `M-20 -20H${w + 20}V${h + 20}H-20Z${holes}`;
      if (d === m.last) return;
      m.last = d;
      for (const p of root.querySelectorAll('path')) p.setAttribute('d', d);
    };

    masks.add(m);
    run();
    return {
      stop() {
        masks.delete(m);
        host.remove();
        unpin();
      },
    };
  }

  // ---- the loop ----
  let raf = 0;
  function run() {
    if (raf) return;
    const frame = now => {
      raf = 0;
      try {
        paint(now);
        for (const m of masks) m.draw();
      } catch (err) {
        ggs.log('view update failed', err);
      }
      if (effects.size || masks.size) raf = requestAnimationFrame(frame);
      else release();
    };
    raf = requestAnimationFrame(frame);
  }

  // ---- mirrored input ----
  // Street View input is caught at the window in the capture phase and swallowed. A changed copy
  // goes to the same target, so the Maps API sees it the other way round:
  //   move/turn/zoom swap their keys (and zoom the wheel).
  //   dragX/Y mirror drags around where the press was.
  //   flipX/Y mirror every mouse position around the panorama's centre. A flipped picture then
  //   follows the cursor, and click-to-move goes where you clicked.
  // Copies are marked and pass untouched. These listeners are added after core/lock.js's, so a
  // No move/pan/zoom lock still swallows the original.
  const key = (k, code, keyCode) => ({ key: k, code, keyCode });
  const SWAP = {
    move: {
      ArrowUp: key('ArrowDown', 'ArrowDown', 40), ArrowDown: key('ArrowUp', 'ArrowUp', 38),
      w: key('s', 'KeyS', 83), s: key('w', 'KeyW', 87), W: key('S', 'KeyS', 83), S: key('W', 'KeyW', 87),
    },
    turn: {
      ArrowLeft: key('ArrowRight', 'ArrowRight', 39), ArrowRight: key('ArrowLeft', 'ArrowLeft', 37),
      a: key('d', 'KeyD', 68), d: key('a', 'KeyA', 65), A: key('D', 'KeyD', 68), D: key('A', 'KeyA', 65),
    },
    zoom: {
      '+': key('-', 'Minus', 189), '=': key('-', 'Minus', 189),
      '-': key('=', 'Equal', 187), '_': key('=', 'Equal', 187),
    },
  };
  // Every event field the copies need. The constructor ignores the ones its type lacks.
  const FIELDS = [
    'bubbles', 'cancelable', 'composed', 'view', 'detail', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey',
    'key', 'code', 'location', 'repeat', 'keyCode', 'which', 'charCode',
    'screenX', 'screenY', 'clientX', 'clientY', 'movementX', 'movementY', 'button', 'buttons', 'relatedTarget',
    'pointerId', 'pointerType', 'isPrimary', 'width', 'height', 'pressure', 'tiltX', 'tiltY', 'twist',
    'deltaX', 'deltaY', 'deltaZ', 'deltaMode',
  ];
  const POINTER = [
    'pointerdown', 'mousedown', 'pointermove', 'mousemove', 'pointerup', 'mouseup', 'pointercancel',
    'click', 'dblclick',
  ];
  // owner -> wanted flips
  const mirrors = new Map();
  const want = k => [...mirrors.values()].filter(m => m[k]).length % 2 === 1;
  const ours = new WeakSet();
  // The panorama's picture, not our own sheets over it (scratch card, masks).
  const onPano = t => !!panoElement()?.contains(t) && !t.closest?.(`[${HOST}]`);

  // An untrusted copy of an input event, with `change` applied. scripts/lag uses it too.
  function copyEvent(e, change = {}) {
    const init = {};
    for (const f of FIELDS) if (f in e) init[f] = e[f];
    Object.assign(init, change);
    const copy = new e.constructor(e.type, init);
    // Some engines ignore keyCode/which in the init, so pin them on the copy.
    for (const f of ['keyCode', 'which']) {
      if (f in init && copy[f] !== init[f]) Object.defineProperty(copy, f, { value: init[f] });
    }
    return copy;
  }
  function resend(e, change) {
    const copy = copyEvent(e, change);
    ours.add(copy);
    e.stopImmediatePropagation();
    e.target.dispatchEvent(copy);
    if (copy.defaultPrevented || e.type.endsWith('move')) e.preventDefault();
  }

  // e.code held down -> the swap sent for it, so its keyup matches.
  const sent = new Map();
  function onKey(e) {
    if (!mirrors.size || ours.has(e) || ggs.isTyping(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || ggs.maps.guessMapElement()?.contains(e.target)) return;
    const id = e.code || e.key;
    let to = sent.get(id);
    if (e.type === 'keydown') {
      to = ['move', 'turn', 'zoom'].map(kind => want(kind) && SWAP[kind][e.key]).find(Boolean);
      if (to) sent.set(id, to);
    } else {
      sent.delete(id);
    }
    if (to) resend(e, { ...to, which: to.keyCode });
  }
  function onWheel(e) {
    if (mirrors.size && !ours.has(e) && want('zoom') && onPano(e.target)) {
      resend(e, { deltaX: -e.deltaX, deltaY: -e.deltaY, deltaZ: -e.deltaZ });
    }
  }
  // Click-to-move with `move` flipped. Google's own is off (clickToGo), and a click that wasn't
  // a drag walks to the link pointing furthest from where you clicked.
  // pressAt is where the press was. noClickTo is the panorama whose clickToGo is off.
  let pressAt = null, noClickTo = null;
  function clickToGo() {
    const p = panoOf.get(panoElement());
    const off = want('move') ? p : null;
    if (off === noClickTo) return;
    noClickTo?.setOptions({ clickToGo: true });
    off?.setOptions({ clickToGo: false });
    noClickTo = off;
  }
  function walkBack(x) {
    const el = panoElement(), p = panoOf.get(el), links = p?.getLinks?.();
    if (!links?.length) return;
    const r = el.getBoundingClientRect(), pov = p.getPov();
    const fov = 180 / 2 ** (p.getZoom?.() ?? 1);
    const away = pov.heading + ((x - r.left) / r.width - 0.5) * fov + 180;
    const off = l => Math.abs(((l.heading - away) % 360 + 540) % 360 - 180);
    p.setPano(links.reduce((a, b) => (off(b) < off(a) ? b : a)).pano);
  }

  // A mouse position is first mirrored round the centre (flip), then round the press (drag).
  let from = null;
  function onPointer(e) {
    if (ours.has(e) || !mirrors.size) return;
    if (e.type === 'pointerdown' || e.type === 'mousedown') pressAt = { x: e.clientX, y: e.clientY };
    if (e.type === 'click' && want('move') && onPano(e.target)) {
      const still = pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 5;
      e.stopImmediatePropagation();
      const r = panoElement()?.getBoundingClientRect();
      if (still && r && !ggs.lock.held('move')) {
        walkBack(want('flipX') ? 2 * (r.left + r.width / 2) - e.clientX : e.clientX);
      }
      return;
    }
    const r = panoElement()?.getBoundingClientRect();
    const down = e.type === 'pointerdown' || e.type === 'mousedown';
    if (down) from = e.button === 0 && onPano(e.target) ? { x: e.clientX, y: e.clientY } : null;
    // A move with no button held means the press ended out of sight.
    if (e.type.endsWith('move') && e.buttons === 0) from = null;
    const flip = (v, c, on) => (on ? 2 * c - v : v);
    const inPano = onPano(e.target) || from;
    if (!r || !inPano) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = flip(e.clientX, cx, want('flipX'));
    let y = flip(e.clientY, cy, want('flipY'));
    if (from && !down) {
      const fx = flip(from.x, cx, want('flipX'));
      const fy = flip(from.y, cy, want('flipY'));
      x = flip(x, fx, want('dragX'));
      y = flip(y, fy, want('dragY'));
    }
    // Cleared a tick later, so the click after a release still mirrors.
    if (/up|cancel/.test(e.type)) {
      setTimeout(() => {
        from = null;
      });
    }
    const dx = x - e.clientX, dy = y - e.clientY;
    if (!dx && !dy) return;
    const sx = (want('flipX') !== (!!from && want('dragX'))) ? -1 : 1;
    const sy = (want('flipY') !== (!!from && want('dragY'))) ? -1 : 1;
    resend(e, {
      clientX: x, clientY: y, screenX: e.screenX + dx, screenY: e.screenY + dy,
      movementX: sx * e.movementX, movementY: sy * e.movementY,
    });
  }
  const onBlur = e => {
    if (e.target !== window) return;
    from = null;
    sent.clear();
  };
  const LISTENERS = [
    ['keydown', onKey], ['keyup', onKey], ['wheel', onWheel], ['blur', onBlur],
    ...POINTER.map(t => [t, onPointer]),
  ];
  // Added once, at document_start, so they run before GeoGuessr's and the Maps API's own
  // window listeners. They do nothing while no owner wants anything.
  for (const [t, fn] of LISTENERS) addEventListener(t, fn, { capture: true, passive: false });
  let checking = null;
  function mirror(owner, m) {
    if (m) mirrors.set(owner, m);
    else mirrors.delete(owner);
    if (!mirrors.size) {
      from = null;
      sent.clear();
    }
    clickToGo();
    // GeoGuessr makes a new panorama now and then. Keep its clickToGo in step while any owner is on.
    clearInterval(checking);
    checking = mirrors.size ? setInterval(clickToGo, 500) : null;
  }

  ggs.view = { panoElement, guessArea, lastTile, effect, script, mask, mirror, shape, copyEvent };
})();

// ==================== src/form.js =================================================
// Settings form: one card per script in ggs.registry, under a search box. Cards sit in a
// collapsible section per `section` (SECTIONS below, in that order), A to Z by name.
// Used by the popup and by the in-page panel (src/panel.js). update(settings) shows
// settings changed elsewhere without firing save.
//   ggs.settingsForm(container, { settings, save(id, key, value) })
//     -> { setStatus(id, text), update(settings) }
(() => {
  const ggs = (globalThis.__ggs ??= {});

  const SECTIONS = {
    chaos: 'Chaos mode', guessing: 'Guessing', streetview: 'Street View', misc: 'Misc', controls: 'Controls',
    ui: 'UI',
  };
  // Sections shown as their card alone, without a fold.
  const LONE = ['chaos'];
  // Sections the viewer opened or closed, in localStorage (popup and page each keep their own).
  // A section they haven't touched is open while any of its scripts is on.
  const OPEN = 'ggs-sections';
  const opened = () => {
    try {
      return JSON.parse(localStorage.getItem(OPEN)) ?? {};
    } catch {
      return {};
    }
  };

  ggs.settingsForm = (container, { settings: initial, save }) => {
    let settings = initial;
    const { registry, config } = ggs;
    // hideable: options with a hideIn, hidden by game mode.
    const statusEls = {}, refreshers = [], hideable = [];
    // The page's microphone permission (its '_mic' status line).
    let micState = '';
    const micNotes = [];
    // Asked in the page itself (in-page panel), or from the popup through the settings.
    const askMic = () => {
      if (ggs.mic?.ask) return ggs.mic.ask();
      settings._mic = { ask: Date.now() };
      save('_mic', 'ask', settings._mic.ask);
    };

    function option(o) {
      if (o.type === 'mic') return `<button type="button" class="micnote" hidden>${o.label}</button>`;
      if (o.type === 'text') {
        const type = o.secret ? 'password' : 'text';
        return `<label class="row"><span class="text">${o.label}</span>
             <input type="${type}" class="field" data-key="${o.key}" placeholder="${o.placeholder ?? ''}"`
          + ' autocomplete="off"></label>';
      }
      if (o.type === 'select') {
        const choices = o.choices.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
        return `<label class="row"><span class="text">${o.label}</span>
             <select data-key="${o.key}">${choices}</select></label>`;
      }
      // A label per stop: the stops sit under their labels.
      if (o.type === 'slider' && o.marks?.length === o.max - o.min + 1) {
        const marks = o.marks.map(m => `<span data-t="${m}">${m}</span>`).join('');
        return `<div class="row slider"><span class="text">${o.label}</span>
             <span class="stops" data-key="${o.key}" tabindex="0" role="slider" aria-label="${o.label}">`
          + `<span class="track"><i></i><b></b></span>
             <span class="marks">${marks}</span></span></div>`;
      }
      if (o.type === 'slider') {
        return `<label class="row slider"><span class="text">${o.label}${o.steps ? ': <b class="val"></b>' : ''}</span>
             <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="1">
             ${marksHtml(o)}</label>`;
      }
      // One of a few, as a row of buttons.
      if (o.type === 'buttons') {
        const buttons = o.choices.map(c =>
          `<button type="button" class="tog opt" data-key="${o.key}" data-value="${c.value}">${c.label}</button>`);
        return `<div class="row boxes">${buttons.join('')}</div>`;
      }
      return `<button type="button" class="tog opt" data-key="${o.key}">${o.label}</button>`;
    }
    // A plain slider's labels, spread out. With `steps` (a name per stop) only the ends are
    // marked, and the label says the stop it's on.
    function marksHtml(o) {
      const ends = o.steps ? [o.steps[0], o.steps.at(-1)] : o.marks;
      return `<span class="marks">${ends.map(m => `<span>${m}</span>`).join('')}</span>`;
    }
    // Checkboxes are buttons that light up. Side-by-side ones share a row.
    const options = list => list.map(option).join('')
      .replace(/(<button type="button" class="tog opt" data-key="[^"]*">[^<]*<\/button>)+/g,
        row => `<div class="row boxes">${row}</div>`);

    // Metas sharing a `group` render inside one card, each as a .part. The card is off when
    // none of its parts is enabled.
    const groups = {}, parts = {};
    const reflect = (card, metas) => card.classList.toggle('off', !metas.some(m => config(m, settings).enabled));
    // A flat script is on while any of its options is.
    const setFlat = (meta, key, value) => {
      const cfg = config(meta, settings);
      const enabled = meta.options.some(o => (o.key === key ? value : cfg[o.key]) === true);
      const changes = { [key]: value, enabled };
      settings[meta.id] = { ...settings[meta.id], ...changes };
      for (const [k, v] of Object.entries(changes)) save(meta.id, k, v);
      refreshers.forEach(fn => fn());
    };
    const byId = Object.fromEntries(registry.map(m => [m.id, m]));

    // Search hides the cards whose name and description don't match, and opens the sections
    // that still have some. The suggestions are the scripts' names.
    const search = document.createElement('div');
    search.className = 'search';
    const names = registry.filter(m => !m.flat).map(m => `<option value="${m.name}">`).join('');
    search.innerHTML = '<input type="search" placeholder="Search modifiers" aria-label="Search modifiers"'
      + ` list="ggs-names" autocomplete="off">
      <datalist id="ggs-names">${names}</datalist>`;
    container.append(search);

    // One <details> per section that has scripts. Its summary counts the scripts that are on.
    const sections = {};
    for (const [key, title] of Object.entries(SECTIONS)) {
      const metas = registry.filter(m => (m.section ?? 'misc') === key);
      if (!metas.length) continue;
      // No fold: the card sits straight in the list.
      if (LONE.includes(key)) {
        const el = document.createElement('div');
        el.className = 'sec lone';
        el.dataset.section = key;
        el.innerHTML = '<div class="cards"></div>';
        sections[key] = el.firstChild;
        container.append(el);
        continue;
      }
      const el = document.createElement('details');
      el.className = 'sec';
      el.dataset.section = key;
      el.open = opened()[key] ?? metas.some(m => config(m, initial).enabled);
      el.innerHTML = `<summary><span class="title">${title}</span><span class="count"></span></summary>`
        + '<div class="cards"></div>';
      // A click, not 'toggle', which also fires for the default set just above.
      el.querySelector('summary').addEventListener('click', () => {
        try {
          localStorage.setItem(OPEN, JSON.stringify({ ...opened(), [key]: !el.open }));
        } catch {}
      });
      const count = el.querySelector('.count');
      refreshers.push(() => {
        // A flat script (Controls, UI) counts each option that's on.
        const on = metas.reduce((n, m) => {
          const cfg = config(m, settings);
          return n + (m.flat ? m.options.filter(o => cfg[o.key] === true).length : cfg.enabled ? 1 : 0);
        }, 0);
        count.textContent = on ? `${on} on` : '';
      });
      sections[key] = el.querySelector('.cards');
      container.append(el);
    }

    // A script's `turnsOn` options go on with it, and off with it unless the user has touched
    // them since. `auto_<key>` on the option's script remembers which script switched it on.
    const mark = (id, k, by) => {
      settings[id] = { ...settings[id], [`auto_${k}`]: by };
      save(id, `auto_${k}`, by);
    };
    const autoOn = meta => {
      for (const { id, key: k } of meta.turnsOn ?? []) {
        if (config(byId[id], settings)[k]) continue;
        setFlat(byId[id], k, true);
        mark(id, k, meta.id);
      }
    };
    const autoOff = meta => {
      for (const { id, key: k } of meta.turnsOn ?? []) {
        if (config(byId[id], settings)[`auto_${k}`] !== meta.id) continue;
        mark(id, k, null);
        setFlat(byId[id], k, false);
      }
    };
    // The user setting an option themselves makes it theirs.
    const setByUser = (meta, key, value) => {
      if (config(meta, settings)[`auto_${key}`]) mark(meta.id, key, null);
      setFlat(meta, key, value);
    };
    // With `steps`, the label shows the name of the stop the slider is on.
    function marks(box, opt) {
      if (!opt?.steps) return;
      box.closest('.slider').querySelector('.val').textContent = opt.steps[box.value - opt.min] ?? '';
    }
    // A slider with a label per stop. The labels are spread to fit and each stop sits at its
    // label's centre, so the stops aren't evenly spaced. The end ones sit at the track's ends,
    // thumb flush with the edge like a native range. Click, drag or arrow keys pick one.
    function stops(el, meta, opt) {
      const key = el.dataset.key, labels = [...el.querySelectorAll('.marks span')];
      let value = config(meta, settings)[key];
      // Half the thumb's width.
      const THUMB = 8;
      const centres = () => {
        const r = el.getBoundingClientRect();
        const c = labels.map(l => {
          const b = l.getBoundingClientRect();
          return b.left + b.width / 2 - r.left;
        });
        return c.map((x, i) => (i === 0 ? THUMB : i === c.length - 1 ? r.width - THUMB : x));
      };
      const draw = () => {
        labels.forEach((l, i) => l.classList.toggle('on', i === value - opt.min));
        el.style.setProperty('--x', `${centres()[value - opt.min] ?? 0}px`);
        el.setAttribute('aria-valuenow', value);
      };
      const set = v => {
        v = Math.max(opt.min, Math.min(opt.max, v));
        if (v === value) return;
        value = v;
        draw();
        settings[meta.id] = { ...settings[meta.id], [key]: v };
        save(meta.id, key, v);
        refreshers.forEach(fn => fn());
      };
      const at = e => {
        const x = e.clientX - el.getBoundingClientRect().left, c = centres();
        const nearest = c.reduce((best, cx, i) => (Math.abs(cx - x) < Math.abs(c[best] - x) ? i : best), 0);
        set(opt.min + nearest);
      };
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        at(e);
      });
      el.addEventListener('pointermove', e => {
        if (e.buttons & 1) at(e);
      });
      el.addEventListener('keydown', e => {
        const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
        if (!step) return;
        e.preventDefault();
        set(value + step);
      });
      // Also redraws when its section opens.
      new ResizeObserver(draw).observe(el);
      refreshers.push(() => {
        value = config(meta, settings)[key];
        draw();
      });
      draw();
    }

    for (const meta of [...registry].sort((a, b) => a.name.localeCompare(b.name))) {
      let card = meta.group && groups[meta.group];
      if (!card) {
        card = document.createElement('section');
        card.dataset.id = meta.group ?? meta.id;
        if (meta.group) groups[meta.group] = card;
        sections[meta.section ?? 'misc'].append(card);
      }
      (parts[card.dataset.id] ??= []).push(meta);
      const metasHere = parts[card.dataset.id];
      const part = meta.group ? document.createElement('div') : card;
      part.className = meta.group ? 'part' : '';
      part.dataset.id = meta.id;
      const setOff = () => reflect(card, metasHere);
      setOff();
      card.classList.toggle('flat', !!meta.flat && !meta.group);
      // Flat: a button per option, and "enabled" is any option on. No name when grouped.
      if (meta.flat) {
        const buttons = meta.options
          .map(o => `<button type="button" class="tog" data-key="${o.key}">${o.label}</button>`)
          .join('');
        part.innerHTML = `
        <div class="row boxes">
          ${meta.group ? '' : `<span class="text"><span class="name">${meta.name}</span></span>`}
          ${buttons}
        </div><div class="status"></div>`;
      } else {
        const more = meta.options.some(o => o.hidden)
          ? `<details class="more"><summary>${meta.moreLabel ?? 'More'}</summary>`
            + `${options(meta.options.filter(o => o.hidden))}</details>`
          : '';
        part.innerHTML = `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${options(meta.options.filter(o => !o.hidden))}${more}<div class="status"></div></div>`;
      }
      if (meta.group) card.append(part);
      for (const btn of part.querySelectorAll('button.tog:not(.opt)')) {
        const key = btn.dataset.key;
        const show = () => {
          const cfg = config(meta, settings);
          btn.setAttribute('aria-pressed', !!cfg[key]);
          setOff();
        };
        show();
        refreshers.push(show);
        btn.addEventListener('click', () => setByUser(meta, key, !config(meta, settings)[key]));
      }
      // Option buttons: a checkbox flips, or one of a 'buttons' choice is picked.
      for (const btn of part.querySelectorAll('button.opt')) {
        const key = btn.dataset.key, pick = btn.dataset.value;
        const value = () => config(meta, settings)[key];
        const show = () => btn.setAttribute('aria-pressed', pick == null ? !!value() : String(value()) === pick);
        show();
        refreshers.push(show);
        btn.addEventListener('click', () => {
          const next = pick ?? !value();
          settings[meta.id] = { ...settings[meta.id], [key]: next };
          save(meta.id, key, next);
          refreshers.forEach(fn => fn());
        });
      }
      statusEls[meta.id] = part.querySelector('.status');
      for (const note of part.querySelectorAll('.micnote')) {
        micNotes.push(note);
        note.addEventListener('click', askMic);
      }
      for (const o of meta.options) {
        const el = o.hideIn && part.querySelector(`[data-key="${o.key}"]`)?.closest('button, label');
        if (el) hideable.push({ el, hideIn: o.hideIn });
      }
      for (const el of part.querySelectorAll('.stops[data-key]')) {
        stops(el, meta, meta.options.find(o => o.key === el.dataset.key));
      }
      for (const box of part.querySelectorAll('input[data-key], select[data-key]')) {
        const key = box.dataset.key, range = box.type === 'range', select = box.tagName === 'SELECT';
        const text = box.type === 'text' || box.type === 'password';
        const opt = meta.options.find(o => o.key === key);
        const show = () => {
          const v = config(meta, settings)[key];
          if (range || select || text) box.value = v;
          else box.checked = !!v;
          if (range) marks(box, opt);
          if (key === 'enabled') setOff();
        };
        show();
        refreshers.push(show);
        if (range) box.addEventListener('input', () => marks(box, opt));
        box.addEventListener('change', () => {
          const value = range ? Number(box.value) : select || text ? box.value : box.checked;
          // Microphone blocked, so it stays off.
          if (key === 'enabled' && value && meta.mic && micState === 'denied') {
            box.checked = false;
            statusEls[meta.id].textContent = 'Microphone blocked: allow it for geoguessr.com from the address bar';
            return;
          }
          settings[meta.id] = { ...settings[meta.id], [key]: value };
          save(meta.id, key, value);
          if (key === 'enabled' && value) {
            // Switching this one on switches off the scripts it can't run beside...
            const clashes = registry.filter(m => meta.excludes?.includes(m.id) || m.excludes?.includes(meta.id));
            for (const ex of clashes) {
              if (!config(ex, settings).enabled) continue;
              settings[ex.id] = { ...settings[ex.id], enabled: false };
              save(ex.id, 'enabled', false);
              autoOff(ex);
            }
            // ...and switches on the (flat) options it wants, which can be switched off again.
            autoOn(meta);
          } else if (key === 'enabled') {
            autoOff(meta);
          }
          refreshers.forEach(fn => fn());
        });
      }
    }

    // While Chaos mode is on it picks the other scripts itself, so their sections are greyed out.
    const chaos = byId.chaos;
    if (chaos) refreshers.push(() => container.classList.toggle('chaos-on', !!config(chaos, settings).enabled));

    const box = search.querySelector('input');
    // The sections' open state before the search, put back when it's cleared.
    let openBefore = null;
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      const secs = [...container.querySelectorAll(':scope > .sec')];
      if (q && !openBefore) openBefore = secs.map(s => s.open);
      // Matched from the start of a word, so "lag" finds Lag but not Draw the flag.
      const words = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      for (const card of container.querySelectorAll('.cards > section')) {
        const text = parts[card.dataset.id]
          .map(m => `${m.name} ${m.description} ${m.flat ? m.options.map(o => o.label).join(' ') : ''}`)
          .join(' ');
        card.hidden = !!q && !words.test(text);
      }
      secs.forEach((s, i) => {
        const any = [...s.querySelectorAll('.cards > section')].some(c => !c.hidden);
        s.hidden = !any;
        if (q) s.open = any;
        else if (openBefore) s.open = openBefore[i];
      });
      if (!q) openBefore = null;
      // A suggestion picked whole: bring its card into view.
      const exact = registry.find(m => m.name.toLowerCase() === q);
      if (exact) container.querySelector(`.cards [data-id="${exact.id}"]`)?.scrollIntoView({ block: 'nearest' });
    });

    // Fills in the section counts.
    refreshers.forEach(fn => fn());

    return {
      setStatus(id, text) {
        if (id === '_mode') {
          for (const h of hideable) h.el.hidden = h.hideIn.includes(text);
        } else if (id === '_mic') {
          micState = text ?? '';
          for (const n of micNotes) n.hidden = !['denied', 'prompt'].includes(micState);
        } else if (statusEls[id]) {
          statusEls[id].textContent = text ?? '';
        }
      },
      update(next) {
        settings = next;
        refreshers.forEach(fn => fn());
      },
    };
  };
})();

// ==================== src/panel.js ================================================
// In-page settings. The OGGS tab (bottom left) or Alt+O opens the popup's form in a panel.
// Saves go to the bridge as a "save" message. It stores them and sends them back as the
// usual "settings" message. settings.panel.hideTab hides the tab for recording.
(() => {
  const ggs = globalThis.__ggs;
  let panel = null, form = null, tab = null, settings = null;

  const save = () => window.postMessage({ ggs: 'save', settings }, location.origin);
  // Uses display, not the hidden attribute, which the tab's inline `all: initial` would beat.
  const showTab = () => {
    if (tab) tab.style.display = settings?.panel?.hideTab ? 'none' : '';
  };

  async function open() {
    if (panel) {
      panel.show(!panel.visible);
      return;
    }
    if (!settings) return;
    // The popup's stylesheet, inlined by the userscript build or fetched from the extension.
    const css = ggs.panelCss
      ?? await fetch(ggs.extBase + 'popup/popup.css').then(r => r.text()).catch(() => '');
    // Opened twice while the fetch was out.
    if (panel) {
      panel.show(true);
      return;
    }
    // Same look as the popup, with its header (logo and title) as the drag bar.
    const paper = 'color: #1c1a2e; background-color: #f5f1e8;'
      + ' background-image: radial-gradient(rgba(28, 26, 46, .09) 1.3px, transparent 1.5px);'
      + ' background-size: 22px 22px; background-position: 11px 11px;';
    panel = ggs.ui.panel({
      id: 'settings',
      title: `<img src="${ggs.extBase}icons/icon-128.png" alt=""><h1>Orlando's GeoGuessr Scripts</h1>`,
      css: `
      ${css.replace(/\bbody\b/g, '.body').replace(/\bmain\b/g, '.scroll')}
      .panel { width: 348px; background: none; border: 0; box-shadow: none; backdrop-filter: none;
               overflow: visible; }
      .head { display: flex; align-items: center; gap: 10px; padding: 14px 10px 0 14px; font: inherit;
              letter-spacing: 0; text-transform: none;
              ${paper} border: 2px solid #1c1a2e; border-bottom: 0; border-radius: 10px 10px 0 0; }
      .head img { width: 32px; height: 32px; }
      .head h1 { flex: 1; margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -.02em; }
      .body { width: auto; padding: 0; border: 2px solid #1c1a2e; border-top: 0;
              border-radius: 0 0 10px 10px; background-position: 11px -3px; }
      .scroll { display: flex; flex-direction: column; gap: 14px; padding: 14px; max-height: 75vh;
                overflow: auto; }
      .close { flex: none; width: 28px; height: 28px; font: 700 16px/1 inherit; color: inherit;
               background: none; border: 0; border-radius: 6px; cursor: pointer; }
      .close:hover { background: rgba(28, 26, 46, .15); }`,
      html: '<div class="scroll"></div>',
    });
    panel.$('.head').insertAdjacentHTML('beforeend', '<button class="close" title="Close (Alt+O)">✕</button>');
    panel.$('.close').addEventListener('click', () => panel.show(false));
    form = ggs.settingsForm(panel.$('.scroll'), { settings, save });
    ggs.onStatus((id, text) => form.setStatus(id, text));
    // Keeps the panel on screen as sections open.
    new ResizeObserver(() => panel.visible && panel.clamp()).observe(panel.$('.panel'));
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
    // Bottom-left corner, over the Street View "Google" mark.
    tab.style.cssText = 'all: initial; position: fixed; left: 0; bottom: 6px; z-index: 2147483000;'
      + ' padding: 6px 10px 6px 8px; border-radius: 0 8px 8px 0; background: #fecd19; color: #1c1a2e;'
      + ' font: 800 11px/1 system-ui, sans-serif; letter-spacing: .04em;'
      + ' cursor: pointer; box-shadow: 3px 3px 0 #1c1a2e; opacity: .85;';
    tab.addEventListener('click', open);
    showTab();
    document.body.append(tab);
  };
  if (document.body) queueMicrotask(ready);
  else document.addEventListener('DOMContentLoaded', ready);
})();

// ==================== src/scripts/nmpz/meta.js ====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'nmpz',
    name: 'Controls',
    description: 'No move, pan or zoom.',
    defaultEnabled: false,
    section: 'controls',
    // the popup shows one unnamed card with a box per option; on when any is ticked
    group: 'controls',
    flat: true,
    options: [
      { key: 'noMove', label: 'No move', type: 'checkbox', default: true },
      { key: 'noPan', label: 'No pan', type: 'checkbox', default: true },
      { key: 'noZoom', label: 'No zoom', type: 'checkbox', default: true },
    ],
  });
})();

// ==================== src/scripts/clean/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'clean',
    name: 'Clean map',
    description: 'Hides map clutter, the logo and the scores.',
    defaultEnabled: false,
    section: 'ui',
    // the popup shows these boxes in one card with the OGGS tab's; on when any is ticked
    group: 'ui',
    flat: true,
    options: [
      { key: 'google', label: 'Clean map', type: 'checkbox', default: false },
      // duels have neither a logo nor a scoreboard
      { key: 'logo', label: 'Remove logo', type: 'checkbox', default: false, hideIn: ['duels'] },
      { key: 'progress', label: 'Remove scoreboard', type: 'checkbox', default: false, hideIn: ['duels'] },
    ],
  });
})();

// ==================== src/scripts/panel/meta.js ===================================
// Not a script: the OGGS tab's own setting (settings.panel.hideTab, read by src/panel.js).
// `ui` keeps boot.js from looking for an implementation.
(() => {
  globalThis.__ggs.registry.push({
    id: 'panel',
    name: 'OGGS tab',
    description: 'Hide the OGGS tab bottom left; Alt+O (Option+O on a Mac) still opens the panel.',
    defaultEnabled: false,
    section: 'ui',
    group: 'ui',
    flat: true,
    ui: true,
    options: [
      {
        key: 'hideTab', label: 'Hide OGGS tab · Alt+O / Option+O reopens',
        type: 'checkbox', default: false,
      },
    ],
  });
})();

// ==================== src/scripts/nmpz/main.js ====================================
// NMPZ: the three locks in core/lock.js, each switched by its own option.
(() => {
  const ggs = globalThis.__ggs;
  function apply(cfg) {
    ggs.lock.move('nmpz', !!cfg?.noMove);
    ggs.lock.pan('nmpz', !!cfg?.noPan);
    ggs.lock.zoom('nmpz', !!cfg?.noZoom);
  }
  ggs.scripts.nmpz = {
    start(cfg) {
      apply(cfg);
      return { stop: () => apply(null), update: apply };
    },
  };
})();

// ==================== src/scripts/draw-guess/meta.js ==============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Draw the country instead of using the map.',
    section: 'guessing',
    defaultEnabled: false,
    // one board over the guess map at a time
    excludes: ['flag-guess'],
    // the guess map is hidden, so its leftover Google bits go too
    turnsOn: [{ id: 'clean', key: 'google' }],
    options: [
      {
        key: 'hardMode', label: 'Hard mode: all 199 countries and territories',
        type: 'checkbox', default: false,
      },
    ],
  });
})();

// ==================== src/scripts/draw-guess/main.js ==============================
// Draw your country: a drawing board (app/) over GeoGuessr's guess map, through core/board.js.
// Sketch the country and pin your spot, and the board snaps the drawing onto the closest real
// country. The pin becomes the guess, and a few seconds after the animation GeoGuessr's own Guess
// button is pressed.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_H = 640, AUTO_GUESS_MS = 6000;

  function start(cfg) {
    let lastToken;

    const board = ggs.board({
      id: 'draw-guess',
      // for the boost, and the flag on the right spot after the guess
      answer: true,
      app: 'src/scripts/draw-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        // the board is 52px taller than it is wide
        const h = Math.min(MAX_H, roomH), w = Math.min(h - 52, roomW);
        return { w, h: boardH ? Math.min(boardH, roomH) : h };
      },
      guessDelay: AUTO_GUESS_MS,
      onMessage(d) {
        if (d.ggs !== 'pool') return;
        ggs.debug(`draw-guess: map "${d.map}" -> ${d.pool} (${d.how}): ${d.count} countries possible`);
      },
      onTick(inRound) {
        if (!inRound || !board.created) return;
        const token = ggs.game.context()?.token;
        if (token === lastToken) return;
        // new game: pick the country pool from the map name
        lastToken = token;
        ggs.game.mapInfo()
          .then(m => (m?.name
            ? board.post({ ggs: 'map', name: m.name })
            : ggs.debug('draw-guess: no map name, using world coverage')))
          .catch(err => ggs.log('draw-guess: could not read the map, using world coverage', err));
      },
    });
    board.post({ ggs: 'hard', on: !!cfg.hardMode });

    return {
      update(next) {
        if (!!next.hardMode !== !!cfg.hardMode) board.post({ ggs: 'hard', on: !!next.hardMode });
        cfg = next;
      },
      stop: board.stop,
    };
  }

  ggs.scripts['draw-guess'] = { start };
})();

// ==================== src/scripts/flag-guess/meta.js ==============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'flag-guess',
    name: 'Draw the flag',
    description: 'Paint the flag instead of using the map.',
    section: 'guessing',
    defaultEnabled: false,
    // one board over the guess map at a time
    excludes: ['draw-guess'],
    // the guess map is hidden, so its leftover Google bits go too
    turnsOn: [{ id: 'clean', key: 'google' }],
    options: [
      {
        key: 'forceInside', label: 'Guess must go inside the matched country',
        type: 'checkbox', default: true,
      },
    ],
  });
})();

// ==================== src/scripts/flag-guess/main.js ==============================
// Draw the flag: a paint board (app/) over GeoGuessr's guess map, through core/board.js.
// Paint the flag and the board finds the country with the closest flag and shows its outline.
// The spot clicked in it becomes the guess, the board zooms out to the right spot, and
// GeoGuessr's own Guess button is pressed.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_W = 620, AUTO_GUESS_MS = 1500;

  function start(cfg) {
    const board = ggs.board({
      id: 'flag-guess',
      // for the flag on the right spot after the guess
      answer: true,
      app: 'src/scripts/flag-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        const w = Math.min(MAX_W, roomW);
        return { w, h: Math.min(boardH || w * 0.9, roomH) };
      },
      guessDelay: AUTO_GUESS_MS,
    });
    board.post({ ggs: 'strict', on: !!cfg.forceInside });

    return {
      update(next) {
        if (!!next.forceInside !== !!cfg.forceInside) board.post({ ggs: 'strict', on: !!next.forceInside });
        cfg = next;
      },
      stop: board.stop,
    };
  }

  ggs.scripts['flag-guess'] = { start };
})();

// ==================== src/scripts/lat-band/meta.js ================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'lat-band',
    name: 'Show latitude',
    description: 'Shows a band of latitude the round is in.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // index into BANDS in core/aid.js
      { key: 'size', label: 'Width (km)', type: 'slider', min: 0, max: 8, default: 5,
        marks: ['Exact', '5', '25', '50', '100', '500', '1000', '2500', 'Hemi'] },
    ],
  });
})();

// ==================== src/scripts/lat-band/main.js ================================
// Latitude band: a strip right round the world between two latitudes (core/aid.js).
(() => {
  const ggs = globalThis.__ggs, { aid } = ggs;
  // the map's Mercator edge
  const clamp = lat => Math.max(-85, Math.min(85, lat));

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#1c7ed6',
    shapes({ loc, rand, cfg }) {
      const [a, b] = aid.band(loc.lat, rand(), cfg.size, 90).map(clamp);
      return [...aid.box(a, b, -180, 180), aid.latLine(a), aid.latLine(b)];
    },
    // for Terrible hints: any size from 5 km to the hemisphere
    random: r => ({ size: 1 + Math.floor(r() * 8) }),
  };
  aid.hints['lat-band'] = hint;
  ggs.scripts['lat-band'] = aid('lat-band', hint);
})();

// ==================== src/scripts/lng-band/meta.js ================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'lng-band',
    name: 'Show longitude',
    description: 'Shows a band of longitude the round is in.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // index into BANDS in core/aid.js
      { key: 'size', label: 'Width (km)', type: 'slider', min: 0, max: 8, default: 5,
        marks: ['Exact', '5', '25', '50', '100', '500', '1000', '2500', 'Hemi'] },
    ],
  });
})();

// ==================== src/scripts/lng-band/main.js ================================
// Longitude band: a strip from pole to pole between two longitudes (core/aid.js).
(() => {
  const ggs = globalThis.__ggs, { aid } = ggs;

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#ae3ec9',
    shapes({ loc, rand, cfg }) {
      const [a, b] = aid.band(loc.lng, rand(), cfg.size, 180);
      return [...aid.box(-85, 85, a, b), aid.lngLine(a), aid.lngLine(b)];
    },
    // for Terrible hints: any size from 5 km to the hemisphere
    random: r => ({ size: 1 + Math.floor(r() * 8) }),
  };
  aid.hints['lng-band'] = hint;
  ggs.scripts['lng-band'] = aid('lng-band', hint);
})();

// ==================== src/scripts/radius/meta.js ==================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'radius',
    name: 'Show area',
    description: 'Shows an area the round is in.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // biggest to smallest; main.js turns the stop into continent / countries / RADII in core/aid.js
      { key: 'area', label: 'Area', type: 'slider', min: 0, max: 12, default: 8,
        steps: ['continent', '5 countries', '4 countries', '3 countries', '2 countries', 'the country',
          '2500 km', '1000 km', '500 km', '100 km', '50 km', '25 km', '5 km'] },
    ],
  });
})();

// ==================== src/scripts/radius/continents.js ============================
// Which continent each country in draw-guess's geo.json is in, for the radius script's
// Continent setting. Russia and Turkey count as Europe, Greenland as North America, the
// Caribbean and Central America as North America.
(() => {
  const ggs = globalThis.__ggs;
  const LIST = {
    Europe: 'ALB AND AUT BEL BGR BIH BLR CHE CYP CZE DEU DNK ESP EST FIN FRA FRO GBR GRC HRV HUN IMN IRL ISL ITA JEY LIE LTU LUX LVA MCO MDA MKD MLT MNE NLD NOR POL PRT ROU RUS SMR SRB SVK SVN SWE TUR UKR VAT',
    Asia: 'AFG ARE ARM AZE BGD BHR BRN BTN CHN CXR GEO HKG IDN IND IRN IRQ ISR JOR JPN KAZ KGZ KHM KOR KWT LAO LBN LKA MAC MDV MMR MNG MYS NPL OMN PAK PHL PRK PSE QAT SAU SGP SYR THA TJK TKM TLS TWN UZB VNM YEM',
    Africa: 'AGO BDI BEN BFA BWA CAF CIV CMR COD COG COM CPV DJI DZA EGY ERI ETH GAB GHA GIN GMB GNB GNQ KEN LBR LBY LSO MAR MDG MLI MOZ MRT MUS MWI NAM NER NGA RWA SDN SEN SLE SOM SSD STP SWZ SYC TCD TGO TUN TZA UGA ZAF ZMB ZWE',
    'North America': 'ATG BHS BLZ BMU BRB CAN CRI CUB CUW DMA DOM GRD GRL GTM HND HTI JAM KNA LCA MEX NIC PAN PRI SLV SPM TTO USA VCT VIR',
    'South America': 'ARG BOL BRA CHL COL ECU FLK GUY PER PRY SGS SUR URY VEN',
    Oceania: 'ASM AUS FJI FSM GUM KIR MHL MNP NRU NZL PCN PLW PNG SLB TON TUV VUT WSM',
  };
  ggs.CONTINENTS = {};
  for (const [name, codes] of Object.entries(LIST)) for (const c of codes.split(' ')) ggs.CONTINENTS[c] = name;
})();

// ==================== src/scripts/radius/main.js ==================================
// Area: a circle the round's location is somewhere inside (core/aid.js), or the whole country or
// continent it's in (draw-guess's geo.json). The country steps can add decoys from the same
// continent, picked with the seeded stream so a reload shows the same ones.
(() => {
  const ggs = globalThis.__ggs;
  const ring = r => r.map(([lng, lat]) => ({ lat, lng }));

  function decoys(pool, real, n, rand) {
    const rest = pool.filter(c => c !== real).sort();
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return rest.slice(0, Math.max(0, n));
  }

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#2b8a3e',
    async shapes({ loc, rand, cfg, status }) {
      // slider stops: 0 continent, 1-5 five down to one country, 6-12 circles from 2500 down to 5 km
      const area = cfg.area ?? 8, continentOnly = area === 0;
      if (area >= 6) {
        const { center, km } = ggs.aid.circle(loc, rand(), 12 - area);
        // core/aid.js adds a ring round it when it's tiny on screen
        return [{ type: 'Circle', center, radius: km * 1000 }];
      }
      const geo = await ggs.aid.loadGeo(), code = ggs.aid.countryAt(geo, loc);
      if (!code) {
        status('Not in any country this round');
        return [];
      }
      const continent = Object.keys(geo).filter(c => ggs.CONTINENTS[c] === ggs.CONTINENTS[code]);
      const codes = continentOnly ? continent : [code, ...decoys(continent, code, 5 - area, rand())];
      // a continent is many countries: fill only, so its inner borders don't show
      return codes.map(c => ({
        type: 'Polygon',
        paths: geo[c].flat().map(ring),
        ...(continentOnly && { strokeWeight: 0 }),
      }));
    },
    // for Terrible hints: any stop, from continent to a 5 km circle
    random: r => ({ area: Math.floor(r() * 13) }),
  };
  ggs.aid.hints.radius = hint;
  ggs.scripts.radius = ggs.aid('radius', hint);
})();

// ==================== src/scripts/guesses/meta.js =================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'guesses',
    name: 'Extra guesses',
    description: 'Drop several pins; the closest one counts.',
    section: 'guessing',
    defaultEnabled: false,
    // the boards hide the map, and wobble moves the pin after each click
    excludes: ['draw-guess', 'flag-guess', 'wobble'],
    options: [
      // index into COUNTS in main.js
      { key: 'pins', label: 'Pins', type: 'slider', min: 0, max: 7, default: 1,
        steps: ['2', '3', '4', '5', '6', '8', '10', 'unlimited'] },
    ],
  });
})();

// ==================== src/scripts/guesses/main.js =================================
// Extra guesses: every click on the guess map leaves a pin that looks just like GeoGuessr's own
// (a copy of its pin element, with the original hidden), so you can't tell which is the guess.
// On Guess, core/aid.js first moves the guess to the pin closest to the round's location. The
// same happens if the script stops mid-round (Chaos mode). Without the location the guess stays
// on the last click. Click a pin to take it back.
(() => {
  const ggs = globalThis.__ggs;
  // the boards' pin (marks.js)
  const PIN = 'M0,0 C-5,-12 -16,-19 -16,-30 A16,16 0 1 1 16,-30 C16,-19 5,-12 0,0Z';
  const OURS = 'data-ggs-pin';
  const FALLBACK = '<svg width="32" height="46" viewBox="-17 -47 34 48">' +
    `<path d="${PIN}" fill="#d9480f" stroke="#fff" stroke-width="2"/></svg>`;
  // GeoGuessr's pin as last seen: its element and its offset from its spot (px)
  let look = null;

  const realPin = () => document.querySelector(
    ggs.maps.GUESS_PIN_SELECTORS.map(s => `${s}:not([${OURS}] *)`).join(', '));

  // Copy GeoGuessr's pin for a click, once it has drawn it (a couple of frames later).
  function copyLook(map, latLng, done) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = realPin();
      const proj = done.projection;
      if (el && proj) {
        // the outermost marker element, and its offset from the clicked spot
        let root = el;
        while (root.parentElement?.matches(ggs.maps.GUESS_PIN_SELECTORS.join(', '))) {
          root = root.parentElement;
        }
        const r = root.getBoundingClientRect();
        const m = map.getDiv().getBoundingClientRect();
        const p = proj.fromLatLngToContainerPixel(latLng);
        look = {
          html: root.outerHTML, dx: r.left - m.left - p.x, dy: r.top - m.top - p.y, w: r.width, h: r.height,
        };
      }
      done(look);
    }));
  }

  // A pin on the map: an OverlayView holding the copy (or the fallback pin), clickable to remove.
  function makePin(ctx, latLng, onClick) {
    const { gm } = ctx;
    const pin = new gm.OverlayView();
    const node = document.createElement('div');
    node.setAttribute(OURS, '');
    node.style.cssText = 'position:absolute;cursor:pointer;';
    gm.OverlayView.preventMapHitsAndGesturesFrom(node);
    node.addEventListener('click', e => {
      e.stopPropagation();
      onClick();
    });
    const dress = l => {
      node.innerHTML = l ? l.html : FALLBACK;
      // the copy sits in our box, which is already where the original was drawn
      if (l) {
        Object.assign(node.firstElementChild.style,
          { position: 'relative', left: '0', top: '0', margin: '0', transform: 'none' });
      }
      const size = l ? { width: `${l.w}px`, height: `${l.h}px` } : { width: '32px', height: '46px' };
      Object.assign(node.style, size);
      pin.offset = l ? [l.dx, l.dy] : [-16, -46];
      pin.draw();
    };
    pin.offset = [-16, -46];
    pin.onAdd = () => pin.getPanes().overlayMouseTarget.append(node);
    pin.draw = () => {
      const p = pin.getProjection()?.fromLatLngToDivPixel(latLng);
      if (p) Object.assign(node.style, { left: `${p.x + pin.offset[0]}px`, top: `${p.y + pin.offset[1]}px` });
    };
    pin.onRemove = () => node.remove();
    pin.getPosition = () => latLng;
    dress(look);
    const later = l => dress(l);
    Object.defineProperty(later, 'projection', { get: () => pin.getProjection() });
    copyLook(ctx.map, latLng, later);
    return pin;
  }

  const COUNTS = [2, 3, 4, 5, 6, 8, 10, Infinity]; // by the Pins slider
  const most = cfg => COUNTS[cfg.pins] ?? 3;
  const show = ctx => {
    const max = most(ctx.cfg);
    const n = ctx.pins.length;
    ctx.note(!n ? '' : max < Infinity ? `${n} of ${max} pins` : `${n} pin${n > 1 ? 's' : ''}`);
  };

  function addPin(ctx, latLng) {
    const pin = ctx.add(makePin(ctx, latLng, () => {
      ctx.remove(pin);
      ctx.pins = ctx.pins.filter(p => p !== pin);
      show(ctx);
    }));
    ctx.pins.push(pin);
  }

  function closest({ loc, pins }) {
    if (!loc || !pins) return null;
    const at = p => ({ lat: p.getPosition().lat(), lng: p.getPosition().lng() });
    return pins.map(at).sort((a, b) => ggs.aid.distance(a, loc) - ggs.aid.distance(b, loc))[0] ?? null;
  }

  ggs.scripts.guesses = ggs.aid('guesses', {
    css: `${ggs.maps.GUESS_PIN_SELECTORS.map(s => `${s}:not([${OURS}] *)`).join(', ')} ` +
      '{ visibility: hidden !important; }',
    round(ctx) {
      ctx.pins = [];
      const at = ggs.maps.lastGuess();
      if (at) addPin(ctx, new ctx.gm.LatLng(at.lat, at.lng));
      show(ctx);
    },
    // the Pins slider turned down: the newest pins go until there are few enough
    tick(ctx) {
      if (ctx.pins.length <= most(ctx.cfg)) return;
      while (ctx.pins.length > most(ctx.cfg)) ctx.remove(ctx.pins.pop());
      show(ctx);
    },
    click(latLng, ctx) {
      if (ctx.pins.length >= most(ctx.cfg)) return; // full: click a pin to free one
      addPin(ctx, latLng);
      show(ctx);
    },
    beforeGuess: closest,
    // GeoGuessr's own pin moves to the closest one, so it's the guess that's left
    stop(ctx) {
      const best = ggs.maps.guessMapElement() && closest(ctx);
      if (best) ggs.maps.placeGuess(best.lat, best.lng, { pan: false });
    },
  });
})();

// ==================== src/scripts/distance/meta.js ================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'distance',
    name: 'Show distance',
    description: 'Shows how far each pin is from the spot.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      { key: 'units', label: 'Units', type: 'buttons', default: 'km',
        choices: [{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }] },
    ],
  });
})();

// ==================== src/scripts/distance/main.js ================================
// Distance: after each click on the guess map, a note says how far that spot is from the round's
// location (core/aid.js). Switched on mid-round, it measures the pin already down.
(() => {
  const ggs = globalThis.__ggs;
  const KM_PER_MILE = 1.609344;

  function format(km, units) {
    const [n, big, small, per] = units === 'mi'
      ? [km / KM_PER_MILE, 'mi', 'yd', 1760]
      : [km, 'km', 'm', 1000];
    if (n < 1) return `${Math.round(n * per).toLocaleString('en')} ${small}`;
    return `${n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString('en')} ${big}`;
  }

  // the last distance is kept, so switching units rewrites the note straight away
  const show = ctx => ctx.note(format(ctx.km, ctx.shownIn = ctx.cfg.units));

  // the clicked spot is kept and measured once the round's location is known
  ggs.scripts.distance = ggs.aid('distance', {
    round(ctx) {
      ctx.km = null;
      ctx.at = ggs.maps.lastGuess();
      ctx.measured = null;
    },
    click(latLng, ctx) {
      ctx.at = { lat: latLng.lat(), lng: latLng.lng() };
      if (!ctx.loc) ctx.note('Distance not known yet');
    },
    tick(ctx) {
      if (ctx.at && ctx.loc && (ctx.measured !== ctx.at || ctx.measuredFrom !== ctx.loc)) {
        ctx.measured = ctx.at;
        ctx.measuredFrom = ctx.loc;
        ctx.km = ggs.aid.distance(ctx.at, ctx.loc);
      }
      if (ctx.km != null && (ctx.shownIn !== ctx.cfg.units || ctx.shownKm !== ctx.km)) {
        ctx.shownKm = ctx.km;
        show(ctx);
      }
    },
  });
})();

// ==================== src/scripts/wobble/meta.js ==================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'wobble',
    name: 'Wobbly pin',
    description: 'Your pin lands somewhere near where you click.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // index into KM in main.js
      { key: 'size', label: 'How far (km)', type: 'slider', min: 0, max: 6, default: 4,
        marks: ['10', '50', '100', '250', '500', '1000', '2500'] },
    ],
  });
})();

// ==================== src/scripts/wobble/main.js ==================================
// Wobbly pin: after each click, once GeoGuessr has placed its pin, the pin moves to a random spot
// within the chosen distance. Plain Math.random: nothing to do with the round's location.
(() => {
  const ggs = globalThis.__ggs;
  const KM = [10, 50, 100, 250, 500, 1000, 2500];

  ggs.scripts.wobble = ggs.aid('wobble', {
    usesLocation: false,
    click(latLng, { cfg }) {
      // the square root spreads spots evenly over the disc
      const km = KM[cfg.size] * Math.sqrt(Math.random());
      const p = ggs.aid.destination({ lat: latLng.lat(), lng: latLng.lng() }, km, 2 * Math.PI * Math.random());
      setTimeout(() => {
        try { ggs.maps.placeGuess(p.lat, p.lng, { pan: false }); } catch {}
      });
    },
  });
})();

// ==================== src/scripts/liar/meta.js ====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'liar',
    name: 'Terrible hints',
    description: 'A random hint each round that has a 50% chance to lie.',
    section: 'guessing',
    defaultEnabled: false,
    options: [],
  });
})();

// ==================== src/scripts/liar/main.js ====================================
// Terrible hints: each round, one of the hint scripts (ggs.aid.hints: latitude band, longitude
// band, area) at a random size, drawn with that hint's colour and name. The pick is seeded by the
// round, so a reload shows the same one. core/aid.js makes it lie half the time, by working it
// out from a made-up spot the real one is outside of.
(() => {
  const ggs = globalThis.__ggs;
  ggs.scripts.liar = ggs.aid('liar', {
    lies: true,
    colour: ctx => ggs.aid.hints[ctx.hint]?.colour,
    name: ctx => ggs.registry.find(m => m.id === ctx.hint)?.name,
    shapes(ctx) {
      const r = ctx.pick(), ids = Object.keys(ggs.aid.hints).sort();
      const hint = ggs.aid.hints[ctx.hint = ids[Math.floor(r() * ids.length)]];
      return hint.shapes({ loc: ctx.loc, rand: ctx.rand, status: ctx.status, cfg: hint.random(r) });
    },
  });
})();

// ==================== src/scripts/ocean/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'ocean',
    name: 'Ocean only',
    description: 'You can only guess in the ocean.',
    section: 'guessing',
    defaultEnabled: false,
    // the boards guess through the button; extra pins and wobble put the guess back on land
    excludes: ['draw-guess', 'flag-guess', 'guesses', 'wobble'],
    options: [],
  });
})();

// ==================== src/scripts/ocean/main.js ===================================
// Ocean only: a click inside any country's outline (draw-guess's geo.json, simplified coastlines)
// takes the pin straight off again, as does switching it on. With no sea pin down, pressing Guess
// does nothing (core/aid.js). The round timer can still guess.
(() => {
  const ggs = globalThis.__ggs;

  ggs.scripts.ocean = ggs.aid('ocean', {
    usesLocation: false,
    round(ctx) {
      ctx.sea = false;
      // fetch the outlines before the first click
      ggs.aid.loadGeo().catch(() => {});
      // switched on mid-round: a pin already down may be on land, so it comes off
      if (!ctx.cleared) {
        ctx.cleared = true;
        ggs.maps.clearGuess();
      }
    },
    click(latLng, ctx) {
      const p = { lat: latLng.lat(), lng: latLng.lng() };
      ggs.aid.loadGeo().then(geo => {
        ctx.sea = !ggs.aid.countryAt(geo, p, { near: false });
        if (ctx.sea) return ctx.note('');
        // wait until GeoGuessr has placed the pin
        setTimeout(() => ggs.maps.clearGuess());
        ctx.note('Ocean only!');
        clearTimeout(ctx.noteTimer);
        ctx.noteTimer = setTimeout(() => ctx.note(''), 2000);
      }, () => ctx.status("Couldn't load the country outlines"));
    },
    beforeGuess(ctx) {
      if (ctx.sea) return null;
      ctx.note('Ocean only! Put a pin in the sea');
      return false;
    },
  });
})();

// ==================== src/scripts/in-country/meta.js ==============================
(() => {
  // Every country in draw-guess's geo.json, by its code there.
  const COUNTRIES = [
    ['AFG', 'Afghanistan'], ['ALB', 'Albania'], ['DZA', 'Algeria'], ['ASM', 'American Samoa'],
    ['AND', 'Andorra'], ['AGO', 'Angola'], ['ATG', 'Antigua and Barbuda'], ['ARG', 'Argentina'],
    ['ARM', 'Armenia'], ['AUS', 'Australia'], ['AUT', 'Austria'], ['AZE', 'Azerbaijan'],
    ['BHR', 'Bahrain'], ['BGD', 'Bangladesh'], ['BRB', 'Barbados'], ['BLR', 'Belarus'],
    ['BEL', 'Belgium'], ['BLZ', 'Belize'], ['BEN', 'Benin'], ['BMU', 'Bermuda'],
    ['BTN', 'Bhutan'], ['BOL', 'Bolivia'], ['BIH', 'Bosnia and Herzegovina'], ['BWA', 'Botswana'],
    ['BRA', 'Brazil'], ['BRN', 'Brunei'], ['BGR', 'Bulgaria'], ['BFA', 'Burkina Faso'],
    ['BDI', 'Burundi'], ['KHM', 'Cambodia'], ['CMR', 'Cameroon'], ['CAN', 'Canada'],
    ['CPV', 'Cape Verde'], ['CAF', 'Central African Republic'], ['TCD', 'Chad'], ['CHL', 'Chile'],
    ['CXR', 'Christmas Island'], ['COL', 'Colombia'], ['COM', 'Comoros'], ['CRI', 'Costa Rica'],
    ['HRV', 'Croatia'], ['CUB', 'Cuba'], ['CUW', 'Curaçao'], ['CYP', 'Cyprus'],
    ['CZE', 'Czech Republic'], ['COD', 'Democratic Republic of the Congo'], ['DNK', 'Denmark'],
    ['DJI', 'Djibouti'], ['DMA', 'Dominica'], ['DOM', 'Dominican Republic'],
    ['TLS', 'East Timor'], ['ECU', 'Ecuador'], ['EGY', 'Egypt'], ['SLV', 'El Salvador'],
    ['GNQ', 'Equatorial Guinea'], ['ERI', 'Eritrea'], ['EST', 'Estonia'], ['SWZ', 'Eswatini'],
    ['ETH', 'Ethiopia'], ['FLK', 'Falkland Islands'], ['FRO', 'Faroe Islands'],
    ['FSM', 'Federated States of Micronesia'], ['FJI', 'Fiji'], ['FIN', 'Finland'],
    ['FRA', 'France'], ['GAB', 'Gabon'], ['GEO', 'Georgia'], ['DEU', 'Germany'], ['GHA', 'Ghana'],
    ['GRC', 'Greece'], ['GRL', 'Greenland'], ['GRD', 'Grenada'], ['GUM', 'Guam'],
    ['GTM', 'Guatemala'], ['GIN', 'Guinea'], ['GNB', 'Guinea-Bissau'], ['GUY', 'Guyana'],
    ['HTI', 'Haiti'], ['HND', 'Honduras'], ['HKG', 'Hong Kong'], ['HUN', 'Hungary'],
    ['ISL', 'Iceland'], ['IND', 'India'], ['IDN', 'Indonesia'], ['IRN', 'Iran'], ['IRQ', 'Iraq'],
    ['IRL', 'Ireland'], ['IMN', 'Isle of Man'], ['ISR', 'Israel'], ['ITA', 'Italy'],
    ['CIV', 'Ivory Coast'], ['JAM', 'Jamaica'], ['JPN', 'Japan'], ['JEY', 'Jersey'],
    ['JOR', 'Jordan'], ['KAZ', 'Kazakhstan'], ['KEN', 'Kenya'], ['KIR', 'Kiribati'],
    ['KWT', 'Kuwait'], ['KGZ', 'Kyrgyzstan'], ['LAO', 'Laos'], ['LVA', 'Latvia'],
    ['LBN', 'Lebanon'], ['LSO', 'Lesotho'], ['LBR', 'Liberia'], ['LBY', 'Libya'],
    ['LIE', 'Liechtenstein'], ['LTU', 'Lithuania'], ['LUX', 'Luxembourg'], ['MAC', 'Macau'],
    ['MDG', 'Madagascar'], ['MWI', 'Malawi'], ['MYS', 'Malaysia'], ['MDV', 'Maldives'],
    ['MLI', 'Mali'], ['MLT', 'Malta'], ['MHL', 'Marshall Islands'], ['MRT', 'Mauritania'],
    ['MUS', 'Mauritius'], ['MEX', 'Mexico'], ['MDA', 'Moldova'], ['MCO', 'Monaco'],
    ['MNG', 'Mongolia'], ['MNE', 'Montenegro'], ['MAR', 'Morocco'], ['MOZ', 'Mozambique'],
    ['MMR', 'Myanmar'], ['NAM', 'Namibia'], ['NRU', 'Nauru'], ['NPL', 'Nepal'],
    ['NLD', 'Netherlands'], ['NZL', 'New Zealand'], ['NIC', 'Nicaragua'], ['NER', 'Niger'],
    ['NGA', 'Nigeria'], ['PRK', 'North Korea'], ['MKD', 'North Macedonia'],
    ['MNP', 'Northern Mariana Islands'], ['NOR', 'Norway'], ['OMN', 'Oman'], ['PAK', 'Pakistan'],
    ['PLW', 'Palau'], ['PSE', 'Palestine'], ['PAN', 'Panama'], ['PNG', 'Papua New Guinea'],
    ['PRY', 'Paraguay'], ['CHN', "People's Republic of China"], ['PER', 'Peru'],
    ['PHL', 'Philippines'], ['PCN', 'Pitcairn Islands'], ['POL', 'Poland'], ['PRT', 'Portugal'],
    ['PRI', 'Puerto Rico'], ['QAT', 'Qatar'], ['COG', 'Republic of the Congo'],
    ['ROU', 'Romania'], ['RUS', 'Russia'], ['RWA', 'Rwanda'], ['KNA', 'Saint Kitts and Nevis'],
    ['LCA', 'Saint Lucia'], ['SPM', 'Saint Pierre and Miquelon'],
    ['VCT', 'Saint Vincent and the Grenadines'], ['WSM', 'Samoa'], ['SMR', 'San Marino'],
    ['SAU', 'Saudi Arabia'], ['SEN', 'Senegal'], ['SRB', 'Serbia'], ['SYC', 'Seychelles'],
    ['SLE', 'Sierra Leone'], ['SGP', 'Singapore'], ['SVK', 'Slovakia'], ['SVN', 'Slovenia'],
    ['SLB', 'Solomon Islands'], ['SOM', 'Somalia'], ['ZAF', 'South Africa'],
    ['SGS', 'South Georgia and the South Sandwich Islands'], ['KOR', 'South Korea'],
    ['SSD', 'South Sudan'], ['ESP', 'Spain'], ['LKA', 'Sri Lanka'], ['SDN', 'Sudan'],
    ['SUR', 'Suriname'], ['SWE', 'Sweden'], ['CHE', 'Switzerland'], ['SYR', 'Syria'],
    ['STP', 'São Tomé and Príncipe'], ['TWN', 'Taiwan'], ['TJK', 'Tajikistan'],
    ['TZA', 'Tanzania'], ['THA', 'Thailand'], ['BHS', 'The Bahamas'], ['GMB', 'The Gambia'],
    ['TGO', 'Togo'], ['TON', 'Tonga'], ['TTO', 'Trinidad and Tobago'], ['TUN', 'Tunisia'],
    ['TUR', 'Turkey'], ['TKM', 'Turkmenistan'], ['TUV', 'Tuvalu'], ['UGA', 'Uganda'],
    ['UKR', 'Ukraine'], ['ARE', 'United Arab Emirates'], ['GBR', 'United Kingdom'],
    ['VIR', 'United States Virgin Islands'], ['USA', 'United States of America'],
    ['URY', 'Uruguay'], ['UZB', 'Uzbekistan'], ['VUT', 'Vanuatu'], ['VAT', 'Vatican City'],
    ['VEN', 'Venezuela'], ['VNM', 'Vietnam'], ['YEM', 'Yemen'], ['ZMB', 'Zambia'],
    ['ZWE', 'Zimbabwe'],
  ];
  globalThis.__ggs.registry.push({
    id: 'in-country',
    name: 'Guess in a country',
    description: 'The whole world is squashed into one country. Guess inside it.',
    section: 'guessing',
    defaultEnabled: false,
    // the boards hide the map; the others move, add or score pins on the real world map
    excludes: ['draw-guess', 'flag-guess', 'ocean', 'guesses', 'wobble', 'drift', 'distance',
      'lat-band', 'lng-band', 'radius', 'liar'],
    options: [
      { key: 'country', label: 'Country', type: 'select', default: 'AUS', choices: [
        { value: 'random', label: 'Random each round' },
        ...COUNTRIES.map(([value, label]) => ({ value, label })),
      ] },
      { key: 'world', label: 'Show the squashed world', type: 'checkbox', default: true },
    ],
  });
})();

// ==================== src/scripts/in-country/main.js ==============================
// Guess in a country: the guess map shows one country (draw-guess's geo.json outlines) with the
// rest of the world greyed out, and the whole world squashed into it. Rows of the country map to
// rows of the world (north to south), and along each row the country's land, gaps skipped, maps
// to -180..180. So a pin in the west of Australia is a guess in the Americas. Clicks outside the
// country take the pin off again. On Guess the pin moves to the world spot it stands for
// (core/aid.js beforeGuess). The round timer running out guesses the unmoved pin.
(() => {
  const ggs = globalThis.__ggs;
  // The world's latitudes that are squashed in: Tierra del Fuego to Greenland.
  const WORLD_S = -56, WORLD_N = 84;
  const ROWS = 2048; // the country's rows cached for squashing the world outlines
  const MAX_STEP = 1; // degrees: world edges are split this fine before squashing, so they bend
  const GREY = '#dee2e6';
  const rad = Math.PI / 180;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2));
  const fromMercY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / rad;
  const names = () => Object.fromEntries(ggs.registry.find(m => m.id === 'in-country').options[0].choices
    .map(c => [c.value, c.label]));

  // Land pieces under this share of the country's biggest are left out (greyed like the rest of
  // the world): Australia's Macquarie and Heard Islands would otherwise stretch its rows to
  // -54 degrees and hold the whole southern world.
  const MIN_PIECE = 0.005;
  // Square degrees: smaller islands of the squashed world are left out, as clutter.
  const MIN_WORLD_PIECE = 1;
  const area = ring => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    return Math.abs(a / 2) * Math.cos(ring[0][1] * rad);
  };

  // A country's shape for squashing: its main pieces (polys, as in geo.json) and their rings in
  // [lng, mercator y], with pieces on the far side of ±180 shifted by 360 so the country is one
  // piece (Russia, Fiji, the Aleutians...).
  function shapeOf(all) {
    const biggest = Math.max(...all.map(([outer]) => area(outer)));
    const polys = all.filter(([outer]) => area(outer) >= MIN_PIECE * biggest);
    const rings = polys.flat();
    const span = list => {
      const xs = list.flat().map(p => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    const mean = r => r.reduce((s, p) => s + p[0], 0) / r.length;
    const shift = by => rings.map(r => (Math.sign(mean(r)) === -Math.sign(by) ? r.map(([x, y]) => [x + by, y]) : r));
    let best = rings;
    if (span(rings) > 180) best = [shift(360), shift(-360)].sort((a, b) => span(a) - span(b))[0];
    const merc = best.map(r => r.map(([x, y]) => [x, mercY(y)]));
    const ys = merc.flat().map(p => p[1]), xs = best.flat().map(p => p[0]);
    return {
      polys, rings: merc, y0: Math.min(...ys), y1: Math.max(...ys),
      bounds: { south: Math.min(...best.flat().map(p => p[1])), north: Math.max(...best.flat().map(p => p[1])),
        west: Math.min(...xs), east: Math.max(...xs) },
      rowCache: new Map(),
    };
  }

  // Where the row at mercator y crosses the country: [[west, east], ...] (even-odd), and their length.
  function row(shape, y) {
    const xs = [];
    for (const r of shape.rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xa, ya] = r[i], [xb, yb] = r[j];
        if ((ya > y) !== (yb > y)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    const segs = [];
    let length = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      segs.push([xs[i], xs[i + 1]]);
      length += xs[i + 1] - xs[i];
    }
    return { segs, length };
  }

  // The nearest row with some land, a little inside the country's top and bottom.
  function rowAt(shape, t) {
    const i = Math.round(Math.min(1, Math.max(0, t)) * (ROWS - 1));
    if (!shape.rowCache.has(i)) {
      let r = null;
      for (let d = 0; d < ROWS && !r?.length; d++) {
        for (const k of [i - d, i + d]) {
          if (k < 0 || k >= ROWS || r?.length) continue;
          r = row(shape, shape.y0 + ((k + 0.5) / ROWS) * (shape.y1 - shape.y0));
          r.y = shape.y0 + ((k + 0.5) / ROWS) * (shape.y1 - shape.y0);
        }
      }
      shape.rowCache.set(i, r);
    }
    return shape.rowCache.get(i);
  }

  const wrap = lng => ((lng + 540) % 360) - 180;

  // A world spot to its place in the country.
  function squash(shape, lat, lng) {
    const t = (Math.min(WORLD_N, Math.max(WORLD_S, lat)) - WORLD_S) / (WORLD_N - WORLD_S);
    const r = rowAt(shape, t);
    let left = ((lng + 180) / 360) * r.length;
    for (const [a, b] of r.segs) {
      if (left <= b - a) return { lat: fromMercY(r.y), lng: wrap(a + left) };
      left -= b - a;
    }
    const last = r.segs[r.segs.length - 1];
    return { lat: fromMercY(r.y), lng: wrap(last[1]) };
  }

  // A pin in the country to the world spot it stands for. null outside the country.
  function unsquash(shape, lat, lng) {
    const y = mercY(lat);
    const t = (y - shape.y0) / (shape.y1 - shape.y0);
    if (t < 0 || t > 1) return null;
    const { segs, length } = row(shape, y);
    let before = 0;
    for (const x of [lng, lng + 360, lng - 360]) {
      before = 0;
      for (const [a, b] of segs) {
        if (x >= a && x <= b) {
          return { lat: WORLD_S + t * (WORLD_N - WORLD_S), lng: -180 + ((before + x - a) / length) * 360 };
        }
        before += b - a;
      }
    }
    return null;
  }

  // Split long edges so a squashed edge bends with the rows it crosses.
  function densify(ring) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / MAX_STEP));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    return out;
  }

  // GeoJSON for the map: grey over everything but the country, its outline, and the squashed world.
  function features(geo, code, shape, world) {
    const own = shape.polys;
    const ring = r => [...r, r[0]];
    // The grey goes right round the world from the country's far side, in steps under 180
    // degrees since Google Maps joins two points the short way. A hair at the far side is left.
    const b = shape.bounds, c = (b.west + b.east) / 2;
    const sea = [-179.9, -90, 0, 90, 179.9].map(d => [wrap(c + d), 85])
      .concat([179.9, 90, 0, -90, -179.9].map(d => [wrap(c + d), -85]));
    sea.push(sea[0]);
    const out = [
      { type: 'Feature', properties: { kind: 'mask' },
        geometry: { type: 'Polygon', coordinates: [sea, ...own.map(([outer]) => ring(outer))] } },
      // the country's own holes (lakes, Lesotho) stay grey
      ...own.flatMap(([, ...holes]) => holes.map(h => ({ type: 'Feature', properties: { kind: 'mask' },
        geometry: { type: 'Polygon', coordinates: [ring(h)] } }))),
      { type: 'Feature', properties: { kind: 'outline' },
        geometry: { type: 'MultiLineString', coordinates: own.flat().map(ring) } },
    ];
    if (world) {
      const land = Object.values(geo).flatMap(polys => polys.map(([outer]) => outer))
        .filter(r => area(r) >= MIN_WORLD_PIECE && r.some(([, lat]) => lat > WORLD_S && lat < WORLD_N))
        .map(r => ring(densify(r).map(([lng, lat]) => {
          const p = squash(shape, lat, lng);
          return [p.lng, p.lat];
        })));
      out.push({ type: 'Feature', properties: { kind: 'world' },
        geometry: { type: 'MultiPolygon', coordinates: land.map(r => [r]) } });
    }
    return { type: 'FeatureCollection', features: out };
  }

  // The grey goes over the squashed world, which hides where a squashed shape jumps a gap
  // between two parts of the country (a bay, the strait to Tasmania).
  const STYLES = {
    world: { fillColor: '#ffffff', fillOpacity: 0.45, strokeColor: '#1c1a2e', strokeWeight: 1, strokeOpacity: 0.55,
      zIndex: 1 },
    mask: { fillColor: GREY, fillOpacity: 0.94, strokeWeight: 0, zIndex: 2 },
    outline: { strokeColor: '#1c1a2e', strokeWeight: 2, strokeOpacity: 0.9, zIndex: 3 },
  };

  const shapes = new Map(); // code -> shape
  const shape = (geo, code) => shapes.get(code) ?? shapes.set(code, shapeOf(geo[code])).get(code);

  // Random each round: a country at least this many square degrees (no Vatican), the same one
  // for everyone in the round and after a reload.
  const MIN_RANDOM_AREA = 20;
  let big = null;
  function countryFor(geo, cfg) {
    if (cfg.country !== 'random') return geo[cfg.country] ? cfg.country : 'AUS';
    big ??= Object.keys(geo).sort().filter(c => {
      const b = shape(geo, c).bounds;
      return (b.east - b.west) * (b.north - b.south) >= MIN_RANDOM_AREA;
    });
    const r = ggs.aid.seeded(`in-country|${ggs.game.context()?.token}|${ggs.game.roundKey()}`)();
    return big[Math.floor(r * big.length)];
  }

  ggs.scripts['in-country'] = ggs.aid('in-country', {
    usesLocation: false,
    attach(ctx) {
      const map = ctx.map;
      const before = { restriction: map.get('restriction') ?? null };
      ctx.drawn = '';
      return () => {
        ctx.layer?.setMap(null);
        ctx.layer = null;
        map.setOptions(before);
      };
    },
    round(ctx) {
      ctx.pin = null;
      ctx.drawn = '';
      ctx.guessed = false;
      // switched on mid-round: a pin already down may be anywhere, so it comes off
      if (!ctx.cleared) {
        ctx.cleared = true;
        ggs.maps.clearGuess();
      }
    },
    tick(ctx) {
      const want = `${ggs.game.roundKey()}|${ctx.cfg.country}|${ctx.cfg.world}`;
      if (ctx.guessed || ctx.drawn === want || ctx.loading) return;
      ctx.loading = true;
      ggs.aid.loadGeo().then(geo => {
        ctx.loading = false;
        if (ctx.guessed || !ctx.map) return;
        const code = countryFor(geo, ctx.cfg);
        const s = shape(geo, code);
        const gm = ctx.gm;
        ctx.layer?.setMap(null);
        ctx.layer = new gm.Data({ map: ctx.map });
        ctx.layer.addGeoJson(features(geo, code, s, ctx.cfg.world));
        ctx.layer.setStyle(f => ({ ...STYLES[f.getProperty('kind')], clickable: false }));
        const b = s.bounds, padLat = (b.north - b.south) * 0.6, padLng = (b.east - b.west) * 0.6;
        ctx.map.setOptions({ restriction: { strictBounds: false, latLngBounds: {
          south: Math.max(-85, b.south - padLat), north: Math.min(85, b.north + padLat),
          west: wrap(b.west - padLng), east: wrap(b.east + padLng) } } });
        ctx.map.fitBounds({ south: b.south, north: b.north, west: wrap(b.west), east: wrap(b.east) }, 10);
        ctx.code = code;
        ctx.shape = s;
        ctx.drawn = want;
      }, () => {
        ctx.loading = false;
        ctx.status("Couldn't load the country outlines");
      });
    },
    click(latLng, ctx) {
      if (!ctx.shape || ctx.guessed) return;
      const lat = latLng.lat(), lng = latLng.lng();
      const p = unsquash(ctx.shape, lat, lng);
      ctx.pin = p;
      if (p) return ctx.note('');
      // wait until GeoGuessr has placed the pin
      setTimeout(() => ggs.maps.clearGuess());
      ctx.note(`Guess inside ${names()[ctx.code] ?? ctx.code}!`);
      clearTimeout(ctx.noteTimer);
      ctx.noteTimer = setTimeout(() => ctx.note(''), 2000);
    },
    beforeGuess(ctx) {
      if (!ctx.shape) return null;
      if (!ctx.pin) {
        ctx.note(`Put a pin inside ${names()[ctx.code] ?? ctx.code}`);
        return false;
      }
      // the guess goes out on the real world map, so the country view comes off
      ctx.guessed = true;
      ctx.layer?.setMap(null);
      ctx.map.setOptions({ restriction: null });
      return ctx.pin;
    },
    stop(ctx) {
      clearTimeout(ctx.noteTimer);
      // a pin in the country isn't a real guess
      if (ctx.pin && !ctx.guessed) ggs.maps.clearGuess();
    },
  });
})();

// ==================== src/scripts/blind/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'blind',
    name: 'Blind map',
    description: 'The guess map goes blank.',
    section: 'guessing',
    defaultEnabled: false,
    excludes: ['draw-guess', 'flag-guess', 'drift'],
    options: [
      { key: 'grid', label: 'Grid lines', type: 'checkbox', default: true },
    ],
  });
})();

// ==================== src/scripts/blind/main.js ===================================
// Blind map: a plain tile layer over the guess map, the whole world in view, and dragging,
// zooming and the controls off. It's an overlay map type, so it works with any map style, and
// pins and lines still draw on top. The view is reset whenever the map resizes (it grows on
// hover) or GeoGuessr resets its options.
(() => {
  const ggs = globalThis.__ggs;
  const WORLD = { north: 72, south: -58, west: -180, east: 180 };
  const LOCKED = {
    gestureHandling: 'none',
    disableDefaultUI: true,
    keyboardShortcuts: false,
    disableDoubleClickZoom: true,
    scrollwheel: false,
    draggable: false,
  };

  let tile = null;
  function blankTile() {
    if (!tile) {
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const g = c.getContext('2d');
      g.fillStyle = '#e9e4d8';
      g.fillRect(0, 0, 256, 256);
      tile = c.toDataURL();
    }
    return tile;
  }

  function lockView(ctx) {
    const { map } = ctx, div = map.getDiv(), size = `${div.offsetWidth}x${div.offsetHeight}`;
    if (size !== ctx.size || map.get('draggable') !== false) {
      ctx.size = size;
      map.setOptions(LOCKED);
      map.fitBounds(WORLD, 0);
    }
  }

  ggs.scripts.blind = ggs.aid('blind', {
    usesLocation: false,
    attach({ map, gm }) {
      // GeoGuessr's own values, put back on stop
      const saved = Object.fromEntries(Object.keys(LOCKED).map(k => [k, map.get(k)]));
      const layer = new gm.ImageMapType({
        getTileUrl: blankTile,
        tileSize: new gm.Size(256, 256),
        name: 'blind',
      });
      map.overlayMapTypes.push(layer);
      return () => {
        const i = map.overlayMapTypes.getArray().indexOf(layer);
        if (i >= 0) map.overlayMapTypes.removeAt(i);
        map.setOptions(saved);
      };
    },
    // a new round has cleared the lines
    round(ctx) { ctx.grid = null; },
    tick(ctx) {
      lockView(ctx);
      // grid lines follow the option live
      if (!!ctx.cfg.grid === !!ctx.grid) return;
      if (ctx.grid) {
        ctx.grid.forEach(ctx.remove);
        ctx.grid = null;
        return;
      }
      const faint = { strokeOpacity: .18, strokeWeight: 1 };
      const line = shape => ctx.grid.push(ctx.add({ ...shape, ...faint }));
      ctx.grid = [];
      for (let lat = -60; lat <= 60; lat += 30) line(ggs.aid.latLine(lat));
      for (let lng = -150; lng <= 180; lng += 30) line(ggs.aid.lngLine(lng));
    },
  });
})();

// ==================== src/scripts/drift/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'drift',
    name: 'Drifting map',
    description: 'The guess map keeps sliding about.',
    section: 'guessing',
    defaultEnabled: false,
    excludes: ['draw-guess', 'flag-guess'],
    options: [
      // index into SPEED in main.js
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 2, default: 1, marks: ['Less', 'More'] },
    ],
  });
})();

// ==================== src/scripts/drift/main.js ===================================
// Drifting map: the guess map's centre moves a little every frame, in a direction that wanders
// slowly and turns back near the top or bottom of the world. setCenter doesn't animate, so frames
// don't cancel each other. Zoom is locked where it was (GeoGuessr's values put back after), which
// makes it harder and stops the moving centre fighting Google's zoom animation.
(() => {
  const ggs = globalThis.__ggs;
  // screen pixels per frame
  const SPEED = [0.6, 1.4, 3];
  const LOCK = ['minZoom', 'maxZoom', 'scrollwheel', 'disableDoubleClickZoom', 'zoomControl'];

  ggs.scripts.drift = ggs.aid('drift', {
    usesLocation: false,
    attach(ctx) {
      // This map, not ctx.map: by the time cleanup runs, ctx.map may already be the next one.
      const map = ctx.map;
      let angle = Math.random() * 2 * Math.PI, frame;
      const saved = Object.fromEntries(LOCK.map(k => [k, map.get(k)]));
      const z0 = map.getZoom();
      map.setOptions({
        minZoom: z0,
        maxZoom: z0,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        zoomControl: false,
      });
      const step = () => {
        frame = requestAnimationFrame(step);
        const c = map.getCenter(), z = map.getZoom();
        if (!c || z == null) return;
        angle += (Math.random() - 0.5) * 0.15;
        // turn back near the poles (screen y points down)
        if ((c.lat() > 60 && Math.sin(angle) < 0) || (c.lat() < -50 && Math.sin(angle) > 0)) angle = -angle;
        const v = SPEED[ctx.cfg.speed] ?? SPEED[1];
        const deg = 360 / (256 * 2 ** z); // degrees of longitude per pixel
        map.setCenter({
          lat: c.lat() - v * Math.sin(angle) * deg * Math.cos(c.lat() * Math.PI / 180),
          lng: c.lng() + v * Math.cos(angle) * deg,
        });
      };
      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        map.setOptions(saved);
      };
    },
  });
})();

// ==================== src/scripts/radio/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'radio',
    name: 'Radio mode',
    description: 'Hear a local radio station instead of Street View.',
    section: 'misc',
    defaultEnabled: false,
    options: [
      { key: 'showStreetView', label: 'Show Street View', type: 'checkbox', default: false },
      {
        key: 'streamerMode', label: 'Streamer / YouTube mode: talk & news stations only',
        type: 'checkbox', default: false,
      },
    ],
  });
})();

// ==================== src/scripts/radio/shapes.js =================================
// Generated by dev/tools/radio_shapes.py: country outlines for radio mode, each 64 points as flat [x, y, ...] in -100..100.
(() => { globalThis.__ggs.radioShapes = [[-2,-46,8,-44,8,-37,9,-36,19,-35,32,-35,36,-29,47,-32,56,-32,62,-30,75,-23,88,-25,100,-20,94,-13,95,-6,82,-1,78,9,72,20,68,8,79,-5,74,-5,63,3,52,1,43,14,49,18,45,36,35,46,40,31,30,23,21,22,7,27,-7,21,-18,25,-30,23,-39,17,-50,14,-56,22,-68,21,-74,31,-74,44,-83,43,-86,33,-90,25,-96,14,-100,1,-97,-9,-99,-24,-87,-23,-93,-18,-87,-12,-79,-16,-75,-18,-66,-22,-54,-25,-49,-28,-41,-27,-44,-17,-34,-20,-39,-31,-36,-31,-28,-27,-26,-36,-23,-38,-11,-42],[6,-63,15,-56,20,-49,28,-45,36,-55,40,-46,34,-40,22,-38,26,-34,14,-30,15,-25,9,-15,14,-3,27,4,38,13,45,26,46,13,51,-2,49,-16,56,-22,68,-17,68,-8,75,-7,80,-14,84,-6,86,2,91,8,90,15,100,17,91,28,74,31,66,40,54,53,41,63,38,52,26,39,10,35,-6,34,-26,34,-46,34,-59,32,-65,28,-69,21,-70,19,-73,15,-74,5,-85,-9,-96,-15,-100,-30,-100,-50,-87,-51,-78,-55,-81,-51,-69,-57,-60,-55,-45,-52,-36,-46,-23,-42,-18,-50,-15,-49,1,-47,6,-48,7,-47,10,-54],[58,-68,72,-67,78,-55,88,-49,98,-46,100,-39,90,-32,88,-24,79,-18,69,-13,57,-7,60,-16,49,-9,50,-1,62,-1,55,4,55,14,57,22,58,27,59,32,56,38,51,46,47,52,41,59,32,60,25,65,19,68,14,65,5,58,-4,60,-9,64,-16,58,-21,51,-18,39,-25,34,-34,35,-45,38,-53,38,-64,36,-74,28,-84,23,-84,13,-91,5,-96,-1,-100,-11,-90,-16,-79,-21,-79,-32,-72,-36,-62,-41,-54,-50,-45,-44,-40,-33,-28,-29,-17,-23,-3,-21,9,-22,23,-25,29,-33,41,-37,53,-40,42,-45,44,-53,53,-59],[-29,-100,-28,-87,-17,-85,-8,-89,5,-88,14,-99,19,-86,16,-76,11,-68,20,-66,26,-66,35,-72,46,-68,49,-61,56,-64,71,-62,83,-54,96,-49,99,-34,91,-22,84,-12,78,-4,78,10,74,24,67,36,58,44,49,45,37,51,29,57,29,70,21,82,11,91,18,82,12,89,4,100,-1,89,-12,83,-11,76,0,67,-1,58,-5,49,-12,40,-19,32,-17,20,-22,9,-31,3,-38,-5,-51,-11,-56,-23,-67,-21,-81,-19,-86,-24,-95,-29,-99,-41,-91,-52,-79,-56,-77,-71,-76,-80,-72,-85,-64,-83,-53,-83,-50,-91,-48,-97,-36,-100],[-91,-51,-77,-51,-62,-51,-48,-51,-33,-51,-19,-51,-4,-51,7,-49,20,-47,33,-44,43,-37,47,-25,51,-21,61,-27,73,-33,87,-35,95,-43,100,-34,93,-29,87,-22,87,-19,77,-15,75,-9,71,-8,70,-2,69,-9,67,-4,68,-3,67,1,70,6,67,6,67,9,62,15,55,21,50,29,53,41,55,47,50,51,47,42,42,33,32,31,27,30,21,32,20,35,12,34,4,34,-2,39,-6,47,-13,45,-20,33,-31,33,-41,25,-53,27,-67,21,-77,17,-87,10,-94,-1,-94,-2,-100,-13,-100,-26,-98,-39,-100,-44,-95,-45,-94,-43],[-8,-76,3,-72,12,-71,15,-66,9,-56,20,-49,31,-41,39,-50,40,-64,42,-75,48,-72,51,-59,59,-52,62,-39,70,-30,78,-21,84,-14,91,-5,98,6,100,20,97,33,90,44,85,55,82,68,69,73,62,76,57,71,47,75,34,71,28,60,24,56,18,56,22,47,17,48,8,53,3,44,-7,38,-20,36,-33,40,-47,44,-58,49,-71,51,-84,55,-93,47,-90,37,-94,23,-99,11,-100,6,-97,4,-100,-9,-97,-14,-86,-23,-73,-27,-61,-32,-56,-44,-50,-44,-45,-48,-43,-53,-40,-59,-34,-62,-27,-54,-19,-56,-17,-66,-9,-71],[-40,-99,-30,-97,-24,-85,-26,-77,-17,-68,-16,-58,-8,-48,7,-43,21,-39,36,-35,41,-47,48,-38,64,-38,68,-46,81,-55,95,-58,99,-50,100,-41,87,-34,82,-20,76,-11,70,-4,64,-12,64,-19,63,-26,51,-31,41,-36,43,-26,43,-16,45,-2,40,0,35,1,26,12,19,16,7,28,-4,40,-16,46,-16,61,-19,74,-23,86,-28,94,-39,99,-43,90,-49,75,-55,59,-61,45,-66,30,-67,18,-69,3,-68,-4,-74,5,-89,2,-88,-6,-93,-9,-100,-16,-87,-19,-83,-28,-91,-39,-80,-46,-67,-55,-58,-68,-50,-79,-58,-89,-56,-98],[3,-100,10,-92,19,-87,28,-81,30,-73,28,-65,38,-63,46,-68,50,-76,52,-67,45,-61,38,-54,32,-46,30,-36,28,-26,28,-16,33,-9,36,0,30,9,19,12,9,12,8,18,4,27,-6,25,-7,34,-1,34,-5,36,-7,41,-11,50,-18,55,-19,64,-12,70,-16,75,-22,84,-28,86,-30,92,-28,97,-31,100,-42,99,-46,92,-52,87,-49,79,-46,70,-43,61,-42,53,-41,49,-43,41,-43,33,-44,23,-41,14,-40,5,-38,-4,-36,-14,-33,-23,-36,-32,-35,-41,-34,-50,-30,-60,-25,-68,-26,-78,-21,-86,-19,-95,-12,-100,-4,-95],[10,-53,20,-52,26,-45,34,-44,38,-40,48,-46,53,-40,60,-30,66,-19,73,-21,83,-21,91,-13,100,-11,100,-3,94,5,86,9,79,15,77,23,66,25,69,34,67,43,60,41,48,40,37,38,30,42,21,45,11,52,6,53,-2,48,-5,40,-14,35,-26,34,-34,26,-44,21,-55,26,-55,38,-55,50,-62,46,-72,48,-76,39,-81,30,-78,27,-72,21,-69,14,-76,9,-87,13,-91,10,-99,3,-100,-7,-96,-16,-91,-18,-82,-25,-72,-25,-63,-19,-56,-18,-46,-21,-37,-17,-27,-21,-34,-28,-28,-36,-27,-40,-23,-44,-12,-46,-1,-49],[-86,-65,-75,-60,-62,-56,-48,-55,-38,-58,-25,-54,-17,-44,-6,-39,4,-43,12,-32,19,-21,31,-15,29,-5,28,9,30,15,32,23,40,34,48,38,60,38,71,37,76,28,82,18,95,16,100,21,96,31,92,38,85,42,73,44,75,52,67,57,63,65,53,55,48,54,39,58,26,55,14,50,2,43,-10,38,-21,30,-22,20,-25,8,-34,-2,-41,-8,-45,-14,-50,-21,-57,-30,-67,-38,-73,-50,-81,-56,-84,-51,-77,-40,-71,-30,-65,-22,-59,-12,-54,-4,-52,6,-61,-3,-67,-14,-75,-22,-85,-28,-80,-32,-88,-42,-95,-52,-100,-63],[58,-99,69,-98,66,-90,67,-79,62,-70,59,-61,66,-53,73,-45,76,-35,78,-24,80,-15,81,-4,81,7,81,17,80,25,84,35,92,40,100,46,97,54,88,60,79,66,69,72,60,78,52,85,44,93,34,97,23,99,16,97,11,89,2,85,-4,77,-13,71,-22,64,-30,57,-39,51,-48,44,-57,38,-66,31,-75,25,-84,19,-93,13,-100,6,-100,-5,-92,-13,-83,-17,-74,-20,-65,-25,-56,-30,-52,-37,-45,-42,-36,-45,-27,-47,-30,-55,-32,-65,-34,-75,-31,-80,-21,-85,-12,-90,-2,-94,9,-95,19,-97,30,-98,40,-96,49,-99],[47,-100,60,-99,69,-91,81,-93,90,-87,96,-79,100,-69,95,-59,87,-50,84,-38,79,-26,77,-15,79,-3,81,9,82,22,90,32,96,44,83,46,74,52,73,63,71,76,76,87,86,87,85,100,75,96,66,88,57,80,47,84,37,77,27,77,18,74,6,76,4,65,0,53,0,40,-8,34,-17,30,-26,37,-35,41,-47,41,-53,29,-59,19,-72,19,-85,18,-98,19,-100,13,-93,5,-84,3,-77,8,-67,-1,-60,-11,-58,-23,-50,-33,-44,-43,-42,-56,-39,-69,-34,-81,-33,-93,-23,-99,-12,-92,1,-90,10,-95,23,-97,36,-98],[44,-100,49,-92,56,-99,63,-99,67,-97,72,-99,87,-92,75,-87,87,-82,76,-73,70,-83,54,-81,47,-64,30,-67,18,-71,11,-61,-1,-55,-11,-44,-18,-27,-24,-12,-26,5,-38,16,-38,35,-35,52,-37,69,-43,87,-49,76,-56,86,-68,100,-81,94,-80,85,-84,83,-81,73,-75,63,-84,74,-86,63,-84,53,-69,51,-79,52,-87,42,-80,40,-78,33,-69,30,-74,24,-65,21,-58,14,-45,11,-52,15,-49,1,-40,-10,-38,-16,-28,-27,-28,-36,-17,-43,-16,-46,-17,-54,-10,-56,-8,-62,1,-75,9,-82,16,-84,18,-83,24,-88,36,-86],[-28,-47,-19,-45,-11,-42,-8,-34,0,-30,8,-33,17,-32,25,-29,30,-23,39,-22,48,-23,56,-25,63,-30,72,-30,80,-29,80,-22,76,-13,78,-9,86,-8,94,-10,100,-4,99,2,91,2,84,5,79,10,71,14,64,18,56,17,50,21,52,28,45,34,39,39,30,41,21,42,12,46,5,47,-2,46,-11,43,-18,39,-27,39,-36,38,-45,38,-50,31,-53,24,-61,20,-69,17,-78,16,-81,9,-80,1,-84,-7,-90,-11,-97,-15,-100,-21,-93,-25,-87,-29,-80,-33,-72,-36,-66,-35,-59,-32,-52,-28,-44,-28,-36,-29,-36,-36,-34,-44],[-59,-83,-49,-82,-40,-78,-32,-73,-24,-67,-16,-61,-8,-55,1,-52,10,-51,20,-50,27,-45,34,-41,39,-34,45,-28,49,-22,49,-14,54,-6,59,-1,65,6,71,13,80,15,90,17,98,19,100,28,97,37,93,46,84,49,75,52,66,56,56,57,46,59,37,60,28,65,23,74,16,75,7,74,-3,72,-12,73,-19,74,-22,83,-26,76,-32,68,-37,60,-41,51,-47,44,-54,38,-58,30,-59,20,-62,12,-66,4,-74,-1,-77,-10,-82,-18,-87,-26,-93,-34,-99,-41,-100,-47,-96,-53,-87,-53,-80,-60,-72,-64,-74,-71,-77,-77,-68,-80],[10,-100,12,-90,14,-81,17,-73,15,-65,13,-56,11,-47,6,-37,4,-28,4,-19,6,-9,4,0,0,9,-1,19,-3,28,-4,38,-2,47,-4,51,-2,59,-5,68,-9,76,-9,85,-4,91,6,93,9,94,1,100,-5,99,-2,97,-8,97,-5,96,-9,96,-13,93,-6,94,-7,91,-12,89,-16,83,-12,86,-13,81,-13,77,-15,72,-11,69,-14,67,-17,61,-17,59,-12,57,-12,59,-10,55,-7,50,-8,42,-6,36,-9,34,-12,27,-10,16,-9,7,-5,-3,-2,-13,-2,-24,0,-34,1,-44,3,-55,3,-66,5,-76,5,-87,4,-98],[-96,-91,-88,-83,-76,-80,-66,-87,-57,-86,-58,-79,-50,-72,-44,-63,-34,-57,-22,-52,-10,-54,2,-56,2,-61,12,-66,23,-70,35,-72,45,-67,56,-64,65,-57,76,-52,79,-43,77,-31,73,-23,74,-14,73,-4,74,8,83,13,81,24,76,34,82,44,92,51,96,61,100,68,91,73,84,82,79,91,69,88,57,87,45,84,37,78,33,67,21,68,11,74,-1,70,-11,63,-21,57,-28,48,-32,38,-39,28,-49,26,-50,29,-59,25,-63,16,-64,5,-72,-3,-80,-10,-87,-19,-84,-29,-81,-38,-85,-43,-91,-52,-96,-63,-98,-72,-100,-83],[-27,-95,-15,-95,-4,-91,6,-84,16,-77,26,-70,36,-63,46,-56,56,-50,63,-41,72,-34,83,-30,87,-22,95,-19,100,-13,100,-1,99,11,96,22,87,28,76,29,64,30,54,33,43,32,32,37,23,43,13,47,8,55,-2,55,-6,63,-12,71,-16,81,-19,91,-27,92,-33,89,-39,94,-48,95,-53,85,-54,79,-60,70,-66,68,-76,69,-85,69,-90,66,-92,55,-97,48,-100,37,-96,30,-88,28,-79,27,-67,27,-59,27,-47,27,-35,27,-23,27,-17,19,-21,8,-22,-4,-23,-16,-25,-28,-26,-40,-27,-52,-28,-64,-30,-76,-31,-88],[-3,-100,6,-95,14,-88,20,-80,26,-75,36,-77,47,-75,53,-69,47,-59,55,-54,46,-55,35,-51,26,-45,21,-37,17,-28,13,-20,15,-12,21,-3,24,3,31,9,42,8,48,5,48,16,54,20,62,25,68,35,66,44,67,55,62,63,62,73,66,80,59,88,57,96,49,100,40,93,32,86,22,81,12,76,2,71,-6,63,-13,55,-14,46,-19,36,-24,27,-30,18,-35,8,-40,-2,-45,-12,-51,-22,-59,-29,-67,-36,-67,-44,-68,-54,-60,-62,-58,-57,-57,-53,-48,-49,-41,-50,-37,-60,-32,-67,-22,-71,-12,-77,-6,-86,-3,-94],[41,-100,47,-96,56,-91,66,-92,74,-93,83,-90,88,-82,89,-72,91,-62,97,-54,92,-48,82,-49,73,-45,63,-42,66,-33,57,-29,48,-23,40,-17,31,-16,22,-13,13,-8,5,-2,4,9,3,17,-4,21,-13,24,-23,22,-28,28,-34,36,-39,44,-42,54,-50,60,-57,67,-62,76,-63,87,-68,95,-76,100,-86,99,-97,100,-95,91,-89,83,-86,73,-84,69,-78,61,-71,54,-70,44,-66,34,-58,28,-53,19,-48,10,-38,8,-29,3,-21,-4,-14,-11,-8,-20,-10,-29,-9,-40,-4,-49,0,-58,8,-65,17,-69,26,-74,32,-83,36,-93],[16,-84,25,-83,37,-83,50,-83,62,-83,74,-83,82,-77,85,-69,86,-57,88,-45,96,-37,100,-30,90,-24,83,-17,80,-6,76,6,76,18,73,29,66,37,59,47,57,59,50,64,47,76,45,67,36,59,36,47,31,41,24,45,26,56,19,65,9,72,-1,67,-9,72,-19,78,-29,74,-41,75,-50,69,-59,65,-66,73,-70,84,-81,84,-80,73,-85,63,-89,52,-94,43,-100,35,-97,27,-94,17,-92,8,-87,-3,-76,-4,-76,-17,-76,-29,-76,-41,-76,-53,-68,-57,-64,-66,-64,-78,-56,-83,-44,-83,-32,-83,-19,-83,-7,-83,5,-83],[-72,-96,-60,-92,-49,-93,-37,-89,-26,-85,-22,-74,-11,-69,1,-67,12,-63,22,-56,33,-59,37,-70,36,-81,44,-89,56,-93,67,-92,76,-86,86,-82,98,-80,99,-72,99,-60,98,-49,100,-37,100,-25,100,-13,100,-1,100,11,100,23,100,36,100,48,100,60,100,72,100,84,97,93,87,95,81,96,70,91,59,85,49,79,38,73,27,67,17,61,6,56,-4,50,-15,44,-26,48,-36,54,-46,49,-57,45,-69,42,-74,31,-85,27,-93,21,-98,10,-98,0,-97,-10,-95,-22,-96,-34,-98,-46,-100,-55,-91,-63,-92,-74,-83,-82,-74,-89],[74,-98,85,-94,90,-83,100,-78,100,-66,88,-61,75,-63,63,-61,68,-52,64,-42,73,-34,81,-27,71,-19,70,-7,63,3,55,13,46,23,38,33,27,39,16,37,8,48,13,57,16,69,23,77,26,89,15,90,3,91,-5,96,-16,98,-22,88,-29,79,-36,73,-42,75,-55,77,-67,75,-79,77,-91,78,-92,68,-85,58,-74,53,-79,47,-79,33,-91,27,-98,16,-100,10,-87,14,-73,14,-60,14,-47,12,-34,7,-33,-6,-23,-12,-15,-17,-3,-19,4,-27,8,-39,15,-46,17,-53,27,-58,32,-68,31,-80,35,-89,47,-95,61,-96],[58,-88,70,-87,82,-86,85,-74,89,-63,91,-51,90,-39,83,-38,76,-28,80,-18,90,-17,97,-22,100,-15,97,-3,90,6,82,14,76,25,70,35,61,44,53,53,44,61,35,69,24,74,12,76,3,79,-8,79,-20,80,-31,80,-42,84,-54,86,-64,88,-73,84,-78,83,-79,72,-85,62,-79,54,-83,43,-89,33,-94,22,-98,10,-100,1,-93,-3,-87,5,-75,6,-65,4,-59,-4,-59,-16,-59,-28,-59,-40,-58,-51,-51,-42,-49,-30,-46,-23,-35,-25,-26,-33,-21,-44,-11,-41,0,-37,11,-41,15,-52,25,-58,30,-69,39,-76,48,-83],[15,-100,19,-93,9,-87,1,-78,-2,-66,-1,-60,6,-51,6,-39,16,-35,28,-35,38,-29,47,-25,60,-25,64,-19,61,-7,64,4,63,14,67,20,72,31,70,31,62,28,56,30,43,30,37,36,45,41,36,43,36,54,42,63,40,76,38,88,36,100,28,97,32,87,28,80,17,78,6,80,-3,75,-9,66,-18,59,-27,51,-37,47,-47,48,-57,42,-67,36,-72,28,-68,21,-58,16,-52,6,-55,1,-54,-9,-53,-19,-54,-29,-60,-39,-54,-44,-54,-54,-48,-45,-46,-55,-37,-63,-33,-72,-29,-79,-19,-83,-16,-85,-5,-86,6,-93],[49,-79,59,-78,69,-76,77,-69,86,-71,90,-66,91,-56,96,-47,100,-39,99,-30,98,-20,97,-10,96,0,94,10,88,18,81,25,75,34,70,43,71,52,62,56,54,61,44,57,34,57,24,60,16,64,6,62,-3,57,-12,61,-19,56,-28,52,-37,52,-47,53,-51,62,-57,70,-57,79,-65,72,-73,73,-76,72,-79,66,-87,64,-90,57,-95,53,-100,44,-100,35,-90,34,-81,31,-71,31,-62,30,-54,25,-50,16,-49,6,-49,-4,-49,-15,-45,-22,-35,-24,-26,-28,-19,-34,-11,-41,-3,-47,6,-53,15,-58,23,-63,32,-69,41,-74],[17,-100,24,-98,32,-92,39,-87,40,-79,41,-72,41,-63,44,-55,37,-52,32,-51,26,-47,25,-41,26,-32,21,-25,14,-19,8,-16,5,-11,2,-7,-2,-2,-2,6,-3,13,-3,22,3,26,9,33,4,41,5,43,-1,49,-9,52,-7,56,-8,65,-8,74,-10,83,-15,89,-22,91,-24,100,-33,100,-34,91,-34,85,-36,78,-39,70,-42,62,-44,54,-43,46,-41,42,-38,34,-35,25,-36,17,-35,10,-37,2,-38,-8,-39,-17,-35,-25,-26,-27,-26,-34,-24,-42,-21,-51,-19,-58,-14,-65,-9,-73,-8,-80,-2,-87,3,-90,9,-93,17,-93],[58,-100,57,-90,58,-79,59,-70,59,-58,62,-52,59,-42,52,-32,44,-25,34,-21,24,-16,15,-8,8,-1,0,6,-9,13,-11,20,-6,30,-3,42,-1,44,-1,55,-1,64,-8,73,-19,77,-29,82,-34,91,-32,97,-40,100,-42,90,-42,79,-44,67,-48,56,-51,45,-42,37,-37,28,-32,18,-33,7,-31,-3,-31,-14,-31,-26,-42,-29,-52,-34,-61,-37,-62,-48,-50,-51,-39,-55,-28,-59,-20,-53,-12,-49,-15,-38,-11,-29,-5,-21,-4,-31,3,-38,3,-50,-3,-59,-12,-67,-14,-78,-11,-89,0,-89,10,-88,21,-88,30,-93,41,-95,51,-99],[-34,-78,-26,-72,-17,-75,-9,-73,0,-71,8,-66,14,-59,21,-52,27,-45,21,-37,19,-28,25,-25,34,-25,32,-17,38,-10,43,-2,51,3,60,6,69,9,78,12,87,15,97,16,100,19,93,25,86,32,79,39,73,46,66,53,59,58,50,58,41,60,33,66,24,68,16,71,7,69,-1,70,-9,75,-17,78,-27,76,-35,73,-43,68,-52,65,-61,62,-62,54,-69,50,-74,42,-78,34,-85,27,-91,21,-100,18,-95,10,-86,9,-85,0,-84,-10,-83,-19,-76,-22,-73,-30,-69,-39,-64,-47,-58,-51,-55,-60,-52,-70,-44,-72,-38,-70],[-32,-100,-23,-96,-14,-91,-6,-87,3,-82,12,-78,20,-73,29,-69,38,-64,46,-60,55,-56,64,-51,64,-41,64,-32,64,-22,64,-12,62,-3,53,-3,49,5,45,12,42,19,41,28,40,35,45,40,47,49,50,56,42,58,36,64,29,70,23,77,14,80,4,81,3,87,-4,93,-14,94,-22,98,-28,97,-37,100,-41,93,-46,85,-53,79,-57,71,-48,69,-38,69,-43,62,-45,52,-45,43,-49,35,-56,30,-62,22,-64,13,-59,4,-53,-4,-47,-11,-40,-18,-39,-27,-38,-37,-37,-47,-36,-57,-36,-65,-40,-73,-43,-81,-45,-91,-41,-97],[9,-100,15,-92,20,-86,20,-75,15,-68,9,-60,9,-50,20,-52,22,-45,28,-39,28,-31,35,-24,45,-27,39,-19,35,-11,27,-9,18,-5,11,0,7,8,11,17,18,26,22,33,18,42,18,51,25,60,26,71,30,81,24,91,19,100,20,90,20,82,20,72,17,61,14,58,12,49,10,39,9,30,3,22,0,28,-4,30,-12,37,-16,37,-21,35,-24,35,-24,26,-23,15,-25,6,-29,4,-29,0,-32,-7,-37,-10,-40,-13,-45,-16,-42,-22,-40,-30,-37,-37,-34,-47,-29,-50,-23,-58,-21,-67,-17,-77,-9,-84,1,-87,3,-91],[-81,-98,-71,-95,-60,-92,-49,-92,-37,-92,-25,-92,-13,-91,-2,-91,8,-85,19,-84,31,-83,42,-82,53,-83,65,-85,76,-87,88,-90,100,-89,100,-84,90,-81,81,-74,73,-81,62,-79,50,-77,40,-75,40,-63,40,-51,40,-39,40,-28,40,-16,28,-16,25,-8,25,4,25,16,25,28,25,39,25,51,25,63,25,75,25,86,18,93,9,98,-2,97,-13,94,-17,85,-24,91,-33,89,-41,80,-46,70,-48,58,-52,48,-53,36,-56,25,-58,14,-59,2,-58,-8,-64,-17,-70,-28,-76,-38,-80,-49,-85,-59,-91,-69,-98,-79,-100,-90,-92,-94],[-29,-100,-27,-91,-26,-80,-24,-69,-16,-63,-6,-58,5,-55,14,-50,23,-44,34,-43,45,-38,47,-27,45,-18,49,-10,52,0,64,0,76,0,75,10,82,19,87,28,85,38,82,48,83,57,77,53,67,46,55,46,43,48,32,50,24,57,19,67,17,79,13,90,3,87,-7,90,-12,99,-18,90,-30,89,-40,85,-47,92,-55,100,-63,96,-67,85,-70,74,-74,65,-74,57,-72,47,-80,39,-82,27,-87,18,-85,10,-78,1,-85,-7,-83,-17,-82,-27,-80,-36,-80,-48,-75,-58,-81,-68,-87,-79,-80,-81,-70,-82,-60,-87,-51,-93,-40,-99],[-57,-85,-49,-81,-35,-77,-27,-66,-14,-64,1,-65,14,-59,29,-58,43,-63,40,-65,55,-66,71,-67,58,-64,60,-58,67,-55,76,-54,88,-45,80,-34,85,-33,100,-33,95,-22,91,-11,87,-6,81,5,87,17,85,29,72,34,58,38,49,39,36,35,29,38,36,50,42,62,43,68,32,77,19,85,10,85,-3,82,-9,69,-16,57,-13,48,-19,35,-20,20,-14,7,-26,4,-41,5,-52,-5,-65,-10,-81,-9,-91,-18,-92,-32,-100,-44,-100,-51,-96,-66,-86,-77,-74,-84,-82,-75,-79,-63,-84,-50,-75,-41,-70,-54,-77,-67,-65,-74,-51,-78],[37,-100,48,-93,58,-87,68,-80,79,-74,89,-67,88,-64,75,-64,68,-59,69,-47,71,-35,72,-22,73,-10,75,2,76,15,77,27,79,39,80,51,81,64,85,75,84,87,74,89,61,89,49,89,37,89,26,86,17,91,5,91,-3,89,-11,93,-18,100,-26,92,-33,83,-42,78,-51,70,-62,71,-74,73,-81,81,-81,74,-77,62,-74,51,-75,38,-81,28,-78,21,-79,9,-85,2,-89,1,-82,-5,-69,-5,-57,-5,-45,-5,-32,-5,-29,-14,-30,-26,-24,-35,-14,-40,-14,-53,-14,-65,-14,-77,-4,-80,9,-80,21,-80,33,-80,36,-89],[-76,-100,-63,-100,-49,-100,-36,-100,-23,-99,-18,-87,-13,-75,-6,-64,6,-65,19,-65,26,-74,34,-82,43,-79,54,-76,64,-72,65,-59,64,-46,68,-34,71,-21,73,-13,86,-15,98,-17,98,-4,98,9,94,18,81,18,67,18,66,30,66,43,66,56,67,70,73,80,83,89,83,95,70,98,56,100,43,100,31,98,17,97,7,90,-7,90,-20,90,-33,90,-47,90,-60,90,-71,84,-84,86,-96,87,-98,77,-98,64,-93,52,-89,39,-86,27,-79,15,-70,7,-66,-6,-66,-19,-72,-30,-76,-42,-76,-50,-74,-62,-80,-74,-85,-86,-88,-96],[-73,-64,-62,-60,-52,-54,-42,-47,-35,-38,-25,-33,-13,-35,-1,-34,8,-32,15,-24,18,-16,23,-10,25,2,36,3,42,10,48,7,56,-2,66,-8,75,-14,72,-8,69,-1,78,4,83,-2,89,5,100,8,92,13,84,19,73,18,72,12,67,8,57,9,55,18,52,20,47,28,36,28,37,36,41,44,43,54,38,64,29,63,23,56,17,49,7,45,-3,37,-12,31,-22,24,-27,14,-32,3,-43,2,-52,-2,-53,-11,-62,-16,-70,-20,-71,-14,-79,-13,-88,-7,-90,2,-100,-1,-100,-13,-100,-25,-100,-37,-100,-49,-96,-58,-84,-61],[71,-100,74,-95,73,-86,72,-78,76,-78,70,-74,69,-65,65,-58,61,-50,56,-43,52,-35,47,-28,44,-20,41,-12,36,-4,31,2,26,10,20,17,14,23,8,29,2,35,-4,41,-12,45,-20,50,-27,55,-33,61,-40,67,-46,73,-52,79,-57,86,-63,93,-67,100,-72,93,-75,85,-75,77,-75,68,-76,59,-76,50,-76,42,-75,33,-69,27,-64,19,-58,14,-49,12,-43,7,-35,3,-27,3,-18,3,-12,-3,-6,-10,0,-16,6,-22,12,-28,19,-34,25,-40,30,-47,35,-55,40,-62,41,-70,41,-79,41,-88,47,-91,56,-94,64,-97],[42,-75,51,-75,56,-68,54,-57,58,-48,68,-53,77,-59,85,-58,94,-60,100,-58,95,-53,84,-51,73,-50,63,-47,54,-41,54,-32,56,-22,49,-13,48,-3,37,-2,34,2,35,11,26,17,23,27,19,37,9,35,0,40,-5,45,-14,48,-19,58,-20,68,-31,71,-42,73,-52,75,-64,75,-75,75,-86,71,-94,67,-87,58,-81,48,-89,41,-96,36,-96,24,-99,13,-96,5,-100,-3,-96,-10,-91,-19,-89,-29,-80,-27,-71,-23,-63,-30,-56,-35,-46,-40,-41,-50,-34,-57,-26,-63,-15,-59,-5,-57,4,-53,14,-56,23,-55,28,-63,37,-66],[25,-59,34,-52,34,-44,43,-40,48,-31,55,-26,65,-25,74,-20,84,-19,94,-14,100,-7,98,1,97,9,93,17,83,20,79,30,68,33,58,37,47,42,46,42,42,50,37,48,27,47,16,46,9,42,10,39,11,38,7,28,6,37,-3,39,-9,49,-17,55,-22,58,-32,59,-27,51,-24,40,-16,41,-13,36,-19,26,-22,16,-31,12,-40,6,-50,10,-60,15,-71,18,-82,15,-92,15,-100,7,-96,-3,-94,-10,-88,-20,-79,-28,-81,-38,-81,-47,-71,-51,-59,-52,-47,-49,-38,-45,-28,-45,-20,-43,-9,-42,-6,-49,4,-55,14,-58],[-19,-100,-14,-94,-8,-90,-3,-81,-5,-70,-5,-61,4,-69,14,-67,23,-72,33,-72,40,-63,43,-52,49,-42,55,-34,54,-22,46,-18,34,-18,22,-17,14,-8,13,1,16,12,17,16,9,10,-1,6,-8,2,-13,-6,-20,0,-21,12,-26,23,-30,34,-32,46,-26,53,-21,61,-16,70,-14,81,-18,76,-10,84,1,87,7,96,-2,100,-6,97,-14,91,-21,89,-26,80,-33,73,-41,67,-44,58,-40,47,-37,35,-30,25,-27,14,-32,4,-32,-8,-40,-18,-45,-28,-40,-37,-37,-45,-42,-54,-50,-64,-55,-73,-52,-81,-47,-92,-36,-92,-27,-98],[-73,-99,-62,-99,-51,-99,-40,-99,-28,-99,-17,-99,-7,-94,3,-89,12,-83,22,-78,32,-72,42,-66,52,-61,53,-52,61,-44,71,-38,80,-31,78,-21,74,-10,75,0,82,9,84,16,82,26,83,35,85,46,88,55,91,66,98,71,100,78,91,84,80,88,70,92,60,91,52,97,41,97,31,99,21,95,11,96,2,94,-4,85,-5,74,-8,64,-16,59,-25,60,-35,56,-45,51,-54,47,-63,42,-72,38,-77,28,-82,18,-88,9,-96,1,-96,-9,-98,-20,-100,-31,-93,-36,-85,-43,-79,-53,-74,-61,-80,-67,-74,-73,-73,-84,-78,-93],[-80,-89,-66,-87,-53,-82,-40,-79,-27,-75,-15,-83,-3,-87,-2,-86,9,-88,21,-85,20,-82,27,-81,40,-80,53,-83,59,-74,64,-61,66,-48,62,-35,58,-21,48,-24,39,-35,33,-47,28,-59,29,-48,33,-35,42,-24,47,-12,51,1,57,13,64,26,70,38,77,50,77,57,80,71,91,79,100,89,86,89,72,89,58,89,44,89,30,89,16,89,8,87,-5,89,-19,89,-33,89,-47,89,-61,89,-74,89,-88,89,-98,84,-98,71,-98,57,-98,43,-98,29,-98,15,-98,1,-98,-13,-98,-27,-98,-41,-100,-55,-100,-68,-99,-81,-93,-88],[-19,-42,-8,-42,-1,-38,8,-36,16,-33,26,-29,36,-28,46,-28,57,-30,66,-35,76,-34,83,-32,89,-25,90,-16,100,-12,97,-7,94,0,97,9,98,17,100,25,94,23,84,22,75,25,66,26,55,26,46,31,35,31,25,30,15,30,13,38,6,42,7,33,3,31,-6,30,-15,36,-24,39,-34,37,-42,31,-52,30,-56,37,-66,37,-73,31,-80,31,-82,30,-83,27,-85,24,-89,17,-94,11,-97,5,-91,8,-91,2,-93,-6,-100,-7,-97,-16,-88,-21,-82,-22,-74,-20,-70,-23,-61,-25,-68,-30,-58,-31,-48,-30,-39,-35,-29,-40],[46,-86,55,-81,66,-76,76,-71,88,-66,95,-59,100,-48,95,-39,94,-28,96,-15,92,-9,90,2,86,12,92,17,80,21,68,25,55,29,43,33,45,45,32,45,21,51,16,61,4,67,-4,76,-13,86,-25,86,-37,84,-48,79,-61,78,-74,80,-84,73,-94,64,-99,54,-100,41,-100,28,-100,15,-100,2,-91,-2,-78,-2,-66,-3,-65,-15,-65,-28,-65,-39,-59,-30,-47,-33,-41,-26,-30,-21,-17,-20,-9,-25,-2,-15,10,-11,18,-1,27,4,35,4,35,-9,30,-15,21,-15,12,-24,12,-36,15,-49,14,-61,15,-72,20,-82,33,-84],[-50,-81,-39,-78,-31,-69,-21,-69,-11,-72,-1,-67,10,-64,20,-68,30,-73,42,-73,53,-71,64,-69,72,-76,83,-79,90,-70,92,-59,100,-52,98,-41,88,-36,82,-27,77,-16,73,-7,69,3,61,10,57,21,52,31,48,40,40,42,33,34,24,35,16,43,8,50,3,61,-1,71,-6,72,-14,77,-23,76,-27,79,-31,76,-35,79,-42,81,-51,75,-54,66,-55,62,-56,57,-63,52,-72,46,-83,45,-84,42,-94,45,-99,40,-99,29,-100,18,-99,6,-94,-1,-89,-11,-85,-20,-82,-28,-86,-39,-85,-48,-84,-60,-77,-68,-72,-78,-61,-80],[22,-66,31,-65,38,-58,43,-50,43,-40,42,-32,51,-30,55,-24,64,-20,67,-13,75,-7,82,-1,86,6,92,12,99,18,100,25,91,26,82,24,72,22,65,28,56,27,47,30,38,32,29,33,24,41,15,39,5,38,-4,36,-11,29,-19,25,-28,28,-33,36,-35,44,-37,49,-45,50,-54,48,-64,50,-68,57,-71,66,-74,65,-78,57,-85,51,-91,43,-92,36,-96,28,-97,19,-100,11,-94,5,-90,-4,-85,-11,-76,-13,-68,-17,-62,-14,-54,-18,-44,-20,-35,-21,-29,-28,-30,-35,-20,-36,-11,-38,-3,-41,4,-48,10,-54,14,-62],[13,-100,23,-93,31,-83,39,-76,50,-79,56,-68,69,-63,80,-56,92,-55,100,-48,94,-34,94,-20,82,-15,75,-5,70,8,72,8,81,13,82,24,82,36,84,45,85,57,93,63,84,73,73,82,59,80,48,77,35,72,24,82,23,97,13,100,1,96,-11,90,-22,92,-36,90,-48,84,-55,76,-48,64,-46,49,-46,40,-42,28,-36,38,-43,25,-44,16,-52,6,-59,-6,-55,-12,-65,-17,-75,-21,-88,-26,-100,-31,-95,-36,-100,-43,-86,-46,-72,-46,-60,-44,-48,-45,-52,-58,-52,-68,-42,-62,-27,-60,-25,-66,-13,-73,-2,-82,0,-96],[11,-100,19,-97,26,-91,23,-82,22,-77,20,-68,27,-61,32,-53,27,-44,26,-35,30,-26,33,-16,30,-9,29,-1,33,7,37,15,33,24,39,32,45,40,43,49,37,58,31,66,25,74,19,82,12,89,3,91,1,91,-4,93,-13,97,-21,100,-25,100,-29,98,-30,92,-37,88,-40,80,-39,70,-40,62,-41,52,-41,43,-38,35,-32,31,-27,24,-21,16,-15,8,-8,2,-7,-5,-11,-14,-17,-16,-21,-26,-19,-35,-21,-45,-22,-52,-23,-61,-29,-68,-38,-73,-45,-80,-42,-85,-35,-81,-29,-74,-20,-76,-11,-72,-4,-78,-2,-88,2,-97],[-9,-100,-2,-92,11,-89,15,-84,16,-76,20,-67,11,-71,0,-65,-5,-60,-4,-51,-3,-38,7,-29,18,-21,22,-8,29,3,40,12,53,14,56,20,63,28,76,34,87,41,96,51,92,59,84,50,72,46,66,58,72,68,75,80,66,87,60,98,51,100,55,88,58,78,54,65,47,56,40,47,30,44,24,37,15,29,4,25,-6,16,-15,6,-23,0,-32,-9,-36,-21,-42,-33,-53,-39,-66,-39,-75,-29,-81,-32,-89,-37,-91,-47,-96,-57,-90,-65,-91,-75,-78,-75,-70,-85,-63,-79,-58,-77,-52,-87,-42,-84,-39,-90,-33,-96,-22,-98],[-9,-100,0,-95,11,-94,11,-85,18,-79,28,-76,19,-70,11,-67,6,-58,-1,-49,-1,-38,7,-30,9,-23,17,-14,26,-6,33,1,40,10,43,21,45,30,47,41,45,48,43,55,39,63,29,69,19,75,13,75,8,77,8,82,8,82,3,84,4,86,-4,93,-13,100,-14,91,-10,81,-18,75,-11,68,0,68,2,65,4,57,12,53,22,49,22,37,20,26,22,15,20,6,19,-2,10,-8,5,-18,-3,-26,-10,-35,-18,-41,-24,-48,-16,-51,-15,-59,-18,-65,-28,-65,-38,-70,-40,-80,-47,-85,-43,-92,-34,-92,-26,-91,-18,-94],[-15,-69,-5,-63,5,-59,7,-51,11,-41,22,-40,32,-38,37,-28,42,-17,51,-10,60,-2,70,3,80,10,90,14,100,20,98,30,87,27,78,32,72,41,67,51,57,56,50,62,41,69,32,65,23,61,22,49,16,43,7,38,-3,31,-11,24,-22,22,-32,18,-42,14,-52,17,-63,19,-70,28,-81,30,-82,18,-82,6,-85,-4,-92,-9,-88,-12,-94,-18,-97,-21,-96,-32,-90,-33,-80,-31,-72,-33,-74,-42,-80,-52,-89,-57,-97,-50,-97,-42,-100,-52,-90,-59,-79,-61,-68,-55,-62,-45,-52,-42,-40,-42,-37,-49,-31,-58,-23,-64,-18,-63],[33,-100,38,-96,42,-88,45,-80,47,-72,48,-63,51,-55,50,-47,45,-46,40,-50,41,-41,42,-33,38,-26,37,-18,36,-9,33,-1,30,7,28,15,25,23,23,32,20,40,17,48,15,56,13,65,10,73,7,81,4,89,-2,94,-11,96,-18,100,-26,99,-34,96,-40,90,-44,83,-45,74,-45,66,-49,59,-51,50,-48,42,-44,35,-40,28,-36,20,-34,12,-37,4,-38,-4,-40,-13,-41,-21,-36,-28,-34,-36,-28,-40,-21,-42,-14,-45,-7,-44,-5,-50,2,-54,3,-55,8,-62,11,-60,14,-64,16,-71,17,-78,23,-80,28,-86,28,-94],[57,-79,61,-73,61,-62,61,-52,70,-46,76,-37,77,-28,79,-19,76,-10,65,-10,59,-1,68,4,77,9,84,18,91,25,95,35,100,45,92,52,84,60,77,68,69,76,59,74,48,77,39,79,31,77,21,79,14,77,6,70,-1,62,-10,65,-20,63,-30,64,-37,57,-45,49,-48,39,-58,34,-62,25,-68,17,-78,12,-82,3,-90,-4,-100,-8,-99,-16,-93,-23,-90,-34,-85,-43,-75,-45,-68,-40,-60,-32,-51,-30,-40,-31,-32,-27,-21,-26,-14,-31,-4,-35,3,-42,12,-38,21,-34,30,-38,38,-46,45,-54,47,-63,44,-73,51,-75],[-82,-80,-71,-79,-61,-78,-49,-78,-38,-77,-26,-74,-15,-76,-4,-74,7,-73,18,-74,23,-67,33,-64,43,-61,54,-59,63,-61,70,-54,80,-52,90,-53,100,-51,98,-42,89,-36,79,-29,68,-26,59,-20,55,-13,49,-4,42,6,44,17,48,25,39,32,35,43,29,48,20,54,14,64,4,65,-7,66,-19,66,-28,71,-38,75,-46,80,-53,72,-54,62,-61,59,-69,56,-74,48,-68,39,-70,32,-68,22,-70,13,-72,4,-64,-2,-63,-11,-64,-22,-57,-31,-57,-37,-64,-43,-74,-41,-85,-41,-89,-46,-96,-47,-95,-55,-97,-61,-100,-70,-89,-73],[87,-91,90,-82,95,-69,100,-56,99,-43,93,-31,87,-21,81,-10,83,4,77,17,75,31,77,41,70,53,61,57,65,44,58,47,53,50,47,61,42,58,36,58,27,65,13,66,10,62,7,56,2,66,1,74,-7,84,-17,91,-25,80,-20,68,-31,63,-44,65,-56,70,-69,74,-79,78,-87,79,-100,79,-100,71,-88,65,-77,56,-68,46,-55,45,-41,44,-28,40,-18,45,-8,38,-4,26,4,14,7,1,13,3,9,14,20,11,33,5,42,-6,52,-15,57,-28,62,-40,65,-54,63,-62,64,-75,70,-86,77,-79,87,-83,79,-87],[32,-100,39,-94,44,-85,47,-75,47,-64,50,-54,57,-46,46,-45,36,-46,28,-40,35,-31,44,-25,50,-16,55,-7,50,2,45,11,40,20,39,27,39,38,41,48,47,57,50,65,57,73,65,80,66,91,65,100,55,95,45,94,36,92,25,92,15,90,4,90,-6,90,-17,89,-26,92,-37,92,-45,87,-42,76,-47,67,-46,62,-50,60,-59,57,-63,49,-66,46,-62,36,-59,26,-51,18,-44,10,-35,9,-27,8,-21,17,-14,10,-10,2,-5,-7,-1,-18,6,-24,9,-34,15,-42,19,-52,23,-62,32,-68,38,-75,38,-86,31,-92],[56,-85,68,-84,74,-77,74,-72,65,-70,71,-61,76,-54,84,-45,81,-36,90,-28,100,-20,96,-14,84,-17,79,-12,73,-1,73,12,69,21,59,27,55,32,51,39,53,47,49,55,46,62,43,72,33,79,22,85,15,81,11,73,5,70,-5,70,-13,66,-20,68,-32,70,-41,72,-44,62,-56,64,-64,64,-73,61,-76,48,-78,37,-81,25,-92,20,-96,12,-95,1,-100,-10,-97,-22,-95,-30,-86,-38,-83,-28,-74,-19,-63,-16,-50,-18,-39,-20,-31,-28,-18,-28,-8,-23,3,-26,15,-28,18,-39,26,-48,28,-58,34,-66,35,-78,44,-84],[13,-100,17,-90,23,-82,27,-72,32,-62,40,-55,50,-50,55,-41,63,-38,63,-27,69,-18,79,-15,89,-12,95,-5,90,-1,82,5,72,10,65,18,57,24,49,30,46,41,38,49,29,53,24,62,20,72,10,76,0,77,-10,73,-20,69,-30,66,-37,73,-41,83,-49,90,-57,97,-66,100,-77,100,-82,92,-78,83,-81,72,-86,62,-94,55,-95,44,-95,33,-95,23,-95,12,-95,1,-91,-7,-80,-7,-74,-12,-74,-23,-74,-34,-74,-45,-74,-56,-74,-67,-74,-78,-74,-88,-63,-90,-52,-91,-41,-93,-31,-95,-23,-89,-16,-89,-7,-95,3,-98],[-53,-100,-45,-100,-41,-92,-38,-83,-29,-81,-19,-80,-10,-74,-1,-69,8,-64,18,-63,28,-62,37,-65,44,-72,54,-76,62,-73,72,-71,78,-70,72,-61,66,-53,61,-45,62,-35,62,-24,62,-14,62,-4,62,7,62,17,63,27,70,35,71,43,62,47,59,54,50,58,46,66,41,75,38,85,33,94,27,100,18,94,10,88,2,82,-5,75,-6,66,-15,61,-24,56,-33,51,-42,46,-51,41,-60,36,-69,31,-78,27,-78,17,-78,7,-74,-3,-68,-11,-61,-17,-57,-26,-58,-36,-61,-46,-66,-54,-68,-63,-74,-70,-75,-78,-68,-86,-60,-93]]; })();

// ==================== src/scripts/radio/main.js ===================================
// Radio mode: Street View is hidden and a live station near the round's location plays
// instead. Stations come from Radio Browser (radio-browser.info), which is sent the round's
// coordinates. The audio streams from each station's own server. Nothing about the station
// shows until the guess is in.
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
  const TALK_TAGS = new RegExp('\\b(news|talk|sports?|speech|information|info|noticias|nachrichten|actualit|'
    + 'informa|notizie|public radio|comedy|debate|politics)', 'i');
  const MUSIC_TAGS = new RegExp('\\b(music|musica|música|musik|musique|hits?|pop|rock|dance|jazz|classical|'
    + 'country|oldies|top ?40|chart|r&b|hip ?hop|electronic|house|latin|reggae|metal|disco|[5-9]0s|schlager|'
    + 'soul|funk|blues|folk|indie|christian|gospel)\\b', 'i');
  const isTalk = s => TALK_TAGS.test(s.tags) && !MUSIC_TAGS.test(s.tags);

  const START_MS = 8000; // a stream that hasn't started playing by now is skipped
  const STALL_MS = 8000; // so is one that has been buffering this long

  // ---- silence GeoGuessr's own music and sounds while radio mode is on ----
  // Wrapped at document_start so every AudioContext and media element the page makes is
  // seen. While `muting`, contexts are suspended and other <audio>/<video> elements muted.
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
    const q = new URLSearchParams({
      is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', ...params,
    });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) throw new Error(`Radio Browser: HTTP ${r.status}`);
    // http streams are blocked on an https page; HLS needs a library
    return (await r.json()).filter(s => s.url_resolved?.startsWith('https://') && !s.hls);
  }
  const near = (lat, lng, dist, limit) =>
    search({ geo_lat: lat, geo_long: lng, geo_distance: dist * 1000, limit });

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
    // ad-free first, each half still in popularity order
    return [...list.filter(s => !ads(s)), ...list.filter(ads)];
  }

  const km = (a, b) => {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(12742 * Math.asin(Math.sqrt(h)));
  };
  const esc = ggs.esc;
  const describe = (s, loc) => {
    const where = [s.state, s.country].filter(Boolean).join(', ');
    const dist = s.geo_lat != null && loc
      ? ` · ${km(loc, { lat: s.geo_lat, lng: s.geo_long })} km from the spot` : '';
    return where + dist;
  };

  // ---- the player: "stage" in Street View's place, or a "mini" bar top-left ----
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 5l9 7-9 7zM16 5h2v14h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5l-9 7 9 7zM6 5h2v14H6z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>'
      + '<path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const YELLOW = '#fecd19', GREEN = '#6cb928';
  const CSS = `
    :host { all: initial; visibility: visible !important; color: #fff;
            font: 14px/1.3 neo-sans, var(--default-font, system-ui), system-ui, -apple-system, sans-serif; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .label { font-size: 11px; font-weight: 700; font-style: italic; letter-spacing: .08em;
             text-transform: uppercase; color: rgba(255, 255, 255, .55); }
    .status { font-size: 13px; color: rgba(255, 255, 255, .85); font-variant-numeric: tabular-nums;
              min-height: 17px; }
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
    :host(.stage) .wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
                          align-items: center; justify-content: center; gap: 10px; }
    :host(.stage) canvas { width: min(56vh, 48vw, 560px); }
    :host(.stage) .side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    :host(.stage) .info { text-align: center; }
    :host(.stage) .controls { padding: 6px 12px 6px 6px; border-radius: 999px;
                              background: rgba(16, 12, 48, .7); border: 1px solid rgba(255, 255, 255, .12); }
    :host(.stage) .extra { display: none; }

    /* mini: compact bar top-left */
    /* below GeoGuessr's logo */
    :host(.mini) { position: fixed; left: 16px; top: 84px; z-index: 2147483000; }
    :host(.mini) .wrap { display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; align-items: center;
                         width: 330px; padding: 8px 12px 8px 8px; border-radius: 14px;
                         background: linear-gradient(180deg, rgba(60, 48, 140, .85), rgba(22, 17, 62, .9));
                         border: 1px solid rgba(255, 255, 255, .14);
                         box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .7); }
    :host(.mini) canvas { width: 64px; }
    :host(.mini) .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    :host(.mini) .status { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.mini) button { width: 28px; height: 28px; }
    :host(.mini) svg { width: 15px; height: 15px; }
    :host(.mini) input[type=range] { width: 70px; }
    :host(.mini) .extra { grid-column: 1 / -1; }
    .reveal:empty { display: none; }
    .reveal { padding: 8px 4px 2px; border-top: 1px solid rgba(255, 255, 255, .12); margin-top: 4px; }
    .reveal b { display: block; font-size: 15px; font-style: italic; }
    .reveal span { font-size: 12px; color: rgba(255, 255, 255, .65); }`;

  // ---- the visual ----
  // A shape blending between random country outlines, rippling with the volume. They are
  // chosen without the round's location, so they give nothing away. A circle while loading,
  // an icon on play, pause or skip.
  const MORPH_MS = 3000;
  const SPIN_STEP = (Math.PI * 3) / 8; // turn per blend
  const ICON_POLYS = {
    play: [[[-0.4, -0.55], [0.55, 0], [-0.4, 0.55]]],
    pause: [
      [[-0.45, -0.55], [-0.13, -0.55], [-0.13, 0.55], [-0.45, 0.55]],
      [[0.13, -0.55], [0.45, -0.55], [0.45, 0.55], [0.13, 0.55]],
    ],
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
        out.push([
          u * u * st[0] + 2 * u * t * p[0] + t * t * en[0],
          u * u * st[1] + 2 * u * t * p[1] + t * t * en[1],
        ]);
      }
    });
    return out;
  }
  // m points evenly spaced round a closed polygon
  function loop(poly, m) {
    const seg = poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
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
      circle[2 * i] = Math.cos(a) * 0.8;
      circle[2 * i + 1] = Math.sin(a) * 0.8;
    }
    const base = new Float32Array(n), shape = new Float32Array(n), ring = new Float32Array(n);
    const icons = {};
    for (const [name, polys] of Object.entries(ICON_POLYS)) {
      const pts = Float32Array.from(polys.flatMap(p => loop(soften(p), K / polys.length)));
      icons[name] = { parts: polys.length, pts };
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
          if (i === 0) g.moveTo(mx, my);
          else g.quadraticCurveTo(c + p[j] * s, c + p[j + 1] * s, mx, my);
        }
        g.closePath();
      }
    }
    // outward normal at point i
    let nx = 0, ny = 0;
    function normal(p, i) {
      const a = ((i + K - 2) % K) * 2, b = ((i + 2) % K) * 2;
      const tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], len = Math.hypot(tx, ty) || 1;
      nx = ty / len;
      ny = -tx / len;
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
      if (p >= 1) {
        from = to;
        to = pick(from);
        since = now;
        p = 0;
      }
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
        // split or join once it's partway there
        if (iconTarget !== want) {
          iconTarget = want;
          partsAt = now + 150;
        }
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
  // Music puts far more of its energy below 90 Hz than speech does. A new station is
  // listened to silently for PRE_MS first, then the last BASS_MS are checked every 250 ms.
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
        for (const f of recent) {
          if (now - f[0] > ms) continue;
          r += f[1];
          l += f[2];
          a += f[3];
          k++;
        }
        return k > 0 && r / k >= 0.005 && a > 0 && l / a > BASS_SHARE;
      },
    };
  }

  function start(cfg) {
    const hidePano = document.createElement('style');
    hidePano.textContent = HIDE_PANO_CSS;
    const setPano = show => (show
      ? hidePano.remove()
      : (document.head ?? document.documentElement).append(hidePano));
    setPano(cfg.showStreetView);

    muteGame(true);
    let audio = null, node = null, ctx = null, analyser = null, gain = null, td = null, fd = null;
    let tuning = false, preListen = false, allowMusic = false, lastCheck = 0;
    const music = musicCheck();
    let volume = 0.6, watchdog = 0, stallTimer = 0, waitingSince = 0;
    let blocked = false, userPaused = false, skipping = 0;
    let host = null, root = null, draw = null, raf = 0, lastT = 0, lastMove = 0, live = false;
    let round = null, loc = null, stations = [], idx = 0;

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
            <div class="info">
              <div class="label">${cfg.streamerMode ? 'Talk radio' : 'Live radio'}</div>
              <div class="status"></div>
            </div>
            <div class="controls">
              <button class="prev" title="Previous station">${ICON.prev}</button>
              <button class="play">${ICON.pause}</button>
              <button class="next" title="Next station">${ICON.next}</button>
              <label class="vol">${ICON.vol}<input type="range" min="0" max="1" step="0.02" value="${volume}"></label>
            </div>
          </div>
          <div class="extra"><div class="reveal"></div></div>
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
      $('.prev').onclick = () => {
        draw.flash('back', 600);
        tune(idx - 1);
      };
      $('.next').onclick = () => {
        draw.flash('skip', 600);
        tune(idx + 1);
      };
      $('input').oninput = e => {
        volume = +e.target.value;
        if (audio) audio.volume = volume;
      };
      draw = blob($('canvas'));
      let playing = null;
      const frame = now => {
        raf = requestAnimationFrame(frame);
        if (host.hidden) return;
        const t = audio?.currentTime ?? 0;
        if (t !== lastT) {
          lastT = t;
          lastMove = now;
        }
        live = !!audio && !audio.paused && now - lastMove < 400; // sound is arriving
        const isPlaying = !!audio && !audio.paused;
        if (isPlaying !== playing) {
          playing = isPlaying;
          $('.play').innerHTML = playing ? ICON.pause : ICON.play;
        }
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
              if (music.span(now) >= PRE_MS * 0.95) {
                if (music.music(now, PRE_MS)) musicSkip();
                else unmute();
              }
            } else if (now - lastCheck >= BASS_EVERY_MS) {
              lastCheck = now;
              if (music.music(now, BASS_MS)) musicSkip();
            }
          }
        } else if (live) {
          vol = 0.3 + 0.25 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1));
        }
        const wait = waitingSince && !blocked ? (Date.now() - waitingSince) / START_MS : 0;
        if (wait) {
          const left = Math.max(0, Math.ceil(START_MS / 1000 * (1 - wait)));
          setStatus(`Station ${idx + 1} of ${stations.length} · waiting for audio ${left}s`);
        } else if (live && cfg.streamerMode && !skipping) {
          const note = allowMusic ? '' : !node ? " · can't check this one for music"
            : preListen ? ' · checking for music…' : '';
          const text = `Station ${idx + 1} of ${stations.length}${note}`;
          if ($('.status').textContent !== text) setStatus(text);
        }
        draw(now, {
          vol,
          loading: tuning || (!!waitingSince && !blocked) || preListen,
          hold: userPaused && audio?.paused ? 'pause' : null,
        });
      };
      raf = requestAnimationFrame(frame);
    }

    function place(inRound) {
      const pano = !cfg.showStreetView && inRound
        && PANO_SELECTORS.map(s => document.querySelector(s)).find(Boolean);
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
      if (gain) {
        gain.gain.cancelScheduledValues(0);
        gain.gain.value = preListen ? 0 : 1;
      }
      let failed = false;
      const fail = () => {
        if (failed || a !== audio) return;
        failed = true;
        // without CORS streamer mode can't check it, so prefer stations it can
        if (readable && cfg.streamerMode && !allowMusic && !startPaused && tryCheckable()) return;
        if (readable) load(url, false, startPaused);
        else skip('stream failed');
      };
      a.onerror = fail;
      a.onplaying = () => {
        clearTimeout(watchdog);
        clearTimeout(stallTimer);
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
      music.reset();
      userPaused = paused;
      allowMusic = paused;
      lastCheck = 0;
      clearTimeout(skipping);
      skipping = 0;
      $('.reveal').innerHTML = '';
      clearTimeout(watchdog);
      clearTimeout(stallTimer);
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
      watchdog = setTimeout(() => {
        if (!blocked && (!audio || audio.currentTime < 0.5)) skip('no audio');
      }, START_MS);
      load(stations[idx].url_resolved, cors);
    }
    function unmute() {
      preListen = false;
      gain?.gain.setTargetAtTime(1, ctx.currentTime, 0.08);
    }

    // Music in streamer mode: skip to the next station not yet caught playing music. If all
    // have been, go back to the first one, paused.
    const flaggedFor = new WeakMap(); // station list -> stations caught playing music
    const uncheckableFor = new WeakMap(); // station list -> stations whose sound can't be read
    const setFor = map => {
      const set = map.get(stations) ?? new Set();
      map.set(stations, set);
      return set;
    };
    // Moves an uncheckable station to the back. False if no checkable one is left after it.
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
      if (stations.length < 2) {
        waitingSince = 0;
        return setStatus(`Station ${why}`);
      }
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
      stations = [];
      loc = null;
      drop();
      clearTimeout(watchdog);
      clearTimeout(stallTimer);
      waitingSince = 0;
      blocked = false;
      $('.reveal').innerHTML = '';
      setStatus('Tuning…');
      tuning = true;
      loc = await ggs.game.roundLocation().catch(() => null);
      if (round !== key) return;
      if (!loc) {
        tuning = false;
        return setStatus(`No location: ${ggs.game.whyNoRound() || 'unknown'}`);
      }
      let failed = null;
      stations = await findStations(loc.lat, loc.lng, !!cfg.streamerMode).catch(err => {
        failed = err;
        return [];
      });
      if (round !== key) return;
      if (failed) {
        tuning = false;
        ggs.log('radio: station search failed', failed);
        return setStatus(`Station search failed (${failed.message})`);
      }
      tuning = false;
      if (!stations.length) {
        return setStatus(cfg.streamerMode ? 'No talk station found nearby' : 'No station found nearby');
      }
      tune(0);
    }

    // Result screens: the guess is in, so name the station.
    function reveal() {
      const s = stations[idx];
      if (s && !$('.reveal').innerHTML) {
        $('.reveal').innerHTML = `<b>${esc(s.name.trim())}</b><span>${esc(describe(s, loc))}</span>`;
      }
    }

    const tick = setInterval(() => {
      const inGame = !!ggs.game.context();
      const inRound = !!ggs.maps.guessMapElement();
      if (!inGame) {
        drop();
        if (host) host.hidden = true;
        round = null;
        return;
      }
      if (inRound && !host) create();
      if (!host) return;
      host.hidden = false;
      place(inRound);
      const key = ggs.game.roundKey();
      if (inRound && key !== round) newRound(key);
      if (!inRound) reveal();
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
        clearTimeout(watchdog);
        clearTimeout(stallTimer);
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
    name: 'Ghana black tape',
    description: "Adds Ghana's black tape to new coverage.",
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // not just Gen 4 Ghana
      { key: 'everywhere', label: 'Add to all rounds', type: 'checkbox', default: false },
    ],
  });
})();

// ==================== src/scripts/ghana-tape/ghana.js =============================
// Ghana's outline (lng, lat), thinned from draw-guess's country data.
(() => {
  globalThis.__ggs.GHANA = [[-0.07,11.12],[0.01,11.02],[-0.06,10.8],[-0.09,10.67],[0.04,10.56],[0.15,10.46],[0.33,10.31],[0.38,10.27],[0.35,9.93],[0.34,9.8],[0.31,9.67],[0.27,9.67],[0.27,9.62],[0.33,9.59],[0.25,9.54],[0.23,9.46],[0.26,9.43],[0.37,9.49],[0.45,9.48],[0.53,9.36],[0.47,9.12],[0.49,8.89],[0.45,8.81],[0.38,8.72],[0.48,8.57],[0.69,8.36],[0.65,8.25],[0.58,8.15],[0.5,7.55],[0.51,7.43],[0.59,7.39],[0.62,7.23],[0.59,7.03],[0.54,6.98],[0.53,6.89],[0.55,6.8],[0.67,6.59],[0.71,6.55],[0.74,6.45],[0.91,6.33],[1.0,6.27],[1.08,6.17],[1.19,6.14],[1.11,6.05],[1.01,5.91],[0.75,5.76],[0.26,5.76],[-0.35,5.5],[-0.67,5.32],[-1.06,5.18],[-1.64,4.98],[-2.0,4.76],[-2.27,4.87],[-2.72,5.01],[-3.08,5.08],[-3.09,5.13],[-2.95,5.12],[-2.82,5.15],[-2.79,5.26],[-2.76,5.36],[-2.79,5.6],[-2.96,5.64],[-3.0,5.71],[-3.06,5.93],[-3.2,6.35],[-3.24,6.54],[-3.22,6.69],[-3.24,6.81],[-3.04,7.11],[-2.99,7.21],[-2.96,7.46],[-2.86,7.77],[-2.8,7.9],[-2.67,8.02],[-2.6,8.08],[-2.61,8.15],[-2.54,8.17],[-2.56,8.49],[-2.6,8.8],[-2.65,8.96],[-2.75,9.04],[-2.69,9.22],[-2.7,9.3],[-2.69,9.43],[-2.71,9.53],[-2.78,9.75],[-2.75,9.91],[-2.79,10.19],[-2.78,10.28],[-2.82,10.36],[-2.79,10.43],[-2.88,10.51],[-2.91,10.73],[-2.83,11.0],[-2.75,10.99],[-2.23,10.99],[-1.6,11.0],[-1.54,11.02],[-1.04,11.01],[-0.9,10.98],[-0.7,10.99],[-0.63,10.93],[-0.55,10.98],[-0.45,11.06],[-0.4,11.09],[-0.31,11.12],[-0.07,11.12]];
})();

// ==================== src/scripts/ghana-tape/main.js ==============================
// Ghana black tape: old (Gen 3) Ghana coverage has tape on the car's roof bar, Gen 4 doesn't.
// On Gen 4 panoramas in Ghana (tile width 16384) the tape is drawn on a canvas over Street
// View, projected so it turns and zooms with the view. With cfg.everywhere (Add to all
// rounds, and always in Chaos mode) it goes on every panorama, anywhere.
(() => {
  const ggs = globalThis.__ggs;

  // The car in its own frame: x right, y forward, z up, camera at the origin. Two roof
  // bars with four ends poking out from under the blurred car; tape on the front-left tip.
  const CAR = {
    bars: { ys: [-0.85, 0.85], inner: 0.85, outer: 1.35, w: 0.07, z: -1 },
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
      // centerHeading points at the back of the car
      const rel = { heading: pov.heading - st.info.centerHeading + 180, pitch: pov.pitch };
      const fov = Math.min(127, 180 / 2 ** (pano.getZoom() ?? 1));
      const P = pts => project(pts, rel, fov, w, h);
      const rect = (x0, x1, y0, y1, z) => P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
      const path = pts => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      // stroked in the same colour so neighbouring strips don't show a seam
      const fill = (pts, color) => {
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
        colors.forEach((c, i) => {
          fill(rect(x0, x1, y - hw + (2 * hw * i) / n, y - hw + (2 * hw * (i + 1)) / n, z), c);
        });
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
          const shadow = rect(x0, x1 + side * 0.03, y - hw * 0.6 + 0.05, y + hw * 1.4 + 0.05, bars.z - 0.01);
          fill(shadow, 'rgba(0,0,0,.28)');
          ctx.restore();

          const metal = ['#8e8f90', '#c9cacb', '#e9eaea', '#f4f4f4', '#dcdddd', '#b5b6b7', '#828384'];
          shade(x0, x1, y, hw, bars.z, metal);
          fill(rect(x0, x1, y - hw * 0.12, y + hw * 0.12, bars.z + 0.001), '#5a5b5c');
          fill(rect(x0, x1, y + hw * 0.12, y + hw * 0.2, bars.z + 0.001), 'rgba(255,255,255,.35)');
          fill(cap(x1, y, hw, side, bars.z), '#b9babb');
          fill(cap(x1, y, hw * 0.55, side, bars.z + 0.001), '#8a8b8c');

          if (i === tape.bar && side === tape.side) {
            const tx0 = side * (bars.outer - tape.len), tx1 = x1 + side * 0.015, tw = tape.w;
            const black = ['#161616', '#2a2a2a', '#383838', '#2c2c2c', '#1b1b1b', '#111'];
            shade(tx0, tx1, y, tw, bars.z + 0.002, black);
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
      if (pos && id && (cfg.everywhere || inGhana([pos.lng(), pos.lat()]))) {
        const t = await tiles(id);
        if (attached.get(pano) !== st || pano.getPano() !== id) return;
        if (t && (cfg.everywhere || t.width >= GEN4_WIDTH)) st.info = t;
      }
      draw(pano);
    }

    function attach(pano) {
      if (attached.has(pano)) return;
      const div = panos.get(pano);
      const canvas = document.createElement('canvas');
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1000';
      if (getComputedStyle(div).position === 'static') div.style.position = 'relative';
      div.append(canvas);
      const redraw = () => {
        try {
          draw(pano);
        } catch (err) {
          ggs.log('ghana-tape draw failed', err);
        }
      };
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
      update(next) {
        const changed = !!next.everywhere !== !!cfg.everywhere;
        cfg = next;
        if (changed) attached.forEach((_, p) => refresh(p));
      },
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
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // index into WORDS in main.js; 0 picks one per panorama
      {
        key: 'script', label: 'Script to write in', type: 'select', default: 0,
        choices: [
          'Random', 'Thai', 'Georgian', 'Korean', 'Arabic', 'Cyrillic', 'Greek', 'Hebrew', 'Japanese', 'Hindi',
          'Armenian', 'English (wrong words)', 'German', 'Spanish', 'French', 'Minecraft',
        ].map((label, value) => ({ value, label })),
      },
    ],
  });
})();

// ==================== src/scripts/lying-signs/main.js =============================
// Lying signs: text on every Street View tile (via ggs.tiles, core/tiles.js) is found by a
// detector in a worker (worker.js: PP-OCRv4 on onnxruntime-web, loaded from ggs.extBase),
// painted over, and replaced with new text in another script, language or Minecraft glyphs.
// A blurred tile shows while the detector works, then the edit replaces it in the same texture.
(() => {
  const ggs = globalThis.__ggs;
  // Detector input size. 512-px tiles are upscaled so small text is found.
  const DET_SIZE = 768;
  // Boxes whose text differs from the sign by less than this (summed RGB) are ignored.
  const MIN_CONTRAST = 45;
  // Letter height as a share of the box height, for boxes cut by a tile edge.
  const TEXT_OF_BOX = 0.8;
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  const ENGLISH = [
    'JackSucksAtLife', 'JackSucksAtStuff', 'JackSucksAtGeography', 'Llama Crossing', 'JackSucksAtGuessing',
    'JackSucksAtClips', 'JackSucksAtPopUpPirate', 'JackSucksAtEspañol', 'JackApestaEnEspañol',
    'No Context JackSucksAtLife', 'Sock Outlet 42', 'ShopSmellsOfApricots', 'Apricot Outlet', 'qwerty',
    'Fudge', 'pretty decent kitchen', 'Geography Stuff', 'Jack & Oscar', 'Minecraft', 'Becky', 'Rick', 'Kai',
    'Kong', 'Flossy', 'Kazoo', 'Toothbrush', 'Spudger', 'Rhombus', 'Unicycle', 'Beanie', 'Lovely', 'Guinness',
    'Playbutton', 'Pie Shop', 'Tesla', 'Autopilot', 'Geography', 'Flag', 'Europe', 'Luxembourg', 'Seychelles',
    'Car Bar', 'Black tape', 'Vatican', 'Australia', 'Nottinghamshire', 'Welsh', 'Spanish', 'Español',
    'Reddit', 'Knick-Knacks', 'Doodle', 'Nelly', 'Jeremy', 'Vampire', 'Harmony Hollow', 'Minecraft Monday',
    'Piglin', 'Skyblock', 'Hacker Trolling', 'Misprint', 'Briefcase', 'Wigs', 'Recycling', 'Bush', 'Ukulele',
    'Weel', 'Toilet', 'Zigzag', 'Oscar', 'Zigzag Road', 'Oscar Was Here', 'Jack Was Here', 'Sucks At Life',
    'Sucks At Geography', 'Not Luxembourg', 'Definitely Kyrgyzstan', 'Probably Ohio', 'Bolivia?',
    'Wrong Country', 'Trust The Bollard', 'Follow The Tape', 'Guess Again', 'Plonk Here', '5000 Points',
    '4,999', 'Zero Points', 'Round 5', 'Gen 4', 'Trekker', 'Snow Cam', 'Rifts', 'Google Car',
    'Socks For Sale', 'Bingo', 'Big Bang', 'Nature Websites', 'Pop Up Pirate', 'Jacksucks Merch',
    'Silver Playbutton', 'Diamond Playbutton', 'Mossy Bench', 'Jaxsucksatlife', 'Sucks', 'Mossy', 'Apricots',
    'Toothbrush Factory', 'Kazoo Kid', 'Beanie Baby', 'Rhombus Road', 'Unicycle Lane', 'Spudger Street',
    'Flossy Avenue', 'Guinness Bar', 'Vampire Weekend', 'Piglin Bank', 'Skyblock Island',
    'Harmony Hollow Hotel', 'Misprint Museum', 'Briefcase Depot', 'Wig Emporium', 'Recycling Centre',
    'Bush Tucker', 'Weel Deel', 'Toilet Tour', 'Nelly The Elephant', 'Jeremy Fisher', "Becky's Lunch",
    'Kong King', 'Rick Roll', 'Kale Salad', 'Cheese', 'Left Only', 'Badger', 'Toast', 'No Parking', 'Sheep',
    'Bus Stop', 'Pancakes', 'Otter', 'Gravy', 'Wrong Way', 'Mild Peril', 'Beware Of Jack', 'Oscar Crossing',
    'Free Points', 'Actually Chile', 'Nice Try', 'Welcome To Wales',
  ];
  // Indexed by the "script" option; 0 is random (one script per panorama).
  const WORDS = [
    null,
    [
      'สวัสดี', 'ถนน', 'ตลาด', 'โรงเรียน', 'วัด', 'ร้านอาหาร', 'ทางออก', 'ระวัง', 'หยุด', 'กรุงเทพ',
      'เชียงใหม่', 'ภูเก็ต', 'ห้ามจอด', 'โรงแรม', 'ธนาคาร', 'สถานี', 'ตำรวจ', 'ยินดีต้อนรับ', 'ก๋วยเตี๋ยว',
      'ชายหาด', 'ขอนแก่น', 'พัทยา', 'อยุธยา', 'หาดใหญ่', 'นครราชสีมา', 'ซอย', 'ทางเข้า', 'ห้องน้ำ',
      'ร้านกาแฟ', 'ร้านขายยา', 'โรงพยาบาล', 'ตลาดน้ำ', 'ปั๊มน้ำมัน', 'มหาวิทยาลัย', 'สนามบิน', 'ท่าเรือ',
      'ลดความเร็ว', 'ทางม้าลาย', 'ห้ามเข้า', 'ส้มตำ', 'ผัดไทย', 'ข้าวมันไก่', 'ชาเย็น', 'เซเว่น', 'นวดแผนไทย',
      'ร้านซ่อมรถ', 'ร้านทอง', 'อู่รถ', 'บ้านพัก', 'ที่จอดรถ',
    ],
    [
      'გამარჯობა', 'ქუჩა', 'ბაზარი', 'სკოლა', 'თბილისი', 'გასასვლელი', 'ფრთხილად', 'გაჩერდი', 'ბათუმი',
      'ქუთაისი', 'სასტუმრო', 'ბანკი', 'აფთიაქი', 'პოლიცია', 'რესტორანი', 'ღვინო', 'ხაჭაპური', 'მოგესალმებით',
      'რუსთავი', 'გორი', 'ზუგდიდი', 'ფოთი', 'თელავი', 'მცხეთა', 'ბორჯომი', 'გუდაური', 'სვანეთი', 'კახეთი',
      'შესასვლელი', 'ტუალეტი', 'კაფე', 'საავადმყოფო', 'უნივერსიტეტი', 'აეროპორტი', 'სადგური', 'მეტრო',
      'ავტოსადგომი', 'გაჩერება', 'შეამცირე სიჩქარე', 'ხინკალი', 'ჩურჩხელა', 'ლობიანი', 'ჭაჭა', 'მაღაზია',
      'ბაზრობა', 'ეკლესია', 'მუზეუმი', 'თეატრი', 'სამრეცხაო',
    ],
    [
      '안녕하세요', '도로', '시장', '학교', '서울', '출구', '주의', '정지', '부산', '식당', '주차금지',
      '호텔', '은행', '약국', '경찰', '편의점', '지하철', '환영합니다', '김치', '노래방', '인천', '대구',
      '대전', '광주', '제주도', '수원', '울산', '강남', '홍대', '명동', '입구', '화장실', '카페', '병원',
      '대학교', '공항', '기차역', '버스정류장', '주차장', '서행', '횡단보도', '진입금지', '치킨', '삼겹살',
      '비빔밥', '떡볶이', '소주', '피시방', '찜질방', '세탁소', '미용실', '부동산', '치과', '교회', '박물관',
    ],
    [
      'مرحبا', 'شارع', 'سوق', 'مدرسة', 'مخرج', 'انتبه', 'قف', 'مطعم', 'القاهرة', 'دبي', 'فندق', 'بنك',
      'صيدلية', 'شرطة', 'ممنوع الوقوف', 'أهلا وسهلا', 'مسجد', 'محطة', 'الرياض', 'جدة', 'عمّان', 'بيروت',
      'الدوحة', 'مسقط', 'الرباط', 'تونس', 'بغداد', 'الإسكندرية', 'مدخل', 'حمام', 'مقهى', 'مستشفى', 'جامعة',
      'مطار', 'محطة القطار', 'موقف الباص', 'موقف سيارات', 'خفف السرعة', 'ممنوع الدخول', 'شاورما', 'فلافل',
      'كنافة', 'قهوة', 'بقالة', 'مخبز', 'جزار', 'كنيسة', 'متحف', 'مغسلة', 'صالون', 'عقارات', 'ميناء',
    ],
    [
      'привет', 'улица', 'рынок', 'школа', 'выход', 'осторожно', 'стоп', 'Москва', 'магазин', 'аптека',
      'банк', 'гостиница', 'полиция', 'вокзал', 'добро пожаловать', 'Новосибирск', 'шаурма',
      'парковка запрещена', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Владивосток', 'Сочи', 'Омск',
      'Минск', 'Киев', 'Алматы', 'Бишкек', 'вход', 'туалет', 'кафе', 'больница', 'университет', 'аэропорт',
      'станция', 'остановка', 'парковка', 'въезд запрещён', 'пешеходный переход', 'продукты', 'пельмени',
      'борщ', 'блины', 'квас', 'пекарня', 'мясо', 'церковь', 'музей', 'театр', 'прачечная', 'парикмахерская',
      'шиномонтаж', 'автосервис', 'почта', 'дом культуры',
    ],
    [
      'Αθήνα', 'οδός', 'αγορά', 'σχολείο', 'έξοδος', 'προσοχή', 'στοπ', 'ταβέρνα', 'λιμάνι', 'ξενοδοχείο',
      'τράπεζα', 'φαρμακείο', 'αστυνομία', 'καλώς ήρθατε', 'Θεσσαλονίκη', 'σουβλάκι', 'παραλία', 'Πάτρα',
      'Ηράκλειο', 'Λάρισα', 'Βόλος', 'Ρόδος', 'Κέρκυρα', 'Χανιά', 'Σαντορίνη', 'Μύκονος', 'Λευκωσία',
      'είσοδος', 'τουαλέτα', 'καφενείο', 'νοσοκομείο', 'πανεπιστήμιο', 'αεροδρόμιο', 'σταθμός', 'στάση',
      'πάρκινγκ', 'απαγορεύεται η στάθμευση', 'γύρος', 'μουσακάς', 'φέτα', 'ούζο', 'φούρνος', 'κρεοπωλείο',
      'εκκλησία', 'μουσείο', 'θέατρο', 'περίπτερο', 'κομμωτήριο', 'βουλκανιζατέρ', 'ταχυδρομείο', 'πλατεία',
      'λεωφόρος',
    ],
    [
      'שלום', 'רחוב', 'שוק', 'בית ספר', 'יציאה', 'זהירות', 'עצור', 'מסעדה', 'תל אביב', 'ירושלים', 'מלון',
      'בנק', 'בית מרקחת', 'משטרה', 'ברוכים הבאים', 'חניה אסורה', 'פלאפל', 'תחנה', 'חיפה', 'באר שבע', 'אילת',
      'נתניה', 'הרצליה', 'צפת', 'טבריה', 'כניסה', 'שירותים', 'בית קפה', 'בית חולים', 'אוניברסיטה',
      'שדה תעופה', 'תחנת רכבת', 'תחנת אוטובוס', 'חניון', 'האט', 'מעבר חצייה', 'אין כניסה', 'שווארמה', 'חומוס',
      'סביח', 'מאפייה', 'מכולת', 'קצבייה', 'בית כנסת', 'מוזיאון', 'תיאטרון', 'מכבסה', 'מספרה', 'דואר',
      'שדרות', 'כיכר', 'גן ילדים', 'קופת חולים',
    ],
    [
      '東京', '駅', '市場', '学校', '出口', '注意', '止まれ', '食堂', '大阪', '銀行', '駐車禁止', 'ホテル',
      '薬局', '警察', 'ようこそ', 'ラーメン', '温泉', '京都', '北海道', 'コンビニ', '名古屋', '福岡', '札幌',
      '神戸', '横浜', '広島', '仙台', '沖縄', '奈良', '長崎', '入口', 'トイレ', '喫茶店', '病院', '大学',
      '空港', 'バス停', '駐車場', '徐行', '横断歩道', '進入禁止', '寿司', 'うどん', 'カレー', '焼肉',
      '居酒屋', 'パン屋', '肉屋', '神社', '寺', '博物館', '交番', '郵便局', '美容室', 'ガソリンスタンド',
      '自動販売機', '商店街', '一方通行', '踏切', '公園',
    ],
    [
      'नमस्ते', 'सड़क', 'बाज़ार', 'विद्यालय', 'निकास', 'सावधान', 'रुकिए', 'दिल्ली', 'होटल', 'मुंबई', 'बैंक',
      'दवाखाना', 'पुलिस', 'स्वागत है', 'पार्किंग नहीं', 'चाय', 'रेलवे स्टेशन', 'मंदिर', 'कोलकाता', 'चेन्नई',
      'बेंगलुरु', 'जयपुर', 'लखनऊ', 'वाराणसी', 'आगरा', 'पुणे', 'गोवा', 'काठमांडू', 'प्रवेश', 'शौचालय', 'ढाबा',
      'अस्पताल', 'विश्वविद्यालय', 'हवाई अड्डा', 'बस अड्डा', 'धीरे चलें', 'प्रवेश निषेध', 'समोसा', 'चाट',
      'बिरयानी', 'दाल', 'लस्सी', 'मिठाई', 'किराना', 'मस्जिद', 'गुरुद्वारा', 'संग्रहालय', 'डाकघर', 'नाई',
      'पंचर', 'साइकिल', 'रिक्शा', 'गली', 'चौक', 'नगर पालिका', 'जल',
    ],
    [
      'Երևան', 'փողոց', 'շուկա', 'դպրոց', 'ելք', 'զգույշ', 'կանգ', 'ռեստորան', 'հյուրանոց', 'բանկ',
      'դեղատուն', 'ոստիկանություն', 'բարի գալուստ', 'Գյումրի', 'լավաշ', 'կայարան', 'Վանաձոր', 'Դիլիջան',
      'Սևան', 'Գորիս', 'Ջերմուկ', 'Էջմիածին', 'Արարատ', 'մուտք', 'զուգարան', 'սրճարան', 'հիվանդանոց',
      'համալսարան', 'օդանավակայան', 'կանգառ', 'ավտոկայանատեղի', 'կայանելն արգելված է', 'խորոված', 'դոլմա',
      'թան', 'կոնյակ', 'հացատուն', 'մսավաճառ', 'եկեղեցի', 'թանգարան', 'թատրոն', 'փոստ', 'վարսավիրանոց',
      'անվադող', 'պողոտա', 'հրապարակ', 'դպրոց թիվ 5', 'մանկապարտեզ',
    ],
    ENGLISH,
    [
      'Ausfahrt', 'Bäckerei', 'Achtung', 'Bahnhof', 'Schule', 'Markt', 'Apotheke', 'Einbahnstraße', 'Halt',
      'Willkommen', 'Rathaus', 'Gasthaus', 'Metzgerei', 'Parkverbot', 'Polizei', 'Tankstelle', 'Biergarten',
      'Umleitung', 'Vorsicht', 'Schnitzel', 'Kindergarten', 'Wurst', 'Berlin', 'München', 'Hamburg', 'Köln',
      'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Nürnberg', 'Bremen', 'Wien', 'Zürich', 'Hauptstraße',
      'Bahnhofstraße', 'Kirchgasse', 'Am Markt', 'Dorfplatz', 'Einfahrt', 'Ausgang', 'Eingang', 'Toilette',
      'Krankenhaus', 'Universität', 'Flughafen', 'Haltestelle', 'Parkplatz', 'Fußgängerzone', 'Sackgasse',
      'Baustelle', 'Spielstraße', 'Anlieger frei', 'Zone 30', 'Feuerwehr', 'Sparkasse', 'Volksbank',
      'Friseur', 'Fahrschule', 'Imbiss', 'Döner', 'Currywurst', 'Brezel', 'Konditorei', 'Eisdiele',
      'Weinstube', 'Brauerei', 'Bierstube', 'Kirche', 'Friedhof', 'Museum', 'Schwimmbad', 'Sporthalle',
      'Gemeinde', 'Landkreis', 'Autobahn', 'Radweg', 'Wanderweg', 'Bushaltestelle', 'Zahnarzt', 'Reifen',
      'Autohaus', 'Werkstatt', 'Blumen', 'Getränkemarkt', 'Postfiliale', 'Bürgeramt', 'Freibad', 'Schloss',
      'Burg', 'Zum Hirschen', 'Zum Löwen', 'Gasthof Adler',
    ],
    [
      'Salida', 'Panadería', 'Cuidado', 'Escuela', 'Mercado', 'Farmacia', 'Playa', 'Alto', 'Calle',
      'Bienvenidos', 'Ayuntamiento', 'Carnicería', 'Prohibido aparcar', 'Policía', 'Gasolinera', 'Desvío',
      'Peligro', 'Churros', 'Cerveza', 'Iglesia', 'Estación', 'Madrid', 'Barcelona', 'Sevilla', 'Valencia',
      'Bilbao', 'Málaga', 'Granada', 'Zaragoza', 'Ciudad de México', 'Buenos Aires', 'Bogotá', 'Lima',
      'Santiago', 'Quito', 'La Paz', 'Montevideo', 'Calle Mayor', 'Avenida', 'Plaza', 'Paseo', 'Carretera',
      'Entrada', 'Baños', 'Bar', 'Cafetería', 'Hospital', 'Universidad', 'Aeropuerto', 'Parada',
      'Aparcamiento', 'Estacionamiento', 'Ceda el paso', 'Despacio', 'Obras', 'Zona escolar', 'Bomberos',
      'Banco', 'Caja', 'Peluquería', 'Autoescuela', 'Tapas', 'Paella', 'Tortilla', 'Jamón', 'Bodega',
      'Frutería', 'Pescadería', 'Ferretería', 'Papelería', 'Museo', 'Piscina', 'Polideportivo', 'Cementerio',
      'Correos', 'Taller', 'Neumáticos', 'Llantas', 'Farmacia de guardia', 'Se vende', 'Se alquila',
      'Abierto', 'Cerrado', 'Rebajas', 'Empanadas', 'Arepas', 'Tacos', 'Ceviche',
    ],
    [
      'Sortie', 'Boulangerie', 'Attention', 'École', 'Marché', 'Pharmacie', 'Gare', 'Arrêt', 'Rue',
      'Bienvenue', 'Mairie', 'Boucherie', 'Stationnement interdit', 'Police', 'Tabac', 'Déviation', 'Danger',
      'Croissant', 'Fromage', 'Église', 'Plage', 'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse',
      'Nantes', 'Lille', 'Strasbourg', 'Nice', 'Montpellier', 'Bruxelles', 'Genève', 'Montréal', 'Québec',
      'Dakar', 'Abidjan', 'Rue de la Gare', 'Grande Rue', 'Place de la Mairie', 'Avenue', 'Route de',
      'Chemin', 'Impasse', 'Entrée', 'Toilettes', 'Café', 'Brasserie', 'Hôpital', 'Université', 'Aéroport',
      'Parking', 'Cédez le passage', 'Ralentir', 'Travaux', 'Zone 30', 'Pompiers', 'Banque',
      'Crédit Agricole', 'Coiffeur', 'Auto-école', 'Pâtisserie', 'Charcuterie', 'Fromagerie', 'Poissonnerie',
      'Épicerie', 'Cave', 'Baguette', 'Crêperie', 'Pain', 'Vin', 'Musée', 'Piscine', 'Gymnase', 'Cimetière',
      'La Poste', 'Garage', 'Pneus', 'Fleuriste', 'Librairie', 'Presse', 'À vendre', 'À louer', 'Ouvert',
      'Fermé', 'Soldes', 'Salle des fêtes', 'Camping', 'Château', 'Abbaye', 'Office de tourisme',
    ],
    'galactic',
  ];
  const GALACTIC_INDEX = WORDS.length - 1;
  // Arabic and Hindi letters join, so on a vertical sign the word is turned, not stacked.
  const JOINED = new Set([4, 9]);

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
        g.beginPath();
        if (line.length === 1) {
          g.arc(gx + line[0][0] * s, y0 + line[0][1] * (h / 10), g.lineWidth * 0.7, 0, 7);
          g.fill();
          continue;
        }
        line.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, gx + x * s, y0 + y * (h / 10)));
        g.stroke();
      }
    }
  }

  // Randomness seeded on a sign's place in the panorama, so it reads the same at every zoom.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let active = null;                          // cfg while the script is on
  const stats = { seen: 0, edited: 0, boxes: 0, failed: 0, detectMs: 0, detected: 0, editMs: 0, editMax: 0 };
  ggs.lyingSigns = { stats };

  // ---- detector worker ----
  let worker = null, workerReady = null, nextId = 0;
  const waiting = new Map();                  // id -> resolve
  function detector() {
    if (workerReady) return workerReady;
    workerReady = (async () => {
      if (!ggs.extBase) throw new Error('extension base URL not known yet');
      const u = f => ggs.extBase + VENDOR + f;
      const blobUrl = async (url, type) => {
        const bytes = await (await fetch(url)).arrayBuffer();
        return URL.createObjectURL(new Blob([bytes], { type }));
      };
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
        if (m.type === 'boxes') {
          stats.detected++;
          stats.detectMs += m.ms;
          waiting.get(m.id)?.(m.boxes);
          waiting.delete(m.id);
        } else if (m.type === 'error') {
          stats.failed++;
          ggs.log('lying-signs: detector error', m.message);
          waiting.get(m.id)?.(null);
          waiting.delete(m.id);
        }
      };
      const backend = await new Promise((res, rej) => {
        const onmsg = e => {
          if (e.data.type === 'ready') {
            worker.removeEventListener('message', onmsg);
            res(e.data.backend);
          } else if (e.data.type === 'error') {
            rej(new Error(e.data.message));
          }
        };
        worker.addEventListener('message', onmsg);
        worker.postMessage({ type: 'init', ort, mjs, wasm, model }, [model]);
      });
      stats.backend = backend;
      ggs.debug(`lying-signs: text detector ready (${backend})`);
    })();
    workerReady.catch(err => {
      ggs.log('lying-signs: text detector failed to load', err);
      // Close the half-started worker so a retry doesn't leave it running.
      worker?.terminate();
      worker = null;
      workerReady = null;
    });
    return workerReady;
  }
  // Detection queue, nearest tile to the view first. Tiles whose textures are gone, or whose
  // panorama is no longer shown, are dropped unrun. The queue is capped so moving quickly
  // never builds a backlog. A dropped tile is detected if it is uploaded again.
  const queue = [];                           // [{ img, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2, MAX_QUEUE = 300;
  ggs.lyingSigns.debug = () => ({
    queue: queue.length, inflight, waiting: waiting.size,
    tiles: tiles.size, panos: signs.size, stale: stale.size,
  });
  function detect(img, alive, url) {
    return new Promise(res => {
      queue.push({ img, res, alive, url });
      while (queue.length > MAX_QUEUE) {
        stats.skipped = (stats.skipped || 0) + 1;
        queue.shift().res(null);
      }
      pump();
    });
  }
  function pruneQueue() {
    const shown = new Set();
    for (const p of panos) { try { shown.add(p.getPano()); } catch {} }
    for (let i = queue.length - 1; i >= 0; i--) {
      const id = ggs.tileKey(queue[i].url)?.pano;
      if (id && !shown.has(id)) {
        stats.skipped = (stats.skipped || 0) + 1;
        queue.splice(i, 1)[0].res(null);
      }
    }
  }
  function tileDistance(url) {
    const k = ggs.tileKey(url);
    if (!k) return null;
    const { pano: id, x, y, z } = k;
    for (const p of panos) {
      let pov, centre;
      try {
        if (p.getPano() !== id) continue;
        pov = p.getPov();
        centre = p.getPhotographerPov?.()?.heading;
      } catch { continue; }
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
      // another pump may have taken the last job while the detector loaded
      if (!job) return;
      if (!job.alive()) {
        stats.skipped = (stats.skipped || 0) + 1;
        job.res(null);
        return;
      }
      const bitmap = await createImageBitmap(job.img);
      const boxes = await new Promise(r => {
        const id = ++nextId;
        waiting.set(id, r);
        const msg = { type: 'detect', id, bitmap, size: DET_SIZE, thresh: 0.25, boxThresh: 0.45 };
        worker.postMessage(msg, [bitmap]);
      });
      job.res(boxes);
    } catch {
      stats.failed++;
      for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length) pump();
    }
  }

  // ---- signs ----
  // Every text box found in a panorama, at any zoom, in panorama units (1 = its width), with
  // what was decided about it: skipped or not, letter height, colour, the word written.
  // A sign found at one zoom is drawn into the tiles of every zoom on screen, so zooming in
  // or out shows the same words.
  const signs = new Map();                    // pano -> [sign]
  const detectedTiles = new Set();            // "pano/z/x/y" the detector has run on
  const tileId = k => `${k.pano}/${k.z}/${k.x}/${k.y}`;
  const MAX_PANOS = 20;

  function toTile(sg, k, W) {
    const u = W * 2 ** k.z;
    return {
      cx: sg.cx * u - k.x * W, cy: sg.cy * u - k.y * W, w: sg.w * u, h: sg.h * u,
      angle: sg.angle, vertical: sg.vertical, sign: sg,
    };
  }
  function touches(sg, k, W) {
    const b = toTile(sg, k, W), r = Math.hypot(b.w, b.h) / 2;
    return b.cx + r > 0 && b.cy + r > 0 && b.cx - r < W && b.cy - r < W;
  }
  const signsIn = (k, W) => (signs.get(k.pano) || [])
    .filter(sg => touches(sg, k, W))
    .map(sg => toTile(sg, k, W));

  // Adds a tile's detections, biggest first. A known sign wins, as it may span tiles, unless a
  // new box is bigger and covers its middle (the other zoom only saw a sliver of it).
  function addSigns(k, W, found) {
    if (!signs.has(k.pano)) {
      signs.set(k.pano, []);
      if (signs.size > MAX_PANOS) {
        const old = signs.keys().next().value;
        signs.delete(old);
        for (const id of detectedTiles) if (id.startsWith(old + '/')) detectedTiles.delete(id);
      }
    }
    const list = signs.get(k.pano), u = W * 2 ** k.z, added = [], removed = [];
    for (const b of found.slice().sort((a, c) => c.w * c.h - a.w * a.h)) {
      const sg = {
        cx: (k.x * W + b.cx) / u, cy: (k.y * W + b.cy) / u, w: b.w / u, h: b.h / u,
        angle: b.angle, vertical: b.vertical, words: {},
      };
      const covered = list.filter(o => inside(o, sg) && sg.w * sg.h > o.w * o.h);
      if (list.some(o => !covered.includes(o) && inside(sg, o))) continue;
      for (const o of covered) {
        list.splice(list.indexOf(o), 1);
        removed.push(o);
      }
      sg.seed = hash(`${k.pano}:${Math.round(sg.cx * 4096)}:${Math.round(sg.cy * 4096)}`);
      list.push(sg);
      added.push(sg);
    }
    return { added, removed };
  }
  // whether b's middle is inside box a
  function inside(b, a) {
    const dx = b.cx - a.cx, dy = b.cy - a.cy, c = Math.cos(a.angle), s = Math.sin(a.angle);
    return Math.abs(dx * c + dy * s) < a.w / 2 && Math.abs(-dx * s + dy * c) < a.h / 2;
  }
  // Known well enough to edit without waiting: the detector ran on this tile, on its parent
  // or grandparent, or on all its children (or grandchildren).
  function covered(k) {
    if (detectedTiles.has(tileId(k))) return true;
    for (let up = 1; up <= 2; up++) {
      const f = 2 ** up;
      const parent = { pano: k.pano, z: k.z - up, x: Math.floor(k.x / f), y: Math.floor(k.y / f) };
      if (detectedTiles.has(tileId(parent))) return true;
    }
    return kidsCovered(k, 2);
  }
  function kidsCovered(k, depth) {
    if (depth === 0) return false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = { pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy };
      if (!detectedTiles.has(tileId(c)) && !kidsCovered(c, depth - 1)) return false;
    }
    return true;
  }

  // ---- tiles ----
  // url -> { key, img, canvas, cfg, recs: [upload records], drawn: Set of signs }
  const tiles = new Map();

  // What goes into WebGL for this tile: the edit if the area is known, otherwise a blur while
  // the detector works. Tiles another script already swapped for a canvas are left alone.
  ggs.tiles.filter((rec, img) => {
    if (!active || !(img instanceof HTMLImageElement)) return img;
    const url = rec.url, k = ggs.tileKey(url);
    if (!k) return img;
    let t = tiles.get(url);
    if (!t) {
      t = { key: k, img, canvas: null, cfg: null, recs: [], drawn: new Set() };
      tiles.set(url, t);
      if (tiles.size > 800) tiles.delete(tiles.keys().next().value);
      stats.seen++;
    }
    t.img = img;
    t.recs = t.recs.filter(ggs.tiles.live);
    t.recs.push(rec);
    if (!detectedTiles.has(tileId(k)) && !t.queued) queueDetect(t, url);
    if (t.canvas && t.cfg === active) return t.canvas;
    if (covered(k)) {
      editTile(t);
      return t.canvas;
    }
    t.canvas = null;
    return blurred(img);
  }, 1);

  function queueDetect(t, url) {
    const k = t.key, W = t.img.naturalWidth || t.img.width;
    t.queued = true;
    detect(t.img, () => t.recs.some(ggs.tiles.live), url).then(found => {
      t.queued = false;
      if (!found) return;                     // skipped or failed; a later upload retries
      detectedTiles.add(tileId(k));
      stats.boxes += found.length;
      const { added, removed } = addSigns(k, W, found);
      if (!active) return;
      // it was showing the blur
      if (!t.canvas || t.cfg !== active) {
        editTile(t);
        upload(t);
      }
      refresh(k.pano, added, removed, t);
    });
  }

  // The whole tile from the original, with every known sign; or, with `more`, just those
  // signs drawn onto the edit already there.
  function editTile(t, more) {
    const W = t.img.naturalWidth || t.img.width;
    const boxes = more ? more.map(sg => toTile(sg, t.key, W)) : signsIn(t.key, W);
    if (!more) t.drawn = new Set();
    t.canvas = editSync(t.img, boxes, active, t.key, more ? t.canvas : null);
    for (const b of boxes) t.drawn.add(b.sign);
    t.cfg = active;
  }
  // New signs in a panorama are drawn into every edited tile they touch, at any zoom, and
  // those tiles go to WebGL again. A tile that drew a since-replaced sign is redone. The tile
  // just detected (`now`) is done at once, the rest a few at a time in idle time, so a burst
  // of detections never stalls a frame.
  const stale = new Map();                    // tile -> Set of signs to add, or 'all' to redo it
  let draining = false;
  function refresh(pano, added, removed, now) {
    for (const t of tiles.values()) {
      if (t.key.pano !== pano || !t.canvas || t.cfg !== active) continue;
      const W = t.img.naturalWidth || t.img.width;
      if (removed.some(sg => t.drawn.has(sg))) {
        stale.set(t, 'all');
        continue;
      }
      const mine = added.filter(sg => touches(sg, t.key, W) && !t.drawn.has(sg));
      if (!mine.length || stale.get(t) === 'all') continue;
      if (!stale.has(t)) stale.set(t, new Set());
      for (const sg of mine) stale.get(t).add(sg);
    }
    if (stale.has(now)) redo(now);
    drain();
  }
  function redo(t) {
    const job = stale.get(t);
    stale.delete(t);
    if (!t.canvas || t.cfg !== active) return;
    if (job === 'all') editTile(t);
    else {
      const more = [...job].filter(sg => !t.drawn.has(sg));
      if (!more.length) return;
      editTile(t, more);
    }
    upload(t);
  }
  const idle = () => new Promise(res => (window.requestIdleCallback
    ? requestIdleCallback(res, { timeout: 200 })
    : setTimeout(() => res({ timeRemaining: () => 8 }), 16)));
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (stale.size) {
        const slice = await idle();
        do {
          redo(stale.keys().next().value);
        } while (stale.size && slice.timeRemaining() > 6);
      }
    } finally {
      draining = false;
    }
  }
  function upload(t) {
    t.recs = t.recs.filter(ggs.tiles.live);
    for (const r of t.recs) {
      try {
        if (ggs.tiles.upload(r, t.canvas)) stats.edited++;
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err);
      }
    }
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

  // Edits a tile with the detector's boxes and returns an OffscreenCanvas. With `onto`, an
  // earlier edit of the same tile, only the given boxes are added to it.
  function editSync(src, boxes, cfg, key, onto) {
    const t0 = performance.now();
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
    const c = onto || new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!onto) {
      g.drawImage(src, 0, 0);
      nadir(g, key, W, H);
    }
    for (const raw of usable(boxes, key, H)) {
      const rand = rng(raw.sign.seed);
      let script = cfg.script | 0;
      if (!WORDS[script]) script = 0;
      // random: one script per panorama
      if (script === 0) script = 1 + hash('script:' + (key?.pano || '')) % (WORDS.length - 1);
      const list = WORDS[script];
      const pick = list === 'galactic' ? null : () => list[Math.floor(rand() * list.length)];
      try {
        replaceBox(g, raw, script, pick, rand, W);
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: box failed', err);
      }
    }
    const ms = performance.now() - t0;
    stats.editMs += ms;
    stats.editMax = Math.max(stats.editMax, ms);
    return c;
  }

  // The boxes worth editing: big enough at this zoom, and not on the ground.
  function usable(boxes, key, H) {
    return boxes.filter(b => {
      if (b.h < 4 || b.w < 4) return false;
      if (onGround(key, b, H)) {
        stats.ground = (stats.ground || 0) + 1;
        return false;
      }
      return true;
    });
  }
  // Road markings, tyres, drain covers: anything below GROUND_PITCH, or a big box a little
  // below the horizon (a shop sign there is seldom more than a few degrees tall).
  const GROUND_PITCH = -30;
  function onGround(k, b, H) {
    if (!k) return false;
    const deg = 180 / (Math.max(1, 2 ** (k.z - 1)) * H);   // degrees per tile pixel
    const pitch = 90 - (k.y * H + b.cy) * deg;
    return pitch < GROUND_PITCH || (pitch < -8 && Math.min(b.w, b.h) * deg > 6);
  }

  // The bottom of the panorama (the car) is stretched too much for the detector, so
  // everything below NADIR_PITCH is smeared into a coarse mosaic instead.
  const NADIR_PITCH = -68;
  function nadir(g, k, W, H) {
    if (!k) return;
    const rows = Math.max(1, 2 ** (k.z - 1));
    // tile y where the mosaic starts
    const top = Math.max(0, ((90 - NADIR_PITCH) / 180 * rows - k.y) * H);
    if (top >= H) return;
    const band = H - top, fade = Math.min(10, band);
    const small = new OffscreenCanvas(Math.max(1, W / 16 | 0), Math.max(1, band / 16 | 0));
    small.getContext('2d').drawImage(g.canvas, 0, top, W, band, 0, 0, small.width, small.height);
    const layer = new OffscreenCanvas(W, band), l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    l.drawImage(small, 0, 0, W, band);
    const grad = l.createLinearGradient(0, 0, 0, fade);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in';
    l.fillStyle = grad;
    l.fillRect(0, 0, W, fade);
    l.fillStyle = '#000';
    l.fillRect(0, fade, W, band - fade);
    g.drawImage(layer, 0, top);
    stats.nadir = (stats.nadir || 0) + 1;
  }

  // Replaces one line of text. Works in a frame rotated so the text runs level, cut to the
  // tile, so a huge box inherited from a zoomed-out tile costs no more than its part on this
  // tile. The old strokes are told apart from the sign by colour, grown a little to take their
  // halo, and filled in from the sign around them, so the sign's colour and gradients stay.
  // The new word goes on top at the old text's height and colour.
  function replaceBox(g, raw, script, pick, rand, tileW) {
    const W = g.canvas.width, H = g.canvas.height;
    // level text is copied, not resampled
    const angle = Math.abs(raw.angle) < 0.01 ? 0 : raw.angle;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    // the frame's origin, on a pixel
    const ox = Math.round(raw.cx), oy = Math.round(raw.cy);
    const bu = (raw.cx - ox) * ca + (raw.cy - oy) * sa, bv = -(raw.cx - ox) * sa + (raw.cy - oy) * ca;
    // the box hugs the strokes, so give them room
    const pad = raw.h * 0.12, hw = raw.w / 2 + pad, hh = raw.h / 2 + pad;
    const ctx = Math.max(4, Math.round(raw.h * 0.3));             // sign around the box, for the fill
    // the tile's extent in the frame
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const u = (x - ox) * ca + (y - oy) * sa, v = -(x - ox) * sa + (y - oy) * ca;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const rx = Math.floor(Math.max(bu - hw - ctx, u0)), ry = Math.floor(Math.max(bv - hh - ctx, v0));
    const w = Math.ceil(Math.min(bu + hw + ctx, u1)) - rx, h = Math.ceil(Math.min(bv + hh + ctx, v1)) - ry;
    if (w < 4 || h < 4) return;
    // Strokes are looked for in the detector's own box. The padding is room to grow them into.
    const box = [
      Math.max(0, Math.round(bu - raw.w / 2 - rx)), Math.max(0, Math.round(bv - raw.h / 2 - ry)),
      Math.min(w, Math.round(bu + raw.w / 2 - rx)), Math.min(h, Math.round(bv + raw.h / 2 - ry)),
    ];
    if (box[2] - box[0] < 3 || box[3] - box[1] < 3) return;
    // the box isn't cut by the tile edge
    const whole = bu - hw - rx > 0 && bv - hh - ry > 0 && bu + hw - rx < w && bv + hh - ry < h;

    const temp = new OffscreenCanvas(w, h), t = temp.getContext('2d', { willReadFrequently: true });
    t.translate(-rx, -ry);
    t.rotate(-angle);
    t.translate(-ox, -oy);
    t.drawImage(g.canvas, 0, 0);                                  // outside the tile stays transparent
    t.setTransform(1, 0, 0, 1, 0, 0);
    const img = t.getImageData(0, 0, w, h), d = img.data;

    // Decisions made while the whole box is on the tile are kept on the sign for every zoom.
    const sign = raw.sign, fit = sign.fit;
    if (fit?.skip) return;
    const grow = 1 + Math.round(raw.h * 0.04);
    const s = strokes(d, w, h, box, grow);
    const skip = !s ? 'lowContrast' : !fit && watermark(raw, tileW, s.bg, s.fg) ? 'watermark' : null;
    // clouds, brickwork, foliage, Google's marks: not text to replace
    if (skip) {
      stats[skip] = (stats[skip] || 0) + 1;
      if (whole && !fit) sign.fit = { skip };
      return;
    }
    const surf = surface(d, w, h, s, grow + 1);
    const levels = pushPull(d, s.mask, w, h);
    texture(d, s.mask, w, h, box, levels, s.grain);
    // only the old strokes are replaced
    for (let i = 0; i < w * h; i++) if (!s.mask[i]) d[i * 4 + 3] = 0;
    t.putImageData(img, 0, 0);

    // Letter height, position and colour are measured once the whole box is on the tile, then
    // kept. Until then a box cut by the tile edge is sized from the detector.
    let f = fit;
    if (!f) {
      const measured = whole && s.bottom > s.top;
      f = {
        textH: measured ? Math.max(0.35, (s.bottom - s.top + 1) / raw.h) : TEXT_OF_BOX,
        dy: measured ? ((s.top + s.bottom + 1) / 2 - (bv - ry)) / raw.h : 0, fg: s.fg,
      };
      if (whole) sign.fit = f;
    }
    const textH = f.textH * raw.h, cy = bv - ry + f.dy * raw.h;
    // the new word on its own layer, kept to the sign's surface
    const layer = new OffscreenCanvas(w, h), x = layer.getContext('2d', { willReadFrequently: true });
    x.fillStyle = `rgb(${f.fg.join(',')})`;
    if (script === GALACTIC_INDEX) {
      const glyphH = textH / 0.72;
      drawGalactic(x, { x: bu - rx - raw.w / 2, y: cy - glyphH / 2, w: raw.w, h: glyphH }, rand);
    } else {
      const stacked = raw.vertical && !JOINED.has(script);
      sign.words[script] ||= chooseWord(textH / raw.h, raw.w / raw.h, pick, stacked);
      writeWord(x, bu - rx, cy, textH, raw.w, sign.words[script]);
    }
    const ld = x.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) if (!surf[i]) ld.data[i * 4 + 3] = 0;
    x.putImageData(ld, 0, 0);
    t.drawImage(layer, 0, 0);

    g.save();
    g.translate(ox, oy);
    g.rotate(angle);
    g.drawImage(temp, rx, ry);
    g.restore();
  }

  // Of a few seeded words, the one that best fills a box of this shape (`aspect` = width /
  // height) at this letter height (`textH`, a fraction of the box height). Chosen once per
  // sign so every zoom writes the same word. `stacked` is for a vertical sign: the characters
  // go one under another, upright.
  function chooseWord(textH, aspect, pick, stacked) {
    measurer.font = 'bold 100px sans-serif';
    let best = null;
    for (let k = 0; k < 6; k++) {
      const word = pick();
      let fill;
      if (stacked) fill = aspect * 0.92 / (graphemes(word).length * textH * 1.1);
      else {
        const m = measurer.measureText(word);
        const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
        fill = aspect * 0.92 / (m.width * textH / gh);
      }
      if (!best || Math.abs(Math.log(fill)) < Math.abs(Math.log(best.fill))) best = { word, fill };
    }
    return { word: best.word, stacked };
  }
  const measurer = new OffscreenCanvas(1, 1).getContext('2d');
  // Writes a chosen word centred at (cx, cy) with letters textH px tall, stretched a little
  // to fill boxW, shrunk if it still doesn't fit.
  function writeWord(t, cx, cy, textH, boxW, { word, stacked }) {
    if (stacked) {
      const chars = graphemes(word), step = Math.min(textH * 1.1, boxW * 0.92 / chars.length);
      t.font = `bold ${step / 1.1}px sans-serif`;
      t.textAlign = 'center';
      t.textBaseline = 'middle';
      chars.forEach((ch, i) => {
        t.save();
        t.translate(cx + (i - (chars.length - 1) / 2) * step, cy);
        t.rotate(-Math.PI / 2);
        t.fillText(ch, 0, 0);
        t.restore();
      });
      return;
    }
    t.font = 'bold 100px sans-serif';
    let m = t.measureText(word);
    const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
    const width = m.width * textH / gh;
    const sx = Math.min(1.25, Math.max(0.75, boxW * 0.92 / width));
    let size = 100 * textH / gh;
    if (width * sx > boxW) size *= boxW / (width * sx);
    t.font = `bold ${size}px sans-serif`;
    m = t.measureText(word);
    t.save();
    t.translate(cx, cy);
    t.scale(sx, 1);
    t.fillText(word, -m.width / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    t.restore();
  }

  // The old text inside `box` ([x0, y0, x1, y1]). The sign colour is the commonest one and
  // the strokes are what's far from it. Returns the strokes as a mask grown by `grow` px,
  // their colour, the rows they span and how grainy the sign is, or null if nothing stands out.
  function strokes(d, w, h, box, grow) {
    const [x0, y0, x1, y1] = box;
    const bins = new Float64Array(512 * 4);                       // 8-level colour cube: count, r, g, b
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 200) continue;
      n++;
      const k = ((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) * 4;
      bins[k]++;
      bins[k + 1] += d[i];
      bins[k + 2] += d[i + 1];
      bins[k + 3] += d[i + 2];
    }
    let b = 0;
    for (let k = 4; k < bins.length; k += 4) if (bins[k] > bins[b]) b = k;
    if (!n) return null;
    const bg = [bins[b + 1] / bins[b], bins[b + 2] / bins[b], bins[b + 3] / bins[b]];
    const dist = i => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    // typical stroke pixel: the median of the eighth furthest from the sign colour
    const hist = new Uint32Array(766);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] >= 200) hist[dist(i) | 0]++;
    }
    let contrast = 765;
    for (let v = 765, c = 0; v >= 0; v--) {
      c += hist[v];
      if (c >= n / 16) {
        contrast = v;
        break;
      }
    }
    if (contrast < MIN_CONTRAST) return null;
    const thr = Math.max(24, contrast * 0.45), strong = contrast * 0.8;
    const core = new Uint8Array(w * h);
    const ink = new Float64Array(512 * 4);                        // stroke colours, same cube
    let top = h, bottom = -1, gsum = 0, gn = 0;
    const rowMin = Math.max(2, (x1 - x0) * 0.03);
    for (let y = y0; y < y1; y++) {
      let row = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 200) continue;
        const v = dist(i);
        if (v > thr) {
          core[y * w + x] = 1;
          row++;
        }
        if (v > strong) {
          const k = ((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) * 4;
          ink[k]++;
          ink[k + 1] += d[i];
          ink[k + 2] += d[i + 1];
          ink[k + 3] += d[i + 2];
        } else if (v <= thr && x + 1 < x1 && dist(i + 4) <= thr) {
          // grain: brightness change between neighbouring sign pixels
          gsum += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[i + 4] - d[i + 5] - d[i + 6]) / 3;
          gn++;
        }
      }
      if (row >= rowMin) {
        if (y < top) top = y;
        bottom = y;
      }
    }
    // text colour: the commonest stroke colour, so an outline or shading doesn't grey the fill
    let f = 0;
    for (let k = 4; k < ink.length; k += 4) if (ink[k] > ink[f]) f = k;
    if (!ink[f]) return null;
    return {
      mask: dilate(core, w, h, grow),
      fg: [1, 2, 3].map(j => Math.round(ink[f + j] / ink[f])),
      bg, contrast, top, bottom,
      grain: gn ? Math.min(6, (gsum / gn) * 0.5) : 0,
    };
  }
  // Google's "© 2025 Google" marks: always the same small size and shape on a tile, grey and
  // see-through. The background is lightened by about the same fraction in every channel.
  // Real white or grey lettering is far more opaque.
  function watermark(raw, tileW, bg, fg) {
    const h = raw.h / tileW, aspect = raw.w / raw.h;
    if (raw.vertical || h < 0.018 || h > 0.045 || aspect < 3.5 || aspect > 8) return false;
    if (Math.max(...fg) - Math.min(...fg) > 30) return false;     // coloured: not the grey mark
    const a = [0, 1, 2].map(k => (fg[k] - bg[k]) / (256 - bg[k]));
    return Math.min(...a) > 0.1 && Math.max(...a) < 0.55 && Math.max(...a) - Math.min(...a) < 0.1;
  }
  // Where the sign is: pixels of its colour or of the old text's colour. Anything else (a
  // pole in front, the sky past the end of the sign, the side of a curved building) isn't,
  // so the new word is cut off there as the old one was. Closed by r px so outlines and
  // anti-aliasing between the two colours count as sign.
  function surface(d, w, h, s, r) {
    const near = (i, c, lim) =>
      Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < lim;
    const lim = Math.max(40, s.contrast * 0.45), m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const j = i * 4;
      if (d[j + 3] >= 200 && (near(j, s.bg, lim) || near(j, s.fg, lim))) m[i] = 1;
    }
    const grown = dilate(m, w, h, r);
    for (let i = 0; i < w * h; i++) grown[i] = !grown[i];
    const shrunk = dilate(grown, w, h, r);
    for (let i = 0; i < w * h; i++) m[i] = !shrunk[i];
    return m;
  }
  const segmenter = new Intl.Segmenter();
  const graphemes = word => [...segmenter.segment(word)].map(g => g.segment).filter(g => g.trim());

  // Grows a mask by r px in every direction (a square), with running counts along rows, then columns.
  function dilate(m, w, h, r) {
    const a = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let x = 0; x < Math.min(r, w); x++) c += m[y * w + x];
      for (let x = 0; x < w; x++) {
        if (x + r < w) c += m[y * w + x + r];
        if (x - r - 1 >= 0) c -= m[y * w + x - r - 1];
        a[y * w + x] = c > 0;
      }
    }
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = 0; y < Math.min(r, h); y++) c += a[y * w + x];
      for (let y = 0; y < h; y++) {
        if (y + r < h) c += a[(y + r) * w + x];
        if (y - r - 1 >= 0) c -= a[(y - r - 1) * w + x];
        out[y * w + x] = c > 0;
      }
    }
    return out;
  }
  // Fills the masked pixels of `d` from the rest (push-pull): halve the picture until every
  // cell has something in it, averaging only known pixels, then on the way back up give each
  // unknown pixel the smooth, bilinear value from the level above. Linear in the pixel count.
  function pushPull(d, mask, w, h) {
    const levels = [];
    let c = new Float32Array(w * h * 3), wt = new Float32Array(w * h), lw = w, lh = h;
    for (let i = 0; i < w * h; i++) {
      if (mask[i] || d[i * 4 + 3] < 200) continue;
      wt[i] = 1;
      c[i * 3] = d[i * 4];
      c[i * 3 + 1] = d[i * 4 + 1];
      c[i * 3 + 2] = d[i * 4 + 2];
    }
    levels.push([c, wt, lw, lh]);
    while (lw > 1 || lh > 1) {
      const nw = Math.ceil(lw / 2), nh = Math.ceil(lh / 2);
      const nc = new Float32Array(nw * nh * 3), nt = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        let s0 = 0, s1 = 0, s2 = 0, ws = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = 2 * x + dx, sy = 2 * y + dy;
          if (sx >= lw || sy >= lh) continue;
          const j = sy * lw + sx, q = wt[j];
          s0 += c[j * 3] * q;
          s1 += c[j * 3 + 1] * q;
          s2 += c[j * 3 + 2] * q;
          ws += q;
        }
        const j = y * nw + x;
        if (ws) {
          nc[j * 3] = s0 / ws;
          nc[j * 3 + 1] = s1 / ws;
          nc[j * 3 + 2] = s2 / ws;
        }
        nt[j] = Math.min(1, ws);
      }
      c = nc;
      wt = nt;
      lw = nw;
      lh = nh;
      levels.push([c, wt, lw, lh]);
    }
    for (let l = levels.length - 2; l >= 0; l--) {
      const [c, wt, lw, lh] = levels[l], [pc, , pw, ph] = levels[l + 1];
      for (let y = 0; y < lh; y++) {
        const fy = Math.min(ph - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const y0 = fy | 0, y1 = Math.min(ph - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < lw; x++) {
          const j = y * lw + x, q = wt[j];
          if (q >= 1) continue;
          const fx = Math.min(pw - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
          const x0 = fx | 0, x1 = Math.min(pw - 1, x0 + 1), tx = fx - x0;
          for (let k = 0; k < 3; k++) {
            const up = (pc[(y0 * pw + x0) * 3 + k] * (1 - tx) + pc[(y0 * pw + x1) * 3 + k] * tx) * (1 - ty)
              + (pc[(y1 * pw + x0) * 3 + k] * (1 - tx) + pc[(y1 * pw + x1) * 3 + k] * tx) * ty;
            c[j * 3 + k] = c[j * 3 + k] * q + up * (1 - q);
          }
          wt[j] = 1;
        }
      }
    }
    const [c0] = levels[0];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      d[i * 4] = c0[i * 3];
      d[i * 4 + 1] = c0[i * 3 + 1];
      d[i * 4 + 2] = c0[i * 3 + 2];
    }
    return levels;
  }
  // The push-pull fill is smooth, which shows on paving, brick or a grainy sign. Each filled
  // pixel gets the fine detail (pixel minus its blurred value, clamped) of the pixel mirrored
  // across the nearest box edge, so the texture outside carries on into the box. With nothing
  // to mirror it gets plain grain.
  function texture(d, mask, w, h, box, levels, grain) {
    const [x0, y0, x1, y1] = box;
    const L = levels[Math.min(2, levels.length - 1)], f = 2 ** Math.min(2, levels.length - 1);
    const blurred = (x, y, k) => {
      const [c, , lw, lh] = L;
      const fx = Math.min(lw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const fy = Math.min(lh - 1, Math.max(0, (y + 0.5) / f - 0.5));
      const xa = fx | 0, ya = fy | 0, xb = Math.min(lw - 1, xa + 1), yb = Math.min(lh - 1, ya + 1);
      const tx = fx - xa, ty = fy - ya;
      return (c[(ya * lw + xa) * 3 + k] * (1 - tx) + c[(ya * lw + xb) * 3 + k] * tx) * (1 - ty)
        + (c[(yb * lw + xa) * 3 + k] * (1 - tx) + c[(yb * lw + xb) * 3 + k] * tx) * ty;
    };
    const known = (x, y) =>
      x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x] && d[(y * w + x) * 4 + 3] >= 200;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      // mirror images across the four edges, nearest edge first
      const m = [
        [2 * x0 - x - 1, y, x - x0], [2 * x1 - x - 1, y, x1 - x],
        [x, 2 * y0 - y - 1, y - y0], [x, 2 * y1 - y - 1, y1 - y],
      ].sort((a, b) => a[2] - b[2]);
      const src = m.find(([mx, my]) => known(mx, my));
      if (src) {
        const j = (src[1] * w + src[0]) * 4;
        for (let k = 0; k < 3; k++) {
          d[i * 4 + k] += Math.max(-30, Math.min(30, d[j + k] - blurred(src[0], src[1], k)));
        }
      } else {
        const n = (Math.random() - 0.5) * 2 * grain;
        d[i * 4] += n;
        d[i * 4 + 1] += n;
        d[i * 4 + 2] += n;
      }
    }
  }

  // which way you're looking, for the queue order
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => {
    panos.add(p);
    try { p.addListener('pano_changed', pruneQueue); } catch {}
  });
  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    detector();
    ggs.tiles.replay();
    return {
      stop() { active = null; ggs.tiles.replay(); },
      update(next) {
        const changed = next.script !== active.script;
        active = next;
        if (changed) ggs.tiles.replay();
      },
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
    section: 'streetview',
    defaultEnabled: false,
    // each panorama costs a generation; No move can be unticked again
    turnsOn: [{ id: 'nmpz', key: 'noMove' }],
    options: [
      { key: 'hq', label: 'High quality (limited)', type: 'checkbox', default: false },
      {
        key: 'code', label: 'Extra usage', type: 'text', default: '',
        placeholder: 'Code', secret: true, hidden: true,
      },
    ],
  });
})();

// ==================== src/scripts/minecraft/main.js ===============================
// Minecraft world: the shared redraw core (core/redraw.js) in the "minecraft" style.
(() => {
  const ggs = globalThis.__ggs;
  ggs.scripts.minecraft = ggs.redraw.script('minecraft', 'minecraft', 'Minecraft');
})();

// ==================== src/scripts/gradient/meta.js ================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'gradient',
    name: 'Senegal gradient',
    description: 'Street View melts into a colour gradient.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // 1 = barely blurred, 10 = a few colours per view
      { key: 'strength', label: 'How much gradient', type: 'slider', min: 1, max: 10, default: 8,
        marks: ['Less', 'More'] },
    ],
  });
})();

// ==================== src/scripts/gradient/main.js ================================
// Senegal gradient: every Street View tile (via core/tiles.js) is shrunk to a handful of cells
// and scaled back up, so the view is a smooth colour gradient. Each tile is shrunk with its eight
// neighbours so the gradient runs across tile edges. When a neighbour arrives, the tiles around
// it are redone and re-uploaded into the same textures.
(() => {
  const ggs = globalThis.__ggs;
  const KEEP = 2; // panoramas whose tiles are remembered
  let active = null;

  // Cells per tile for the strength setting, made the same size on screen at every zoom:
  // one zoom step in halves the angle a tile covers, so it gets half the cells.
  function cells(z, size) {
    const base = 2 ** (10 - active.strength); // cells across a zoom-3 (45°) tile
    return Math.max(1, Math.min(size, Math.round(base * 2 ** (3 - z))));
  }

  // pano id -> Map of "z/x/y" -> { rec, src }; oldest panorama dropped past KEEP
  const panos = new Map();
  function store(k) {
    let m = panos.get(k.pano);
    if (!m) {
      m = new Map();
      panos.set(k.pano, m);
      while (panos.size > KEEP) panos.delete(panos.keys().next().value);
    }
    return m;
  }
  const tileId = k => `${k.z}/${k.x}/${k.y}`;

  // Draws the tile with its neighbours in a 3x3 grid, shrinks the grid to 3n x 3n cells, scales
  // it back up, blurs the creases between cells and keeps the middle tile. Missing neighbours
  // are mirrored copies, so the edges never fade to black.
  // To save work, the grid starts at half size when the cells are at least 4 px. A wide blur is
  // drawn small (at least 4 px of blur) and scaled up, which looks the same on a smooth gradient
  // and costs far less GPU time.
  const canvases = new Map(); // "w x h" -> a canvas reused for every tile
  function canvas(w, h, name) {
    const key = `${name} ${w}x${h}`;
    if (!canvases.has(key)) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').imageSmoothingQuality = 'high';
      canvases.set(key, c);
    }
    return canvases.get(key);
  }
  function melt(k, src, tiles) {
    const w = src.width || src.naturalWidth || 512;
    const h = src.height || src.naturalHeight || 512;
    const n = cells(k.z, w);
    const blur = Math.min(48, w / n / 3);
    // grid scale, and the size of a tile in it
    const f = 6 * n <= 1.5 * w ? 0.5 : 1;
    const tw = Math.round(w * f);
    const th = Math.round(h * f);
    const grid = canvas(3 * tw, 3 * th, 'grid');
    const g = grid.getContext('2d');
    g.clearRect(0, 0, grid.width, grid.height);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nb = dx || dy ? tiles.get(`${k.z}/${k.x + dx}/${k.y + dy}`) : null;
      const x = (dx + 1) * tw;
      const y = (dy + 1) * th;
      if (nb) {
        g.drawImage(nb.src, x, y, tw, th);
        continue;
      }
      g.save();
      g.translate(x + (dx ? tw : 0), y + (dy ? th : 0));
      g.scale(dx ? -1 : 1, dy ? -1 : 1);
      g.drawImage(src, 0, 0, tw, th);
      g.restore();
    }
    // shrink in halves: one big step skips pixels and speckles the colours
    let cur = grid;
    let cw = grid.width;
    let ch = grid.height;
    while (cw > 6 * n) {
      const half = canvas(cw >> 1, ch >> 1, 'half');
      half.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, half.width, half.height);
      cur = half;
      cw = half.width;
      ch = half.height;
    }
    const small = canvas(3 * n, 3 * n, 'small');
    small.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, 3 * n, 3 * n);
    const q = Math.min(1, 4 / blur);
    const bw = Math.round(3 * w * q);
    const bh = Math.round(3 * h * q);
    const big = canvas(bw, bh, 'big');
    const b = big.getContext('2d');
    b.clearRect(0, 0, bw, bh);
    b.filter = `blur(${blur * q}px)`;
    b.drawImage(small, 0, 0, bw, bh);
    b.filter = 'none';
    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(big, bw / 3, bh / 3, bw / 3, bh / 3, 0, 0, w, h);
    return out;
  }

  // Neighbours of tiles that just arrived get redone once things settle.
  const dirty = new Map(); // "pano/z/x/y" -> { k, tiles }
  let timer = null;
  function touchNeighbours(k, tiles) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nk = { pano: k.pano, z: k.z, x: k.x + dx, y: k.y + dy };
      if (tiles.has(tileId(nk))) dirty.set(`${k.pano}/${tileId(nk)}`, { k: nk, tiles });
    }
    clearTimeout(timer);
    timer = setTimeout(redo, 80);
  }
  // A few tiles per frame, so the game keeps drawing (a replay can leave hundreds dirty at once).
  // Tiles that turn dirty meanwhile join the same pass.
  const PER_FRAME = 4, SLICE = 8;
  let redoing = false;
  const nextFrame = () => new Promise(r =>
    (document.hidden ? setTimeout(r) : requestAnimationFrame(() => setTimeout(r))));
  async function redo() {
    timer = null;
    if (redoing) return;
    redoing = true;
    let pano = null;
    let done = 0;
    let t0 = performance.now();
    let painted = t0;
    try {
      while (active && dirty.size) {
        const [id, { k, tiles }] = dirty.entries().next().value;
        dirty.delete(id);
        const t = tiles.get(tileId(k));
        if (!t || !ggs.tiles.live(t.rec)) continue;
        try {
          if (ggs.tiles.upload(t.rec, melt(k, t.src, tiles))) pano = k.pano;
        } catch (err) {
          ggs.log('gradient: re-upload failed', err);
        }
        if (++done < PER_FRAME && performance.now() - t0 < SLICE) continue;
        if (pano && performance.now() - painted > 150) {
          painted = performance.now();
          ggs.tiles.repaint(pano);
          pano = null;
        }
        await nextFrame();
        done = 0;
        t0 = performance.now();
      }
    } finally {
      redoing = false;
    }
    if (pano) ggs.tiles.repaint(pano);
  }

  ggs.tiles.filter((rec, source) => {
    if (!active || !rec.key) return source;
    const k = rec.key;
    const tiles = store(k);
    tiles.set(tileId(k), { rec, src: source });
    touchNeighbours(k, tiles);
    return melt(k, source, tiles);
  }, 2); // after minecraft and lying-signs, so their tiles melt too

  function start(cfg) {
    active = cfg;
    ggs.debug('gradient on', cfg);
    ggs.tiles.replay();
    return {
      stop() {
        active = null;
        clearTimeout(timer);
        timer = null;
        dirty.clear();
        panos.clear();
        ggs.tiles.replay();
      },
      update(next) {
        const changed = next.strength !== active.strength;
        active = next;
        if (changed) ggs.tiles.replay();
      },
    };
  }
  ggs.scripts.gradient = { start };
})();

// ==================== src/scripts/greyscale/meta.js ===============================
(() => {
  globalThis.__ggs.registry.push({
    id: 'greyscale',
    name: 'Colour filter',
    description: 'Black and white, inverted, or one colour only.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'filter', label: 'Filter', type: 'select', default: 'grey', choices: [
        { value: 'grey', label: 'Black and white' },
        { value: 'invert', label: 'Inverted' },
        { value: 'red', label: 'Only red' },
        { value: 'orange', label: 'Only orange' },
        { value: 'yellow', label: 'Only yellow' },
        { value: 'green', label: 'Only green' },
        { value: 'blue', label: 'Only blue' },
      ] },
    ],
  });
})();

// ==================== src/scripts/greyscale/main.js ===============================
// Colour filter. Black and white and inverted are a CSS filter on the Street View picture only
// (core/view.js). "Only <colour>" redraws each Street View tile (core/tiles.js, after the other
// tile filters) in black and white except pixels of that hue, so a red bus stays red.
// prepare(cfg) redraws the panorama on screen ahead of time (core/tiles.js prerender), for Chaos mode.
(() => {
  const ggs = globalThis.__ggs;
  const CSS = { grey: 'grayscale(1)', invert: 'invert(1)' };
  // centre and half-width of each hue, in degrees
  const HUES = { red: [0, 18], orange: [28, 12], yellow: [52, 14], green: [120, 45], blue: [220, 35] };
  // degrees of soft edge past the half-width
  const FEATHER = 12;
  // pre: { hue, tiles } drawn ahead by prepare
  let keep = null, pre = null;

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function draw(source, hue = keep) {
    const w = source.width || source.naturalWidth || 512, h = source.height || source.naturalHeight || 512;
    // willReadFrequently keeps the pixels in memory, so there's no GPU readback
    const out = new OffscreenCanvas(w, h), g = out.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data, [centre, half] = hue;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      const max = Math.max(r, gr, b), min = Math.min(r, gr, b), grey = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      let k = 0;
      if (max - min > 20) {
        const c = max - min;
        let hue = max === r ? ((gr - b) / c) % 6 : max === gr ? (b - r) / c + 2 : (r - gr) / c + 4;
        hue = (hue * 60 + 360) % 360;
        const off = Math.abs(((hue - centre + 540) % 360) - 180);
        // close to the hue, saturated enough, and not too dark
        k = (1 - smooth(half, half + FEATHER, off)) * smooth(0.18, 0.4, c / max) * smooth(25, 60, max);
      }
      d[i] = grey + (r - grey) * k;
      d[i + 1] = grey + (gr - grey) * k;
      d[i + 2] = grey + (b - grey) * k;
    }
    g.putImageData(img, 0, 0);
    return out;
  }
  // A tile drawn ahead is only used if no earlier filter changed it. A filter that changes a tile
  // hands on a canvas, so an untouched tile is still an image.
  const ahead = (rec, source) =>
    (pre?.hue === keep && source instanceof HTMLImageElement ? pre.tiles.get(rec.url) : null);
  // order 4: after gradient (2) and ascii (3)
  ggs.tiles.filter((rec, source) => (keep ? ahead(rec, source) ?? draw(source) : source), 4);

  const drop = p => {
    p?.tiles.cancel();
    if (pre === p) pre = null;
  };
  function apply(cfg) {
    const next = HUES[cfg?.filter] ?? null;
    ggs.view.effect('greyscale', cfg && !next ? { filter: CSS[cfg.filter] ?? CSS.grey } : null);
    if (next !== keep) {
      keep = next;
      const p = pre;
      ggs.tiles.replay().then(() => drop(p));
    }
  }
  ggs.scripts.greyscale = {
    // only the "Only <colour>" filters redraw tiles; the others are instant
    prepare(cfg) {
      const hue = HUES[cfg.filter];
      if (!hue) return null;
      drop(pre);
      const p = pre = { hue, tiles: ggs.tiles.prerender(img => draw(img, hue)) };
      return { ready: p.tiles.ready, cancel: () => drop(p) };
    },
    start(cfg) {
      apply(cfg);
      return { update: apply, stop: () => apply(null) };
    },
  };
})();

// ==================== src/scripts/peek/meta.js ====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'peek',
    name: 'Partial view',
    description: 'You only see part of Street View.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'part', label: 'Visible part', type: 'select', default: 'top', choices: [
        { value: 'top', label: 'Top half' },
        { value: 'bottom', label: 'Bottom half' },
        { value: 'left', label: 'Left half' },
        { value: 'right', label: 'Right half' },
        { value: 'centre', label: 'Centre' },
        { value: 'spyglass', label: 'Spyglass' },
        { value: 'strip', label: 'Horizon strip' },
        { value: 'edges', label: 'All but the centre' },
        { value: 'topLeft', label: 'Top-left triangle' },
        { value: 'topRight', label: 'Top-right triangle' },
        { value: 'bottomLeft', label: 'Bottom-left triangle' },
        { value: 'bottomRight', label: 'Bottom-right triangle' },
        { value: 'dvd', label: 'Bouncing DVD window' },
        { value: 'random', label: 'Random each round' },
      ] },
    ],
  });
})();

// ==================== src/scripts/peek/main.js ====================================
// Partial view: a paper sheet over Street View (core/view.js) with one hole to look through.
// Each PART is the path of what stays visible in a w x h box. Points E past the edge keep the
// cut's outline out of view. 'dvd' is a window that bounces round the box like an old DVD
// screensaver.
(() => {
  const ggs = globalThis.__ggs;
  const { poly, rect, circle } = ggs.view.shape;
  const E = 40;
  const PARTS = {
    top: (w, h) => poly([[-E, -E], [w + E, -E], [w + E, h / 2], [-E, h / 2]]),
    bottom: (w, h) => poly([[-E, h / 2], [w + E, h / 2], [w + E, h + E], [-E, h + E]]),
    left: (w, h) => poly([[-E, -E], [w / 2, -E], [w / 2, h + E], [-E, h + E]]),
    right: (w, h) => poly([[w / 2, -E], [w + E, -E], [w + E, h + E], [w / 2, h + E]]),
    centre: (w, h) => rect(w * 0.3, h * 0.3, w * 0.4, h * 0.4, 14),
    spyglass: (w, h) => circle(w / 2, h / 2, Math.min(w, h) * 0.28),
    strip: (w, h) => poly([[-E, h * 0.4], [w + E, h * 0.4], [w + E, h * 0.6], [-E, h * 0.6]]),
    // the whole box with the centre put back: a frame you see the edges through
    edges: (w, h) =>
      poly([[-E, -E], [w + E, -E], [w + E, h + E], [-E, h + E]]) + rect(w * 0.2, h * 0.2, w * 0.6, h * 0.6, 14),
    topLeft: (w, h) => poly([[-E, -E], [w + E, -E], [-E, h + E]]),
    topRight: (w, h) => poly([[-E, -E], [w + E, -E], [w + E, h + E]]),
    bottomLeft: (w, h) => poly([[-E, -E], [w + E, h + E], [-E, h + E]]),
    bottomRight: (w, h) => poly([[w + E, -E], [w + E, h + E], [-E, h + E]]),
  };
  const NAMES = [...Object.keys(PARTS), 'dvd'];
  // window size as a share of the box, and speed in px per second along each axis
  const DVD = { w: 0.32, h: 0.3, speed: 160 };

  // The bouncing window: moves by the time since the last frame and turns back at each edge.
  function dvd() {
    let x = null, y = 0, dx = 1, dy = 1, last = 0;
    return (w, h) => {
      const now = performance.now();
      // capped, so it doesn't jump after the tab was hidden
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const ww = w * DVD.w, wh = h * DVD.h;
      if (x == null) {
        x = Math.random() * (w - ww);
        y = Math.random() * (h - wh);
      }
      x += dx * DVD.speed * dt;
      y += dy * DVD.speed * dt;
      if (x < 0 || x > w - ww) {
        dx = -dx;
        x = Math.max(0, Math.min(w - ww, x));
      }
      if (y < 0 || y > h - wh) {
        dy = -dy;
        y = Math.max(0, Math.min(h - wh, y));
      }
      return rect(x, y, ww, wh, 14);
    };
  }

  function start(cfg) {
    let part = cfg.part, round = null, randomPart = null;
    const pick = () => {
      if (part !== 'random') return part;
      const now = ggs.game.roundKey();
      if (now !== round) {
        round = now;
        randomPart = NAMES[Math.floor(Math.random() * NAMES.length)];
      }
      return randomPart;
    };
    const bounce = dvd();
    const cut = (w, h) => (pick() === 'dvd' ? bounce : PARTS[pick()] ?? PARTS.top)(w, h);
    const mask = ggs.view.mask({ over: 'pano', look: 'paper', cut });
    return { stop: mask.stop, update(next) { part = next.part; } };
  }
  ggs.scripts.peek = { start };
})();

// ==================== src/scripts/blank/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'blank',
    name: 'Blank screen',
    description: 'Blacks out everything but the guess map.',
    section: 'streetview',
    defaultEnabled: false,
    options: [],
  });
})();

// ==================== src/scripts/blank/main.js ===================================
// Blank screen: a dark sheet over the window (core/view.js) with one hole round the guess map
// and its Guess button. The hole follows the map as it grows on hover. Only shown during a round,
// and OGGS's own tab and panels sit above it.
(() => {
  const ggs = globalThis.__ggs;
  const PAD = 2;

  function cut() {
    const r = ggs.view.guessArea();
    return r && ggs.view.shape.rect(r.left - PAD, r.top - PAD, r.width + 2 * PAD, r.height + 2 * PAD, 12);
  }
  ggs.scripts.blank = { start: () => ggs.view.mask({ over: 'screen', look: 'night', cut }) };
})();

// ==================== src/scripts/flip/meta.js ====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'flip',
    name: 'Flipped view',
    description: 'Street View mirrored or upside down.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'flip', label: 'Flip', type: 'buttons', default: 'mirror', choices: [
        { value: 'mirror', label: 'Mirror' },
        { value: 'upside', label: 'Upside down' },
      ] },
    ],
  });
})();

// ==================== src/scripts/flip/main.js ====================================
// Flipped view: a CSS transform on the Street View picture, with the controls flipped to match
// (core/view.js): the mouse is mirrored round the view's centre, so dragging follows the cursor
// and click-to-move goes where you clicked, and a mirrored view swaps the turn keys.
(() => {
  const ggs = globalThis.__ggs;
  const FLIPS = { mirror: [true, false], upside: [false, true] };
  function apply(cfg) {
    const [x, y] = cfg ? FLIPS[cfg.flip] ?? FLIPS.mirror : [];
    ggs.view.effect('flip', cfg && { transform: `scale(${x ? -1 : 1}, ${y ? -1 : 1})` });
    ggs.view.mirror('flip', cfg && { flipX: x, flipY: y, turn: x });
  }
  ggs.scripts.flip = { start(cfg) { apply(cfg); return { update: apply, stop: () => apply(null) }; } };
})();

// ==================== src/scripts/spin/meta.js ====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'spin',
    name: 'Spinning view',
    description: 'Street View slowly spins.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // SECS in main.js: 4 is one turn a minute, 10 one every 2 seconds
      { key: 'speed', label: 'Speed', type: 'slider', min: 1, max: 10, default: 4, marks: ['Less', 'More'] },
    ],
  });
})();

// ==================== src/scripts/spin/main.js ====================================
// Spinning view: the Street View picture turns clockwise (core/view.js). It's scaled up by the
// box's diagonal over its short side so no corner shows. A speed change carries on from the
// current angle.
(() => {
  const ggs = globalThis.__ggs;
  // seconds per turn for each step of the Speed slider (1-10)
  const SECS = [120, 90, 75, 60, 40, 25, 15, 8, 4, 2];

  function start(cfg) {
    // base: degrees turned before `from`
    let speed = cfg.speed, from = performance.now(), base = 0;
    const angle = now => (base + (now - from) * 360 / (SECS[speed - 1] ?? 60) / 1000) % 360;
    ggs.view.effect('spin', {
      transform(now, w, h) {
        const grow = Math.hypot(w, h) / Math.max(1, Math.min(w, h));
        return `rotate(${angle(now).toFixed(2)}deg) scale(${grow.toFixed(3)})`;
      },
    });
    return {
      stop() { ggs.view.effect('spin', null); },
      update(next) {
        const now = performance.now();
        base = angle(now);
        from = now;
        speed = next.speed;
      },
    };
  }
  ggs.scripts.spin = { start };
})();

// ==================== src/scripts/blink/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'blink',
    name: 'Blink',
    description: 'Street View only shows for a moment.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // index into MS in main.js
      { key: 'shown', label: 'Shown for (s)', type: 'slider', min: 0, max: 5, default: 4,
        marks: ['0.1', '0.5', '1', '2', '5', '10'] },
    ],
  });
})();

// ==================== src/scripts/blink/main.js ===================================
// Blink: each round Street View is covered by a paper sheet (core/view.js). It says "Loading…"
// until the round's tiles show (at least LOADING_MS), then "Get ready" for READY_MS. Then the
// view shows for the chosen time, with a bar counting down, and is covered again until the round
// ends. Switched on mid-round (or after a reload), it goes straight to "Get ready".
(() => {
  const ggs = globalThis.__ggs;
  const MS = [100, 500, 1000, 2000, 5000, 10000]; // by the Shown for slider
  const LOADING_MS = 1000, READY_MS = 1000;
  const NO_TILES_MS = 5000; // a round whose tiles never show up moves on anyway
  // While covered, a stylesheet also makes every Street View picture (any .gm-style but the guess
  // map's) see-through. It applies the moment GeoGuessr adds a new one, before the sheet moves onto
  // it, so a new round or a reload never flashes the view. Opacity keeps tiles loading, unlike
  // visibility. Only during a round, since the results screen's map is a .gm-style too.
  const HIDE_CSS =
    '.gm-style:not([class*="guess-map"] *, [data-qa="guess-map"] *) { opacity: 0 !important; }';
  const INK = '#1c1a2e', YELLOW = '#fecd19';
  const BAR_CSS = 'position:fixed;z-index:2147481000;height:4px;' +
    `background:${YELLOW};box-shadow:0 -1px 0 ${INK};pointer-events:none;`;
  const CARD_CSS = `position:fixed;z-index:2147481000;transform:translate(-50%,-50%);flex-direction:column;
    align-items:center;gap:10px;font:800 18px/1 system-ui,sans-serif;letter-spacing:.04em;color:${INK};
    pointer-events:none;`;
  const CARD_HTML = '<span></span>' +
    `<b style="display:block;width:160px;height:8px;border:1.5px solid ${INK};border-radius:6px;overflow:hidden">
      <i style="display:block;height:100%;width:0;background:${YELLOW}"></i></b>`;

  function start(cfg) {
    let ms = MS[cfg.shown] ?? 5000;
    let round = null; // { key, since, ready, until }
    let first = true;
    const el = (css, html = '') => {
      const e = Object.assign(document.createElement('div'), { hidden: true, innerHTML: html });
      e.style.cssText = css;
      e.setAttribute('data-ggs-view', '');
      document.body.append(e);
      return e;
    };
    const bar = el(BAR_CSS);
    const card = el(CARD_CSS, CARD_HTML);
    const word = card.querySelector('span');
    const meter = card.querySelector('b');
    const fill = meter.firstElementChild;
    const hide = Object.assign(document.createElement('style'), { textContent: HIDE_CSS });
    document.head.append(hide);

    // the step a round is on: loading, ready, show or done
    function stepOf(now) {
      if (round.ready == null) {
        const loaded = ggs.view.lastTile() >= round.since || now - round.since >= NO_TILES_MS;
        if (now - round.since < LOADING_MS || !loaded) return 'loading';
        round.ready = now;
      }
      if (now < round.ready + READY_MS) return 'ready';
      round.until ??= round.ready + READY_MS + ms;
      return now < round.until ? 'show' : 'done';
    }

    let step = 'loading';
    function tick() {
      bar.hidden = true;
      card.style.display = 'none';
      if (!ggs.maps.guessMapElement()) return;
      const key = ggs.game.roundKey();
      const now = performance.now();
      if (round?.key !== key) {
        // switched on with Street View already up: straight to "Get ready"
        round = first && ggs.view.lastTile() > 0 ? { key, since: now, ready: now } : { key, since: now };
        first = false;
      }
      step = stepOf(now);
      const r = ggs.view.panoElement()?.getBoundingClientRect();
      if (!r) return;
      if (step === 'loading' || step === 'ready') {
        word.textContent = step === 'loading' ? 'Loading…' : 'Get ready';
        meter.style.visibility = step === 'ready' ? 'visible' : 'hidden';
        fill.style.width = `${Math.min(100, (now - round.ready) / READY_MS * 100) || 0}%`;
        Object.assign(card.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` });
        card.style.display = 'flex'; // not `hidden`: the inline display would beat it
      } else if (step === 'show') {
        const width = r.width * (round.until - now) / ms;
        Object.assign(bar.style, { left: `${r.left}px`, top: `${r.bottom - 4}px`, width: `${width}px` });
        bar.hidden = false;
      }
    }

    const covered = () => !round || round.key !== ggs.game.roundKey() || step !== 'show';
    const mask = ggs.view.mask({ over: 'pano', look: 'paper', cut: () => (covered() ? '' : null) });
    const run = () => {
      tick();
      hide.disabled = !(covered() && ggs.maps.guessMapElement());
    };
    const timer = setInterval(run, 30);
    run();
    return {
      stop() {
        clearInterval(timer);
        mask.stop();
        bar.remove();
        card.remove();
        hide.remove();
      },
      update(next) {
        ms = MS[next.shown] ?? 5000;
      },
    };
  }
  ggs.scripts.blink = { start };
})();

// ==================== src/scripts/ascii/meta.js ===================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'ascii',
    name: 'ASCII cam',
    description: 'Street View drawn in text characters.',
    section: 'streetview',
    defaultEnabled: false,
    // they re-upload tiles later, past this filter
    excludes: ['minecraft', 'lying-signs', 'gradient'],
    options: [
      { key: 'look', label: 'Look', type: 'buttons', default: 'white', choices: [
        { value: 'white', label: 'Black and white' },
        { value: 'colour', label: 'Colour' },
      ] },
    ],
  });
})();

// ==================== src/scripts/ascii/main.js ===================================
// ASCII cam: every Street View tile (via core/tiles.js) is redrawn as text. The tile is shrunk
// to one pixel per character cell and each cell gets a character by its brightness: black on
// white, or coloured on a dark background.
// Only the picture uploaded to WebGL changes. Nothing is read from or sent anywhere.
// prepare(cfg) draws the panorama on screen ahead (core/tiles.js prerender), for Chaos mode.
(() => {
  const ggs = globalThis.__ggs;
  const RAMP = ' .:-=+*#%@'; // darkest to brightest
  const ACROSS = 64; // characters across a zoom-3 (45°) tile
  const BG = '#0b0a12', PAPER = '#ffffff', INK = '#111111';
  let active = null;
  let pre = null; // { look, tiles } drawn ahead by prepare

  // Characters per tile, the same size on screen at every zoom: one zoom step in halves the
  // angle a tile covers, so it gets half the characters. At least 4 px each.
  const across = (z, w) => Math.max(2, Math.min(w / 4, Math.round(ACROSS * 2 ** (3 - z))));

  // White characters, one per RAMP entry, side by side in a strip. Made once per cell size.
  const atlases = new Map();
  function atlas(cw, ch) {
    const key = `${cw}x${ch}`;
    if (atlases.has(key)) return atlases.get(key);
    const a = new OffscreenCanvas(Math.ceil(cw) * RAMP.length, Math.ceil(ch));
    const g = a.getContext('2d');
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(ch * 0.92)}px ui-monospace, Menlo, Consolas, monospace`;
    [...RAMP].forEach((c, i) => g.fillText(c, (i + 0.5) * Math.ceil(cw), ch / 2));
    if (atlases.size > 12) atlases.clear();
    atlases.set(key, a);
    return a;
  }

  const small = new OffscreenCanvas(1, 1);
  function draw(source, z, look = active.look) {
    const w = source.width || source.naturalWidth || 512;
    const h = source.height || source.naturalHeight || 512;
    const nx = across(z, w);
    const cw = w / nx;
    const ny = Math.max(1, Math.round(h / (cw * 1.6))); // characters are taller than wide
    const ch = h / ny;
    small.width = nx;
    small.height = ny;
    const s = small.getContext('2d', { willReadFrequently: true });
    s.imageSmoothingQuality = 'high';
    s.drawImage(source, 0, 0, nx, ny);
    const px = s.getImageData(0, 0, nx, ny).data;

    // characters drawn once, then coloured (source-in keeps only the glyphs)
    const paper = look === 'white';
    const glyphs = new OffscreenCanvas(w, h);
    const g = glyphs.getContext('2d');
    const strip = atlas(cw, ch);
    const sw = Math.ceil(cw);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = (y * nx + x) * 4;
      let light = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (paper) light = 1 - light; // black on white: dark cells get the dense characters
      const c = Math.min(RAMP.length - 1, Math.round(light ** 0.8 * (RAMP.length - 1)));
      if (c) g.drawImage(strip, c * sw, 0, sw, strip.height, x * cw, y * ch, cw, ch);
    }
    g.globalCompositeOperation = 'source-in';
    if (paper) {
      g.fillStyle = INK;
      g.fillRect(0, 0, w, h);
    } else {
      g.imageSmoothingEnabled = false;
      g.filter = 'saturate(1.3) brightness(1.6)'; // dim cells would vanish on the dark background
      g.drawImage(small, 0, 0, w, h);
    }

    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.fillStyle = paper ? PAPER : BG;
    o.fillRect(0, 0, w, h);
    o.drawImage(glyphs, 0, 0);
    return out;
  }

  // A tile drawn ahead is used only while it's still a plain picture. An earlier filter that
  // changes a tile hands on a canvas instead.
  const ahead = (rec, source) =>
    (pre?.look === active.look && source instanceof HTMLImageElement ? pre.tiles.get(rec.url) : null);
  // order 3: after gradient (2)
  ggs.tiles.filter((rec, source) =>
    (active && rec.key ? ahead(rec, source) ?? draw(source, rec.key.z) : source), 3);

  const drop = p => {
    p?.tiles.cancel();
    if (pre === p) pre = null;
  };
  ggs.scripts.ascii = {
    prepare(cfg) {
      drop(pre);
      const tiles = ggs.tiles.prerender((img, k) => draw(img, k.z, cfg.look));
      const p = pre = { look: cfg.look, tiles };
      return { ready: p.tiles.ready, cancel: () => drop(p) };
    },
    start(cfg) {
      active = cfg;
      const p = pre;
      ggs.tiles.replay().then(() => drop(p)); // only the first replay needs them
      return {
        stop() {
          active = null;
          ggs.tiles.replay();
        },
        update(next) {
          const changed = next.look !== active.look;
          active = next;
          if (changed) ggs.tiles.replay();
        },
      };
    },
  };
})();

// ==================== src/scripts/compass/meta.js =================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'compass',
    name: 'Compass lock',
    description: 'Stuck facing one direction.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'dir', label: 'Facing', type: 'buttons', default: 'n', choices: [
        { value: 'n', label: 'North' },
        { value: 'e', label: 'East' },
        { value: 's', label: 'South' },
        { value: 'w', label: 'West' },
      ] },
    ],
  });
})();

// ==================== src/scripts/compass/main.js =================================
// Compass lock: every panorama faces the chosen compass direction, level, and can't be turned
// (core/lock.js's pan lock at that heading). Moving still works.
(() => {
  const ggs = globalThis.__ggs;
  const HEADING = { n: 0, e: 90, s: 180, w: 270 };
  const face = cfg => ggs.lock.face('compass', cfg ? HEADING[cfg.dir] ?? 0 : null);
  ggs.scripts.compass = { start(cfg) { face(cfg); return { update: face, stop: () => face(null) }; } };
})();

// ==================== src/scripts/eye/meta.js =====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'eye',
    name: 'Scream to look',
    description: 'Street View only opens when you make noise.',
    section: 'misc',
    defaultEnabled: false,
    mic: true, // can't be switched on while the microphone is blocked
    options: [
      // how quiet a sound still opens the eye a crack: 5 is normal talking
      { key: 'sensitivity', label: '', type: 'slider', min: 1, max: 10, default: 5,
        marks: ['Louder', 'Quieter'] },
    ],
  });
})();

// ==================== src/scripts/eye/main.js =====================================
// Scream to look: a paper sheet over Street View (core/view.js) with one eye-shaped hole, shut
// when it's quiet. Loudness opens it: a little noise a crack, a scream all the way. It opens
// smoothly and snaps shut. The sound is only measured (an AnalyserNode in this page), never
// recorded or sent. Without a microphone, or when it's refused, the eye stays open.
(() => {
  const ggs = globalThis.__ggs;
  const RANGE_DB = 25; // from a crack to wide open
  const SHUT_STEP = 0.15; // closing speed, per frame
  const GESTURES = ['pointerdown', 'keydown'];

  // the opening between the lids: two curves from far past the sides, apart by `open` (0..1)
  function lids(w, h, open) {
    const n = v => Math.round(v);
    const y = h / 2;
    const bulge = 1.5 * h * open;
    const l = -0.3 * w;
    const r = 1.3 * w;
    return `M${n(l)} ${n(y)}Q${n(w / 2)} ${n(y - bulge)} ${n(r)} ${n(y)}` +
      `Q${n(w / 2)} ${n(y + bulge)} ${n(l)} ${n(y)}Z`;
  }

  function start(cfg) {
    let sensitivity = cfg.sensitivity ?? 5;
    let open = 0;
    let stopped = false;
    let stream = null, audio = null, analyser = null, raf = 0;
    const status = text => ggs.status('eye', text);

    // no sheet until there's a microphone to open the eye with
    const mask = ggs.view.mask({
      over: 'pano', look: 'paper', cut: (w, h) => (!analyser || open > 0.98 ? null : lids(w, h, open)),
    });

    const resume = () => {
      audio?.resume().catch(() => {});
    };
    const onState = () => {
      if (stopped) return;
      const running = audio.state === 'running';
      for (const t of GESTURES) window[running ? 'removeEventListener' : 'addEventListener'](t, resume, true);
      status(running ? 'Listening' : 'Click the page to start listening');
    };

    const buf = new Float32Array(1024);
    function frame() {
      raf = requestAnimationFrame(frame);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const db = 10 * Math.log10(sum / buf.length + 1e-12);
      const floor = -20 - 3 * sensitivity; // 5: normal talking opens it a crack
      const want = Math.max(0, Math.min(1, (db - floor) / RANGE_DB));
      open = want > open ? open + (want - open) * 0.3 : Math.max(want, open - SHUT_STEP);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        mask.stop();
        if (stopped) return;
        // refused: it switches itself off rather than stay on doing nothing
        if (err?.name === 'NotAllowedError') {
          ggs.saveSetting('eye', { enabled: false });
          status('Microphone blocked, so it was switched off');
        } else {
          status('No microphone, so the eye stays open');
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      audio = new AudioContext();
      const a = audio.createAnalyser();
      a.fftSize = buf.length;
      audio.createMediaStreamSource(stream).connect(a);
      analyser = a;
      audio.addEventListener('statechange', onState);
      onState();
      frame();
    })();

    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        mask.stop();
        for (const t of GESTURES) window.removeEventListener(t, resume, true);
        stream?.getTracks().forEach(t => t.stop());
        audio?.close().catch(() => {});
        status('');
      },
      update(next) {
        sensitivity = next.sensitivity ?? 5;
      },
    };
  }
  ggs.scripts.eye = { start };
})();

// ==================== src/scripts/lag/meta.js =====================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'lag',
    name: 'Lag',
    description: 'A terrible connection.',
    section: 'misc',
    defaultEnabled: false,
    options: [
      { key: 'level', label: '', type: 'slider', min: 1, max: 10, default: 4, marks: ['Less', 'More'] },
    ],
  });
})();

// ==================== src/scripts/lag/main.js =====================================
// Fake lag: the game acts as if the connection is bad. At random gaps (shorter at higher levels)
// an episode is picked from EFFECTS by weight: spinners, loading bars, chunky or blurry Street
// View, a ping readout. Higher levels also get in the way: held or late input, snapping back to
// the last panorama, slow guesses, late or misplaced pins, a stuttering view.
// Every episode ends on its own timer. It all happens only during a round, leaving the round ends
// every episode, and held input is always sent, never lost.
(() => {
  const ggs = globalThis.__ggs;
  const INPUT = [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup',
    'click', 'dblclick', 'contextmenu', 'wheel', 'keydown', 'keyup',
  ];
  // Street View's own keys (as core/lock.js)
  const KEYS = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
    '+', '-', '=', '_', 'z', 'x', 'Z', 'X', 'Backspace',
  ];
  // Input events kept during one freeze. Mouse moves past this are dropped.
  const MAX_HELD = 500;
  const between = (lo, hi) => lo + Math.random() * (hi - lo);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const roll = p => Math.random() < p;
  const inRound = () => !!ggs.maps.guessMapElement() && !!ggs.view.panoElement();
  const panoRect = () => ggs.view.panoElement()?.getBoundingClientRect() ?? null;

  // How bad, from the level (1-10). s runs 0..1 over the slider. hard is 0 below 5, then rises as
  // a square: 5 is mildly annoying, 10 barely playable.
  // Gaps between episodes: about 45-90 s at 1, 16-32 s at 5, 7-14 s at 7, 1.5-3 s at 10.
  function knobs(level) {
    const s = (level - 1) / 9;
    const hard = level >= 5 ? ((level - 4) / 6) ** 2 : 0;
    const gap = 45 * (1 / 30) ** (s ** 1.5);
    return { level, s, hard, gap: [gap, 2 * gap], len: 1 + s * s, double: hard * 0.7 };
  }

  // ---- chunky tiles (core/tiles.js) ----
  // While `chunk` is set, each tile is drawn from a copy `chunk` times smaller, and a few are left
  // grey or blurred as if still loading.
  // A whole-texture upload gets the small copy itself, sized to a power of two (so WebGL 1 can
  // still mipmap and wrap it) and magnified NEAREST. That is next to free, where a full-size copy
  // of every tile stalled the game for up to a second. LINEAR (the default, and what Street View
  // uses) comes back with the full tile. It isn't read back with gl.getTexParameter, which waits
  // for the GPU process.
  // Partial uploads (texSubImage2D, or a mip level) must keep their size, so they get a full-size
  // copy.
  let chunk = 0, greyShare = 0;
  const GREY = '#8e9094';
  const pot = n => 2 ** Math.max(0, Math.round(Math.log2(n)));
  const sharp = new WeakSet(); // textures drawn NEAREST
  function nearest(rec, on) {
    const { gl, tex, target } = rec;
    if (on === sharp.has(tex)) return;
    const prev = gl.getParameter(ggs.glBinding(gl, target)[1]);
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : gl.LINEAR);
    gl.bindTexture(target, prev);
    if (on) sharp.add(tex);
    else sharp.delete(tex);
  }
  // One canvas per size, reused. A whole-texture upload copies it before the filter runs again,
  // and nothing after this filter keeps it, so hundreds of tiles don't leave hundreds of canvases.
  const scratches = new Map();
  function scratch(w, h) {
    const key = `${w}x${h}`;
    if (!scratches.has(key)) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').globalCompositeOperation = 'copy'; // each tile replaces the last
      scratches.set(key, c);
    }
    return scratches.get(key);
  }
  function lowRes(rec, source) {
    const w = source.naturalWidth || source.width || 512;
    const h = source.naturalHeight || source.height || 512;
    const whole = rec.name === 'texImage2D' && rec.args[1] === 0;
    const r = Math.random();
    const grey = r < greyShare;
    const blurry = !grey && r < 2 * greyShare;
    const k = blurry ? 48 : chunk;
    const size = n => (grey ? 1 : whole ? pot(n / k) : Math.max(1, Math.round(n / k)));
    const small = whole ? scratch(size(w), size(h)) : new OffscreenCanvas(size(w), size(h));
    const g = small.getContext('2d');
    if (grey) {
      g.fillStyle = GREY;
      g.fillRect(0, 0, 1, 1);
    } else {
      g.drawImage(source, 0, 0, small.width, small.height);
    }
    if (whole) {
      nearest(rec, !grey && !blurry);
      return small;
    }
    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = blurry;
    o.drawImage(small, 0, 0, w, h);
    return out;
  }
  ggs.tiles.filter((rec, source) => {
    if (chunk) return lowRes(rec, source);
    if (sharp.has(rec.tex)) nearest(rec, false);
    return source;
  }, 5); // after greyscale (4)

  // ---- panoramas, for rubber-banding and stutter ----
  const panos = new Map(); // StreetViewPanorama -> its element
  let onMove = null; // the running script's pano_changed handler
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    panos.set(p, args[0]);
    window.google.maps.event.addListener(p, 'pano_changed', () => onMove?.(p));
  });
  function pano() {
    const el = ggs.view.panoElement();
    return el && [...panos].reverse().find(([, e]) => e === el || e?.contains?.(el) || el.contains(e))?.[0];
  }

  // ---- looks ----
  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147481000; pointer-events: none;
            font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .lag { position: absolute; translate: -50% -50%; animation: in .2s ease-out; transition: opacity .25s; }
    .out { opacity: 0; }
    @keyframes in { from { opacity: 0; } }
    @keyframes turn { to { transform: rotate(360deg); } }
    @keyframes fade { from { opacity: 1; } to { opacity: .15; } }
    @keyframes hop { 0%, 60%, 100% { transform: none; } 30% { transform: translateY(-8px); } }
    @keyframes flip {
      0%, 40% { transform: rotate(0); }
      50%, 90% { transform: rotate(180deg); }
      100% { transform: rotate(360deg); } }
    @keyframes orbit {
      0% { transform: rotate(225deg); opacity: 1; animation-timing-function: ease-out; }
      7% { transform: rotate(345deg); animation-timing-function: linear; }
      30% { transform: rotate(455deg); animation-timing-function: ease-in-out; }
      39% { transform: rotate(690deg); animation-timing-function: linear; }
      70% { transform: rotate(815deg); opacity: 1; animation-timing-function: ease-out; }
      75% { transform: rotate(945deg); animation-timing-function: ease-out; }
      76%, 100% { transform: rotate(945deg); opacity: 0; } }
    @keyframes dash {
      0% { stroke-dasharray: 1 150; stroke-dashoffset: 0; }
      50% { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
      100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; } }
    .shade { filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .55)); }
    .dark { background: rgba(28, 26, 46, .82); color: #fff; box-shadow: 0 6px 18px -6px rgba(0, 0, 0, .6); }
    .ring { width: 46px; height: 46px; border-radius: 50%; border: 5px solid rgba(255, 255, 255, .25);
            border-top-color: #fff; box-sizing: border-box; animation: turn .8s linear infinite; }
    .wheel { width: 56px; height: 56px; border-radius: 14px; }
    .wheel span { position: absolute; left: 50%; top: 50%; width: 4px; height: 12px; margin: -6px -2px;
                  border-radius: 2px; background: #fff; animation: fade .9s linear infinite; }
    .dots { display: flex; gap: 7px; padding: 13px 16px; border-radius: 999px; }
    .dots i { width: 9px; height: 9px; border-radius: 50%; background: #fecd19;
              animation: hop 1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    .glass { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; }
    .glass b { animation: flip 2s ease-in-out infinite; }
    .win { width: 48px; height: 48px; }
    .win i { position: absolute; inset: 0; animation: orbit 5.5s infinite both; }
    .win i::after { content: ''; position: absolute; left: 50%; top: 0; width: 6px; height: 6px; margin-left: -3px;
                    border-radius: 50%; background: #fff; }
    .tube { width: 68px; height: 68px; animation: turn 1.4s linear infinite; }
    .tube circle { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round;
                   animation: dash 1.4s ease-in-out infinite; }
    .pill { display: flex; align-items: center; gap: 9px; padding: 8px 15px 8px 11px; border-radius: 999px;
            white-space: nowrap; }
    .pill i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .3);
              border-top-color: #fecd19; box-sizing: border-box; animation: turn .8s linear infinite; }
    .pct { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 50%; font-size: 14px; }
    .pct::before { content: ''; position: absolute; inset: 6px; border-radius: 50%;
                   border: 3px solid rgba(255, 255, 255, .2); border-left-color: #fecd19;
                   animation: turn 1.1s linear infinite; }
    .ping { padding: 6px 11px; border-radius: 6px; font: 700 12px/1 ui-monospace, Menlo, Consolas, monospace;
            white-space: nowrap; }
    .ping b { color: #ff6b5b; }
    .ping .ok { color: #fecd19; }
    .card { width: 230px; padding: 12px 14px; background: #f5f1e8; color: #1c1a2e; border: 2px solid #1c1a2e;
            border-radius: 10px; box-shadow: 4px 4px 0 rgba(28, 26, 46, .35); }
    .card p { margin: 0 0 8px; font-weight: 800; }
    .card span { float: right; font-variant-numeric: tabular-nums; }
    .card small { display: block; font-size: 11px; opacity: .6; }
    .card u { display: block; height: 10px; border: 1.5px solid #1c1a2e; border-radius: 6px; overflow: hidden;
              margin-bottom: 6px; }
    .bar { display: block; height: 100%; width: 0; background: #fecd19; transition: width .15s; }
    .top { position: absolute; height: 4px; overflow: hidden; }
    .top .bar { box-shadow: 0 0 10px #fecd19; }
    .badge { padding: 5px 9px; border-radius: 5px; font-size: 12px; }
    .badge b { color: #fecd19; }
    .fog { position: absolute; background: rgba(255, 255, 255, .42); backdrop-filter: saturate(.4);
           animation: in .6s; transition: opacity .25s; }
    .dialog { width: 340px; padding: 22px 24px 18px; background: #fff; color: #202124; border-radius: 8px;
              pointer-events: auto; box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
              font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .dialog h1 { margin: 0 0 10px; font-size: 16px; font-weight: 500; }
    .dialog p { margin: 0 0 6px; color: #5f6368; }
    .dialog div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .dialog button { font: 500 13px system-ui, sans-serif; padding: 8px 16px; border-radius: 4px; cursor: pointer;
                     border: 1px solid #dadce0; background: #fff; color: #1a73e8; }
    .dialog button.main { background: #1a73e8; border-color: #1a73e8; color: #fff; }
  `;
  // Spinners: html, and an optional live(el, ep) for ones whose text changes.
  const wheelSpokes = Array.from({ length: 12 }, (_, i) =>
    `<span style="transform: rotate(${i * 30}deg) translateY(-15px); ` +
    `animation-delay: ${(i * 0.075 - 0.9).toFixed(3)}s"></span>`).join('');
  const windowsDots = [0, 1, 2, 3, 4].map(i => `<i style="animation-delay: ${i * 0.24}s"></i>`).join('');
  const SPINNERS = {
    ring: { html: '<div class="lag shade ring"></div>' },
    wheel: { html: `<div class="lag dark wheel">${wheelSpokes}</div>` },
    dots: { html: '<div class="lag dark dots"><i></i><i></i><i></i></div>' },
    glass: { html: '<div class="lag dark glass"><b>⌛</b></div>' },
    windows: { html: `<div class="lag shade win">${windowsDots}</div>` },
    tube: { html: '<svg class="lag shade tube" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"/></svg>' },
    reconnect: { html: '<div class="lag dark pill"><i></i><span>Reconnecting…</span></div>' },
    server: { html: '<div class="lag dark pill"><i></i><span>Waiting for server…</span></div>' },
    retry: {
      html: '<div class="lag dark pill"><i></i><span>Connection lost. Retrying in 3…</span></div>',
      live(el, ep) {
        let n = 3;
        ep.every(1000, () => {
          n = n > 1 ? n - 1 : 3;
          el.querySelector('span').textContent = `Connection lost. Retrying in ${n}…`;
        });
      },
    },
    percent: {
      html: '<div class="lag dark pct">0%</div>',
      live(el, ep) {
        let p = Math.floor(between(0, 40));
        ep.every(300, () => {
          if (roll(0.6)) p = Math.min(99, p + Math.floor(between(1, 6)));
          el.firstChild.textContent = `${p}%`;
        });
      },
    },
  };
  const FREEZE_SPINNERS = ['ring', 'wheel', 'windows', 'tube', 'server', 'reconnect'];
  // Loading-bar progress per tick (percent): stuck at 99, slipping back now and then, or starting
  // over.
  const BARS = {
    stall: p => Math.min(99, p + between(1, 7)),
    back: p => (roll(0.08) ? Math.max(0, p - between(10, 30)) : Math.min(97, p + between(0, 5))),
    restart: p => (p > 85 ? 0 : p + between(1, 6)),
  };
  const LABELS = ['Loading panorama…', 'Downloading tiles…', 'Syncing round…', 'Buffering…'];

  function start(cfg) {
    let level = Number(cfg.level) || 4;
    let timer = 0;
    let snapUntil = 0;
    const running = new Set();
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', ''); // keys on the fake dialog's buttons stay away from GeoGuessr
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>`;
    document.body.append(host);

    // A random spot over the panorama, away from its edges and outside the guess map's area.
    function spot() {
      const r = panoRect();
      const g = ggs.view.guessArea();
      if (!r || r.width < 200) return null;
      for (let i = 0; i < 12; i++) {
        const x = between(r.left + r.width * 0.15, r.right - r.width * 0.15);
        const y = between(r.top + r.height * 0.15, r.bottom - r.height * 0.2);
        if (!g || x < g.left - 90 || x > g.right + 90 || y < g.top - 50 || y > g.bottom + 50) return [x, y];
      }
      return null;
    }

    // ---- episodes: each owns its timers, elements and undo steps, and ends after its time ----
    function episode(id, ms) {
      const ep = { id, timers: [], els: [], undo: [] };
      ep.after = (t, fn) => ep.timers.push(setTimeout(fn, t));
      ep.every = (t, fn) => ep.timers.push(setInterval(fn, t));
      ep.finally = fn => ep.undo.push(fn);
      ep.show = (html, at, style = {}) => {
        const t = document.createElement('template');
        t.innerHTML = html;
        const el = t.content.firstElementChild;
        if (at) Object.assign(el.style, { left: `${at[0]}px`, top: `${at[1]}px` });
        Object.assign(el.style, style);
        root.append(el);
        ep.els.push(el);
        return el;
      };
      ep.end = () => {
        if (!running.delete(ep)) return;
        ep.timers.forEach(clearTimeout); // clears intervals too
        for (const el of ep.els) {
          el.classList.add('out');
          setTimeout(() => el.remove(), 260);
        }
        for (const fn of ep.undo) {
          try {
            fn();
          } catch (err) {
            ggs.log('lag: undo failed', err);
          }
        }
      };
      running.add(ep);
      ep.after(ms, ep.end);
      return ep;
    }
    const busy = id => [...running].some(ep => ep.id === id);
    const endAll = () => [...running].forEach(ep => ep.end());

    function spinner(ep, name = pick(Object.keys(SPINNERS)), at = spot()) {
      if (!at) return;
      const s = SPINNERS[name];
      const el = ep.show(s.html, at);
      s.live?.(el, ep);
    }
    function showPing(ep, ms = between(400, 1500)) {
      const r = panoRect();
      if (!r) return;
      const html = '<div class="lag dark ping">' +
        'PING <b>0</b> ms · LOSS <b>0</b>% · FPS <b class="ok">0</b></div>';
      const el = ep.show(html, [r.left + r.width / 2, r.top + 70]);
      const [ping, loss, fps] = el.querySelectorAll('b');
      const tick = () => {
        ping.textContent = Math.round(ms * between(0.7, 1.4));
        loss.textContent = Math.round(between(4, 45));
        fps.textContent = Math.round(between(3, 19));
      };
      tick();
      ep.every(350, tick);
    }

    // ---- the effects ----
    function spinners(ep, k) {
      const n = 1 + (roll(k.s * k.s * 0.6) ? 1 : 0) + (roll(k.hard * 0.4) ? 1 : 0);
      const names = Object.keys(SPINNERS).sort(() => Math.random() - 0.5).slice(0, n);
      names.forEach(name => spinner(ep, name));
    }
    function loadingBar(ep) {
      const step = BARS[pick(Object.keys(BARS))];
      const r = panoRect();
      let el, at;
      let label = null;
      if (roll(0.5) && (at = spot())) {
        const text = pick(LABELS);
        const speed = pick(['12 KB/s', '3 KB/s', '0 KB/s']);
        el = ep.show(`<div class="lag card"><p>${text}</p><u><i class="bar"></i></u><span>0%</span>` +
          `<small>${speed}</small></div>`, at);
        label = el.querySelector('p');
        label.dataset.text = text;
      } else if (r) {
        el = ep.show('<div class="top"><i class="bar"></i></div>', [r.left, r.top], { width: `${r.width}px` });
      }
      if (!el) return;
      const bar = el.querySelector('.bar');
      const pct = el.querySelector('span');
      let p = 0;
      ep.every(150, () => {
        const was = p;
        p = step(p);
        bar.style.width = `${p}%`;
        if (pct) pct.textContent = `${Math.floor(p)}%`;
        if (label && p < was - 40) label.textContent = 'Retrying…';
        else if (label && p > 30) label.textContent = label.dataset.text;
      });
    }
    function blocky(ep, k, ms) {
      chunk = Math.round(lerp(10, 40, k.s * k.s));
      greyShare = lerp(0.04, 0.25, k.s * k.s);
      ggs.tiles.replay();
      // sharpens in steps, like tiles coming in at better resolutions
      ep.after(ms * 0.55, () => {
        chunk = Math.max(2, chunk >> 1);
        greyShare = 0;
        ggs.tiles.replay();
      });
      ep.after(ms * 0.8, () => {
        chunk = Math.max(2, chunk >> 1);
        ggs.tiles.replay();
      });
      ep.finally(() => {
        chunk = 0;
        greyShare = 0;
        ggs.tiles.replay();
      });
      if (roll(0.5)) spinner(ep, pick(['ring', 'percent', 'tube']));
    }
    function lowQuality(ep, k, ms) {
      const r = panoRect();
      const badge = r && ep.show('<div class="lag dark badge">Quality: Auto <b>144p</b></div>',
        [r.right - 120, r.top + 70]);
      const steps = [['144p', lerp(4, 9, k.s * k.s)], ['240p', 4], ['480p', 1.5]];
      steps.forEach(([q, px], i) => ep.after(ms * i / 3, () => {
        ggs.view.effect('lag-quality', { filter: `blur(${px}px) saturate(.85)` });
        if (badge) badge.querySelector('b').textContent = q;
      }));
      ep.finally(() => ggs.view.effect('lag-quality', null));
    }
    // Shared with the Street View input queue below.
    let freezes = 0;
    let delay = 0;
    function freeze(ep) {
      freezes++;
      ep.finally(() => {
        freezes--;
        if (!freezes) thaw();
      });
      ep.after(between(300, 800), () => spinner(ep, pick(FREEZE_SPINNERS)));
    }
    function inputDelay(ep, k) {
      delay = Math.round(lerp(150, 900, k.hard));
      ep.finally(() => {
        delay = 0;
      });
      showPing(ep, delay);
    }
    // the view and the guess map jump back to where they were half a second ago
    function stutter(ep) {
      const p = pano();
      const map = ggs.maps.findGuessMap();
      const past = [];
      ep.every(100, () => {
        past.push({ pov: p?.getPov(), centre: map?.getCenter() });
        if (past.length > 5) past.shift();
      });
      ep.every(between(300, 550), () => {
        const old = past[0];
        if (!old || roll(0.3)) return;
        try { if (old.pov) p.setPov({ heading: old.pov.heading, pitch: old.pov.pitch }); } catch {}
        try { if (old.centre) map.setCenter(old.centre); } catch {}
        past.length = 0;
      });
      showPing(ep);
    }
    // a washed-out panorama with a browser-style "Page Unresponsive" box; either button closes it
    function hang(ep) {
      const r = panoRect();
      if (!r) return;
      ep.show('<div class="fog"></div>', [r.left, r.top], { width: `${r.width}px`, height: `${r.height}px` });
      const box = ep.show(`<div class="lag dialog"><h1>Page Unresponsive</h1>
        <p>You can wait for it to become responsive or exit the page.</p><p>www.geoguessr.com</p>
        <div><button>Exit page</button><button class="main">Wait</button></div></div>`,
      [r.left + r.width / 2, r.top + r.height * 0.42]);
      for (const b of box.querySelectorAll('button')) {
        b.addEventListener('click', e => {
          e.stopPropagation();
          ep.end();
        });
      }
    }

    // weight: how often it's picked. from: the first level it happens at. ms: how long it lasts at
    // level 1 (up to twice that at 10). grows: weighs up to 4x more towards 10.
    const EFFECTS = [
      { id: 'spinner', from: 1, weight: 5, ms: [2000, 5000], run: spinners },
      { id: 'bar', from: 1, weight: 3, ms: [3000, 7000], run: loadingBar },
      { id: 'blocky', from: 1, weight: 3, ms: [3000, 6000], run: blocky },
      { id: 'quality', from: 2, weight: 2, ms: [3000, 6000], run: lowQuality },
      { id: 'ping', from: 3, weight: 2, ms: [4000, 8000], run: ep => showPing(ep) },
      { id: 'freeze', from: 5, weight: 4, ms: [1200, 3000], run: freeze, grows: true },
      { id: 'delay', from: 5, weight: 3, ms: [4000, 8000], run: inputDelay, grows: true },
      { id: 'stutter', from: 6, weight: 2, ms: [3000, 6000], run: stutter, grows: true },
      { id: 'hang', from: 7, weight: 1, ms: [4000, 7000], run: hang },
    ];
    function launch(k) {
      const list = EFFECTS
        .filter(e => level >= e.from && !busy(e.id))
        .map(e => [e, e.weight * (e.grows ? 1 + 3 * k.hard : 1)]);
      let r = Math.random() * list.reduce((sum, [, w]) => sum + w, 0);
      const fx = list.find(([, w]) => (r -= w) < 0)?.[0];
      if (!fx) return;
      const ms = between(...fx.ms) * k.len;
      const ep = episode(fx.id, ms);
      try {
        fx.run(ep, k, ms);
      } catch (err) {
        ggs.log('lag: effect failed', err);
        ep.end();
      }
    }
    // The first episode comes at once on switching on, and soon in a new round: 1-3 s, plus up to
    // 8 s more at level 1.
    function next(first, now) {
      const k = knobs(level);
      clearTimeout(timer);
      const wait = now ? 100
        : first ? between(1000, 3000) + (1 - k.s) * between(0, 8000)
        : between(...k.gap) * 1000;
      timer = setTimeout(() => {
        if (inRound()) {
          launch(k);
          if (roll(k.double)) launch(k);
        }
        next(false);
      }, wait);
    }
    next(true, true);
    let roundSeen = ggs.game.roundKey();
    const watch = setInterval(() => {
      if (!inRound() && running.size) endAll();
      const now = ggs.game.roundKey();
      if (inRound() && now !== roundSeen) {
        roundSeen = now;
        next(true);
      }
    }, 300);

    // ---- Street View input: held during a freeze, or sent `delay` ms late ----
    // Real (trusted) events only, so the copies sent below, and other scripts' copies, pass.
    const queue = []; // { e: a copy, target, at, due }, in order
    let pump = 0;
    let pressed = false;
    function wanted(e) {
      if (!e.isTrusted || !inRound()) return false;
      if (e.type.startsWith('key')) {
        return KEYS.includes(e.key) && !ggs.isTyping(e) && !e.ctrlKey && !e.metaKey && !e.altKey
          && !ggs.maps.guessMapElement()?.contains(e.target);
      }
      const t = e.target;
      if (pressed) return true;
      return !!ggs.view.panoElement()?.contains(t) && !t.closest?.('[data-ggs-view], [data-ggs-ui]');
    }
    function hold(e) {
      const take = (freezes || delay || queue.length) && wanted(e);
      // a held press: its drag and release are held too, wherever they go
      if (e.isTrusted && (e.type === 'pointerdown' || e.type === 'mousedown')) pressed = !!take;
      // The release ends it, after the rest of its sequence (mouseup, click) in this task. On
      // pointerup too, since a held pointerdown means the browser sends no mouseup at all.
      if (e.isTrusted && /^(pointerup|mouseup|pointercancel)$/.test(e.type)) {
        setTimeout(() => {
          pressed = false;
        });
      }
      if (!take) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (queue.length > MAX_HELD && e.type.endsWith('move')) return;
      const now = performance.now();
      const due = freezes ? Infinity : Math.max(now + delay, queue.at(-1)?.due ?? 0);
      queue.push({ e: ggs.view.copyEvent(e), target: e.target, at: now, due });
      run();
    }
    const send = q => {
      if (q.target.isConnected) q.target.dispatchEvent(q.e);
    };
    function run() {
      clearTimeout(pump);
      const now = performance.now();
      while (queue.length && queue[0].due <= now) send(queue.shift());
      if (queue.length && queue[0].due < Infinity) pump = setTimeout(run, queue[0].due - now);
    }
    // A freeze ended: everything held happens at once, squeezed into under half a second.
    function thaw() {
      const held = queue.filter(q => q.due === Infinity);
      const now = performance.now();
      const t0 = held[0]?.at;
      const span = (held.at(-1)?.at ?? 0) - t0;
      for (const q of held) q.due = now + (q.at - t0) * Math.min(0.15, 400 / (span || 1));
      run();
    }
    const opts = { capture: true, passive: false };
    for (const t of INPUT) window.addEventListener(t, hold, opts);

    // ---- rubber-banding: a move sometimes snaps back to the last panorama for a moment ----
    const last = new WeakMap(); // panorama -> { id, round }
    onMove = p => {
      if (performance.now() < snapUntil) return;
      const id = p.getPano();
      const round = ggs.game.roundKey();
      const was = last.get(p);
      const k = knobs(level);
      last.set(p, { id, round });
      if (!was || was.round !== round || was.id === id || !inRound()) return;
      if (busy('rubber') || !roll(k.hard * 0.6)) return;
      const ep = episode('rubber', between(250, 600) + between(600, 1500) * k.len);
      snapUntil = Infinity;
      ep.after(between(250, 600), () => {
        if (p.getPano() !== id) return;
        p.setPano(was.id);
        spinner(ep, pick(['reconnect', 'server', 'ring']));
      });
      ep.finally(() => {
        if (p.getPano() === was.id && ggs.game.roundKey() === round) p.setPano(id);
        snapUntil = performance.now() + 500;
      });
    };

    // ---- the guess map: slow guesses, late or misplaced pins (core/aid.js) ----
    let sending = false;
    let pinTimer = 0;
    const aid = ggs.aid('lag', {
      usesLocation: false,
      beforeGuess() {
        const k = knobs(level);
        if (sending === 'pass') return null;
        if (sending) return false;
        if (!k.hard || !roll(0.15 + 0.8 * k.hard)) return null;
        const ms = between(1500, 2500) * (1 + 1.5 * k.hard);
        const ep = episode('guess', ms + 50);
        const btn = ggs.maps.guessButton()?.getBoundingClientRect();
        sending = true;
        ep.finally(() => {
          sending = false;
        });
        const el = ep.show('<div class="lag dark pill"><i></i><span>Sending guess…</span></div>',
          btn ? [btn.left + btn.width / 2, btn.top - 26] : spot());
        if (k.level >= 8) {
          const say = text => {
            el.querySelector('span').textContent = text;
          };
          ep.after(ms * 0.4, () => say('Connection lost. Retrying (1/3)…'));
          ep.after(ms * 0.7, () => say('Retrying (2/3)…'));
        }
        ep.after(ms, () => {
          if (!ggs.maps.guessMapElement()) return;
          sending = 'pass';
          try {
            if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
          } finally {
            sending = true;
          }
        });
        return false;
      },
      // Cursor desync: leaving the guess map sometimes drags the pin past the map's edge, whether
      // you clicked or not (from level 3, more often higher up).
      attach(ctx) {
        let prev = null;
        let last = null;
        const ev = ctx.gm.event;
        const a = ev.addListener(ctx.map, 'mousemove', e => {
          prev = last;
          last = e.latLng;
        });
        const b = ev.addListener(ctx.map, 'mouseout', () => {
          const k = knobs(level);
          const bounds = ctx.map.getBounds();
          if (level < 3 || !last || !bounds || !roll(0.1 + 0.5 * k.s)) return;
          const from = prev ?? ctx.map.getCenter();
          const span = bounds.toSpan();
          const dy = last.lat() - from.lat();
          const dx = last.lng() - from.lng();
          const len = Math.hypot(dx, dy) || 1;
          const far = between(0.15, 0.5);
          const lat = Math.max(-80, Math.min(80, last.lat() + (dy / len) * span.lat() * far));
          const lng = ((last.lng() + (dx / len) * span.lng() * far + 540) % 360) - 180;
          clearTimeout(pinTimer);
          pinTimer = setTimeout(() => place(lat, lng), between(150, 600));
        });
        return () => {
          a.remove();
          b.remove();
        };
      },
      click(latLng, ctx) {
        const k = knobs(level);
        clearTimeout(pinTimer);
        if (!k.hard || !roll(0.1 + 0.7 * k.hard)) return;
        let lat = latLng.lat(), lng = latLng.lng();
        if (roll(0.5)) {
          // late: the pin goes, then shows up a moment later
          setTimeout(() => {
            try { ggs.maps.clearGuess(); } catch {}
          });
          pinTimer = setTimeout(() => place(lat, lng), between(400, 1200) * (1 + k.hard));
        } else {
          // off: it lands, then slides a few dozen pixels away
          const px = between(15, 40) * (1 + k.hard);
          const mPerPx = 156543 * Math.cos(lat * Math.PI / 180) / 2 ** (ctx.map?.getZoom() ?? 2);
          ({ lat, lng } = ggs.aid.destination({ lat, lng }, px * mPerPx / 1000, between(0, 2 * Math.PI)));
          pinTimer = setTimeout(() => place(lat, lng), between(120, 350));
        }
      },
    }).start(cfg);
    const place = (lat, lng) => {
      if (!ggs.maps.guessMapElement()) return;
      try { ggs.maps.placeGuess(lat, lng, { pan: false }); } catch {}
    };

    return {
      stop() {
        clearTimeout(timer);
        clearInterval(watch);
        clearTimeout(pinTimer);
        onMove = null;
        endAll();
        for (const t of INPUT) window.removeEventListener(t, hold, opts);
        clearTimeout(pump);
        queue.splice(0).forEach(send); // anything still held goes now, in order
        aid.stop();
        host.remove();
      },
      update(c) {
        level = Number(c.level) || 4;
        aid.update(c);
      },
    };
  }
  ggs.scripts.lag = { start };
})();

// ==================== src/scripts/scratch/meta.js =================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'scratch',
    name: 'Scratch card',
    description: 'Scratch away foil to see Street View.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // how much can be scratched each round: a few dabs at 1, the whole view at 10
      { key: 'amount', label: 'Scratching', type: 'slider', min: 1, max: 10, default: 6,
        marks: ['Less', 'More'] },
    ],
  });
})();

// ==================== src/scripts/scratch/main.js =================================
// Scratch card: each round Street View starts under a silver foil, a canvas inside the
// panorama's element so GeoGuessr's HUD stays on top. Dragging scratches holes until the round's
// meter runs out. The foil swallows all mouse input, holes included. Keys still turn and move.
// A round's scratches are saved by game token and location, so a reload brings them back.
(() => {
  const ggs = globalThis.__ggs;
  const KEY = 'ggs-scratch'; // localStorage: { id, used, strokes } of the last round scratched
  const BRUSH = 22; // px, radius of a scratch
  const INK = '#1c1a2e';
  const BLOCKED = [
    'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick',
    'contextmenu', 'wheel', 'touchstart', 'touchmove',
  ];
  const CSS = `
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
    canvas.empty { cursor: not-allowed; }
    .meter { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
             display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: #f5f1e8;
             border: 2px solid ${INK}; border-radius: 999px; box-shadow: 3px 3px 0 rgba(28,26,46,.3);
             font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .06em;
             text-transform: uppercase; color: ${INK}; pointer-events: none; }
    .meter b { width: 90px; height: 8px; border: 1.5px solid ${INK}; border-radius: 6px; overflow: hidden; }
    .meter i { display: block; height: 100%; background: #fecd19; transition: width .1s; }
  `;

  // Reload-proof id of the current round, or null without a location (then nothing is kept).
  async function roundId() {
    const loc = await ggs.game.roundLocation().catch(() => null);
    return loc && String(ggs.aid.seeded(`scratch|${ggs.game.context()?.token}|${loc.lat},${loc.lng}`)());
  }

  // the foil: brushed silver with a sparkle, a dashed inner frame and a label
  function paintFoil(g, w, h) {
    g.globalCompositeOperation = 'source-over';
    const grad = g.createLinearGradient(0, 0, w, h);
    const stops = [['#b4b9c3', 0], ['#eceef2', 0.3], ['#a7acb7', 0.5], ['#e2e5ea', 0.72], ['#b0b5bf', 1]];
    stops.forEach(([c, at]) => grad.addColorStop(at, c));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -h; x < w; x += 7) {
      g.moveTo(x, h);
      g.lineTo(x + h, 0);
    }
    g.stroke();
    const rand = ggs.aid.seeded('scratch-foil');
    for (let i = 0; i < w * h / 400; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(28,26,46,.07)';
      g.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
    g.setLineDash([10, 8]);
    g.strokeStyle = 'rgba(28,26,46,.18)';
    g.lineWidth = 2;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.setLineDash([]);
    g.fillStyle = 'rgba(28,26,46,.3)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(Math.min(w, h) * 0.05)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.fillText('✦  SCRATCH TO REVEAL  ✦', w / 2, h / 2);
  }

  function start(cfg) {
    let amount = cfg.amount ?? 6;
    let round = null;
    let pano = null;
    let saved = null;
    let drag = null;
    const host = document.createElement('div');
    host.setAttribute('data-ggs-view', '');
    host.style.cssText = 'all: initial; position: absolute; inset: 0; display: block; z-index: 2147483000;';
    // input on the foil stops here, so neither Street View nor GeoGuessr see it
    for (const t of BLOCKED) host.addEventListener(t, e => e.stopPropagation());
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><canvas></canvas><div class="meter">Scratch <b><i></i></b></div>`;
    const canvas = root.querySelector('canvas');
    const bar = root.querySelector('.meter i');
    const g = canvas.getContext('2d');

    // px of scratching per round, growing x250 over the slider: a few dabs at 1, the whole view at 10
    const total = () => 0.08 * 250 ** ((amount - 1) / 9) * (host.clientWidth + host.clientHeight);
    const meter = () => {
      bar.style.width = `${(1 - round.used) * 100}%`;
      canvas.classList.toggle('empty', round.used >= 1);
    };
    function line(pts) {
      const w = host.clientWidth;
      const h = host.clientHeight;
      g.beginPath();
      g.moveTo(pts[0] * w, pts[1] * h);
      for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i] * w, pts[i + 1] * h);
      g.stroke();
    }
    function redraw() {
      const dpr = devicePixelRatio || 1;
      const w = host.clientWidth;
      const h = host.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFoil(g, w, h);
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000';
      g.lineCap = g.lineJoin = 'round';
      g.lineWidth = 2 * BRUSH;
      for (const s of round.strokes) line(s);
      meter();
    }
    const save = () => {
      if (!round.id) return;
      const strokes = round.strokes.map(s => s.map(v => Math.round(v * 1e4) / 1e4));
      ggs.store.set(KEY, { id: round.id, used: round.used, strokes });
    };

    function newRound(key) {
      const r = round = { key, id: null, strokes: [], used: 0 };
      drag = null;
      redraw();
      roundId().then(id => {
        if (round !== r || !id) return;
        r.id = id;
        const old = ggs.store.get(KEY);
        if (old?.id === id) {
          r.strokes = [...old.strokes, ...r.strokes];
          r.used = Math.min(1, old.used + r.used);
          redraw();
        }
        save();
      });
    }

    // ---- scratching ----
    const at = e => {
      const b = host.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || round.used >= 1) return;
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      const w = host.clientWidth;
      const h = host.clientHeight;
      drag = { last: [x, y], pts: [x / w, y / h, x / w, y / h] };
      round.strokes.push(drag.pts);
      line(drag.pts);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      let [x, y] = at(e);
      const [lx, ly] = drag.last;
      const d = Math.hypot(x - lx, y - ly);
      if (d < 3) return;
      const left = (1 - round.used) * total();
      if (d > left) {
        // the last bit of the meter
        x = lx + (x - lx) * left / d;
        y = ly + (y - ly) * left / d;
      }
      round.used = Math.min(1, round.used + Math.min(d, left) / total());
      drag.last = [x, y];
      drag.pts.push(x / w, y / h);
      line([lx / w, ly / h, x / w, y / h]);
      meter();
      if (round.used >= 1) {
        drag = null;
        save();
      }
    });
    for (const t of ['pointerup', 'pointercancel']) {
      canvas.addEventListener(t, () => {
        if (!drag) return;
        drag = null;
        save();
      });
    }

    // ---- placement: on the panorama during a round, nowhere otherwise ----
    function unpin() {
      if (pano) Object.assign(pano.style, saved);
      pano = null;
    }
    function tick() {
      const el = ggs.maps.guessMapElement() ? ggs.view.panoElement() : null;
      if (!el) {
        host.remove();
        unpin();
        return;
      }
      const key = ggs.game.roundKey();
      if (round?.key !== key) newRound(key);
      if (host.parentElement !== el) {
        unpin();
        el.append(host);
        // the panorama becomes its own stacking layer, so the foil stays under GeoGuessr's HUD
        pano = el;
        saved = { isolation: el.style.isolation, position: el.style.position };
        el.style.isolation = 'isolate';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      }
      if (canvas.width !== Math.round(host.clientWidth * (devicePixelRatio || 1)) ||
          canvas.height !== Math.round(host.clientHeight * (devicePixelRatio || 1))) redraw();
    }
    const timer = setInterval(tick, 150);
    tick();

    return {
      // Switching off clears the saved scratches, so switching on again gives fresh foil.
      // A reload never calls stop, so it keeps them.
      stop() {
        clearInterval(timer);
        host.remove();
        unpin();
        ggs.store.set(KEY, null);
      },
      update(next) {
        amount = next.amount ?? 6;
      },
    };
  }
  ggs.scripts.scratch = { start };
})();

// ==================== src/scripts/reverse/meta.js =================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'reverse',
    name: 'Inverted controls',
    description: 'Your controls go the wrong way.',
    section: 'controls',
    defaultEnabled: false,
    options: [
      { key: 'move', label: 'Move', type: 'checkbox', default: true },
      { key: 'turn', label: 'Pan', type: 'checkbox', default: true },
      { key: 'drag', label: 'Drag', type: 'checkbox', default: true },
      { key: 'zoom', label: 'Zoom', type: 'checkbox', default: true },
    ],
  });
})();

// ==================== src/scripts/reverse/main.js =================================
// Inverted controls: keys, dragging and zoom on Street View go the other way (core/view.js's
// mirrored input). With Flipped view on as well, the two cancel out where they overlap.
(() => {
  const ggs = globalThis.__ggs;
  const flips = c => ({ move: c.move, turn: c.turn, zoom: c.zoom, dragX: c.drag, dragY: c.drag });
  ggs.scripts.reverse = {
    start(cfg) {
      ggs.view.mirror('reverse', flips(cfg));
      return {
        update: c => ggs.view.mirror('reverse', flips(c)),
        stop: () => ggs.view.mirror('reverse', null),
      };
    },
  };
})();

// ==================== src/scripts/maxzoom/meta.js =================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'maxzoom',
    name: 'Max zoom',
    description: 'Street View stuck fully zoomed in.',
    section: 'streetview',
    defaultEnabled: false,
    options: [],
  });
})();

// ==================== src/scripts/maxzoom/main.js =================================
// Max zoom: every panorama is held fully zoomed in, with the zoom input blocked (core/lock.js).
// The Maps API takes what it can of ZOOM, so this is its own most zoomed-in view.
(() => {
  const ggs = globalThis.__ggs;
  const ZOOM = 5;
  ggs.scripts.maxzoom = {
    start() {
      ggs.lock.zoomTo('maxzoom', ZOOM);
      return { stop: () => ggs.lock.zoomTo('maxzoom', null) };
    },
  };
})();

// ==================== src/scripts/jammer/meta.js ==================================
(() => {
  globalThis.__ggs.registry.push({
    id: 'jammer',
    name: 'Speech jammer',
    description: 'Hear your own voice loud and a moment late. Wear headphones.',
    section: 'misc',
    defaultEnabled: false,
    mic: true, // can't be switched on while the microphone is blocked
    options: [],
  });
})();

// ==================== src/scripts/jammer/main.js ==================================
// Speech jammer: delayed auditory feedback. The microphone goes through a delay to the speakers,
// loud, so you hear yourself a fraction of a second late, which makes talking hard. The sound
// only passes through this page's audio graph. It's never recorded or sent. Without a
// microphone, or when it's refused, nothing happens.
//
// Settings from the DAF studies: about 200 ms at the ear disrupts fluent speakers most (Lee 1950,
// Black 1951, Stuart et al. 2002). The delayed voice has to drown out the one heard directly and
// through the bones. So there's no undelayed sound, the lows (bone conduction) are lifted, and a
// compressor keeps it loud as the speaker raises their voice, with a limiter so it can't clip.
// Pink noise underneath masks the voice heard directly.
(() => {
  const ggs = globalThis.__ggs;
  const AT_EAR = 0.2; // seconds from mouth to ear, the browser's own latency included
  const INPUT_GUESS = 0.01; // the microphone's latency, which browsers don't report
  const LOUD = 9; // make-up gain after the compressor (about +19 dB), faded in over FADE_S
  const STATIC = 0.4; // the static's level: about -22 dBFS, some 7 dB under the voice
  const FADE_S = 1.5;
  const GESTURES = ['pointerdown', 'keydown'];

  function graph(audio, stream) {
    const n = (make, set) => Object.assign(make(), set);
    const lowCut = n(() => audio.createBiquadFilter(), { type: 'highpass' });
    lowCut.frequency.value = 80; // rumble and handling noise
    const delay = audio.createDelay(1);
    const latency = (audio.baseLatency || 0) + (audio.outputLatency || 0) + INPUT_GUESS;
    delay.delayTime.value = Math.max(0.05, AT_EAR - latency);
    const lows = n(() => audio.createBiquadFilter(), { type: 'lowshelf' });
    lows.frequency.value = 300;
    lows.gain.value = 6;
    const squeeze = audio.createDynamicsCompressor();
    const squeezeSettings = { threshold: -35, knee: 6, ratio: 12, attack: 0.003, release: 0.15 };
    for (const [k, v] of Object.entries(squeezeSettings)) squeeze[k].value = v;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(1, audio.currentTime);
    gain.gain.linearRampToValueAtTime(LOUD, audio.currentTime + FADE_S); // no sudden blast
    const limit = audio.createDynamicsCompressor();
    const limitSettings = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.05 };
    for (const [k, v] of Object.entries(limitSettings)) limit[k].value = v;
    audio.createMediaStreamSource(stream)
      .connect(lowCut).connect(delay).connect(lows).connect(squeeze).connect(gain).connect(limit);
    // the static joins after the compressor, so it never pushes the voice down
    const hiss = audio.createBufferSource();
    hiss.buffer = pinkNoise(audio, 4);
    hiss.loop = true;
    const hissGain = audio.createGain();
    hissGain.gain.setValueAtTime(0, audio.currentTime);
    hissGain.gain.linearRampToValueAtTime(STATIC, audio.currentTime + FADE_S);
    hiss.connect(hissGain).connect(limit);
    hiss.start();
    limit.connect(audio.destination);
  }

  // Seconds of pink noise (Paul Kellet's filter on white noise): equal energy per octave, so
  // more of it in the lows than white noise, where the voice carries through the bones.
  function pinkNoise(audio, seconds) {
    const buf = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  function start() {
    let stopped = false;
    let stream = null;
    let audio = null;
    const status = text => ggs.status('jammer', text);

    // a page can only start sound after a click or key press, so it waits for one if needed
    const resume = () => {
      audio?.resume().catch(() => {});
    };
    const onState = () => {
      if (stopped) return;
      const running = audio.state === 'running';
      for (const t of GESTURES) window[running ? 'removeEventListener' : 'addEventListener'](t, resume, true);
      status(running ? '' : 'Click the page to start');
    };

    (async () => {
      try {
        // the browser's voice clean-up would cut the delayed copy out, so it's off
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        if (stopped) return;
        // refused: it switches itself off rather than stay on doing nothing
        if (err?.name === 'NotAllowedError') {
          ggs.saveSetting('jammer', { enabled: false });
          status('Microphone blocked, so it was switched off');
        } else {
          status('No microphone');
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      audio = new AudioContext({ latencyHint: 'interactive' });
      graph(audio, stream);
      audio.addEventListener('statechange', onState);
      onState();
    })();

    return {
      stop() {
        stopped = true;
        for (const t of GESTURES) window.removeEventListener(t, resume, true);
        stream?.getTracks().forEach(t => t.stop());
        audio?.close().catch(() => {});
        status('');
      },
    };
  }
  ggs.scripts.jammer = { start };
})();

// ==================== src/scripts/chaos/meta.js ===================================
// Chaos mode's settings. Loaded after every other meta.js, so its effect list (one box per
// script, plus the three Controls locks) is built from the registry.
(() => {
  const ggs = globalThis.__ggs;
  // Scripts chaos never switches on or off. main.js reads them from this meta.
  const OWN = ['chaos', 'nmpz', 'clean', 'panel'];
  const SKIP = ['liar']; // chaos's own hints already lie half the time
  const OFF = ['blank']; // in the list but not ticked to start with
  const effects = [
    ...ggs.registry
      .filter(m => !m.ui && !OWN.includes(m.id) && !SKIP.includes(m.id))
      .map(m => ({ key: `fx_${m.id}`, label: m.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    ...ggs.registry.find(m => m.id === 'nmpz').options.map(o => ({ key: `fx_${o.key}`, label: o.label })),
  ];
  ggs.registry.push({
    id: 'chaos',
    name: 'Chaos',
    description: '',
    section: 'chaos',
    own: OWN,
    defaultEnabled: false,
    moreLabel: 'Effects', // the hidden options' fold
    options: [
      // index into EVERY in main.js
      { key: 'every', label: 'New effect every', type: 'slider', min: 0, max: 7, default: 3,
        steps: ['10 s', '15 s', '20 s', '30 s', '45 s', '1 min', '90 s', '2 min'] },
      // a warning, shown only while the microphone isn't allowed; clicking it asks again
      { key: 'micNote', label: 'Mic effects disabled · click to allow the microphone', type: 'mic' },
      ...effects.map(e => ({ ...e, type: 'checkbox', default: !OFF.includes(e.key.slice(3)), hidden: true })),
    ],
  });
})();

// ==================== src/scripts/chaos/main.js ===================================
// Chaos mode: every so often a random effect switches on for LIFE_MS. An effect is another
// script with random settings, or one of the Controls locks. While chaos runs, boot.js runs
// ggs.chaos.mix()'s settings for every script outside Controls and UI.
// The clocks only run while a guess map is on screen. Each round starts clean, with the first
// effect FIRST_MS in. A drawing board stays for the rest of its round and ends the effects that
// need the map.
// The next effect is picked a whole interval ahead so slow ones (tile filters, Minecraft) can
// prepare. One that isn't ready in time waits a turn and a quick one goes instead.
(() => {
  const ggs = globalThis.__ggs;
  const EVERY = [10, 15, 20, 30, 45, 60, 90, 120]; // seconds, by the slider
  const LIFE_MS = 30000, FIRST_MS = 3000, TICK_MS = 250;
  // The guess map gone this long means the round is over. It can blink mid-round.
  const AWAY_MS = 1500;
  // Chance of a board per pick at a 30 s interval. It scales with the interval, so a board comes
  // up about once a game whatever the setting.
  const DRAW_CHANCE = 0.04;
  const BOARDS = ['draw-guess', 'flag-guess'];
  // Effects that need the guess map, which a board hides (or that press Guess themselves).
  const NEEDS_MAP = [
    'guesses', 'wobble', 'ocean', 'in-country', 'blind', 'drift', 'lat-band', 'lng-band', 'radius', 'distance', 'liar', 'lag',
  ];
  // Street View tile filters: slow to switch.
  const TILES = ['ascii', 'minecraft', 'lying-signs', 'gradient', 'greyscale'];
  const PRELOAD_MS = 4000; // before a tile filter ends
  // Only one effect of each group runs at a time, on top of each meta's own `excludes`.
  const GROUPS = [
    TILES,
    ['blank', 'blink', 'eye', 'peek', 'scratch', 'radio'], // hide Street View: two at once leave nothing
    ['flip', 'reverse'], // input mirrors cancel each other out
    ['compass', 'noPan'], // both hold the view still
    ['maxzoom', 'noZoom'], // both hold the zoom
    ['flip', 'spin'], // a flipped picture spinning looks like a plain spinning one
  ];
  const LIARS = ['lat-band', 'lng-band', 'radius', 'distance']; // hints that may lie
  const SKIP = ['liar']; // the hints above already lie
  // Options chaos leaves as the player set them.
  const KEEP = {
    minecraft: ['code'], radio: ['streamerMode'], 'draw-guess': ['hardMode'], 'flag-guess': ['forceInside'],
  };
  const LOCKS = { noMove: 'move', noPan: 'pan', noZoom: 'zoom' };
  // NMPZ, Clean map, OGGS tab: the player's own
  const own = () => ggs.registry.find(m => m.id === 'chaos').own;
  const MIC = ['eye', 'jammer']; // only once the microphone is allowed
  // Settings chaos always uses: every Reverse control (one alone is too easy to miss),
  // Ghana tape on any round, and Minecraft at high quality.
  const FIXED = {
    reverse: { move: true, turn: true, drag: true, zoom: true },
    'ghana-tape': { everywhere: true },
    minecraft: { hq: true },
  };
  // Effects never queued with less than this long to get ready (ms).
  const LEAD = { minecraft: 10000 };
  // Controls held still leave nothing to reverse.
  const STILL = [...Object.keys(LOCKS), 'compass'];

  const byId = id => ggs.registry.find(m => m.id === id);
  const clash = (a, b) => {
    if (GROUPS.some(g => g.includes(a) && g.includes(b))) return true;
    if ((a === 'reverse' && STILL.includes(b)) || (b === 'reverse' && STILL.includes(a))) return true;
    const boardClash = BOARDS.includes(a)
      ? NEEDS_MAP.includes(b) || BOARDS.includes(b)
      : BOARDS.includes(b) && NEEDS_MAP.includes(a);
    if (boardClash) return true;
    return !!(byId(a)?.excludes?.includes(b) || byId(b)?.excludes?.includes(a));
  };

  const pick = list => list[Math.floor(Math.random() * list.length)];
  // Random settings: any slider stop, any choice, a coin per checkbox. A script with only
  // checkboxes gets at least one on.
  function randomCfg(meta, stored) {
    const cfg = ggs.config(meta, stored);
    const free = meta.options.filter(o => !KEEP[meta.id]?.includes(o.key) && o.type !== 'text');
    for (const o of free) {
      if (o.type === 'slider') {
        cfg[o.key] = o.min + Math.floor(Math.random() * (o.max - o.min + 1));
      } else if (o.type === 'buttons' || o.type === 'select') {
        // a real choice, never "Random", so the panel can name it
        cfg[o.key] = pick(o.choices.filter(c => !/^random/i.test(c.label))).value;
      } else if (o.type === 'checkbox') {
        cfg[o.key] = Math.random() < 0.5;
      }
    }
    const boxes = free.filter(o => o.type === 'checkbox');
    const onlyBoxes = boxes.length && boxes.length === meta.options.length;
    if (onlyBoxes && !boxes.some(o => cfg[o.key])) cfg[pick(boxes).key] = true;
    return { ...cfg, ...FIXED[meta.id], enabled: true };
  }
  // "Delay (ms)" at "200" -> "Delay 200 ms". A stop that isn't a number is just itself.
  function withUnit(label, mark) {
    const [, name, unit] = /^(.*?)\s*\((\S+)\)$/.exec(label) ?? [];
    if (!/^[\d.]+$/.test(mark)) return mark;
    return unit ? `${name} ${mark} ${unit}` : `${label} ${mark}`;
  }
  // A few words on the settings it got, for the panel: choices and named slider stops.
  function describe(meta, cfg) {
    return meta.options.map(o => {
      const v = cfg[o.key];
      if (KEEP[meta.id]?.includes(o.key)) return '';
      if (o.choices) return o.choices.find(c => String(c.value) === String(v))?.label ?? '';
      if (o.steps) return o.steps[v - o.min] ?? '';
      if (o.marks?.length === o.max - o.min + 1) return withUnit(o.label, o.marks[v - o.min]);
      return '';
    }).filter(Boolean).join(' · ');
  }

  const PANEL_CSS = `
    .panel { width: 220px; }
    .head { padding: 8px 12px 0; background: none; } /* just the word, still the drag handle */
    .row { display: flex; align-items: center; gap: 8px; }
    .label { flex: 1; min-width: 0; }
    .label b {
      display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .label small {
      display: block; font-size: 11px; color: rgba(255, 255, 255, .6);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .secs { flex: none; font: 600 11px/1 ui-monospace, monospace; color: rgba(255, 255, 255, .7); }
    .bar {
      height: 4px; margin-top: 4px; border-radius: 2px; background: rgba(255, 255, 255, .12); overflow: hidden;
    }
    .bar i { display: block; height: 100%; background: #fecd19; transition: width ${TICK_MS}ms linear; }
    .next .bar i { background: rgba(255, 255, 255, .7); }
    ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    ul:empty { display: none; }
    li { animation: pop .35s ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateX(-12px); } }`;
  const PANEL_HTML = '<div class="next"><div class="row"><span class="label"><b>Next effect</b></span>' +
    '<span class="secs"></span></div><div class="bar"><i></i></div></div><ul></ul>';

  // key (script id or lock name) -> { key, name, detail, cfg?, left?, round? }
  const active = new Map();
  // ggs.chaos.mix(stored) -> the settings boot.js runs while chaos is on
  ggs.chaos = {
    mix(stored) {
      const out = {};
      for (const m of ggs.registry) {
        out[m.id] = own().includes(m.id) ? stored[m.id] : active.get(m.id)?.cfg ?? { enabled: false };
      }
      return out;
    },
  };

  function start(cfg) {
    // What's on shows in its own panel. This clears a list older versions left.
    ggs.status('chaos', '');
    let next = FIRST_MS;
    let span = FIRST_MS; // the countdown's full length
    let last = performance.now();
    let awaySince = 0;
    let lastRound = ggs.game.roundKey();
    const panel = ggs.ui.panel({
      id: 'chaos', title: 'Chaos', css: PANEL_CSS, html: PANEL_HTML,
      pos: { x: 16, y: Math.round(innerHeight * 0.3) },
    });
    panel.show(false);
    const list = panel.$('ul');

    let queued = null; // the next effect, getting ready
    let lastKey = null; // the last one switched on
    // Mic effects only once the microphone is allowed. Without it chaos carries on without them.
    const enabled = key => cfg[`fx_${key}`] !== false && (!MIC.includes(key) || ggs.mic.state === 'granted');
    const wantsMic = c => MIC.some(k => c[`fx_${k}`] !== false);
    const askMic = () => {
      if (ggs.mic.state !== 'granted') ggs.mic.ask();
    };
    if (wantsMic(cfg)) askMic(); // when chaos starts, not halfway through a round
    const userLock = key => {
      const n = ggs.config(byId('nmpz'), ggs.settings);
      return n.enabled && n[key];
    };
    // Fits beside the effects still on `ms` from now. A board fits beside anything but the other
    // board, and ends what clashes with it (see add).
    const fits = (key, ms = 0) => (BOARDS.includes(key)
      ? !BOARDS.some(b => active.has(b))
      : [...active.values()].every(e => (!e.round && e.left <= ms) || !clash(e.key, key)));

    // Locks: the Controls effects, and No move under Minecraft (each panorama costs a generation).
    function locks() {
      const want = { move: active.has('minecraft'), pan: false, zoom: false };
      for (const [key, kind] of Object.entries(LOCKS)) if (active.has(key)) want[kind] = true;
      for (const [kind, on] of Object.entries(want)) ggs.lock[kind]('chaos', on);
    }
    function changed() {
      locks();
      ggs.reapply();
      draw(true);
    }

    // An effect with its random settings, not yet on.
    function make(key) {
      if (LOCKS[key]) return { key, name: byId('nmpz').options.find(o => o.key === key).label, detail: '' };
      const meta = byId(key);
      const c = randomCfg(meta, ggs.settings);
      if (LIARS.includes(key)) c.lies = true; // core/aid.js: half the rounds, a made-up spot
      return { key, name: meta.name, detail: describe(meta, c), cfg: c };
    }
    function add(effect) {
      const { key } = effect;
      lastKey = key; // never the same one twice in a row
      delete effect.prep;
      if (BOARDS.includes(key)) {
        // For the rest of the round. The old guess goes, and so does whatever needs the map.
        effect.round = ggs.game.roundKey();
        for (const k of [...active.keys()]) if (clash(k, key)) active.delete(k);
        // after the map effects let go of it
        setTimeout(() => {
          try { ggs.maps.clearGuess(); } catch {}
        }, 300);
      } else {
        effect.left = LIFE_MS;
      }
      active.set(key, effect);
      ggs.debug(`chaos: ${effect.name} ${effect.detail}`);
    }

    // A board some of the time (rarer at short intervals), otherwise any other effect that fits
    // `ms` from now. `quick`: only effects that are on at once (no tile filters).
    function choose(ms, quick) {
      const scripts = ggs.registry
        .filter(m => !m.ui && !own().includes(m.id) && !SKIP.includes(m.id) && ggs.scripts[m.id])
        .map(m => m.id);
      const can = [...scripts, ...Object.keys(LOCKS).filter(k => !userLock(k))]
        // all held by the player: nothing to reverse
        .filter(k => k !== 'reverse' || !Object.keys(LOCKS).every(userLock))
        .filter(k => enabled(k) && !active.has(k) && k !== queued?.key && k !== lastKey && fits(k, ms))
        .filter(k => !(quick && TILES.includes(k)) && ms >= (LEAD[k] ?? 0));
      const boards = can.filter(k => BOARDS.includes(k));
      const others = can.filter(k => !BOARDS.includes(k));
      const board = boards.length && Math.random() < DRAW_CHANCE * EVERY[cfg.every] / 30;
      // only boards left ticked: a board
      const key = board || !others.length ? pick(boards) ?? null : pick(others);
      return key && make(key);
    }
    // The effect for the slot `ms` from now, starting to get ready.
    function queue(ms) {
      queued = choose(ms, false);
      if (!queued) return;
      const prepare = () => {
        try {
          queued.prep = ggs.scripts[queued.key]?.prepare?.(queued.cfg) ?? null;
        } catch (err) {
          ggs.log('chaos: prepare failed', err);
        }
      };
      prepare();
      if (queued.key === 'minecraft' && !queued.prep && queued.cfg.hq) {
        // today's high-quality rounds are used up: try normal quality
        queued.cfg = { ...queued.cfg, hq: false };
        queued.detail = describe(byId('minecraft'), queued.cfg);
        prepare();
      }
      // today's limit is used up: another effect
      if (queued.key === 'minecraft' && !queued.prep) return queue(ms);
      if (!queued.prep && TILES.includes(queued.key)) ggs.tiles.preload();
    }
    const unqueue = () => {
      queued?.prep?.cancel();
      queued = null;
    };
    // Slot time: the queued effect goes if it still fits and is ready. If it's still getting
    // ready, a quick one goes now and it waits for the next slot.
    function slot() {
      if (queued && (!(enabled(queued.key) && fits(queued.key)) || queued.prep?.failed?.())) unqueue();
      let e = queued;
      if (e?.prep && !e.prep.ready()) e = choose(0, true);
      else queued = null;
      if (!e) e = choose(0, true);
      if (e) {
        add(e);
        changed();
      }
      if (!queued) queue(span);
    }
    queue(next);

    const tick = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const inRound = !!ggs.maps.guessMapElement();
      const round = ggs.game.roundKey();
      if (inRound) awaySince = 0;
      else awaySince ||= now;
      const over = !inRound && now - awaySince > AWAY_MS;
      let gone = false;
      if (round !== lastRound) {
        lastRound = round;
        gone = active.size > 0;
        active.clear();
        next = span = FIRST_MS;
        unqueue();
        queue(next);
      }
      for (const [key, e] of active) {
        const expired = e.round ? over || e.round !== round : inRound && (e.left -= dt) <= 0;
        if (expired) {
          active.delete(key);
          gone = true;
        } else if (key in LOCKS ? userLock(key) : !enabled(key)) {
          // switched off meanwhile
          active.delete(key);
          gone = true;
        } else if (TILES.includes(key) && !e.round && e.left <= PRELOAD_MS && !e.preloaded) {
          // fetch the real tiles again so they come back at once
          e.preloaded = true;
          ggs.tiles.preload();
        }
      }
      if (gone) changed();
      if (inRound && (next -= dt) <= 0) {
        next = span = EVERY[cfg.every] * 1000;
        slot();
      }
      panel.show(!!ggs.game.context());
      draw(false);
    }, TICK_MS);

    // The list is rebuilt when effects come or go. The bars and countdown update every tick.
    function draw(rebuild) {
      panel.$('.next .secs').textContent = `${Math.ceil(Math.max(0, next) / 1000)}s`;
      panel.$('.next .bar i').style.width = `${100 * Math.max(0, next) / span}%`;
      if (rebuild) {
        list.innerHTML = [...active.values()].map(e =>
          `<li data-key="${ggs.esc(e.key)}"><div class="row"><span class="label"><b>${ggs.esc(e.name)}</b>` +
          `${e.detail ? `<small>${ggs.esc(e.detail)}</small>` : ''}</span></div>` +
          '<div class="bar"><i></i></div></li>').join('');
      }
      for (const li of list.children) {
        const e = active.get(li.dataset.key);
        if (!e) continue;
        li.querySelector('.bar i').style.width = `${e.round ? 100 : 100 * e.left / LIFE_MS}%`;
      }
    }

    return {
      update(n) {
        if (wantsMic(n) && !wantsMic(cfg)) askMic();
        cfg = n;
        span = Math.min(span, EVERY[cfg.every] * 1000); // a shorter interval takes effect now
        next = Math.min(next, span);
      },
      stop() {
        clearInterval(tick);
        unqueue();
        active.clear();
        for (const kind of Object.values(LOCKS)) ggs.lock[kind]('chaos', false);
        panel.destroy();
        ggs.status('chaos', '');
      },
    };
  }

  ggs.scripts.chaos = { start };
})();

// ==================== src/scripts/clean/main.js ===================================
// Clean map: one stylesheet hides, each behind its own option, the small Google overlays on both
// maps (the Terms / Map data / Keyboard shortcuts strip and the Google logo), the GeoGuessr logo,
// and the round scores plus the "N playing" count. Only their display changes. Google's key
// handlers sit on the map element, so the shortcuts still work.
(() => {
  const ggs = globalThis.__ggs;
  const GOOGLE = [
    // Terms, Map data, Keyboard shortcuts (both maps)
    '.gm-style-cc',
    // Google logo. The map and Street View build it differently, so match the link's href, title
    // or label, or the image itself. Not scoped to .gm-style, as the panorama's copy can sit outside.
    'a[href*="google.com/maps"]',
    'a[title^="Open this area in Google Maps"]',
    'a[aria-label^="Open this area in Google Maps"]',
    'a:has(> img[alt="Google"])',
    'img[alt="Google"]',
    // Street View address card
    '.gm-style .gm-iv-address',
    // GeoGuessr's own copy of the logo over Street View
    'img[alt="Google Maps Logo"]',
    'img[src*="google-logo"]',
  ];
  // GeoGuessr class names are CSS-module hashed, so match on the prefix.
  const LOGO = [
    '[class*="header_logo"]',
    '[class*="game_logo"]',
    'a[href="/"] img[alt="GeoGuessr"]',
    'img[alt="GeoGuessr"]',
  ];
  // The scores panel top right (class seen 2026-09) and the "N playing" count beside it.
  // markScores() also finds both by their text, so they stay hidden if the classes are renamed.
  const SCORES = ['[class*="rounds-status_panel"]', '[class*="live-players-count_"]', '[data-ggs-clean]'];
  const HIDDEN = 'data-ggs-clean';

  const rule = sels => sels.join(',\n') + ' { display: none !important; }\n';
  const css = cfg =>
    (cfg.google ? rule(GOOGLE) : '') + (cfg.logo ? rule(LOGO) : '') + (cfg.progress ? rule(SCORES) : '');

  // Scores: the smallest element holding both a "Round" and a "Total" label, at most 600px wide
  // so a page-sized ancestor is never picked.
  const LABEL = /^(round|total)$/i;
  // The "316 playing" count: the leaf holding it, or its parent when the number and the word are
  // split across two leaves.
  const PLAYING = /^[\d,.]+\s*k?\s+playing$/i;
  function markScores() {
    const leaves = [...document.querySelectorAll('div, span, p')].filter(e => e.children.length === 0);
    const playing = leaves.filter(e => {
      const t = e.textContent.trim();
      return /^playing$/i.test(t) || PLAYING.test(t);
    });
    for (const l of playing) {
      const p = l.parentElement;
      (p && p !== document.body && PLAYING.test(p.textContent.trim()) ? p : l).setAttribute(HIDDEN, '');
    }
    const labels = leaves.filter(e => LABEL.test(e.textContent.trim()));
    for (const l of labels) {
      for (let e = l.parentElement; e && e !== document.body; e = e.parentElement) {
        const t = e.textContent;
        if (/\bRound\b/i.test(t) && /\bTotal\b/i.test(t)) {
          if (e.getBoundingClientRect().width <= 600) e.setAttribute(HIDDEN, '');
          break;
        }
      }
    }
  }

  function start(cfg) {
    const style = document.createElement('style');
    style.textContent = css(cfg);
    document.documentElement.appendChild(style);
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(markScores, 150);
    });
    const watch = on => {
      obs.disconnect();
      if (!on) return;
      markScores();
      obs.observe(document.body, { childList: true, subtree: true });
    };
    watch(cfg.progress);
    ggs.debug('clean on', cfg);
    return {
      stop() {
        style.remove();
        watch(false);
        clearTimeout(timer);
      },
      update(next) {
        style.textContent = css(next);
        watch(next.progress);
      },
    };
  }
  ggs.scripts.clean = { start };
})();

// ==================== src/boot.js =================================================
// Starts and stops each script to match the settings, live.
// In competitive games (ggs.game.competitive) every script is stopped.
// Scripts that exclude each other never run together. The first one in the registry wins.
// While Chaos mode runs, scripts outside Controls and UI follow ggs.chaos.mix() instead.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null, blocked = false, path = null, check = 0;

  function apply() {
    if (!settings) return;
    const chaos = !blocked && ggs.chaos
      && ggs.config(ggs.registry.find(m => m.id === 'chaos'), settings).enabled;
    const live = chaos ? ggs.chaos.mix(settings) : settings;
    const on = new Map(); // id -> meta, for scripts switched on in this pass
    for (const meta of ggs.registry) {
      if (meta.ui) continue; // a settings-only entry, no script behind it
      const impl = ggs.scripts[meta.id];
      if (!impl) {
        ggs.log(`no implementation loaded for "${meta.id}"`);
        continue;
      }
      const cfg = ggs.config(meta, live);
      const clash = [...on.values()]
        .some(m => m.excludes?.includes(meta.id) || meta.excludes?.includes(m.id));
      const wanted = cfg.enabled && !blocked && !clash;
      if (wanted) on.set(meta.id, meta);
      const inst = running.get(meta.id);
      try {
        if (wanted && !inst) {
          running.set(meta.id, impl.start(cfg));
          ggs.debug(`started ${meta.id}`);
        } else if (!wanted && inst) {
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
    if (maybe && !blocked) {
      blocked = true;
      apply();
    }
    const id = ++check;
    ggs.game.competitive().then(({ competitive, why }) => {
      if (id !== check) return;
      if (competitive || maybe) {
        ggs.debug(competitive ? 'competitive game: all scripts off' : 'friendly game: scripts on', why);
      }
      if (competitive !== blocked) {
        blocked = competitive;
        apply();
      }
    });
  }

  // The game mode goes out as the '_mode' status line, so the form can hide options
  // that do nothing in it (an option's hideIn).
  let mode = null;
  setInterval(() => {
    onPath();
    const now = ggs.game.context()?.mode ?? '';
    if (now !== mode) ggs.status('_mode', mode = now);
  }, 500);

  // An empty heartbeat for the "playing now" count on the OGGS stats card (server/card.php):
  // no id, settings or game data, only sent while the tab is visible and the game isn't
  // competitive.
  const ping = () => {
    if (document.visibilityState !== 'visible' || blocked) return;
    fetch('https://oggs.orlandopb.com/ping.php', { mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
      .catch(() => {});
  };
  setTimeout(ping, 5000);
  setInterval(ping, 2 * 60 * 1000);

  // Chaos mode calls this when its effects change.
  ggs.reapply = apply;
  ggs.onSettings(all => {
    settings = all;
    onPath();
    apply();
  });
})();
