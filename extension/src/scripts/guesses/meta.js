(() => {
  globalThis.__ggs.registry.push({
    id: 'guesses',
    name: 'Extra guesses',
    description: 'Drop several pins; the closest one counts.',
    section: 'guessing',
    defaultEnabled: false,
    // the boards hide the map, and wobble moves the pin after each click
    excludes: ['draw-guess', 'flag-guess', 'wobble'],
    options: [
      // index into COUNTS in main.js
      { key: 'pins', label: 'Pins', type: 'slider', min: 0, max: 7, default: 1,
        steps: ['2', '3', '4', '5', '6', '8', '10', 'unlimited'] },
    ],
  });
})();
