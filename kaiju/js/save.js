// Persistent storage: IndexedDB with localStorage fallback.
const DB = 'kaiju-fighters', STORE = 'kv';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
export async function load(key, def) {
  const db = await open();
  if (db) {
    try {
      const v = await new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = rej; });
      if (v !== undefined) return v;
    } catch (e) { /* fall through */ }
  }
  try { const s = localStorage.getItem(DB + ':' + key); if (s) return JSON.parse(s); } catch (e) { /* ignore */ }
  return def;
}
export async function save(key, val) {
  try { localStorage.setItem(DB + ':' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  const db = await open();
  if (!db) return;
  try { await new Promise((res) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* ignore */ }
}
// Binary data (user-supplied audio). IndexedDB only; stays on this device.
export async function saveBlob(key, blob) {
  const db = await open(); if (!db) return false;
  return new Promise((res) => { const t = db.transaction(STORE, 'readwrite'); if (blob) t.objectStore(STORE).put(blob, 'blob:' + key); else t.objectStore(STORE).delete('blob:' + key); t.oncomplete = () => res(true); t.onerror = () => res(false); });
}
export async function loadBlob(key) {
  const db = await open(); if (!db) return null;
  return new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get('blob:' + key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
}
