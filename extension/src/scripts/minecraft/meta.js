(() => {
  const ggs = globalThis.__ggs;
  ggs.registry.push({
    id: 'minecraft',
    name: 'Minecraft world (experimental)',
    description: 'The round is redrawn in Minecraft.',
    defaultEnabled: false,
    options: [
      { key: 'hq', label: 'High quality (slower; a few rounds a day)', type: 'checkbox', default: false },
      { key: 'code', label: 'Code', type: 'text', default: '', placeholder: 'optional', secret: true, hidden: true },
    ],
  });
})();
