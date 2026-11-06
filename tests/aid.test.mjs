// core/aid.js: map aids drawing on the guess map, and the guess presses they hold back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORE, fakeGoogle, fakeMaps, makePage, read } from './page.mjs';

// A page with a fake game: each round is a key and a real location.
function aidPage() {
  const geo = JSON.parse(read('extension/src/scripts/draw-guess/app/data/geo.json'));
  const page = makePage({ fetch: url => (url.endsWith('geo.json') ? geo : {}) });
  page.load(...CORE);
  page.ggs.extBase = 'https://ext/';
  const maps = fakeMaps(page);
  const round = { key: 'G|1', loc: { lat: 51.5, lng: -0.12 } };
  page.ggs.game = {
    roundKey: () => round.key,
    roundLocation: async () => round.loc,
    whyNoRound: () => '',
    context: () => ({ token: 'G' }),
  };
  page.load('src/core/geo.js', 'src/core/aid.js');
  const google = fakeGoogle(page);
  return { page, maps, round, google, ggs: page.ggs };
}

test('Show area: a small circle and its ring never show at once, and they swap as soon as the zoom changes', async () => {
  const { page, maps, google, ggs } = aidPage();
  const aid = ggs.aid('t', { shapes: ctx => [{ type: 'Circle', center: ctx.loc, radius: 50_000 }] });
  aid.start({});
  await page.tick(1000);
  for (let zoom = 1; zoom <= 14; zoom++) {
    maps.state.zoom = zoom;
    // no waiting for the next tick
    google.fire('zoom_changed');
    const circles = google.shown('Circle').length;
    const rings = google.shown('Marker').length;
    assert.equal(circles + rings, 1, `zoom ${zoom}: ${circles} circles, ${rings} rings`);
  }
  maps.state.zoom = 2;
  google.fire('zoom_changed');
  assert.deepEqual([google.shown('Circle').length, google.shown('Marker').length], [0, 1]);
  maps.state.zoom = 12;
  google.fire('zoom_changed');
  assert.deepEqual([google.shown('Circle').length, google.shown('Marker').length], [1, 0]);
});

// Lying hints: a lie must leave the real location out, or the truth is told instead.
async function playRounds(radius, n = 12) {
  const { page, round, google, ggs } = aidPage();
  const seen = [];
  const aid = ggs.aid('t', {
    lies: true,
    shapes: ctx => [{ type: 'Circle', center: ctx.loc, radius }],
  });
  aid.start({});
  for (let i = 0; i < n; i++) {
    round.key = `G|${i}`;
    round.loc = { lat: -40 + i * 7, lng: -170 + i * 29 };
    await page.tick(3000);
    const [c] = google.shown('Circle');
    seen.push({
      real: { ...round.loc },
      center: { ...c.center },
      covers: ggs.aid.covers([{ type: 'Circle', center: c.center, radius }], round.loc),
    });
  }
  return seen;
}

test('Terrible hints: a lie never covers the real location', async () => {
  const seen = await playRounds(300_000);
  const lies = seen.filter(s => s.center.lat !== s.real.lat || s.center.lng !== s.real.lng);
  assert.ok(lies.length > 0, 'some rounds lie');
  assert.ok(lies.length < seen.length, 'some rounds tell the truth');
  for (const s of seen) {
    const lying = lies.includes(s);
    assert.equal(
      s.covers,
      !lying,
      `a ${lying ? 'lie' : 'truth'} that ${s.covers ? 'covers' : 'misses'} the answer`,
    );
  }
});

test('Terrible hints: when every lie would cover the answer, the truth is told', async () => {
  // a circle bigger than the world covers everything
  for (const s of await playRounds(25_000_000, 6)) {
    assert.ok(s.covers);
    assert.deepEqual(s.center, s.real);
  }
});

test('a beforeGuess hook that throws holds back one press, then lets the player guess', async () => {
  const { page, maps, ggs } = aidPage();
  ggs
    .aid('t', {
      usesLocation: false,
      beforeGuess: () => {
        throw new Error('boom');
      },
    })
    .start({});
  await page.tick(500);
  assert.equal(page.dispatch('click', { target: maps.button }).stopped, true);
  assert.equal(page.dispatch('click', { target: maps.button }).stopped, false);
});

test('a hook that blocks the guess holds it back and says so to the boards', async () => {
  const { page, maps, ggs } = aidPage();
  ggs.aid('t', { usesLocation: false, beforeGuess: () => false }).start({});
  await page.tick(500);
  const t = page.now();
  assert.equal(page.dispatch('click', { target: maps.button }).stopped, true);
  assert.ok(ggs.aid.heldSince(t));
});

test('a hook that moves the guess puts the pin there, then presses Guess itself', async () => {
  const { page, maps, ggs } = aidPage();
  ggs.aid('t', { usesLocation: false, beforeGuess: () => ({ lat: 10, lng: 20 }) }).start({});
  await page.tick(500);
  assert.equal(page.dispatch('click', { target: maps.button }).stopped, true);
  await page.tick(200);
  assert.deepEqual({ ...maps.state.pin }, { lat: 10, lng: 20 });
  assert.equal(maps.state.presses, 1);
});

test('held Space repeats are swallowed, so they cannot slip past a hook', async () => {
  const { page, maps, ggs } = aidPage();
  ggs.aid('t', { usesLocation: false, beforeGuess: () => null }).start({});
  await page.tick(500);
  maps.state.pin = { lat: 1, lng: 1 };
  assert.equal(page.dispatch('keydown', { code: 'Space', repeat: true }).stopped, true);
});

test('shift-click is "remove the pin", not a new pin', async () => {
  const { page, google, ggs } = aidPage();
  const calls = [];
  ggs
    .aid('t', {
      usesLocation: false,
      click: () => calls.push('click'),
      unpin: () => calls.push('unpin'),
    })
    .start({});
  await page.tick(500);
  google.fire('click', { latLng: {}, domEvent: { shiftKey: true } });
  google.fire('click', { latLng: {}, domEvent: { shiftKey: false } });
  assert.deepEqual(calls, ['unpin', 'click']);
});

test('stopping an aid takes its shapes off the map', async () => {
  const { page, google, ggs } = aidPage();
  const aid = ggs.aid('t', { shapes: ctx => [{ type: 'Circle', center: ctx.loc, radius: 5e6 }] }).start({});
  await page.tick(2000);
  assert.ok(google.shown().length > 0);
  aid.stop();
  assert.equal(google.shown().length, 0);
});
