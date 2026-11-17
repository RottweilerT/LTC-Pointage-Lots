// Tests des règles de pointage par format (scénarios 1 à 10 du cahier des charges, au niveau des règles)
const assert = require('assert');
const { buildMultiIndex, lookupRows } = require('../src/parser.js');
const { Formats } = require('../src/formats.js');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('ÉCHEC', name, '\n  ', e.message); } }

// Vente A : n° à 5 chiffres, n° à 6 chiffres, format, quantité
function sale(rows) {
  const lots = rows.map(r => r[0]), alt = rows.map(r => r[1]);
  const idx = buildMultiIndex(lots, alt, ['N° lot', 'idlot']);
  const status = new Uint8Array(rows.length), corr = {}, pending = new Set();
  const model = { n: rows.length, orig: r => rows[r][2], qty: r => Formats.qtyOf(rows[r][3]), status: r => status[r], corr, pending };
  return { rows, idx, status, corr, pending, model, scan: (txt, session) => Formats.classify(txt, { lookup: v => lookupRows(idx, v), model, session: session ? Formats.normFmt(session) : null }) };
}
const A = sale([
  ['40000', '165903', 'Album', '3'],
  ['40001', '165904', 'Single lot', '1'],
  ['40002', '165905', 'ALBUMS', '1'],
  ['40003', '165906', 'Single lot', '2'],
  ['40004', '165907', 'B8', ''],
]);

t('normalisation : Album = ALBUM = albums', () => { assert.strictEqual(Formats.normFmt('Album'), Formats.normFmt('ALBUMS')); assert.strictEqual(Formats.normFmt(' albums '), 'album'); assert.strictEqual(Formats.normFmt('Single-Lots'), 'single lot'); assert.strictEqual(Formats.normFmt('SF'), 'sf'); });
t('formats détectés dynamiquement', () => { const s = Formats.stats(A.model, []); assert.deepStrictEqual(s.map(x => x.label).sort(), ['Album', 'B8', 'Single lot']); assert.strictEqual(s.find(x => x.key === 'album').lots, 2); });
t('quantités : unités attendues', () => { const s = Formats.stats(A.model, []); assert.strictEqual(s.find(x => x.key === 'album').units, 4); assert.strictEqual(s.find(x => x.key === 'b8').units, 1); });

