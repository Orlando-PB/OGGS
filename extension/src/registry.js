// Catalogue of scripts, shared by the settings UI and the in-page loader. Each
// src/scripts/<id>/meta.js pushes its entry onto ggs.registry.
(() => {
  const ggs = (globalThis.__ggs ??= {});
  ggs.registry ??= [];

  // Stored settings are { "<id>": { enabled, <option>: value } }; gaps get the defaults.
  ggs.config = (meta, all) => ({
    enabled: meta.defaultEnabled,
    ...Object.fromEntries(meta.options.map(o => [o.key, o.default])),
    ...(all?.[meta.id] ?? {}),
  });
})();
