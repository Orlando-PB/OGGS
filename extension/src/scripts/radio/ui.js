// Radio's player on the page: "stage" in Street View's place, or a "mini" bar top-left. Hides
// Street View, builds the player in a shadow root, wires its buttons and runs its animation.
(() => {
  const ggs = globalThis.__ggs;

  const PANO_SELECTORS = ['[class*="game_panorama"]', '[data-qa="panorama"]'];
  const hidePano = document.createElement('style');
  hidePano.textContent = `
    ${PANO_SELECTORS.join(', ')}, .widget-scene-canvas { visibility: hidden !important; }
    body { background: #0d0a2a !important; }`;
  function showPano(show) {
    if (show) hidePano.remove();
    else (document.head ?? document.documentElement).append(hidePano);
  }

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 5l9 7-9 7zM16 5h2v14h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5l-9 7 9 7zM6 5h2v14H6z"/></svg>',
    vol:
      '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>' +
      '<path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const YELLOW = '#fecd19';
  const GREEN = '#6cb928';
  const CSS = `
    :host { all: initial; visibility: visible !important; color: #fff;
            font: 14px/1.3 neo-sans, var(--default-font, system-ui), system-ui, -apple-system, sans-serif; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    .label { font-size: 11px; font-weight: 700; font-style: italic; letter-spacing: .08em;
             text-transform: uppercase; color: rgba(255, 255, 255, .55); }
    .status { font-size: 13px; color: rgba(255, 255, 255, .85); font-variant-numeric: tabular-nums;
              min-height: 17px; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { all: unset; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
             cursor: pointer; color: #fff; }
    button:hover { background: rgba(255, 255, 255, .12); }
    button.play { background: ${GREEN}; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .2); }
    button.play:hover { background: #7fd13a; }
    svg { width: 18px; height: 18px; fill: currentColor; }
    .vol { display: flex; align-items: center; gap: 6px; margin-left: 4px; color: rgba(255, 255, 255, .6); }
    input[type=range] { width: 90px; accent-color: ${YELLOW}; }
    canvas { display: block; aspect-ratio: 1; cursor: pointer; }

    /* stage: fills the panorama's space, GeoGuessr-purple, outline in the middle */
    :host(.stage) { position: absolute; inset: 0;
                    background: radial-gradient(circle at 50% 42%, #33277e 0%, #1a1450 42%, #0d0a2a 100%); }
    :host(.stage) .wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
                          align-items: center; justify-content: center; gap: 10px; }
    :host(.stage) canvas { width: min(56vh, 48vw, 560px); }
    :host(.stage) .side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    :host(.stage) .info { text-align: center; }
    :host(.stage) .controls { padding: 6px 12px 6px 6px; border-radius: 999px;
                              background: rgba(16, 12, 48, .7); border: 1px solid rgba(255, 255, 255, .12); }
    :host(.stage) .extra { display: none; }

    /* mini: compact bar top-left */
    /* below GeoGuessr's logo */
    :host(.mini) { position: fixed; left: 16px; top: 84px; z-index: 2147483000; }
    :host(.mini) .wrap { display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; align-items: center;
                         width: 330px; padding: 8px 12px 8px 8px; border-radius: 14px;
                         background: linear-gradient(180deg, rgba(60, 48, 140, .85), rgba(22, 17, 62, .9));
                         border: 1px solid rgba(255, 255, 255, .14);
                         box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .7); }
    :host(.mini) canvas { width: 64px; }
    :host(.mini) .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    :host(.mini) .status { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.mini) button { width: 28px; height: 28px; }
    :host(.mini) svg { width: 15px; height: 15px; }
    :host(.mini) input[type=range] { width: 70px; }
    :host(.mini) .extra { grid-column: 1 / -1; }
    .reveal:empty { display: none; }
    .reveal { padding: 8px 4px 2px; border-top: 1px solid rgba(255, 255, 255, .12); margin-top: 4px; }
    .reveal b { display: block; font-size: 15px; font-style: italic; }
    .reveal span { font-size: 12px; color: rgba(255, 255, 255, .65); }`;

  const label = streamerMode => (streamerMode ? 'Talk radio' : 'Live radio');

  // the player's shadow root contents
  const playerHtml = (streamerMode, volume) => `<style>${CSS}</style>
        <div class="wrap">
          <canvas></canvas>
          <div class="side">
            <div class="info">
              <div class="label">${label(streamerMode)}</div>
              <div class="status"></div>
            </div>
            <div class="controls">
              <button class="prev" title="Previous station">${ICON.prev}</button>
              <button class="play">${ICON.pause}</button>
              <button class="next" title="Next station">${ICON.next}</button>
              <label class="vol">${ICON.vol}<input type="range" min="0" max="1" step="0.02" value="${volume}"></label>
            </div>
          </div>
          <div class="extra"><div class="reveal"></div></div>
        </div>`;

  // The player, its buttons calling on.toggle, on.prev, on.next and on.volume(v). Each animation
  // frame on.frame(now) gives { playing, vol, loading, hold } (see visual.js for the last three).
  function player(streamerMode, volume, on) {
    const host = document.createElement('div');
    host.setAttribute('data-ggs-ui', 'radio');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = playerHtml(streamerMode, volume);
    const $ = sel => root.querySelector(sel);
    $('.play').onclick = on.toggle;
    $('canvas').onclick = on.toggle;
    $('.wrap').onclick = e => {
      if (e.target === e.currentTarget) on.toggle();
    };
    $('.prev').onclick = () => {
      draw.flash('back', 600);
      on.prev();
    };
    $('.next').onclick = () => {
      draw.flash('skip', 600);
      on.next();
    };
    $('input').oninput = e => on.volume(+e.target.value);
    const draw = ggs.radio.blob($('canvas'));

    let playing = null;
    let raf = 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      if (host.hidden) return;
      const look = on.frame(now);
      if (look.playing !== playing) {
        playing = look.playing;
        $('.play').innerHTML = playing ? ICON.pause : ICON.play;
      }
      draw(now, look);
    };
    raf = requestAnimationFrame(frame);

    return {
      flash: draw.flash,
      hide(hidden) {
        host.hidden = hidden;
      },
      status: () => $('.status').textContent,
      setStatus(text) {
        $('.status').textContent = text;
      },
      setLabel(streamerMode) {
        $('.label').textContent = label(streamerMode);
      },
      revealed: () => !!$('.reveal').innerHTML,
      reveal(html) {
        $('.reveal').innerHTML = html;
      },
      // on the panorama's spot during a round with Street View hidden, otherwise top-left
      place(inRound, showStreetView) {
        const pano =
          !showStreetView && inRound && PANO_SELECTORS.map(s => document.querySelector(s)).find(Boolean);
        if (pano?.parentElement) {
          if (host.previousElementSibling !== pano) pano.after(host);
          host.className = 'stage';
        } else {
          if (host.parentElement !== document.body) document.body.append(host);
          host.className = 'mini';
        }
      },
      remove() {
        cancelAnimationFrame(raf);
        host.remove();
      },
    };
  }

  ggs.radio ??= {};
  Object.assign(ggs.radio, { showPano, player });
})();
