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
