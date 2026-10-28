// Scratch card: each round Street View starts under a silver foil, a canvas inside the
// panorama's element so GeoGuessr's HUD stays on top. Dragging scratches holes until the round's
// meter runs out. The foil swallows all mouse input, holes included. Keys still turn and move.
// A round's scratches are saved by game token and location, so a reload brings them back.
(() => {
  const ggs = globalThis.__ggs;
  const KEY = 'ggs-scratch'; // localStorage: { id, used, strokes } of the last round scratched
  const BRUSH = 22; // px, radius of a scratch
  const INK = '#1c1a2e';
  const BLOCKED = [
    'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick',
    'contextmenu', 'wheel', 'touchstart', 'touchmove',
  ];
  const CSS = `
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
    canvas.empty { cursor: not-allowed; }
    .meter { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
             display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: #f5f1e8;
             border: 2px solid ${INK}; border-radius: 999px; box-shadow: 3px 3px 0 rgba(28,26,46,.3);
             font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .06em;
             text-transform: uppercase; color: ${INK}; pointer-events: none; }
    .meter b { width: 90px; height: 8px; border: 1.5px solid ${INK}; border-radius: 6px; overflow: hidden; }
    .meter i { display: block; height: 100%; background: #fecd19; transition: width .1s; }
  `;

  // Reload-proof id of the current round, or null without a location (then nothing is kept).
  async function roundId() {
    const loc = await ggs.game.roundLocation().catch(() => null);
    return loc && String(ggs.aid.seeded(`scratch|${ggs.game.context()?.token}|${loc.lat},${loc.lng}`)());
  }

  // the foil: brushed silver with a sparkle, a dashed inner frame and a label
  function paintFoil(g, w, h) {
    g.globalCompositeOperation = 'source-over';
    const grad = g.createLinearGradient(0, 0, w, h);
    const stops = [['#b4b9c3', 0], ['#eceef2', 0.3], ['#a7acb7', 0.5], ['#e2e5ea', 0.72], ['#b0b5bf', 1]];
    stops.forEach(([c, at]) => grad.addColorStop(at, c));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -h; x < w; x += 7) {
      g.moveTo(x, h);
      g.lineTo(x + h, 0);
    }
    g.stroke();
    const rand = ggs.aid.seeded('scratch-foil');
    for (let i = 0; i < w * h / 400; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(28,26,46,.07)';
      g.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
    g.setLineDash([10, 8]);
    g.strokeStyle = 'rgba(28,26,46,.18)';
    g.lineWidth = 2;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.setLineDash([]);
    g.fillStyle = 'rgba(28,26,46,.3)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(Math.min(w, h) * 0.05)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.fillText('✦  SCRATCH TO REVEAL  ✦', w / 2, h / 2);
  }

  function start(cfg) {
    let amount = cfg.amount ?? 6;
    let round = null;
    let pano = null;
    let saved = null;
    let drag = null;
    const host = document.createElement('div');
    host.setAttribute('data-ggs-view', '');
    host.style.cssText = 'all: initial; position: absolute; inset: 0; display: block; z-index: 2147483000;';
    // input on the foil stops here, so neither Street View nor GeoGuessr see it
    for (const t of BLOCKED) host.addEventListener(t, e => e.stopPropagation());
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><canvas></canvas><div class="meter">Scratch <b><i></i></b></div>`;
    const canvas = root.querySelector('canvas');
    const bar = root.querySelector('.meter i');
    const g = canvas.getContext('2d');

    // px of scratching per round, growing x250 over the slider: a few dabs at 1, the whole view at 10
    const total = () => 0.08 * 250 ** ((amount - 1) / 9) * (host.clientWidth + host.clientHeight);
    const meter = () => {
      bar.style.width = `${(1 - round.used) * 100}%`;
      canvas.classList.toggle('empty', round.used >= 1);
    };
    function line(pts) {
      const w = host.clientWidth;
      const h = host.clientHeight;
      g.beginPath();
      g.moveTo(pts[0] * w, pts[1] * h);
      for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i] * w, pts[i + 1] * h);
      g.stroke();
    }
    function redraw() {
      const dpr = devicePixelRatio || 1;
      const w = host.clientWidth;
      const h = host.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFoil(g, w, h);
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000';
      g.lineCap = g.lineJoin = 'round';
      g.lineWidth = 2 * BRUSH;
      for (const s of round.strokes) line(s);
      meter();
    }
    const save = () => {
      if (!round.id) return;
      const strokes = round.strokes.map(s => s.map(v => Math.round(v * 1e4) / 1e4));
      ggs.store.set(KEY, { id: round.id, used: round.used, strokes });
    };

    function newRound(key) {
      const r = round = { key, id: null, strokes: [], used: 0 };
      drag = null;
      redraw();
      roundId().then(id => {
        if (round !== r || !id) return;
        r.id = id;
        const old = ggs.store.get(KEY);
        if (old?.id === id) {
          r.strokes = [...old.strokes, ...r.strokes];
          r.used = Math.min(1, old.used + r.used);
          redraw();
        }
        save();
      });
    }

    // ---- scratching ----
    const at = e => {
      const b = host.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || round.used >= 1) return;
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      const w = host.clientWidth;
      const h = host.clientHeight;
      drag = { last: [x, y], pts: [x / w, y / h, x / w, y / h] };
      round.strokes.push(drag.pts);
      line(drag.pts);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      let [x, y] = at(e);
      const [lx, ly] = drag.last;
      const d = Math.hypot(x - lx, y - ly);
      if (d < 3) return;
      const left = (1 - round.used) * total();
      if (d > left) {
        // the last bit of the meter
        x = lx + (x - lx) * left / d;
        y = ly + (y - ly) * left / d;
      }
      round.used = Math.min(1, round.used + Math.min(d, left) / total());
      drag.last = [x, y];
      drag.pts.push(x / w, y / h);
      line([lx / w, ly / h, x / w, y / h]);
      meter();
      if (round.used >= 1) {
        drag = null;
        save();
      }
    });
    for (const t of ['pointerup', 'pointercancel']) {
      canvas.addEventListener(t, () => {
        if (!drag) return;
        drag = null;
        save();
      });
    }

    // ---- placement: on the panorama during a round, nowhere otherwise ----
    function unpin() {
      if (pano) Object.assign(pano.style, saved);
      pano = null;
    }
    function tick() {
      const el = ggs.maps.guessMapElement() ? ggs.view.panoElement() : null;
      if (!el) {
        host.remove();
        unpin();
        return;
      }
      const key = ggs.game.roundKey();
      if (round?.key !== key) newRound(key);
      if (host.parentElement !== el) {
        unpin();
        el.append(host);
        // the panorama becomes its own stacking layer, so the foil stays under GeoGuessr's HUD
        pano = el;
        saved = { isolation: el.style.isolation, position: el.style.position };
        el.style.isolation = 'isolate';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      }
      if (canvas.width !== Math.round(host.clientWidth * (devicePixelRatio || 1)) ||
          canvas.height !== Math.round(host.clientHeight * (devicePixelRatio || 1))) redraw();
    }
    const timer = setInterval(tick, 150);
    tick();

    return {
      // Switching off clears the saved scratches, so switching on again gives fresh foil.
      // A reload never calls stop, so it keeps them.
      stop() {
        clearInterval(timer);
        host.remove();
        unpin();
        ggs.store.set(KEY, null);
      },
      update(next) {
        amount = next.amount ?? 6;
      },
    };
  }
  ggs.scripts.scratch = { start };
})();
