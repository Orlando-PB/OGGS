// Catalogue of scripts, shared by the popup (settings UI) and the in-page loader.
// Each script lives in src/scripts/<id>/: meta.js pushes its entry onto ggs.registry,
// main.js sets __ggs.scripts[<id>] = { start(cfg) { ...; return { stop, update } } }.
// List both in manifest.json before src/boot.js (the popup finds meta.js files there).
(() => {
  const ggs = (globalThis.__ggs ??= {});

  ggs.registry ??= [];

  // Stored settings look like { "<id>": { enabled: true, <option>: value } }; fill gaps with defaults.
  ggs.config = (meta, all) => ({
    enabled: meta.defaultEnabled,
    ...Object.fromEntries(meta.options.map(o => [o.key, o.default])),
    ...(all?.[meta.id] ?? {}),
  });
})();
