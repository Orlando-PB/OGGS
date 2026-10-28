// Geometry for map aids: seeded random streams, nested bands and circles, lat/lng boxes and
// lines, distances, country outlines and lookups. aid.js puts all of these on ggs.aid, which is
// where scripts use them (ggs.aid.distance and so on):
//   seeded(str) -> rand(): a random stream seeded by a string.
//   band(x, rand, index, half) -> [lo, hi]: a band holding x, nested in the bigger ones.
//   circle(loc, rand, index) -> { center, km }: a circle holding loc, nested the same way.
//   box(s, n, w, e), latLine(lat), lngLine(lng) -> shape specs.
//   destination(spot, km, bearing), distance(a, b) km, on a sphere.
//   loadGeo() -> Promise of country outlines. countryAt(geo, spot, { near }) -> code | null.
//   covers(specs, spot): whether any drawn shape holds the spot.
(() => {
  const ggs = globalThis.__ggs;
  const KM_PER_DEG = 111.32;
  const EARTH_KM = 6371;
  // km. The band sliders' marks, then the hemisphere.
  const BANDS = [0, 5, 25, 50, 100, 500, 1000, 2500];
  // km. The radius slider's first marks.
  const RADII = [5, 25, 50, 100, 500, 1000, 2500];

  // A seeded random stream (FNV-1a into mulberry32). Seeded by the game, the round's location
  // and the script, so a reload draws the same shapes and can't be used to average them out.
  function seeded(str) {
    let a = 2166136261;
    for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Every size's band is placed biggest first, each inside the one before and all holding x.
  // So moving the slider mid-round tells you no more than the thinnest band you looked at.
  // The biggest is the hemisphere, 0 to ±half. x, half and the result are in degrees.
  // Widths are km along the axis. For longitude that's at the equator, so a band's width
  // can't give the latitude away.
  function band(x, rand, index, half) {
    let lo = x < 0 ? -half : 0;
    let hi = lo + half;
    for (let i = BANDS.length - 1; i >= index; i--) {
      const w = BANDS[i] / KM_PER_DEG;
      const min = Math.max(lo, x - w);
      const max = Math.min(hi - w, x);
      lo = min + rand() * (max - min);
      hi = lo + w;
    }
    return [lo, hi];
  }

  // The same nesting for circles. Each centre is within 95% of its radius of the location, and
  // close enough to the bigger circle's centre to sit inside it. Offsets are km east and north.
  // If 50 tries miss, the point on the line from the bigger centre towards the location fits.
  function circle(loc, rand, index) {
    let c = [0, 0];
    let room = Infinity;
    for (let i = RADII.length - 1; i >= index; i--) {
      const r = 0.95 * RADII[i];
      let p = null;
      for (let t = 0; t < 50 && !p; t++) {
        const d = r * Math.sqrt(rand());
        const a = 2 * Math.PI * rand();
        const q = [d * Math.sin(a), d * Math.cos(a)];
        if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= room) p = q;
      }
      if (!p) {
        const d = Math.hypot(...c);
        const k = Math.max(0, 1 - room / d);
        p = [c[0] * k, c[1] * k];
      }
      c = p;
      room = RADII[i] - (RADII[i - 1] ?? 0);
    }
    return { center: destination(loc, Math.hypot(...c), Math.atan2(c[0], c[1])), km: RADII[index] };
  }

  // A lat/lng box as unstroked pieces at most 90 degrees wide, since Google Maps takes the
  // short way between two points. latLine and lngLine draw edges over the joins.
  function box(s, n, w, e) {
    const out = [];
    for (let x = w; x < e; x += 90) {
      const x2 = Math.min(e, x + 90);
      const paths = [
        { lat: s, lng: x },
        { lat: n, lng: x },
        { lat: n, lng: x2 },
        { lat: s, lng: x2 },
      ];
      out.push({ type: 'Polygon', strokeWeight: 0, paths });
    }
    return out;
  }
  const latLine = lat => ({ type: 'Polyline', path: [-180, -90, 0, 90, 180].map(lng => ({ lat, lng })) });
  const lngLine = lng => ({
    type: 'Polyline',
    path: [
      { lat: -85, lng },
      { lat: 85, lng },
    ],
  });

  // The point km away from a spot along a bearing (radians from north), on a sphere.
  function destination({ lat, lng }, km, bearing) {
    const rad = Math.PI / 180;
    const d = km / EARTH_KM;
    const p1 = lat * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(bearing));
    const l2 =
      lng * rad +
      Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
  }

  // Great-circle distance in km.
  function distance(a, b) {
    const rad = Math.PI / 180;
    const h =
      Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Country outlines from draw-guess's geo.json (code -> [[outer ring, ...holes], ...] in
  // [lng, lat]). Fetched once, the first time a script asks.
  let geo = null;
  const loadGeo = () =>
    (geo ??= fetch(`${ggs.extBase}src/scripts/draw-guess/app/data/geo.json`)
      .then(r => r.json())
      .catch(err => {
        geo = null;
        throw err;
      }));

  function inside([x, y], ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  const holds = ([outer, ...holes], pt) => inside(pt, outer) && !holes.some(h => inside(pt, h));
  function boxArea(ring) {
    const xs = ring.map(p => p[0]);
    const ys = ring.map(p => p[1]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }

  // The country with the smallest outline (by its bounding box) holding the spot.
  function smallestHolding(geo, { lat, lng }) {
    let best = null;
    let bestArea = Infinity;
    for (const [code, polys] of Object.entries(geo)) {
      for (const poly of polys) {
        const area = holds(poly, [lng, lat]) ? boxArea(poly[0]) : Infinity;
        if (area < bestArea) {
          bestArea = area;
          best = code;
        }
      }
    }
    return best;
  }

  // The country with an outline vertex nearest the spot, within ~1.5 degrees.
  function nearest(geo, { lat, lng }) {
    let near = null;
    let nearD = 1.5 ** 2;
    const k = Math.cos((lat * Math.PI) / 180);
    for (const [code, polys] of Object.entries(geo)) {
      for (const [outer] of polys) {
        for (const [x, y] of outer) {
          const d = ((x - lng) * k) ** 2 + (y - lat) ** 2;
          if (d < nearD) {
            nearD = d;
            near = code;
          }
        }
      }
    }
    return near;
  }

  // Which country a spot is in: the smallest outline holding it. Failing that, with `near`,
  // the nearest vertex within ~1.5 degrees. That catches coastal roads outside the simplified
  // coastlines.
  function countryAt(geo, spot, { near: useNear = true } = {}) {
    return smallestHolding(geo, spot) ?? (useNear ? nearest(geo, spot) : null);
  }

  // Whether any drawn shape holds a spot. Polygons by even-odd, also one turn of the globe
  // either way for pieces drawn past ±180. Circles by distance.
  function covers(specs, p) {
    return specs.some(s => {
      if (s.type === 'Circle') return distance(s.center, p) <= s.radius / 1000;
      if (s.type !== 'Polygon') return false;
      const rings = (s.paths[0]?.lat === undefined ? s.paths : [s.paths]).map(r =>
        r.map(q => [q.lng, q.lat]),
      );
      return [p.lng, p.lng - 360, p.lng + 360].some(
        x => rings.filter(r => inside([x, p.lat], r)).length % 2 === 1,
      );
    });
  }

  ggs.geo = {
    seeded,
    band,
    circle,
    box,
    latLine,
    lngLine,
    destination,
    distance,
    loadGeo,
    countryAt,
    covers,
  };
})();
