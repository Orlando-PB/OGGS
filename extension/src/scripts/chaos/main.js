// Chaos mode: every so often a random effect switches on for LIFE_MS. An effect is another
// script with random settings, or one of the Controls locks. While chaos runs, boot.js runs
// ggs.chaos.mix()'s settings for every script outside Controls and UI.
// The clocks only run while a guess map is on screen. Each round starts clean, with the first
// effect FIRST_MS in. A drawing board stays for the rest of its round and ends the effects that
// need the map.
// The next effect is picked a whole interval ahead so slow ones (tile filters, Minecraft) can
// prepare. One that isn't ready in time waits a turn and a quick one goes instead.
(() => {
  const ggs = globalThis.__ggs;
  const EVERY = [10, 15, 20, 30, 45, 60, 90, 120]; // seconds, by the slider
  const LIFE_MS = 30000, FIRST_MS = 3000, TICK_MS = 250;
  // The guess map gone this long means the round is over. It can blink mid-round.
  const AWAY_MS = 1500;
  // Chance of a board per pick at a 30 s interval. It scales with the interval, so a board comes
  // up about once a game whatever the setting.
  const DRAW_CHANCE = 0.04;
  const BOARDS = ['draw-guess', 'flag-guess'];
  // Effects that need the guess map, which a board hides (or that press Guess themselves).
  const NEEDS_MAP = [
    'guesses', 'wobble', 'ocean', 'in-country', 'blind', 'drift', 'lat-band', 'lng-band', 'radius', 'distance', 'liar', 'lag',
  ];
  // Street View tile filters: slow to switch.
  const TILES = ['ascii', 'minecraft', 'lying-signs', 'gradient', 'greyscale'];
  const PRELOAD_MS = 4000; // before a tile filter ends
  // Only one effect of each group runs at a time, on top of each meta's own `excludes`.
  const GROUPS = [
    TILES,
    ['blank', 'blink', 'eye', 'peek', 'scratch', 'radio'], // hide Street View: two at once leave nothing
    ['flip', 'reverse'], // input mirrors cancel each other out
    ['compass', 'noPan'], // both hold the view still
    ['maxzoom', 'noZoom'], // both hold the zoom
    ['flip', 'spin'], // a flipped picture spinning looks like a plain spinning one
  ];
  const LIARS = ['lat-band', 'lng-band', 'radius', 'distance']; // hints that may lie
  const SKIP = ['liar']; // the hints above already lie
  // Options chaos leaves as the player set them.
  const KEEP = {
    minecraft: ['code'], radio: ['streamerMode'], 'draw-guess': ['hardMode'], 'flag-guess': ['forceInside'],
  };
  const LOCKS = { noMove: 'move', noPan: 'pan', noZoom: 'zoom' };
  // NMPZ, Clean map, OGGS tab: the player's own
  const own = () => ggs.registry.find(m => m.id === 'chaos').own;
  const MIC = ['eye', 'jammer']; // only once the microphone is allowed
  // Settings chaos always uses: every Reverse control (one alone is too easy to miss),
  // Ghana tape on any round, and Minecraft at high quality.
  const FIXED = {
    reverse: { move: true, turn: true, drag: true, zoom: true },
    'ghana-tape': { everywhere: true },
    minecraft: { hq: true },
  };
  // Effects never queued with less than this long to get ready (ms).
  const LEAD = { minecraft: 10000 };
  // Controls held still leave nothing to reverse.
  const STILL = [...Object.keys(LOCKS), 'compass'];

  const byId = id => ggs.registry.find(m => m.id === id);
  const clash = (a, b) => {
    if (GROUPS.some(g => g.includes(a) && g.includes(b))) return true;
    if ((a === 'reverse' && STILL.includes(b)) || (b === 'reverse' && STILL.includes(a))) return true;
    const boardClash = BOARDS.includes(a)
      ? NEEDS_MAP.includes(b) || BOARDS.includes(b)
      : BOARDS.includes(b) && NEEDS_MAP.includes(a);
    if (boardClash) return true;
    return !!(byId(a)?.excludes?.includes(b) || byId(b)?.excludes?.includes(a));
  };

  const pick = list => list[Math.floor(Math.random() * list.length)];
  // Random settings: any slider stop, any choice, a coin per checkbox. A script with only
  // checkboxes gets at least one on.
  function randomCfg(meta, stored) {
    const cfg = ggs.config(meta, stored);
    const free = meta.options.filter(o => !KEEP[meta.id]?.includes(o.key) && o.type !== 'text');
    for (const o of free) {
      if (o.type === 'slider') {
        cfg[o.key] = o.min + Math.floor(Math.random() * (o.max - o.min + 1));
      } else if (o.type === 'buttons' || o.type === 'select') {
        // a real choice, never "Random", so the panel can name it
        cfg[o.key] = pick(o.choices.filter(c => !/^random/i.test(c.label))).value;
      } else if (o.type === 'checkbox') {
        cfg[o.key] = Math.random() < 0.5;
      }
    }
    const boxes = free.filter(o => o.type === 'checkbox');
    const onlyBoxes = boxes.length && boxes.length === meta.options.length;
    if (onlyBoxes && !boxes.some(o => cfg[o.key])) cfg[pick(boxes).key] = true;
    return { ...cfg, ...FIXED[meta.id], enabled: true };
  }
  // "Delay (ms)" at "200" -> "Delay 200 ms". A stop that isn't a number is just itself.
  function withUnit(label, mark) {
    const [, name, unit] = /^(.*?)\s*\((\S+)\)$/.exec(label) ?? [];
    if (!/^[\d.]+$/.test(mark)) return mark;
    return unit ? `${name} ${mark} ${unit}` : `${label} ${mark}`;
  }
  // A few words on the settings it got, for the panel: choices and named slider stops.
  function describe(meta, cfg) {
    return meta.options.map(o => {
      const v = cfg[o.key];
      if (KEEP[meta.id]?.includes(o.key)) return '';
      if (o.choices) return o.choices.find(c => String(c.value) === String(v))?.label ?? '';
      if (o.steps) return o.steps[v - o.min] ?? '';
      if (o.marks?.length === o.max - o.min + 1) return withUnit(o.label, o.marks[v - o.min]);
      return '';
    }).filter(Boolean).join(' · ');
  }

  const PANEL_CSS = `
    .panel { width: 220px; }
    .head { padding: 8px 12px 0; background: none; } /* just the word, still the drag handle */
    .row { display: flex; align-items: center; gap: 8px; }
    .label { flex: 1; min-width: 0; }
    .label b {
      display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .label small {
      display: block; font-size: 11px; color: rgba(255, 255, 255, .6);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .secs { flex: none; font: 600 11px/1 ui-monospace, monospace; color: rgba(255, 255, 255, .7); }
    .bar {
      height: 4px; margin-top: 4px; border-radius: 2px; background: rgba(255, 255, 255, .12); overflow: hidden;
    }
    .bar i { display: block; height: 100%; background: #fecd19; transition: width ${TICK_MS}ms linear; }
    .next .bar i { background: rgba(255, 255, 255, .7); }
    ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    ul:empty { display: none; }
    li { animation: pop .35s ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateX(-12px); } }`;
  const PANEL_HTML = '<div class="next"><div class="row"><span class="label"><b>Next effect</b></span>' +
    '<span class="secs"></span></div><div class="bar"><i></i></div></div><ul></ul>';

  // key (script id or lock name) -> { key, name, detail, cfg?, left?, round? }
  const active = new Map();
  // ggs.chaos.mix(stored) -> the settings boot.js runs while chaos is on
  ggs.chaos = {
    mix(stored) {
      const out = {};
      for (const m of ggs.registry) {
        out[m.id] = own().includes(m.id) ? stored[m.id] : active.get(m.id)?.cfg ?? { enabled: false };
      }
      return out;
    },
  };

  function start(cfg) {
    // What's on shows in its own panel. This clears a list older versions left.
    ggs.status('chaos', '');
    let next = FIRST_MS;
    let span = FIRST_MS; // the countdown's full length
    let last = performance.now();
    let awaySince = 0;
    let lastRound = ggs.game.roundKey();
    const panel = ggs.ui.panel({
      id: 'chaos', title: 'Chaos', css: PANEL_CSS, html: PANEL_HTML,
      pos: { x: 16, y: Math.round(innerHeight * 0.3) },
    });
    panel.show(false);
    const list = panel.$('ul');

    let queued = null; // the next effect, getting ready
    let lastKey = null; // the last one switched on
    // Mic effects only once the microphone is allowed. Without it chaos carries on without them.
    const enabled = key => cfg[`fx_${key}`] !== false && (!MIC.includes(key) || ggs.mic.state === 'granted');
    const wantsMic = c => MIC.some(k => c[`fx_${k}`] !== false);
    const askMic = () => {
      if (ggs.mic.state !== 'granted') ggs.mic.ask();
    };
    if (wantsMic(cfg)) askMic(); // when chaos starts, not halfway through a round
    const userLock = key => {
      const n = ggs.config(byId('nmpz'), ggs.settings);
      return n.enabled && n[key];
    };
    // Fits beside the effects still on `ms` from now. A board fits beside anything but the other
    // board, and ends what clashes with it (see add).
    const fits = (key, ms = 0) => (BOARDS.includes(key)
      ? !BOARDS.some(b => active.has(b))
      : [...active.values()].every(e => (!e.round && e.left <= ms) || !clash(e.key, key)));

    // Locks: the Controls effects, and No move under Minecraft (each panorama costs a generation).
    function locks() {
      const want = { move: active.has('minecraft'), pan: false, zoom: false };
      for (const [key, kind] of Object.entries(LOCKS)) if (active.has(key)) want[kind] = true;
      for (const [kind, on] of Object.entries(want)) ggs.lock[kind]('chaos', on);
    }
    function changed() {
      locks();
      ggs.reapply();
      draw(true);
    }

    // An effect with its random settings, not yet on.
    function make(key) {
      if (LOCKS[key]) return { key, name: byId('nmpz').options.find(o => o.key === key).label, detail: '' };
      const meta = byId(key);
      const c = randomCfg(meta, ggs.settings);
      if (LIARS.includes(key)) c.lies = true; // core/aid.js: half the rounds, a made-up spot
      return { key, name: meta.name, detail: describe(meta, c), cfg: c };
    }
    function add(effect) {
      const { key } = effect;
      lastKey = key; // never the same one twice in a row
      delete effect.prep;
      if (BOARDS.includes(key)) {
        // For the rest of the round. The old guess goes, and so does whatever needs the map.
        effect.round = ggs.game.roundKey();
        for (const k of [...active.keys()]) if (clash(k, key)) active.delete(k);
        // after the map effects let go of it
        setTimeout(() => {
          try { ggs.maps.clearGuess(); } catch {}
        }, 300);
      } else {
        effect.left = LIFE_MS;
      }
      active.set(key, effect);
      ggs.debug(`chaos: ${effect.name} ${effect.detail}`);
    }

    // A board some of the time (rarer at short intervals), otherwise any other effect that fits
    // `ms` from now. `quick`: only effects that are on at once (no tile filters).
    function choose(ms, quick) {
      const scripts = ggs.registry
        .filter(m => !m.ui && !own().includes(m.id) && !SKIP.includes(m.id) && ggs.scripts[m.id])
        .map(m => m.id);
      const can = [...scripts, ...Object.keys(LOCKS).filter(k => !userLock(k))]
        // all held by the player: nothing to reverse
        .filter(k => k !== 'reverse' || !Object.keys(LOCKS).every(userLock))
        .filter(k => enabled(k) && !active.has(k) && k !== queued?.key && k !== lastKey && fits(k, ms))
        .filter(k => !(quick && TILES.includes(k)) && ms >= (LEAD[k] ?? 0));
      const boards = can.filter(k => BOARDS.includes(k));
      const others = can.filter(k => !BOARDS.includes(k));
      const board = boards.length && Math.random() < DRAW_CHANCE * EVERY[cfg.every] / 30;
      // only boards left ticked: a board
      const key = board || !others.length ? pick(boards) ?? null : pick(others);
      return key && make(key);
    }
    // The effect for the slot `ms` from now, starting to get ready.
    function queue(ms) {
      queued = choose(ms, false);
      if (!queued) return;
      const prepare = () => {
        try {
          queued.prep = ggs.scripts[queued.key]?.prepare?.(queued.cfg) ?? null;
        } catch (err) {
          ggs.log('chaos: prepare failed', err);
        }
      };
      prepare();
      if (queued.key === 'minecraft' && !queued.prep && queued.cfg.hq) {
        // today's high-quality rounds are used up: try normal quality
        queued.cfg = { ...queued.cfg, hq: false };
        queued.detail = describe(byId('minecraft'), queued.cfg);
        prepare();
      }
      // today's limit is used up: another effect
      if (queued.key === 'minecraft' && !queued.prep) return queue(ms);
      if (!queued.prep && TILES.includes(queued.key)) ggs.tiles.preload();
    }
    const unqueue = () => {
      queued?.prep?.cancel();
      queued = null;
    };
    // Slot time: the queued effect goes if it still fits and is ready. If it's still getting
    // ready, a quick one goes now and it waits for the next slot.
    function slot() {
      if (queued && (!(enabled(queued.key) && fits(queued.key)) || queued.prep?.failed?.())) unqueue();
      let e = queued;
      if (e?.prep && !e.prep.ready()) e = choose(0, true);
      else queued = null;
      if (!e) e = choose(0, true);
      if (e) {
        add(e);
        changed();
      }
      if (!queued) queue(span);
    }
    queue(next);

    const tick = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const inRound = !!ggs.maps.guessMapElement();
      const round = ggs.game.roundKey();
      if (inRound) awaySince = 0;
      else awaySince ||= now;
      const over = !inRound && now - awaySince > AWAY_MS;
      let gone = false;
      if (round !== lastRound) {
        lastRound = round;
        gone = active.size > 0;
        active.clear();
        next = span = FIRST_MS;
        unqueue();
        queue(next);
      }
      for (const [key, e] of active) {
        const expired = e.round ? over || e.round !== round : inRound && (e.left -= dt) <= 0;
        if (expired) {
          active.delete(key);
          gone = true;
        } else if (key in LOCKS ? userLock(key) : !enabled(key)) {
          // switched off meanwhile
          active.delete(key);
          gone = true;
        } else if (TILES.includes(key) && !e.round && e.left <= PRELOAD_MS && !e.preloaded) {
          // fetch the real tiles again so they come back at once
          e.preloaded = true;
          ggs.tiles.preload();
        }
      }
      if (gone) changed();
      if (inRound && (next -= dt) <= 0) {
        next = span = EVERY[cfg.every] * 1000;
        slot();
      }
      panel.show(!!ggs.game.context());
      draw(false);
    }, TICK_MS);

    // The list is rebuilt when effects come or go. The bars and countdown update every tick.
    function draw(rebuild) {
      panel.$('.next .secs').textContent = `${Math.ceil(Math.max(0, next) / 1000)}s`;
      panel.$('.next .bar i').style.width = `${100 * Math.max(0, next) / span}%`;
      if (rebuild) {
        list.innerHTML = [...active.values()].map(e =>
          `<li data-key="${ggs.esc(e.key)}"><div class="row"><span class="label"><b>${ggs.esc(e.name)}</b>` +
          `${e.detail ? `<small>${ggs.esc(e.detail)}</small>` : ''}</span></div>` +
          '<div class="bar"><i></i></div></li>').join('');
      }
      for (const li of list.children) {
        const e = active.get(li.dataset.key);
        if (!e) continue;
        li.querySelector('.bar i').style.width = `${e.round ? 100 : 100 * e.left / LIFE_MS}%`;
      }
    }

    return {
      update(n) {
        if (wantsMic(n) && !wantsMic(cfg)) askMic();
        cfg = n;
        span = Math.min(span, EVERY[cfg.every] * 1000); // a shorter interval takes effect now
        next = Math.min(next, span);
      },
      stop() {
        clearInterval(tick);
        unqueue();
        active.clear();
        for (const kind of Object.values(LOCKS)) ggs.lock[kind]('chaos', false);
        panel.destroy();
        ggs.status('chaos', '');
      },
    };
  }

  ggs.scripts.chaos = { start };
})();
