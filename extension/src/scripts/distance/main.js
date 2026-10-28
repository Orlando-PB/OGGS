// Distance: after each click on the guess map, a note says how far that spot is from the round's
// location (core/aid.js). Switched on mid-round, it measures the pin already down.
(() => {
  const ggs = globalThis.__ggs;
  const KM_PER_MILE = 1.609344;

  function format(km, units) {
    const [n, big, small, per] =
      units === 'mi' ? [km / KM_PER_MILE, 'mi', 'yd', 1760] : [km, 'km', 'm', 1000];
    if (n < 1) return `${Math.round(n * per).toLocaleString('en')} ${small}`;
    return `${n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString('en')} ${big}`;
  }

  // the last distance is kept, so switching units rewrites the note straight away
  const show = ctx => ctx.note(format(ctx.km, (ctx.shownIn = ctx.cfg.units)));

  // the clicked spot is kept and measured once the round's location is known
  ggs.scripts.distance = ggs.aid('distance', {
    round(ctx) {
      ctx.km = null;
      ctx.at = ggs.maps.lastGuess();
      ctx.measured = null;
    },
    click(latLng, ctx) {
      ctx.at = { lat: latLng.lat(), lng: latLng.lng() };
      if (!ctx.loc) ctx.note('Distance not known yet');
    },
    tick(ctx) {
      if (ctx.at && ctx.loc && (ctx.measured !== ctx.at || ctx.measuredFrom !== ctx.loc)) {
        ctx.measured = ctx.at;
        ctx.measuredFrom = ctx.loc;
        ctx.km = ggs.aid.distance(ctx.at, ctx.loc);
      }
      if (ctx.km != null && (ctx.shownIn !== ctx.cfg.units || ctx.shownKm !== ctx.km)) {
        ctx.shownKm = ctx.km;
        show(ctx);
      }
    },
  });
})();
