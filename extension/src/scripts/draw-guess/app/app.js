// Copied from country-matcher/static/index.html by tools/sync_draw.py - edit it there.
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cv = $('c'), ctx = cv.getContext('2d'), stageEl = $('stage');
const W = 900;
const PIN_D = 'M0,0 C-5,-12 -16,-19 -16,-30 A16,16 0 1 1 16,-30 C16,-19 5,-12 0,0Z';
$('pinPath').setAttribute('d', PIN_D);
const PIN_PATH = new Path2D(PIN_D);

let stage = 'draw';
let strokes = [], current = null;
let pinXY = null, pinShape = -1;   // pin on the drawing (canvas coords) + which loop it's in
let matchData = null, guess = null;
let mapsInfo = [], worldPolys = null;
let runId = 0;                     // bumps to cancel an in-flight reveal

// ================= stages =================
function setStage(s) {
  stage = s;
  stageEl.dataset.stage = s;
  document.querySelectorAll('[data-for]').forEach(el => el.hidden = !el.dataset.for.split(' ').includes(s));
  const order = ['draw', 'pin', 'reveal'];
  document.querySelectorAll('.steps li').forEach(li => {
    const i = order.indexOf(li.dataset.step), cur = order.indexOf(s);
    li.className = i === cur ? 'active' : i < cur ? 'done' : '';
  });
  cv.style.opacity = svg.node().style.opacity = '';
}

function sidePanel(html) { $('results').innerHTML = html; }
const INTRO = {
  draw: `<p class="empty">Sketch the outline of the country you think you're in, pick a map, then hit <b>Done drawing</b>.</p>`,
  pin: `<p class="empty"><b>Where in it are you?</b><br>Click inside your drawing. When you guess, the drawing snaps to the closest real country and your pin travels with it — that becomes your guess coordinate.</p>`,
};

// ================= drawing + pinning =================
function pos(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
}

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

cv.addEventListener('pointerdown', e => {
  if (stage === 'draw') {
    cv.setPointerCapture(e.pointerId);
    current = [pos(e)];
    redraw();
  } else if (stage === 'pin') {
    const p = pos(e), idx = shapes().findIndex(s => inside(p, s));
    if (idx < 0) {
      const tip = $('tip');
      tip.classList.remove('nudge'); void tip.offsetWidth; tip.classList.add('nudge');
      return;
    }
    pinXY = p; pinShape = idx;
    $('guessBtn').disabled = false;
    redraw();
  }
});
cv.addEventListener('pointermove', e => {
  if (!current) return;
  const p = pos(e), q = current[current.length - 1];
  if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2) { current.push(p); redraw(); }
});
const endStroke = () => {
  if (current && current.length > 2) strokes.push(current);
  current = null;
  redraw();
};
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);

// Join strokes whose start lands near the previous stroke's end, so an
// outline drawn in several pen-lifts becomes one loop.
function joinStrokes() {
  const JOIN = 40, out = [];
  for (const s of strokes) {
    const last = out[out.length - 1];
    if (last) {
      const a = last[last.length - 1], b = s[0], start = last[0];
      const lastClosed = Math.hypot(a[0] - start[0], a[1] - start[1]) < JOIN;
      if (!lastClosed && Math.hypot(a[0] - b[0], a[1] - b[1]) < JOIN) { last.push(...s); continue; }
    }
    out.push(s.slice());
  }
  return out;
}

