/* ===================== Pointage par format : séances, anomalies, corrections ===================== */
let qtyCol = -1;
function guessQtyCol() {
  if (!INV) return -1;
  if (INV.qtyCol != null && INV.qtyCol >= 0) return INV.qtyCol;
  const alt = INV.altCol ?? -1;
  const i = INV.columns.findIndex((c, j) => j !== INV.lotCol && j !== alt && /(qty|quant|qté|qte|nombre|\bnb\b)/i.test(c || ''));
  return i;
}
const origFmt = r => fmtCol >= 0 ? (String(DATA.rows[r][fmtCol] ?? '').trim() || '(vide)') : '';
const qtyRow = r => qtyCol >= 0 ? Formats.qtyOf(DATA.rows[r][qtyCol]) : 1;
let pendingRows = new Set(), verifyRows = new Set();
function refreshPending() {
  pendingRows = new Set(); verifyRows = new Set();
  if (!ST) return;
  for (const a of ST.anomalies) if (a.st === 'attente' && a.row != null) {
    if (!ST.status[a.row]) pendingRows.add(a.row);
    if (a.type === 'format') verifyRows.add(a.row);   // format constaté différent, pas encore confirmé
  }
}
function model() {
  return { n: INV ? DATA.lots.length : 0, orig: origFmt, qty: qtyRow, status: r => ST.status[r], corr: ST ? ST.fmt : {}, pending: pendingRows };
}
const opLbl = r => Formats.opLabel(model(), r);
const opKeyRow = r => fmtCol >= 0 ? Formats.opKey(model(), r) : '';
let fmtStatsCache = [];
function fmtLabelOf(key) { const s = fmtStatsCache.find(x => x.key === key); return s ? s.label : key; }
function altOf(r) { return INV.altCol != null && INV.altCol >= 0 ? String(DATA.rows[r][INV.altCol] ?? '').trim() : ''; }
function idsHtml(r, read) {
  const n1 = INV.columns[INV.lotCol] || 'N° lot', n2 = INV.altCol != null && INV.altCol >= 0 ? INV.columns[INV.altCol] : '';
  return `<div class="idgrid"><span>${esc(n1)}</span><b class="num">${esc(DATA.lots[r])}</b>${n2 ? `<span>${esc(n2)}</span><b class="num">${esc(altOf(r))}</b>` : ''}</div>`
    + (read ? `<p class="hint idread">${read}</p>` : '');
}
function readNote(c) {
  if (!c) return '';
  if (c.verified === 2) return 'Les deux numéros lus correspondent au même lot.';
  const names = IDX.names || [];
  const n = c.via != null && names[c.via] ? names[c.via] : 'le numéro';
  return `Lu par « ${esc(n)} » ; l'autre numéro est celui du listing (non lu).`;
}

/* ---------- Sons (désactivables dans Options) ---------- */
const snd = {
  ok: () => tone(880, .06),
  mismatch: () => { tone(660, .1); setTimeout(() => tone(990, .14), 120); },
  already: () => tone(520, .12),
  unknown: () => { tone(330, .15); setTimeout(() => tone(260, .2), 160); }
};

/* ---------- Séance de pointage par format ---------- */
function sessionKey() { return fmtCol >= 0 ? fmtVal : ''; }
function renderSession() {
  const b = $('#sessBar');
  if (!INV || !sessionKey()) { b.hidden = true; $('#scanTitle').textContent = 'Saisie manuelle / scanner'; return; }
  const s = fmtStatsCache.find(x => x.key === sessionKey()) || { label: sessionKey(), lots: 0, done: 0, units: 0, unitsDone: 0, anomalies: 0, pct: 0 };
  $('#scanTitle').textContent = 'Séance de pointage';
  b.hidden = false;
  b.innerHTML = `<div class="sesstop"><span class="sessname">${esc(INV.name)} — <b>POINTAGE ${esc(String(s.label).toUpperCase())}</b></span>
      <span><button type="button" class="linkbtn" id="sessBilan">Bilan</button> · <button type="button" class="linkbtn" id="sessQuit">Quitter la séance</button></span></div>
    <div class="sessnums"><span><b class="num">${s.done}</b> / ${s.lots} lots</span><span><b class="num">${s.lots - s.done}</b> restants</span>${qtyCol >= 0 ? `<span><b class="num">${fmtNum(s.unitsDone)}</b> / ${fmtNum(s.units)} unités</span>` : ''}<span class="${s.anomalies ? 'w' : ''}"><b class="num">${s.anomalies}</b> anomalie${s.anomalies > 1 ? 's' : ''}</span><b class="num sesspct">${s.pct.toLocaleString('fr-FR')} %</b></div>
    <div class="bar"><i style="width:${s.pct}%"></i></div>`;
  $('#sessQuit').onclick = () => setFmt('', true);
  $('#sessBilan').onclick = () => openBilan(currentSid() || null);
}
const fmtNum = n => Number.isInteger(n) ? n.toLocaleString('fr-FR') : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/* ---------- Tableau de bord par format ---------- */
function renderFmtDash() {
  const box = $('#fmtDash');
  if (!INV || fmtCol < 0) { box.hidden = true; return; }
  box.hidden = false;
  $('#fmtDashTitle').textContent = `Pointage par format · ${INV.columns[fmtCol]}`;
  const rows = fmtStatsCache;
  $('#fmtTable').innerHTML = `<table><thead><tr><th>Format</th><th class="n">Lots</th>${qtyCol >= 0 ? '<th class="n c2">Unités</th>' : ''}<th class="n">Pointés</th>${qtyCol >= 0 ? '<th class="n c2">Unités pointées</th>' : ''}<th class="n c3">Restants</th><th class="n c3">Anomalies</th><th>Progression</th><th class="c3"><span class="sr">Action</span></th></tr></thead><tbody>${rows.map(s => `
    <tr class="${s.key === sessionKey() ? 'on' : ''} ${s.lots && s.done === s.lots ? 'full' : ''}" data-k="${esc(s.key)}" ${s.lots ? `tabindex="0" role="button" aria-pressed="${s.key === sessionKey()}" aria-label="Format ${esc(s.label)} : ${s.done} sur ${s.lots} pointés. ${s.key === sessionKey() ? 'Séance en cours' : 'Démarrer la séance'}"` : ''}>
      <th scope="row">${esc(s.label)}${s.corrIn ? ` <span class="tag" title="Lots reclassés dans ce format">+${s.corrIn} corrigé${s.corrIn > 1 ? 's' : ''}</span>` : ''}${s.corrOut ? ` <span class="tag cl" title="Lots sortis de ce format après correction">−${s.corrOut}</span>` : ''}</th>
      <td class="num">${s.lots}</td>${qtyCol >= 0 ? `<td class="num c2">${fmtNum(s.units)}</td>` : ''}<td class="num">${s.done}</td>${qtyCol >= 0 ? `<td class="num c2">${fmtNum(s.unitsDone)}</td>` : ''}
      <td class="num c3">${s.left}</td><td class="num c3 ${s.anomalies ? 'w' : ''}">${s.anomalies}</td>
      <td class="pg"><div class="mini"><i style="width:${s.pct}%"></i></div><span class="num">${s.pct.toLocaleString('fr-FR')} %</span>${s.anomalies ? `<span class="anob" title="Anomalies ouvertes">⚠ ${s.anomalies}</span>` : ''}</td>
      <td class="c3">${s.lots ? `<span class="btn ${s.key === sessionKey() ? 'primary' : ''}" aria-hidden="true">${s.key === sessionKey() ? 'En cours' : (s.done ? 'Reprendre' : 'Pointer')}</span>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
  $('#fmtTable').querySelectorAll('tbody tr').forEach(tr => {
    const go = () => {
      const k = tr.dataset.k; const s = fmtStatsCache.find(x => x.key === k); if (!s || !s.lots) return;
      const start = k !== sessionKey();
      setFmt(start ? k : '', true);
      // séance démarrée : la page remonte sur la barre de séance et la case de scan, prête à scanner
      if (start) scrollToScan();
    };
    tr.onclick = go;
    tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

function scrollToScan() {
  const el = document.querySelector('section.scan'); if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
}

/* ---------- Anomalies : création et mise à jour ---------- */
function anoBase(type, r, extra) {
  const a = { t: Date.now(), type, kind: Formats.TYPE_LABEL[type] || type, st: 'ouverte', sess: sessionKey() || '', sid: currentSid() };
  if (r != null) Object.assign(a, { row: r, n: DATA.lots[r], n2: altOf(r), fo: origFmt(r), fk: opKeyRow(r) });
  return addAno(Object.assign(a, extra || {}));
}
function setAno(a, st, res) { a.st = st; a.res = res || a.res || ''; a.tr = Date.now(); return a; }
const anoById = id => ST.anomalies.find(a => a.id === id);
// une seule anomalie de format active par lot : un nouveau scan la complète, n'en crée pas une deuxième
const openFmtAno = r => ST.anomalies.find(a => a.type === 'format' && a.row === r && Formats.isOpen(a)) || null;
function fmtAnoFor(r, extra) {
  const a = openFmtAno(r);
  if (!a) return anoBase('format', r, extra);
  a.scans = (a.scans || 1) + 1; a.lastSid = currentSid(); a.lastSess = sessionKey() || '';
  return a;
}

/* ---------- Pointage d'un lot reconnu (avec format éventuellement corrigé) ---------- */
function scanApply(r, o) {
  // o : { fmt: nouveau libellé (corriger) | undefined, scanSt: libellé de statut, ano: anomalie liée, read: texte lu }
  const prevS = [ST.status[r]], prevT = [ST.time[r]], now = Date.now(), ko = opKeyRow(r);
  const fmtRows = [];
  let fp = null, fn = null;
  if (o.fmt !== undefined) {
    fp = {}; fp[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
    if (Formats.normFmt(o.fmt) === Formats.normFmt(origFmt(r))) delete ST.fmt[r]; else ST.fmt[r] = o.fmt;
    fn = {}; fn[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
    fmtRows.push(r);
  }
  const changed = !ST.status[r];
  if (changed) { ST.status[r] = 1; ST.time[r] = now; }
  const fs = o.fs || opLbl(r);
  if (o.ano) o.ano.fk = o.ano.fk || ko;
  const h = addHist({ kind: 'check', cmd: o.read || 'Scan', label: `${lotLabel(r)} (scan)`, rows: changed ? [r] : [], prevS: changed ? prevS : [], prevT: changed ? prevT : [], fp, fn,
    sc: Object.assign({ r, l: lotLabel(r), fo: origFmt(r), fs, ko, st: o.scanSt || 'Validé' }, o.dec ? { dec: 1 } : {}), ano: o.ano ? o.ano.id : null,
    result: `${o.scanSt || 'Validé'}${fmtCol >= 0 ? ' · ' + fs : ''}` });
  if (changed) { lastRow = r; ST.lastRow = r; }
  flashRows = new Set([r]);
  persist({ rows: changed ? [r] : [], fmt: fmtRows, hist: [h], ano: o.ano ? [o.ano] : [] });
  afterChange(true);
}
function showResult(kind, title, html) {
  const box = $('#scanRes');
  box.className = 'scanres ' + kind; box.hidden = false;
  box.innerHTML = `<b class="srt">${title}</b><div class="srb">${html}</div>`;
}

/* ---------- Scan : reconnaissance du lot puis contrôle du format ---------- */
function scanCode(v, raw) {
  if (!INV) { showScan(v, 'Aucune vente ouverte', 'bad'); setResult("Importez d'abord un listing."); snd.unknown(); return; }
  ensureSid();
  const c = Formats.classify(v, { lookup: x => lookupRows(IDX, x), model: model(), session: sessionKey() || null });
  const read = 'Scan ' + raw.trim();
  if (c.kind === 'unknown') {
    const a = anoBase('inconnu', null, { n: c.ids.join(' / '), cmd: read });
    persist({ ano: [a] }); renderAno();
    showScan(c.ids.join(' / '), 'Lot inconnu', 'bad');
    showResult('bad', '✕ LOT INCONNU', `Le numéro <b class="num">${esc(c.ids.join(' / '))}</b> n'existe pas dans la vente « ${esc(INV.name)} ». Rien n'a été pointé ; l'anomalie est enregistrée.`);
    setResult(`<b>Scan ${esc(v)}</b> — <span class="e">lot inconnu</span>`);
    addHist({ kind: 'scan', cmd: read, label: `${c.ids.join(' / ')} (scan)`, rows: [], sc: { l: c.ids.join(' / '), fo: '', fs: sessionKey() ? fmtLabelOf(sessionKey()) : '', st: 'Inconnu' }, result: 'Lot inconnu' });
    renderRecent(); snd.unknown(); return;
  }
  if (c.kind === 'conflict') {
    const a = anoBase('conflit', null, { n: c.ids.join(' / '), cmd: read, res: c.reason });
    persist({ ano: [a] }); renderAno();
    showScan(c.ids.join(' / '), 'Conflit d\'identifiants', 'bad');
    showResult('bad', '✕ IDENTIFIANTS CONTRADICTOIRES', `${esc(c.ids.join(' et '))} : ${esc(c.reason)}. Aucun pointage ; l'anomalie est enregistrée.${c.rows ? '<br>Lots concernés : ' + c.rows.map(r => `<button type="button" class="linkbtn" data-lot="${r}">${esc(lotLabel(r))}</button>`).join(' · ') : ''}`);
    bindLotLinks($('#scanRes'));
    setResult(`<b>Scan ${esc(v)}</b> — <span class="e">identifiants contradictoires</span>`);
    snd.unknown(); return;
  }
  if (c.kind === 'ambiguous') {
    if (c.found) {
      const plan = { mode: 'check', items: [{ kind: 'single', n: Number(v) }], except: [], warnings: [], label: v + ' (scan)', key: 'scan:' + v };
      openConfirm('Scan ' + v, { reason: `Le numéro ${v} existe dans les deux colonnes de numéros : lequel ?`, cands: c.found.map(f => ({ plan, via: IDX.names[f.part], r: { rows: f.rows, missing: [], emptyRanges: [], complete: true } })) });
    } else {
      // doublon dans le fichier : plusieurs lignes portent ce numéro
      const plan = { mode: 'check', items: [], except: [], warnings: [], label: v + ' (scan)' };
      applyPlan(plan, { rows: c.rows, missing: [], emptyRanges: [] }, read);
    }
    return;
  }
  const r = c.row;
  // lot déjà identifié dans un autre format : l'alerte reste active tant que l'étiquette n'est pas remplacée
  const ls = labelOf(r);
  if (ls === 'verifier' || (ls === 'remplacer' && !lotTrace(r).seen(currentSid()))) return openLotAlert(c, read, ls);
  if (c.kind === 'already') {
    showScan(lotLabel(r), 'Déjà pointé', 'dup');
    const rl = ls === 'remplacer';
    showResult(rl ? 'warn' : 'dup', rl ? '⚠ DÉJÀ POINTÉ — ÉTIQUETTE À REMPLACER' : 'ⓘ LOT DÉJÀ POINTÉ', `${esc(lotLabel(r))} a été pointé à ${fmtT(ST.time[r])}${fmtCol >= 0 ? ` (format ${esc(opLbl(r))})` : ''}. Aucun double comptage.${rl ? ` L'étiquette porte encore « ${esc(labelOn(r))} ».` : ''} <button type="button" class="linkbtn" data-lot="${r}">Voir le lot</button>`);
    bindLotLinks($('#scanRes'));
    setResult(`<b>${esc(lotLabel(r))}</b> — déjà pointé${rl ? ' · <span class="w">étiquette à remplacer</span>' : ''}`);
    const h = addHist({ kind: 'scan', cmd: read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: opLbl(r), ko: opKeyRow(r), st: rl ? 'Déjà pointé · étiquette à remplacer' : 'Déjà pointé' }, result: 'Déjà pointé' });
    persist({ hist: [h] });
    renderRecent(); snd.already(); scrollToLot(r); return;
  }
  if (c.kind === 'mismatch') return openMismatch(c, read);
  // conforme
  scanApply(r, { scanSt: 'Validé', read });
  showScan(lotLabel(r), 'Pointé ✓', 'ok');
  showResult('ok', '✓ LOT RECONNU ET CONFORME', `${esc(lotLabel(r))}${fmtCol >= 0 ? ` · format <b>${esc(opLbl(r))}</b>` : ''}. ${readNote(c)}`);
  setResult(`<b>${esc(lotLabel(r))}</b> — <span class="ok">✓ pointé</span>`);
  snd.ok(); scrollToLot(r);
}
function scrollToLot(r) { if (settings.autoScroll && VIEW.includes(r)) { scrollToRow(r, true); renderRows(); } }
function bindLotLinks(el) { el.querySelectorAll('[data-lot]').forEach(b => b.onclick = e => { e.preventDefault(); openLot(+b.dataset.lot); }); }

