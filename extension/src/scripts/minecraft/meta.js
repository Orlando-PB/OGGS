(() => {
  const ggs = globalThis.__ggs;
  ggs.registry.push({
    id: 'minecraft',
    name: 'Minecraft world',
    description: 'The round is redrawn in Minecraft.',
    section: 'streetview',
    defaultEnabled: false,
    // each panorama costs a generation; No move can be unticked again
    turnsOn: [{ id: 'nmpz', key: 'noMove' }],
    options: [
      { key: 'hq', label: 'High quality (limited)', type: 'checkbox', default: false },
      {
        key: 'code',
        label: 'Extra usage',
        type: 'text',
        default: '',
        placeholder: 'Code',
        secret: true,
        hidden: true,
      },
    ],
  });
})();
