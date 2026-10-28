// Draw the flag, part 4: the painted flag going up a pole and turning into the matched one.
const pole = $('pole');
const octx = pole.getContext('2d');
// ms the flag waves for
const WAVE = 3600;
// the painting turns into the matched flag square by square, from 1.2 s for 1.4 s
const MORPH_FROM = 1200;
const MORPH_MS = 1400;
const MORPH_COLS = 24;
const MORPH_ROWS = 16;
const INK = '#3b4459';
const LINE = 2;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = t => Math.min(1, Math.max(0, t));
// Off-screen buffers for the flag and its outline (see flag()).
const fbuf = document.createElement('canvas');
const sil = document.createElement('canvas');
fbuf.width = sil.width = pole.width;
fbuf.height = sil.height = pole.height;
const fctx = fbuf.getContext('2d');
const sctx = sil.getContext('2d');

// Flat fills with a thin ink outline, no gradients.
function blob(draw, fill, width = LINE) {
  octx.beginPath();
  draw();
  octx.fillStyle = fill;
  octx.fill();
  octx.lineWidth = width;
  octx.strokeStyle = INK;
  octx.stroke();
}
const hillTop = (x, cx, cy, rx, ry) => cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));

// A quiet countryside in muted colours: pale sky, low sun, two slow clouds, three layers of
// hills with a few trees, and the pole on the nearest one. Returns where the pole meets the
// ground.
function scene(W, H, poleX, top, secs) {
  octx.fillStyle = '#e4eeed';
  octx.fillRect(0, 0, W, H);
  blob(() => octx.arc(W * 0.8, H * 0.3, 30, 0, 2 * Math.PI), '#f1d38e');
  for (const [x0, y, s] of [
    [0.55, 0.14, 1],
    [0.12, 0.3, 0.75],
  ]) {
    cloud(((x0 * W + secs * 6 * s) % (W + 240)) - 120, y * H, s);
  }
  const far = [W * 0.75, H * 1.25, W * 0.7, H * 0.6];
  const mid = [W * 0.05, H * 1.3, W * 0.65, H * 0.55];
  const front = [W * 0.3, H * 1.4, W * 0.9, H * 0.6];
  blob(() => octx.ellipse(...far, 0, 0, 2 * Math.PI), '#bccfa9');
  // small round trees along the far hill's crest
  for (const u of [0.62, 0.68, 0.9]) tree(u * W, hillTop(u * W, ...far) + 4);
  blob(() => octx.ellipse(...mid, 0, 0, 2 * Math.PI), '#a5c093');
  blob(() => octx.ellipse(...front, 0, 0, 2 * Math.PI), '#8bb07c');
  const ground = hillTop(poleX, ...front) + 12;
  blob(() => octx.roundRect(poleX - 4, top, 8, ground - top, 4), '#f4efe6');
  blob(() => octx.arc(poleX, top - 5, 7, 0, 2 * Math.PI), '#d4a84a');
  return ground;
}

function cloud(x, cy, s) {
  blob(() => {
    octx.moveTo(x - 60 * s, cy + 10 * s);
    octx.bezierCurveTo(x - 60 * s, cy - 8 * s, x - 34 * s, cy - 10 * s, x - 24 * s, cy - 4 * s);
    octx.bezierCurveTo(x - 16 * s, cy - 24 * s, x + 18 * s, cy - 24 * s, x + 24 * s, cy - 6 * s);
    octx.bezierCurveTo(x + 44 * s, cy - 10 * s, x + 60 * s, cy, x + 58 * s, cy + 10 * s);
    octx.closePath();
  }, '#fbf8f1');
}

function tree(x, y) {
  octx.lineWidth = LINE;
  octx.strokeStyle = INK;
  octx.beginPath();
  octx.moveTo(x, y);
  octx.lineTo(x, y - 14);
  octx.stroke();
  blob(() => octx.ellipse(x, y - 22, 9, 12, 0, 0, 2 * Math.PI), '#8fae7c');
}

