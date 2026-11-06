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
//   ggs.view.mirror(owner, flips | null) and ggs.view.copyEvent(e, change): see core/mirror.js.
//   ggs.view.shape.rect / circle / poly build that path data.
//   ggs.view.pinPano(el) / unpinPano(el): the panorama as its own stacking layer while
//     something sits in it (counted, shared with the masks).
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
  ggs.maps.hook('StreetViewPanorama', (_p, args) => {
    if (!(args[0] instanceof Element)) return;
    hooked = [...hooked.filter(e => e.isConnected), args[0]].slice(-5);
  });

  // The Street View element on screen. Never one holding the guess map, so nothing done to
  // it can reach the map.
  function panoElement() {
    const map = ggs.maps.guessMapElement();
    const ok = el => el?.isConnected && el.offsetWidth > 0 && !(map && el.contains(map));
    return (
      [...hooked].reverse().find(ok) ?? PANO_SELECTORS.map(s => document.querySelector(s)).find(ok) ?? null
    );
  }
  // The picture inside it: Google's .gm-style layer, or its first child that isn't ours.
  const sceneOf = pano =>
    [...pano.children].find(c => c.classList.contains('gm-style')) ??
    [...pano.children].find(c => !c.hasAttribute(HOST)) ??
    null;

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
    const left = Math.min(...rects.map(q => q.left));
    const top = Math.min(...rects.map(q => q.top));
    const right = Math.max(...rects.map(q => q.right));
    const bottom = Math.max(...rects.map(q => q.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  // A filter that changes nothing, last in line: it only notes when tiles arrive.
  let tileAt = 0;
  ggs.tiles.filter((_rec, source) => {
    tileAt = performance.now();
    return source;
  }, 99);
  const lastTile = () => tileAt;

  // ---- path data ----
  const n = v => Math.round(v * 10) / 10;
  const shape = {
    poly: pts => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`,
    circle: (cx, cy, r) =>
      `M${n(cx - r)} ${n(cy)}` + `a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`,
    rect(x, y, w, h, r = 0) {
      r = Math.min(r, w / 2, h / 2);
      if (!r)
        return shape.poly([
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ]);
      const arc = (dx, dy) => `a${n(r)} ${n(r)} 0 0 1 ${n(dx)} ${n(dy)}`;
      return (
        `M${n(x + r)} ${n(y)}H${n(x + w - r)}${arc(r, r)}V${n(y + h - r)}` +
        `${arc(-r, r)}H${n(x + r)}${arc(-r, -r)}V${n(y + r)}${arc(r, -r)}Z`
      );
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
    applied ??= { scene, pano, saved: { scene: keep(scene, PROPS.scene), pano: keep(pano, PROPS.pano) } };
    const { width: w, height: h } = pano.getBoundingClientRect();
    const { filter, transform } = combined(now, w, h);
    if (scene.style.filter !== filter) scene.style.filter = filter || applied.saved.scene.filter;
    if (applied.transform !== transform) setTransform(transform);
  }
  const keep = (el, keys) => Object.fromEntries(keys.map(k => [k, el.style[k]]));

  // Every owner's effect together, as one filter and one transform.
  function combined(now, w, h) {
    const all = [...effects.values()];
    const filter = all
      .map(e => e.filter)
      .filter(Boolean)
      .join(' ');
    const transform = all
      .map(e => (typeof e.transform === 'function' ? e.transform(now, w, h) : e.transform))
      .filter(Boolean)
      .join(' ');
    return { filter, transform };
  }

  function setTransform(transform) {
    const { scene, pano, saved } = applied;
    applied.transform = transform;
    scene.style.transform = transform || saved.scene.transform;
    scene.style.willChange = transform ? 'transform' : saved.scene.willChange;
    // A transformed picture is clipped to the panorama's box, so a scaled-up one can't spill out.
    pano.style.overflow = transform ? 'hidden' : saved.pano.overflow;
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
      paper: '#f5f1e8',
      dot: 'rgba(28,26,46,.09)',
      edge: '#1c1a2e',
      width: 3,
      shadow: 'rgba(28,26,46,.3)',
    },
    // Near-black with a barely-there dot grid and a thin cream edge round the holes.
    night: {
      paper: '#0b0a12',
      dot: 'rgba(245,241,232,.06)',
      edge: 'rgba(245,241,232,.8)',
      width: 2,
      shadow: null,
    },
  };
  const BLOCKED = [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
    'dblclick',
    'contextmenu',
    'wheel',
    'touchstart',
    'touchmove',
  ];

  function mask({ over, look: lookName, cut }) {
    const look = LOOKS[lookName] ?? LOOKS.paper;
    const screen = over === 'screen';
    const host = document.createElement('div');
    host.setAttribute(HOST, '');
    host.style.cssText =
      `all: initial; position: ${screen ? 'fixed' : 'absolute'}; inset: 0; display: block;` +
      ` z-index: ${screen ? 2147482000 : 2147483000}; pointer-events: none;`;
    // Events on the painted sheet stop here, so neither Street View nor GeoGuessr see them.
    for (const type of BLOCKED) host.addEventListener(type, e => e.stopPropagation());
    const root = host.attachShadow({ mode: 'open' });
    const shadow = look.shadow
      ? `<path class="shadow" fill-rule="evenodd" fill="${look.shadow}" transform="translate(5 5)"/>`
      : '';
    ggs.html(
      root,
      `<style>
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
      </svg>`,
    );
    const m = { last: null, pano: null };
    function unpin() {
      if (m.pano) unpinPano(m.pano);
      m.pano = null;
    }

    function moveInto(parent) {
      unpin();
      parent.append(host);
      m.last = null;
      if (!screen) {
        m.pano = parent;
        pinPano(parent);
      }
    }

    function drawHoles() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const holes = cut(w, h);
      host.hidden = holes === null;
      // The outer edge is 20px past the box so its stroke is off screen. Only the holes' edges show.
      const d = holes === null ? '' : `M-20 -20H${w + 20}V${h + 20}H-20Z${holes}`;
      if (d === m.last) return;
      m.last = d;
      for (const p of root.querySelectorAll('path')) p.setAttribute('d', d);
    }

    m.draw = () => {
      const parent = screen ? document.body : panoElement();
      if (!parent) {
        host.remove();
        unpin();
        return;
      }
      if (host.parentElement !== parent) moveInto(parent);
      drawHoles();
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

  // A panorama with pano masks in it becomes its own stacking layer, so the sheets' z-index
  // stays inside it and GeoGuessr's HUD keeps drawing above them. Masks share it: its own
  // isolation and position come back when the last one leaves.
  // panorama element -> { count, saved }
  const pinned = new Map();
  function pinPano(pano) {
    const p = pinned.get(pano);
    if (p) return p.count++;
    pinned.set(pano, { count: 1, saved: { isolation: pano.style.isolation, position: pano.style.position } });
    pano.style.isolation = 'isolate';
    if (getComputedStyle(pano).position === 'static') pano.style.position = 'relative';
  }
  function unpinPano(pano) {
    const p = pinned.get(pano);
    if (!p || --p.count > 0) return;
    pinned.delete(pano);
    Object.assign(pano.style, p.saved);
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

  ggs.view = {
    panoElement,
    guessArea,
    lastTile,
    effect,
    script,
    mask,
    shape,
    pinPano,
    unpinPano,
    ...ggs.viewMirror,
  };
})();
