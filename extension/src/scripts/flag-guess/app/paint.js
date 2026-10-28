// Draw the flag, part 1 of 5 (see index.html for the order): the paper, brushes, fill, undo and
// palette. The board's files share plain top-level names, like draw-guess's app.js.
const $ = id => document.getElementById(id);
const paper = $('paper');
const pctx = paper.getContext('2d');
const PW = paper.width;
const PH = paper.height;
// px is the painting, as the pixels of img (little-endian RGBA words).
const img = pctx.createImageData(PW, PH);
const px = new Uint32Array(img.data.buffer);
// line radii in paper pixels
const WIDTHS = { fine: 2, medium: 6, thick: 16 };
const MAX_UNDO = 30;

const toParent = msg => {
  if (parent !== window) parent.postMessage(msg, '*');
};
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

let tool = 'medium';
let color = 0;
let undo = [];
let redo = [];
let drawing = null;

function clearPaper() {
  px.fill(pots[0]);
  undo = [];
  redo = [];
  show();
}
function show() {
  pctx.putImageData(img, 0, 0);
  $('match').disabled = !data || px.every(c => c === pots[0]);
  $('undo').disabled = !undo.length;
  $('redo').disabled = !redo.length;
}
// Each step saves the painting before it. A new step drops anything undone.
const snapshot = () => px.slice();
const saveUndo = () => {
  undo.push(snapshot());
  if (undo.length > MAX_UNDO) undo.shift();
  redo = [];
};
function step(from, to) {
  const s = from.pop();
  if (!s) return;
  to.push(snapshot());
  px.set(s);
  show();
}

function stamp(cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= PH) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      if (x >= 0 && x < PW && dx * dx + dy * dy <= r * r + r) px[y * PW + x] = c;
    }
  }
}
function line([x0, y0], [x1, y1], r, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    stamp(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), r, c);
  }
}

// Scanline flood fill, exact colour (strokes aren't anti-aliased, so there are no fringes).
function flood(x, y, c) {
  const target = px[y * PW + x];
  if (target === c) return;
  const stack = [[x, y]];
  while (stack.length) fillSpan(stack, target, c);
}

// Fills the run of target colour through the next seed, queueing a seed for each run that
// touches it in the rows above and below.
function fillSpan(stack, target, c) {
  let [sx, sy] = stack.pop();
  while (sx > 0 && px[sy * PW + sx - 1] === target) sx--;
  let up = false;
  let down = false;
  for (; sx < PW && px[sy * PW + sx] === target; sx++) {
    px[sy * PW + sx] = c;
    if (sy > 0) up = seed(stack, sx, sy - 1, target, up);
    if (sy < PH - 1) down = seed(stack, sx, sy + 1, target, down);
  }
}

// Queues x, y if it starts a run of target colour; returns whether it's in one.
function seed(stack, x, y, target, inRun) {
  const same = px[y * PW + x] === target;
  if (same && !inRun) stack.push([x, y]);
  return same;
}

const paperPos = e => {
  const r = paper.getBoundingClientRect();
  return [
    Math.floor(((e.clientX - r.left) / r.width) * PW),
    Math.floor(((e.clientY - r.top) / r.height) * PH),
  ];
};

paper.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !data) return;
  const p = paperPos(e);
  saveUndo();
  if (tool === 'fill') {
    flood(...p, pots[color]);
    show();
    return;
  }
  paper.setPointerCapture(e.pointerId);
  drawing = p;
  line(p, p, WIDTHS[tool], pots[color]);
  show();
});
paper.addEventListener('pointermove', e => {
  if (!drawing) return;
  // Released outside the iframe: no pointerup arrives, so stop on the first buttonless move.
  if (!(e.buttons & 1)) {
    drawing = null;
    return;
  }
  const p = paperPos(e);
  line(drawing, p, WIDTHS[tool], pots[color]);
  drawing = p;
  show();
});
const endStroke = () => {
  drawing = null;
};
paper.addEventListener('pointerup', endStroke);
paper.addEventListener('pointercancel', endStroke);
window.addEventListener('contextmenu', e => e.preventDefault());

function setTool(t) {
  tool = t;
  for (const id of ['fine', 'medium', 'thick', 'fill']) $(id).classList.toggle('on', id === t);
  paper.classList.toggle('fill', t === 'fill');
}
function setColor(i) {
  color = i;
  document.querySelectorAll('.swatch').forEach((s, j) => {
    s.classList.toggle('on', j === i);
  });
}
function buildPalette() {
  const swatch = (p, i) =>
    `<button class="swatch" style="background:${p.hex}" title="${esc(p.name)} (${i + 1})"></button>`;
  $('palette').innerHTML = data.palette.map(swatch).join('');
  $('palette')
    .querySelectorAll('.swatch')
    .forEach((s, i) => {
      s.addEventListener('click', () => setColor(i));
    });
  setColor(data.palette.findIndex(p => p.name === 'Blue'));
  clearPaper();
}
for (const t of ['fine', 'medium', 'thick', 'fill']) $(t).addEventListener('click', () => setTool(t));
$('undo').addEventListener('click', () => step(undo, redo));
$('redo').addEventListener('click', () => step(redo, undo));
$('clear').addEventListener('click', () => {
  saveUndo();
  px.fill(pots[0]);
  show();
});
