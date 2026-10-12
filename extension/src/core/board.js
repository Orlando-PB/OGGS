// Drawing boards over GeoGuessr's guess map (draw-guess, flag-guess). An app page in an
// iframe sits where the guess map was; the real map stays in the page, invisible, and the
// guess goes through it. This handles the hidden map, the frame and its messages, the
// hover-to-expand size, a blank board each round, placing the pin and pressing Guess.
//   ggs.board({ id, app, size(roomW, roomH, boardH) -> { w, h }, guessDelay, answer, onMessage(d), onTick(inRound) })
//     -> { post(msg), place(guess) -> ok, press(guess, waitMs), status(text), created, stop() }
// The app talks by postMessage: up 'ready', 'height' { h }, 'guess' { guess: { lat, lng } } the
// moment its Guess is pressed (the pin goes on the hidden map straight away), 'done' once its
// animation is over (GeoGuessr's Guess is pressed guessDelay ms later), and its own messages
// (passed to onMessage); down 'reset' each round, 'answer' { lat, lng } each round when `answer` is set
// (lat null until the round's location is known), plus whatever the script posts.
(() => {
  const ggs = globalThis.__ggs;

  // The real map and its Guess button stay in the page, only invisible.
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
  const MARGIN = 16;
  const COLLAPSED_W = 320, COLLAPSE_DELAY = 600; // small until hovered, like GeoGuessr's map
  const RETRY_MS = 500, TRIES = 10;
  const AWAY_MS = 1500; // the guess map gone this long = a result screen, so the board clears

  ggs.board = ({ id, app, size, guessDelay, answer, onMessage, onTick }) => {
    const origin = new URL(ggs.extBase).origin;
    let host = null, frame, statusEl, ready = false, queued = [];
    let expanded = false, collapseTimer = 0, pressTimer = 0, boardH = 0;
    let wasInRound = false, awaySince = 0, placed = false, answerRound, lastGuess = null;
    let spot = null, spotKey = ''; // where the board sits; measured once per round and window size

    const hideMap = document.createElement('style');
    hideMap.textContent = HIDE_MAP_CSS;
    (document.head ?? document.documentElement).append(hideMap);

    const post = msg => (ready ? frame.contentWindow.postMessage(msg, origin) : queued.push(msg));
    const status = text => { if (statusEl) statusEl.textContent = text ?? ''; };

    function create() {
      host = document.createElement('div');
      host.setAttribute('data-ggs-ui', id);
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style><div class="status"></div><iframe></iframe>`;
      frame = root.querySelector('iframe');
      statusEl = root.querySelector('.status');
      frame.src = ggs.extBase + app;
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
      const key = `${innerWidth}x${innerHeight}|${ggs.game.roundKey()}`;
      const el = (!spot || key !== spotKey) && (ggs.maps.guessButton() ?? ggs.maps.guessMapElement());
      if (el) { // with no map on screen (between rounds) the last spot stays
        const anchor = el.getBoundingClientRect();
        const right = Math.max(MARGIN, innerWidth - anchor.right), bottom = Math.max(MARGIN, innerHeight - anchor.bottom);
        spot = { right, bottom, roomW: innerWidth - right - MARGIN, roomH: innerHeight - bottom - MARGIN };
        spotKey = key;
      }
      if (!spot) return;
      const { w, h } = size(spot.roomW, spot.roomH, boardH);
      const scale = expanded ? 1 : Math.min(1, COLLAPSED_W / w);
      Object.assign(host.style, { right: `${spot.right}px`, bottom: `${spot.bottom}px`, width: `${w}px`, height: `${h}px`,
                                  transform: `scale(${scale})` });
    }

    const onFrameMessage = e => {
      if (!frame || e.origin !== origin || e.source !== frame.contentWindow) return;
      const d = e.data ?? {};
      if (d.ggs === 'ready') { ready = true; queued.splice(0).forEach(post); }
      else if (d.ggs === 'height') { boardH = d.h; if (host.style.width) layout(); }
      else if (d.ggs === 'guess') lastGuess = place(d.guess) ? d.guess : null;
      else if (d.ggs === 'done') { if (lastGuess) press(lastGuess, guessDelay); lastGuess = null; }
      else onMessage?.(d);
    };
    window.addEventListener('message', onFrameMessage);

    // A guess is a click on the invisible map (maps.js), so GeoGuessr places its own pin.
    function place(guess) {
      try {
        ggs.maps.placeGuess(guess.lat, guess.lng);
      } catch (err) {
        status(err.message);
        ggs.maps.debug();
        return false;
      }
      placed = true;
      status('');
      return true;
    }

    // GeoGuessr's Guess button can take a moment to appear or enable after the pin goes down,
    // so keep trying for a few seconds, putting the pin down again once in case it was missed.
    // With no button on the page at all (some layouts only show it on hover), Space instead.
    // A new round clears pressTimer (tick below), so this never presses into the next round.
    function press(guess, wait, n = 1) {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!ggs.maps.guessMapElement()) return; // already guessed or moved on
        if (ggs.maps.submitGuess()) return;
        if (n === 2) { try { ggs.maps.placeGuess(guess.lat, guess.lng, { pan: false }); } catch {} }
        if (n >= 3 && !ggs.maps.guessButton()) ggs.maps.pressSpace();
        if (n < TRIES) return press(guess, RETRY_MS, n + 1);
        status(`Guess placed, but couldn't press Guess (${ggs.maps.guessButton() ? 'button stayed disabled' : 'no Guess button found'})`);
        ggs.maps.debug();
      }, wait);
    }

    // The round's real location, for boards that show it once the guess is in.
    function sendAnswer(round) {
      if (round === answerRound) return;
      answerRound = round;
      post({ ggs: 'answer', lat: null });
      ggs.game.roundLocation()
        .then(loc => loc && ggs.game.roundKey() === round && post({ ggs: 'answer', lat: loc.lat, lng: loc.lng }))
        .catch(() => {});
    }

    // A new round gets a blank board. The guess map can blink out for a moment mid-round,
    // so the board only clears after a guess or once the map was gone for a while.
    const tick = setInterval(() => {
      const inRound = !!ggs.maps.guessMapElement();
      if (inRound && !host) create();
      if (host) {
        if (!inRound && wasInRound) awaySince = Date.now();
        if (inRound && !wasInRound && (placed || Date.now() - awaySince > AWAY_MS)) {
          post({ ggs: 'reset' });
          clearTimeout(pressTimer);
          placed = false;
          status('');
        }
        wasInRound = inRound;
        host.hidden = !inRound;
        if (inRound) layout();
        if (inRound && answer) sendAnswer(ggs.game.roundKey());
      }
      onTick?.(inRound);
    }, 500);

    return {
      post, place, press, status,
      get created() { return !!host; },
      stop() {
        clearInterval(tick);
        clearTimeout(collapseTimer);
        clearTimeout(pressTimer);
        window.removeEventListener('message', onFrameMessage);
        host?.remove();
        hideMap.remove();
      },
    };
  };
})();
