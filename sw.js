const CACHE_NAME = 'ergoexpress-pwa-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/html2pdf.bundle.min.js',
  './assets/xlsx.full.min.js',
  './assets/pdf.min.js',
  './assets/pdf.worker.min.js',
  './assets/constancia_inpsasel_ejemplo.pdf'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isHtml = e.request.mode === 'navigate' ||
                 e.request.destination === 'document' ||
                 (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'));

  if (isHtml) {
    // Para navegación/HTML: NETWORK FIRST (obtiene siempre la versión más reciente en la nube)
    // Con fallback a caché para trabajo 100% offline en campo
    e.respondWith(
      fetch(e.request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
          }
          return networkRes;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || caches.match('./')))
    );
    return;
  }

  // Para assets estáticos: CACHE FIRST con revalidación
  e.respondWith(
    caches.match(e.request).then(cachedRes => {
      if (cachedRes) {
        // En segundo plano revalidar copia fresca
        fetch(e.request).then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes));
          }
        }).catch(() => {});
        return cachedRes;
      }
      return fetch(e.request).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        }
        return networkRes;
      });
    })
  );
});