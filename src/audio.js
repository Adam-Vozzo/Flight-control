// Sound effects and a small swing loop, synthesised with Web Audio so the
// game ships without any audio files.

const hz = (n) => 440 * 2 ** ((n - 69) / 12);

// Eight bars in F: Fmaj7 | Dm7 | Gm7 | C7 | Am7 | D7 | Gm7 C7 | Fmaj7
const BPM = 112;
const SWING = 0.62;
const V = {
  F: [57, 60, 64],
  Dm: [53, 57, 60],
  Gm: [53, 58, 62],
  C7: [52, 58, 62],
  Am: [55, 60, 64],
  D7: [54, 60, 64],
};
const comp = (v) => [[0, v, 1.5], [3, v, 3]];
const SONG = {
  bass: [
    [41, 43, 45, 40], [38, 41, 45, 44], [43, 46, 50, 47], [48, 43, 46, 44],
    [45, 48, 52, 51], [50, 45, 42, 44], [43, 46, 48, 40], [41, 45, 43, 40],
  ],
  chords: [
    comp(V.F), comp(V.Dm), comp(V.Gm), comp(V.C7),
    comp(V.Am), comp(V.D7), [[0, V.Gm, 1.5], [3, V.Gm, 1], [4, V.C7, 1.5], [7, V.C7, 1]], comp(V.F),
  ],
  // [bar, slot (swung eighths), note, length in eighths]
  melody: [
    [0, 1, 72, 1], [0, 2, 69, 1], [0, 4, 72, 1], [0, 6, 74, 2],
    [1, 0, 77, 3], [1, 4, 74, 1], [1, 5, 72, 1], [1, 6, 69, 2],
    [2, 1, 70, 1], [2, 2, 74, 1], [2, 4, 77, 2], [2, 6, 74, 1], [2, 7, 72, 1],
    [3, 0, 70, 2], [3, 2, 67, 2], [3, 4, 64, 4],
    [4, 1, 72, 1], [4, 2, 76, 1], [4, 4, 79, 2], [4, 6, 76, 2],
    [5, 0, 78, 2], [5, 2, 74, 1], [5, 3, 72, 1], [5, 4, 69, 4],
    [6, 0, 70, 1], [6, 1, 74, 1], [6, 2, 77, 2], [6, 4, 76, 1], [6, 5, 72, 1], [6, 6, 70, 2],
    [7, 0, 69, 6],
  ],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.warnTimer = null;
    this.music = null;
    this.duck = 1;
  }

  /** Must be called from a user gesture the first time (iOS). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        // Mix with other audio and respect the ringer switch, like most games.
        if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      } catch {
        /* not supported */
      }
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      const ctx = this.ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(limiter);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this.noiseBuf = makeNoise(ctx);
      // A silent blip fully wakes the output on older iOS versions.
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, 22050);
      blip.connect(ctx.destination);
      blip.start(0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicOn) this.startMusic();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
    if (!on) this.setWarning(false);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Lower the music while paused or after a crash. */
  setDuck(level) {
    this.duck = level;
    if (this.music && this.musicBus) this.musicBus.gain.setTargetAtTime(0.55 * level, this.ctx.currentTime, 0.25);
  }

  // -------------------------------------------------------------- voices

  tone(freq, t, dur, { type = 'sine', gain = 0.1, attack = 0.005, glideTo = 0, lowpass = 0, bus = this.sfxBus, detune = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.value = detune;
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(t, dur, { gain = 0.1, type = 'lowpass', freq = 1000, freqTo = 0, q = 0.7, attack = 0.004, bus = this.sfxBus } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  bell(freq, t, dur, gain, bus = this.sfxBus) {
    this.tone(freq, t, dur, { gain, attack: 0.004, bus });
    this.tone(freq * 2.76, t, dur * 0.35, { gain: gain * 0.22, attack: 0.002, bus });
  }

  play(name) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'incoming':
        this.bell(659.25, t, 0.8, 0.06);
        this.bell(523.25, t + 0.2, 1, 0.06);
        break;
      case 'grab':
        this.tone(1250, t, 0.06, { gain: 0.05, glideTo: 850 });
        break;
      case 'snap':
        this.tone(784, t, 0.16, { type: 'triangle', gain: 0.07 });
        this.tone(1175, t + 0.07, 0.24, { type: 'triangle', gain: 0.07 });
        break;
      case 'land':
        [1046.5, 1318.5, 1568].forEach((f, i) => this.bell(f, t + i * 0.065, 0.55, 0.04));
        break;
      case 'crash':
        this.noise(t, 1.3, { gain: 0.55, freq: 2600, freqTo: 110 });
        this.noise(t, 0.3, { gain: 0.25, type: 'highpass', freq: 1800 });
        this.tone(120, t, 0.8, { gain: 0.5, glideTo: 32 });
        break;
      case 'tap':
        this.tone(900, t, 0.07, { gain: 0.035, glideTo: 640 });
        break;
      case 'start':
        this.bell(523.25, t, 0.5, 0.05);
        this.bell(783.99, t + 0.1, 0.7, 0.05);
        break;
      case 'record':
        [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, t + i * 0.09, 0.7, 0.045));
        break;
      default:
        break;
    }
  }

  /** Two-tone alarm that repeats while any aircraft are too close. */
  setWarning(on) {
    if (on === Boolean(this.warnTimer)) return;
    if (!on) {
      clearInterval(this.warnTimer);
      this.warnTimer = null;
      return;
    }
    const beep = () => {
      if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.01;
      this.tone(988, t, 0.1, { type: 'square', gain: 0.045, lowpass: 2200 });
      this.tone(784, t + 0.14, 0.1, { type: 'square', gain: 0.045, lowpass: 2200 });
    };
    beep();
    this.warnTimer = setInterval(beep, 560);
  }

  // --------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.music || !this.musicOn) return;
    const ctx = this.ctx;
    const beat = 60 / BPM;
    const bar = beat * 4;
    const m = { next: ctx.currentTime + 0.15, bar: 0, timer: 0 };
    this.music = m;
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.55 * this.duck, ctx.currentTime, 0.6);
    const tick = () => {
      if (this.music !== m) return;
      while (m.next < ctx.currentTime + 0.4) {
        this.scheduleBar(m.bar, m.next, beat);
        m.next += bar;
        m.bar++;
      }
    };
    tick();
    m.timer = setInterval(tick, 150);
  }

  stopMusic() {
    if (!this.music) return;
    clearInterval(this.music.timer);
    this.music = null;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
  }

  scheduleBar(n, t0, beat) {
    const b = n % 8;
    const pass = Math.floor(n / 8);
    const at = (slot) => t0 + Math.floor(slot / 2) * beat + (slot % 2 ? beat * SWING : 0);
    const bus = this.musicBus;

    // Walking bass
    SONG.bass[b].forEach((note, i) => {
      const t = t0 + i * beat;
      this.tone(hz(note), t, beat * 0.95, { type: 'triangle', gain: 0.2, attack: 0.01, lowpass: 900, bus });
      this.tone(hz(note), t, beat * 0.8, { gain: 0.12, attack: 0.01, bus });
    });

    // Electric-piano comping
    for (const [slot, voicing, len] of SONG.chords[b]) {
      const t = at(slot);
      voicing.forEach((note, i) => {
        this.tone(hz(note), t + i * 0.008, (len * beat) / 2 + 0.35, { gain: 0.032, attack: 0.012, detune: (i - 1) * 4, bus });
        this.tone(hz(note) * 2, t + i * 0.008, 0.25, { type: 'triangle', gain: 0.006, attack: 0.004, bus });
      });
    }

    // Vibraphone tune on alternate passes
    if (pass % 2 === 0) {
      for (const [mb, slot, note, len] of SONG.melody) {
        if (mb !== b) continue;
        const t = at(slot);
        const dur = Math.max(0.5, (len * beat) / 2 + 0.4);
        this.tone(hz(note), t, dur, { gain: 0.05, attack: 0.003, bus });
        this.tone(hz(note) * 4, t, 0.18, { gain: 0.006, attack: 0.002, bus });
      }
    }

    // Brushes and ride
    for (let i = 0; i < 4; i++) {
      this.noise(t0 + i * beat, 0.16, { gain: i % 2 ? 0.022 : 0.016, type: 'highpass', freq: 6500, bus });
    }
    for (const slot of [3, 7]) this.noise(at(slot), 0.1, { gain: 0.014, type: 'highpass', freq: 7000, bus });
    for (const slot of [2, 6]) this.noise(at(slot), 0.22, { gain: 0.03, type: 'bandpass', freq: 1900, q: 0.8, attack: 0.03, bus });
    for (const slot of [0, 4]) this.tone(70, at(slot), 0.2, { gain: 0.09, glideTo: 42, bus });
  }
}

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
