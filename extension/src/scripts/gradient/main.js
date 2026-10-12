// Senegal gradient: every Street View tile (via ggs.tiles, core/tiles.js) is shrunk to a
// handful of cells and scaled back up, so the view is a smooth colour gradient. A tile
// is shrunk together with its eight neighbours (mirrored copies stand in for ones not
// loaded yet) so the gradient runs across tile edges; when a neighbour arrives the
// tiles around it are redone and re-uploaded into the same textures.
(() => {
  const ggs = globalThis.__ggs;
  const KEEP = 2;                             // panoramas whose tiles are remembered
  let active = null;

  // Cells per tile for the strength setting, made the same size on screen at every zoom:
  // one zoom step in halves the angle a tile covers, so it gets half the cells.
  function cells(z, size) {
    const base = 2 ** (10 - active.strength);         // cells across a zoom-3 (45°) tile
    return Math.max(1, Math.min(size, Math.round(base * 2 ** (3 - z))));
  }

  // pano id -> Map of "z/x/y" -> { rec, src }; oldest panorama dropped past KEEP
  const panos = new Map();
  function store(k) {
    let m = panos.get(k.pano);
    if (!m) {
      m = new Map();
      panos.set(k.pano, m);
      while (panos.size > KEEP) panos.delete(panos.keys().next().value);
    }
    return m;
  }
  const tileId = k => `${k.z}/${k.x}/${k.y}`;

  // Draws the tile with its neighbours in a 3x3 grid (mirrored copies where a neighbour is
  // missing, so the edges never fade to black), shrinks the grid to 3n x 3n cells, scales
  // it back up, blurs the creases between cells and keeps the middle tile.
  const grid = new OffscreenCanvas(1, 1), small = new OffscreenCanvas(1, 1), big = new OffscreenCanvas(1, 1);
  function melt(k, src, tiles) {
    const w = src.width || src.naturalWidth || 512, h = src.height || src.naturalHeight || 512;
    if (grid.width !== 3 * w || grid.height !== 3 * h) { grid.width = 3 * w; grid.height = 3 * h; big.width = 3 * w; big.height = 3 * h; }
    const g = grid.getContext('2d');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = dx || dy ? tiles.get(`${k.z}/${k.x + dx}/${k.y + dy}`) : null;
      const x = (dx + 1) * w, y = (dy + 1) * h;
      if (n) { g.drawImage(n.src, x, y, w, h); continue; }
      g.save();
      g.translate(x + (dx ? w : 0), y + (dy ? h : 0));
      g.scale(dx ? -1 : 1, dy ? -1 : 1);
      g.drawImage(src, 0, 0, w, h);
      g.restore();
    }
    const n = cells(k.z, w);
    small.width = 3 * n; small.height = 3 * n;
    const s = small.getContext('2d');
    s.imageSmoothingQuality = 'high';
    // shrink in halves: one big step skips pixels and speckles the colours
    let cur = grid, cw = grid.width, ch = grid.height;
    while (cw > 6 * n) {
      const half = new OffscreenCanvas(cw >> 1, ch >> 1), hc = half.getContext('2d');
      hc.imageSmoothingQuality = 'high';
      hc.drawImage(cur, 0, 0, cw, ch, 0, 0, half.width, half.height);
      cur = half; cw = half.width; ch = half.height;
    }
    s.drawImage(cur, 0, 0, cw, ch, 0, 0, 3 * n, 3 * n);
    const b = big.getContext('2d');
    b.imageSmoothingQuality = 'high';
    b.filter = `blur(${Math.min(48, w / n / 3)}px)`;
    b.drawImage(small, 0, 0, 3 * w, 3 * h);
    b.filter = 'none';
    const out = new OffscreenCanvas(w, h);
    out.getContext('2d').drawImage(big, w, h, w, h, 0, 0, w, h);
    return out;
  }

  // Neighbours of tiles that just arrived get redone once things settle.
  const dirty = new Map();                    // "pano/z/x/y" -> { k, tiles }
  let timer = null;
  function touchNeighbours(k, tiles) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nk = { pano: k.pano, z: k.z, x: k.x + dx, y: k.y + dy };
      if (tiles.has(tileId(nk))) dirty.set(`${k.pano}/${tileId(nk)}`, { k: nk, tiles });
    }
    clearTimeout(timer);
    timer = setTimeout(redo, 80);
  }
  function redo() {
    timer = null;
    const todo = [...dirty.values()];
    dirty.clear();
    if (!active) return;
    let pano = null;
    for (const { k, tiles } of todo) {
      const t = tiles.get(tileId(k));
      if (!t || !ggs.tiles.live(t.rec)) continue;
      try { if (ggs.tiles.upload(t.rec, melt(k, t.src, tiles))) pano = k.pano; } catch (err) { ggs.log('gradient: re-upload failed', err); }
    }
    if (pano) ggs.tiles.repaint(pano);
  }

  ggs.tiles.filter((rec, source) => {
    if (!active || !rec.key) return source;
    const k = rec.key, tiles = store(k);
    tiles.set(tileId(k), { rec, src: source });
    touchNeighbours(k, tiles);
    return melt(k, source, tiles);
  }, 2); // after minecraft and lying-signs, so their tiles melt too

  function start(cfg) {
    active = cfg;
    ggs.debug('gradient on', cfg);
    ggs.tiles.replay();
    return {
      stop() { active = null; clearTimeout(timer); timer = null; dirty.clear(); panos.clear(); ggs.tiles.replay(); },
      update(next) {
        const changed = next.strength !== active.strength;
        active = next;
        if (changed) ggs.tiles.replay();
      },
    };
  }
  ggs.scripts.gradient = { start };
})();
