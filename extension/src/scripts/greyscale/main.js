// Colour filter. Black and white and inverted are a CSS filter on the Street View picture only
// (core/view.js). "Only <colour>" redraws each Street View tile (core/tiles.js, after the other
// tile filters) in black and white except pixels of that hue, so a red bus stays red.
// prepare(cfg) redraws the panorama on screen ahead of time (core/tiles.js prerender), for Chaos mode.
(() => {
  const ggs = globalThis.__ggs;
  const CSS = { grey: 'grayscale(1)', invert: 'invert(1)' };
  // centre and half-width of each hue, in degrees
  const HUES = { red: [0, 18], orange: [28, 12], yellow: [52, 14], green: [120, 45], blue: [220, 35] };
  // degrees of soft edge past the half-width
  const FEATHER = 12;
  // pre: { hue, tiles } drawn ahead by prepare
  let keep = null;
  let pre = null;

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function draw(source, hue = keep) {
    const w = source.width || source.naturalWidth || 512;
    const h = source.height || source.naturalHeight || 512;
    // willReadFrequently keeps the pixels in memory, so there's no GPU readback
    const out = new OffscreenCanvas(w, h);
    const g = out.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const [centre, half] = hue;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const gr = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, gr, b);
      const min = Math.min(r, gr, b);
      const grey = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      let k = 0;
      if (max - min > 20) {
        const c = max - min;
        let hue = max === r ? ((gr - b) / c) % 6 : max === gr ? (b - r) / c + 2 : (r - gr) / c + 4;
        hue = (hue * 60 + 360) % 360;
        const off = Math.abs(((hue - centre + 540) % 360) - 180);
        // close to the hue, saturated enough, and not too dark
        k = (1 - smooth(half, half + FEATHER, off)) * smooth(0.18, 0.4, c / max) * smooth(25, 60, max);
      }
      d[i] = grey + (r - grey) * k;
      d[i + 1] = grey + (gr - grey) * k;
      d[i + 2] = grey + (b - grey) * k;
    }
    g.putImageData(img, 0, 0);
    return out;
  }
  // A tile drawn ahead is only used if no earlier filter changed it. A filter that changes a tile
  // hands on a canvas, so an untouched tile is still an image.
  const ahead = (rec, source) =>
    pre?.hue === keep && source instanceof HTMLImageElement ? pre.tiles.get(rec.url) : null;
  // order 4: after gradient (2) and ascii (3)
  ggs.tiles.filter((rec, source) => (keep ? (ahead(rec, source) ?? draw(source)) : source), 4);

  const drop = p => {
    p?.tiles.cancel();
    if (pre === p) pre = null;
  };
  function apply(cfg) {
    const next = HUES[cfg?.filter] ?? null;
    ggs.view.effect('greyscale', cfg && !next ? { filter: CSS[cfg.filter] ?? CSS.grey } : null);
    if (next !== keep) {
      keep = next;
      const p = pre;
      ggs.tiles.replay().then(() => drop(p));
    }
  }
  ggs.scripts.greyscale = {
    // only the "Only <colour>" filters redraw tiles; the others are instant
    prepare(cfg) {
      const hue = HUES[cfg.filter];
      if (!hue) return null;
      drop(pre);
      const p = { hue, tiles: ggs.tiles.prerender(img => draw(img, hue)) };
      pre = p;
      return { ready: p.tiles.ready, cancel: () => drop(p) };
    },
    start(cfg) {
      apply(cfg);
      return { update: apply, stop: () => apply(null) };
    },
  };
})();
