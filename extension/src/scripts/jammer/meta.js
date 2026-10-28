(() => {
  globalThis.__ggs.registry.push({
    id: 'jammer',
    name: 'Speech jammer',
    description: 'Hear your own voice loud and a moment late. Wear headphones.',
    section: 'misc',
    defaultEnabled: false,
    mic: true, // can't be switched on while the microphone is blocked
    options: [],
  });
})();
