// Draw your country: a drawing board (app/, in an iframe) over GeoGuessr's guess map.
// Sketch the country, pin your spot, and the board snaps the drawing onto the closest
// real country; the pin becomes the guess on the (invisible) map, and a few seconds after
// the animation the script presses GeoGuessr's own hidden Guess button.
(() => {
  const ggs = globalThis.__ggs;

  // The real map stays in the page (the guess goes through it), just invisible, as does
  // its Guess button (the auto-guess and Space still press it).
  const HIDE_MAP_CSS = `
    [class*="guess-map_canvas"] { opacity: 0 !important; pointer-events: none !important; }
    [class*="guess-map_guessMap"] > :not(:has([data-qa="perform-guess"])):not([data-qa="perform-guess"]),
    [class*="guess-map_controls"], [class*="guess-map_zoom"],
    [data-qa="perform-guess"] { visibility: hidden !important; pointer-events: none !important; }`;
  const CSS = `
    :host { all: initial; position: fixed; z-index: 2147483000; transform-origin: bottom right;
            transition: transform .18s ease-out, opacity .18s ease-out; }
    :host(.collapsed) { opacity: .6; }
    :host([hidden]) { display: none !important; }
    iframe { display: block; width: 100%; height: 100%; border: 0; border-radius: 12px; background: #f4efe6;
             box-shadow: 0 16px 40px -12px rgba(0, 0, 0, .6); }
    .status { position: absolute; left: 0; bottom: 100%; margin-bottom: 6px; padding: 4px 10px; border-radius: 999px;
              font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; background: #c92a2a; }
    .status:empty { display: none; }`;
  const MAX_H = 640, MARGIN = 16;
  const COLLAPSED_W = 320, COLLAPSE_DELAY = 600; // small until hovered, like GeoGuessr's map
  const AUTO_GUESS_MS = 3000;

  function start(cfg) {
    const origin = new URL(ggs.extBase).origin;
    let host = null, frame, status;
    let ready = false, queued = [], placed = false, wasInRound = false, lastRound, lastToken;
    let expanded = false, collapseTimer = 0, answerRound;
    let boardH = 0, guessTimer = 0;
    let spot = null, spotKey = ''; // where the board sits; measured once per round and window size

    const hideMap = document.createElement('style');
    hideMap.textContent = HIDE_MAP_CSS;
    (document.head ?? document.documentElement).append(hideMap);

    const post = msg => (ready ? frame.contentWindow.postMessage(msg, origin) : queued.push(msg));

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', 'draw-guess');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="status"></div><iframe></iframe>`;
      frame = root.querySelector('iframe');
      status = root.querySelector('.status');
      frame.src = `${ggs.extBase}src/scripts/draw-guess/app/index.html`;
      post({ ggs: 'hard', on: !!cfg.hardMode });
      post({ ggs: 'nudge', points: cfg.nudge });
      host.addEventListener('mouseenter', () => { clearTimeout(collapseTimer); setExpanded(true); });
      host.addEventListener('mouseleave', () => {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => setExpanded(false), COLLAPSE_DELAY);
      });
      setExpanded(false);
      document.body.append(host);
    }

    function setExpanded(on) {
      expanded = on;
      host.classList.toggle('collapsed', !on);
      if (host.style.width) layout();
    }

    // Right-aligned with the guess map, down to the bottom of its hidden Guess button.
    function layout() {
      const key = `${innerWidth}x${innerHeight}|${lastRound}`;
      if (!spot || key !== spotKey) {
        const anchor = (ggs.maps.guessButton() ?? ggs.maps.guessMapElement()).getBoundingClientRect();
        const right = Math.max(MARGIN, innerWidth - anchor.right);
        const bottom = Math.max(MARGIN, innerHeight - anchor.bottom);
        const h = Math.min(MAX_H, innerHeight - bottom - MARGIN), w = Math.min(h - 52, innerWidth - right - MARGIN); // board is 52px taller than wide
        spot = { right, bottom, w, h };
        spotKey = key;
      }
      const { right, bottom, w } = spot;
      const h = boardH ? Math.min(boardH, innerHeight - bottom - MARGIN) : spot.h;
      const scale = expanded ? 1 : Math.min(1, COLLAPSED_W / w);
      Object.assign(host.style, { right: `${right}px`, bottom: `${bottom}px`, width: `${w}px`, height: `${h}px`,
                                  transform: `scale(${scale})` });
    }

    const onMessage = async e => {
      if (!frame || e.origin !== origin || e.source !== frame.contentWindow) return;
      const d = e.data ?? {};
      if (d.ggs === 'ready') {
        ready = true;
        queued.splice(0).forEach(post);
      } else if (d.ggs === 'height') {
        boardH = d.h;
        if (host.style.width) layout();
      } else if (d.ggs === 'pool') {
        ggs.debug(`draw-guess: map "${d.map}" -> ${d.pool} (${d.how}): ${d.count} countries possible`);
      } else if (d.ggs === 'guess') { // the moment Guess is pressed, before the animation
        try {
          ggs.maps.placeGuess(d.guess.lat, d.guess.lng);
        } catch (err) {
          status.textContent = err.message;
          ggs.maps.debug();
          return;
        }
        placed = true;
        status.textContent = '';
        ggs.drawSummary.record(d.drawing);
      } else if (d.ggs === 'done' && placed) { // animation finished
        clearTimeout(guessTimer);
        const round = ggs.game.roundKey();
        guessTimer = setTimeout(() => {
          if (ggs.game.roundKey() !== round || !ggs.maps.guessMapElement()) return; // already guessed or moved on
          if (!ggs.maps.submitGuess()) status.textContent = "Guess placed, but couldn't press Guess";
        }, AUTO_GUESS_MS);
      }
    };
    window.addEventListener('message', onMessage);

    const tick = setInterval(() => {
      const inRound = !!ggs.maps.guessMapElement();
      ggs.drawSummary.sync(inRound);
      if (inRound && !host) create();
      if (!host) return;
      const round = ggs.game.roundKey();
      if (inRound && placed && (!wasInRound || round !== lastRound)) { // next round: blank board
        post({ ggs: 'reset' });
        clearTimeout(guessTimer);
        placed = false;
        status.textContent = '';
      }
      if (inRound && round !== answerRound) { // tell the board the round's country, for the nudge
        answerRound = round;
        post({ ggs: 'answer', lat: null });
        ggs.game.roundLocation()
          .then(loc => loc && ggs.game.roundKey() === round && post({ ggs: 'answer', lat: loc.lat, lng: loc.lng }))
          .catch(() => {});
      }
      wasInRound = inRound;
      lastRound = round;
      host.hidden = !inRound;
      if (!inRound) return;
      layout();
      const token = ggs.game.context()?.token;
      if (token !== lastToken) { // new game: pick the country pool from the map name
        lastToken = token;
        ggs.game.mapInfo()
          .then(m => (m?.name ? post({ ggs: 'map', name: m.name }) : ggs.debug('draw-guess: no map name, using world coverage')))
          .catch(err => ggs.log('draw-guess: could not read the map, using world coverage', err));
      }
    }, 500);

    return {
      update(next) {
        if (host && !!next.hardMode !== !!cfg.hardMode) post({ ggs: 'hard', on: !!next.hardMode });
        if (host && next.nudge !== cfg.nudge) post({ ggs: 'nudge', points: next.nudge });
        cfg = next;
      },
      stop() {
        clearInterval(tick);
        clearTimeout(collapseTimer);
        clearTimeout(guessTimer);
        window.removeEventListener('message', onMessage);
        host?.remove();
        hideMap.remove();
        ggs.drawSummary.hide();
      },
    };
  }

  ggs.scripts['draw-guess'] = { start };
})();
