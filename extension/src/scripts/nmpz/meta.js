(() => {
  globalThis.__ggs.registry.push({
    id: 'nmpz',
    name: 'Controls',
    description: 'No move, pan or zoom.',
    defaultEnabled: false,
    section: 'controls',
    // the popup shows one unnamed card with a box per option; on when any is ticked
    group: 'controls',
    flat: true,
    options: [
      { key: 'noMove', label: 'No move', type: 'checkbox', default: true },
      { key: 'noPan', label: 'No pan', type: 'checkbox', default: true },
      { key: 'noZoom', label: 'No zoom', type: 'checkbox', default: true },
    ],
  });
})();
