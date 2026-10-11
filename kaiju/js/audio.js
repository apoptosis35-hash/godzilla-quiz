// Fully procedural audio (WebAudio synthesis). No recorded or third-party sound assets are used.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.55;
    this.sfxVol = 0.9;
    this.loops = new Set();
    this.music = null;
    this.lastPlay = {};
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 4;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = this.musicVol; this.mus.connect(this.master);
    // reverb
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // shared noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.dist = this.makeCurve(30);
    if (this.pendingMusic != null) { const m = this.pendingMusic; this.pendingMusic = null; this.startMusic(m); }
  }
  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (this.ctx) { this.mus.gain.value = m; this.sfx.gain.value = s; }
  }
  makeCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); }
    return c;
  }
  noise(t, dur, out) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    if (out) s.connect(out);
    return s;
  }
  env(g, t, a, peak, dur, curve = 'exp') {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
  out(vol, verb = 0) {
    const g = this.ctx.createGain(); g.gain.value = vol;
    g.connect(this.sfx);
    if (verb) { const v = this.ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    return g;
  }

  play(name, o = {}) {
    if (!this.ctx) return null;
    const now = this.ctx.currentTime;
    // rate limit identical sounds
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return null;
    this.lastPlay[name] = now;
    const ctx = this.ctx, t = now + 0.005, vol = (o.vol ?? 1), p = o.pitch ?? 1;
    const fn = this['s_' + name];
    if (fn) return fn.call(this, ctx, t, vol, p, o);
    return null;
  }
  s_swing(ctx, t, v, p) { return this.s_whoosh(ctx, t, v * 0.7, p * 1.3); }
  s_whoosh(ctx, t, v, p) {
    const o = this.out(v * 0.6);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(1800 * p, t); f.frequency.exponentialRampToValueAtTime(300 * p, t + 0.3);
    const g = ctx.createGain(); this.env(g, t, 0.06, 1, 0.35);
    this.noise(t, 0.4, f); f.connect(g); g.connect(o);
  }
  s_hit(ctx, t, v, p, o) {
    const heavy = o.heavy ?? 1;
    const out = this.out(v, 0.25);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(160 * p, t); osc.frequency.exponentialRampToValueAtTime(38, t + 0.25 * heavy);
    const g = ctx.createGain(); this.env(g, t, 0.003, 1.2, 0.3 * heavy);
    const ws = ctx.createWaveShaper(); ws.curve = this.dist;
    osc.connect(ws); ws.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500 * p;
    const g2 = ctx.createGain(); this.env(g2, t, 0.002, 0.9, 0.16 * heavy);
    this.noise(t, 0.25, f); f.connect(g2); g2.connect(out);
    // flesh slap
    const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 900; f3.Q.value = 2;
    const g3 = ctx.createGain(); this.env(g3, t, 0.001, 0.6, 0.08);
    this.noise(t, 0.1, f3); f3.connect(g3); g3.connect(out);
  }
  s_block(ctx, t, v) {
    const out = this.out(v * 0.7, 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 4;
    const g = ctx.createGain(); this.env(g, t, 0.001, 1, 0.18);
    this.noise(t, 0.2, f); f.connect(g); g.connect(out);
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(420, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    const g2 = ctx.createGain(); this.env(g2, t, 0.001, 0.6, 0.18); osc.connect(g2); g2.connect(out); osc.start(t); osc.stop(t + 0.25);
  }
  s_clang(ctx, t, v) {
    const out = this.out(v * 0.6, 0.4);
    for (const fr of [523, 1187, 1913]) {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = fr;
      const g = ctx.createGain(); this.env(g, t, 0.001, 0.3, 0.9); osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 1);
    }
  }
  s_step(ctx, t, v, p) {
    const out = this.out(v * 0.9, 0.15);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(70 * p, t); osc.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    const g = ctx.createGain(); this.env(g, t, 0.005, 1.4, 0.45);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g2 = ctx.createGain(); this.env(g2, t, 0.005, 0.9, 0.4);
    this.noise(t, 0.45, f); f.connect(g2); g2.connect(out);
  }
  s_explosion(ctx, t, v, p) {
    const out = this.out(v, 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3500 * p, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const g = ctx.createGain(); this.env(g, t, 0.005, 1.4, 1.6);
    const ws = ctx.createWaveShaper(); ws.curve = this.dist;
    this.noise(t, 1.7, f); f.connect(ws); ws.connect(g); g.connect(out);
    const osc = ctx.createOscillator(); osc.frequency.setValueAtTime(80 * p, t); osc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    const g2 = ctx.createGain(); this.env(g2, t, 0.005, 1.5, 0.9); osc.connect(g2); g2.connect(out); osc.start(t); osc.stop(t + 1);
  }
  s_crumble(ctx, t, v) {
    const out = this.out(v * 0.8, 0.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain(); this.env(g, t, 0.02, 1, 1.4);
    this.noise(t, 1.5, f); f.connect(g); g.connect(out);
    for (let i = 0; i < 8; i++) {
      const tt = t + Math.random() * 1.0;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 600 + Math.random() * 1800; f2.Q.value = 3;
      const g2 = ctx.createGain(); this.env(g2, tt, 0.001, 0.7, 0.07);
      this.noise(tt, 0.1, f2); f2.connect(g2); g2.connect(out);
    }
  }
  s_collapse(ctx, t, v) {
    const out = this.out(v, 0.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(180, t + 3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.3, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 3.5);
    this.noise(t, 3.6, f); f.connect(g); g.connect(out);
    this.s_crumble(ctx, t + 0.3, v * 0.8);
  }
  s_thunder(ctx, t, v) {
    const out = this.out(v, 0.8);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2000, t); f.frequency.exponentialRampToValueAtTime(100, t + 3);
    const g = ctx.createGain(); this.env(g, t, 0.01, 1.2, 3.5);
    this.noise(t, 3.6, f); f.connect(g); g.connect(out);
  }
  s_crunch(ctx, t, v) { this.s_crumble(ctx, t, v * 0.5); this.s_clang(ctx, t, v * 0.3); }
  s_bite(ctx, t, v) {
    const out = this.out(v * 0.9, 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = ctx.createGain(); this.env(g, t, 0.001, 1, 0.12);
    this.noise(t, 0.15, f); f.connect(g); g.connect(out);
    this.s_hit(ctx, t, v * 0.6, 0.8, {});
  }
  s_charge(ctx, t, v, p, o) {
    const len = o.len ?? 0.6;
    const out = this.out(v * 0.5, 0.4);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90 * p, t); osc.frequency.exponentialRampToValueAtTime(900 * p, t + len);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(5000, t + len);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 0.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8, t + len); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.15);
    lfo.connect(lg); lg.connect(g.gain);
    osc.connect(f); f.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + len + 0.2); lfo.start(t); lfo.stop(t + len + 0.2);
  }
  // sustained beam: returns handle with stop()
  s_beam(ctx, t, v, p, o) {
    const out = this.out(v * 0.55, 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.08);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = (o.bright ?? 1) * 2600; f.Q.value = 3;
    const ws = ctx.createWaveShaper(); ws.curve = this.dist;
    const oscs = [];
    for (const [type, fr] of [['sawtooth', 55], ['sawtooth', 55.7], ['square', 110.5], ['sawtooth', 220 * (o.bright ?? 1)]]) {
      const os = ctx.createOscillator(); os.type = type; os.frequency.value = fr * p; os.connect(ws); os.start(t); oscs.push(os);
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 600; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); oscs.push(lfo);
    const n = this.noise(t, 30, null); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; const ng = ctx.createGain(); ng.gain.value = 0.35;
    n.connect(nf); nf.connect(ng); ng.connect(g);
    ws.connect(f); f.connect(g); g.connect(out);
    const h = {
      stop: () => {
        const tt = ctx.currentTime;
        g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(g.gain.value, tt); g.gain.linearRampToValueAtTime(0.0001, tt + 0.3);
        for (const os of oscs) os.stop(tt + 0.35);
        n.stop(tt + 0.35);
        this.loops.delete(h);
      },
    };
    this.loops.add(h);
    return h;
  }
  s_laser(ctx, t, v, p) {
    const out = this.out(v * 0.5, 0.3);
    const osc = ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(1800 * p, t); osc.frequency.exponentialRampToValueAtTime(300 * p, t + 0.25);
    const g = ctx.createGain(); this.env(g, t, 0.002, 0.6, 0.28);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.3);
  }
  s_missile(ctx, t, v) {
    const out = this.out(v * 0.6, 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.5); f.Q.value = 1;
    const g = ctx.createGain(); this.env(g, t, 0.01, 1, 0.6);
    this.noise(t, 0.6, f); f.connect(g); g.connect(out);
    this.s_hit(ctx, t, v * 0.3, 2, { heavy: 0.4 });
  }
  s_electric(ctx, t, v, p) {
    const out = this.out(v * 0.45, 0.3);
    const g = ctx.createGain(); this.env(g, t, 0.002, 1, 0.4, 'lin');
    for (let i = 0; i < 6; i++) {
      const os = ctx.createOscillator(); os.type = 'square'; os.frequency.value = (80 + Math.random() * 900) * p;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0, t + i * 0.05); gg.gain.setValueAtTime(0.3, t + i * 0.05 + 0.001); gg.gain.setValueAtTime(0, t + i * 0.05 + 0.04);
      os.connect(gg); gg.connect(g); os.start(t); os.stop(t + 0.45);
    }
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
    this.noise(t, 0.4, f); const ng = ctx.createGain(); ng.gain.value = 0.4; f.connect(ng); ng.connect(g);
    g.connect(out);
  }
  s_buzz(ctx, t, v, p, o) {
    const len = o.len ?? 0.5;
    const out = this.out(v * 0.3, 0.2);
    const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = 140 * p;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 35; const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(os.frequency);
    const g = ctx.createGain(); this.env(g, t, 0.05, 0.7, len, 'lin');
    os.connect(g); g.connect(out); os.start(t); os.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len + 0.05);
  }
  s_ko(ctx, t, v) {
    this.s_explosion(ctx, t, v, 0.6);
    const out = this.out(v * 0.6, 0.9);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(55, t + 1.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = ctx.createGain(); this.env(g, t, 0.01, 0.8, 2);
    osc.connect(f); f.connect(g); g.connect(out); osc.start(t); osc.stop(t + 2.1);
  }
  s_ui(ctx, t, v) {
    const out = this.out(v * 0.35);
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.setValueAtTime(880, t); osc.frequency.setValueAtTime(1320, t + 0.03);
    const g = ctx.createGain(); this.env(g, t, 0.001, 0.4, 0.08); osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.1);
  }
  s_ok(ctx, t, v) {
    const out = this.out(v * 0.45, 0.3);
    [523, 784, 1046].forEach((fr, i) => {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = fr;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
      const g = ctx.createGain(); this.env(g, t + i * 0.05, 0.005, 0.35, 0.35);
      osc.connect(f); f.connect(g); g.connect(out); osc.start(t + i * 0.05); osc.stop(t + 0.5);
    });
    this.s_hit(ctx, t, v * 0.4, 1.2, { heavy: 0.6 });
  }
  s_cancel(ctx, t, v) {
    const out = this.out(v * 0.35);
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(600, t); osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = ctx.createGain(); this.env(g, t, 0.001, 0.5, 0.15); osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.2);
  }
  s_fanfare(ctx, t, v) {
    const out = this.out(v * 0.4, 0.5);
    const notes = [[392, 0], [392, 0.15], [392, 0.3], [523, 0.45], [659, 0.9], [784, 1.2]];
    for (const [fr, dt] of notes) {
      for (const det of [0, 4, -4]) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = fr; osc.detune.value = det * 3;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
        const g = ctx.createGain(); this.env(g, t + dt, 0.02, 0.18, dt === 1.2 ? 1.6 : 0.35);
        osc.connect(f); f.connect(g); g.connect(out); osc.start(t + dt); osc.stop(t + dt + 1.8);
      }
    }
  }

  // Kaiju roar: detuned saws through formant filters with pitch glide + distortion.
  roar(voice = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const p = voice.pitch ?? 1, dur = voice.dur ?? 2.2;
    const out = this.out(0.55 * (voice.vol ?? 1), 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.25); g.gain.setValueAtTime(1, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const ws = ctx.createWaveShaper(); ws.curve = this.makeCurve(60 * (voice.rough ?? 1));
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const oscs = [];
    for (const det of [0, 7, -9, 13]) {
      const os = ctx.createOscillator(); os.type = voice.metal ? 'square' : 'sawtooth';
      os.frequency.setValueAtTime(150 * p, t);
      os.frequency.linearRampToValueAtTime(230 * p, t + 0.3);
      os.frequency.linearRampToValueAtTime(190 * p, t + dur * 0.6);
      os.frequency.exponentialRampToValueAtTime(70 * p, t + dur);
      os.detune.value = det * 4;
      os.connect(mix); os.start(t); os.stop(t + dur + 0.1); oscs.push(os);
    }
    // vibrato
    const lfo = ctx.createOscillator(); lfo.frequency.value = voice.insect ? 45 : 7; const lg = ctx.createGain(); lg.gain.value = voice.insect ? 60 : 12;
    lfo.connect(lg); for (const os of oscs) lg.connect(os.frequency); lfo.start(t); lfo.stop(t + dur);
    mix.connect(ws);
    const formants = voice.insect ? [[2400, 6], [4200, 5]] : voice.metal ? [[600, 8], [1500, 10], [3300, 12]] : [[650, 5], [1150, 6], [2600, 7]];
    for (const [fr, q] of formants) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr * (voice.formant ?? 1); f.Q.value = q;
      ws.connect(f); f.connect(g);
    }
    const n = this.noise(t, dur, null); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(nf); nf.connect(ng); ng.connect(g);
    g.connect(out);
    if (voice.multi) { // three heads: delayed pitch-shifted copies
      setTimeout(() => this.roar({ ...voice, multi: 0, pitch: p * 1.25, vol: 0.6 }), 180);
      setTimeout(() => this.roar({ ...voice, multi: 0, pitch: p * 0.85, vol: 0.6 }), 360);
    }
  }

  stopLoops() { for (const h of [...this.loops]) h.stop(); }

  // ---------- procedural music ----------
  startMusic(style) {
    if (!this.ctx) { this.pendingMusic = style; return; }
    if (this.music && this.music.style === style) return;
    this.stopMusic();
    const S = SONGS[style] || SONGS[0];
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.mus);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    const m = { style, bus, step: 0, next: ctx.currentTime + 0.1, S, timer: null };
    const spb = 60 / S.bpm / 4;
    m.timer = setInterval(() => {
      while (m.next < ctx.currentTime + 0.15) {
        this.musicStep(m, m.next, spb);
        m.next += spb; m.step++;
      }
    }, 30);
    this.music = m;
  }
  stopMusic() {
    if (!this.music) return;
    const m = this.music; this.music = null;
    clearInterval(m.timer);
    const t = this.ctx.currentTime;
    m.bus.gain.cancelScheduledValues(t); m.bus.gain.setValueAtTime(m.bus.gain.value, t); m.bus.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => m.bus.disconnect(), 800);
  }
  musicStep(m, t, spb) {
    const S = m.S, ctx = this.ctx, st = m.step % 16, bar = Math.floor(m.step / 16) % S.prog.length;
    const root = S.root * Math.pow(2, S.prog[bar] / 12);
    const D = S.drums;
    if (D.k[st] === 'x') this.mKick(m.bus, t);
    if (D.s[st] === 'x') this.mSnare(m.bus, t);
    if (D.h[st] === 'x') this.mHat(m.bus, t);
    if (D.t && D.t[st] === 'x') this.mTaiko(m.bus, t, root);
    if (S.bass[st] !== '.') {
      const semi = parseInt(S.bass[st], 36) - 12;
      this.mBass(m.bus, t, root * Math.pow(2, semi / 12) / 2, spb * 1.8, S.bassType);
    }
    if (S.stab && S.stab[st] === 'x') this.mStab(m.bus, t, root, S.minor, spb * (S.stabLen || 2));
    if (S.lead && st % 2 === 0) {
      const ln = S.lead[(Math.floor(m.step / 2)) % S.lead.length];
      if (ln !== '.') this.mLead(m.bus, t, root * 2 * Math.pow(2, (parseInt(ln, 36) - 12) / 12), spb * 2.2, S.leadType);
    }
    if (S.pad && st === 0) this.mPad(m.bus, t, root, S.minor, spb * 16);
  }
  mKick(bus, t) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0.9, 0.3); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
  }
  mSnare(bus, t) {
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0.45, 0.18);
    this.noise(t, 0.2, f); f.connect(g); g.connect(bus);
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g2 = this.ctx.createGain(); this.env(g2, t, 0.002, 0.3, 0.12); o.connect(g2); g2.connect(bus); o.start(t); o.stop(t + 0.15);
  }
  mHat(bus, t) {
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, 0.12, 0.05);
    this.noise(t, 0.06, f); f.connect(g); g.connect(bus);
  }
  mTaiko(bus, t) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.8, 0.6); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.62);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g2 = this.ctx.createGain(); this.env(g2, t, 0.002, 0.5, 0.2); this.noise(t, 0.2, f); f.connect(g2); g2.connect(bus);
    const v = this.ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(this.verb);
  }
  mBass(bus, t, fr, len, type = 'sawtooth') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = fr;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = fr / 2;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + len); f.Q.value = 6;
    const g = this.ctx.createGain(); this.env(g, t, 0.005, 0.32, len);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + len + 0.05); o2.start(t); o2.stop(t + len + 0.05);
  }
  mStab(bus, t, root, minor, len) {
    const ints = minor ? [0, 3, 7, 12] : [0, 4, 7, 12];
    const out = this.ctx.createGain(); out.gain.value = 0.07; out.connect(bus);
    const v = this.ctx.createGain(); v.gain.value = 0.6; out.connect(v); v.connect(this.verb);
    for (const i of ints) for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * 2 * Math.pow(2, i / 12); o.detune.value = det;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + len);
      const g = this.ctx.createGain(); this.env(g, t, 0.01, 1, len);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
    }
  }
  mLead(bus, t, fr, len, type = 'square') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = fr;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = this.ctx.createGain(); lg.gain.value = fr * 0.012;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = this.ctx.createGain(); this.env(g, t, 0.02, 0.08, len);
    o.connect(f); f.connect(g); g.connect(bus);
    const v = this.ctx.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(this.verb);
    o.start(t); o.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len + 0.05);
  }
  mPad(bus, t, root, minor, len) {
    const ints = minor ? [0, 7, 15] : [0, 7, 16];
    for (const i of ints) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = root * Math.pow(2, i / 12);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + len + 0.05);
    }
  }
}