// The drawing as the game sees it: loops that overlap are merged into one outline,
// loops that don't touch stay separate islands. Cached until the strokes change.
let shapeCache = {};
function shapes() {
  const last = strokes[strokes.length - 1];
  const c = shapeCache;
  if (c.strokes === strokes && c.n === strokes.length && c.last === last) return c.rings;
  const loops = joinStrokes();
  shapeCache = { strokes, n: strokes.length, last, rings: loops.length > 1 ? mergeOverlaps(loops) : loops };
  return shapeCache.rings;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function overlaps(A, B) {
  const [ax0, ay0, ax1, ay1] = bbox([A]), [bx0, by0, bx1, by1] = bbox([B]);
  if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) return false;
  if (inside(A[0], B) || inside(B[0], A)) return true;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    if (Math.max(a[0], b[0]) < bx0 || Math.min(a[0], b[0]) > bx1 || Math.max(a[1], b[1]) < by0 || Math.min(a[1], b[1]) > by1) continue;
    for (let j = 0; j < B.length; j++) if (segsCross(a, b, B[j], B[(j + 1) % B.length])) return true;
  }
  return false;
}

// Union of loops: fill them all on an offscreen canvas, then trace the outline.
let unionCanvas = null;
function traceUnion(loops) {
  unionCanvas ||= Object.assign(document.createElement('canvas'), { width: W, height: W });
  const g = unionCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, W, W);
  for (const l of loops) {
    g.beginPath();
    l.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    g.closePath(); g.fill();
  }
  const px = g.getImageData(0, 0, W, W).data, vals = new Float32Array(W * W);
  for (let i = 0; i < vals.length; i++) vals[i] = px[i * 4 + 3];
  const [mp] = d3.contours().size([W, W]).thresholds([128])(vals);
  const rings = mp.coordinates.map(poly => poly[0].slice(0, -1)).filter(r => Math.abs(signedArea(r)) > 20);
  return rings.length ? rings : loops;
}

function mergeOverlaps(loops) {
  const parent = loops.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < loops.length; i++)
    for (let j = i + 1; j < loops.length; j++)
      if (find(i) !== find(j) && overlaps(loops[i], loops[j])) parent[find(i)] = find(j);
  const groups = new Map();
  loops.forEach((l, i) => { const r = find(i); groups.has(r) ? groups.get(r).push(l) : groups.set(r, [l]); });
  return [...groups.values()].flatMap(g => g.length === 1 ? g : traceUnion(g));
}

function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

function path(pts, close) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  if (close) ctx.closePath();
}

