// Draw your country: a drawing board (app/) over GeoGuessr's guess map, through core/board.js.
// Sketch the country, pin your spot, and the board snaps the drawing onto the closest real
// country; the pin becomes the guess, and a few seconds after the animation GeoGuessr's own
// Guess button is pressed.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_H = 640, AUTO_GUESS_MS = 3000;

  function start(cfg) {
    let lastToken;

    const board = ggs.board({
      id: 'draw-guess',
      answer: true, // for the boost, and the flag on the right spot after the guess
      app: 'src/scripts/draw-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        const h = Math.min(MAX_H, roomH), w = Math.min(h - 52, roomW); // the board is 52px taller than wide
        return { w, h: boardH ? Math.min(boardH, roomH) : h };
      },
      guessDelay: AUTO_GUESS_MS,
      onMessage(d) {
        if (d.ggs === 'pool') ggs.debug(`draw-guess: map "${d.map}" -> ${d.pool} (${d.how}): ${d.count} countries possible`);
      },
      onTick(inRound) {
        if (!inRound || !board.created) return;
        const token = ggs.game.context()?.token;
        if (token !== lastToken) { // new game: pick the country pool from the map name
          lastToken = token;
          ggs.game.mapInfo()
            .then(m => (m?.name ? board.post({ ggs: 'map', name: m.name }) : ggs.debug('draw-guess: no map name, using world coverage')))
            .catch(err => ggs.log('draw-guess: could not read the map, using world coverage', err));
        }
      },
    });
    board.post({ ggs: 'hard', on: !!cfg.hardMode });

    return {
      update(next) {
        if (!!next.hardMode !== !!cfg.hardMode) board.post({ ggs: 'hard', on: !!next.hardMode });
        cfg = next;
      },
      stop: board.stop,
    };
  }

  ggs.scripts['draw-guess'] = { start };
})();
