// Latitude band: a strip right round the world between two latitudes (core/aid.js).
(() => {
  const ggs = globalThis.__ggs, { aid } = ggs;
  // the map's Mercator edge
  const clamp = lat => Math.max(-85, Math.min(85, lat));

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#1c7ed6',
    shapes({ loc, rand, cfg }) {
      const [a, b] = aid.band(loc.lat, rand(), cfg.size, 90).map(clamp);
      return [...aid.box(a, b, -180, 180), aid.latLine(a), aid.latLine(b)];
    },
    // for Terrible hints: any size from 5 km to the hemisphere
    random: r => ({ size: 1 + Math.floor(r() * 8) }),
  };
  aid.hints['lat-band'] = hint;
  ggs.scripts['lat-band'] = aid('lat-band', hint);
})();
