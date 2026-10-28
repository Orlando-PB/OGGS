// Blind map: a plain tile layer over the guess map, the whole world in view, and dragging,
// zooming and the controls off. It's an overlay map type, so it works with any map style, and
// pins and lines still draw on top. The view is reset whenever the map resizes (it grows on
// hover) or GeoGuessr resets its options.
(() => {
  const ggs = globalThis.__ggs;
  const WORLD = { north: 72, south: -58, west: -180, east: 180 };
  const LOCKED = {
    gestureHandling: 'none',
    disableDefaultUI: true,
    keyboardShortcuts: false,
    disableDoubleClickZoom: true,
    scrollwheel: false,
    draggable: false,
  };

  let tile = null;
  function blankTile() {
    if (!tile) {
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const g = c.getContext('2d');
      g.fillStyle = '#e9e4d8';
      g.fillRect(0, 0, 256, 256);
      tile = c.toDataURL();
    }
    return tile;
  }

  function lockView(ctx) {
    const { map } = ctx, div = map.getDiv(), size = `${div.offsetWidth}x${div.offsetHeight}`;
    if (size !== ctx.size || map.get('draggable') !== false) {
      ctx.size = size;
      map.setOptions(LOCKED);
      map.fitBounds(WORLD, 0);
    }
  }

  ggs.scripts.blind = ggs.aid('blind', {
    usesLocation: false,
    attach({ map, gm }) {
      // GeoGuessr's own values, put back on stop
      const saved = Object.fromEntries(Object.keys(LOCKED).map(k => [k, map.get(k)]));
      const layer = new gm.ImageMapType({
        getTileUrl: blankTile,
        tileSize: new gm.Size(256, 256),
        name: 'blind',
      });
      map.overlayMapTypes.push(layer);
      return () => {
        const i = map.overlayMapTypes.getArray().indexOf(layer);
        if (i >= 0) map.overlayMapTypes.removeAt(i);
        map.setOptions(saved);
      };
    },
    // a new round has cleared the lines
    round(ctx) { ctx.grid = null; },
    tick(ctx) {
      lockView(ctx);
      // grid lines follow the option live
      if (!!ctx.cfg.grid === !!ctx.grid) return;
      if (ctx.grid) {
        ctx.grid.forEach(ctx.remove);
        ctx.grid = null;
        return;
      }
      const faint = { strokeOpacity: .18, strokeWeight: 1 };
      const line = shape => ctx.grid.push(ctx.add({ ...shape, ...faint }));
      ctx.grid = [];
      for (let lat = -60; lat <= 60; lat += 30) line(ggs.aid.latLine(lat));
      for (let lng = -150; lng <= 180; lng += 30) line(ggs.aid.lngLine(lng));
    },
  });
})();
