(() => {
  globalThis.__ggs.registry.push({
    id: 'radio',
    name: 'Radio mode',
    description: 'Hear a local radio station instead of Street View.',
    section: 'misc',
    defaultEnabled: false,
    options: [
      { key: 'showStreetView', label: 'Show Street View', type: 'checkbox', default: false },
      {
        key: 'streamerMode', label: 'Streamer / YouTube mode: talk & news stations only',
        type: 'checkbox', default: false,
      },
    ],
  });
})();
