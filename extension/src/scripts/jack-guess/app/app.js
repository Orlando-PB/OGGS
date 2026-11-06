// Guess on Jack, part 2 of 2: turning a spot on Jack into a spot on Earth, and the wiring.
// Each region of the face stands for one country (outlines from draw-guess's geo.json) or, for
// Antarctica and the oceans, a lng/lat box of open water. Rows of the region map to the
// country's rows (in-country/rows.js), top to bottom = north to south, and along each row the
// region's pixels map to the country's land, gaps skipped, as in Guess in a country. So the top
// of Jack's nose is the north of its country.
// Talks to the page only by postMessage. Up: 'ready', 'height', 'pick' { guess } on each click
// (the page puts GeoGuessr's pin there) and 'go' on Guess. Down: 'reset' each round, 'placed'
// { ok } after a pick, and 'pin' { src }, the picture in GeoGuessr's own pin.
const { mercY, fromMercY, wrap, shapeOf, rowAt, alongRow } = countryRows;

let geo = null;
const geoReady = fetch('../../draw-guess/app/data/geo.json')
  .then(r => r.json())
  .then(g => {
    geo = g;
  });
const shapes = new Map();
const shape = code => shapes.get(code) ?? shapes.set(code, shapeOf(geo[code])).get(code);

// Where photo row y crosses region r: [[x0, x1 + 1], ...].
function runs(r, y) {
  const out = [];
  const [x0, , x1] = boxes[r];
  let start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const inside = x <= x1 && ids[y * IW + x] === r + 1;
    if (inside && start < 0) start = x;
    if (!inside && start >= 0) {
      out.push([start, x]);
      start = -1;
    }
  }
  return out;
}

// How far along the runs x is, 0..1, gaps skipped.
function fractionOf(spans, x) {
  let acc = 0;
  let all = 0;
  for (const [a, b] of spans) {
    if (x >= a) acc += Math.min(x, b) - a;
    all += b - a;
  }
  return acc / (all || 1);
}

// Photo pixel [x, y] (whole numbers, as regionAt read it) in region r -> { lat, lng }.
function toWorld(r, [x, y]) {
  const [bx0, by0, bx1, by1] = boxes[r];
  const fy = (y - by0 + 0.5) / (by1 - by0 + 1);
  const box = regions[r].box;
  if (box) {
    const [w, s, e, n] = box;
    const lat = fromMercY(mercY(n) + fy * (mercY(s) - mercY(n)));
    return { lat, lng: wrap(w + ((x - bx0 + 0.5) / (bx1 - bx0 + 1)) * (e - w)) };
  }
  // rows.js counts its rows from the south
  return alongRow(rowAt(shape(regions[r].code), 1 - fy), fractionOf(runs(r, y), x + 0.5));
}

// ---- the board ----

let stage = 'load';
let runId = 0;

function reset() {
  runId++;
  pin = null;
  $('guess').disabled = true;
  stage = 'pick';
  $('tip').textContent = 'Click where on Jack you think you are';
  fitView();
}

// Each click puts GeoGuessr's own pin down on its hidden map too ('placed' says whether it
// went down), so Guess just presses.
onPick = p => {
  const at = [Math.floor(p[0]), Math.floor(p[1])];
  const r = regionAt(at);
  if (stage !== 'pick' || r < 0) return;
  pin = at;
  $('guess').disabled = true;
  draw();
  toParent({ ggs: 'pick', guess: toWorld(r, at) });
};

function placed(ok) {
  if (stage !== 'pick' || !pin) return;
  $('guess').disabled = !ok;
  $('tip').textContent = ok
    ? 'Click where on Jack you think you are'
    : "Couldn't place the guess. Click again";
}

function submit() {
  if (stage !== 'pick' || $('guess').disabled) return;
  stage = 'done';
  $('guess').disabled = true;
  $('tip').textContent = 'Guess placed';
  toParent({ ggs: 'go' });
}
$('guess').addEventListener('click', submit);
$('fit').addEventListener('click', fitView);

window.addEventListener('keydown', e => {
  if (e.key === 'Enter') submit();
  if (e.key === '0') fitView();
});

// The board is usable once Jack and the outlines are both in.
const started = Promise.all([loaded, geoReady]);
window.addEventListener('message', e => {
  if (e.source !== parent) return;
  const d = e.data ?? {};
  if (d.ggs === 'reset') started.then(reset);
  if (d.ggs === 'placed') placed(!!d.ok);
  if (d.ggs === 'pin') setPinPicture(d.src);
});

// The page sizes the frame to the board (plus the body's 10px padding top and bottom).
const board = document.querySelector('.board');
const boardHeight = () => Math.ceil(board.getBoundingClientRect().height) + 20;
new ResizeObserver(() => toParent({ ggs: 'height', h: boardHeight() })).observe(board);
started
  .then(() => {
    reset();
    toParent({ ggs: 'ready' });
  })
  .catch(err => {
    $('tip').textContent = `Jack didn't load: ${err.message}`;
  });
