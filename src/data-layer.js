const memFallback = { inventories: new Map(), data: new Map(), state: new Map(), history: new Map() };

/* ---------- Base partagée Firebase (Firestore) ----------
   pt_inventaires/{inv}        nom, colonnes, colonne des lots, clôture
   pt_lignes/{inv}_{k}         tranche de 500 lignes du fichier importé (numéros + autres colonnes)
   pt_etat/{inv}_{k}           pointage de la tranche : t.{i} = heure du pointage (absent = non pointé)
   pt_journal/{inv}_{id}       historique des opérations (avec de quoi les annuler)
   pt_anomalies/{inv}_{id}     numéros absents, commandes ambiguës ou non comprises            */
const CHUNK = 500;
const DEVICE = (() => { try { let d = localStorage.getItem('pointage-appareil'); if (!d) { d = 'a' + Math.random().toString(36).slice(2, 10); localStorage.setItem('pointage-appareil', d); } return d; } catch (e) { return 'a' + Math.random().toString(36).slice(2, 10); } })();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const Cloud = {
  db: null, ok: false, denied: false, unsubs: [], invUnsub: null,
  init() {
    if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG || !window.firebase) return false;
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.firestore();
      this.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      this.ok = true;
    } catch (e) { this.ok = false; }
    return this.ok;
  },
  col(n) { return this.db.collection(n); },
  FV() { return firebase.firestore.FieldValue; },
  fail(e) {
    if (e && e.code === 'permission-denied') { this.denied = true; showDbNotice('denied'); }
    else if (e && e.code === 'resource-exhausted') toast('Limite gratuite Firebase du jour atteinte : réessayez demain.');
  },
  async commit(ops) {
    // ops : [type, ref, data, options]
    for (let i = 0; i < ops.length; i += 450) {
      const b = this.db.batch();
      ops.slice(i, i + 450).forEach(([t, ref, d, o]) => t === 'del' ? b.delete(ref) : b.set(ref, d, o || {}));
      await b.commit();
    }
  },
  histDoc(h) {
    return { inv: h.inv, id: h.id, seq: h.seq, t: h.t, dev: h.dev || '', kind: h.kind, cmd: h.cmd || '', label: h.label || '', result: h.result || '', undone: !!h.undone,
      d: JSON.stringify({ rows: h.rows || [], prevS: h.prevS || [], prevT: h.prevT || [] }) };
  },
  histFrom(x) { let d = {}; try { d = JSON.parse(x.d || '{}'); } catch (e) {} return { id: x.id, inv: x.inv, seq: x.seq || 0, t: x.t, dev: x.dev, kind: x.kind, cmd: x.cmd, label: x.label, result: x.result, undone: !!x.undone, rows: d.rows || [], prevS: d.prevS || [], prevT: d.prevT || [] }; },
  invDoc(inv) { return { id: inv.id, name: inv.name, created: inv.created, closed: !!inv.closed, columns: inv.columns, lotCol: inv.lotCol, count: inv.count, chunk: CHUNK }; },
  watchList(cb) {
    if (this.invUnsub) this.invUnsub();
    this.invUnsub = this.col('pt_inventaires').onSnapshot(s => cb(s.docs.map(d => d.data())), e => this.fail(e));
  },
  async create(inv, data, st, hist) {
    const ops = [['set', this.col('pt_inventaires').doc(inv.id), this.invDoc(inv)]];
    const n = data.lots.length;
    for (let k = 0; k * CHUNK < n; k++) {
      const a = k * CHUNK, b = Math.min(n, a + CHUNK);
      ops.push(['set', this.col('pt_lignes').doc(`${inv.id}_${k}`), { inv: inv.id, k, lots: data.lots.slice(a, b), rows: data.rows.slice(a, b).map(r => JSON.stringify(r)) }]);
      const t = {};
      for (let i = a; i < b; i++) if (st.status[i]) t[i - a] = st.time[i] || Date.now();
      ops.push(['set', this.col('pt_etat').doc(`${inv.id}_${k}`), { inv: inv.id, k, t }]);
    }
    (hist || []).forEach(h => ops.push(['set', this.col('pt_journal').doc(`${inv.id}_${h.id}`), this.histDoc(h)]));
    (st.anomalies || []).forEach(a => ops.push(['set', this.col('pt_anomalies').doc(`${inv.id}_${a.id}`), Object.assign({ inv: inv.id }, a)]));
    await this.commit(ops);
  },
  async save(c) {
    const ops = [];
    if (c.rows && c.rows.length) {
      const byChunk = new Map();
      for (const r of c.rows) { const k = Math.floor(r / CHUNK); if (!byChunk.has(k)) byChunk.set(k, {}); byChunk.get(k)[r - k * CHUNK] = ST.status[r] ? (ST.time[r] || Date.now()) : this.FV().delete(); }
      for (const [k, t] of byChunk) ops.push(['set', this.col('pt_etat').doc(`${INV.id}_${k}`), { inv: INV.id, k, t }, { merge: true }]);
    }
    (c.hist || []).forEach(h => ops.push(['set', this.col('pt_journal').doc(`${INV.id}_${h.id}`), this.histDoc(h)]));
    (c.ano || []).forEach(a => ops.push(['set', this.col('pt_anomalies').doc(`${INV.id}_${a.id}`), Object.assign({ inv: INV.id }, a)]));
    if (c.meta) ops.push(['set', this.col('pt_inventaires').doc(INV.id), { closed: !!INV.closed }, { merge: true }]);
    if (!ops.length) return;
    const p = this.commit(ops);
    // hors ligne, l'envoi attend le retour du réseau : l'action est déjà gardée sur l'appareil
    if (!navigator.onLine) { $('#kSave').textContent = 'Hors ligne : enregistré sur l\'appareil'; p.catch(e => this.fail(e)); return; }
    await p;
  },
  async load(id, onRemote) {
    this.stop();
    const invSnap = await this.col('pt_inventaires').doc(id).get();
    if (!invSnap.exists) return null;
    const inv = invSnap.data();
    const lignes = await this.col('pt_lignes').where('inv', '==', id).get();
    const parts = lignes.docs.map(d => d.data()).sort((a, b) => a.k - b.k);
    const data = { id, lots: [], rows: [] };
    parts.forEach(p => { data.lots.push(...p.lots); p.rows.forEach(r => { try { data.rows.push(JSON.parse(r)); } catch (e) { data.rows.push([]); } }); });
    const st = newState(id, data.lots.length);
    const ready = [];
    const listen = (name, apply) => ready.push(new Promise(res => {
      let first = true;
      this.unsubs.push(this.col(name).where('inv', '==', id).onSnapshot(s => { apply(s.docs.map(d => d.data())); if (first) { first = false; res(); } else onRemote(name); },
        e => { this.fail(e); if (first) { first = false; res(); } }));
    }));
    listen('pt_etat', docs => {
      for (const d of docs) {
        const a = d.k * CHUNK, b = Math.min(st.status.length, a + CHUNK), t = d.t || {};
        for (let i = a; i < b; i++) { const v = t[i - a]; st.status[i] = v ? 1 : 0; st.time[i] = v || 0; }
      }
    });
    const hist = [];   // même tableau que HIST une fois l'inventaire ouvert
    listen('pt_journal', docs => {
      const h = docs.map(x => this.histFrom(x)).sort((a, b) => (a.t - b.t) || (a.seq - b.seq) || String(a.id).localeCompare(String(b.id)));
      hist.length = 0; hist.push(...h);
      st.seq = Math.max(st.seq || 0, ...h.map(x => x.seq || 0));
    });
    listen('pt_anomalies', docs => { st.anomalies.length = 0; st.anomalies.push(...docs.sort((x, y) => x.t - y.t)); });
    this.unsubs.push(this.col('pt_inventaires').doc(id).onSnapshot(s => { if (s.exists && INV && INV.id === id) { const c = !!s.data().closed; if (c !== INV.closed) { INV.closed = c; onRemote('pt_inventaires'); } } }, () => {}));
    await Promise.all(ready);
    return { inv, data, st, hist };
  },
  stop() { this.unsubs.forEach(u => { try { u(); } catch (e) {} }); this.unsubs = []; },
  async remove(id) {
    this.stop();
    const ops = [];
    for (const n of ['pt_lignes', 'pt_etat', 'pt_journal', 'pt_anomalies']) {
      const s = await this.col(n).where('inv', '==', id).get();
      s.docs.forEach(d => ops.push(['del', d.ref]));
    }
    ops.push(['del', this.col('pt_inventaires').doc(id)]);
    await this.commit(ops);
  }
};

