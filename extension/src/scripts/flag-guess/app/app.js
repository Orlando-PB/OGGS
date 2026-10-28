// Draw the flag: the paint board inside flag-guess's iframe. You paint a flag with a few colours
// and it's matched against every flag in flags.json (built by dev/tools/build_flags.mjs). The best
// match's outline (draw-guess's geo.json) is then shown to click your guess into. The guess goes
// up to the page (main.js), which puts it on GeoGuessr's hidden map and presses Guess.
// Talks to the page only by postMessage. Up: 'ready', 'height', 'guess', and 'done' after the
// zoom out to the right spot. Down: 'reset', 'answer', and 'strict' (guess must go inside the
// matched country).
// Suggested by @Dilbot447 on YouTube.
// Part 5 of 5: the stages and the wiring. paint.js, match.js, map.js and raise.js come first.
let stage = 'draw';
let chosen = null;
// the page sends the setting on start
let strict = true;
// the round's real spot
let answerLL = null;

// draw -> raise (the flag goes up a pole) -> pick (click in the outline) -> done
const TIPS = { draw: 'Paint the flag', raise: 'Raising your flag…', done: 'Guess placed' };
function setStage(s) {
  stage = s;
  const drawing = s === 'draw';
  const named = s === 'pick' || s === 'done';
  for (const id of ['drawBar', 'palette', 'drawGo']) $(id).hidden = !drawing;
  paper.hidden = !drawing;
  pick.hidden = !named;
  pole.hidden = !(s === 'raise' || s === 'pick');
  $('pickBar').hidden = s !== 'pick';
  for (const id of ['mini', 'name', 'yours']) $(id).hidden = !named;
  $('score').textContent = named ? `${chosen.score}% match` : '';
  $('tip').textContent = s === 'pick' ? pickTip() : TIPS[s];
  if (drawing && data) show();
}

const pickTip = () =>
  strict ? `Click where in ${chosen.name} you think you are` : 'Click where you think you are';

// The matched country's real flag, and beside the score the painting, to compare with it.
function showMini(f) {
  const m = $('mini');
  const [sx, sy] = spriteAt(f.code);
  m.getContext('2d').clearRect(0, 0, m.width, m.height);
  m.getContext('2d').drawImage(sprite, sx, sy, SPRITE_W, SPRITE_H, 0, 0, m.width, m.height);
  $('name').textContent = f.name;
  const y = $('yours').getContext('2d');
  y.clearRect(0, 0, y.canvas.width, y.canvas.height);
  y.drawImage(paper, 0, 0, y.canvas.width, y.canvas.height);
}

function choose(r) {
  chosen = r;
  pin = answerAt = null;
  // England, Scotland and Wales use the UK outline
  view = makeView(r.country ?? r.code);
  view.at = view.start;
  showMini(r);
  $('guess').disabled = true;
  setStage('pick');
  drawPick();
}

async function findCountry() {
  if ($('match').disabled) return;
  $('match').disabled = true;
  await Promise.all([ready, geoReady, spriteReady]);
  // a new round may have reset the board meanwhile, here and after raise()
  if (stage !== 'draw') return;
  const best = bestMatch();
  await raise(best);
  if (stage !== 'raise') return;
  choose(best);
  // the pole fades, uncovering the outline, then goes
  pole.classList.add('out');
  setTimeout(() => {
    if (stage !== 'raise') pole.hidden = true;
  }, 700);
}
$('match').addEventListener('click', findCountry);

pick.addEventListener('pointerdown', e => {
  if (stage !== 'pick' || e.button !== 0) return;
  const r = pick.getBoundingClientRect();
  const p = [((e.clientX - r.left) / r.width) * pick.width, ((e.clientY - r.top) / r.height) * pick.height];
  if (strict && !inCountry(p)) {
    $('tip').textContent = `Click inside ${chosen.name}`;
    return;
  }
  // without strict, anywhere: over the border or out to sea
  pin = fromScreen(p);
  $('tip').textContent = '';
  $('guess').disabled = false;
  drawPick();
});

function submit() {
  if (stage !== 'pick' || !pin) return;
  toParent({ ggs: 'guess', guess: view.back(pin) });
  setStage('done');
  showAnswer().then(ok => ok && toParent({ ggs: 'done' }));
}
$('guess').addEventListener('click', submit);

const TOOL_KEYS = { q: 'fine', w: 'medium', e: 'thick', f: 'fill' };
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
    e.preventDefault();
    $(key === 'y' || e.shiftKey ? 'redo' : 'undo').click();
    return;
  }
  if (e.key === 'Enter') return stage === 'draw' ? findCountry() : submit();
  if (stage !== 'draw') return;
  // 1, 2, ... pick a colour; Q, W, E, F a tool
  const n = Number(e.key);
  if (n >= 1 && n <= pots.length) setColor(n - 1);
  else if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
});

window.addEventListener('message', e => {
  if (e.source !== parent) return;
  const d = e.data ?? {};
  if (d.ggs === 'reset') {
    runId++;
    ready.then(clearPaper);
    setStage('draw');
  }
  if (d.ggs === 'strict') strict = !!d.on;
  if (d.ggs === 'answer') answerLL = typeof d.lat === 'number' ? { lat: d.lat, lng: d.lng } : null;
});

// The page sizes the frame to the board (plus the body's 10px padding top and bottom).
const board = document.querySelector('.board');
const boardHeight = () => Math.ceil(board.getBoundingClientRect().height) + 20;
new ResizeObserver(() => toParent({ ggs: 'height', h: boardHeight() })).observe(board);
setStage('draw');
ready.then(() => toParent({ ggs: 'ready' }));
