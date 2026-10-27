const assert = require('assert');
const { Parser, buildIndex, resolvePlan, decide } = require('../src/parser.js');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('ÉCHEC', name, '\n  ', e.message); } }

// Référence : 1..3000 avec des trous (pas de 155, pas de 70-74), plus quelques doublons
const lots = [];
for (let n = 1; n <= 3000; n++) { if (n === 155 || (n >= 70 && n <= 74)) continue; lots.push(String(n)); }
lots.push('0076'); // doublon de 76 avec zéros initiaux
const idx = buildIndex(lots);

const nums = s => { const r = Parser.analyze(s); return r.plans ? r.plans[0] : r; };
const lbl = s => { const r = Parser.analyze(s); return r.plans ? r.plans.map(p => p.label) : r.type; };
const dec = (s, o) => decide([Parser.analyze(s)], idx, o);
const rowsOf = d => d.cand.r.rows.map(i => lots[i]);

// --- nombres en lettres
t('mille deux cent cinquante', () => assert.deepStrictEqual(Parser.wordsToNumbers('mille deux cent cinquante'.split(' ')).map(x => x.v), [1250]));
t('six mille cinq cent trente', () => assert.deepStrictEqual(Parser.wordsToNumbers('six mille cinq cent trente'.split(' ')).map(x => x.v), [6530]));
t('soixante-dix-neuf', () => assert.deepStrictEqual(lbl('soixante-dix-neuf'), ['79']));
t('quatre-vingt-dix-neuf', () => assert.deepStrictEqual(lbl('quatre-vingt-dix-neuf'), ['99']));
t('quatre-vingts', () => assert.deepStrictEqual(lbl('quatre-vingts'), ['80']));
t('vingt et un', () => assert.deepStrictEqual(lbl('vingt et un'), ['21']));
t('soixante et onze', () => assert.deepStrictEqual(lbl('soixante et onze'), ['71']));
t('dix-sept', () => assert.deepStrictEqual(lbl('dix-sept'), ['17']));
t('cent vingt-cinq cent vingt-six', () => assert.deepStrictEqual(lbl('cent vingt-cinq cent vingt-six'), ['125, 126']));
t('deux mille vingt-six', () => assert.deepStrictEqual(lbl('deux mille vingt-six'), ['2026']));
t('septante-deux (belge)', () => assert.deepStrictEqual(lbl('septante-deux'), ['72']));

// --- numéros individuels
t('Lot 76', () => assert.deepStrictEqual(lbl('Lot 76'), ['76']));
t('79', () => assert.deepStrictEqual(lbl('79'), ['79']));
t('Lot 6530', () => assert.deepStrictEqual(lbl('Lot 6530'), ['6530']));
t('Le 125, le 126 et le 130', () => assert.deepStrictEqual(lbl('Le 125, le 126 et le 130'), ['125, 126, 130']));
t('100, 101, 102, 105', () => assert.deepStrictEqual(lbl('100, 101, 102, 105'), ['100, 101, 102, 105']));
t('Lot 100 puis lot 108', () => assert.deepStrictEqual(lbl('Lot 100 puis lot 108'), ['100, 108']));
t('numéro 12', () => assert.deepStrictEqual(lbl('numéro 12'), ['12']));
t('lot n° 12', () => assert.deepStrictEqual(lbl('lot n° 12'), ['12']));

// --- plages
t('Du lot 54 au lot 69', () => assert.deepStrictEqual(lbl('Du lot 54 au lot 69'), ['54 → 69']));
t('Du lot 6530 au lot 6656', () => assert.deepStrictEqual(lbl('Du lot 6530 au lot 6656'), ['6530 → 6656']));
t('De 100 à 150', () => assert.deepStrictEqual(lbl('De 100 à 150'), ['100 → 150']));
t('Les lots 100 à 150', () => assert.deepStrictEqual(lbl('Les lots 100 à 150'), ['100 → 150']));
t("100 jusqu'à 150", () => assert.deepStrictEqual(lbl("100 jusqu'à 150"), ['100 → 150']));
t('100 jusqu’au 150 (apostrophe typographique)', () => assert.deepStrictEqual(lbl('100 jusqu’au 150'), ['100 → 150']));
t('100-150', () => assert.deepStrictEqual(lbl('100-150'), ['100 → 150']));
t('entre 10 et 20', () => assert.deepStrictEqual(lbl('entre 10 et 20'), ['10 → 20']));
t('du cinquante-quatre au soixante-neuf', () => assert.deepStrictEqual(lbl('du cinquante-quatre au soixante-neuf'), ['54 → 69']));
t('plage inversée', () => { const p = nums('du 69 au 54'); assert.strictEqual(p.label, '54 → 69'); assert.ok(p.warnings.length); });

// --- sauf
t('Du 200 au 250, sauf le 225', () => assert.deepStrictEqual(lbl('Du 200 au 250, sauf le 225'), ['200 → 250 sauf 225']));
t('sauf plusieurs', () => assert.deepStrictEqual(lbl('du 200 au 250 sauf le 225 et le 230 puis le 300'), ['200 → 250, 300 sauf 225, 230']));
t('sauf -> pointage effectif', () => { const d = dec('Du 200 au 250, sauf le 225'); assert.strictEqual(d.action, 'apply'); const r = rowsOf(d); assert.strictEqual(r.length, 50); assert.ok(!r.includes('225')); });

