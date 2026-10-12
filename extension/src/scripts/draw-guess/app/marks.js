// Map markers shared by the draw-guess and flag-guess boards (flag-guess loads this file by
// relative path): the guess pin, the flag on the round's real spot and the dashed line
// between them. Drawing only; nothing here reads or sends anything.
(() => {
  // The pin's tip is at 0,0. The same shape as app.js's PIN_D, which comes from country-matcher.
  const PIN = 'M0,0 C-5,-12 -16,-19 -16,-30 A16,16 0 1 1 16,-30 C16,-19 5,-12 0,0Z';
  const FLAG = 'M-3.5,7 V-7.5 M-3.5,-7.5 L7,-4 L-3.5,-0.5 Z';
  const INK = '#1f2a44', PIN_RED = '#d9480f', GREEN = '#2b8a3e';
  const pinPath = new Path2D(PIN), flagPath = new Path2D(FLAG);

  // SVG for the answer: the line and a flag in a green disc, placed with setAnswer().
  const answerSvg = `
    <line stroke="${INK}" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round" opacity=".75"/>
    <g class="flag"><circle r="13" fill="${GREEN}" stroke="#fff" stroke-width="3"/>
      <path d="${FLAG}" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>`;
  function setAnswer(layer, [gx, gy], [ax, ay]) {
    layer.querySelector('.flag').setAttribute('transform', `translate(${ax},${ay})`);
    const line = layer.querySelector('line');
    Object.entries({ x1: gx, y1: gy, x2: ax, y2: ay }).forEach(([k, v]) => line.setAttribute(k, v));
  }

  // Canvas versions of the same three, for boards drawn on a canvas.
  function drawPin(ctx, [x, y]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(0, 1, 7, 2.5, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = PIN_RED; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.fill(pinPath); ctx.stroke(pinPath);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -30, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }
  function drawAnswer(ctx, [gx, gy], [ax, ay]) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.translate(ax, ay);
    ctx.fillStyle = GREEN; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.fill(flagPath); ctx.stroke(flagPath);
    ctx.restore();
  }

  globalThis.marks = { answerSvg, setAnswer, drawPin, drawAnswer };
})();
