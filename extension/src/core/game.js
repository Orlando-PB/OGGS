// Which game is open, on which map, and whether it's competitive. Reads geoguessr.com's
// own game API with the player's session; nothing is sent anywhere else.
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
  const fetchGame = async ctx => {
    const r = await fetch(ctx.api, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  // Standard games have { map: "<id>", mapName }, challenges { map: { name } }, duels { options: { map } }.
  function pickMap(j) {
    const m = j?.options?.map ?? j?.map;
    if (typeof m === 'string') return { id: m, name: j.mapName ?? m };
    if (m && typeof m === 'object') return { id: m.slug ?? m.id ?? m.mapId ?? null, name: m.name ?? j.mapName ?? null };
    return j?.mapName ? { id: null, name: j.mapName } : null;
  }
  const mapCache = new Map(); // token -> Promise<{ id, name } | null>
  function mapInfo() {
    const ctx = context();
    if (!ctx) return Promise.resolve(null);
    if (!mapCache.has(ctx.token)) mapCache.set(ctx.token, fetchGame(ctx).then(pickMap));
    return mapCache.get(ctx.token);
  }

  // The current round is the game token plus how many times the guess map has appeared
  // (GeoGuessr's round counter markup keeps changing, so the page isn't read).
  let entries = 0, entryToken = null, hadMap = false;
  setInterval(() => {
    const token = context()?.token ?? null, hasMap = !!ggs.maps.guessMapElement();
    if (token !== entryToken) { entryToken = token; entries = 0; hadMap = false; }
    if (hasMap && !hadMap) entries++;
    hadMap = hasMap;
  }, 200);
  const roundKey = () => `${context()?.token}|${entries}`;

  // Standard games only: { n, total, lat, lng }. Scripts may use the location for
  // gameplay (draw-guess's nudge, radio's station pick) but never show it before the guess.
  async function round() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const j = await fetchGame(ctx).catch(() => null);
    const n = j?.round ?? j?.rounds?.length, cur = j?.rounds?.[n - 1];
    if (!(n > 0)) return null;
    return { n, total: j.roundCount, lat: cur?.lat ?? null, lng: cur?.lng ?? null };
  }
  const roundLocation = () => round().then(r => (typeof r?.lat === 'number' ? { lat: r.lat, lng: r.lng } : null));

  async function state() {
    const ctx = context();
    if (ctx?.mode !== 'standard') return null;
    const j = await fetchGame(ctx).catch(() => null);
    if (!j) return null;
    const finished = j.state === 'finished' || (j.roundCount > 0 && j.player?.guesses?.length >= j.roundCount);
    return { finished, round: j.round, roundCount: j.roundCount };
  }

  // ---- competitive guard ----
  // Party and ranked duels share /duels/<id> URLs, so two signals decide: the lobby you came
  // through (/party or /join vs matchmaking pages) and party/rated fields in the game data.
  // Anything not clearly friendly counts as competitive.
  const COMPETITIVE_PAGES = /^\/(multiplayer|competitive|ranked|quick-play|matchmaking)(\/|$)/;
  const PARTY_PAGES = /^\/(party|join)(\/|$)/;
  const LOBBY_KEY = 'ggs-lobby';

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
      const j = await fetchGame(ctx).catch(() => null);
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
