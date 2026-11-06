// Ocean only: a click inside any country's outline (draw-guess's geo.json, simplified coastlines)
// takes the pin straight off again, as does switching it on. With no sea pin down, pressing Guess
// does nothing (core/aid.js). The round timer can still guess.
(() => {
  const ggs = globalThis.__ggs;

  ggs.scripts.ocean = ggs.aid('ocean', {
    usesLocation: false,
    round(ctx) {
      ctx.sea = false;
      // fetch the outlines before the first click
      ggs.aid.loadGeo().catch(() => {});
      // switched on mid-round: a pin already down may be on land, so it comes off
      if (!ctx.cleared) {
        ctx.cleared = true;
        ggs.maps.clearGuess();
      }
    },
    click(latLng, ctx) {
      const p = { lat: latLng.lat(), lng: latLng.lng() };
      ggs.aid.loadGeo().then(
        geo => {
          ctx.sea = !ggs.aid.countryAt(geo, p, { near: false });
          if (ctx.sea) return ctx.note('');
          // wait until GeoGuessr has placed the pin
          setTimeout(() => ggs.maps.clearGuess());
          ctx.note('Ocean only!');
          clearTimeout(ctx.noteTimer);
          ctx.noteTimer = setTimeout(() => ctx.note(''), 2000);
        },
        () => ctx.status("Couldn't load the country outlines"),
      );
    },
    unpin(ctx) {
      ctx.sea = false;
    },
    beforeGuess(ctx) {
      if (ctx.sea) return null;
      ctx.note('Ocean only! Put a pin in the sea');
      return false;
    },
  });
})();
