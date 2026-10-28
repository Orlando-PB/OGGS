// Max zoom: every panorama is held fully zoomed in, with the zoom input blocked (core/lock.js).
// The Maps API takes what it can of ZOOM, so this is its own most zoomed-in view.
(() => {
  const ggs = globalThis.__ggs;
  const ZOOM = 5;
  ggs.scripts.maxzoom = {
    start() {
      ggs.lock.zoomTo('maxzoom', ZOOM);
      return { stop: () => ggs.lock.zoomTo('maxzoom', null) };
    },
  };
})();
