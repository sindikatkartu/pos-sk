/**
 * POS SINDIKAT KARTU — config.js
 * SATU-SATUNYA file yang perlu Anda ubah setelah deploy Apps Script.
 */
window.CONFIG = {
  // Tempel URL Web App Apps Script di sini (yang berakhiran /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbyRxkGDwxskyO9FOHP4H-XUj0yH3cWSeL8TmQSmxza81Bw8oq--SRYT-CnGD8m_g34/exec',

  APP_NAMA: 'POS Sindikat Kartu',
  VERSI: '1.8.4',

  // Nama & versi database lokal (IndexedDB)
  DB_NAMA: 'possk',
  DB_VERSI: 2,          // v2: menambah store stok_cabang (intip stok antar cabang)

  // Sinkronisasi
  SYNC_INTERVAL_MS: 30000,     // coba kirim outbox tiap 30 detik
  MASTER_POLL_MS: 300000,      // cek pembaruan master tiap 5 menit
  STOK_CABANG_POLL_MS: 600000, // segarkan stok seluruh cabang tiap 10 menit
  BATCH_SIZE: 25,              // dokumen per paket kirim
  PERINGATAN_OUTBOX: 50,       // peringatkan bila tertahan lebih dari ini
  PERINGATAN_UMUR_JAM: 24,     // peringatkan bila master lebih tua dari ini

  // Tampilan
  LOCALE: 'id-ID',
  MATA_UANG: 'Rp'
};
