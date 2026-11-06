// core/game.js: which round it is, its location, and the competitive guard. Each test is a
// bug that was hit in a real game.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORE, fakeMaps, makePage, plain } from './page.mjs';

const VIENNA = { lat: 48.21, lng: 16.36 };
const OKINAWA = { lat: 26.38, lng: 127.82 };
const PRETORIA = { lat: -25.63, lng: 27.21 };
const SPOTS = [VIENNA, OKINAWA, PRETORIA];

// A party duel's game data: a snapshot from the start, stuck on round 1 all game.
const partyDuel = () => ({
  status: 'Created',
  currentRoundNumber: 1,
  rounds: SPOTS.map((p, i) => ({ roundNumber: i + 1, panorama: { ...p } })),
});

function duelPage(game = partyDuel) {
  const page = makePage({ path: '/party/lobby/ABC', fetch: url => (url.includes('/duels/') ? game() : {}) });
  page.load(...CORE);
  const maps = fakeMaps(page);
  page.load('src/core/geo.js', 'src/core/game.js');
  // came in through the party lobby, then the duel starts
  page.ggs.game.noteLobby();
  page.go('/duels/D1');
  return { page, maps, game: page.ggs.game };
}

// The guess map goes away (round over) and comes back with the Street View at `spot`.
async function nextRound(page, maps, spot, { panoLate = 0, oldSpot = null } = {}) {
  maps.state.map = false;
  await page.tick(2000);
  maps.state.spot = oldSpot ?? spot;
  maps.state.map = true;
  await page.tick(300);
  if (panoLate) {
    await page.tick(panoLate);
    maps.state.spot = spot;
  }
}

async function locationNow(page, game, wait = 30_000) {
  let got;
  game.roundLocation().then(l => {
    got = l;
  });
  await page.tick(wait);
  return got && plain(got);
}

test('party duel: each round gets its own location, though the game data says round 1 all game', async () => {
  const { page, maps, game } = duelPage();
  maps.state.spot = VIENNA;
  await page.tick(300);
  assert.deepEqual(await locationNow(page, game), VIENNA);
  await nextRound(page, maps, OKINAWA);
  assert.deepEqual(await locationNow(page, game), OKINAWA);
  await nextRound(page, maps, PRETORIA);
  assert.deepEqual(await locationNow(page, game), PRETORIA);
});

test('party duel: a Street View that takes 9 s to move on still gets the new round, never the last one', async () => {
  const { page, maps, game } = duelPage();
  maps.state.spot = VIENNA;
  await page.tick(300);
  assert.deepEqual(await locationNow(page, game), VIENNA);
  await nextRound(page, maps, OKINAWA, { oldSpot: VIENNA });
  let got;
  game.roundLocation().then(l => {
    got = l;
  });
  await page.tick(9000);
  assert.equal(got, undefined, 'still waiting while the Street View shows the last round');
  maps.state.spot = OKINAWA;
  await page.tick(5000);
  assert.deepEqual(plain(got), OKINAWA);
});

test('duel: coming back from spectating after a guess is not a new round', async () => {
  const { page, maps, game } = duelPage();
  maps.state.spot = VIENNA;
  await page.tick(300);
  await locationNow(page, game);
  maps.state.pin = { lat: 1, lng: 1 };
  page.dispatch('click', { target: maps.button });
  await page.tick(3000);
  const key = game.roundKey();
  assert.ok(game.guessed());
  // spectate the other player, then come back: same round on screen
  await nextRound(page, maps, VIENNA);
  await page.tick(6000);
  assert.equal(game.roundKey(), key);
  assert.ok(game.guessed(), 'the board stays hidden and Chaos stays paused');
  // the next round really starts
  await nextRound(page, maps, OKINAWA);
  await page.tick(1000);
  assert.notEqual(game.roundKey(), key);
  assert.ok(!game.guessed());
});

test('a guess press held back by a script does not count as a guess', async () => {
  const { page, maps, game } = duelPage();
  maps.state.spot = VIENNA;
  await page.tick(300);
  maps.state.pin = { lat: 1, lng: 1 };
  // a capture listener that stops the press, as core/aid.js does for Ocean only on land
  page.window.addEventListener('click', e => e.stopImmediatePropagation(), true);
  page.dispatch('click', { target: maps.button });
  await page.tick(100);
  assert.ok(!game.guessed());
});

test('Space only counts as a guess with a pin down', async () => {
  const { page, maps, game } = duelPage();
  maps.state.spot = VIENNA;
  await page.tick(300);
  page.dispatch('keydown', { code: 'Space' });
  assert.ok(!game.guessed());
  maps.state.pin = { lat: 1, lng: 1 };
  page.dispatch('keydown', { code: 'Space' });
  assert.ok(game.guessed());
});

// ---- standard games ----

function standardPage(data) {
  const state = { data, fail: false };
  const page = makePage({
    path: '/game/G1',
    fetch: url => {
      if (state.fail) throw new TypeError('Failed to fetch');
      return url.includes('/api/v3/games/') ? state.data : {};
    },
  });
  page.load(...CORE);
  const maps = fakeMaps(page);
  page.load('src/core/geo.js', 'src/core/game.js');
  return { page, maps, game: page.ggs.game, state };
}
const standard = n => ({
  round: n,
  roundCount: 3,
  map: 'world',
  mapName: 'A Diverse World',
  rounds: SPOTS.map(p => ({ ...p })),
});

