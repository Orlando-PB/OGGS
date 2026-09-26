// JS port of country-matcher's /api/match (app.py), so the extension needs no server.
// Country masks, outlines, geography and tuning constants are exported from app.py by
// tools/sync_draw.py; only the drawing side (rasterise + score) is re-implemented here.
// Keep it in step with app.py's rasterize(), drawing_masks() and match() —
// `node tools/check_parity.mjs` compares the two.
const DrawMatcher = (() => {
  // Separable Gaussian blur on an n*n image, edges clamped, rounded like PIL's 8-bit output.
  function gaussian(src, n, sigma) {
    const r = Math.ceil(sigma * 3), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const clamp = v => (v < 0 ? 0 : v >= n ? n - 1 : v);
    const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += k[i + r] * src[y * n + clamp(x + i)];
        tmp[y * n + x] = a;
      }
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += k[i + r] * tmp[clamp(y + i) * n + x];
        out[y * n + x] = Math.round(a);
      }
    }
    return out;
  }

  // Scanline fill (even-odd), pixel centres at integer coords, plus a 1px outline —
  // like PIL's ImageDraw.polygon(fill=255, outline=255). The outline matters for thin
  // countries (Chile, Norway), which otherwise lose too much in the smoothing step.
  function fillPolygon(img, n, pts) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xa, ya] = pts[j], [xb, yb] = pts[i];
      const steps = Math.max(1, Math.ceil(2 * Math.hypot(xb - xa, yb - ya)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(xa + ((xb - xa) * s) / steps), y = Math.round(ya + ((yb - ya) * s) / steps);
        if (x >= 0 && x < n && y >= 0 && y < n) img[y * n + x] = 255;
      }
    }
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(n - 1, Math.floor(y1)); y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xa, ya] = pts[j], [xb, yb] = pts[i];
        if ((ya <= y) !== (yb <= y)) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(n - 1, Math.floor(xs[k + 1])); x++) img[y * n + x] = 255;
      }
    }
  }

  function bbox(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }

  // prior (optional, extension only): data/prior.json, the "attractor" table. Blob-shaped
  // countries score well against almost any drawing; this subtracts each country's usual
  // score on drawings of *other* countries (minus the mean), clamped to +-cap points. It's
  // skipped when the round's real country (bonus.code) already leads the raw ranking, so
  // it can only ever fix a wrong answer, never break a right one.
  function create(meta, masksU8, geo, prior = null) {
    const { grid: G, fill: FILL, smoothSigma, sizeWeight, sizeTol, sizeSpan, rotations, stretches, entries } = meta;
    const G2 = G * G, N = entries.length;
    const masks = new Float32Array(masksU8.length);
    for (let i = 0; i < masks.length; i++) masks[i] = masksU8[i] / 255;

    // app.py fit_transform
    function fit(rings) {
      const [x0, y0, x1, y1] = bbox(rings);
      const scale = (FILL * G) / Math.max(x1 - x0, y1 - y0, 1e-9);
      return [scale, [G / 2 - (scale * (x0 + x1)) / 2, G / 2 - (scale * (y0 + y1)) / 2]];
    }

    // app.py rasterize: draw at 2x, smooth + re-threshold, box down to the grid, soften.
    function rasterize(rings, scale, off) {
      const S = 2, n = G * S;
      let img = new Float32Array(n * n);
      for (const r of rings) fillPolygon(img, n, r.map(([x, y]) => [(x * scale + off[0]) * S, (y * scale + off[1]) * S]));
      const smooth = gaussian(img, n, smoothSigma).map(v => (v >= 128 ? 255 : 0));
      if (smooth.some(v => v)) img = smooth;
      const small = new Float32Array(G2);
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = 2 * y * n + 2 * x;
          small[y * G + x] = Math.round((img[i] + img[i + 1] + img[i + n] + img[i + n + 1]) / 4);
        }
      }
      return gaussian(small, G, 1.0).map(v => v / 255);
    }

    // app.py drawing_masks: slightly rotated/stretched copies of the drawing
    // (rots/strs default to app.py's; the correct-country leeway passes wider ones)
    function* drawingMasks(rings, rots = rotations, strs = stretches) {
      let cx = 0, cy = 0, cnt = 0;
      for (const r of rings) for (const [x, y] of r) { cx += x; cy += y; cnt++; }
      cx /= cnt; cy /= cnt;
      for (const th of rots) {
        const c = Math.cos(th), sn = Math.sin(th);
        for (const s of strs) {
          const tr = rings.map(r => r.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            return [(dx * c - dy * sn) * s, dx * sn + dy * c];
          }));
          const [scale, off] = fit(tr);
          yield [th, s, rasterize(tr, scale, off)];
        }
      }
    }

    // Soft IoU of one entry's mask with a drawing mask (the same sum as match()'s main loop).
    function iou(e, mask) {
      let inter = 0, union = 0;
      for (let i = 0, o = e * G2; i < G2; i++, o++) {
        const a = masks[o], b = mask[i];
        if (a < b) { inter += a; union += b; } else { inter += b; union += a; }
      }
      return inter / Math.max(union, 1e-9);
    }

    // Leeway for the round's real country only (extension only): the drawing is also tried
    // rotated up to +-10 degrees and stretched up to 1.1x either way, with gentler penalties
    // and no size prior. Then, for drawings of several loops, each smaller loop (an island,
    // Alaska) is also tried resized about its own middle. Kept small on purpose, so a sketch
    // of a different country doesn't get turned into the right one.
    const deg = d => (d * Math.PI) / 180;
    const LEEWAY_ROTATIONS = [-10, -5, 0, 5, 10].map(deg);
    const LEEWAY_STRETCHES = [1 / 1.1, 1, 1.1];
    const ISLAND_SCALES = [0.5, 0.7, 1.4, 2];
    const ISLAND_ROTATIONS = [-10, 0, 10].map(deg);
    const leewayPenalty = (th, s) => 1 - 0.05 * Math.abs(Math.log(s)) - 0.04 * Math.abs(th);
    const ringArea = r => Math.abs(r.reduce((a, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);

    // bonus: { code, points } - extension only, not in app.py: makes sure that country is
    // in the pool, gives it the leeway above, and then, if it's behind the leader by no more
    // than `points` percentage points, lifts it past the leader: by about 1 point if it was
    // nearly `points` behind, up to about 5 if it was just behind (see below).
    // limit: how many results to return (default 8; tools pass more).
    // target: a country code - extension only: also report that country's score (as
    // `target`), whether or not it made the top 8 or the pool.
    function match({ strokes, map = 'world', canvas = 900, bonus = null, target: targetCode = null, limit = 8 }) {
      const rings = strokes.filter(s => s.length >= 3);
      if (!rings.length) return { error: 'Draw something first!' };
      const pool = meta.maps[map];
      if (!pool) return { error: `Unknown map '${map}'` };
      const allowed = new Set(pool.codes);
      if (bonus) allowed.add(bonus.code);

      const best = new Float64Array(N).fill(-1);
      for (const [th, s, mask] of drawingMasks(rings)) {
        const penalty = 1 - 0.15 * Math.abs(Math.log(s)) - 0.1 * Math.abs(th);
        for (let e = 0; e < N; e++) {
          let inter = 0, union = 0;
          for (let i = 0, o = e * G2; i < G2; i++, o++) {
            const a = masks[o], b = mask[i];
            if (a < b) { inter += a; union += b; } else { inter += b; union += a; }
          }
          const score = (inter / Math.max(union, 1e-9)) * penalty;
          if (score > best[e]) best[e] = score;
        }
      }

      // size prior: how much of the canvas the sketch fills hints at how big the country is
      const [x0, y0, x1, y1] = bbox(rings);
      const span = Math.max(Math.max(x1 - x0, y1 - y0) / canvas, 0.02);
      const expected = 3.8 + 2.0 * Math.log10(span);
      for (let e = 0; e < N; e++) {
        const miss = Math.min(1, Math.max(0, (Math.abs(entries[e].logExtent - expected) - sizeTol) / sizeSpan));
        best[e] *= 1 - sizeWeight * miss * miss * (3 - 2 * miss);
      }
      if (bonus) {
        const own = [];
        entries.forEach((en, i) => { if (en.code === bonus.code) own.push(i); });
        // bonus.stretch (optional, >= 1) replaces the default 1.1 stretch leeway; 1 = rotation only
        const k = bonus.stretch ?? LEEWAY_STRETCHES[2];
        const d = LEEWAY_STRETCHES[2]; // past 1.1, keep the 1.1 steps so more leeway never scores lower
        const stretches = k > d ? [1 / k, 1 / d, 1, d, k] : k > 1 ? [1 / k, 1, k] : [1];
        for (const [th, s, mask] of drawingMasks(rings, LEEWAY_ROTATIONS, stretches)) {
          const penalty = leewayPenalty(th, s);
          for (const e of own) best[e] = Math.max(best[e], iou(e, mask) * penalty);
        }
        if (rings.length > 1) {
          const big = rings.reduce((b, r, i) => (ringArea(r) > ringArea(rings[b]) ? i : b), 0);
          for (const f of ISLAND_SCALES) {
            const resized = rings.map((r, i) => {
              if (i === big) return r;
              const cx = r.reduce((a, p) => a + p[0], 0) / r.length, cy = r.reduce((a, p) => a + p[1], 0) / r.length;
              return r.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
            });
            for (const [th, s, mask] of drawingMasks(resized, ISLAND_ROTATIONS, [1])) {
              const penalty = leewayPenalty(th, s) - 0.05 * Math.abs(Math.log(f));
              for (const e of own) best[e] = Math.max(best[e], iou(e, mask) * penalty);
            }
          }
        }
      }
      if (prior) {
        let lead = -1;
        for (let e = 0; e < N; e++) if (allowed.has(entries[e].code) && (lead < 0 || best[e] > best[lead])) lead = e;
        if (!(bonus && lead >= 0 && entries[lead].code === bonus.code)) {
          for (let e = 0; e < N; e++) {
            const v = prior.values[entries[e].code];
            if (v === undefined) continue;
            best[e] -= Math.max(-prior.cap, Math.min(prior.cap, v - prior.mean)) / 100;
          }
        }
      }
      if (bonus) {
        let mine = -1, top = -1;
        entries.forEach((en, i) => {
          if (en.code === bonus.code) { if (mine < 0 || best[i] > best[mine]) mine = i; }
          else if (allowed.has(en.code) && best[i] > top) top = best[i];
        });
        // Lifted past the leader by a lead that depends on how close it was: 0.8 points plus
        // 0.3 of the unused bonus (with 15: just behind -> ~5 points ahead; nearly 15 behind -> ~1).
        const gap = top - best[mine], room = bonus.points / 100 - gap;
        if (mine >= 0 && gap > 0 && room >= 0) best[mine] = Math.min(1, top + 0.008 + 0.3 * room);
      }

      const perCountry = new Map();
      entries.forEach((en, i) => {
        if (!allowed.has(en.code)) return;
        const j = perCountry.get(en.code);
        if (j === undefined || best[i] > best[j]) perCountry.set(en.code, i);
      });
      const ranked = [...perCountry.values()].sort((a, b) => best[b] - best[a]);
      const results = ranked.slice(0, limit).map((i, rank) => {
        const en = entries[i];
        const r = { code: en.code, name: en.name, variant: en.variant, score: Math.round(best[i] * 1000) / 10, outline: en.outline };
        if (rank === 0) {
          r.geo = geo[en.code];
          r.geo_match = en.parts.map(j => geo[en.code][j][0]);
        }
        return r;
      });
      let target = null;
      if (targetCode) {
        let ti = -1;
        entries.forEach((en, i) => { if (en.code === targetCode && (ti < 0 || best[i] > best[ti])) ti = i; });
        if (ti >= 0) target = { code: targetCode, name: entries[ti].name, score: Math.round(best[ti] * 1000) / 10,
                                outline: entries[ti].outline };
      }
      return { grid: G, results, total: perCountry.size, target };
    }

    const maps = () => Object.entries(meta.maps).map(([id, m]) => ({ id, label: m.label, count: m.codes.length }));

    return { match, maps };
  }

  return { create };
})();

if (typeof module !== 'undefined') module.exports = DrawMatcher;
