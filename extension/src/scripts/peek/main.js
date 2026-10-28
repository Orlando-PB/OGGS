// Partial view: a paper sheet over Street View (core/view.js) with one hole to look through.
// Each PART is the path of what stays visible in a w x h box. Points E past the edge keep the
// cut's outline out of view. 'dvd' is a window that bounces round the box like an old DVD
// screensaver.
(() => {
  const ggs = globalThis.__ggs;
  const { poly, rect, circle } = ggs.view.shape;
  const E = 40;
  const PARTS = {
    top: (w, h) => poly([[-E, -E], [w + E, -E], [w + E, h / 2], [-E, h / 2]]),
    bottom: (w, h) => poly([[-E, h / 2], [w + E, h / 2], [w + E, h + E], [-E, h + E]]),
    left: (w, h) => poly([[-E, -E], [w / 2, -E], [w / 2, h + E], [-E, h + E]]),
    right: (w, h) => poly([[w / 2, -E], [w + E, -E], [w + E, h + E], [w / 2, h + E]]),
    centre: (w, h) => rect(w * 0.3, h * 0.3, w * 0.4, h * 0.4, 14),
    spyglass: (w, h) => circle(w / 2, h / 2, Math.min(w, h) * 0.28),
    strip: (w, h) => poly([[-E, h * 0.4], [w + E, h * 0.4], [w + E, h * 0.6], [-E, h * 0.6]]),
    // the whole box with the centre put back: a frame you see the edges through
    edges: (w, h) =>
      poly([[-E, -E], [w + E, -E], [w + E, h + E], [-E, h + E]]) + rect(w * 0.2, h * 0.2, w * 0.6, h * 0.6, 14),
    topLeft: (w, h) => poly([[-E, -E], [w + E, -E], [-E, h + E]]),
    topRight: (w, h) => poly([[-E, -E], [w + E, -E], [w + E, h + E]]),
    bottomLeft: (w, h) => poly([[-E, -E], [w + E, h + E], [-E, h + E]]),
    bottomRight: (w, h) => poly([[w + E, -E], [w + E, h + E], [-E, h + E]]),
  };
  const NAMES = [...Object.keys(PARTS), 'dvd'];
  // window size as a share of the box, and speed in px per second along each axis
  const DVD = { w: 0.32, h: 0.3, speed: 160 };

  // The bouncing window: moves by the time since the last frame and turns back at each edge.
  function dvd() {
    let x = null, y = 0, dx = 1, dy = 1, last = 0;
    return (w, h) => {
      const now = performance.now();
      // capped, so it doesn't jump after the tab was hidden
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const ww = w * DVD.w, wh = h * DVD.h;
      if (x == null) {
        x = Math.random() * (w - ww);
        y = Math.random() * (h - wh);
      }
      x += dx * DVD.speed * dt;
      y += dy * DVD.speed * dt;
      if (x < 0 || x > w - ww) {
        dx = -dx;
        x = Math.max(0, Math.min(w - ww, x));
      }
      if (y < 0 || y > h - wh) {
        dy = -dy;
        y = Math.max(0, Math.min(h - wh, y));
      }
      return rect(x, y, ww, wh, 14);
    };
  }

  function start(cfg) {
    let part = cfg.part, round = null, randomPart = null;
    const pick = () => {
      if (part !== 'random') return part;
      const now = ggs.game.roundKey();
      if (now !== round) {
        round = now;
        randomPart = NAMES[Math.floor(Math.random() * NAMES.length)];
      }
      return randomPart;
    };
    const bounce = dvd();
    const cut = (w, h) => (pick() === 'dvd' ? bounce : PARTS[pick()] ?? PARTS.top)(w, h);
    const mask = ggs.view.mask({ over: 'pano', look: 'paper', cut });
    return { stop: mask.stop, update(next) { part = next.part; } };
  }
  ggs.scripts.peek = { start };
})();
