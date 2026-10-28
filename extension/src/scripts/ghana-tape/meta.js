(() => {
  globalThis.__ggs.registry.push({
    id: 'ghana-tape',
    name: 'Ghana black tape',
    description: "Adds Ghana's black tape to new coverage.",
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // not just Gen 4 Ghana
      { key: 'everywhere', label: 'Add to all rounds', type: 'checkbox', default: false },
    ],
  });
})();
