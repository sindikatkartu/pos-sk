/**
 * POS SINDIKAT KARTU — sw.js (Service Worker)
 * Membuat aplikasi tetap terbuka dan berfungsi penuh saat internet mati.
 *
 * Strategi:
 *   - Berkas aplikasi (HTML/CSS/JS) : cache-first  -> aplikasi selalu membuka instan
 *   - Panggilan API                 : network-only -> tidak pernah di-cache, agar data tak basi
 */
const CACHE = 'possk-v1.8.5';
const BERKAS = [
  './', './index.html',
  './css/app.css',
  './js/config.js', './js/db.js', './js/api.js', './js/pos.js',
  './js/sync.js', './js/print.js', './js/grafik.js', './js/admin.js', './js/app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BERKAS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Jangan pernah meng-cache panggilan API — kasir harus selalu bicara ke server sungguhan.
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;   // biarkan browser menanganinya; kegagalan ditangani lapisan API
  }

  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        // Perbarui diam-diam di latar belakang agar versi berikutnya sudah segar
        fetch(e.request).then(r => {
          if (r && r.status === 200) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request).then(r => {
        if (r && r.status === 200 && url.origin === location.origin) {
          const salinan = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, salinan));
        }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
