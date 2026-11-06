// Guess on Jack, part 1 of 2: Jack's face and the view of it (zoom, pan, the guess pin).
// labels.png gives every pixel of the 1840x2000 photo a region: its red channel is the index
// into regions.json plus one. Both, and jack.webp (the photo with the background and hoodie
// see-through), are made by dev/tools/jack/build.html. Drawing only; app.js does the rest.
const $ = id => document.getElementById(id);
const face = $('face');
const fctx = face.getContext('2d');
const IW = 1840;
const IH = 2000;
const MAX_ZOOM = 8;
// a press that moves less than this (canvas px) is a click, not a drag
const CLICK_SLOP = 5;

const toParent = msg => {
  if (parent !== window) parent.postMessage(msg, '*');
};

let regions = [];
// region index + 1 per pixel, row by row
let ids = null;
// each region's [x0, y0, x1, y1] in photo pixels
let boxes = [];
// the sea with the photo on top, at full size
let base = null;
// photo px -> canvas px: x + X * s
let at = { s: 1, x: 0, y: 0 };
let fitS = 1;
// the guess, in photo px
// biome-ignore lint/style/useConst: set in app.js
let pin = null;
// GeoGuessr's own pin picture (the player's avatar), sent by the page once it has one
let pinPicture = null;

const loadImage = src =>
  new Promise((done, fail) => {
    const im = new Image();
    im.onload = () => done(im);
    im.onerror = () => fail(new Error(`could not load ${src}`));
    im.src = src;
  });

const loaded = Promise.all([
  fetch('regions.json').then(r => r.json()),
  fetch('labels.png')
    .then(r => r.blob())
    // the red channel is data, so no colour conversion
    .then(b => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })),
  loadImage('jack.webp'),
]).then(([r, labels, photo]) => {
  regions = r;
  readLabels(labels);
  buildBase(photo);
  resize();
});

function readLabels(bitmap) {
  const c = new OffscreenCanvas(IW, IH);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const px = ctx.getImageData(0, 0, IW, IH).data;
  ids = new Uint8Array(IW * IH);
  boxes = regions.map(() => [IW, IH, -1, -1]);
  for (let i = 0; i < IW * IH; i++) {
    const id = px[i * 4];
    ids[i] = id;
    if (id) grow(boxes[id - 1], i % IW, (i / IW) | 0);
  }
}

function grow(b, x, y) {
  if (x < b[0]) b[0] = x;
  if (y < b[1]) b[1] = y;
  if (x > b[2]) b[2] = x;
  if (y > b[3]) b[3] = y;
}

// The sea, lighter in the middle, and Jack on it with a soft shadow.
function buildBase(photo) {
  base = document.createElement('canvas');
  base.width = IW;
  base.height = IH;
  const ctx = base.getContext('2d');
  const sea = ctx.createRadialGradient(IW / 2, IH * 0.45, IW * 0.1, IW / 2, IH * 0.5, IH * 0.75);
  sea.addColorStop(0, '#3d8bc9');
  sea.addColorStop(1, '#1d4f80');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, IW, IH);
  ctx.shadowColor = 'rgba(8, 24, 48, .55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;
  ctx.drawImage(photo, 0, 0);
}

// The region under photo pixel [x, y], or -1.
function regionAt([x, y]) {
  if (!ids || x < 0 || y < 0 || x >= IW || y >= IH) return -1;
  return ids[(y | 0) * IW + (x | 0)] - 1;
}

function draw() {
  if (!base) return;
  const { s, x, y } = at;
  fctx.clearRect(0, 0, face.width, face.height);
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(base, x, y, IW * s, IH * s);
  if (pin) drawPin(toCanvas(pin));
}

