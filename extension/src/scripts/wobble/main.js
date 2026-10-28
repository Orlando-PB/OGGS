// Wobbly pin: after each click, once GeoGuessr has placed its pin, the pin moves to a random spot
// within the chosen distance. Plain Math.random: nothing to do with the round's location.
(() => {
  const ggs = globalThis.__ggs;
  const KM = [10, 50, 100, 250, 500, 1000, 2500];

  ggs.scripts.wobble = ggs.aid('wobble', {
    usesLocation: false,
    click(latLng, { cfg }) {
      // the square root spreads spots evenly over the disc
      const km = KM[cfg.size] * Math.sqrt(Math.random());
      const p = ggs.aid.destination({ lat: latLng.lat(), lng: latLng.lng() }, km, 2 * Math.PI * Math.random());
      setTimeout(() => {
        try { ggs.maps.placeGuess(p.lat, p.lng, { pan: false }); } catch {}
      });
    },
  });
})();
