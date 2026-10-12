(() => {
  globalThis.__ggs.registry.push({
    id: 'nmpz',
    name: 'Controls',
    description: 'No move, pan or zoom for you, whatever the game allows.',
    defaultEnabled: false,
    group: 'controls', // popup: shares one card with the clean-screen toggles
    flat: true,        // popup: a box per option, no name; on when any is
    options: [
      { key: 'noMove', label: 'No move', type: 'checkbox', default: true },
      { key: 'noPan', label: 'No pan', type: 'checkbox', default: true },
      { key: 'noZoom', label: 'No zoom', type: 'checkbox', default: true },
    ],
  });
})();
