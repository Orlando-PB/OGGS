// Fake lag's hold on Street View itself: whether a round is on, where the panorama is, chunky
// or grey tiles while loading is faked, and the panorama object (for rubber-banding and stutter).
(() => {
  const ggs = globalThis.__ggs;
  const inRound = () => !!ggs.maps.guessMapElement() && !!ggs.view.panoElement();
  const panoRect = () => ggs.view.panoElement()?.getBoundingClientRect() ?? null;

  // ---- chunky tiles (core/tiles.js) ----
  // While `chunk` is set, each tile is drawn from a copy `chunk` times smaller, and a few are left
  // grey or blurred as if still loading.
  // A whole-texture upload gets the small copy itself, sized to a power of two (so WebGL 1 can
  // still mipmap and wrap it) and magnified NEAREST. That is next to free, where a full-size copy
  // of every tile stalled the game for up to a second. LINEAR (the default, and what Street View
  // uses) comes back with the full tile. It isn't read back with gl.getTexParameter, which waits
  // for the GPU process.
  // Partial uploads (texSubImage2D, or a mip level) must keep their size, so they get a full-size
  // copy.
  let chunk = 0;
  let greyShare = 0;
  const GREY = '#8e9094';
  const pot = n => 2 ** Math.max(0, Math.round(Math.log2(n)));
  const sharp = new WeakSet(); // textures drawn NEAREST
  function nearest(rec, on) {
    const { gl, tex, target } = rec;
    if (on === sharp.has(tex)) return;
    const prev = gl.getParameter(ggs.glBinding(gl, target)[1]);
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : gl.LINEAR);
    gl.bindTexture(target, prev);
    if (on) sharp.add(tex);
    else sharp.delete(tex);
  }
  // One canvas per size, reused. A whole-texture upload copies it before the filter runs again,
  // and nothing after this filter keeps it, so hundreds of tiles don't leave hundreds of canvases.
  const scratches = new Map();
  function scratch(w, h) {
    const key = `${w}x${h}`;
    if (!scratches.has(key)) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').globalCompositeOperation = 'copy'; // each tile replaces the last
      scratches.set(key, c);
    }
    return scratches.get(key);
  }
  function lowRes(rec, source) {
    const w = source.naturalWidth || source.width || 512;
    const h = source.naturalHeight || source.height || 512;
    const whole = rec.name === 'texImage2D' && rec.args[1] === 0;
    const r = Math.random();
    const grey = r < greyShare;
    const blurry = !grey && r < 2 * greyShare;
    const k = blurry ? 48 : chunk;
    const size = n => (grey ? 1 : whole ? pot(n / k) : Math.max(1, Math.round(n / k)));
    const small = whole ? scratch(size(w), size(h)) : new OffscreenCanvas(size(w), size(h));
    const g = small.getContext('2d');
    if (grey) {
      g.fillStyle = GREY;
      g.fillRect(0, 0, 1, 1);
    } else {
      g.drawImage(source, 0, 0, small.width, small.height);
    }
    if (whole) {
      nearest(rec, !grey && !blurry);
      return small;
    }
    const out = new OffscreenCanvas(w, h);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = blurry;
    o.drawImage(small, 0, 0, w, h);
    return out;
  }
  ggs.tiles.filter((rec, source) => {
    if (chunk) return lowRes(rec, source);
    if (sharp.has(rec.tex)) nearest(rec, false);
    return source;
  }, 5); // after greyscale (4)

  // Sets the tiles' coarseness (`chunk` times smaller, 0 for normal) and how many are left grey
  // or blurred, then redraws the tiles already on screen.
  function setChunky(size, grey = greyShare) {
    chunk = size;
    greyShare = grey;
    ggs.tiles.replay();
  }
  const chunky = {
    start: setChunky,
    // halves the coarseness, like tiles coming in at a better resolution
    sharpen: grey => setChunky(Math.max(2, chunk >> 1), grey),
    end: () => setChunky(0, 0),
  };

  // ---- panoramas, for rubber-banding and stutter ----
  ggs.lag ??= {};
  ggs.lag.onMove = null; // the running script's pano_changed handler
  ggs.maps.hook('StreetViewPanorama', p => {
    window.google.maps.event.addListener(p, 'pano_changed', () => ggs.lag.onMove?.(p));
  });
  const pano = () => ggs.maps.panoramaAt(ggs.view.panoElement());

  Object.assign(ggs.lag, { inRound, panoRect, chunky, pano });
})();
