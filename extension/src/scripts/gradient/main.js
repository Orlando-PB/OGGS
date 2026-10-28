// Senegal gradient: every Street View tile (via core/tiles.js) is shrunk to a handful of cells
// and scaled back up, so the view is a smooth colour gradient. Each tile is shrunk with its eight
// neighbours so the gradient runs across tile edges. When a neighbour arrives, the tiles around
// it are redone and re-uploaded into the same textures.
(() => {
  const ggs = globalThis.__ggs;
  const KEEP = 2; // panoramas whose tiles are remembered
  let active = null;

  // Cells per tile for the strength setting, made the same size on screen at every zoom:
  // one zoom step in halves the angle a tile covers, so it gets half the cells.
  function cells(z, size) {
    const base = 2 ** (10 - active.strength); // cells across a zoom-3 (45°) tile
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

  // Draws the tile with its neighbours in a 3x3 grid, shrinks the grid to 3n x 3n cells, scales
  // it back up, blurs the creases between cells and keeps the middle tile. Missing neighbours
  // are mirrored copies, so the edges never fade to black.
  // To save work, the grid starts at half size when the cells are at least 4 px. A wide blur is
  // drawn small (at least 4 px of blur) and scaled up, which looks the same on a smooth gradient
  // and costs far less GPU time.
  const canvases = new Map(); // "w x h" -> a canvas reused for every tile
  function canvas(w, h, name) {
    const key = `${name} ${w}x${h}`;
    if (!canvases.has(key)) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').imageSmoothingQuality = 'high';
      canvases.set(key, c);
    }
    return canvases.get(key);
  }
  function melt(k, src, tiles) {
    const w = src.width || src.naturalWidth || 512;
    const h = src.height || src.naturalHeight || 512;
    const n = cells(k.z, w);
    const blur = Math.min(48, w / n / 3);
    // grid scale, and the size of a tile in it
    const f = 6 * n <= 1.5 * w ? 0.5 : 1;
    const tw = Math.round(w * f);
    const th = Math.round(h * f);
    const grid = canvas(3 * tw, 3 * th, 'grid');
    const g = grid.getContext('2d');
    g.clearRect(0, 0, grid.width, grid.height);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nb = dx || dy ? tiles.get(`${k.z}/${k.x + dx}/${k.y + dy}`) : null;
      const x = (dx + 1) * tw;
      const y = (dy + 1) * th;
      if (nb) {
        g.drawImage(nb.src, x, y, tw, th);
        continue;
      }
      g.save();
      g.translate(x + (dx ? tw : 0), y + (dy ? th : 0));
      g.scale(dx ? -1 : 1, dy ? -1 : 1);
      g.drawImage(src, 0, 0, tw, th);
      g.restore();
    }
    // shrink in halves: one big step skips pixels and speckles the colours
    let cur = grid;
    let cw = grid.width;
    let ch = grid.height;
    while (cw > 6 * n) {
      const half = canvas(cw >> 1, ch >> 1, 'half');
      half.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, half.width, half.height);
      cur = half;
      cw = half.width;
      ch = half.height;
    }
    const small = canvas(3 * n, 3 * n, 'small');
    small.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, 3 * n, 3 * n);
    const q = Math.min(1, 4 / blur);
    const bw = Math.round(3 * w * q);
    const bh = Math.round(3 * h * q);
    const big = canvas(bw, bh, 'big');
    const b = big.getContext('2d');
    b.clearRect(0, 0, bw, bh);
    b.filter = `blur(${blur * q}px)`;
    b.drawImage(small, 0, 0, bw, bh);
    b.filter = 'none';
    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(big, bw / 3, bh / 3, bw / 3, bh / 3, 0, 0, w, h);
    return out;
  }

  // Neighbours of tiles that just arrived get redone once things settle.
  const dirty = new Map(); // "pano/z/x/y" -> { k, tiles }
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
  // A few tiles per frame, so the game keeps drawing (a replay can leave hundreds dirty at once).
  // Tiles that turn dirty meanwhile join the same pass.
  const PER_FRAME = 4, SLICE = 8;
  let redoing = false;
  const nextFrame = () => new Promise(r =>
    (document.hidden ? setTimeout(r) : requestAnimationFrame(() => setTimeout(r))));
  async function redo() {
    timer = null;
    if (redoing) return;
    redoing = true;
    let pano = null;
    let done = 0;
    let t0 = performance.now();
    let painted = t0;
    try {
      while (active && dirty.size) {
        const [id, { k, tiles }] = dirty.entries().next().value;
        dirty.delete(id);
        const t = tiles.get(tileId(k));
        if (!t || !ggs.tiles.live(t.rec)) continue;
        try {
          if (ggs.tiles.upload(t.rec, melt(k, t.src, tiles))) pano = k.pano;
        } catch (err) {
          ggs.log('gradient: re-upload failed', err);
        }
        if (++done < PER_FRAME && performance.now() - t0 < SLICE) continue;
        if (pano && performance.now() - painted > 150) {
          painted = performance.now();
          ggs.tiles.repaint(pano);
          pano = null;
        }
        await nextFrame();
        done = 0;
        t0 = performance.now();
      }
    } finally {
      redoing = false;
    }
    if (pano) ggs.tiles.repaint(pano);
  }

  ggs.tiles.filter((rec, source) => {
    if (!active || !rec.key) return source;
    const k = rec.key;
    const tiles = store(k);
    tiles.set(tileId(k), { rec, src: source });
    touchNeighbours(k, tiles);
    return melt(k, source, tiles);
  }, 2); // after minecraft and lying-signs, so their tiles melt too

  function start(cfg) {
    active = cfg;
    ggs.debug('gradient on', cfg);
    ggs.tiles.replay();
    return {
      stop() {
        active = null;
        clearTimeout(timer);
        timer = null;
        dirty.clear();
        panos.clear();
        ggs.tiles.replay();
      },
      update(next) {
        const changed = next.strength !== active.strength;
        active = next;
        if (changed) ggs.tiles.replay();
      },
    };
  }
  ggs.scripts.gradient = { start };
})();
