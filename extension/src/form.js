// Settings form: one card per script in ggs.registry, under a search box. Cards sit in a
// collapsible section per `section` (SECTIONS below, in that order), A to Z by name.
// Used by the popup and by the in-page panel (src/panel.js). update(settings) shows
// settings changed elsewhere without firing save. The HTML, the stops slider and the search
// box are in src/form-parts.js, loaded just before this.
//   ggs.settingsForm(container, { settings, save(id, key, value) })
//     -> { setStatus(id, text), update(settings) }
(() => {
  globalThis.__ggs ??= {};
  const ggs = globalThis.__ggs;

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
    const { flatHtml, scriptHtml, stops, searchBox } = ggs.formParts;
    // hideable: options with a hideIn, hidden by game mode.
    const statusEls = {};
    const refreshers = [];
    const hideable = [];
    const refresh = () => {
      for (const fn of refreshers) fn();
    };
    const store = (id, key, value) => {
      settings[id] = { ...settings[id], [key]: value };
      save(id, key, value);
    };
    // The page's microphone permission (its '_mic' status line).
    let micState = '';
    const micNotes = [];
    // Asked in the page itself (in-page panel), or from the popup through the settings.
    const askMic = () => {
      if (ggs.mic?.ask) return ggs.mic.ask();
      settings._mic = { ask: Date.now() };
      save('_mic', 'ask', settings._mic.ask);
    };

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
      refresh();
    };
    const byId = Object.fromEntries(registry.map(m => [m.id, m]));

    // Search hides the cards whose name and description don't match.
    const cardText = card =>
      parts[card.dataset.id]
        .map(m => `${m.name} ${m.description} ${m.flat ? m.options.map(o => o.label).join(' ') : ''}`)
        .join(' ');
    searchBox(container, registry, cardText);

    // One <details> per section that has scripts. Its summary counts the scripts that are on.
    // No fold for a LONE section: the card sits straight in the list.
    const sections = {};
    function addLoneSection(key) {
      const el = document.createElement('div');
      el.className = 'sec lone';
      el.dataset.section = key;
      el.innerHTML = '<div class="cards"></div>';
      sections[key] = el.firstChild;
      container.append(el);
    }
    // A flat script (Controls, UI) counts each option that's on.
    const countOn = metas =>
      metas.reduce((n, m) => {
        const cfg = config(m, settings);
        if (m.flat) return n + m.options.filter(o => cfg[o.key] === true).length;
        return n + (cfg.enabled ? 1 : 0);
      }, 0);
    function addSection(key, title, metas) {
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
        const on = countOn(metas);
        count.textContent = on ? `${on} on` : '';
      });
      sections[key] = el.querySelector('.cards');
      container.append(el);
    }
    for (const [key, title] of Object.entries(SECTIONS)) {
      const metas = registry.filter(m => (m.section ?? 'misc') === key);
      if (!metas.length) continue;
      if (LONE.includes(key)) addLoneSection(key);
      else addSection(key, title, metas);
    }

    // A script's `turnsOn` options go on with it, and off with it unless the user has touched
    // them since. `auto_<key>` on the option's script remembers which script switched it on.
    const mark = (id, k, by) => store(id, `auto_${k}`, by);
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

    // The card a script goes in: its own, or its group's.
    function cardFor(meta) {
      let card = meta.group && groups[meta.group];
      if (!card) {
        card = document.createElement('section');
        card.dataset.id = meta.group ?? meta.id;
        if (meta.group) groups[meta.group] = card;
        sections[meta.section ?? 'misc'].append(card);
      }
      parts[card.dataset.id] ??= [];
      parts[card.dataset.id].push(meta);
      return card;
    }

    function addCard(meta) {
      const card = cardFor(meta);
      const metasHere = parts[card.dataset.id];
      const part = meta.group ? document.createElement('div') : card;
      part.className = meta.group ? 'part' : '';
      part.dataset.id = meta.id;
      const setOff = () => reflect(card, metasHere);
      setOff();
      card.classList.toggle('flat', !!meta.flat && !meta.group);
      part.innerHTML = meta.flat ? flatHtml(meta) : scriptHtml(meta);
      if (meta.group) card.append(part);
      wire(part, meta, setOff);
    }

    // The part's controls, each kept in step with the settings by a refresher.
    function wire(part, meta, setOff) {
      for (const btn of part.querySelectorAll('button.tog:not(.opt)')) flatButton(btn, meta, setOff);
      for (const btn of part.querySelectorAll('button.opt')) optionButton(btn, meta);
      statusEls[meta.id] = part.querySelector('.status');
      for (const note of part.querySelectorAll('.micnote')) {
        micNotes.push(note);
        note.addEventListener('click', askMic);
      }
      for (const o of meta.options) hideIn(part, o);
      for (const el of part.querySelectorAll('.stops[data-key]')) stopsFor(el, meta);
      for (const box of part.querySelectorAll('input[data-key], select[data-key]')) input(box, meta, setOff);
    }

    function hideIn(part, o) {
      const el = o.hideIn && part.querySelector(`[data-key="${o.key}"]`)?.closest('button, label');
      if (el) hideable.push({ el, hideIn: o.hideIn });
    }

    function flatButton(btn, meta, setOff) {
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
    function optionButton(btn, meta) {
      const key = btn.dataset.key;
      const pick = btn.dataset.value;
      const value = () => config(meta, settings)[key];
      const show = () =>
        btn.setAttribute('aria-pressed', pick == null ? !!value() : String(value()) === pick);
      show();
      refreshers.push(show);
      btn.addEventListener('click', () => {
        store(meta.id, key, pick ?? !value());
        refresh();
      });
    }

    function stopsFor(el, meta) {
      const key = el.dataset.key;
      const opt = meta.options.find(o => o.key === key);
      const slider = stops(el, opt, config(meta, settings)[key], v => {
        store(meta.id, key, v);
        refresh();
      });
      refreshers.push(() => slider.show(config(meta, settings)[key]));
    }

    // Inputs, selects, range sliders and the script's own switch ('enabled').
    function input(box, meta, setOff) {
      const key = box.dataset.key;
      const range = box.type === 'range';
      const valued = range || box.tagName === 'SELECT' || box.type === 'text' || box.type === 'password';
      const opt = meta.options.find(o => o.key === key);
      const show = () => {
        const v = config(meta, settings)[key];
        if (valued) box.value = v;
        else box.checked = !!v;
        if (range) marks(box, opt);
        if (key === 'enabled') setOff();
      };
      show();
      refreshers.push(show);
      if (range) box.addEventListener('input', () => marks(box, opt));
      box.addEventListener('change', () => {
        const value = range ? Number(box.value) : valued ? box.value : box.checked;
        if (key === 'enabled' && value && micBlocked(box, meta)) return;
        store(meta.id, key, value);
        if (key === 'enabled') switched(meta, value);
        refresh();
      });
    }

    // Microphone blocked, so it stays off.
    function micBlocked(box, meta) {
      if (!meta.mic || micState !== 'denied') return false;
      box.checked = false;
      statusEls[meta.id].textContent = 'Microphone blocked: allow it for geoguessr.com from the address bar';
      return true;
    }

    function switched(meta, on) {
      if (on) switchOn(meta);
      else autoOff(meta);
    }

    // Switching a script on switches off the scripts it can't run beside, and switches on
    // the (flat) options it wants, which can be switched off again.
    function switchOn(meta) {
      const clashes = registry.filter(m => meta.excludes?.includes(m.id) || m.excludes?.includes(meta.id));
      for (const ex of clashes) {
        if (!config(ex, settings).enabled) continue;
        store(ex.id, 'enabled', false);
        autoOff(ex);
      }
      autoOn(meta);
    }

    for (const meta of [...registry].sort((a, b) => a.name.localeCompare(b.name))) addCard(meta);

    // While Chaos mode is on it picks the other scripts itself, so their sections are greyed out.
    const chaos = byId.chaos;
    if (chaos)
      refreshers.push(() => container.classList.toggle('chaos-on', !!config(chaos, settings).enabled));

    // Fills in the section counts.
    refresh();

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
        refresh();
      },
    };
  };
})();