// Test 1 — scan conforme
t('1. scan conforme', () => { const r = A.scan('165903', 'Album'); assert.strictEqual(r.kind, 'ok'); assert.strictEqual(r.row, 0); });
t('1. scan conforme par le n° à 5 chiffres', () => { const r = A.scan('40002', 'album'); assert.strictEqual(r.kind, 'ok'); assert.strictEqual(r.verified, 1); });
// Test 2 — mauvais format d'origine
t('2. mauvais format : lot reconnu, anomalie de format', () => { const r = A.scan('165904', 'Album'); assert.strictEqual(r.kind, 'mismatch'); assert.strictEqual(r.row, 1); assert.strictEqual(r.fmtListing, 'Single lot'); });
t('2. confirmer Album : compteurs déplacés, origine conservée', () => {
  A.corr[1] = 'Album'; A.status[1] = 1;
  const s = Formats.stats(A.model, []);
  const al = s.find(x => x.key === 'album'), sl = s.find(x => x.key === 'single lot');
  assert.strictEqual(al.lots, 3); assert.strictEqual(al.done, 1); assert.strictEqual(sl.lots, 1); assert.strictEqual(sl.left, 1);
  assert.strictEqual(A.model.orig(1), 'Single lot'); assert.strictEqual(Formats.opLabel(A.model, 1), 'Album');
  assert.strictEqual(Formats.totals(A.model, []).corrections, 1);
});
// Test 3 — lot inconnu
t('3. lot inconnu', () => assert.strictEqual(A.scan('999999', 'Album').kind, 'unknown'));
// Test 4 — double scan
t('4. double scan : déjà pointé, aucun double comptage', () => { assert.strictEqual(A.scan('165904', 'Album').kind, 'already'); assert.strictEqual(Formats.totals(A.model, []).done, 1); });
// Test 5 — identifiants contradictoires
t('5. deux numéros de deux lots différents : conflit', () => assert.strictEqual(A.scan('40000 165906', 'Album').kind, 'conflict'));
t('5. deux numéros du même lot : vérifiés', () => { const r = A.scan('40003 165906', 'Single lot'); assert.strictEqual(r.kind, 'ok'); assert.strictEqual(r.verified, 2); });
t('5. un numéro introuvable avec un numéro valide : conflit', () => assert.strictEqual(A.scan('40000 123456').kind, 'conflict'));
// Test 6 — quantité supérieure à 1 (simple information : un scan rend le lot complet)
t('6. quantité 3 : un scan suffit, 3 unités pointées', () => { A.status[0] = 1; const s = Formats.stats(A.model, []).find(x => x.key === 'album'); assert.strictEqual(s.unitsDone, 3 + 1); assert.strictEqual(Formats.totals(A.model, []).unitsDone, 3 + 1); A.status[0] = 0; });
// Test 7 — plusieurs ventes avec les mêmes numéros
t('7. deux ventes, mêmes numéros : chaque scan dans sa vente', () => {
  const B = sale([['40000', '165903', 'Single lot', '1']]);
  assert.strictEqual(B.scan('165903', 'Single lot').kind, 'ok');
  B.status[0] = 1;
  assert.strictEqual(A.scan('165903', 'Album').kind, 'ok');
});
// Test 10 — reclassement : aucun lot créé ni perdu
t('10. reclassement : total constant', () => {
  const before = Formats.stats(A.model, []).reduce((n, s) => n + s.lots, 0);
  A.corr[3] = 'Album';
  const after = Formats.stats(A.model, []);
  assert.strictEqual(after.reduce((n, s) => n + s.lots, 0), before);
  assert.strictEqual(after.find(x => x.key === 'single lot').lots, 0); assert.strictEqual(after.find(x => x.key === 'single lot').corrOut, 2);
  delete A.corr[3];
});
t('anomalies ouvertes comptées par format', () => {
  const an = [{ st: 'ouverte', row: 4 }, { st: 'corrigee', row: 1 }, { st: 'attente', row: 3, fk: 'album' }, { kind: 'ancienne note' }];
  const s = Formats.stats(A.model, an);
  assert.strictEqual(s.find(x => x.key === 'b8').anomalies, 1); assert.strictEqual(s.find(x => x.key === 'album').anomalies, 1);
  assert.strictEqual(Formats.totals(A.model, an).open, 2);
});
// Test 9 — réimport : rapprochement sans duplication
t('9. réimport : nouveaux, modifiés, retirés', () => {
  const old = { lots: ['1', '2', '3'], alt: ['11', '12', '13'], rows: [['1', '11', 'Album', '1'], ['2', '12', 'SF', '1'], ['3', '13', 'SF', '1']] };
  const neu = { lots: ['2', '1', '4', ''], alt: ['12', '11', '14', '13'], rows: [['2', '12', 'SF', '1'], ['1', '11', 'Album', '2'], ['4', '14', 'GF', '1'], ['', '13', 'SF', '1']] };
  const d = Formats.diffListing(old, neu);
  assert.deepStrictEqual(d.added, [2]); assert.deepStrictEqual(d.changed.map(c => [c.i, c.j, c.cols]), [[0, 1, [3]], [2, 3, [0]]]);
  assert.deepStrictEqual(d.same.map(c => c.i), [1]); assert.deepStrictEqual(d.removed, []);
});
t('9. réimport : lot retiré du listing détecté', () => {
  const d = Formats.diffListing({ lots: ['1', '2'], alt: ['', ''], rows: [['1'], ['2']] }, { lots: ['2'], alt: [''], rows: [['2']] });
  assert.deepStrictEqual(d.removed, [0]);
});
t('rapport d\'import', () => {
  const rep = Formats.importReport([['1', '11', 'Album', '1'], ['1', '12', '', 'x'], ['', '', '', ''], ['', '14', 'SF', '1'], ['A5', '15', 'SF', '0']], { lot: 0, alt: 1, fmt: 2, qty: 3 });
  assert.strictEqual(rep.byType['Doublon'], 1); assert.strictEqual(rep.byType['Format manquant'], 1); assert.strictEqual(rep.byType['Quantité manquante ou invalide'], 2);
  assert.strictEqual(rep.byType['Numéro principal manquant'], 1); assert.strictEqual(rep.byType['Numéro non numérique'], 1);
});

console.log(`${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
