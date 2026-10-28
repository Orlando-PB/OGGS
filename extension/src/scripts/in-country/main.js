// Guess in a country: the guess map shows one country (draw-guess's geo.json outlines) with the
// rest of the world greyed out, and the whole world squashed into it. Rows of the country map to
// rows of the world (north to south), and along each row the country's land, gaps skipped, maps
// to -180..180. So a pin in the west of Australia is a guess in the Americas. Clicks outside the
// country take the pin off again. On Guess the pin moves to the world spot it stands for
// (core/aid.js beforeGuess). The round timer running out guesses the unmoved pin.
(() => {
  const ggs = globalThis.__ggs;
  // The world's latitudes that are squashed in: Tierra del Fuego to Greenland.
  const WORLD_S = -56, WORLD_N = 84;
  const ROWS = 2048; // the country's rows cached for squashing the world outlines
  const MAX_STEP = 1; // degrees: world edges are split this fine before squashing, so they bend
  const GREY = '#dee2e6';
  const rad = Math.PI / 180;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2));
  const fromMercY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / rad;
  const names = () => Object.fromEntries(ggs.registry.find(m => m.id === 'in-country').options[0].choices
    .map(c => [c.value, c.label]));

  // Land pieces under this share of the country's biggest are left out (greyed like the rest of
  // the world): Australia's Macquarie and Heard Islands would otherwise stretch its rows to
  // -54 degrees and hold the whole southern world.
  const MIN_PIECE = 0.005;
  // Square degrees: smaller islands of the squashed world are left out, as clutter.
  const MIN_WORLD_PIECE = 1;
  const area = ring => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    return Math.abs(a / 2) * Math.cos(ring[0][1] * rad);
  };

  // A country's shape for squashing: its main pieces (polys, as in geo.json) and their rings in
  // [lng, mercator y], with pieces on the far side of ±180 shifted by 360 so the country is one
  // piece (Russia, Fiji, the Aleutians...).
  function shapeOf(all) {
    const biggest = Math.max(...all.map(([outer]) => area(outer)));
    const polys = all.filter(([outer]) => area(outer) >= MIN_PIECE * biggest);
    const rings = polys.flat();
    const span = list => {
      const xs = list.flat().map(p => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    const mean = r => r.reduce((s, p) => s + p[0], 0) / r.length;
    const shift = by => rings.map(r => (Math.sign(mean(r)) === -Math.sign(by) ? r.map(([x, y]) => [x + by, y]) : r));
    let best = rings;
    if (span(rings) > 180) best = [shift(360), shift(-360)].sort((a, b) => span(a) - span(b))[0];
    const merc = best.map(r => r.map(([x, y]) => [x, mercY(y)]));
    const ys = merc.flat().map(p => p[1]), xs = best.flat().map(p => p[0]);
    return {
      polys, rings: merc, y0: Math.min(...ys), y1: Math.max(...ys),
      bounds: { south: Math.min(...best.flat().map(p => p[1])), north: Math.max(...best.flat().map(p => p[1])),
        west: Math.min(...xs), east: Math.max(...xs) },
      rowCache: new Map(),
    };
  }

  // Where the row at mercator y crosses the country: [[west, east], ...] (even-odd), and their length.
  function row(shape, y) {
    const xs = [];
    for (const r of shape.rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xa, ya] = r[i], [xb, yb] = r[j];
        if ((ya > y) !== (yb > y)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    const segs = [];
    let length = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      segs.push([xs[i], xs[i + 1]]);
      length += xs[i + 1] - xs[i];
    }
    return { segs, length };
  }

  // The nearest row with some land, a little inside the country's top and bottom.
  function rowAt(shape, t) {
    const i = Math.round(Math.min(1, Math.max(0, t)) * (ROWS - 1));
    if (!shape.rowCache.has(i)) {
      let r = null;
      for (let d = 0; d < ROWS && !r?.length; d++) {
        for (const k of [i - d, i + d]) {
          if (k < 0 || k >= ROWS || r?.length) continue;
          r = row(shape, shape.y0 + ((k + 0.5) / ROWS) * (shape.y1 - shape.y0));
          r.y = shape.y0 + ((k + 0.5) / ROWS) * (shape.y1 - shape.y0);
        }
      }
      shape.rowCache.set(i, r);
    }
    return shape.rowCache.get(i);
  }

  const wrap = lng => ((lng + 540) % 360) - 180;

  // A world spot to its place in the country.
  function squash(shape, lat, lng) {
    const t = (Math.min(WORLD_N, Math.max(WORLD_S, lat)) - WORLD_S) / (WORLD_N - WORLD_S);
    const r = rowAt(shape, t);
    let left = ((lng + 180) / 360) * r.length;
    for (const [a, b] of r.segs) {
      if (left <= b - a) return { lat: fromMercY(r.y), lng: wrap(a + left) };
      left -= b - a;
    }
    const last = r.segs[r.segs.length - 1];
    return { lat: fromMercY(r.y), lng: wrap(last[1]) };
  }

  // A pin in the country to the world spot it stands for. null outside the country.
  function unsquash(shape, lat, lng) {
    const y = mercY(lat);
    const t = (y - shape.y0) / (shape.y1 - shape.y0);
    if (t < 0 || t > 1) return null;
    const { segs, length } = row(shape, y);
    let before = 0;
    for (const x of [lng, lng + 360, lng - 360]) {
      before = 0;
      for (const [a, b] of segs) {
        if (x >= a && x <= b) {
          return { lat: WORLD_S + t * (WORLD_N - WORLD_S), lng: -180 + ((before + x - a) / length) * 360 };
        }
        before += b - a;
      }
    }
    return null;
  }

  // Split long edges so a squashed edge bends with the rows it crosses.
  function densify(ring) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / MAX_STEP));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    return out;
  }

  // GeoJSON for the map: grey over everything but the country, its outline, and the squashed world.
  function features(geo, code, shape, world) {
    const own = shape.polys;
    const ring = r => [...r, r[0]];
    // The grey goes right round the world from the country's far side, in steps under 180
    // degrees since Google Maps joins two points the short way. A hair at the far side is left.
    const b = shape.bounds, c = (b.west + b.east) / 2;
    const sea = [-179.9, -90, 0, 90, 179.9].map(d => [wrap(c + d), 85])
      .concat([179.9, 90, 0, -90, -179.9].map(d => [wrap(c + d), -85]));
    sea.push(sea[0]);
    const out = [
      { type: 'Feature', properties: { kind: 'mask' },
        geometry: { type: 'Polygon', coordinates: [sea, ...own.map(([outer]) => ring(outer))] } },
      // the country's own holes (lakes, Lesotho) stay grey
      ...own.flatMap(([, ...holes]) => holes.map(h => ({ type: 'Feature', properties: { kind: 'mask' },
        geometry: { type: 'Polygon', coordinates: [ring(h)] } }))),
      { type: 'Feature', properties: { kind: 'outline' },
        geometry: { type: 'MultiLineString', coordinates: own.flat().map(ring) } },
    ];
    if (world) {
      const land = Object.values(geo).flatMap(polys => polys.map(([outer]) => outer))
        .filter(r => area(r) >= MIN_WORLD_PIECE && r.some(([, lat]) => lat > WORLD_S && lat < WORLD_N))
        .map(r => ring(densify(r).map(([lng, lat]) => {
          const p = squash(shape, lat, lng);
          return [p.lng, p.lat];
        })));
      out.push({ type: 'Feature', properties: { kind: 'world' },
        geometry: { type: 'MultiPolygon', coordinates: land.map(r => [r]) } });
    }
    return { type: 'FeatureCollection', features: out };
  }

  // The grey goes over the squashed world, which hides where a squashed shape jumps a gap
  // between two parts of the country (a bay, the strait to Tasmania).
  const STYLES = {
    world: { fillColor: '#ffffff', fillOpacity: 0.45, strokeColor: '#1c1a2e', strokeWeight: 1, strokeOpacity: 0.55,
      zIndex: 1 },
    mask: { fillColor: GREY, fillOpacity: 0.94, strokeWeight: 0, zIndex: 2 },
    outline: { strokeColor: '#1c1a2e', strokeWeight: 2, strokeOpacity: 0.9, zIndex: 3 },
  };

  const shapes = new Map(); // code -> shape
  const shape = (geo, code) => shapes.get(code) ?? shapes.set(code, shapeOf(geo[code])).get(code);

  // Random each round: a country at least this many square degrees (no Vatican), the same one
  // for everyone in the round and after a reload.
  const MIN_RANDOM_AREA = 20;
  let big = null;
  function countryFor(geo, cfg) {
    if (cfg.country !== 'random') return geo[cfg.country] ? cfg.country : 'AUS';
    big ??= Object.keys(geo).sort().filter(c => {
      const b = shape(geo, c).bounds;
      return (b.east - b.west) * (b.north - b.south) >= MIN_RANDOM_AREA;
    });
    const r = ggs.aid.seeded(`in-country|${ggs.game.context()?.token}|${ggs.game.roundKey()}`)();
    return big[Math.floor(r * big.length)];
  }

  ggs.scripts['in-country'] = ggs.aid('in-country', {
    usesLocation: false,
    attach(ctx) {
      const map = ctx.map;
      const before = { restriction: map.get('restriction') ?? null };
      ctx.drawn = '';
      return () => {
        ctx.layer?.setMap(null);
        ctx.layer = null;
        map.setOptions(before);
      };
    },
    round(ctx) {
      ctx.pin = null;
      ctx.drawn = '';
      ctx.guessed = false;
      // switched on mid-round: a pin already down may be anywhere, so it comes off
      if (!ctx.cleared) {
        ctx.cleared = true;
        ggs.maps.clearGuess();
      }
    },
    tick(ctx) {
      const want = `${ggs.game.roundKey()}|${ctx.cfg.country}|${ctx.cfg.world}`;
      if (ctx.guessed || ctx.drawn === want || ctx.loading) return;
      ctx.loading = true;
      ggs.aid.loadGeo().then(geo => {
        ctx.loading = false;
        if (ctx.guessed || !ctx.map) return;
        const code = countryFor(geo, ctx.cfg);
        const s = shape(geo, code);
        const gm = ctx.gm;
        ctx.layer?.setMap(null);
        ctx.layer = new gm.Data({ map: ctx.map });
        ctx.layer.addGeoJson(features(geo, code, s, ctx.cfg.world));
        ctx.layer.setStyle(f => ({ ...STYLES[f.getProperty('kind')], clickable: false }));
        const b = s.bounds, padLat = (b.north - b.south) * 0.6, padLng = (b.east - b.west) * 0.6;
        ctx.map.setOptions({ restriction: { strictBounds: false, latLngBounds: {
          south: Math.max(-85, b.south - padLat), north: Math.min(85, b.north + padLat),
          west: wrap(b.west - padLng), east: wrap(b.east + padLng) } } });
        ctx.map.fitBounds({ south: b.south, north: b.north, west: wrap(b.west), east: wrap(b.east) }, 10);
        ctx.code = code;
        ctx.shape = s;
        ctx.drawn = want;
      }, () => {
        ctx.loading = false;
        ctx.status("Couldn't load the country outlines");
      });
    },
    click(latLng, ctx) {
      if (!ctx.shape || ctx.guessed) return;
      const lat = latLng.lat(), lng = latLng.lng();
      const p = unsquash(ctx.shape, lat, lng);
      ctx.pin = p;
      if (p) return ctx.note('');
      // wait until GeoGuessr has placed the pin
      setTimeout(() => ggs.maps.clearGuess());
      ctx.note(`Guess inside ${names()[ctx.code] ?? ctx.code}!`);
      clearTimeout(ctx.noteTimer);
      ctx.noteTimer = setTimeout(() => ctx.note(''), 2000);
    },
    beforeGuess(ctx) {
      if (!ctx.shape) return null;
      if (!ctx.pin) {
        ctx.note(`Put a pin inside ${names()[ctx.code] ?? ctx.code}`);
        return false;
      }
      // the guess goes out on the real world map, so the country view comes off
      ctx.guessed = true;
      ctx.layer?.setMap(null);
      ctx.map.setOptions({ restriction: null });
      return ctx.pin;
    },
    stop(ctx) {
      clearTimeout(ctx.noteTimer);
      // a pin in the country isn't a real guess
      if (ctx.pin && !ctx.guessed) ggs.maps.clearGuess();
    },
  });
})();
