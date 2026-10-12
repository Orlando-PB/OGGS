(() => {
  const ggs = globalThis.__ggs;
  ggs.registry.push({
    id: 'minecraft',
    name: 'Minecraft world',
    description: 'The round is redrawn in Minecraft.',
    defaultEnabled: false,
    turnsOn: [{ id: 'nmpz', key: 'noMove' }], // each panorama costs a generation; No move can be unticked again
    options: [
      { key: 'hq', label: 'High quality (slower; a few rounds a day)', type: 'checkbox', default: false },
      { key: 'code', label: 'Code', type: 'text', default: '', placeholder: 'optional', secret: true, hidden: true },
    ],
  });
})();
