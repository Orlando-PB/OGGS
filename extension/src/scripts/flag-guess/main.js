// Draw the flag: a paint board (app/) over GeoGuessr's guess map, through core/board.js.
// Paint the flag, the board finds the country with the closest flag and shows its outline;
// the spot clicked in it becomes the guess, the board zooms out to the right spot, and
// GeoGuessr's own Guess button is pressed.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_W = 620, AUTO_GUESS_MS = 1500;

  function start(cfg) {
    const board = ggs.board({
      id: 'flag-guess',
      answer: true, // the flag on the right spot after the guess
      app: 'src/scripts/flag-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        const w = Math.min(MAX_W, roomW);
        return { w, h: Math.min(boardH || w * 0.9, roomH) };
      },
      guessDelay: AUTO_GUESS_MS,
    });
    board.post({ ggs: 'strict', on: !!cfg.forceInside });

    return {
      update(next) {
        if (!!next.forceInside !== !!cfg.forceInside) board.post({ ggs: 'strict', on: !!next.forceInside });
        cfg = next;
      },
      stop: board.stop,
    };
  }

  ggs.scripts['flag-guess'] = { start };
})();
