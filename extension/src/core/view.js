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
  ggs.tiles.filter((rec, source) => {
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
    if (!applied) {
      const keep = (el, keys) => Object.fromEntries(keys.map(k => [k, el.style[k]]));
      applied = { scene, pano, saved: { scene: keep(scene, PROPS.scene), pano: keep(pano, PROPS.pano) } };
    }
    const { width: w, height: h } = pano.getBoundingClientRect();
    const all = [...effects.values()];
    const filter = all
      .map(e => e.filter)
      .filter(Boolean)
      .join(' ');
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
      const w = host.clientWidth;
      const h = host.clientHeight;
      const holes = cut(w, h);
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
      ArrowUp: key('ArrowDown', 'ArrowDown', 40),
      ArrowDown: key('ArrowUp', 'ArrowUp', 38),
      w: key('s', 'KeyS', 83),
      s: key('w', 'KeyW', 87),
      W: key('S', 'KeyS', 83),
      S: key('W', 'KeyW', 87),
    },
    turn: {
      ArrowLeft: key('ArrowRight', 'ArrowRight', 39),
      ArrowRight: key('ArrowLeft', 'ArrowLeft', 37),
      a: key('d', 'KeyD', 68),
      d: key('a', 'KeyA', 65),
      A: key('D', 'KeyD', 68),
      D: key('A', 'KeyA', 65),
    },
    zoom: {
      '+': key('-', 'Minus', 189),
      '=': key('-', 'Minus', 189),
      '-': key('=', 'Equal', 187),
      _: key('=', 'Equal', 187),
    },
  };
  // Every event field the copies need. The constructor ignores the ones its type lacks.
  const FIELDS = [
    'bubbles',
    'cancelable',
    'composed',
    'view',
    'detail',
    'ctrlKey',
    'shiftKey',
    'altKey',
    'metaKey',
    'key',
    'code',
    'location',
    'repeat',
    'keyCode',
    'which',
    'charCode',
    'screenX',
    'screenY',
    'clientX',
    'clientY',
    'movementX',
    'movementY',
    'button',
    'buttons',
    'relatedTarget',
    'pointerId',
    'pointerType',
    'isPrimary',
    'width',
    'height',
    'pressure',
    'tiltX',
    'tiltY',
    'twist',
    'deltaX',
    'deltaY',
    'deltaZ',
    'deltaMode',
  ];
  const POINTER = [
    'pointerdown',
    'mousedown',
    'pointermove',
    'mousemove',
    'pointerup',
    'mouseup',
    'pointercancel',
    'click',
    'dblclick',
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
  let pressAt = null;
  let noClickTo = null;
  function clickToGo() {
    const p = panoOf.get(panoElement());
    const off = want('move') ? p : null;
    if (off === noClickTo) return;
    noClickTo?.setOptions({ clickToGo: true });
    off?.setOptions({ clickToGo: false });
    noClickTo = off;
  }
  function walkBack(x) {
    const el = panoElement();
    const p = panoOf.get(el);
    const links = p?.getLinks?.();
    if (!links?.length) return;
    const r = el.getBoundingClientRect();
    const pov = p.getPov();
    const fov = 180 / 2 ** (p.getZoom?.() ?? 1);
    const away = pov.heading + ((x - r.left) / r.width - 0.5) * fov + 180;
    const off = l => Math.abs(((((l.heading - away) % 360) + 540) % 360) - 180);
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
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
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
    const dx = x - e.clientX;
    const dy = y - e.clientY;
    if (!dx && !dy) return;
    const sx = want('flipX') !== (!!from && want('dragX')) ? -1 : 1;
    const sy = want('flipY') !== (!!from && want('dragY')) ? -1 : 1;
    resend(e, {
      clientX: x,
      clientY: y,
      screenX: e.screenX + dx,
      screenY: e.screenY + dy,
      movementX: sx * e.movementX,
      movementY: sy * e.movementY,
    });
  }
  const onBlur = e => {
    if (e.target !== window) return;
    from = null;
    sent.clear();
  };
  const LISTENERS = [
    ['keydown', onKey],
    ['keyup', onKey],
    ['wheel', onWheel],
    ['blur', onBlur],
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
