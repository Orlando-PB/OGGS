// Settings form: one card per script in ggs.registry. Rendered by the popup (saved to
// chrome.storage.sync) and by the in-page panel (src/panel.js). update(settings) shows
// settings changed elsewhere without firing save.
//   ggs.settingsForm(container, { settings, save(id, key, value) }) -> { setStatus(id, text), update(settings) }
(() => {
  const ggs = (globalThis.__ggs ??= {});

  ggs.settingsForm = (container, { settings: initial, save }) => {
    let settings = initial;
    const { registry, config } = ggs;
    const statusEls = {}, refreshers = [], hideable = []; // hideable: options with a hideIn, by game mode

    function option(o) { return o.type === 'text'
        ? `<label class="row"><span class="text">${o.label}</span>
             <input type="${o.secret ? 'password' : 'text'}" class="field" data-key="${o.key}" placeholder="${o.placeholder ?? ''}" autocomplete="off"></label>`
        : o.type === 'select'
        ? `<label class="row"><span class="text">${o.label}</span>
             <select data-key="${o.key}">${o.choices.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></label>`
        : o.type === 'slider'
        ? `<label class="row slider"><span class="text">${o.label}</span>
             <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="1">
             <span class="marks">${o.marks.map(m => `<span>${m}</span>`).join('')}</span></label>`
        : `<label class="row"><span class="text">${o.label}</span><input type="checkbox" class="switch" data-key="${o.key}"></label>`; }

    // metas sharing a `group` render inside one card, each as a .part; the card is off
    // when none of its parts is enabled
    const groups = {}, parts = {};
    const reflect = (card, metas) => card.classList.toggle('off', !metas.some(m => config(m, settings).enabled));
    // a flat script is on while any of its options is; an option with `mirror: '<id>'`
    // is another (flat) script's option of the same key, shown in a second place
    const setFlat = (meta, key, value) => {
      const cfg = config(meta, settings);
      const changes = { [key]: value, enabled: meta.options.some(o => (o.key === key ? value : cfg[o.key]) === true) };
      settings[meta.id] = { ...settings[meta.id], ...changes };
      for (const [k, v] of Object.entries(changes)) save(meta.id, k, v);
      refreshers.forEach(fn => fn());
    };
    const byId = Object.fromEntries(registry.map(m => [m.id, m]));

    // A script's `turnsOn` options go on with it and, unless the user has touched them since,
    // off with it. `auto_<key>` on the option's script remembers which script switched it on.
    const mark = (id, k, by) => {
      settings[id] = { ...settings[id], [`auto_${k}`]: by };
      save(id, `auto_${k}`, by);
    };
    const autoOn = meta => {
      for (const { id, key: k } of meta.turnsOn ?? []) {
        if (config(byId[id], settings)[k]) continue;
        setFlat(byId[id], k, true);
        mark(id, k, meta.id);
      }
    };
    const autoOff = meta => {
      for (const { id, key: k } of meta.turnsOn ?? []) {
        if (config(byId[id], settings)[`auto_${k}`] !== meta.id) continue;
        mark(id, k, null);
        setFlat(byId[id], k, false);
      }
    };
    // the user setting an option themselves makes it theirs
    const setByUser = (meta, key, value) => {
      if (config(meta, settings)[`auto_${key}`]) mark(meta.id, key, null);
      setFlat(meta, key, value);
    };
    for (const meta of registry) {
      let card = meta.group && groups[meta.group];
      if (!card) {
        card = document.createElement('section');
        card.dataset.id = meta.group ?? meta.id;
        if (meta.group) groups[meta.group] = card;
        container.append(card);
      }
      (parts[card.dataset.id] ??= []).push(meta);
      const metasHere = parts[card.dataset.id];
      const part = meta.group ? document.createElement('div') : card;
      part.className = meta.group ? 'part' : '';
      part.dataset.id = meta.id;
      const setOff = () => reflect(card, metasHere);
      setOff();
      card.classList.toggle('flat', !!meta.flat && !meta.group);
      // flat: a button per option, "enabled" is any option on (no name when grouped)
      part.innerHTML = meta.flat ? `
        <div class="row boxes">
          ${meta.group ? '' : `<span class="text"><span class="name">${meta.name}</span></span>`}
          ${meta.options.map(o => `<button type="button" class="tog" data-key="${o.key}">${o.label}</button>`).join('')}
        </div><div class="status"></div>` : `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${meta.options.map(o => o.hidden ? '' : option(o)).join('')}${meta.options.some(o => o.hidden)
          ? `<details class="more"><summary>More</summary>${meta.options.filter(o => o.hidden).map(option).join('')}</details>` : ''}<div class="status"></div></div>`;
      if (meta.group) card.append(part);
      for (const btn of part.querySelectorAll('button.tog')) {
        const key = btn.dataset.key;
        const show = () => {
          const cfg = config(meta, settings);
          btn.setAttribute('aria-pressed', !!cfg[key]);
          setOff();
        };
        show();
        refreshers.push(show);
        btn.addEventListener('click', () => setByUser(meta, key, !config(meta, settings)[key]));
      }
      statusEls[meta.id] = part.querySelector('.status');
      for (const o of meta.options) {
        const el = o.hideIn && part.querySelector(`[data-key="${o.key}"]`)?.closest('button, label');
        if (el) hideable.push({ el, hideIn: o.hideIn });
      }
      for (const box of part.querySelectorAll('input[data-key], select[data-key]')) {
        const key = box.dataset.key, range = box.type === 'range', select = box.tagName === 'SELECT';
        const text = box.type === 'text' || box.type === 'password';
        const mirror = byId[meta.options.find(o => o.key === key)?.mirror];
        const show = () => {
          const v = config(mirror ?? meta, settings)[key];
          if (range || select || text) box.value = v; else box.checked = !!v;
          if (key === 'enabled') setOff();
        };
        show();
        refreshers.push(show);
        box.addEventListener('change', () => {
          const value = range ? Number(box.value) : select || text ? box.value : box.checked;
          if (mirror) return setByUser(mirror, key, value);
          settings[meta.id] = { ...settings[meta.id], [key]: value };
          save(meta.id, key, value);
          if (key === 'enabled' && value) {
            // switching this one on switches off the scripts it can't run beside...
            for (const ex of meta.excludes ?? []) {
              if (!config(byId[ex], settings).enabled) continue;
              settings[ex] = { ...settings[ex], enabled: false };
              save(ex, 'enabled', false);
              autoOff(byId[ex]);
            }
            // ...and switches on the (flat) options it wants, which can be switched off again
            autoOn(meta);
          } else if (key === 'enabled') autoOff(meta);
          refreshers.forEach(fn => fn());
        });
      }
    }

    return {
      setStatus(id, text) {
        if (id === '_mode') for (const h of hideable) h.el.hidden = h.hideIn.includes(text);
        else if (statusEls[id]) statusEls[id].textContent = text ?? '';
      },
      update(next) { settings = next; refreshers.forEach(fn => fn()); },
    };
  };
})();
