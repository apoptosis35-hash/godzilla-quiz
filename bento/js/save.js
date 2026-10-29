// Persistent records in localStorage (synchronous, survives reloads and PWA restarts).
import { TIERS } from './config.js';

const KEY = 'obento-pon:v1';
const CAMEO = 'obento-pon:cameo';     // the reward photo; stays on this device only
const RARE_IMG = 'obento-pon:rareimg';  // a replacement picture for the rare piece; this device only
const RESUME = 'obento-pon:resume2'; // saved boards from the 11-okazu version are not restored

function blank() {
  return {
    best: 0, maxCombo: 0, plays: 0, totalMerges: 0, kings: 0, bestTier: 0,
    born: new Array(TIERS.length).fill(0),     // how many of each okazu have appeared
    recent: [],                                // last scores
    settings: { bgm: true, se: true, vib: true, shake: true, fx: 'normal' },
    tutorialDone: false,
    maxSmash: 0, powerTipDone: false, rareFound: 0,
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
        // v1.0 had 11 okazu (コロッケ was No.8); drop its slot so the others keep their counts
        if (Array.isArray(d.born) && d.born.length === 11 && TIERS.length === 10) {
          d.born.splice(7, 1);
          if (this.data.bestTier >= 7) this.data.bestTier--;
        }
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
  saveCameo(dataURL) { try { if (dataURL) localStorage.setItem(CAMEO, dataURL); else localStorage.removeItem(CAMEO); return true; } catch (e) { return false; } },
  saveRareImg(dataURL) { try { if (dataURL) localStorage.setItem(RARE_IMG, dataURL); else localStorage.removeItem(RARE_IMG); return true; } catch (e) { return false; } },
  loadRareImg() { try { return localStorage.getItem(RARE_IMG); } catch (e) { return null; } },
  loadCameo() { try { return localStorage.getItem(CAMEO); } catch (e) { return null; } },
};