/* ---------- Choix de la base : Firebase si configuré, sinon cet appareil ---------- */
let MODE = 'local';
let invList = [];

async function persist(c) {
  c = c || {};
  if (MODE === 'cloud') {
    try { await Cloud.save(c); if (navigator.onLine) $('#kSave').textContent = 'Base partagée · enregistré ' + fmtT(Date.now()); }
    catch (e) { Cloud.fail(e); $('#kSave').textContent = 'Échec d\'enregistrement'; if (!Cloud.denied) toast('Enregistrement impossible pour le moment : ' + (e && e.message || e)); }
    return;
  }
  const pairs = [['state', ST], ['inventories', INV]];
  (c.hist || []).forEach(h => pairs.push(['history', h]));
  if (!Store.ok) { memFallback.state.set(ST.id, ST); return; }
  try { await Store.put(pairs); $('#kSave').textContent = 'Sur cet appareil · enregistré ' + fmtT(Date.now()); }
  catch (e) { $('#kSave').textContent = 'Échec de sauvegarde'; toast('La sauvegarde locale a échoué : ' + (e && e.message || e)); }
}

async function localLoad(id) {
  let inv, data, st, hist;
  if (Store.ok) { inv = await Store.get('inventories', id); data = await Store.get('data', id); st = await Store.get('state', id); hist = await Store.historyOf(id) || []; }
  else { inv = memFallback.inventories.get(id); data = memFallback.data.get(id); st = memFallback.state.get(id); hist = memFallback.history.get(id) || []; }
  if (!inv || !data) return null;
  st = st || newState(id, data.lots.length);
  if (!(st.status instanceof Uint8Array)) st.status = Uint8Array.from(st.status);
  return { inv, data, st, hist: hist.sort((a, b) => a.seq - b.seq) };
}

