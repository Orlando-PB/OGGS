// Starts and stops each script to match the settings, live. In competitive games
// (ggs.game.competitive) every script is stopped, whatever the settings say. Scripts that
// can't run together (a meta's `excludes`, either way round) never do: the first one in the
// registry wins, whatever the stored settings say.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null, blocked = false, path = null, check = 0;

  function apply() {
    if (!settings) return;
    const on = new Map(); // id -> meta, for scripts switched on in this pass
    for (const meta of ggs.registry) {
      if (meta.ui) continue; // a settings-only entry, no script behind it
      const impl = ggs.scripts[meta.id];
      if (!impl) { ggs.log(`no implementation loaded for "${meta.id}"`); continue; }
      const cfg = ggs.config(meta, settings);
      const clash = [...on.values()].some(m => m.excludes?.includes(meta.id) || meta.excludes?.includes(m.id));
      const wanted = cfg.enabled && !blocked && !clash;
      if (wanted) on.set(meta.id, meta);
      const inst = running.get(meta.id);
      try {
        if (wanted && !inst) {
          running.set(meta.id, impl.start(cfg));
          ggs.debug(`started ${meta.id}`);
        } else if (!wanted && inst) {
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
  // The game mode goes out like a status line ('_mode'), so the settings form can hide
  // options that do nothing in it (an option's hideIn).
  let mode = null;
  setInterval(() => {
    onPath();
    const now = ggs.game.context()?.mode ?? '';
    if (now !== mode) ggs.status('_mode', mode = now);
  }, 500);

  ggs.onSettings(all => {
    settings = all;
    onPath();
    apply();
  });
})();
