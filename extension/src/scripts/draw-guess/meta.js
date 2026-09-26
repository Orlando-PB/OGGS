(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Replaces the guess map with a drawing board. Sketch the country, pin your spot, and it snaps to the closest real country as your guess.',
    defaultEnabled: false,
    options: [
      // percentage points the round's real country may trail the best match by and still win; 0 = no help
      { key: 'nudge', label: 'Correct country sensitivity', type: 'slider', min: 0, max: 20, default: 7,
        marks: ['Off', 'Medium', 'Easier'] },
      { key: 'hardMode', label: 'Hard mode: matches against all 193 countries', type: 'checkbox', default: false },
    ],
  });
})();
