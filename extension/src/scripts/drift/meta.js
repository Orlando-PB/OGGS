(() => {
  globalThis.__ggs.registry.push({
    id: 'drift',
    name: 'Drifting map',
    description: 'The guess map keeps sliding about.',
    section: 'guessing',
    defaultEnabled: false,
    excludes: ['draw-guess', 'flag-guess'],
    options: [
      // index into SPEED in main.js
      {
        key: 'speed',
        label: 'Speed',
        type: 'slider',
        min: 0,
        max: 4,
        default: 1,
        marks: ['Slower', 'Faster'],
      },
    ],
  });
})();