// Original procedural compositions (base36 note digits: 'c' = root, each step = semitone)
const SONGS = {
  0: { bpm: 148, root: 73.4, minor: true, prog: [0, 0, -2, -4, 0, 0, 3, 1],
    drums: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: 'x.........x.....' },
    bass: 'c.cc.c.f.c.cc.fe', stab: 'x.....x.....x...', lead: 'cf.ihf..cfhkh...ihfeihf.', leadType: 'sawtooth', pad: true },
  1: { bpm: 132, root: 82.4, minor: true, prog: [0, -4, -2, -5],
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: '..x...x...x...x.', t: 'x...x...x...x.x.' },
    bass: 'c...c.f.h...f.c.', stab: 'x.......x.......', stabLen: 6, lead: 'c.f.h.k.j.h.f...', pad: true },
  2: { bpm: 156, root: 69.3, minor: true, prog: [0, 1, 0, -2],
    drums: { k: 'x.x...x.x.x...x.', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
    bass: 'cccfcccfccchcccf', stab: '..x...x...x...x.', lead: 'c.cd.f..c.cd.fg.', leadType: 'square' },
  3: { bpm: 140, root: 61.7, minor: true, prog: [0, 0, 1, -1],
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: 'x.x...x.x.x...x.' },
    bass: 'c.c.d.c.c.c.f.e.', stab: 'x...........x...', stabLen: 4, lead: 'cdfhfdc.cdfhkh..', leadType: 'sawtooth', pad: true },
  4: { bpm: 112, root: 65.4, minor: true, prog: [0, -3, -5, -1],
    drums: { k: 'x.........x.....', s: '........x.......', h: '..x...x...x...x.', t: 'x.......x.......' },
    bass: 'c.......h.......', lead: 'h...f...e...c...', leadType: 'triangle', pad: true },
  menu: { bpm: 120, root: 73.4, minor: true, prog: [0, -4, -2, -5],
    drums: { k: 'x.......x.......', s: '........x.......', h: '..x...x...x...x.', t: 'x.....x.........' },
    bass: 'c.....c.f.......', stab: 'x...............', stabLen: 8, lead: 'c...f...h.....f.', leadType: 'sawtooth', pad: true },
  select: { bpm: 136, root: 77.8, minor: true, prog: [0, 0, -2, 1],
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: 'c.c.c.f.c.c.h.f.', stab: 'x.......x.......', stabLen: 3 },
  boss: { bpm: 164, root: 69.3, minor: true, prog: [0, 1, 0, 1, -2, -1, 0, 3],
    drums: { k: 'x.xx..x.x.xx..x.', s: '....x.......x.xx', h: 'xxxxxxxxxxxxxxxx', t: 'x...x...x...x...' },
    bass: 'ccdcccfcccdcccgf', stab: 'x..x..x...x..x..', lead: 'cdfgfdcbcdfgjihg', leadType: 'sawtooth', pad: true },
};
