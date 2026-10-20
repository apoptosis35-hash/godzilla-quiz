// Ambient sound synthesised with WebAudio: waves (louder near the sea), seagull calls, footsteps, night insects.
export class Sound {
  constructor() { this.on = true; this.ctx = null; this.stepT = 0; this.gullT = 3; }
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    // brown noise -> lowpass with a slow swell = waves
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.waveF = c.createBiquadFilter(); this.waveF.type = 'lowpass'; this.waveF.frequency.value = 600;
    this.waveG = c.createGain(); this.waveG.gain.value = 0.0;
    src.connect(this.waveF).connect(this.waveG).connect(this.master); src.start();
    // night insects: two detuned high oscillators, amplitude-modulated
    const o1 = c.createOscillator(), o2 = c.createOscillator(), am = c.createOscillator(), amg = c.createGain();
    o1.frequency.value = 4200; o2.frequency.value = 4630; am.frequency.value = 23; amg.gain.value = 0.5;
    this.bugG = c.createGain(); this.bugG.gain.value = 0;
    const mod = c.createGain(); mod.gain.value = 0.5; am.connect(amg).connect(mod.gain);
    o1.connect(mod); o2.connect(mod); mod.connect(this.bugG).connect(this.master);
    o1.start(); o2.start(); am.start();
  }
  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? 0.7 : 0; return this.on; }
  gull() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 2;
    o.type = 'sawtooth';
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const s = t + k * 0.28;
      o.frequency.setValueAtTime(1400, s); o.frequency.exponentialRampToValueAtTime(2300, s + 0.06); o.frequency.exponentialRampToValueAtTime(1100, s + 0.22);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.05, s + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.24);
    }
    o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + n * 0.28 + 0.1);
  }
  // おやつ集め: a bright pop that climbs a major scale with the combo, a ring chime, a rank-up fanfare
  tone(freq, t, dur, vol, type = 'triangle') {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur * 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  pop(combo, gold) {
    if (!this.ctx) return;
    const scale = [0, 2, 4, 5, 7, 9, 11], k = Math.min(combo - 1, 20), st = scale[k % 7] + 12 * Math.floor(k / 7);
    const t = this.ctx.currentTime, f = 520 * Math.pow(2, st / 12);
    this.tone(f, t, 0.12, 0.13); if (gold) { this.tone(f * 1.5, t + 0.06, 0.18, 0.1); this.tone(f * 2, t + 0.12, 0.25, 0.08); }
  }
  ring() { if (!this.ctx) return; const t = this.ctx.currentTime; [0, 4, 7, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), t + i * 0.05, 0.3, 0.09, 'sine')); }
  fanfare() { if (!this.ctx) return; const t = this.ctx.currentTime; [[0, 0.12], [4, 0.12], [7, 0.12], [12, 0.5]].forEach(([s, d], i) => this.tone(523 * Math.pow(2, s / 12), t + i * 0.13, d + 0.1, 0.12, 'square')); }
  step(hard) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = hard ? 1400 : 700; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(hard ? 0.12 : 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3, 0.12);
  }
  update(dt, player, tod, ground) {
    if (!this.ctx || !this.on) return;
    const p = player.pos;
    // distance to open water ~ how far south / on the breakwater
    const nearSea = Math.max(0, Math.min(1, (p.z + 40) / 80)) * (p.y < 6 ? 1 : 0.5);
    const t = this.ctx.currentTime;
    this.waveG.gain.setTargetAtTime(0.12 + 0.35 * nearSea, t, 0.5);
    this.waveF.frequency.setTargetAtTime(380 + 420 * (0.5 + 0.5 * Math.sin(t * 0.45)) * (0.4 + nearSea), t, 0.3);
    this.bugG.gain.setTargetAtTime(tod === 'night' ? 0.012 : tod === 'evening' ? 0.004 : 0, t, 1);
    this.gullT -= dt;
    if (this.gullT < 0) { this.gullT = 4 + Math.random() * 9; if (tod !== 'night' && nearSea > 0.2) this.gull(); }
    if (player.speed > 0.6) {
      this.stepT -= dt * player.speed / 1.6;
      if (this.stepT < 0) { this.stepT = 0.5; const s = ground.sample(p.x, p.z); this.step(!!s.plat && s.plat.mat !== 'dirt' && s.plat.mat !== 'grass'); }
    }
  }
}
