// NMPZ: the three locks in core/lock.js, each switched by its own option.
(() => {
  const ggs = globalThis.__ggs;
  function apply(cfg) {
    ggs.lock.move('nmpz', !!cfg?.noMove);
    ggs.lock.pan('nmpz', !!cfg?.noPan);
    ggs.lock.zoom('nmpz', !!cfg?.noZoom);
  }
  ggs.scripts.nmpz = {
    start(cfg) {
      apply(cfg);
      return { stop() { apply(null); }, update: apply };
    },
  };
})();
