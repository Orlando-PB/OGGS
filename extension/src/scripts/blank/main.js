// Blank screen: a dark sheet over the window (core/view.js) with one hole round the guess map
// and its Guess button. The hole follows the map as it grows on hover. Only shown during a round,
// and OGGS's own tab and panels sit above it.
(() => {
  const ggs = globalThis.__ggs;
  const PAD = 2;

  function cut() {
    const r = ggs.view.guessArea();
    return r && ggs.view.shape.rect(r.left - PAD, r.top - PAD, r.width + 2 * PAD, r.height + 2 * PAD, 12);
  }
  ggs.scripts.blank = { start: () => ggs.view.mask({ over: 'screen', look: 'night', cut }) };
})();
