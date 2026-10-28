(() => {
  globalThis.__ggs.registry.push({
    id: 'distance',
    name: 'Show distance',
    description: 'Shows how far each pin is from the spot.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      {
        key: 'units',
        label: 'Units',
        type: 'buttons',
        default: 'km',
        choices: [
          { value: 'km', label: 'Kilometres' },
          { value: 'mi', label: 'Miles' },
        ],
      },
    ],
  });
})();
