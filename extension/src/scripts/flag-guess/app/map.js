// Draw the flag, part 3: the map the guess is clicked into, and the zoom out to the answer.
const pick = $('pick');
const kctx = pick.getContext('2d');
const view = null;
const pin = null;

// Mercator, like GeoGuessr's own map, in degree-sized units (y down). Land is projected once
// into Path2Ds, plus a lighter copy for zoomed-out views. view.at turns these units into canvas
// pixels (x + X * s, y + Y * s), so zooming never projects again. Land is drawn again one world
// to either side, so views across the antimeridian stay whole.
const DEG = Math.PI / 180;
const WORLD = 360;
const mercY = lat => -Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * DEG) / 2)) / DEG;
const bounds = pts => {
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
// the coarse copy drops points under 0.2 units apart, used below 4 px a unit
const COARSE = 0.2;
const COARSE_BELOW = 4;
let lands = null;
function buildLands() {
  lands = [];
  for (const [code, polys] of Object.entries(geo)) {
    for (const poly of polys) {
      const rings = poly.map(r => r.map(([lng, lat]) => [lng, mercY(lat)]));
      lands.push({ code, ...landPaths(rings), first: rings[0][0], box: bounds(rings[0]) });
    }
  }
}

function landPaths(rings) {
  const fine = new Path2D();
  const coarse = new Path2D();
  for (const r of rings) {
    r.forEach(([x, y], i) => {
      if (i) fine.lineTo(x, y);
      else fine.moveTo(x, y);
    });
    let last = r[0];
    coarse.moveTo(...last);
    for (const p of r) {
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < COARSE) continue;
      coarse.lineTo(...p);
      last = p;
    }
    fine.closePath();
    coarse.closePath();
  }
  return { fine, coarse };
}

// The matched country fills the middle half of the view at first, so its neighbours and coast
// show round it and a guess can go just over the border or out to sea. A country across the
// antimeridian (Russia, Fiji) has its western longitudes moved +360.
function makeView(code) {
  if (!lands) buildLands();
  const all = geo[code].flat(2);
  const wrap = all.some(p => p[0] > 150) && all.some(p => p[0] < -150);
  const wrapX = x => (wrap && x < 0 ? x + WORLD : x);
  const proj = ([lng, lat]) => [wrapX(lng), mercY(lat)];
  // The zoom that puts box [x0, y0, x1, y1] in the middle `fill` of the canvas.
  const fit = ([x0, y0, x1, y1], fill) => {
    const s = fill * Math.min(pick.width / (x1 - x0 || 1e-3), pick.height / (y1 - y0 || 1e-3));
    return { s, x: pick.width / 2 - ((x0 + x1) / 2) * s, y: pick.height / 2 - ((y0 + y1) / 2) * s };
  };
  const box = bounds(all.map(proj));
  const back = ([X, Y]) => ({
    lat: (2 * Math.atan(Math.exp(-Y * DEG)) - Math.PI / 2) / DEG,
    lng: ((X + 540) % WORLD) - 180,
  });
  return {
    mine: lands.filter(l => l.code === code),
    others: lands.filter(l => l.code !== code),
    box,
    wrapX,
    proj,
    fit,
    back,
    start: fit(box, 0.5),
  };
}
const toScreen = ([X, Y], at = view.at) => [at.x + X * at.s, at.y + Y * at.s];
const fromScreen = ([x, y], at = view.at) => [(x - at.x) / at.s, (y - at.y) / at.s];

// The visible copies of some lands as one path in canvas pixels, so lines keep their width.
function landPath(list) {
  const { s, x, y } = view.at;
  const [vx0, vy0] = fromScreen([0, 0]);
  const [vx1, vy1] = fromScreen([pick.width, pick.height]);
  const key = s < COARSE_BELOW ? 'coarse' : 'fine';
  const out = new Path2D();
  for (const d of [-WORLD, 0, WORLD]) {
    const m = new DOMMatrix([s, 0, 0, s, x + d * s, y]);
    for (const l of list) {
      if (l.box[2] + d < vx0 || l.box[0] + d > vx1 || l.box[3] < vy0 || l.box[1] > vy1) continue;
      out.addPath(l[key], m);
    }
  }
  return out;
}

