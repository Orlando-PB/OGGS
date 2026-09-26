// Settings form: one card per script in ggs.registry. Rendered by the popup (saved to
// chrome.storage.sync) and by the userscript's in-page panel (saved to localStorage).
//   ggs.settingsForm(container, { settings, save(id, key, value) }) -> { setStatus(id, text) }
(() => {
  const ggs = (globalThis.__ggs ??= {});

  ggs.settingsForm = (container, { settings, save }) => {
    const { registry, config } = ggs;
    const statusEls = {};

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

    for (const meta of registry) {
      const cfg = config(meta, settings);
      const card = document.createElement('section');
      card.dataset.id = meta.id;
      card.classList.toggle('off', !cfg.enabled);
      card.innerHTML = `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${meta.options.map(o => o.hidden ? '' : option(o)).join('')}${meta.options.some(o => o.hidden)
          ? `<details class="more"><summary>More</summary>${meta.options.filter(o => o.hidden).map(option).join('')}</details>` : ''}<div class="status"></div></div>`;
      statusEls[meta.id] = card.querySelector('.status');
      for (const box of card.querySelectorAll('input[data-key], select[data-key]')) {
        const key = box.dataset.key, range = box.type === 'range', select = box.tagName === 'SELECT';
        const text = box.type === 'text' || box.type === 'password';
        if (range || select || text) box.value = cfg[key]; else box.checked = !!cfg[key];
        box.addEventListener('change', () => {
          const value = range ? Number(box.value) : select || text ? box.value : box.checked;
          settings[meta.id] = { ...settings[meta.id], [key]: value };
          save(meta.id, key, value);
          if (key === 'enabled') card.classList.toggle('off', !box.checked);
        });
      }
      container.append(card);
    }

    return {
      setStatus(id, text) { if (statusEls[id]) statusEls[id].textContent = text ?? ''; },
    };
  };
})();
