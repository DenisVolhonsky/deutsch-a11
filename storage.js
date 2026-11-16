// Offline progress database. IndexedDB is primary; localStorage is used only for
// one-time migration and as a fallback on browsers where IDB is unavailable.
'use strict';
const ProgressStore = (() => {
  const DB_NAME = 'deutsch-a1-progress';
  const LEGACY_KEY = 'deutsch-a1-review-v6-fsrs';
  const VERSION = 1;
  const SNAPSHOT_CAP = 14;
  let db = null;
  let fallback = false;
  let saveChain = Promise.resolve();

  const clone = data => JSON.parse(JSON.stringify(data));
  function normalize(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Неверный формат прогресса');
    const clean = {};
    for (const [id, entry] of Object.entries(data)) {
      if (!/^[\w-]+:(de-ru|ru-de)$/.test(id)) continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (!Number.isFinite(Number(entry.stability)) || !Number.isFinite(Number(entry.difficulty))) continue;
      if (!Number.isFinite(Date.parse(entry.due)) || !Number.isFinite(Date.parse(entry.lastReview))) continue;
      clean[id] = clone(entry);
    }
    return clean;
  }
  function fromLegacy() {
    try { return normalize(JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')); }
    catch { return {}; }
  }
  const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
  function connect() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступна'));
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const database = r.result;
        if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
        if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('База открыта в другой вкладке'));
    });
  }
  async function init() {
    const old = fromLegacy();
    try {
      db = await connect();
      const tx = db.transaction('state','readonly');
      const persisted = await request(tx.objectStore('state').get('progress'));
      let result = persisted ? normalize(persisted) : {};
      // Preserve pre-existing progress when first upgrading from v6.3.
      let changed = !persisted;
      for (const [k,v] of Object.entries(old)) if (!result[k]) { result[k] = v; changed = true; }
      if (changed) await persist(result, true);
      return result;
    } catch (err) {
      console.warn('IndexedDB unavailable, retaining localStorage fallback',err);
      fallback = true;
      return old;
    }
  }
  async function persist(data, snapshot = false) {
    const clean = normalize(data);
    if (fallback || !db) {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(clean));
      return;
    }
    const tx = db.transaction(['state', 'snapshots'], 'readwrite');
    tx.objectStore('state').put(clean, 'progress');
    if (snapshot) {
      const day = new Date().toISOString().slice(0,10);
      tx.objectStore('snapshots').put({id:day,createdAt:new Date().toISOString(),progress:clean});
    }
    await done(tx);
  }
  function save(data) {
    // Serialize all writes to avoid out-of-order overwrites on quick taps.
    const copy = clone(data);
    saveChain = saveChain.catch(console.error).then(() => persist(copy, true));
    return saveChain;
  }
  async function restoreLastSnapshot() {
    await saveChain;
    if (!db) return null;
    const tx = db.transaction('snapshots','readonly');
    const all = await request(tx.objectStore('snapshots').getAll());
    const sorted = all.sort((a,b) => b.id.localeCompare(a.id));
    return sorted[0] ? clone(sorted[0].progress) : null;
  }
  async function snapshotCount() {
    if (!db) return 0;
    return request(db.transaction('snapshots','readonly').objectStore('snapshots').count());
  }
  async function pruneSnapshots() {
    if (!db) return;
    const readTx = db.transaction('snapshots','readonly');
    const keys = await request(readTx.objectStore('snapshots').getAllKeys());
    const old = keys.sort().slice(0, Math.max(0,keys.length - SNAPSHOT_CAP));
    if (!old.length) return;
    const tx = db.transaction('snapshots','readwrite');
    for (const key of old) tx.objectStore('snapshots').delete(key);
    await done(tx);
  }
  async function exportFile(data) {
    await saveChain;
    const content = JSON.stringify({version:7, app:'Deutsch A1', format:'progress-backup',createdAt:new Date().toISOString(), progress:normalize(data)},null,2);
    const file = new File([content], `deutsch-a1-progress-${new Date().toISOString().slice(0,10)}.json`,{type:'application/json'});
    if (navigator.share && navigator.canShare?.({files:[file]})) {
      try { await navigator.share({files:[file],title:'Резервная копия Deutsch A1'}); return 'shared'; }
      catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
    }
    const url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url; a.download=file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return 'downloaded';
  }
  function parseBackup(raw) {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!payload || (payload.app && payload.app !== 'Deutsch A1') || !payload.progress) throw new Error('Неверный файл резервной копии');
    return normalize(payload.progress);
  }
  return {init,save,exportFile,parseBackup,restoreLastSnapshot,snapshotCount,pruneSnapshots,normalize,get isFallback(){return fallback}};
})();
