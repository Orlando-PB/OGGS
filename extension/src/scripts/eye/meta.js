(() => {
  globalThis.__ggs.registry.push({
    id: 'eye',
    name: 'Scream to look',
    description: 'Street View only opens when you make noise.',
    section: 'misc',
    defaultEnabled: false,
    mic: true, // can't be switched on while the microphone is blocked
    options: [
      // how quiet a sound still opens the eye a crack: 5 is normal talking
      {
        key: 'sensitivity',
        label: '',
        type: 'slider',
        min: 1,
        max: 10,
        default: 5,
        marks: ['Louder', 'Quieter'],
      },
    ],
  });
})();
