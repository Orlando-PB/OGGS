(() => {
  globalThis.__ggs.registry.push({
    id: 'flip',
    name: 'Flipped view',
    description: 'Street View mirrored or upside down.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'flip', label: 'Flip', type: 'buttons', default: 'mirror', choices: [
        { value: 'mirror', label: 'Mirror' },
        { value: 'upside', label: 'Upside down' },
      ] },
    ],
  });
})();
