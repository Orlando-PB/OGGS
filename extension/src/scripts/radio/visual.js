// Radio's visual: a shape blending between random country outlines, rippling with the volume.
// The outlines (shapes.js) are chosen without the round's location, so they give nothing away.
// A circle while loading, an icon on play, pause or skip.
(() => {
  const ggs = globalThis.__ggs;

  const MORPH_MS = 3000;
  const SPIN_STEP = (Math.PI * 3) / 8; // turn per blend
  const ICON_POLYS = {
    play: [
      [
        [-0.4, -0.55],
        [0.55, 0],
        [-0.4, 0.55],
      ],
    ],
    pause: [
      [
        [-0.45, -0.55],
        [-0.13, -0.55],
        [-0.13, 0.55],
        [-0.45, 0.55],
      ],
      [
        [0.13, -0.55],
        [0.45, -0.55],
        [0.45, 0.55],
        [0.13, 0.55],
      ],
    ],
    skip: [
      [
        [-0.55, -0.5],
        [0.2, 0],
        [-0.55, 0.5],
      ],
      [
        [0.25, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [0.25, 0.5],
      ],
    ],
    back: [
      [
        [-0.5, -0.5],
        [-0.25, -0.5],
        [-0.25, 0.5],
        [-0.5, 0.5],
      ],
      [
        [0.55, -0.5],
        [0.55, 0.5],
        [-0.2, 0],
      ],
    ],
  };
  // echo rings round the shape: [how far out, opacity]
  const ECHOES = [
    [1, 0.14],
    [2, 0.07],
  ];

  // rounds a polygon's corners
  function soften(poly, r = 0.06) {
    const out = [];
    poly.forEach((p, i) => {
      const a = poly[(i + poly.length - 1) % poly.length];
      const b = poly[(i + 1) % poly.length];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
      const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const d = Math.min(r, la / 2.2, lb / 2.2);
      const st = [p[0] + ((a[0] - p[0]) * d) / la, p[1] + ((a[1] - p[1]) * d) / la];
      const en = [p[0] + ((b[0] - p[0]) * d) / lb, p[1] + ((b[1] - p[1]) * d) / lb];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const u = 1 - t;
        out.push([
          u * u * st[0] + 2 * u * t * p[0] + t * t * en[0],
          u * u * st[1] + 2 * u * t * p[1] + t * t * en[1],
        ]);
      }
    });
    return out;
  }
  // m points evenly spaced round a closed polygon
  function loop(poly, m) {
    const seg = poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    const total = seg.reduce((a, v) => a + v, 0);
    const out = [];
    for (let j = 0, i = 0, acc = 0; j < m; j++) {
      const d = (j / m) * total;
      while (acc + seg[i] < d) acc += seg[i++];
      const t = (d - acc) / seg[i];
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
    return out;
  }
  // K points round a circle, with the same start (top) and winding as the outlines
  function circle(K) {
    const out = new Float32Array(2 * K);
    for (let i = 0; i < K; i++) {
      const a = -Math.PI / 2 + (i / K) * Math.PI * 2;
      out[2 * i] = Math.cos(a) * 0.8;
      out[2 * i + 1] = Math.sin(a) * 0.8;
    }
    return out;
  }
  function iconShapes(K) {
    const icons = {};
    for (const [name, polys] of Object.entries(ICON_POLYS)) {
      const pts = Float32Array.from(polys.flatMap(p => loop(soften(p), K / polys.length)));
      icons[name] = { parts: polys.length, pts };
    }
    return icons;
  }
  const wave = (i, K, t, ph) => {
    const th = (i / K) * Math.PI * 2;
    return (
      Math.sin(3 * th + t * 1.3 + ph) * 0.5 +
      Math.sin(7 * th - t * 2.1 + ph) * 0.3 +
      Math.sin(13 * th + t * 3.4 + ph * 2) * 0.2
    );
  };

  function blob(canvas) {
    const g = canvas.getContext('2d');
    const all = (ggs.radioShapes ?? []).map(a => Float32Array.from(a, v => v / 100));
    const n = all[0]?.length ?? 0;
    const K = n / 2;
    const round = circle(K);
    const base = new Float32Array(n);
    const shape = new Float32Array(n);
    const ring = new Float32Array(n);
    const icons = iconShapes(K);
    let flashName = null;
    let flashUntil = 0;
    let iconMix = 0;
    let iconTarget = null;
    let parts = 1;
    let partsAt = 0;
    const iconCur = new Float32Array(n); // the icon on show, easing from one icon to the next
    const pick = prev => {
      let s;
      do s = all[Math.floor(Math.random() * all.length)];
      while (all.length > 1 && s === prev);
      return s;
    };
    let from = pick();
    let to = pick(from);
    let since = performance.now();
    let load = 1;
    let level = 0;

    function trace(p, c, s, parts = 1) {
      g.beginPath();
      const per = K / parts;
      for (let q = 0; q < parts; q++) {
        const o = q * per;
        for (let i = 0; i <= per; i++) {
          const j = (o + (i % per)) * 2;
          const k = (o + ((i + 1) % per)) * 2;
          const mx = c + ((p[j] + p[k]) / 2) * s;
          const my = c + ((p[j + 1] + p[k + 1]) / 2) * s;
          if (i === 0) g.moveTo(mx, my);
          else g.quadraticCurveTo(c + p[j] * s, c + p[j + 1] * s, mx, my);
        }
        g.closePath();
      }
    }
    // outward normal at point i
    let nx = 0;
    let ny = 0;
    function normal(p, i) {
      const a = ((i + K - 2) % K) * 2;
      const b = ((i + 2) % K) * 2;
      const tx = p[b] - p[a];
      const ty = p[b + 1] - p[a + 1];
      const len = Math.hypot(tx, ty) || 1;
      nx = ty / len;
      ny = -tx / len;
    }
    // `out` is `p` pushed out along its normals by d(i)
    function push(out, p, d) {
      for (let i = 0; i < K; i++) {
        normal(p, i);
        const di = d(i);
        out[2 * i] = p[2 * i] + nx * di;
        out[2 * i + 1] = p[2 * i + 1] + ny * di;
      }
    }

    // keeps the canvas at its on-screen size in device pixels; returns that size
    function fit() {
      const dpr = devicePixelRatio || 1;
      const cw = canvas.clientWidth || 1;
      const W = Math.round(cw * dpr);
      if (canvas.width !== W || canvas.height !== W) canvas.width = canvas.height = W;
      return W;
    }
    // how far through the current blend, 0..1, moving on to a new outline at the end
    function progress(now) {
      const p = (now - since) / MORPH_MS;
      if (p < 1) return p;
      from = to;
      to = pick(from);
      since = now;
      return 0;
    }
    // base = the blend at p, slowly spinning, timed so each outline is north up when the blend
    // reaches it, then pulled towards the circle while loading
    function blend(p) {
      const m = p * p * (3 - 2 * p);
      const a0 = SPIN_STEP * p;
      const a1 = SPIN_STEP * (p - 1);
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      for (let i = 0; i < n; i += 2) {
        const x0 = from[i] * c0 - from[i + 1] * s0;
        const y0 = from[i] * s0 + from[i + 1] * c0;
        const x1 = to[i] * c1 - to[i + 1] * s1;
        const y1 = to[i] * s1 + to[i + 1] * c1;
        const x = x0 + (x1 - x0) * m;
        const y = y0 + (y1 - y0) * m;
        base[i] = x + (round[i] - x) * load;
        base[i + 1] = y + (round[i + 1] - y) * load;
      }
    }
    // icons ease in and out; returns how much of an icon is showing, 0..1
    function easeIcon(now, hold) {
      const want = hold ?? (now < flashUntil ? flashName : null);
      const target = icons[want];
      if (target) towards(target, want, now);
      else iconTarget = null;
      iconMix += ((target ? 1 : 0) - iconMix) * 0.18;
      if (iconMix > 0.001) for (let i = 0; i < n; i++) base[i] += (iconCur[i] - base[i]) * iconMix;
      parts = partsNow(target, now);
      return iconMix;
    }
    // an icon in two parts splits once it's mostly showing
    function partsNow(target, now) {
      if (iconMix <= 0.5) return 1;
      return target && now >= partsAt ? target.parts : parts;
    }
    function towards(target, want, now) {
      if (iconMix < 0.01) iconCur.set(base); // start from the shape as it is
      for (let i = 0; i < n; i++) iconCur[i] += (target.pts[i] - iconCur[i]) * 0.18;
      // split or join once it's partway there
      if (iconTarget !== want) {
        iconTarget = want;
        partsAt = now + 150;
      }
    }

    // echoes, pushed outward
    function echoes(c, s, t, amp, px, plain) {
      g.lineJoin = 'round';
      for (const [k, alpha] of ECHOES) {
        push(ring, shape, i => 0.06 * k + amp * k * (0.5 + 0.5 * wave(i, K, t, k * 2.3)));
        trace(ring, c, s, parts);
        g.strokeStyle = `rgba(255, 255, 255, ${alpha * (0.6 + level) * plain})`;
        g.lineWidth = 1.2 * px;
        g.stroke();
      }
    }
    function body(c, s, px) {
      trace(shape, c, s, parts);
      const fill = g.createRadialGradient(c, c - s * 0.3, s * 0.1, c, c, s * 1.1);
      fill.addColorStop(0, `rgba(254, 205, 25, ${0.1 + level * 0.25})`);
      fill.addColorStop(1, `rgba(120, 90, 230, ${0.08 + level * 0.15})`);
      g.fillStyle = fill;
      g.fill();
      g.shadowColor = 'rgba(254, 205, 25, .5)';
      g.shadowBlur = (4 + level * 18) * px;
      g.lineWidth = 2 * px;
      g.strokeStyle = 'rgba(255, 255, 255, .92)';
      g.stroke();
      g.shadowBlur = 0;
    }
    // three dots circling the shape while loading
    function loadingDots(c, s, t, px, plain) {
      for (let i = 0; i < 3; i++) {
        const a = t * 2.4 + (i * Math.PI * 2) / 3;
        g.fillStyle = `rgba(254, 205, 25, ${load * plain * (0.9 - i * 0.2)})`;
        g.beginPath();
        g.arc(c + Math.cos(a) * s * 1.02, c + Math.sin(a) * s * 1.02, (4 - i) * px, 0, Math.PI * 2);
        g.fill();
      }
    }

    // vol: 0..1 loudness; loading: finding/connecting; hold: an icon to keep showing
    function draw(now, { vol, loading, hold }) {
      const W = fit();
      const px = W / 300;
      const t = now / 1000;
      const c = W / 2;
      g.clearRect(0, 0, W, W);
      if (!n) return;

      const p = progress(now);
      load += ((loading ? 1 : 0) - load) * 0.05;
      level += (vol - level) * (vol > level ? 0.35 : 0.07);
      blend(p);
      const plain = 1 - easeIcon(now, hold); // icons stay crisp: no ripples or echoes

      const breathe = Math.sin(t * 3.1);
      const s = W * 0.34 * (1 + (level * 0.07 + load * 0.035 * breathe) * plain);
      const amp = (0.015 + level * 0.14 + load * 0.035 * (0.7 + 0.3 * breathe)) * plain;
      push(shape, base, i => amp * wave(i, K, t, 0));

      echoes(c, s, t, amp, px, plain);
      body(c, s, px);
      if (load * plain > 0.02) loadingDots(c, s, t, px, plain);
    }
    draw.flash = (name, ms) => {
      flashName = name;
      flashUntil = performance.now() + ms;
    };
    return draw;
  }

  ggs.radio ??= {};
  ggs.radio.blob = blob;
})();
