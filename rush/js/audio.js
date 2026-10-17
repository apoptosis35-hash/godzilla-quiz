// Tiny WebAudio synth: every sound is generated, no audio files.
let ac = null, master = null, muted = false, lastPop = 0, noiseBuf = null;

function init() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
}

function tone(f, dur, { type = 'square', vol = 0.18, slide = 0, delay = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 1800) {
  if (!ac || muted) return;
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}

export const audio = {
  init,
  get muted() { return muted; },
  set muted(m) { muted = m; },
  good(big) { const b = big ? 660 : 520; [0, 4, 7, 12].forEach((s, i) => tone(b * 2 ** (s / 12), 0.12, { type: 'square', vol: 0.12, delay: i * 0.045 })); if (big) tone(b * 4, 0.3, { type: 'sine', vol: 0.12, delay: 0.18 }); },
  bad() { tone(300, 0.28, { type: 'sawtooth', vol: 0.14, slide: 0.4 }); tone(200, 0.3, { type: 'square', vol: 0.08, slide: 0.5, delay: 0.05 }); },
  pop() { if (!ac) return; const t = ac.currentTime; if (t - lastPop < 0.035) return; lastPop = t; tone(380 + Math.random() * 500, 0.06, { type: 'triangle', vol: 0.14, slide: 0.5 }); noise(0.05, 0.08, 2500); },
  hit() { noise(0.12, 0.25, 900); tone(140, 0.15, { type: 'sine', vol: 0.25, slide: 0.5 }); },
  step(i) { tone(330 * 2 ** (i / 12 * 1.5), 0.1, { type: 'square', vol: 0.11 }); },
  perfect() { [0, 7, 12, 16, 19].forEach((s, i) => tone(784 * 2 ** (s / 12), 0.1, { type: 'sine', vol: 0.1, delay: i * 0.035 })); },
  win() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), i === 6 ? 0.5 : 0.13, { type: 'square', vol: 0.12, delay: i * 0.11 })); },
  lose() { [7, 4, 0, -5].forEach((s, i) => tone(392 * 2 ** (s / 12), 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.17 })); },
  coin() { tone(1320, 0.05, { type: 'square', vol: 0.06 }); tone(1760, 0.08, { type: 'square', vol: 0.06, delay: 0.04 }); },
  tick() { tone(1000, 0.03, { type: 'square', vol: 0.05 }); },
  boss() { tone(90, 0.5, { type: 'sawtooth', vol: 0.18, slide: 0.6 }); noise(0.3, 0.2, 400); },
};

export function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not supported */ } }
