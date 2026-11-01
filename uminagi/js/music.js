// Background music, made on the spot with WebAudio (no recordings): a gentle tune for each part of the day, one
// for indoors and one for the cave. Each theme is a chord progression, a bass, an optional pad and a melody
// composed once from the theme's own seed (an A A' B A'' shape over eight bars), played on small synthesised
// instruments (marimba, music box, soft pluck, flute) through a little echo. Themes cross-fade.
const PI2 = Math.PI * 2;
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const rng = (seed) => { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// chords are scale degrees (0 = I); a bar is 8 eighth-notes
export const THEMES = {
  morning: { bpm: 100, root: 60, scale: 'major', prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: 'marimba', bass: 'pluck', pad: 0.5, hat: 0.4, vol: 1 },
  day: { bpm: 112, root: 65, scale: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'marimba', bass: 'pluck', pad: 0.3, hat: 0.7, vol: 1 },
  evening: { bpm: 84, root: 57, scale: 'minor', prog: [0, 5, 2, 6, 0, 3, 4, 4], lead: 'flute', bass: 'soft', pad: 0.8, hat: 0, vol: 0.9 },
  night: { bpm: 72, root: 62, scale: 'major', prog: [0, 3, 0, 4, 5, 3, 4, 0], lead: 'box', bass: 'soft', pad: 0.7, hat: 0, vol: 0.75, sparse: 0.45 },
  home: { bpm: 92, root: 67, scale: 'major', prog: [0, 3, 1, 4, 0, 3, 4, 0], lead: 'box', bass: 'pluck', pad: 0.5, hat: 0.2, vol: 0.8 },
  cave: { bpm: 66, root: 50, scale: 'dorian', prog: [0, 0, 6, 6, 3, 3, 4, 4], lead: 'pluck', bass: 'soft', pad: 1, hat: 0, vol: 0.85, sparse: 0.55 },
};
// the melody: motif A (2 bars), A with a new ending, B, A again with a cadence
export function compose(name, th) {
  const r = rng('uminagi-bgm-' + name), sc = SCALES[th.scale], deg = (d) => th.root + 12 * Math.floor(d / 7) + sc[((d % 7) + 7) % 7];
  const rhythms = [[1, 0, 1, 0, 1, 1, 1, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 1, 1, 0, 1, 0, 0, 0], [1, 0, 1, 1, 1, 0, 1, 1], [1, 0, 0, 0, 1, 0, 1, 0]];
  const bar = (chord, last, rh, end) => {
    const out = []; let d = last;
    rh.forEach((on, i) => {
      if (!on || (th.sparse && i % 2 && r() < th.sparse)) { out.push(null); return; }
      const tones = [chord, chord + 2, chord + 4, chord + 7];
      if (i === 0 || (end && i >= 4)) d = tones.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a), tones[0]);   // land on the chord
      else d += [-1, 1, 1, -1, 2, -2, 0][Math.floor(r() * 7)];
      d = Math.max(5, Math.min(16, d)); out.push(deg(d));
    });
    return { notes: out, last: d };
  };
  const bars = []; let last = 9;
  const rh = [0, 1, 2, 3].map(() => rhythms[Math.floor(r() * rhythms.length)]);
  const A = [bar(th.prog[0], last, rh[0]), null]; A[1] = bar(th.prog[1], A[0].last, rh[1]);
  bars.push(A[0].notes, A[1].notes);
  const a2 = bar(th.prog[2], A[1].last, rh[0]), a3 = bar(th.prog[3], a2.last, rh[3], true); bars.push(a2.notes, a3.notes);
  const b0 = bar(th.prog[4], a3.last + 2, rh[2]), b1 = bar(th.prog[5], b0.last, rh[3]); bars.push(b0.notes, b1.notes);
  bars.push(A[0].notes.map((n, i) => (i < 4 ? n : null)).map((n, i) => n ?? (i === 4 ? deg(th.prog[6] + 2) : null)));
  bars.push([deg(th.prog[7] + 4), null, deg(th.prog[7] + 2), null, deg(0), null, null, null]);
  return { bars, deg };
}

