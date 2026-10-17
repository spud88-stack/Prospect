// Tiny synthesized sound kit (no assets).
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.6; }
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.startWind();
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  _noise(dur, type, f0, f1, gain, q = 1) {
    const c = this.ctx; if (!c) return;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    const g = c.createGain(), t = c.currentTime;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  _tone(dur, type, f0, f1, gain, delay = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  startWind() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.035;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(); lfo.start();
  }
  whoosh(power) { this._noise(0.16 + power * 0.006, 'bandpass', 600 + power * 30, 2600, 0.09 + power * 0.004, 1.4); }
  hit(power) {
    this._tone(0.18, 'sine', 140 + power * 2, 45, 0.55);
    this._noise(0.1, 'lowpass', 2200, 300, 0.45);
    if (power >= 14) this._tone(0.3, 'triangle', 90, 35, 0.4);
  }
  block() { this._noise(0.09, 'bandpass', 1800, 900, 0.35, 3); this._tone(0.08, 'square', 320, 180, 0.06); }
  guardbreak() { this._noise(0.3, 'lowpass', 3000, 200, 0.5); this._tone(0.35, 'sawtooth', 160, 50, 0.18); }
  parry() { this._tone(0.6, 'sine', 1320, 1250, 0.22); this._tone(0.5, 'sine', 1980, 1900, 0.1); this._noise(0.06, 'highpass', 4000, 3000, 0.3); }
  absorb() { this._tone(0.4, 'sine', 220, 180, 0.3); this._tone(0.4, 'sine', 330, 300, 0.12); this._noise(0.12, 'lowpass', 900, 200, 0.3); }
  evade() { this._noise(0.22, 'bandpass', 3000, 700, 0.16, 2); }
  dodge() { this._noise(0.15, 'bandpass', 900, 400, 0.08, 1); }
  ko() { this._tone(2.4, 'sine', 98, 92, 0.5); this._tone(2.4, 'sine', 147, 140, 0.18); this._tone(1.6, 'triangle', 196, 190, 0.08); }
  gong() { this._tone(1.8, 'sine', 196, 190, 0.3); this._tone(1.8, 'sine', 293, 288, 0.12); }
  flow() { for (let i = 0; i < 4; i++) this._tone(0.5, 'sine', 440 * (1 + i * 0.25), 440 * (1 + i * 0.25), 0.07, i * 0.06); }
  ui() { this._tone(0.06, 'sine', 900, 700, 0.06); }
  learn() { this._tone(0.25, 'sine', 660, 660, 0.12); this._tone(0.35, 'sine', 990, 990, 0.1, 0.1); }
}