test('standard game: the round location is the current round', async () => {
  const { page, maps, game } = standardPage(standard(2));
  maps.state.spot = OKINAWA;
  await page.tick(300);
  assert.deepEqual(await locationNow(page, game), OKINAWA);
});

test('standard game: game data still on the last round at round start is waited out', async () => {
  const { page, maps, game, state } = standardPage(standard(1));
  maps.state.spot = VIENNA;
  await page.tick(300);
  assert.deepEqual(await locationNow(page, game), VIENNA);
  // round 2 starts on screen, but the game data says round 1 for a few seconds
  await nextRound(page, maps, OKINAWA);
  let got;
  game.roundLocation().then(l => {
    got = l;
  });
  await page.tick(3000);
  assert.equal(got, undefined);
  state.data = standard(2);
  await page.tick(3000);
  assert.deepEqual(plain(got), OKINAWA);
});

test('standard game: a location that never matches the Street View is no location, not a wrong one', async () => {
  const { page, maps, game } = standardPage(standard(1));
  maps.state.spot = PRETORIA;
  await page.tick(300);
  assert.equal(await locationNow(page, game), null);
  assert.match(game.whyNoRound(), /GeoGuessr may have changed/);
});

test('a failed round lookup is not kept, so the next one tries again', async () => {
  const { page, maps, game, state } = standardPage(standard(1));
  maps.state.spot = VIENNA;
  await page.tick(300);
  state.fail = true;
  assert.equal(await locationNow(page, game), null);
  assert.match(game.whyNoRound(), /Couldn't reach GeoGuessr/);
  state.fail = false;
  assert.deepEqual(await locationNow(page, game), VIENNA);
});

test('a failed map name lookup is not kept either', async () => {
  const { game, state } = standardPage(standard(1));
  state.fail = true;
  await assert.rejects(game.mapInfo());
  state.fail = false;
  assert.deepEqual(plain(await game.mapInfo()), { id: 'world', name: 'A Diverse World' });
});

// ---- the competitive guard: anything not clearly friendly is competitive ----

async function guard(path, data, { lobby } = {}) {
  const page = makePage({
    path: lobby ?? path,
    fetch: () => {
      if (data === null) throw new TypeError('Failed to fetch');
      return data;
    },
  });
  page.load(...CORE);
  fakeMaps(page);
  page.load('src/core/geo.js', 'src/core/game.js');
  page.ggs.game.noteLobby();
  page.go(path);
  page.ggs.game.noteLobby();
  return plain(await page.ggs.game.competitive());
}

test('competitive guard', async t => {
  await t.test('matchmaking pages', async () => {
    assert.equal((await guard('/ranked', {})).competitive, true);
    assert.equal((await guard('/quick-play/x', {})).competitive, true);
  });
  await t.test('a duel with no sign of a party', async () => {
    assert.equal((await guard('/duels/D1', { rounds: [] })).competitive, true);
  });
  await t.test('a duel reached from the party lobby', async () => {
    assert.equal((await guard('/duels/D1', { rounds: [] }, { lobby: '/party/lobby/X' })).competitive, false);
  });
  await t.test('a duel whose data says party', async () => {
    assert.equal((await guard('/duels/D1', { partyId: 'p1' })).competitive, false);
  });
  await t.test('rated beats the party lobby', async () => {
    const r = await guard('/duels/D1', { isRated: true }, { lobby: '/party/lobby/X' });
    assert.equal(r.competitive, true);
  });
  await t.test('unreadable game data counts as competitive, and is checked again', async () => {
    const r = await guard('/duels/D1', null, { lobby: '/party/lobby/X' });
    assert.equal(r.competitive, true);
    assert.equal(r.retry, true);
  });
  await t.test('the lobby is forgotten on any other page in between', async () => {
    const page = makePage({ path: '/party/lobby/X', fetch: () => ({ rounds: [] }) });
    page.load(...CORE);
    fakeMaps(page);
    page.load('src/core/geo.js', 'src/core/game.js');
    page.ggs.game.noteLobby();
    page.go('/me/profile');
    page.ggs.game.noteLobby();
    page.go('/duels/D2');
    page.ggs.game.noteLobby();
    assert.equal((await page.ggs.game.competitive()).competitive, true);
  });
  await t.test('singleplayer is never blocked', async () => {
    assert.equal((await guard('/game/G1', {})).competitive, false);
  });
});

test('a competitive duel never hands out the round location', async () => {
  const page = makePage({ path: '/duels/R1', fetch: () => partyDuel() });
  page.load(...CORE);
  const maps = fakeMaps(page);
  page.load('src/core/geo.js', 'src/core/game.js');
  maps.state.spot = VIENNA;
  await page.tick(300);
  assert.equal(await locationNow(page, page.ggs.game), null);
  assert.equal(page.ggs.game.whyNoRound(), 'Off in competitive games');
});
