// Flipped view: a CSS transform on the Street View picture, with the controls flipped to match
// (core/view.js): the mouse is mirrored round the view's centre, so dragging follows the cursor
// and click-to-move goes where you clicked, and a mirrored view swaps the turn keys.
(() => {
  const ggs = globalThis.__ggs;
  const FLIPS = { mirror: [true, false], upside: [false, true] };
  function apply(cfg) {
    const [x, y] = cfg ? FLIPS[cfg.flip] ?? FLIPS.mirror : [];
    ggs.view.effect('flip', cfg && { transform: `scale(${x ? -1 : 1}, ${y ? -1 : 1})` });
    ggs.view.mirror('flip', cfg && { flipX: x, flipY: y, turn: x });
  }
  ggs.scripts.flip = { start(cfg) { apply(cfg); return { update: apply, stop: () => apply(null) }; } };
})();
