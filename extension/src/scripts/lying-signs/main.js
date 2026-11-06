// Lying signs: text on every Street View tile (via ggs.tiles, core/tiles.js) is found by a
// detector in a worker (detector.js runs worker.js: PP-OCRv4 on onnxruntime-web, loaded from
// ggs.extBase), painted over, and replaced with new text in another script, language or
// Minecraft glyphs (edit.js, erase.js, text.js; word lists in words.js). A blurred tile shows
// while the detector works, then the edit replaces it in the same texture. This file keeps
// track of the signs found and the tiles on screen, and starts and stops the script.
(() => {
  const ggs = globalThis.__ggs;
  const ls = ggs.lyingSigns;
  const { stats, hash, blurred, editSync, loadDetector, detect } = ls;

  let active = null; // cfg while the script is on

  // ---- signs ----
  // Every text box found in a panorama, at any zoom, in panorama units (1 = its width), with
  // what was decided about it: skipped or not, letter height, colour, the word written.
  // A sign found at one zoom is drawn into the tiles of every zoom on screen, so zooming in
  // or out shows the same words.
  const signs = new Map(); // pano -> [sign]
  const detectedTiles = new Set(); // "pano/z/x/y" the detector has run on
  const tileId = k => `${k.pano}/${k.z}/${k.x}/${k.y}`;
  const MAX_PANOS = 20;

  function toTile(sg, k, W) {
    const u = W * 2 ** k.z;
    return {
      cx: sg.cx * u - k.x * W,
      cy: sg.cy * u - k.y * W,
      w: sg.w * u,
      h: sg.h * u,
      angle: sg.angle,
      vertical: sg.vertical,
      sign: sg,
    };
  }
  function toPano(b, k, W) {
    const u = W * 2 ** k.z;
    return {
      cx: (k.x * W + b.cx) / u,
      cy: (k.y * W + b.cy) / u,
      w: b.w / u,
      h: b.h / u,
      angle: b.angle,
      vertical: b.vertical,
      words: {},
    };
  }
  function touches(sg, k, W) {
    const b = toTile(sg, k, W);
    const r = Math.hypot(b.w, b.h) / 2;
    return b.cx + r > 0 && b.cy + r > 0 && b.cx - r < W && b.cy - r < W;
  }
  const signsIn = (k, W) =>
    (signs.get(k.pano) || []).filter(sg => touches(sg, k, W)).map(sg => toTile(sg, k, W));

  // Adds a tile's detections, biggest first. A known sign wins, as it may span tiles, unless a
  // new box is bigger and covers its middle (the other zoom only saw a sliver of it).
  function addSigns(k, W, found) {
    const list = panoSigns(k.pano);
    const added = [];
    const removed = [];
    for (const b of found.slice().sort((a, c) => c.w * c.h - a.w * a.h)) {
      const sg = toPano(b, k, W);
      const smaller = list.filter(o => inside(o, sg) && sg.w * sg.h > o.w * o.h);
      if (list.some(o => !smaller.includes(o) && inside(sg, o))) continue;
      for (const o of smaller) {
        list.splice(list.indexOf(o), 1);
        removed.push(o);
      }
      sg.seed = hash(`${k.pano}:${Math.round(sg.cx * 4096)}:${Math.round(sg.cy * 4096)}`);
      list.push(sg);
      added.push(sg);
    }
    return { added, removed };
  }
  // The panorama's sign list, made if new; the oldest panorama is forgotten past MAX_PANOS.
  function panoSigns(pano) {
    if (!signs.has(pano)) {
      signs.set(pano, []);
      if (signs.size > MAX_PANOS) forget(signs.keys().next().value);
    }
    return signs.get(pano);
  }
  function forget(pano) {
    signs.delete(pano);
    for (const id of detectedTiles) if (id.startsWith(`${pano}/`)) detectedTiles.delete(id);
  }
  // whether b's middle is inside box a
  function inside(b, a) {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const c = Math.cos(a.angle);
    const s = Math.sin(a.angle);
    return Math.abs(dx * c + dy * s) < a.w / 2 && Math.abs(-dx * s + dy * c) < a.h / 2;
  }
  // Known well enough to edit without waiting: the detector ran on this tile, on its parent
  // or grandparent, or on all its children (or grandchildren).
  function covered(k) {
    if (detectedTiles.has(tileId(k))) return true;
    for (let up = 1; up <= 2; up++) {
      const f = 2 ** up;
      const parent = { pano: k.pano, z: k.z - up, x: Math.floor(k.x / f), y: Math.floor(k.y / f) };
      if (detectedTiles.has(tileId(parent))) return true;
    }
    return kidsCovered(k, 2);
  }
  function kidsCovered(k, depth) {
    if (depth === 0) return false;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const c = { pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy };
        if (!detectedTiles.has(tileId(c)) && !kidsCovered(c, depth - 1)) return false;
      }
    return true;
  }

  // ---- tiles ----
  // url -> { key, img, canvas, cfg, recs: [upload records], drawn: Set of signs }
  const tiles = new Map();

  // What goes into WebGL for this tile: the edit if the area is known, otherwise a blur while
  // the detector works. Tiles another script already swapped for a canvas are left alone.
  ggs.tiles.filter((rec, img) => {
    if (!active || !(img instanceof HTMLImageElement)) return img;
    const k = ggs.tileKey(rec.url);
    if (!k) return img;
    const t = track(rec, img, k);
    if (!detectedTiles.has(tileId(k)) && !t.queued) queueDetect(t, rec.url);
    if (t.canvas && t.cfg === active) return t.canvas;
    if (covered(k)) {
      editTile(t);
      return t.canvas;
    }
    t.canvas = null;
    return blurred(img);
  }, 1);

  // The tile's record, made if new, with this upload added to it.
  function track(rec, img, k) {
    let t = tiles.get(rec.url);
    if (!t) {
      t = { key: k, img, canvas: null, cfg: null, recs: [], drawn: new Set() };
      tiles.set(rec.url, t);
      if (tiles.size > 800) tiles.delete(tiles.keys().next().value);
      stats.seen++;
    }
    t.img = img;
    t.recs = t.recs.filter(ggs.tiles.live);
    t.recs.push(rec);
    return t;
  }

  function queueDetect(t, url) {
    const k = t.key;
    const W = t.img.naturalWidth || t.img.width;
    t.queued = true;
    detect(t.img, () => t.recs.some(ggs.tiles.live), url).then(found => {
      t.queued = false;
      if (!found) return; // skipped or failed; a later upload retries
      detectedTiles.add(tileId(k));
      stats.boxes += found.length;
      const { added, removed } = addSigns(k, W, found);
      if (!active) return;
      // it was showing the blur
      if (!t.canvas || t.cfg !== active) {
        editTile(t);
        upload(t);
      }
      refresh(k.pano, added, removed, t);
    });
  }

  // The whole tile from the original, with every known sign; or, with `more`, just those
  // signs drawn onto the edit already there.
  function editTile(t, more) {
    const W = t.img.naturalWidth || t.img.width;
    const boxes = more ? more.map(sg => toTile(sg, t.key, W)) : signsIn(t.key, W);
    if (!more) t.drawn = new Set();
    t.canvas = editSync(t.img, boxes, active, t.key, more ? t.canvas : null);
    for (const b of boxes) t.drawn.add(b.sign);
    t.cfg = active;
  }
  // New signs in a panorama are drawn into every edited tile they touch, at any zoom, and
  // those tiles go to WebGL again. A tile that drew a since-replaced sign is redone. The tile
  // just detected (`now`) is done at once, the rest a few at a time in idle time, so a burst
  // of detections never stalls a frame.
  const stale = new Map(); // tile -> Set of signs to add, or 'all' to redo it
  let draining = false;
  function refresh(pano, added, removed, now) {
    for (const t of tiles.values()) {
      if (t.key.pano === pano && t.canvas && t.cfg === active) markStale(t, added, removed);
    }
    if (stale.has(now)) redo(now);
    drain();
  }
  function markStale(t, added, removed) {
    if (removed.some(sg => t.drawn.has(sg))) {
      stale.set(t, 'all');
      return;
    }
    if (stale.get(t) === 'all') return;
    const W = t.img.naturalWidth || t.img.width;
    const mine = added.filter(sg => touches(sg, t.key, W) && !t.drawn.has(sg));
    if (!mine.length) return;
    if (!stale.has(t)) stale.set(t, new Set());
    for (const sg of mine) stale.get(t).add(sg);
  }
  function redo(t) {
    const job = stale.get(t);
    stale.delete(t);
    if (!t.canvas || t.cfg !== active) return;
    if (job === 'all') editTile(t);
    else {
      const more = [...job].filter(sg => !t.drawn.has(sg));
      if (!more.length) return;
      editTile(t, more);
    }
    upload(t);
  }
  const idle = () =>
    new Promise(res =>
      window.requestIdleCallback
        ? requestIdleCallback(res, { timeout: 200 })
        : setTimeout(() => res({ timeRemaining: () => 8 }), 16),
    );
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (stale.size) {
        const slice = await idle();
        do {
          redo(stale.keys().next().value);
        } while (stale.size && slice.timeRemaining() > 6);
      }
    } finally {
      draining = false;
    }
  }
  function upload(t) {
    t.recs = t.recs.filter(ggs.tiles.live);
    for (const r of t.recs) {
      try {
        if (ggs.tiles.reupload(r, t.canvas, 1)) stats.edited++;
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err);
      }
    }
  }

  ls.debug = () => ({ ...ls.queueState(), tiles: tiles.size, panos: signs.size, stale: stale.size });

  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    loadDetector();
    ggs.tiles.replay();
    return {
      stop() {
        active = null;
        ggs.tiles.replay();
      },
      update(next) {
        const changed = next.script !== active.script;
        active = next;
        if (changed) ggs.tiles.replay();
      },
    };
  }
  ggs.scripts['lying-signs'] = { start };
})();
