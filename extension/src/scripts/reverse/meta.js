(() => {
  globalThis.__ggs.registry.push({
    id: 'reverse',
    name: 'Inverted controls',
    description: 'Your controls go the wrong way.',
    section: 'controls',
    defaultEnabled: false,
    options: [
      { key: 'move', label: 'Move', type: 'checkbox', default: true },
      { key: 'turn', label: 'Pan', type: 'checkbox', default: true },
      { key: 'drag', label: 'Drag', type: 'checkbox', default: true },
      { key: 'zoom', label: 'Zoom', type: 'checkbox', default: true },
    ],
  });
})();
