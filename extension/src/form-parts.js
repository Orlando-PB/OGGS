// Pieces of the settings form (src/form.js), loaded just before it wherever it is (popup,
// in-page panel, userscript). Plain HTML and two widgets, with no settings of their own.
//   ggs.formParts.flatHtml(meta): a flat script's card part, a button per option.
//   ggs.formParts.scriptHtml(meta): a script's card part: switch, options, a "More" fold.
//   ggs.formParts.stops(el, opt, value, pick(v)) -> { show(v) }: a slider with a label per
//     stop. pick gets each value the user chooses, show() shows one set elsewhere.
//   ggs.formParts.searchBox(container, registry, text(card)): the search box over the cards.
(() => {
  globalThis.__ggs ??= {};
  const ggs = globalThis.__ggs;

  const field = o => {
    const type = o.secret ? 'password' : 'text';
    return (
      `<label class="row"><span class="text">${o.label}</span>
         <input type="${type}" class="field" data-key="${o.key}" placeholder="${o.placeholder ?? ''}"` +
      ' autocomplete="off"></label>'
    );
  };
  const select = o => {
    const choices = o.choices.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
    return `<label class="row"><span class="text">${o.label}</span>
         <select data-key="${o.key}">${choices}</select></label>`;
  };
  // A label per stop: the stops sit under their labels.
  const stopsSlider = o => {
    const marks = o.marks.map(m => `<span data-t="${m}">${m}</span>`).join('');
    return (
      `<div class="row slider"><span class="text">${o.label}</span>
         <span class="stops" data-key="${o.key}" tabindex="0" role="slider" aria-label="${o.label}">` +
      `<span class="track"><i></i><b></b></span>
         <span class="marks">${marks}</span></span></div>`
    );
  };
  const rangeSlider = o =>
    `<label class="row slider"><span class="text">${o.label}${o.steps ? ': <b class="val"></b>' : ''}</span>
         <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="1">
         ${marksHtml(o)}</label>`;
  // A plain slider's labels, spread out. With `steps` (a name per stop) only the ends are
  // marked, and the label says the stop it's on.
  function marksHtml(o) {
    const ends = o.steps ? [o.steps[0], o.steps.at(-1)] : o.marks;
    return `<span class="marks">${ends.map(m => `<span>${m}</span>`).join('')}</span>`;
  }
  // One of a few, as a row of buttons.
  const buttons = o => {
    const list = o.choices.map(
      c =>
        `<button type="button" class="tog opt" data-key="${o.key}" data-value="${c.value}">${c.label}</button>`,
    );
    return `<div class="row boxes">${list.join('')}</div>`;
  };
  const OPTION = {
    mic: o => `<button type="button" class="micnote" hidden>${o.label}</button>`,
    text: field,
    select,
    slider: o => (o.marks?.length === o.max - o.min + 1 ? stopsSlider(o) : rangeSlider(o)),
    buttons,
  };
  const option = o =>
    OPTION[o.type]?.(o) ?? `<button type="button" class="tog opt" data-key="${o.key}">${o.label}</button>`;

  // Checkboxes are buttons that light up. Side-by-side ones share a row.
  const options = list =>
    list
      .map(option)
      .join('')
      .replace(
        /(<button type="button" class="tog opt" data-key="[^"]*">[^<]*<\/button>)+/g,
        row => `<div class="row boxes">${row}</div>`,
      );

  // Flat: a button per option, and "enabled" is any option on. No name when grouped.
  function flatHtml(meta) {
    const list = meta.options
      .map(o => `<button type="button" class="tog" data-key="${o.key}">${o.label}</button>`)
      .join('');
    return `
        <div class="row boxes">
          ${meta.group ? '' : `<span class="text"><span class="name">${meta.name}</span></span>`}
          ${list}
        </div><div class="status"></div>`;
  }

  function scriptHtml(meta) {
    const more = meta.options.some(o => o.hidden)
      ? `<details class="more"><summary>${meta.moreLabel ?? 'More'}</summary>` +
        `${options(meta.options.filter(o => o.hidden))}</details>`
      : '';
    return `
        <label class="row">
          <span class="text"><span class="name">${meta.name}</span><span class="desc">${meta.description}</span></span>
          <input type="checkbox" class="switch" data-key="enabled">
        </label>
        <div class="opts">${options(meta.options.filter(o => !o.hidden))}${more}<div class="status"></div></div>`;
  }

  // A slider with a label per stop. The labels are spread to fit and each stop sits at its
  // label's centre, so the stops aren't evenly spaced. The end ones sit at the track's ends,
  // thumb flush with the edge like a native range. Click, drag or arrow keys pick one.
  function stops(el, opt, value, pick) {
    const labels = [...el.querySelectorAll('.marks span')];
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
      labels.forEach((l, i) => {
        l.classList.toggle('on', i === value - opt.min);
      });
      el.style.setProperty('--x', `${centres()[value - opt.min] ?? 0}px`);
      el.setAttribute('aria-valuenow', value);
    };
    const set = v => {
      v = Math.max(opt.min, Math.min(opt.max, v));
      if (v === value) return;
      value = v;
      draw();
      pick(v);
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
    draw();
    return {
      show(v) {
        value = v;
        draw();
      },
    };
  }

  // A search box at the top of the form. It hides the cards whose text(card) doesn't match,
  // and opens the sections that still have some. The suggestions are the scripts' names.
  function searchBox(container, registry, text) {
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
    const box = search.querySelector('input');
    // The sections' open state before the search, put back when it's cleared.
    let openBefore = null;
    function showSections(secs, q) {
      secs.forEach((s, i) => {
        const any = [...s.querySelectorAll('.cards > section')].some(c => !c.hidden);
        s.hidden = !any;
        if (q) s.open = any;
        else if (openBefore) s.open = openBefore[i];
      });
    }
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      const secs = [...container.querySelectorAll(':scope > .sec')];
      if (q && !openBefore) openBefore = secs.map(s => s.open);
      // Matched from the start of a word, so "lag" finds Lag but not Draw the flag.
      const words = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      for (const card of container.querySelectorAll('.cards > section')) {
        card.hidden = !!q && !words.test(text(card));
      }
      showSections(secs, q);
      if (!q) openBefore = null;
      // A suggestion picked whole: bring its card into view.
      const exact = registry.find(m => m.name.toLowerCase() === q);
      if (exact)
        container.querySelector(`.cards [data-id="${exact.id}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  ggs.formParts = { flatHtml, scriptHtml, stops, searchBox };
})();