/* ---------- Format différent du listing : 4 actions ---------- */
let mismatchCtx = null;
function openMismatch(c, read) {
  const r = c.row, sess = fmtLabelOf(sessionKey());
  mismatchCtx = { c, read, r, sess };
  showScan(lotLabel(r), 'Format différent', 'bad warnfmt');
  setResult(`<b>${esc(lotLabel(r))}</b> — <span class="w">format différent du listing</span>`);
  modal(`
    <div class="mm">
      <h3 class="mmtitle">⚠ LOT RECONNU — ANOMALIE DE FORMAT</h3>
      <div class="mmgrid">
        <span>Lot reconnu</span><b>OUI</b>
        ${idsHtml(r).replace('<div class="idgrid">', '').replace(/<\/div>$/, '')}
        <span>Format enregistré</span><b class="fmtbig">${esc(opLbl(r))}${c.corrected ? ` <small>(fichier : ${esc(origFmt(r))})</small>` : ''}</b>
        <span>Séance actuelle</span><b class="fmtbig">${esc(sess)}</b>
        <span>Si c'est un ${esc(sess)}</span><b class="w">Étiquette à remplacer</b>
      </div>
      <p class="hint">${readNote(c)} Ce lot est bien présent dans le listing, mais son format enregistré ne correspond pas au format pointé.</p>
      <div class="mmacts">
        <button class="mma ok" data-a="1"><kbd>1</kbd><span><b>C'est bien un ${esc(sess)}</b><small>Pointé dans ${esc(sess)}, format corrigé (origine gardée), étiquette à remplacer</small></span></button>
        <button class="mma" data-a="2"><kbd>2</kbd><span><b>Garder « ${esc(opLbl(r))} »</b><small>Pointé dans son format d'origine, anomalie à vérifier</small></span></button>
        <button class="mma" data-a="3"><kbd>3</kbd><span><b>Mettre en attente</b><small>Non pointé ; le lot reste signalé « vu pendant ${esc(sess)} »</small></span></button>
        <button class="mma" data-a="4"><kbd>4</kbd><span><b>Annuler le scan</b><small>Rien n'est pointé</small></span></button>
      </div>
      <p class="hint">Touches 1 à 4. Scanner un autre lot met celui-ci en attente.</p>
    </div>`);
  $('#modalBox').querySelectorAll('.mma').forEach(b => b.onclick = () => mismatchAct(+b.dataset.a));
  $('#modalBox').querySelector('.mma').focus();
  snd.mismatch();
}
function mismatchAct(n) {
  const x = mismatchCtx; if (!x) return;
  mismatchCtx = null; closeModal();
  const r = x.r, from = opLbl(r);
  if (n === 1) {
    const a = fmtAnoFor(r, { fs: x.sess, cmd: x.read });
    a.fs = x.sess;
    setAno(a, 'corrigee', `Format confirmé : ${x.sess} (listing : ${from})`);
    a.fk = sessionKey();
    scanApply(r, { fmt: x.sess, fs: x.sess, scanSt: 'Corrigé', read: x.read, ano: a });
    showScan(lotLabel(r), `Corrigé → ${x.sess} · étiquette à remplacer`, 'ok');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="ok">✓ format corrigé : ${esc(from)} → ${esc(x.sess)}</span> · <span class="w">étiquette à remplacer</span>`);
    showResult('warn', '✓ FORMAT CORRIGÉ — ÉTIQUETTE À REMPLACER', `${esc(lotLabel(r))} : ${esc(from)} → <b>${esc(x.sess)}</b>, pointé. Le lot est ajouté aux « Étiquettes à remplacer ».`);
    snd.ok();
  } else if (n === 2) {
    const a = fmtAnoFor(r, { fs: x.sess, cmd: x.read });
    setAno(a, 'conservee', `Format d'origine « ${from} » conservé, constaté « ${x.sess} » : à vérifier`);
    scanApply(r, { fs: from, scanSt: 'Format conservé', read: x.read, ano: a });
    showScan(lotLabel(r), `Pointé (${from})`, 'ok');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="ok">✓ pointé</span> dans « ${esc(from)} », <span class="w">écart à vérifier</span>`);
    showResult('warn', '✓ POINTÉ DANS SON FORMAT D\'ORIGINE', `${esc(lotLabel(r))} est compté dans « ${esc(from)} », pas dans « ${esc(x.sess)} ». L'écart reste visible dans les anomalies.`);
  } else if (n === 3) {
    const a = fmtAnoFor(r, { fs: x.sess, cmd: x.read, st: 'attente', res: 'En attente de décision' });
    if (a.st !== 'attente') setAno(a, 'attente', 'En attente de décision');
    const h = addHist({ kind: 'hold', cmd: x.read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: x.sess, ko: opKeyRow(r), st: 'En attente' }, ano: a.id, result: 'Mis en attente' });
    persist({ ano: [a], hist: [h] }); refreshPending(); afterChange(false);
    showScan(lotLabel(r), 'En attente', 'bad warnfmt');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="w">mis en attente</span>`);
    showResult('warn', '⏸ MIS EN ATTENTE', `${esc(lotLabel(r))} n'est pas pointé. Retrouvez-le dans « Anomalies » pour décider plus tard.`);
  } else {
    const h = addHist({ kind: 'scan', cmd: x.read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: x.sess, ko: opKeyRow(r), st: 'Scan annulé' }, result: 'Scan annulé' });
    persist({ hist: [h] }); renderRecent(); renderHist();
    showScan(lotLabel(r), 'Scan annulé', '');
    setResult(`<b>${esc(lotLabel(r))}</b> — scan annulé`);
    showResult('', 'Scan annulé', `${esc(lotLabel(r))} : rien n'a été pointé.`);
  }
}
// Pendant la fenêtre « format différent » : touches 1-4, ou un nouveau scan (rafale de chiffres) qui met le lot en attente
let mmBuf = '', mmTimer = null;
// Pendant l'alerte « lot déjà identifié » : touches 1-5, Échap ou un nouveau scan = reporter
document.addEventListener('keydown', e => {
  if ((!mismatchCtx && !alertCtx) || $('#modal').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const isA = !!alertCtx, max = isA ? 5 : 4, act = n => isA ? alertAct(n) : mismatchAct(n), later = isA ? 5 : 3;
  const keyOk = b => b.length === 1 && +b >= 1 && +b <= max;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault(); mmBuf += e.key; clearTimeout(mmTimer);
    mmTimer = setTimeout(() => { const b = mmBuf; mmBuf = ''; if (keyOk(b)) act(+b); }, 350);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (!mmBuf) return;
    e.preventDefault(); clearTimeout(mmTimer); const b = mmBuf; mmBuf = '';
    if (keyOk(b)) { act(+b); return; }
    act(later); setTimeout(() => scanCode(fixScan(b), b), 0);
  } else if (e.key === 'Escape') { e.preventDefault(); act(isA ? 5 : 4); }
}, true);

