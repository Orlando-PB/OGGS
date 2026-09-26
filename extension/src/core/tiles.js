// Street View tile ledger, shared by the scripts that repaint tiles (lying-signs,
// minecraft). Those scripts wrap texImage2D/texSubImage2D and edit tiles as the Maps API
// uploads them, but the API never re-uploads a tile that's already on screen, so a
// script switched on or off mid-round would do nothing until the next panorama. This
// file's wrapper is listed after the scripts in manifest.json, so it's the outermost and
// sees the original <img> even while a script is swapping it for a canvas; it only
// records which texture each tile went into and with what arguments. ggs.tiles.replay()
// then loads those tiles again (from the browser cache) and uploads them through the
// same prototype methods, so every script's wrapper sees them as if they'd just arrived:
// scripts that are on edit them, and scripts that are off let the originals through.
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  const MAX = 1200;                           // records kept (zoom 4 is 512 tiles per panorama)
  const records = [];                         // { gl, name, args, url, crossOrigin, referrerPolicy, target, tex, flip, premul }
  const mipTex = new WeakSet();
  const bindingParam = (gl, target) => target === gl.TEXTURE_2D ? gl.TEXTURE_BINDING_2D : gl.TEXTURE_BINDING_CUBE_MAP;
  const bindTarget = (gl, target) => target === gl.TEXTURE_2D ? gl.TEXTURE_2D : gl.TEXTURE_CUBE_MAP;

  function record(gl, name, args, img) {
    const url = img.currentSrc || img.src;
    if (!TILE.test(url)) return;
    const tex = gl.getParameter(bindingParam(gl, args[0]));
    if (!tex) return;
    // one record per (texture, face, level, offset): a re-upload replaces the older one
    const same = r => r.gl === gl && r.tex === tex && r.name === name && r.args[0] === args[0] && r.args[1] === args[1]
      && (name !== 'texSubImage2D' || (r.args[2] === args[2] && r.args[3] === args[3]));
    const i = records.findIndex(same);
    if (i >= 0) records.splice(i, 1);
    records.push({
      gl, name, args, url, tex, target: args[0], crossOrigin: img.crossOrigin, referrerPolicy: img.referrerPolicy,
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    });
    if (records.length > MAX) records.splice(0, records.length - MAX);
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { record(this, name, a.slice(0, i), a[i]); } catch {}
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingParam(this, target))); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('tiles: hook failed', err); }

  // ---- GeoGuessr's Street View instances, so the view can be nudged into repainting ----
  // The renderer only redraws on a view change, so freshly uploaded tiles would sit
  // unseen until the mouse moved. Two nudges, since either alone can be swallowed: a
  // heading change held for a frame, and a mouse move over the canvas.
  const panos = new Set();
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) { super(...args); panos.add(this); }
      };
    } catch (err) { ggs.log('tiles: could not hook StreetViewPanorama', err); }
  }, 10);
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

  // ---- replay ----
  // Uploads every remembered tile again, through whatever the prototype methods are now
  // (every script's wrapper). Calls made in the same tick are merged into one replay.
  let scheduled = null;
  function replay() {
    if (scheduled) return scheduled;
    scheduled = new Promise(r => setTimeout(r, 0)).then(async () => {
      scheduled = null;
      const live = records.filter(r => !r.gl.isContextLost() && r.gl.isTexture(r.tex));
      records.length = 0; // each upload below records itself again
      let n = 0;
      await Promise.all(live.map(async r => {
        const img = new Image();
        if (r.crossOrigin != null) img.crossOrigin = r.crossOrigin;
        if (r.referrerPolicy) img.referrerPolicy = r.referrerPolicy;
        img.src = r.url;
        try { await img.decode(); } catch { return; }
        const { gl } = r;
        try {
          if (gl.isContextLost() || !gl.isTexture(r.tex)) return;
          const param = bindingParam(gl, r.target), target = bindTarget(gl, r.target);
          const prevTex = gl.getParameter(param);
          const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
          gl.bindTexture(target, r.tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
          gl[r.name](...r.args, img);
          if (mipTex.has(r.tex)) gl.generateMipmap(target);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
          gl.bindTexture(target, prevTex);
          n++;
        } catch (err) { ggs.log('tiles: replay failed', err); }
      }));
      if (n) ggs.debug(`tiles: replayed ${n} of ${live.length}`);
      await repaint();
      return n;
    });
    return scheduled;
  }

  ggs.tiles = { replay, repaint, count: () => records.length };
})();
