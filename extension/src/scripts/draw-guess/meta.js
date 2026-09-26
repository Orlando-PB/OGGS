(() => {
  globalThis.__ggs.registry.push({
    id: 'draw-guess',
    name: 'Draw your country',
    description: 'Replaces the guess map with a drawing board. Sketch the country, pin your spot, and it snaps to the closest real country as your guess.',
    defaultEnabled: false,
    options: [
      // How far behind the best match the round's real country can be and still get lifted
      // past it (percentage points). Right = easier = more help; 0 = no help at all (no
      // lift and no extra rotation/stretch leeway for the real country).
      { key: 'nudge', label: 'Correct country sensitivity', type: 'slider', min: 0, max: 20, default: 7,
        marks: ['Off', 'Medium', 'Easier'] },
      { key: 'hardMode', label: 'Hard mode: matches against all 193 countries', type: 'checkbox', default: false },
    ],
  });
})();
