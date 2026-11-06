// Radio's sound plumbing: silences GeoGuessr's own music and sounds while radio mode is on,
// routes a station through an analyser so its loudness and bass can be read, and keeps the
// recent readings that tell music from talk in streamer mode.
(() => {
  const ggs = globalThis.__ggs;

  // ---- silence GeoGuessr's own music and sounds while radio mode is on ----
  // Wrapped at document_start so every AudioContext and media element the page makes is
  // seen. While `muting`, contexts are suspended and other <audio>/<video> elements muted.
  // Only what radio itself suspended or muted is restored afterwards, and everything is held
  // weakly so the page's contexts and elements can still be garbage collected.
  const RealAudioContext = window.AudioContext;
  const contexts = weakList();
  const ours = new WeakSet(); // radio's own, and other OGGS scripts' (see exempt)
  const suspendedByUs = new WeakSet(); // contexts to resume when radio stops
  let mutedByUs = weakList(); // media elements to unmute when radio stops
  let howlerByUs = false;
  let muting = false;
  const realSuspend = (RealAudioContext ?? window.webkitAudioContext)?.prototype.suspend;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Orig = window[name];
    if (!Orig) continue;
    window[name] = class extends Orig {
      constructor(...args) {
        super(...args);
        contexts.add(this);
        if (muting) hush(this);
      }
    };
    const { resume, suspend } = Orig.prototype;
    // While muting, the page's resume is held back and done when radio stops instead.
    Orig.prototype.resume = function (...args) {
      if (!muting || ours.has(this)) return resume.apply(this, args);
      suspendedByUs.add(this);
      return Promise.resolve();
    };
    // A suspend the page asks for itself stays suspended after radio stops.
    Orig.prototype.suspend = function (...args) {
      suspendedByUs.delete(this);
      return suspend.apply(this, args);
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (muting && !ours.has(this)) muteElement(this);
    return play.apply(this, args);
  };

  function hush(ctx) {
    if (ours.has(ctx) || ctx.state === 'closed') return;
    suspendedByUs.add(ctx);
    realSuspend.call(ctx).catch(() => {});
  }
  function muteElement(m) {
    if (m.muted) return;
    m.muted = true;
    mutedByUs.add(m);
  }
  function muteGame(on) {
    muting = on;
    if (on) muteAll();
    else unmuteAll();
  }
  function muteAll() {
    for (const c of contexts) if (c.state === 'running') hush(c);
    for (const m of document.querySelectorAll('audio, video')) if (!ours.has(m)) muteElement(m);
    howlerByUs = !!window.Howler && !window.Howler._muted;
    if (howlerByUs) window.Howler.mute?.(true);
  }
  function unmuteAll() {
    for (const c of contexts) if (suspendedByUs.has(c)) restore(c);
    for (const m of mutedByUs) m.muted = false;
    mutedByUs = weakList();
    if (howlerByUs) window.Howler?.mute?.(false);
    howlerByUs = false;
  }
  function restore(ctx) {
    suspendedByUs.delete(ctx);
    if (ctx.state !== 'closed') ctx.resume().catch(() => {});
  }
  // Another OGGS script's context (Speech jammer, Scream to look): never silenced by radio.
  function exempt(ctx) {
    ours.add(ctx);
    if (suspendedByUs.has(ctx)) restore(ctx);
  }

  // A set that doesn't keep its members alive; iterating skips (and forgets) collected ones.
  function weakList() {
    const refs = new Set();
    return {
      add: o => refs.add(new WeakRef(o)),
      *[Symbol.iterator]() {
        for (const r of refs) {
          const o = r.deref();
          if (o) yield o;
          else refs.delete(r);
        }
      },
    };
  }

  // ---- our own output: the station's <audio>, through an analyser and a gain ----
  // The AudioContext is the real constructor, so muteGame leaves it alone, and is made only
  // after a click or key press (Chrome's rule).
  function output() {
    let ctx = null;
    let analyser = null;
    let gain = null;
    let td = null;
    let fd = null;
    function ensure() {
      if (ctx || !RealAudioContext || navigator.userActivation?.hasBeenActive === false) return;
      ctx = new RealAudioContext();
      ours.add(ctx);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      td = new Uint8Array(analyser.fftSize);
      fd = new Float32Array(analyser.frequencyBinCount);
      gain = ctx.createGain();
      analyser.connect(gain);
      gain.connect(ctx.destination);
    }
    return {
      // An <audio> element of ours, marked so muteGame leaves it alone.
      element(volume) {
        const a = new Audio();
        ours.add(a);
        a.volume = volume;
        return a;
      },
      // Routes `a` through the analyser so its sound can be read (needs CORS). Null when
      // there's no context yet.
      connect(a) {
        ensure();
        if (!ctx) return null;
        a.crossOrigin = 'anonymous';
        const node = ctx.createMediaElementSource(a);
        node.connect(analyser);
        return node;
      },
      silent(on) {
        if (!gain) return;
        gain.gain.cancelScheduledValues(0);
        gain.gain.value = on ? 0 : 1;
      },
      fadeIn() {
        gain?.gain.setTargetAtTime(1, ctx.currentTime, 0.08);
      },
      resume: () => ctx?.resume(),
      close: () => ctx?.close().catch(() => {}),
      // loudness, 0..1-ish
      rms() {
        analyser.getByteTimeDomainData(td);
        let sum = 0;
        for (const v of td) sum += (v - 128) ** 2;
        return Math.sqrt(sum / td.length) / 128;
      },
      // [energy below 90 Hz, energy up to 10 kHz]
      bass() {
        analyser.getFloatFrequencyData(fd);
        const hz = ctx.sampleRate / analyser.fftSize;
        let low = 0;
        let all = 0;
        for (let i = 1; i * hz < 10000; i++) {
          const p = 10 ** (fd[i] / 10);
          all += p;
          if (i * hz < 90) low += p;
        }
        return [low, all];
      },
    };
  }

  // ---- streamer mode: skip music ----
  // Music puts far more of its energy below 90 Hz than speech does. A new station is
  // listened to silently for PRE_MS first, then the last BASS_MS are checked every 250 ms.
  const PRE_MS = 3000;
  const BASS_MS = 7000;
  const BASS_EVERY_MS = 250;
  const BASS_SHARE = 0.2;
  function musicCheck() {
    let recent = [];
    let lastCheck = 0;
    return {
      reset() {
        recent = [];
        lastCheck = 0;
      },
      span(now) {
        return recent.length ? now - recent[0][0] : 0;
      },
      // per frame: loudness, energy below 90 Hz, energy up to 10 kHz
      push(rms, low, all, now) {
        recent.push([now, rms, low, all]);
        while (now - recent[0][0] > BASS_MS) recent.shift();
      },
      music(now, ms) {
        if (this.span(now) < ms * 0.95) return false;
        let r = 0;
        let l = 0;
        let a = 0;
        let k = 0;
        for (const f of recent) {
          if (now - f[0] > ms) continue;
          r += f[1];
          l += f[2];
          a += f[3];
          k++;
        }
        return k > 0 && r / k >= 0.005 && a > 0 && l / a > BASS_SHARE;
      },
      // One frame's reading. 'music' if it's music; 'talk' once the silent pre-listen found
      // none; otherwise null (not sure yet, or not time to check again).
      hear(rms, [low, all], now, preListen) {
        this.push(rms, low, all, now);
        return preListen ? this.afterPreListen(now) : this.whilePlaying(now);
      },
      afterPreListen(now) {
        if (this.span(now) < PRE_MS * 0.95) return null;
        return this.music(now, PRE_MS) ? 'music' : 'talk';
      },
      whilePlaying(now) {
        if (now - lastCheck < BASS_EVERY_MS) return null;
        lastCheck = now;
        return this.music(now, BASS_MS) ? 'music' : null;
      },
    };
  }

  ggs.radio ??= {};
  Object.assign(ggs.radio, { muteGame, output, musicCheck, exempt });
})();
