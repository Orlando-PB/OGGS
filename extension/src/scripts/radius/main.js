// Area: a circle the round's location is somewhere inside (core/aid.js), or the whole country or
// continent it's in (draw-guess's geo.json). The country steps can add decoys from the same
// continent, picked with the seeded stream so a reload shows the same ones.
(() => {
  const ggs = globalThis.__ggs;
  const ring = r => r.map(([lng, lat]) => ({ lat, lng }));

  function decoys(pool, real, n, rand) {
    const rest = pool.filter(c => c !== real).sort();
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return rest.slice(0, Math.max(0, n));
  }

  const hint = {
    // its own colour, so it's told apart from other hints (Terrible hints uses it too)
    colour: '#2b8a3e',
    async shapes({ loc, rand, cfg, status }) {
      // slider stops: 0 continent, 1-5 five down to one country, 6-12 circles from 2500 down to 5 km
      const area = cfg.area ?? 8, continentOnly = area === 0;
      if (area >= 6) {
        const { center, km } = ggs.aid.circle(loc, rand(), 12 - area);
        // core/aid.js adds a ring round it when it's tiny on screen
        return [{ type: 'Circle', center, radius: km * 1000 }];
      }
      const geo = await ggs.aid.loadGeo(), code = ggs.aid.countryAt(geo, loc);
      if (!code) {
        status('Not in any country this round');
        return [];
      }
      const continent = Object.keys(geo).filter(c => ggs.CONTINENTS[c] === ggs.CONTINENTS[code]);
      const codes = continentOnly ? continent : [code, ...decoys(continent, code, 5 - area, rand())];
      // a continent is many countries: fill only, so its inner borders don't show
      return codes.map(c => ({
        type: 'Polygon',
        paths: geo[c].flat().map(ring),
        ...(continentOnly && { strokeWeight: 0 }),
      }));
    },
    // for Terrible hints: any stop, from continent to a 5 km circle
    random: r => ({ area: Math.floor(r() * 13) }),
  };
  ggs.aid.hints.radius = hint;
  ggs.scripts.radius = ggs.aid('radius', hint);
})();
