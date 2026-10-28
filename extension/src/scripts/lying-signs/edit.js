// Lying signs: editing one tile. The blurred placeholder, the nadir mosaic, and replacing the
// text in each detector box with a new word. Also creates ggs.lyingSigns.stats, the counters
// every lying-signs file adds to (read them in the console).
(() => {
  const ggs = globalThis.__ggs;
  const ls = ggs.lyingSigns;
  const { WORDS, GALACTIC_INDEX, JOINED } = ls.words;
  const { hash, rng, drawGalactic, chooseWord, writeWord, strokes, watermark, surface, pushPull, texture } =
    ls;
  // Letter height as a share of the box height, for boxes cut by a tile edge.
  const TEXT_OF_BOX = 0.8;
  // Road markings, tyres, drain covers: anything below this pitch is ground.
  const GROUND_PITCH = -30;
  // The bottom of the panorama (the car) is stretched too much for the detector, so
  // everything below this pitch is smeared into a coarse mosaic instead.
  const NADIR_PITCH = -68;

  const stats = { seen: 0, edited: 0, boxes: 0, failed: 0, detectMs: 0, detected: 0, editMs: 0, editMax: 0 };
  ls.stats = stats;

  // Placeholder while the detector works: the tile at 1/10 size, scaled back up.
  function blurred(img) {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const small = new OffscreenCanvas(Math.max(1, (W / 10) | 0), Math.max(1, (H / 10) | 0));
    small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    return c;
  }

  // Edits a tile with the detector's boxes and returns an OffscreenCanvas. With `onto`, an
  // earlier edit of the same tile, only the given boxes are added to it.
  function editSync(src, boxes, cfg, key, onto) {
    const t0 = performance.now();
    const W = src.naturalWidth || src.width;
    const H = src.naturalHeight || src.height;
    const c = onto || new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!onto) {
      g.drawImage(src, 0, 0);
      nadir(g, key, W, H);
    }
    const script = scriptFor(cfg, key);
    for (const raw of usable(boxes, key, H)) editBox(g, raw, script, W);
    const ms = performance.now() - t0;
    stats.editMs += ms;
    stats.editMax = Math.max(stats.editMax, ms);
    return c;
  }
  // One box, with randomness seeded on its sign. A failure loses only that box.
  function editBox(g, raw, script, tileW) {
    const list = WORDS[script];
    const rand = rng(raw.sign.seed);
    const pick = list === 'galactic' ? null : () => list[Math.floor(rand() * list.length)];
    try {
      replaceBox(g, raw, script, pick, rand, tileW);
    } catch (err) {
      stats.failed++;
      if (stats.failed < 4) ggs.log('lying-signs: box failed', err);
    }
  }
  // The word list to write from: the "script" option, or for random (0) one per panorama.
  function scriptFor(cfg, key) {
    const script = cfg.script | 0;
    if (WORDS[script]) return script;
    return 1 + (hash(`script:${key?.pano || ''}`) % (WORDS.length - 1));
  }

  // The boxes worth editing: big enough at this zoom, and not on the ground.
  function usable(boxes, key, H) {
    return boxes.filter(b => {
      if (b.h < 4 || b.w < 4) return false;
      if (onGround(key, b, H)) {
        stats.ground = (stats.ground || 0) + 1;
        return false;
      }
      return true;
    });
  }
  // Anything below GROUND_PITCH, or a big box a little below the horizon (a shop sign there
  // is seldom more than a few degrees tall).
  function onGround(k, b, H) {
    if (!k) return false;
    const deg = 180 / (Math.max(1, 2 ** (k.z - 1)) * H); // degrees per tile pixel
    const pitch = 90 - (k.y * H + b.cy) * deg;
    return pitch < GROUND_PITCH || (pitch < -8 && Math.min(b.w, b.h) * deg > 6);
  }

  function nadir(g, k, W, H) {
    if (!k) return;
    const rows = Math.max(1, 2 ** (k.z - 1));
    // tile y where the mosaic starts
    const top = Math.max(0, (((90 - NADIR_PITCH) / 180) * rows - k.y) * H);
    if (top >= H) return;
    const band = H - top;
    const fade = Math.min(10, band);
    const small = new OffscreenCanvas(Math.max(1, (W / 16) | 0), Math.max(1, (band / 16) | 0));
    small.getContext('2d').drawImage(g.canvas, 0, top, W, band, 0, 0, small.width, small.height);
    const layer = new OffscreenCanvas(W, band);
    const l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    l.drawImage(small, 0, 0, W, band);
    const grad = l.createLinearGradient(0, 0, 0, fade);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in';
    l.fillStyle = grad;
    l.fillRect(0, 0, W, fade);
    l.fillStyle = '#000';
    l.fillRect(0, fade, W, band - fade);
    g.drawImage(layer, 0, top);
    stats.nadir = (stats.nadir || 0) + 1;
  }

  // Replaces one line of text. Works in a frame rotated so the text runs level, cut to the
  // tile, so a huge box inherited from a zoomed-out tile costs no more than its part on this
  // tile. The old strokes are told apart from the sign by colour, grown a little to take their
  // halo, and filled in from the sign around them, so the sign's colour and gradients stay.
  // The new word goes on top at the old text's height and colour.
  function replaceBox(g, raw, script, pick, rand, tileW) {
    // Decisions made while the whole box is on the tile are kept on the sign for every zoom.
    const sign = raw.sign;
    if (sign.fit?.skip) return;
    const fr = frameFor(raw, g.canvas.width, g.canvas.height);
    if (!fr) return;
    const { w, h } = fr;
    const t = levelCopy(g, fr);
    const img = t.getImageData(0, 0, w, h);
    const d = img.data;

    const grow = 1 + Math.round(raw.h * 0.04);
    const s = strokes(d, w, h, fr.box, grow);
    const skip = whySkip(s, sign.fit, raw, tileW);
    // clouds, brickwork, foliage, Google's marks: not text to replace
    if (skip) {
      stats[skip] = (stats[skip] || 0) + 1;
      if (fr.whole && !sign.fit) sign.fit = { skip };
      return;
    }
    const surf = surface(d, w, h, s, grow + 1);
    eraseStrokes(d, w, h, s, fr.box);
    t.putImageData(img, 0, 0);
    t.drawImage(wordLayer(raw, script, pick, rand, fitFor(raw, s, fr), fr, surf), 0, 0);

    g.save();
    g.translate(fr.ox, fr.oy);
    g.rotate(fr.angle);
    g.drawImage(t.canvas, fr.rx, fr.ry);
    g.restore();
  }

  // The patch of the tile around the box, copied into the box's frame on a context of its own.
  function levelCopy(g, fr) {
    const t = new OffscreenCanvas(fr.w, fr.h).getContext('2d', { willReadFrequently: true });
    t.translate(-fr.rx, -fr.ry);
    t.rotate(-fr.angle);
    t.translate(-fr.ox, -fr.oy);
    t.drawImage(g.canvas, 0, 0); // outside the tile stays transparent
    t.setTransform(1, 0, 0, 1, 0, 0);
    return t;
  }
  // Fills the old strokes in from the sign around them and clears everything else, so only
  // they are replaced when the patch goes back.
  function eraseStrokes(d, w, h, s, box) {
    const levels = pushPull(d, s.mask, w, h);
    texture(d, s.mask, w, h, box, levels, s.grain);
    for (let i = 0; i < w * h; i++) if (!s.mask[i]) d[i * 4 + 3] = 0;
  }
  // The frame a box is edited in: origin on the pixel nearest its centre, rotated by its
  // angle, cut to the tile. (bu, bv) is the box centre in the frame, (rx, ry, w, h) the patch
  // edited (the box, padding and some sign around it), `box` the detector's box in the patch.
  // Null if too little of it is on the tile.
  function frameFor(raw, W, H) {
    // level text is copied, not resampled
    const angle = Math.abs(raw.angle) < 0.01 ? 0 : raw.angle;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const ox = Math.round(raw.cx);
    const oy = Math.round(raw.cy);
    const bu = (raw.cx - ox) * ca + (raw.cy - oy) * sa;
    const bv = -(raw.cx - ox) * sa + (raw.cy - oy) * ca;
    // the box hugs the strokes, so give them room
    const pad = raw.h * 0.12;
    const hw = raw.w / 2 + pad;
    const hh = raw.h / 2 + pad;
    const ctx = Math.max(4, Math.round(raw.h * 0.3)); // sign around the box, for the fill
    const [u0, u1, v0, v1] = tileExtent(W, H, ox, oy, ca, sa);
    const rx = Math.floor(Math.max(bu - hw - ctx, u0));
    const ry = Math.floor(Math.max(bv - hh - ctx, v0));
    const w = Math.ceil(Math.min(bu + hw + ctx, u1)) - rx;
    const h = Math.ceil(Math.min(bv + hh + ctx, v1)) - ry;
    if (w < 4 || h < 4) return null;
    // Strokes are looked for in the detector's own box. The padding is room to grow them into.
    const box = [
      Math.max(0, Math.round(bu - raw.w / 2 - rx)),
      Math.max(0, Math.round(bv - raw.h / 2 - ry)),
      Math.min(w, Math.round(bu + raw.w / 2 - rx)),
      Math.min(h, Math.round(bv + raw.h / 2 - ry)),
    ];
    if (box[2] - box[0] < 3 || box[3] - box[1] < 3) return null;
    // the box isn't cut by the tile edge
    const whole = bu - hw - rx > 0 && bv - hh - ry > 0 && bu + hw - rx < w && bv + hh - ry < h;
    return { angle, ox, oy, bu, bv, rx, ry, w, h, box, whole };
  }
  // The tile's extent in the frame: [u0, u1, v0, v1].
  function tileExtent(W, H, ox, oy, ca, sa) {
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, y] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ]) {
      const u = (x - ox) * ca + (y - oy) * sa;
      const v = -(x - ox) * sa + (y - oy) * ca;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    return [u0, u1, v0, v1];
  }
  // Why a box is left alone, if it is: no strokes stand out, or it's a Google watermark.
  function whySkip(s, fit, raw, tileW) {
    if (!s) return 'lowContrast';
    if (!fit && watermark(raw, tileW, s.bg, s.fg)) return 'watermark';
    return null;
  }
  // Letter height, position and colour are measured once the whole box is on the tile, then
  // kept. Until then a box cut by the tile edge is sized from the detector.
  function fitFor(raw, s, fr) {
    const sign = raw.sign;
    if (sign.fit) return sign.fit;
    const measured = fr.whole && s.bottom > s.top;
    const f = {
      textH: measured ? Math.max(0.35, (s.bottom - s.top + 1) / raw.h) : TEXT_OF_BOX,
      dy: measured ? ((s.top + s.bottom + 1) / 2 - (fr.bv - fr.ry)) / raw.h : 0,
      fg: s.fg,
    };
    if (fr.whole) sign.fit = f;
    return f;
  }
  // The new word on its own layer, kept to the sign's surface (`surf`).
  function wordLayer(raw, script, pick, rand, f, fr, surf) {
    const { w, h } = fr;
    const textH = f.textH * raw.h;
    const cx = fr.bu - fr.rx;
    const cy = fr.bv - fr.ry + f.dy * raw.h;
    const layer = new OffscreenCanvas(w, h);
    const x = layer.getContext('2d', { willReadFrequently: true });
    x.fillStyle = `rgb(${f.fg.join(',')})`;
    if (script === GALACTIC_INDEX) {
      const glyphH = textH / 0.72;
      drawGalactic(x, { x: cx - raw.w / 2, y: cy - glyphH / 2, w: raw.w, h: glyphH }, rand);
    } else {
      const words = raw.sign.words;
      const stacked = raw.vertical && !JOINED.has(script);
      words[script] ||= chooseWord(textH / raw.h, raw.w / raw.h, pick, stacked);
      writeWord(x, cx, cy, textH, raw.w, words[script]);
    }
    const ld = x.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) if (!surf[i]) ld.data[i * 4 + 3] = 0;
    x.putImageData(ld, 0, 0);
    return layer;
  }

  Object.assign(ls, { blurred, editSync });
})();
