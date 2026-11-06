// WebAudio synth: a festive loop that speeds up with granny, comic sound effects, and (optional) speech voices.
let ctx = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null;
let soundOn = true, voiceOn = true;
let tempo = 1, nextNote = 0, step = 0, musicOn = false, timer = null;

export const audio = {
  init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = soundOn ? 0.8 : 0; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // iOS: wake the speech engine on the first gesture
    try { if (voiceOn && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { /* ignore */ }
  },
  resume() { if (ctx && ctx.state !== 'running') ctx.resume(); },
  get sound() { return soundOn; },
  get voice() { return voiceOn; },
  setSound(on) { soundOn = on; if (master) master.gain.value = on ? 0.8 : 0; if (!on) this.hush(); },
  setVoice(on) { voiceOn = on; if (!on) this.hush(); },
  hush() { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  setTempo(t) { tempo = t; },
  startMusic() { if (!ctx || musicOn) return; musicOn = true; nextNote = ctx.currentTime + 0.05; step = 0; timer = setInterval(sched, 25); },
  stopMusic() { musicOn = false; clearInterval(timer); },

  sfx(name) {
    if (!ctx || !soundOn) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'candy': tone('square', 1320, 1760, t, 0.08, 0.15); tone('square', 1760, 2200, t + 0.06, 0.08, 0.12); break;
      case 'jump': tone('sine', 300, 1200, t, 0.3, 0.35); break; // slide whistle up
      case 'slide': tone('sine', 1100, 260, t, 0.3, 0.3); break;
      case 'land': noise(t, 0.12, 400, 0.5); tone('sine', 120, 50, t, 0.15, 0.6); break;
      case 'hit': tone('square', 220, 60, t, 0.25, 0.35); noise(t, 0.2, 1200, 0.6); tone('sine', 800, 780, t + 0.05, 0.25, 0.25); break; // bonk
      case 'boing': tone('sine', 200, 600, t, 0.12, 0.4); tone('sine', 600, 250, t + 0.12, 0.2, 0.35); break;
      case 'pop': tone('sine', 900, 200, t, 0.08, 0.4); break;
      case 'turbo': noise(t, 0.6, 3000, 0.5, true); tone('sawtooth', 200, 900, t, 0.6, 0.18); break;
      case 'tea': tone('triangle', 523, 523, t, 0.1, 0.3); tone('triangle', 659, 659, t + 0.1, 0.1, 0.3); tone('triangle', 784, 784, t + 0.2, 0.1, 0.3); tone('triangle', 1047, 1047, t + 0.3, 0.25, 0.3); break;
      case 'chatter': for (let i = 0; i < 8; i++) noise(t + i * 0.05, 0.025, 5000, 0.5); break;
      case 'pigeon': for (let i = 0; i < 10; i++) noise(t + i * 0.03 + Math.random() * 0.02, 0.03, 900, 0.5); tone('sine', 500, 420, t, 0.15, 0.25); tone('sine', 520, 430, t + 0.2, 0.15, 0.25); break;
      case 'meow': tone('triangle', 700, 1000, t, 0.12, 0.3); tone('triangle', 1000, 600, t + 0.12, 0.25, 0.3); break;
      case 'siren': for (let i = 0; i < 4; i++) { tone('square', 760, 760, t + i * 0.5, 0.25, 0.12); tone('square', 620, 620, t + i * 0.5 + 0.25, 0.25, 0.12); } break;
      case 'fly': tone('sine', 400, 2000, t, 0.5, 0.3); break; // salaryman launched
      case 'kiran': tone('sine', 2400, 2400, t, 0.06, 0.2); tone('sine', 3200, 3200, t + 0.07, 0.25, 0.2); break;
      case 'sale': [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.09, 0.18)); break;
      case 'splat': noise(t, 0.25, 600, 0.7); tone('sine', 300, 80, t, 0.2, 0.3); break;
      case 'near': tone('sawtooth', 1200, 400, t, 0.15, 0.12); break;
      case 'bonus': [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, t + i * 0.06, 0.12, 0.25)); break;
      case 'over': [392, 370, 349, 330].forEach((f, i) => tone('triangle', f, f * 0.98, t + i * 0.3, 0.32, 0.3)); break;
      case 'puff': noise(t, 0.4, 500, 0.35); break;
      case 'scream': tone('sawtooth', 900, 1300, t, 0.8, 0.06); break;
    }
  },

  // speech: who = 'baa' | 'kid' | 'man' | 'cop' | 'jii'
  say(text, who = 'baa') {
    if (!voiceOn || !soundOn || !('speechSynthesis' in window)) return;
    try {
      const clean = text.replace(/[！!？?〜♪♡…ー]+$/g, (m) => m.replace(/[〜♪♡]/g, '')).replace(/[♪♡]/g, '');
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'ja-JP';
      const v = jaVoice(); if (v) u.voice = v;
      const P = { baa: [0.55, 1.25], kid: [1.9, 1.35], man: [0.8, 1.5], cop: [0.4, 1.3], jii: [0.1, 1.0] }[who] || [1, 1];
      u.pitch = P[0]; u.rate = P[1]; u.volume = 1;
      if (who === 'baa' || who === 'cop') speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  },
};

let _voice;
function jaVoice() {
  if (_voice !== undefined) return _voice;
  try {
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return null;
    _voice = vs.find((v) => /ja[-_]JP/i.test(v.lang) && /Kyoko|O-ren|Google/i.test(v.name)) || vs.find((v) => /ja/i.test(v.lang)) || null;
  } catch (e) { _voice = null; }
  return _voice;
}

function tone(type, f0, f1, t, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, freq, vol, sweep) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = 0.8;
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * 0.2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02);
}

// ---------- music: a bouncy festival (matsuri) loop in the yonanuki scale ----------
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
// C D E G A — 0 = rest
const MEL = [72, 0, 74, 76, 79, 0, 76, 74, 72, 74, 76, 0, 69, 0, 72, 0,
  76, 0, 79, 81, 79, 76, 74, 76, 72, 0, 74, 0, 72, 0, 0, 0,
  81, 0, 79, 76, 79, 0, 76, 74, 76, 79, 81, 0, 84, 0, 81, 0,
  79, 76, 74, 72, 74, 76, 74, 69, 72, 0, 72, 0, 74, 0, 76, 0];
const BASS = [48, 55, 48, 55, 45, 52, 45, 52, 43, 50, 43, 50, 48, 55, 48, 55];
function sched() {
  if (!musicOn || !ctx) return;
  const spb = 60 / (150 * tempo) / 2; // 8th notes
  while (nextNote < ctx.currentTime + 0.12) {
    const t = nextNote, i = step % MEL.length;
    const m = MEL[i];
    if (m) { note('square', N(m), t, spb * 0.9, 0.14); note('triangle', N(m + 12), t, spb * 0.5, 0.05); }
    if (i % 2 === 0) note('triangle', N(BASS[(i / 2) % BASS.length]), t, spb * 1.6, 0.35);
    if (i % 4 === 0) kick(t);
    if (i % 4 === 2) hat(t, 0.25);
    if (i % 8 === 6) hat(t, 0.12, 2400); // wood block-ish
    nextNote += spb; step++;
  }
}
function note(type, f, t, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.02);
}
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.17);
}
function hat(t, vol, f = 8000) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(fl); fl.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.06);
}
