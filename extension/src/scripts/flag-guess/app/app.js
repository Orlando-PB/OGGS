// Draw the flag: the paint board inside flag-guess's iframe. Paint a flag with a few colours,
// it's matched against every flag in flags.json (built by dev/tools/build_flags.mjs), then the
// best match's outline (draw-guess's geo.json) is shown to click your guess into. The guess
// goes up to the page (main.js), which puts it on GeoGuessr's hidden map and presses Guess.
// Talks to the page only by postMessage: up 'ready', 'height', 'guess', 'done' (after the
// zoom out to the right spot); down 'reset', 'answer', 'strict' (guess must go inside the matched country).
// Suggested by @Dilbot447 on YouTube.
(() => {
  const $ = id => document.getElementById(id);
  const paper = $('paper'), pctx = paper.getContext('2d');
  const PW = paper.width, PH = paper.height;
  // px is the painting, as the pixels of img (little-endian RGBA words).
  const img = pctx.createImageData(PW, PH), px = new Uint32Array(img.data.buffer);
  const pick = $('pick'), kctx = pick.getContext('2d');
  const WIDTHS = { fine: 2, medium: 6, thick: 16 }, MAX_UNDO = 30; // line radii in paper pixels

  const toParent = msg => { if (parent !== window) parent.postMessage(msg, '*'); };
  const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

  // ---------- data ----------
  let data = null, pots = [], potIndex = new Map(), flagGrids = [], geo = null;
  let SIM = [], FAMILY = [];
  const ready = fetch('flags.json').then(r => r.json()).then(d => {
    data = d;
    // Pixels as little-endian RGBA words, so a palette colour is one Uint32 compare.
    pots = d.palette.map(p => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(p.hex.slice(i, i + 2), 16));
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    });
    pots.forEach((c, i) => potIndex.set(c, i));
    const at = name => d.palette.findIndex(p => p.name === name);
    // Colours people mix up count for part of a match.
    SIM = pots.map((_, i) => pots.map((_, j) => +(i === j)));
    for (const [a, b, s] of [['Red', 'Maroon', 0.6], ['Light blue', 'Blue', 0.6], ['Orange', 'Yellow', 0.4], ['Orange', 'Red', 0.3]]) {
      SIM[at(a)][at(b)] = SIM[at(b)][at(a)] = s;
    }
    FAMILY = d.palette.map((p, i) => ({ Maroon: at('Red'), Blue: at('Light blue') })[p.name] ?? i);
    flagGrids = d.flags.map(f => prep(Uint8Array.from(f.grid, Number)));
    buildPalette();
  });
  const sprite = new Image();
  sprite.src = 'flags.png';
  const spriteReady = sprite.decode().catch(() => {}); // without it the header just has no picture
  const geoReady = fetch('../../draw-guess/app/data/geo.json').then(r => r.json()).then(g => { geo = g; });

  // ---------- painting ----------
  let tool = 'medium', color = 0, undo = [], redo = [], drawing = null;

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
  // Each step saves the painting before it; a new step drops anything undone.
  const snapshot = () => px.slice();
  const saveUndo = () => { undo.push(snapshot()); if (undo.length > MAX_UNDO) undo.shift(); redo = []; };
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
    for (let i = 0; i <= n; i++) stamp(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), r, c);
  }
  // Scanline flood fill, exact colour (strokes aren't anti-aliased, so there are no fringes).
  function flood(x, y, c) {
    const target = px[y * PW + x];
    if (target === c) return;
    const same = i => px[i] === target;
    const stack = [[x, y]];
    while (stack.length) {
      let [sx, sy] = stack.pop();
      while (sx > 0 && same(sy * PW + sx - 1)) sx--;
      let up = false, down = false;
      for (; sx < PW && same(sy * PW + sx); sx++) {
        px[sy * PW + sx] = c;
        if (sy > 0) { const t = same((sy - 1) * PW + sx); if (t && !up) stack.push([sx, sy - 1]); up = t; }
        if (sy < PH - 1) { const t = same((sy + 1) * PW + sx); if (t && !down) stack.push([sx, sy + 1]); down = t; }
      }
    }
  }
  const paperPos = e => {
    const r = paper.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * PW), Math.floor((e.clientY - r.top) / r.height * PH)];
  };

  paper.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !data) return;
    const p = paperPos(e);
    saveUndo();
    if (tool === 'fill') { flood(...p, pots[color]); show(); return; }
    paper.setPointerCapture(e.pointerId);
    drawing = p;
    line(p, p, WIDTHS[tool], pots[color]);
    show();
  });
  paper.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = paperPos(e);
    line(drawing, p, WIDTHS[tool], pots[color]);
    drawing = p;
    show();
  });
  const endStroke = () => { drawing = null; };
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
    document.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('on', j === i));
  }
  function buildPalette() {
    $('palette').innerHTML = data.palette.map((p, i) =>
      `<button class="swatch" style="background:${p.hex}" title="${esc(p.name)} (${i + 1})"></button>`).join('');
    $('palette').querySelectorAll('.swatch').forEach((s, i) => s.addEventListener('click', () => setColor(i)));
    setColor(data.palette.findIndex(p => p.name === 'Blue'));
    clearPaper();
  }
  for (const t of ['fine', 'medium', 'thick', 'fill']) $(t).addEventListener('click', () => setTool(t));
  $('undo').addEventListener('click', () => step(undo, redo));
  $('redo').addEventListener('click', () => step(redo, undo));
  $('clear').addEventListener('click', () => { saveUndo(); px.fill(pots[0]); show(); });

  // ---------- matching ----------
  // A grid plus its half-size version (for drawings a little off) and colour shares.
  function prep(grid) {
    const { w, h } = data, n = pots.length;
    const half = new Uint8Array((w / 2) * (h / 2));
    for (let y = 0; y < h / 2; y++) {
      for (let x = 0; x < w / 2; x++) {
        const v = new Array(n).fill(0);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) v[grid[(2 * y + dy) * w + 2 * x + dx]]++;
        half[y * (w / 2) + x] = v.indexOf(Math.max(...v));
      }
    }
    const share = new Array(n).fill(0), fam = new Array(n).fill(0);
    for (const c of grid) { share[c] += 1 / grid.length; fam[FAMILY[c]] += 1 / grid.length; }
    return { grid, half, share, fam };
  }

  // The painting cut into the same grid as the flags: each cell takes its most common colour.
  // Black counts half, so the outline strokes don't outvote the paint they surround.
  // Every flag is stretched to this one rectangle (Switzerland's square, Nepal with the
  // space round it as white), so the paper is the only shape there is.
  function paperGrid() {
    const { w, h } = data, n = pots.length, grid = new Uint8Array(w * h);
    const span = (size, k, of) => [Math.floor(size * k / of), Math.floor(size * (k + 1) / of)];
    for (let gy = 0; gy < h; gy++) {
      const [ya, yb] = span(PH, gy, h);
      for (let gx = 0; gx < w; gx++) {
        const [xa, xb] = span(PW, gx, w);
        const v = new Array(n).fill(0);
        for (let y = ya; y < yb; y++) {
          for (let x = xa; x < xb; x++) {
            const i = potIndex.get(px[y * PW + x]);
            v[i] += data.palette[i].name === 'Black' ? 0.5 : 1;
          }
        }
        grid[gy * w + gx] = v.indexOf(Math.max(...v));
      }
    }
    return prep(grid);
  }

  const cellScore = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += SIM[a[i]][b[i]]; return s / a.length; };
  const overlap = (a, b) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);
  // Which colours are used at all (2%+ of the flag), however much of each: a small red
  // circle on white is still Japan's colours, not Cyprus's white, orange and green.
  const present = share => share.flatMap((v, i) => (v >= 0.02 ? [i] : []));
  function sameColours(a, b) {
    const found = (x, y) => x.reduce((s, c) => s + Math.max(...y.map(d => SIM[c][d])), 0);
    return (found(a, b) + found(b, a)) / (a.length + b.length);
  }
  function score(u, f) {
    const amounts = 0.5 * overlap(u.share, f.share) + 0.5 * overlap(u.fam, f.fam);
    return 0.35 * cellScore(u.grid, f.grid) + 0.2 * cellScore(u.half, f.half) + 0.15 * amounts
      + 0.3 * sameColours(present(u.share), present(f.share));
  }

  // The country whose flag is closest to the painting.
  function bestMatch() {
    const u = paperGrid();
    let best = null;
    data.flags.forEach((f, i) => {
      const s = score(u, flagGrids[i]);
      if (!best || s > best.s) best = { ...f, s };
    });
    return { ...best, score: Math.round(best.s * 100) };
  }

  // ---------- picking the spot ----------
  let stage = 'draw', chosen = null, view = null, pin = null;

  // draw -> raise (the flag goes up a pole) -> pick (click in the outline) -> done
  function setStage(s) {
    stage = s;
    const drawing = s === 'draw', named = s === 'pick' || s === 'done';
    for (const id of ['drawBar', 'palette', 'drawGo']) $(id).hidden = !drawing;
    paper.hidden = !drawing;
    pick.hidden = !named;
    pole.hidden = !(s === 'raise' || s === 'pick');
    $('pickBar').hidden = s !== 'pick';
    $('mini').hidden = $('name').hidden = $('yours').hidden = !named;
    $('score').textContent = named ? `${chosen.score}% match` : '';
    $('tip').textContent = drawing ? 'Paint the flag'
      : s === 'raise' ? 'Raising your flag…' : s === 'pick' ? pickTip() : 'Guess placed';
    if (drawing && data) show();
  }

  const pickTip = () => (strict ? `Click where in ${chosen.name} you think you are` : 'Click where you think you are');

  // The matched country's real flag, from flags.png (96x64 each, data.perRow to a row).
  const SPRITE_W = 96, SPRITE_H = 64;
  function spriteAt(code) {
    const at = data.flags.findIndex(x => x.code === code);
    return [(at % data.perRow) * SPRITE_W, Math.floor(at / data.perRow) * SPRITE_H];
  }
  function showMini(f) {
    const m = $('mini'), [sx, sy] = spriteAt(f.code);
    m.getContext('2d').clearRect(0, 0, m.width, m.height);
    m.getContext('2d').drawImage(sprite, sx, sy, SPRITE_W, SPRITE_H, 0, 0, m.width, m.height);
    $('name').textContent = f.name;
    // The painting beside the score, to compare with the real flag on the left.
    const y = $('yours').getContext('2d');
    y.clearRect(0, 0, y.canvas.width, y.canvas.height);
    y.drawImage(paper, 0, 0, y.canvas.width, y.canvas.height);
  }

  // Mercator, like GeoGuessr's own map, in degree-sized units (y down). Land is projected
  // once into Path2Ds, plus a lighter copy for zoomed-out views; view.at turns these units
  // into canvas pixels (x + X * s, y + Y * s), so zooming never projects again. Land is
  // drawn again one world to either side, so views across the antimeridian stay whole.
  const DEG = Math.PI / 180, WORLD = 360;
  const mercY = lat => -Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * DEG / 2)) / DEG;
  const bounds = pts => {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const COARSE = 0.2, COARSE_BELOW = 4; // drop points under 0.2 units apart while < 4 px a unit
  let lands = null;
  function buildLands() {
    lands = [];
    for (const [code, polys] of Object.entries(geo)) {
      for (const poly of polys) {
        const rings = poly.map(r => r.map(([lng, lat]) => [lng, mercY(lat)]));
        const fine = new Path2D(), coarse = new Path2D();
        for (const r of rings) {
          r.forEach(([x, y], i) => (i ? fine.lineTo(x, y) : fine.moveTo(x, y)));
          let last = r[0];
          coarse.moveTo(...last);
          for (const p of r) if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= COARSE) { coarse.lineTo(...p); last = p; }
          fine.closePath(); coarse.closePath();
        }
        lands.push({ code, fine, coarse, first: rings[0][0], box: bounds(rings[0]) });
      }
    }
  }

  // The matched country fills the middle half of the view at first, so its neighbours and
  // coast show round it and a guess can go just over the border or out to sea. A country
  // across the antimeridian (Russia, Fiji) has its western longitudes moved +360.
  function makeView(code) {
    if (!lands) buildLands();
    const all = geo[code].flat(2);
    const wrap = all.some(p => p[0] > 150) && all.some(p => p[0] < -150);
    const wrapX = x => (wrap && x < 0 ? x + WORLD : x);
    const proj = ([lng, lat]) => [wrapX(lng), mercY(lat)];
    // The zoom that puts box [x0, y0, x1, y1] in the middle `fill` of the canvas.
    const fit = ([x0, y0, x1, y1], fill) => {
      const s = fill * Math.min(pick.width / (x1 - x0 || 1e-3), pick.height / (y1 - y0 || 1e-3));
      return { s, x: pick.width / 2 - (x0 + x1) / 2 * s, y: pick.height / 2 - (y0 + y1) / 2 * s };
    };
    const box = bounds(all.map(proj));
    const back = ([X, Y]) => ({ lat: (2 * Math.atan(Math.exp(-Y * DEG)) - Math.PI / 2) / DEG, lng: ((X + 540) % WORLD) - 180 });
    return { mine: lands.filter(l => l.code === code), others: lands.filter(l => l.code !== code),
             box, wrapX, proj, fit, back, at: fit(box, 0.5) };
  }
  const toScreen = ([X, Y], at = view.at) => [at.x + X * at.s, at.y + Y * at.s];
  const fromScreen = ([x, y], at = view.at) => [(x - at.x) / at.s, (y - at.y) / at.s];

  // The visible copies of some lands as one path in canvas pixels, so lines keep their width.
  function landPath(list) {
    const { s, x, y } = view.at, [vx0, vy0] = fromScreen([0, 0]), [vx1, vy1] = fromScreen([pick.width, pick.height]);
    const key = s < COARSE_BELOW ? 'coarse' : 'fine', out = new Path2D();
    for (const d of [-WORLD, 0, WORLD]) {
      const m = new DOMMatrix([s, 0, 0, s, x + d * s, y]);
      for (const l of list) {
        if (l.box[2] + d < vx0 || l.box[0] + d > vx1 || l.box[3] < vy0 || l.box[1] > vy1) continue;
        out.addPath(l[key], m);
      }
    }
    return out;
  }

  // In a country made of specks (Maldives, Tuvalu), each speck gets a ring round it: their
  // centres in canvas pixels.
  const SPECK_R = 12;
  function specks() {
    const span = l => Math.max(l.box[2] - l.box[0], l.box[3] - l.box[1]) * view.at.s;
    if (Math.max(...view.mine.map(span)) >= 60) return [];
    return view.mine.filter(l => span(l) < 8).map(l => toScreen([view.wrapX(l.first[0]), l.first[1]]));
  }

  // With "guess must go inside the matched country" on, a click counts only on that country:
  // inside it, within a few pixels of its border, or inside a speck's ring.
  const BORDER_SLACK = 4;
  let strict = true; // the page sends the setting on start
  function inCountry([x, y]) {
    const mine = landPath(view.mine);
    kctx.save();
    kctx.lineWidth = 2 * BORDER_SLACK;
    const hit = kctx.isPointInPath(mine, x, y, 'evenodd') || kctx.isPointInStroke(mine, x, y)
      || specks().some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= SPECK_R);
    kctx.restore();
    return hit;
  }

  function drawPick() {
    const s = view.at.s;
    kctx.clearRect(0, 0, pick.width, pick.height);
    kctx.lineJoin = 'round';
    const others = landPath(view.others); // the neighbours, as plain land
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
    if (pin) marks.drawPin(kctx, toScreen(pin)); // ../../draw-guess/app/marks.js
    if (answerAt) marks.drawAnswer(kctx, toScreen(pin), toScreen(answerAt));
  }

  // After the guess: the flag on the round's real spot, a dashed line to it from the pin,
  // and a zoom out until both and the matched country are in view. The guess is already on
  // GeoGuessr's (hidden) map by then and can't change.
  const ZOOM_MS = 2600;
  let answerLL = null, answerAt = null, runId = 0;
  function showAnswer() {
    const run = ++runId;
    if (!answerLL) return Promise.resolve(true);
    const a = view.proj([answerLL.lng, answerLL.lat]);
    a[0] += Math.round((pin[0] - a[0]) / WORLD) * WORLD; // the copy nearest the pin
    answerAt = a;
    const [x0, y0, x1, y1] = view.box;
    const box = [Math.min(x0, pin[0], a[0]), Math.min(y0, pin[1], a[1]), Math.max(x1, pin[0], a[0]), Math.max(y1, pin[1], a[1])];
    const from = view.at, to = view.fit(box, 0.75);
    if (to.s > from.s) Object.assign(to, view.fit(box, 0.75 * from.s / to.s)); // never zoom in
    // Scale moves geometrically and the centre with 1/scale, so the zoom looks steady.
    const centre = at => fromScreen([pick.width / 2, pick.height / 2], at);
    const c0 = centre(from), c1 = centre(to);
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const start = performance.now();
    return new Promise(done => {
      const frame = now => {
        if (run !== runId) return done(false); // a new round reset the board meanwhile
        const t = ease(Math.min(1, (now - start) / ZOOM_MS));
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

  function choose(r) {
    chosen = r;
    pin = answerAt = null;
    view = makeView(r.country ?? r.code); // England, Scotland, Wales: the UK outline
    showMini(r);
    $('guess').disabled = true;
    setStage('pick');
    drawPick();
  }

  async function findCountry() {
    if ($('match').disabled) return;
    $('match').disabled = true;
    await Promise.all([ready, geoReady, spriteReady]);
    if (stage !== 'draw') return; // a new round reset the board meanwhile
    const best = bestMatch();
    await raise(best);
    if (stage !== 'raise') return; // a new round reset the board meanwhile
    choose(best);
    pole.classList.add('out'); // fades, uncovering the outline, then goes
    setTimeout(() => { if (stage !== 'raise') pole.hidden = true; }, 700);
  }

  // ---------- the flag going up the pole ----------
  const pole = $('pole'), octx = pole.getContext('2d');
  const WAVE = 3600; // ms
  const MORPH_FROM = 1200, MORPH_MS = 1400; // the painting turns into the matched flag, square by square
  const MORPH_COLS = 24, MORPH_ROWS = 16;
  const INK = '#3b4459', LINE = 2;
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const clamp01 = t => Math.min(1, Math.max(0, t));
  // Off-screen buffers for the flag and its outline (see flag()).
  const fbuf = document.createElement('canvas'), sil = document.createElement('canvas');
  fbuf.width = sil.width = pole.width;
  fbuf.height = sil.height = pole.height;
  const fctx = fbuf.getContext('2d'), sctx = sil.getContext('2d');

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

  // A quiet countryside in muted colours: pale sky, low sun, two slow clouds, three
  // layers of hills with a few trees, and the pole on the nearest one.
  // Returns where the pole meets the ground.
  function scene(W, H, poleX, top, secs) {
    octx.fillStyle = '#e4eeed';
    octx.fillRect(0, 0, W, H);
    blob(() => octx.arc(W * 0.8, H * 0.3, 30, 0, 2 * Math.PI), '#f1d38e');
    for (const [x0, y, s] of [[0.55, 0.14, 1], [0.12, 0.3, 0.75]]) {
      const x = ((x0 * W + secs * 6 * s) % (W + 240)) - 120, cy = y * H;
      blob(() => {
        octx.moveTo(x - 60 * s, cy + 10 * s);
        octx.bezierCurveTo(x - 60 * s, cy - 8 * s, x - 34 * s, cy - 10 * s, x - 24 * s, cy - 4 * s);
        octx.bezierCurveTo(x - 16 * s, cy - 24 * s, x + 18 * s, cy - 24 * s, x + 24 * s, cy - 6 * s);
        octx.bezierCurveTo(x + 44 * s, cy - 10 * s, x + 60 * s, cy, x + 58 * s, cy + 10 * s);
        octx.closePath();
      }, '#fbf8f1');
    }
    const far = [W * 0.75, H * 1.25, W * 0.7, H * 0.6], mid = [W * 0.05, H * 1.3, W * 0.65, H * 0.55];
    const front = [W * 0.3, H * 1.4, W * 0.9, H * 0.6];
    blob(() => octx.ellipse(...far, 0, 0, 2 * Math.PI), '#bccfa9');
    // small round trees along the far hill's crest
    for (const u of [0.62, 0.68, 0.9]) {
      const x = u * W, y = hillTop(x, ...far) + 4;
      octx.lineWidth = LINE;
      octx.strokeStyle = INK;
      octx.beginPath();
      octx.moveTo(x, y);
      octx.lineTo(x, y - 14);
      octx.stroke();
      blob(() => octx.ellipse(x, y - 22, 9, 12, 0, 0, 2 * Math.PI), '#8fae7c');
    }
    blob(() => octx.ellipse(...mid, 0, 0, 2 * Math.PI), '#a5c093');
    blob(() => octx.ellipse(...front, 0, 0, 2 * Math.PI), '#8bb07c');
    const ground = hillTop(poleX, ...front) + 12;
    blob(() => octx.roundRect(poleX - 4, top, 8, ground - top, 4), '#f4efe6');
    blob(() => octx.arc(poleX, top - 5, 7, 0, 2 * Math.PI), '#d4a84a');
    return ground;
  }

  // The painting in thin vertical slices, each bobbing on a sine wave that grows towards the
  // free end, then outlined in ink so it matches the scene. The outline is the flag's
  // silhouette stamped around it.
  function flag(src, x, y, w, h, amp, secs) {
    const N = 48, sw = src.width, sh = src.height;
    fctx.clearRect(0, 0, fbuf.width, fbuf.height);
    for (let i = 0; i < N; i++) {
      const u = i / N, dy = amp * u * Math.sin(2 * Math.PI * (u * 1.3 - secs * 1.5));
      fctx.drawImage(src, u * sw, 0, sw / N, sh, x + u * w, y + dy, w / N + 0.6, h);
    }
    sctx.globalCompositeOperation = 'copy';
    sctx.drawImage(fbuf, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = INK;
    sctx.fillRect(0, 0, sil.width, sil.height);
    // stamped on a square of whole-pixel offsets, so corners stay square and fully inked
    const d = LINE;
    for (let dy = -d; dy <= d; dy += d) for (let dx = -d; dx <= d; dx += d) octx.drawImage(sil, dx, dy);
    octx.drawImage(fbuf, 0, 0);
  }

  // The flag on the pole: the painting, with the matched flag's squares (in a random order
  // fixed per raise) drawn over it as k goes from 0 to 1.
  const mix = document.createElement('canvas'), mctx = mix.getContext('2d');
  mix.width = PW;
  mix.height = PH;
  function morph(order, sx, sy, k) {
    mctx.drawImage(paper, 0, 0);
    const n = Math.round(k * order.length), cw = PW / MORPH_COLS, ch = PH / MORPH_ROWS;
    const scw = SPRITE_W / MORPH_COLS, sch = SPRITE_H / MORPH_ROWS;
    for (let j = 0; j < n; j++) {
      const c = order[j] % MORPH_COLS, r = Math.floor(order[j] / MORPH_COLS);
      mctx.drawImage(sprite, sx + c * scw, sy + r * sch, scw, sch, c * cw, r * ch, cw + 0.5, ch + 0.5);
    }
    return mix;
  }

  let skipRaise = false;
  pole.addEventListener('pointerdown', () => { skipRaise = true; });
  // The scene fades in with the painted flag already at the top of the pole; it starts
  // still, picks up the wind, then turns into the matched country's flag.
  function raise(best) {
    setStage('raise');
    pole.classList.remove('out');
    skipRaise = false;
    const W = pole.width, H = pole.height, poleX = W * 0.3, top = H * 0.14;
    const fit = Math.min(W * 0.38 / PW, H * 0.4 / PH), fw = PW * fit, fh = PH * fit;
    const [sx, sy] = spriteAt(best.code);
    const order = [...Array(MORPH_COLS * MORPH_ROWS).keys()].sort(() => Math.random() - 0.5);
    const t0 = performance.now();
    return new Promise(done => {
      const frame = now => {
        const t = now - t0, secs = t / 1000;
        octx.globalAlpha = clamp01(t / 400);
        const ground = scene(W, H, poleX, top, secs);
        octx.strokeStyle = INK; // the rope, from the pole's top to its foot
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
  $('match').addEventListener('click', findCountry);

  pick.addEventListener('pointerdown', e => {
    if (stage !== 'pick' || e.button !== 0) return;
    const r = pick.getBoundingClientRect();
    const p = [(e.clientX - r.left) / r.width * pick.width, (e.clientY - r.top) / r.height * pick.height];
    if (strict && !inCountry(p)) { $('tip').textContent = `Click inside ${chosen.name}`; return; }
    pin = fromScreen(p); // without strict, anywhere: over the border or out to sea
    $('tip').textContent = '';
    $('guess').disabled = false;
    drawPick();
  });

  function submit() {
    if (stage !== 'pick' || !pin) return;
    toParent({ ggs: 'guess', guess: view.back(pin) });
    setStage('done');
    showAnswer().then(ok => ok && toParent({ ggs: 'done' }));
  }
  $('guess').addEventListener('click', submit);

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
      e.preventDefault();
      $(key === 'y' || e.shiftKey ? 'redo' : 'undo').click();
      return;
    }
    if (e.key === 'Enter') return stage === 'draw' ? findCountry() : submit();
    if (stage !== 'draw') return;
    const n = Number(e.key);
    if (n >= 1 && n <= pots.length) setColor(n - 1);
    else {
      const t = { q: 'fine', w: 'medium', e: 'thick', f: 'fill' }[key];
      if (t) setTool(t);
    }
  });

  window.addEventListener('message', e => {
    if (e.source !== parent) return;
    const d = e.data ?? {};
    if (d.ggs === 'reset') { runId++; ready.then(clearPaper); setStage('draw'); }
    if (d.ggs === 'strict') strict = !!d.on;
    if (d.ggs === 'answer') answerLL = typeof d.lat === 'number' ? { lat: d.lat, lng: d.lng } : null;
  });

  // The page sizes the frame to the board (plus the body's 10px padding top and bottom).
  const board = document.querySelector('.board');
  new ResizeObserver(() => toParent({ ggs: 'height', h: Math.ceil(board.getBoundingClientRect().height) + 20 })).observe(board);
  setStage('draw');
  ready.then(() => toParent({ ggs: 'ready' }));
})();
