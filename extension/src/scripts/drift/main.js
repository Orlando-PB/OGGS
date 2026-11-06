// Drifting map: the guess map keeps sliding round in a slow loop. The centre goes round a circle
// about the spot the player is looking at, so the same few map tiles stay on screen and nothing
// new has to load while it drifts. Dragging the map still works: the loop follows to the new
// spot. Zoom is locked where it was (GeoGuessr's values put back after), which makes it harder
// and stops the moving centre fighting Google's zoom animation.
(() => {
  const ggs = globalThis.__ggs;
  // the loop's radius as a share of the map's smaller side, and seconds per lap, by the slider
  const RADIUS = 0.3;
  const LAP_S = [24, 14, 8, 5, 3];
  // a centre further than this (px) from where it was put was moved by the player
  const DRAGGED_PX = 2;
  const LOCK = ['minZoom', 'maxZoom', 'scrollwheel', 'disableDoubleClickZoom', 'zoomControl'];

  ggs.scripts.drift = ggs.aid('drift', {
    usesLocation: false,
    attach(ctx) {
      // This map, not ctx.map: by the time cleanup runs, ctx.map may already be the next one.
      const map = ctx.map;
      const saved = Object.fromEntries(LOCK.map(k => [k, map.get(k)]));
      const z0 = map.getZoom();
      map.setOptions({
        minZoom: z0,
        maxZoom: z0,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        zoomControl: false,
      });
      const loop = makeLoop(map, () => LAP_S[ctx.cfg.speed] ?? LAP_S[1]);
      let frame = requestAnimationFrame(function step(now) {
        frame = requestAnimationFrame(step);
        loop(now);
      });
      return () => {
        cancelAnimationFrame(frame);
        map.setOptions(saved);
      };
    },
  });

  // Moves the map's centre round a circle about `home`, in screen pixels at the locked zoom.
  // home starts at the centre the map had, and moves with the player's drags.
  function makeLoop(map, lapSeconds) {
    let home = null;
    let put = null;
    let angle = Math.random() * 2 * Math.PI;
    let last = 0;
    return now => {
      const c = map.getCenter();
      const z = map.getZoom();
      const div = map.getDiv();
      if (!c || z == null || !div) return;
      const px = 256 * 2 ** z; // world width in pixels
      const at = { x: ((c.lng() + 180) / 360) * px, y: mercY(c.lat()) * px };
      home = follow(home, put, at, px);
      angle += ((now - (last || now)) / 1000 / lapSeconds()) * 2 * Math.PI;
      last = now;
      const r = RADIUS * Math.min(div.clientWidth, div.clientHeight);
      put = { x: home.x + r * Math.cos(angle), y: home.y + r * Math.sin(angle) };
      map.setCenter({ lat: fromMercY(put.y / px), lng: (put.x / px) * 360 - 180 });
    };
  }
  // The loop's centre: where it was, moved by however far the player dragged the map since.
  // Across ±180 Google wraps the centre round, which isn't a drag.
  function follow(home, put, at, px) {
    if (!home) return at;
    const dx = ((((at.x - put.x) % px) + 1.5 * px) % px) - px / 2;
    const dy = at.y - put.y;
    if (Math.hypot(dx, dy) <= DRAGGED_PX) return home;
    return { x: home.x + dx, y: home.y + dy };
  }

  // Web Mercator y in 0..1 (top to bottom) and back, so circles stay round on screen.
  const mercY = lat => {
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const fromMercY = y => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
})();
