(() => {
  globalThis.__ggs.registry.push({
    id: 'jack-guess',
    name: 'Guess on Jack',
    description: "The world is Jack's face. Click the country you think you're in.",
    section: 'guessing',
    defaultEnabled: false,
    // one board over the guess map at a time
    excludes: ['draw-guess', 'flag-guess'],
    // the guess map is hidden, so its leftover Google bits go too
    turnsOn: [{ id: 'clean', key: 'google' }],
    options: [],
  });
})();
