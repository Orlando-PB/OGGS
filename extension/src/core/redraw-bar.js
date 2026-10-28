// The loading bar for the redrawn world (core/redraw.js), in the middle of the screen. It eases
// towards 90% over the last rounds' time and fills when the tiles are swapped.
//   ggs.redrawBar.show() puts it on the page (hidden until a start or notice), remove() takes it off.
//   start(seconds, key, t0): a generation started. Already showing this key does nothing.
//   done(failed, key): that generation finished. Another key's bar is left alone.
//   hide(), notice(message) (a message with no bar for a few seconds), owner() -> key | null.
(() => {
  const ggs = globalThis.__ggs;
  const CSS = `
    :host { all: initial; position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
            z-index: 2147483000; pointer-events: none; opacity: 0; transition: opacity .25s; }
    :host([data-on]) { opacity: 1; }
    .box { width: 300px; padding: 16px 20px; border-radius: 16px; background: rgba(20, 16, 48, .85);
           backdrop-filter: blur(8px); box-shadow: 0 12px 30px -10px rgba(0, 0, 0, .6);
           font: 700 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
           text-align: center; letter-spacing: .02em; }
    .bar[hidden] { display: none; }
    .bar { height: 10px; margin-top: 12px; border-radius: 5px; background: rgba(255, 255, 255, .12);
           overflow: hidden; }
    .fill { height: 100%; width: 0; border-radius: 5px; background: #fecd19;
            transition: width .1s linear, background .3s; }
  `;
  let overlay = null;
  // The bar belongs to the latest generation started (`owner`). An older one finishing or
  // failing later leaves it alone. hideTimer is the fade-out after one finished, cancelled
  // when the next one starts.
  let progressTimer = null;
  let owner = null;
  let hideTimer = null;

  function show() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      `<style>${CSS}</style><div class="box"><div class="text">Loading round…</div>` +
      '<div class="bar"><div class="fill"></div></div></div>';
    document.body.append(host);
    overlay = {
      host,
      text: root.querySelector('.text'),
      bar: root.querySelector('.bar'),
      fill: root.querySelector('.fill'),
    };
  }
  function remove() {
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    owner = null;
    overlay?.host.remove();
    overlay = null;
  }
  function start(seconds, key, t0 = Date.now()) {
    // Already showing this one.
    if (!overlay || key === owner) return;
    owner = key;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    const fill = overlay.fill;
    overlay.text.textContent = 'Loading round…';
    overlay.bar.hidden = false;
    fill.style.width = '0%';
    fill.style.background = '';
    overlay.host.dataset.on = '';
    progressTimer = setInterval(() => {
      const x = (Date.now() - t0) / 1000 / seconds;
      fill.style.width = `${Math.min(90, 100 * (1 - Math.exp(-2.3 * x)))}%`;
    }, 100);
  }
  function done(failed, key) {
    if (!overlay || (key && key !== owner)) return;
    owner = null;
    clearInterval(progressTimer);
    overlay.fill.style.width = '100%';
    if (failed) {
      overlay.fill.style.background = '#e03131';
      overlay.text.textContent = 'Could not redraw this round';
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(
      () => {
        if (overlay) delete overlay.host.dataset.on;
      },
      failed ? 4000 : 400,
    );
  }
  function hide() {
    owner = null;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    if (overlay) delete overlay.host.dataset.on;
  }
  function notice(message) {
    if (!overlay) return;
    owner = null;
    clearInterval(progressTimer);
    clearTimeout(hideTimer);
    overlay.text.textContent = message;
    overlay.bar.hidden = true;
    overlay.host.dataset.on = '';
    hideTimer = setTimeout(() => {
      if (!overlay) return;
      delete overlay.host.dataset.on;
      hideTimer = setTimeout(() => {
        if (overlay) overlay.bar.hidden = false;
      }, 300);
    }, 4000);
  }

  ggs.redrawBar = { show, remove, start, done, hide, notice, owner: () => owner };
})();
