// Compass lock: every panorama faces the chosen compass direction, level, and can't be turned
// (core/lock.js's pan lock at that heading). Moving still works.
(() => {
  const ggs = globalThis.__ggs;
  const HEADING = { n: 0, e: 90, s: 180, w: 270 };
  const face = cfg => ggs.lock.face('compass', cfg ? (HEADING[cfg.dir] ?? 0) : null);
  ggs.scripts.compass = {
    start(cfg) {
      face(cfg);
      return { update: face, stop: () => face(null) };
    },
  };
})();
