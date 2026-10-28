(() => {
  globalThis.__ggs.registry.push({
    id: 'ascii',
    name: 'ASCII cam',
    description: 'Street View drawn in text characters.',
    section: 'streetview',
    defaultEnabled: false,
    // they re-upload tiles later, past this filter
    excludes: ['minecraft', 'lying-signs', 'gradient'],
    options: [
      {
        key: 'look',
        label: 'Look',
        type: 'buttons',
        default: 'white',
        choices: [
          { value: 'white', label: 'Black and white' },
          { value: 'colour', label: 'Colour' },
        ],
      },
    ],
  });
})();
