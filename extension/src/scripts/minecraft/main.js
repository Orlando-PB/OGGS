// Minecraft world: the panorama you're in is sent (once) to OpenAI's image edit API and
// the result is wrapped back over the Street View sphere.
//
// How: every Street View tile goes into WebGL with texImage2D/texSubImage2D from an <img>
// whose URL names the panorama and the tile's x/y/zoom (the same hook as lying-signs).
// The first tile of a new panorama starts one generation: the panorama's id and size go
// to server/minecraft.php, which fetches the tiles from Google, stitches them and posts the
// picture to the API with the key it holds. Nothing but that id, the size, a random
// per-install client id and the optional code leaves the page. Until the picture is back,
// tiles go up black;
// when it is, every tile uploaded so far is replaced by the matching crop of the
// picture, and later tiles (any zoom) are cropped straight away. So zooming and looking
// around never generate again; only a new panorama does. Switching on or off mid-round
// replays the tiles already on screen through the hook (ggs.tiles in core/tiles.js).
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;

  // The prompt, models, sizes and daily limits live in server/minecraft.php.
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php';

  // A random id made once per install, so the server can keep a per-user daily count.
  function clientId() {
    let id = null;
    try { id = localStorage.getItem('ggs-client'); } catch {}
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('ggs-client', id); } catch {}
    }
    return id;
  }
  async function server(fields, post = false) {
    const body = new URLSearchParams({ ...fields, client: clientId(), code: active?.code ?? '' });
    const r = post ? await fetch(SERVER, { method: 'POST', body }) : await fetch(`${SERVER}?caps=1&${body}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `server HTTP ${r.status}`);
    return j;
  }

  // Typical seconds from first tile to swapped tiles, from the last rounds; drives the
  // loading bar (the API reports no progress, so the bar is an estimate).
  const ETA_DEFAULT = { normal: 15, hq: 40 };
  let eta = {};
  try { eta = JSON.parse(localStorage.getItem('ggs-minecraft-eta')) ?? {}; } catch {}

  // ---- panorama metadata (tile grid size per zoom) ----
  const meta = new Map(), metaSync = new Map(); // panoId -> Promise<{ worldWidth, tileWidth, zmax }> / resolved value
  function panoMeta(id) {
    if (!meta.has(id)) meta.set(id, new window.google.maps.StreetViewService().getPanorama({ pano: id })
      .then(({ data }) => {
        const worldWidth = data.tiles.worldSize.width, tileWidth = data.tiles.tileSize.width;
        const m = { worldWidth, tileWidth, zmax: Math.ceil(Math.log2(worldWidth / tileWidth)) };
        metaSync.set(id, m);
        return m;
      }));
    return meta.get(id);
  }
  const widthAt = (m, zoom) => Math.ceil(m.worldWidth / 2 ** (m.zmax - zoom));

  // ---- generations, one per panorama ----
  const gens = new Map(); // `${panoId}/${mode}` -> { promise, image (ImageBitmap|null), pending: [uploads waiting for it], error }
  let active = null, overlay = null; // active: the cfg while the script is on

  // ---- daily limits ----
  // The server counts per client id; a copy of its log is kept in this site's localStorage
  // so a round isn't started when today's limit is already used up, and the two are merged
  // on every call. The log is { normal: [timestamps], hq: [timestamps] } over a rolling 24 h.
  const DAY = 24 * 3600 * 1000, QKEY = 'ggs-minecraft-quota';
  const Q = {
    // Drops entries older than a day; merges another copy of the log (union of timestamps).
    tidy(log, other) {
      const now = Date.now(), out = {};
      for (const k of ['normal', 'hq']) {
        const all = new Set([...(log?.[k] ?? []), ...(other?.[k] ?? [])].filter(t => now - t < DAY));
        out[k] = [...all].sort((a, b) => a - b);
      }
      return out;
    },
    left(log, mode, cap) {
      const l = Q.tidy(log)[mode];
      return { left: Math.max(0, cap - l.length), resetAt: l.length ? l[0] + DAY : null };
    },
    until(at) {
      const m = Math.max(1, Math.ceil((at - Date.now()) / 60000));
      return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    },
  };
  let log = {}, caps = { normal: 100, hq: 10 }, limitShownFor = null;
  const readLog = () => { try { return JSON.parse(localStorage.getItem(QKEY)) ?? {}; } catch { return {}; } };
  function saveLog(other) {
    log = Q.tidy(log, other);
    try { localStorage.setItem(QKEY, JSON.stringify(log)); } catch {}
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    ggs.status('minecraft', `Today: ${part('rounds', Q.left(log, 'normal', caps.normal))} · ${part('high quality', Q.left(log, 'hq', caps.hq))}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    log = readLog();
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      ggs.status('minecraft', 'Server not reachable');
      ggs.debug('minecraft: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  function allowed(mode) { return Q.left(log, mode, caps[mode]).left > 0; }
  const stats = { uploads: 0, tiles: 0, swapped: 0 }; // WebGL <img> uploads seen, of which Street View tiles, tiles re-uploaded
  ggs.minecraft = { debug: () => ({ active: !!active, hooked: !!orig.texImage2D, tiles: ggs.tiles.count(), ...stats,
    gens: [...gens].map(([id, g]) => ({ id, image: !!g.image, pending: g.pending.length, error: g.error?.message ?? null })) }) };

  function generation(id) {
    const mode = modeOf(active), key = `${id}/${mode}`;
    if (gens.has(key)) return gens.get(key);
    const g = { image: null, pending: [], error: null };
    gens.set(key, g);
    if (gens.size > 20) { const k = gens.keys().next().value; gens.get(k).image?.close?.(); gens.delete(k); }
    const t0 = Date.now();
    (log[mode] ??= []).push(t0); // counted when it starts; the server's log replaces it once it answers
    saveLog();
    g.promise = (async () => {
      progressStart(eta[mode] ?? ETA_DEFAULT[mode]);
      const m = await panoMeta(id);
      const r = await server({ pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode }, true);
      if (r.log) saveLog(r.log);
      const img = new Image();
      img.src = r.image;
      await img.decode();
      g.image = await createImageBitmap(img);
      ggs.debug(`minecraft: generated ${id} (${mode}) in ${(r.ms / 1000).toFixed(1)} s`);
      await flush(g); // the bar only finishes once the tiles on screen have been swapped
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      eta[mode] = Math.round((Date.now() - t0) / 1000 * 0.7 + (eta[mode] ?? (Date.now() - t0) / 1000) * 0.3);
      try { localStorage.setItem('ggs-minecraft-eta', JSON.stringify(eta)); } catch {}
      progressDone();
    })().catch(err => {
      g.error = err;
      ggs.log('minecraft: generation failed', err);
      progressDone(true);
      flush(g).then(() => ggs.tiles.repaint(id)); // put the real tiles back so the game goes on
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom (a 512x512-ish canvas).
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom), H = Math.ceil(W / 2), img = g.image;
    const sx = (x * tw / W) * img.width, sy = (y * th / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width), sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw * sw / ((tw / W) * img.width), th * sh / ((th / H) * img.height));
    return c;
  }

  // ---- tile hook (installed at document_start whether or not the script is on) ----
  const orig = {}, mipTex = new WeakSet();
  const bindingFor = (gl, target) =>
    target === gl.TEXTURE_2D ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D] : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];

  function onUpload(gl, name, args, img) {
    stats.uploads++;
    if (!active) return img;
    const mt = TILE.exec(img.currentSrc || img.src);
    if (!mt) return img;
    stats.tiles++;
    const [, id, x, y, zoom] = mt;
    if (!gens.has(`${id}/${modeOf(active)}`) && !allowed(modeOf(active))) {
      // over today's limit: the real view shows, and a note says when it's back
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, modeOf(active), caps[modeOf(active)]);
        notice(`${active.hq ? 'High quality' : 'Minecraft'} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const g = generation(id);
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const [bindTarget, bindParam] = bindingFor(gl, args[0]);
    const rec = {
      gl, name, args, x: +x, y: +y, zoom: +zoom, tw, th, img, bindTarget, tex: gl.getParameter(bindParam),
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    };
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, +x, +y, +zoom, tw, th);
    if (g.error) return img;
    g.pending.push(rec);
    return blank(tw, th);
  }

  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = TILE.exec(recs[0].img.currentSrc || recs[0].img.src)?.[1];
    const m = g.image && id ? await panoMeta(id).catch(() => null) : null;
    for (const r of recs) {
      const { gl } = r;
      try {
        if (gl.isContextLost() || !gl.isTexture(r.tex)) continue;
        const src = m ? crop(g, m, r.x, r.y, r.zoom, r.tw, r.th) : r.img;
        const [, bindParam] = bindingFor(gl, r.args[0]);
        const prevTex = gl.getParameter(bindParam);
        const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        gl.bindTexture(r.bindTarget, r.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
        orig[r.name].call(gl, ...r.args, src);
        if (mipTex.has(r.tex)) gl.generateMipmap(r.bindTarget);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
        gl.bindTexture(r.bindTarget, prevTex);
        stats.swapped++;
      } catch (err) { ggs.log('minecraft: re-upload failed', err); }
    }
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] = orig[name] || fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { a[i] = onUpload(this, name, a.slice(0, i), a[i]); } catch (err) { ggs.log('minecraft: hook failed', err); }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingFor(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
  }
  try { install(); } catch (err) { ggs.log('minecraft: hook failed', err); }

  // Placeholder while the picture is made: a plain black tile.
  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      blankTile.getContext('2d').fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  // ---- loading bar, centred over the game while a round is being redrawn ----
  // The API reports no progress, so the bar eases towards 90% over the time the last
  // rounds took, then fills once the new tiles are on screen.
  const CSS = `
    :host { all: initial; position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2147483000; pointer-events: none;
            opacity: 0; transition: opacity .25s; }
    :host([data-on]) { opacity: 1; }
    .box { width: 300px; padding: 16px 20px; border-radius: 16px; background: rgba(20, 16, 48, .85); backdrop-filter: blur(8px);
           box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6); font: 700 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
           text-align: center; letter-spacing: .02em; }
    .bar[hidden] { display: none; }
    .bar { height: 10px; margin-top: 12px; border-radius: 5px; background: rgba(255, 255, 255, .12); overflow: hidden; }
    .fill { height: 100%; width: 0; border-radius: 5px; background: #fecd19; transition: width .1s linear, background .3s; }
  `;
  let progressTimer = null;
  function progressStart(seconds) {
    if (!overlay) return;
    clearInterval(progressTimer);
    const fill = overlay.fill, t0 = Date.now();
    overlay.text.textContent = 'Loading round…';
    overlay.bar.hidden = false;
    fill.style.width = '0%';
    fill.style.background = '';
    overlay.host.dataset.on = '';
    progressTimer = setInterval(() => {
      const x = (Date.now() - t0) / 1000 / seconds;
      fill.style.width = `${Math.min(90, 100 * (1 - Math.exp(-2.3 * x)))}%`;
    }, 100);
  }
  function progressDone(failed, message) {
    if (!overlay) return;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) { overlay.fill.style.background = '#e03131'; overlay.text.textContent = message ?? 'Could not redraw this round'; }
    setTimeout(() => { if (overlay) delete overlay.host.dataset.on; }, failed ? 4000 : 400);
  }
  // A short message with no bar (limits).
  function notice(message) {
    if (!overlay) return;
    clearInterval(progressTimer);
    overlay.text.textContent = message;
    overlay.bar.hidden = true;
    overlay.host.dataset.on = '';
    setTimeout(() => { if (overlay) { delete overlay.host.dataset.on; setTimeout(() => { if (overlay) overlay.bar.hidden = false; }, 300); } }, 4000);
  }

  function start(cfg) {
    active = cfg;
    ggs.debug('minecraft: on; tiles seen so far', stats.tiles);
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div><div class="bar"><div class="fill"></div></div></div>`;
    document.body.append(host);
    overlay = { host, text: root.querySelector('.text'), bar: root.querySelector('.bar'), fill: root.querySelector('.fill') };
    loadQuota().finally(() => ggs.tiles.replay()); // tiles already on screen go through the hook once the limits are known
    return {
      stop() { active = null; clearInterval(progressTimer); host.remove(); overlay = null; ggs.tiles.replay(); },
      update(c) {
        const codeChanged = c.code !== active?.code, hqChanged = !!c.hq !== !!active?.hq;
        active = c;
        if (codeChanged) loadQuota();
        // quality switched: replay the tiles on screen, so a panorama already generated in
        // that quality swaps instantly and one that isn't gets generated now
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }

  ggs.scripts.minecraft = { start };
})();
