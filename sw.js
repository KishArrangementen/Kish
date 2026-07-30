// Kish serviceworker: netwerk eerst (altijd de nieuwste versie),
// met terugval op de laatst opgeslagen kopie als het netwerk weg is,
// als de host een foutmelding teruggeeft, of als de host blijft hangen.
const CACHE = 'kish-v3';
const TIMEOUT = 4000; // na 4 seconden wachten pakken we de opgeslagen kopie

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

  // Live data nooit cachen
  if(url.hostname.includes('firebasedatabase') || url.hostname.includes('firebaseio')
    || url.hostname.includes('identitytoolkit') || url.hostname.includes('securetoken')
    || url.hostname.includes('supabase.co')) return;

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const uitCache = () => c.match(req, { ignoreSearch: req.mode === 'navigate' })
      .then(k => k || (req.mode === 'navigate' ? c.match('./') : null));

    try {
      // Blijft de host hangen, dan niet eindeloos wachten
      const vers = await Promise.race([
        fetch(req),
        new Promise((_, stop) => setTimeout(() => stop(new Error('traag')), TIMEOUT))
      ]);

      if(vers && (vers.ok || vers.type === 'opaque')){
        c.put(req, vers.clone()).catch(()=>{});
        return vers;
      }

      // Host antwoordt wel, maar met een fout (bijv. 500 of 503 bij een storing):
      // dan is de laatst bekende goede kopie beter dan een foutpagina
      const kopie = await uitCache();
      return kopie || vers;

    } catch (err) {
      // Geen netwerk of te traag: de laatst bekende kopie
      const kopie = await uitCache();
      if(kopie) return kopie;
      throw err;
    }
  })());
});
