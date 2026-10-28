// Terrible hints: each round, one of the hint scripts (ggs.aid.hints: latitude band, longitude
// band, area) at a random size, drawn with that hint's colour and name. The pick is seeded by the
// round, so a reload shows the same one. core/aid.js makes it lie half the time, by working it
// out from a made-up spot the real one is outside of.
(() => {
  const ggs = globalThis.__ggs;
  ggs.scripts.liar = ggs.aid('liar', {
    lies: true,
    colour: ctx => ggs.aid.hints[ctx.hint]?.colour,
    name: ctx => ggs.registry.find(m => m.id === ctx.hint)?.name,
    shapes(ctx) {
      const r = ctx.pick(), ids = Object.keys(ggs.aid.hints).sort();
      const hint = ggs.aid.hints[ctx.hint = ids[Math.floor(r() * ids.length)]];
      return hint.shapes({ loc: ctx.loc, rand: ctx.rand, status: ctx.status, cfg: hint.random(r) });
    },
  });
})();
