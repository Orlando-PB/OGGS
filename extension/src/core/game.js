// Which game is open, on which map, and whether it's competitive. Reads geoguessr.com's
// own game API with the player's session. Nothing is sent anywhere else.
(() => {
  const ggs = globalThis.__ggs;

  const ROUTES = [
    [/\/game\/([^/?#]+)/, 'standard', t => `/api/v3/games/${t}`],
    [/\/challenge\/([^/?#]+)/, 'challenge', t => `/api/v3/challenges/${t}`],
    [/\/(?:team-)?duels\/([^/?#]+)/, 'duels', t => `https://game-server.geoguessr.com/api/duels/${t}`],
    [
      /\/battle-royale\/([^/?#]+)/,
      'battle-royale',
      t => `https://game-server.geoguessr.com/api/battle-royale/${t}`,
    ],
  ];

  // Party games play under /party/... without the game id in the address. The id is taken
  // from the page's last request to /api/v4/parties/v2/<party>/game/<id> or the duels API.
  // This only reads the browser's own list of requests the page made.
  const DUEL_REQUEST = /geoguessr\.com\/api\/(?:v4\/parties\/v2\/[^/]+\/game|(?:team-)?duels)\/([^/?#]+)/;
  let partyDuel = null;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const m = e.name.match(DUEL_REQUEST);
        if (m) partyDuel = m[1];
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {}

  function context() {
    for (const [re, mode, api] of ROUTES) {
      const m = location.pathname.match(re);
      if (m) return { mode, token: m[1], api: api(m[1]) };
    }
    if (partyDuel && /^\/party(\/|$)/.test(location.pathname)) {
      const api = `https://game-server.geoguessr.com/api/duels/${partyDuel}`;
      return { mode: 'duels', token: partyDuel, api };
    }
    return null;
  }
  const fetchGame = async ctx => {
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  // Standard games have { map: "<id>", mapName }, challenges { map: { name } },
  // duels { options: { map } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') {
      return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    }
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }
  // token -> Promise<{ id, name } | null>
  const mapCache = new Map();
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!mapCache.has(ctx.token)) mapCache.set(ctx.token, fetchGame(ctx).then(pickMap));
    return mapCache.get(ctx.token);
  }

  // The current round is the game token plus how many times the guess map has appeared.
  // GeoGuessr's round counter markup keeps changing, so it isn't read. The map can blink out
  // for a moment mid-round, so it only counts as gone after GONE_MS.
  const GONE_MS = 1000;
  let entries = 0;
  let entryToken = null;
  let hadMap = false;
  let goneSince = 0;
  setInterval(() => {
    const token = context()?.token ?? null;
    const hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) {
      entryToken = token;
      entries = 0;
      hadMap = false;
      holding = false;
      ggs.debug(`round key reset: token ${token}`);
    }
    if (hasMap) {
      onMap();
      hadMap = true;
      goneSince = 0;
    } else if (hadMap) {
      goneSince ||= Date.now();
      if (Date.now() - goneSince > GONE_MS) hadMap = false;
    }
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // The guess map coming back is a new round, except in a duel the player has already guessed
  // in. There it's back from spectating the other player, so the round only moves on once the
  // Street View is at a different round of the game.
  let holding = false;
  function onMap() {
    if (hadMap && !holding) return;
    const held = sameGuessedRound();
    if (!hadMap) holding = held;
    if (held) return;
    holding = false;
    entries++;
    ggs.debug(`round key ${roundKey()}`);
  }

  // The round the player guessed in: { key, n } (n is the duel round, when known).
  let guessedIn = null;
  const guessed = () => guessedIn?.key === roundKey();
  const sameGuessedRound = () => guessed() && guessedIn.n != null && spotRound() === guessedIn.n;

  // A guess: GeoGuessr's Guess button clicked (by the player or a board), or Space with a
  // pin down. Disabled buttons get no clicks. Heard as the event bubbles out, so a press that
  // core/aid.js held back (a beforeGuess hook: Ocean only, Lag's slow guess) doesn't count.
  addEventListener('click', e => {
    if (ggs.maps.guessButton()?.contains(e.target)) noteGuess();
  });
  addEventListener('keydown', e => {
    if (e.code === 'Space' && !ggs.isTyping(e) && ggs.maps.lastGuess()) noteGuess();
  });
  async function noteGuess() {
    const key = roundKey();
    guessedIn = { key, n: spotRound() };
    const ctx = context();
    if (guessedIn.n != null || ctx?.mode !== 'duels') return;
    // No round list yet (no script has asked for the location), so fetch it.
    duelList = { token: ctx.token, rounds: (await fetchGame(ctx).catch(() => null))?.rounds ?? [] };
    if (guessedIn.key === key) guessedIn.n = spotRound();
  }

  // { n, total, lat, lng } in standard games and friendly party duels. total is null in duels,
  // which run until someone's out. Scripts may use the location for gameplay (draw-guess's
  // boost, radio's station pick, core/aid.js) but never show it before the guess. Duels only
  // answer once competitive() has confirmed a friendly game, so ranked duels never get one.
  // One lookup per round, shared by every script so they all agree. A failed lookup isn't
  // kept, so the next call tries again. whyNoRound() says why it failed, in words for the
  // player. Nothing is guessed: a location that can't be confirmed is no location, since a
  // wrong one would quietly spoil the round.
  // roundKey -> Promise<round | null>
  const roundCache = new Map();
  let noRoundWhy = '';
  function round() {
    const key = roundKey();
    if (!roundCache.has(key)) {
      roundCache.set(
        key,
        lookupRound(key).then(
          r => {
            if (!r) roundCache.delete(key);
            return r;
          },
          err => {
            roundCache.delete(key);
            return broken(`game data: ${err.message}`);
          },
        ),
      );
    }
    return roundCache.get(key);
  }
  const whyNoRound = () => noRoundWhy;
  const noRound = why => {
    noRoundWhy = why;
    ggs.log(`no round location: ${why}`);
    return null;
  };
  // Not one of the expected cases (not in a game, competitive...): GeoGuessr has most likely
  // changed its game data, which needs a fix.
  const broken = why => {
    noRound("Couldn't read this round's location. GeoGuessr may have changed something, please tell Orlando");
    ggs.log(`round location broken: ${why}`);
    return null;
  };

  // Lookups that wait on the Street View try once a second this many times.
  const TRIES = 20;
  // token -> Map(round number -> the roundKey it was handed out for).
  const duelRounds = new Map();
  // How far the Street View can be from a round's location and still be that round
  // (the player may have moved a little before the lookup).
  const SAME_SPOT_KM = 50;
  // { token, rounds }: the last duel round list fetched.
  let duelList = null;

  async function lookupRound(key) {
    const ctx = context();
    if (!ctx) return noRound('Not in a game');
    if (ctx.mode === 'standard') return standardRound(ctx, key);
    if (ctx.mode !== 'duels') return noRound(`Not available in ${ctx.mode} games`);
    if ((await competitive()).competitive) return noRound('Off in competitive games');
    return duelRound(ctx, key);
  }

  // The game data names the round, and its location must be where the Street View is. At a
  // round's start the panorama can still be the last round's for a moment, so it's waited on.
  async function standardRound(ctx, key) {
    const j = await fetchGame(ctx);
    const n = j?.round;
    const cur = j?.rounds?.[n - 1];
    if (!(n > 0) || typeof cur?.lat !== 'number' || typeof cur?.lng !== 'number') {
      return broken('standard game data has no current round');
    }
    for (let tries = 0; tries < TRIES; tries++) {
      if (roundKey() !== key) return noRound('Moved on while waiting');
      const spot = streetViewSpot();
      // No Street View position to check against: the game data's own round number stands.
      if (!spot || ggs.geo.distance(spot, cur) <= SAME_SPOT_KM) {
        return { n, total: j.roundCount, lat: cur.lat, lng: cur.lng };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return broken(`round ${n} is not where the Street View is`);
  }

  // Duel rounds are found by place, not by currentRoundNumber. In party duels the game data
  // is a snapshot from when the game was made: status "Created" and currentRoundNumber 1 all
  // game, with every round's location listed up front. So the round is the listed one nearest
  // the Street View on screen. At a round's start the panorama can still be the last round's
  // for a moment, so a round already handed out for an earlier roundKey is waited on, up to
  // TRIES times. After that there's no location rather than an old round's.
  async function duelRound(ctx, key) {
    let found = { why: 'no duel data' };
    let j;
    for (let tries = 0; tries < TRIES; tries++) {
      if (roundKey() !== key) return noRound('Moved on while waiting');
      // The round list only needs fetching again if no round matched (a live duel lists
      // each round as it starts). Waiting on the Street View is then just a position check.
      if (!found.round) {
        j = await fetchGame(ctx);
        duelList = { token: ctx.token, rounds: j?.rounds ?? [] };
      }
      found = duelRoundAt(streetViewSpot(), j, ctx.token, key);
      if (found.round && !found.stale) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    ggs.debug(`duel lookup for ${key}: round ${found.round?.n} stale=${!!found.stale}`);
    return handOut(found, ctx.token, key);
  }

  function handOut({ round, why, stale }, token, key) {
    if (!round) return broken(why);
    if (stale) return broken(`duel round ${round.n} was already played`);
    if (!duelRounds.has(token)) duelRounds.set(token, new Map());
    duelRounds.get(token).set(round.n, key);
    return round;
  }

  // The duel round the Street View is at, from the round list, or null.
  function spotRound() {
    const spot = streetViewSpot();
    if (!spot || duelList?.token !== context()?.token) return null;
    const best = nearestRound(spot, duelList.rounds);
    return best && best.km <= SAME_SPOT_KM ? best.n : null;
  }

  // Where the Street View on screen is.
  function streetViewSpot() {
    const p = ggs.maps.panorama()?.getPosition();
    return p ? { lat: p.lat(), lng: p.lng() } : null;
  }

  // The listed duel round nearest the Street View: { round, stale } or { why }. stale means
  // it was handed out for an earlier roundKey.
  function duelRoundAt(spot, j, token, key) {
    if (!spot) return { why: 'no Street View position yet' };
    const best = nearestRound(spot, j?.rounds ?? []);
    if (!best || best.km > SAME_SPOT_KM) return { why: 'no duel round near the Street View' };
    const was = duelRounds.get(token)?.get(best.n);
    const stale = was !== undefined && was !== key;
    return { round: { n: best.n, total: null, lat: best.lat, lng: best.lng }, stale };
  }

  // { n, lat, lng, km } of the round whose location is nearest spot, or null.
  function nearestRound(spot, rounds) {
    let best = null;
    for (const r of rounds) {
      const p = r.panorama ?? r;
      if (typeof p?.lat !== 'number') continue;
      const km = ggs.geo.distance(spot, p);
      if (!best || km < best.km) best = { n: r.roundNumber, lat: p.lat, lng: p.lng, km };
    }
    return best;
  }

  const roundLocation = () =>
    round().then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  // ---- competitive guard ----
  // Party and ranked duels share /duels/<id> URLs, so two signals decide. One is the lobby you
  // came through (/party or /join vs matchmaking pages), the other is party/rated fields in the
  // game data. Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

  function noteLobby(path = location.pathname) {
    const lobby = PARTY_PAGES.test(path) ? 'party' : COMPETITIVE_PAGES.test(path) ? 'competitive' : null;
    if (!lobby) return;
    try {
      sessionStorage.setItem(LOBBY_KEY, lobby);
    } catch {}
  }

  function readLobby() {
    try {
      return sessionStorage.getItem(LOBBY_KEY);
    } catch {
      return null;
    }
  }

  // The rated and party signs in the game data, wherever GeoGuessr has put them.
  function gameSigns(j) {
    const o = j?.options ?? {};
    const types = [j?.gameContext?.type, o.gameContext?.type];
    const flags = [j?.isRated, o.isRated, j?.competitive, o.competitive, j?.isRanked, o.isRanked];
    const ids = [j?.partyId, o.partyId, j?.party, j?.lobbyId, o.lobbyId, j?.gameContext?.partyId];
    return {
      rated: flags.some(v => v === true) || types.some(t => /rank|competitive|matchmak/i.test(t ?? '')),
      party: ids.some(Boolean) || types.some(t => /party|private|friend/i.test(t ?? '')),
    };
  }

  // Without game data nothing is confirmed, so it counts as competitive (and isn't kept, so
  // the next check tries again).
  async function checkGame(ctx) {
    const lobby = readLobby();
    const j = await fetchGame(ctx).catch(() => null);
    if (!j) return { competitive: true, why: `${ctx.mode}: no game data`, retry: true };
    const { rated, party } = gameSigns(j);
    const why = `${ctx.mode}: lobby=${lobby ?? '?'} party-field=${party} rated-field=${rated}`;
    if (rated) return { competitive: true, why };
    return { competitive: !(party || lobby === 'party'), why };
  }

  // token -> Promise<{ competitive, why }>
  const guardCache = new Map();
  function competitive() {
    const path = location.pathname;
    if (COMPETITIVE_PAGES.test(path)) {
      return Promise.resolve({ competitive: true, why: 'matchmaking page' });
    }
    const ctx = context();
    if (!ctx || ctx.mode === 'standard' || ctx.mode === 'challenge') {
      return Promise.resolve({ competitive: false, why: ctx ? `${ctx.mode} game` : 'not in a game' });
    }
    if (!guardCache.has(ctx.token)) {
      const check = checkGame(ctx);
      guardCache.set(ctx.token, check);
      check.then(c => c.retry && guardCache.delete(ctx.token));
    }
    return guardCache.get(ctx.token);
  }

  ggs.game = { context, roundKey, guessed, whyNoRound, mapInfo, roundLocation, competitive, noteLobby };
})();