/* ---------- Fiche d'un lot : identité, formats, étiquette, historique chronologique complet ---------- */
function openLot(r, focusFmt) {
  const an = ST.anomalies.filter(a => a.row === r).slice().reverse();
  const formats = fmtStatsCache.map(s => s.label);
  const ls = labelOf(r), tr = lotTrace(r);
  const ev = lotEvents(r);
  modal(`
    <h3>Lot ${esc(lotLabel(r))}</h3>
    ${idsHtml(r)}
    <div class="idgrid">
      ${fmtCol >= 0 ? `<span>Format d'origine (fichier)</span><b>${esc(origFmt(r))}</b><span>Format opérationnel</span><b>${esc(opLbl(r))}${ST.fmt[r] != null ? ' <span class="tag">corrigé</span>' : ''}</b>` : ''}
      ${qtyCol >= 0 ? `<span>Quantité</span><b class="num">${esc(DATA.rows[r][qtyCol])}</b>` : ''}
      <span>Pointage</span><b>${ST.status[r] ? 'Présent, pointé à ' + fmtT(ST.time[r]) : pendingRows.has(r) ? 'En attente' : 'Non pointé'}</b>
      ${fmtCol >= 0 ? `<span>Étiquette physique</span><b class="${ls === 'remplacer' || ls === 'verifier' ? 'w' : ls === 'remplacee' ? 'ok' : ''}">${labelText(r)}</b>` : ''}
      <span>Scans</span><b>${tr.n}${tr.first ? ` · écart vu pendant « ${esc(tr.first.sess)} » le ${fmtDT(tr.first.t)}` : ''}</b>
    </div>
    ${fmtCol >= 0 && (ls === 'remplacer' || ls === 'remplacee') ? `<div class="lblact">${ls === 'remplacer'
      ? `<button class="btn primary" id="lotLbl">✓ Confirmer le remplacement de l'étiquette</button>`
      : `<button class="btn" id="lotLblBack">Remettre « étiquette à remplacer »</button>`}</div>` : ''}
    ${fmtCol >= 0 ? `<form class="fixfmt" id="lotFmt">
      <b>Confirmer ou corriger le format réel</b>
      <div class="grid2">
        <label>Format réel<select id="lfSel">${formats.map(f => `<option ${Formats.normFmt(f) === Formats.normFmt(opLbl(r)) ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__new">Autre format…</option></select></label>
        <label>Motif (facultatif)<input id="lfWhy" placeholder="ex. étiquette erronée"></label>
      </div>
      <input id="lfNew" placeholder="Nom du nouveau format" hidden>
      <div class="mrow" style="justify-content:flex-start">${ST.fmt[r] != null ? '<button type="button" class="btn" id="lfReset">Revenir au format d\'origine</button>' : ''}<button class="btn primary">Enregistrer le format</button></div>
    </form>` : ''}
    <form class="fixfmt" id="lotNote"><b>Ajouter une observation</b><div class="mrow" style="justify-content:flex-start;flex-wrap:nowrap"><input id="lnTxt" placeholder="ex. étiquette introuvable, lot dans le carton B12" style="flex:1"><button class="btn">Ajouter</button></div></form>
    ${an.length ? `<b>Anomalies</b><div class="log">${an.map(a => `<div class="a"><time>${fmtDT(a.t)}</time><b>${esc(a.kind)}</b> · ${esc(Formats.ST_LABEL[a.st] || 'Note')}${a.res ? '<br>' + esc(a.res) : ''}</div>`).join('')}</div>` : ''}
    <b>Historique du lot (${ev.length})</b>
    <div class="anotable lothist"><table><thead><tr><th>Date et heure</th><th>Séance</th><th>Événement</th></tr></thead><tbody>${ev.length ? ev.map(e => `<tr class="${e.undone ? 'u' : ''}"><td class="num">${fmtDT(e.t)}</td><td>${esc(e.sess)}</td><td>${esc(e.what)}${e.undone ? ' <span class="tag cl">annulé</span>' : ''}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Aucune opération.</td></tr>'}</tbody></table></div>
    <div class="mrow"><button class="btn" id="lotTog">${ST.status[r] ? 'Dépointer' : 'Pointer'}</button><button class="btn primary" id="lotClose">Fermer</button></div>`);
  $('#lotClose').onclick = closeModal;
  $('#lotTog').onclick = () => { closeModal(); toggleRow(r); };
  if ($('#lotLbl')) $('#lotLbl').onclick = () => { confirmLabels([r]); openLot(r); };
  if ($('#lotLblBack')) $('#lotLblBack').onclick = () => { resetLabel(r); openLot(r); };
  $('#lotNote').onsubmit = e => { e.preventDefault(); const t = $('#lnTxt').value.trim(); if (!t) return; addNote(r, t); openLot(r); };
  if (fmtCol >= 0) {
    $('#lfSel').onchange = e => { $('#lfNew').hidden = e.target.value !== '__new'; if (!$('#lfNew').hidden) $('#lfNew').focus(); };
    $('#lotFmt').onsubmit = e => {
      e.preventDefault();
      const v = $('#lfSel').value === '__new' ? $('#lfNew').value.trim() : $('#lfSel').value;
      if (!v) { toast('Indiquez le nom du format.'); return; }
      const why = $('#lfWhy').value.trim();
      if (Formats.normFmt(v) === Formats.normFmt(opLbl(r)) && verifyRows.has(r)) { closeModal(); confirmVerified(r, v, why); return; }
      closeModal(); reclassify(r, v, why);
    };
    if ($('#lfReset')) $('#lfReset').onclick = () => { closeModal(); reclassify(r, origFmt(r), 'Retour au format d\'origine'); };
    if (focusFmt) setTimeout(() => { try { $('#lfSel').focus(); $('#lotFmt').scrollIntoView({ block: 'center' }); } catch (e) {} }, 30);
  }
}
// format réel = format du listing, confirmé à la main pour un lot « à vérifier »
function confirmVerified(r, v, why) {
  const a = openFmtAno(r);
  if (a) { setAno(a, 'conservee', `Format « ${v} » confirmé à la main${why ? ' · motif : ' + why : ''}`); }
  const h = addHist({ kind: 'reformat', cmd: 'Confirmation du format', label: `Format de ${lotLabel(r)} confirmé : ${v}`, rows: [], lr: r, ano: a ? a.id : null, result: why ? 'Motif : ' + why : '' });
  persist({ hist: [h], ano: a ? [a] : [] }); refreshPending(); afterChange(false);
  setResult(`<b>Format confirmé</b> — ${esc(lotLabel(r))} : ${esc(v)}`);
}
function reclassify(r, to, why) {
  const from = opLbl(r);
  if (Formats.normFmt(from) === Formats.normFmt(to)) { toast('Le lot est déjà dans ce format.'); return; }
  const fp = {}; fp[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
  if (Formats.normFmt(to) === Formats.normFmt(origFmt(r))) delete ST.fmt[r]; else ST.fmt[r] = to;
  const fn = {}; fn[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
  const a = anoBase('format', r, { fo: origFmt(r), fs: to, cmd: 'Correction manuelle' });
  setAno(a, 'corrigee', `Format : ${from} → ${to}${why ? ' · motif : ' + why : ''}`);
  // si le lot était en attente, la décision est prise
  ST.anomalies.forEach(x => { if (x !== a && x.row === r && x.st === 'attente') setAno(x, 'resolue', 'Format corrigé à la main'); });
  const h = addHist({ kind: 'reformat', cmd: 'Correction du format', label: `Format de ${lotLabel(r)} : ${from} → ${to}`, rows: [], fp, fn, ano: a.id, result: why ? 'Motif : ' + why : '' });
  persist({ fmt: [r], hist: [h], ano: ST.anomalies.filter(x => x.row === r) });
  flashRows = new Set([r]); refreshPending(); afterChange(false);
  showScan(lotLabel(r), `Format : ${to}`, 'ok');
  setResult(`<b>Format corrigé</b> — ${esc(lotLabel(r))} : ${esc(from)} → ${esc(to)}`);
}

/* ---------- Anomalies de pointage : liste filtrable et décisions ---------- */
function anoRowHtml(a, i) {
  const open = Formats.isOpen(a), r = a.row;
  const acts = [];
  if (a.type === 'format' && open && r != null) {
    acts.push(`<button class="btn" data-act="confirm" data-i="${i}">Confirmer « ${esc(a.fs)} »</button>`, `<button class="btn" data-act="keep" data-i="${i}">Garder « ${esc(a.fo)} »</button>`);
  }
  if (open) acts.push(`<button class="btn" data-act="solve" data-i="${i}">Marquer résolue</button>`);
  if (r != null && r < DATA.lots.length) acts.push(`<button class="btn" data-act="lot" data-i="${i}">Voir le lot</button>`);
  acts.push(`<button class="btn danger" data-act="del" data-i="${i}" title="Supprimer définitivement cette anomalie">Supprimer</button>`);
  return `<tr class="${open ? 'open' : ''}">
    <td>${fmtDT(a.t)}</td><td>${esc(a.kind || '')}</td><td class="num">${esc(a.n || '')}</td><td class="num">${esc(a.n2 || '')}</td>
    <td>${esc(a.fo || '')}</td><td>${esc(a.fs || '')}</td>
    <td><span class="stp ${a.st || 'info'}">${esc(Formats.ST_LABEL[a.st] || 'Note')}</span></td>
    <td>${esc(a.res || a.cmd || '')}</td><td class="acts">${acts.join('')}</td></tr>`;
}
let anoFilter = { type: '', st: 'open', fmt: '' };
function openAnomalies() {
  const all = ST ? ST.anomalies.map((a, i) => [a, i]) : [];
  const types = [...new Set(all.map(([a]) => a.kind || ''))].filter(Boolean);
  const list = all.filter(([a]) => (!anoFilter.type || a.kind === anoFilter.type)
    && (anoFilter.st === '' || (anoFilter.st === 'open' ? Formats.isOpen(a) : anoFilter.st === 'closed' ? !Formats.isOpen(a) : a.st === anoFilter.st))
    && (!anoFilter.fmt || a.fk === anoFilter.fmt || Formats.normFmt(a.fo) === anoFilter.fmt || Formats.normFmt(a.fs) === anoFilter.fmt)).reverse();
  modal(`
    <h3>Anomalies de pointage — ${esc(INV ? INV.name : '')}</h3>
    <div class="grid3">
      <label>Type<select id="afType"><option value="">Tous</option>${types.map(t => `<option ${t === anoFilter.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Statut<select id="afSt">${[['open', 'Ouvertes et en attente'], ['attente', 'En attente'], ['closed', 'Traitées'], ['', 'Toutes']].map(([v, l]) => `<option value="${v}" ${v === anoFilter.st ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Format<select id="afFmt"><option value="">Tous</option>${fmtStatsCache.map(s => `<option value="${esc(s.key)}" ${s.key === anoFilter.fmt ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
    </div>
    <div class="anotable"><table><thead><tr><th>Date</th><th>Type</th><th>${esc(INV ? INV.columns[INV.lotCol] : 'N°')}</th><th>${esc(INV && INV.altCol != null && INV.altCol >= 0 ? INV.columns[INV.altCol] : '2e n°')}</th><th>Format d'origine</th><th>Format constaté</th><th>Statut</th><th>Détail</th><th></th></tr></thead>
    <tbody>${list.length ? list.map(([a, i]) => anoRowHtml(a, i)).join('') : '<tr><td colspan="9" class="empty">Aucune anomalie pour ces filtres.</td></tr>'}</tbody></table></div>
    <div class="mrow"><button class="btn danger" id="afDelDone" ${all.some(([a]) => !Formats.isOpen(a)) ? '' : 'disabled'}>Supprimer toutes les anomalies traitées (${all.filter(([a]) => !Formats.isOpen(a)).length})</button><button class="btn danger" id="afDelShown" ${list.length ? '' : 'disabled'}>Supprimer les ${list.length} affichée${list.length > 1 ? 's' : ''}</button><button class="btn primary" id="afClose">Fermer</button></div>`);
  $('#modalBox').classList.add('wide');
  $('#afClose').onclick = closeModal;
  $('#afDelDone').onclick = () => deleteAnos(all.filter(([a]) => !Formats.isOpen(a)).map(([a]) => a), 'toutes les anomalies traitées');
  $('#afDelShown').onclick = () => deleteAnos(list.map(([a]) => a), 'les anomalies affichées');
  $('#afType').onchange = e => { anoFilter.type = e.target.value; openAnomalies(); };
  $('#afSt').onchange = e => { anoFilter.st = e.target.value; openAnomalies(); };
  $('#afFmt').onchange = e => { anoFilter.fmt = e.target.value; openAnomalies(); };
  $('#modalBox').querySelectorAll('[data-act]').forEach(b => b.onclick = () => anoAct(b.dataset.act, ST.anomalies[+b.dataset.i]));
}
function anoAct(act, a) {
  if (!a) return;
  const r = a.row;
  if (act === 'lot') { openLot(r); return; }
  if (act === 'del') { deleteAnos([a], 'cette anomalie'); return; }
  if (act === 'solve') { setAno(a, 'resolue', a.res ? a.res + ' · marquée résolue' : 'Marquée résolue'); persist({ ano: [a] }); refreshPending(); afterChange(false); openAnomalies(); return; }
  if (act === 'confirm') {
    setAno(a, 'corrigee', `Format confirmé : ${a.fs} (listing : ${opLbl(r)})`); a.fk = Formats.normFmt(a.fs);
    scanApply(r, { fmt: a.fs, fs: a.fs, scanSt: 'Corrigé', read: 'Décision sur anomalie', ano: a, dec: true });
  } else if (act === 'keep') {
    setAno(a, 'conservee', `Format d'origine « ${opLbl(r)} » conservé`);
    scanApply(r, { fs: opLbl(r), scanSt: 'Format conservé', read: 'Décision sur anomalie', ano: a, dec: true });
  }
  refreshPending(); afterChange(false); openAnomalies();
}

/* ---------- Scans récents (séance) ---------- */
function renderRecent() {
  const box = $('#recentLog'); if (!box) return;
  const list = HIST.filter(h => h.sc).slice(-14).reverse();
  box.innerHTML = list.length ? `<table><thead><tr><th>Lot</th>${fmtCol >= 0 ? '<th>Format listing</th><th>Constaté</th>' : ''}<th>Statut</th></tr></thead><tbody>${list.map(h => `
    <tr class="${h.undone ? 'u' : ''} ${(/étiquette|Alerte|Reporté/.test(h.sc.st) ? 'w' : ({ 'Validé': 'ok', 'Corrigé': 'ok', 'Format conservé': 'w', 'En attente': 'w', 'Déjà pointé': 'b', 'Inconnu': 'e', 'Scan annulé': '' })[h.sc.st]) || ''}">
      <td class="num" title="${fmtT(h.t)}">${esc(h.sc.l)}</td>${fmtCol >= 0 ? `<td>${esc(h.sc.fo || '')}</td><td>${esc(h.sc.fs || '')}</td>` : ''}<td>${esc(h.undone ? 'Annulé' : h.sc.st)}</td></tr>`).join('')}</tbody></table>` : '<div class="hint">Aucun scan pour le moment.</div>';
}

/* ---------- Lecture par la caméra (téléphone / tablette compatibles) ---------- */
let camStream = null, camTimer = null;
async function openCamera() {
  if (!('BarcodeDetector' in window)) { toast('La lecture par caméra n\'est pas disponible dans ce navigateur.'); return; }
  let det;
  try { det = new BarcodeDetector(); } catch (e) { toast('Lecture par caméra indisponible.'); return; }
  modal(`<h3>Scanner avec la caméra</h3><div class="cam"><video id="camV" playsinline muted></video></div><p class="hint" id="camMsg">Visez le code-barres du lot.</p><div class="mrow"><button class="btn primary" id="camClose">Fermer</button></div>`);
  const stop = () => { clearInterval(camTimer); if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; };
  $('#camClose').onclick = () => { stop(); closeModal(); };
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('#camV'); v.srcObject = camStream; await v.play();
    let last = '', lastT = 0;
    camTimer = setInterval(async () => {
      if ($('#modal').hidden) { stop(); return; }
      try {
        const codes = await det.detect(v);
        const val = codes.map(c => String(c.rawValue || '').trim()).find(Boolean);
        if (val && (val !== last || Date.now() - lastT > 2500)) { last = val; lastT = Date.now(); $('#camMsg').textContent = 'Lu : ' + val; stop(); closeModal(); scanCode(fixScan(val), val); }
      } catch (e) {}
    }, 250);
  } catch (e) { $('#camMsg').textContent = 'Caméra refusée ou indisponible : autorisez la caméra pour ce site.'; }
}

/* ---------- Suppression définitive d'anomalies (traitées ou non) : elles n'apparaissent plus nulle part ---------- */
function deleteAnos(list, what) {
  if (!list.length) return;
  const open = list.filter(Formats.isOpen).length, pend = list.filter(a => a.st === 'attente').length;
  modal(`<h3>Supprimer ${list.length > 1 ? list.length + ' anomalies' : 'cette anomalie'} ?</h3>
    <p>${list.length > 1 ? `Vous allez supprimer ${esc(what)} (${list.length}).` : `« ${esc(list[0].kind || '')}${list[0].n ? ' : ' + esc(list[0].n) : ''} ».`} ${list.length > 1 ? 'Elles disparaissent' : 'Elle disparaît'} de la liste, des compteurs et de l'export, pour tous les appareils. Cette suppression ne peut pas être annulée.</p>
    ${open ? `<p class="notice"><b>Attention :</b> ${open} ${open > 1 ? 'sont encore ouvertes' : 'est encore ouverte'}${pend ? `, dont ${pend} lot${pend > 1 ? 's' : ''} en attente qui ${pend > 1 ? 'redeviendront' : 'redeviendra'} simplement « non pointé${pend > 1 ? 's' : ''} »` : ''}.</p>` : ''}
    <p class="hint">Les pointages et les corrections de format ne changent pas ; l'historique garde une ligne indiquant la suppression.</p>
    <div class="mrow"><button class="btn" id="adNo">Retour</button><button class="btn danger" id="adYes">Supprimer définitivement</button></div>`);
  $('#adNo').onclick = openAnomalies;
  $('#adYes').onclick = () => {
    const ids = new Set(list.map(a => a.id));
    ST.anomalies = ST.anomalies.filter(a => !ids.has(a.id));
    const h = addHist({ kind: 'anodel', cmd: 'Suppression d\'anomalies', label: `${ids.size} anomalie${ids.size > 1 ? 's' : ''} supprimée${ids.size > 1 ? 's' : ''}`, rows: [], result: [...new Set(list.map(a => a.kind || 'Note'))].join(', ') });
    persist({ anoDel: [...ids], hist: [h] });
    refreshPending(); afterChange(false); renderAno();
    toast(`${ids.size} anomalie${ids.size > 1 ? 's' : ''} supprimée${ids.size > 1 ? 's' : ''}`);
    openAnomalies();
  };
}

/* ===================== Séances, traçabilité des scans et étiquettes à remplacer =====================
   Chaque scan reste un événement distinct du journal (jamais écrasé). Une séance = une entrée « session ».
   L'étiquette physique a son propre statut (pt_etat e.{i}) : corriger le format ne la remplace jamais.     */

/* ---------- Séance courante : identifiant gardé sur l'appareil (survit à la fermeture de l'appli) ---------- */
function currentSid() {
  if (!INV || !sessionKey()) return '';
  const s = (settings.sess || {})[INV.id];
  return s && s.k === sessionKey() ? s.id : '';
}
function startSession(k, reprise) {
  const lab = fmtLabelOf(k);
  const h = addHist({ kind: 'session', cmd: '', label: `Séance de pointage : ${lab}${reprise ? ' (reprise)' : ''}`, rows: [], sid: '', sk: k, ss: lab });
  h.sid = h.id;
  settings.sess = settings.sess || {}; settings.sess[INV.id] = { k, id: h.id }; saveSettings();
  persist({ hist: [h] });
  return h.id;
}
function ensureSid() { if (!INV || !sessionKey()) return ''; return currentSid() || startSession(sessionKey(), true); }
function endSession() {
  const sid = currentSid(); if (!sid) return '';
  const h = addHist({ kind: 'sessend', cmd: '', label: `Fin de séance : ${fmtLabelOf(sessionKey())}`, rows: [], sid, sk: sessionKey() });
  delete settings.sess[INV.id]; saveSettings();
  persist({ hist: [h] });
  return sid;
}

/* ---------- Traçabilité (recalculée à partir du journal, mise en cache) ---------- */
let traceMemo = { key: '', v: null };
function trace() {
  let und = 0; for (const h of HIST) if (h.undone) und++;
  const key = (INV ? INV.id : '') + ':' + HIST.length + ':' + (HIST.length ? HIST[HIST.length - 1].id : '') + ':' + und;
  if (traceMemo.key === key) return traceMemo.v;
  const I = Formats.sessionIndex(HIST), byRow = new Map();
  for (const h of HIST) if (Formats.isScanEvent(h) && h.sc.r != null) { if (!byRow.has(h.sc.r)) byRow.set(h.sc.r, []); byRow.get(h.sc.r).push(h); }
  traceMemo = { key, v: { I, byRow } };
  return traceMemo.v;
}
const sessOf = h => { const T = trace(); return T.I.sessions.get(T.I.sidOf(h.id)) || null; };
function lotTrace(r) {
  const T = trace(), ev = T.byRow.get(r) || [];
  const outs = ev.filter(h => { const s = sessOf(h); return s && Formats.outOfCategory(h, s.key); });
  const fa = ST.anomalies.filter(a => a.type === 'format' && a.row === r);
  let first = null;
  if (outs.length) { const s = sessOf(outs[0]); first = { t: outs[0].t, sess: s.label, sid: s.id }; }
  else if (fa.length) first = { t: fa[0].t, sess: fa[0].cmd === 'Correction manuelle' ? 'Correction manuelle' : fa[0].sess ? fmtLabelOf(fa[0].sess) : 'Hors séance', sid: fa[0].sid || '' };
  const lh = ev[ev.length - 1], ls = lh ? sessOf(lh) : null;
  return {
    n: ev.length, ev, first,
    last: lh ? { t: lh.t, sess: ls ? ls.label : 'Hors séance', sid: ls ? ls.id : '' } : null,
    seen: sid => !!sid && ev.some(h => T.I.sidOf(h.id) === sid)
  };
}
// tous les événements d'un lot, dans l'ordre : scans, corrections, réétiquetage, observations
function lotEvents(r) {
  const out = [];
  for (const h of HIST) {
    const isScan = h.sc && h.sc.r === r, fp = h.fp && Object.prototype.hasOwnProperty.call(h.fp, r);
    if (!isScan && !fp && h.lr !== r && !(h.rows || []).includes(r)) continue;
    const s = sessOf(h);
    let sess = s ? s.label : 'Hors séance', what = h.label;
    if (h.kind === 'label') { sess = 'Réétiquetage'; what = h.ln ? `Étiquette remplacée (${h.ln.f})` : 'Étiquette remise « à remplacer »'; }
    else if (h.kind === 'note') { sess = 'Observation'; what = h.result; }
    else if (h.kind === 'postpone') what = 'Correction reportée';
    else if (h.kind === 'reformat') { sess = 'Correction'; what = h.label.replace(/^Format de .+? : /, 'Format : ').replace(/^Format de .+? confirmé : /, 'Format confirmé : ') + (h.result ? ' · ' + h.result : ''); }
    else if (isScan) {
      const out = s && Formats.outOfCategory(h, s.key);
      const st = h.sc.st || '';
      what = h.sc.dec ? `Décision : ${st}` : /Alerte|étiquette à remplacer|Reporté/.test(st) ? `Nouveau scan, alerte (${st})`
        : out ? `Anomalie détectée : listing « ${h.sc.fo} », séance « ${s.label} » → ${st}` : `Scan : ${st}`;
    } else if (h.kind === 'check' || h.kind === 'uncheck') what = h.kind === 'check' ? 'Pointé à la main' : 'Dépointé';
    out.push({ t: h.t, sess, what, undone: h.undone && h.kind !== 'undo' });
  }
  return out;
}
const labelOf = r => fmtCol < 0 ? '' : Formats.labelState(origFmt(r), opLbl(r), ST.lbl[r], verifyRows.has(r));
const labelOn = r => ST.lbl[r] && ST.lbl[r].f != null ? ST.lbl[r].f : origFmt(r);
function labelText(r) {
  const s = labelOf(r);
  if (s === 'remplacer') return `À remplacer — porte « ${esc(labelOn(r))} », format réel « ${esc(opLbl(r))} »`;
  if (s === 'verifier') { const a = openFmtAno(r); return `Format à confirmer — vu pendant « ${esc(a && a.fs || '?')} »`; }
  if (s === 'remplacee') return `Remplacée le ${fmtDT(ST.lbl[r].t)} (${esc(ST.lbl[r].f)})`;
  return 'Conforme au listing';
}
// lots concernés : format corrigé, étiquette déjà posée, ou format à confirmer
function labelRows() {
  if (!INV || fmtCol < 0) return [];
  const cand = new Set([...Object.keys(ST.fmt).map(Number), ...Object.keys(ST.lbl || {}).map(Number), ...verifyRows]);
  return [...cand].filter(r => r < DATA.lots.length && labelOf(r)).sort((a, b) => POS[a] - POS[b]);
}
const labelsToReplace = () => labelRows().filter(r => labelOf(r) === 'remplacer').length;

/* ---------- Réétiquetage physique : confirmé à la main, horodaté, annulable ---------- */
function confirmLabels(rows) {
  const hs = [], done = [];
  for (const r of rows) {
    if (labelOf(r) !== 'remplacer') continue;
    const prev = ST.lbl[r] || null;
    ST.lbl[r] = { t: Date.now(), f: opLbl(r), dev: DEVICE };
    hs.push(addHist({ kind: 'label', cmd: 'Réétiquetage', label: `Étiquette remplacée : ${lotLabel(r)} → ${opLbl(r)}`, rows: [], lr: r, lp: prev, ln: ST.lbl[r], result: `Ancienne étiquette : ${prev ? prev.f : origFmt(r)}` }));
    done.push(r);
  }
  if (!done.length) return 0;
  persist({ lbl: done, hist: hs }); flashRows = new Set(done); afterChange(false);
  toast(done.length > 1 ? `${done.length} étiquettes confirmées remplacées` : `Étiquette de ${lotLabel(done[0])} confirmée remplacée`);
  return done.length;
}
function resetLabel(r) {
  const prev = ST.lbl[r]; if (!prev) return;
  delete ST.lbl[r];
  const h = addHist({ kind: 'label', cmd: 'Réétiquetage', label: `Étiquette de ${lotLabel(r)} remise « à remplacer »`, rows: [], lr: r, lp: prev, ln: null });
  persist({ lbl: [r], hist: [h] }); afterChange(false);
}
function addNote(r, text) {
  const h = addHist({ kind: 'note', cmd: 'Observation', label: `Observation : ${lotLabel(r)}`, rows: [], lr: r, result: text });
  persist({ hist: [h] }); renderHist(); toast('Observation ajoutée');
}

/* ---------- Alerte : lot déjà identifié dans un autre format, rescanné dans une nouvelle séance ---------- */
let alertCtx = null;
function openLotAlert(c, read, ls) {
  const r = c.row, tr = lotTrace(r), a = openFmtAno(r), now = sessionKey() ? fmtLabelOf(sessionKey()) : 'Hors séance';
  alertCtx = { r, read, ls, c, recorded: false };
  const prev = tr.last || tr.first;
  if (ls === 'remplacer') {
    // format déjà confirmé : le lot est présent, il est pointé tout de suite (une seule fois) dans son format réel
    if (!ST.status[r]) scanApply(r, { scanSt: 'Validé · étiquette à remplacer', read });
    else { const h = addHist({ kind: 'scan', cmd: read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: opLbl(r), ko: opKeyRow(r), st: 'Alerte · étiquette à remplacer' }, result: 'Lot déjà identifié : étiquette à remplacer' }); persist({ hist: [h] }); renderRecent(); }
    alertCtx.recorded = true;
  }
  const real = ls === 'remplacer' ? opLbl(r) : (a && a.fs) || '?';
  const prevSess = (tr.first && tr.first.sess) || (a && a.sess ? fmtLabelOf(a.sess) : '?');
  showScan(lotLabel(r), ls === 'remplacer' ? `Étiquette à remplacer (${real})` : `Vu pendant ${prevSess} : à confirmer`, 'bad warnfmt');
  setResult(`<b>${esc(lotLabel(r))}</b> — <span class="w">${ls === 'remplacer' ? `identifié comme ${esc(real)} : étiquette à remplacer` : `déjà scanné pendant ${esc(prevSess)} : format à confirmer`}</span>`);
  const title = ls === 'remplacer' ? `⚠ LOT IDENTIFIÉ COMME ${esc(String(real).toUpperCase())} — ÉTIQUETTE À REMPLACER` : `⚠ ATTENTION — LOT DÉJÀ SCANNÉ PENDANT LES ${esc(String(prevSess).toUpperCase())}`;
  const keep = esc(origFmt(r));
  modal(`
    <div class="mm alert">
      <h3 class="mmtitle">${title}</h3>
      <p>${ls === 'remplacer'
        ? `Ce lot est enregistré « ${keep} » dans le listing, mais il a été identifié comme « ${esc(real)} ». Retrouvez-le et remplacez son étiquette.`
        : `Ce lot est enregistré « ${keep} » dans le listing, mais il a été scanné pendant la séance « ${esc(prevSess)} ». Son format réel n'est pas encore confirmé.`}</p>
      <div class="mmgrid">
        ${idsHtml(r).replace('<div class="idgrid">', '').replace(/<\/div>$/, '')}
        <span>Format Excel</span><b class="fmtbig">${keep}</b>
        <span>Format réel ${ls === 'remplacer' ? 'confirmé' : 'constaté'}</span><b class="fmtbig">${esc(real)}${ls === 'verifier' ? ' <small>(à confirmer)</small>' : ''}</b>
        <span>Première séance</span><b>${esc(prevSess)}${tr.first ? ' · ' + fmtDT(tr.first.t) : ''}</b>
        ${prev && tr.last && tr.first && tr.last.t !== tr.first.t ? `<span>Scan précédent</span><b>${esc(prev.sess)} · ${fmtDT(prev.t)}</b>` : ''}
        <span>Séance actuelle</span><b>${esc(now)}</b>
        <span>Étiquette physique</span><b class="w">${ls === 'remplacer' ? `NON REMPLACÉE (porte « ${esc(labelOn(r))} »)` : 'EN ATTENTE DE CONFIRMATION'}</b>
        <span>Scans du lot</span><b>${tr.n + 1} (celui-ci compris)</b>
      </div>
      <div class="mmacts">
        <button class="mma" data-a="1"><kbd>1</kbd><span><b>Historique des scans</b><small>Fiche du lot, toutes les séances</small></span></button>
        ${ls === 'remplacer'
          ? `<button class="mma" data-a="2"><kbd>2</kbd><span><b>Confirmer ou modifier le format réel</b><small>Ouvre la correction du format</small></span></button>`
          : `<button class="mma ok" data-a="2"><kbd>2</kbd><span><b>C'est bien un ${esc(real)}</b><small>Format corrigé, pointé, étiquette à remplacer</small></span></button>`}
        <button class="mma" data-a="3"><kbd>3</kbd><span><b>Ajouter une observation</b><small>Note datée dans l'historique du lot</small></span></button>
        ${ls === 'remplacer'
          ? `<button class="mma ok" data-a="4"><kbd>4</kbd><span><b>Étiquette remplacée ✓</b><small>Confirmer le remplacement physique maintenant</small></span></button>`
          : `<button class="mma" data-a="4"><kbd>4</kbd><span><b>Garder « ${keep} »</b><small>Pointé dans le format du listing, pas d'étiquette à changer</small></span></button>`}
        <button class="mma" data-a="5"><kbd>5</kbd><span><b>Reporter</b><small>${ls === 'remplacer' ? 'Le lot reste dans « Étiquettes à remplacer »' : 'Non pointé, l\'alerte reste active'}</small></span></button>
      </div>
      <p class="hint">Touches 1 à 5. Échap ou un nouveau scan = reporter.</p>
    </div>`);
  $('#modalBox').querySelectorAll('.mma').forEach(b => b.onclick = () => alertAct(+b.dataset.a));
  $('#modalBox').querySelector('.mma.ok, .mma').focus();
  snd.mismatch();
}
function alertAct(n) {
  const x = alertCtx; if (!x) return;
  alertCtx = null;
  const r = x.r, a = openFmtAno(r);
  // un scan = un événement : enregistré ici s'il ne l'a pas été à l'ouverture
  const record = st => { if (x.recorded) return; x.recorded = true; const h = addHist({ kind: 'scan', cmd: x.read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: a && a.fs || opLbl(r), ko: opKeyRow(r), st }, ano: a ? a.id : null, result: st }); persist({ hist: [h] }); };
  if (x.ls === 'verifier' && (n === 2 || n === 4)) {
    closeModal();
    if (n === 2) {
      const to = a.fs, from = opLbl(r);
      setAno(a, 'corrigee', `Format confirmé : ${to} (listing : ${from})`); a.fk = Formats.normFmt(to);
      scanApply(r, { fmt: to, fs: to, scanSt: 'Corrigé', read: x.read, ano: a });
      showScan(lotLabel(r), `Corrigé → ${to} · étiquette à remplacer`, 'ok');
      showResult('warn', '✓ FORMAT CONFIRMÉ — ÉTIQUETTE À REMPLACER', `${esc(lotLabel(r))} : ${esc(from)} → <b>${esc(to)}</b>, pointé. Ajouté aux « Étiquettes à remplacer ».`);
    } else {
      setAno(a, 'conservee', `Format du listing « ${opLbl(r)} » gardé après rescan (vu pendant ${a.fs})`);
      scanApply(r, { fs: opLbl(r), scanSt: 'Format conservé', read: x.read, ano: a });
      showScan(lotLabel(r), `Pointé (${opLbl(r)})`, 'ok');
      showResult('ok', '✓ POINTÉ DANS LE FORMAT DU LISTING', `${esc(lotLabel(r))} reste « ${esc(opLbl(r))} ». Pas d'étiquette à changer.`);
    }
    refreshPending(); afterChange(false); return;
  }
  if (n === 1) { record(x.ls === 'verifier' ? 'Alerte · format à confirmer' : 'Alerte'); refreshPending(); afterChange(false); openLot(r); return; }
  if (n === 2) { openLot(r, true); return; }
  if (n === 3) {
    record(x.ls === 'verifier' ? 'Alerte · format à confirmer' : 'Alerte');
    modal(`<h3>Observation — lot ${esc(lotLabel(r))}</h3><form id="obsF" class="fixfmt"><input id="obsT" placeholder="ex. étiquette introuvable, lot rangé carton B12" style="min-height:42px"><div class="mrow"><button type="button" class="btn" id="obsNo">Annuler</button><button class="btn primary">Ajouter</button></div></form>`);
    setTimeout(() => $('#obsT').focus(), 30);
    $('#obsNo').onclick = closeModal;
    $('#obsF').onsubmit = e => { e.preventDefault(); const t = $('#obsT').value.trim(); closeModal(); if (t) addNote(r, t); afterChange(false); };
    return;
  }
  closeModal();
  if (n === 4) { confirmLabels([r]); showResult('ok', '✓ ÉTIQUETTE REMPLACÉE', `${esc(lotLabel(r))} : nouvelle étiquette « ${esc(opLbl(r))} » confirmée. Le lot reste consultable dans les corrections terminées.`); return; }
  // 5 : reporter
  record(x.ls === 'verifier' ? 'Reporté · format à confirmer' : 'Alerte');
  const h = addHist({ kind: 'postpone', cmd: x.read, label: `Correction reportée : ${lotLabel(r)}`, rows: [], lr: r });
  persist({ hist: [h] }); refreshPending(); afterChange(false);
  showResult('warn', x.ls === 'remplacer' ? '⏸ ÉTIQUETTE À REMPLACER — REPORTÉ' : '⏸ FORMAT À CONFIRMER — REPORTÉ', `${esc(lotLabel(r))} ${x.ls === 'remplacer' ? 'est pointé ; il reste dans « Étiquettes à remplacer »' : 'n\'est pas pointé ; l\'alerte réapparaîtra au prochain scan'}.`);
}

/* ---------- Liste « Étiquettes à remplacer » ---------- */
let lblFilter = { st: 'remplacer', fo: '', fr: '', ses: '', day: '', q: '' };
function labelRowData(r) {
  const tr = lotTrace(r), st = labelOf(r), a = verifyRows.has(r) ? openFmtAno(r) : null;
  const corrH = [...HIST].reverse().find(h => !h.undone && h.fp && Object.prototype.hasOwnProperty.call(h.fp, r));
  return {
    r, n1: String(DATA.lots[r]), n2: altOf(r), fo: origFmt(r), fr: a ? a.fs : opLbl(r), st, tr,
    info: ST.fmt[r] != null ? 'Corrigé' + (corrH ? ' le ' + fmtDT(corrH.t) : '') : a ? 'À confirmer' : 'Format du listing',
    lbl: st === 'remplacer' ? 'À remplacer' : st === 'verifier' ? 'À vérifier' : st === 'remplacee' ? `Remplacée le ${fmtDT(ST.lbl[r].t)}` : 'Pas à changer'
  };
}
const fmtDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function openLabels() {
  if (!INV) return;
  if (fmtCol < 0) { toast('Aucune colonne de format dans cette vente.'); return; }
  const all = labelRows().map(labelRowData);
  const uniq = f => [...new Set(all.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const n = k => all.filter(x => x.st === k).length;
  modal(`
    <h3>Étiquettes à remplacer — ${esc(INV.name)}</h3>
    <p>Lots dont le format réel confirmé diffère de l'étiquette posée. Un lot ne quitte la liste qu'une fois l'étiquette confirmée remplacée.</p>
    <div class="grid3 lblf">
      <label>Vente<select id="lfInv">${invList.filter(i => !i.archived || i.id === INV.id).sort((a, b) => b.created - a.created).map(i => `<option value="${esc(i.id)}" ${i.id === INV.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
      <label>Statut<select id="lfSt">${[['remplacer', `Étiquettes à remplacer (${n('remplacer')})`], ['verifier', `Anomalies à vérifier (${n('verifier')})`], ['remplacee', `Étiquettes déjà remplacées (${n('remplacee')})`], ['', `Tous (${all.length})`]].map(([v, l]) => `<option value="${v}" ${v === lblFilter.st ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Rechercher un n°<input id="lfQ" inputmode="numeric" placeholder="5 ou 6 chiffres" value="${esc(lblFilter.q)}"></label>
    </div>
    <details class="lblmore" ${lblFilter.fo || lblFilter.fr || lblFilter.ses || lblFilter.day ? 'open' : ''}><summary>Filtrer par format, séance ou date</summary><div class="grid3 lblf">
      <label>Format enregistré<select id="lfFo"><option value="">Tous</option>${uniq(x => x.fo).map(f => `<option ${f === lblFilter.fo ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label>Format réel<select id="lfFr"><option value="">Tous</option>${uniq(x => x.fr).map(f => `<option ${f === lblFilter.fr ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label>Séance de détection<select id="lfSes"><option value="">Toutes</option>${uniq(x => x.tr.first && x.tr.first.sess).map(f => `<option ${f === lblFilter.ses ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label>Date du scan<input type="date" id="lfDay" value="${esc(lblFilter.day)}"></label>
    </div></details>
    <div class="anotable" id="lfTable"></div>
    <div class="mrow"><span class="hint" id="lfCount"></span><button class="btn primary" id="lfAll" hidden></button><button class="btn" id="lfXls">Exporter Excel</button><button class="btn" id="lfPrint">Imprimer</button><button class="btn primary" id="lfClose">Fermer</button></div>`);
  $('#modalBox').classList.add('wide');
  const sel = new Set();
  const shown = () => all.filter(x => (!lblFilter.st || x.st === lblFilter.st) && (!lblFilter.fo || x.fo === lblFilter.fo) && (!lblFilter.fr || x.fr === lblFilter.fr)
    && (!lblFilter.ses || (x.tr.first && x.tr.first.sess === lblFilter.ses)) && (!lblFilter.day || (x.tr.first && fmtDay(x.tr.first.t) === lblFilter.day) || (x.tr.last && fmtDay(x.tr.last.t) === lblFilter.day))
    && (!lblFilter.q || x.n1.includes(lblFilter.q) || x.n2.includes(lblFilter.q)));
  const draw = () => {
    const list = shown();
    $('#lfTable').innerHTML = labelTable(list, { select: true, sel });
    $('#lfCount').textContent = `${list.length} lot${list.length > 1 ? 's' : ''} affiché${list.length > 1 ? 's' : ''}`;
    const can = list.filter(x => x.st === 'remplacer');
    const pick = can.filter(x => sel.has(x.r));
    $('#lfAll').hidden = !pick.length;
    $('#lfAll').textContent = `✓ Étiquettes remplacées (${pick.length})`;
    bindLabelTable($('#lfTable'), list, sel, draw, openLabels);
  };
  draw();
  $('#lfClose').onclick = closeModal;
  $('#lfInv').onchange = async e => { closeModal(); await loadInventory(e.target.value); $('#invSel').value = e.target.value; openLabels(); };
  $('#lfSt').onchange = e => { lblFilter.st = e.target.value; sel.clear(); draw(); };
  $('#lfFo').onchange = e => { lblFilter.fo = e.target.value; draw(); };
  $('#lfFr').onchange = e => { lblFilter.fr = e.target.value; draw(); };
  $('#lfSes').onchange = e => { lblFilter.ses = e.target.value; draw(); };
  $('#lfDay').onchange = e => { lblFilter.day = e.target.value; draw(); };
  $('#lfQ').oninput = e => { lblFilter.q = e.target.value.replace(/\D/g, ''); draw(); };
  $('#lfAll').onclick = () => { const rows = shown().filter(x => x.st === 'remplacer' && sel.has(x.r)).map(x => x.r); if (rows.length) { confirmLabels(rows); openLabels(); } };
  $('#lfXls').onclick = () => exportLabels(shown(), `etiquettes_${{ remplacer: 'a_remplacer', verifier: 'a_verifier', remplacee: 'remplacees' }[lblFilter.st] || 'toutes'}`);
  $('#lfPrint').onclick = () => printModal();
}
const fmtShort = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const infoHtml = i => { const m = String(i).match(/^(.+?) le (.+)$/); return m ? `${esc(m[1])}<small class="num">${esc(m[2].replace(/:\d\d$/, '').replace(/\/\d{4}/, ''))}</small>` : esc(i); };
function labelTable(list, o) {
  const n1 = INV.columns[INV.lotCol] || 'N° lot', n2 = INV.altCol != null && INV.altCol >= 0 ? INV.columns[INV.altCol] : '';
  const can = list.filter(x => x.st === 'remplacer');
  const allOn = o.select && can.length && can.every(x => o.sel.has(x.r));
  return `<table class="lbltable"><thead><tr>${o.select ? `<th class="noprint">${can.length ? `<input type="checkbox" class="lselall" ${allOn ? 'checked' : ''} aria-label="Tout cocher">` : ''}</th>` : ''}<th>${esc(n1)}${n2 ? ' / ' + esc(n2) : ''}</th><th>Format Excel → réel</th><th>${o.scanTime ? 'Heure du scan' : 'Détecté pendant'}</th>${o.scanTime ? '' : '<th>Dernier scan</th>'}<th>Correction</th><th>Étiquette</th><th class="noprint"><span class="sr">Actions</span></th></tr></thead>
    <tbody>${list.length ? list.map(x => `<tr class="${x.st === 'remplacer' || x.st === 'verifier' ? 'open' : ''}">
      ${o.select ? `<td class="noprint">${x.st === 'remplacer' ? `<input type="checkbox" class="lsel" data-r="${x.r}" ${o.sel.has(x.r) ? 'checked' : ''} aria-label="Étiquette du lot ${esc(x.n1)} remplacée">` : ''}</td>` : ''}
      <td class="num lid"><b>${esc(x.n1)}</b>${x.n2 ? `<small>${esc(x.n2)}</small>` : ''}</td>
      <td class="lfm">${esc(x.fo)} → <b>${esc(x.fr)}</b>${x.st === 'verifier' ? ' ?' : ''}</td>
      ${o.scanTime ? `<td class="num" data-l="Scan">${x.scanT ? fmtShort(x.scanT) : ''}</td>` : `<td data-l="Détecté">${x.tr.first ? `${esc(x.tr.first.sess)}<small class="num">${fmtShort(x.tr.first.t)}</small>` : '—'}</td><td data-l="Dernier scan">${x.tr.last ? `${esc(x.tr.last.sess)}<small>${x.tr.n} scan${x.tr.n > 1 ? 's' : ''}</small>` : '—'}</td>`}
      <td data-l="Correction">${infoHtml(x.info)}</td><td class="lst"><span class="stp ${x.st === 'remplacee' ? 'corrigee' : x.st ? 'attente' : ''}">${esc(x.lbl)}</span></td>
      <td class="acts noprint">${x.st === 'remplacer' ? `<button class="btn primary" data-la="ok" data-r="${x.r}" title="Confirmer le remplacement de l'étiquette">✓ Remplacée</button>` : ''}${x.st === 'verifier' ? `<button class="btn" data-la="confirm" data-r="${x.r}">C'est un ${esc(x.fr)}</button><button class="btn" data-la="keep" data-r="${x.r}">Garder ${esc(x.fo)}</button>` : ''}${x.st === 'remplacee' ? `<button class="btn" data-la="back" data-r="${x.r}">Remettre à remplacer</button>` : ''}<button class="btn" data-la="lot" data-r="${x.r}">Fiche</button></td></tr>`).join('')
      : `<tr><td colspan="9" class="empty">Aucun lot pour ces filtres.</td></tr>`}</tbody></table>`;
}
function bindLabelTable(el, list, sel, redraw, reopen) {
  el.querySelectorAll('.lsel').forEach(c => c.onchange = () => { const r = +c.dataset.r; if (c.checked) sel.add(r); else sel.delete(r); redraw(); });
  el.querySelectorAll('.lselall').forEach(c => c.onchange = () => { list.filter(x => x.st === 'remplacer').forEach(x => c.checked ? sel.add(x.r) : sel.delete(x.r)); redraw(); });
  el.querySelectorAll('[data-la]').forEach(b => b.onclick = () => {
    const r = +b.dataset.r, act = b.dataset.la;
    if (act === 'lot') { openLot(r); return; }
    if (act === 'ok') confirmLabels([r]);
    else if (act === 'back') resetLabel(r);
    else if (act === 'confirm' || act === 'keep') { const a = openFmtAno(r); if (a) anoDecide(a, act); }
    reopen();
  });
}
// décision prise depuis une liste (bureau) : ce n'est pas un scan
function anoDecide(a, act) {
  const r = a.row;
  if (act === 'confirm') { setAno(a, 'corrigee', `Format confirmé : ${a.fs} (listing : ${opLbl(r)})`); a.fk = Formats.normFmt(a.fs); scanApply(r, { fmt: a.fs, fs: a.fs, scanSt: 'Corrigé', read: 'Décision sur anomalie', ano: a, dec: true }); }
  else { setAno(a, 'conservee', `Format d'origine « ${opLbl(r)} » conservé`); scanApply(r, { fs: opLbl(r), scanSt: 'Format conservé', read: 'Décision sur anomalie', ano: a, dec: true }); }
  refreshPending(); afterChange(false);
}
function labelSheet(list) {
  const n1 = INV.columns[INV.lotCol] || 'N° lot', n2 = INV.altCol != null && INV.altCol >= 0 ? INV.columns[INV.altCol] : '2e numéro';
  const rows = [['Vente', n1, n2, 'Format Excel', 'Format réel', 'Séance initiale', '1er scan problématique', 'Dernière séance', 'Nombre de scans', 'Correction informatique', 'Étiquette', 'Remplacée le']];
  list.forEach(x => rows.push([INV.name, x.n1, x.n2, x.fo, x.fr, x.tr.first ? x.tr.first.sess : '', x.tr.first ? fmtDT(x.tr.first.t) : '', x.tr.last ? x.tr.last.sess : '', x.tr.n, x.info, x.st === 'remplacee' ? 'Remplacée' : x.lbl, x.st === 'remplacee' ? fmtDT(ST.lbl[x.r].t) : '']));
  return { rows, styles: rows.map((x, i) => i ? (x[10] === 'Remplacée' ? 2 : 4) : 1) };
}
function exportLabels(list, what) {
  const s = labelSheet(list);
  const fit = s.rows[0].map((_, i) => Math.min(40, Math.max(8, ...s.rows.slice(0, 101).map(r => String(r[i] ?? '').length + 2))));
  const blob = XlsxWriter.build([{ name: 'Étiquettes', rows: s.rows, styles: s.styles, widths: fit }]);
  const d = new Date();
  downloadBlob(blob, `${what}_${INV.name.replace(/[^\w\-]+/g, '_')}_${d.toISOString().slice(0, 10)}.xlsx`);
}
function printModal() {
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch (e) {}
  setTimeout(done, 1500);
}

/* ---------- Bilan des séances ---------- */
function rowInfo(r) { return { corrected: ST.fmt[r] != null, pending: verifyRows.has(r), label: labelOf(r) }; }
function globalSummary() {
  const T = trace(); let scans = 0; const out = new Set();
  for (const h of HIST) if (Formats.isScanEvent(h)) { scans++; const s = sessOf(h); if (h.sc.r != null && s && Formats.outOfCategory(h, s.key)) out.add(h.sc.r); }
  const Tt = Formats.totals(model(), ST.anomalies);
  return { scans, unique: T.byRow.size, conform: T.byRow.size - out.size, out: out.size, open: Tt.open, corrections: Tt.corrections, labels: labelsToReplace() };
}
const tiles = list => `<div class="bilan">${list.map(([k, v, w]) => `<div class="${w && v ? 'w' : ''}"><b class="num">${v}</b><span>${k}</span></div>`).join('')}</div>`;
function sessionList() {
  const T = trace(), list = [...T.I.sessions.values()].filter(s => s.events.length || s.id === currentSid());
  const none = HIST.filter(h => Formats.isScanEvent(h) && !T.I.sidOf(h.id));
  if (none.length) list.push({ id: '', key: '', label: 'Hors séance', start: none[0].t, end: none[none.length - 1].t, events: none });
  return list.sort((a, b) => b.start - a.start);
}
function openBilan(sid) {
  if (!INV) return;
  refreshPending();
  if (sid !== undefined && sid !== null) return openSessionBilan(sid);
  const g = globalSummary(), list = sessionList();
  modal(`
    <h3>Bilan des séances — ${esc(INV.name)}</h3>
    ${tiles([['Scans enregistrés', g.scans], ['Lots uniques scannés', g.unique], ['Lots conformes', g.conform], ['Scannés hors catégorie', g.out, 1], ['Anomalies ouvertes', g.open, 1], ['Corrections informatiques', g.corrections], ['Étiquettes à remplacer', g.labels, 1]])}
    <div class="anotable"><table><thead><tr><th>Séance</th><th>Début</th><th>Fin</th><th class="n">Scans</th><th class="n">Lots uniques</th><th class="n">Hors catégorie</th><th class="n">Étiquettes à remplacer</th><th></th></tr></thead>
    <tbody>${list.length ? list.map(s => { const b = Formats.sessionSummary(s.events, s.key, rowInfo); return `<tr class="${b.labels ? 'open' : ''}"><td><b>${esc(s.label)}</b>${s.id && s.id === currentSid() ? ' <span class="tag">en cours</span>' : ''}</td><td class="num">${fmtDT(s.start)}</td><td class="num">${fmtDT(s.end)}</td><td class="num">${b.total}</td><td class="num">${b.unique}</td><td class="num ${b.out ? 'w' : ''}">${b.out}</td><td class="num ${b.labels ? 'w' : ''}">${b.labels}</td><td><button class="btn" data-sid="${esc(s.id)}">Voir</button></td></tr>`; }).join('')
      : '<tr><td colspan="8" class="empty">Aucune séance de scannage pour le moment.</td></tr>'}</tbody></table></div>
    <div class="mrow"><button class="btn" id="bgLbl">Étiquettes à remplacer (${g.labels})</button><button class="btn primary" id="bgClose">Fermer</button></div>`);
  $('#modalBox').classList.add('wide');
  $('#bgClose').onclick = closeModal;
  $('#bgLbl').onclick = () => { lblFilter.st = 'remplacer'; openLabels(); };
  $('#modalBox').querySelectorAll('[data-sid]').forEach(b => b.onclick = () => openSessionBilan(b.dataset.sid));
}
function openSessionBilan(sid) {
  const s = sessionList().find(x => x.id === sid);
  if (!s) { openBilan(); return; }
  const b = Formats.sessionSummary(s.events, s.key, rowInfo);
  const rows = b.rows.map(x => Object.assign(labelRowData(x.r), { scanT: x.firstOut }));
  let q = '';
  const anoSt = x => x.st === 'verifier' ? 'À vérifier' : ST.fmt[x.r] != null ? 'Confirmée' : (ST.anomalies.find(a => a.type === 'format' && a.row === x.r && a.st === 'conservee') ? 'Format du listing gardé' : 'Sans suite');
  modal(`
    <h3>Séance ${esc(s.label)} — bilan</h3>
    <p>${fmtDT(s.start)} → ${fmtDT(s.end)}${s.id && s.id === currentSid() ? ' · en cours' : ''}</p>
    ${tiles([['Scans', b.total], ['Lots uniques reconnus', b.unique], ['Lots conformes', b.conform], ['Scannés hors catégorie', b.out, 1], ['Anomalies confirmées', b.confirmed], ['Anomalies à vérifier', b.verify, 1], ['Étiquettes à remplacer', b.labels, 1]])}
    <b>Lots scannés pendant « ${esc(s.label)} » mais enregistrés dans une autre catégorie</b>
    <label class="lblf sbq"><span class="sr">Rechercher</span><input id="sbQ" inputmode="numeric" placeholder="Rechercher un n° (5 ou 6 chiffres)"></label>
    <div class="anotable" id="sbTable"></div>
    <div class="mrow"><button class="btn" id="sbBack">Toutes les séances</button><button class="btn" id="sbXls" ${rows.length ? '' : 'disabled'}>Exporter Excel</button><button class="btn" id="sbPrint">Imprimer</button><button class="btn primary" id="sbClose">Fermer</button></div>`);
  $('#modalBox').classList.add('wide');
  const shown = () => rows.filter(x => !q || x.n1.includes(q) || x.n2.includes(q));
  const draw = () => {
    const list = shown();
    $('#sbTable').innerHTML = labelTable(list.map(x => Object.assign({}, x, { info: anoSt(x) })), { scanTime: true });
    bindLabelTable($('#sbTable'), list, new Set(), draw, () => openSessionBilan(sid));
  };
  draw();
  $('#sbQ').oninput = e => { q = e.target.value.replace(/\D/g, ''); draw(); };
  $('#sbBack').onclick = () => openBilan();
  $('#sbClose').onclick = closeModal;
  $('#sbPrint').onclick = () => printModal();
  $('#sbXls').onclick = () => exportLabels(shown(), `seance_${s.label.replace(/[^\w\-]+/g, '_')}`);
}
function showSessionEnd(sid) { const s = sessionList().find(x => x.id === sid); if (s && s.events.length) openSessionBilan(sid); }
