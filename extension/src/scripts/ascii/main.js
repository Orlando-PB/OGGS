// ASCII cam: every Street View tile (via core/tiles.js) is redrawn as text. The tile is shrunk
// to one pixel per character cell and each cell gets a character by its brightness: black on
// white, or coloured on a dark background.
// Only the picture uploaded to WebGL changes. Nothing is read from or sent anywhere.
// prepare(cfg) draws the panorama on screen ahead (core/tiles.js prerender), for Chaos mode.
(() => {
  const ggs = globalThis.__ggs;
  const RAMP = ' .:-=+*#%@'; // darkest to brightest
  const ACROSS = 64; // characters across a zoom-3 (45°) tile
  const BG = '#0b0a12', PAPER = '#ffffff', INK = '#111111';
  let active = null;
  let pre = null; // { look, tiles } drawn ahead by prepare

  // Characters per tile, the same size on screen at every zoom: one zoom step in halves the
  // angle a tile covers, so it gets half the characters. At least 4 px each.
  const across = (z, w) => Math.max(2, Math.min(w / 4, Math.round(ACROSS * 2 ** (3 - z))));

  // White characters, one per RAMP entry, side by side in a strip. Made once per cell size.
  const atlases = new Map();
  function atlas(cw, ch) {
    const key = `${cw}x${ch}`;
    if (atlases.has(key)) return atlases.get(key);
    const a = new OffscreenCanvas(Math.ceil(cw) * RAMP.length, Math.ceil(ch));
    const g = a.getContext('2d');
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(ch * 0.92)}px ui-monospace, Menlo, Consolas, monospace`;
    [...RAMP].forEach((c, i) => g.fillText(c, (i + 0.5) * Math.ceil(cw), ch / 2));
    if (atlases.size > 12) atlases.clear();
    atlases.set(key, a);
    return a;
  }

  const small = new OffscreenCanvas(1, 1);
  function draw(source, z, look = active.look) {
    const w = source.width || source.naturalWidth || 512;
    const h = source.height || source.naturalHeight || 512;
    const nx = across(z, w);
    const cw = w / nx;
    const ny = Math.max(1, Math.round(h / (cw * 1.6))); // characters are taller than wide
    const ch = h / ny;
    small.width = nx;
    small.height = ny;
    const s = small.getContext('2d', { willReadFrequently: true });
    s.imageSmoothingQuality = 'high';
    s.drawImage(source, 0, 0, nx, ny);
    const px = s.getImageData(0, 0, nx, ny).data;

    // characters drawn once, then coloured (source-in keeps only the glyphs)
    const paper = look === 'white';
    const glyphs = new OffscreenCanvas(w, h);
    const g = glyphs.getContext('2d');
    const strip = atlas(cw, ch);
    const sw = Math.ceil(cw);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = (y * nx + x) * 4;
      let light = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (paper) light = 1 - light; // black on white: dark cells get the dense characters
      const c = Math.min(RAMP.length - 1, Math.round(light ** 0.8 * (RAMP.length - 1)));
      if (c) g.drawImage(strip, c * sw, 0, sw, strip.height, x * cw, y * ch, cw, ch);
    }
    g.globalCompositeOperation = 'source-in';
    if (paper) {
      g.fillStyle = INK;
      g.fillRect(0, 0, w, h);
    } else {
      g.imageSmoothingEnabled = false;
      g.filter = 'saturate(1.3) brightness(1.6)'; // dim cells would vanish on the dark background
      g.drawImage(small, 0, 0, w, h);
    }

    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.fillStyle = paper ? PAPER : BG;
    o.fillRect(0, 0, w, h);
    o.drawImage(glyphs, 0, 0);
    return out;
  }

  // A tile drawn ahead is used only while it's still a plain picture. An earlier filter that
  // changes a tile hands on a canvas instead.
  const ahead = (rec, source) =>
    (pre?.look === active.look && source instanceof HTMLImageElement ? pre.tiles.get(rec.url) : null);
  // order 3: after gradient (2)
  ggs.tiles.filter((rec, source) =>
    (active && rec.key ? ahead(rec, source) ?? draw(source, rec.key.z) : source), 3);

  const drop = p => {
    p?.tiles.cancel();
    if (pre === p) pre = null;
  };
  ggs.scripts.ascii = {
    prepare(cfg) {
      drop(pre);
      const tiles = ggs.tiles.prerender((img, k) => draw(img, k.z, cfg.look));
      const p = pre = { look: cfg.look, tiles };
      return { ready: p.tiles.ready, cancel: () => drop(p) };
    },
    start(cfg) {
      active = cfg;
      const p = pre;
      ggs.tiles.replay().then(() => drop(p)); // only the first replay needs them
      return {
        stop() {
          active = null;
          ggs.tiles.replay();
        },
        update(next) {
          const changed = next.look !== active.look;
          active = next;
          if (changed) ggs.tiles.replay();
        },
      };
    },
  };
})();
