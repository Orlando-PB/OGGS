// Fake lag: the game acts as if the connection is bad. At random gaps (shorter at higher levels)
// an episode is picked from EFFECTS by weight: spinners, loading bars, chunky or blurry Street
// View, a ping readout. Higher levels also get in the way: held or late input, snapping back to
// the last panorama, slow guesses, late or misplaced pins, a stuttering view.
// Every episode ends on its own timer. It all happens only during a round, leaving the round ends
// every episode, and held input is always sent, never lost.
(() => {
  const ggs = globalThis.__ggs;
  const INPUT = [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'mousedown',
    'mousemove',
    'mouseup',
    'click',
    'dblclick',
    'contextmenu',
    'wheel',
    'keydown',
    'keyup',
  ];
  // Street View's own keys (as core/lock.js)
  const KEYS = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'w',
    'a',
    's',
    'd',
    'W',
    'A',
    'S',
    'D',
    '+',
    '-',
    '=',
    '_',
    'z',
    'x',
    'Z',
    'X',
    'Backspace',
  ];
  // Input events kept during one freeze. Mouse moves past this are dropped.
  const MAX_HELD = 500;
  const between = (lo, hi) => lo + Math.random() * (hi - lo);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const roll = p => Math.random() < p;
  const inRound = () => !!ggs.maps.guessMapElement() && !!ggs.view.panoElement();
  const panoRect = () => ggs.view.panoElement()?.getBoundingClientRect() ?? null;

  // How bad, from the level (1-10). s runs 0..1 over the slider. hard is 0 below 5, then rises as
  // a square: 5 is mildly annoying, 10 barely playable.
  // Gaps between episodes: about 45-90 s at 1, 16-32 s at 5, 7-14 s at 7, 1.5-3 s at 10.
  function knobs(level) {
    const s = (level - 1) / 9;
    const hard = level >= 5 ? ((level - 4) / 6) ** 2 : 0;
    const gap = 45 * (1 / 30) ** (s ** 1.5);
    return { level, s, hard, gap: [gap, 2 * gap], len: 1 + s * s, double: hard * 0.7 };
  }

  // ---- chunky tiles (core/tiles.js) ----
  // While `chunk` is set, each tile is drawn from a copy `chunk` times smaller, and a few are left
  // grey or blurred as if still loading.
  // A whole-texture upload gets the small copy itself, sized to a power of two (so WebGL 1 can
  // still mipmap and wrap it) and magnified NEAREST. That is next to free, where a full-size copy
  // of every tile stalled the game for up to a second. LINEAR (the default, and what Street View
  // uses) comes back with the full tile. It isn't read back with gl.getTexParameter, which waits
  // for the GPU process.
  // Partial uploads (texSubImage2D, or a mip level) must keep their size, so they get a full-size
  // copy.
  let chunk = 0;
  let greyShare = 0;
  const GREY = '#8e9094';
  const pot = n => 2 ** Math.max(0, Math.round(Math.log2(n)));
  const sharp = new WeakSet(); // textures drawn NEAREST
  function nearest(rec, on) {
    const { gl, tex, target } = rec;
    if (on === sharp.has(tex)) return;
    const prev = gl.getParameter(ggs.glBinding(gl, target)[1]);
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : gl.LINEAR);
    gl.bindTexture(target, prev);
    if (on) sharp.add(tex);
    else sharp.delete(tex);
  }
  // One canvas per size, reused. A whole-texture upload copies it before the filter runs again,
  // and nothing after this filter keeps it, so hundreds of tiles don't leave hundreds of canvases.
  const scratches = new Map();
  function scratch(w, h) {
    const key = `${w}x${h}`;
    if (!scratches.has(key)) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').globalCompositeOperation = 'copy'; // each tile replaces the last
      scratches.set(key, c);
    }
    return scratches.get(key);
  }
  function lowRes(rec, source) {
    const w = source.naturalWidth || source.width || 512;
    const h = source.naturalHeight || source.height || 512;
    const whole = rec.name === 'texImage2D' && rec.args[1] === 0;
    const r = Math.random();
    const grey = r < greyShare;
    const blurry = !grey && r < 2 * greyShare;
    const k = blurry ? 48 : chunk;
    const size = n => (grey ? 1 : whole ? pot(n / k) : Math.max(1, Math.round(n / k)));
    const small = whole ? scratch(size(w), size(h)) : new OffscreenCanvas(size(w), size(h));
    const g = small.getContext('2d');
    if (grey) {
      g.fillStyle = GREY;
      g.fillRect(0, 0, 1, 1);
    } else {
      g.drawImage(source, 0, 0, small.width, small.height);
    }
    if (whole) {
      nearest(rec, !grey && !blurry);
      return small;
    }
    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = blurry;
    o.drawImage(small, 0, 0, w, h);
    return out;
  }
  ggs.tiles.filter((rec, source) => {
    if (chunk) return lowRes(rec, source);
    if (sharp.has(rec.tex)) nearest(rec, false);
    return source;
  }, 5); // after greyscale (4)

  // ---- panoramas, for rubber-banding and stutter ----
  const panos = new Map(); // StreetViewPanorama -> its element
  let onMove = null; // the running script's pano_changed handler
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    panos.set(p, args[0]);
    window.google.maps.event.addListener(p, 'pano_changed', () => onMove?.(p));
  });
  function pano() {
    const el = ggs.view.panoElement();
    return el && [...panos].reverse().find(([, e]) => e === el || e?.contains?.(el) || el.contains(e))?.[0];
  }

  // ---- looks ----
  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147481000; pointer-events: none;
            font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .lag { position: absolute; translate: -50% -50%; animation: in .2s ease-out; transition: opacity .25s; }
    .out { opacity: 0; }
    @keyframes in { from { opacity: 0; } }
    @keyframes turn { to { transform: rotate(360deg); } }
    @keyframes fade { from { opacity: 1; } to { opacity: .15; } }
    @keyframes hop { 0%, 60%, 100% { transform: none; } 30% { transform: translateY(-8px); } }
    @keyframes flip {
      0%, 40% { transform: rotate(0); }
      50%, 90% { transform: rotate(180deg); }
      100% { transform: rotate(360deg); } }
    @keyframes orbit {
      0% { transform: rotate(225deg); opacity: 1; animation-timing-function: ease-out; }
      7% { transform: rotate(345deg); animation-timing-function: linear; }
      30% { transform: rotate(455deg); animation-timing-function: ease-in-out; }
      39% { transform: rotate(690deg); animation-timing-function: linear; }
      70% { transform: rotate(815deg); opacity: 1; animation-timing-function: ease-out; }
      75% { transform: rotate(945deg); animation-timing-function: ease-out; }
      76%, 100% { transform: rotate(945deg); opacity: 0; } }
    @keyframes dash {
      0% { stroke-dasharray: 1 150; stroke-dashoffset: 0; }
      50% { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
      100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; } }
    .shade { filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .55)); }
    .dark { background: rgba(28, 26, 46, .82); color: #fff; box-shadow: 0 6px 18px -6px rgba(0, 0, 0, .6); }
    .ring { width: 46px; height: 46px; border-radius: 50%; border: 5px solid rgba(255, 255, 255, .25);
            border-top-color: #fff; box-sizing: border-box; animation: turn .8s linear infinite; }
    .wheel { width: 56px; height: 56px; border-radius: 14px; }
    .wheel span { position: absolute; left: 50%; top: 50%; width: 4px; height: 12px; margin: -6px -2px;
                  border-radius: 2px; background: #fff; animation: fade .9s linear infinite; }
    .dots { display: flex; gap: 7px; padding: 13px 16px; border-radius: 999px; }
    .dots i { width: 9px; height: 9px; border-radius: 50%; background: #fecd19;
              animation: hop 1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    .glass { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; }
    .glass b { animation: flip 2s ease-in-out infinite; }
    .win { width: 48px; height: 48px; }
    .win i { position: absolute; inset: 0; animation: orbit 5.5s infinite both; }
    .win i::after { content: ''; position: absolute; left: 50%; top: 0; width: 6px; height: 6px; margin-left: -3px;
                    border-radius: 50%; background: #fff; }
    .tube { width: 68px; height: 68px; animation: turn 1.4s linear infinite; }
    .tube circle { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round;
                   animation: dash 1.4s ease-in-out infinite; }
    .pill { display: flex; align-items: center; gap: 9px; padding: 8px 15px 8px 11px; border-radius: 999px;
            white-space: nowrap; }
    .pill i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .3);
              border-top-color: #fecd19; box-sizing: border-box; animation: turn .8s linear infinite; }
    .pct { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 50%; font-size: 14px; }
    .pct::before { content: ''; position: absolute; inset: 6px; border-radius: 50%;
                   border: 3px solid rgba(255, 255, 255, .2); border-left-color: #fecd19;
                   animation: turn 1.1s linear infinite; }
    .ping { padding: 6px 11px; border-radius: 6px; font: 700 12px/1 ui-monospace, Menlo, Consolas, monospace;
            white-space: nowrap; }
    .ping b { color: #ff6b5b; }
    .ping .ok { color: #fecd19; }
    .card { width: 230px; padding: 12px 14px; background: #f5f1e8; color: #1c1a2e; border: 2px solid #1c1a2e;
            border-radius: 10px; box-shadow: 4px 4px 0 rgba(28, 26, 46, .35); }
    .card p { margin: 0 0 8px; font-weight: 800; }
    .card span { float: right; font-variant-numeric: tabular-nums; }
    .card small { display: block; font-size: 11px; opacity: .6; }
    .card u { display: block; height: 10px; border: 1.5px solid #1c1a2e; border-radius: 6px; overflow: hidden;
              margin-bottom: 6px; }
    .bar { display: block; height: 100%; width: 0; background: #fecd19; transition: width .15s; }
    .top { position: absolute; height: 4px; overflow: hidden; }
    .top .bar { box-shadow: 0 0 10px #fecd19; }
    .badge { padding: 5px 9px; border-radius: 5px; font-size: 12px; }
    .badge b { color: #fecd19; }
    .fog { position: absolute; background: rgba(255, 255, 255, .42); backdrop-filter: saturate(.4);
           animation: in .6s; transition: opacity .25s; }
    .dialog { width: 340px; padding: 22px 24px 18px; background: #fff; color: #202124; border-radius: 8px;
              pointer-events: auto; box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
              font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .dialog h1 { margin: 0 0 10px; font-size: 16px; font-weight: 500; }
    .dialog p { margin: 0 0 6px; color: #5f6368; }
    .dialog div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .dialog button { font: 500 13px system-ui, sans-serif; padding: 8px 16px; border-radius: 4px; cursor: pointer;
                     border: 1px solid #dadce0; background: #fff; color: #1a73e8; }
    .dialog button.main { background: #1a73e8; border-color: #1a73e8; color: #fff; }
  `;
  // Spinners: html, and an optional live(el, ep) for ones whose text changes.
  const wheelSpokes = Array.from(
    { length: 12 },
    (_, i) =>
      `<span style="transform: rotate(${i * 30}deg) translateY(-15px); ` +
      `animation-delay: ${(i * 0.075 - 0.9).toFixed(3)}s"></span>`,
  ).join('');
  const windowsDots = [0, 1, 2, 3, 4].map(i => `<i style="animation-delay: ${i * 0.24}s"></i>`).join('');
  const SPINNERS = {
    ring: { html: '<div class="lag shade ring"></div>' },
    wheel: { html: `<div class="lag dark wheel">${wheelSpokes}</div>` },
    dots: { html: '<div class="lag dark dots"><i></i><i></i><i></i></div>' },
    glass: { html: '<div class="lag dark glass"><b>⌛</b></div>' },
    windows: { html: `<div class="lag shade win">${windowsDots}</div>` },
    tube: { html: '<svg class="lag shade tube" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"/></svg>' },
    reconnect: { html: '<div class="lag dark pill"><i></i><span>Reconnecting…</span></div>' },
    server: { html: '<div class="lag dark pill"><i></i><span>Waiting for server…</span></div>' },
    retry: {
      html: '<div class="lag dark pill"><i></i><span>Connection lost. Retrying in 3…</span></div>',
      live(el, ep) {
        let n = 3;
        ep.every(1000, () => {
          n = n > 1 ? n - 1 : 3;
          el.querySelector('span').textContent = `Connection lost. Retrying in ${n}…`;
        });
      },
    },
    percent: {
      html: '<div class="lag dark pct">0%</div>',
      live(el, ep) {
        let p = Math.floor(between(0, 40));
        ep.every(300, () => {
          if (roll(0.6)) p = Math.min(99, p + Math.floor(between(1, 6)));
          el.firstChild.textContent = `${p}%`;
        });
      },
    },
  };
  const FREEZE_SPINNERS = ['ring', 'wheel', 'windows', 'tube', 'server', 'reconnect'];
  // Loading-bar progress per tick (percent): stuck at 99, slipping back now and then, or starting
  // over.
  const BARS = {
    stall: p => Math.min(99, p + between(1, 7)),
    back: p => (roll(0.08) ? Math.max(0, p - between(10, 30)) : Math.min(97, p + between(0, 5))),
    restart: p => (p > 85 ? 0 : p + between(1, 6)),
  };
  const LABELS = ['Loading panorama…', 'Downloading tiles…', 'Syncing round…', 'Buffering…'];

  function start(cfg) {
    let level = Number(cfg.level) || 4;
    let timer = 0;
    let snapUntil = 0;
    const running = new Set();
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', ''); // keys on the fake dialog's buttons stay away from GeoGuessr
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>`;
    document.body.append(host);

    // A random spot over the panorama, away from its edges and outside the guess map's area.
    function spot() {
      const r = panoRect();
      const g = ggs.view.guessArea();
      if (!r || r.width < 200) return null;
      for (let i = 0; i < 12; i++) {
        const x = between(r.left + r.width * 0.15, r.right - r.width * 0.15);
        const y = between(r.top + r.height * 0.15, r.bottom - r.height * 0.2);
        if (!g || x < g.left - 90 || x > g.right + 90 || y < g.top - 50 || y > g.bottom + 50) return [x, y];
      }
      return null;
    }

    // ---- episodes: each owns its timers, elements and undo steps, and ends after its time ----
    function episode(id, ms) {
      const ep = { id, timers: [], els: [], undo: [] };
      ep.after = (t, fn) => ep.timers.push(setTimeout(fn, t));
      ep.every = (t, fn) => ep.timers.push(setInterval(fn, t));
      ep.finally = fn => ep.undo.push(fn);
      ep.show = (html, at, style = {}) => {
        const t = document.createElement('template');
        t.innerHTML = html;
        const el = t.content.firstElementChild;
        if (at) Object.assign(el.style, { left: `${at[0]}px`, top: `${at[1]}px` });
        Object.assign(el.style, style);
        root.append(el);
        ep.els.push(el);
        return el;
      };
      ep.end = () => {
        if (!running.delete(ep)) return;
        ep.timers.forEach(clearTimeout); // clears intervals too
        for (const el of ep.els) {
          el.classList.add('out');
          setTimeout(() => el.remove(), 260);
        }
        for (const fn of ep.undo) {
          try {
            fn();
          } catch (err) {
            ggs.log('lag: undo failed', err);
          }
        }
      };
      running.add(ep);
      ep.after(ms, ep.end);
      return ep;
    }
    const busy = id => [...running].some(ep => ep.id === id);
    const endAll = () => {
      for (const ep of [...running]) ep.end();
    };

    function spinner(ep, name = pick(Object.keys(SPINNERS)), at = spot()) {
      if (!at) return;
      const s = SPINNERS[name];
      const el = ep.show(s.html, at);
      s.live?.(el, ep);
    }
    function showPing(ep, ms = between(400, 1500)) {
      const r = panoRect();
      if (!r) return;
      const html =
        '<div class="lag dark ping">' + 'PING <b>0</b> ms · LOSS <b>0</b>% · FPS <b class="ok">0</b></div>';
      const el = ep.show(html, [r.left + r.width / 2, r.top + 70]);
      const [ping, loss, fps] = el.querySelectorAll('b');
      const tick = () => {
        ping.textContent = Math.round(ms * between(0.7, 1.4));
        loss.textContent = Math.round(between(4, 45));
        fps.textContent = Math.round(between(3, 19));
      };
      tick();
      ep.every(350, tick);
    }

    // ---- the effects ----
    function spinners(ep, k) {
      const n = 1 + (roll(k.s * k.s * 0.6) ? 1 : 0) + (roll(k.hard * 0.4) ? 1 : 0);
      const names = Object.keys(SPINNERS)
        .sort(() => Math.random() - 0.5)
        .slice(0, n);
      for (const name of names) spinner(ep, name);
    }
    function loadingBar(ep) {
      const step = BARS[pick(Object.keys(BARS))];
      const r = panoRect();
      let el;
      let at;
      let label = null;
      if (roll(0.5)) at = spot();
      if (at) {
        const text = pick(LABELS);
        const speed = pick(['12 KB/s', '3 KB/s', '0 KB/s']);
        el = ep.show(
          `<div class="lag card"><p>${text}</p><u><i class="bar"></i></u><span>0%</span>` +
            `<small>${speed}</small></div>`,
          at,
        );
        label = el.querySelector('p');
        label.dataset.text = text;
      } else if (r) {
        el = ep.show('<div class="top"><i class="bar"></i></div>', [r.left, r.top], {
          width: `${r.width}px`,
        });
      }
      if (!el) return;
      const bar = el.querySelector('.bar');
      const pct = el.querySelector('span');
      let p = 0;
      ep.every(150, () => {
        const was = p;
        p = step(p);
        bar.style.width = `${p}%`;
        if (pct) pct.textContent = `${Math.floor(p)}%`;
        if (label && p < was - 40) label.textContent = 'Retrying…';
        else if (label && p > 30) label.textContent = label.dataset.text;
      });
    }
    function blocky(ep, k, ms) {
      chunk = Math.round(lerp(10, 40, k.s * k.s));
      greyShare = lerp(0.04, 0.25, k.s * k.s);
      ggs.tiles.replay();
      // sharpens in steps, like tiles coming in at better resolutions
      ep.after(ms * 0.55, () => {
        chunk = Math.max(2, chunk >> 1);
        greyShare = 0;
        ggs.tiles.replay();
      });
      ep.after(ms * 0.8, () => {
        chunk = Math.max(2, chunk >> 1);
        ggs.tiles.replay();
      });
      ep.finally(() => {
        chunk = 0;
        greyShare = 0;
        ggs.tiles.replay();
      });
      if (roll(0.5)) spinner(ep, pick(['ring', 'percent', 'tube']));
    }
    function lowQuality(ep, k, ms) {
      const r = panoRect();
      const badge =
        r &&
        ep.show('<div class="lag dark badge">Quality: Auto <b>144p</b></div>', [r.right - 120, r.top + 70]);
      const steps = [
        ['144p', lerp(4, 9, k.s * k.s)],
        ['240p', 4],
        ['480p', 1.5],
      ];
      steps.forEach(([q, px], i) => {
        ep.after((ms * i) / 3, () => {
          ggs.view.effect('lag-quality', { filter: `blur(${px}px) saturate(.85)` });
          if (badge) badge.querySelector('b').textContent = q;
        });
      });
      ep.finally(() => ggs.view.effect('lag-quality', null));
    }
    // Shared with the Street View input queue below.
    let freezes = 0;
    let delay = 0;
    function freeze(ep) {
      freezes++;
      ep.finally(() => {
        freezes--;
        if (!freezes) thaw();
      });
      ep.after(between(300, 800), () => spinner(ep, pick(FREEZE_SPINNERS)));
    }
    function inputDelay(ep, k) {
      delay = Math.round(lerp(150, 900, k.hard));
      ep.finally(() => {
        delay = 0;
      });
      showPing(ep, delay);
    }
    // the view and the guess map jump back to where they were half a second ago
    function stutter(ep) {
      const p = pano();
      const map = ggs.maps.findGuessMap();
      const past = [];
      ep.every(100, () => {
        past.push({ pov: p?.getPov(), centre: map?.getCenter() });
        if (past.length > 5) past.shift();
      });
      ep.every(between(300, 550), () => {
        const old = past[0];
        if (!old || roll(0.3)) return;
        try {
          if (old.pov) p.setPov({ heading: old.pov.heading, pitch: old.pov.pitch });
        } catch {}
        try {
          if (old.centre) map.setCenter(old.centre);
        } catch {}
        past.length = 0;
      });
      showPing(ep);
    }
    // a washed-out panorama with a browser-style "Page Unresponsive" box; either button closes it
    function hang(ep) {
      const r = panoRect();
      if (!r) return;
      ep.show('<div class="fog"></div>', [r.left, r.top], { width: `${r.width}px`, height: `${r.height}px` });
      const box = ep.show(
        `<div class="lag dialog"><h1>Page Unresponsive</h1>
        <p>You can wait for it to become responsive or exit the page.</p><p>www.geoguessr.com</p>
        <div><button>Exit page</button><button class="main">Wait</button></div></div>`,
        [r.left + r.width / 2, r.top + r.height * 0.42],
      );
      for (const b of box.querySelectorAll('button')) {
        b.addEventListener('click', e => {
          e.stopPropagation();
          ep.end();
        });
      }
    }

    // weight: how often it's picked. from: the first level it happens at. ms: how long it lasts at
    // level 1 (up to twice that at 10). grows: weighs up to 4x more towards 10.
    const EFFECTS = [
      { id: 'spinner', from: 1, weight: 5, ms: [2000, 5000], run: spinners },
      { id: 'bar', from: 1, weight: 3, ms: [3000, 7000], run: loadingBar },
      { id: 'blocky', from: 1, weight: 3, ms: [3000, 6000], run: blocky },
      { id: 'quality', from: 2, weight: 2, ms: [3000, 6000], run: lowQuality },
      { id: 'ping', from: 3, weight: 2, ms: [4000, 8000], run: ep => showPing(ep) },
      { id: 'freeze', from: 5, weight: 4, ms: [1200, 3000], run: freeze, grows: true },
      { id: 'delay', from: 5, weight: 3, ms: [4000, 8000], run: inputDelay, grows: true },
      { id: 'stutter', from: 6, weight: 2, ms: [3000, 6000], run: stutter, grows: true },
      { id: 'hang', from: 7, weight: 1, ms: [4000, 7000], run: hang },
    ];
    function launch(k) {
      const list = EFFECTS.filter(e => level >= e.from && !busy(e.id)).map(e => [
        e,
        e.weight * (e.grows ? 1 + 3 * k.hard : 1),
      ]);
      let r = Math.random() * list.reduce((sum, [, w]) => sum + w, 0);
      const fx = list.find(([, w]) => {
        r -= w;
        return r < 0;
      })?.[0];
      if (!fx) return;
      const ms = between(...fx.ms) * k.len;
      const ep = episode(fx.id, ms);
      try {
        fx.run(ep, k, ms);
      } catch (err) {
        ggs.log('lag: effect failed', err);
        ep.end();
      }
    }
    // The first episode comes at once on switching on, and soon in a new round: 1-3 s, plus up to
    // 8 s more at level 1.
    function next(first, now) {
      const k = knobs(level);
      clearTimeout(timer);
      const wait = now
        ? 100
        : first
          ? between(1000, 3000) + (1 - k.s) * between(0, 8000)
          : between(...k.gap) * 1000;
      timer = setTimeout(() => {
        if (inRound()) {
          launch(k);
          if (roll(k.double)) launch(k);
        }
        next(false);
      }, wait);
    }
    next(true, true);
    let roundSeen = ggs.game.roundKey();
    const watch = setInterval(() => {
      if (!inRound() && running.size) endAll();
      const now = ggs.game.roundKey();
      if (inRound() && now !== roundSeen) {
        roundSeen = now;
        next(true);
      }
    }, 300);

    // ---- Street View input: held during a freeze, or sent `delay` ms late ----
    // Real (trusted) events only, so the copies sent below, and other scripts' copies, pass.
    const queue = []; // { e: a copy, target, at, due }, in order
    let pump = 0;
    let pressed = false;
    function wanted(e) {
      if (!e.isTrusted || !inRound()) return false;
      if (e.type.startsWith('key')) {
        return (
          KEYS.includes(e.key) &&
          !ggs.isTyping(e) &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !ggs.maps.guessMapElement()?.contains(e.target)
        );
      }
      const t = e.target;
      if (pressed) return true;
      return !!ggs.view.panoElement()?.contains(t) && !t.closest?.('[data-ggs-view], [data-ggs-ui]');
    }
    function hold(e) {
      const take = (freezes || delay || queue.length) && wanted(e);
      // a held press: its drag and release are held too, wherever they go
      if (e.isTrusted && (e.type === 'pointerdown' || e.type === 'mousedown')) pressed = !!take;
      // The release ends it, after the rest of its sequence (mouseup, click) in this task. On
      // pointerup too, since a held pointerdown means the browser sends no mouseup at all.
      if (e.isTrusted && /^(pointerup|mouseup|pointercancel)$/.test(e.type)) {
        setTimeout(() => {
          pressed = false;
        });
      }
      if (!take) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (queue.length > MAX_HELD && e.type.endsWith('move')) return;
      const now = performance.now();
      const due = freezes ? Infinity : Math.max(now + delay, queue.at(-1)?.due ?? 0);
      queue.push({ e: ggs.view.copyEvent(e), target: e.target, at: now, due });
      run();
    }
    const send = q => {
      if (q.target.isConnected) q.target.dispatchEvent(q.e);
    };
    function run() {
      clearTimeout(pump);
      const now = performance.now();
      while (queue.length && queue[0].due <= now) send(queue.shift());
      if (queue.length && queue[0].due < Infinity) pump = setTimeout(run, queue[0].due - now);
    }
    // A freeze ended: everything held happens at once, squeezed into under half a second.
    function thaw() {
      const held = queue.filter(q => q.due === Infinity);
      const now = performance.now();
      const t0 = held[0]?.at;
      const span = (held.at(-1)?.at ?? 0) - t0;
      for (const q of held) q.due = now + (q.at - t0) * Math.min(0.15, 400 / (span || 1));
      run();
    }
    const opts = { capture: true, passive: false };
    for (const t of INPUT) window.addEventListener(t, hold, opts);

    // ---- rubber-banding: a move sometimes snaps back to the last panorama for a moment ----
    const last = new WeakMap(); // panorama -> { id, round }
    onMove = p => {
      if (performance.now() < snapUntil) return;
      const id = p.getPano();
      const round = ggs.game.roundKey();
      const was = last.get(p);
      const k = knobs(level);
      last.set(p, { id, round });
      if (!was || was.round !== round || was.id === id || !inRound()) return;
      if (busy('rubber') || !roll(k.hard * 0.6)) return;
      const ep = episode('rubber', between(250, 600) + between(600, 1500) * k.len);
      snapUntil = Infinity;
      ep.after(between(250, 600), () => {
        if (p.getPano() !== id) return;
        p.setPano(was.id);
        spinner(ep, pick(['reconnect', 'server', 'ring']));
      });
      ep.finally(() => {
        if (p.getPano() === was.id && ggs.game.roundKey() === round) p.setPano(id);
        snapUntil = performance.now() + 500;
      });
    };

    // ---- the guess map: slow guesses, late or misplaced pins (core/aid.js) ----
    let sending = false;
    let pinTimer = 0;
    const aid = ggs
      .aid('lag', {
        usesLocation: false,
        beforeGuess() {
          const k = knobs(level);
          if (sending === 'pass') return null;
          if (sending) return false;
          if (!k.hard || !roll(0.15 + 0.8 * k.hard)) return null;
          const ms = between(1500, 2500) * (1 + 1.5 * k.hard);
          const ep = episode('guess', ms + 50);
          const btn = ggs.maps.guessButton()?.getBoundingClientRect();
          sending = true;
          ep.finally(() => {
            sending = false;
          });
          const el = ep.show(
            '<div class="lag dark pill"><i></i><span>Sending guess…</span></div>',
            btn ? [btn.left + btn.width / 2, btn.top - 26] : spot(),
          );
          if (k.level >= 8) {
            const say = text => {
              el.querySelector('span').textContent = text;
            };
            ep.after(ms * 0.4, () => say('Connection lost. Retrying (1/3)…'));
            ep.after(ms * 0.7, () => say('Retrying (2/3)…'));
          }
          ep.after(ms, () => {
            if (!ggs.maps.guessMapElement()) return;
            sending = 'pass';
            try {
              if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
            } finally {
              sending = true;
            }
          });
          return false;
        },
        // Cursor desync: leaving the guess map sometimes drags the pin past the map's edge, whether
        // you clicked or not (from level 3, more often higher up).
        attach(ctx) {
          let prev = null;
          let last = null;
          const ev = ctx.gm.event;
          const a = ev.addListener(ctx.map, 'mousemove', e => {
            prev = last;
            last = e.latLng;
          });
          const b = ev.addListener(ctx.map, 'mouseout', () => {
            const k = knobs(level);
            const bounds = ctx.map.getBounds();
            if (level < 3 || !last || !bounds || !roll(0.1 + 0.5 * k.s)) return;
            const from = prev ?? ctx.map.getCenter();
            const span = bounds.toSpan();
            const dy = last.lat() - from.lat();
            const dx = last.lng() - from.lng();
            const len = Math.hypot(dx, dy) || 1;
            const far = between(0.15, 0.5);
            const lat = Math.max(-80, Math.min(80, last.lat() + (dy / len) * span.lat() * far));
            const lng = ((last.lng() + (dx / len) * span.lng() * far + 540) % 360) - 180;
            clearTimeout(pinTimer);
            pinTimer = setTimeout(() => place(lat, lng), between(150, 600));
          });
          return () => {
            a.remove();
            b.remove();
          };
        },
        click(latLng, ctx) {
          const k = knobs(level);
          clearTimeout(pinTimer);
          if (!k.hard || !roll(0.1 + 0.7 * k.hard)) return;
          let lat = latLng.lat();
          let lng = latLng.lng();
          if (roll(0.5)) {
            // late: the pin goes, then shows up a moment later
            setTimeout(() => {
              try {
                ggs.maps.clearGuess();
              } catch {}
            });
            pinTimer = setTimeout(() => place(lat, lng), between(400, 1200) * (1 + k.hard));
          } else {
            // off: it lands, then slides a few dozen pixels away
            const px = between(15, 40) * (1 + k.hard);
            const mPerPx = (156543 * Math.cos((lat * Math.PI) / 180)) / 2 ** (ctx.map?.getZoom() ?? 2);
            ({ lat, lng } = ggs.aid.destination({ lat, lng }, (px * mPerPx) / 1000, between(0, 2 * Math.PI)));
            pinTimer = setTimeout(() => place(lat, lng), between(120, 350));
          }
        },
      })
      .start(cfg);
    const place = (lat, lng) => {
      if (!ggs.maps.guessMapElement()) return;
      try {
        ggs.maps.placeGuess(lat, lng, { pan: false });
      } catch {}
    };

    return {
      stop() {
        clearTimeout(timer);
        clearInterval(watch);
        clearTimeout(pinTimer);
        onMove = null;
        endAll();
        for (const t of INPUT) window.removeEventListener(t, hold, opts);
        clearTimeout(pump);
        queue.splice(0).forEach(send); // anything still held goes now, in order
        aid.stop();
        host.remove();
      },
      update(c) {
        level = Number(c.level) || 4;
        aid.update(c);
      },
    };
  }
  ggs.scripts.lag = { start };
})();
