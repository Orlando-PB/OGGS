// Which game is open and which map it's being played on. Best effort: each mode has
// its own endpoint and response shape. First step towards auto-picking a country
// pool from the map (e.g. a Europe map only suggests European countries).
(() => {
  const ggs = globalThis.__ggs;

  const ROUTES = [
    [/\/game\/([^/?#]+)/, 'standard', t => `/api/v3/games/${t}`],
    [/\/challenge\/([^/?#]+)/, 'challenge', t => `/api/v3/challenges/${t}`],
    [/\/(?:team-)?duels\/([^/?#]+)/, 'duels', t => `https://game-server.geoguessr.com/api/duels/${t}`],
    [/\/battle-royale\/([^/?#]+)/, 'battle-royale', t => `https://game-server.geoguessr.com/api/battle-royale/${t}`],
  ];

  function context() {
    for (const [re, mode, api] of ROUTES) {
      const m = location.pathname.match(re);
      if (m) return { mode, token: m[1], api: api(m[1]) };
    }
    return null;
  }

  // Standard games have { map: "<id>", mapName }, challenges { map: { name, ... } },
  // duels { options: { map: { name, slug } } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }

  const cache = new Map(); // token -> Promise<{id, name} | null>
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!cache.has(ctx.token)) {
      cache.set(ctx.token, fetch(ctx.api, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(pickMap));
    }
    return cache.get(ctx.token);
  }

  // Identifies the current round: game token + how often the guess map has appeared in
  // this game. GeoGuessr's HUD markup changes (its round counter went in 2026), so the
  // page isn't read for this at all.
  let entries = 0, entryToken = null, hadMap = false;
  setInterval(() => {
    const token = context()?.token ?? null, hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) { entryToken = token; entries = 0; hadMap = false; }
    if (hasMap && !hadMap) entries++;
    hadMap = hasMap;
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // The current round (standard games only): { n, total, lat, lng }. Scripts may use the
  // location for gameplay (draw-guess's nudge, radio's station pick) but must never show,
  // log or place it before the player has guessed.
  async function round() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    const n = j.round ?? j.rounds?.length, cur = j?.rounds?.[n - 1];
    if (!(n > 0)) return null;
    return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
  }
  const roundLocation = () => round().then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  // Whether the game is over (standard games only): { finished, round, roundCount }.
  async function state() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    const finished = j.state === 'finished' || (j.roundCount > 0 && j.player?.guesses?.length >= j.roundCount);
    return { finished, round: j.round, roundCount: j.roundCount };
  }

  // ---- competitive guard ----
  // Ranked/competitive games must never run scripts; friendly party games may. Party and
  // ranked duels share /duels/<id> URLs, so two signals decide:
  //   - the lobby you came through: /party or /join (friendly) vs matchmaking pages, and
  //   - party/rated fields in the game-server response, where present.
  // Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

  // Called on every navigation, so we know which lobby led into the next game.
  function noteLobby(path = location.pathname) {
    const lobby = PARTY_PAGES.test(path) ? 'party' : COMPETITIVE_PAGES.test(path) ? 'competitive' : null;
    if (lobby) try { sessionStorage.setItem(LOBBY_KEY, lobby); } catch {}
  }

  const guardCache = new Map(); // token -> Promise<{ competitive, why }>
  function competitive() {
    const path = location.pathname;
    if (COMPETITIVE_PAGES.test(path)) return Promise.resolve({ competitive: true, why: 'matchmaking page' });
    const ctx = context();
    if (!ctx || ctx.mode === 'standard' || ctx.mode === 'challenge') {
      return Promise.resolve({ competitive: false, why: ctx ? `${ctx.mode} game` : 'not in a game' });
    }
    if (!guardCache.has(ctx.token)) guardCache.set(ctx.token, (async () => {
      let lobby = null;
      try { lobby = sessionStorage.getItem(LOBBY_KEY); } catch {}
      let j = null;
      try {
        const r = await fetch(ctx.api, { credentials: 'include' });
        if (r.ok) j = await r.json();
      } catch {}
      const o = j?.options ?? {};
      const rated = [j?.isRated, o.isRated, j?.competitive, o.competitive, j?.isRanked, o.isRanked].some(v => v === true)
        || [j?.gameContext?.type, o.gameContext?.type].some(t => /rank|competitive|matchmak/i.test(t ?? ''));
      const party = [j?.partyId, o.partyId, j?.party, j?.lobbyId, o.lobbyId, j?.gameContext?.partyId].some(Boolean)
        || [j?.gameContext?.type, o.gameContext?.type].some(t => /party|private|friend/i.test(t ?? ''));
      const why = `${ctx.mode}: lobby=${lobby ?? '?'} party-field=${party} rated-field=${rated}${j ? '' : ' (no game data)'}`;
      if (rated) return { competitive: true, why };
      return { competitive: !(party || lobby === 'party'), why };
    })());
    return guardCache.get(ctx.token);
  }

  ggs.game = { context, roundKey, round, mapInfo, roundLocation, state, competitive, noteLobby };
})();
