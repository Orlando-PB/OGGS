// Fake lag's Street View input queue: real input to the panorama is held during a freeze, or
// sent `delay` ms late. Held input is always sent, never lost: all at once when the freeze ends,
// and anything left when the script stops.
(() => {
  const ggs = globalThis.__ggs;
  const INPUT = [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'mousedown',
    'mousemove',
    'mouseup',
    'click',
    'dblclick',
    'contextmenu',
    'wheel',
    'keydown',
    'keyup',
  ];
  // Street View's own keys (as core/lock.js)
  const KEYS = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'w',
    'a',
    's',
    'd',
    'W',
    'A',
    'S',
    'D',
    '+',
    '-',
    '=',
    '_',
    'z',
    'x',
    'Z',
    'X',
    'Backspace',
  ];
  // Input events kept during one freeze. Mouse moves past this are dropped.
  const MAX_HELD = 500;

  // Starts listening; freezes nest (each freeze() needs its own thaw()).
  function heldInput() {
    let freezes = 0;
    let delay = 0;
    // Real (trusted) events only, so the copies sent below, and other scripts' copies, pass.
    const queue = []; // { e: a copy, target, at, due }, in order
    let pump = 0;
    let pressed = false;
    function wanted(e) {
      if (!e.isTrusted || !ggs.lag.inRound()) return false;
      if (e.type.startsWith('key')) return wantedKey(e);
      const t = e.target;
      if (pressed) return true;
      return !!ggs.view.panoElement()?.contains(t) && !t.closest?.('[data-ggs-view], [data-ggs-ui]');
    }
    const wantedKey = e =>
      KEYS.includes(e.key) &&
      !ggs.isTyping(e) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !ggs.maps.guessMapElement()?.contains(e.target);
    // a held press: its drag and release are held too, wherever they go
    function trackPress(e, take) {
      if (!e.isTrusted) return;
      if (e.type === 'pointerdown' || e.type === 'mousedown') pressed = !!take;
      // The release ends it, after the rest of its sequence (mouseup, click) in this task. On
      // pointerup too, since a held pointerdown means the browser sends no mouseup at all.
      if (/^(pointerup|mouseup|pointercancel)$/.test(e.type)) {
        setTimeout(() => {
          pressed = false;
        });
      }
    }
    function hold(e) {
      const take = (freezes || delay || queue.length) && wanted(e);
      trackPress(e, take);
      if (!take) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (queue.length > MAX_HELD && e.type.endsWith('move')) return;
      const now = performance.now();
      const due = freezes ? Infinity : Math.max(now + delay, queue.at(-1)?.due ?? 0);
      queue.push({ e: ggs.view.copyEvent(e), target: e.target, at: now, due });
      run();
    }
    const send = q => {
      if (q.target.isConnected) q.target.dispatchEvent(q.e);
    };
    function run() {
      clearTimeout(pump);
      const now = performance.now();
      while (queue.length && queue[0].due <= now) send(queue.shift());
      if (queue.length && queue[0].due < Infinity) pump = setTimeout(run, queue[0].due - now);
    }
    // A freeze ended: everything held happens at once, squeezed into under half a second.
    function release() {
      const held = queue.filter(q => q.due === Infinity);
      const now = performance.now();
      const t0 = held[0]?.at;
      const span = (held.at(-1)?.at ?? 0) - t0;
      for (const q of held) q.due = now + (q.at - t0) * Math.min(0.15, 400 / (span || 1));
      run();
    }
    const opts = { capture: true, passive: false };
    for (const t of INPUT) window.addEventListener(t, hold, opts);

    return {
      freeze() {
        freezes++;
      },
      thaw() {
        freezes--;
        if (!freezes) release();
      },
      setDelay(ms) {
        delay = ms;
      },
      stop() {
        for (const t of INPUT) window.removeEventListener(t, hold, opts);
        clearTimeout(pump);
        queue.splice(0).forEach(send); // anything still held goes now, in order
      },
    };
  }

  ggs.lag ??= {};
  ggs.lag.heldInput = heldInput;
})();
