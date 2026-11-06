// core/geo.js geometry and in-country/rows.js, on the real country outlines.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORE, makePage, read } from './page.mjs';

const geoData = JSON.parse(read('extension/src/scripts/draw-guess/app/data/geo.json'));
const page = makePage().load(...CORE, 'src/core/geo.js', 'src/scripts/in-country/rows.js');
const geo = page.ggs.geo;
const rows = page.ggs.countryRows;

test('distance: London to Paris is about 344 km', () => {
  const km = geo.distance({ lat: 51.507, lng: -0.128 }, { lat: 48.857, lng: 2.352 });
  assert.ok(Math.abs(km - 344) < 3, `${km}`);
});

test('seeded: the same seed gives the same stream, so a reload draws the same hint', () => {
  const a = geo.seeded('x');
  const b = geo.seeded('x');
  const c = geo.seeded('y');
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([c(), c(), c()], first);
});

test('band: every size holds the spot and sits inside the bigger ones', () => {
  for (let s = 0; s < 50; s++) {
    const x = ((s * 37) % 170) - 85;
    let outer = [-Infinity, Infinity];
    for (let i = 7; i >= 0; i--) {
      const [lo, hi] = geo.band(x, geo.seeded(`b${s}`), i, 90);
      assert.ok(lo <= x && x <= hi, `band ${i} misses ${x}`);
      assert.ok(lo >= outer[0] - 1e-9 && hi <= outer[1] + 1e-9, `band ${i} pokes out`);
      outer = [lo, hi];
    }
  }
});

test('circle: every size holds the spot', () => {
  for (let s = 0; s < 50; s++) {
    const loc = { lat: ((s * 13) % 160) - 80, lng: ((s * 71) % 360) - 180 };
    for (let i = 0; i < 7; i++) {
      const { center, km } = geo.circle(loc, geo.seeded(`c${s}`), i);
      assert.ok(geo.distance(center, loc) <= km, `circle ${i} misses`);
    }
  }
});

test('covers: polygons across the date line and circles', () => {
  const fiji = {
    type: 'Polygon',
    paths: [
      { lat: -20, lng: 175 },
      { lat: -15, lng: 175 },
      { lat: -15, lng: 185 },
      { lat: -20, lng: 185 },
    ],
  };
  assert.ok(geo.covers([fiji], { lat: -17, lng: -178 }));
  assert.ok(!geo.covers([fiji], { lat: -17, lng: 170 }));
  const circle = { type: 'Circle', center: { lat: 0, lng: 0 }, radius: 100_000 };
  assert.ok(geo.covers([circle], { lat: 0.5, lng: 0 }));
  assert.ok(!geo.covers([circle], { lat: 1.5, lng: 0 }));
});

test('countryAt: a few known spots', () => {
  assert.equal(geo.countryAt(geoData, { lat: 48.86, lng: 2.35 }), 'FRA');
  assert.equal(geo.countryAt(geoData, { lat: -33.87, lng: 151.21 }), 'AUS');
  assert.equal(geo.countryAt(geoData, { lat: 0, lng: -30 }), null, 'mid-Atlantic is no country');
});

// Even-odd over every ring of the country, also one turn of the globe either way.
function inCountry(polys, { lat, lng }) {
  const rings = polys.flat();
  const inside = (x, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return [lng, lng - 360, lng + 360].some(x => rings.filter(r => inside(x, r)).length % 2 === 1);
}

// Guess in a country and Guess on Jack: wherever the player clicks, the guess lands on land
// in that country.
test('rows: every spot along every row is inside the country', () => {
  const missed = [];
  for (const [code, polys] of Object.entries(geoData)) {
    const shape = rows.shapeOf(polys);
    for (let t = 0.05; t < 1; t += 0.15) {
      for (let f = 0.05; f < 1; f += 0.15) {
        const p = rows.alongRow(rows.rowAt(shape, t), f);
        if (!inCountry(shape.polys, p)) missed.push(`${code} t=${t.toFixed(2)} f=${f.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(missed, []);
});

test("rows: Australia's far-off islands don't stretch its rows south", () => {
  const shape = rows.shapeOf(geoData.AUS);
  assert.ok(shape.bounds.south > -45, `${shape.bounds.south}`);
});
