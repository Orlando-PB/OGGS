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
  const FALLBACK =
    '<svg width="32" height="46" viewBox="-17 -47 34 48">' +
    `<path d="${PIN}" fill="#d9480f" stroke="#fff" stroke-width="2"/></svg>`;
  // GeoGuessr's pin as last seen: its element and its offset from its spot (px)
  let look = null;

  const realPin = () =>
    document.querySelector(ggs.maps.GUESS_PIN_SELECTORS.map(s => `${s}:not([${OURS}] *)`).join(', '));

  // Copy GeoGuessr's pin for a click, once it has drawn it (a couple of frames later).
  function copyLook(map, latLng, done) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
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
            html: root.outerHTML,
            dx: r.left - m.left - p.x,
            dy: r.top - m.top - p.y,
            w: r.width,
            h: r.height,
          };
        }
        done(look);
      }),
    );
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
        Object.assign(node.firstElementChild.style, {
          position: 'relative',
          left: '0',
          top: '0',
          margin: '0',
          transform: 'none',
        });
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
    const pin = ctx.add(
      makePin(ctx, latLng, () => {
        ctx.remove(pin);
        ctx.pins = ctx.pins.filter(p => p !== pin);
        show(ctx);
      }),
    );
    ctx.pins.push(pin);
  }

  function closest({ loc, pins }) {
    if (!loc || !pins) return null;
    const at = p => ({ lat: p.getPosition().lat(), lng: p.getPosition().lng() });
    return pins.map(at).sort((a, b) => ggs.aid.distance(a, loc) - ggs.aid.distance(b, loc))[0] ?? null;
  }

  ggs.scripts.guesses = ggs.aid('guesses', {
    css:
      `${ggs.maps.GUESS_PIN_SELECTORS.map(s => `${s}:not([${OURS}] *)`).join(', ')} ` +
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
