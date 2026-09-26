// Loaded before the country-matcher app inside the extension iframe. Stands in for its
// Python server (answers /api/world, /api/maps and /api/match locally via matcher.js)
// and talks to the GeoGuessr page: sends the finished guess up, takes reset/map
// messages down.
(() => {
  const realFetch = window.fetch.bind(window);
  const json = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

  let meta; // matcher.json; the matcher reads meta.maps at match time, so pools can be added to it
  const matcher = Promise.all([
    realFetch('data/matcher.json').then(r => r.json()),
    realFetch('data/masks.bin').then(r => r.arrayBuffer()),
    realFetch('data/geo.json').then(r => r.json()),
    realFetch('data/prior.json').then(r => r.json()).catch(() => null), // attractor table; optional
  ]).then(([m, masks, g, prior]) => DrawMatcher.create(meta = m, new Uint8Array(masks), geo = g, prior));

  // Nudge: if the round's real country is within NUDGE percentage points of the best match,
  // it's lifted past it (further the closer it was), so a nearly-right drawing lands on it.
  // A clearly different drawing still wins, and a right one keeps its own score. NUDGE comes
  // from the popup's sensitivity slider (0-20, default 7); at 0 the real country gets no help
  // at all: no lift and no rotation/stretch leeway (the attractor prior still applies).
  let NUDGE = 7;
  // The same slider sets how far the real country's outline may be stretched to fit the
  // drawing (rotation leeway is always on): none at 0, 1.1x at the default 10, 1.15x at 20.
  const leewayStretch = () => (NUDGE <= 10 ? 1 + 0.01 * NUDGE : 1.1 + 0.005 * (NUDGE - 10));
  let geo, answerCode = null, answerLL = null; // the round's real country, and its location

  // Which country a lon/lat is in: inside one of its polygons (and not in a hole), or
  // failing that (coastal roads vs simplified coastlines) the one with the nearest vertex
  // within ~1.5 degrees.
  function countryAt(lat, lng) {
    const p = [lng, lat], k = Math.cos(lat * Math.PI / 180);
    let near = null, nearD = 1.5 ** 2;
    for (const [code, polys] of Object.entries(geo)) {
      for (const [outer, ...holes] of polys) {
        if (inside(p, outer) && !holes.some(h => inside(p, h))) return code;
        for (const [x, y] of outer) {
          const d = ((x - lng) * k) ** 2 + (y - lat) ** 2;
          if (d < nearD) { nearD = d; near = code; }
        }
      }
    }
    return near;
  }

  window.fetch = async (url, opts) => {
    switch (String(url)) {
      case '/api/world': return realFetch('data/world.json');
      case '/api/maps': return json((await matcher).maps());
      case '/api/match': {
        const m = await matcher, body = JSON.parse(opts.body);
        if (answerCode && NUDGE > 0) body.bonus = { code: answerCode, points: NUDGE, stretch: leewayStretch() };
        if (answerCode) body.target = answerCode; // its score, for the round-end summary only
        return json(m.match(body));
      }
      default: return realFetch(url, opts);
    }
  };

  const toParent = msg => { if (parent !== window) parent.postMessage(msg, '*'); };

  // The guess itself goes up the moment Guess is pressed (see oneStep); this fires once the
  // snap-to-map animation has finished, and the page presses GeoGuessr's Guess soon after.
  window.addEventListener('drawguess:guess', () => toParent({ ggs: 'done' }));


  // Which countries the drawing can snap to, worked out from the game's map name only:
  //   1. a region pool with that name ("Europe" -> europe),
  //   2. otherwise the countries named in it ("Italy", "Spain & Portugal", "UK Roads"),
  //   3. otherwise GeoGuessr's world coverage.
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const ALIASES = {
    usa: 'USA', us: 'USA', 'united states': 'USA', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR',
    england: 'GBR', scotland: 'GBR', wales: 'GBR', 'northern ireland': 'GBR', korea: 'KOR', china: 'CHN',
    czechia: 'CZE', turkiye: 'TUR', uae: 'ARE', holland: 'NLD', 'cote d ivoire': 'CIV', swaziland: 'SWZ',
    'timor leste': 'TLS', bahamas: 'BHS', gambia: 'GMB', 'sao tome': 'STP', macedonia: 'MKD', burma: 'MMR',
  };
  function countriesIn(name) {
    const terms = { ...ALIASES };
    for (const e of meta.entries) terms[norm(e.name)] = e.code;
    let s = ` ${norm(name)} `;
    const codes = new Set();
    // Longest names first, blanked out once matched, so "Papua New Guinea" isn't also "Guinea".
    for (const t of Object.keys(terms).sort((a, b) => b.length - a.length)) {
      if (!s.includes(` ${t} `)) continue;
      codes.add(terms[t]);
      s = s.replaceAll(` ${t} `, ' | ');
    }
    return [...codes];
  }

  // Hard mode ignores the map and matches against every country ("all" pool).
  let hard = false, gamePool = null; // gamePool: { id, how, map } picked for the game's map

  async function boardReady() {
    await matcher;
    const sel = document.getElementById('mapSel');
    while (!sel.options.length) await new Promise(r => setTimeout(r, 100));
    return sel;
  }

  async function applyPool() {
    const sel = await boardReady();
    const g = gamePool ?? { id: meta.maps.world ? 'world' : sel.options[0].value, how: 'map not known yet', map: '?' };
    const id = hard && meta.maps.all ? 'all' : g.id;
    sel.value = id;
    const pool = meta.maps[id], names = new Map(meta.entries.map(e => [e.code, e.name]));
    toParent({ ggs: 'pool', map: g.map, pool: pool.label, how: id === g.id ? g.how : 'hard mode', count: pool.codes.length,
               countries: pool.codes.map(c => names.get(c) ?? c) });
  }

  async function selectMap(name) {
    const sel = await boardReady();
    const n = norm(name);
    let id = [...sel.options].find(o => o.value === n || norm(o.textContent).startsWith(n))?.value, how = 'region pool';
    if (!id) {
      const codes = countriesIn(name);
      if (codes.length) {
        meta.maps.game = { label: name, codes };
        sel.querySelector('option[value="game"]')?.remove();
        sel.add(new Option(name, 'game'));
        id = 'game';
        how = 'countries named in the map';
      }
    }
    if (!id) { id = meta.maps.world ? 'world' : sel.options[0].value; how = 'no match, using world coverage'; }
    gamePool = { id, how, map: name };
    applyPool();
  }

  window.addEventListener('message', e => {
    if (e.source !== parent) return;
    const d = e.data ?? {};
    if (d.ggs === 'reset') window.backToDraw?.(true);
    else if (d.ggs === 'map' && d.name) selectMap(d.name);
    else if (d.ggs === 'hard') { hard = !!d.on; applyPool(); }
    else if (d.ggs === 'nudge') { if (Number.isFinite(d.points)) NUDGE = Math.min(20, Math.max(0, d.points)); }
    else if (d.ggs === 'answer') { // this round's location, or null while it's being fetched
      answerCode = null;
      answerLL = typeof d.lat === 'number' ? { lat: d.lat, lng: d.lng } : null;
      if (answerLL) matcher.then(() => { answerCode = countryAt(d.lat, d.lng); });
    }
  });
  window.addEventListener('load', () => { oneStep(); toParent({ ggs: 'ready' }); });

  // One step instead of the app's three (draw -> pin -> reveal): you draw, a click inside
  // the drawing drops the pin, and the only button is Guess. Runs after app.js, whose
  // top-level names (stage, strokes, current, pinXY, pinShape, redraw, ...) it reuses.
  const CLICK = 12; // a "stroke" smaller than this (canvas units) is a click

  // Draw green islands on a light-blue sea. app.js hard-codes ink/orange colours, so swap
  // them as they're set on its canvas, including the morph's ink->blue / orange->blue fades.
  const INK = [31, 42, 68], ORANGE = [217, 72, 15], BLUE = [28, 126, 214];
  const LINE = [43, 138, 62], LAND = [81, 207, 102];
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
  function recolor(v) {
    if (typeof v !== 'string') return v;
    if (v === '#1f2a44') return `rgb(${LINE})`;
    if (v === 'rgba(31,42,68,.28)') return `rgba(${LINE},.4)`;                    // ghost of the drawing
    if (v === 'rgba(217,72,15,.10)' || v === 'rgba(217,72,15,.16)') return `rgba(${LAND},.55)`;
    const m = v.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/);
    if (!m) return v;
    const [r, g, b] = m.slice(1, 4).map(Number), a = m[4];
    if (a === undefined && r <= INK[0] && r >= BLUE[0]) {                            // morph outline
      return `rgb(${mixRgb(LINE, BLUE, (b - INK[2]) / (BLUE[2] - INK[2]))})`;
    }
    if (a !== undefined && r <= ORANGE[0] && r >= BLUE[0] && b >= ORANGE[2]) {       // morph fill
      const t = (b - ORANGE[2]) / (BLUE[2] - ORANGE[2]);
      return `rgba(${mixRgb(LAND, BLUE, t)},${(.55 + (.16 - .55) * t).toFixed(3)})`;
    }
    return v;
  }
  function islandColors() {
    const proto = CanvasRenderingContext2D.prototype;
    for (const prop of ['strokeStyle', 'fillStyle']) {
      const { get, set } = Object.getOwnPropertyDescriptor(proto, prop);
      Object.defineProperty(ctx, prop, { get() { return get.call(this); }, set(v) { set.call(this, recolor(v)); } });
    }
  }
  function oneStep() {
    const btn = document.getElementById('guessBtn'), tip = document.getElementById('tip');
    const show = { guessBtn: 'draw pin', undo: 'draw pin', clear: 'draw pin' };
    document.querySelectorAll('.toolbar [data-for], #tip').forEach(el => el.dataset.for = show[el.id] ?? 'none');
    tip.hidden = true;
    tip.textContent = 'Click where you think you are';

    // The pin can go anywhere, on land or in the sea. It belongs to the loop it's in, or,
    // in the sea, to the nearest loop (the morph needs one to follow).
    const nearestLoop = (p, loops) => {
      let best = 0, bestD = Infinity;
      loops.forEach((r, i) => {
        const q = nearestOnRing(p, r), d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    };
    const pinLoop = p => { const s = shapes(), i = s.findIndex(r => inside(p, r)); return i >= 0 ? i : nearestLoop(p, s); };

    // Keep the pin through undo/clear/new strokes; drop it only when nothing is drawn.
    const baseRedraw = redraw;
    redraw = function () {
      baseRedraw();
      if (stage !== 'draw') return;
      if (pinXY) {
        if (!shapes().length) pinXY = null;
        else { pinShape = pinLoop(pinXY); drawPin(pinXY); }
      }
      btn.disabled = !pinXY;
      tip.hidden = !!pinXY || !!current || !shapes().length;
    };
    window.addEventListener('resize', () => redraw()); // app.js registered the unwrapped one

    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointerup', e => {
      if (stage !== 'draw' || !current) return;
      const [x0, y0, x1, y1] = bbox([current]);
      if (Math.max(x1 - x0, y1 - y0) >= CLICK) return;
      current = null; // a click, not a stroke: the app's own handler then draws nothing
      const p = pos(e);
      if (shapes().length) { pinXY = p; pinShape = pinLoop(p); }
    }, true);

    // Enter guesses straight away instead of moving to the app's pin step.
    window.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || stage !== 'draw' || e.target.tagName === 'SELECT') return;
      e.stopImmediatePropagation();
      if (pinXY) submitGuess();
    }, true);

    // Result card: runners-up (with how close they came) in place of the guess coordinates.
    const coord = document.querySelector('.stats .coord');
    coord.className = 'runners';
    coord.innerHTML = '<b id="rCoord" hidden></b><span>runners-up</span><ol id="rRunners"></ol>'; // app.js still writes rCoord
    const baseShowCard = showCard;
    showCard = function (top, g) {
      baseShowCard(top, g);
      // Right or wrong, instead of "Your guess is in..." (the guess is locked in by now).
      const kicker = document.querySelector('#reveal .kicker'), t = matchData.target;
      kicker.className = 'kicker' + (t ? (t.code === top.code ? ' ok' : ' bad') : '');
      kicker.innerHTML = !t ? 'Your guess is in…'
        : t.code === top.code ? '✓ Correct country' : `✗ Not quite. It was <b>${esc(t.name)}</b>`;
      coord.hidden = matchData.results.length < 2; // single-country map: nothing to compare against
      document.getElementById('rRunners').innerHTML = matchData.results.slice(1, 4).map(r => `
        <li><i>${esc(r.name)}</i><em><b style="width:${r.score}%"></b></em><u>${r.score}%</u></li>`).join('');
    };

    // reveal() works out the guess before its first await, so send it right away: the pin
    // is on GeoGuessr's map even if the round runs out during the animation.
    const baseReveal = reveal;
    reveal = function () {
      answerLayer.setAttribute('visibility', 'hidden');
      const run = baseReveal();
      if (guess) toParent({ ggs: 'guess', guess, drawing: drawingSummary() });
      return run;
    };

    // The correct spot, shown as the reveal zooms out to the map: a flag and a dashed line
    // from the pin. By then the guess is on GeoGuessr's (hidden) map and can't change.
    const answerLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    answerLayer.setAttribute('visibility', 'hidden');
    answerLayer.innerHTML = `
      <line stroke="#1f2a44" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round" opacity=".75"/>
      <g class="flag"><circle r="13" fill="#2b8a3e" stroke="#fff" stroke-width="3"/>
        <path d="M-3.5,7 V-7.5 M-3.5,-7.5 L7,-4 L-3.5,-0.5 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>`;
    document.getElementById('map').append(answerLayer);
    const placeAnswer = () => {
      if (!answerLL || !guess || answerLayer.getAttribute('visibility') === 'hidden') return;
      const [ax, ay] = T.apply(projection([answerLL.lng, answerLL.lat]));
      const [gx, gy] = T.apply(projection([guess.lng, guess.lat]));
      answerLayer.querySelector('.flag').setAttribute('transform', `translate(${ax},${ay})`);
      const line = answerLayer.querySelector('line');
      Object.entries({ x1: gx, y1: gy, x2: ax, y2: ay }).forEach(([k, v]) => line.setAttribute(k, v));
    };
    zoom.on('zoom.answer', placeAnswer); // app.js's own 'zoom' listener updates T first

    // reveal() calls fitBox() once, for the zoom-out to the matched country: widen that box
    // to take in the correct spot as well, and show the flag as the zoom starts.
    const baseFitBox = fitBox;
    fitBox = function (box, screen, maxK) {
      if (stage === 'reveal' && answerLL && guess) {
        const [px, py] = projection([answerLL.lng, answerLL.lat]);
        const m = Math.max(8, 0.1 * Math.max(box[2] - box[0], box[3] - box[1]));
        box = [Math.min(box[0], px - m), Math.min(box[1], py - m), Math.max(box[2], px + m), Math.max(box[3], py + m)];
        // keep everything above the result card, which covers roughly the bottom 36%
        if (screen) screen = [screen[0], screen[1], screen[2], Math.min(screen[3], W * 0.58)];
        answerLayer.setAttribute('visibility', 'visible');
        placeAnswer();
      }
      return baseFitBox(box, screen, maxK);
    };
    // A pin in the sea stays where it was put relative to the drawing (app.js would pull it
    // onto the nearest coast). The reveal lines the matched country up with the drawing
    // before morphing, so that spot becomes the guess: draw the US, click off its south-west
    // coast, and you're guessing Hawaii.
    const baseStartMorph = startMorph;
    startMorph = function (targets) {
      const end = baseStartMorph(targets);
      if (!morph?.pin || inside(pinXY, shapes()[pinShape])) return end;
      const raw = blend(morph.pin.w, morph.pin.pair.b);
      morph.pin.corr = [pinXY[0] - raw[0], pinXY[1] - raw[1]];
      morph.pin.end = pinXY.slice();
      return pinXY.slice();
    };

    const baseBackToDraw = backToDraw;
    backToDraw = function (...args) {
      answerLayer.setAttribute('visibility', 'hidden');
      return baseBackToDraw(...args);
    };
    // The drawing as the end-of-game summary shows it: loops thinned to <= 80 points
    // (900x900 canvas units), the pin, and how it matched.
    const drawingSummary = () => ({
      rings: shapes().map(r => r.filter((_, i) => i % Math.ceil(r.length / 80) === 0).map(p => p.map(Math.round))),
      pin: pinXY.map(Math.round),
      code: guess.code,
      country: guess.country,
      score: guess.shapeScore,
      // The round's real country, its score and outline, for summary.js's review panels.
      answer: matchData.target ? { ...matchData.target, outline: thinOutline(matchData.target.outline) } : null,
      runners: matchData.results.slice(1, 4).map(r => ({ name: r.name, score: r.score })),
    });
    // The correct country's outline for the summary thumbnails: its bigger rings, <= 100
    // points each, 1 decimal (grid units).
    const thinOutline = rings => {
      if (!rings?.length) return null;
      const area = r => Math.abs(signedArea(r)), biggest = Math.max(...rings.map(area));
      return rings.filter(r => area(r) >= 0.02 * biggest)
        .map(r => r.filter((_, i) => i % Math.ceil(r.length / 100) === 0).map(p => p.map(v => Math.round(v * 10) / 10)));
    };

    // Tell the page how tall the board is (plus .wrap's 10px padding top and bottom), so
    // the frame fits it exactly.
    const board = document.querySelector('.board');
    new ResizeObserver(() => toParent({ ggs: 'height', h: Math.ceil(board.getBoundingClientRect().height) + 20 }))
      .observe(board);

    islandColors();
    setStage(stage); // re-apply toolbar visibility with the new data-for values
    redraw();
  }
})();
