// Starts and stops each script to match the settings, live.
// In competitive games (ggs.game.competitive) every script is stopped.
// Scripts that exclude each other never run together. The first one in the registry wins.
// While Chaos mode runs, scripts outside Controls and UI follow ggs.chaos.mix() instead.
(() => {
  const ggs = globalThis.__ggs;
  const running = new Map(); // id -> { stop, update? }
  let settings = null;
  let blocked = false;
  let path = null;
  let check = 0;

  function apply() {
    if (!settings) return;
    const chaos =
      !blocked &&
      ggs.chaos &&
      ggs.config(
        ggs.registry.find(m => m.id === 'chaos'),
        settings,
      ).enabled;
    const live = chaos ? ggs.chaos.mix(settings) : settings;
    const on = new Map(); // id -> meta, for scripts switched on in this pass
    for (const meta of ggs.registry) {
      if (meta.ui) continue; // a settings-only entry, no script behind it
      const impl = ggs.scripts[meta.id];
      if (!impl) {
        ggs.log(`no implementation loaded for "${meta.id}"`);
        continue;
      }
      const cfg = ggs.config(meta, live);
      const clash = [...on.values()].some(
        m => m.excludes?.includes(meta.id) || meta.excludes?.includes(m.id),
      );
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
    if (maybe && !blocked) {
      blocked = true;
      apply();
    }
    const id = ++check;
    ggs.game.competitive().then(({ competitive, why }) => {
      if (id !== check) return;
      if (competitive || maybe) {
        ggs.debug(competitive ? 'competitive game: all scripts off' : 'friendly game: scripts on', why);
      }
      if (competitive !== blocked) {
        blocked = competitive;
        apply();
      }
    });
  }

  // The game mode goes out as the '_mode' status line, so the form can hide options
  // that do nothing in it (an option's hideIn).
  let mode = null;
  setInterval(() => {
    onPath();
    const now = ggs.game.context()?.mode ?? '';
    if (now !== mode) {
      mode = now;
      ggs.status('_mode', mode);
    }
  }, 500);

  // An empty heartbeat for the "playing now" count on the OGGS stats card (server/card.php):
  // no id, settings or game data, only sent while the tab is visible and the game isn't
  // competitive.
  const ping = () => {
    if (document.visibilityState !== 'visible' || blocked) return;
    fetch('https://oggs.orlandopb.com/ping.php', {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
    }).catch(() => {});
  };
  setTimeout(ping, 5000);
  setInterval(ping, 2 * 60 * 1000);

  // Chaos mode calls this when its effects change.
  ggs.reapply = apply;
  ggs.onSettings(all => {
    settings = all;
    onPath();
    apply();
  });
})();
