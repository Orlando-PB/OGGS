(() => {
  globalThis.__ggs.registry.push({
    id: 'spin',
    name: 'Spinning view',
    description: 'Street View slowly spins.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      // SECS in main.js: 4 is one turn a minute, 10 one every 2 seconds
      { key: 'speed', label: 'Speed', type: 'slider', min: 1, max: 10, default: 4, marks: ['Less', 'More'] },
    ],
  });
})();
