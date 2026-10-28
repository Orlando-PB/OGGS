(() => {
  globalThis.__ggs.registry.push({
    id: 'radius',
    name: 'Show area',
    description: 'Shows an area the round is in.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // biggest to smallest; main.js turns the stop into continent / countries / RADII in core/aid.js
      { key: 'area', label: 'Area', type: 'slider', min: 0, max: 12, default: 8,
        steps: ['continent', '5 countries', '4 countries', '3 countries', '2 countries', 'the country',
          '2500 km', '1000 km', '500 km', '100 km', '50 km', '25 km', '5 km'] },
    ],
  });
})();
