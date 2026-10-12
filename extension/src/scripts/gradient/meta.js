(() => {
  globalThis.__ggs.registry.push({
    id: 'gradient',
    name: 'Senegal gradient',
    description: 'Street View melts into a colour gradient.',
    defaultEnabled: false,
    options: [
      // 1 = barely blurred, 10 = a few colours per view
      { key: 'strength', label: 'How much gradient', type: 'slider', min: 1, max: 10, default: 8,
        marks: ['Blurry', 'Smudged', 'Gradient'] },
    ],
  });
})();
