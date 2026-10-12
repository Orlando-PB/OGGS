// Locks on the Street View panorama, shared by the scripts: ggs.lock.zoom / pan / move
// (owner, on). A lock holds while any owner asks for it, on every panorama, including ones
// made later. Each one both blocks the input (wheel, drag, keys, the arrows) before the
// Maps API or GeoGuessr see it and puts the view back if a change still gets through, and
// setOptions is wrapped so GeoGuessr can't switch the controls back on underneath.
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
  const panos = new Map();  // panorama -> { el, wanted: options GeoGuessr last asked for, held: { kind: undo } }

  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    const st = { el: args[0], wanted: { ...(args[1] ?? {}) }, held: {}, raw: p.setOptions.bind(p) };
    panos.set(p, st);
    // remember what GeoGuessr wants so a lock can be undone, and keep the locked values on top
    const setOptions = st.raw;
    p.setOptions = o => {
      Object.assign(st.wanted, o);
      const forced = {};
      for (const kind of Object.keys(OPTS)) if (on(kind)) Object.assign(forced, OPTS[kind]);
      return setOptions({ ...o, ...Object.fromEntries(Object.keys(o).filter(k => k in forced).map(k => [k, forced[k]])) });
    };
    apply(p);
  });

  const ev = () => window.google?.maps?.event;
  const locks = {
    zoom(p, st) {
      let zoom = p.getZoom();
      const a = ev().addListener(p, 'pano_changed', () => { zoom = p.getZoom(); });
      const b = ev().addListener(p, 'zoom_changed', () => { if (p.getZoom() !== zoom) p.setZoom(zoom); });
      st.raw(OPTS.zoom);
      return () => { a.remove(); b.remove(); restore(p, st, OPTS.zoom); };
    },
    pan(p) {
      // held at the view the panorama opened with; tiles.js's redraw nudge is put back like anything else
      let pov = p.getPov();
      const a = ev().addListener(p, 'pano_changed', () => { pov = p.getPov(); });
      const b = ev().addListener(p, 'pov_changed', () => {
        const now = p.getPov();
        // only heading and pitch go back: getPov() has no zoom here, and setPov rejects zoom: NaN
        if (now.heading !== pov.heading || now.pitch !== pov.pitch) p.setPov({ heading: pov.heading, pitch: pov.pitch });
      });
      return () => { a.remove(); b.remove(); };
    },
    move(p, st) {
      st.raw(OPTS.move);
      return () => restore(p, st, OPTS.move);
    },
  };
  function restore(p, st, keys) {
    const back = {};
    for (const k of Object.keys(keys)) back[k] = st.wanted[k] ?? (k === 'disableDoubleClickZoom' ? false : true);
    st.raw(back);
  }
  function apply(p) {
    const st = panos.get(p);
    for (const kind of Object.keys(locks)) {
      if (on(kind) && !st.held[kind]) { try { st.held[kind] = locks[kind](p, st); } catch (err) { ggs.log(`lock ${kind} failed`, err); } }
      else if (!on(kind) && st.held[kind]) { try { st.held[kind](); } catch {} delete st.held[kind]; }
    }
  }

  // ---- input, swallowed at the window in the capture phase (registered at document_start,
  // so before GeoGuessr's and the Maps API's handlers) ----
  const inPano = t => [...panos.values()].some(st => st.el?.contains?.(t));
  const stop = e => { e.stopImmediatePropagation(); e.preventDefault(); };
  window.addEventListener('keydown', e => {
    if (ggs.isTyping(e)) return;
    for (const kind of Object.keys(KEYS)) if (on(kind) && KEYS[kind].includes(e.key)) return stop(e);
  }, true);
  // zoom: the wheel and pinches over the panorama
  window.addEventListener('wheel', e => { if (on('zoom') && inPano(e.target)) stop(e); }, { capture: true, passive: false });
  window.addEventListener('dblclick', e => { if (on('zoom') && inPano(e.target)) stop(e); }, true);
  for (const t of ['gesturestart', 'gesturechange']) window.addEventListener(t, e => { if (on('zoom') && inPano(e.target)) stop(e); }, true);
  // pan: dragging on the panorama; the press and release still go through, so the arrows (and
  // clicking to move) work when moving is allowed
  let dragging = false;
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) window.addEventListener(t, e => { if (inPano(e.target)) dragging = true; }, true);
  for (const t of ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel']) window.addEventListener(t, () => { dragging = false; }, true);
  for (const t of ['pointermove', 'mousemove', 'touchmove']) window.addEventListener(t, e => {
    if (dragging && (on('pan') || (t === 'touchmove' && on('zoom') && e.touches?.length > 1))) stop(e);
  }, { capture: true, passive: false });

  const set = kind => (owner, want) => {
    if (want) owners[kind].add(owner); else owners[kind].delete(owner);
    for (const p of panos.keys()) apply(p);
  };
  ggs.lock = { zoom: set('zoom'), pan: set('pan'), move: set('move') };
})();
