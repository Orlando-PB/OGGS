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
    }
    if (hasMap) {
      if (!hadMap) entries++;
      hadMap = true;
      goneSince = 0;
    } else if (hadMap) {
      goneSince ||= Date.now();
      if (Date.now() - goneSince > GONE_MS) hadMap = false;
    }
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // { n, total, lat, lng } in standard games and friendly party duels. total is null in duels,
  // which run until someone's out. Scripts may use the location for gameplay (draw-guess's
  // boost, radio's station pick, core/aid.js) but never show it before the guess. Duels only
  // answer once competitive() has confirmed a friendly game, so ranked duels never get one.
  // One lookup per round, shared by every script so they all agree. A failed lookup isn't
  // kept, so the next call tries again. whyNoRound() says why it failed.
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
            return noRound(`game data: ${err.message}`);
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

  const DUEL_TRIES = 8;
  // token -> { n, key }: the last duel round handed out, and for which roundKey.
  const duelRounds = new Map();

  async function lookupRound(key) {
    const ctx = context();
    if (!ctx) return noRound('not in a game');
    if (ctx.mode === 'standard') {
      const j = await fetchGame(ctx);
      const n = j?.round ?? j?.rounds?.length;
      const cur = j?.rounds?.[n - 1];
      if (!(n > 0)) return noRound('standard game data has no current round');
      return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
    }
    if (ctx.mode !== 'duels') return noRound(`${ctx.mode} games aren't supported`);
    if ((await competitive()).competitive) return noRound('competitive game');
    // The new round can reach the game data a few seconds after the guess map appears.
    // Until then currentRoundNumber still names the round just played. So a round that has
    // ended, or was already handed out for an earlier round, is waited on. After DUEL_TRIES
    // it's taken anyway, since the roundKey can move on without a new round (e.g. a reload).
    let last = null;
    for (let tries = 0; tries < DUEL_TRIES; tries++) {
      if (tries) await new Promise(r => setTimeout(r, 1000));
      if (roundKey() !== key) return noRound('moved on while waiting');
      const j = await fetchGame(ctx);
      const n = j?.currentRoundNumber;
      const cur = j?.rounds?.find(r => r.roundNumber === n);
      const p = cur?.panorama ?? cur;
      if (!(n > 0) || typeof p?.lat !== 'number') {
        last = `duel data has no location for round ${n}`;
        continue;
      }
      const ended = cur.endTime && Date.parse(cur.endTime) < Date.now();
      const seen = duelRounds.get(ctx.token);
      last = { n, total: null, lat: p.lat, lng: p.lng };
      if (ended || (seen && seen.n >= n && seen.key !== key)) {
        if (tries === DUEL_TRIES - 1) ggs.log(`duel round ${n} still looks old, using it anyway`);
        continue;
      }
      break;
    }
    if (typeof last === 'string' || !last) return noRound(last ?? 'no duel data');
    duelRounds.set(ctx.token, { n: last.n, key });
    return last;
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
    if (!guardCache.has(ctx.token))
      guardCache.set(
        ctx.token,
        (async () => {
          let lobby = null;
          try {
            lobby = sessionStorage.getItem(LOBBY_KEY);
          } catch {}
          const j = await fetchGame(ctx).catch(() => null);
          const o = j?.options ?? {};
          const types = [j?.gameContext?.type, o.gameContext?.type];
          const rated =
            [j?.isRated, o.isRated, j?.competitive, o.competitive, j?.isRanked, o.isRanked].some(
              v => v === true,
            ) || types.some(t => /rank|competitive|matchmak/i.test(t ?? ''));
          const party =
            [j?.partyId, o.partyId, j?.party, j?.lobbyId, o.lobbyId, j?.gameContext?.partyId].some(Boolean) ||
            types.some(t => /party|private|friend/i.test(t ?? ''));
          const why =
            `${ctx.mode}: lobby=${lobby ?? '?'} party-field=${party} rated-field=${rated}` +
            (j ? '' : ' (no game data)');
          if (rated) return { competitive: true, why };
          return { competitive: !(party || lobby === 'party'), why };
        })(),
      );
    return guardCache.get(ctx.token);
  }

  ggs.game = { context, roundKey, whyNoRound, mapInfo, roundLocation, competitive, noteLobby };
})();
