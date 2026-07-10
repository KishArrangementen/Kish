// Kish serviceworker: netwerk eerst (altijd de nieuwste versie),
// en valt terug op de laatst opgeslagen kopie als er geen internet is.
const CACHE = 'kish-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./']).catch(()=>{})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase-verkeer nooit cachen: dat is live data
  if(url.hostname.includes('firebasedatabase') || url.hostname.includes('firebaseio') || url.hostname.includes('identitytoolkit') || url.hostname.includes('securetoken')) return;

  e.respondWith((async () => {
    try {
      // Eerst het netwerk: zo draait iedereen altijd op de nieuwste versie
      const vers = await fetch(req);
      if(vers && vers.ok || vers.type === 'opaque'){
        const c = await caches.open(CACHE);
        c.put(req, vers.clone()).catch(()=>{});
      }
      return vers;
    } catch (err) {
      // Geen internet: de laatst bekende kopie
      const c = await caches.open(CACHE);
      const kopie = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
      if(kopie) return kopie;
      if(req.mode === 'navigate'){
        const start = await c.match('./');
        if(start) return start;
      }
      throw err;
    }
  })());
});
