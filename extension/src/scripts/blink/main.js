// Blink: each round Street View is covered by a paper sheet (core/view.js). It says "Loading…"
// until the round's tiles show (at least LOADING_MS), then "Get ready" for READY_MS. Then the
// view shows for the chosen time, with a bar counting down, and is covered again until the round
// ends. Switched on mid-round (or after a reload), it goes straight to "Get ready".
(() => {
  const ggs = globalThis.__ggs;
  const MS = [100, 500, 1000, 2000, 5000, 10000]; // by the Shown for slider
  const LOADING_MS = 1000;
  const READY_MS = 1000;
  const NO_TILES_MS = 5000; // a round whose tiles never show up moves on anyway
  // While covered, a stylesheet also makes every Street View picture (any .gm-style but the guess
  // map's) see-through. It applies the moment GeoGuessr adds a new one, before the sheet moves onto
  // it, so a new round or a reload never flashes the view. Opacity keeps tiles loading, unlike
  // visibility. Only during a round, since the results screen's map is a .gm-style too.
  const HIDE_CSS =
    '.gm-style:not([class*="guess-map"] *, [data-qa="guess-map"] *) { opacity: 0 !important; }';
  const INK = '#1c1a2e';
  const YELLOW = '#fecd19';
  const BAR_CSS =
    'position:fixed;z-index:2147481000;height:4px;' +
    `background:${YELLOW};box-shadow:0 -1px 0 ${INK};pointer-events:none;`;
  const CARD_CSS = `position:fixed;z-index:2147481000;transform:translate(-50%,-50%);flex-direction:column;
    align-items:center;gap:10px;font:800 18px/1 system-ui,sans-serif;letter-spacing:.04em;color:${INK};
    pointer-events:none;`;
  const CARD_HTML =
    '<span></span>' +
    `<b style="display:block;width:160px;height:8px;border:1.5px solid ${INK};border-radius:6px;overflow:hidden">
      <i style="display:block;height:100%;width:0;background:${YELLOW}"></i></b>`;

  function start(cfg) {
    let ms = MS[cfg.shown] ?? 5000;
    let round = null; // { key, since, ready, until }
    let first = true;
    const el = (css, html = '') => {
      const e = Object.assign(document.createElement('div'), { hidden: true, innerHTML: html });
      e.style.cssText = css;
      e.setAttribute('data-ggs-view', '');
      document.body.append(e);
      return e;
    };
    const bar = el(BAR_CSS);
    const card = el(CARD_CSS, CARD_HTML);
    const word = card.querySelector('span');
    const meter = card.querySelector('b');
    const fill = meter.firstElementChild;
    const hide = Object.assign(document.createElement('style'), { textContent: HIDE_CSS });
    document.head.append(hide);

    // the step a round is on: loading, ready, show or done
    function stepOf(now) {
      if (round.ready == null) {
        const loaded = ggs.view.lastTile() >= round.since || now - round.since >= NO_TILES_MS;
        if (now - round.since < LOADING_MS || !loaded) return 'loading';
        round.ready = now;
      }
      if (now < round.ready + READY_MS) return 'ready';
      round.until ??= round.ready + READY_MS + ms;
      return now < round.until ? 'show' : 'done';
    }

    // a new round starts loading; switched on with Street View already up: straight to "Get ready"
    function syncRound(now) {
      const key = ggs.game.roundKey();
      if (round?.key === key) return;
      round = first && ggs.view.lastTile() > 0 ? { key, since: now, ready: now } : { key, since: now };
      first = false;
    }

    function showCard(r, now) {
      word.textContent = step === 'loading' ? 'Loading…' : 'Get ready';
      meter.style.visibility = step === 'ready' ? 'visible' : 'hidden';
      fill.style.width = `${Math.min(100, ((now - round.ready) / READY_MS) * 100) || 0}%`;
      Object.assign(card.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` });
      card.style.display = 'flex'; // not `hidden`: the inline display would beat it
    }

    function showBar(r, now) {
      const width = (r.width * (round.until - now)) / ms;
      Object.assign(bar.style, { left: `${r.left}px`, top: `${r.bottom - 4}px`, width: `${width}px` });
      bar.hidden = false;
    }

    let step = 'loading';
    function tick() {
      bar.hidden = true;
      card.style.display = 'none';
      if (!ggs.maps.guessMapElement()) return;
      const now = performance.now();
      syncRound(now);
      step = stepOf(now);
      const r = ggs.view.panoElement()?.getBoundingClientRect();
      if (!r) return;
      if (step === 'loading' || step === 'ready') showCard(r, now);
      else if (step === 'show') showBar(r, now);
    }

    const covered = () => !round || round.key !== ggs.game.roundKey() || step !== 'show';
    const mask = ggs.view.mask({ over: 'pano', look: 'paper', cut: () => (covered() ? '' : null) });
    const run = () => {
      tick();
      hide.disabled = !(covered() && ggs.maps.guessMapElement());
    };
    const timer = setInterval(run, 30);
    run();
    return {
      stop() {
        clearInterval(timer);
        mask.stop();
        bar.remove();
        card.remove();
        hide.remove();
      },
      update(next) {
        ms = MS[next.shown] ?? 5000;
      },
    };
  }
  ggs.scripts.blink = { start };
})();
