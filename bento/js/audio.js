// All sounds are synthesised with Web Audio (original, no sample files).
// Audio starts on the first user gesture; if Web Audio is missing everything is a no-op.

// F major pentatonic, used for chain pitches (each chain step goes one note up)
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const BASE = 349.23; // F4
const hz = (semi, base = BASE) => base * Math.pow(2, semi / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.se = true;
    this.bgm = true;
    this.bgmOn = false;
    this.lastTap = -1;
    this.tapCount = 0;
    this.fever = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      } catch (e) { /* ignore */ }
      let c;
      try { c = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
      this._setup(c);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.bgm && !this.bgmOn) this.startBgm();
  }

  _setup(c) {
    this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(c.destination);
    this.seBus = c.createGain(); this.seBus.gain.value = 1; this.seBus.connect(this.master);
    this.bgmBus = c.createGain(); this.bgmBus.gain.value = 0.0; this.bgmBus.connect(this.master);
    // short shared noise buffer
    const len = c.sampleRate * 0.5;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a tiny echo for sparkle sounds
    this.echo = c.createDelay(0.5); this.echo.delayTime.value = 0.13;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const wet = c.createGain(); wet.gain.value = 0.35;
    this.echo.connect(fb); fb.connect(this.echo); this.echo.connect(wet); wet.connect(this.seBus);
  }

  get ok() { return this.ctx && this.ctx.state === 'running'; }
  get now() { return this.ctx.currentTime; }

  setSe(on) { this.se = on; }
  setBgm(on) {
    this.bgm = on;
    if (!this.ctx) return;
    if (on) this.startBgm(); else this.stopBgm();
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  // ------------------------------------------------------------ primitives
  tone({ f, f2, type = 'sine', t = 0, a = 0.004, d = 0.2, v = 0.3, dest, echo = false, q }) {
    const c = this.ctx, t0 = this.now + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d * 0.9);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    let node = o;
    if (q) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = q; o.connect(fl); node = fl; }
    node.connect(g); g.connect(dest || this.seBus);
    if (echo) g.connect(this.echo);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }

  noiseHit({ t = 0, d = 0.05, v = 0.2, f = 2000, type = 'bandpass', q = 1.2, dest }) {
    const c = this.ctx, t0 = this.now + t;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(fl); fl.connect(g); g.connect(dest || this.seBus);
    s.start(t0, Math.random() * 0.3); s.stop(t0 + d + 0.02);
  }

  // ------------------------------------------------------------ effects
  drop(tier) {
    if (!this.se || !this.ok) return;
    const f = 760 - tier * 60;
    this.tone({ f, f2: f * 0.55, type: 'sine', d: 0.09, v: 0.26 });
    this.noiseHit({ d: 0.04, v: 0.05, f: 3000 });
  }

  // soft "toko" when pieces bump
  tap(speed, tier) {
    if (!this.se || !this.ok) return;
    const now = this.now;
    if (now - this.lastTap < 0.045) return;
    this.lastTap = now;
    const v = Math.min(0.16, 0.03 + speed * 0.012);
    const f = 520 - tier * 26 + Math.random() * 40;
    this.tone({ f, f2: f * 0.7, type: 'triangle', d: 0.06, v });
    this.noiseHit({ d: 0.025, v: v * 0.5, f: 1400 + Math.random() * 600, q: 2 });
  }

  // "pon!" — a bubbly pop + a chime whose pitch climbs with the chain
  merge(tier, combo) {
    if (!this.se || !this.ok) return;
    const big = tier >= 7;
    const p = 1150 - tier * 70;
    // pop body
    this.tone({ f: p * 1.6, f2: p * 0.5, type: 'sine', a: 0.002, d: 0.11, v: 0.7 });
    this.tone({ f: p * 0.8, f2: p * 0.4, type: 'triangle', a: 0.002, d: 0.08, v: 0.3 });
    this.noiseHit({ d: 0.03, v: 0.18, f: 4200, q: 0.8 });
    // chime
    const i = Math.min(SCALE.length - 1, Math.max(0, combo - 1) + Math.floor(tier / 3));
    const n = hz(SCALE[i] + 12);
    this.tone({ f: n, type: 'sine', t: 0.025, a: 0.003, d: 0.42, v: 0.32, echo: true });
    this.tone({ f: n * 2, type: 'sine', t: 0.025, a: 0.003, d: 0.22, v: 0.06 });
    if (combo >= 2) this.tone({ f: n * 1.5, type: 'triangle', t: 0.08, a: 0.003, d: 0.3, v: 0.08, echo: true });
    if (big) {
      // a warm low "boom" for big okazu
      this.tone({ f: 180 - tier * 6, f2: 70, type: 'sine', a: 0.004, d: 0.35, v: 0.35 });
      this.noiseHit({ d: 0.25, v: 0.12, f: 500, type: 'lowpass', q: 0.5 });
    }
  }

  comboFanfare(combo) {
    if (!this.se || !this.ok) return;
    const top = Math.min(SCALE.length - 4, combo);
    for (let k = 0; k < 4; k++) {
      this.tone({ f: hz(SCALE[top + k - 3] + 12), type: 'triangle', t: 0.06 + k * 0.055, a: 0.003, d: 0.2, v: 0.09, echo: true });
    }
  }

  feverStart() {
    if (!this.se || !this.ok) return;
    const notes = [0, 4, 7, 12, 16, 19, 24];
    notes.forEach((s, k) => this.tone({ f: hz(s + 12), type: 'square', t: k * 0.045, a: 0.003, d: 0.16, v: 0.05, q: 3500, echo: true }));
    this.noiseHit({ t: 0.0, d: 0.5, v: 0.08, f: 8000, type: 'highpass', q: 0.5 });
  }

  firstDiscovery() {
    if (!this.se || !this.ok) return;
    [7, 12, 16, 19].forEach((s, k) => this.tone({ f: hz(s + 12), type: 'sine', t: 0.12 + k * 0.07, a: 0.004, d: 0.3, v: 0.1, echo: true }));
  }

  king() {
    if (!this.se || !this.ok) return;
    const seq = [[0, 0], [4, 0.1], [7, 0.2], [12, 0.3], [7, 0.45], [12, 0.55], [16, 0.65], [19, 0.8], [24, 0.95]];
    for (const [s, t] of seq) {
      this.tone({ f: hz(s), type: 'triangle', t, a: 0.004, d: 0.32, v: 0.16, echo: true });
      this.tone({ f: hz(s + 12), type: 'sine', t, a: 0.004, d: 0.2, v: 0.06 });
    }
    this.tone({ f: hz(-12), type: 'sine', t: 0.95, a: 0.01, d: 1.0, v: 0.2 });
    this.noiseHit({ t: 0.95, d: 0.8, v: 0.1, f: 7000, type: 'highpass', q: 0.4 });
  }

  highscore() {
    if (!this.se || !this.ok) return;
    [[0, 0], [4, 0.09], [7, 0.18], [12, 0.27], [16, 0.42]].forEach(([s, t]) => this.tone({ f: hz(s + 12), type: 'square', t, a: 0.003, d: s === 16 ? 0.5 : 0.12, v: 0.06, q: 3000, echo: true }));
  }

  gameover() {
    if (!this.se || !this.ok) return;
    [[7, 0], [4, 0.22], [0, 0.44], [-1, 0.7]].forEach(([s, t], k) => this.tone({ f: hz(s), f2: k === 3 ? hz(s - 5) : undefined, type: 'triangle', t, a: 0.01, d: k === 3 ? 0.8 : 0.22, v: 0.16 }));
  }

  warn() {
    if (!this.se || !this.ok) return;
    this.tone({ f: 880, type: 'sine', d: 0.07, v: 0.06 });
    this.tone({ f: 660, type: 'sine', t: 0.1, d: 0.07, v: 0.05 });
  }

  ready() {
    if (!this.se || !this.ok) return;
    this.tone({ f: 1500, type: 'sine', d: 0.03, v: 0.025 });
  }

  click() {
    if (!this.se || !this.ok) return;
    this.tone({ f: 900, f2: 1300, type: 'sine', d: 0.05, v: 0.1 });
  }

  // ------------------------------------------------------------ BGM
  // A gentle 8-bar marimba loop in F (F - Dm - Bb - C), scheduled with look-ahead.
  startBgm() {
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;
    const t = this.now;
    this.bgmBus.gain.cancelScheduledValues(t);
    this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, t);
    this.bgmBus.gain.linearRampToValueAtTime(0.3, t + 1.2);
    this.beat = 0;
    this.nextAt = t + 0.1;
    this.timer = setInterval(() => this._schedule(), 50);
  }

  stopBgm() {
    if (!this.bgmOn) return;
    this.bgmOn = false;
    clearInterval(this.timer);
    const t = this.now;
    this.bgmBus.gain.cancelScheduledValues(t);
    this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, t);
    this.bgmBus.gain.linearRampToValueAtTime(0, t + 0.4);
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.nextAt = this.now + 0.1; return; }
    const spb = 60 / 96 / 2; // eighth notes at 96 bpm
    while (this.nextAt < this.now + 0.25) {
      this._note(this.beat, this.nextAt - this.now);
      this.nextAt += spb;
      this.beat = (this.beat + 1) % 64;
    }
  }

  _note(b, t) {
    const bus = this.bgmBus;
    const bar = Math.floor(b / 8) % 4, step = b % 8;
    const chords = [[-12 + 0, 4, 7], [-12 + 9, 12, 16], [-12 + 5, 9, 12], [-12 + 7, 11, 14]]; // F Dm Bb C (relative to F4)
    const ch = chords[bar];
    // bass on 1 and 5
    if (step === 0 || step === 4) this.tone({ f: hz(ch[0] - 12), type: 'sine', t, a: 0.01, d: 0.5, v: 0.22, dest: bus });
    // marimba arpeggio
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    const n = ch[arp[step]] + (step >= 4 ? 12 : 0);
    this.tone({ f: hz(n), type: 'sine', t, a: 0.004, d: 0.22, v: 0.07, dest: bus });
    this.tone({ f: hz(n) * 4, type: 'sine', t, a: 0.002, d: 0.05, v: 0.012, dest: bus });
    // melody: a simple call and answer over the second half of the loop
    const melody = [
      [12, -1, 14, 16, -1, 14, 12, -1], [9, -1, 12, -1, 14, -1, 12, -1], [10, -1, 9, 7, -1, 5, 7, -1], [9, -1, 7, -1, 4, -1, -1, -1],
      [12, -1, 16, 19, -1, 16, 14, -1], [16, -1, 14, -1, 12, -1, 9, -1], [10, -1, 12, 14, -1, 12, 10, -1], [12, -1, -1, -1, 7, -1, -1, -1],
    ];
    const ph = Math.floor(b / 8) % 8;
    const m = melody[ph][step];
    if (m >= 0) this.tone({ f: hz(m + 12), type: 'triangle', t, a: 0.01, d: 0.32, v: 0.05, dest: bus, q: 2600 });
    // soft shaker; brighter during fever
    if (step % 2 === 1 || this.fever) this.noiseHit({ t, d: 0.03, v: this.fever ? 0.035 : 0.012, f: 9000, type: 'highpass', q: 0.7, dest: bus });
    if (this.fever && step % 2 === 0) this.tone({ f: hz(ch[1] + 24), type: 'sine', t, a: 0.003, d: 0.12, v: 0.025, dest: bus });
  }
}

// Haptics: Vibration API where it exists. iOS Safari has no Vibration API; there we
// toggle a hidden <input switch>, which Safari 18+ answers with a light system haptic.
export class Haptics {
  constructor() {
    this.on = true;
    this.canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    this.sw = null;
    if (!this.canVibrate && typeof document !== 'undefined') {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      this.sw = label;
    }
    this.last = 0;
  }
  pulse(ms = 12) {
    if (!this.on) return;
    const now = performance.now();
    if (now - this.last < 40) return;
    this.last = now;
    try {
      if (this.canVibrate) navigator.vibrate(ms);
      else if (this.sw) this.sw.click();
    } catch (e) { /* ignore */ }
  }
}
