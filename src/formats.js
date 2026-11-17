/* ===== Formats, séances de pointage par format, anomalies, réimport (fonctions pures, testées) =====
   Trois notions distinctes :
   - l'identité du lot : ses numéros (colonne principale + 2e numéro) ;
   - le format d'origine : la valeur du fichier importé, jamais modifiée ;
   - le format opérationnel : le format d'origine, ou le format corrigé pendant le pointage.          */
const Formats = (function () {
  // « Album », « ALBUM », « albums », « Single-lots » : même format
  function normFmt(s) {
    const t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.split(' ').map(w => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) ? w.slice(0, -1) : w).join(' ');
  }

  // Quantité : simple information (un scan suffit), totalisée en unités. Invalide -> 1 et signalée à l'import.
  function qtyOf(v) { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) && n > 0 ? n : 1; }
  function qtyValid(v) { const s = String(v ?? '').trim(); const n = Number(s.replace(',', '.')); return s !== '' && Number.isFinite(n) && n > 0; }

  /* Modèle d'une vente : m = {
       n, orig(r) -> format d'origine (texte), corr {r: libellé corrigé}, status(r) -> 0/1, qty(r), pending Set(r) } */
  function opLabel(m, r) { return m.corr[r] != null ? m.corr[r] : m.orig(r); }
  function opKey(m, r) { return normFmt(opLabel(m, r)) || '(vide)'; }

  // Libellé affiché d'un format : l'écriture la plus fréquente dans le fichier
  function labels(m) {
    const seen = new Map();
    const add = (k, raw) => { if (!seen.has(k)) seen.set(k, new Map()); const c = seen.get(k); c.set(raw, (c.get(raw) || 0) + 1); };
    for (let r = 0; r < m.n; r++) { const raw = String(m.orig(r) ?? '').trim() || '(vide)'; add(normFmt(raw) || '(vide)', raw); }
    for (const r in m.corr) { const raw = String(m.corr[r]).trim(); add(normFmt(raw) || '(vide)', raw); }
    const out = new Map();
    for (const [k, c] of seen) out.set(k, [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    return out;
  }

  // Tableau de bord par format (calculé à partir des données, jamais stocké)
  function stats(m, anomalies) {
    const lab = labels(m), by = new Map();
    const get = k => { if (!by.has(k)) by.set(k, { key: k, label: lab.get(k) || k, lots: 0, units: 0, done: 0, unitsDone: 0, pending: 0, corrIn: 0, corrOut: 0, anomalies: 0 }); return by.get(k); };
    for (let r = 0; r < m.n; r++) {
      const s = get(opKey(m, r)), q = m.qty(r);
      s.lots++; s.units += q;
      if (m.status(r)) { s.done++; s.unitsDone += q; }
      if (m.pending.has(r)) s.pending++;
      if (m.corr[r] != null) { s.corrIn++; const o = get(normFmt(m.orig(r)) || '(vide)'); o.corrOut++; }
    }
    for (const a of anomalies || []) {
      if (!isOpen(a)) continue;
      const k = a.fk || (a.row != null && a.row < m.n ? opKey(m, a.row) : null);
      if (k && by.has(k)) by.get(k).anomalies++;
    }
    const list = [...by.values()].filter(s => s.lots || s.corrOut);
    list.forEach(s => { s.left = s.lots - s.done; s.pct = s.lots ? Math.round(s.done / s.lots * 1000) / 10 : 0; });
    return list.sort((a, b) => b.lots - a.lots || a.label.localeCompare(b.label, 'fr', { numeric: true }));
  }
  function totals(m, anomalies) {
    let lots = m.n, units = 0, done = 0, unitsDone = 0, corrections = 0;
    for (let r = 0; r < m.n; r++) { const q = m.qty(r); units += q; if (m.status(r)) { done++; unitsDone += q; } if (m.corr[r] != null) corrections++; }
    const open = (anomalies || []).filter(isOpen).length;
    return { lots, units, done, unitsDone, left: lots - done, corrections, open, pct: lots ? Math.round(done / lots * 1000) / 10 : 0 };
  }

  /* Anomalies : st = ouverte | attente | corrigee | conservee | resolue | annulee (absent = ancienne note, « info ») */
  const OPEN = new Set(['ouverte', 'attente']);
  const isOpen = a => !!a && OPEN.has(a.st);
  const ST_LABEL = { ouverte: 'Ouverte', attente: 'En attente', corrigee: 'Corrigée', conservee: 'Format d\'origine conservé', resolue: 'Résolue', annulee: 'Annulée' };
  const TYPE_LABEL = { format: 'Format différent du listing', inconnu: 'Lot inconnu', conflit: 'Identifiants contradictoires', doublon: 'Lot déjà pointé', 'absent-listing': 'Absent du nouveau listing', ambigu: 'Numéro ambigu' };

  /* Classement d'un scan. ids = numéros lus ; lookup(text) -> { found: [{part, rows}] } (index de la vente active).
     Retour : kind = unknown | conflict | ambiguous | already | mismatch | ok, avec les lignes et les formats. */
  function classify(text, ctx) {
    const t = String(text || '').trim();
    const nums = t.match(/\d+/g) || [];
    let row = null, verified = 1, via = null;
    if (nums.length === 2 && /^\d+\D+\d+$/.test(t)) {
      // deux identifiants lus : ils doivent désigner le même lot
      const a = ctx.lookup(nums[0]).found, b = ctx.lookup(nums[1]).found;
      if (!a.length && !b.length) return { kind: 'unknown', ids: nums };
      if (!a.length || !b.length) return { kind: 'conflict', ids: nums, reason: `le numéro ${!a.length ? nums[0] : nums[1]} est introuvable alors que l'autre existe`, rows: (a.length ? a : b)[0].rows };
      const ra = new Set(a.flatMap(f => f.rows)), rb = b.flatMap(f => f.rows), common = rb.filter(r => ra.has(r));
      if (!common.length) return { kind: 'conflict', ids: nums, reason: 'les deux numéros appartiennent à deux lots différents', rows: [a[0].rows[0], b[0].rows[0]] };
      if (common.length > 1) return { kind: 'ambiguous', ids: nums, rows: common };
      row = common[0]; verified = 2;
    } else {
      const f = ctx.lookup(t).found;
      if (!f.length) return { kind: 'unknown', ids: [t] };
      if (f.length > 1) return { kind: 'ambiguous', ids: [t], found: f };
      if (f[0].rows.length > 1) return { kind: 'ambiguous', ids: [t], rows: f[0].rows, dup: true };
      row = f[0].rows[0]; via = f[0].part;
    }
    const m = ctx.model;
    const out = { row, verified, via, fmtListing: m.orig(row), fmtOp: opLabel(m, row), keyOp: opKey(m, row), corrected: m.corr[row] != null };
    if (m.status(row)) return Object.assign(out, { kind: 'already' });
    if (ctx.session && out.keyOp !== ctx.session) return Object.assign(out, { kind: 'mismatch' });
    return Object.assign(out, { kind: 'ok' });
  }

  /* Réimport d'un listing dans une vente existante : rapprochement par numéro, sans jamais toucher
     aux pointages ni aux corrections (les lignes existantes gardent leur position). */
  function diffListing(old, neu) {
    // old/neu : { lots: [id], alt: [id|''], rows: [[...]] } avec les mêmes colonnes
    const pos = new Map();
    old.lots.forEach((l, i) => { const k = String(l).trim(); if (k && !pos.has(k)) pos.set(k, i); });
    old.alt.forEach((l, i) => { const k = 'a:' + String(l || '').trim(); if (l && !pos.has(k)) pos.set(k, i); });
    const seen = new Set(), added = [], changed = [], same = [];
    neu.lots.forEach((l, j) => {
      const k = String(l).trim(), ka = 'a:' + String(neu.alt[j] || '').trim();
      const i = pos.has(k) ? pos.get(k) : (neu.alt[j] && pos.has(ka) ? pos.get(ka) : -1);
      if (i < 0 || seen.has(i)) { added.push(j); return; }
      seen.add(i);
      const a = old.rows[i].map(v => String(v ?? '').trim()), b = neu.rows[j].map(v => String(v ?? '').trim());
      const cols = []; for (let c = 0; c < Math.max(a.length, b.length); c++) if ((a[c] || '') !== (b[c] || '')) cols.push(c);
      (cols.length ? changed : same).push({ i, j, cols });
    });
    const removed = old.lots.map((_, i) => i).filter(i => !seen.has(i));
    return { added, changed, same, removed };
  }

  // Contrôles à l'import : rapport ligne par ligne, sans bloquer l'import
  function importReport(rows, c) {
    // c : { lot, alt, fmt, qty } indices de colonnes (-1 = absente)
    const issues = [];
    const val = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
    const seen = new Map(), seenAlt = new Map();
    rows.forEach((r, n) => {
      const line = n + 1, l = val(r, c.lot), a = val(r, c.alt);
      if (!l && !a) { if (r.some(v => String(v ?? '').trim())) issues.push({ line, type: 'Identifiant manquant', detail: 'ligne ignorée' }); return; }
      if (!l) issues.push({ line, type: 'Numéro principal manquant', detail: 'le 2e numéro ' + a + ' est utilisé' });
      if (l && !/^\d+$/.test(l)) issues.push({ line, type: 'Numéro non numérique', detail: l });
      if (c.alt >= 0 && !a) issues.push({ line, type: '2e numéro manquant', detail: l });
      if (a && !/^\d+$/.test(a)) issues.push({ line, type: '2e numéro non numérique', detail: a });
      if (l) { if (seen.has(l)) issues.push({ line, type: 'Doublon', detail: `${l} déjà ligne ${seen.get(l)}` }); else seen.set(l, line); }
      if (a) { if (seenAlt.has(a)) issues.push({ line, type: 'Doublon (2e numéro)', detail: `${a} déjà ligne ${seenAlt.get(a)}` }); else seenAlt.set(a, line); }
      if (c.fmt >= 0 && !val(r, c.fmt)) issues.push({ line, type: 'Format manquant', detail: l || a });
      if (c.qty >= 0 && !qtyValid(val(r, c.qty))) issues.push({ line, type: 'Quantité manquante ou invalide', detail: (l || a) + ' : « ' + val(r, c.qty) + ' » (compté 1)' });
    });
    const byType = {}; issues.forEach(x => byType[x.type] = (byType[x.type] || 0) + 1);
    return { issues, byType };
  }

  return { normFmt, qtyOf, qtyValid, opLabel, opKey, labels, stats, totals, isOpen, ST_LABEL, TYPE_LABEL, classify, diffListing, importReport };
})();
if (typeof module !== 'undefined') module.exports = { Formats };
