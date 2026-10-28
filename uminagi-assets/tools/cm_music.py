"""Original 30 s jingle for the 海凪の港町 commercial, synthesised with numpy (no samples, no borrowed tunes).
120 BPM, 4/4, one bar = 2 s, 15 bars: so cuts fall on bar lines.
  bars 1-2  intro: marimba arpeggios over a soft pad          (aerial title)
  bars 3-9  tune:  marimba melody, plucked bass, shaker, claps (cast, gameplay)
  bars 10-12 lift: glockenspiel doubles the melody             (the town grows)
  bars 13-15 ending: slower cadence, a chime and a held chord  (sunset, logo)
usage: python3 cm_music.py out.wav
"""
import sys, wave
import numpy as np

SR = 44100
BAR = 2.0
BEAT = BAR / 4
N = int(SR * BAR * 15)
L = np.zeros(N); R = np.zeros(N)

def hz(n):   # MIDI note -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

def env(n, a=0.004, d=0.5):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)

def marimba(n, dur=0.9):
    m = int(SR * dur); t = np.arange(m) / SR; f = hz(n)
    s = np.sin(2 * np.pi * f * t) * env(m, 0.002, 0.35) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * env(m, 0.001, 0.05) + 0.12 * np.sin(2 * np.pi * f * 10 * t) * env(m, 0.001, 0.015)
    return s

def glock(n, dur=1.4):
    m = int(SR * dur); t = np.arange(m) / SR; f = hz(n)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.2) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.08)) * env(m, 0.001, 0.6)

def pluck(n, dur=0.45):   # Karplus-Strong bass
    f = hz(n); p = int(SR / f); m = int(SR * dur)
    buf = np.random.default_rng(n).uniform(-1, 1, p); out = np.zeros(m)
    for i in range(m):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return out * env(m, 0.003, 0.3)

def pad(notes, dur):
    m = int(SR * dur); t = np.arange(m) / SR; s = np.zeros(m)
    for n in notes:
        for det in (-0.12, 0.12):
            s += np.sin(2 * np.pi * hz(n + det) * t + np.sin(2 * np.pi * 0.3 * t))
    a = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.5)
    return s * a / (2 * len(notes))

def noise_hit(dur, d, hp=True, seed=0):
    m = int(SR * dur); x = np.random.default_rng(seed).uniform(-1, 1, m)
    if hp: x = np.diff(np.concatenate([[0], x]))
    return x * env(m, 0.001, d)

# chords per bar (C major): I vi IV V | I iii IV V ...
CH = {'C': [48, 52, 55], 'Am': [45, 48, 52], 'F': [41, 45, 48], 'G': [43, 47, 50], 'Em': [40, 43, 47], 'Dm': [38, 41, 45], 'G7': [43, 47, 53]}
prog = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'Am', 'F', 'C', 'G', 'F', 'G7', 'C']

# melody: (beat in bar, MIDI note, length in beats) for bars 3..12, written for this jingle
MEL = {
    3: [(0, 76, 1), (1, 79, 0.5), (1.5, 81, 0.5), (2, 79, 1), (3, 76, 1)],
    4: [(0, 72, 1), (1, 74, 0.5), (1.5, 76, 0.5), (2, 74, 2)],
    5: [(0, 77, 1), (1, 76, 0.5), (1.5, 74, 0.5), (2, 72, 1), (3, 69, 1)],
    6: [(0, 71, 1.5), (1.5, 72, 0.5), (2, 74, 2)],
    7: [(0, 76, 1), (1, 79, 0.5), (1.5, 81, 0.5), (2, 84, 1), (3, 83, 1)],
    8: [(0, 81, 1), (1, 79, 0.5), (1.5, 76, 0.5), (2, 79, 2)],
    9: [(0, 77, 0.5), (0.5, 76, 0.5), (1, 77, 1), (2, 81, 1), (3, 79, 1)],
    10: [(0, 76, 1), (1, 74, 1), (2, 72, 2)],
    11: [(0, 81, 1), (1, 84, 1), (2, 83, 0.5), (2.5, 81, 0.5), (3, 79, 1)],
    12: [(0, 77, 1), (1, 76, 1), (2, 74, 1), (3, 79, 1)],
}

for b, ch in enumerate(prog):
    bar = b + 1; t0 = b * BAR; notes = CH[ch]
    # pad under everything
    add(pad([n + 12 for n in notes], BAR + 0.3), t0, 0, 0.10 if bar < 13 else 0.14)
    if bar <= 2:   # intro arpeggios
        for k in range(8):
            add(marimba(notes[k % 3] + 24 + (12 if k in (3, 7) else 0)), t0 + k * BEAT / 2, -0.3 + 0.6 * (k % 2), 0.22)
        continue
    if bar <= 12:
        # bass on 1 and 3, a walk-up on the 'and' of 4
        add(pluck(notes[0] - 12), t0, 0, 0.55); add(pluck(notes[0] - 5), t0 + 2 * BEAT, 0, 0.45)
        add(pluck(notes[0] - 10), t0 + 3.5 * BEAT, 0, 0.3)
        # off-beat chord stabs (ukulele-ish marimba)
        for k in (1, 3):
            for n in notes: add(marimba(n + 12, 0.35), t0 + k * BEAT, 0.35, 0.10)
        # shaker on eighths, clap on 2 and 4
        for k in range(8): add(noise_hit(0.08, 0.02, seed=k), t0 + k * BEAT / 2, 0.5, 0.05 if k % 2 else 0.03)
        for k in (1, 3): add(noise_hit(0.18, 0.05, False, seed=9 + k), t0 + k * BEAT, -0.2, 0.10)
        for beat, n, ln in MEL.get(bar, []):
            add(marimba(n, 0.6 + 0.3 * ln), t0 + beat * BEAT, -0.15, 0.32)
            if bar >= 10: add(glock(n + 12), t0 + beat * BEAT, 0.25, 0.10)
    else:   # ending: half-time cadence, then the held tonic with a chime
        add(pluck(notes[0] - 12, 1.2), t0, 0, 0.5)
        if bar < 15:
            for k, n in enumerate(notes + [notes[0] + 12]): add(marimba(n + 24, 1.0), t0 + k * BEAT, -0.3 + 0.2 * k, 0.2)
        else:
            for k, n in enumerate([72, 76, 79, 84]): add(glock(n + 12, 2.0), t0 + k * 0.09, -0.3 + 0.2 * k, 0.16)
            add(pad([60, 64, 67, 72], BAR), t0, 0, 0.2)

# a little room: two short echoes, then fade the last half second and normalise
for d, g in ((0.11, 0.18), (0.23, 0.10)):
    k = int(d * SR); L2, R2 = L.copy(), R.copy(); L[k:] += R2[:-k] * g; R[k:] += L2[:-k] * g
fade = np.ones(N); m = int(0.6 * SR); fade[-m:] = np.linspace(1, 0, m) ** 2
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max()); L *= 0.89 / peak; R *= 0.89 / peak
out = (np.stack([L, R], 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'cm_music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', len(out) / SR, 's')