// --- commandes mixtes
t('mixte complet', () => assert.deepStrictEqual(lbl('Du lot 54 au lot 69, ensuite le lot 76, ensuite le lot 79, ensuite du lot 80 au lot 100.'), ['54 → 69, 76, 79, 80 → 100']));
t('mixte -> lignes', () => {
  const d = dec('Du lot 54 au lot 69, ensuite le lot 76, ensuite le lot 79, ensuite du lot 80 au lot 100.');
  assert.strictEqual(d.action, 'apply');
  // 16 (54-69) + 76 en double (76 et 0076) + 79 + 21 (80-100)
  assert.strictEqual(d.cand.r.rows.length, 16 + 2 + 1 + 21);
});

// --- plages avec trous : pas d'anomalie par entier manquant
t('plage avec trous', () => { const d = dec('du 60 au 80'); assert.strictEqual(d.action, 'apply'); assert.strictEqual(d.cand.r.rows.length, 21 - 5 + 1); assert.deepStrictEqual(d.cand.r.missing, []); });
t('plage entièrement vide', () => { const r = resolvePlan(nums('du 70 au 74'), idx); assert.strictEqual(r.emptyRanges.length, 1); });

// --- inexistants
t('lot 155 inexistant', () => { const d = dec('Lot 155'); assert.strictEqual(d.action, 'apply'); assert.deepStrictEqual(d.cand.r.missing, [155]); });
t('jamais de création de lot', () => { const d = dec('du 2990 au 3100'); assert.strictEqual(d.cand.r.rows.length, 11); });

// --- doublons dans le fichier
t('doublons détectés', () => { assert.ok(idx.dupRows.has(lots.indexOf('76'))); assert.ok(idx.dupRows.has(lots.indexOf('0076'))); });
t('zéros initiaux conservés', () => assert.strictEqual(lots[idx.map.get(76)[1]], '0076'));

// --- chiffre par chiffre et ambiguïtés
t('un deux cinq -> 2 interprétations', () => assert.deepStrictEqual(lbl('un deux cinq'), ['125', '1, 2, 5']));
t('un deux cinq -> confirmation', () => assert.strictEqual(dec('un deux cinq').action, 'confirm'));
t('un cinq cinq -> 155 absent, 1,5,5 présents', () => { const d = dec('un cinq cinq'); assert.strictEqual(d.action, 'apply'); assert.strictEqual(d.cand.plan.label, '1, 5, 5'); });
t('6 530 (espace simple)', () => assert.deepStrictEqual(lbl('lot 6 530'), ['6, 530', '6530']));
t('6 530 -> 6530 absent, 6 et 530 présents -> auto', () => { const d = dec('lot 2 530'); assert.strictEqual(d.action, 'confirm'); });
t('6 530 (insécable)', () => assert.deepStrictEqual(lbl('lot 6 530'), ['6530']));
t('alternative de transcription', () => {
  const d = decide([Parser.analyze('lot 155'), Parser.analyze('lot 165')], idx);
  assert.strictEqual(d.action, 'confirm');
});
t('grande plage -> confirmation', () => assert.strictEqual(dec('du 1 au 2000').action, 'confirm'));
t('plage incomplète -> confirmation', () => assert.strictEqual(dec('du 54 au').action, 'confirm'));
t('validation manuelle', () => assert.strictEqual(dec('lot 76', { manual: true }).action, 'confirm'));

// --- commandes de contrôle
t('annule la dernière action', () => assert.strictEqual(Parser.analyze('Annule la dernière action').cmd, 'undo'));
t('annuler', () => assert.strictEqual(Parser.analyze('annuler').cmd, 'undo'));
t('retire le lot 125', () => { const p = nums('Retire le lot 125'); assert.strictEqual(p.mode, 'uncheck'); assert.strictEqual(p.label, 'Retirer 125'); });
t('retire les lots de 200 à 220', () => { const p = nums('Retire les lots de 200 à 220'); assert.strictEqual(p.mode, 'uncheck'); assert.strictEqual(p.label, 'Retirer 200 → 220'); });
t('enlève le 12', () => assert.strictEqual(nums('enlève le 12').mode, 'uncheck'));
t('répète la dernière opération', () => assert.strictEqual(Parser.analyze('Répète la dernière opération').cmd, 'repeat'));
t('pause', () => assert.strictEqual(Parser.analyze('Pause').cmd, 'pause'));
t('reprendre', () => assert.strictEqual(Parser.analyze('Reprendre').cmd, 'resume'));
t('mot de contrôle au milieu -> confirmation', () => assert.strictEqual(dec('lot 76 annule').action, 'confirm'));
t('choix 2 hors confirmation', () => assert.strictEqual(dec('choix 2').action, 'confirm'));
t('phrase sans numéro', () => assert.strictEqual(Parser.analyze('bonjour tout le monde').type, 'empty'));

console.log(`${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
