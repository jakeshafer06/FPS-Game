/* Procedural Web Audio: SFX + looping dark synth track. No external files. */

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicOn = true;
    this.musicTimer = null;
    this.volume = 0.7;
    this.started = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.started = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /* ---------- SFX primitives ---------- */
  _env(gain, t, attack, peak, duration) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  }

  _tone({ freq = 440, endFreq = null, type = 'square', peak = 0.2, attack = 0.005, duration = 0.15, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    this._env(gain, t, attack, peak, duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  _noise({ peak = 0.25, duration = 0.2, filterFreq = 2200, delay = 0, type = 'lowpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    this._env(gain, t, 0.002, peak, duration);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t);
  }

  /* ---------- game SFX ---------- */
  shoot() {
    this._tone({ freq: 880, endFreq: 140, type: 'sawtooth', peak: 0.16, duration: 0.09 });
    this._noise({ peak: 0.14, duration: 0.07, filterFreq: 3800, type: 'highpass' });
  }

  dryFire() {
    this._tone({ freq: 220, endFreq: 120, type: 'square', peak: 0.06, duration: 0.06 });
  }

  hit(killed) {
    if (killed) {
      this._tone({ freq: 220, endFreq: 55, type: 'sawtooth', peak: 0.25, duration: 0.35 });
      this._noise({ peak: 0.3, duration: 0.3, filterFreq: 1400 });
    } else {
      this._tone({ freq: 1400, endFreq: 700, type: 'square', peak: 0.08, duration: 0.05 });
    }
  }

  enemyDeath() {
    this._tone({ freq: 300, endFreq: 40, type: 'sawtooth', peak: 0.3, duration: 0.4 });
    this._noise({ peak: 0.25, duration: 0.25, filterFreq: 900 });
  }

  enemyAttack() {
    this._tone({ freq: 120, endFreq: 60, type: 'square', peak: 0.18, duration: 0.18 });
  }

  hurt() {
    this._tone({ freq: 160, endFreq: 50, type: 'triangle', peak: 0.4, duration: 0.25 });
    this._noise({ peak: 0.2, duration: 0.15, filterFreq: 500 });
  }

  reload() {
    this._tone({ freq: 500, type: 'square', peak: 0.08, duration: 0.05 });
    this._tone({ freq: 700, type: 'square', peak: 0.08, duration: 0.05, delay: 0.5 });
    this._noise({ peak: 0.06, duration: 0.08, filterFreq: 3000, delay: 0.95, type: 'highpass' });
  }

  waveStart() {
    [330, 415, 494, 660].forEach((f, i) =>
      this._tone({ freq: f, type: 'sawtooth', peak: 0.1, duration: 0.22, delay: i * 0.09 })
    );
  }

  waveClear() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', peak: 0.12, duration: 0.25, delay: i * 0.08 })
    );
  }

  pickup() {
    [880, 1174, 1568].forEach((f, i) =>
      this._tone({ freq: f, type: 'sine', peak: 0.14, duration: 0.12, delay: i * 0.06 })
    );
  }

  gameOver() {
    [440, 349, 261, 174].forEach((f, i) =>
      this._tone({ freq: f, type: 'sawtooth', peak: 0.16, duration: 0.4, delay: i * 0.22 })
    );
  }

  /* ---------- music: dark synthwave loop ---------- */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._step16 = 0;
    const BPM = 104;
    const stepDur = 60 / BPM / 4; // 16th note
    this.musicTimer = setInterval(() => {
      if (!this.musicOn) return;
      while (this._nextNoteTime < this.ctx.currentTime + 0.3) {
        this._scheduleMusicStep(this._step16, this._nextNoteTime, stepDur);
        this._nextNoteTime += stepDur;
        this._step16 = (this._step16 + 1) % 64;
      }
    }, 100);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusic(on) {
    this.musicOn = on;
  }

  _mnote(freq, time, dur, type, peak, filterFreq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const t = time;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _scheduleMusicStep(step, time, stepDur) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // Am progression: Am - F - C - G  (root notes)
    const roots = [110, 87.31, 130.81, 98]; // A2 F2 C3 G2
    const root = roots[bar];
    // kick on beats
    if (s % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(gain).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.2);
    }
    // hats on off-beats
    if (s % 2 === 1) {
      const len = Math.floor(this.ctx.sampleRate * 0.04);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      src.connect(f).connect(gain).connect(this.musicGain);
      src.start(time);
    }
    // bass on 8ths
    if (s % 2 === 0) {
      this._mnote(root, time, stepDur * 1.8, 'sawtooth', 0.10, 300);
    }
    // arp
    const arpScale = [1, 2, 3, 4, 6, 5, 4, 3]; // scale-degree pattern
    const semis = [0, 3, 7, 10, 12, 15, 19, 22];
    const deg = arpScale[s % 8];
    const arpFreq = root * Math.pow(2, semis[deg - 1] / 12) * 2;
    this._mnote(arpFreq, time, stepDur * 0.9, 'square', 0.035, 1600);
    // pad at bar start
    if (s === 0) {
      this._mnote(root * 2, time, stepDur * 15, 'triangle', 0.05, 900);
      this._mnote(root * 2 * 1.5, time, stepDur * 15, 'triangle', 0.04, 700);
    }
  }
}