// The painting in thin vertical slices, each bobbing on a sine wave that grows towards the free
// end, then outlined in ink so it matches the scene. The outline is the flag's silhouette
// stamped around it.
function flag(src, x, y, w, h, amp, secs) {
  const N = 48;
  const sw = src.width;
  const sh = src.height;
  fctx.clearRect(0, 0, fbuf.width, fbuf.height);
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const dy = amp * u * Math.sin(2 * Math.PI * (u * 1.3 - secs * 1.5));
    fctx.drawImage(src, u * sw, 0, sw / N, sh, x + u * w, y + dy, w / N + 0.6, h);
  }
  sctx.globalCompositeOperation = 'copy';
  sctx.drawImage(fbuf, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = INK;
  sctx.fillRect(0, 0, sil.width, sil.height);
  // stamped on a square of whole-pixel offsets, so corners stay square and fully inked
  const d = LINE;
  for (let dy = -d; dy <= d; dy += d) {
    for (let dx = -d; dx <= d; dx += d) octx.drawImage(sil, dx, dy);
  }
  octx.drawImage(fbuf, 0, 0);
}

// The flag on the pole: the painting, with the matched flag's squares drawn over it as k goes
// from 0 to 1. The squares' random order is fixed for each raise.
const mix = document.createElement('canvas');
const mctx = mix.getContext('2d');
mix.width = PW;
mix.height = PH;
function morph(order, sx, sy, k) {
  mctx.drawImage(paper, 0, 0);
  const n = Math.round(k * order.length);
  const cw = PW / MORPH_COLS;
  const ch = PH / MORPH_ROWS;
  const scw = SPRITE_W / MORPH_COLS;
  const sch = SPRITE_H / MORPH_ROWS;
  for (let j = 0; j < n; j++) {
    const c = order[j] % MORPH_COLS;
    const r = Math.floor(order[j] / MORPH_COLS);
    mctx.drawImage(sprite, sx + c * scw, sy + r * sch, scw, sch, c * cw, r * ch, cw + 0.5, ch + 0.5);
  }
  return mix;
}

let skipRaise = false;
pole.addEventListener('pointerdown', () => {
  skipRaise = true;
});
// The scene fades in with the painted flag already at the top of the pole. It starts still,
// picks up the wind, then turns into the matched country's flag.
function raise(best) {
  // otherwise last round's flag would show for a frame
  octx.clearRect(0, 0, pole.width, pole.height);
  setStage('raise');
  pole.classList.remove('out');
  skipRaise = false;
  const W = pole.width;
  const H = pole.height;
  const poleX = W * 0.3;
  const top = H * 0.14;
  const fit = Math.min((W * 0.38) / PW, (H * 0.4) / PH);
  const fw = PW * fit;
  const fh = PH * fit;
  const [sx, sy] = spriteAt(best.code);
  const order = [...Array(MORPH_COLS * MORPH_ROWS).keys()].sort(() => Math.random() - 0.5);
  const t0 = performance.now();
  return new Promise(done => {
    const frame = now => {
      const t = now - t0;
      const secs = t / 1000;
      octx.globalAlpha = clamp01(t / 400);
      const ground = scene(W, H, poleX, top, secs);
      // the rope, from the pole's top to its foot
      octx.strokeStyle = INK;
      octx.lineWidth = 1.2;
      octx.beginPath();
      octx.moveTo(poleX + 5, top);
      octx.lineTo(poleX + 5, ground - 30);
      octx.stroke();
      const src = morph(order, sx, sy, ease(clamp01((t - MORPH_FROM) / MORPH_MS)));
      flag(src, poleX + 4, top, fw, fh, fh * 0.06 * ease(clamp01((t - 300) / 900)), secs);
      octx.globalAlpha = 1;
      if (stage === 'raise' && !skipRaise && t < WAVE) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}
