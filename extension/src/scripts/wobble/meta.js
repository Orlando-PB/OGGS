(() => {
  globalThis.__ggs.registry.push({
    id: 'wobble',
    name: 'Wobbly pin',
    description: 'Your pin lands somewhere near where you click.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // index into KM in main.js
      {
        key: 'size',
        label: 'How far (km)',
        type: 'slider',
        min: 0,
        max: 6,
        default: 4,
        marks: ['10', '50', '100', '250', '500', '1000', '2500'],
      },
    ],
  });
})();
