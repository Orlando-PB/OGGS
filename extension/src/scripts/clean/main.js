// Clean map: one stylesheet hides, each behind its own option, the small Google overlays on both
// maps (the Terms / Map data / Keyboard shortcuts strip and the Google logo), the GeoGuessr logo,
// and the round scores plus the "N playing" count. Only their display changes. Google's key
// handlers sit on the map element, so the shortcuts still work.
(() => {
  const ggs = globalThis.__ggs;
  const GOOGLE = [
    // Terms, Map data, Keyboard shortcuts (both maps)
    '.gm-style-cc',
    // Google logo. The map and Street View build it differently, so match the link's href, title
    // or label, or the image itself. Not scoped to .gm-style, as the panorama's copy can sit outside.
    'a[href*="google.com/maps"]',
    'a[title^="Open this area in Google Maps"]',
    'a[aria-label^="Open this area in Google Maps"]',
    'a:has(> img[alt="Google"])',
    'img[alt="Google"]',
    // Street View address card
    '.gm-style .gm-iv-address',
    // GeoGuessr's own copy of the logo over Street View
    'img[alt="Google Maps Logo"]',
    'img[src*="google-logo"]',
  ];
  // GeoGuessr class names are CSS-module hashed, so match on the prefix.
  const LOGO = [
    '[class*="header_logo"]',
    '[class*="game_logo"]',
    'a[href="/"] img[alt="GeoGuessr"]',
    'img[alt="GeoGuessr"]',
  ];
  // The scores panel top right (class seen 2026-09) and the "N playing" count beside it.
  // markScores() also finds both by their text, so they stay hidden if the classes are renamed.
  const SCORES = ['[class*="rounds-status_panel"]', '[class*="live-players-count_"]', '[data-ggs-clean]'];
  const HIDDEN = 'data-ggs-clean';

  const rule = sels => `${sels.join(',\n')} { display: none !important; }\n`;
  const css = cfg =>
    (cfg.google ? rule(GOOGLE) : '') + (cfg.logo ? rule(LOGO) : '') + (cfg.progress ? rule(SCORES) : '');

  // Scores: the smallest element holding both a "Round" and a "Total" label, at most 600px wide
  // so a page-sized ancestor is never picked.
  const LABEL = /^(round|total)$/i;
  // The "316 playing" count: the leaf holding it, or its parent when the number and the word are
  // split across two leaves.
  const PLAYING = /^[\d,.]+\s*k?\s+playing$/i;
  function markScores() {
    const leaves = [...document.querySelectorAll('div, span, p')].filter(e => e.children.length === 0);
    const playing = leaves.filter(e => {
      const t = e.textContent.trim();
      return /^playing$/i.test(t) || PLAYING.test(t);
    });
    for (const l of playing) {
      const p = l.parentElement;
      (p && p !== document.body && PLAYING.test(p.textContent.trim()) ? p : l).setAttribute(HIDDEN, '');
    }
    const labels = leaves.filter(e => LABEL.test(e.textContent.trim()));
    for (const l of labels) {
      for (let e = l.parentElement; e && e !== document.body; e = e.parentElement) {
        const t = e.textContent;
        if (/\bRound\b/i.test(t) && /\bTotal\b/i.test(t)) {
          if (e.getBoundingClientRect().width <= 600) e.setAttribute(HIDDEN, '');
          break;
        }
      }
    }
  }

  function start(cfg) {
    const style = document.createElement('style');
    style.textContent = css(cfg);
    document.documentElement.appendChild(style);
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(markScores, 150);
    });
    const watch = on => {
      obs.disconnect();
      if (!on) return;
      markScores();
      obs.observe(document.body, { childList: true, subtree: true });
    };
    watch(cfg.progress);
    ggs.debug('clean on', cfg);
    return {
      stop() {
        style.remove();
        watch(false);
        clearTimeout(timer);
      },
      update(next) {
        style.textContent = css(next);
        watch(next.progress);
      },
    };
  }
  ggs.scripts.clean = { start };
})();
