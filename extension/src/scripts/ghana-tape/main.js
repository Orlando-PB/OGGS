// Ghana black tape, stuck to the car so it turns with the view like the real thing.
//
// Old (Gen 3) Ghana coverage has black tape on the car; the new Gen 4
// coverage doesn't. On Gen 4 panoramas inside Ghana, a strip of tape is painted in.
// Generation comes from the panorama's tile size (Gen 4 is 16384 px wide, Gen 3 13312).
(() => {
  const ggs = globalThis.__ggs;

  // The car, in its own frame: x right, y forward, z up, with the camera at the origin
  // (units don't matter, only the ratios). Seen looking down: the four ends of two roof
  // bars poking out from under the (blurred) car, and the black tape on the tip of the
  // front-left one.
  const CAR = {
    bars: { ys: [-0.85, 0.85], inner: 1.0, outer: 1.5, w: 0.07, z: -1 }, // y of each bar; where the ends start/stop; half width
    tape: { bar: 1, side: 1, len: 0.22, w: 0.085 },                      // front bar, right side; how far along the tip
  };
  const GEN4_WIDTH = 16384;

  // ---- catch GeoGuessr's Street View ----
  // Installed at document_start whether or not the script is on, so the panorama is
  // seen even if the script is switched on mid-game.
  // StreetViewPanorama has no getDiv(), so remember the container it was built in.
  const panos = new Map(); // pano -> container div
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) {
          super(...args);
          if (!(args[0] instanceof HTMLElement)) return;
          panos.set(this, args[0]);
          // never let an overlay bug break GeoGuessr's Street View
          try { active?.attach(this); } catch (err) { ggs.log('ghana-tape attach failed', err); }
        }
      };
    } catch (err) {
      ggs.log('could not hook google.maps.StreetViewPanorama', err);
    }
  }, 10);

  // Ghana's outline is coarse and coastal spots can fall just outside it, so a point
  // within ~5 km of the edge counts too (the land borders get the same leeway).
  const NEAR_DEG = 0.05;
  function nearEdge([x, y], poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2));
      if (Math.hypot(x - (xi + t * dx), y - (yi + t * dy)) < NEAR_DEG) return true;
    }
    return false;
  }
  function inPolygon(pt, poly) {
    return insidePolygon(pt, poly) || nearEdge(pt, poly);
  }
  function insidePolygon([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // pano id -> Promise<{ width, centerHeading } | null>
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

  // Camera-frame coords of a point in the car's frame: [right, up, depth].
  function toCamera([x, y, z], pov) {
    const a = rad(pov.heading), t = rad(pov.pitch);
    const cx = x * Math.cos(a) - y * Math.sin(a), cy = z, cz = x * Math.sin(a) + y * Math.cos(a);
    return [cx, cy * Math.cos(t) - cz * Math.sin(t), cy * Math.sin(t) + cz * Math.cos(t)];
  }

  // Projects a polygon onto the screen, clipping away the part behind the camera
  // (so a bar that's half behind you still shows its front half).
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

  let active = null;

  function start(cfg) {
    const attached = new Map(); // pano -> { canvas, listeners, info }

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
      // Heading relative to the car. centerHeading points at the back of the car, hence the 180.
      const rel = { heading: pov.heading - st.info.centerHeading + 180, pitch: pov.pitch };
      const fov = Math.min(127, 180 / 2 ** (pano.getZoom() ?? 1));
      const P = pts => project(pts, rel, fov, w, h);
      const rect = (x0, x1, y0, y1, z) => P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
      const path = pts => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      // stroked in the same colour so adjacent strips don't show a seam
      const fill = (pts, color) => {
        if (!pts) return;
        path(pts);
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      };
      // Half-disc on the end of a bar, in the roof plane.
      const cap = (cx, cy, r, side, z) => P(Array.from({ length: 9 }, (_, i) => {
        const a = ((i / 8) - 0.5) * Math.PI;
        return [cx + side * r * Math.cos(a), cy + r * Math.sin(a), z];
      }));
      // Strips across a bar's width, lit from above: bright ridge in the middle, darker sides.
      const shade = (x0, x1, y, hw, z, colors) => {
        const n = colors.length;
        colors.forEach((c, i) => fill(rect(x0, x1, y - hw + (2 * hw * i) / n, y - hw + (2 * hw * (i + 1)) / n, z), c));
      };
      // Fades the inner end of a bar into the blurred car it comes out of.
      const fade = (x0, x1, y, hw, z) => {
        const r = rect(x0, x1, y - hw, y + hw, z);
        // gradient runs from the inner end to the outer end (a clipped rect may have
        // more or fewer than 4 corners, so project the two midpoints separately)
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
          const outline = rect(x0, x1, y - hw, y + hw, bars.z);
          if (!outline) continue;

          // soft shadow on the roof
          ctx.save();
          ctx.filter = 'blur(3px)';
          fill(rect(x0, x1 + side * 0.03, y - hw * 0.6 + 0.05, y + hw * 1.4 + 0.05, bars.z - 0.01), 'rgba(0,0,0,.28)');
          ctx.restore();

          // aluminium tube with a groove down the middle
          shade(x0, x1, y, hw, bars.z, ['#8e8f90', '#c9cacb', '#e9eaea', '#f4f4f4', '#dcdddd', '#b5b6b7', '#828384']);
          fill(rect(x0, x1, y - hw * 0.12, y + hw * 0.12, bars.z + 0.001), '#5a5b5c');
          fill(rect(x0, x1, y + hw * 0.12, y + hw * 0.2, bars.z + 0.001), 'rgba(255,255,255,.35)');
          fill(cap(x1, y, hw, side, bars.z), '#b9babb');
          fill(cap(x1, y, hw * 0.55, side, bars.z + 0.001), '#8a8b8c');

          if (i === tape.bar && side === tape.side) {
            const tx0 = side * (bars.outer - tape.len), tx1 = x1 + side * 0.015, tw = tape.w;
            shade(tx0, tx1, y, tw, bars.z + 0.002, ['#161616', '#2a2a2a', '#383838', '#2c2c2c', '#1b1b1b', '#111']);
            fill(cap(tx1, y, tw, side, bars.z + 0.002), '#1f1f1f');
            // wrap edges of the tape
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
      if (pos && id && inPolygon([pos.lng(), pos.lat()], ggs.GHANA)) {
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
