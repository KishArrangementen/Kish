// Kish serviceworker
// Volgorde bij het laden van de app:
//   1. het eigen adres (netwerk eerst, zo draait iedereen op de nieuwste versie)
//   2. de kopie die op dit apparaat is opgeslagen
//   3. het reserveadres (de spiegel), als het eigen adres plat ligt
const CACHE = 'kish-v5';
const TIMEOUT = 4000; // langer wachten heeft geen zin, dan pakken we de kopie

// Beide adressen waarop Kish draait. Het adres waar je nu bent telt niet mee als reserve.
const ADRESSEN = [
  'https://kish-arrangementen.nl/',
  'https://kish-backup.netlify.app/',
  'https://kisharrangementen.github.io/Kish/'
];
function reserveAdressen(){
  return ADRESSEN.filter(a => a.indexOf(self.location.hostname) === -1);
}

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

    // Laatste redmiddel: de app van het andere adres halen.
    // Alleen bij het openen van de app zelf, de rest zit in het bestand ingebakken.
    const viaSpiegel = async () => {
      if(req.mode !== 'navigate') return null;
      for(const adres of reserveAdressen()){
        try {
          const antw = await Promise.race([
            fetch(adres, { cache: 'no-store' }),
            new Promise((_, stop) => setTimeout(() => stop(new Error('traag')), TIMEOUT))
          ]);
          if(antw && antw.ok && antw.type !== 'opaque'){
            c.put('./', antw.clone()).catch(()=>{});
            return antw;
          }
        } catch (err) { /* dit adres ook onbereikbaar, volgende proberen */ }
      }
      return null;
    };

    try {
      const vers = await Promise.race([
        fetch(req),
        new Promise((_, stop) => setTimeout(() => stop(new Error('traag')), TIMEOUT))
      ]);

      if(vers && (vers.ok || vers.type === 'opaque')){
        c.put(req, vers.clone()).catch(()=>{});
        return vers;
      }

      // Adres antwoordt met een fout (bijvoorbeeld 500 of 503 bij een storing)
      return (await uitCache()) || (await viaSpiegel()) || vers;

    } catch (err) {
      // Geen netwerk, of het adres bleef hangen
      const kopie = await uitCache();
      if(kopie) return kopie;
      const spiegel = await viaSpiegel();
      if(spiegel) return spiegel;
      throw err;
    }
  })());
});
