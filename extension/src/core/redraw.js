// Redrawn world (Minecraft world): each panorama is redrawn once, by server/minecraft.php,
// and wrapped back over the Street View sphere. ggs.redraw.script(id, style, label) makes
// the { start } for the script.
//
// Street View tiles arrive through ggs.tiles (core/tiles.js). The first tile of a new
// panorama starts one generation: the panorama id and size go to SERVER, which fetches
// the tiles from Google, stitches them and calls the image API with the key it holds.
// Nothing but that id, the size, a random per-install client id and the optional code
// leaves the page. Until the picture is back, tiles go up blue; then every tile is swapped
// for the matching crop, so looking around and zooming never generate again.
// Generation waits until the panorama has stayed still for a moment, so walking through
// several positions only redraws the one you stop at; the ones passed through get their
// real tiles back.
(() => {
  const ggs = globalThis.__ggs;
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php'; // holds the prompts, models and daily limits

  function clientId() {
    let id = ggs.store.get('ggs-client');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      ggs.store.set('ggs-client', id);
    }
    return id;
  }
  const code = () => active?.cfg.code || ggs.settings?.minecraft?.code || '';
  async function server(fields, post = false, signal) {
    const body = new URLSearchParams({ ...fields, client: clientId(), code: code() });
    const r = post ? await fetch(SERVER, { method: 'POST', body, signal }) : await fetch(`${SERVER}?caps=1&${body}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `server HTTP ${r.status}`);
    return j;
  }

  // Typical seconds per generation, from the last rounds; drives the loading bar.
  const ETA_DEFAULT = { normal: 15, hq: 40 };
  const eta = ggs.store.get('ggs-minecraft-eta', {});
  const etaKey = mode => (active.style === 'minecraft' ? mode : `${active.style}/${mode}`);

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

  const gens = new Map(); // `${panoId}/${style}/${mode}` -> { promise, image, pending: [uploads waiting], error }
  let active = null, overlay = null; // active: { id, style, label, cfg } while a script is on
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  function shownPano() {
    for (const p of panos) { try { const id = p.getPano(); if (id) return id; } catch {} }
    return null;
  }

  // Tiles of a panorama that has no generation yet wait here (blue on screen) until the
  // view has stayed on one panorama for SETTLE ms; then that panorama is generated and the
  // others get their real tiles back.
  const SETTLE = 800;
  const waitingPanos = new Map(); // panoId -> [{ rec, img, tw, th }]
  let settleTimer = null, latestPano = null;
  function waitFor(id, entry) {
    if (!waitingPanos.has(id)) waitingPanos.set(id, []);
    waitingPanos.get(id).push(entry);
    if (id !== latestPano || !settleTimer) { latestPano = id; clearTimeout(settleTimer); settleTimer = setTimeout(settled, SETTLE); }
  }
  function settled() {
    settleTimer = null;
    const id = shownPano() ?? latestPano;
    // a generation still in flight for a panorama you've moved away from is cancelled
    for (const [key, g] of gens) if (g.ctrl && !g.image && !g.error && !key.startsWith(`${id}/`)) cancel(key, g);
    for (const [pid, entries] of [...waitingPanos]) {
      waitingPanos.delete(pid);
      if (pid === id && active) {
        const g = generation(pid);
        g.pending.push(...entries);
        if (g.image || g.error) flush(g);
      } else {
        for (const { rec, img } of entries) { try { ggs.tiles.upload(rec, img); } catch {} }
      }
    }
  }

  // ---- daily limits ----
  // The server counts per client id and its log ({ normal: [ms], hq: [ms] }, rolling 24 h)
  // is the truth; a copy is kept here so a round isn't started once today's limit is used
  // up. Generations in flight are added on top until the server's answer (which includes
  // them) replaces the copy, so nothing is counted twice.
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
  let serverLog = {}, log = {}, caps = { normal: 100, hq: 10 }, limitShownFor = null;
  const inFlight = { normal: [], hq: [] }; // t0 of generations the server hasn't answered yet
  function saveLog(fromServer) {
    if (fromServer) serverLog = Q.tidy(fromServer);
    log = Q.tidy(serverLog, inFlight);
    ggs.store.set(QKEY, serverLog);
    const part = (label, x) => (x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`);
    if (active) ggs.status(active.id, `Today: ${part('rounds', Q.left(log, 'normal', caps.normal))} · ${part('high quality', Q.left(log, 'hq', caps.hq))}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    serverLog = ggs.store.get(QKEY, {});
    saveLog();
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      if (active) ggs.status(active.id, 'Server not reachable');
      ggs.debug('redraw: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  const allowed = mode => Q.left(log, mode, caps[mode]).left > 0;
  const stats = { uploads: 0, tiles: 0, swapped: 0 };
  ggs.redraw = { debug: () => ({ active: active && { id: active.id, style: active.style }, tiles: ggs.tiles.count(), ...stats,
    gens: [...gens].map(([id, g]) => ({ id, image: !!g.image, pending: g.pending.length, error: g.error?.message ?? null })) }) };

  // Cancelled: the request is aborted (the server may still finish and count it if it had
  // already reached the image API), its tiles get their real pictures back, and coming
  // back to that panorama generates it again.
  function cancel(key, g) {
    gens.delete(key);
    g.ctrl.abort();
    g.error = new Error('cancelled');
    inFlight[g.mode] = inFlight[g.mode].filter(t => t !== g.t0);
    saveLog();
    progressDone(false, key);
    flush(g).then(() => ggs.tiles.repaint(key.split('/')[0]));
    ggs.debug(`${active?.style}: cancelled ${key}`);
  }
  function generation(id) {
    const mode = modeOf(active.cfg), style = active.style, key = `${id}/${style}/${mode}`;
    if (gens.has(key)) return gens.get(key);
    const g = { image: null, pending: [], error: null, ctrl: new AbortController(), mode, t0: Date.now() };
    gens.set(key, g);
    if (gens.size > 20) { const k = gens.keys().next().value; gens.get(k).image?.close?.(); gens.delete(k); }
    const t0 = g.t0;
    inFlight[mode].push(t0); // counted from the start; the server's log takes over once it answers
    saveLog();
    (async () => {
      const ek = etaKey(mode);
      progressStart(eta[ek] ?? ETA_DEFAULT[mode], key);
      const m = await panoMeta(id);
      const r = await server({ pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode, style }, true, g.ctrl.signal);
      if (g.error) return; // cancelled while the server was working
      inFlight[mode] = inFlight[mode].filter(t => t !== t0);
      saveLog(r.log);
      const img = new Image();
      img.src = r.image;
      await img.decode();
      g.image = await createImageBitmap(img);
      ggs.debug(`${style}: generated ${id} (${mode}) in ${(r.ms / 1000).toFixed(1)} s`);
      await flush(g);
      await ggs.tiles.repaint(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      eta[ek] = Math.round((Date.now() - t0) / 1000 * 0.7 + (eta[ek] ?? (Date.now() - t0) / 1000) * 0.3);
      ggs.store.set('ggs-minecraft-eta', eta);
      progressDone(false, key);
    })().catch(err => {
      if (g.error) return; // cancelled: already tidied up
      g.error = err;
      inFlight[mode] = inFlight[mode].filter(t => t !== t0);
      saveLog();
      ggs.log(`${style}: generation failed`, err);
      progressDone(true, key);
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
    const id = k.pano, mode = modeOf(active.cfg), gkey = `${id}/${active.style}/${mode}`;
    if (!gens.has(gkey) && !allowed(mode)) {
      if (limitShownFor !== id) {
        limitShownFor = id;
        const { resetAt } = Q.left(log, mode, caps[mode]);
        notice(`${active.cfg.hq ? 'High quality' : active.label} limit reached for today · back in ${Q.until(resetAt)}`);
      }
      return img;
    }
    const tw = img.naturalWidth || 512, th = img.naturalHeight || 512;
    const g = gens.get(gkey);
    if (!g) { waitFor(id, { rec, img, tw, th }); return blank(tw, th); }
    const m = metaSync.get(id);
    if (g.image && m) return crop(g, m, k.x, k.y, k.z, tw, th);
    if (g.error) return img;
    g.pending.push({ rec, img, tw, th });
    return blank(tw, th);
  }, 0); // one filter for every style; before lying-signs, which then sees a canvas and leaves it alone

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
      } catch (err) { ggs.log('redraw: re-upload failed', err); }
    }
  }

  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      const ctx = blankTile.getContext('2d');
      ctx.fillStyle = '#35507f'; // a calm blue while the picture is on its way (black flickered)
      ctx.fillRect(0, 0, w, h);
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
  // The bar belongs to the latest generation started (`owner`); an older one finishing
  // or failing later leaves it alone.
  let progressTimer = null, owner = null;
  function progressStart(seconds, key) {
    if (!overlay) return;
    owner = key;
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
  function progressDone(failed, key) {
    if (!overlay || (key && key !== owner)) return;
    owner = null;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) { overlay.fill.style.background = '#e03131'; overlay.text.textContent = 'Could not redraw this round'; }
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

  function teardown() {
    active = null; clearTimeout(settleTimer); settleTimer = null; waitingPanos.clear(); clearInterval(progressTimer);
    overlay?.host.remove(); overlay = null; ggs.tiles.replay();
  }
  function start(id, style, label, cfg) {
    if (active) teardown(); // only one redraw script at a time
    active = { id, style, label, cfg };
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div><div class="bar"><div class="fill"></div></div></div>`;
    document.body.append(host);
    overlay = { host, text: root.querySelector('.text'), bar: root.querySelector('.bar'), fill: root.querySelector('.fill') };
    loadQuota().finally(() => ggs.tiles.replay());
    return {
      stop() { if (active?.id === id) teardown(); },
      update(c) {
        if (active?.id !== id) return;
        const codeChanged = c.code !== active.cfg.code, hqChanged = !!c.hq !== !!active.cfg.hq;
        active.cfg = c;
        if (codeChanged) loadQuota();
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }
  Object.assign(ggs.redraw, { script: (id, style, label) => ({ start: cfg => start(id, style, label, cfg) }) });
})();
