(() => {
  globalThis.__ggs.registry.push({
    id: 'peek',
    name: 'Partial view',
    description: 'You only see part of Street View.',
    section: 'streetview',
    defaultEnabled: false,
    options: [
      { key: 'part', label: 'Visible part', type: 'select', default: 'top', choices: [
        { value: 'top', label: 'Top half' },
        { value: 'bottom', label: 'Bottom half' },
        { value: 'left', label: 'Left half' },
        { value: 'right', label: 'Right half' },
        { value: 'centre', label: 'Centre' },
        { value: 'spyglass', label: 'Spyglass' },
        { value: 'strip', label: 'Horizon strip' },
        { value: 'edges', label: 'All but the centre' },
        { value: 'topLeft', label: 'Top-left triangle' },
        { value: 'topRight', label: 'Top-right triangle' },
        { value: 'bottomLeft', label: 'Bottom-left triangle' },
        { value: 'bottomRight', label: 'Bottom-right triangle' },
        { value: 'dvd', label: 'Bouncing DVD window' },
        { value: 'random', label: 'Random each round' },
      ] },
    ],
  });
})();
