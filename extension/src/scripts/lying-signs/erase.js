// Lying signs: finding the old text's strokes in a box and filling them in from the sign
// around them. Pure pixel work on ImageData arrays; shared on ggs.lyingSigns.
(() => {
  const ls = globalThis.__ggs.lyingSigns;
  // Boxes whose text differs from the sign by less than this (summed RGB) are ignored.
  const MIN_CONTRAST = 45;

  // Colours are counted in an 8-level colour cube: per cell a count and the summed r, g, b.
  const newCube = () => new Float64Array(512 * 4);
  function addToCube(cube, d, i) {
    const k = ((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) * 4;
    cube[k]++;
    cube[k + 1] += d[i];
    cube[k + 2] += d[i + 1];
    cube[k + 3] += d[i + 2];
  }
  function commonest(cube) {
    let b = 0;
    for (let k = 4; k < cube.length; k += 4) if (cube[k] > cube[b]) b = k;
    return b;
  }

  // The old text inside `box` ([x0, y0, x1, y1]). The sign colour is the commonest one and
  // the strokes are what's far from it. Returns the strokes as a mask grown by `grow` px,
  // their colour, the rows they span and how grainy the sign is, or null if nothing stands out.
  function strokes(d, w, h, box, grow) {
    const sign = signColour(d, w, box);
    if (!sign) return null;
    const { bg } = sign;
    const dist = i => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    const contrast = strokeContrast(d, w, box, dist, sign.n);
    if (contrast < MIN_CONTRAST) return null;
    const s = traceStrokes(d, w, h, box, dist, contrast);
    // text colour: the commonest stroke colour, so an outline or shading doesn't grey the fill
    const f = commonest(s.ink);
    if (!s.ink[f]) return null;
    return {
      mask: dilate(s.core, w, h, grow),
      fg: [1, 2, 3].map(j => Math.round(s.ink[f + j] / s.ink[f])),
      bg,
      contrast,
      top: s.top,
      bottom: s.bottom,
      grain: s.gn ? Math.min(6, (s.gsum / s.gn) * 0.5) : 0,
    };
  }
  // The commonest colour of the opaque pixels in the box, and how many there are.
  function signColour(d, w, [x0, y0, x1, y1]) {
    const bins = newCube();
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 200) continue;
        n++;
        addToCube(bins, d, i);
      }
    if (!n) return null;
    const b = commonest(bins);
    return { bg: [bins[b + 1] / bins[b], bins[b + 2] / bins[b], bins[b + 3] / bins[b]], n };
  }
  // Typical stroke pixel: the median of the eighth furthest from the sign colour.
  function strokeContrast(d, w, [x0, y0, x1, y1], dist, n) {
    const hist = new Uint32Array(766);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] >= 200) hist[dist(i) | 0]++;
      }
    for (let v = 765, c = 0; v >= 0; v--) {
      c += hist[v];
      if (c >= n / 16) return v;
    }
    return 765;
  }
  // Marks the stroke pixels (far from the sign colour), counts the colours of the clearest
  // ones, notes the rows with enough of them, and measures the sign's grain in between.
  function traceStrokes(d, w, h, box, dist, contrast) {
    const [x0, y0, x1, y1] = box;
    const s = {
      thr: Math.max(24, contrast * 0.45),
      strong: contrast * 0.8,
      core: new Uint8Array(w * h),
      ink: newCube(),
      top: h,
      bottom: -1,
      gsum: 0,
      gn: 0,
    };
    const rowMin = Math.max(2, (x1 - x0) * 0.03);
    for (let y = y0; y < y1; y++) {
      if (traceRow(d, w, y, x0, x1, dist, s) < rowMin) continue;
      if (y < s.top) s.top = y;
      s.bottom = y;
    }
    return s;
  }
  // One row of traceStrokes; returns how many stroke pixels it has.
  function traceRow(d, w, y, x0, x1, dist, s) {
    let row = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 200) continue;
      const v = dist(i);
      if (v > s.thr) {
        s.core[y * w + x] = 1;
        row++;
      }
      if (v > s.strong) addToCube(s.ink, d, i);
      else if (v <= s.thr && x + 1 < x1 && dist(i + 4) <= s.thr) {
        // grain: brightness change between neighbouring sign pixels
        s.gsum += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[i + 4] - d[i + 5] - d[i + 6]) / 3;
        s.gn++;
      }
    }
    return row;
  }

  // Google's "© 2025 Google" marks: always the same small size and shape on a tile, grey and
  // see-through. The background is lightened by about the same fraction in every channel.
  // Real white or grey lettering is far more opaque.
  function watermark(raw, tileW, bg, fg) {
    const h = raw.h / tileW;
    const aspect = raw.w / raw.h;
    if (raw.vertical || h < 0.018 || h > 0.045 || aspect < 3.5 || aspect > 8) return false;
    if (Math.max(...fg) - Math.min(...fg) > 30) return false; // coloured: not the grey mark
    const a = [0, 1, 2].map(k => (fg[k] - bg[k]) / (256 - bg[k]));
    return Math.min(...a) > 0.1 && Math.max(...a) < 0.55 && Math.max(...a) - Math.min(...a) < 0.1;
  }

  // Where the sign is: pixels of its colour or of the old text's colour. Anything else (a
  // pole in front, the sky past the end of the sign, the side of a curved building) isn't,
  // so the new word is cut off there as the old one was. Closed by r px so outlines and
  // anti-aliasing between the two colours count as sign.
  function surface(d, w, h, s, r) {
    const near = (i, c, lim) =>
      Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < lim;
    const lim = Math.max(40, s.contrast * 0.45);
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const j = i * 4;
      if (d[j + 3] >= 200 && (near(j, s.bg, lim) || near(j, s.fg, lim))) m[i] = 1;
    }
    const grown = dilate(m, w, h, r);
    for (let i = 0; i < w * h; i++) grown[i] = !grown[i];
    const shrunk = dilate(grown, w, h, r);
    for (let i = 0; i < w * h; i++) m[i] = !shrunk[i];
    return m;
  }

  // Grows a mask by r px in every direction (a square), with running counts along rows, then columns.
  function dilate(m, w, h, r) {
    const rows = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) dilateLine(m, rows, y * w, 1, w, r);
    for (let x = 0; x < w; x++) dilateLine(rows, out, x, w, h, r);
    return out;
  }
  // One row or column: `len` cells from `start`, `step` apart.
  function dilateLine(src, dst, start, step, len, r) {
    let c = 0;
    for (let k = 0; k < Math.min(r, len); k++) c += src[start + k * step];
    for (let k = 0; k < len; k++) {
      if (k + r < len) c += src[start + (k + r) * step];
      if (k - r - 1 >= 0) c -= src[start + (k - r - 1) * step];
      dst[start + k * step] = c > 0;
    }
  }

  // Fills the masked pixels of `d` from the rest (push-pull): halve the picture until every
  // cell has something in it, averaging only known pixels, then on the way back up give each
  // unknown pixel the smooth, bilinear value from the level above. Linear in the pixel count.
  // Returns the levels ({ c: rgb, wt: weight, w, h }), finest first.
  function pushPull(d, mask, w, h) {
    const levels = [knownPixels(d, mask, w, h)];
    while (levels.at(-1).w > 1 || levels.at(-1).h > 1) levels.push(halve(levels.at(-1)));
    for (let l = levels.length - 2; l >= 0; l--) pull(levels[l], levels[l + 1]);
    const c0 = levels[0].c;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      d[i * 4] = c0[i * 3];
      d[i * 4 + 1] = c0[i * 3 + 1];
      d[i * 4 + 2] = c0[i * 3 + 2];
    }
    return levels;
  }
  // The finest level: opaque pixels outside the mask, at full weight.
  function knownPixels(d, mask, w, h) {
    const c = new Float32Array(w * h * 3);
    const wt = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (mask[i] || d[i * 4 + 3] < 200) continue;
      wt[i] = 1;
      c[i * 3] = d[i * 4];
      c[i * 3 + 1] = d[i * 4 + 1];
      c[i * 3 + 2] = d[i * 4 + 2];
    }
    return { c, wt, w, h };
  }
  // The level above: each cell the weighted mean of the (up to) four cells under it.
  function halve(lv) {
    const w = Math.ceil(lv.w / 2);
    const h = Math.ceil(lv.h / 2);
    const up = { c: new Float32Array(w * h * 3), wt: new Float32Array(w * h), w, h };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) meanCell(lv, up, x, y);
    return up;
  }
  function meanCell(lv, up, x, y) {
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let ws = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const sx = 2 * x + dx;
        const sy = 2 * y + dy;
        if (sx >= lv.w || sy >= lv.h) continue;
        const j = sy * lv.w + sx;
        const q = lv.wt[j];
        s0 += lv.c[j * 3] * q;
        s1 += lv.c[j * 3 + 1] * q;
        s2 += lv.c[j * 3 + 2] * q;
        ws += q;
      }
    const j = y * up.w + x;
    if (ws) {
      up.c[j * 3] = s0 / ws;
      up.c[j * 3 + 1] = s1 / ws;
      up.c[j * 3 + 2] = s2 / ws;
    }
    up.wt[j] = Math.min(1, ws);
  }
  // Blends each cell not fully known with the bilinear value from the level above.
  function pull(lv, above) {
    const { c, wt } = lv;
    for (let y = 0; y < lv.h; y++)
      for (let x = 0; x < lv.w; x++) {
        const j = y * lv.w + x;
        const q = wt[j];
        if (q >= 1) continue;
        for (let k = 0; k < 3; k++) {
          const up = bilinear(above, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, k);
          c[j * 3 + k] = c[j * 3 + k] * q + up * (1 - q);
        }
        wt[j] = 1;
      }
  }
  // Channel k of a level at (fx, fy) in its own cells, clamped to its edges.
  function bilinear(lv, fx, fy, k) {
    const { c, w, h } = lv;
    const x = Math.min(w - 1, Math.max(0, fx));
    const y = Math.min(h - 1, Math.max(0, fy));
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    return (
      (c[(y0 * w + x0) * 3 + k] * (1 - tx) + c[(y0 * w + x1) * 3 + k] * tx) * (1 - ty) +
      (c[(y1 * w + x0) * 3 + k] * (1 - tx) + c[(y1 * w + x1) * 3 + k] * tx) * ty
    );
  }

  // The push-pull fill is smooth, which shows on paving, brick or a grainy sign. Each filled
  // pixel gets the fine detail (pixel minus its blurred value, clamped) of the pixel mirrored
  // across the nearest box edge, so the texture outside carries on into the box. With nothing
  // to mirror it gets plain grain.
  function texture(d, mask, w, h, box, levels, grain) {
    const blur = levels[Math.min(2, levels.length - 1)];
    const f = 2 ** Math.min(2, levels.length - 1);
    const known = (x, y) =>
      x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x] && d[(y * w + x) * 4 + 3] >= 200;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const src = mirrorOf(x, y, box, known);
        if (src) copyDetail(d, i, src, w, blur, f);
        else addGrain(d, i, grain);
      }
  }
  // The mirror image of (x, y) across the nearest box edge that lands on a known pixel.
  function mirrorOf(x, y, [x0, y0, x1, y1], known) {
    const m = [
      [2 * x0 - x - 1, y, x - x0],
      [2 * x1 - x - 1, y, x1 - x],
      [x, 2 * y0 - y - 1, y - y0],
      [x, 2 * y1 - y - 1, y1 - y],
    ].sort((a, b) => a[2] - b[2]);
    return m.find(([mx, my]) => known(mx, my));
  }
  function copyDetail(d, i, [sx, sy], w, blur, f) {
    const j = (sy * w + sx) * 4;
    for (let k = 0; k < 3; k++) {
      const smooth = bilinear(blur, (sx + 0.5) / f - 0.5, (sy + 0.5) / f - 0.5, k);
      d[i * 4 + k] += Math.max(-30, Math.min(30, d[j + k] - smooth));
    }
  }
  function addGrain(d, i, grain) {
    const n = (Math.random() - 0.5) * 2 * grain;
    d[i * 4] += n;
    d[i * 4 + 1] += n;
    d[i * 4 + 2] += n;
  }

  Object.assign(ls, { strokes, watermark, surface, pushPull, texture });
})();
