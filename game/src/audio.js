// Procedural sound, no audio files: every cue is synthesised with WebAudio after the first
// user gesture. The game stays fully readable while muted; M toggles sound.
export function createProceduralStealthAudio() {
  let context = null;
  let muted = false;
  let ambientNodes = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  function noiseBuffer(seconds) {
    const ctx = ensure();
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playNoise({ seconds, filterFreq, gain, pan = 0, decay = 1 }) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(seconds);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(gain, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds * decay);
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        source.connect(filter).connect(amp).connect(panner).connect(ctx.destination);
      } else {
        source.connect(filter).connect(amp).connect(ctx.destination);
      }
      source.start();
      source.stop(ctx.currentTime + seconds);
    } catch {
      // Audio is decoration: a failure never stops the game.
    }
  }

  function playTone({ freq, freqEnd, seconds, gain, type = 'sine', when = 0 }) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + seconds);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.05);
    } catch {
      // Audio is decoration: a failure never stops the game.
    }
  }

  return {
    /** Call from the first user gesture so the browser unlocks audio. */
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (muted) this.stopAmbient();
      return muted;
    },
    get muted() {
      return muted;
    },
    playDryFootstep() {
      playNoise({ seconds: 0.09, filterFreq: 900, gain: 0.10 });
    },
    playWaterFootstep() {
      playNoise({ seconds: 0.22, filterFreq: 1400, gain: 0.13, decay: 1.4 });
      playTone({ freq: 320, freqEnd: 180, seconds: 0.12, gain: 0.03 });
    },
    playGuardFootstep(pan) {
      playNoise({ seconds: 0.12, filterFreq: 420, gain: 0.14, pan });
    },
    playPebbleImpact(water) {
      if (water) {
        playNoise({ seconds: 0.3, filterFreq: 2200, gain: 0.16, decay: 1.5 });
        playTone({ freq: 520, freqEnd: 240, seconds: 0.18, gain: 0.04 });
      } else {
        playNoise({ seconds: 0.07, filterFreq: 2600, gain: 0.16 });
        playTone({ freq: 880, freqEnd: 660, seconds: 0.06, gain: 0.05, type: 'triangle' });
      }
    },
    playSuspicionCue() {
      playTone({ freq: 392, seconds: 0.14, gain: 0.07, type: 'triangle' });
      playTone({ freq: 523, seconds: 0.2, gain: 0.07, type: 'triangle', when: 0.12 });
    },
    playChaseSting() {
      playTone({ freq: 220, freqEnd: 440, seconds: 0.5, gain: 0.12, type: 'sawtooth' });
      playTone({ freq: 110, freqEnd: 220, seconds: 0.5, gain: 0.08, type: 'square', when: 0.05 });
    },
    playNearMissCue() {
      playTone({ freq: 523, freqEnd: 392, seconds: 0.3, gain: 0.06, type: 'sine' });
    },
    playObjectivePickup() {
      playTone({ freq: 523, seconds: 0.12, gain: 0.08, type: 'triangle' });
      playTone({ freq: 659, seconds: 0.12, gain: 0.08, type: 'triangle', when: 0.1 });
      playTone({ freq: 784, seconds: 0.22, gain: 0.08, type: 'triangle', when: 0.2 });
    },
    playEscapeCue() {
      playTone({ freq: 392, seconds: 0.16, gain: 0.08, type: 'triangle' });
      playTone({ freq: 523, seconds: 0.16, gain: 0.08, type: 'triangle', when: 0.14 });
      playTone({ freq: 659, seconds: 0.16, gain: 0.08, type: 'triangle', when: 0.28 });
      playTone({ freq: 784, seconds: 0.4, gain: 0.09, type: 'triangle', when: 0.42 });
    },
    startAmbient() {
      const ctx = ensure();
      if (!ctx || muted || ambientNodes) return;
      try {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 55;
        const amp = ctx.createGain();
        amp.gain.value = 0.035;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain).connect(amp.gain);
        osc.connect(amp).connect(ctx.destination);
        osc.start();
        lfo.start();
        ambientNodes = { osc, lfo, amp };
      } catch {
        ambientNodes = null;
      }
    },
    stopAmbient() {
      if (!ambientNodes) return;
      try {
        ambientNodes.osc.stop();
        ambientNodes.lfo.stop();
      } catch {
        // Already stopped.
      }
      ambientNodes = null;
    },
  };
}
