// Radio mode: Street View is hidden and a live station from near the round's location
// plays instead (Radio Browser, radio-browser.info: the round's coordinates go there to
// find stations, the audio streams from each station's own server). Nothing about the
// station shows until the guess is in.
(() => {
  const ggs = globalThis.__ggs;

  const API = 'https://de1.api.radio-browser.info/json/stations/search';
  const RADII_KM = [50, 250, 1000, 3000]; // widen until there are a few stations
  const PANO_SELECTORS = ['[class*="game_panorama"]', '[data-qa="panorama"]'];
  const HIDE_PANO_CSS = `
    ${PANO_SELECTORS.join(', ')}, .widget-scene-canvas { visibility: hidden !important; }
    body { background: #0d0a2a !important; }`;

  // Stream networks that insert ads into the audio itself; tried last.
  const AD_STREAMS = /zeno\.fm|zenomedia|adswizz|streamtheworld\.com|tritondigital|[?&]aw_0_/i;

  // Streamer mode: talk stations only, by Radio Browser's tags.
  const TALK_TAGS = /\b(news|talk|sports?|speech|information|info|noticias|nachrichten|actualit|informa|notizie|public radio|comedy|debate|politics)/i;
  const MUSIC_TAGS = /\b(music|musica|música|musik|musique|hits?|pop|rock|dance|jazz|classical|country|oldies|top ?40|chart|r&b|hip ?hop|electronic|house|latin|reggae|metal|disco|[5-9]0s|schlager|soul|funk|blues|folk|indie|christian|gospel)\b/i;
  const isTalk = s => TALK_TAGS.test(s.tags) && !MUSIC_TAGS.test(s.tags);

  const START_MS = 8000; // a stream that hasn't started playing by now is skipped
  const STALL_MS = 8000; // ...and so is one that has been buffering this long

  // ---- silence GeoGuessr's own music and sounds while radio mode is on ----
  // Wrapped at document_start so every AudioContext and media element the page makes is
  // seen: contexts are suspended and other <audio>/<video> elements muted while `muting`.
  const RealAudioContext = window.AudioContext;
  const contexts = new Set(), ours = new WeakSet();
  let muting = false;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Orig = window[name];
    if (!Orig) continue;
    window[name] = class extends Orig {
      constructor(...args) {
        super(...args);
        contexts.add(this);
        if (muting) this.suspend().catch(() => {});
      }
    };
    const resume = Orig.prototype.resume;
    Orig.prototype.resume = function (...args) {
      return muting && !ours.has(this) ? Promise.resolve() : resume.apply(this, args);
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (muting && !ours.has(this)) this.muted = true;
    return play.apply(this, args);
  };
  function muteGame(on) {
    muting = on;
    for (const c of contexts) (on ? c.suspend() : c.resume()).catch(() => {});
    for (const m of document.querySelectorAll('audio, video')) if (!ours.has(m)) m.muted = on;
    window.Howler?.mute?.(on);
  }

  async function search(params) {
    const q = new URLSearchParams({ is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', ...params });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) return [];
    // http streams are blocked on an https page; HLS needs a library
    return (await r.json()).filter(s => s.url_resolved?.startsWith('https://') && !s.hls);
  }
  const near = (lat, lng, dist, limit) => search({ geo_lat: lat, geo_long: lng, geo_distance: dist * 1000, limit });

  async function findStations(lat, lng, talkOnly) {
    let list = [];
    if (!talkOnly) {
      for (const d of RADII_KM) {
        list = await near(lat, lng, d, 30);
        if (list.length >= 3) break;
      }
    } else {
      // Talk stations are sparser: the round's country first, then nearby, then wider.
      const close = await near(lat, lng, 250, 300);
      const pool = close.length ? close : await near(lat, lng, 1000, 300);
      const dist = s => km({ lat, lng }, { lat: s.geo_lat, lng: s.geo_long });
      const cc = pool.filter(s => s.geo_lat != null).sort((a, b) => dist(a) - dist(b))[0]?.countrycode;
      const talkClose = close.filter(isTalk);
      list = talkClose.filter(s => s.countrycode === cc);
      if (cc) list.push(...(await search({ countrycode: cc, limit: 300 })).filter(isTalk));
      list.push(...talkClose.filter(s => s.countrycode !== cc));
      for (const d of RADII_KM.slice(2)) {
        if (list.length >= 3) break;
        list.push(...(await near(lat, lng, d, 300)).filter(isTalk));
      }
    }
    // one entry per station (many are listed once per bitrate)
    const seen = new Set();
    list = list.filter(s => {
      const k = s.name.split(/\s[|–-]\s|\(/)[0].trim().toLowerCase();
      return !seen.has(k) && seen.add(k);
    });
    const ads = s => AD_STREAMS.test(s.url_resolved) || AD_STREAMS.test(s.url);
    return [...list.filter(s => !ads(s)), ...list.filter(ads)]; // keeps popularity order within each
  }

  const km = (a, b) => {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(12742 * Math.asin(Math.sqrt(h)));
  };
  const esc = ggs.esc;
  const describe = (s, loc) => {
    const where = [s.state, s.country].filter(Boolean).join(', ');
    const dist = s.geo_lat != null && loc ? ` · ${km(loc, { lat: s.geo_lat, lng: s.geo_long })} km from the spot` : '';
    return where + dist;
  };

  // ---- the player: "stage" in Street View's place, or a "mini" bar top-left ----
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 5l9 7-9 7zM16 5h2v14h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5l-9 7 9 7zM6 5h2v14H6z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const YELLOW = '#fecd19', GREEN = '#6cb928';
  const CSS = `
    :host { all: initial; visibility: visible !important; color: #fff;
            font: 14px/1.3 neo-sans, var(--default-font, system-ui), system-ui, -apple-system, sans-serif; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .label { font-size: 11px; font-weight: 700; font-style: italic; letter-spacing: .08em; text-transform: uppercase;
             color: rgba(255, 255, 255, .55); }
    .status { font-size: 13px; color: rgba(255, 255, 255, .85); font-variant-numeric: tabular-nums; min-height: 17px; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { all: unset; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
             cursor: pointer; color: #fff; }
    button:hover { background: rgba(255, 255, 255, .12); }
    button.play { background: ${GREEN}; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .2); }
    button.play:hover { background: #7fd13a; }
    svg { width: 18px; height: 18px; fill: currentColor; }
    .vol { display: flex; align-items: center; gap: 6px; margin-left: 4px; color: rgba(255, 255, 255, .6); }
    input[type=range] { width: 90px; accent-color: ${YELLOW}; }
    canvas { display: block; aspect-ratio: 1; cursor: pointer; }

    /* stage: fills the panorama's space, GeoGuessr-purple, outline in the middle */
    :host(.stage) { position: absolute; inset: 0;
                    background: radial-gradient(circle at 50% 42%, #33277e 0%, #1a1450 42%, #0d0a2a 100%); }
    :host(.stage) .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                          justify-content: center; gap: 10px; }
    :host(.stage) canvas { width: min(56vh, 48vw, 560px); }
    :host(.stage) .side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    :host(.stage) .info { text-align: center; }
    :host(.stage) .controls { padding: 6px 12px 6px 6px; border-radius: 999px; background: rgba(16, 12, 48, .7);
                              border: 1px solid rgba(255, 255, 255, .12); }
    :host(.stage) .extra { display: none; }

    /* mini: compact bar top-left */
    :host(.mini) { position: fixed; left: 16px; top: 84px; z-index: 2147483000; } /* below GeoGuessr's logo */
    :host(.mini) .wrap { display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; align-items: center;
                         width: 330px; padding: 8px 12px 8px 8px; border-radius: 14px;
                         background: linear-gradient(180deg, rgba(60, 48, 140, .85), rgba(22, 17, 62, .9));
                         border: 1px solid rgba(255, 255, 255, .14); box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .7); }
    :host(.mini) canvas { width: 64px; }
    :host(.mini) .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    :host(.mini) .status { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.mini) button { width: 28px; height: 28px; }
    :host(.mini) svg { width: 15px; height: 15px; }
    :host(.mini) input[type=range] { width: 70px; }
    :host(.mini) .extra { grid-column: 1 / -1; }
    .reveal:empty, .hist:empty { display: none; }
    .reveal { padding: 8px 4px 2px; border-top: 1px solid rgba(255, 255, 255, .12); margin-top: 4px; }
    .reveal b { display: block; font-size: 15px; font-style: italic; }
    .reveal span { font-size: 12px; color: rgba(255, 255, 255, .65); }
    .hist { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .hist .row { display: grid; grid-template-columns: 22px 1fr; gap: 0 8px; padding: 5px 6px;
                 border-radius: 8px; cursor: pointer; }
    .hist .row:hover { background: rgba(255, 255, 255, .08); }
    .hist .row.on { background: rgba(254, 205, 25, .14); }
    .hist .n { grid-row: span 2; align-self: center; font-weight: 700; font-style: italic; color: ${YELLOW}; }
    .hist .name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hist .where { font-size: 11px; color: rgba(255, 255, 255, .55); }`;

  // ---- the visual: a shape always blending between random country outlines (never the
  // round's), rippling with the volume; a circle while loading, an icon on play/pause/skip ----
  const MORPH_MS = 3000;
  const SPIN_STEP = (Math.PI * 3) / 8; // turn per blend
  const ICON_POLYS = {
    play: [[[-0.4, -0.55], [0.55, 0], [-0.4, 0.55]]],
    pause: [[[-0.45, -0.55], [-0.13, -0.55], [-0.13, 0.55], [-0.45, 0.55]], [[0.13, -0.55], [0.45, -0.55], [0.45, 0.55], [0.13, 0.55]]],
    skip: [[[-0.55, -0.5], [0.2, 0], [-0.55, 0.5]], [[0.25, -0.5], [0.5, -0.5], [0.5, 0.5], [0.25, 0.5]]],
    back: [[[-0.5, -0.5], [-0.25, -0.5], [-0.25, 0.5], [-0.5, 0.5]], [[0.55, -0.5], [0.55, 0.5], [-0.2, 0]]],
  };
  // rounds a polygon's corners
  function soften(poly, r = 0.06) {
    const out = [];
    poly.forEach((p, i) => {
      const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const d = Math.min(r, la / 2.2, lb / 2.2);
      const st = [p[0] + (a[0] - p[0]) * d / la, p[1] + (a[1] - p[1]) * d / la];
      const en = [p[0] + (b[0] - p[0]) * d / lb, p[1] + (b[1] - p[1]) * d / lb];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, u = 1 - t;
        out.push([u * u * st[0] + 2 * u * t * p[0] + t * t * en[0], u * u * st[1] + 2 * u * t * p[1] + t * t * en[1]]);
      }
    });
    return out;
  }
  // m points evenly spaced round a closed polygon
  function loop(poly, m) {
    const seg = poly.map((p, i) => Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]));
    const total = seg.reduce((a, v) => a + v, 0), out = [];
    for (let j = 0, i = 0, acc = 0; j < m; j++) {
      const d = (j / m) * total;
      while (acc + seg[i] < d) acc += seg[i++];
      const t = (d - acc) / seg[i], a = poly[i], b = poly[(i + 1) % poly.length];
      out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
    return out;
  }
  function blob(canvas) {
    const g = canvas.getContext('2d');
    const all = (ggs.radioShapes ?? []).map(a => Float32Array.from(a, v => v / 100));
    const n = all[0]?.length ?? 0, K = n / 2;
    const circle = new Float32Array(n); // same start (top) and winding as the outlines
    for (let i = 0; i < K; i++) {
      const a = -Math.PI / 2 + (i / K) * Math.PI * 2;
      circle[2 * i] = Math.cos(a) * 0.8; circle[2 * i + 1] = Math.sin(a) * 0.8;
    }
    const base = new Float32Array(n), shape = new Float32Array(n), ring = new Float32Array(n);
    const icons = {};
    for (const [name, polys] of Object.entries(ICON_POLYS)) {
      icons[name] = { parts: polys.length, pts: Float32Array.from(polys.flatMap(p => loop(soften(p), K / polys.length))) };
    }
    let flashName = null, flashUntil = 0, iconMix = 0, iconTarget = null, parts = 1, partsAt = 0;
    const iconCur = new Float32Array(n); // the icon on show, easing from one icon to the next
    const pick = prev => {
      let s;
      do s = all[Math.floor(Math.random() * all.length)]; while (all.length > 1 && s === prev);
      return s;
    };
    let from = pick(), to = pick(from), since = performance.now(), load = 1, level = 0;

    function trace(p, c, s, parts = 1) {
      g.beginPath();
      const per = K / parts;
      for (let q = 0; q < parts; q++) {
        const o = q * per;
        for (let i = 0; i <= per; i++) {
          const j = (o + (i % per)) * 2, k = (o + ((i + 1) % per)) * 2;
          const mx = c + (p[j] + p[k]) / 2 * s, my = c + (p[j + 1] + p[k + 1]) / 2 * s;
          if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(c + p[j] * s, c + p[j + 1] * s, mx, my);
        }
        g.closePath();
      }
    }
    // outward normal at point i
    let nx = 0, ny = 0;
    function normal(p, i) {
      const a = ((i + K - 2) % K) * 2, b = ((i + 2) % K) * 2;
      const tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], len = Math.hypot(tx, ty) || 1;
      nx = ty / len; ny = -tx / len;
    }
    const wave = (i, t, ph) => {
      const th = (i / K) * Math.PI * 2;
      return Math.sin(3 * th + t * 1.3 + ph) * 0.5 + Math.sin(7 * th - t * 2.1 + ph) * 0.3
           + Math.sin(13 * th + t * 3.4 + ph * 2) * 0.2;
    };

    // vol: 0..1 loudness; loading: finding/connecting; hold: an icon to keep showing
    function draw(now, { vol, loading, hold }) {
      const dpr = devicePixelRatio || 1, cw = canvas.clientWidth || 1, W = Math.round(cw * dpr);
      if (canvas.width !== W || canvas.height !== W) canvas.width = canvas.height = W;
      const px = W / 300, t = now / 1000, c = W / 2;
      g.clearRect(0, 0, W, W);
      if (!n) return;

      let p = (now - since) / MORPH_MS;
      if (p >= 1) { from = to; to = pick(from); since = now; p = 0; }
      const m = p * p * (3 - 2 * p);
      load += ((loading ? 1 : 0) - load) * 0.05;
      level += (vol - level) * (vol > level ? 0.35 : 0.07);
      // slowly spinning, timed so each outline is north up when the blend reaches it
      const a0 = SPIN_STEP * p, a1 = SPIN_STEP * (p - 1);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let i = 0; i < n; i += 2) {
        const x0 = from[i] * c0 - from[i + 1] * s0, y0 = from[i] * s0 + from[i + 1] * c0;
        const x1 = to[i] * c1 - to[i + 1] * s1, y1 = to[i] * s1 + to[i + 1] * c1;
        const x = x0 + (x1 - x0) * m, y = y0 + (y1 - y0) * m;
        base[i] = x + (circle[i] - x) * load;
        base[i + 1] = y + (circle[i + 1] - y) * load;
      }
      // icons ease in and out
      const want = hold ?? (now < flashUntil ? flashName : null), target = icons[want];
      if (target) {
        if (iconMix < 0.01) iconCur.set(base); // start from the shape as it is
        for (let i = 0; i < n; i++) iconCur[i] += (target.pts[i] - iconCur[i]) * 0.18;
        if (iconTarget !== want) { iconTarget = want; partsAt = now + 150; } // split/join once it's partway there
      } else iconTarget = null;
      iconMix += ((target ? 1 : 0) - iconMix) * 0.18;
      if (iconMix > 0.001) for (let i = 0; i < n; i++) base[i] += (iconCur[i] - base[i]) * iconMix;
      if (iconMix <= 0.5) parts = 1;
      else if (target && now >= partsAt) parts = target.parts;
      const plain = 1 - iconMix; // icons stay crisp: no ripples or echoes

      const breathe = Math.sin(t * 3.1);
      const s = W * 0.34 * (1 + (level * 0.07 + load * 0.035 * breathe) * plain);
      const amp = (0.015 + level * 0.14 + load * 0.035 * (0.7 + 0.3 * breathe)) * plain;

      for (let i = 0; i < K; i++) {
        normal(base, i);
        const d = amp * wave(i, t, 0);
        shape[2 * i] = base[2 * i] + nx * d;
        shape[2 * i + 1] = base[2 * i + 1] + ny * d;
      }

      // echoes, pushed outward
      g.lineJoin = 'round';
      for (const [k, alpha] of [[1, 0.14], [2, 0.07]]) {
        for (let i = 0; i < K; i++) {
          normal(shape, i);
          const d = 0.06 * k + amp * k * (0.5 + 0.5 * wave(i, t, k * 2.3));
          ring[2 * i] = shape[2 * i] + nx * d;
          ring[2 * i + 1] = shape[2 * i + 1] + ny * d;
        }
        trace(ring, c, s, parts);
        g.strokeStyle = `rgba(255, 255, 255, ${alpha * (0.6 + level) * plain})`;
        g.lineWidth = 1.2 * px;
        g.stroke();
      }

      trace(shape, c, s, parts);
      const fill = g.createRadialGradient(c, c - s * 0.3, s * 0.1, c, c, s * 1.1);
      fill.addColorStop(0, `rgba(254, 205, 25, ${0.1 + level * 0.25})`);
      fill.addColorStop(1, `rgba(120, 90, 230, ${0.08 + level * 0.15})`);
      g.fillStyle = fill;
      g.fill();
      g.shadowColor = 'rgba(254, 205, 25, .5)';
      g.shadowBlur = (4 + level * 18) * px;
      g.lineWidth = 2 * px;
      g.strokeStyle = 'rgba(255, 255, 255, .92)';
      g.stroke();
      g.shadowBlur = 0;

      if (load * plain > 0.02) {
        for (let i = 0; i < 3; i++) {
          const a = t * 2.4 + (i * Math.PI * 2) / 3;
          g.fillStyle = `rgba(254, 205, 25, ${load * plain * (0.9 - i * 0.2)})`;
          g.beginPath();
          g.arc(c + Math.cos(a) * s * 1.02, c + Math.sin(a) * s * 1.02, (4 - i) * px, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    draw.flash = (name, ms) => { flashName = name; flashUntil = performance.now() + ms; };
    return draw;
  }

  // ---- streamer mode: skip music ----
  // Music puts far more of its energy below 90 Hz than speech. A new station is listened
  // to silently for PRE_MS first, then the last BASS_MS are checked every quarter second.
  const PRE_MS = 3000, BASS_MS = 7000, BASS_EVERY_MS = 250, BASS_SHARE = 0.2;
  function musicCheck() {
    let recent = [];
    return {
      reset() { recent = []; },
      span(now) { return recent.length ? now - recent[0][0] : 0; },
      // per frame: loudness, energy below 90 Hz, energy up to 10 kHz
      push(rms, low, all, now) {
        recent.push([now, rms, low, all]);
        while (now - recent[0][0] > BASS_MS) recent.shift();
      },
      music(now, ms) {
        if (this.span(now) < ms * 0.95) return false;
        let r = 0, l = 0, a = 0, k = 0;
        for (const f of recent) if (now - f[0] <= ms) { r += f[1]; l += f[2]; a += f[3]; k++; }
        return k > 0 && r / k >= 0.005 && a > 0 && l / a > BASS_SHARE;
      },
    };
  }

  function start(cfg) {
    const hidePano = document.createElement('style');
    hidePano.textContent = HIDE_PANO_CSS;
    const setPano = show => (show ? hidePano.remove() : (document.head ?? document.documentElement).append(hidePano));
    setPano(cfg.showStreetView);

    muteGame(true);
    let audio = null, node = null, ctx = null, analyser = null, gain = null, td = null, fd = null, tuning = false;
    let preListen = false, allowMusic = false, lastCheck = 0;
    const music = musicCheck();
    let volume = 0.6, watchdog = 0, stallTimer = 0, waitingSince = 0, blocked = false, userPaused = false, skipping = 0;
    let host = null, root = null, draw = null, raf = 0, lastT = 0, lastMove = 0, live = false;
    let round = null, loc = null, stations = [], idx = 0;
    // history: this game's rounds { n, loc, stations, idx }; cur: the one playing
    let game = null, history = [], cur = null, histSig = '', finished = false, checked = null;

    const $ = sel => root.querySelector(sel);
    const setStatus = t => { $('.status').textContent = t; };

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', 'radio');
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
        <div class="wrap">
          <canvas></canvas>
          <div class="side">
            <div class="info"><div class="label">${cfg.streamerMode ? 'Talk radio' : 'Live radio'}</div><div class="status"></div></div>
            <div class="controls">
              <button class="prev" title="Previous station">${ICON.prev}</button>
              <button class="play">${ICON.pause}</button>
              <button class="next" title="Next station">${ICON.next}</button>
              <label class="vol">${ICON.vol}<input type="range" min="0" max="1" step="0.02" value="${volume}"></label>
            </div>
          </div>
          <div class="extra"><div class="reveal"></div><div class="hist"></div></div>
        </div>`;
      const togglePlay = () => {
        if (!audio) return;
        if (audio.paused) {
          userPaused = false;
          ctx?.resume();
          audio.play().catch(() => {});
          draw.flash('play', 700);
        } else {
          userPaused = true;
          audio.pause();
        }
      };
      $('.play').onclick = togglePlay;
      $('canvas').onclick = togglePlay;
      $('.wrap').onclick = e => { if (e.target === e.currentTarget) togglePlay(); };
      $('.prev').onclick = () => { draw.flash('back', 600); tune(idx - 1); };
      $('.next').onclick = () => { draw.flash('skip', 600); tune(idx + 1); };
      $('input').oninput = e => { volume = +e.target.value; if (audio) audio.volume = volume; };
      $('.hist').onclick = e => {
        const h = history[e.target.closest('.row')?.dataset.i];
        if (!h?.stations.length) return;
        cur = h; stations = h.stations; loc = h.loc;
        tune(h.idx);
      };
      draw = blob($('canvas'));
      let playing = null;
      const frame = now => {
        raf = requestAnimationFrame(frame);
        if (host.hidden) return;
        const t = audio?.currentTime ?? 0;
        if (t !== lastT) { lastT = t; lastMove = now; }
        live = !!audio && !audio.paused && now - lastMove < 400; // sound is arriving
        const isPlaying = !!audio && !audio.paused;
        if (isPlaying !== playing) $('.play').innerHTML = (playing = isPlaying) ? ICON.pause : ICON.play;
        // loudness: measured when the stream allows it (CORS), otherwise a made-up wobble
        let vol = 0;
        if (node && live) {
          analyser.getByteTimeDomainData(td);
          let sum = 0;
          for (const v of td) sum += (v - 128) ** 2;
          const rms = Math.sqrt(sum / td.length) / 128;
          vol = Math.min(1, rms * 4);
          if (cfg.streamerMode && !allowMusic && !skipping) {
            analyser.getFloatFrequencyData(fd);
            const hz = ctx.sampleRate / analyser.fftSize;
            let low = 0, all = 0;
            for (let i = 1; i * hz < 10000; i++) {
              const p = 10 ** (fd[i] / 10);
              all += p;
              if (i * hz < 90) low += p;
            }
            music.push(rms, low, all, now);
            if (preListen) {
              if (music.span(now) >= PRE_MS * 0.95) { if (music.music(now, PRE_MS)) musicSkip(); else unmute(); }
            } else if (now - lastCheck >= BASS_EVERY_MS) {
              lastCheck = now;
              if (music.music(now, BASS_MS)) musicSkip();
            }
          }
        } else if (live) {
          vol = 0.3 + 0.25 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1));
        }
        const wait = waitingSince && !blocked ? (Date.now() - waitingSince) / START_MS : 0;
        if (wait) setStatus(`Station ${idx + 1} of ${stations.length} · waiting for audio ${Math.max(0, Math.ceil(START_MS / 1000 * (1 - wait)))}s`);
        else if (live && cfg.streamerMode && !skipping) {
          const note = allowMusic ? '' : !node ? " · can't check this one for music"
            : preListen ? ' · checking for music…' : '';
          const text = `Station ${idx + 1} of ${stations.length}${note}`;
          if ($('.status').textContent !== text) setStatus(text);
        }
        draw(now, { vol, loading: tuning || (!!waitingSince && !blocked) || preListen, hold: userPaused && audio?.paused ? 'pause' : null });
      };
      raf = requestAnimationFrame(frame);
    }

    function place(inRound) {
      const pano = !cfg.showStreetView && inRound && PANO_SELECTORS.map(s => document.querySelector(s)).find(Boolean);
      if (pano?.parentElement) {
        if (host.previousElementSibling !== pano) pano.after(host);
        host.className = 'stage';
      } else {
        if (host.parentElement !== document.body) document.body.append(host);
        host.className = 'mini';
      }
    }

    // Our own AudioContext (the real constructor, so muteGame leaves it alone), made only
    // after a click or key press (Chrome's rule).
    function ensureCtx() {
      if (ctx || !RealAudioContext || navigator.userActivation?.hasBeenActive === false) return;
      ctx = new RealAudioContext();
      ours.add(ctx);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      td = new Uint8Array(analyser.fftSize);
      fd = new Float32Array(analyser.frequencyBinCount);
      gain = ctx.createGain();
      analyser.connect(gain);
      gain.connect(ctx.destination);
    }

    function drop() {
      if (!audio) return;
      const a = audio;
      audio = null;
      a.onerror = a.onplaying = a.onwaiting = a.onstalled = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
      node?.disconnect();
      node = null;
    }

    // With CORS first (so the sound can be read); if the stream refuses, again without.
    function load(url, cors, startPaused = false) {
      drop();
      const a = audio = new Audio();
      ours.add(a);
      a.volume = volume;
      if (cors) ensureCtx();
      const readable = cors && !!ctx;
      if (readable) {
        a.crossOrigin = 'anonymous';
        node = ctx.createMediaElementSource(a);
        node.connect(analyser);
      }
      preListen = readable && !!cfg.streamerMode && !allowMusic;
      if (gain) { gain.gain.cancelScheduledValues(0); gain.gain.value = preListen ? 0 : 1; }
      let failed = false;
      const fail = () => {
        if (failed || a !== audio) return;
        failed = true;
        // no CORS, so streamer mode can't check it: prefer stations it can
        if (readable && cfg.streamerMode && !allowMusic && !startPaused && tryCheckable()) return;
        if (readable) load(url, false, startPaused);
        else skip('stream failed');
      };
      a.onerror = fail;
      a.onplaying = () => {
        clearTimeout(watchdog); clearTimeout(stallTimer);
        waitingSince = 0;
        setStatus(`Station ${idx + 1} of ${stations.length}`);
      };
      a.onwaiting = a.onstalled = () => {
        clearTimeout(stallTimer);
        if (!a.paused && !waitingSince) waitingSince = Date.now();
        stallTimer = setTimeout(() => a === audio && !a.paused && skip('stopped'), STALL_MS);
      };
      a.src = url;
      if (startPaused) return;
      ctx?.resume().catch(() => {});
      a.play().catch(err => {
        if (a !== audio) return;
        if (err.name !== 'NotAllowedError') return fail();
        // no click on the page yet: start on the first one
        blocked = true;
        clearTimeout(watchdog);
        setStatus('Click anywhere to start the radio');
      });
    }

    function tune(i, { paused = false } = {}) {
      if (!stations.length) return;
      idx = ((i % stations.length) + stations.length) % stations.length;
      if (cur) cur.idx = idx;
      music.reset();
      userPaused = paused;
      allowMusic = paused;
      lastCheck = 0;
      clearTimeout(skipping); skipping = 0;
      $('.reveal').innerHTML = '';
      clearTimeout(watchdog); clearTimeout(stallTimer);
      blocked = false;
      if (cfg.streamerMode && !paused && navigator.userActivation?.hasBeenActive === false) {
        // the music check needs a click first, so wait rather than play unchecked
        blocked = true;
        waitingSince = 0;
        return setStatus('Click anywhere to start the radio');
      }
      const cors = !setFor(uncheckableFor).has(stations[idx]);
      if (paused) {
        waitingSince = 0;
        load(stations[idx].url_resolved, cors, true);
        return setStatus('Only music stations nearby · press play to hear it anyway');
      }
      waitingSince = Date.now();
      watchdog = setTimeout(() => !blocked && (!audio || audio.currentTime < 0.5) && skip('no audio'), START_MS);
      load(stations[idx].url_resolved, cors);
    }
    function unmute() {
      preListen = false;
      gain?.gain.setTargetAtTime(1, ctx.currentTime, 0.08);
    }

    // Music in streamer mode: skip to the next station not yet caught playing music; if all
    // have been, back to the first, paused.
    const flaggedFor = new WeakMap(); // station list -> stations caught playing music
    const uncheckableFor = new WeakMap(); // station list -> stations whose sound can't be read
    const setFor = map => { const set = map.get(stations) ?? new Set(); map.set(stations, set); return set; };
    // moves an uncheckable station to the back; false if no checkable one is left after it
    function tryCheckable() {
      const st = stations[idx], bad = setFor(uncheckableFor), music = setFor(flaggedFor);
      bad.add(st);
      if (!stations.slice(idx + 1).some(s => !bad.has(s) && !music.has(s))) return false;
      stations.splice(idx, 1);
      stations.push(st);
      let j = idx;
      while (bad.has(stations[j]) || music.has(stations[j])) j++;
      tune(j);
      return true;
    }
    function musicSkip() {
      const flagged = setFor(flaggedFor);
      flagged.add(stations[idx]);
      audio?.pause();
      draw?.flash('skip', 900);
      setStatus('Music detected, skipping…');
      let next = null;
      for (let k = 1; k < stations.length && next == null; k++) {
        if (!flagged.has(stations[(idx + k) % stations.length])) next = (idx + k) % stations.length;
      }
      skipping = setTimeout(() => {
        skipping = 0;
        if (next != null) tune(next);
        else tune(stations.findIndex(s => flagged.has(s)), { paused: true });
      }, 600);
    }
    function skip(why) {
      if (stations.length < 2) { waitingSince = 0; return setStatus(`Station ${why}`); }
      tune(idx + 1);
    }
    const unblock = () => {
      if (!blocked) return;
      ctx?.resume().catch(() => {});
      tune(idx);
    };
    window.addEventListener('pointerdown', unblock, true);
    window.addEventListener('keydown', unblock, true);

    async function newRound(key) {
      round = key;
      const token = ggs.game.context()?.token;
      if (token !== game) { game = token; history = []; }
      stations = []; loc = null; cur = null;
      drop();
      clearTimeout(watchdog); clearTimeout(stallTimer);
      waitingSince = 0; blocked = false;
      $('.reveal').innerHTML = '';
      setStatus('Tuning…');
      tuning = true;
      loc = await ggs.game.roundLocation().catch(() => null);
      if (round !== key) return;
      if (!loc) { tuning = false; return setStatus('No location (standard games only)'); }
      stations = await findStations(loc.lat, loc.lng, !!cfg.streamerMode).catch(() => []);
      if (round !== key) return;
      tuning = false;
      history = history.filter(h => h.key !== key); // re-tuned (streamer mode switched)
      cur = { key, n: history.length + 1, loc, stations, idx: 0 };
      history.push(cur);
      if (!stations.length) return setStatus(cfg.streamerMode ? 'No talk station found nearby' : 'No station found nearby');
      tune(0);
    }

    // Result screens: the guess is in, so name the stations.
    function reveal() {
      const s = stations[idx];
      if (s && !$('.reveal').innerHTML) {
        $('.reveal').innerHTML = `<b>${esc(s.name.trim())}</b><span>${esc(describe(s, loc))}</span>`;
      }
      const sig = history.map(h => h.idx).join() + '|' + history.indexOf(cur) + '|' + finished;
      if (sig === histSig) return;
      histSig = sig;
      $('.hist').innerHTML = !finished || history.length < 2 ? '' : `<div class="label">Stations this game</div>` +
        history.map((h, i) => {
          const st = h.stations[h.idx];
          const title = st ? ` title="${esc(new URL(st.url_resolved).hostname)}"` : '';
          return `<div class="row${h === cur ? ' on' : ''}" data-i="${i}"${title}><span class="n">${h.n}</span>
            <span class="name">${esc(st ? st.name.trim() : 'No station found')}</span>
            <span class="where">${esc(st ? describe(st, h.loc) : '')}</span></div>`;
        }).join('');
    }

    const tick = setInterval(() => {
      const inGame = !!ggs.game.context();
      const inRound = !!ggs.maps.guessMapElement();
      if (!inGame) { drop(); if (host) host.hidden = true; round = null; return; }
      if (inRound && !host) create();
      if (!host) return;
      host.hidden = false;
      place(inRound);
      const key = ggs.game.roundKey();
      if (inRound && key !== round) newRound(key);
      if (inRound) { $('.hist').innerHTML = ''; histSig = ''; finished = false; checked = null; }
      else {
        if (checked !== key) {
          checked = key;
          ggs.game.state().then(st => { if (checked === key) finished = !!st?.finished; }).catch(() => {});
        }
        reveal();
      }
    }, 500);

    return {
      update(next) {
        if (!!next.showStreetView !== !!cfg.showStreetView) setPano(next.showStreetView);
        const retune = !!next.streamerMode !== !!cfg.streamerMode;
        cfg = next;
        if (host) $('.label').textContent = cfg.streamerMode ? 'Talk radio' : 'Live radio';
        if (retune) round = null; // retune this round
      },
      stop() {
        clearInterval(tick);
        cancelAnimationFrame(raf);
        clearTimeout(skipping);
        window.removeEventListener('pointerdown', unblock, true);
        window.removeEventListener('keydown', unblock, true);
        clearTimeout(watchdog); clearTimeout(stallTimer);
        drop();
        ctx?.close().catch(() => {});
        muteGame(false);
        host?.remove();
        hidePano.remove();
      },
    };
  }

  ggs.scripts.radio = { start };
})();
