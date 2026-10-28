// Map aids: scripts that work on the guess map during a round. One loop per script tracks
// the guess map, the round and its real location, and calls the script's hooks.
//   ggs.aid(id, hooks) -> { start(cfg) } for ggs.scripts. All hooks are optional.
//     shapes(ctx) -> [{ type: 'Polygon' | 'Polyline' | 'Circle' | 'Marker', ...options }], or a
//       Promise of that. Drawn once the location is known, redrawn when the round or settings change.
//     round(ctx): a new round started. Shapes and ctx.add() overlays are already cleared.
//     attach(ctx) -> cleanup?: a guess map was found. GeoGuessr can make a new one mid-game.
//     tick(ctx): every 300 ms while there's a guess map.
//     click(latLng, ctx): the player clicked the guess map (not our own placeGuess).
//     beforeGuess(ctx) -> { lat, lng } | false | null: Guess was pressed. A point moves the guess
//       there first, false stops it. ctx.loc may still be null.
//     usesLocation: false when the script doesn't need the round's location, so it isn't fetched.
//     css: a stylesheet added while the script runs.
//     colour: the shapes' colour, or (ctx) -> colour. The note then shows the script's name on
//       it, so hints drawn together can be told apart. A lie looks just like the truth.
//     name(ctx): the name on that note, when it isn't the script's own.
//     lies: true for a 50% chance each round that ctx.loc is a made-up spot (Lying hints).
//       Settings with `lies` (as Chaos mode's have) do the same.
//     stop(ctx): the script is about to stop. Its overlays are still on the map.
// ctx: { cfg, map, loc (null until known), gm, rand(), pick(), add(spec), remove(overlay),
//   note(text), status(text) }. rand() is a stream seeded by loc. pick() is seeded by the real
//   round, so it's the same whether lying or not. note() puts a badge on the map ('' hides it).
// ggs.aid.hints[id] = { shapes(ctx), random(rand) -> cfg } lists the hint scripts for Lying
// hints to pick from.
// The location is only used to draw an area it's inside, a distance, or to pick between the
// player's own pins. It's never drawn itself.
(() => {
  const ggs = globalThis.__ggs;
  const KM_PER_DEG = 111.32;
  const EARTH_KM = 6371;
  // km. The band sliders' marks, then the hemisphere.
  const BANDS = [0, 5, 25, 50, 100, 500, 1000, 2500];
  // km. The radius slider's first marks.
  const RADII = [5, 25, 50, 100, 500, 1000, 2500];
  const RING_PX = 9;
  // Not clickable, so clicks still reach the map to place the guess.
  const STYLE = {
    strokeColor: '#2b8a3e',
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: '#40c057',
    fillOpacity: 0.3,
    clickable: false,
    zIndex: 1,
  };
  // Notes from every script stack in one corner of the map.
  const NOTES_CSS =
    'position:absolute;top:8px;left:8px;z-index:10;display:flex;flex-direction:column;' +
    'align-items:flex-start;gap:6px;pointer-events:none;';
  const NOTE_CSS =
    'padding:4px 9px;border-radius:6px;background:#fecd19;color:#1c1a2e;' +
    'font:800 13px/1.2 system-ui,sans-serif;box-shadow:3px 3px 0 #1c1a2e;';
  function notesIn(div) {
    let box = div.querySelector(':scope > [data-ggs-notes]');
    if (!box) {
      box = document.createElement('div');
      box.dataset.ggsNotes = '';
      box.style.cssText = NOTES_CSS;
      div.append(box);
    }
    return box;
  }

  // A seeded random stream (FNV-1a into mulberry32). Seeded by the game, the round's location
  // and the script, so a reload draws the same shapes and can't be used to average them out.
  function seeded(str) {
    let a = 2166136261;
    for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Every size's band is placed biggest first, each inside the one before and all holding x.
  // So moving the slider mid-round tells you no more than the thinnest band you looked at.
  // The biggest is the hemisphere, 0 to ±half. x, half and the result are in degrees.
  // Widths are km along the axis. For longitude that's at the equator, so a band's width
  // can't give the latitude away.
  function band(x, rand, index, half) {
    let lo = x < 0 ? -half : 0;
    let hi = lo + half;
    for (let i = BANDS.length - 1; i >= index; i--) {
      const w = BANDS[i] / KM_PER_DEG;
      const min = Math.max(lo, x - w);
      const max = Math.min(hi - w, x);
      lo = min + rand() * (max - min);
      hi = lo + w;
    }
    return [lo, hi];
  }

  // The same nesting for circles. Each centre is within 95% of its radius of the location, and
  // close enough to the bigger circle's centre to sit inside it. Offsets are km east and north.
  // If 50 tries miss, the point on the line from the bigger centre towards the location fits.
  function circle(loc, rand, index) {
    let c = [0, 0];
    let room = Infinity;
    for (let i = RADII.length - 1; i >= index; i--) {
      const r = 0.95 * RADII[i];
      let p = null;
      for (let t = 0; t < 50 && !p; t++) {
        const d = r * Math.sqrt(rand());
        const a = 2 * Math.PI * rand();
        const q = [d * Math.sin(a), d * Math.cos(a)];
        if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= room) p = q;
      }
      if (!p) {
        const d = Math.hypot(...c);
        const k = Math.max(0, 1 - room / d);
        p = [c[0] * k, c[1] * k];
      }
      c = p;
      room = RADII[i] - (RADII[i - 1] ?? 0);
    }
    return { center: destination(loc, Math.hypot(...c), Math.atan2(c[0], c[1])), km: RADII[index] };
  }

  // A lat/lng box as unstroked pieces at most 90 degrees wide, since Google Maps takes the
  // short way between two points. latLine and lngLine draw edges over the joins.
  function box(s, n, w, e) {
    const out = [];
    for (let x = w; x < e; x += 90) {
      const x2 = Math.min(e, x + 90);
      const paths = [
        { lat: s, lng: x },
        { lat: n, lng: x },
        { lat: n, lng: x2 },
        { lat: s, lng: x2 },
      ];
      out.push({ type: 'Polygon', strokeWeight: 0, paths });
    }
    return out;
  }
  const latLine = lat => ({ type: 'Polyline', path: [-180, -90, 0, 90, 180].map(lng => ({ lat, lng })) });
  const lngLine = lng => ({
    type: 'Polyline',
    path: [
      { lat: -85, lng },
      { lat: 85, lng },
    ],
  });

  // The point km away from a spot along a bearing (radians from north), on a sphere.
  function destination({ lat, lng }, km, bearing) {
    const rad = Math.PI / 180;
    const d = km / EARTH_KM;
    const p1 = lat * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(bearing));
    const l2 =
      lng * rad +
      Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
  }

  // Great-circle distance in km.
  function distance(a, b) {
    const rad = Math.PI / 180;
    const h =
      Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Country outlines from draw-guess's geo.json (code -> [[outer ring, ...holes], ...] in
  // [lng, lat]). Fetched once, the first time a script asks.
  let geo = null;
  const loadGeo = () =>
    (geo ??= fetch(`${ggs.extBase}src/scripts/draw-guess/app/data/geo.json`)
      .then(r => r.json())
      .catch(err => {
        geo = null;
        throw err;
      }));

  function inside([x, y], ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  // Which country a spot is in: the smallest outline holding it, so the Vatican beats Italy.
  // Failing that, with `near`, the nearest vertex within ~1.5 degrees. That catches coastal
  // roads outside the simplified coastlines.
  function countryAt(geo, { lat, lng }, { near: useNear = true } = {}) {
    let best = null;
    let bestArea = Infinity;
    let near = null;
    let nearD = 1.5 ** 2;
    const k = Math.cos((lat * Math.PI) / 180);
    for (const [code, polys] of Object.entries(geo)) {
      for (const [outer, ...holes] of polys) {
        if (inside([lng, lat], outer) && !holes.some(h => inside([lng, lat], h))) {
          const xs = outer.map(p => p[0]);
          const ys = outer.map(p => p[1]);
          const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
          if (area < bestArea) {
            bestArea = area;
            best = code;
          }
        }
        if (!useNear) continue;
        for (const [x, y] of outer) {
          const d = ((x - lng) * k) ** 2 + (y - lat) ** 2;
          if (d < nearD) {
            nearD = d;
            near = code;
          }
        }
      }
    }
    return best ?? near;
  }

  // Whether any drawn shape holds a spot. Polygons by even-odd, also one turn of the globe
  // either way for pieces drawn past ±180. Circles by distance.
  function covers(specs, p) {
    return specs.some(s => {
      if (s.type === 'Circle') return distance(s.center, p) <= s.radius / 1000;
      if (s.type !== 'Polygon') return false;
      const rings = (s.paths[0]?.lat === undefined ? s.paths : [s.paths]).map(r =>
        r.map(q => [q.lng, q.lat]),
      );
      return [p.lng, p.lng - 360, p.lng + 360].some(
        x => rings.filter(r => inside([x, p.lat], r)).length % 2 === 1,
      );
    });
  }

  // Guess presses (the button's click or Space), caught before GeoGuessr sees them, for the
  // scripts with a beforeGuess hook. `passing` lets our own press afterwards through.
  const guessHooks = new Set();
  let passing = false;
  let swallowUp = false;
  function onPress(e) {
    if (passing || !guessHooks.size) return;
    if (e.type === 'keyup') {
      if (swallowUp && e.code === 'Space') {
        swallowUp = false;
        e.stopImmediatePropagation();
      }
      return;
    }
    const isPress =
      e.type === 'keydown'
        ? e.code === 'Space' && !ggs.isTyping(e) && !!ggs.maps.guessMapElement()
        : !!ggs.maps.guessButton()?.contains(e.target);
    if (!isPress) return;
    let p = null;
    let block = false;
    for (const fn of guessHooks) {
      const r = fn();
      if (r === false) block = true;
      else p = r ?? p;
    }
    if (!p && !block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'keydown') swallowUp = true;
    if (block) return;
    ggs.maps.placeGuess(p.lat, p.lng, { pan: false });
    passing = true;
    // Waits so GeoGuessr takes the new pin first.
    setTimeout(() => {
      if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
      passing = false;
    }, 150);
  }
  for (const type of ['click', 'keydown', 'keyup']) window.addEventListener(type, onPress, true);

  // A hint that lied says so in its own note ("Area was a lie") once the player has guessed or
  // the round is over. A guess is Guess clicked or Space with a pin down (board guesses press
  // the same button). Over is the guess map gone OVER_MS, and the note stays on the results map.
  const OVER_MS = 1500;
  // Each running aid's own-up, called on a guess.
  const owners = new Set();
  const guessed = () => {
    if (ggs.maps.lastGuess()) for (const fn of owners) fn();
  };
  window.addEventListener(
    'click',
    e => {
      if (ggs.maps.guessButton()?.contains(e.target)) guessed();
    },
    true,
  );
  window.addEventListener(
    'keydown',
    e => {
      if (e.code === 'Space' && !ggs.isTyping(e) && ggs.maps.guessMapElement()) guessed();
    },
    true,
  );

  // Lying (an aid with `lies`): each round there's a 50% chance it works from a made-up spot
  // instead of the real one. The coin and the spots are seeded like the shapes, so a reload
  // doesn't flip them. Made-up spots are points on random countries' outlines. For aids that
  // draw shapes, the first spot whose shapes leave the real location out is used.
  async function fakes(rand) {
    const geo = await loadGeo();
    const codes = Object.keys(geo).sort();
    const pick = list => list[Math.floor(rand() * list.length)];
    return Array.from({ length: 20 }, () => {
      const [lng, lat] = pick(pick(pick(geo[pick(codes)])));
      return { lat, lng };
    });
  }

  ggs.aid = (id, hooks) => ({
    start(cfg) {
      let map = null;
      let round = null;
      let real = null;
      let loc = null;
      let lying = null;
      let lies = null;
      let stopped = false;
      const shapes = [];
      let shapesKey = '';
      let extras = [];
      let listener = null;
      let note = null;
      let detach = null;
      const gm = () => window.google.maps;
      const colour = () => (typeof hooks.colour === 'function' ? hooks.colour(ctx) : hooks.colour);
      const look = () => {
        const c = colour();
        return c ? { ...STYLE, strokeColor: c, fillColor: c } : STYLE;
      };
      const make = ({ type, ...o }) => new (gm()[type])({ ...look(), ...o, map });
      const clear = list => {
        for (const o of list) o.setMap(null);
        list.length = 0;
      };
      const seed = (what, p) => seeded(`${id}|${what}|${ggs.game.context()?.token}|${p?.lat}|${p?.lng}`);
      const ctx = {
        get cfg() {
          return cfg;
        },
        get map() {
          return map;
        },
        get loc() {
          return loc;
        },
        get gm() {
          return gm();
        },
        rand: () => seed('shape', loc),
        pick: () => seed('pick', real),
        // Takes a spec or a ready-made overlay.
        add(spec) {
          const o = spec.setMap ? spec : make(spec);
          if (o === spec) o.setMap(map);
          extras.push(o);
          return o;
        },
        remove(o) {
          o.setMap(null);
          extras = extras.filter(x => x !== o);
        },
        note(text) {
          if (stopped) return;
          if (!note) {
            note = document.createElement('div');
            note.style.cssText = NOTE_CSS;
          }
          note.textContent = text;
          note.hidden = !text;
          if (text && map && note.parentNode?.parentNode !== map.getDiv()) notesIn(map.getDiv()).append(note);
        },
        status: text => ggs.status(id, text),
      };
      const guessHook = hooks.beforeGuess && (() => hooks.beforeGuess(ctx));
      if (guessHook) guessHooks.add(guessHook);
      const css = hooks.css && Object.assign(document.createElement('style'), { textContent: hooks.css });
      if (css) document.head.append(css);

      // The key for a coloured hint: its name on its colour.
      const name = () => hooks.name?.(ctx) ?? ggs.registry.find(m => m.id === id)?.name ?? id;
      // owned is the round whose lie was owned up to.
      let goneSince = 0;
      let owned = null;
      function ownUp() {
        if (!lying || !loc || loc === real || !note?.textContent) return;
        owned = round;
        ctx.note(`${name()} was a lie`);
      }
      owners.add(ownUp);
      function label() {
        ctx.note(name());
        if (note) Object.assign(note.style, { background: colour(), color: '#fff' });
      }

      // A circle's ring shows while the circle is under RING_PX across on screen.
      // Metres per pixel come from the zoom.
      function rings() {
        const z = map?.getZoom();
        for (const o of shapes) {
          if (!o.ring || z == null) continue;
          const px = o.getRadius() / ((156543 * Math.cos((o.getCenter().lat() * Math.PI) / 180)) / 2 ** z);
          o.ring.setVisible(px < RING_PX);
        }
      }

      // The shapes for the current spot. When lying, made-up spots are tried until the shapes
      // miss the real one. loc stays on the one it settled on, for the other hooks too.
      async function draw(want) {
        let specs = await hooks.shapes(ctx);
        for (let i = 1; lies && i < lies.length && covers(specs, real); i++) {
          loc = lies[i];
          specs = await hooks.shapes(ctx);
          if (shapesKey !== want) return null;
        }
        return specs;
      }

      const tick = setInterval(() => {
        const now = ggs.maps.findGuessMap();
        const key = ggs.game.roundKey();
        if (!now) {
          goneSince ||= Date.now();
          if (Date.now() - goneSince > OVER_MS) ownUp();
          return;
        }
        goneSince = 0;
        // GeoGuessr made a new map, so move everything onto it.
        if (now !== map) {
          map = now;
          listener?.remove();
          listener = gm().event.addListener(map, 'click', e => {
            if (!ggs.maps.placing() && e?.latLng) hooks.click?.(e.latLng, ctx);
          });
          for (const o of extras) o.setMap(map);
          shapesKey = '';
          if (note?.textContent) ctx.note(note.textContent);
          detach?.();
          detach = hooks.attach?.(ctx) ?? null;
        }
        if (key !== round) {
          round = key;
          real = loc = lying = lies = null;
          clear(shapes);
          clear(extras);
          shapesKey = '';
          ctx.note('');
          hooks.round?.(ctx);
          if (hooks.usesLocation !== false) {
            ggs.game.roundLocation().then(l => {
              // Moved on, or stopped.
              if (round !== key) return;
              real = l;
              ctx.status(l ? '' : `Not this round (${ggs.game.whyNoRound()})`);
            });
          }
        }
        hooks.tick?.(ctx);
        rings();
        if (!real) return;
        const lie = !!(hooks.lies || cfg.lies) && seed('lie', real)() < 0.5;
        // First time this round.
        if (lie !== lying) {
          lying = lie;
          lies = null;
          loc = lie ? null : real;
          shapesKey = '';
          if (lie) {
            fakes(seed('fake', real)).then(
              list => {
                if (round === key && lying === lie) {
                  lies = list;
                  loc = list[0];
                }
              },
              () => {
                // No outlines to lie with, so tell the truth.
                if (round === key && lying === lie) loc = real;
              },
            );
          }
        }
        // A redraw after the guess put the plain name back.
        if (owned === key) ownUp();
        const want = `${round}|${lying}|${JSON.stringify(cfg)}`;
        if (!loc || !hooks.shapes || want === shapesKey) return;
        shapesKey = want;
        if (lies) loc = lies[0];
        draw(want).then(
          specs => {
            // The settings or round moved on (or it stopped) while it loaded.
            if (!specs || shapesKey !== want) return;
            clear(shapes);
            shapes.push(...specs.map(make));
            // A circle also gets a ring of RING_PX on its centre, so it can be found zoomed out.
            // rings() shows it only while the circle itself is smaller than that.
            for (const o of [...shapes]) {
              if (!(o instanceof gm().Circle)) continue;
              const icon = {
                path: 0,
                scale: RING_PX,
                strokeColor: look().strokeColor,
                strokeWeight: 3,
                fillColor: look().fillColor,
                fillOpacity: 0.3,
              };
              o.ring = make({ type: 'Marker', position: o.getCenter(), visible: false, icon });
              shapes.push(o.ring);
            }
            rings();
            if (hooks.colour) label();
          },
          err => {
            if (shapesKey === want) ctx.status(`Couldn't draw it (${err.message})`);
          },
        );
      }, 300);

      return {
        update(next) {
          cfg = next;
        },
        stop() {
          try {
            hooks.stop?.(ctx);
          } catch (err) {
            ggs.log(`${id} stop failed`, err);
          }
          stopped = true;
          owners.delete(ownUp);
          // Late promises see this and drop their results.
          round = shapesKey = null;
          clearInterval(tick);
          guessHooks.delete(guessHook);
          listener?.remove();
          detach?.();
          clear(shapes);
          clear(extras);
          const box = note?.parentNode;
          note?.remove();
          // The last script's note takes the corner box with it.
          if (box && !box.children.length) box.remove();
          css?.remove();
          ctx.status('');
        },
      };
    },
  });
  Object.assign(ggs.aid, {
    seeded,
    band,
    circle,
    box,
    latLine,
    lngLine,
    destination,
    distance,
    loadGeo,
    countryAt,
    covers,
    hints: {},
  });
})();
