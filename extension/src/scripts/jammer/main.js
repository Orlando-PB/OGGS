// Speech jammer: delayed auditory feedback. The microphone goes through a delay to the speakers,
// loud, so you hear yourself a fraction of a second late, which makes talking hard. The sound
// only passes through this page's audio graph. It's never recorded or sent. Without a
// microphone, or when it's refused, nothing happens.
//
// Settings from the DAF studies: about 200 ms at the ear disrupts fluent speakers most (Lee 1950,
// Black 1951, Stuart et al. 2002). The delayed voice has to drown out the one heard directly and
// through the bones. So there's no undelayed sound, the lows (bone conduction) are lifted, and a
// compressor keeps it loud as the speaker raises their voice, with a limiter so it can't clip.
// Pink noise underneath masks the voice heard directly.
(() => {
  const ggs = globalThis.__ggs;
  const AT_EAR = 0.2; // seconds from mouth to ear, the browser's own latency included
  const INPUT_GUESS = 0.01; // the microphone's latency, which browsers don't report
  const LOUD = 9; // make-up gain after the compressor (about +19 dB), faded in over FADE_S
  const STATIC = 0.4; // the static's level: about -22 dBFS, some 7 dB under the voice
  const FADE_S = 1.5;
  const GESTURES = ['pointerdown', 'keydown'];

  function graph(audio, stream) {
    const n = (make, set) => Object.assign(make(), set);
    const lowCut = n(() => audio.createBiquadFilter(), { type: 'highpass' });
    lowCut.frequency.value = 80; // rumble and handling noise
    const delay = audio.createDelay(1);
    const latency = (audio.baseLatency || 0) + (audio.outputLatency || 0) + INPUT_GUESS;
    delay.delayTime.value = Math.max(0.05, AT_EAR - latency);
    const lows = n(() => audio.createBiquadFilter(), { type: 'lowshelf' });
    lows.frequency.value = 300;
    lows.gain.value = 6;
    const squeeze = audio.createDynamicsCompressor();
    const squeezeSettings = { threshold: -35, knee: 6, ratio: 12, attack: 0.003, release: 0.15 };
    for (const [k, v] of Object.entries(squeezeSettings)) squeeze[k].value = v;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(1, audio.currentTime);
    gain.gain.linearRampToValueAtTime(LOUD, audio.currentTime + FADE_S); // no sudden blast
    const limit = audio.createDynamicsCompressor();
    const limitSettings = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.05 };
    for (const [k, v] of Object.entries(limitSettings)) limit[k].value = v;
    audio.createMediaStreamSource(stream)
      .connect(lowCut).connect(delay).connect(lows).connect(squeeze).connect(gain).connect(limit);
    // the static joins after the compressor, so it never pushes the voice down
    const hiss = audio.createBufferSource();
    hiss.buffer = pinkNoise(audio, 4);
    hiss.loop = true;
    const hissGain = audio.createGain();
    hissGain.gain.setValueAtTime(0, audio.currentTime);
    hissGain.gain.linearRampToValueAtTime(STATIC, audio.currentTime + FADE_S);
    hiss.connect(hissGain).connect(limit);
    hiss.start();
    limit.connect(audio.destination);
  }

  // Seconds of pink noise (Paul Kellet's filter on white noise): equal energy per octave, so
  // more of it in the lows than white noise, where the voice carries through the bones.
  function pinkNoise(audio, seconds) {
    const buf = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  function start() {
    let stopped = false;
    let stream = null;
    let audio = null;
    const status = text => ggs.status('jammer', text);

    // a page can only start sound after a click or key press, so it waits for one if needed
    const resume = () => {
      audio?.resume().catch(() => {});
    };
    const onState = () => {
      if (stopped) return;
      const running = audio.state === 'running';
      for (const t of GESTURES) window[running ? 'removeEventListener' : 'addEventListener'](t, resume, true);
      status(running ? '' : 'Click the page to start');
    };

    (async () => {
      try {
        // the browser's voice clean-up would cut the delayed copy out, so it's off
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        if (stopped) return;
        // refused: it switches itself off rather than stay on doing nothing
        if (err?.name === 'NotAllowedError') {
          ggs.saveSetting('jammer', { enabled: false });
          status('Microphone blocked, so it was switched off');
        } else {
          status('No microphone');
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      audio = new AudioContext({ latencyHint: 'interactive' });
      graph(audio, stream);
      audio.addEventListener('statechange', onState);
      onState();
    })();

    return {
      stop() {
        stopped = true;
        for (const t of GESTURES) window.removeEventListener(t, resume, true);
        stream?.getTracks().forEach(t => t.stop());
        audio?.close().catch(() => {});
        status('');
      },
    };
  }
  ggs.scripts.jammer = { start };
})();
