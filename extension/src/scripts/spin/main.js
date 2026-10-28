// Spinning view: the Street View picture turns clockwise (core/view.js). It's scaled up by the
// box's diagonal over its short side so no corner shows. A speed change carries on from the
// current angle.
(() => {
  const ggs = globalThis.__ggs;
  // seconds per turn for each step of the Speed slider (1-10)
  const SECS = [120, 90, 75, 60, 40, 25, 15, 8, 4, 2];

  function start(cfg) {
    // base: degrees turned before `from`
    let speed = cfg.speed, from = performance.now(), base = 0;
    const angle = now => (base + (now - from) * 360 / (SECS[speed - 1] ?? 60) / 1000) % 360;
    ggs.view.effect('spin', {
      transform(now, w, h) {
        const grow = Math.hypot(w, h) / Math.max(1, Math.min(w, h));
        return `rotate(${angle(now).toFixed(2)}deg) scale(${grow.toFixed(3)})`;
      },
    });
    return {
      stop() { ggs.view.effect('spin', null); },
      update(next) {
        const now = performance.now();
        base = angle(now);
        from = now;
        speed = next.speed;
      },
    };
  }
  ggs.scripts.spin = { start };
})();
