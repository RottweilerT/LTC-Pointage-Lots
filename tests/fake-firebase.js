// Faux Firebase (API « compat ») pour les tests navigateur : données gardées dans localStorage,
// partagées entre onglets du même navigateur (simule deux appareils branchés sur la même base).
(function () {
  const KEY = '__fakefs';
  const DEL = { __del: true };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = s => localStorage.setItem(KEY, JSON.stringify(s));
  const listeners = new Set();
  window.__fakeWrites = 0;
  const notify = () => setTimeout(() => listeners.forEach(l => l()), 0);
  addEventListener('storage', e => { if (e.key === KEY) notify(); });
  const clone = o => JSON.parse(JSON.stringify(o));
  function merge(a, b) {
    const out = Object.assign({}, a);
    for (const [k, v] of Object.entries(b)) {
      if (v && v.__del) delete out[k];
      else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  const strip = o => { if (o && typeof o === 'object' && !Array.isArray(o)) { const r = {}; for (const [k, v] of Object.entries(o)) if (!(v && v.__del)) r[k] = strip(v); return r; } return o; };
  function docRef(col, id) {
    return {
      id, col,
      get: async () => snap(col, id),
      set: async (d, o) => { apply([['set', col, id, d, o]]); },
      delete: async () => { apply([['del', col, id]]); },
      onSnapshot(cb) { const l = () => cb(snap(col, id)); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); }
    };
  }
  function snap(col, id) { const s = load(); const d = s[col] && s[col][id]; return { id, exists: !!d, data: () => d && clone(d), ref: docRef(col, id) }; }
  function apply(ops) {
    if (window.__fakeDeny) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
    const s = load();
    for (const [t, col, id, d, o] of ops) {
      s[col] = s[col] || {};
      if (t === 'del') delete s[col][id];
      else s[col][id] = o && o.merge ? merge(s[col][id] || {}, d) : strip(clone(d));
      window.__fakeWrites++;
    }
    save(s); notify();
  }
  function query(col, filt) {
    const run = () => { const s = load(); const docs = Object.keys(s[col] || {}).filter(id => !filt || s[col][id][filt[0]] === filt[1]).map(id => snap(col, id)); return { docs, size: docs.length }; };
    return {
      where: (f, op, v) => query(col, [f, v]),
      doc: id => docRef(col, id),
      get: async () => run(),
      onSnapshot(cb) { const l = () => cb(run()); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); }
    };
  }
  const db = {
    enablePersistence: () => Promise.resolve(),
    collection: n => query(n),
    batch() { const ops = []; return { set: (r, d, o) => ops.push(['set', r.col, r.id, d, o]), delete: r => ops.push(['del', r.col, r.id]), commit: async () => apply(ops) }; }
  };
  const firestore = () => db;
  firestore.FieldValue = { delete: () => DEL };
  window.firebase = { initializeApp: () => ({}), firestore };
})();
