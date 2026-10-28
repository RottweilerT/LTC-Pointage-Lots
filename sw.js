// Mode hors ligne : la page, ses icônes et les bibliothèques (Excel, Firebase, polices) sont gardées sur l'appareil.
// La page est redemandée au réseau d'abord (dernière version) ; si le réseau ne répond pas en 2,5 s,
// la copie gardée s'ouvre tout de suite. Les données Firebase ne passent pas par ici (Firestore garde son propre cache).
const CACHE = 'pointage-v6';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const EXTERNAL = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname.endsWith('.webmanifest')) {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    });
    e.waitUntil(net.then(() => {}, () => {}));
    e.respondWith((async () => {
      const cached = (await caches.match(key)) || (req.mode === 'navigate' ? await caches.match('./') : null);
      if (!cached) return net;
      const late = new Promise(r => setTimeout(() => r(null), 2500));
      return (await Promise.race([net.catch(() => null), late])) || cached;
    })());
    return;
  }
  const static_ = url.origin === location.origin || EXTERNAL.includes(url.hostname)
    || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/xlsx/'));
  if (!static_) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(req);
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
