(() => {
  globalThis.__ggs.registry.push({
    id: 'blind',
    name: 'Blind map',
    description: 'The guess map goes blank.',
    section: 'guessing',
    defaultEnabled: false,
    excludes: ['draw-guess', 'flag-guess', 'jack-guess', 'drift', 'in-country'],
    options: [{ key: 'grid', label: 'Grid lines', type: 'checkbox', default: true }],
  });
})();
