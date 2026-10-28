(() => {
  globalThis.__ggs.registry.push({
    id: 'flag-guess',
    name: 'Draw the flag',
    description: 'Paint the flag instead of using the map.',
    section: 'guessing',
    defaultEnabled: false,
    // one board over the guess map at a time
    excludes: ['draw-guess'],
    // the guess map is hidden, so its leftover Google bits go too
    turnsOn: [{ id: 'clean', key: 'google' }],
    options: [
      {
        key: 'forceInside',
        label: 'Guess must go inside the matched country',
        type: 'checkbox',
        default: true,
      },
    ],
  });
})();
