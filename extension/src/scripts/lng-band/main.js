// Longitude band: a strip from pole to pole between two longitudes (core/aid.js).
(() => {
  const ggs = globalThis.__ggs, { aid } = ggs;

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#ae3ec9',
    shapes({ loc, rand, cfg }) {
      const [a, b] = aid.band(loc.lng, rand(), cfg.size, 180);
      return [...aid.box(-85, 85, a, b), aid.lngLine(a), aid.lngLine(b)];
    },
    // for Terrible hints: any size from 5 km to the hemisphere
    random: r => ({ size: 1 + Math.floor(r() * 8) }),
  };
  aid.hints['lng-band'] = hint;
  ggs.scripts['lng-band'] = aid('lng-band', hint);
})();
