(() => {
  globalThis.__ggs.registry.push({
    id: 'ocean',
    name: 'Ocean only',
    description: 'You can only guess in the ocean.',
    section: 'guessing',
    defaultEnabled: false,
    // the boards guess through the button; extra pins and wobble put the guess back on land
    excludes: ['draw-guess', 'flag-guess', 'jack-guess', 'guesses', 'wobble'],
    options: [],
  });
})();
