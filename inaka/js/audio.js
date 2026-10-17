// All sounds are synthesised with WebAudio: cicadas, footsteps, animals, train, chimes.
let ctx = null, master = null, amb = null;
let muted = false;
const N = (f) => 440 * Math.pow(2, (f - 69) / 12);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  startAmbience();
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export function isMuted() { return muted; }

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(freq, t, dur, { type = 'sine', vol = 0.2, a = 0.01, slide = 0, dest = master } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  env(g, t, a, vol, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
}
function burst(t, dur, { freq = 1000, q = 1, vol = 0.2, type = 'bandpass', a = 0.005 } = {}) {
  const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, a, vol, dur); s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

// ---- ambience: min-min cicadas by day, higurashi in the evening, crossfaded by setDayPhase()
let cicadaG, higuG, riverG;
function startAmbience() {
  amb = ctx.createGain(); amb.gain.value = 0.5; amb.connect(master);
  // min-min zemi: band-passed noise, chopped by a fast LFO and swelled by a slow one
  cicadaG = ctx.createGain(); cicadaG.gain.value = 0; cicadaG.connect(amb);
  for (const [fq, rate] of [[4200, 14], [5200, 17]]) {
    const s = noise(), f = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 6;
    am.gain.value = 0.05; lfo.frequency.value = rate; lg.gain.value = 0.05;
    lfo.connect(lg).connect(am.gain);
    const sw = ctx.createOscillator(), swg = ctx.createGain(); sw.frequency.value = 0.13 + Math.random() * 0.05; swg.gain.value = 0.03;
    sw.connect(swg).connect(am.gain);
    s.connect(f).connect(am).connect(cicadaG); s.start(); lfo.start(); sw.start();
  }
  higuG = ctx.createGain(); higuG.gain.value = 0; higuG.connect(amb);
  riverG = ctx.createGain(); riverG.gain.value = 0; riverG.connect(amb);
  const rs = noise(), rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 900; rs.connect(rf).connect(riverG); rs.start();
  scheduleHigurashi();
}
function scheduleHigurashi() {
  // "kana-kana-kana": a falling train of chirps every few seconds
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  if (higuG.gain.value > 0.01) {
    const n = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      tone(4400 - k * 900, t + i * 0.13, 0.09, { type: 'sine', vol: 0.05 * (1 - k * 0.6), a: 0.01, slide: 0.85, dest: higuG });
    }
  }
  setTimeout(scheduleHigurashi, 3500 + Math.random() * 3500);
}
export function setDayPhase(day, evening) {
  if (!ctx) return;
  const t = ctx.currentTime;
  cicadaG.gain.setTargetAtTime(day * 0.9, t, 0.5);
  higuG.gain.setTargetAtTime(evening * 1.0, t, 0.5);
}
export function setRiver(v) { if (ctx) riverG.gain.setTargetAtTime(v * 0.25, ctx.currentTime, 0.3); }

// ---- effects
export function sfx(name, opt = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'step': burst(t, 0.06, { freq: opt.water ? 1500 : 600, q: 0.8, vol: opt.water ? 0.12 : 0.05 }); break;
    case 'coin': tone(N(88), t, 0.08, { type: 'square', vol: 0.06 }); tone(N(93), t + 0.07, 0.25, { type: 'square', vol: 0.06 }); break;
    case 'pick': [76, 79, 84].forEach((n, i) => tone(N(n), t + i * 0.06, 0.15, { type: 'triangle', vol: 0.15 })); break;
    case 'stamp': [72, 76, 79, 84, 88].forEach((n, i) => tone(N(n), t + i * 0.08, 0.3, { type: 'triangle', vol: 0.16 })); burst(t + 0.4, 0.15, { freq: 300, q: 0.5, vol: 0.3 }); break;
    case 'nope': tone(220, t, 0.15, { type: 'square', vol: 0.06, slide: 0.7 }); break;
    case 'moo': { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(140, t + 0.3); o.frequency.linearRampToValueAtTime(95, t + 1.1); f.type = 'lowpass'; f.frequency.value = 600; env(g, t, 0.15, 0.25, 1.0); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 1.3); break; }
    case 'meow': tone(700, t, 0.35, { type: 'triangle', vol: 0.12, a: 0.05, slide: 1.4 }); tone(980, t + 0.2, 0.3, { type: 'triangle', vol: 0.1, slide: 0.6 }); break;
    case 'woof': for (const d of [0, 0.22]) { tone(330, t + d, 0.1, { type: 'sawtooth', vol: 0.12, slide: 0.5 }); burst(t + d, 0.08, { freq: 900, q: 1, vol: 0.12 }); } break;
    case 'cluck': for (let i = 0; i < 3; i++) tone(900 + i * 80, t + i * 0.09, 0.05, { type: 'square', vol: 0.05, slide: 0.6 }); break;
    case 'splash': burst(t, 0.4, { freq: 1800, q: 0.6, vol: 0.25 }); burst(t + 0.05, 0.25, { freq: 3500, q: 1, vol: 0.12 }); break;
    case 'bell': [0, 0.12, 0.24].forEach((d) => { tone(1800, t + d, 0.4, { type: 'sine', vol: 0.08 }); tone(2690, t + d, 0.3, { type: 'sine', vol: 0.04 }); }); burst(t + 0.9, 0.05, { freq: 1200, vol: 0.3 }); burst(t + 1.15, 0.05, { freq: 1200, vol: 0.3 }); break;
    case 'drink': for (let i = 0; i < 4; i++) tone(500 + Math.random() * 300, t + i * 0.12, 0.06, { type: 'sine', vol: 0.1, slide: 1.6 }); break;
    case 'clank': burst(t, 0.12, { freq: 2500, q: 3, vol: 0.2 }); tone(1300, t, 0.2, { type: 'square', vol: 0.04 }); break;
    case 'horn': tone(N(71), t, 0.7, { type: 'sawtooth', vol: 0.06, a: 0.05 }); tone(N(75), t, 0.7, { type: 'sawtooth', vol: 0.05, a: 0.05 }); break;
    case 'train': for (let i = 0; i < 16; i++) { burst(t + i * 0.35, 0.05, { freq: 400, vol: 0.12 }); burst(t + i * 0.35 + 0.12, 0.05, { freq: 450, vol: 0.1 }); } break;
    case 'chime': { // Westminster quarters, the classic evening chime
      const seq = [[64, 60, 62, 55], [55, 62, 64, 60]];
      seq.flat().forEach((n, i) => { const d = i * 0.85 + (i >= 4 ? 0.6 : 0); tone(N(n + 12), t + d, 1.6, { type: 'sine', vol: 0.12, a: 0.01 }); tone(N(n + 24), t + d, 0.8, { type: 'sine', vol: 0.03 }); });
      break;
    }
  }
}
