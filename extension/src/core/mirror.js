// Mirrored Street View input for core/view.js, which puts these on ggs.view:
//   mirror(owner, { move, turn, zoom, dragX, dragY, flipX, flipY } | null): Street View input
//     sent the other way (see below). Owners cancel out, so two owners flipping the same thing
//     leave it as normal.
//   copyEvent(e, change) -> an untrusted copy of an input event. scripts/lag uses it too.
// The panorama comes from ggs.view.panoElement(), only ever read once view.js has loaded.
(() => {
  const ggs = globalThis.__ggs;
  // view.js's sheets over the panorama carry this.
  const HOST = 'data-ggs-view';
  const panoElement = () => ggs.view.panoElement();
  // container element -> its StreetViewPanorama
  const panoOf = new WeakMap();
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    if (args[0] instanceof Element) panoOf.set(args[0], p);
  });

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
    const to = swapFor(e);
    if (to) resend(e, { ...to, which: to.keyCode });
  }
  // The key to send instead, if any. A keyup sends whatever its keydown did.
  function swapFor(e) {
    const id = e.code || e.key;
    if (e.type !== 'keydown') {
      const to = sent.get(id);
      sent.delete(id);
      return to;
    }
    const to = ['move', 'turn', 'zoom'].map(kind => want(kind) && SWAP[kind][e.key]).find(Boolean);
    if (to) sent.set(id, to);
    return to;
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
  // Set through ggs.lock, so GeoGuessr's own setting (off in No Move games) comes back after.
  function clickToGo() {
    const p = panoOf.get(panoElement());
    const off = want('move') ? p : null;
    if (off === noClickTo) return;
    if (noClickTo) ggs.lock.giveBack(noClickTo, { clickToGo: true });
    if (off) ggs.lock.setOwn(off, { clickToGo: false });
    noClickTo = off;
  }
  function walkBack(x) {
    const el = panoElement();
    const p = panoOf.get(el);
    const links = p?.getLinks?.();
    // never in a game that doesn't let you move
    if (!links?.length || !ggs.lock.gameAllows(p, 'clickToGo')) return;
    const r = el.getBoundingClientRect();
    const pov = p.getPov();
    const fov = 180 / 2 ** (p.getZoom?.() ?? 1);
    const away = pov.heading + ((x - r.left) / r.width - 0.5) * fov + 180;
    const off = l => Math.abs(((((l.heading - away) % 360) + 540) % 360) - 180);
    p.setPano(links.reduce((a, b) => (off(b) < off(a) ? b : a)).pano);
  }

  let from = null;
  const isPress = e => e.type === 'pointerdown' || e.type === 'mousedown';
  const flip = (v, c, on) => (on ? 2 * c - v : v);

  function onPointer(e) {
    if (ours.has(e) || !mirrors.size) return;
    if (isPress(e)) pressAt = { x: e.clientX, y: e.clientY };
    if (e.type === 'click' && want('move') && onPano(e.target)) {
      clickBack(e);
      return;
    }
    const r = panoElement()?.getBoundingClientRect();
    trackDrag(e);
    if (!r || !(onPano(e.target) || from)) return;
    const { x, y } = mirrored(e, r);
    // Cleared a tick later, so the click after a release still mirrors.
    if (/up|cancel/.test(e.type)) {
      setTimeout(() => {
        from = null;
      });
    }
    resendAt(e, x, y);
  }
  // A click that wasn't a drag walks back, from where it would land in the flipped picture.
  function clickBack(e) {
    const still = pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 5;
    e.stopImmediatePropagation();
    const r = panoElement()?.getBoundingClientRect();
    if (still && r && !ggs.lock.held('move')) {
      walkBack(want('flipX') ? 2 * (r.left + r.width / 2) - e.clientX : e.clientX);
    }
  }
  // from is where a left-button drag on the panorama started.
  function trackDrag(e) {
    if (isPress(e)) from = e.button === 0 && onPano(e.target) ? { x: e.clientX, y: e.clientY } : null;
    // A move with no button held means the press ended out of sight.
    if (e.type.endsWith('move') && e.buttons === 0) from = null;
  }
  // A mouse position is first mirrored round the centre (flip), then round the press (drag).
  function mirrored(e, r) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = flip(e.clientX, cx, want('flipX'));
    let y = flip(e.clientY, cy, want('flipY'));
    if (from && !isPress(e)) {
      x = flip(x, flip(from.x, cx, want('flipX')), want('dragX'));
      y = flip(y, flip(from.y, cy, want('flipY')), want('dragY'));
    }
    return { x, y };
  }
  function resendAt(e, x, y) {
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

  ggs.viewMirror = { mirror, copyEvent };
})();
