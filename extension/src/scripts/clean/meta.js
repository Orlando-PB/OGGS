(() => {
  globalThis.__ggs.registry.push({
    id: 'clean',
    name: 'Clean map',
    description: 'Hides map clutter, the logo and the scores.',
    defaultEnabled: false,
    section: 'ui',
    // the popup shows these boxes in one card with the OGGS tab's; on when any is ticked
    group: 'ui',
    flat: true,
    options: [
      { key: 'google', label: 'Clean map', type: 'checkbox', default: false },
      // duels have neither a logo nor a scoreboard
      { key: 'logo', label: 'Remove logo', type: 'checkbox', default: false, hideIn: ['duels'] },
      { key: 'progress', label: 'Remove scoreboard', type: 'checkbox', default: false, hideIn: ['duels'] },
    ],
  });
})();
