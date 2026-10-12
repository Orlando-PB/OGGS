(() => {
  globalThis.__ggs.registry.push({
    id: 'lying-signs',
    name: 'Lying signs',
    description: 'Rewrites the text on signs.',
    defaultEnabled: false,
    options: [
      // index into WORDS in main.js; 0 = a different one for every panorama
      { key: 'script', label: 'Script to write in', type: 'select', default: 0,
        choices: ['Random', 'Thai', 'Georgian', 'Korean', 'Arabic', 'Cyrillic', 'Greek', 'Hebrew', 'Japanese', 'Hindi', 'Armenian',
          'English (wrong words)', 'German', 'Spanish', 'French', 'Minecraft'].map((label, value) => ({ value, label })) },
      // the same setting as the No zoom box at the top (nmpz.noZoom), shown here too
      { key: 'noZoom', label: 'Disable zoom', type: 'checkbox', default: false, mirror: 'nmpz' },
    ],
  });
})();
