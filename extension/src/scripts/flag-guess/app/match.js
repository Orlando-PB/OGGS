// Draw the flag, part 2: loading flags.json, flags.png and the outlines, and matching the
// painting against every flag.
let data = null;
let pots = [];
const potIndex = new Map();
let flagGrids = [];
let geo = null;
let SIM = [];
let FAMILY = [];
const ready = fetch('flags.json')
  .then(r => r.json())
  .then(d => {
    data = d;
    // Pixels as little-endian RGBA words, so a palette colour is one Uint32 compare.
    pots = d.palette.map(p => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(p.hex.slice(i, i + 2), 16));
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    });
    pots.forEach((c, i) => {
      potIndex.set(c, i);
    });
    const at = name => d.palette.findIndex(p => p.name === name);
    // Colours people mix up count for part of a match.
    SIM = pots.map((_, i) => pots.map((_, j) => +(i === j)));
    const MIXED_UP = [
      ['Red', 'Maroon', 0.6],
      ['Light blue', 'Blue', 0.6],
      ['Orange', 'Yellow', 0.4],
      ['Orange', 'Red', 0.3],
    ];
    for (const [a, b, s] of MIXED_UP) {
      SIM[at(a)][at(b)] = SIM[at(b)][at(a)] = s;
    }
    FAMILY = d.palette.map((p, i) => ({ Maroon: at('Red'), Blue: at('Light blue') })[p.name] ?? i);
    flagGrids = d.flags.map(f => prep(Uint8Array.from(f.grid, Number)));
    buildPalette();
  });
const sprite = new Image();
sprite.src = 'flags.png';
// without the sprite the header just has no picture
const spriteReady = sprite.decode().catch(() => {});
const geoReady = fetch('../../draw-guess/app/data/geo.json')
  .then(r => r.json())
  .then(g => {
    geo = g;
  });

// A country's real flag in flags.png (96x64 each, data.perRow to a row).
const SPRITE_W = 96;
const SPRITE_H = 64;
function spriteAt(code) {
  const at = data.flags.findIndex(x => x.code === code);
  return [(at % data.perRow) * SPRITE_W, Math.floor(at / data.perRow) * SPRITE_H];
}

// A grid plus its half-size version (for drawings a little off), colour shares and stripes.
function prep(grid) {
  const { w, h } = data;
  const n = pots.length;
  const half = new Uint8Array((w / 2) * (h / 2));
  for (let y = 0; y < h / 2; y++) {
    for (let x = 0; x < w / 2; x++) half[y * (w / 2) + x] = halfCell(grid, w, x, y, n);
  }
  const share = new Array(n).fill(0);
  const fam = new Array(n).fill(0);
  for (const c of grid) {
    share[c] += 1 / grid.length;
    fam[FAMILY[c]] += 1 / grid.length;
  }
  return { grid, half, share, fam, stripes: changes(grid, w, h, 1) };
}

// The most common colour of the 2x2 cells under half-size cell x, y.
function halfCell(grid, w, x, y, n) {
  const v = new Array(n).fill(0);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    v[grid[(2 * y + dy) * w + 2 * x + dx]]++;
  return v.indexOf(Math.max(...v));
}

// How often the colour changes going down a column and along a row, averaged over 20 of each.
// Runs shorter than minRun don't count, so a wobbly edge isn't a stripe. This keeps thin painted
// stripes that the cell grid loses: the US with red lines on white is still striped, not white
// with a blue corner (Israel, South Korea).
function changes(cells, w, h, minRun) {
  let down = 0;
  let across = 0;
  for (let k = 0; k < 20; k++) {
    const x = Math.floor(((k + 0.5) * w) / 20);
    const y = Math.floor(((k + 0.5) * h) / 20);
    down += countChanges(i => cells[i * w + x], h, minRun);
    across += countChanges(i => cells[y * w + i], w, minRun);
  }
  return [down / 20, across / 20];
}

function countChanges(get, len, minRun) {
  let n = 0;
  let cur = get(0);
  let next = -1;
  let run = 0;
  for (let i = 1; i < len; i++) {
    const v = get(i);
    if (v === cur) {
      next = -1;
      run = 0;
      continue;
    }
    run = v === next ? run + 1 : 1;
    next = v;
    if (run >= minRun) {
      n++;
      cur = v;
      next = -1;
      run = 0;
    }
  }
  return n;
}

// Black counts half, so the outline strokes don't outvote the paint they surround.
const inkWeight = i => (data.palette[i].name === 'Black' ? 0.5 : 1);

