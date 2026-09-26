(() => {
  globalThis.__ggs.registry.push({
    id: 'lying-signs',
    name: 'Lying signs (experimental)',
    description: 'Rewrites the text on signs.',
    defaultEnabled: false,
    options: [
      // index into WORDS in main.js; 0 = a different one for every sign
      { key: 'script', label: 'Script to write in', type: 'select', default: 0,
        choices: ['Random', 'Thai', 'Georgian', 'Korean', 'Arabic', 'Cyrillic', 'Greek', 'Hebrew', 'Japanese', 'Hindi', 'Armenian',
          'English (wrong words)', 'German', 'Spanish', 'French', 'Minecraft'].map((label, value) => ({ value, label })) },
      { key: 'noZoom', label: 'Disable zoom', type: 'checkbox', default: false },
    ],
  });
})();
