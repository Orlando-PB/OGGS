(() => {
  globalThis.__ggs.registry.push({
    id: 'scratch',
    name: 'Scratch card',
    description: 'Scratch away foil to see Street View.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // how much can be scratched each round: a few dabs at 1, the whole view at 10
      { key: 'amount', label: 'Scratching', type: 'slider', min: 1, max: 10, default: 6,
        marks: ['Less', 'More'] },
    ],
  });
})();
