// Scream to look: a paper sheet over Street View (core/view.js) with one eye-shaped hole, shut
// when it's quiet. Loudness opens it: a little noise a crack, a scream all the way. It opens
// smoothly and snaps shut. The sound is only measured (an AnalyserNode in this page), never
// recorded or sent. Without a microphone, or when it's refused, the eye stays open.
(() => {
  const ggs = globalThis.__ggs;
  const RANGE_DB = 25; // from a crack to wide open
  const SHUT_STEP = 0.15; // closing speed, per frame
  const GESTURES = ['pointerdown', 'keydown'];

  // the opening between the lids: two curves from far past the sides, apart by `open` (0..1)
  function lids(w, h, open) {
    const n = v => Math.round(v);
    const y = h / 2;
    const bulge = 1.5 * h * open;
    const l = -0.3 * w;
    const r = 1.3 * w;
    return (
      `M${n(l)} ${n(y)}Q${n(w / 2)} ${n(y - bulge)} ${n(r)} ${n(y)}` +
      `Q${n(w / 2)} ${n(y + bulge)} ${n(l)} ${n(y)}Z`
    );
  }

  function start(cfg) {
    let sensitivity = cfg.sensitivity ?? 5;
    let open = 0;
    let stopped = false;
    let stream = null;
    let audio = null;
    let analyser = null;
    let track = null;
    let raf = 0;
    // switched itself off: its message stays for the popup to show
    let blocked = false;
    const status = text => ggs.status('eye', text);
    status('');

    // No sheet unless the microphone is really heard, so silence from a paused page or a
    // lost microphone never keeps the view covered.
    const hearing = () =>
      analyser && audio.state === 'running' && track?.readyState === 'live' && !track.muted;
    const mask = ggs.view.mask({
      over: 'pano',
      look: 'paper',
      cut: (w, h) => (!hearing() || open > 0.98 ? null : lids(w, h, open)),
    });

    const resume = () => {
      audio?.resume().catch(() => {});
    };
    const onState = () => {
      if (stopped) return;
      const running = audio.state === 'running';
      for (const t of GESTURES) window[running ? 'removeEventListener' : 'addEventListener'](t, resume, true);
      status(running ? micState() : 'Click the page to start listening, the eye is open until then');
    };
    function micState() {
      if (track.readyState !== 'live') return 'Microphone lost, so the eye stays open';
      if (track.muted) return 'Microphone muted, so the eye stays open';
      return 'Listening';
    }

    const buf = new Float32Array(1024);
    function frame() {
      raf = requestAnimationFrame(frame);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const db = 10 * Math.log10(sum / buf.length + 1e-12);
      const floor = -20 - 3 * sensitivity; // 5: normal talking opens it a crack
      const want = Math.max(0, Math.min(1, (db - floor) / RANGE_DB));
      open = want > open ? open + (want - open) * 0.3 : Math.max(want, open - SHUT_STEP);
    }

    // refused: it switches itself off rather than stay on doing nothing
    function micFailed(err) {
      if (err?.name === 'NotAllowedError') {
        blocked = true;
        ggs.saveSetting('eye', { enabled: false });
        status('Microphone blocked, so it was switched off');
      } else {
        status('No microphone, so the eye stays open');
      }
    }

    function listen() {
      audio = new AudioContext();
      const a = audio.createAnalyser();
      a.fftSize = buf.length;
      audio.createMediaStreamSource(stream).connect(a);
      analyser = a;
      track = stream.getAudioTracks()[0];
      for (const t of ['ended', 'mute', 'unmute']) track?.addEventListener(t, onState);
      audio.addEventListener('statechange', onState);
      onState();
      frame();
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        mask.stop();
        if (!stopped) micFailed(err);
        return;
      }
      if (stopped) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      listen();
    })();

    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        mask.stop();
        for (const t of GESTURES) window.removeEventListener(t, resume, true);
        if (stream) for (const t of stream.getTracks()) t.stop();
        audio?.close().catch(() => {});
        if (!blocked) status('');
      },
      update(next) {
        sensitivity = next.sensitivity ?? 5;
      },
    };
  }
  ggs.scripts.eye = { start };
})();
