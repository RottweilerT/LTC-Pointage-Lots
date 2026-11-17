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
let pendingRows = new Set();
function refreshPending() {
  pendingRows = new Set();
  if (!ST) return;
  for (const a of ST.anomalies) if (a.st === 'attente' && a.row != null && !ST.status[a.row]) pendingRows.add(a.row);
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
      <button type="button" class="linkbtn" id="sessQuit">Quitter la séance</button></div>
    <div class="sessnums"><span><b class="num">${s.done}</b> / ${s.lots} lots</span><span><b class="num">${s.lots - s.done}</b> restants</span>${qtyCol >= 0 ? `<span><b class="num">${fmtNum(s.unitsDone)}</b> / ${fmtNum(s.units)} unités</span>` : ''}<span class="${s.anomalies ? 'w' : ''}"><b class="num">${s.anomalies}</b> anomalie${s.anomalies > 1 ? 's' : ''}</span><b class="num sesspct">${s.pct.toLocaleString('fr-FR')} %</b></div>
    <div class="bar"><i style="width:${s.pct}%"></i></div>`;
  $('#sessQuit').onclick = () => setFmt('', true);
}
const fmtNum = n => Number.isInteger(n) ? n.toLocaleString('fr-FR') : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/* ---------- Tableau de bord par format ---------- */
function renderFmtDash() {
  const box = $('#fmtDash');
  if (!INV || fmtCol < 0) { box.hidden = true; return; }
  box.hidden = false;
  $('#fmtDashTitle').textContent = `Pointage par format · ${INV.columns[fmtCol]}`;
  const rows = fmtStatsCache;
  $('#fmtTable').innerHTML = `<table><thead><tr><th>Format</th><th>Lots</th>${qtyCol >= 0 ? '<th>Unités</th>' : ''}<th>Pointés</th>${qtyCol >= 0 ? '<th>Unités pointées</th>' : ''}<th>Restants</th><th>Anomalies</th><th>Progression</th><th></th></tr></thead><tbody>${rows.map(s => `
    <tr class="${s.key === sessionKey() ? 'on' : ''} ${s.lots && s.done === s.lots ? 'full' : ''}" data-k="${esc(s.key)}">
      <th scope="row">${esc(s.label)}${s.corrIn ? ` <span class="tag" title="Lots reclassés dans ce format">+${s.corrIn} corrigé${s.corrIn > 1 ? 's' : ''}</span>` : ''}${s.corrOut ? ` <span class="tag cl" title="Lots sortis de ce format après correction">−${s.corrOut}</span>` : ''}</th>
      <td class="num">${s.lots}</td>${qtyCol >= 0 ? `<td class="num">${fmtNum(s.units)}</td>` : ''}<td class="num">${s.done}</td>${qtyCol >= 0 ? `<td class="num">${fmtNum(s.unitsDone)}</td>` : ''}
      <td class="num">${s.left}</td><td class="num ${s.anomalies ? 'w' : ''}">${s.anomalies}</td>
      <td><div class="mini"><i style="width:${s.pct}%"></i></div><span class="num">${s.pct.toLocaleString('fr-FR')} %</span></td>
      <td>${s.lots ? `<button class="btn ${s.key === sessionKey() ? 'primary' : ''}" data-k="${esc(s.key)}">${s.key === sessionKey() ? 'En cours' : (s.done ? 'Reprendre' : 'Pointer')}</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
  $('#fmtTable').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { const k = tr.dataset.k; const s = fmtStatsCache.find(x => x.key === k); if (!s || !s.lots) return; setFmt(k === sessionKey() ? '' : k, true); });
}

/* ---------- Anomalies : création et mise à jour ---------- */
function anoBase(type, r, extra) {
  const a = { t: Date.now(), type, kind: Formats.TYPE_LABEL[type] || type, st: 'ouverte', sess: sessionKey() || '' };
  if (r != null) Object.assign(a, { row: r, n: DATA.lots[r], n2: altOf(r), fo: origFmt(r), fk: opKeyRow(r) });
  return addAno(Object.assign(a, extra || {}));
}
function setAno(a, st, res) { a.st = st; a.res = res || a.res || ''; a.tr = Date.now(); return a; }
const anoById = id => ST.anomalies.find(a => a.id === id);

/* ---------- Pointage d'un lot reconnu (avec format éventuellement corrigé) ---------- */
function scanApply(r, o) {
  // o : { fmt: nouveau libellé (corriger) | undefined, scanSt: libellé de statut, ano: anomalie liée, read: texte lu }
  const prevS = [ST.status[r]], prevT = [ST.time[r]], now = Date.now();
  const fmtRows = [];
  let fp = null;
  if (o.fmt !== undefined) {
    fp = {}; fp[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
    if (Formats.normFmt(o.fmt) === Formats.normFmt(origFmt(r))) delete ST.fmt[r]; else ST.fmt[r] = o.fmt;
    fmtRows.push(r);
  }
  const changed = !ST.status[r];
  if (changed) { ST.status[r] = 1; ST.time[r] = now; }
  const fs = o.fs || opLbl(r);
  const h = addHist({ kind: 'check', cmd: o.read || 'Scan', label: `${lotLabel(r)} (scan)`, rows: changed ? [r] : [], prevS: changed ? prevS : [], prevT: changed ? prevT : [], fp,
    sc: { r, l: lotLabel(r), fo: origFmt(r), fs, st: o.scanSt || 'Validé' }, ano: o.ano ? o.ano.id : null,
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
  if (c.kind === 'already') {
    showScan(lotLabel(r), 'Déjà pointé', 'dup');
    showResult('dup', 'ⓘ LOT DÉJÀ POINTÉ', `${esc(lotLabel(r))} a été pointé à ${fmtT(ST.time[r])}${fmtCol >= 0 ? ` (format ${esc(opLbl(r))})` : ''}. Aucun double comptage. <button type="button" class="linkbtn" data-lot="${r}">Voir le lot</button>`);
    bindLotLinks($('#scanRes'));
    setResult(`<b>${esc(lotLabel(r))}</b> — déjà pointé`);
    addHist({ kind: 'scan', cmd: read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: opLbl(r), st: 'Déjà pointé' }, result: 'Déjà pointé' });
    renderRecent(); snd.already(); scrollToLot(r); return;
  }
  if (c.kind === 'mismatch') return openMismatch(c, read);
  // conforme
  const pend = ST.anomalies.find(a => a.st === 'attente' && a.row === r);
  if (pend) setAno(pend, 'resolue', 'Lot rescanné dans son format');
  scanApply(r, { scanSt: 'Validé', read, ano: pend || null });
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
      <h3 class="mmtitle">⚠ FORMAT DIFFÉRENT DU LISTING</h3>
      <div class="mmgrid">
        <span>Lot reconnu</span><b>OUI</b>
        ${idsHtml(r).replace('<div class="idgrid">', '').replace(/<\/div>$/, '')}
        <span>Format enregistré</span><b class="fmtbig">${esc(opLbl(r))}${c.corrected ? ` <small>(fichier : ${esc(origFmt(r))})</small>` : ''}</b>
        <span>Format de la séance</span><b class="fmtbig">${esc(sess)}</b>
      </div>
      <p class="hint">${readNote(c)} Ce lot est bien présent dans le listing, mais son format enregistré ne correspond pas au format pointé.</p>
      <div class="mmacts">
        <button class="mma ok" data-a="1"><kbd>1</kbd><span><b>C'est bien un ${esc(sess)}</b><small>Pointé dans ${esc(sess)}, format corrigé, origine gardée dans l'historique</small></span></button>
        <button class="mma" data-a="2"><kbd>2</kbd><span><b>Garder « ${esc(opLbl(r))} »</b><small>Pointé dans son format d'origine, anomalie à vérifier</small></span></button>
        <button class="mma" data-a="3"><kbd>3</kbd><span><b>Mettre en attente</b><small>Non pointé, à revoir dans les anomalies</small></span></button>
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
    const a = anoBase('format', r, { fs: x.sess, cmd: x.read });
    setAno(a, 'corrigee', `Format confirmé : ${x.sess} (listing : ${from})`);
    a.fk = sessionKey();
    scanApply(r, { fmt: x.sess, fs: x.sess, scanSt: 'Corrigé', read: x.read, ano: a });
    showScan(lotLabel(r), `Corrigé → ${x.sess}`, 'ok');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="ok">✓ format corrigé : ${esc(from)} → ${esc(x.sess)}</span>`);
    showResult('ok', '✓ FORMAT CORRIGÉ ET LOT POINTÉ', `${esc(lotLabel(r))} : ${esc(from)} → <b>${esc(x.sess)}</b>. Le format d'origine reste dans l'historique.`);
    snd.ok();
  } else if (n === 2) {
    const a = anoBase('format', r, { fs: x.sess, cmd: x.read });
    setAno(a, 'conservee', `Format d'origine « ${from} » conservé, constaté « ${x.sess} » : à vérifier`);
    scanApply(r, { fs: from, scanSt: 'Format conservé', read: x.read, ano: a });
    showScan(lotLabel(r), `Pointé (${from})`, 'ok');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="ok">✓ pointé</span> dans « ${esc(from)} », <span class="w">écart à vérifier</span>`);
    showResult('warn', '✓ POINTÉ DANS SON FORMAT D\'ORIGINE', `${esc(lotLabel(r))} est compté dans « ${esc(from)} », pas dans « ${esc(x.sess)} ». L'écart reste visible dans les anomalies.`);
  } else if (n === 3) {
    const a = anoBase('format', r, { fs: x.sess, cmd: x.read, st: 'attente', res: 'En attente de décision' });
    const h = addHist({ kind: 'hold', cmd: x.read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: x.sess, st: 'En attente' }, ano: a.id, result: 'Mis en attente' });
    persist({ ano: [a], hist: [h] }); refreshPending(); afterChange(false);
    showScan(lotLabel(r), 'En attente', 'bad warnfmt');
    setResult(`<b>${esc(lotLabel(r))}</b> — <span class="w">mis en attente</span>`);
    showResult('warn', '⏸ MIS EN ATTENTE', `${esc(lotLabel(r))} n'est pas pointé. Retrouvez-le dans « Anomalies » pour décider plus tard.`);
  } else {
    const h = addHist({ kind: 'scan', cmd: x.read, label: `${lotLabel(r)} (scan)`, rows: [], sc: { r, l: lotLabel(r), fo: origFmt(r), fs: x.sess, st: 'Scan annulé' }, result: 'Scan annulé' });
    persist({ hist: [h] }); renderRecent(); renderHist();
    showScan(lotLabel(r), 'Scan annulé', '');
    setResult(`<b>${esc(lotLabel(r))}</b> — scan annulé`);
    showResult('', 'Scan annulé', `${esc(lotLabel(r))} : rien n'a été pointé.`);
  }
}
// Pendant la fenêtre « format différent » : touches 1-4, ou un nouveau scan (rafale de chiffres) qui met le lot en attente
let mmBuf = '', mmTimer = null;
document.addEventListener('keydown', e => {
  if (!mismatchCtx || $('#modal').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault(); mmBuf += e.key; clearTimeout(mmTimer);
    mmTimer = setTimeout(() => { const b = mmBuf; mmBuf = ''; if (b.length === 1 && /[1-4]/.test(b)) mismatchAct(+b); }, 350);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (!mmBuf) return;
    e.preventDefault(); clearTimeout(mmTimer); const b = mmBuf; mmBuf = '';
    if (b.length === 1 && /[1-4]/.test(b)) { mismatchAct(+b); return; }
    mismatchAct(3); setTimeout(() => scanCode(fixScan(b), b), 0);
  } else if (e.key === 'Escape') { e.preventDefault(); mismatchAct(4); }
}, true);

/* ---------- Fiche d'un lot : détail, historique, correction du format ---------- */
function openLot(r) {
  const hs = HIST.filter(h => (h.rows || []).includes(r) || (h.sc && h.sc.r === r) || (h.fp && Object.prototype.hasOwnProperty.call(h.fp, r))).slice(-12).reverse();
  const an = ST.anomalies.filter(a => a.row === r).slice().reverse();
  const formats = fmtStatsCache.map(s => s.label);
  modal(`
    <h3>Lot ${esc(lotLabel(r))}</h3>
    ${idsHtml(r)}
    <div class="idgrid">
      ${fmtCol >= 0 ? `<span>Format d'origine (fichier)</span><b>${esc(origFmt(r))}</b><span>Format opérationnel</span><b>${esc(opLbl(r))}${ST.fmt[r] != null ? ' <span class="tag">corrigé</span>' : ''}</b>` : ''}
      ${qtyCol >= 0 ? `<span>Quantité</span><b class="num">${esc(DATA.rows[r][qtyCol])}</b>` : ''}
      <span>Pointage</span><b>${ST.status[r] ? 'Présent, pointé à ' + fmtT(ST.time[r]) : pendingRows.has(r) ? 'En attente' : 'Non pointé'}</b>
    </div>
    ${fmtCol >= 0 ? `<form class="fixfmt" id="lotFmt">
      <b>Corriger le format</b>
      <div class="grid2">
        <label>Nouveau format<select id="lfSel">${formats.map(f => `<option ${Formats.normFmt(f) === Formats.normFmt(opLbl(r)) ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__new">Autre format…</option></select></label>
        <label>Motif (facultatif)<input id="lfWhy" placeholder="ex. étiquette erronée"></label>
      </div>
      <input id="lfNew" placeholder="Nom du nouveau format" hidden>
      <div class="mrow" style="justify-content:flex-start">${ST.fmt[r] != null ? '<button type="button" class="btn" id="lfReset">Revenir au format d\'origine</button>' : ''}<button class="btn primary">Enregistrer le format</button></div>
    </form>` : ''}
    ${an.length ? `<b>Anomalies</b><div class="log">${an.map(a => `<div class="a"><time>${fmtT(a.t)}</time><b>${esc(a.kind)}</b> · ${esc(Formats.ST_LABEL[a.st] || 'Note')}${a.res ? '<br>' + esc(a.res) : ''}</div>`).join('')}</div>` : ''}
    <b>Historique du lot</b>
    <div class="log">${hs.length ? hs.map(h => `<div class="${h.undone ? 'u' : ''}"><time>${fmtDT(h.t)}</time><b>${esc(h.label)}</b>${h.result ? '<br>' + esc(h.result) : ''}</div>`).join('') : '<div>Aucune opération.</div>'}</div>
    <div class="mrow"><button class="btn" id="lotTog">${ST.status[r] ? 'Dépointer' : 'Pointer'}</button><button class="btn primary" id="lotClose">Fermer</button></div>`);
  $('#lotClose').onclick = closeModal;
  $('#lotTog').onclick = () => { closeModal(); toggleRow(r); };
  if (fmtCol >= 0) {
    $('#lfSel').onchange = e => { $('#lfNew').hidden = e.target.value !== '__new'; if (!$('#lfNew').hidden) $('#lfNew').focus(); };
    $('#lotFmt').onsubmit = e => {
      e.preventDefault();
      const v = $('#lfSel').value === '__new' ? $('#lfNew').value.trim() : $('#lfSel').value;
      if (!v) { toast('Indiquez le nom du format.'); return; }
      const why = $('#lfWhy').value.trim();
      closeModal(); reclassify(r, v, why);
    };
    if ($('#lfReset')) $('#lfReset').onclick = () => { closeModal(); reclassify(r, origFmt(r), 'Retour au format d\'origine'); };
  }
}
function reclassify(r, to, why) {
  const from = opLbl(r);
  if (Formats.normFmt(from) === Formats.normFmt(to)) { toast('Le lot est déjà dans ce format.'); return; }
  const fp = {}; fp[r] = ST.fmt[r] != null ? ST.fmt[r] : null;
  if (Formats.normFmt(to) === Formats.normFmt(origFmt(r))) delete ST.fmt[r]; else ST.fmt[r] = to;
  const a = anoBase('format', r, { fo: origFmt(r), fs: to, cmd: 'Correction manuelle' });
  setAno(a, 'corrigee', `Format : ${from} → ${to}${why ? ' · motif : ' + why : ''}`);
  // si le lot était en attente, la décision est prise
  ST.anomalies.forEach(x => { if (x !== a && x.row === r && x.st === 'attente') setAno(x, 'resolue', 'Format corrigé à la main'); });
  const h = addHist({ kind: 'reformat', cmd: 'Correction du format', label: `Format de ${lotLabel(r)} : ${from} → ${to}`, rows: [], fp, ano: a.id, result: why ? 'Motif : ' + why : '' });
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
    <div class="mrow"><button class="btn primary" id="afClose">Fermer</button></div>`);
  $('#modalBox').classList.add('wide');
  $('#afClose').onclick = closeModal;
  $('#afType').onchange = e => { anoFilter.type = e.target.value; openAnomalies(); };
  $('#afSt').onchange = e => { anoFilter.st = e.target.value; openAnomalies(); };
  $('#afFmt').onchange = e => { anoFilter.fmt = e.target.value; openAnomalies(); };
  $('#modalBox').querySelectorAll('[data-act]').forEach(b => b.onclick = () => anoAct(b.dataset.act, ST.anomalies[+b.dataset.i]));
}
function anoAct(act, a) {
  if (!a) return;
  const r = a.row;
  if (act === 'lot') { openLot(r); return; }
  if (act === 'solve') { setAno(a, 'resolue', a.res ? a.res + ' · marquée résolue' : 'Marquée résolue'); persist({ ano: [a] }); refreshPending(); afterChange(false); openAnomalies(); return; }
  if (act === 'confirm') {
    setAno(a, 'corrigee', `Format confirmé : ${a.fs} (listing : ${opLbl(r)})`); a.fk = Formats.normFmt(a.fs);
    scanApply(r, { fmt: a.fs, fs: a.fs, scanSt: 'Corrigé', read: 'Décision sur anomalie', ano: a });
  } else if (act === 'keep') {
    setAno(a, 'conservee', `Format d'origine « ${opLbl(r)} » conservé`);
    scanApply(r, { fs: opLbl(r), scanSt: 'Format conservé', read: 'Décision sur anomalie', ano: a });
  }
  refreshPending(); afterChange(false); openAnomalies();
}

/* ---------- Scans récents (séance) ---------- */
function renderRecent() {
  const box = $('#recentLog'); if (!box) return;
  const list = HIST.filter(h => h.sc).slice(-14).reverse();
  box.innerHTML = list.length ? `<table><thead><tr><th>Lot</th>${fmtCol >= 0 ? '<th>Format listing</th><th>Constaté</th>' : ''}<th>Statut</th></tr></thead><tbody>${list.map(h => `
    <tr class="${h.undone ? 'u' : ''} ${({ 'Validé': 'ok', 'Corrigé': 'ok', 'Format conservé': 'w', 'En attente': 'w', 'Déjà pointé': 'b', 'Inconnu': 'e', 'Scan annulé': '' })[h.sc.st] || ''}">
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
