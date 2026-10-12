/**
 * POS SINDIKAT KARTU — tema.js
 * TEMA DIPASANG SEBELUM GAMBAR PERTAMA. Dimuat di <head>, sebelum <body>.
 *
 * Setelan `tema` datang dari server dan disimpan di IndexedDB, yang asinkron:
 * halaman sudah tergambar terang sebelum temanya diketahui. Di toko bermode
 * gelap itu satu kilatan putih setiap kali aplikasi dibuka — beberapa puluh
 * kali sehari. localStorage sinkron, jadi bisa dibaca di sini, sebelum badan
 * halaman ada.
 *
 * Dulu skrip ini tertulis langsung di index.html. Dipindah ke berkas sendiri
 * (bagian 384) karena Content-Security-Policy halaman hanya mengizinkan skrip
 * dari berkas situs sendiri — skrip yang tertulis di dalam halaman ditolak,
 * dan dengan itu skrip sisipan orang lain ikut ditolak.
 *
 * Dibungkus try: mode penyamaran dan peramban yang memblokir penyimpanan situs
 * membuat localStorage MELEMPAR, bukan mengembalikan null. Kasir tidak boleh
 * kehilangan aplikasinya karena sebuah kenyamanan tampilan — gagal di sini
 * berarti temanya terang sampai app.js memasangnya, tidak lebih.
 */
(function () {
  try {
    var t = localStorage.getItem('possk_tema');
    if (t === 'gelap') document.documentElement.dataset.tema = 'gelap';
    /* Warna bilah status ponsel ikut dipasang DI SINI, bukan hanya di app.js.
       Aplikasi yang dipasang ke layar utama (standalone) membaca theme-color
       saat halaman dimuat; yang diubah app.js belakangan tidak selalu diikuti.
       Dilaporkan pemilik 10 Sep 2026: bilah status putih di atas aplikasi
       gelap. Nilainya = token --panel tiap tema (app.css) — ada uji yang
       menjaga keduanya sepakat. */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'gelap' ? '#30302e' : '#ffffff');
  } catch (e) { /* penyimpanan diblokir: tetap terang sampai app.js jalan */ }
})();
