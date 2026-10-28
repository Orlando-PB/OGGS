// Settings form: one card per script in ggs.registry, under a search box. Cards sit in a
// collapsible section per `section` (SECTIONS below, in that order), A to Z by name.
// Used by the popup and by the in-page panel (src/panel.js). update(settings) shows
// settings changed elsewhere without firing save.
//   ggs.settingsForm(container, { settings, save(id, key, value) })
//     -> { setStatus(id, text), update(settings) }
(() => {
  const ggs = (globalThis.__ggs ??= {});

  const SECTIONS = {
    chaos: 'Chaos mode',
    guessing: 'Guessing',
    streetview: 'Street View',
    misc: 'Misc',
    controls: 'Controls',
    ui: 'UI',
  };
  // Sections shown as their card alone, without a fold.
  const LONE = ['chaos'];
  // Sections the viewer opened or closed, in localStorage (popup and page each keep their own).
  // A section they haven't touched is open while any of its scripts is on.
  const OPEN = 'ggs-sections';
  const opened = () => {
    try {
      return JSON.parse(localStorage.getItem(OPEN)) ?? {};
    } catch {
      return {};
    }
  };

  ggs.settingsForm = (container, { settings: initial, save }) => {
    let settings = initial;
    const { registry, config } = ggs;
    // hideable: options with a hideIn, hidden by game mode.
    const statusEls = {};
    const refreshers = [];
    const hideable = [];
    // The page's microphone permission (its '_mic' status line).
    let micState = '';
    const micNotes = [];
    // Asked in the page itself (in-page panel), or from the popup through the settings.
    const askMic = () => {
      if (ggs.mic?.ask) return ggs.mic.ask();
      settings._mic = { ask: Date.now() };
      save('_mic', 'ask', settings._mic.ask);
    };

    function option(o) {
      if (o.type === 'mic') return `<button type="button" class="micnote" hidden>${o.label}</button>`;
      if (o.type === 'text') {
        const type = o.secret ? 'password' : 'text';
        return (
          `<label class="row"><span class="text">${o.label}</span>
             <input type="${type}" class="field" data-key="${o.key}" placeholder="${o.placeholder ?? ''}"` +
          ' autocomplete="off"></label>'
        );
      }
      if (o.type === 'select') {
        const choices = o.choices.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
        return `<label class="row"><span class="text">${o.label}</span>
             <select data-key="${o.key}">${choices}</select></label>`;
      }
      // A label per stop: the stops sit under their labels.
      if (o.type === 'slider' && o.marks?.length === o.max - o.min + 1) {
        const marks = o.marks.map(m => `<span data-t="${m}">${m}</span>`).join('');
        return (
          `<div class="row slider"><span class="text">${o.label}</span>
             <span class="stops" data-key="${o.key}" tabindex="0" role="slider" aria-label="${o.label}">` +
          `<span class="track"><i></i><b></b></span>
             <span class="marks">${marks}</span></span></div>`
        );
      }
      if (o.type === 'slider') {
        return `<label class="row slider"><span class="text">${o.label}${o.steps ? ': <b class="val"></b>' : ''}</span>
             <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="1">
             ${marksHtml(o)}</label>`;
      }
      // One of a few, as a row of buttons.
      if (o.type === 'buttons') {
        const buttons = o.choices.map(
          c =>
            `<button type="button" class="tog opt" data-key="${o.key}" data-value="${c.value}">${c.label}</button>`,
        );
        return `<div class="row boxes">${buttons.join('')}</div>`;
      }
      return `<button type="button" class="tog opt" data-key="${o.key}">${o.label}</button>`;
    }
    // A plain slider's labels, spread out. With `steps` (a name per stop) only the ends are
    // marked, and the label says the stop it's on.
    function marksHtml(o) {
      const ends = o.steps ? [o.steps[0], o.steps.at(-1)] : o.marks;
      return `<span class="marks">${ends.map(m => `<span>${m}</span>`).join('')}</span>`;
    }
    // Checkboxes are buttons that light up. Side-by-side ones share a row.
    const options = list =>
      list
        .map(option)
        .join('')
        .replace(
          /(<button type="button" class="tog opt" data-key="[^"]*">[^<]*<\/button>)+/g,
          row => `<div class="row boxes">${row}</div>`,
        );

    // Metas sharing a `group` render inside one card, each as a .part. The card is off when
    // none of its parts is enabled.
    const groups = {};
    const parts = {};
    const reflect = (card, metas) =>
      card.classList.toggle('off', !metas.some(m => config(m, settings).enabled));
    // A flat script is on while any of its options is.
    const setFlat = (meta, key, value) => {
      const cfg = config(meta, settings);
      const enabled = meta.options.some(o => (o.key === key ? value : cfg[o.key]) === true);
      const changes = { [key]: value, enabled };
      settings[meta.id] = { ...settings[meta.id], ...changes };
      for (const [k, v] of Object.entries(changes)) save(meta.id, k, v);
      refreshers.forEach(fn => fn());
    };
    const byId = Object.fromEntries(registry.map(m => [m.id, m]));

    // Search hides the cards whose name and description don't match, and opens the sections
    // that still have some. The suggestions are the scripts' names.
    const search = document.createElement('div');
    search.className = 'search';
    const names = registry
      .filter(m => !m.flat)
      .map(m => `<option value="${m.name}">`)
      .join('');
    search.innerHTML =
      '<input type="search" placeholder="Search modifiers" aria-label="Search modifiers"' +
      ` list="ggs-names" autocomplete="off">
      <datalist id="ggs-names">${names}</datalist>`;
    container.append(search);

    // One <details> per section that has scripts. Its summary counts the scripts that are on.
    const sections = {};
    for (const [key, title] of Object.entries(SECTIONS)) {
      const metas = registry.filter(m => (m.section ?? 'misc') === key);
      if (!metas.length) continue;
      // No fold: the card sits straight in the list.
      if (LONE.includes(key)) {
        const el = document.createElement('div');
        el.className = 'sec lone';
        el.dataset.section = key;
        el.innerHTML = '<div class="cards"></div>';
        sections[key] = el.firstChild;
        container.append(el);
        continue;
      }
      const el = document.createElement('details');
      el.className = 'sec';
      el.dataset.section = key;
      el.open = opened()[key] ?? metas.some(m => config(m, initial).enabled);
      el.innerHTML =
        `<summary><span class="title">${title}</span><span class="count"></span></summary>` +
        '<div class="cards"></div>';
      // A click, not 'toggle', which also fires for the default set just above.
      el.querySelector('summary').addEventListener('click', () => {
        try {
          localStorage.setItem(OPEN, JSON.stringify({ ...opened(), [key]: !el.open }));
        } catch {}
      });
      const count = el.querySelector('.count');
      refreshers.push(() => {
        // A flat script (Controls, UI) counts each option that's on.
        const on = metas.reduce((n, m) => {
          const cfg = config(m, settings);
          return n + (m.flat ? m.options.filter(o => cfg[o.key] === true).length : cfg.enabled ? 1 : 0);
        }, 0);
        count.textContent = on ? `${on} on` : '';
      });
      sections[key] = el.querySelector('.cards');
      container.append(el);
    }

    // A script's `turnsOn` options go on with it, and off with it unless the user has touched
    // them since. `auto_<key>` on the option's script remembers which script switched it on.
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
    // The user setting an option themselves makes it theirs.
    const setByUser = (meta, key, value) => {
      if (config(meta, settings)[`auto_${key}`]) mark(meta.id, key, null);
      setFlat(meta, key, value);
    };
    // With `steps`, the label shows the name of the stop the slider is on.
    function marks(box, opt) {
      if (!opt?.steps) return;
      box.closest('.slider').querySelector('.val').textContent = opt.steps[box.value - opt.min] ?? '';
    }
    // A slider with a label per stop. The labels are spread to fit and each stop sits at its
    // label's centre, so the stops aren't evenly spaced. The end ones sit at the track's ends,
    // thumb flush with the edge like a native range. Click, drag or arrow keys pick one.
    function stops(el, meta, opt) {
      const key = el.dataset.key;
      const labels = [...el.querySelectorAll('.marks span')];
      let value = config(meta, settings)[key];
      // Half the thumb's width.
      const THUMB = 8;
      const centres = () => {
        const r = el.getBoundingClientRect();
        const c = labels.map(l => {
          const b = l.getBoundingClientRect();
          return b.left + b.width / 2 - r.left;
        });
        return c.map((x, i) => (i === 0 ? THUMB : i === c.length - 1 ? r.width - THUMB : x));
      };
      const draw = () => {
        labels.forEach((l, i) => l.classList.toggle('on', i === value - opt.min));
        el.style.setProperty('--x', `${centres()[value - opt.min] ?? 0}px`);
        el.setAttribute('aria-valuenow', value);
      };
      const set = v => {
        v = Math.max(opt.min, Math.min(opt.max, v));
        if (v === value) return;
        value = v;
        draw();
        settings[meta.id] = { ...settings[meta.id], [key]: v };
        save(meta.id, key, v);
        refreshers.forEach(fn => fn());
      };
      const at = e => {
        const x = e.clientX - el.getBoundingClientRect().left;
        const c = centres();
        const nearest = c.reduce((best, cx, i) => (Math.abs(cx - x) < Math.abs(c[best] - x) ? i : best), 0);
        set(opt.min + nearest);
      };
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        at(e);
      });
      el.addEventListener('pointermove', e => {
        if (e.buttons & 1) at(e);
      });
      el.addEventListener('keydown', e => {
        const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
        if (!step) return;
        e.preventDefault();
        set(value + step);
      });
      // Also redraws when its section opens.
      new ResizeObserver(draw).observe(el);
      refreshers.push(() => {
        value = config(meta, settings)[key];
        draw();
      });
      draw();
    }

    for (const meta of [...registry].sort((a, b) => a.name.localeCompare(b.name))) {
      let card = meta.group && groups[meta.group];
      if (!card) {
        card = document.createElement('section');
        card.dataset.id = meta.group ?? meta.id;
        if (meta.group) groups[meta.group] = card;
        sections[meta.section ?? 'misc'].append(card);
      }
      (parts[card.dataset.id] ??= []).push(meta);
      const metasHere = parts[card.dataset.id];
      const part = meta.group ? document.createElement('div') : card;
      part.className = meta.group ? 'part' : '';
      part.dataset.id = meta.id;
      const setOff = () => reflect(card, metasHere);
      setOff();
      card.classList.toggle('flat', !!meta.flat && !meta.group);
      // Flat: a button per option, and "enabled" is any option on. No name when grouped.
      if (meta.flat) {
        const buttons = meta.options
          .map(o => `<button type="button" class="tog" data-key="${o.key}">${o.label}</button>`)
          .join('');
        part.innerHTML = `
        <div class="row boxes">
          ${meta.group ? '' : `<span class="text"><span class="name">${meta.name}</span></span>`}
          ${buttons}
        </div><div class="status"></div>`;
      } else {
        const more = meta.options.some(o => o.hidden)
          ? `<details class="more"><summary>${meta.moreLabel ?? 'More'}</summary>` +
            `${options(meta.options.filter(o => o.hidden))}</details>`
          : '';
        part.innerHTML = `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${options(meta.options.filter(o => !o.hidden))}${more}<div class="status"></div></div>`;
      }
      if (meta.group) card.append(part);
      for (const btn of part.querySelectorAll('button.tog:not(.opt)')) {
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
      // Option buttons: a checkbox flips, or one of a 'buttons' choice is picked.
      for (const btn of part.querySelectorAll('button.opt')) {
        const key = btn.dataset.key;
        const pick = btn.dataset.value;
        const value = () => config(meta, settings)[key];
        const show = () =>
          btn.setAttribute('aria-pressed', pick == null ? !!value() : String(value()) === pick);
        show();
        refreshers.push(show);
        btn.addEventListener('click', () => {
          const next = pick ?? !value();
          settings[meta.id] = { ...settings[meta.id], [key]: next };
          save(meta.id, key, next);
          refreshers.forEach(fn => fn());
        });
      }
      statusEls[meta.id] = part.querySelector('.status');
      for (const note of part.querySelectorAll('.micnote')) {
        micNotes.push(note);
        note.addEventListener('click', askMic);
      }
      for (const o of meta.options) {
        const el = o.hideIn && part.querySelector(`[data-key="${o.key}"]`)?.closest('button, label');
        if (el) hideable.push({ el, hideIn: o.hideIn });
      }
      for (const el of part.querySelectorAll('.stops[data-key]')) {
        stops(
          el,
          meta,
          meta.options.find(o => o.key === el.dataset.key),
        );
      }
      for (const box of part.querySelectorAll('input[data-key], select[data-key]')) {
        const key = box.dataset.key;
        const range = box.type === 'range';
        const select = box.tagName === 'SELECT';
        const text = box.type === 'text' || box.type === 'password';
        const opt = meta.options.find(o => o.key === key);
        const show = () => {
          const v = config(meta, settings)[key];
          if (range || select || text) box.value = v;
          else box.checked = !!v;
          if (range) marks(box, opt);
          if (key === 'enabled') setOff();
        };
        show();
        refreshers.push(show);
        if (range) box.addEventListener('input', () => marks(box, opt));
        box.addEventListener('change', () => {
          const value = range ? Number(box.value) : select || text ? box.value : box.checked;
          // Microphone blocked, so it stays off.
          if (key === 'enabled' && value && meta.mic && micState === 'denied') {
            box.checked = false;
            statusEls[meta.id].textContent =
              'Microphone blocked: allow it for geoguessr.com from the address bar';
            return;
          }
          settings[meta.id] = { ...settings[meta.id], [key]: value };
          save(meta.id, key, value);
          if (key === 'enabled' && value) {
            // Switching this one on switches off the scripts it can't run beside...
            const clashes = registry.filter(
              m => meta.excludes?.includes(m.id) || m.excludes?.includes(meta.id),
            );
            for (const ex of clashes) {
              if (!config(ex, settings).enabled) continue;
              settings[ex.id] = { ...settings[ex.id], enabled: false };
              save(ex.id, 'enabled', false);
              autoOff(ex);
            }
            // ...and switches on the (flat) options it wants, which can be switched off again.
            autoOn(meta);
          } else if (key === 'enabled') {
            autoOff(meta);
          }
          refreshers.forEach(fn => fn());
        });
      }
    }

    // While Chaos mode is on it picks the other scripts itself, so their sections are greyed out.
    const chaos = byId.chaos;
    if (chaos)
      refreshers.push(() => container.classList.toggle('chaos-on', !!config(chaos, settings).enabled));

    const box = search.querySelector('input');
    // The sections' open state before the search, put back when it's cleared.
    let openBefore = null;
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      const secs = [...container.querySelectorAll(':scope > .sec')];
      if (q && !openBefore) openBefore = secs.map(s => s.open);
      // Matched from the start of a word, so "lag" finds Lag but not Draw the flag.
      const words = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      for (const card of container.querySelectorAll('.cards > section')) {
        const text = parts[card.dataset.id]
          .map(m => `${m.name} ${m.description} ${m.flat ? m.options.map(o => o.label).join(' ') : ''}`)
          .join(' ');
        card.hidden = !!q && !words.test(text);
      }
      secs.forEach((s, i) => {
        const any = [...s.querySelectorAll('.cards > section')].some(c => !c.hidden);
        s.hidden = !any;
        if (q) s.open = any;
        else if (openBefore) s.open = openBefore[i];
      });
      if (!q) openBefore = null;
      // A suggestion picked whole: bring its card into view.
      const exact = registry.find(m => m.name.toLowerCase() === q);
      if (exact)
        container.querySelector(`.cards [data-id="${exact.id}"]`)?.scrollIntoView({ block: 'nearest' });
    });

    // Fills in the section counts.
    refreshers.forEach(fn => fn());

    return {
      setStatus(id, text) {
        if (id === '_mode') {
          for (const h of hideable) h.el.hidden = h.hideIn.includes(text);
        } else if (id === '_mic') {
          micState = text ?? '';
          for (const n of micNotes) n.hidden = !['denied', 'prompt'].includes(micState);
        } else if (statusEls[id]) {
          statusEls[id].textContent = text ?? '';
        }
      },
      update(next) {
        settings = next;
        refreshers.forEach(fn => fn());
      },
    };
  };
})();
