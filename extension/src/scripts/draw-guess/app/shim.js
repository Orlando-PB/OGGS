// Loaded before the country-matcher app inside the extension iframe. It stands in for the app's
// Python server, answering /api/world, /api/maps and /api/match locally with matcher.js. It also
// talks to the GeoGuessr page: the finished guess goes up, reset and map messages come down.
(() => {
  const realFetch = window.fetch.bind(window);
  const json = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

  // matcher.json. The matcher reads meta.maps at match time, so pools can be added to it.
  let meta;
  const matcher = Promise.all([
    realFetch('data/matcher.json').then(r => r.json()),
    realFetch('data/masks.bin').then(r => r.arrayBuffer()),
    realFetch('data/geo.json').then(r => r.json()),
    // the attractor table is optional
    realFetch('data/prior.json')
      .then(r => r.json())
      .catch(() => null),
  ]).then(([m, masks, g, prior]) => {
    meta = m;
    geo = g;
    return DrawMatcher.create(meta, new Uint8Array(masks), geo, prior);
  });

  // A small, fixed lift for the round's real country (matcher.js). If it's within BOOST
  // percentage points of the best match it's lifted past it, further the closer it was. Its
  // outline may be stretched up to BOOST_STRETCH to fit. Countries near the round's location get
  // up to NEAR points: all of it within 200 km of their border, fading to nothing at 800 km.
  // A clearly different drawing still wins, so a drawing of an easier neighbour lands on that
  // neighbour rather than on a far-off lookalike.
  const BOOST = 3;
  const BOOST_STRETCH = 1.03;
  const NEAR = 6;
  // the round's real country, and its location
  let geo;
  let answerCode = null;
  let answerLL = null;

  // Which country a lon/lat is in: inside one of its polygons (and not in a hole). Failing that
  // (coastal roads vs simplified coastlines), the one with the nearest vertex within ~1.5 degrees.
  // The tiny territories (meta.dataOnly: the Vatican, Jersey...) are a few rough vertices in the
  // data, so a spot within ~5 km of one counts as in it, ahead of the country around it.
  const TINY = 0.05 ** 2;
  function countryAt(lat, lng) {
    const p = [lng, lat];
    const k = Math.cos((lat * Math.PI) / 180);
    const dist2 = ([x, y]) => ((x - lng) * k) ** 2 + (y - lat) ** 2;
    return tinyAt(p, dist2) ?? containingOrNearest(p, dist2);
  }

  function tinyAt(p, dist2) {
    for (const code of meta.dataOnly ?? []) {
      const polys = geo[code] ?? [];
      if (polys.some(([outer]) => inside(p, outer) || outer.some(v => dist2(v) < TINY))) return code;
    }
    return null;
  }

  function containingOrNearest(p, dist2) {
    let near = null;
    let nearD = 1.5 ** 2;
    for (const [code, polys] of Object.entries(geo)) {
      if (polys.some(([outer, ...holes]) => inside(p, outer) && !holes.some(h => inside(p, h)))) return code;
      const d = closestVertex(polys, dist2);
      if (d < nearD) {
        nearD = d;
        near = code;
      }
    }
    return near;
  }

  function closestVertex(polys, dist2) {
    let best = Infinity;
    for (const [outer] of polys) for (const v of outer) best = Math.min(best, dist2(v));
    return best;
  }

  window.fetch = async (url, opts) => {
    switch (String(url)) {
      case '/api/world':
        return realFetch('data/world.json');
      case '/api/maps':
        return json((await matcher).maps());
      case '/api/match': {
        const m = await matcher;
        const body = JSON.parse(opts.body);
        if (answerCode) {
          body.bonus = { code: answerCode, points: BOOST, stretch: BOOST_STRETCH, near: NEAR, ...answerLL };
          // for the right/wrong line on the result card
          body.target = answerCode;
        }
        const res = m.match(body);
        morphParts(res, body.strokes);
        return json(res);
      }
      default:
        return realFetch(url, opts);
    }
  };

  // The matcher compares whole silhouettes, so two blobs drawn for New Zealand can win as its
  // "mainland" variant (South Island + the tiny Stewart Island). The reveal would then morph the
  // North Island blob onto Stewart Island. So when the drawing has more sizeable loops than the
  // matched variant has sizeable parts, the morph uses the parts of whichever of the winner's
  // variants comes closest. The score and ranking stay as matched.
  // share of the biggest loop or part
  const SIZEABLE = 0.1;
  const countSizeable = areas => areas.filter(a => a >= SIZEABLE * Math.max(...areas)).length;
  const lonLatArea = r => Math.abs(signedArea(r)) * Math.cos((r[0][1] * Math.PI) / 180);
  function morphParts(res, strokes) {
    const top = res.results?.[0];
    if (!top?.geo_match) return;
    const loops = countSizeable(strokes.map(r => Math.abs(signedArea(r))));
    const off = rings => Math.abs(countSizeable(rings.map(lonLatArea)) - loops);
    if (countSizeable(top.geo_match.map(lonLatArea)) >= loops) return;
    let best = { d: off(top.geo_match), rings: top.geo_match };
    for (const e of meta.entries) {
      if (e.code !== top.code) continue;
      const rings = e.parts.map(i => geo[e.code][i][0]);
      const d = off(rings);
      // variants run smallest first (mainland, major parts, ...), so a tie keeps the smaller
      if (d < best.d) best = { d, rings };
    }
    top.geo_match = best.rings;
  }

  const toParent = msg => {
    if (parent !== window) parent.postMessage(msg, '*');
  };

  // The guess itself goes up the moment Guess is pressed (see oneStep). This fires once the
  // snap-to-map animation has finished, and the page presses GeoGuessr's Guess soon after.
  window.addEventListener('drawguess:guess', () => toParent({ ggs: 'done' }));

  // Which countries the drawing can snap to, worked out from the game's map name only:
  //   1. a region pool with that name ("Europe" -> europe),
  //   2. otherwise the countries named in it ("Italy", "Spain & Portugal", "UK Roads"),
  //   3. otherwise GeoGuessr's world coverage.
  const norm = s =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const ALIASES = {
    usa: 'USA',
    us: 'USA',
    'united states': 'USA',
    uk: 'GBR',
    britain: 'GBR',
    'great britain': 'GBR',
    england: 'GBR',
    scotland: 'GBR',
    wales: 'GBR',
    'northern ireland': 'GBR',
    korea: 'KOR',
    china: 'CHN',
    czechia: 'CZE',
    turkiye: 'TUR',
    uae: 'ARE',
    holland: 'NLD',
    'cote d ivoire': 'CIV',
    swaziland: 'SWZ',
    'timor leste': 'TLS',
    bahamas: 'BHS',
    gambia: 'GMB',
    'sao tome': 'STP',
    macedonia: 'MKD',
    burma: 'MMR',
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
  // gamePool: { id, how, map } picked for the game's map
  let hard = false;
  // "Guess must go inside the matched country": the pin goes inside the drawing and the guess
  // lands on the matched country. Off, the pin can go in the sea and stays there (keepSeaPin).
  // The page sends the setting on start.
  let strict = true;
  let gamePool = null;

  async function boardReady() {
    await matcher;
    const sel = document.getElementById('mapSel');
    while (!sel.options.length) await new Promise(r => setTimeout(r, 100));
    return sel;
  }

  async function applyPool() {
    const sel = await boardReady();
    const g = gamePool ?? {
      id: meta.maps.world ? 'world' : sel.options[0].value,
      how: 'map not known yet',
      map: '?',
    };
    const id = hard && meta.maps.all ? 'all' : g.id;
    sel.value = id;
    const pool = meta.maps[id];
    toParent({
      ggs: 'pool',
      map: g.map,
      pool: pool.label,
      how: id === g.id ? g.how : 'hard mode',
      count: pool.codes.length,
    });
  }

  async function selectMap(name) {
    const sel = await boardReady();
    const n = norm(name);
    let id = [...sel.options].find(o => o.value === n || norm(o.textContent).startsWith(n))?.value;
    let how = 'region pool';
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
    if (!id) {
      id = meta.maps.world ? 'world' : sel.options[0].value;
      how = 'no match, using world coverage';
    }
    gamePool = { id, how, map: name };
    applyPool();
  }

  window.addEventListener('message', e => {
    if (e.source !== parent) return;
    const d = e.data ?? {};
    switch (d.ggs) {
      case 'reset':
        window.backToDraw?.(true);
        break;
      case 'map':
        if (d.name) selectMap(d.name);
        break;
      case 'hard':
        hard = !!d.on;
        applyPool();
        break;
      case 'strict':
        strict = !!d.on;
        pinTip();
        break;
      case 'answer':
        setAnswer(d);
        break;
    }
  });

  // this round's location, or null while it's being fetched
  function setAnswer({ lat, lng }) {
    answerCode = null;
    answerLL = typeof lat === 'number' ? { lat, lng } : null;
    if (!answerLL) return;
    matcher.then(() => {
      answerCode = countryAt(lat, lng);
    });
  }

  window.addEventListener('load', () => {
    oneStep();
    toParent({ ggs: 'ready' });
  });

  // One step instead of the app's three (draw -> pin -> reveal): you draw, a click inside the
  // drawing drops the pin, and the only button is Guess. Runs on load, after app.js, and reuses
  // its top-level names (stage, strokes, current, pinXY, pinShape, redraw, ...).
  // a "stroke" smaller than this (canvas units) is a click
  const CLICK = 12;

  // Green islands on a light-blue sea. app.js hard-codes ink and orange, so those are swapped as
  // they're set on its canvas, including the morph's ink->blue and orange->blue fades.
  const INK = [31, 42, 68];
  const ORANGE = [217, 72, 15];
  const BLUE = [28, 126, 214];
  const LINE = [43, 138, 62];
  const LAND = [81, 207, 102];
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
  function recolor(v) {
    if (typeof v !== 'string') return v;
    if (v === '#1f2a44') return `rgb(${LINE})`;
    // ghost of the drawing
    if (v === 'rgba(31,42,68,.28)') return `rgba(${LINE},.4)`;
    if (v === 'rgba(217,72,15,.10)' || v === 'rgba(217,72,15,.16)') return `rgba(${LAND},.55)`;
    const m = v.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/);
    return m ? recolorMorph(v, m) : v;
  }

  // The morph's fades: ink->blue outline (rgb) and orange->blue fill (rgba).
  function recolorMorph(v, m) {
    const [r, , b] = m.slice(1, 4).map(Number);
    const a = m[4];
    if (a === undefined && r <= INK[0] && r >= BLUE[0]) {
      return `rgb(${mixRgb(LINE, BLUE, (b - INK[2]) / (BLUE[2] - INK[2]))})`;
    }
    if (a !== undefined && r <= ORANGE[0] && r >= BLUE[0] && b >= ORANGE[2]) {
      const t = (b - ORANGE[2]) / (BLUE[2] - ORANGE[2]);
      return `rgba(${mixRgb(LAND, BLUE, t)},${(0.55 + (0.16 - 0.55) * t).toFixed(3)})`;
    }
    return v;
  }
  function islandColors() {
    const proto = CanvasRenderingContext2D.prototype;
    for (const prop of ['strokeStyle', 'fillStyle']) {
      const { get, set } = Object.getOwnPropertyDescriptor(proto, prop);
      Object.defineProperty(ctx, prop, {
        get() {
          return get.call(this);
        },
        set(v) {
          set.call(this, recolor(v));
        },
      });
    }
  }
  function oneStep() {
    const btn = document.getElementById('guessBtn');
    const tip = document.getElementById('tip');
    const show = { guessBtn: 'draw pin', undo: 'draw pin', clear: 'draw pin' };
    document.querySelectorAll('.toolbar [data-for], #tip').forEach(el => {
      el.dataset.for = show[el.id] ?? 'none';
    });
    tip.hidden = true;
    pinTip();

    keepPin(btn, tip);
    pointerTweaks();
    const layers = revealLayers();
    runnersCard(layers.real);
    revealExtras(layers);
    reportHeight();

    islandColors();
    // re-apply toolbar visibility with the new data-for values
    setStage(stage);
    redraw();
  }

  function pinTip() {
    const tip = document.getElementById('tip');
    if (tip)
      tip.textContent = strict
        ? 'Click where in your drawing you think you are'
        : 'Click where you think you are';
  }

  // Without strict the pin can go anywhere, on land or in the sea. It belongs to the loop it's in, or in the
  // sea to the nearest loop (the morph needs one to follow).
  function pinLoop(p) {
    const s = shapes();
    const i = s.findIndex(r => inside(p, r));
    return i >= 0 ? i : nearestLoop(p, s);
  }

  function nearestLoop(p, loops) {
    let best = 0;
    let bestD = Infinity;
    loops.forEach((r, i) => {
      const q = nearestOnRing(p, r);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  // Keep the pin through undo/clear/new strokes; drop it only when nothing is drawn (or, with
  // strict, nothing is drawn round it).
  function keepPin(btn, tip) {
    const baseRedraw = redraw;
    redraw = () => {
      baseRedraw();
      if (stage !== 'draw') return;
      // strict: an undo can leave the pin outside what's left, so it goes too
      if (pinXY && (!shapes().length || (strict && !shapes().some(r => inside(pinXY, r))))) pinXY = null;
      else if (pinXY) {
        pinShape = pinLoop(pinXY);
        drawPin(pinXY);
      }
      btn.disabled = !pinXY;
      tip.hidden = !!pinXY || !!current || !shapes().length;
    };
    // app.js registered the unwrapped redraw
    window.addEventListener('resize', () => redraw());
  }

  function pointerTweaks() {
    // Only the main button draws. A right/middle click does nothing: no stroke, no pin, no menu.
    window.addEventListener(
      'pointerdown',
      e => {
        if (e.pointerType === 'mouse' && e.button !== 0) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
    window.addEventListener('contextmenu', e => e.preventDefault());

    document.getElementById('stage').addEventListener('pointerup', clickToPin, true);

    // A button released outside the iframe never sends pointerup here, so a move with no button
    // held ends the stroke instead of carrying on drawing.
    cv.addEventListener(
      'pointermove',
      e => {
        if (current && !(e.buttons & 1)) {
          e.stopImmediatePropagation();
          endStroke();
        }
      },
      true,
    );

    // Enter guesses straight away instead of moving to the app's pin step.
    window.addEventListener(
      'keydown',
      e => {
        if (e.key !== 'Enter' || stage !== 'draw' || e.target.tagName === 'SELECT') return;
        e.stopImmediatePropagation();
        if (pinXY) submitGuess();
      },
      true,
    );
  }

  // A click, not a stroke, drops the pin; the app's own handler then draws nothing.
  function clickToPin(e) {
    if (stage !== 'draw' || !current) return;
    const [x0, y0, x1, y1] = bbox([current]);
    if (Math.max(x1 - x0, y1 - y0) >= CLICK) return;
    current = null;
    const p = pos(e);
    if (strict && !shapes().some(r => inside(p, r))) {
      nudgeTip();
      return;
    }
    if (shapes().length) {
      pinXY = p;
      pinShape = pinLoop(p);
    }
  }

  // the same shake app.js gives a click outside the drawing in its own pin step
  function nudgeTip() {
    const tip = document.getElementById('tip');
    tip.classList.remove('nudge');
    void tip.offsetWidth;
    tip.classList.add('nudge');
  }

  // answer: the correct spot, shown as the reveal zooms out to the map, a flag and a dashed line
  // from the pin. By then the guess is on GeoGuessr's (hidden) map and can't change.
  // real: when the drawing snapped to the wrong country, the round's real country is outlined in
  // green next to the matched (blue) one, on top of it where they overlap.
  // drawn: the drawing itself stays on the map as a dashed outline, where the morph started from.
  function revealLayers() {
    const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const answer = svg();
    answer.setAttribute('visibility', 'hidden');
    setHtml(answer, marks.answerSvg);
    document.getElementById('map').append(answer);
    const real = svg();
    real.id = 'realHl';
    const drawn = svg();
    drawn.id = 'drawnHl';
    document.getElementById('zoomLayer').append(real, drawn);
    const clear = () => {
      answer.setAttribute('visibility', 'hidden');
      drawn.innerHTML = '';
      real.innerHTML = '';
    };
    return { answer, real, drawn, clear };
  }

  // Result card: runners-up (with how close they came) in place of the guess coordinates.
  function runnersCard(realLayer) {
    const coord = document.querySelector('.stats .coord');
    coord.className = 'runners';
    // app.js still writes rCoord
    coord.innerHTML = '<b id="rCoord" hidden></b><span>runners-up</span><ol id="rRunners"></ol>';
    const baseShowCard = showCard;
    showCard = (top, g) => {
      baseShowCard(top, g);
      // Right or wrong, instead of "Your guess is in..." (the guess is locked in by now).
      const kicker = document.querySelector('#reveal .kicker');
      const [cls, html] = verdict(matchData.target, top);
      kicker.className = `kicker${cls}`;
      setHtml(kicker, html);
      realLayer.querySelector('path')?.classList.add('pulse');
      // a single-country map has nothing to compare against
      coord.hidden = matchData.results.length < 2;
      setHtml(
        document.getElementById('rRunners'),
        matchData.results
          .slice(1, 4)
          .map(
            r => `
        <li><i>${esc(r.name)}</i><em><b style="width:${r.score}%"></b></em><u>${r.score}%</u></li>`,
          )
          .join(''),
      );
    };
  }

  function verdict(target, top) {
    if (!target) return ['', 'Your guess is in…'];
    if (target.code === top.code) return [' ok', '✓ Correct country'];
    return [' bad', `✗ Not quite. It was <b>${esc(target.name)}</b>`];
  }

  function revealExtras(layers) {
    // reveal() works out the guess before its first await, so send it right away. The pin is
    // then on GeoGuessr's map even if the round runs out during the animation.
    const baseReveal = reveal;
    reveal = () => {
      layers.clear();
      const run = baseReveal();
      if (guess) toParent({ ggs: 'guess', guess });
      return run;
    };

    const toScreen = ({ lat, lng }) => T.apply(projection([lng, lat]));
    const placeAnswer = () => {
      if (!answerLL || !guess || layers.answer.getAttribute('visibility') === 'hidden') return;
      marks.setAnswer(layers.answer, toScreen(guess), toScreen(answerLL));
    };
    // app.js's own 'zoom' listener updates T first
    zoom.on('zoom.answer', placeAnswer);

    // reveal() calls fitBox() once, for the zoom-out to the matched country. Widen that box to
    // take in the correct spot (and the real country's outline, if different), and show the flag
    // as the zoom starts.
    const baseFitBox = fitBox;
    fitBox = (box, screen, maxK) => {
      if (stage === 'reveal' && answerLL && guess) {
        box = widenForAnswer(box, layers.real);
        // keep everything above the result card, which covers roughly the bottom 36%
        if (screen) screen = [screen[0], screen[1], screen[2], Math.min(screen[3], W * 0.58)];
        layers.answer.setAttribute('visibility', 'visible');
        placeAnswer();
      }
      return baseFitBox(box, screen, maxK);
    };

    const baseStartMorph = startMorph;
    startMorph = targets => {
      showDrawn(layers.drawn);
      const end = baseStartMorph(targets);
      // strict: app.js's end, which it keeps on the matched country's land
      return (strict ? null : keepSeaPin()) ?? end;
    };

    const baseBackToDraw = backToDraw;
    backToDraw = (...args) => {
      layers.clear();
      return baseBackToDraw(...args);
    };
  }

  function widenForAnswer(box, realLayer) {
    const [px, py] = projection([answerLL.lng, answerLL.lat]);
    const m = Math.max(8, 0.1 * Math.max(box[2] - box[0], box[3] - box[1]));
    const grow = ([x0, y0], [x1, y1]) => [
      Math.min(box[0], x0),
      Math.min(box[1], y0),
      Math.max(box[2], x1),
      Math.max(box[3], y1),
    ];
    box = grow([px - m, py - m], [px + m, py + m]);
    const real = showReal(realLayer);
    return real ? grow(real[0], real[1]) : box;
  }

  // Outlines the round's real country when the match was wrong; returns its bounds, or null.
  function showReal(realLayer) {
    const t = matchData?.target;
    const polys = t && t.code !== matchData.results[0].code && geo[t.code];
    if (!polys) return null;
    // copied, as fixWinding reverses rings in place
    const coordinates = polys.map(p => p.map(r => r.slice()));
    const feat = fixWinding({ type: 'MultiPolygon', coordinates });
    d3.select(realLayer).append('path').datum(feat).attr('d', geoPath);
    return geoPath.bounds(feat);
  }

  // reveal() has just zoomed the map so the matched country sits on the drawing, so T.invert
  // takes the drawing from canvas to map coordinates.
  function showDrawn(drawnLayer) {
    const d = shapes()
      .map(r => `M${r.map(p => T.invert(p).join(',')).join('L')}Z`)
      .join('');
    setHtml(drawnLayer, `<path d="${d}"/>`);
  }

  // A pin in the sea stays where it was put relative to the drawing (app.js would pull it onto
  // the nearest coast). The reveal lines the matched country up with the drawing before
  // morphing, so that spot becomes the guess: draw the US, click off its south-west coast, and
  // you're guessing Hawaii. Returns the morph's new end, or null to keep app.js's.
  function keepSeaPin() {
    if (!morph?.pin || inside(pinXY, shapes()[pinShape])) return null;
    const raw = blend(morph.pin.w, morph.pin.pair.b);
    morph.pin.corr = [pinXY[0] - raw[0], pinXY[1] - raw[1]];
    morph.pin.end = pinXY.slice();
    return pinXY.slice();
  }

  // Tell the page how tall the board is (plus .wrap's 10px padding top and bottom), so the
  // frame fits it exactly.
  function reportHeight() {
    const board = document.querySelector('.board');
    const height = () => Math.ceil(board.getBoundingClientRect().height) + 20;
    new ResizeObserver(() => toParent({ ggs: 'height', h: height() })).observe(board);
  }
})();
