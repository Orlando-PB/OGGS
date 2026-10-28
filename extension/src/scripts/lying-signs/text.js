// Lying signs: writing the new word. Seeded randomness, choosing a word that fits a box, and
// drawing it (or Minecraft glyphs) onto a canvas. Shared on ggs.lyingSigns.
(() => {
  const ls = globalThis.__ggs.lyingSigns;
  const { GALACTIC } = ls.words;

  // Randomness seeded on a sign's place in the panorama, so it reads the same at every zoom.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Random enchanting-table letters filling box b, in the context's fill colour.
  function drawGalactic(g, b, rand = Math.random) {
    const h = b.h * 0.72;
    const adv = h * 0.62;
    const gap = h * 0.16;
    const n = Math.max(1, Math.floor((b.w - 2) / adv));
    const x0 = b.x + (b.w - n * adv + gap) / 2;
    const y0 = b.y + (b.h - h) / 2;
    g.lineWidth = Math.max(1, h * 0.11);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    for (let i = 0; i < n; i++) {
      const glyph = GALACTIC[Math.floor(rand() * GALACTIC.length)];
      drawGlyph(g, glyph, x0 + i * adv, y0, (adv - gap) / 10, h / 10);
    }
  }
  function drawGlyph(g, glyph, gx, y0, sx, sy) {
    for (const line of glyph) {
      g.beginPath();
      if (line.length === 1) {
        g.arc(gx + line[0][0] * sx, y0 + line[0][1] * sy, g.lineWidth * 0.7, 0, 7);
        g.fill();
        continue;
      }
      line.forEach(([x, y], k) => {
        (k ? g.lineTo : g.moveTo).call(g, gx + x * sx, y0 + y * sy);
      });
      g.stroke();
    }
  }

  const measurer = new OffscreenCanvas(1, 1).getContext('2d');
  const segmenter = new Intl.Segmenter();
  const graphemes = word => [...segmenter.segment(word)].map(g => g.segment).filter(g => g.trim());

  // Of a few seeded words, the one that best fills a box of this shape (`aspect` = width /
  // height) at this letter height (`textH`, a fraction of the box height). Chosen once per
  // sign so every zoom writes the same word. `stacked` is for a vertical sign: the characters
  // go one under another, upright.
  function chooseWord(textH, aspect, pick, stacked) {
    measurer.font = 'bold 100px sans-serif';
    let best = null;
    for (let k = 0; k < 6; k++) {
      const word = pick();
      const fill =
        (aspect * 0.92) / (stacked ? graphemes(word).length * textH * 1.1 : levelWidth(word, textH));
      if (!best || Math.abs(Math.log(fill)) < Math.abs(Math.log(best.fill))) best = { word, fill };
    }
    return { word: best.word, stacked };
  }
  // A word's width written level with letters textH tall, in the same units as textH.
  function levelWidth(word, textH) {
    const m = measurer.measureText(word);
    const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
    return (m.width * textH) / gh;
  }

  // Writes a chosen word centred at (cx, cy) with letters textH px tall, stretched a little
  // to fill boxW, shrunk if it still doesn't fit.
  function writeWord(t, cx, cy, textH, boxW, { word, stacked }) {
    if (stacked) {
      writeStacked(t, cx, cy, textH, boxW, word);
      return;
    }
    t.font = 'bold 100px sans-serif';
    let m = t.measureText(word);
    const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
    const width = (m.width * textH) / gh;
    const sx = Math.min(1.25, Math.max(0.75, (boxW * 0.92) / width));
    let size = (100 * textH) / gh;
    if (width * sx > boxW) size *= boxW / (width * sx);
    t.font = `bold ${size}px sans-serif`;
    m = t.measureText(word);
    t.save();
    t.translate(cx, cy);
    t.scale(sx, 1);
    t.fillText(word, -m.width / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    t.restore();
  }
  // A vertical sign: one character under another, each turned to read along the box.
  function writeStacked(t, cx, cy, textH, boxW, word) {
    const chars = graphemes(word);
    const step = Math.min(textH * 1.1, (boxW * 0.92) / chars.length);
    t.font = `bold ${step / 1.1}px sans-serif`;
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      t.save();
      t.translate(cx + (i - (chars.length - 1) / 2) * step, cy);
      t.rotate(-Math.PI / 2);
      t.fillText(ch, 0, 0);
      t.restore();
    });
  }

  Object.assign(ls, { hash, rng, drawGalactic, chooseWord, writeWord });
})();
