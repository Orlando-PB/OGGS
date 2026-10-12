(() => {
  globalThis.__ggs.registry.push({
    id: 'flag-guess',
    name: 'Draw the flag',
    description: 'Replaces the guess map with a paint board. Paint the flag, it finds the country with the closest flag, then click its outline where you want to guess.',
    defaultEnabled: false,
    excludes: ['draw-guess'], // one board over the guess map at a time
    turnsOn: [{ id: 'clean', key: 'google' }], // the guess map is hidden, so its leftover Google bits go too
    options: [
      { key: 'forceInside', label: 'Guess must go inside the matched country', type: 'checkbox', default: true },
    ],
  });
})();
