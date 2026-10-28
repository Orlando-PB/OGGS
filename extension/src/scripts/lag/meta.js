(() => {
  globalThis.__ggs.registry.push({
    id: 'lag',
    name: 'Lag',
    description: 'A terrible connection.',
    section: 'misc',
    defaultEnabled: false,
    options: [
      { key: 'level', label: '', type: 'slider', min: 1, max: 10, default: 4, marks: ['Less', 'More'] },
    ],
  });
})();
