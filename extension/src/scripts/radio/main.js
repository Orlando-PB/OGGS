// Radio mode: Street View is hidden and a live station near the round's location plays
// instead (stations.js finds them). The audio streams from each station's own server. Nothing
// about the station shows until the guess is in. This file tunes, skips and drives the player.
(() => {
  const ggs = globalThis.__ggs;
  const R = ggs.radio;

  const START_MS = 8000; // a stream that hasn't started playing by now is skipped
  const STALL_MS = 8000; // so is one that has been buffering this long
  const CLICK_TO_START = 'Click anywhere to start the radio';
  const notActivated = () => navigator.userActivation?.hasBeenActive === false;

  function start(cfg) {
    R.showPano(cfg.showStreetView);
    R.muteGame(true);
    const out = R.output();
    let audio = null;
    let node = null;
    let tuning = false;
    let preListen = false;
    let allowMusic = false;
    const music = R.musicCheck();
    let volume = 0.6;
    let watchdog = 0;
    let stallTimer = 0;
    let waitingSince = 0;
    let blocked = false;
    let userPaused = false;
    let skipping = 0;
    let ui = null;
    let lastT = 0;
    let lastMove = 0;
    let live = false;
    let round = null;
    let loc = null;
    let stations = [];
    let idx = 0;

    const setStatus = t => ui.setStatus(t);
    const stationLine = () => `Station ${idx + 1} of ${stations.length}`;
    const stopTimers = () => {
      clearTimeout(watchdog);
      clearTimeout(stallTimer);
    };

    // ---- the player ----
    function create() {
      ui = R.player(cfg.streamerMode, volume, {
        toggle: togglePlay,
        prev: () => tune(idx - 1),
        next: () => tune(idx + 1),
        volume(v) {
          volume = v;
          if (audio) audio.volume = volume;
        },
        frame,
      });
    }

    function togglePlay() {
      if (!audio) return;
      if (audio.paused) {
        userPaused = false;
        out.resume();
        audio.play().catch(() => {});
        ui.flash('play', 700);
      } else {
        userPaused = true;
        audio.pause();
      }
    }

    function frame(now) {
      const t = audio?.currentTime ?? 0;
      if (t !== lastT) {
        lastT = t;
        lastMove = now;
      }
      live = !!audio && !audio.paused && now - lastMove < 400; // sound is arriving
      const playing = !!audio && !audio.paused;
      const vol = loudness(now, t);
      showWaiting();
      return {
        playing,
        vol,
        loading: tuning || (!!waitingSince && !blocked) || preListen,
        hold: userPaused && audio?.paused ? 'pause' : null,
      };
    }

    // loudness: measured when the stream allows it (CORS), otherwise a made-up wobble
    function loudness(now, t) {
      if (node && live) {
        const rms = out.rms();
        if (cfg.streamerMode && !allowMusic && !skipping) listenForMusic(rms, now);
        return Math.min(1, rms * 4);
      }
      if (live) return 0.3 + 0.25 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 1));
      return 0;
    }

    function listenForMusic(rms, now) {
      const heard = music.hear(rms, out.bass(), now, preListen);
      if (heard === 'music') musicSkip();
      else if (heard === 'talk') unmute();
    }

    function showWaiting() {
      const wait = waitingSince && !blocked ? (Date.now() - waitingSince) / START_MS : 0;
      if (wait) {
        const left = Math.max(0, Math.ceil((START_MS / 1000) * (1 - wait)));
        setStatus(`${stationLine()} · waiting for audio ${left}s`);
      } else if (live && cfg.streamerMode && !skipping) {
        const text = stationLine() + musicNote();
        if (ui.status() !== text) setStatus(text);
      }
    }

    function musicNote() {
      if (allowMusic) return '';
      if (!node) return " · can't check this one for music";
      return preListen ? ' · checking for music…' : '';
    }

    // ---- the stream ----
    function drop() {
      if (!audio) return;
      const a = audio;
      audio = null;
      a.onerror = a.onplaying = a.onwaiting = a.onstalled = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
      node?.disconnect();
      node = null;
    }

    // With CORS first (so the sound can be read); if the stream refuses, again without.
    function load(url, cors, startPaused = false) {
      drop();
      const a = out.element(volume);
      audio = a;
      node = cors ? out.connect(a) : null;
      const readable = !!node;
      preListen = readable && !!cfg.streamerMode && !allowMusic;
      out.silent(preListen);
      let failed = false;
      const fail = () => {
        if (failed || a !== audio) return;
        failed = true;
        // without CORS streamer mode can't check it, so prefer stations it can
        if (readable && cfg.streamerMode && !allowMusic && !startPaused && tryCheckable()) return;
        if (readable) load(url, false, startPaused);
        else skip('stream failed');
      };
      a.onerror = fail;
      a.onplaying = () => {
        stopTimers();
        waitingSince = 0;
        setStatus(stationLine());
      };
      a.onwaiting = a.onstalled = () => {
        clearTimeout(stallTimer);
        if (!a.paused && !waitingSince) waitingSince = Date.now();
        stallTimer = setTimeout(() => a === audio && !a.paused && skip('stopped'), STALL_MS);
      };
      a.src = url;
      if (startPaused) return;
      out.resume()?.catch(() => {});
      a.play().catch(err => {
        if (a !== audio) return;
        if (err.name !== 'NotAllowedError') return fail();
        // no click on the page yet: start on the first one
        blocked = true;
        clearTimeout(watchdog);
        setStatus(CLICK_TO_START);
      });
    }

    function tune(i, { paused = false } = {}) {
      if (!stations.length) return;
      idx = ((i % stations.length) + stations.length) % stations.length;
      resetStation(paused);
      if (cfg.streamerMode && !paused && notActivated()) {
        // the music check needs a click first, so wait rather than play unchecked
        blocked = true;
        waitingSince = 0;
        return setStatus(CLICK_TO_START);
      }
      const url = stations[idx].url_resolved;
      const cors = !setFor(uncheckableFor).has(stations[idx]);
      if (paused) {
        waitingSince = 0;
        load(url, cors, true);
        return setStatus('Only music stations nearby · press play to hear it anyway');
      }
      waitingSince = Date.now();
      watchdog = setTimeout(() => {
        if (!blocked && (!audio || audio.currentTime < 0.5)) skip('no audio');
      }, START_MS);
      load(url, cors);
    }
    function resetStation(paused) {
      music.reset();
      userPaused = paused;
      allowMusic = paused;
      clearTimeout(skipping);
      skipping = 0;
      ui.reveal('');
      stopTimers();
      blocked = false;
    }
    function unmute() {
      preListen = false;
      out.fadeIn();
    }

    // Music in streamer mode: skip to the next station not yet caught playing music. If all
    // have been, go back to the first one, paused.
    const flaggedFor = new WeakMap(); // station list -> stations caught playing music
    const uncheckableFor = new WeakMap(); // station list -> stations whose sound can't be read
    const setFor = map => {
      const set = map.get(stations) ?? new Set();
      map.set(stations, set);
      return set;
    };
    // Moves an uncheckable station to the back. False if no checkable one is left after it.
    function tryCheckable() {
      const st = stations[idx];
      const bad = setFor(uncheckableFor);
      const music = setFor(flaggedFor);
      bad.add(st);
      if (!stations.slice(idx + 1).some(s => !bad.has(s) && !music.has(s))) return false;
      stations.splice(idx, 1);
      stations.push(st);
      let j = idx;
      while (bad.has(stations[j]) || music.has(stations[j])) j++;
      tune(j);
      return true;
    }
    function musicSkip() {
      const flagged = setFor(flaggedFor);
      flagged.add(stations[idx]);
      audio?.pause();
      ui?.flash('skip', 900);
      setStatus('Music detected, skipping…');
      const next = nextUnflagged(flagged);
      skipping = setTimeout(() => {
        skipping = 0;
        if (next != null) return tune(next);
        tune(
          stations.findIndex(s => flagged.has(s)),
          { paused: true },
        );
      }, 600);
    }
    // the next station after this one not caught playing music, or null
    function nextUnflagged(flagged) {
      for (let k = 1; k < stations.length; k++) {
        const j = (idx + k) % stations.length;
        if (!flagged.has(stations[j])) return j;
      }
      return null;
    }
    function skip(why) {
      if (stations.length < 2) {
        waitingSince = 0;
        return setStatus(`Station ${why}`);
      }
      tune(idx + 1);
    }
    const unblock = () => {
      if (!blocked) return;
      out.resume()?.catch(() => {});
      tune(idx);
    };
    window.addEventListener('pointerdown', unblock, true);
    window.addEventListener('keydown', unblock, true);

    // ---- rounds ----
    async function newRound(key) {
      round = key;
      clearRound();
      const found = await ggs.game.roundLocation().catch(() => null);
      // A newer round took over during the wait, so this one's results are dropped.
      if (round !== key) return;
      loc = found;
      if (!loc) {
        tuning = false;
        return setStatus(ggs.game.whyNoRound() || 'No location for this round');
      }
      const { list, failed } = await searchStations();
      if (round !== key) return;
      stations = list;
      tuning = false;
      playFound(failed);
    }
    function playFound(failed) {
      if (failed) {
        ggs.log('radio: station search failed', failed);
        return setStatus(`Station search failed (${failed.message})`);
      }
      if (!stations.length) return setStatus(noStations());
      tune(0);
    }
    function clearRound() {
      stations = [];
      loc = null;
      drop();
      stopTimers();
      waitingSince = 0;
      blocked = false;
      ui.reveal('');
      setStatus('Tuning…');
      tuning = true;
    }
    const searchStations = () =>
      R.findStations(loc.lat, loc.lng, !!cfg.streamerMode).then(
        list => ({ list }),
        failed => ({ list: [], failed }),
      );
    const noStations = () => (cfg.streamerMode ? 'No talk station found nearby' : 'No station found nearby');

    // Result screens: the guess is in, so name the station.
    function reveal() {
      const s = stations[idx];
      if (s && !ui.revealed()) {
        ui.reveal(`<b>${ggs.esc(s.name.trim())}</b><span>${ggs.esc(R.describe(s, loc))}</span>`);
      }
    }

    function leaveGame() {
      drop();
      ui?.hide(true);
      round = null;
    }
    function showRound(inRound) {
      ui.hide(false);
      ui.place(inRound, cfg.showStreetView);
      const key = ggs.game.roundKey();
      if (inRound && key !== round) newRound(key);
      if (!inRound) reveal();
    }
    const tick = setInterval(() => {
      const inGame = !!ggs.game.context();
      const inRound = !!ggs.maps.guessMapElement();
      if (!inGame) return leaveGame();
      if (inRound && !ui) create();
      if (ui) showRound(inRound);
    }, 500);

    return {
      update(next) {
        if (!!next.showStreetView !== !!cfg.showStreetView) R.showPano(next.showStreetView);
        const retune = !!next.streamerMode !== !!cfg.streamerMode;
        cfg = next;
        ui?.setLabel(cfg.streamerMode);
        if (retune) round = null; // retune this round
      },
      stop() {
        clearInterval(tick);
        clearTimeout(skipping);
        window.removeEventListener('pointerdown', unblock, true);
        window.removeEventListener('keydown', unblock, true);
        stopTimers();
        drop();
        out.close();
        R.muteGame(false);
        ui?.remove();
        R.showPano(true);
      },
    };
  }

  ggs.scripts.radio = { start };
})();