export class Music {
  constructor(ctx, out) {
    this.c = ctx; this.on = true; this.theme = null; this.want = null; this.step = 0; this.nextT = 0;
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    // a little echo for space
    const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = 0.33; fb.gain.value = 0.28; wet.gain.value = 0.22; lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.bus.connect(out); this.bus.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(wet).connect(out);
    this.timer = setInterval(() => this.tick(), 80);
  }
  set(name) {
    if (name === this.want) return; this.want = name;
    const c = this.c, t = c.currentTime;
    this.bus.gain.cancelScheduledValues(t); this.bus.gain.setValueAtTime(this.bus.gain.value, t); this.bus.gain.linearRampToValueAtTime(0, t + 1.2);
    clearTimeout(this.swap);
    this.swap = setTimeout(() => {
      const th = THEMES[name]; if (!th) return;
      this.theme = { name, ...th, ...compose(name, th) }; this.step = 0; this.nextT = this.c.currentTime + 0.1;
      const t2 = this.c.currentTime; this.bus.gain.cancelScheduledValues(t2); this.bus.gain.setValueAtTime(0, t2); this.bus.gain.linearRampToValueAtTime(this.on ? 0.34 * th.vol : 0, t2 + 2.5);
    }, 1300);
  }
  toggle(on = !this.on) { this.on = on; const t = this.c.currentTime; this.bus.gain.cancelScheduledValues(t); this.bus.gain.setTargetAtTime(on && this.theme ? 0.34 * this.theme.vol : 0, t, 0.3); return on; }
  tick() {
    const th = this.theme; if (!th || this.c.state !== 'running') return;
    const e8 = 60 / th.bpm / 2;
    if (this.nextT < this.c.currentTime - 0.5) this.nextT = this.c.currentTime + 0.05;   // after a pause, do not rush to catch up
    while (this.nextT < this.c.currentTime + 0.3) { this.play(th, this.step, this.nextT, e8); this.nextT += e8; this.step++; }
  }
  play(th, s, t, e8) {
    const b = Math.floor(s / 8) % 8, i = s % 8, chord = th.prog[b], deg = th.deg;
    const n = th.bars[b][i]; if (n) this.note(th.lead, hz(n), t, e8 * (th.lead === 'flute' ? 1.8 : 1.4), 0.5);
    if (i === 0 || (i === 4 && th.bpm > 90)) this.note(th.bass, hz(deg(chord) - 24), t, e8 * 3, 0.55);
    if (i === 6 && th.bass === 'pluck') this.note('pluck', hz(deg(chord + 4) - 24), t, e8, 0.3);
    if (i === 0 && th.pad) this.pad([deg(chord), deg(chord + 2), deg(chord + 4)].map((m) => hz(m - 12)), t, e8 * 8, th.pad);
    if (th.hat && i % 2 === 1) this.hat(t, th.hat);
    if (th.lead !== 'box' && (i === 2 || i === 6) && th.hat > 0.3) for (const m of [deg(chord), deg(chord + 2), deg(chord + 4)]) this.note('pluck', hz(m), t, e8 * 0.8, 0.12);
  }
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  note(kind, f, t, dur, v) {
    const c = this.c, g = c.createGain(); g.connect(this.bus);
    const osc = (type, freq, gain = 1) => { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = freq; og.gain.value = gain; o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.6); return o; };
    if (kind === 'marimba') { osc('sine', f); osc('sine', f * 4, 0.25); this.env(g, t, 0.004, 0.3 * v, Math.max(0.4, dur)); }
    else if (kind === 'box') { osc('sine', f * 2); osc('sine', f * 5.4, 0.18); this.env(g, t, 0.002, 0.22 * v, 1.2); }
    else if (kind === 'flute') { const o = osc('triangle', f); osc('sine', f * 2, 0.2); const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5; lg.gain.value = f * 0.006; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.08); g.gain.setValueAtTime(0.16 * v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3); }
    else if (kind === 'pluck') { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 3; const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle'; o.frequency.value = f; o.connect(og).connect(lp).connect(g); o.start(t); o.stop(t + dur + 0.6); this.env(g, t, 0.003, 0.35 * v, Math.max(0.3, dur)); }
    else { osc('sine', f); osc('triangle', f, 0.3); this.env(g, t, 0.02, 0.35 * v, Math.max(0.5, dur)); }   // soft bass
    setTimeout(() => g.disconnect(), (t - c.currentTime + dur + 1) * 1000);
  }
  pad(fs, t, dur, v) {
    const c = this.c, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g); g.connect(this.bus);
    for (const f of fs) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.8); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018 * v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    setTimeout(() => g.disconnect(), (t - c.currentTime + dur + 1.2) * 1000);
  }
  hat(t, v) {
    const c = this.c, n = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter();
    if (!this.noise) { const len = c.sampleRate * 0.2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b; }
    n.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7000; n.connect(hp).connect(g).connect(this.bus);
    this.env(g, t, 0.002, 0.05 * v, 0.06); n.start(t); n.stop(t + 0.1);
  }
}
