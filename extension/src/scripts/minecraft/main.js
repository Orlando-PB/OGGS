// Minecraft world: each panorama is redrawn once, by server/minecraft.php, and wrapped
// back over the Street View sphere.
//
// Street View tiles arrive through ggs.tiles (core/tiles.js). The first tile of a new
// panorama starts one generation: the panorama id and size go to SERVER, which fetches
// the tiles from Google, stitches them and calls the image API with the key it holds.
// Nothing but that id, the size, a random per-install client id and the optional code
// leaves the page. Until the picture is back, tiles go up black; then every tile is
// swapped for the matching crop, so looking around and zooming never generate again.
(() => {
  const ggs = globalThis.__ggs;
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php'; // holds the prompt, models and daily limits

  function clientId() {
    let id = ggs.store.get('ggs-client');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      ggs.store.set('ggs-client', id);
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

  // Typical seconds per generation, from the last rounds; drives the loading bar.
  const ETA_DEFAULT = { normal: 15, hq: 40 };
  const eta = ggs.store.get('ggs-minecraft-eta', {});

  // panoId -> Promise<{ worldWidth, tileWidth, zmax }> (metaSync: the resolved value)
  const meta = new Map(), metaSync = new Map();
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

  const gens = new Map(); // `${panoId}/${mode}` -> { promise, image, pending: [uploads waiting], error }
  let active = null, overlay = null; // active: the cfg while the script is on

  // ---- daily limits ----
  // The server counts per client id. A copy of its log ({ normal: [ms], hq: [ms] }, rolling
  // 24 h) is kept here so a round isn't started once today's limit is used up; the two are
  // merged on every call.
  const DAY = 24 * 3600 * 1000, QKEY = 'ggs-minecraft-quota';
  const Q = {
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
  function saveLog(other) {
    log = Q.tidy(log, other);
    ggs.store.set(QKEY, log);
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    ggs.status('minecraft', `Today: ${part('rounds', Q.left(log, 'normal', caps.normal))} · ${part('high quality', Q.left(log, 'hq', caps.hq))}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    log = ggs.store.get(QKEY, {});
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      ggs.status('minecraft', 'Server not reachable');
      ggs.debug('minecraft: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  const allowed = mode => Q.left(log, mode, caps[mode]).left > 0;
  const stats = { uploads: 0, tiles: 0, swapped: 0 };
  ggs.minecraft = { debug: () => ({ active: !!active, tiles: ggs.tiles.count(), ...stats,
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
      await flush(g);
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      eta[mode] = Math.round((Date.now() - t0) / 1000 * 0.7 + (eta[mode] ?? (Date.now() - t0) / 1000) * 0.3);
      ggs.store.set('ggs-minecraft-eta', eta);
      progressDone();
    })().catch(err => {
      g.error = err;
      ggs.log('minecraft: generation failed', err);
      progressDone(true);
      flush(g).then(() => ggs.tiles.repaint(id)); // put the real tiles back
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom.
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom), H = Math.ceil(W / 2), img = g.image;
    const sx = (x * tw / W) * img.width, sy = (y * th / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width), sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw * sw / ((tw / W) * img.width), th * sh / ((th / H) * img.height));
    return c;
  }

  // ---- tile filter: what goes into WebGL for each tile ----
  ggs.tiles.filter((rec, source) => {
    stats.uploads++;
    if (!active || !rec.key || !(source instanceof HTMLImageElement)) return source;
    const k = rec.key, img = source;
    stats.tiles++;
    const id = k.pano, mode = modeOf(active);
    if (!gens.has(`${id}/${mode}`) && !allowed(mode)) {
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, mode, caps[mode]);
        notice(`${active.hq ? 'High quality' : 'Minecraft'} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const g = generation(id);
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, k.x, k.y, k.z, tw, th);
    if (g.error) return img;
    g.pending.push({ rec, img, tw, th });
    return blank(tw, th);
  }, 0); // before lying-signs, which then sees a canvas and leaves it alone

  // The picture is in (or failed): push the crops (or the real tiles) into the textures.
  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = recs[0].rec.key.pano;
    const m = g.image ? await panoMeta(id).catch(() => null) : null;
    for (const { rec, img, tw, th } of recs) {
      try {
        const k = rec.key;
        if (ggs.tiles.upload(rec, m ? crop(g, m, k.x, k.y, k.z, tw, th) : img)) stats.swapped++;
      } catch (err) { ggs.log('minecraft: re-upload failed', err); }
    }
  }

  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      blankTile.getContext('2d').fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  // ---- loading bar: eases towards 90% over the last rounds' time, fills when tiles are swapped ----
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
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div><div class="bar"><div class="fill"></div></div></div>`;
    document.body.append(host);
    overlay = { host, text: root.querySelector('.text'), bar: root.querySelector('.bar'), fill: root.querySelector('.fill') };
    loadQuota().finally(() => ggs.tiles.replay());
    return {
      stop() { active = null; clearInterval(progressTimer); host.remove(); overlay = null; ggs.tiles.replay(); },
      update(c) {
        const codeChanged = c.code !== active?.code, hqChanged = !!c.hq !== !!active?.hq;
        active = c;
        if (codeChanged) loadQuota();
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }

  ggs.scripts.minecraft = { start };
})();
