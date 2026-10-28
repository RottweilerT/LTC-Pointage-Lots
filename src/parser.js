/* ===== Moteur de commandes vocales (pur, testable) ===== */
const Parser = (function () {
  const UNITS = { zero: 0, 'zéro': 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9 };
  const TEENS = { dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
  const TENS = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, quatrevingt: 80, quatrevingts: 80, huitante: 80, octante: 80, nonante: 90 };
  const BIG = { cent: 100, cents: 100, mille: 1000, mil: 1000, million: 1e6, millions: 1e6 };
  const isNumWord = w => w in UNITS || w in TEENS || w in TENS || w in BIG;

  const TO = new Set(['à', 'a', 'au', 'aux', 'jusqua', 'jusque', 'jusqu', 'jusquau']);
  const SEP_HARD = new Set(['puis', 'ensuite', 'après', 'apres', '.', ';', 'plus']);
  const SEP_SOFT = new Set([',', 'et']);
  const EXC = new Set(['sauf', 'excepté', 'excepte', 'hormis', 'sans']);
  const FROM = new Set(['du', 'de', 'des', 'depuis']);
  const FILLER = new Set(['lot', 'lots', 'le', 'la', 'les', 'l', 'numéro', 'numéros', 'numero', 'numeros', 'n°', 'no', 'num', 'd', 'euh', 'alors', 'donc', 'voilà', 'voila', 'aussi', 'celui', 'ci', 'là']);
  const CONTROL_WORDS = /\b(annule|annuler|annulez|retire|retirer|retirez|enlève|enleve|enlever|supprime|supprimer|décoche|decoche|décocher|répète|repete|répéter|pause|reprendre|reprends)\b/;

  function normalize(text) {
    let s = (text || '').normalize('NFC').toLowerCase();
    s = s.replace(/[’`´]/g, "'");
    // Variantes fréquentes de la dictée Android
    s = s.replace(/(^|[\s,.;])(?:l'eau|l eau|l'eaux|l'os|l'o|loto|lotte|lote|los|lo|lots|lot)\s*(?=\d)/g, '$1lot ');
    s = s.replace(/(^|\s)dû(?=\s)/g, '$1du');
    s = s.replace(/à partir (du|de|des)(?=\s)/g, '$1');
    s = s.replace(/(\d)\s*(?:au|aux|à)\s*(?=\d)/g, '$1 à ');
    s = s.replace(/(\d)\s+(?:o|oh|ho|ô|haut|hauts|a|ah|tiret|jusqu'à|jusqu'au)\s+(?=(?:lot\s*)?\d)/g, '$1 à ');
    s = s.replace(/(\d)[  ](?=\d{3}\b)/g, '$1'); // espace insécable = séparateur de milliers
    s = s.replace(/jusqu'?\s*au(?![a-zà-ÿ])/g, ' jusquau ').replace(/jusqu'?\s*(à|a)(?![a-zà-ÿ])/g, ' jusqua ').replace(/jusque(?![a-zà-ÿ])/g, ' jusqua ');
    s = s.replace(/(\d)\s*(?:-|–|—)\s*(\d)/g, '$1 à $2');
    s = s.replace(/(\d+)\s*(?:e|è|ème|eme|er)\b/g, '$1');
    s = s.replace(/n°\s*/g, ' ');
    s = s.replace(/([a-zà-ÿ])['](?=\S)/g, '$1 ');
    s = s.replace(/[-–—]/g, ' ');
    s = s.replace(/\bquatre\s+vingts?\b/g, 'quatrevingt');
    s = s.replace(/([,.;:!?])/g, ' $1 ');
    s = s.replace(/[:!?]/g, ' . ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Convertit une suite de mots-nombres en un ou plusieurs nombres
  function wordsToNumbers(words) {
    const out = [];
    let total = 0, g = 0, any = false, single = true, wordsCount = 0;
    const flush = () => { if (any) out.push({ v: total + g, single: single && wordsCount === 1 && (total + g) < 10 }); total = 0; g = 0; any = false; single = true; wordsCount = 0; };
    for (const w of words) {
      if (w in UNITS || w in TEENS || w in TENS) {
        const v = UNITS[w] ?? TEENS[w] ?? TENS[w];
        const r = g % 100;
        let legal;
        if (!any) legal = true;
        else if (g === 0 && total === 0) legal = false;            // "zéro" suivi d'un autre mot
        else if (r === 0) legal = true;                            // après cent / mille
        else if (r === 10) legal = v >= 7 && v <= 9;               // dix-sept, dix-huit, dix-neuf
        else if (r % 10 === 0 && v >= 1 && v <= 9) legal = true;   // vingt-deux, soixante-dix-sept
        else if ((r === 60 || r === 80) && v >= 10 && v <= 16) legal = true; // soixante-dix, quatre-vingt-onze
        else legal = false;
        if (!legal) flush();
        g += v;
        any = true; wordsCount++;
      } else if (w === 'cent' || w === 'cents') {
        if (g >= 10 || (g === 0 && total === 0 && any)) flush();
        g = (g === 0 ? 1 : g) * 100; any = true; wordsCount++;
      } else if (w === 'mille' || w === 'mil') {
        if (total >= 1000 && total % 1e6 !== 0) flush();
        total += (g === 0 ? 1 : g) * 1000; g = 0; any = true; wordsCount++;
      } else if (w === 'million' || w === 'millions') {
        if (total >= 1e6) flush();
        total += (g === 0 ? 1 : g) * 1e6; g = 0; any = true; wordsCount++;
      }
    }
    flush();
    return out;
  }

  // Texte normalisé -> liste de jetons de base
  function lex(norm) {
    const raw = norm.split(' ').filter(Boolean);
    const toks = [];
    let i = 0;
    while (i < raw.length) {
      const w = raw[i];
      if (/^\d+$/.test(w)) {
        toks.push({ t: 'n', v: Number(w), s: w, single: w.length === 1, gapBefore: true });
        i++; continue;
      }
      if (isNumWord(w)) {
        const run = [];
        while (i < raw.length) {
          const x = raw[i];
          if (isNumWord(x)) { run.push(x); i++; continue; }
          if (x === 'et' && run.length && (TENS[run[run.length - 1]] || 0) && raw[i + 1] && /^(un|une|onze)$/.test(raw[i + 1])) { i++; continue; }
          break;
        }
        for (const n of wordsToNumbers(run)) toks.push({ t: 'n', v: n.v, s: String(n.v), single: n.single, word: true });
        continue;
      }
      if (TO.has(w)) toks.push({ t: 'to' });
      else if (EXC.has(w)) toks.push({ t: 'exc' });
      else if (FROM.has(w)) toks.push({ t: 'from' });
      else if (w === 'entre') toks.push({ t: 'between' });
      else if (SEP_HARD.has(w)) toks.push({ t: 'sep', hard: true });
      else if (SEP_SOFT.has(w)) toks.push({ t: 'sep', hard: false, et: w === 'et' });
      else if (FILLER.has(w)) { /* ignoré */ }
      else toks.push({ t: 'unk', w });
      i++;
    }
    return toks;
  }

  // Produit les interprétations possibles (chiffre par chiffre, milliers séparés par espace)
  function variants(toks) {
    let list = [[]];
    const push = (alts) => {
      const next = [];
      for (const v of list) for (const a of alts) next.push(v.concat(a));
      list = next.slice(0, 16);
    };
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.t === 'n') {
        // suite de chiffres isolés : 1 2 5 -> 125 ?
        let j = i;
        while (j < toks.length && toks[j].t === 'n' && toks[j].single) j++;
        if (j - i >= 2) {
          const run = toks.slice(i, j);
          const joined = { t: 'n', v: Number(run.map(x => x.s).join('')), s: run.map(x => x.s).join(''), how: 'chiffre par chiffre' };
          push([[joined], run]);
          i = j; continue;
        }
        // "6 530" : milliers séparés par un espace
        const n2 = toks[i + 1];
        if (n2 && n2.t === 'n' && !t.word && !n2.word && t.s.length <= 3 && n2.s.length === 3 && t.v > 0) {
          const joined = { t: 'n', v: Number(t.s + n2.s), s: t.s + n2.s, how: 'milliers' };
          push([[t, n2], [joined]]);
          i += 2; continue;
        }
        push([[t]]); i++; continue;
      }
      push([[t]]); i++;
    }
    return list;
  }

  // Jetons -> plan d'action
  function grammar(toks) {
    const plan = { items: [], except: [], warnings: [] };
    // "entre X et Y" -> X à Y
    toks = toks.slice();
    for (let k = 0; k < toks.length; k++) {
      if (toks[k].t === 'between' && toks[k + 1]?.t === 'n' && toks[k + 2]?.t === 'sep' && toks[k + 2].et && toks[k + 3]?.t === 'n') toks[k + 2] = { t: 'to' };
    }
    let exc = false;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'from' || t.t === 'between') { exc = false; continue; }
      if (t.t === 'sep') { if (t.hard) exc = false; continue; }
      if (t.t === 'exc') { exc = true; continue; }
      if (t.t === 'unk') { plan.unknown = (plan.unknown || 0) + 1; continue; }
      if (t.t === 'to') { plan.warnings.push('Plage incomplète'); continue; }
      if (t.t === 'n') {
        let item;
        const afterFrom = toks[k - 1]?.t === 'from';
        if (afterFrom && toks[k + 1]?.t === 'n' && toks[k + 2]?.t !== 'to' && toks[k + 1].v > t.v) {
          item = { kind: 'range', a: t.v, b: toks[k + 1].v };
          plan.warnings.push('« au » non entendu entre ' + t.v + ' et ' + toks[k + 1].v);
          k += 1;
        } else if (toks[k + 1]?.t === 'to' && toks[k + 2]?.t === 'n') {
          let a = t.v, b = toks[k + 2].v;
          if (a > b) { [a, b] = [b, a]; plan.warnings.push(`Plage inversée (${b} → ${a})`); }
          item = { kind: 'range', a, b };
          k += 2;
        } else item = { kind: 'single', n: t.v };
        (exc ? plan.except : plan.items).push(item);
      }
    }
    return plan;
  }

  function planKey(p) {
    const f = it => it.kind === 'range' ? `${it.a}-${it.b}` : `${it.n}`;
    return p.mode + ':' + p.items.map(f).join(',') + '|' + p.except.map(f).join(',');
  }

  function describePlan(p) {
    const f = it => it.kind === 'range' ? `${it.a} → ${it.b}` : `${it.n}`;
    let s = p.items.map(f).join(', ');
    if (p.except.length) s += ` sauf ${p.except.map(f).join(', ')}`;
    return (p.mode === 'uncheck' ? 'Retirer ' : '') + s;
  }

  // Analyse complète d'une phrase -> {type:'control'|'plans'|'empty', ...}
  function analyze(text) {
    const norm = normalize(text);
    const words = norm.split(' ');
    const first = words[0] || '';
    let mode = 'check', rest = norm;
    if (/^(annule|annuler|annulez|annulation)$/.test(first)) {
      const hasNum = lex(words.slice(1).join(' ')).some(t => t.t === 'n');
      if (!hasNum) return { type: 'control', cmd: 'undo', norm };
      mode = 'uncheck'; rest = words.slice(1).join(' ');
    } else if (/^(retire|retirer|retirez|enlève|enleve|enlever|enlevez|supprime|supprimer|supprimez|décoche|decoche|décocher|decocher)$/.test(first)) {
      mode = 'uncheck'; rest = words.slice(1).join(' ');
    } else if (/^(répète|repete|répéter|repeter|rappelle|rappelle-moi|redis|redit)$/.test(first) || /^(quelle est la dernière|c'est quoi la dernière)/.test(norm)) {
      return { type: 'control', cmd: 'repeat', norm };
    } else if (/^(pause|stop|arrête|arrete|suspends|suspendre)$/.test(first) && words.length <= 4) {
      return { type: 'control', cmd: 'pause', norm };
    } else if (/^(reprendre|reprends|reprend|reprenez|continue|continuer|continuez)$/.test(first) && words.length <= 4) {
      return { type: 'control', cmd: 'resume', norm };
    }
    const toks = lex(rest);
    const vs = variants(toks);
    const seen = new Set();
    const plans = [];
    for (const v of vs) {
      const p = grammar(v);
      p.mode = mode;
      if (!p.items.length) continue;
      if (mode === 'check' && CONTROL_WORDS.test(rest)) p.warnings.push('Mot de commande au milieu de la phrase');
      if (/\b(choix|oui|non|premier|deuxième|ok|valide)\b/.test(rest)) p.warnings.push('Réponse de confirmation alors qu\'aucune question n\'est posée');
      const k = planKey(p);
      if (seen.has(k)) continue;
      seen.add(k); p.key = k; p.label = describePlan(p);
      plans.push(p);
    }
    if (!plans.length) return { type: 'empty', norm };
    return { type: 'plans', plans, norm };
  }

  // Phrase coupée au milieu d'une plage (« du 54 », « du 54 au », « … sauf ») : attendre la suite
  function isIncomplete(text) {
    const toks = lex(normalize(text)).filter(t => t.t !== 'unk');
    if (!toks.length) return false;
    const last = toks[toks.length - 1];
    if (last.t === 'to' || last.t === 'from' || last.t === 'exc' || last.t === 'between') return true;
    if (last.t === 'sep') return toks.some(t => t.t === 'n');
    if (last.t === 'n') { const prev = toks[toks.length - 2]; if (prev && (prev.t === 'from' || prev.t === 'between')) return true; }
    return false;
  }

  return { normalize, wordsToNumbers, lex, variants, grammar, analyze, describePlan, planKey, isIncomplete };
})();

/* ===== Index des lots de référence ===== */
function buildIndex(lotStrings) {
  const map = new Map();          // valeur numérique -> [index de ligne]
  const byText = new Map();       // texte exact -> [index]
  for (let i = 0; i < lotStrings.length; i++) {
    const s = String(lotStrings[i] ?? '').trim();
    if (!byText.has(s)) byText.set(s, []);
    byText.get(s).push(i);
    const groups = s.match(/\d+/g);
    if (groups && groups.length === 1) {
      const v = Number(groups[0]);
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(i);
    }
  }
  const values = Array.from(map.keys()).sort((a, b) => a - b);
  const dupRows = new Set();
  for (const rows of byText.values()) if (rows.length > 1) rows.forEach(r => dupRows.add(r));
  for (const rows of map.values()) if (rows.length > 1) rows.forEach(r => dupRows.add(r));
  function lower(x) { let lo = 0, hi = values.length; while (lo < hi) { const m = (lo + hi) >> 1; if (values[m] < x) lo = m + 1; else hi = m; } return lo; }
  function valuesIn(a, b) { const out = []; for (let k = lower(a); k < values.length && values[k] <= b; k++) out.push(values[k]); return out; }
  const texts = lotStrings.map(x => String(x ?? '').trim());
  return { map, byText, values, dupRows, valuesIn, texts, has: v => map.has(v) };
}

// Index sur deux colonnes de numéros (ex. code à 6 chiffres + n° de lot à 5 chiffres) :
// un lot peut être pointé par l'un ou l'autre de ses numéros.
function buildMultiIndex(primary, secondary, names) {
  const parts = [buildIndex(primary)];
  if (secondary) parts.push(buildIndex(secondary));
  const dupRows = new Set();
  parts.forEach(p => p.dupRows.forEach(r => dupRows.add(r)));
  const P = parts[0];
  return { multi: true, parts, names: names || [], dupRows, map: P.map, byText: P.byText, values: P.values, valuesIn: P.valuesIn, has: P.has };
}
const partsOf = idx => idx.parts || [idx];

// Lignes trouvées pour un texte tapé ou scanné, dans chaque colonne de numéros
function lookupRows(idx, text) {
  const t = String(text || '').trim();
  let found = [];
  // d'abord l'écriture exacte (zéros initiaux compris), sinon la valeur du nombre
  partsOf(idx).forEach((p, i) => { const rows = p.byText.get(t); if (rows && rows.length) found.push({ part: i, rows }); });
  if (!found.length && /^\d+$/.test(t)) partsOf(idx).forEach((p, i) => { const rows = p.map.get(Number(t)); if (rows && rows.length) found.push({ part: i, rows }); });
  const same = found.length > 1 && found.every(f => f.rows.join() === found[0].rows.join());
  return { found: same ? [found[0]] : found };
}

// Résout un plan sur l'index : lignes concernées et anomalies.
// force = n° de colonne à utiliser seule (sinon chaque numéro est cherché dans toutes les colonnes).
function resolvePlan(plan, idx, force) {
  const parts = partsOf(idx);
  const use = force == null ? parts.map((_, i) => i) : [force];
  const hits = it => {
    let out = [];
    for (const i of use) {
      const P = parts[i];
      const rs = it.kind === 'single' ? (P.map.get(it.n) || []) : P.valuesIn(it.a, it.b).flatMap(v => P.map.get(v));
      // écriture « normale » du nombre (sans zéro devant) : 20010 et non 020010
      const exact = rs.filter(r => P.texts && /^\d+$/.test(P.texts[r]) && String(Number(P.texts[r])) === P.texts[r]);
      if (rs.length) out.push({ part: i, rows: rs, exact });
    }
    // si une colonne contient le numéro écrit tel quel, on ignore les correspondances avec zéros devant dans l'autre
    if (out.length > 1 && out.some(h => h.exact.length)) out = out.filter(h => h.exact.length).map(h => ({ part: h.part, rows: h.exact }));
    return out;
  };
  const exclude = new Set();
  for (const e of plan.except) hits(e).forEach(h => h.rows.forEach(r => exclude.add(r)));
  const rows = new Set(), missing = [], emptyRanges = [], ambiguous = [];
  let rangeLots = 0;
  for (const it of plan.items) {
    const h = hits(it);
    if (!h.length) { if (it.kind === 'single') missing.push(it.n); else emptyRanges.push(it); continue; }
    if (h.length > 1 && !h.every(x => x.rows.slice().sort().join() === h[0].rows.slice().sort().join())) ambiguous.push(it);
    let n = 0;
    h.forEach(x => x.rows.forEach(r => { if (!exclude.has(r)) { rows.add(r); n++; } }));
    if (it.kind === 'range') { rangeLots += n; if (!n) emptyRanges.push(it); }
  }
  return { rows: Array.from(rows).sort((a, b) => a - b), missing, emptyRanges, ambiguous, rangeLots, force: force ?? null,
    complete: !missing.length && !emptyRanges.length };
}

// Choix de l'interprétation : auto, ou confirmation
function decide(results, idx, opts) {
  opts = opts || {};
  const maxAuto = opts.maxAuto ?? 400;
  const cands = [];
  results.forEach((res, ai) => {
    if (res.type !== 'plans') return;
    res.plans.forEach(p => { if (!cands.some(c => c.plan.key === p.key)) cands.push({ plan: p, primary: ai === 0, r: resolvePlan(p, idx) }); });
  });
  if (!cands.length) return { action: 'none' };
  const prim = cands.filter(c => c.primary);
  const primFull = prim.filter(c => c.r.complete);
  let chosen = null, reason = '';
  if (primFull.length === 1) chosen = primFull[0];
  else if (primFull.length > 1) reason = 'Plusieurs interprétations possibles';
  else {
    const altFull = cands.filter(c => !c.primary && c.r.complete);
    if (altFull.length) reason = 'Numéro introuvable, une autre transcription correspond';
    else if (prim.length === 1) chosen = prim[0];
    else reason = 'Plusieurs interprétations possibles';
  }
  if (chosen && chosen.r.ambiguous.length) {
    // le numéro existe dans les deux colonnes, pour des lots différents : demander laquelle
    const names = idx.names || [];
    const per = partsOf(idx).map((_, i) => ({ plan: chosen.plan, primary: true, via: names[i] || ('colonne ' + (i + 1)), r: resolvePlan(chosen.plan, idx, i) })).filter(c => c.r.rows.length);
    const f = chosen.r.ambiguous[0];
    return { action: 'confirm', reason: `${f.kind === 'single' ? 'Le numéro ' + f.n : 'La plage ' + f.a + ' → ' + f.b} existe dans les deux colonnes de numéros : laquelle ?`, cands: per };
  }
  if (chosen) {
    if (chosen.plan.warnings.length) reason = chosen.plan.warnings.join(' · ');
    else if (chosen.r.rows.length > maxAuto) reason = `${chosen.r.rows.length} lots concernés, au-delà du seuil de ${maxAuto}`;
    else if (opts.manual) reason = 'Validation manuelle activée';
    if (!reason) return { action: 'apply', cand: chosen };
  }
  let list = primFull.length > 1 ? primFull : (chosen ? [chosen] : cands);
  list = list.slice().sort((a, b) => (b.r.complete - a.r.complete) || (b.primary - a.primary));
  return { action: 'confirm', reason, cands: list.slice(0, 4) };
}

if (typeof module !== 'undefined') module.exports = { Parser, buildIndex, buildMultiIndex, lookupRows, resolvePlan, decide };
