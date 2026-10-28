// Finds GeoGuessr's guess map (a Google Maps instance) and puts guesses on it. A guess is
// a synthetic 'click' on the map, so GeoGuessr's own click handler places it.
(() => {
  const ggs = globalThis.__ggs;

  const isGoogleMap = o =>
    o != null && typeof o === 'object' && typeof o.getDiv === 'function' && typeof o.panTo === 'function';

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
  const GUESS_AREA =
    '[class*="guess-map_guessMap"], [class*="guess-map_container"],' + ' [class*="guess-map_root"]';
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
    hooks[name] ??= { fns: [], made: [] };
    const h = hooks[name];
    h.fns.push(fn);
    for (const [inst, args] of h.made) fn(inst, args);
  }
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.Map || !gm.StreetViewPanorama) return;
    clearInterval(hookTimer);
    for (const name of ['Map', 'StreetViewPanorama']) {
      hooks[name] ??= { fns: [], made: [] };
      const h = hooks[name];
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
  const lastGuess = () =>
    last && last.round === ggs.game?.roundKey() ? { lat: last.lat, lng: last.lng } : null;

  // Walk up from the guess-map node through GeoGuessr's React fibers to a prop or hook
  // state holding the map.
  function fiberOf(el) {
    for (let node = el; node; node = node.parentElement) {
      const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      if (key) return node[key];
    }
    return null;
  }
  function mapInProps(props) {
    if (!props || typeof props !== 'object') return null;
    return Object.values(props).find(v => isGoogleMap(v)) ?? null;
  }
  function mapInHooks(fiber) {
    for (let h = fiber.memoizedState, i = 0; h && typeof h === 'object' && i < 40; h = h.next, i++) {
      const s = h.memoizedState;
      if (isGoogleMap(s)) return s;
      if (isGoogleMap(s?.current)) return s.current;
    }
    return null;
  }
  function mapFromFiber(el) {
    for (let f = fiberOf(el), depth = 0; f && depth < 40; f = f.return, depth++) {
      const map = mapInProps(f.memoizedProps) ?? mapInHooks(f);
      if (map) return map;
    }
    return null;
  }

  function findGuessMap() {
    const el = guessMapElement();
    if (!el) return null;
    return mapFromFiber(el) ?? created.find(m => el.contains(m.getDiv()) || m.getDiv().contains(el)) ?? null;
  }

  // placing() is true during our own click, so map-click listeners (core/aid.js) can tell
  // it from the player's.
  let placingNow = false;
  const placing = () => placingNow;
  function placeGuess(lat, lng, { pan = true } = {}) {
    const map = findGuessMap();
    if (!map) {
      throw new Error(
        guessMapElement() ? 'Found the guess map but not its Google Map' : 'No guess map on screen',
      );
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
      buttonsNearMap:
        [...(guessMapElement()?.closest(GUESS_AREA)?.querySelectorAll('button') ?? [])]
          .map(
            b =>
              `${b.dataset.qa ?? ''} "${b.textContent.trim().slice(0, 30)}"${b.disabled ? ' disabled' : ''}`,
          )
          .join(' | ') || null,
      path: location.pathname,
    };
    const shown = v => (v ? (v instanceof Element ? v.className || v.tagName : String(v)) : v);
    console.table(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, shown(v)])));
    return info;
  }

  ggs.maps = {
    guessMapElement,
    findGuessMap,
    lastGuess,
    placeGuess,
    clearGuess,
    placing,
    submitGuess,
    pressSpace,
    guessButton,
    GUESS_AREA,
    GUESS_PIN_SELECTORS,
    hook,
    debug,
  };
})();
