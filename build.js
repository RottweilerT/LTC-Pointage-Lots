// Reconstruit index.html à partir de src/app.src.html et src/parser.js : node build.js
const fs = require('fs');
const p = fs.readFileSync('src/parser.js', 'utf8');
const body = fs.readFileSync('src/app.src.html', 'utf8').replace('/*PARSER*/', () => p);
fs.writeFileSync('index.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}</style></head><body>' + body + '</body></html>');
console.log('index.html reconstruit');
