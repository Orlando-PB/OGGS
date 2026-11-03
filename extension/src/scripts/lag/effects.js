// Fake lag's episodes: each one shows its spinners, bars or readouts, or gets in the way, and
// undoes all of it when it ends on its own timer. EFFECTS lists what an episode can be.
(() => {
  const ggs = globalThis.__ggs;
  const L = ggs.lag;
  const { between, lerp, pick, roll, SPINNERS, FREEZE_SPINNERS, BARS, LABELS } = L;

  // Episodes drawn into `root` (the overlay's shadow root); freezes and input delay go to `input`
  // (input.js).
  function effects(root, input) {
    const running = new Set();

    // A random spot over the panorama, away from its edges and outside the guess map's area.
    function spot() {
      const r = L.panoRect();
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
        ggs.html(t, html);
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
        fadeOut(ep.els);
        undo(ep.undo);
      };
      running.add(ep);
      ep.after(ms, ep.end);
      return ep;
    }
    function fadeOut(els) {
      for (const el of els) {
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
      }
    }
    function undo(steps) {
      for (const fn of steps) {
        try {
          fn();
        } catch (err) {
          ggs.log('lag: undo failed', err);
        }
      }
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
      const r = L.panoRect();
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
      const r = L.panoRect();
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
    // sharpens in steps, like tiles coming in at better resolutions
    function blocky(ep, k, ms) {
      L.chunky.start(Math.round(lerp(10, 40, k.s * k.s)), lerp(0.04, 0.25, k.s * k.s));
      ep.after(ms * 0.55, () => L.chunky.sharpen(0));
      ep.after(ms * 0.8, () => L.chunky.sharpen());
      ep.finally(L.chunky.end);
      if (roll(0.5)) spinner(ep, pick(['ring', 'percent', 'tube']));
    }
    function lowQuality(ep, k, ms) {
      const r = L.panoRect();
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
    function freeze(ep) {
      input.freeze();
      ep.finally(input.thaw);
      ep.after(between(300, 800), () => spinner(ep, pick(FREEZE_SPINNERS)));
    }
    function inputDelay(ep, k) {
      const delay = Math.round(lerp(150, 900, k.hard));
      input.setDelay(delay);
      ep.finally(() => input.setDelay(0));
      showPing(ep, delay);
    }
    // the view and the guess map jump back to where they were half a second ago
    function stutter(ep) {
      const p = L.pano();
      const map = ggs.maps.findGuessMap();
      const past = [];
      ep.every(100, () => {
        past.push({ pov: p?.getPov(), centre: map?.getCenter() });
        if (past.length > 5) past.shift();
      });
      ep.every(between(300, 550), () => {
        const old = past[0];
        if (!old || roll(0.3)) return;
        jumpBack(p, map, old);
        past.length = 0;
      });
      showPing(ep);
    }
    function jumpBack(p, map, old) {
      try {
        if (old.pov) p.setPov({ heading: old.pov.heading, pitch: old.pov.pitch });
      } catch {}
      try {
        if (old.centre) map.setCenter(old.centre);
      } catch {}
    }
    // a washed-out panorama with a browser-style "Page Unresponsive" box; either button closes it
    function hang(ep) {
      const r = L.panoRect();
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
    // One episode, picked by weight from those allowed at `level` and not already running.
    function launch(k, level) {
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

    return { episode, busy, endAll, spinner, spot, launch, active: () => running.size > 0 };
  }

  L.effects = effects;
})();
