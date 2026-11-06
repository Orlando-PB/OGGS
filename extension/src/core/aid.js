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
// hints to pick from. ggs.aid also carries geo.js's geometry helpers (ggs.aid.distance etc).
// The location is only used to draw an area it's inside, a distance, or to pick between the
// player's own pins. It's never drawn itself.
(() => {
  const ggs = globalThis.__ggs;
  const { seeded, covers, loadGeo } = ggs.geo;
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

  // Guess presses (the button's click or Space), caught before GeoGuessr sees them, for the
  // scripts with a beforeGuess hook. `passing` lets our own press afterwards through.
  // beforeGuess hook -> its script's id
  const guessHooks = new Map();
  let passing = false;
  let swallowUp = false;
  function isGuessPress(e) {
    if (e.type === 'keydown') return e.code === 'Space' && !ggs.isTyping(e) && !!ggs.maps.guessMapElement();
    return !!ggs.maps.guessButton()?.contains(e.target);
  }
  // Any hook returning false blocks the guess. Otherwise the last point given wins, and `by`
  // is the script that gave it.
  function askGuessHooks() {
    let point = null;
    let by = null;
    let block = false;
    for (const [fn, id] of guessHooks) {
      const r = fn();
      if (r === false) block = true;
      else if (r) [point, by] = [r, id];
    }
    return { point, by, block };
  }
  // The press was already held back, so a pin that can't be moved is said out loud.
  function guessAt(p, by) {
    try {
      ggs.maps.placeGuess(p.lat, p.lng, { pan: false });
    } catch (err) {
      ggs.log('could not move the guess', err);
      ggs.status(by, "Couldn't place the guess. GeoGuessr may have changed something, please tell Orlando");
      return;
    }
    passing = true;
    // Waits so GeoGuessr takes the new pin first.
    setTimeout(() => {
      if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
      passing = false;
    }, 150);
  }
  // The keyup after a swallowed Space press goes too.
  function onKeyUp(e) {
    if (!swallowUp || e.code !== 'Space') return;
    swallowUp = false;
    e.stopImmediatePropagation();
  }
  function onPress(e) {
    if (passing || !guessHooks.size) return;
    if (e.type === 'keyup') return onKeyUp(e);
    if (!isGuessPress(e)) return;
    const { point, by, block } = askGuessHooks();
    if (!point && !block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'keydown') swallowUp = true;
    if (!block) guessAt(point, by);
  }
  for (const type of ['click', 'keydown', 'keyup']) window.addEventListener(type, onPress, true);

  // A hint that lied says so in its own note ("Area was a lie") once the player has guessed or
  // the round is over. A guess is Guess clicked or Space with a pin down (board guesses press
  // the same button). Over is the guess map gone OVER_MS, and the note stays on the results map.
  const OVER_MS = 1500;
  // Lookups of the round's location, RETRY_MS apart.
  const LOCATION_TRIES = 3;
  const RETRY_MS = 5000;
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

  // A circle's ring: a marker RING_PX in radius on its centre, so it can be found zoomed out.
  const ringIcon = look => ({
    path: 0,
    scale: RING_PX,
    strokeColor: look.strokeColor,
    strokeWeight: 3,
    fillColor: look.fillColor,
    fillOpacity: 0.3,
  });

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
      let zoomListener = null;
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
      // A hook that throws holds that press back and says so; on the next press of the round it
      // stands aside, so the player is never stuck unable to guess.
      let hookFailedIn = null;
      const guessHook =
        hooks.beforeGuess &&
        (() => {
          if (hookFailedIn === ggs.game.roundKey()) return null;
          try {
            return hooks.beforeGuess(ctx);
          } catch (err) {
            hookFailedIn = ggs.game.roundKey();
            ggs.log(`${id} beforeGuess failed`, err);
            const msg = `Something went wrong, press Guess again to guess without ${name()}`;
            ctx.status(msg);
            ctx.note(msg);
            return false;
          }
        });
      if (guessHook) guessHooks.set(guessHook, id);
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

      // A circle under RING_PX in radius on screen is swapped for its ring, so the two never
      // show at once. Metres per pixel come from the zoom.
      function rings() {
        const z = map?.getZoom();
        for (const o of shapes) {
          if (!o.ring || z == null) continue;
          const px = o.getRadius() / ((156543 * Math.cos((o.getCenter().lat() * Math.PI) / 180)) / 2 ** z);
          o.ring.setVisible(px < RING_PX);
          o.setVisible(px >= RING_PX);
        }
      }

      // GeoGuessr made a new map, so move everything onto it.
      function moveTo(now) {
        map = now;
        listener?.remove();
        zoomListener?.remove();
        listener = gm().event.addListener(map, 'click', e => {
          if (!ggs.maps.placing() && e?.latLng) hooks.click?.(e.latLng, ctx);
        });
        // At once, not on the next tick, so the swap doesn't trail the zoom.
        zoomListener = gm().event.addListener(map, 'zoom_changed', rings);
        for (const o of extras) o.setMap(map);
        shapesKey = '';
        if (note?.textContent) ctx.note(note.textContent);
        detach?.();
        detach = hooks.attach?.(ctx) ?? null;
      }

      function newRound(key) {
        round = key;
        real = loc = lying = lies = null;
        clear(shapes);
        clear(extras);
        shapesKey = '';
        ctx.note('');
        hooks.round?.(ctx);
        if (hooks.usesLocation !== false) findLocation(key);
      }

      // A failed lookup (a network blip) is tried again a few times before giving up.
      function findLocation(key, tries = 1) {
        ggs.game.roundLocation().then(l => gotLocation(key, l, tries));
      }
      function gotLocation(key, l, tries) {
        // Moved on, or stopped.
        if (round !== key) return;
        real = l;
        ctx.status(l ? '' : ggs.game.whyNoRound());
        if (!l && tries < LOCATION_TRIES) setTimeout(() => findLocation(key, tries + 1), RETRY_MS);
      }

      // Tosses this round's coin, the first time the real location is known.
      function tossCoin(key) {
        const lie = !!(hooks.lies || cfg.lies) && seed('lie', real)() < 0.5;
        if (lie === lying) return;
        lying = lie;
        lies = null;
        loc = lie ? null : real;
        shapesKey = '';
        if (!lie) return;
        const current = () => round === key && lying === lie;
        fakes(seed('fake', real)).then(
          list => {
            if (!current()) return;
            lies = list;
            loc = list[0];
          },
          () => {
            // No outlines to lie with, so tell the truth.
            if (current()) loc = real;
          },
        );
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

      // rings() shows a circle's ring in its place while the circle is smaller than it.
      function show(specs) {
        clear(shapes);
        shapes.push(...specs.map(make));
        for (const o of [...shapes]) {
          if (!(o instanceof gm().Circle)) continue;
          o.ring = make({ type: 'Marker', position: o.getCenter(), visible: false, icon: ringIcon(look()) });
          shapes.push(o.ring);
        }
        rings();
        if (hooks.colour) label();
      }

      function redraw(want) {
        shapesKey = want;
        if (lies) loc = lies[0];
        draw(want).then(
          specs => {
            // The settings or round moved on (or it stopped) while it loaded.
            if (specs && shapesKey === want) show(specs);
          },
          err => {
            if (shapesKey === want) ctx.status(`Couldn't draw it (${err.message})`);
          },
        );
      }

      // Follows GeoGuessr onto a new guess map or into a new round.
      function catchUp(now, key) {
        if (now !== map) moveTo(now);
        if (key !== round) newRound(key);
      }

      function withLocation(key) {
        tossCoin(key);
        // A redraw after the guess put the plain name back.
        if (owned === key) ownUp();
        const want = `${round}|${lying}|${JSON.stringify(cfg)}`;
        if (loc && hooks.shapes && want !== shapesKey) redraw(want);
      }

      function mapGone() {
        goneSince ||= Date.now();
        if (Date.now() - goneSince > OVER_MS) ownUp();
      }

      const tick = setInterval(() => {
        const now = ggs.maps.findGuessMap();
        const key = ggs.game.roundKey();
        if (!now) return mapGone();
        goneSince = 0;
        catchUp(now, key);
        hooks.tick?.(ctx);
        rings();
        if (real) withLocation(key);
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
          zoomListener?.remove();
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
  // Scripts use the geometry helpers from here.
  Object.assign(ggs.aid, ggs.geo, { hints: {} });
})();
