// Fake lag: the game acts as if the connection is bad. At random gaps (shorter at higher levels)
// an episode is picked from EFFECTS (effects.js) by weight: spinners, loading bars, chunky or
// blurry Street View, a ping readout. Higher levels also get in the way: held or late input,
// snapping back to the last panorama, slow guesses, late or misplaced pins, a stuttering view.
// Every episode ends on its own timer. It all happens only during a round, leaving the round ends
// every episode, and held input is always sent, never lost. This file schedules the episodes and
// does the rubber-banding and the guess map's part.
(() => {
  const ggs = globalThis.__ggs;
  const L = ggs.lag;
  const { between, pick, roll, inRound } = L;

  // How bad, from the level (1-10). s runs 0..1 over the slider. hard is 0 below 5, then rises as
  // a square: 5 is mildly annoying, 10 barely playable.
  // Gaps between episodes: about 45-90 s at 1, 16-32 s at 5, 7-14 s at 7, 1.5-3 s at 10.
  function knobs(level) {
    const s = (level - 1) / 9;
    const hard = level >= 5 ? ((level - 4) / 6) ** 2 : 0;
    const gap = 45 * (1 / 30) ** (s ** 1.5);
    return { level, s, hard, gap: [gap, 2 * gap], len: 1 + s * s, double: hard * 0.7 };
  }

  function start(cfg) {
    let level = Number(cfg.level) || 4;
    let timer = 0;
    let snapUntil = 0;
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', ''); // keys on the fake dialog's buttons stay away from GeoGuessr
    const root = host.attachShadow({ mode: 'open' });
    ggs.html(root, `<style>${L.CSS}</style>`);
    document.body.append(host);
    const input = L.heldInput();
    const fx = L.effects(root, input);

    // The first episode comes at once on switching on, and soon in a new round: 1-3 s, plus up to
    // 8 s more at level 1.
    function next(first, now) {
      const k = knobs(level);
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          if (inRound()) {
            fx.launch(k, level);
            if (roll(k.double)) fx.launch(k, level);
          }
          next(false);
        },
        waitFor(k, first, now),
      );
    }
    function waitFor(k, first, now) {
      if (now) return 100;
      if (first) return between(1000, 3000) + (1 - k.s) * between(0, 8000);
      return between(...k.gap) * 1000;
    }
    next(true, true);
    let roundSeen = ggs.game.roundKey();
    const watch = setInterval(() => {
      if (!inRound() && fx.active()) fx.endAll();
      const now = ggs.game.roundKey();
      if (inRound() && now !== roundSeen) {
        roundSeen = now;
        next(true);
      }
    }, 300);

    // ---- rubber-banding: a move sometimes snaps back to the last panorama for a moment ----
    const lastPano = new WeakMap(); // panorama -> { id, round }
    L.onMove = p => {
      if (performance.now() < snapUntil) return;
      const id = p.getPano();
      const round = ggs.game.roundKey();
      const was = lastPano.get(p);
      const k = knobs(level);
      lastPano.set(p, { id, round });
      if (!was || was.round !== round || was.id === id || !inRound()) return;
      if (fx.busy('rubber') || !roll(k.hard * 0.6)) return;
      const ep = fx.episode('rubber', between(250, 600) + between(600, 1500) * k.len);
      snapUntil = Infinity;
      ep.after(between(250, 600), () => {
        if (p.getPano() !== id) return;
        p.setPano(was.id);
        fx.spinner(ep, pick(['reconnect', 'server', 'ring']));
      });
      ep.finally(() => {
        if (p.getPano() === was.id && ggs.game.roundKey() === round) p.setPano(id);
        snapUntil = performance.now() + 500;
      });
    };

    // ---- the guess map: slow guesses, late or misplaced pins (core/aid.js) ----
    let sending = false;
    let pinTimer = 0;
    // The guess is held for a few seconds behind a "Sending guess…" pill, then sent.
    function slowGuess(k) {
      const ms = between(1500, 2500) * (1 + 1.5 * k.hard);
      const ep = fx.episode('guess', ms + 50);
      const btn = ggs.maps.guessButton()?.getBoundingClientRect();
      sending = true;
      ep.finally(() => {
        sending = false;
      });
      const el = ep.show(
        '<div class="lag dark pill"><i></i><span>Sending guess…</span></div>',
        btn ? [btn.left + btn.width / 2, btn.top - 26] : fx.spot(),
      );
      if (k.level >= 8) {
        const say = text => {
          el.querySelector('span').textContent = text;
        };
        ep.after(ms * 0.4, () => say('Connection lost. Retrying (1/3)…'));
        ep.after(ms * 0.7, () => say('Retrying (2/3)…'));
      }
      ep.after(ms, sendGuess);
    }
    function sendGuess() {
      if (!ggs.maps.guessMapElement()) return;
      sending = 'pass';
      try {
        if (!ggs.maps.submitGuess()) ggs.maps.pressSpace();
      } finally {
        sending = true;
      }
    }
    // Cursor desync: leaving the guess map sometimes drags the pin past the map's edge, whether
    // you clicked or not (from level 3, more often higher up).
    function desync(ctx) {
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
        const { lat, lng } = pastEdge(prev ?? ctx.map.getCenter(), last, bounds.toSpan());
        clearTimeout(pinTimer);
        pinTimer = setTimeout(() => place(lat, lng), between(150, 600));
      });
      return () => {
        a.remove();
        b.remove();
      };
    }
    // a point further along the move from `from` to `last`, 15-50% of the map's span beyond it
    function pastEdge(from, last, span) {
      const dy = last.lat() - from.lat();
      const dx = last.lng() - from.lng();
      const len = Math.hypot(dx, dy) || 1;
      const far = between(0.15, 0.5);
      const lat = Math.max(-80, Math.min(80, last.lat() + (dy / len) * span.lat() * far));
      const lng = ((last.lng() + (dx / len) * span.lng() * far + 540) % 360) - 180;
      return { lat, lng };
    }
    function misplace(latLng, ctx) {
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
    }
    const aid = ggs
      .aid('lag', {
        usesLocation: false,
        beforeGuess() {
          const k = knobs(level);
          if (sending === 'pass') return null;
          if (sending) return false;
          if (!k.hard || !roll(0.15 + 0.8 * k.hard)) return null;
          slowGuess(k);
          return false;
        },
        attach: desync,
        click: misplace,
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
        L.onMove = null;
        fx.endAll();
        input.stop();
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
