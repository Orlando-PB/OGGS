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
