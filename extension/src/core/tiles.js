// The one WebGL hook. The Maps API uploads every Street View tile with
// texImage2D/texSubImage2D from an <img>; this wraps those two methods (and
// generateMipmap, to know which textures need it again after a re-upload).
//
// For each tile upload a record is made ({ gl, name, args, url, key, img, tex, ... }) and
// the registered filters (minecraft, lying-signs) get a turn, in order, to swap the source
// for a canvas. A filter that needs time can keep the record and later push a new source
// into the same texture with upload(rec, source). Uploads of anything else pass straight
// through. The API never re-uploads a tile already on screen, so replay() loads every
// remembered tile again (browser cache) and runs it through the same path: that's how
// switching a script on or off mid-round takes effect.
(() => {
  const ggs = globalThis.__ggs;
  const MAX = 1200;                           // records kept (zoom 4 is 512 tiles per panorama)
  const records = [];
  const mipTex = new WeakSet();
  const filters = [];                         // [{ fn, order }], lowest order first
  const orig = {};                            // prototype -> { texImage2D, texSubImage2D }

  // filter((rec, source) => source, order): source is the <img> or what an earlier filter returned
  function filter(fn, order = 0) {
    filters.push({ fn, order });
    filters.sort((a, b) => a.order - b.order);
  }
  const live = rec => !rec.gl.isContextLost() && rec.gl.isTexture(rec.tex);

  function makeRecord(gl, name, args, img) {
    const url = img.currentSrc || img.src;
    if (!ggs.TILE.test(url)) return null;
    const [target, param] = ggs.glBinding(gl, args[0]);
    const tex = gl.getParameter(param);
    if (!tex) return null;
    return {
      gl, name, args, url, img, tex, target, key: ggs.tileKey(url),
      crossOrigin: img.crossOrigin, referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
  }
  function remember(rec) {
    // one record per (texture, face, level, offset): a re-upload replaces the older one
    const same = r => r.gl === rec.gl && r.tex === rec.tex && r.name === rec.name && r.args[0] === rec.args[0] && r.args[1] === rec.args[1]
      && (rec.name !== 'texSubImage2D' || (r.args[2] === rec.args[2] && r.args[3] === rec.args[3]));
    const i = records.findIndex(same);
    if (i >= 0) records.splice(i, 1);
    records.push(rec);
    if (records.length > MAX) records.splice(0, records.length - MAX);
  }
  // What goes into WebGL right now for this upload.
  function handle(rec) {
    remember(rec);
    let source = rec.img;
    for (const f of filters) {
      try { source = f.fn(rec, source) ?? source; } catch (err) { ggs.log('tiles: filter failed', err); }
    }
    return source;
  }

  // Later upload of `source` into the texture a record went to, with the same arguments.
  function upload(rec, source) {
    const { gl } = rec;
    if (!live(rec)) return false;
    const [, param] = ggs.glBinding(gl, rec.target);
    const prevTex = gl.getParameter(param);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.bindTexture(rec.target, rec.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, rec.flip);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, rec.premul);
    try {
      orig[rec.name].call(gl, ...rec.args, source);
      if (mipTex.has(rec.tex)) gl.generateMipmap(rec.target);
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
      gl.bindTexture(rec.target, prevTex);
    }
    return true;
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] ??= fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try {
              const rec = makeRecord(this, name, a.slice(0, i), a[i]);
              if (rec) a[i] = handle(rec);
            } catch (err) { ggs.log('tiles: hook failed', err); }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(ggs.glBinding(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('tiles: hook failed', err); }

  // The renderer only redraws on a view change, so nudge it after an upload: a heading
  // change held for a frame, and a mouse move over the canvas (either alone can be swallowed).
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  async function repaint(panoId) {
    const nudged = [];
    for (const p of panos) {
      try {
        if (panoId && p.getPano() !== panoId) continue;
        const pov = p.getPov();
        p.setPov({ ...pov, heading: pov.heading + 0.05 });
        nudged.push([p, pov]);
      } catch {}
    }
    await new Promise(r => requestAnimationFrame(r));
    for (const [p, pov] of nudged) { try { p.setPov(pov); } catch {} }
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 200) continue; // the guess map and our own canvases are small or hidden
      const init = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      c.dispatchEvent(new MouseEvent('mousemove', init));
      c.dispatchEvent(new PointerEvent('pointermove', init));
    }
  }

  // Calls made in the same tick are merged into one replay.
  let scheduled = null;
  function replay() {
    if (scheduled) return scheduled;
    scheduled = new Promise(r => setTimeout(r, 0)).then(async () => {
      scheduled = null;
      const old = records.filter(live);
      records.length = 0;
      let n = 0;
      await Promise.all(old.map(async r => {
        const img = new Image();
        if (r.crossOrigin != null) img.crossOrigin = r.crossOrigin;
        if (r.referrerPolicy) img.referrerPolicy = r.referrerPolicy;
        img.src = r.url;
        try { await img.decode(); } catch { return; }
        try {
          const rec = { ...r, img };
          if (upload(rec, handle(rec))) n++;
        } catch (err) { ggs.log('tiles: replay failed', err); }
      }));
      if (n) ggs.debug(`tiles: replayed ${n} of ${old.length}`);
      await repaint();
      return n;
    });
    return scheduled;
  }

  ggs.tiles = { filter, upload, live, replay, repaint, count: () => records.length };
})();
