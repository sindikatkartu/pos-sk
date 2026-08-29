/**
 * POS SINDIKAT KARTU — sw.js (Service Worker)
 * Membuat aplikasi tetap terbuka dan berfungsi penuh saat internet mati.
 *
 * Strategi:
 *   - Berkas aplikasi (HTML/CSS/JS) : cache-first  -> aplikasi selalu membuka instan
 *   - Panggilan API                 : network-only -> tidak pernah di-cache, agar data tak basi
 */
const CACHE = 'possk-v1.49.0';
const BERKAS = [
  './', './index.html',
  './css/app.css',
  './js/config.js', './js/db.js', './js/api.js', './js/pos.js',
  './js/sync.js', './js/print.js', './js/grafik.js', './js/admin.js', './js/app.js',
  './manifest.webmanifest'
];

/**
 * Saat memasang, berkas diambil dengan `cache: 'reload'` — MELEWATI cache HTTP
 * browser dan selalu menembak jaringan.
 *
 * Ini bukan kehati-hatian berlebih; tanpa itu penerbitan bisa gagal separuh dan
 * sulit dilacak. `addAll()` biasa memakai cache HTTP, sedangkan GitHub Pages
 * menyajikan berkas dengan masa simpan beberapa menit. Akibatnya nama cache
 * sudah naik ke versi baru, tapi ISINYA masih berkas versi lama — aplikasi
 * tampak sudah diperbarui padahal belum, dan tidak ada satu pun pesan galat.
 * Persis itu yang terjadi saat menerbitkan v1.9.0.
 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(BERKAS.map(u =>
        fetch(new Request(u, { cache: 'reload' }))
          .then(r => { if (r && r.ok) return c.put(u, r); })
      )))
      .then(() => self.skipWaiting())
  );
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
