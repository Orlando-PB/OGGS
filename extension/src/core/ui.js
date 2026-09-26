// Floating, draggable panel in a shadow root (GeoGuessr's CSS can't reach it). Its
// position is remembered per panel id.
(() => {
  const ggs = globalThis.__ggs;

  const BASE_CSS = `
    :host { all: initial; position: fixed; left: 16px; top: 120px; z-index: 2147483000; }
    :host([hidden]) { display: none !important; }
    .panel { width: 260px; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
             background: rgba(20, 16, 48, .9); border: 1px solid rgba(255, 255, 255, .14); border-radius: 12px;
             box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6); backdrop-filter: blur(8px); overflow: hidden; }
    .head { padding: 7px 12px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
            color: rgba(255, 255, 255, .6); background: rgba(255, 255, 255, .05); cursor: grab; user-select: none; }
    .head:active { cursor: grabbing; }
    .body { padding: 10px 12px 12px; }
  `;

  let zTop = 2147483000; // last-used panel sits on top

  function panel({ id, title, html = '', css = '', onKey, pos = { x: 16, y: 120 } }) {
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', id);
    host.onGgsKey = onKey;
    const front = () => { host.style.zIndex = String(++zTop); };
    host.addEventListener('pointerdown', front, true);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${BASE_CSS}${css}</style>
      <div class="panel"><div class="head">${title}</div><div class="body">${html}</div></div>`;
    document.body.append(host);

    const posKey = `ggs-pos-${id}`;
    const place = (x, y) => {
      host.style.left = `${Math.max(0, Math.min(x, innerWidth - host.offsetWidth))}px`;
      host.style.top = `${Math.max(0, Math.min(y, innerHeight - 30))}px`;
    };
    const saved = ggs.store.get(posKey, pos);
    place(saved.x, saved.y);

    const head = root.querySelector('.head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;  // a button in the header (close) gets the click, not a drag
      const r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = ev => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        const b = host.getBoundingClientRect();
        ggs.store.set(posKey, { x: b.left, y: b.top });
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    return {
      host,
      root,
      $: sel => root.querySelector(sel),
      show(visible) { host.hidden = !visible; },
      front,
      clamp() { // pull the panel back on screen (e.g. after it grew)
        const r = host.getBoundingClientRect();
        place(r.left, Math.min(r.top, innerHeight - host.offsetHeight - 8));
      },
      get visible() { return !host.hidden; },
      destroy() { host.remove(); },
    };
  }

  ggs.ui = { panel };
})();
