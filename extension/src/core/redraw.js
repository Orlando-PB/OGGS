// Redrawn world (Minecraft world). Each panorama is redrawn once by server/minecraft.php
// and wrapped back over the Street View sphere. ggs.redraw.script(id, style, label) makes
// the { start, prepare } for the script.
//
// Street View tiles arrive through ggs.tiles (core/tiles.js). The first tile of a new
// panorama starts one generation. The panorama id and size go to SERVER, which fetches the
// tiles from Google, stitches them and calls the image API with the key it holds.
// Nothing but that id, the size, a random per-install client id and the optional code
// leaves the page. Tiles go up blue until the picture is back. Then every tile is swapped
// for the matching crop, so looking around and zooming never generate again.
// Generation waits until the panorama has stayed still for a moment. Walking through several
// positions only redraws the one you stop at, and the others get their real tiles back.
// prepare(cfg) (Chaos mode) quietly generates the panorama on screen before the script is
// switched on, so its tiles can go straight up when it is.
// The loading bar is core/redraw-bar.js.
(() => {
  const ggs = globalThis.__ggs;
  // Holds the prompts, models and daily limits.
  const SERVER = 'https://oggs.orlandopb.com/minecraft.php';

  function clientId() {
    let id = ggs.store.get('ggs-client');
    if (!id) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      ggs.store.set('ggs-client', id);
    }
    return id;
  }
  const code = () => active?.cfg.code || ggs.settings?.minecraft?.code || '';
  // Its errors have `shown` (a message fit for the player) and the server's code ('credit').
  async function server(fields, post = false, signal) {
    const body = new URLSearchParams({ ...fields, client: clientId(), code: code() });
    const req = post ? fetch(SERVER, { method: 'POST', body, signal }) : fetch(`${SERVER}?caps=1&${body}`);
    const r = await req.catch(err => {
      throw err.name === 'AbortError'
        ? err
        : Object.assign(new Error('Server not reachable'), { shown: true });
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const msg = j.error || `Server error (HTTP ${r.status})`;
      throw Object.assign(new Error(msg), { code: j.code, shown: true });
    }
    return j;
  }

  // Typical seconds per generation, from the last rounds. Drives the loading bar.
  const ETA_DEFAULT = { normal: 15, hq: 25 };
  const eta = ggs.store.get('ggs-minecraft-eta', {});
  const etaKey = (style, mode) => (style === 'minecraft' ? mode : `${style}/${mode}`);
  const etaOf = (style, mode) => eta[etaKey(style, mode)] ?? ETA_DEFAULT[mode];
  const keyOf = id => `${id}/${active.style}/${modeOf(active.cfg)}`;

  // panoId -> Promise<{ worldWidth, tileWidth, zmax }>. metaSync holds the resolved values.
  const meta = new Map();
  const metaSync = new Map();
  function panoMeta(id) {
    if (!meta.has(id)) {
      meta.set(
        id,
        new window.google.maps.StreetViewService().getPanorama({ pano: id }).then(({ data }) => {
          const worldWidth = data.tiles.worldSize.width;
          const tileWidth = data.tiles.tileSize.width;
          const m = { worldWidth, tileWidth, zmax: Math.ceil(Math.log2(worldWidth / tileWidth)) };
          metaSync.set(id, m);
          return m;
        }),
      );
    }
    return meta.get(id);
  }
  const widthAt = (m, zoom) => Math.ceil(m.worldWidth / 2 ** (m.zmax - zoom));

  // `${panoId}/${style}/${mode}` -> { image, pending: [uploads waiting], error, ctrl, mode, t0 }
  const gens = new Map();
  // active is { id, style, label, cfg } while a script is on.
  let active = null;
  const bar = ggs.redrawBar;
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => panos.add(p));
  function shownPano() {
    for (const p of panos) {
      try {
        const id = p.getPano();
        if (id) return id;
      } catch {}
    }
    return null;
  }

  // Tiles of a panorama with no generation yet wait here, blue on screen, until the view has
  // stayed on one panorama for SETTLE ms. Then that panorama is generated and the others get
  // their real tiles back.
  const SETTLE = 800;
  // panoId -> [{ rec, img, tw, th }]
  const waitingPanos = new Map();
  let settleTimer = null;
  let latestPano = null;
  function waitFor(id, entry) {
    if (!waitingPanos.has(id)) waitingPanos.set(id, []);
    // The bar shows from the first blue tile.
    bar.start(etaOf(active.style, modeOf(active.cfg)), keyOf(id));
    waitingPanos.get(id).push(entry);
    if (id !== latestPano || !settleTimer) {
      latestPano = id;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settled, SETTLE);
    }
  }
  function settled() {
    settleTimer = null;
    const id = shownPano() ?? latestPano;
    cancelAwayFrom(id);
    for (const [pid, entries] of [...waitingPanos]) {
      waitingPanos.delete(pid);
      if (pid === id && active) queueFor(pid, entries);
      else passThrough(pid, entries);
    }
  }
  // Cancel generations still in flight for panoramas you've moved away from.
  function cancelAwayFrom(id) {
    for (const [key, g] of gens) {
      if (g.ctrl && !g.image && !g.error && !key.startsWith(`${id}/`)) cancel(key, g);
    }
  }
  function queueFor(id, entries) {
    const g = generation(id);
    g.pending.push(...entries);
    if (g.image || g.error) flush(g);
  }
  // Passed through, so never generated.
  function passThrough(id, entries) {
    for (const { rec, img } of entries) {
      try {
        ggs.tiles.upload(rec, img);
      } catch {}
    }
    if (active && bar.owner() === keyOf(id)) bar.hide();
  }

  // ---- daily limits ----
  // The server counts per client id, and its log ({ normal: [ms], hq: [ms] }, rolling 24 h)
  // is the truth. A copy is kept here so a round isn't started once today's limit is used up.
  // Generations in flight are added on top until the server's answer, which includes them,
  // replaces the copy. So nothing is counted twice.
  const DAY = 24 * 3600 * 1000;
  const QKEY = 'ggs-minecraft-quota';
  const Q = {
    tidy(log, other) {
      const now = Date.now();
      const out = {};
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
  let serverLog = {};
  let log = {};
  let caps = { normal: 100, hq: 10 };
  let limitShownFor = null;
  // t0 of generations the server hasn't answered yet.
  const inFlight = { normal: [], hq: [] };
  function saveLog(fromServer) {
    if (fromServer) serverLog = Q.tidy(fromServer);
    log = Q.tidy(serverLog, inFlight);
    ggs.store.set(QKEY, serverLog);
    const part = (label, x) =>
      x.left > 0 ? `${x.left} ${label}` : `${label}: back in ${Q.until(x.resetAt)}`;
    if (!active) return;
    const normal = part('rounds', Q.left(log, 'normal', caps.normal));
    const hq = part('high quality', Q.left(log, 'hq', caps.hq));
    ggs.status(active.id, `Today: ${normal} · ${hq}${caps.codeOk ? ' · code accepted' : ''}`);
  }
  async function loadQuota() {
    serverLog = ggs.store.get(QKEY, {});
    saveLog();
    try {
      caps = await server({});
      saveLog(caps.log);
    } catch (err) {
      if (active) ggs.status(active.id, err.shown ? err.message : 'Server not reachable');
      ggs.debug('redraw: caps', err);
    }
  }
  const modeOf = cfg => (cfg.hq ? 'hq' : 'normal');
  // A mode whose AI account is out of credit is left alone until the server's pause is over,
  // so the player gets the real Street View instead of a blue wait and an error each round.
  const PAUSE_MS = 15 * 60 * 1000;
  const pausedUntil = { normal: 0, hq: 0 };
  const paused = mode => pausedUntil[mode] > Date.now();
  const allowed = mode => !paused(mode) && Q.left(log, mode, caps[mode]).left > 0;
  const stats = { uploads: 0, tiles: 0, swapped: 0 };
  ggs.redraw = {
    debug: () => ({
      active: active && { id: active.id, style: active.style },
      tiles: ggs.tiles.count(),
      ...stats,
      gens: [...gens].map(([id, g]) => ({
        id,
        image: !!g.image,
        pending: g.pending.length,
        error: g.error?.message ?? null,
      })),
    }),
  };

  // Aborts the request. The server may still finish and count it if it had already reached
  // the image API. The tiles get their real pictures back, and coming back to that panorama
  // generates it again.
  function cancel(key, g) {
    gens.delete(key);
    g.ctrl.abort();
    g.error = new Error('cancelled');
    inFlight[g.mode] = inFlight[g.mode].filter(t => t !== g.t0);
    saveLog();
    bar.done(false, key);
    flush(g).then(() => ggs.tiles.repaint(key.split('/')[0]));
    ggs.debug(`${active?.style}: cancelled ${key}`);
  }
  function generation(id, style = active.style, mode = modeOf(active.cfg)) {
    const key = `${id}/${style}/${mode}`;
    if (gens.has(key)) return gens.get(key);
    const g = { image: null, pending: [], error: null, ctrl: new AbortController(), mode, t0: Date.now() };
    gens.set(key, g);
    if (gens.size > 20) {
      const k = gens.keys().next().value;
      gens.get(k).image?.close?.();
      gens.delete(k);
    }
    const t0 = g.t0;
    // Counted from the start. The server's log takes over once it answers.
    inFlight[mode].push(t0);
    saveLog();
    (async () => {
      const ek = etaKey(style, mode);
      bar.start(etaOf(style, mode), key, t0);
      const m = await panoMeta(id);
      const fields = { pano: id, worldWidth: m.worldWidth, tileWidth: m.tileWidth, mode, style };
      const r = await server(fields, true, g.ctrl.signal);
      // Cancelled while the server was working.
      if (g.error) return;
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
      const took = (Date.now() - t0) / 1000;
      eta[ek] = Math.round(took * 0.7 + (eta[ek] ?? took) * 0.3);
      ggs.store.set('ggs-minecraft-eta', eta);
      bar.done(false, key);
    })().catch(err => {
      // Cancelled, and already tidied up.
      if (g.error) return;
      g.error = err;
      inFlight[mode] = inFlight[mode].filter(t => t !== t0);
      saveLog();
      ggs.log(`${style}: generation failed`, err);
      if (err.code === 'credit') pausedUntil[mode] = Date.now() + PAUSE_MS;
      bar.done(true, key, err.shown ? err.message : 'Could not redraw this round');
      // Puts the real tiles back.
      flush(g).then(() => ggs.tiles.repaint(id));
    });
    return g;
  }

  // Crop of the generated picture for tile x,y at this zoom.
  function crop(g, m, x, y, zoom, tw, th) {
    const W = widthAt(m, zoom);
    const H = Math.ceil(W / 2);
    const img = g.image;
    const sx = ((x * tw) / W) * img.width;
    const sy = ((y * th) / H) * img.height;
    const sw = Math.min(img.width - sx, (tw / W) * img.width);
    const sh = Math.min(img.height - sy, (th / H) * img.height);
    const c = new OffscreenCanvas(tw, th);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (sw > 0 && sh > 0) {
      const dw = (tw * sw) / ((tw / W) * img.width);
      const dh = (th * sh) / ((th / H) * img.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    }
    return c;
  }

  // ---- tile filter: what goes into WebGL for each tile ----
  // One filter for every style, at order 0. lying-signs runs after it, sees a canvas and
  // leaves it alone.
  ggs.tiles.filter((rec, source) => {
    stats.uploads++;
    if (!active || !rec.key || !(source instanceof HTMLImageElement)) return source;
    stats.tiles++;
    const id = rec.key.pano;
    const mode = modeOf(active.cfg);
    const g = gens.get(`${id}/${active.style}/${mode}`);
    if (!g && !allowed(mode)) {
      showLimit(id, mode);
      return source;
    }
    const entry = { rec, img: source, tw: source.naturalWidth || 512, th: source.naturalHeight || 512 };
    if (!g) {
      waitFor(id, entry);
      return blank(entry.tw, entry.th);
    }
    return tileFrom(g, entry);
  }, 0);

  // Today's limit is used up, or the AI account is out of credit: says so once per panorama,
  // and the real tiles go up.
  function showLimit(id, mode) {
    if (limitShownFor === id) return;
    limitShownFor = id;
    const what = active.cfg.hq ? 'High quality' : active.label;
    if (paused(mode))
      return bar.notice(`${what} can't be used right now · try again in ${Q.until(pausedUntil[mode])}`);
    const { resetAt } = Q.left(log, mode, caps[mode]);
    bar.notice(`${what} limit reached for today · back in ${Q.until(resetAt)}`);
  }

  // A tile of a panorama with a generation: its crop, the real tile if it failed, or blue
  // while it's on its way.
  function tileFrom(g, entry) {
    const { rec, img, tw, th } = entry;
    const m = metaSync.get(rec.key.pano);
    if (g.image && m) return crop(g, m, rec.key.x, rec.key.y, rec.key.z, tw, th);
    if (g.error) return img;
    g.pending.push(entry);
    return blank(tw, th);
  }

  // The picture is in, or failed. Pushes the crops, or the real tiles, into the textures.
  async function flush(g) {
    const recs = g.pending.splice(0);
    if (!recs.length) return;
    const id = recs[0].rec.key.pano;
    const m = g.image ? await panoMeta(id).catch(() => null) : null;
    for (const entry of recs) reupload(g, m, entry);
  }
  function reupload(g, m, { rec, img, tw, th }) {
    try {
      const k = rec.key;
      if (ggs.tiles.upload(rec, m ? crop(g, m, k.x, k.y, k.z, tw, th) : img)) stats.swapped++;
    } catch (err) {
      ggs.log('redraw: re-upload failed', err);
    }
  }

  let blankTile = null;
  function blank(w, h) {
    if (!blankTile || blankTile.width !== w || blankTile.height !== h) {
      blankTile = new OffscreenCanvas(w, h);
      const ctx = blankTile.getContext('2d');
      // A calm blue while the picture is on its way. Black flickered.
      ctx.fillStyle = '#35507f';
      ctx.fillRect(0, 0, w, h);
    }
    return blankTile;
  }

  function teardown() {
    active = null;
    clearTimeout(settleTimer);
    settleTimer = null;
    waitingPanos.clear();
    bar.remove();
    ggs.tiles.replay();
  }
  // Starts a generation ahead for the panorama on screen. Returns { ready(), failed(), cancel() },
  // or null when there's nothing to start (no panorama, today's limit used).
  function prepare(style, cfg) {
    const id = shownPano();
    const mode = modeOf(cfg);
    const key = `${id}/${style}/${mode}`;
    if (active || !id || !allowed(mode)) return null;
    const g = generation(id, style, mode);
    return {
      // Moved on: it starts the usual way.
      ready: () => !!(g.image || g.error) || shownPano() !== id,
      // e.g. the server's limit.
      failed: () => !!g.error,
      cancel: () => {
        if (!active && !g.image && !g.error && gens.get(key) === g) cancel(key, g);
      },
    };
  }
  function start(id, style, label, cfg) {
    // Only one redraw script at a time.
    if (active) teardown();
    active = { id, style, label, cfg };
    bar.show();
    // A picture made ahead (prepare) goes up at once. One still on its way (made ahead, or
    // left running by switching off and on) gets the bar from when it started. The tiles go
    // through at once on the local copy of today's limits. The server checks them anyway,
    // and its answer comes in behind.
    const key = keyOf(shownPano());
    const g = gens.get(key);
    if (g && !g.image && !g.error) bar.start(etaOf(style, g.mode), key, g.t0);
    loadQuota();
    ggs.tiles.replay();
    return {
      stop() {
        if (active?.id === id) teardown();
      },
      update(c) {
        if (active?.id !== id) return;
        const codeChanged = c.code !== active.cfg.code;
        const hqChanged = !!c.hq !== !!active.cfg.hq;
        active.cfg = c;
        if (codeChanged) loadQuota();
        if (hqChanged) ggs.tiles.replay();
      },
    };
  }
  Object.assign(ggs.redraw, {
    script: (id, style, label) => ({
      start: cfg => start(id, style, label, cfg),
      prepare: cfg => prepare(style, cfg),
    }),
  });
})();
