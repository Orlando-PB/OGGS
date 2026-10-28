// Inverted controls: keys, dragging and zoom on Street View go the other way (core/view.js's
// mirrored input). With Flipped view on as well, the two cancel out where they overlap.
(() => {
  const ggs = globalThis.__ggs;
  const flips = c => ({ move: c.move, turn: c.turn, zoom: c.zoom, dragX: c.drag, dragY: c.drag });
  ggs.scripts.reverse = {
    start(cfg) {
      ggs.view.mirror('reverse', flips(cfg));
      return {
        update: c => ggs.view.mirror('reverse', flips(c)),
        stop: () => ggs.view.mirror('reverse', null),
      };
    },
  };
})();
