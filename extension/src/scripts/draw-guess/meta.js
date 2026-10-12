(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Replaces the guess map with a drawing board. Sketch the country, pin your spot, and it snaps to the closest real country as your guess.',
    defaultEnabled: false,
    excludes: ['flag-guess'], // one board over the guess map at a time
    turnsOn: [{ id: 'clean', key: 'google' }], // the guess map is hidden, so its leftover Google bits go too
    options: [
      { key: 'hardMode', label: 'Hard mode: matches against every country and territory (199)', type: 'checkbox', default: false },
    ],
  });
})();
