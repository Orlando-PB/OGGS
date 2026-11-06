// The one WebGL hook. The Maps API uploads every Street View tile from an <img> with
// texImage2D or texSubImage2D, and this wraps both. It also wraps generateMipmap, to know
// which textures need it again after a re-upload, and deleteTexture, to know which are gone.
//
// Each tile upload gets a record ({ gl, name, args, url, key, img, tex, ... }). The registered
// filters (redraw, lying-signs, gradient) then get a turn, in order, to swap the source for a
// canvas. A filter that needs time can keep the record and push a new source into the same
// texture later with reupload(rec, source, order): the filters after its own order get their
// turn on it first, so a late tile still gets every later effect. Other uploads pass straight
// through.
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
      gl,
      name,
      args,
      url,
      img,
      tex,
      target,
      key: ggs.tileKey(url),
      crossOrigin: img.crossOrigin,
      referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
      premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
  }
  function remember(rec) {
    // One record per (texture, face, level, offset). A re-upload replaces the older one.
    const same = r =>
      r.gl === rec.gl &&
      r.tex === rec.tex &&
      r.name === rec.name &&
      r.args[0] === rec.args[0] &&
      r.args[1] === rec.args[1] &&
      (rec.name !== 'texSubImage2D' || (r.args[2] === rec.args[2] && r.args[3] === rec.args[3]));
    const i = records.findIndex(same);
    if (i >= 0) records.splice(i, 1)[0].stale = true;
    records.push(rec);
    if (records.length > MAX) records.splice(0, records.length - MAX);
  }
  // What goes into WebGL right now for this upload.
  function handle(rec) {
    remember(rec);
    return runFilters(rec, rec.img);
  }
  // The filters after order `after` on this source, in order.
  function runFilters(rec, source, after = -Infinity) {
    for (const f of filters) {
      if (f.order <= after) continue;
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
      const proto =
        gl instanceof WebGL2RenderingContext
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
  // A filter's late result for a record: the filters after `fromOrder` run on it, then it goes
  // up. Those filters see the same record again, as on a replay, and may keep it to send their
  // own late result the same way.
  function reupload(rec, source, fromOrder) {
    if (!live(rec)) return false;
    return upload(rec, runFilters(rec, source, fromOrder));
  }

  function wrapUpload(P, name) {
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
  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) wrapUpload(P, name);
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
  async function repaint(panoId) {
    const nudged = nudge(panoId);
    await new Promise(r => requestAnimationFrame(r));
    for (const [p, pov] of nudged) {
      try {
        p.setPov(pov);
      } catch {}
    }
    moveMouse();
  }
  // Turns each panorama (or only panoId) a touch. Returns [panorama, its pov before].
  function nudge(panoId) {
    const nudged = [];
    for (const p of ggs.maps.panoramas()) {
      try {
        if (panoId && p.getPano() !== panoId) continue;
        const pov = p.getPov();
        p.setPov({ ...pov, heading: pov.heading + 0.05 });
        nudged.push([p, pov]);
      } catch {}
    }
    return nudged;
  }
  function moveMouse() {
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
      loaded.set(
        r.url,
        img.decode().then(
          () => img,
          () => null,
        ),
      );
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
    return all
      .filter(r => r.key.pano === pano)
      .reverse()
      .sort((a, b) => b.key.z - a.key.z);
  }
  // The game's spare time between frames, or short timer slices without idle callbacks.
  const idle = () =>
    new Promise(res =>
      window.requestIdleCallback
        ? requestIdleCallback(res, { timeout: 100 })
        : setTimeout(() => res({ timeRemaining: () => 8 })),
    );
  // prerender(fn(img, key) -> source) -> { ready(), get(url), cancel() }
  function prerender(fn) {
    const out = new Map();
    const run = { stopped: false, done: false };
    renderAll(fn, out, run);
    return {
      ready: () => run.done,
      get: url => out.get(url),
      cancel() {
        run.stopped = true;
        out.clear();
      },
    };
  }
  async function renderAll(fn, out, run) {
    const list = onScreen();
    // Fetched together, drawn one by one.
    const imgs = list.map(load);
    let slice = await idle();
    for (let i = 0; i < list.length; i++) {
      const img = await imgs[i];
      if (run.stopped) return;
      if (img) renderOne(fn, out, list[i], img);
      // Keeps the game smooth.
      if (slice.timeRemaining() < 3) slice = await idle();
    }
    run.done = true;
  }
  function renderOne(fn, out, r, img) {
    try {
      out.set(r.url, fn(img, r.key));
    } catch (err) {
      ggs.log('tiles: prerender failed', err);
    }
  }

  // Calls made in the same tick are merged into one replay. Tiles already loaded go up first,
  // then the rest as they arrive, newest first (the likeliest to be on screen).
  // Each frame does at most SLICE ms of work or PIXELS of texture. The GPU process does the
  // uploads after the calls return, so a time limit alone lets too many through. This way a
  // replay of hundreds of tiles never holds up the game's frames or a click. A repaint now and
  // then shows the ones done. A newer replay stops the running one. Records it hadn't reached
  // are still live, so the new one picks them up.
  const SLICE = 8;
  const PIXELS = 8 * 512 * 512;
  const nextFrame = () =>
    new Promise(r => (document.hidden ? setTimeout(r) : requestAnimationFrame(() => setTimeout(r))));
  let scheduled = null;
  let current = null;
  let painting = null;
  const showSoFar = () => {
    painting ??= repaint().finally(() => {
      painting = null;
    });
  };
  function replay() {
    scheduled ??= new Promise(r => setTimeout(r, 0)).then(runReplay);
    return scheduled;
  }
  async function runReplay() {
    scheduled = null;
    if (current) current.stopped = true;
    const run = { stopped: false };
    current = run;
    const old = records.filter(live).reverse();
    const pace = { n: 0, spent: 0, pixels: 0, shown: performance.now() };
    if (!(await putAllBack(old, run, pace))) return pace.n;
    current = null;
    loaded.clear();
    if (pace.n) ggs.debug(`tiles: replayed ${pace.n} of ${old.length}`);
    await painting;
    await repaint();
    return pace.n;
  }
  // Tiles already loaded first. The rest are fetched together, and put up one by one.
  function replayOrder(old) {
    const ready = new Set(loaded.keys());
    const first = old.filter(r => ready.has(r.url));
    const rest = old.filter(r => !ready.has(r.url));
    rest.forEach(load);
    return { list: [...first, ...rest], loadedCount: first.length };
  }
  // False when a newer replay stopped it partway.
  async function putAllBack(old, run, pace) {
    const { list, loadedCount } = replayOrder(old);
    for (const [i, r] of list.entries()) {
      // The loaded ones are up. The rest may take a while.
      if (i === loadedCount && pace.n) showSoFar();
      const img = await load(r);
      if (run.stopped) return false;
      putBack(r, img, pace);
      await breathe(pace);
      if (run.stopped) return false;
    }
    return true;
  }
  // One remembered tile through the filters and up again, counted in pace.
  function putBack(r, img, pace) {
    // Gone, or the game put something newer there.
    if (!img || !live(r)) return;
    const t = performance.now();
    try {
      // handle() calls remember(), which marks r stale.
      const rec = { ...r, img, stale: false };
      const source = handle(rec);
      if (upload(rec, source)) {
        pace.n++;
        // Tiny tiles cost something too.
        pace.pixels += Math.max(PIXELS / 64, (source.width || 512) * (source.height || 512));
      }
    } catch (err) {
      ggs.log('tiles: replay failed', err);
    }
    pace.spent += performance.now() - t;
  }
  // Once this frame's budget is spent, waits for the next frame, showing what's done every
  // 150 ms or so.
  async function breathe(pace) {
    if (pace.spent < SLICE && pace.pixels < PIXELS) return;
    if (performance.now() - pace.shown > 150) {
      pace.shown = performance.now();
      showSoFar();
    }
    await nextFrame();
    pace.spent = pace.pixels = 0;
  }

  ggs.tiles = {
    filter,
    upload,
    reupload,
    live,
    replay,
    repaint,
    preload,
    prerender,
    count: () => records.length,
  };
})();