// The painting cut into the same grid as the flags: each cell takes its most common colour.
// Every flag is stretched to this one rectangle (Switzerland's square, Nepal with white round
// it), so the paper is the only shape there is.
function paperGrid() {
  const { w, h } = data;
  const grid = new Uint8Array(w * h);
  const ink = Uint8Array.from(px, c => potIndex.get(c));
  const span = (size, k, of) => [Math.floor((size * k) / of), Math.floor((size * (k + 1)) / of)];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) grid[gy * w + gx] = paperCell(ink, span(PW, gx, w), span(PH, gy, h));
  }
  // Shares and stripes from the paint itself, which thin lines survive.
  const u = prep(grid);
  Object.assign(u, paintShares(ink));
  u.stripes = changes(ink, PW, PH, 8);
  return u;
}

function paperCell(ink, [xa, xb], [ya, yb]) {
  const v = new Array(pots.length).fill(0);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = ink[y * PW + x];
      v[i] += inkWeight(i);
    }
  }
  return v.indexOf(Math.max(...v));
}

function paintShares(ink) {
  const n = pots.length;
  const share = new Array(n).fill(0);
  const fam = new Array(n).fill(0);
  let total = 0;
  for (const i of ink) {
    const k = inkWeight(i);
    share[i] += k;
    fam[FAMILY[i]] += k;
    total += k;
  }
  return { share: share.map(v => v / total), fam: fam.map(v => v / total) };
}

const cellScore = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += SIM[a[i]][b[i]];
  return s / a.length;
};
// The same on the full grid, also with the flag moved a row up or down (counting 10% less),
// so stripes a row out of step, or red and white swapped, still line up.
function slidScore(a, b) {
  const { w, h } = data;
  let best = 0;
  for (const dy of [0, -1, 1]) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const fy = Math.min(h - 1, Math.max(0, y + dy));
      for (let x = 0; x < w; x++) s += SIM[a[y * w + x]][b[fy * w + x]];
    }
    best = Math.max(best, (s / a.length) * (dy ? 0.9 : 1));
  }
  return best;
}
const overlap = (a, b) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);
// Which colours are used at all (2%+ of the flag), however much of each. A small red circle on
// white is still Japan's colours, not Cyprus's white, orange and green.
const present = share => share.flatMap((v, i) => (v >= 0.02 ? [i] : []));
function sameColours(a, b) {
  const found = (x, y) => x.reduce((s, c) => s + Math.max(...y.map(d => SIM[c][d])), 0);
  return (found(a, b) + found(b, a)) / (a.length + b.length);
}
const near = (a, b) => 1 - Math.abs(a - b) / Math.max(a, b, 1);
const sameStripes = (a, b) => (near(a[0], b[0]) + near(a[1], b[1])) / 2;
function score(u, f) {
  const amounts = 0.5 * overlap(u.share, f.share) + 0.5 * overlap(u.fam, f.fam);
  const looks =
    0.35 * slidScore(u.grid, f.grid) +
    0.2 * cellScore(u.half, f.half) +
    0.15 * amounts +
    0.3 * sameColours(present(u.share), present(f.share));
  return 0.85 * looks + 0.15 * sameStripes(u.stripes, f.stripes);
}

// A slight, hidden lift for the round's real country (OWN points) and countries near it, like
// the outline board's. Near ones get up to NEAR points: all of it within 200 km of their border,
// fading to nothing at 800 km. It only settles close calls such as a rough US flag against
// Liberia's. A clearly different flag still wins, and the % shown stays the real one.
const OWN = 2;
const NEAR = 1.5;
const NEAR_FULL = 200;
const NEAR_ZERO = 800;
const inside = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
function lift({ lat, lng }) {
  const out = {};
  const p = [lng, lat];
  const k = Math.cos((lat * Math.PI) / 180);
  const KM = 111.2;
  for (const [code, polys] of Object.entries(geo)) {
    if (polys.some(([outer, ...holes]) => inside(p, outer) && !holes.some(h => inside(p, h)))) {
      out[code] = OWN / 100;
      continue;
    }
    const w = 1 - (Math.sqrt(closestSq(polys, lat, lng, k)) * KM - NEAR_FULL) / (NEAR_ZERO - NEAR_FULL);
    if (w > 0) out[code] = (Math.min(1, w) * NEAR) / 100;
  }
  return out;
}

// Squared distance in degrees (longitude scaled by k) to a country's nearest outer-ring point,
// wrapping round the date line.
function closestSq(polys, lat, lng, k) {
  let d2 = Infinity;
  for (const [outer] of polys) {
    for (const [x, y] of outer) {
      let dx = Math.abs(x - lng);
      if (dx > 180) dx = 360 - dx;
      d2 = Math.min(d2, (dx * k) ** 2 + (y - lat) ** 2);
    }
  }
  return d2;
}

// The country whose flag is closest to the painting.
function bestMatch() {
  const u = paperGrid();
  const lifts = answerLL ? lift(answerLL) : {};
  let best = null;
  data.flags.forEach((f, i) => {
    const s = score(u, flagGrids[i]);
    const lifted = s + (lifts[f.country ?? f.code] ?? 0);
    if (!best || lifted > best.lifted) best = { ...f, s, lifted };
  });
  return { ...best, score: Math.round(best.s * 100) };
}
