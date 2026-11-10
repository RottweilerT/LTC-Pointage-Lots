// Navigateur : bouton Précédent qui ferme les fenêtres, boutons de validation visibles (node tests/fenetres.js, serveur sur :8766)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.route('**/*', r => { const u = r.request().url();
    if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('tests/fake-firebase.js', 'utf8') });
    if (u.includes('firebase-firestore-compat')) return r.fulfill({ contentType: 'text/javascript', body: '' });
    if (u.includes('xlsx.full')) return r.fulfill({ contentType: 'text/javascript', body: "window.XLSX={read:s=>({SheetNames:['F'],Sheets:{F:{r:String(s).split(/\\r?\\n/).filter(Boolean).map(l=>l.split(';'))}}}),utils:{sheet_to_json:sh=>sh.r}};" });
    if (u.startsWith('http://localhost')) return r.continue(); return r.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1000);
  const ouvert = () => p.evaluate(() => !document.getElementById('modal').hidden);
  await p.setInputFiles('#file', '/tmp/p/liste.csv'); await p.waitForTimeout(600);
  const bb = await p.locator('#iOk').boundingBox();
  console.log('import : bouton « Créer » visible sans défiler :', bb && bb.y + bb.height <= 844);
  await p.click('#iOk'); await p.waitForTimeout(800);
  console.log('après création : fenêtre fermée', !(await ouvert()), '| lots :', await p.textContent('#kTotal'));
  await p.click('#bMore'); await p.waitForTimeout(200); console.log('Options ouverte :', await ouvert());
  await p.goBack(); await p.waitForTimeout(300); console.log('Précédent → fermée :', !(await ouvert()), '| toujours sur la page :', p.url());
  await p.click('#bMore'); await p.waitForTimeout(200); await p.click('#oDone'); await p.waitForTimeout(300);
  console.log('Fermer → fermée :', !(await ouvert()));
  await p.click('#bManage'); await p.waitForTimeout(200); console.log('Gérer ouverte :', await ouvert());
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.click('#bMore'); await p.waitForTimeout(300);
  console.log('Échap puis Options : ouverte', await ouvert()); await p.goBack(); await p.waitForTimeout(300); console.log('Précédent → fermée :', !(await ouvert()));
  await p.fill('#scanInput', '40105'); await p.press('#scanInput', 'Enter'); await p.waitForTimeout(300);
  console.log('pointés :', await p.textContent('#kDone'), '| erreurs :', errs); await b.close();
})();
