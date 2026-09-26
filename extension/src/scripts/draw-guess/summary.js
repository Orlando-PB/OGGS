// Drawing summaries for Draw your country, shown on GeoGuessr's result screens (which
// reveal the answer anyway, so the correct country can be shown here):
//   - after each round: that round's drawing, what it matched and the correct country,
//   - after the last round: every round's drawing plus the average match with the
//     correct country.
// Kept in sessionStorage per game, so it survives a refresh.
(() => {
  const ggs = globalThis.__ggs;
  const KEY = 'ggs-drawings';

  const CSS = `
    .panel { width: auto; max-width: min(720px, calc(100vw - 32px)); }
    .avg { margin-bottom: 10px; color: rgba(255, 255, 255, .75); }
    .avg b { color: #fff; font-size: 15px; }
    .grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .card { width: 118px; }
    .card svg { display: block; width: 118px; height: 118px; border-radius: 8px; }
    .card.big { width: 180px; }
    .card.big svg { width: 180px; height: 180px; }
    .r { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255, 255, 255, .5);
         margin-bottom: 4px; }
    .stats { margin-top: 6px; padding: 4px 6px; border: 1.5px solid transparent; border-radius: 7px; }
    .card.hit .stats { border-color: #fcc419; background: rgba(252, 196, 25, .12); }
    .c { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card.hit .c { color: #ffd43b; }
    .s { font-variant-numeric: tabular-nums; }
    .s.good { color: #69db7c; } .s.ok { color: #ffd43b; } .s.bad { color: #ff8787; }
    .ans { margin-top: 4px; font-size: 12px; color: rgba(255, 255, 255, .6); }
    .ans b { color: #fff; }
    .none { width: 118px; height: 118px; border-radius: 8px; display: grid; place-items: center;
            background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .45); }`;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grade = score => (score >= 70 ? 'good' : score >= 50 ? 'ok' : 'bad');

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }
  // This game's record, started fresh when the game changes.
  function game() {
    const token = ggs.game.context()?.token;
    if (!token) return null;
    const data = load();
    return data.token === token ? data : { token, rounds: {} };
  }

  function record(drawing) {
    const g = game();
    if (!g || !drawing) return;
    g.rounds[g.seen ?? Object.keys(g.rounds).length + 1] = drawing;
    save(g);
  }

  const bbox = pts => {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const pathD = rings => rings.map(r => 'M' + r.map(p => p.join(',')).join('L') + 'Z').join('');

  // The drawing (green, with its pin) and, dashed on top, the correct country's outline
  // scaled and centred onto the drawing so the two shapes can be compared.
  function thumb({ rings, pin, answer }) {
    let over = null;
    if (answer?.outline?.length) {
      const [dx0, dy0, dx1, dy1] = bbox(rings.flat()), [ox0, oy0, ox1, oy1] = bbox(answer.outline.flat());
      const s = Math.max(dx1 - dx0, dy1 - dy0) / Math.max(ox1 - ox0, oy1 - oy0, 1e-9);
      const mx = (dx0 + dx1) / 2, my = (dy0 + dy1) / 2, ox = (ox0 + ox1) / 2, oy = (oy0 + oy1) / 2;
      over = answer.outline.map(r => r.map(([x, y]) => [Math.round(mx + (x - ox) * s), Math.round(my + (y - oy) * s)]));
    }
    const [x0, y0, x1, y1] = bbox(rings.flat().concat([pin], over ? over.flat() : []));
    const size = Math.max(x1 - x0, y1 - y0, 60) * 1.18, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pr = size * 0.035;
    return `<svg viewBox="${cx - size / 2} ${cy - size / 2} ${size} ${size}">
      <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="#cfe7f5"/>
      <path d="${pathD(rings)}" fill="rgba(81,207,102,.55)" stroke="#2b8a3e" stroke-width="1.5" vector-effect="non-scaling-stroke"
            stroke-linejoin="round"/>
      ${over ? `<path d="${pathD(over)}" fill="none" stroke="#1f2a44" stroke-width="1.6" stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke" stroke-linejoin="round" opacity=".85"><title>${esc(answer.name)}</title></path>` : ''}
      <circle cx="${pin[0]}" cy="${pin[1]}" r="${pr}" fill="#d9480f" stroke="#fff" stroke-width="1.5"
              vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  const isHit = d => !!d.answer && (d.answer.code === d.code || d.answer.name === d.country);

  // One round: what the drawing matched, and the correct country's match if it was a different one.
  function card(n, d, big = false) {
    if (!d) return `<div class="card"><div class="r">Round ${n}</div><div class="none">no drawing</div></div>`;
    const a = d.answer, hit = isHit(d);
    return `<div class="card${hit ? ' hit' : ''}${big ? ' big' : ''}"><div class="r">Round ${n}</div>${thumb(d)}
      <div class="stats">
        <div class="c" title="${esc(d.country)}">${esc(d.country)}${hit ? ' \u2713' : ''}</div>
        <div class="s ${grade(d.score)}">${d.score}% match</div>
        ${a && !hit ? `<div class="ans">Correct: <b>${esc(a.name)}</b> <span class="s ${grade(a.score)}">${a.score}%</span></div>` : ''}
      </div></div>`;
  }

  function gameHtml(g) {
    const total = g.total ?? Math.max(...Object.keys(g.rounds).map(Number));
    const drawn = Object.values(g.rounds);
    const withAnswer = drawn.filter(d => d.answer);
    const plural = n => `${n} drawing${n === 1 ? '' : 's'}`;
    const mean = xs => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
    const avg = withAnswer.length
      ? `Average match with the correct country <b>${mean(withAnswer.map(d => d.answer.score))}%</b> over ${plural(withAnswer.length)}
         \u00b7 ${withAnswer.filter(isHit).length}/${withAnswer.length} right`
      : `Average shape match <b>${mean(drawn.map(d => d.score))}%</b> over ${plural(drawn.length)}`;
    const cards = [];
    for (let n = 1; n <= total; n++) cards.push(card(n, g.rounds[n]));
    return `<div class="avg">${avg}</div><div class="grid">${cards.join('')}</div>`;
  }

  let panel = null, shown = '';
  function hide() {
    panel?.destroy();
    panel = null;
    shown = '';
  }

  // Called from the draw-guess tick. In a round: ask the game API once which round it is.
  // On a result screen: that round's card, or the whole game after the last round.
  let asked = '';
  function sync(inRound) {
    const g = game();
    if (!g) return hide();
    if (inRound) {
      const key = ggs.game.roundKey();
      if (asked !== key) {
        asked = key;
        ggs.game.round().then(r => {
          const g = game();
          if (!r || !g || ggs.game.roundKey() !== key) return;
          if (g.seen !== r.n || g.total !== r.total) { g.seen = r.n; g.total = r.total; save(g); }
        }).catch(() => {});
      }
      return hide();
    }
    const last = !!g.total && g.seen === g.total;
    if (last ? !Object.keys(g.rounds).length : !g.rounds[g.seen]) return hide();
    const title = last ? 'Your drawings' : `Round ${g.seen} drawing`;
    const body = last ? gameHtml(g) : card(g.seen, g.rounds[g.seen], true);
    if (title + body === shown) return;
    hide();
    panel = ggs.ui.panel({ id: 'draw-summary', title, html: body, css: CSS, pos: { x: 16, y: 80 } });
    panel.clamp();
    shown = title + body;
  }

  ggs.drawSummary = { record, sync, hide };
})();
