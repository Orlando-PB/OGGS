(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw the country',
    description: 'Draw the country instead of using the map.',
    section: 'guessing',
    defaultEnabled: false,
    // one board over the guess map at a time
    excludes: ['flag-guess'],
    // the guess map is hidden, so its leftover Google bits go too
    turnsOn: [{ id: 'clean', key: 'google' }],
    options: [
      {
        key: 'hardMode',
        label: 'Hard mode: all 199 countries and territories',
        type: 'checkbox',
        default: false,
      },
    ],
  });
})();
