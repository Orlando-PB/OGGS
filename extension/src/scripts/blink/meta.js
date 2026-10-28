(() => {
  globalThis.__ggs.registry.push({
    id: 'blink',
    name: 'Blink',
    description: 'Street View only shows for a moment.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // index into MS in main.js
      {
        key: 'shown',
        label: 'Shown for (s)',
        type: 'slider',
        min: 0,
        max: 5,
        default: 4,
        marks: ['0.1', '0.5', '1', '2', '5', '10'],
      },
    ],
  });
})();
