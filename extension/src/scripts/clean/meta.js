(() => {
  globalThis.__ggs.registry.push({
    id: 'clean',
    name: 'Clean map',
    description: 'Hides the Google overlays, the GeoGuessr logo, the round scores and the player count.',
    defaultEnabled: false,
    group: 'controls', // popup: a box per option under the NMPZ boxes; on when any is
    flat: true,
    options: [
      { key: 'google', label: 'Clean map', type: 'checkbox', default: false },
      { key: 'logo', label: 'Remove logo', type: 'checkbox', default: false, hideIn: ['duels'] }, // duels have neither
      { key: 'progress', label: 'Remove scoreboard', type: 'checkbox', default: false, hideIn: ['duels'] },
    ],
  });
})();