function drawPin([x, y], alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(0, 1, 7, 2.5, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#d9480f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.fill(PIN_PATH); ctx.stroke(PIN_PATH);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, -30, 6, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
}

// ================= morph: drawing (+ pin) -> country =================
const N = 180, MORPH_MS = 1600;
let morph = null;                  // {pairs, pin: {pair, w, corr}, start}

function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
function centroid(p) { return p.reduce((c, q) => [c[0] + q[0] / p.length, c[1] + q[1] / p.length], [0, 0]); }

// N points evenly spaced along the closed outline
function resample(p) {
  const pts = p.concat([p[0]]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1, out = [];
  for (let k = 0, j = 1; k < N; k++) {
    const d = total * k / N;
    while (j < cum.length - 1 && cum[j] < d) j++;
    const t = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    out.push([pts[j - 1][0] + t * (pts[j][0] - pts[j - 1][0]), pts[j - 1][1] + t * (pts[j][1] - pts[j - 1][1])]);
  }
  return out;
}

// Same winding + best cyclic start so points travel the shortest way
function align(a, b) {
  if (Math.sign(signedArea(a)) !== Math.sign(signedArea(b))) b = b.slice().reverse();
  let best = 0, bestD = Infinity;
  for (let k = 0; k < N; k++) {
    let d = 0;
    for (let i = 0; i < N && d < bestD; i++) { const q = b[(i + k) % N]; d += (a[i][0] - q[0]) ** 2 + (a[i][1] - q[1]) ** 2; }
    if (d < bestD) { bestD = d; best = k; }
  }
  return b.slice(best).concat(b.slice(0, best));
}

// Mean value coordinates: expresses a point inside a polygon as a smooth blend
// of its vertices, so it can ride along when the polygon deforms.
function mvc(poly, x) {
  const n = poly.length, s = poly.map(v => [v[0] - x[0], v[1] - x[1]]), r = s.map(v => Math.hypot(v[0], v[1]));
  const w = new Array(n).fill(0);
  const hit = r.findIndex(d => d < 1e-9);
  if (hit >= 0) { w[hit] = 1; return w; }
  const tanHalf = s.map((a, i) => {
    const b = s[(i + 1) % n], denom = r[i] * r[(i + 1) % n] + a[0] * b[0] + a[1] * b[1];
    return (a[0] * b[1] - a[1] * b[0]) / (Math.abs(denom) < 1e-12 ? 1e-12 : denom);
  });
  let sum = 0;
  for (let i = 0; i < n; i++) { w[i] = (tanHalf[(i + n - 1) % n] + tanHalf[i]) / r[i]; sum += w[i]; }
  return w.map(v => v / sum);
}
const blend = (w, pts) => pts.reduce((acc, p, i) => [acc[0] + w[i] * p[0], acc[1] + w[i] * p[1]], [0, 0]);

function nearestOnRing(p, ring) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const q = [a[0] + t * dx, a[1] + t * dy], d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

// targets: full-detail country rings in canvas coords. Returns the pin's final canvas position.
function startMorph(targets) {
  const bySize = arr => arr.map((p, idx) => ({ pts: resample(p), full: p, idx }))
    .sort((x, y) => Math.abs(signedArea(y.pts)) - Math.abs(signedArea(x.pts)));
  const from = bySize(shapes()), to = bySize(targets);
  // the loop holding the pin must map onto a real country ring
  const pinned = from.findIndex(f => f.idx === pinShape);
  if (pinned >= to.length) [from[pinned], from[to.length - 1]] = [from[to.length - 1], from[pinned]];

  const pairs = [];
  let pin = null;
  for (let i = 0; i < Math.max(from.length, to.length); i++) {
    const f = from[i], g = to[i];
    if (f && g) {
      const pair = { a: f.pts, b: align(f.pts, g.pts) };
      if (f.idx === pinShape) {
        const w = mvc(pair.a, pinXY), raw = blend(w, pair.b);
        // the blended point can drift outside a very concave coastline; nudge it back onto land
        const end = inside(raw, g.full) ? raw : nearestOnRing(raw, g.full);
        pin = { pair, w, corr: [end[0] - raw[0], end[1] - raw[1]], end };
      }
      pairs.push(pair);
    } else if (f) { const c = centroid(f.pts); pairs.push({ a: f.pts, b: f.pts.map(() => c), fadeOut: true }); }
    else { const c = centroid(g.pts); pairs.push({ a: g.pts.map(() => c), b: g.pts, fadeIn: true }); }
  }
  morph = { pairs, pin, start: performance.now() };
  requestAnimationFrame(function tick() { redraw(); if (morph && morphT() < 1) requestAnimationFrame(tick); });
  return pin.end;
}
function morphT() { return morph ? Math.min(1, (performance.now() - morph.start) / MORPH_MS) : 1; }
const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const mix = (a, b, t) => a + (b - a) * t;
const lerpPts = (a, b, t) => a.map((p, i) => [mix(p[0], b[i][0], t), mix(p[1], b[i][1], t)]);

function redraw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.lineJoin = ctx.lineCap = 'round';
  const px = cv.width / (cv.clientWidth || cv.width);   // canvas units per CSS px
  const morphing = stage === 'reveal' && morph;
  for (const s of shapes()) {
    path(s, true);
    if (morphing) {            // original drawing stays as a faint ghost
      ctx.save(); ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(31,42,68,.28)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    } else {
      ctx.fillStyle = stage === 'pin' ? 'rgba(217,72,15,.16)' : 'rgba(217,72,15,.10)'; ctx.fill();
      ctx.strokeStyle = '#1f2a44'; ctx.lineWidth = 4; ctx.stroke();
    }
  }
  if (current) { path(current, false); ctx.strokeStyle = '#1f2a44'; ctx.lineWidth = 4; ctx.stroke(); }
  if (morphing) {
    const t = ease(morphT());
    // ink -> match blue; ends exactly like the map highlight (2px stroke)
    const stroke = `rgb(${mix(31, 28, t)|0},${mix(42, 126, t)|0},${mix(68, 214, t)|0})`;
    const fill = `rgba(${mix(217, 28, t)|0},${mix(72, 126, t)|0},${mix(15, 214, t)|0},${mix(.10, .16, t)})`;
    for (const { a, b, fadeIn, fadeOut } of morph.pairs) {
      ctx.globalAlpha = fadeOut ? 1 - t : fadeIn ? t : 1;
      path(lerpPts(a, b, t), true);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = mix(4, 2 * px, t); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const { pair, w, corr } = morph.pin, p = blend(w, lerpPts(pair.a, pair.b, t));
    drawPin([p[0] + corr[0] * t, p[1] + corr[1] * t]);
  } else if (pinXY && stage !== 'draw') {
    drawPin(pinXY);
  }
}

// ================= map =================
const svg = d3.select('#map'), zoomLayer = d3.select('#zoomLayer');
const projection = d3.geoMercator().scale(W / (2 * Math.PI)).translate([W / 2, W / 2]);
const geoPath = d3.geoPath(projection);
let T = d3.zoomIdentity, interactive = false, rotation = null;

const zoom = d3.zoom()
  .scaleExtent([1, 20000])
  .translateExtent([[0, 0], [W, W]])
  .filter(e => interactive && (!e.ctrlKey || e.type === 'wheel') && !e.button)
  .on('zoom', e => { T = e.transform; zoomLayer.attr('transform', T); placePin(); });
svg.call(zoom).on('dblclick.zoom', null);

// d3 needs clockwise exteriors; if a feature covers more than a hemisphere, it's inside-out.
function fixWinding(f) {
  if (d3.geoArea(f) > 2 * Math.PI) f.coordinates.forEach(poly => poly.forEach(r => r.reverse()));
  return f;
}

function setRotation(r) {
  if (r === rotation) return;
  rotation = r;
  projection.rotate([r, 0]);
  $('grat').setAttribute('d', geoPath(d3.geoGraticule10()));
  d3.select('#land').selectAll('path').data(worldPolys).join('path').attr('d', geoPath);
}

function placePin() {
  const pin = d3.select('#pin');
  if (!guess) { pin.attr('visibility', 'hidden'); return; }
  const [x, y] = T.apply(projection([guess.lng, guess.lat]));
  pin.attr('visibility', 'visible').attr('transform', `translate(${x},${y})`);
}

// zoom transform that fits a projected box [x0,y0,x1,y1] into the given screen box
function fitBox([x0, y0, x1, y1], [sx0, sy0, sx1, sy1] = [0, 0, W, W], maxK = 20000) {
  const k = Math.min((sx1 - sx0) / Math.max(x1 - x0, 1e-9), (sy1 - sy0) / Math.max(y1 - y0, 1e-9), maxK);
  return d3.zoomIdentity.translate((sx0 + sx1) / 2 - k * (x0 + x1) / 2, (sy0 + sy1) / 2 - k * (y0 + y1) / 2).scale(k);
}

// Russia, Fiji etc. straddle 180°: spin the globe so the country sits in the middle.
function rotationFor(rings) {
  const lons = rings.flat().map(p => p[0]);
  if (Math.max(...lons) - Math.min(...lons) <= 180) return 0;
  const shifted = lons.map(l => l < 0 ? l + 360 : l);
  const c = (Math.min(...shifted) + Math.max(...shifted)) / 2;
  return -(c > 180 ? c - 360 : c);
}

const worldReady = fetch('/api/world').then(r => r.json()).then(polys => {
  worldPolys = polys.map(c => fixWinding({ type: 'MultiPolygon', coordinates: c }));
  setRotation(0);
});

// ================= flow =================
function enterPin() {
  if (!shapes().length) return;
  pinXY = null; pinShape = -1;
  $('guessBtn').disabled = true;
  setStage('pin');
  redraw();
  sidePanel(INTRO.pin);
}

async function submitGuess() {
  if (!pinXY) return;
  const btn = $('guessBtn');
  btn.disabled = true; btn.textContent = 'Matching…';
  try {
    const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strokes: shapes(), map: $('mapSel').value }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    matchData = data;
    await worldReady;
    reveal();
  } catch (err) {
    sidePanel(`<p class="empty">${esc(err.message)}</p>`);
  } finally {
    btn.disabled = false; btn.textContent = 'Guess';
  }
}

async function reveal() {
  const id = ++runId, alive = () => id === runId;
  interactive = false;
  svg.interrupt();
  const top = matchData.results[0];
  const matchFeat = fixWinding({ type: 'MultiPolygon', coordinates: top.geo_match.map(r => [r]) });
  const allFeat = fixWinding({ type: 'MultiPolygon', coordinates: top.geo });

  guess = null;
  morph = null;
  $('reveal').classList.remove('show');
  $('hl').innerHTML = '';
  setStage('reveal');
  svg.node().style.opacity = 0; cv.style.opacity = 1;
  placePin();
  sidePanel(`<p class="empty">Snapping to the map…</p>`);

  // Put the country on the (hidden) map exactly where the drawing is, and morph onto it
  setRotation(rotationFor(top.geo_match));
  const [dx0, dy0, dx1, dy1] = bbox(shapes());
  const [[bx0, by0], [bx1, by1]] = geoPath.bounds(matchFeat);
  const bw = bx1 - bx0, bh = by1 - by0;
  const k0 = Math.max(1, Math.min(Math.sqrt(((dx1 - dx0) * (dy1 - dy0)) / (bw * bh)), 0.92 * W / bw, 0.92 * W / bh, 20000));
  const T0 = d3.zoomIdentity.translate((dx0 + dx1) / 2 - k0 * (bx0 + bx1) / 2, (dy0 + dy1) / 2 - k0 * (by0 + by1) / 2).scale(k0);
  zoom.transform(svg, T0);
  d3.select('#hl').append('path').datum(allFeat).attr('d', geoPath);

  const targets = top.geo_match.map(r => r.map(p => T0.apply(projection(p))));
  const pinEnd = startMorph(targets);
  const [lng, lat] = projection.invert(T0.invert(pinEnd));
  guess = { lat, lng, code: top.code, country: top.name, shapeScore: top.score };

  await sleep(MORPH_MS + 300); if (!alive()) return;

  // hand off: map fades in under the morphed shape, the pin carries over
  placePin();
  svg.node().style.opacity = 1; cv.style.opacity = 0;
  await sleep(800); if (!alive()) return;

  // fly out to show the country in context
  const [[x0, y0], [x1, y1]] = geoPath.bounds(matchFeat);
  const MIN = 70, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;      // never zoom tighter than ~28° across
  const hw = Math.max((x1 - x0) / 2, MIN / 2), hh = Math.max((y1 - y0) / 2, MIN / 2);
  const T1 = fitBox([cx - hw, cy - hh, cx + hw, cy + hh], [60, 50, W - 60, W * 0.7]);
  try { await svg.transition().duration(2600).ease(d3.easeCubicInOut).call(zoom.transform, T1).end(); } catch { return; }
  if (!alive()) return;

  d3.select('#hl path').classed('pulse', true);
  showCard(top, guess);
  showResults(matchData);
  interactive = true;
  // Hook for a future GeoGuessr integration: listen for this to submit the coordinate.
  window.dispatchEvent(new CustomEvent('drawguess:guess', { detail: guess }));
}

const fmtCoord = ({ lat, lng }) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

function showCard(top, g) {
  $('rName').innerHTML = [...top.name].map((ch, i) =>
    `<span style="animation-delay:${250 + i * 45}ms">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
  $('rShape').textContent = top.score + '%';
  $('rCoord').textContent = fmtCoord(g);
  $('reveal').classList.add('show');
}

// ================= side panel results =================
function svgFor(outline) {
  let [minx, miny, maxx, maxy] = bbox(outline);
  const pad = 2, w = maxx - minx + 2 * pad, h = maxy - miny + 2 * pad, s = Math.max(w, h);
  const vb = `${minx - pad - (s - w) / 2} ${miny - pad - (s - h) / 2} ${s} ${s}`;
  const d = outline.map(r => 'M' + r.map(p => p.join(',')).join('L') + 'Z').join('');
  return `<svg viewBox="${vb}"><path class="shape" vector-effect="non-scaling-stroke" d="${d}"/></svg>`;
}

function verdict(score) {
  if (score >= 75) return 'Cartographer-grade. Nailed it.';
  if (score >= 60) return 'Pretty convincing!';
  if (score >= 45) return 'If you squint…';
  if (score >= 30) return 'A bold interpretation.';
  return 'The algorithm is doing its best here.';
}

function showResults(data) {
  const [top, ...rest] = data.results;
  sidePanel(`
    <h2>Best shape match</h2>
    <div class="winner">
      ${svgFor(top.outline)}
      <div class="name">${esc(top.name)}</div>
      <div class="score">${top.score}% shape overlap · ${esc(top.variant)}</div>
      <div class="verdict">${verdict(top.score)}</div>
    </div>
    <h2>Runners-up</h2>
    ${rest.map((r, i) => `
      <div class="row">
        <div class="rank">${i + 2}</div>
        ${svgFor(r.outline)}
        <div><div class="n">${esc(r.name)}</div><div class="v">${esc(r.variant)}</div>
             <div class="bar"><i style="width:${r.score}%"></i></div></div>
        <div class="pct">${r.score}%</div>
      </div>`).join('')}`);
}

// ================= controls =================
function backToDraw(clearDrawing) {
  runId++; morph = null; guess = null; pinXY = null; interactive = false; svg.interrupt();
  if (clearDrawing) strokes = [];
  $('reveal').classList.remove('show');
  setStage('draw');
  redraw();
  sidePanel(INTRO.draw);
}

$('done').onclick = enterPin;
$('undo').onclick = () => { strokes.pop(); redraw(); };
$('clear').onclick = () => { strokes = []; redraw(); };
$('guessBtn').onclick = submitGuess;
$('back').onclick = () => backToDraw(false);
$('again').onclick = () => backToDraw(true);
$('replay').onclick = () => reveal();
$('copy').onclick = async () => {
  if (!guess) return;
  try { await navigator.clipboard.writeText(`${guess.lat.toFixed(6)}, ${guess.lng.toFixed(6)}`); $('copy').textContent = 'Copied!'; }
  catch { $('copy').textContent = 'Copy failed'; }
  setTimeout(() => $('copy').textContent = 'Copy coordinates', 1400);
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (stage === 'draw' && (e.metaKey || e.ctrlKey) && e.key === 'z') { strokes.pop(); redraw(); }
  if (e.key === 'Enter') {
    if (stage === 'draw') enterPin();
    else if (stage === 'pin') submitGuess();
  }
});
window.addEventListener('resize', redraw);

fetch('/api/maps').then(r => r.json()).then(maps => {
  mapsInfo = maps;
  const sel = $('mapSel');
  sel.innerHTML = maps.map(m => `<option value="${m.id}">${esc(m.label)} · ${m.count}</option>`).join('');
  try { const saved = localStorage.getItem('map'); if (saved && maps.some(m => m.id === saved)) sel.value = saved; } catch {}
  sel.onchange = () => { try { localStorage.setItem('map', sel.value); } catch {} };
});

setStage('draw');
sidePanel(INTRO.draw);
redraw();
