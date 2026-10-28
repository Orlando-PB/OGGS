(() => {
  globalThis.__ggs.registry.push({
    id: 'compass',
    name: 'Compass lock',
    description: 'Stuck facing one direction.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'dir', label: 'Facing', type: 'buttons', default: 'n', choices: [
        { value: 'n', label: 'North' },
        { value: 'e', label: 'East' },
        { value: 's', label: 'South' },
        { value: 'w', label: 'West' },
      ] },
    ],
  });
})();
