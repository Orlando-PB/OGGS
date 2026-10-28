// Draw your country: a drawing board (app/) over GeoGuessr's guess map, through core/board.js.
// Sketch the country and pin your spot, and the board snaps the drawing onto the closest real
// country. The pin becomes the guess, and a few seconds after the animation GeoGuessr's own Guess
// button is pressed.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_H = 640;
  const AUTO_GUESS_MS = 6000;

  function start(cfg) {
    let lastToken;

    const board = ggs.board({
      id: 'draw-guess',
      // for the boost, and the flag on the right spot after the guess
      answer: true,
      app: 'src/scripts/draw-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        // the board is 52px taller than it is wide
        const h = Math.min(MAX_H, roomH);
        const w = Math.min(h - 52, roomW);
        return { w, h: boardH ? Math.min(boardH, roomH) : h };
      },
      guessDelay: AUTO_GUESS_MS,
      onMessage(d) {
        if (d.ggs !== 'pool') return;
        ggs.debug(`draw-guess: map "${d.map}" -> ${d.pool} (${d.how}): ${d.count} countries possible`);
      },
      onTick(inRound) {
        if (!inRound || !board.created) return;
        const token = ggs.game.context()?.token;
        if (token === lastToken) return;
        // new game: pick the country pool from the map name
        lastToken = token;
        ggs.game
          .mapInfo()
          .then(m =>
            m?.name
              ? board.post({ ggs: 'map', name: m.name })
              : ggs.debug('draw-guess: no map name, using world coverage'),
          )
          .catch(err => ggs.log('draw-guess: could not read the map, using world coverage', err));
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
