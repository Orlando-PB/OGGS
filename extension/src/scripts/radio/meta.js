(() => {
  globalThis.__ggs.registry.push({
    id: 'radio',
    name: 'Radio mode',
    description: "Hides Street View. Instead you hear a live radio station from near the round's location.",
    defaultEnabled: false,
    options: [
      { key: 'showStreetView', label: 'Show Street View', type: 'checkbox', default: false },
      { key: 'streamerMode', label: 'Streamer / YouTube mode: talk & news stations only', type: 'checkbox', default: false },
    ],
  });
})();