let remoteT = null;
function onRemote() {
  clearTimeout(remoteT);
  remoteT = setTimeout(() => { if (!INV) return; applyFilter(); renderAll(); refreshInvSelect(INV.id); }, 120);
}

async function loadInventory(id) {
  const got = MODE === 'cloud' ? await Cloud.load(id, onRemote) : await localLoad(id);
  if (!got) return false;
  INV = got.inv; DATA = got.data; ST = got.st; HIST = got.hist;
  IDX = buildIndex(DATA.lots);
  ORDER = DATA.lots.map((_, i) => i);
  const key = i => { const g = String(DATA.lots[i]).match(/\d+/g); return g && g.length === 1 ? Number(g[0]) : Infinity; };
  const keys = ORDER.map(key);
  ORDER.sort((a, b) => (keys[a] - keys[b]) || String(DATA.lots[a]).localeCompare(String(DATA.lots[b]), 'fr', { numeric: true }) || a - b);
  POS = new Int32Array(ORDER.length); ORDER.forEach((r, p) => POS[r] = p);
  const lastChk = [...HIST].reverse().find(x => x.kind === 'check' && !x.undone && x.rows.length && (x.dev === DEVICE || !x.dev));
  lastRow = lastChk ? lastChk.rows.reduce((m, x) => POS[x] > POS[m] ? x : m, lastChk.rows[0]) : -1; ST.lastRow = lastRow;
  flashRows = new Set();
  settings.last = id; saveSettings();
  buildHead(); applyFilter(); renderAll();
  return true;
}
let POS = new Int32Array(0);

function makeInventory(name, columns, rows, lotCol) {
  const id = 'inv' + uid();
  const keep = [], keptRows = [];
  rows.forEach(r => { const l = String(r[lotCol] ?? '').trim(); if (l !== '') { keep.push(l); keptRows.push(r.map(v => String(v ?? ''))); } });
  const inv = { id, name, created: Date.now(), closed: false, columns: columns.map(String), lotCol, count: keep.length };
  const data = { id, lots: keep, rows: keptRows };
  const st = newState(id, keep.length);
  const idx = buildIndex(keep);
  const h = { inv: id, id: uid(), seq: 1, t: Date.now(), dev: DEVICE, kind: 'import', cmd: '', label: `Import de ${keep.length} lots` + (idx.dupRows.size ? ` · ${idx.dupRows.size} lignes en doublon` : ''), rows: [] };
  st.seq = 1;
  return { inv, data, st, hist: [h] };
}

