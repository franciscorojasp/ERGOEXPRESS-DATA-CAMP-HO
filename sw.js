const CACHE_NAME = 'ergoexpress-pwa-v4';
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
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.map(n => n !== CACHE_NAME ? caches.delete(n) : null))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then(res => res || fetch(e.request).catch(() => caches.match('./index.html')))); });