// In a country made of specks (Maldives, Tuvalu), each speck gets a ring round it. This returns
// their centres in canvas pixels. Specks are judged at the starting zoom, so zooming out after
// the guess doesn't ring a big country's small islands.
const SPECK_R = 12;
function specks() {
  const span = l => Math.max(l.box[2] - l.box[0], l.box[3] - l.box[1]) * view.start.s;
  if (Math.max(...view.mine.map(span)) >= 60) return [];
  return view.mine.filter(l => span(l) < 8).map(l => toScreen([view.wrapX(l.first[0]), l.first[1]]));
}

// With "guess must go inside the matched country" on, a click counts only on that country:
// inside it, within a few pixels of its border, or inside a speck's ring.
const BORDER_SLACK = 4;
function inCountry([x, y]) {
  const mine = landPath(view.mine);
  kctx.save();
  kctx.lineWidth = 2 * BORDER_SLACK;
  const hit =
    kctx.isPointInPath(mine, x, y, 'evenodd') ||
    kctx.isPointInStroke(mine, x, y) ||
    specks().some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= SPECK_R);
  kctx.restore();
  return hit;
}

function drawPick() {
  kctx.clearRect(0, 0, pick.width, pick.height);
  kctx.lineJoin = 'round';
  // the neighbours, as plain land
  const others = landPath(view.others);
  kctx.fillStyle = '#ece6d6';
  kctx.fill(others, 'evenodd');
  kctx.strokeStyle = '#b9ae94';
  kctx.lineWidth = 1;
  kctx.stroke(others);
  const mine = landPath(view.mine);
  kctx.fillStyle = 'rgba(81,207,102,.55)';
  kctx.fill(mine, 'evenodd');
  kctx.strokeStyle = '#2b8a3e';
  kctx.lineWidth = 2;
  kctx.stroke(mine);
  kctx.lineWidth = 1.5;
  for (const [cx, cy] of specks()) {
    kctx.beginPath();
    kctx.arc(cx, cy, SPECK_R, 0, 2 * Math.PI);
    kctx.stroke();
  }
  // marks is ../../draw-guess/app/marks.js
  if (pin) marks.drawPin(kctx, toScreen(pin));
  if (answerAt) marks.drawAnswer(kctx, toScreen(pin), toScreen(answerAt));
}

// After the guess: the flag on the round's real spot, a dashed line to it from the pin, and a
// zoom out until both and the matched country are in view. The guess is already on GeoGuessr's
// (hidden) map by then and can't change.
const ZOOM_MS = 2600;
let answerAt = null;
let runId = 0;
function showAnswer() {
  const run = ++runId;
  if (!answerLL) return Promise.resolve(true);
  const a = view.proj([answerLL.lng, answerLL.lat]);
  // the copy nearest the pin
  a[0] += Math.round((pin[0] - a[0]) / WORLD) * WORLD;
  answerAt = a;
  const from = view.at;
  const to = answerZoom(a, from);
  // Scale moves geometrically and the centre with 1/scale, so the zoom looks steady.
  const centre = at => fromScreen([pick.width / 2, pick.height / 2], at);
  const c0 = centre(from);
  const c1 = centre(to);
  const start = performance.now();
  return new Promise(done => {
    const frame = now => {
      // a new round reset the board meanwhile
      if (run !== runId) return done(false);
      const t = easeCubic(Math.min(1, (now - start) / ZOOM_MS));
      const s = from.s * (to.s / from.s) ** t;
      const u = to.s === from.s ? t : (1 / s - 1 / from.s) / (1 / to.s - 1 / from.s);
      const c = [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u];
      view.at = { s, x: pick.width / 2 - c[0] * s, y: pick.height / 2 - c[1] * s };
      drawPick();
      if (t < 1) requestAnimationFrame(frame);
      else done(true);
    };
    requestAnimationFrame(frame);
  });
}

// The view that takes in the matched country, the pin and the answer at a, never zooming in.
function answerZoom(a, from) {
  const [x0, y0, x1, y1] = view.box;
  const box = [
    Math.min(x0, pin[0], a[0]),
    Math.min(y0, pin[1], a[1]),
    Math.max(x1, pin[0], a[0]),
    Math.max(y1, pin[1], a[1]),
  ];
  const to = view.fit(box, 0.75);
  if (to.s > from.s) Object.assign(to, view.fit(box, (0.75 * from.s) / to.s));
  return to;
}

const easeCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
