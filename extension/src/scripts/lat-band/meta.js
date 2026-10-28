(() => {
  globalThis.__ggs.registry.push({
    id: 'lat-band',
    name: 'Show latitude',
    description: 'Shows a band of latitude the round is in.',
    section: 'guessing',
    defaultEnabled: false,
    options: [
      // index into BANDS in core/aid.js
      {
        key: 'size',
        label: 'Width (km)',
        type: 'slider',
        min: 0,
        max: 8,
        default: 5,
        marks: ['Exact', '5', '25', '50', '100', '500', '1000', '2500', 'Hemi'],
      },
    ],
  });
})();