// Like GeoGuessr's guess pin: the player's picture in a white ring, its point on the spot.
// Drawn at CSS-pixel size, so it looks the same on any screen.
const PIN_R = 15;
function drawPin([cx, cy]) {
  const k = devicePixelRatio;
  const r = PIN_R * k;
  const oy = cy - r - 7 * k;
  fctx.save();
  fctx.shadowColor = 'rgba(0, 0, 0, .45)';
  fctx.shadowBlur = 6 * k;
  fctx.shadowOffsetY = 2 * k;
  fctx.fillStyle = '#fff';
  fctx.beginPath();
  fctx.moveTo(cx, cy);
  fctx.lineTo(cx - 6 * k, oy + r * 0.7);
  fctx.lineTo(cx + 6 * k, oy + r * 0.7);
  fctx.closePath();
  fctx.arc(cx, oy, r + 3 * k, 0, 2 * Math.PI);
  fctx.fill();
  fctx.restore();
  fctx.save();
  fctx.beginPath();
  fctx.arc(cx, oy, r, 0, 2 * Math.PI);
  fctx.clip();
  if (pinPicture?.complete && pinPicture.naturalWidth)
    fctx.drawImage(pinPicture, cx - r, oy - r, 2 * r, 2 * r);
  else {
    fctx.fillStyle = '#1a1b3a';
    fctx.fill();
  }
  fctx.restore();
}

function setPinPicture(src) {
  if (!src || pinPicture?.src === src) return;
  pinPicture = new Image();
  pinPicture.onload = draw;
  pinPicture.src = src;
}

const toCanvas = ([X, Y]) => [at.x + X * at.s, at.y + Y * at.s];
function toPhoto(e) {
  const r = face.getBoundingClientRect();
  const cx = ((e.clientX - r.left) / r.width) * face.width;
  const cy = ((e.clientY - r.top) / r.height) * face.height;
  return { canvas: [cx, cy], photo: [(cx - at.x) / at.s, (cy - at.y) / at.s] };
}

// The view never leaves the photo, and never zooms out past it.
function setView(s, x, y) {
  s = Math.min(fitS * MAX_ZOOM, Math.max(fitS, s));
  x = Math.min(0, Math.max(face.width - IW * s, x));
  y = Math.min(0, Math.max(face.height - IH * s, y));
  at = { s, x, y };
  draw();
}
const fitView = () => setView(fitS, 0, 0);

// The frame is 0 px while the board is hidden between rounds; the view waits for a real size.
function resize() {
  if (!face.clientWidth || !face.clientHeight) return;
  const old = fitS;
  face.width = Math.round(face.clientWidth * devicePixelRatio);
  face.height = Math.round(face.clientHeight * devicePixelRatio);
  fitS = face.width / IW;
  const k = fitS / old;
  setView(at.s * k, at.x * k, at.y * k);
}
new ResizeObserver(() => base && resize()).observe(face);

face.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const [cx, cy] = toPhoto(e).canvas;
    const s = Math.min(fitS * MAX_ZOOM, Math.max(fitS, at.s * Math.exp(-e.deltaY * 0.0015)));
    const k = s / at.s;
    setView(s, cx - (cx - at.x) * k, cy - (cy - at.y) * k);
  },
  { passive: false },
);

// Drag to pan; a press that barely moves is a click, handed to onPick (set by app.js).
let press = null;
// biome-ignore lint/style/useConst: set in app.js
let onPick = () => {};
face.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  face.setPointerCapture(e.pointerId);
  press = { start: toPhoto(e).canvas, view: at, moved: false };
});
face.addEventListener('pointermove', e => {
  if (press) drag(toPhoto(e).canvas);
});
face.addEventListener('pointerup', e => {
  const was = press;
  endPress();
  if (was && !was.moved) onPick(toPhoto(e).photo);
});
// a press taken away (touch gesture, board hidden mid-drag) ends without a click
face.addEventListener('pointercancel', endPress);
face.addEventListener('lostpointercapture', endPress);
function endPress() {
  press = null;
  face.classList.remove('panning');
}

function drag([cx, cy]) {
  const [sx, sy] = press.start;
  if (!press.moved && Math.hypot(cx - sx, cy - sy) < CLICK_SLOP) return;
  press.moved = true;
  face.classList.add('panning');
  setView(press.view.s, press.view.x + cx - sx, press.view.y + cy - sy);
}
