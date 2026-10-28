// Fake lag's looks: the overlay's styles, the spinners, loading-bar behaviours and labels, and
// the random helpers they use.
(() => {
  const ggs = globalThis.__ggs;
  const between = (lo, hi) => lo + Math.random() * (hi - lo);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const roll = p => Math.random() < p;

  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147481000; pointer-events: none;
            font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .lag { position: absolute; translate: -50% -50%; animation: in .2s ease-out; transition: opacity .25s; }
    .out { opacity: 0; }
    @keyframes in { from { opacity: 0; } }
    @keyframes turn { to { transform: rotate(360deg); } }
    @keyframes fade { from { opacity: 1; } to { opacity: .15; } }
    @keyframes hop { 0%, 60%, 100% { transform: none; } 30% { transform: translateY(-8px); } }
    @keyframes flip {
      0%, 40% { transform: rotate(0); }
      50%, 90% { transform: rotate(180deg); }
      100% { transform: rotate(360deg); } }
    @keyframes orbit {
      0% { transform: rotate(225deg); opacity: 1; animation-timing-function: ease-out; }
      7% { transform: rotate(345deg); animation-timing-function: linear; }
      30% { transform: rotate(455deg); animation-timing-function: ease-in-out; }
      39% { transform: rotate(690deg); animation-timing-function: linear; }
      70% { transform: rotate(815deg); opacity: 1; animation-timing-function: ease-out; }
      75% { transform: rotate(945deg); animation-timing-function: ease-out; }
      76%, 100% { transform: rotate(945deg); opacity: 0; } }
    @keyframes dash {
      0% { stroke-dasharray: 1 150; stroke-dashoffset: 0; }
      50% { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
      100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; } }
    .shade { filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .55)); }
    .dark { background: rgba(28, 26, 46, .82); color: #fff; box-shadow: 0 6px 18px -6px rgba(0, 0, 0, .6); }
    .ring { width: 46px; height: 46px; border-radius: 50%; border: 5px solid rgba(255, 255, 255, .25);
            border-top-color: #fff; box-sizing: border-box; animation: turn .8s linear infinite; }
    .wheel { width: 56px; height: 56px; border-radius: 14px; }
    .wheel span { position: absolute; left: 50%; top: 50%; width: 4px; height: 12px; margin: -6px -2px;
                  border-radius: 2px; background: #fff; animation: fade .9s linear infinite; }
    .dots { display: flex; gap: 7px; padding: 13px 16px; border-radius: 999px; }
    .dots i { width: 9px; height: 9px; border-radius: 50%; background: #fecd19;
              animation: hop 1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    .glass { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; }
    .glass b { animation: flip 2s ease-in-out infinite; }
    .win { width: 48px; height: 48px; }
    .win i { position: absolute; inset: 0; animation: orbit 5.5s infinite both; }
    .win i::after { content: ''; position: absolute; left: 50%; top: 0; width: 6px; height: 6px; margin-left: -3px;
                    border-radius: 50%; background: #fff; }
    .tube { width: 68px; height: 68px; animation: turn 1.4s linear infinite; }
    .tube circle { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round;
                   animation: dash 1.4s ease-in-out infinite; }
    .pill { display: flex; align-items: center; gap: 9px; padding: 8px 15px 8px 11px; border-radius: 999px;
            white-space: nowrap; }
    .pill i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .3);
              border-top-color: #fecd19; box-sizing: border-box; animation: turn .8s linear infinite; }
    .pct { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 50%; font-size: 14px; }
    .pct::before { content: ''; position: absolute; inset: 6px; border-radius: 50%;
                   border: 3px solid rgba(255, 255, 255, .2); border-left-color: #fecd19;
                   animation: turn 1.1s linear infinite; }
    .ping { padding: 6px 11px; border-radius: 6px; font: 700 12px/1 ui-monospace, Menlo, Consolas, monospace;
            white-space: nowrap; }
    .ping b { color: #ff6b5b; }
    .ping .ok { color: #fecd19; }
    .card { width: 230px; padding: 12px 14px; background: #f5f1e8; color: #1c1a2e; border: 2px solid #1c1a2e;
            border-radius: 10px; box-shadow: 4px 4px 0 rgba(28, 26, 46, .35); }
    .card p { margin: 0 0 8px; font-weight: 800; }
    .card span { float: right; font-variant-numeric: tabular-nums; }
    .card small { display: block; font-size: 11px; opacity: .6; }
    .card u { display: block; height: 10px; border: 1.5px solid #1c1a2e; border-radius: 6px; overflow: hidden;
              margin-bottom: 6px; }
    .bar { display: block; height: 100%; width: 0; background: #fecd19; transition: width .15s; }
    .top { position: absolute; height: 4px; overflow: hidden; }
    .top .bar { box-shadow: 0 0 10px #fecd19; }
    .badge { padding: 5px 9px; border-radius: 5px; font-size: 12px; }
    .badge b { color: #fecd19; }
    .fog { position: absolute; background: rgba(255, 255, 255, .42); backdrop-filter: saturate(.4);
           animation: in .6s; transition: opacity .25s; }
    .dialog { width: 340px; padding: 22px 24px 18px; background: #fff; color: #202124; border-radius: 8px;
              pointer-events: auto; box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
              font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .dialog h1 { margin: 0 0 10px; font-size: 16px; font-weight: 500; }
    .dialog p { margin: 0 0 6px; color: #5f6368; }
    .dialog div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .dialog button { font: 500 13px system-ui, sans-serif; padding: 8px 16px; border-radius: 4px; cursor: pointer;
                     border: 1px solid #dadce0; background: #fff; color: #1a73e8; }
    .dialog button.main { background: #1a73e8; border-color: #1a73e8; color: #fff; }
  `;
  // Spinners: html, and an optional live(el, ep) for ones whose text changes.
  const wheelSpokes = Array.from(
    { length: 12 },
    (_, i) =>
      `<span style="transform: rotate(${i * 30}deg) translateY(-15px); ` +
      `animation-delay: ${(i * 0.075 - 0.9).toFixed(3)}s"></span>`,
  ).join('');
  const windowsDots = [0, 1, 2, 3, 4].map(i => `<i style="animation-delay: ${i * 0.24}s"></i>`).join('');
  const SPINNERS = {
    ring: { html: '<div class="lag shade ring"></div>' },
    wheel: { html: `<div class="lag dark wheel">${wheelSpokes}</div>` },
    dots: { html: '<div class="lag dark dots"><i></i><i></i><i></i></div>' },
    glass: { html: '<div class="lag dark glass"><b>⌛</b></div>' },
    windows: { html: `<div class="lag shade win">${windowsDots}</div>` },
    tube: { html: '<svg class="lag shade tube" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"/></svg>' },
    reconnect: { html: '<div class="lag dark pill"><i></i><span>Reconnecting…</span></div>' },
    server: { html: '<div class="lag dark pill"><i></i><span>Waiting for server…</span></div>' },
    retry: {
      html: '<div class="lag dark pill"><i></i><span>Connection lost. Retrying in 3…</span></div>',
      live(el, ep) {
        let n = 3;
        ep.every(1000, () => {
          n = n > 1 ? n - 1 : 3;
          el.querySelector('span').textContent = `Connection lost. Retrying in ${n}…`;
        });
      },
    },
    percent: {
      html: '<div class="lag dark pct">0%</div>',
      live(el, ep) {
        let p = Math.floor(between(0, 40));
        ep.every(300, () => {
          if (roll(0.6)) p = Math.min(99, p + Math.floor(between(1, 6)));
          el.firstChild.textContent = `${p}%`;
        });
      },
    },
  };
  const FREEZE_SPINNERS = ['ring', 'wheel', 'windows', 'tube', 'server', 'reconnect'];
  // Loading-bar progress per tick (percent): stuck at 99, slipping back now and then, or starting
  // over.
  const BARS = {
    stall: p => Math.min(99, p + between(1, 7)),
    back: p => (roll(0.08) ? Math.max(0, p - between(10, 30)) : Math.min(97, p + between(0, 5))),
    restart: p => (p > 85 ? 0 : p + between(1, 6)),
  };
  const LABELS = ['Loading panorama…', 'Downloading tiles…', 'Syncing round…', 'Buffering…'];

  ggs.lag ??= {};
  Object.assign(ggs.lag, { between, lerp, pick, roll, CSS, SPINNERS, FREEZE_SPINNERS, BARS, LABELS });
})();