async function createInventory(name, columns, rows, lotCol) {
  const x = makeInventory(name, columns, rows, lotCol);
  const n = x.data.lots.length;
  try {
    if (MODE === 'cloud') { toast(`Envoi de ${n} lots vers la base…`); await Cloud.create(x.inv, x.data, x.st, x.hist); invList = invList.filter(i => i.id !== x.inv.id).concat([x.inv]); }
    else if (Store.ok) await Store.put([['inventories', x.inv], ['data', x.data], ['state', x.st], ['history', x.hist[0]]]);
    else { memFallback.inventories.set(x.inv.id, x.inv); memFallback.data.set(x.inv.id, x.data); memFallback.state.set(x.inv.id, x.st); memFallback.history.set(x.inv.id, x.hist); }
  } catch (e) { Cloud.fail(e); toast('Création impossible : ' + (e && e.message || e)); return; }
  await refreshInvList(x.inv.id);
  await loadInventory(x.inv.id);
  toast(`Inventaire « ${name} » créé : ${n} lots`);
}

function refreshInvSelect(sel) {
  const list = invList.slice().sort((a, b) => b.created - a.created);
  const s = $('#invSel'), cur = sel || s.value;
  s.innerHTML = list.length ? list.map(i => `<option value="${esc(i.id)}">${esc(i.name)}${i.closed ? ' (clôturé)' : ''}</option>`).join('') : '<option value="">Aucun inventaire</option>';
  if (cur && list.some(i => i.id === cur)) s.value = cur;
  return list;
}
async function refreshInvList(sel) {
  if (MODE === 'local') invList = Store.ok ? (await Store.all('inventories') || []) : Array.from(memFallback.inventories.values());
  return refreshInvSelect(sel);
}

async function removeInventory(id) {
  if (MODE === 'cloud') { await Cloud.remove(id); invList = invList.filter(i => i.id !== id); }
  else if (Store.ok) await Store.remove(id);
  else ['inventories', 'data', 'state', 'history'].forEach(s => memFallback[s].delete(id));
}

// Inventaires commencés sur cet appareil avant le branchement de Firebase
async function localInventories() { if (!Store.ok) return []; try { return await Store.all('inventories') || []; } catch (e) { return []; } }
async function sendLocalToCloud() {
  const list = await localInventories();
  let n = 0;
  for (const i of list) {
    const x = await localLoad(i.id); if (!x) continue;
    x.hist.forEach(h => { h.id = h.id || uid(); h.dev = h.dev || DEVICE; });
    x.st.anomalies.forEach(a => a.id = a.id || uid());
    await Cloud.create(x.inv, x.data, x.st, x.hist);
    await Store.remove(i.id); n++;
  }
  toast(n ? `${n} inventaire${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''} vers la base partagée` : 'Rien à envoyer.');
  return n;
}

function showDbNotice(kind) {
  const n = $('#dbNotice'); n.hidden = false;
  n.innerHTML = {
    denied: '<b>La base Firebase refuse l\'accès.</b> Les règles de sécurité ne sont pas encore publiées : copiez le contenu de <code>firestore.rules</code> dans Firebase → Firestore Database → Règles, puis « Publier ».',
    local: '<b>Base partagée pas encore branchée.</b> Les inventaires sont enregistrés sur cet appareil uniquement.',
    pending: `<b>Inventaires sur cet appareil.</b> Des inventaires commencés avant le branchement de la base sont encore ici seulement. <button class="btn" id="bSendCloud">Les envoyer vers la base partagée</button>`
  }[kind];
  if (kind === 'pending') $('#bSendCloud').onclick = async () => { $('#bSendCloud').disabled = true; try { await sendLocalToCloud(); n.hidden = true; } catch (e) { Cloud.fail(e); toast('Envoi impossible : ' + (e && e.message || e)); $('#bSendCloud').disabled = false; } };
}

/* ---------- Opérations ---------- */
function addHist(h) {
  ST.seq = (ST.seq || 0) + 1; h.inv = INV.id; h.seq = ST.seq; h.t = Date.now(); h.id = uid(); h.dev = DEVICE;
  HIST.push(h);
  if (MODE === 'local' && !Store.ok) { const a = memFallback.history.get(INV.id) || []; a.push(h); memFallback.history.set(INV.id, a); }
  return h;
}
function addAno(a) { a.id = uid(); a.dev = DEVICE; ST.anomalies.push(a); return a; }
