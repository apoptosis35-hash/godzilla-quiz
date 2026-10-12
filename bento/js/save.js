// Persistent records in localStorage (synchronous, survives reloads and PWA restarts).
import { TIERS } from './config.js';

const KEY = 'obento-pon:v1';
const RESUME = 'obento-pon:resume';

function blank() {
  return {
    best: 0, maxCombo: 0, plays: 0, totalMerges: 0, kings: 0, bestTier: 0,
    born: new Array(TIERS.length).fill(0),     // how many of each okazu have appeared
    recent: [],                                // last scores
    settings: { bgm: true, se: true, vib: true, shake: true, fx: 'normal' },
    tutorialDone: false,
  };
}

export const store = {
  data: blank(),
  ok: true,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const b = blank();
        this.data = { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) } };
        if (!Array.isArray(this.data.born) || this.data.born.length !== TIERS.length) {
          const born = b.born; (d.born || []).forEach((v, i) => { if (i < born.length) born[i] = v | 0; }); this.data.born = born;
        }
      }
    } catch (e) { this.ok = false; }
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { this.ok = false; }
  },
  reset() {
    const settings = this.data.settings;
    this.data = blank();
    this.data.settings = settings;
    this.save();
    this.clearResume();
  },
  saveResume(snap) { try { localStorage.setItem(RESUME, JSON.stringify(snap)); } catch (e) { /* ignore */ } },
  loadResume() { try { const s = localStorage.getItem(RESUME); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  clearResume() { try { localStorage.removeItem(RESUME); } catch (e) { /* ignore */ } },
};
