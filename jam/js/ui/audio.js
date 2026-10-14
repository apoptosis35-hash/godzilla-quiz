// Small synthesized sound set (no audio files): UI clicks, gentle alert,
// star chimes and a quiet traffic ambience whose level follows traffic speed.
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.amb = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.7 : 0; this.master.connect(this.ctx.destination);
  }

  setOn(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slide = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  click() { this.tone(880, 0.06, 'triangle', 0.08); }
  soft() { this.tone(520, 0.08, 'sine', 0.08); }
  brake() { this.noise(0.35, 900, 0.06); }
  alert() { this.tone(660, 0.18, 'sine', 0.09); this.tone(494, 0.26, 'sine', 0.09, 0.16); }
  chain() { this.tone(392, 0.12, 'triangle', 0.07); this.tone(330, 0.16, 'triangle', 0.06, 0.1); }
  good() { this.tone(660, 0.1, 'sine', 0.1); this.tone(990, 0.18, 'sine', 0.1, 0.09); }
  bad() { this.tone(300, 0.2, 'triangle', 0.09, 0, 0.7); }
  star(i) { this.tone([784, 988, 1175][i] || 1175, 0.35, 'sine', 0.12); this.tone(([784, 988, 1175][i] || 1175) * 2, 0.25, 'sine', 0.03, 0.02); }
  clear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.09, i * 0.09)); }

  noise(dur, fc, vol) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }

  // quiet ambience: filtered noise, louder and brighter when traffic flows
  ambience(level, bright) {
    if (!this.ctx) return;
    if (!this.amb) {
      const n = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < n; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1); d[i] = b * 6; }
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.amb = { f, g };
    }
    const t = this.ctx.currentTime;
    this.amb.g.gain.setTargetAtTime(this.on ? level * 0.05 : 0, t, 0.5);
    this.amb.f.frequency.setTargetAtTime(250 + bright * 700, t, 0.5);
  }
}
