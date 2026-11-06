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
  // panorama -> { el, wanted: options GeoGuessr last asked for, held: { kind: undo }, raw }.
  // Weak, and walked through maps.js's list, which drops panoramas that left the page, so old
  // ones aren't kept alive here.
  const state = new WeakMap();
  const panos = () =>
    ggs.maps
      .panoramas()
      .filter(p => state.has(p))
      .map(p => [p, state.get(p)]);

  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    const st = { el: args[0], wanted: { ...(args[1] ?? {}) }, held: {}, raw: p.setOptions.bind(p) };
    state.set(p, st);
    // Remembers what GeoGuessr wants so a lock can be undone, and keeps the locked values on top.
    const setOptions = st.raw;
    p.setOptions = o => {
      Object.assign(st.wanted, o);
      const forced = {};
      for (const kind of Object.keys(OPTS)) if (on(kind)) Object.assign(forced, OPTS[kind]);
      const kept = Object.keys(o)
        .filter(k => k in forced)
        .map(k => [k, forced[k]]);
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
        restore(st, OPTS.zoom);
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
    move(_p, st) {
      st.raw(OPTS.move);
      return () => restore(st, OPTS.move);
    },
  };
  // For core/mirror.js: options a script sets, not taken for GeoGuessr's own wishes, and whether
  // GeoGuessr itself allows an option (one it never set counts as allowed).
  function setOwn(p, o) {
    const st = state.get(p);
    if (st) st.raw(o);
    else p.setOptions(o);
  }
  const gameAllows = (p, key) => state.get(p)?.wanted[key] !== false;
  // Puts clickToGo and the like back to what GeoGuessr asked for, unless a move lock holds them.
  function giveBack(p, keys) {
    const st = state.get(p);
    if (st && !on('move')) restore(st, keys);
  }

  function restore(st, keys) {
    const back = {};
    for (const k of Object.keys(keys)) {
      back[k] = st.wanted[k] ?? k !== 'disableDoubleClickZoom';
    }
    st.raw(back);
  }
  function hold(p, st, kind) {
    try {
      st.held[kind] = locks[kind](p, st);
    } catch (err) {
      ggs.log(`lock ${kind} failed`, err);
    }
  }
  function release(st, kind) {
    try {
      st.held[kind]();
    } catch {}
    delete st.held[kind];
  }
  function apply(p) {
    const st = state.get(p);
    for (const kind of Object.keys(locks)) {
      if (on(kind) && !st.held[kind]) hold(p, st, kind);
      else if (!on(kind) && st.held[kind]) release(st, kind);
    }
  }

  // ---- input, swallowed at the window in the capture phase ----
  // Registered at document_start, so these run before GeoGuessr's and the Maps API's handlers.
  // Our own sheets over the panorama (core/view.js, scratch's foil) keep their input.
  const inPano = t => !t?.closest?.('[data-ggs-view]') && panos().some(([, st]) => st.el?.contains?.(t));
  const stop = e => {
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  window.addEventListener(
    'keydown',
    e => {
      if (ggs.isTyping(e)) return;
      for (const kind of Object.keys(KEYS)) if (on(kind) && KEYS[kind].includes(e.key)) return stop(e);
    },
    true,
  );
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
    window.addEventListener(
      t,
      e => {
        if (inPano(e.target)) dragging = true;
      },
      true,
    );
  }
  for (const t of ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel']) {
    window.addEventListener(
      t,
      () => {
        dragging = false;
      },
      true,
    );
  }
  for (const t of ['pointermove', 'mousemove', 'touchmove']) {
    window.addEventListener(
      t,
      e => {
        if (dragging && (on('pan') || (t === 'touchmove' && on('zoom') && e.touches?.length > 1))) stop(e);
      },
      { capture: true, passive: false },
    );
  }

  const set = kind => (owner, want) => {
    if (want) owners[kind].add(owner);
    else owners[kind].delete(owner);
    for (const [p] of panos()) apply(p);
  };
  // face(owner, heading | null): a pan lock that also turns every panorama to that heading.
  let facing = null;
  function face(owner, heading) {
    facing = heading;
    // Let go of each pan lock so it's held again below at the new heading.
    for (const [, st] of panos()) {
      if (st.held.pan) {
        st.held.pan();
        delete st.held.pan;
      }
    }
    set('pan')(owner, heading != null);
    for (const [p] of panos()) apply(p);
  }
  // zoomTo(owner, level | null): a zoom lock that also sets every panorama to that zoom.
  // null puts each back to the zoom it had, so No zoom doesn't keep it there.
  let zoomAt = null;
  function zoomTo(owner, level) {
    zoomAt = level;
    for (const [p, st] of panos()) {
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
  ggs.lock = {
    zoom: set('zoom'),
    pan: set('pan'),
    move: set('move'),
    face,
    zoomTo,
    held: on,
    setOwn,
    gameAllows,
    giveBack,
  };
})();
