// Starts and stops each script to match the settings, live. In competitive games
// (ggs.game.competitive) every script is stopped, whatever the settings say.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null, blocked = false, path = null, check = 0;

  function apply() {
    if (!settings) return;
    for (const meta of ggs.registry) {
      const impl = ggs.scripts[meta.id];
      if (!impl) { ggs.log(`no implementation loaded for "${meta.id}"`); continue; }
      const cfg = ggs.config(meta, settings);
      const on = cfg.enabled && !blocked;
      const inst = running.get(meta.id);
      try {
        if (on && !inst) {
          running.set(meta.id, impl.start(cfg));
          ggs.debug(`started ${meta.id}`);
        } else if (!on && inst) {
          inst.stop();
          running.delete(meta.id);
          ggs.debug(`stopped ${meta.id}`);
        } else if (inst) {
          inst.update?.(cfg);
        }
      } catch (err) {
        ggs.log(`${meta.id} failed`, err);
      }
    }
  }

  // Single-page app, so watch the path. A game that might be competitive is blocked at
  // once and only unblocked when the check says it's friendly.
  function onPath() {
    if (location.pathname === path) return;
    path = location.pathname;
    ggs.game.noteLobby(path);
    const ctx = ggs.game.context();
    const maybe = ctx && ctx.mode !== 'standard' && ctx.mode !== 'challenge';
    if (maybe && !blocked) { blocked = true; apply(); }
    const id = ++check;
    ggs.game.competitive().then(({ competitive, why }) => {
      if (id !== check) return;
      if (competitive || maybe) ggs.debug(competitive ? 'competitive game: all scripts off' : 'friendly game: scripts on', why);
      if (competitive !== blocked) { blocked = competitive; apply(); }
    });
  }
  setInterval(onPath, 500);

  ggs.onSettings(all => {
    settings = all;
    onPath();
    apply();
  });
})();
