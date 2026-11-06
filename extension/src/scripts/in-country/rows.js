// A country's rows, shared by Guess in a country (page) and the Guess on Jack board, whose
// iframe loads this file by relative path. A country's main pieces (draw-guess's geo.json) in
// [lng, mercator y], read row by row; both squash something onto the land along a row, the
// gaps between pieces skipped. Maths only: nothing here reads or sends anything.
(() => {
  // rows cached per country, south to north
  const ROWS = 2048;
  const rad = Math.PI / 180;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2));
  const fromMercY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / rad;

  // Land pieces under this share of the country's biggest are left out: Australia's Macquarie and Heard Islands would otherwise stretch its rows to
  // -54 degrees and hold the whole southern world.
  const MIN_PIECE = 0.005;
  const area = ring => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    return Math.abs(a / 2) * Math.cos(ring[0][1] * rad);
  };

  // A country's shape for squashing: its main pieces (polys, as in geo.json) and their rings in
  // [lng, mercator y], with pieces on the far side of ±180 shifted by 360 so the country is one
  // piece (Russia, Fiji, the Aleutians...).
  function shapeOf(all) {
    const biggest = Math.max(...all.map(([outer]) => area(outer)));
    const polys = all.filter(([outer]) => area(outer) >= MIN_PIECE * biggest);
    const rings = polys.flat();
    const span = list => {
      const xs = list.flat().map(p => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    const mean = r => r.reduce((s, p) => s + p[0], 0) / r.length;
    const shift = by =>
      rings.map(r => (Math.sign(mean(r)) === -Math.sign(by) ? r.map(([x, y]) => [x + by, y]) : r));
    let best = rings;
    if (span(rings) > 180) best = [shift(360), shift(-360)].sort((a, b) => span(a) - span(b))[0];
    const merc = best.map(r => r.map(([x, y]) => [x, mercY(y)]));
    const ys = merc.flat().map(p => p[1]);
    const xs = best.flat().map(p => p[0]);
    return {
      polys,
      rings: merc,
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      bounds: {
        south: Math.min(...best.flat().map(p => p[1])),
        north: Math.max(...best.flat().map(p => p[1])),
        west: Math.min(...xs),
        east: Math.max(...xs),
      },
      rowCache: new Map(),
    };
  }

  // Where the row at mercator y crosses the country: [[west, east], ...] (even-odd), and their length.
  function row(shape, y) {
    const xs = [];
    for (const r of shape.rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xa, ya] = r[i];
        const [xb, yb] = r[j];
        if (ya > y !== yb > y) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    const segs = [];
    let length = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      segs.push([xs[i], xs[i + 1]]);
      length += xs[i + 1] - xs[i];
    }
    return { segs, length };
  }

  // The nearest row with some land, a little inside the country's top and bottom.
  function rowAt(shape, t) {
    const i = Math.round(Math.min(1, Math.max(0, t)) * (ROWS - 1));
    if (!shape.rowCache.has(i)) shape.rowCache.set(i, nearestRow(shape, i));
    return shape.rowCache.get(i);
  }
  function nearestRow(shape, i) {
    let r = null;
    for (let d = 0; d < ROWS && !r?.length; d++) {
      for (const k of [i - d, i + d]) {
        if (k < 0 || k >= ROWS || r?.length) continue;
        const y = shape.y0 + ((k + 0.5) / ROWS) * (shape.y1 - shape.y0);
        r = row(shape, y);
        r.y = y;
      }
    }
    return r;
  }

  const wrap = lng => ((lng + 540) % 360) - 180;

  // The spot f (0..1) of the way along a row's land, west to east, gaps skipped.
  function alongRow(r, f) {
    let left = f * r.length;
    for (const [a, b] of r.segs) {
      if (left <= b - a) return { lat: fromMercY(r.y), lng: wrap(a + left) };
      left -= b - a;
    }
    const last = r.segs[r.segs.length - 1];
    return { lat: fromMercY(r.y), lng: wrap(last[1]) };
  }

  // In the page it joins the other ggs helpers; the board's iframe has no __ggs.
  (globalThis.__ggs ?? globalThis).countryRows = {
    mercY,
    fromMercY,
    wrap,
    area,
    shapeOf,
    row,
    rowAt,
    alongRow,
  };
})();
