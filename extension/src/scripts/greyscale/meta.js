(() => {
  globalThis.__ggs.registry.push({
    id: 'greyscale',
    name: 'Colour filter',
    description: 'Black and white, inverted, or one colour only.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      {
        key: 'filter',
        label: 'Filter',
        type: 'select',
        default: 'grey',
        choices: [
          { value: 'grey', label: 'Black and white' },
          { value: 'invert', label: 'Inverted' },
          { value: 'red', label: 'Only red' },
          { value: 'orange', label: 'Only orange' },
          { value: 'yellow', label: 'Only yellow' },
          { value: 'green', label: 'Only green' },
          { value: 'blue', label: 'Only blue' },
        ],
      },
    ],
  });
})();
