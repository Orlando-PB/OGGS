// Radio's station search: live stations near the round's location from Radio Browser
// (radio-browser.info), which is sent the round's coordinates. In streamer mode only talk
// stations, by Radio Browser's tags. Also the line naming a station once the guess is in.
(() => {
  const ggs = globalThis.__ggs;

  const API = 'https://de1.api.radio-browser.info/json/stations/search';
  const RADII_KM = [50, 250, 1000, 3000]; // widen until there are a few stations

  // Stream networks that insert ads into the audio itself; tried last.
  const AD_STREAMS = /zeno\.fm|zenomedia|adswizz|streamtheworld\.com|tritondigital|[?&]aw_0_/i;

  const TALK_TAGS = new RegExp(
    '\\b(news|talk|sports?|speech|information|info|noticias|nachrichten|actualit|' +
      'informa|notizie|public radio|comedy|debate|politics)',
    'i',
  );
  const MUSIC_TAGS = new RegExp(
    '\\b(music|musica|música|musik|musique|hits?|pop|rock|dance|jazz|classical|' +
      'country|oldies|top ?40|chart|r&b|hip ?hop|electronic|house|latin|reggae|metal|disco|[5-9]0s|schlager|' +
      'soul|funk|blues|folk|indie|christian|gospel)\\b',
    'i',
  );
  const isTalk = s => TALK_TAGS.test(s.tags) && !MUSIC_TAGS.test(s.tags);

  async function search(params) {
    const q = new URLSearchParams({
      is_https: 'true',
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
      ...params,
    });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) throw new Error(`Radio Browser: HTTP ${r.status}`);
    // http streams are blocked on an https page; HLS needs a library
    return (await r.json()).filter(s => s.url_resolved?.startsWith('https://') && !s.hls);
  }
  const near = (lat, lng, dist, limit) =>
    search({ geo_lat: lat, geo_long: lng, geo_distance: dist * 1000, limit });

  async function anyNear(lat, lng) {
    let list = [];
    for (const d of RADII_KM) {
      list = await near(lat, lng, d, 30);
      if (list.length >= 3) break;
    }
    return list;
  }

  // Talk stations are sparser: the round's country first, then nearby, then wider.
  async function talkNear(lat, lng) {
    const close = await near(lat, lng, 250, 300);
    const pool = close.length ? close : await near(lat, lng, 1000, 300);
    const dist = s => km({ lat, lng }, { lat: s.geo_lat, lng: s.geo_long });
    const cc = pool.filter(s => s.geo_lat != null).sort((a, b) => dist(a) - dist(b))[0]?.countrycode;
    const talkClose = close.filter(isTalk);
    const list = talkClose.filter(s => s.countrycode === cc);
    if (cc) list.push(...(await search({ countrycode: cc, limit: 300 })).filter(isTalk));
    list.push(...talkClose.filter(s => s.countrycode !== cc));
    for (const d of RADII_KM.slice(2)) {
      if (list.length >= 3) break;
      list.push(...(await near(lat, lng, d, 300)).filter(isTalk));
    }
    return list;
  }

  // one entry per station (many are listed once per bitrate)
  function onePerStation(list) {
    const seen = new Set();
    return list.filter(s => {
      const k = s.name
        .split(/\s[|–-]\s|\(/)[0]
        .trim()
        .toLowerCase();
      return !seen.has(k) && seen.add(k);
    });
  }

  async function findStations(lat, lng, talkOnly) {
    const list = onePerStation(talkOnly ? await talkNear(lat, lng) : await anyNear(lat, lng));
    const ads = s => AD_STREAMS.test(s.url_resolved) || AD_STREAMS.test(s.url);
    // ad-free first, each half still in popularity order
    return [...list.filter(s => !ads(s)), ...list.filter(ads)];
  }

  const km = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(12742 * Math.asin(Math.sqrt(h)));
  };
  const describe = (s, loc) => {
    const where = [s.state, s.country].filter(Boolean).join(', ');
    const dist =
      s.geo_lat != null && loc ? ` · ${km(loc, { lat: s.geo_lat, lng: s.geo_long })} km from the spot` : '';
    return where + dist;
  };

  ggs.radio ??= {};
  Object.assign(ggs.radio, { findStations, describe });
})();
