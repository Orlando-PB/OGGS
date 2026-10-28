// Chaos mode's settings. Loaded after every other meta.js, so its effect list (one box per
// script, plus the three Controls locks) is built from the registry.
(() => {
  const ggs = globalThis.__ggs;
  // Scripts chaos never switches on or off. main.js reads them from this meta.
  const OWN = ['chaos', 'nmpz', 'clean', 'panel'];
  const SKIP = ['liar']; // chaos's own hints already lie half the time
  const OFF = ['blank']; // in the list but not ticked to start with
  const effects = [
    ...ggs.registry
      .filter(m => !m.ui && !OWN.includes(m.id) && !SKIP.includes(m.id))
      .map(m => ({ key: `fx_${m.id}`, label: m.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    ...ggs.registry.find(m => m.id === 'nmpz').options.map(o => ({ key: `fx_${o.key}`, label: o.label })),
  ];
  ggs.registry.push({
    id: 'chaos',
    name: 'Chaos',
    description: '',
    section: 'chaos',
    own: OWN,
    defaultEnabled: false,
    moreLabel: 'Effects', // the hidden options' fold
    options: [
      // index into EVERY in main.js
      { key: 'every', label: 'New effect every', type: 'slider', min: 0, max: 7, default: 3,
        steps: ['10 s', '15 s', '20 s', '30 s', '45 s', '1 min', '90 s', '2 min'] },
      // a warning, shown only while the microphone isn't allowed; clicking it asks again
      { key: 'micNote', label: 'Mic effects disabled · click to allow the microphone', type: 'mic' },
      ...effects.map(e => ({ ...e, type: 'checkbox', default: !OFF.includes(e.key.slice(3)), hidden: true })),
    ],
  });
})();
