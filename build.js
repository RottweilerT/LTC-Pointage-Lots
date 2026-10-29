// Reconstruit index.html à partir de src/ : node build.js
const fs = require('fs');
const parser = fs.readFileSync('src/parser.js', 'utf8');
const data = fs.readFileSync('src/data-layer.js', 'utf8');
const body = fs.readFileSync('src/app.src.html', 'utf8').replace('/*PARSER*/', () => parser).replace('/*DATA*/', () => data).replace('/*XLSXW*/', () => fs.readFileSync('src/xlsx-writer.js', 'utf8'));
const head = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<meta name="theme-color" content="#0039a6"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="favicon-32.png" type="image/png"><link rel="apple-touch-icon" href="apple-touch-icon.png">'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}</style></head><body>';
const sw = "<script>if('serviceWorker' in navigator&&location.protocol==='https:')addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));</script>";
fs.writeFileSync('index.html', head + body + sw + '</body></html>');
// Version claude.ai (sans en-tête ni service worker)
if (process.argv.includes('--artifact')) fs.writeFileSync(process.argv[process.argv.indexOf('--artifact') + 1], body);
for (const m of fs.readFileSync('index.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]);
console.log('index.html reconstruit');
