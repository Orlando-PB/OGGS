// Catalogue of scripts, shared by the settings UI and the in-page loader. Each
// src/scripts/<id>/meta.js pushes its entry onto ggs.registry.
(() => {
  globalThis.__ggs ??= {};
  const ggs = globalThis.__ggs;
  ggs.registry ??= [];

  // Puts our own markup into el as nodes, in place of innerHTML (the form, panels and boards
  // build it from fixed strings, with outside text escaped by ggs.esc). DOMParser's nodes are
  // inert only until they're moved into el: <script>s stay dead, but on* attributes (an <img
  // onerror>, say) then run. So the safety rests on every outside string going through ggs.esc.
  // Under an SVG element the markup is read as SVG.
  ggs.html = (el, markup) => {
    const svg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    const body = new DOMParser().parseFromString(
      `<body>${svg ? `<svg>${markup}</svg>` : markup}`,
      'text/html',
    ).body;
    el.replaceChildren(...(svg ? body.firstChild : body).childNodes);
  };

  // Stored settings are { "<id>": { enabled, <option>: value } }; gaps get the defaults.
  ggs.config = (meta, all) => ({
    enabled: meta.defaultEnabled,
    ...Object.fromEntries(meta.options.map(o => [o.key, o.default])),
    ...(all?.[meta.id] ?? {}),
  });
})();
