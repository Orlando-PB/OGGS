// core/board.js: the drawing boards' guess going through GeoGuessr's hidden map, and
// core/boot.js starting and stopping scripts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORE, fakeGoogle, fakeMaps, makePage, plain } from './page.mjs';

// A board over a standard game, with the app's messages sent up by hand.
function boardPage() {
  const page = makePage({ path: '/game/G1' });
  page.load(...CORE);
  const ggs = page.ggs;
  ggs.extBase = 'https://ext/';
  ggs.html = () => {};
  const maps = fakeMaps(page);
  let guessed = false;
  maps.state.onPress = () => {
    guessed = true;
  };
  page.load('src/core/geo.js', 'src/core/aid.js', 'src/core/board.js');
  fakeGoogle(page);
  ggs.game = {
    roundKey: () => 'G|1',
    guessed: () => guessed,
    roundLocation: async () => ({ lat: 1, lng: 2 }),
    whyNoRound: () => '',
    context: () => ({ token: 'G' }),
  };
  const board = ggs.board({
    id: 'b',
    app: 'app/index.html',
    size: () => ({ w: 400, h: 300 }),
    guessDelay: 100,
  });
  return { page, maps, board, ggs };
}
// The board's iframe, once the board is up.
async function frame(page) {
  await page.tick(600);
  const host = page.window.document.body.children.find(el => el.shadowRoot);
  return host.shadowRoot.querySelector('iframe').contentWindow;
}
const up = (page, win, data) => page.dispatch('message', { origin: 'https://ext', source: win, data });

test('board: the guess goes in once, with no more presses after it', async () => {
  const { page, maps } = boardPage();
  const win = await frame(page);
  up(page, win, { ggs: 'ready' });
  up(page, win, { ggs: 'guess', guess: { lat: 5, lng: 6 } });
  assert.deepEqual({ ...maps.state.pin }, { lat: 5, lng: 6 });
  assert.deepEqual(plain(win.sent.at(-1)), { ggs: 'placed', ok: true });
  up(page, win, { ggs: 'done' });
  await page.tick(10_000);
  assert.equal(maps.state.presses, 1);
});

test('board: a Guess button that only appears late is pressed when it does', async () => {
  const { page, maps } = boardPage();
  const win = await frame(page);
  up(page, win, { ggs: 'ready' });
  up(page, win, { ggs: 'guess', guess: { lat: 5, lng: 6 } });
  maps.state.button = false;
  up(page, win, { ggs: 'done' });
  await page.tick(1200);
  maps.state.button = true;
  await page.tick(10_000);
  assert.equal(maps.state.presses, 1);
});

test('board: a press held back by a script (Ocean only on land) stops the board, it does not freeze or loop', async () => {
  const { page, maps, ggs } = boardPage();
  ggs.aid('ocean', { usesLocation: false, beforeGuess: () => false }).start({});
  const win = await frame(page);
  up(page, win, { ggs: 'ready' });
  up(page, win, { ggs: 'guess', guess: { lat: 5, lng: 6 } });
  up(page, win, { ggs: 'done' });
  await page.tick(10_000);
  assert.equal(maps.state.presses, 1);
  // the player can still press again once they've moved the pin
  up(page, win, { ggs: 'retry' });
  await page.tick(1000);
  assert.equal(maps.state.presses, 2);
});

test('board: no Guess button at all says so, and tries Space', async () => {
  const { page, maps } = boardPage();
  const win = await frame(page);
  up(page, win, { ggs: 'ready' });
  up(page, win, { ggs: 'guess', guess: { lat: 5, lng: 6 } });
  maps.state.button = false;
  up(page, win, { ggs: 'done' });
  await page.tick(10_000);
  assert.ok(maps.state.spaces > 0);
  assert.equal(win.sent.at(-1).ggs, 'failed');
});

test('board: never presses into the next round', async () => {
  const { page, maps } = boardPage();
  const win = await frame(page);
  up(page, win, { ggs: 'ready' });
  up(page, win, { ggs: 'guess', guess: { lat: 5, lng: 6 } });
  maps.state.button = false;
  up(page, win, { ggs: 'done' });
  await page.tick(300);
  maps.state.map = false;
  await page.tick(2000);
  maps.state.map = true;
  maps.state.button = true;
  await page.tick(10_000);
  assert.equal(maps.state.presses, 0);
});

test('board: stays hidden after the guess, even when the guess map comes back', async () => {
  const { page, maps } = boardPage();
  await frame(page);
  const host = page.window.document.body.children.find(el => el.shadowRoot);
  assert.equal(host.hidden, false);
  maps.state.onPress();
  await page.tick(1000);
  assert.equal(host.hidden, true);
});

// ---- boot.js ----

function bootPage(path, gameData) {
  const page = makePage({
    path,
    fetch: () => {
      if (gameData === 'pending') return new Promise(() => {});
      return gameData;
    },
  });
  page.load(...CORE);
  fakeMaps(page);
  page.load('src/core/geo.js', 'src/core/game.js');
  const ggs = page.ggs;
  const running = new Set();
  const fake = (id, extra = {}) => {
    ggs.registry.push({ id, name: id, defaultEnabled: false, options: [], ...extra });
    ggs.scripts[id] = {
      start() {
        if (extra.throws) throw new Error('boom');
        running.add(id);
        return { stop: () => running.delete(id) };
      },
    };
  };
  return { page, ggs, running, fake, start: () => page.load('src/boot.js') };
}

test('boot: scripts start and stop with their settings', async () => {
  const { page, running, fake, start } = bootPage('/game/G1', {});
  fake('a');
  start();
  page.settings({ a: { enabled: true } });
  await page.tick(100);
  assert.deepEqual([...running], ['a']);
  page.settings({ a: { enabled: false } });
  await page.tick(100);
  assert.deepEqual([...running], []);
});

test('boot: a duel that might be ranked runs nothing until it is known to be friendly', async () => {
  const { page, running, fake, start } = bootPage('/duels/D1', 'pending');
  fake('a');
  start();
  page.settings({ a: { enabled: true } });
  await page.tick(3000);
  assert.deepEqual([...running], []);
});

test('boot: a ranked duel stops everything', async () => {
  const { page, running, fake, start } = bootPage('/duels/D1', { isRated: true });
  fake('a');
  start();
  page.settings({ a: { enabled: true } });
  await page.tick(3000);
  assert.deepEqual([...running], []);
});

test('boot: scripts that exclude each other never run together, and one failing start breaks nothing else', async () => {
  const { page, running, fake, start } = bootPage('/game/G1', {});
  fake('a', { excludes: ['b'] });
  fake('b');
  fake('c', { throws: true });
  fake('d');
  start();
  page.settings({ a: { enabled: true }, b: { enabled: true }, c: { enabled: true }, d: { enabled: true } });
  await page.tick(100);
  assert.deepEqual([...running].sort(), ['a', 'd']);
});
