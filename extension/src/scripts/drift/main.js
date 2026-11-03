// Drifting map: the guess map's centre moves a little every frame, in a direction that wanders
// slowly and turns back near the top or bottom of the world. setCenter doesn't animate, so frames
// don't cancel each other. Zoom is locked where it was (GeoGuessr's values put back after), which
// makes it harder and stops the moving centre fighting Google's zoom animation.
(() => {
  const ggs = globalThis.__ggs;
  // screen pixels per frame
  const SPEED = [0.6, 1.4, 3, 5.5, 9];
  const LOCK = ['minZoom', 'maxZoom', 'scrollwheel', 'disableDoubleClickZoom', 'zoomControl'];

  ggs.scripts.drift = ggs.aid('drift', {
    usesLocation: false,
    attach(ctx) {
      // This map, not ctx.map: by the time cleanup runs, ctx.map may already be the next one.
      const map = ctx.map;
      let angle = Math.random() * 2 * Math.PI;
      let frame;
      const saved = Object.fromEntries(LOCK.map(k => [k, map.get(k)]));
      const z0 = map.getZoom();
      map.setOptions({
        minZoom: z0,
        maxZoom: z0,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        zoomControl: false,
      });
      const step = () => {
        frame = requestAnimationFrame(step);
        const c = map.getCenter();
        const z = map.getZoom();
        if (!c || z == null) return;
        angle += (Math.random() - 0.5) * 0.15;
        // turn back near the poles (screen y points down)
        if ((c.lat() > 60 && Math.sin(angle) < 0) || (c.lat() < -50 && Math.sin(angle) > 0)) angle = -angle;
        const v = SPEED[ctx.cfg.speed] ?? SPEED[1];
        const deg = 360 / (256 * 2 ** z); // degrees of longitude per pixel
        map.setCenter({
          lat: c.lat() - v * Math.sin(angle) * deg * Math.cos((c.lat() * Math.PI) / 180),
          lng: c.lng() + v * Math.cos(angle) * deg,
        });
      };
      frame = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(frame);
        map.setOptions(saved);
      };
    },
  });
})();
