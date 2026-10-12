// Not a script: the OGGS tab's own setting (settings.panel.hideTab, read by src/panel.js).
// `ui` keeps boot.js from looking for an implementation.
(() => {
  globalThis.__ggs.registry.push({
    id: 'panel',
    name: 'OGGS tab',
    description: 'Hide the OGGS tab bottom left; Alt+O (Option+O on a Mac) still opens the panel.',
    defaultEnabled: false,
    group: 'controls',
    flat: true,
    ui: true,
    options: [
      { key: 'hideTab', label: 'Hide OGGS tab · Alt+O / Option+O reopens', type: 'checkbox', default: false },
    ],
  });
})();
