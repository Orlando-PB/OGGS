// Ghana black tape: old (Gen 3) Ghana coverage has tape on the car's roof bar, Gen 4
// doesn't. On Gen 4 panoramas inside Ghana (tile width 16384) the tape is drawn on a
// canvas over Street View, projected so it turns and zooms with the view.
(() => {
  const ggs = globalThis.__ggs;

  // The car in its own frame: x right, y forward, z up, camera at the origin. Two roof
  // bars with four ends poking out from under the blurred car; tape on the front-left tip.
  const CAR = {
    bars: { ys: [-0.85, 0.85], inner: 1.0, outer: 1.5, w: 0.07, z: -1 },
    tape: { bar: 1, side: 1, len: 0.22, w: 0.085 },
  };
  const GEN4_WIDTH = 16384;
  const NEAR_DEG = 0.05; // ~5 km leeway at Ghana's coarse outline

  const panos = new Map(); // pano -> container div (StreetViewPanorama has no getDiv())
  let active = null;
  ggs.maps.hook('StreetViewPanorama', (p, args) => {
    if (!(args[0] instanceof HTMLElement)) return;
    panos.set(p, args[0]);
    active?.attach(p);
  });

  function nearEdge([x, y], poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2));
      if (Math.hypot(x - (xi + t * dx), y - (yi + t * dy)) < NEAR_DEG) return true;
    }
    return false;
  }
  function insidePolygon([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inGhana = pt => insidePolygon(pt, ggs.GHANA) || nearEdge(pt, ggs.GHANA);

  // pano id -> Promise<{ width, centerHeading } | null>, from the page's own Maps API
  const tileCache = new Map();
  function tiles(id) {
    if (!tileCache.has(id)) {
      tileCache.set(id, new window.google.maps.StreetViewService().getPanorama({ pano: id })
        .then(({ data }) => ({ width: data.tiles.worldSize.width, centerHeading: data.tiles.centerHeading }))
        .catch(() => null));
    }
    return tileCache.get(id);
  }

  const rad = d => (d * Math.PI) / 180;
  function toCamera([x, y, z], pov) {
    const a = rad(pov.heading), t = rad(pov.pitch);
    const cx = x * Math.cos(a) - y * Math.sin(a), cy = z, cz = x * Math.sin(a) + y * Math.cos(a);
    return [cx, cy * Math.cos(t) - cz * Math.sin(t), cy * Math.sin(t) + cz * Math.cos(t)];
  }
  // Projects a polygon onto the screen, clipping the part behind the camera.
  const NEAR = 0.05;
  function project(pts, pov, fov, w, h) {
    const cam = pts.map(p => toCamera(p, pov));
    const clipped = [];
    for (let i = 0; i < cam.length; i++) {
      const p = cam[i], q = cam[(i + 1) % cam.length];
      const pin = p[2] > NEAR, qin = q[2] > NEAR;
      if (pin) clipped.push(p);
      if (pin !== qin) {
        const k = (NEAR - p[2]) / (q[2] - p[2]);
        clipped.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, NEAR]);
      }
    }
    if (clipped.length < 3) return null;
    const f = w / 2 / Math.tan(rad(fov) / 2);
    return clipped.map(([x, y, z]) => [w / 2 + (f * x) / z, h / 2 - (f * y) / z]);
  }

  function start(cfg) {
    const attached = new Map(); // pano -> { canvas, listeners, resize, info }

    function draw(pano) {
      const st = attached.get(pano);
      if (!st) return;
      const { canvas } = st;
      const div = panos.get(pano);
      const w = div.clientWidth, h = div.clientHeight, dpr = devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!st.info || !pano.getVisible()) return;

      const pov = pano.getPov();
      const rel = { heading: pov.heading - st.info.centerHeading + 180, pitch: pov.pitch }; // centerHeading points at the back of the car
      const fov = Math.min(127, 180 / 2 ** (pano.getZoom() ?? 1));
      const P = pts => project(pts, rel, fov, w, h);
      const rect = (x0, x1, y0, y1, z) => P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
      const path = pts => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      const fill = (pts, color) => { // stroked in the same colour so adjacent strips don't show a seam
        if (!pts) return;
        path(pts);
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      };
      const cap = (cx, cy, r, side, z) => P(Array.from({ length: 9 }, (_, i) => {
        const a = ((i / 8) - 0.5) * Math.PI;
        return [cx + side * r * Math.cos(a), cy + r * Math.sin(a), z];
      }));
      // strips across a bar's width, lit from above
      const shade = (x0, x1, y, hw, z, colors) => {
        const n = colors.length;
        colors.forEach((c, i) => fill(rect(x0, x1, y - hw + (2 * hw * i) / n, y - hw + (2 * hw * (i + 1)) / n, z), c));
      };
      // fades the inner end of a bar into the blurred car
      const fade = (x0, x1, y, hw, z) => {
        const r = rect(x0, x1, y - hw, y + hw, z);
        const ends = P([[x0, y, z], [x1, y, z], [x1, y + 0.001, z]]);
        if (!r || !ends || ends.length < 2) return;
        const g = ctx.createLinearGradient(ends[0][0], ends[0][1], ends[1][0], ends[1][1]);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        fill(r, g);
        ctx.restore();
      };

      const { bars, tape } = CAR;
      bars.ys.forEach((y, i) => {
        for (const side of [-1, 1]) {
          const x0 = side * bars.inner, x1 = side * bars.outer, hw = bars.w;
          if (!rect(x0, x1, y - hw, y + hw, bars.z)) continue;

          ctx.save();
          ctx.filter = 'blur(3px)';
          fill(rect(x0, x1 + side * 0.03, y - hw * 0.6 + 0.05, y + hw * 1.4 + 0.05, bars.z - 0.01), 'rgba(0,0,0,.28)');
          ctx.restore();

          shade(x0, x1, y, hw, bars.z, ['#8e8f90', '#c9cacb', '#e9eaea', '#f4f4f4', '#dcdddd', '#b5b6b7', '#828384']);
          fill(rect(x0, x1, y - hw * 0.12, y + hw * 0.12, bars.z + 0.001), '#5a5b5c');
          fill(rect(x0, x1, y + hw * 0.12, y + hw * 0.2, bars.z + 0.001), 'rgba(255,255,255,.35)');
          fill(cap(x1, y, hw, side, bars.z), '#b9babb');
          fill(cap(x1, y, hw * 0.55, side, bars.z + 0.001), '#8a8b8c');

          if (i === tape.bar && side === tape.side) {
            const tx0 = side * (bars.outer - tape.len), tx1 = x1 + side * 0.015, tw = tape.w;
            shade(tx0, tx1, y, tw, bars.z + 0.002, ['#161616', '#2a2a2a', '#383838', '#2c2c2c', '#1b1b1b', '#111']);
            fill(cap(tx1, y, tw, side, bars.z + 0.002), '#1f1f1f');
            for (const k of [0.3, 0.62]) {
              const x = side * (bars.outer - tape.len * k);
              fill(rect(x, x + side * 0.006, y - tw, y + tw, bars.z + 0.003), 'rgba(255,255,255,.07)');
            }
          }

          fade(x0, side * (bars.inner + (bars.outer - bars.inner) * 0.35), y, hw * 1.6, bars.z);
        }
      });
    }

    async function refresh(pano) {
      const st = attached.get(pano);
      if (!st) return;
      st.info = null;
      const pos = pano.getPosition(), id = pano.getPano();
      if (pos && id && inGhana([pos.lng(), pos.lat()])) {
        const t = await tiles(id);
        if (attached.get(pano) !== st || pano.getPano() !== id) return;
        if (t && t.width >= GEN4_WIDTH) st.info = t;
      }
      draw(pano);
    }

    function attach(pano) {
      if (attached.has(pano)) return;
      const div = panos.get(pano);
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1000';
      if (getComputedStyle(div).position === 'static') div.style.position = 'relative';
      div.append(canvas);
      const redraw = () => { try { draw(pano); } catch (err) { ggs.log('ghana-tape draw failed', err); } };
      const st = { canvas, info: null, listeners: [] };
      attached.set(pano, st);
      const ev = window.google.maps.event;
      st.listeners = [
        ev.addListener(pano, 'pano_changed', () => refresh(pano)),
        ev.addListener(pano, 'position_changed', () => refresh(pano)),
        ev.addListener(pano, 'pov_changed', redraw),
        ev.addListener(pano, 'zoom_changed', redraw),
        ev.addListener(pano, 'visible_changed', redraw),
      ];
      st.resize = new ResizeObserver(redraw);
      st.resize.observe(div);
      refresh(pano);
    }

    active = { attach };
    panos.forEach((_, p) => attach(p));

    return {
      stop() {
        active = null;
        for (const st of attached.values()) {
          st.listeners.forEach(l => l.remove());
          st.resize.disconnect();
          st.canvas.remove();
        }
        attached.clear();
      },
    };
  }

  ggs.scripts['ghana-tape'] = { start };
})();
