// Where the game keeps its saves: the browser's localStorage, or, while visiting a friend's town
// (?visit=CODE, see boot.js), a copy of their save held in memory that is never written back.
// Codes ("あいことば"): the saves gzipped and written in URL-safe base64 behind a short tag.
export const LIFE_KEY = 'uminagi_life_v1', APP_KEY = 'uminagi-save-v1';
const visit = () => globalThis.__uminagiVisit || null;
export const visiting = () => !!visit();
export function getItem(k) { const v = visit(); if (v) return v.data[k] ?? null; try { return localStorage.getItem(k); } catch { return null; } }
export function setItem(k, s) { if (visit()) return; try { localStorage.setItem(k, s); } catch { /* private mode */ } }
export function removeItem(k) { if (visit()) return; try { localStorage.removeItem(k); } catch { /* ignore */ } }

const TAG = 'UMI1.';
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
async function pipe(bytes, stream) { const r = new Blob([bytes]).stream().pipeThrough(stream); return new Uint8Array(await new Response(r).arrayBuffer()); }
// pack: { data: { key: string }, ...extra } -> code
export async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return TAG + 'r' + b64(raw);
  return TAG + 'z' + b64(await pipe(raw, new CompressionStream('gzip')));
}
export async function decode(code) {
  code = String(code || '').trim().replace(/\s+/g, '');
  const m = code.match(/UMI1\.([rz])([A-Za-z0-9_-]+)/); if (!m) throw new Error('あいことばの 形が ちがうみたい');
  const bytes = unb64(m[2]), raw = m[1] === 'z' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj?.data?.[LIFE_KEY]) throw new Error('セーブが 入っていないみたい');
  return obj;
}
// the whole save (a backup) / just the town (to show a friend)
export const backupCode = () => encode({ v: 1, kind: 'backup', at: Date.now(), data: { [LIFE_KEY]: getItem(LIFE_KEY), [APP_KEY]: getItem(APP_KEY) } });
export function townCode(name) {
  const s = JSON.parse(getItem(LIFE_KEY) || '{}');
  delete s.pocket; delete s.mat; delete s.daily; delete s.lastCatch;   // what is in ぽっけ's pockets stays home
  return encode({ v: 1, kind: 'town', name: String(name || '').slice(0, 16), at: Date.now(), data: { [LIFE_KEY]: JSON.stringify(s) } });
}
// a backup back in place (the page reloads to start from it)
export async function restore(code) {
  const obj = await decode(code);
  if (obj.kind === 'town') throw new Error('これは 町を見せる あいことばだよ。セーブの 書き出しの あいことばを つかってね');
  for (const [k, v] of Object.entries(obj.data)) if (v != null) localStorage.setItem(k, v);
  return obj;
}
