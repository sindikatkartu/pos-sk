/**
 * POS SINDIKAT KARTU — app.js
 * Perekat seluruh modul: layar, keranjang, pembayaran, shift, laporan.
 */

/* ==================== STATE ==================== */
const APP_STATE = {
  user: null, cabang: null, namaCabang: '', daftarCabang: [],
  izin: {}, flag: {}, perangkat: null,
  setting: {}, pkp: false, tarifPpn: 0, diskonMaks: 0,
  idShift: null, produkTampil: [], indeksSorot: 0, metodeBayar: [],
  daftarCabangSemua: [],
  // Daftar frontliner yang boleh mengklaim penjualan di cabang ini. Diisi dari
  // IndexedDB saat master dimuat, jadi tetap ada walau internet mati.
  daftarPetugas: [], klaimWajib: false, timBaris: null,
  bobotPeran: { PENJUAL: 60, PEMASANG: 40 },
  // uuid nota disiapkan saat layar bayar dibuka, bukan saat disimpan: persetujuan
  // diskon menempel pada uuid, jadi nomornya harus sudah ada sebelum diminta.
  uuidNota: null, otorisasiDiskon: null
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const rp = (n) => CONFIG.MATA_UANG + ' ' + new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(Number(n) || 0));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function pesan(wadah, teks, jenis = 'info') {
  $(wadah).innerHTML = teks ? `<div class="pesan ${jenis}">${esc(teks)}</div>` : '';
}

function bolehIzin(modul, aksi) {
  const i = APP_STATE.izin;
  if (i['*'] === '*') return true;
  const m = i[modul];
  return m === '*' || (Array.isArray(m) && m.includes(aksi));
}

/**
 * DAFTAR MENU — inti dari "menu muncul sesuai hak akses".
 *
 * `izin`       : syarat MINIMAL agar menu muncul. Perhatikan pilihannya —
 *                menu Produk mensyaratkan `produk.buat`, BUKAN `produk.lihat`, sebab kasir
 *                memang butuh `produk.lihat` untuk berjualan tapi tidak boleh melihat menu
 *                master produk. Prinsip sama dipakai Stok (laporan_stok) dan Pelanggan (.ubah).
 *
 * `admin`      : layarnya digambar oleh admin.js (butuh internet), bukan penanda pembatasan.
 * `backoffice` : benar-benar menu pengelolaan yang tidak boleh dilihat kasir.
 *
 * Dua penanda itu sengaja dipisah karena ada satu pengecualian penting: **Retur** digambar
 * admin.js tapi justru dikerjakan kasir di depan pelanggan. Menyamakan keduanya akan
 * menutup akses kasir ke pekerjaannya sendiri.
 *
 * Hasilnya untuk peran bawaan:
 *   Kasir          → Kasir, Riwayat, Retur, Perangkat
 *   Kepala Cabang  → + Dashboard, Stok, Transfer, Pembelian, Pelanggan, Piutang, Laporan
 *   Akunting       → Dashboard, Riwayat, Piutang, Laporan, Keuangan, Audit, Perangkat
 *   Owner          → semuanya
 *
 * `grup`       : hanya untuk tampilan — mengelompokkan menu di laci (☰) supaya
 *                daftar 20 menu milik Owner tetap terbaca. Tidak memengaruhi hak akses.
 */
const MENU = [
  { id: 'dashboard',  label: 'Dashboard',  grup: 'Ringkasan',  izin: ['laporan_penjualan', 'lihat'], admin: true, backoffice: true },
  { id: 'kasir',      label: 'Kasir',      grup: 'Penjualan',  izin: ['kasir', 'buat'] },
  { id: 'riwayat',    label: 'Riwayat',    grup: 'Penjualan',  izin: ['penjualan', 'lihat'] },
  { id: 'shift',      label: 'Shift',      grup: 'Penjualan',  izin: ['shift', 'lihat'] },
  // Retur: digambar admin.js, tapi BUKAN back office — kasir wajib bisa mengaksesnya.
  { id: 'retur',      label: 'Retur',      grup: 'Penjualan',  izin: ['retur', 'buat'],              admin: true },
  { id: 'produk',     label: 'Produk',     grup: 'Persediaan', izin: ['produk', 'buat'],             admin: true, backoffice: true },
  { id: 'stok',       label: 'Stok',       grup: 'Persediaan', izin: ['laporan_stok', 'lihat'],      admin: true, backoffice: true },
  { id: 'transfer',   label: 'Transfer',   grup: 'Persediaan', izin: ['transfer', 'lihat'],          admin: true, backoffice: true },
  { id: 'opname',     label: 'Opname',     grup: 'Persediaan', izin: ['opname', 'buat'],             admin: true, backoffice: true },
  { id: 'pembelian',  label: 'Pembelian',  grup: 'Persediaan', izin: ['pembelian', 'lihat'],         admin: true, backoffice: true },
  { id: 'returbeli',  label: 'Retur Beli', grup: 'Persediaan', izin: ['pembelian', 'buat'],          admin: true, backoffice: true },
  { id: 'mitra',      label: 'Pelanggan',  grup: 'Relasi',     izin: ['pelanggan', 'ubah'],          admin: true, backoffice: true },
  // Petugas digantung pada `petugas.buat`, bukan `.lihat` — kasir memang butuh
  // `petugas.lihat` untuk memilih pramuniaga di layar kasir, tapi tidak boleh
  // membuka master petugas. Pola yang sama dipakai menu Produk.
  { id: 'petugas',    label: 'Petugas',    grup: 'Relasi',     izin: ['petugas', 'buat'],            admin: true, backoffice: true },
  { id: 'piutang',    label: 'Piutang',    grup: 'Relasi',     izin: ['piutang', 'lihat'],           admin: true, backoffice: true },
  { id: 'laporan',    label: 'Laporan',    grup: 'Laporan',    izin: ['laporan_penjualan', 'lihat'] },
  { id: 'poin',       label: 'Poin',       grup: 'Laporan',    izin: ['laporan_poin', 'lihat'],      admin: true, backoffice: true },
  { id: 'keuangan',   label: 'Keuangan',   grup: 'Laporan',    izin: ['laporan_keuangan', 'lihat'] },
  { id: 'diskon',     label: 'Diskon',     grup: 'Laporan',    izin: ['laporan_penjualan', 'lihat'], admin: true, backoffice: true },
  { id: 'pengguna',   label: 'Pengguna',   grup: 'Sistem',     izin: ['user', 'lihat'],              admin: true, backoffice: true },
  { id: 'cabang',     label: 'Cabang',     grup: 'Sistem',     izin: ['cabang', 'lihat'],            admin: true, backoffice: true },
  { id: 'sistem',     label: 'Setting',    grup: 'Sistem',     izin: ['setting', 'lihat'],           admin: true, backoffice: true },
  { id: 'audit',      label: 'Audit',      grup: 'Sistem',     izin: ['audit', 'lihat'],             admin: true, backoffice: true },
  { id: 'arsip',      label: 'Arsip',      grup: 'Sistem',     izin: ['setting', 'hapus'],           admin: true, backoffice: true },
  { id: 'akun',       label: 'Akun saya',  grup: 'Sistem',     izin: null },  // selalu tampil
  { id: 'tentang',    label: 'Tentang',    grup: 'Sistem',     izin: null },  // selalu tampil
  { id: 'pengaturan', label: 'Perangkat',  grup: 'Sistem',     izin: null }   // selalu tampil
];

/** Urutan kelompok di sidebar. Menu bergrup lain (kalau ada) diletakkan di akhir. */
const URUT_GRUP = ['Ringkasan', 'Penjualan', 'Persediaan', 'Relasi', 'Laporan', 'Sistem'];

/**
 * IKON — digambar sebaris sebagai SVG, BUKAN diambil dari CDN ikon.
 * Alasannya sama dengan alasan grafik dibuat sendiri: aplikasi ini harus tetap
 * utuh saat internet mati. Ikon yang gagal dimuat akan membuat sidebar terlihat
 * rusak persis di saat kasir paling butuh tenang.
 *
 * Semua digambar pada kanvas 24×24 dengan tebal garis seragam (lihat .ikon-svg),
 * supaya tidak terlihat seperti kumpulan ikon dari beberapa sumber berbeda.
 */
/**
 * Tampilkan nota yang ditolak server beserta alasannya.
 *
 * Nota ini sudah dicetak dan uangnya sudah diterima, tapi tidak pernah masuk
 * pembukuan. Yang bisa dilakukan aplikasi hanyalah memastikan seseorang TAHU —
 * memperbaikinya butuh keputusan manusia (buka periode, buka shift, atau input
 * ulang), jadi jangan pernah dicoba diam-diam.
 */
async function tampilkanDitolak() {
  const rows = await DB.outboxDitolak();
  if (!rows.length) return;
  const isi = rows.map(o => `<div class="pesan galat" style="margin-bottom:8px">
      <strong>${esc(o.dokumen?.no_nota || o.uuid)}</strong>
      <div style="font-size:12.5px;margin-top:4px">${esc(o.pesan_galat || 'Tanpa keterangan')}</div>
      <div class="meta-kecil">Dicoba ${o.percobaan || 0}x · ${esc(String(o.dibuat || '').replace('T', ' ').substring(0, 16))}</div>
    </div>`).join('');
  Admin.modal('Nota ditolak server', `
    <p>Nota berikut sudah tercatat di perangkat ini tapi <strong>ditolak server</strong>,
       jadi belum masuk pembukuan. Tunjukkan daftar ini ke pemilik — sebagian butuh
       tindakan di sisi server dulu (mis. periode yang sudah ditutup).</p>
    ${isi}`);
}

/* ==================== PENANDA SEDANG MEMUAT ====================
 * Masalahnya sederhana dan mahal: setelah menekan tombol tidak ada tanda
 * apa pun, jadi orang menekannya lagi — dan tindakan yang tidak idempoten
 * (buka shift, simpan nota, bayar piutang) terkirim dua kali.
 *
 * Penjagaannya dipasang di SATU tempat, bukan ditempel satu per satu di tiap
 * penangan tombol. Tombol yang ditulis besok ikut terjaga tanpa diingat.
 *
 * Cara kerjanya: saat sebuah tombol diklik, catat jumlah permintaan yang
 * sedang berjalan. Bila sesaat kemudian jumlahnya bertambah, berarti klik
 * itulah yang memulainya — kunci tombolnya sampai semuanya selesai.
 * Tombol yang tidak memanggil server sama sekali tidak tersentuh.
 */
function pasangPenandaSibuk() {
  const garis = $('#garisMuat');
  const terkunci = new Set();

  const lepas = () => {
    terkunci.forEach(b => {
      b.classList.remove('sibuk');
      // Jangan hidupkan tombol yang memang dimatikan oleh penangannya sendiri
      // (mis. Selesaikan saat uang kurang). Tandanya: dikunci oleh kita.
      if (b.dataset.kunciOtomatis === '1') { b.disabled = false; delete b.dataset.kunciOtomatis; }
    });
    terkunci.clear();
  };

  /* Penandanya tidak dipadamkan seketika saat penghitung menyentuh nol.
     Satu tindakan sering berupa RANTAI beberapa permintaan — simpan, lalu tarik
     master, lalu muat ulang layar. Di antara dua permintaan penghitungnya sempat
     nol sesaat, dan tanpa jeda ini penandanya berkedip lalu tombolnya terbuka
     kembali di tengah operasi yang belum selesai. Kedipan itu yang terbaca
     sebagai "loading-nya berhenti, seperti tidak ada kejadian".

     Jedanya pendek — cukup menutup celah antar permintaan, tidak sampai membuat
     penandanya terasa menggantung setelah pekerjaannya benar-benar selesai. */
  const JEDA_PADAM = 220;
  let padamNanti = null;

  document.addEventListener('api:sibuk', (e) => {
    if (e.detail.jumlah > 0) {
      clearTimeout(padamNanti); padamNanti = null;
      if (garis) garis.classList.add('jalan');
      return;
    }
    clearTimeout(padamNanti);
    padamNanti = setTimeout(() => {
      padamNanti = null;
      if (garis) garis.classList.remove('jalan');
      lepas();
    }, JEDA_PADAM);
  });

  /* Dibaca sebagai angka dengan tegas. Kalau nilainya bukan angka — API
     diganti, modul dimuat sebagian, atau versi lama tersisa di cache — maka
     `undefined <= undefined` bernilai false dan SETIAP tombol akan terkunci
     selamanya. Kegagalan penanda muat tidak boleh melumpuhkan aplikasinya. */
  const jumlahSibuk = () => Number(API && API.sibuk) || 0;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || b.classList.contains('sibuk')) return;
    const sebelum = jumlahSibuk();
    // Diperiksa setelah penangannya sempat jalan; kalau tidak ada permintaan
    // yang lahir dari klik ini, tombolnya dibiarkan apa adanya.
    setTimeout(() => {
      if (jumlahSibuk() <= sebelum || !b.isConnected) return;
      b.classList.add('sibuk');
      if (!b.disabled) { b.disabled = true; b.dataset.kunciOtomatis = '1'; }
      terkunci.add(b);
    }, 0);
  }, true);
}

/** Isi layar Tentang. Versi adalah pertanyaan pertama saat ada laporan masalah:
    tanpa angka yang bisa dibaca sendiri oleh pemakainya, jawabannya selalu tebakan. */
function gambarTentang() {
  const el = $('#isiTentang');
  if (!el) return;
  const baris = [
    ['Versi aplikasi', 'v' + CONFIG.VERSI],
    // namaCabang jatuh kembali ke kodenya sendiri bila daftar cabang belum tersinkron;
    // tanpa penjagaan ini barisnya terbaca "SK01 · SK01".
    ['Cabang aktif', (APP_STATE.cabang || '—') +
      (APP_STATE.namaCabang && APP_STATE.namaCabang !== APP_STATE.cabang
        ? ' · ' + APP_STATE.namaCabang : '')],
    ['Masuk sebagai', (APP_STATE.user?.nama || '—') + ' (' + (APP_STATE.user?.peran || '—') + ')'],
    ['Perangkat', APP_STATE.perangkat?.kode || '—'],
    ['Versi data lokal', 'v' + CONFIG.DB_VERSI]
  ];
  el.innerHTML = baris.map(([k, v]) =>
    `<div class="baris-tentang"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
}

const IKON = {
  dashboard : '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  kasir     : '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.4 11.2a1.8 1.8 0 0 0 1.8 1.4h9a1.8 1.8 0 0 0 1.76-1.4L21 7H5.2"/>',
  riwayat   : '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  retur     : '<path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5"/>',
  produk    : '<path d="M20.5 7.3 12 12l-8.5-4.7"/><path d="M12 12v9.5"/><path d="M20.5 7.6v8.8a1.5 1.5 0 0 1-.78 1.32l-7 3.9a1.5 1.5 0 0 1-1.44 0l-7-3.9A1.5 1.5 0 0 1 3.5 16.4V7.6a1.5 1.5 0 0 1 .78-1.32l7-3.9a1.5 1.5 0 0 1 1.44 0l7 3.9A1.5 1.5 0 0 1 20.5 7.6Z"/><path d="m7.6 4.6 8.6 4.8"/>',
  stok      : '<path d="m12 2.8 9 4.6-9 4.6-9-4.6 9-4.6Z"/><path d="m3 12.4 9 4.6 9-4.6"/><path d="m3 17 9 4.6 9-4.6"/>',
  transfer  : '<path d="M7.5 4 4 7.5 7.5 11"/><path d="M4 7.5h15"/><path d="M16.5 13 20 16.5 16.5 20"/><path d="M20 16.5H5"/>',
  opname    : '<rect x="8" y="2.5" width="8" height="4" rx="1.4"/><path d="M16 4.5h2A2 2 0 0 1 20 6.5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2"/><path d="m9 13.5 2 2 4-4"/>',
  pembelian : '<path d="M13.5 17.5V7a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 7v9a1.5 1.5 0 0 0 1.5 1.5H5"/><path d="M13.5 9.5H17l4 4v4a1.5 1.5 0 0 1-1.5 1.5H19"/><path d="M9 17.5h5.5"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  // Retur Beli sengaja TIDAK memakai kotak seperti Produk/Retur Beli lain — di ukuran
  // 18px dua kotak nyaris kembar. Dipakai truk yang berputar arah: barang keluar ke supplier.
  returbeli : '<path d="M13.5 16.5V7a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 7v9a1.5 1.5 0 0 0 1.5 1.5H5"/><path d="M13.5 9.5H17l4 4v3a1.5 1.5 0 0 1-1.5 1.5H19"/><circle cx="7" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/><path d="M11.5 11.5h-5m2-2-2 2 2 2"/>',
  mitra     : '<path d="M15.5 20.5v-1.8a3.7 3.7 0 0 0-3.7-3.7H6.2a3.7 3.7 0 0 0-3.7 3.7v1.8"/><circle cx="9" cy="7.5" r="3.7"/><path d="M21.5 20.5v-1.8a3.7 3.7 0 0 0-2.8-3.58"/><path d="M15.8 4.02a3.7 3.7 0 0 1 0 7.16"/>',
  // Petugas: kartu nama bertali. Sengaja BUKAN ikon orang seperti Pengguna/Akun —
  // di ukuran 18px ketiganya akan tampak kembar, padahal artinya jauh berbeda:
  // Pengguna adalah akun yang bisa masuk, Petugas adalah orang yang berjualan.
  petugas   : '<rect x="4" y="4.5" width="16" height="17" rx="2"/><path d="M9.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5"/><circle cx="12" cy="12" r="2.6"/><path d="M7.8 18.6a4.4 4.4 0 0 1 8.4 0"/>',
  // Poin: bintang penghargaan. Dibedakan dari Keuangan (dompet) dan Diskon (label
  // persen) supaya tiga menu Laporan tidak saling tertukar — dan sengaja BUKAN
  // koin, karena poin memang bukan uang.
  poin      : '<circle cx="16.5" cy="6.5" r="4"/><path d="M16.5 4.8v3.4"/><path d="M2.5 14v6.5"/><path d="M6 20.5h7.6a3 3 0 0 0 2.1-.86l4-3.9a1.55 1.55 0 0 0-2.14-2.24l-2.5 2.1"/><path d="M6 15.4h4.4a1.65 1.65 0 0 1 0 3.3H8.2"/>',
  piutang   : '<path d="M4 2.6v18.8l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2.6l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8.5 8h7"/><path d="M8.5 12h5"/>',
  laporan   : '<path d="M3.5 3v17.5H21"/><path d="M7.5 16.5v-4"/><path d="M12 16.5v-8"/><path d="M16.5 16.5v-5.5"/>',
  keuangan  : '<path d="M19 7.5v-2A1.8 1.8 0 0 0 17.2 3.7H5.4a1.8 1.8 0 0 0 0 3.6h14a1.4 1.4 0 0 1 1.4 1.4v3.3"/><path d="M3.6 5.5v13a1.8 1.8 0 0 0 1.8 1.8h13.4a1.8 1.8 0 0 0 1.8-1.8v-2.6"/><path d="M17.6 12.6a2 2 0 0 0 0 4h3.2v-4Z"/>',
  // Label diskon: tanda persen dalam kotak — dibedakan dari ikon laporan lain
  shift     : '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 10.5h19"/><path d="M6.5 14.5h3"/>',
  akun      : '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  tentang   : '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1"/>',
  diskon    : '<path d="M4 13.4V6a2 2 0 0 1 2-2h7.4a2 2 0 0 1 1.42.59l6 6a2 2 0 0 1 0 2.83l-7.4 7.4a2 2 0 0 1-2.83 0l-6-6A2 2 0 0 1 4 13.4Z"/><circle cx="8.6" cy="8.6" r="1.3"/><path d="m10.6 16.4 5.8-5.8"/><circle cx="11" cy="11" r="1"/><circle cx="16" cy="16" r="1"/>',
  pengguna  : '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  cabang    : '<path d="m2.5 7.5 1.6-4.2h15.8l1.6 4.2"/><path d="M2.5 7.5h19v1.6a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-4.2 0 2.7 2.7 0 0 1-4.2 0 2.7 2.7 0 0 1-5.3 0Z"/><path d="M4.6 12.6v8.4h14.8v-8.4"/><path d="M9.6 21v-5h4.8v5"/>',
  sistem    : '<circle cx="12" cy="12" r="3"/><path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.65l.05.06a1.85 1.85 0 1 1-2.6 2.6l-.06-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.85 1.85 0 1 1-3.7 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.05a1.85 1.85 0 1 1-2.6-2.6l.05-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H4a1.85 1.85 0 1 1 0-3.7h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.06a1.85 1.85 0 1 1 2.6-2.6l.06.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37V4a1.85 1.85 0 1 1 3.7 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.05a1.85 1.85 0 1 1 2.6 2.6l-.05.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9H20a1.85 1.85 0 1 1 0 3.7h-.09a1.5 1.5 0 0 0-1.37.9Z"/>',
  audit     : '<path d="M12 21.5s7.5-3.8 7.5-9.5V5.2L12 2.5 4.5 5.2V12c0 5.7 7.5 9.5 7.5 9.5Z"/><path d="m9.2 11.8 2 2 3.6-3.6"/>',
  arsip     : '<rect x="2.5" y="3.5" width="19" height="4.6" rx="1.4"/><path d="M4.4 8.1v10.4a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2V8.1"/><path d="M10 12.2h4"/>',
  pengaturan: '<rect x="6" y="2.5" width="12" height="19" rx="2.4"/><path d="M12 18.2h.01"/>'
};
const svgIkon = (id) =>
  `<svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON[id] || IKON.pengaturan}</svg>`;

const menuTampil = () => MENU.filter(m => !m.izin || bolehIzin(m.izin[0], m.izin[1]));

/** Kelompokkan menu yang sudah disaring hak akses, menurut URUT_GRUP. */
function kelompokMenu(daftar) {
  const grup = [];
  daftar.forEach(m => {
    const nama = m.grup || 'Lainnya';
    let g = grup.find(x => x.nama === nama);
    if (!g) grup.push(g = { nama, isi: [] });
    g.isi.push(m);
  });
  const urut = g => { const i = URUT_GRUP.indexOf(g.nama); return i === -1 ? 99 : i; };
  return grup.sort((a, b) => urut(a) - urut(b));
}

function bangunNav() {
  const daftar = menuTampil();

  $('#navSisi').innerHTML = kelompokMenu(daftar).map(g =>
    `<div class="sisi-grup">${esc(g.nama)}</div>` +
    g.isi.map(m =>
      // title= dipakai saat sidebar terlipat: labelnya hilang, tooltipnya menggantikan.
      `<button data-layar="${m.id}" title="${esc(m.label)}">${svgIkon(m.id)}<span>${esc(m.label)}</span></button>`
    ).join('')
  ).join('');

  bukaLayar(daftar[0].id);
}

function bukaLayar(id) {
  $$('#navSisi button').forEach(b => b.classList.toggle('aktif', b.dataset.layar === id));
  $$('.layar').forEach(l => l.classList.remove('aktif'));
  const el = $('#layar' + id[0].toUpperCase() + id.slice(1));
  if (el) el.classList.add('aktif');

  const m = MENU.find(x => x.id === id);
  $('#judulLayar').textContent = m ? m.label : '';
  tutupLaci();

  if (m && m.admin) return Admin.muat(id);
  if (id === 'riwayat') return gambarRiwayat();
  if (id === 'pengaturan') return perbaruiInfoData();
  if (id === 'shift') return periksaShift();
  if (id === 'tentang') return gambarTentang();
  if (id === 'kasir') $('#inpCari').focus();
}

/* ---------- Sidebar: laci (layar sempit) & lipat (layar lebar) ---------- */
function bukaLaci() {
  $('#sisi').classList.add('buka');
  $('#tiraiSisi').classList.add('buka');
  $('#btnLaci').setAttribute('aria-expanded', 'true');
}
function tutupLaci() {
  $('#sisi').classList.remove('buka');
  $('#tiraiSisi').classList.remove('buka');
  $('#btnLaci').setAttribute('aria-expanded', 'false');
}

/** Keadaan lipat diingat per perangkat — PC kasir sempit dan tablet gudang
 *  punya kebiasaan berbeda, dan tidak ada yang mau melipatnya tiap pagi. */
async function terapkanLipat(lipat, simpan = true) {
  $('#app').classList.toggle('sisi-lipat', !!lipat);
  $('#btnLipat').setAttribute('title', lipat ? 'Bentangkan menu (Ctrl+B)' : 'Lipat menu (Ctrl+B)');
  $('#btnLipat').innerHTML = lipat
    ? '<svg class="ikon-svg" viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/></svg>'
    : '<svg class="ikon-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16"/></svg>';
  if (simpan) await DB.kvSet('sisi_lipat', !!lipat);
}

/* ==================== IDENTITAS PERANGKAT ==================== */
async function idPerangkat() {
  let id = await DB.kvGet('id_perangkat', null);
  if (!id) {
    id = 'DEV-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
    await DB.kvSet('id_perangkat', id);
  }
  return id;
}
const namaPerangkat = () => (navigator.userAgentData?.platform || navigator.platform || 'Perangkat') +
                            ' · ' + (screen.width + 'x' + screen.height);

/* ==================== LOGIN ==================== */
let pinBuffer = '';

function gambarPin() {
  $('#titikPin').innerHTML = Array.from({ length: 6 },
    (_, i) => `<span class="${i < pinBuffer.length ? 'isi' : ''}"></span>`).join('');
}

/* Penjaga login ganda. Digit ke-6 memulai login, tapi pinBuffer tetap berisi
   6 angka selama menunggu server — satu ketukan lagi memicu login KEDUA dengan
   PIN yang sama: dua sesi, dua token, dua kali mulaiSesi() berjalan bersamaan,
   dan token pertama menggantung. Penanda sibuk per-tombol tidak menolong di sini
   karena tombol yang ditekan berikutnya adalah tombol yang berbeda. */
let _sedangLogin = false;

async function login(pakaiPassword = false) {
  if (_sedangLogin) return;
  const username = $('#inpUsername').value.trim();
  if (!username) return pesan('#pesanLogin', 'Username wajib diisi.', 'galat');
  const kredensial = pakaiPassword ? { password: $('#inpPassword').value } : { pin: pinBuffer };
  if (!pakaiPassword && pinBuffer.length < 6) return pesan('#pesanLogin', 'PIN 6 digit.', 'galat');

  pesan('#pesanLogin', 'Menghubungi server…', 'info');
  _sedangLogin = true;
  try {
    const d = await API.login({
      username, ...kredensial,
      id_perangkat: await idPerangkat(),
      nama_perangkat: namaPerangkat(),
      cabang: await DB.kvGet('cabang_terakhir', null)
    });
    API.setToken(d.token);
    await DB.kvSet('token', d.token);
    await DB.kvSet('sesi', d);
    await DB.kvSet('cabang_terakhir', d.cabang);
    await mulaiSesi(d);
  } catch (e) {
    pinBuffer = ''; gambarPin();
    if (e.kode === 'PERANGKAT_MENUNGGU') {
      pesan('#pesanLogin', e.message + ' Perangkat sudah terdaftar otomatis — minta Owner menyetujuinya, lalu coba lagi.', 'galat');
    } else if (e.kode === 'JARINGAN' || e.kode === 'OFFLINE') {
      // Login offline hanya diizinkan bila perangkat ini pernah login dan sesinya belum kedaluwarsa.
      const sesiLama = await DB.kvGet('sesi', null);
      if (sesiLama && sesiLama.user.username === username) {
        pesan('#pesanLogin', 'Offline — masuk memakai sesi tersimpan. Sinkronisasi akan berjalan saat internet kembali.', 'info');
        API.setToken(sesiLama.token);
        await mulaiSesi(sesiLama);
      } else {
        pesan('#pesanLogin', 'Tidak dapat menghubungi server dan belum ada sesi tersimpan di perangkat ini.', 'galat');
      }
    } else {
      pesan('#pesanLogin', e.message, 'galat');
    }
  } finally {
    _sedangLogin = false;
  }
}

async function mulaiSesi(d) {
  APP_STATE.user = d.user;
  APP_STATE.cabang = d.cabang;
  APP_STATE.daftarCabang = d.daftar_cabang || [d.cabang];
  APP_STATE.izin = d.izin || {};
  APP_STATE.flag = d.flag || {};
  APP_STATE.perangkat = d.perangkat;
  APP_STATE.diskonMaks = Number(d.flag?.diskon_maks_persen || 0);

  $('#layarLogin').classList.add('sembunyi');
  $('#app').classList.remove('sembunyi');

  const inisial = String(d.user.nama || '?').trim().split(/\s+/)
    .slice(0, 2).map(w => w[0]).join('').toUpperCase();
  $('#avatarUser').textContent = inisial || '?';
  $('#namaUser').textContent   = d.user.nama;
  $('#peranUser').textContent  = d.user.nama_peran;
  $('#namaUser').title         = d.user.nama;
  $('#lncUser').textContent    = d.user.nama + ' · ' + d.user.nama_peran;
  $('#lncCabang').textContent  = d.cabang;
  $('#sisiCabang').textContent = d.cabang + (d.nama_cabang ? ' · ' + d.nama_cabang : '');
  $('#sisiCabang').title       = $('#sisiCabang').textContent;

  await terapkanLipat(await DB.kvGet('sisi_lipat', false), false);
  bangunNav();
  $('#btnTutupBuku').classList.toggle('sembunyi', !APP_STATE.flag.tutup_buku);

  await muatMaster();
  Sync.mulai();
  Sync.tarikStok();
  Sync.tarikStokSemuaCabang();
  await periksaShift();
  await gambarProduk('');
  gambarKeranjang();
  await perbaruiInfoData();

  if (d.user.wajib_ganti_pin) {
    // Kasus yang sama seperti shift: jangan sebut nama menu, antar saja.
    if (confirm('PIN Anda masih PIN awal dan sebaiknya segera diganti.\n\nGanti PIN sekarang?')) {
      menujuKartu('akun', 'kartuAkun', '#pinLama');
    }
  }
}

async function muatMaster() {
  try { await Sync.tarikMaster(); }
  catch (e) { console.warn('Master tidak dapat ditarik:', e.message); }

  APP_STATE.setting = await DB.kvGet('setting', {});
  APP_STATE.pkp = String(APP_STATE.setting.pkp) === 'true';
  APP_STATE.tarifPpn = Number(APP_STATE.setting.tarif_ppn || 0);
  $('#brsPpn').style.display = APP_STATE.pkp ? 'flex' : 'none';

  const daftarCabang = await DB.kvGet('cabang_list', []);
  const cab = daftarCabang.find(c => c.kode === APP_STATE.cabang);
  APP_STATE.namaCabang = cab ? cab.nama : APP_STATE.cabang;
  // Seluruh cabang aktif — dipakai layar "intip stok", termasuk cabang yang user ini
  // tidak berhak bertransaksi di sana. Yang ditampilkan hanya jumlah stok, bukan harga modal.
  APP_STATE.daftarCabangSemua = daftarCabang.map(c => c.kode);

  APP_STATE.klaimWajib = String(APP_STATE.setting.klaim_petugas_wajib) === 'true';
  // Bobot peran dipakai layar kasir untuk MENGUSULKAN pembagian poin. Yang
  // memutuskan tetap server; ini semata supaya angkanya sudah masuk akal saat
  // dialognya terbuka, bukan nol yang harus diisi dari awal setiap kali.
  try { APP_STATE.bobotPeran = JSON.parse(APP_STATE.setting.bobot_peran_klaim || '{}'); }
  catch (e) { APP_STATE.bobotPeran = {}; }
  if (!Object.keys(APP_STATE.bobotPeran).length) {
    APP_STATE.bobotPeran = { PENJUAL: 60, PEMASANG: 40 };
  }

  const pel = await DB.all('pelanggan');
  $('#selPelanggan').innerHTML = '<option value="">Pelanggan umum</option>' +
    // Labelnya ikut dinormalkan supaya tidak bertentangan dengan kolom level di
    // sebelahnya: memilih pelanggan lama membuat #selLevel berbunyi "Grosir",
    // dan label yang tetap berbunyi "(reseller)" hanya membingungkan kasir.
    pel.map(p => `<option value="${esc(p.kode)}">${esc(p.nama)} (${esc(Harga.normalLevel(p.level_harga))})</option>`).join('');

  /* Daftar petugas. Store `petugas` baru ada sejak DB_VERSI 3; perangkat yang
     belum sempat memutakhirkan skema lokalnya tidak boleh gagal memuat kasir
     hanya karena satu store belum ada. */
  try { APP_STATE.daftarPetugas = await DB.all('petugas'); }
  catch (e) { APP_STATE.daftarPetugas = []; console.warn('Daftar petugas belum tersedia:', e.message); }
  gambarPilihanPetugas();

  $('#keuCabang').innerHTML =
    (APP_STATE.flag.akses_lintas_cabang ? '<option value="*">Semua cabang</option>' : '') +
    APP_STATE.daftarCabang.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  $('#lncJumlahProduk').textContent = (await DB.jumlah('produk')) + ' produk';
}

/* ==================== PRODUK ==================== */
/**
 * Isi dropdown kategori di layar kasir dari katalog lokal.
 *
 * Digambar ulang hanya bila daftarnya benar-benar berubah — kalau tidak, pilihan
 * yang sedang aktif akan tereset setiap kali kasir mengetik satu huruf.
 */
function isiKategoriKasir(produk) {
  const el = $('#kasirKategori');
  if (!el) return;
  const daftar = [...new Set(produk.map(p => (p.kategori || '').trim()).filter(Boolean))].sort();
  const sidik = daftar.join('|');
  if (el.dataset.sidik === sidik) return;
  el.dataset.sidik = sidik;
  const dipilih = el.value;
  el.innerHTML = '<option value="">Semua kategori</option>' +
    daftar.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  if (daftar.includes(dipilih)) el.value = dipilih;
}

async function gambarProduk(kueri) {
  const semuaProduk = await DB.all('produk');
  const stok = await DB.all('stok');
  const petaStok = Object.fromEntries(stok.map(s => [s.key, s.qty]));
  const q = (kueri || '').toLowerCase().trim();

  isiKategoriKasir(semuaProduk);
  const kat = $('#kasirKategori')?.value || '';
  const semua = kat ? semuaProduk.filter(p => (p.kategori || '') === kat) : semuaProduk;

  let hasil;
  if (!q) {
    hasil = semua.slice(0, 60);
  } else {
    /* Barcode persis selalu menang — inilah yang membuat scanner terasa instan.
       Sengaja dicari di SELURUH katalog, bukan cuma kategori yang sedang dipilih:
       saringan kategori adalah alat bantu melihat, dan tidak boleh membuat barang
       yang barcode-nya sudah discan jadi tidak ketemu. */
    const persis = semuaProduk.filter(p => String(p.barcode) === q);
    if (persis.length === 1) { tambahKeKeranjang(persis[0]); $('#inpCari').value = ''; return gambarProduk(''); }
    hasil = semua.filter(p => p._cari.includes(q) || String(p.barcode).includes(q)).slice(0, 60);
  }

  APP_STATE.produkTampil = hasil;
  APP_STATE.indeksSorot = 0;
  const level = Keranjang.level;

  // Stok cabang lain dari cache — dipakai menandai "ada di cabang lain" saat stok di sini habis
  const lain = await DB.all('stok_cabang');
  const petaLain = {};
  lain.forEach(s => {
    if (s.cabang === APP_STATE.cabang || s.qty <= 0) return;
    (petaLain[s.sku] = petaLain[s.sku] || []).push(s);
  });

  $('#daftarProduk').innerHTML = hasil.length ? hasil.map((p, i) => {
    const qty = petaStok[p.sku + '|'] ?? null;
    const harga = Harga.pilihLevel(p.harga, level);
    const diLain = petaLain[p.sku] || [];
    // Yang paling menolong kasir: saat barang habis di sini, langsung terlihat cabang mana yang punya
    const petunjukLain = (qty !== null && qty <= 0 && diLain.length)
      ? `<div class="ada-di-lain">ada di ${diLain.slice(0, 3).map(s => esc(s.cabang) + ' (' + s.qty + ')').join(', ')}${
          diLain.length > 3 ? ' +' + (diLain.length - 3) : ''}</div>` : '';

    return `<div class="kartu-produk ${i === 0 ? 'sorot' : ''}" data-sku="${esc(p.sku)}">
      <div>
        <div class="nama">${esc(p.nama)}</div>
        <div class="meta">${esc(p.sku)}${p.merek ? ' · ' + esc(p.merek) : ''}${
          (p.satuan_lain || []).length ? ' · ' + p.satuan_lain.map(s => esc(s.nama)).join('/') : ''}</div>
        ${p.tipe_hp || (p.kompatibel || []).length
          ? `<div class="meta cocok">cocok: ${esc(p.tipe_hp || '')}${
              p.tipe_hp && (p.kompatibel || []).length ? ', ' : ''}${
              (p.kompatibel || []).slice(0, 4).map(k => esc(k.tipe)).join(', ')}${
              (p.kompatibel || []).length > 4 ? ` +${p.kompatibel.length - 4} lagi` : ''}</div>` : ''}
        ${petunjukLain}
      </div>
      <div>
        <div class="harga">${rp(harga)}</div>
        <div class="stok ${qty !== null && qty <= 0 ? 'habis' : ''}">${qty === null ? 'stok ?' : 'stok ' + qty}</div>
        <button class="tombol kecil sunyi" data-stok-cabang="${esc(p.sku)}"
                title="Lihat stok produk ini di seluruh cabang"
                style="margin-top:5px">cabang lain</button>
      </div>
    </div>`;
  }).join('') : '<p style="color:var(--teks-redup);text-align:center;padding:36px 0">Tidak ada produk cocok</p>';
}

/* ==================== INTIP STOK ANTAR CABANG ==================== */

async function lihatStokCabangLain(sku, paksaSegar = false) {
  const produk = await DB.get('produk', sku);
  const nama = produk ? produk.nama : sku;

  const gambar = (rows, waktu, realtime) => {
    const daftar = APP_STATE.daftarCabangSemua.length ? APP_STATE.daftarCabangSemua
                                                      : [...new Set(rows.map(r => r.cabang))];
    const peta = {};
    rows.forEach(r => { peta[r.cabang] = (peta[r.cabang] || 0) + (r.qty || 0); });

    Admin.modal(`Stok — ${nama}`, `
      <p class="petunjuk">
        ${realtime
          ? '<span class="lencana hijau">baru dihitung</span> Angka ini dihitung ulang langsung dari mutasi stok tiap cabang.'
          : `<span class="lencana kuning">ringkasan</span> Diperbarui ${waktu ? new Date(waktu).toLocaleString(CONFIG.LOCALE) : '—'}.
             Tekan "Cek terkini" sebelum menjanjikan barang ke pelanggan.`}
      </p>
      <table>
        <thead><tr><th>Cabang</th><th class="angka">Stok</th><th></th></tr></thead>
        <tbody>${daftar.map(c => {
          const q = peta[c] ?? 0;
          const sini = c === APP_STATE.cabang;
          return `<tr>
            <td>${esc(c)}${sini ? ' <span class="lencana">cabang ini</span>' : ''}</td>
            <td class="angka" style="font-size:17px;font-weight:700;${q > 0 ? '' : 'color:var(--teks-redup)'}">${q}</td>
            <td>${q > 0 ? '<span class="lencana hijau">tersedia</span>' : '<span class="lencana">kosong</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`,
      `<button class="tombol" data-tutup="1">Tutup</button>
       <button class="tombol utama" id="btnCekStokTerkini" data-sku="${esc(sku)}">Cek terkini</button>`);
  };

  if (paksaSegar) {
    Admin.modal(`Stok — ${nama}`,
      '<p class="petunjuk">Menghitung ulang dari seluruh cabang… ini bisa memakan beberapa detik.</p>');
    try {
      const d = await API.cekStokTerkini({ sku });
      gambar(d.stok, d.waktu, true);
      await Sync.tarikStokSemuaCabang();
    } catch (e) {
      Admin.modal(`Stok — ${nama}`, `<div class="pesan galat">${esc(e.message)}</div>`);
    }
    return;
  }

  const rows = await Sync.stokCabangLain(sku);
  const waktu = await DB.kvGet('stok_cabang_diperbarui', null);
  gambar(rows, waktu, false);
}

async function tambahKeKeranjang(produk, qty = 1, satuan = null) {
  try {
    Keranjang.tambah(produk, {
      qty, satuan,
      daftarSatuan: produk.satuan_lain || [],
      daftarTier: produk.tier || []
    });
    gambarKeranjang();
  } catch (e) {
    alert(e.message);
  }
}

/* ==================== KERANJANG ==================== */

/** Baris tim di bawah rincian item — merah selagi belum lengkap. */
function gambarBarisTim(x) {
  const tim = x.tim || [];
  if (!x.butuh_tim && !tim.length) return '';
  const min = Math.max(2, Number(x.min_petugas) || 2);
  if (x.butuh_tim && tim.length < min) {
    return `<br><span style="color:var(--bahaya)">butuh ${min} petugas — baru ${tim.length}</span>`;
  }
  return `<br><span class="tanda-tier">tim: ${esc(tim.map(t => namaPetugas(t.kode)).join(', '))}</span>`;
}

/** Tombol Tim hanya muncul di baris yang memang relevan, bukan di semua baris. */
function tombolTimBaris(x) {
  const tim = x.tim || [];
  if (!x.butuh_tim && !tim.length) return '';
  const min = Math.max(2, Number(x.min_petugas) || 2);
  const kurang = x.butuh_tim && tim.length < min;
  return `<button data-aksi="tim" title="Petugas yang mengerjakan baris ini"${
    kurang ? ' style="color:var(--bahaya);font-weight:700"' : ''}>Tim</button>`;
}

function gambarKeranjang() {
  const b = Keranjang.baris;
  const t = Keranjang.total();

  $('#isiKeranjang').innerHTML = b.length ? b.map(x => `
    <div class="baris-item" data-id="${x.id}">
      <div>
        <div class="judul">${esc(x.nama)}</div>
        <div class="rinci">${x.qty} ${esc(x.satuan)} × ${rp(x.harga_satuan)}
          ${x.sumber_harga === 'tier' ? '<span class="tanda-tier">tier</span>' : ''}
          ${x.sumber_harga === 'satuan' ? '<span class="tanda-tier">' + esc(x.satuan) + '</span>' : ''}
          ${x.hargaManual ? '<span class="tanda-manual">manual</span>' : ''}
          ${x.diskon > 0 ? '<br>Diskon −' + rp(x.diskon) : ''}
          ${x.diskonDipotong ? '<br><span style="color:var(--peringatan)">diskon dipotong ke batas peran</span>' : ''}
          ${gambarBarisTim(x)}
        </div>
        <div class="aksi">
          <button data-aksi="kurang">−</button>
          <input type="number" value="${x.qty}" data-aksi="qty" min="0">
          <button data-aksi="tambah">+</button>
          ${tombolTimBaris(x)}
          <button data-aksi="detail">⋯</button>
        </div>
      </div>
      <div class="kanan">${rp(x.qty * x.harga_satuan - x.diskon)}</div>
    </div>`).join('')
    : '<p style="color:var(--teks-redup);text-align:center;padding:36px 0">Keranjang kosong</p>';

  $('#tSubtotal').textContent = rp(t.bruto);
  $('#tDiskon').textContent = rp(t.diskon_item + t.diskon_nota);
  $('#tPpn').textContent = rp(t.ppn);
  $('#tTotal').textContent = rp(t.total);
  $('#pegHitung').textContent = t.jumlah_item + ' item';
  $('#pegTotal').textContent = rp(t.total);
  $('#btnBayar').disabled = b.length === 0;
}

/* ==================== KLAIM PETUGAS ====================
 * Kolom `id_user` pada nota mencatat siapa yang MENGETIK. Di toko ini itu hampir
 * tidak pernah orang yang sama dengan yang MENJUAL — satu kasir menutup nota untuk
 * pekerjaan tiga pramuniaga. Bagian inilah yang memisahkan keduanya.
 *
 * Penjagaan di sini semata demi kejelasan bagi kasir; yang benar-benar menahan ada
 * di server (_susunKlaim), sama seperti pada diskon. Tapi tanpa penjagaan di layar,
 * kasir baru tahu notanya ditolak beberapa menit kemudian — saat pelanggannya sudah
 * pergi dan struknya sudah tercetak.
 */
const PERAN_TIM = ['PENJUAL', 'PEMASANG'];

/**
 * Petakan peran apa pun ke peran yang masih hidup.
 *
 * Master petugas bisa saja masih berisi PEMBANTU — selama belum dimigrasi, atau
 * selama perangkat ini belum menarik master baru. Tanpa pemetaan ini bobotnya
 * `undefined`, usulan poinnya jatuh ke 0, dan karena 0 terkirim sebagai angka
 * yang EKSPLISIT server menghormatinya: porsi omzet orang itu jadi 0%.
 *
 * PEMBANTU dilebur ke PEMASANG, sama seperti migrasinya di server — bukan ke
 * PENJUAL, supaya keduanya tidak saling bertentangan.
 */
const normalPeran = (p) => {
  const v = String(p || '').toUpperCase();
  return (v === 'PEMASANG' || v === 'PEMBANTU') ? 'PEMASANG' : 'PENJUAL';
};

const namaPetugas = (kode) =>
  (APP_STATE.daftarPetugas.find(p => p.kode === kode) || {}).nama || kode;

/** Isi dropdown pramuniaga di bar alat kasir. */
function gambarPilihanPetugas() {
  const sel = $('#selPetugas');
  if (!sel) return;
  const daftar = APP_STATE.daftarPetugas || [];
  const dipilih = Keranjang.petugasNota;

  // Toko yang belum mengisi daftar petugas tidak perlu melihat kolom yang selalu kosong.
  sel.classList.toggle('sembunyi', daftar.length === 0);
  $('#btnTimNota')?.classList.toggle('sembunyi', daftar.length === 0);
  if (!daftar.length) return;

  // Lebih dari satu orang tidak muat di satu dropdown — dalam keadaan itu kolomnya
  // menampilkan ringkasan dan penyuntingannya lewat tombol "Tim".
  if (dipilih.length > 1) {
    sel.innerHTML = `<option value="__tim__" selected>${esc(dipilih.length + ' pramuniaga')}</option>`;
    return;
  }
  const terpilih = (dipilih[0] || {}).kode || '';
  sel.innerHTML =
    `<option value="">${APP_STATE.klaimWajib ? '— pilih pramuniaga —' : 'Tanpa pramuniaga'}</option>` +
    daftar.map(p => `<option value="${esc(p.kode)}" ${p.kode === terpilih ? 'selected' : ''}>${
      esc(p.nama)}${p.peran_utama && p.peran_utama !== 'PENJUAL'
        ? ' · ' + esc(String(p.peran_utama).toLowerCase()) : ''}</option>`).join('');
}

/**
 * Penjagaan klaim di layar bayar.
 * @return {boolean} boleh dilanjutkan
 */
function gambarJagaKlaim() {
  const w = $('#byrJagaKlaim');
  if (!w) return true;
  const kurang = Keranjang.barisTimKurang();

  if (kurang.length) {
    w.innerHTML = `<div class="pesan peringatan">
      Baris berikut dikerjakan tim dan belum lengkap petugasnya:
      <ul style="margin:6px 0 0 18px">${kurang.map(b => `<li>${esc(b.nama)} — butuh ${
        Math.max(2, Number(b.min_petugas) || 2)} orang, terisi ${(b.tim || []).length}</li>`).join('')}</ul>
      <div style="margin-top:8px">Tutup layar ini, lalu tekan tombol <strong>Tim</strong> pada baris itu di keranjang.</div>
    </div>`;
    return false;
  }

  // Ada baris yang masih bergantung pada klaim nota?
  const adaSisa = Keranjang.baris.some(b => !(b.tim || []).length);
  if (APP_STATE.klaimWajib && adaSisa && !Keranjang.petugasNota.length) {
    w.innerHTML = `<div class="pesan galat">Nota ini belum ada pramuniaganya.
      Pilih siapa yang melayani di kolom pramuniaga pada layar kasir.</div>`;
    return false;
  }

  const daftar = Keranjang.petugasNota;
  w.innerHTML = daftar.length
    ? `<div class="pesan info">Diklaim oleh <strong>${
        esc(daftar.map(x => namaPetugas(x.kode)).join(', '))}</strong>${
        adaSisa ? '' : ' — seluruh baris sudah punya timnya sendiri, jadi klaim nota tidak dipakai.'}</div>`
    : '';
  return true;
}

/* ---------- Modal tim ---------- */

/** @param idBaris id baris keranjang, atau '#NOTA' untuk klaim seluruh nota. */
function bukaTim(idBaris) {
  const nota = idBaris === '#NOTA';
  const b = nota ? null : Keranjang.baris.find(x => x.id === idBaris);
  if (!nota && !b) return;
  if (!APP_STATE.daftarPetugas.length) {
    return alert('Daftar petugas masih kosong. Isi lebih dulu lewat menu Petugas.');
  }

  APP_STATE.timBaris = idBaris;
  const min = nota ? 1 : (b.butuh_tim ? Math.max(2, Number(b.min_petugas) || 2) : 1);
  // Poin bawaan pekerjaan ini — dari `poin_satuan` produk dikali qty dasarnya.
  const poinDasar = nota ? Keranjang.poinSisaNota() : Keranjang.poinBaris(idBaris);
  APP_STATE._timPoinDasar = poinDasar;

  $('#timJudul').textContent = nota ? 'Pramuniaga nota ini' : 'Tim — ' + b.nama;
  $('#timRingkas').innerHTML = `<p class="petunjuk">${nota
    ? 'Berlaku untuk seluruh baris yang <strong>tidak</strong> punya timnya sendiri.'
    : `Baris ini dikerjakan minimal <strong>${min}</strong> orang, dan karena itu keluar dari klaim nota.`}
    Pekerjaan ini bernilai <strong>${poinDasar} poin</strong> menurut master produk.
    Angka itu boleh diubah — jumlahnya tidak harus sama, dan tidak harus 100.
    Pembagian omzet mengikuti perbandingan poinnya.</p>
    ${poinDasar > 0 ? '' : `<div class="pesan info">Produk ini belum diberi nilai poin,
      jadi usulannya 0. Atur di menu Produk → tab <strong>Tim &amp; poin</strong>
      kalau pekerjaan ini memang layak dihitung.</div>`}`;

  const awal = nota ? Keranjang.petugasNota : Keranjang.timBaris(idBaris);
  APP_STATE._timDraft = awal.length
    ? awal.map(x => ({ kode: x.kode, peran: x.peran || '', poin: x.poin ?? '' }))
    : Array.from({ length: min }, () => ({ kode: '', peran: '', poin: '' }));
  if (!awal.length) _usulkanPoin();

  pesan('#pesanTim', '');
  gambarAnggotaTim();
  $('#tiraiTim').classList.add('tampil');
  setTimeout(() => $$('#timDaftar select[data-f=kode]')[0]?.focus(), 60);
}

/**
 * Usulkan pembagian poin menurut bobot peran, dibulatkan supaya jumlahnya persis
 * sama dengan nilai pekerjaannya. Hanya dipakai untuk MENGISI AWAL — begitu kasir
 * mengetik sendiri, angkanya tidak pernah ditimpa lagi.
 */
function _usulkanPoin() {
  const d = APP_STATE._timDraft || [];
  const total = Number(APP_STATE._timPoinDasar) || 0;
  const bobot = d.map(a => {
    const p = APP_STATE.daftarPetugas.find(x => x.kode === a.kode);
    const peran = normalPeran(a.peran || (p && p.peran_utama));
    return Math.max(Number((APP_STATE.bobotPeran || {})[peran]) || 0, 0.0001);
  });
  const jml = bobot.reduce((x, y) => x + y, 0);
  let sisa = total;
  d.forEach((a, i) => {
    if (i === d.length - 1) { a.poin = Math.round(sisa * 100) / 100; return; }
    const v = Math.round(total * bobot[i] / jml * 100) / 100;
    a.poin = v; sisa = Math.round((sisa - v) * 100) / 100;
  });
}

/* Dipisah dari gambarTotalPoin dengan alasan yang sama seperti gambarMetode():
   menggambar ulang seluruh daftar pada setiap ketukan akan menghancurkan elemen
   input yang sedang diketik, dan ketikan terasa macet. */
function gambarAnggotaTim() {
  const d = APP_STATE._timDraft || [];
  $('#timDaftar').innerHTML = d.map((a, i) => `
    <div class="baris-anak" style="display:grid;grid-template-columns:1fr auto 92px auto;gap:6px;align-items:end;margin-bottom:8px">
      <div><label>Petugas ${i + 1}</label>
        <select data-i="${i}" data-f="kode">
          <option value="">— pilih —</option>
          ${APP_STATE.daftarPetugas.map(p =>
            `<option value="${esc(p.kode)}" ${p.kode === a.kode ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}
        </select></div>
      <div><label>Peran</label>
        <select data-i="${i}" data-f="peran">
          ${PERAN_TIM.map(x => `<option value="${x}" ${a.peran === x ? 'selected' : ''}>${
            x.charAt(0) + x.slice(1).toLowerCase()}</option>`).join('')}
        </select></div>
      <div><label>Poin</label>
        <input type="number" inputmode="decimal" min="0" step="0.5"
               data-i="${i}" data-f="poin" value="${a.poin ?? ''}" placeholder="auto"></div>
      ${d.length > 1 ? `<button class="tombol bahaya" data-i="${i}" data-f="hapus" style="padding:11px 12px">×</button>` : '<span></span>'}
    </div>`).join('');
  gambarTotalPoin();
}

function gambarTotalPoin() {
  const d = APP_STATE._timDraft || [];
  const terisi = d.filter(a => String(a.poin).trim() !== '');
  const elP = $('#timTotalPoin');
  const elR = $('#timPorsi');

  if (!terisi.length) {
    elP.textContent = 'otomatis';
    elP.style.color = 'var(--teks-redup)';
    elR.textContent = 'menurut bobot peran';
    return;
  }

  const total = Math.round(terisi.reduce((a, x) => a + (Number(x.poin) || 0), 0) * 100) / 100;
  const adaNegatif = terisi.some(x => Number(x.poin) < 0);
  elP.textContent = total + ' poin';
  elP.style.color = adaNegatif ? 'var(--bahaya)' : 'var(--sukses)';

  /* Pembagian omzet diperlihatkan hidup — inilah yang membuat "poin juga membagi
     uang" terasa nyata, bukan cuma tertulis di petunjuk. */
  if (terisi.length !== d.length) { elR.textContent = 'isi poin semuanya dulu'; return; }
  if (total <= 0) { elR.textContent = 'menurut bobot peran'; return; }
  // Sebelum namanya dipilih, angka pembagian tidak berarti apa-apa — menampilkan
  // "? 50%" cuma memancing orang menafsirkannya sebagai nama yang gagal dimuat.
  if (d.some(a => !a.kode)) { elR.textContent = 'pilih petugasnya dulu'; return; }
  elR.textContent = d.map(a =>
    namaPetugas(a.kode).split(' ')[0] + ' ' +
    (Math.round(Number(a.poin) / total * 1000) / 10) + '%').join(' · ');
}

function simpanTim() {
  const d = (APP_STATE._timDraft || []).filter(a => a.kode);
  const nota = APP_STATE.timBaris === '#NOTA';
  const b = nota ? null : Keranjang.baris.find(x => x.id === APP_STATE.timBaris);

  if (!nota && !b) { $('#tiraiTim').classList.remove('tampil'); return; }

  const kode = d.map(a => a.kode);
  if (new Set(kode).size !== kode.length) {
    return pesan('#pesanTim', 'Ada petugas yang dipilih dua kali.', 'galat');
  }

  const min = nota ? 0 : (b.butuh_tim ? Math.max(2, Number(b.min_petugas) || 2) : 0);
  if (d.length < min) {
    return pesan('#pesanTim', `Baris ini butuh minimal ${min} petugas, baru terisi ${d.length}.`, 'galat');
  }

  const terisi = d.filter(a => String(a.poin).trim() !== '');
  if (terisi.length && terisi.length !== d.length) {
    return pesan('#pesanTim',
      'Poin harus diisi untuk semua petugas, atau dikosongkan semuanya.', 'galat');
  }
  if (terisi.some(x => Number(x.poin) < 0)) {
    return pesan('#pesanTim', 'Poin tidak boleh negatif.', 'galat');
  }

  /* Poin kosong dikirim sebagai undefined, BUKAN 0. Server membedakan keduanya:
     "tidak diisi" berarti bagikan poin bawaan produk menurut bobot peran,
     sedangkan "diisi nol" adalah keputusan sadar bahwa pekerjaan ini tidak
     berpoin — dan keputusan itu harus bertahan. */
  const bersih = d.map(a => ({
    kode: a.kode,
    peran: normalPeran(a.peran || (APP_STATE.daftarPetugas.find(p => p.kode === a.kode) || {}).peran_utama),
    poin: String(a.poin).trim() === '' ? undefined : Number(a.poin)
  }));

  if (nota) Keranjang.setPetugasNota(bersih);
  else Keranjang.setTimBaris(APP_STATE.timBaris, bersih);

  $('#tiraiTim').classList.remove('tampil');
  APP_STATE.timBaris = null;
  gambarPilihanPetugas();
  gambarKeranjang();
  if ($('#tiraiBayar').classList.contains('tampil')) gambarRingkasBayar();
}

/* ==================== PEMBAYARAN ==================== */
function bukaBayar() {
  if (Keranjang.kosong) return;
  if (!APP_STATE.idShift) {
    /* Dulu di sini hanya ada alert yang menunjuk nama menu lama. Menunya sudah
       berganti nama jadi "Perangkat", jadi pesannya mengarahkan ke tempat yang
       tidak ada — dan menu Setting memang tersembunyi bagi kasir. Sekarang
       pengguna langsung diantar ke kartu shift-nya. */
    if (confirm('Shift belum dibuka, jadi transaksi belum bisa disimpan.\n\nBuka shift sekarang?')) menujuBukaShift();
    return;
  }
  /* Mulai dari 0, BUKAN dari total nota. Kolom ini artinya "uang yang diterima",
     jadi mengisinya lebih dulu sama saja menjawabkan pertanyaan yang seharusnya
     dijawab kasir — dan kalau tidak diperhatikan, kembaliannya jadi salah.
     Untuk pembayaran pas, tombol "Uang pas" hanya sekali tekan. */
  APP_STATE.metodeBayar = [{ metode: 'tunai', jumlah: 0, referensi: '' }];
  APP_STATE.uuidNota = crypto.randomUUID ? crypto.randomUUID()
                     : 'X' + Date.now() + Math.random().toString(36).slice(2);
  APP_STATE.otorisasiDiskon = null;
  $('#byrDiskonNota').value = Keranjang.diskonNota;
  $('#byrJatuhTempo').value = '';
  pesan('#pesanBayar', '');
  pesan('#byrJagaKlaim', '');
  gambarBayar();
  $('#tiraiBayar').classList.add('tampil');
  setTimeout(() => $$('#byrDaftarMetode input[data-f=jumlah]')[0]?.select(), 60);
}

/* Pecahan rupiah yang beredar. Dipakai sebagai tombol tambah-cepat pada
   pembayaran tunai: kasir menekan pecahan yang diterima, bukan mengetik. */
const PECAHAN = [500, 1000, 2000, 5000, 10000, 20000, 50000, 75000, 100000];
/* Ditulis penuh dengan pemisah ribuan — bukan "100rb". Angka yang tertulis
   sama persis dengan yang tercetak di uangnya, jadi tidak perlu diterjemahkan
   di kepala saat sedang buru-buru. */
const labelPecahan = (n) => new Intl.NumberFormat(CONFIG.LOCALE).format(n);

/* CATATAN PENTING — jangan gabungkan lagi dua fungsi di bawah ini.
   Sebelumnya seluruh daftar metode digambar ulang lewat innerHTML pada SETIAP
   ketukan tombol di kolom Jumlah. Itu menghancurkan elemen input yang sedang
   diketik, sehingga fokus dan posisi kursor hilang dan ketikan terasa macet.
   Sekarang: gambarMetode() hanya dipanggil saat susunan barisnya berubah,
   sedangkan setiap ketukan cukup memanggil gambarRingkasBayar(). */
function gambarMetode() {
  $('#byrDaftarMetode').innerHTML = APP_STATE.metodeBayar.map((m, i) => `
    <div class="baris2" style="margin-bottom:8px;align-items:end">
      <div>
        <label>Metode ${i + 1}</label>
        <select data-i="${i}" data-f="metode">
          ${['tunai','transfer','qris','debit','kredit','piutang'].map(x =>
            `<option value="${x}" ${m.metode === x ? 'selected' : ''}>${x.toUpperCase()}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px;align-items:end">
        <div style="flex:1"><label>Jumlah</label>
          <input type="number" inputmode="numeric" data-i="${i}" data-f="jumlah" value="${m.jumlah}"></div>
        ${i > 0 ? `<button class="tombol bahaya" data-i="${i}" data-f="hapus" style="padding:11px 12px">×</button>` : ''}
      </div>
    </div>
    ${m.metode === 'tunai' ? `
    <div class="pecahan" role="group" aria-label="Uang diterima (metode ${i + 1})">
      ${PECAHAN.map(n => `<button type="button" class="cip" data-i="${i}" data-f="pecahan"
          data-nilai="${n}" title="Tambah ${rp(n)}">${labelPecahan(n)}</button>`).join('')}
      <button type="button" class="cip pas" data-i="${i}" data-f="pas">Uang pas</button>
      <button type="button" class="cip kosong" data-i="${i}" data-f="nol" title="Nolkan">C</button>
    </div>` : ''}`).join('');
}

function gambarBayar() { gambarMetode(); gambarRingkasBayar(); }

function gambarRingkasBayar() {
  const t = Keranjang.total();
  $('#byrTotal').textContent = rp(t.total);

  const dibayar = APP_STATE.metodeBayar.reduce((a, m) => a + Number(m.jumlah || 0), 0);
  const selisih = dibayar - t.total;
  const adaPiutang = APP_STATE.metodeBayar.some(m => m.metode === 'piutang');

  $('#byrDibayar').textContent = rp(dibayar);
  $('#byrLabelSisa').textContent = selisih >= 0 ? 'Kembali' : 'Kurang';
  $('#byrSisa').textContent = rp(Math.abs(selisih));
  $('#byrSisa').style.color = selisih < 0 ? 'var(--bahaya)' : 'var(--sukses)';
  $('#grupJatuhTempo').classList.toggle('sembunyi', !adaPiutang);
  $('#btnSelesaikan').disabled = !adaPiutang && selisih < 0;

  if (!gambarJagaDiskon()) $('#btnSelesaikan').disabled = true;
  if (!gambarJagaKlaim())  $('#btnSelesaikan').disabled = true;

  if (adaPiutang && !Keranjang.pelanggan) {
    pesan('#pesanBayar', 'Penjualan piutang wajib memilih pelanggan terlebih dahulu.', 'galat');
    $('#btnSelesaikan').disabled = true;
  }
}

/* ==================== PENJAGA DISKON ====================
 * Batas `diskon_maks_persen` milik peran diukur dari TOTAL diskon (baris + nota)
 * terhadap bruto. Di atas batas itu, nota hanya bisa lanjut setelah seorang
 * atasan menyetujuinya lewat server.
 *
 * Penjagaan di sini semata demi kejelasan bagi kasir. Yang benar-benar menahan
 * ada di server (_periksaDiskon): perangkat kasir tidak boleh jadi tempat
 * keputusan izin, karena isi perangkat bisa diubah pemakainya.
 *
 * @return {boolean} boleh dilanjutkan
 */
function gambarJagaDiskon() {
  const w = $('#byrJagaDiskon');
  const persen = Keranjang.persenDiskon();
  const maks = Number(APP_STATE.diskonMaks || 0);
  const bulat = Math.round(persen * 100) / 100;

  // Persetujuan hangus bila diskonnya dinaikkan setelah disetujui — kalau tidak,
  // izin untuk 10% bisa dipakai untuk 60%. Server memeriksa hal yang sama.
  const ot = APP_STATE.otorisasiDiskon;
  if (ot && persen > ot.persen + 0.001) APP_STATE.otorisasiDiskon = null;

  if (persen <= maks + 0.001) {
    APP_STATE.otorisasiDiskon = null;         // tidak diperlukan lagi
    w.innerHTML = '';
    return true;
  }

  if (APP_STATE.otorisasiDiskon) {
    w.innerHTML = `<div class="pesan sukses">Diskon ${bulat}% disetujui oleh
      <strong>${esc(APP_STATE.otorisasiDiskon.penyetuju)}</strong>.</div>`;
    return true;
  }

  if (!API.online) {
    w.innerHTML = `<div class="pesan galat">Diskon ${bulat}% melebihi batas Anda (${maks}%),
      dan persetujuan atasan tidak bisa diminta selagi jaringan mati.
      Turunkan diskonnya, atau tunggu koneksi kembali.</div>`;
    return false;
  }

  w.innerHTML = `<div class="pesan peringatan" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span style="flex:1;min-width:180px">Diskon ${bulat}% melebihi batas Anda (${maks}%).</span>
      <button class="tombol kecil utama" id="btnMintaOtorisasi">Minta persetujuan</button>
    </div>`;
  return false;
}

function bukaOtorisasiDiskon() {
  const t = Keranjang.total();
  const persen = Math.round(Keranjang.persenDiskon() * 100) / 100;
  $('#otRingkas').innerHTML = `<div class="pesan info">
      Nota ${rp(t.bruto)} · diskon ${rp(t.diskon_item + t.diskon_nota)}
      (<strong>${persen}%</strong>) · dibayar ${rp(t.total)}</div>`;
  $('#otUser').value = '';
  $('#otPin').value = '';
  pesan('#pesanOtorisasi', '');
  $('#tiraiOtorisasi').classList.add('tampil');
  setTimeout(() => $('#otUser').focus(), 60);
}

async function kirimOtorisasiDiskon() {
  const btn = $('#btnKirimOtorisasi');
  const t = Keranjang.total();
  const persen = Keranjang.persenDiskon();
  btn.disabled = true;
  pesan('#pesanOtorisasi', '');
  try {
    const d = await API.otorisasiDiskon({
      username: $('#otUser').value.trim(),
      pin: $('#otPin').value,
      uuid: APP_STATE.uuidNota,
      persen: persen,
      nilai: t.diskon_item + t.diskon_nota,
      alasan: $('#otAlasan').value.trim()
    });
    APP_STATE.otorisasiDiskon = { id: d.id_otorisasi, penyetuju: d.penyetuju, persen: persen };
    $('#otPin').value = '';                    // jangan tinggalkan PIN di layar
    $('#tiraiOtorisasi').classList.remove('tampil');
    gambarRingkasBayar();
  } catch (e) {
    $('#otPin').value = '';
    pesan('#pesanOtorisasi', e.message, 'galat');
    $('#otPin').focus();
  }
  btn.disabled = false;
}

async function selesaikanTransaksi() {
  const btn = $('#btnSelesaikan');
  btn.disabled = true;
  try {
    const t = Keranjang.total();
    const uid = APP_STATE.uuidNota || (crypto.randomUUID ? crypto.randomUUID()
              : 'X' + Date.now() + Math.random().toString(36).slice(2));
    // Cadangan bila daftar cabang belum tersinkron: pakai kode cabang apa adanya.
    const prefix = (await DB.kvGet('cabang_list', [])).find(c => c.kode === APP_STATE.cabang)?.prefix
                   || APP_STATE.cabang;
    const noNota = await nomorNotaBerikutnya(prefix, APP_STATE.perangkat.kode);

    // Uang tunai yang melebihi total adalah kembalian — yang dicatat hanya sebesar nota.
    const dibayar = APP_STATE.metodeBayar.reduce((a, m) => a + Number(m.jumlah || 0), 0);
    const kembali = Math.max(0, dibayar - t.total);
    const mdrQris = Number(APP_STATE.setting.mdr_qris || 0);

    let sisaKembali = kembali;
    const bayar = APP_STATE.metodeBayar.map(m => {
      let jml = Number(m.jumlah || 0);
      if (m.metode === 'tunai' && sisaKembali > 0) {
        const potong = Math.min(sisaKembali, jml);
        jml -= potong; sisaKembali -= potong;
      }
      return {
        metode: m.metode, jumlah: Math.round(jml), referensi: m.referensi || '',
        biaya_mdr: m.metode === 'qris' ? Math.round(jml * mdrQris / 100) : 0
      };
    }).filter(m => m.jumlah > 0);

    const dok = Keranjang.dokumen({
      uuid: uid, no_nota: noNota, id_shift: APP_STATE.idShift,
      bayar, jatuh_tempo: $('#byrJatuhTempo').value,
      id_otorisasi: APP_STATE.otorisasiDiskon?.id || ''
    });

    // 1) Simpan lokal  2) antre kirim  3) cetak. Kasir tidak menunggu server.
    const arsip = { ...dok, status_sync: 'PENDING', _total: t,
                    _kembali: kembali, _nama_pelanggan: Keranjang.pelanggan?.nama || '' };
    await DB.put('penjualan', arsip);
    await Sync.antrikanPenjualan(dok);

    $('#tiraiBayar').classList.remove('tampil');
    Keranjang.kosongkan();
    $('#selPelanggan').value = '';
    $('#selLevel').value = 'eceran';
    gambarPilihanPetugas();
    gambarKeranjang();
    $('#inpCari').value = '';
    $('#inpCari').focus();

    /* Urutannya penting: stok lokal dikurangi DULU, baru daftarnya digambar.
       Kalau dibalik, kartu produk masih memperlihatkan stok sebelum penjualan —
       barang terakhir tetap tertulis "stok 1" sampai ada yang memicu gambar ulang. */
    try { await kurangiStokLokal(dok); }
    catch (e) { console.warn('Stok lokal gagal dikurangi:', e.message); }
    await gambarProduk('');

    try { await Struk.cetak({ ...arsip, _offline: !API.online }); }
    catch (e) {
      // Dulu hanya console.warn: kasir mengira struk tercetak padahal tidak.
      Admin.toast('Nota tersimpan, tapi gagal dicetak: ' + e.message, 'galat');
    }
  } catch (e) {
    pesan('#pesanBayar', 'Gagal: ' + e.message, 'galat');
  } finally {
    btn.disabled = false;
  }
}

/** Kurangi perkiraan stok lokal agar tampilan tetap masuk akal selama offline. */
async function kurangiStokLokal(dok) {
  for (const it of dok.item) {
    const key = it.sku + '|' + (it.kode_varian || '');
    const s = await DB.get('stok', key);
    if (s) { s.qty -= it.qty * it.faktor; await DB.put('stok', s); }
  }
}

/* ==================== SHIFT ==================== */

/* Antar pengguna ke satu kartu di layar Perangkat, lalu sorot sebentar supaya
   jelas yang mana. Lebih baik daripada menyebut nama menu di dalam pesan:
   namanya bisa berubah, dan sebagian peran tidak melihat menu yang disebut. */
function menujuKartu(idLayar, idKartu, selektorFokus) {
  bukaLayar(idLayar);
  const kartu = document.getElementById(idKartu);
  if (!kartu) return;
  kartu.scrollIntoView({ block: 'center', behavior: 'smooth' });
  kartu.classList.remove('sorot');
  void kartu.offsetWidth;              // paksa reflow agar animasi bisa diulang
  kartu.classList.add('sorot');
  if (selektorFokus) setTimeout(() => $(selektorFokus)?.focus(), 350);
}

function menujuBukaShift() { menujuKartu('shift', 'kartuShift', '#inpKasAwal'); }

async function periksaShift() {
  try {
    const d = await API.shiftAktif();
    APP_STATE.idShift = d.aktif ? d.id_shift : null;
    await DB.kvSet('id_shift', APP_STATE.idShift);
  } catch (e) {
    APP_STATE.idShift = await DB.kvGet('id_shift', null);   // offline: pakai shift terakhir
  }
  const lnc = $('#lncShift');
  const perluBuka = !APP_STATE.idShift;
  lnc.textContent = perluBuka ? 'Shift belum dibuka' : 'Shift aktif';
  lnc.className = 'lencana ' + (perluBuka ? 'kuning bisa-klik' : 'hijau');
  /* Saat belum dibuka, lencana ini jadi jalan pintas — bukan sekadar keterangan. */
  if (perluBuka) {
    lnc.setAttribute('role', 'button');
    lnc.setAttribute('tabindex', '0');
    lnc.title = 'Klik untuk membuka shift';
  } else {
    lnc.removeAttribute('role'); lnc.removeAttribute('tabindex'); lnc.removeAttribute('title');
  }
  $('#infoShift').innerHTML = APP_STATE.idShift
    ? `<span class="lencana hijau">Aktif</span> <code>${esc(APP_STATE.idShift)}</code>`
    : '<span class="lencana kuning">Belum dibuka</span>';
}

/* ==================== LAPORAN ==================== */
async function tampilkanLaporan() {
  const w = $('#hasilLaporan');
  w.innerHTML = '<div class="kartu">Memuat…</div>';
  try {
    const par = { dari: $('#lapDari').value, sampai: $('#lapSampai').value };
    const d = await API.laporanPenjualan(par);
    const r = d.ringkas;
    w.innerHTML = `
      <div class="kartu"><div class="bar-alat"><strong>Unduh laporan ini</strong>
        <div style="flex:1"></div>
        ${Admin.tombolEkspor('penjualan', par)}
      </div></div>
      <div class="petak">
        <div class="kartu statistik"><div class="label">Jumlah nota</div><div class="nilai">${r.jumlah_nota}</div></div>
        <div class="kartu statistik"><div class="label">Omzet</div><div class="nilai">${rp(r.total)}</div></div>
        ${r.laba_kotor !== undefined ? `<div class="kartu statistik"><div class="label">Laba kotor</div><div class="nilai">${rp(r.laba_kotor)}</div></div>` : ''}
        <div class="kartu statistik"><div class="label">Diskon</div><div class="nilai">${rp(r.diskon)}</div></div>
      </div>
      <div class="kartu"><h3>Per metode bayar</h3>
        <table><tr><th>Metode</th><th class="angka">Jumlah</th><th class="angka">Biaya MDR</th></tr>
        ${d.per_metode.map(m => `<tr><td>${esc(m.metode.toUpperCase())}</td><td class="angka">${rp(m.jumlah)}</td><td class="angka">${rp(m.mdr)}</td></tr>`).join('')}</table></div>
      <div class="kartu"><h3>Per cabang</h3>
        <table><tr><th>Cabang</th><th class="angka">Nota</th><th class="angka">Total</th>${d.per_cabang[0]?.laba_kotor !== undefined ? '<th class="angka">Laba kotor</th>' : ''}</tr>
        ${d.per_cabang.map(c => `<tr><td>${esc(c.cabang)}</td><td class="angka">${c.nota}</td><td class="angka">${rp(c.total)}</td>${c.laba_kotor !== undefined ? `<td class="angka">${rp(c.laba_kotor)}</td>` : ''}</tr>`).join('')}</table></div>
      <div class="kartu"><h3>Produk terlaris</h3>
        <table><tr><th>SKU</th><th>Nama</th><th class="angka">Qty</th><th class="angka">Omzet</th>${d.produk_teratas[0]?.margin_persen !== undefined ? '<th class="angka">Margin</th>' : ''}</tr>
        ${d.produk_teratas.slice(0, 25).map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.nama)}</td><td class="angka">${p.qty}</td><td class="angka">${rp(p.omzet)}</td>${p.margin_persen !== undefined ? `<td class="angka">${p.margin_persen}%</td>` : ''}</tr>`).join('')}</table></div>`;
  } catch (e) {
    w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
  }
}

/**
 * Tombol unduh laporan keuangan — dikerjakan server agar angkanya pasti sama dengan di layar.
 * Memakai komponen yang sama dengan layar lain (Admin.tombolEkspor), bukan salinan sendiri:
 * dulu berkas ini punya versi kembarnya, dan dua salinan berarti dua tempat yang harus
 * diingat setiap kali bentuk tombolnya berubah.
 */
const tombolUnduh = (jenis, par) => `<div class="kartu"><div class="bar-alat">
  <strong>Unduh laporan ini</strong><div style="flex:1"></div>
  ${Admin.tombolEkspor(jenis, par)}
</div></div>`;

async function tampilkanLabaRugi() {
  const w = $('#hasilKeuangan');
  w.innerHTML = '<div class="kartu">Menghitung…</div>';
  try {
    const par = { periode: $('#keuPeriode').value, cabang: $('#keuCabang').value };
    const d = await API.labaRugi(par);
    const brs = (l, n, kelas = '') => `<tr class="${kelas}"><td>${esc(l)}</td><td class="angka">${rp(n)}</td></tr>`;
    w.innerHTML = tombolUnduh('laba_rugi', par) + `<div class="kartu"><h3>Laba Rugi — ${esc(d.periode)} · ${esc(d.cabang)}</h3><table>
      ${brs('Penjualan Bruto', d.penjualan_bruto)}
      ${brs('(−) Diskon Penjualan', -d.diskon_penjualan)}
      ${brs('(−) Retur Penjualan', -d.retur_penjualan)}
      ${brs('Penjualan Bersih', d.penjualan_bersih, 'tebal pisah')}
      ${brs('(−) Harga Pokok Penjualan', -d.hpp)}
      ${brs('LABA KOTOR (' + d.margin_kotor_persen + '%)', d.laba_kotor, 'tebal pisah')}
      <tr class="pisah"><td colspan="2" style="color:var(--teks-redup);font-size:12px">BEBAN OPERASIONAL</td></tr>
      ${d.rincian_beban.map(b => brs('  ' + b.kode + ' ' + b.nama, -b.jumlah)).join('')}
      ${brs('Total Beban Operasional', -d.beban_operasional, 'tebal')}
      ${brs('LABA USAHA', d.laba_usaha, 'tebal pisah')}
      ${brs('(+) Pendapatan Lain', d.pendapatan_lain)}
      ${brs('(−) Beban Lain', -d.beban_lain)}
      ${brs('LABA BERSIH (' + d.margin_bersih_persen + '%)', d.laba_bersih, 'tebal pisah')}
      </table></div>`;
  } catch (e) { w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

async function tampilkanNeraca() {
  const w = $('#hasilKeuangan');
  w.innerHTML = '<div class="kartu">Menghitung…</div>';
  try {
    const par = { periode: $('#keuPeriode').value, cabang: $('#keuCabang').value };
    const d = await API.neraca(par);
    const tabel = (judul, arr, total) => `<div class="kartu"><h3>${judul}</h3><table>
      ${arr.map(a => `<tr><td>${esc(a.kode)} ${esc(a.nama)}</td><td class="angka">${rp(a.jumlah)}</td></tr>`).join('')}
      <tr class="tebal pisah"><td>TOTAL</td><td class="angka">${rp(total)}</td></tr></table></div>`;
    w.innerHTML = tombolUnduh('neraca', par) + `
      <div class="pesan ${d.seimbang ? 'sukses' : 'galat'}">
        ${d.seimbang ? '✓ Neraca seimbang' : '✗ Neraca TIDAK seimbang — selisih ' + rp(d.selisih)}
      </div>
      <div class="petak">${tabel('ASET', d.aset, d.total_aset)}
      <div>${tabel('LIABILITAS', d.liabilitas, d.total_liabilitas)}${tabel('EKUITAS', d.ekuitas, d.total_ekuitas)}</div></div>`;
  } catch (e) { w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

async function tampilkanUji() {
  const w = $('#hasilKeuangan');
  w.innerHTML = '<div class="kartu">Memeriksa…</div>';
  try {
    const d = await API.ujiKebenaran({ periode: $('#keuPeriode').value });
    w.innerHTML = `<div class="kartu"><h3>Uji kebenaran pembukuan — ${esc(d.periode)}</h3>
      <table><tr><th>Pemeriksaan</th><th>Nilai</th><th>Hasil</th></tr>
      ${d.hasil.map(h => `<tr><td>${esc(h.uji)}</td><td>${esc(h.nilai)}</td>
        <td class="${h.lulus ? 'uji-lulus' : 'uji-gagal'}">${h.lulus ? 'LULUS' : 'GAGAL'}</td></tr>`).join('')}
      </table></div>`;
  } catch (e) { w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

async function gambarRiwayat() {
  const semua = await DB.all('penjualan');
  const hariIni = tanggalLokal();
  const rows = semua.filter(n => n.tanggal === hariIni).sort((a, b) => b.jam.localeCompare(a.jam));
  $('#isiRiwayat').innerHTML = rows.length ? `<table>
    <tr><th>No Nota</th><th>Jam</th><th class="angka">Total</th><th>Sinkron</th><th></th></tr>
    ${rows.map(n => `<tr><td>${esc(n.no_nota)}</td><td>${esc(n.jam)}</td>
      <td class="angka">${rp(n.total)}</td>
      <td><span class="lencana ${n.status_sync === 'SYNCED' ? 'hijau' : 'kuning'}">${n.status_sync === 'SYNCED' ? 'terkirim' : 'menunggu'}</span></td>
      <td><button class="tombol" data-cetak="${esc(n.uuid)}" style="padding:5px 10px;font-size:13px">Cetak ulang</button></td>
    </tr>`).join('')}</table>` : '<p style="color:var(--teks-redup)">Belum ada nota hari ini.</p>';
}

async function perbaruiInfoData() {
  const umur = await Sync.umurDataJam();
  const tertahan = await DB.outboxJumlah();
  const stokWaktu = await DB.kvGet('stok_diperbarui', null);
  $('#infoData').innerHTML =
    `Data master: ${umur === Infinity ? 'belum pernah' : umur.toFixed(1) + ' jam lalu'}<br>
     Stok: ${stokWaktu ? new Date(stokWaktu).toLocaleString(CONFIG.LOCALE) : '—'}<br>
     Antrian kirim: <strong>${tertahan}</strong> dokumen`;
  $('#infoPerangkat').innerHTML =
    `Kode: <strong>${esc(APP_STATE.perangkat?.kode || '—')}</strong><br>${esc(APP_STATE.perangkat?.nama || '')}`;
  const pr = await DB.kvGet('printer_nama', null);
  $('#infoPrinter').textContent = pr ? 'Tersimpan: ' + pr : 'Belum terhubung';
}

/* ==================== EVENT ==================== */
function pasangEvent() {

  /* --- login --- */
  $('#titikPin') && gambarPin();
  $$('.papan-pin button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.pin;
    if (v === 'hapus') pinBuffer = pinBuffer.slice(0, -1);
    else if (v === 'masuk') return login(false);
    else if (pinBuffer.length < 6) pinBuffer += v;
    gambarPin();
    if (pinBuffer.length === 6) login(false);
  }));
  $('#btnLoginPassword').addEventListener('click', () => login(true));
  $('#inpPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(true); });
  $('#btnTukarMode').addEventListener('click', () => {
    const pin = $('#modePin').classList.toggle('sembunyi');
    $('#modePassword').classList.toggle('sembunyi', !pin);
    $('#btnTukarMode').textContent = pin ? 'Masuk dengan PIN' : 'Masuk dengan password';
  });

  /* --- navigasi --- */
  $('#navSisi').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) bukaLayar(b.dataset.layar);
  });
  $('#btnLaci').innerHTML = '<svg class="ikon-svg" viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/></svg>';
  $('#btnKeluar').innerHTML = '<svg class="ikon-svg" viewBox="0 0 24 24"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9"/></svg>';
  $('#btnLaci').addEventListener('click', () =>
    $('#sisi').classList.contains('buka') ? tutupLaci() : bukaLaci());
  $('#tiraiSisi').addEventListener('click', tutupLaci);
  // Gambar ikonnya sekarang juga, jangan tunggu sesi dimulai — kalau tidak, tombolnya
  // sempat tampil kosong dan terlihat seperti bug.
  terapkanLipat(false, false);
  $('#btnLipat').addEventListener('click', () =>
    terapkanLipat(!$('#app').classList.contains('sisi-lipat')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#sisi').classList.contains('buka')) tutupLaci();
    if (e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      terapkanLipat(!$('#app').classList.contains('sisi-lipat'));
    }
  });

  $('#btnKeluar').addEventListener('click', async () => {
    const tertahan = await DB.outboxJumlah();
    if (tertahan > 0 && !confirm(`Masih ada ${tertahan} nota belum terkirim. Nota tetap tersimpan di perangkat ini. Tetap keluar?`)) return;
    try { await API.logout(); } catch (e) {}
    await DB.kvSet('token', null);
    location.reload();
  });

  /* --- pencarian & produk --- */
  let timerCari;
  $('#inpCari').addEventListener('input', e => {
    clearTimeout(timerCari);
    timerCari = setTimeout(() => gambarProduk(e.target.value), 120);
  });
  // Kategori digambar seketika, tanpa jeda: ini pilihan yang ditekan sekali,
  // bukan ketikan yang datang beruntun.
  $('#kasirKategori').addEventListener('change', () => gambarProduk($('#inpCari').value));
  $('#inpCari').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      /* Scanner barcode mengetik sangat cepat lalu langsung menekan Enter —
         jauh di bawah jeda 120ms. Tanpa dua baris di bawah ini, Enter datang
         SEBELUM daftar sempat disaring, sehingga `produkTampil` masih berisi
         hasil pencarian sebelumnya dan yang masuk keranjang adalah produk yang
         sama sekali lain. Jadi: batalkan jeda, saring dulu, baru ambil. */
      clearTimeout(timerCari);
      const kueri = e.target.value;
      if (kueri.trim()) await gambarProduk(kueri);
      // gambarProduk mengosongkan kolom sendiri bila barcode-nya cocok persis
      // dan barangnya sudah masuk keranjang — tidak perlu ditambah dua kali.
      if (!$('#inpCari').value.trim() && kueri.trim()) return;
      const p = APP_STATE.produkTampil[APP_STATE.indeksSorot];
      if (p) { await tambahKeKeranjang(p); $('#inpCari').value = ''; gambarProduk(''); }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = APP_STATE.produkTampil.length;
      APP_STATE.indeksSorot = (APP_STATE.indeksSorot + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      $$('.kartu-produk').forEach((el, i) => el.classList.toggle('sorot', i === APP_STATE.indeksSorot));
      $$('.kartu-produk')[APP_STATE.indeksSorot]?.scrollIntoView({ block: 'nearest' });
    }
  });
  $('#daftarProduk').addEventListener('click', async e => {
    // Tombol "cabang lain" berada di dalam kartu — jangan sampai ikut menambah ke keranjang
    const btnLain = e.target.closest('[data-stok-cabang]');
    if (btnLain) { e.stopPropagation(); return lihatStokCabangLain(btnLain.dataset.stokCabang); }

    const k = e.target.closest('.kartu-produk'); if (!k) return;
    const p = await DB.get('produk', k.dataset.sku);
    if (p) await tambahKeKeranjang(p);
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('#btnCekStokTerkini');
    if (b) lihatStokCabangLain(b.dataset.sku, true);
  });

  $('#selLevel').addEventListener('change', e => { Keranjang.setLevel(e.target.value); gambarKeranjang(); gambarProduk($('#inpCari').value); });
  $('#selPelanggan').addEventListener('change', async e => {
    const p = e.target.value ? await DB.get('pelanggan', e.target.value) : null;
    Keranjang.setPelanggan(p);
    // Keranjang.level sudah dinormalkan; menyetel <select> dengan nilai mentah
    // ('reseller' dari pelanggan lama) menghasilkan selectedIndex -1 — kotaknya
    // tampak KOSONG dan kasir tidak tahu harga mana yang sedang dipakai.
    if (p) $('#selLevel').value = Keranjang.level;
    gambarKeranjang(); gambarProduk($('#inpCari').value);
  });

  /* --- klaim petugas --- */
  $('#selPetugas').addEventListener('change', e => {
    // '__tim__' hanyalah label ringkasan saat notanya dibagi ke beberapa orang;
    // memilihnya berarti membuka kembali dialognya, bukan mengubah apa pun.
    if (e.target.value === '__tim__') return bukaTim('#NOTA');
    Keranjang.setPetugasNota(e.target.value ? [{ kode: e.target.value }] : []);
    gambarPilihanPetugas();
    if ($('#tiraiBayar').classList.contains('tampil')) gambarRingkasBayar();
  });
  $('#btnTimNota').addEventListener('click', () => bukaTim('#NOTA'));

  $('#btnBatalTim').addEventListener('click', () => {
    $('#tiraiTim').classList.remove('tampil');
    APP_STATE.timBaris = null;
  });
  $('#btnSimpanTim').addEventListener('click', simpanTim);
  $('#btnTambahAnggota').addEventListener('click', () => {
    (APP_STATE._timDraft = APP_STATE._timDraft || []).push({ kode: '', peran: '', poin: '' });
    gambarAnggotaTim();
  });
  $('#timDaftar').addEventListener('click', e => {
    const b = e.target.closest('button[data-f=hapus]');
    if (!b) return;
    APP_STATE._timDraft.splice(Number(b.dataset.i), 1);
    gambarAnggotaTim();
  });
  /* 'input' untuk kolom poin (tiap ketukan hanya memperbarui ringkasannya, daftarnya
     tidak digambar ulang), 'change' untuk dropdown yang memang mengubah susunan. */
  $('#timDaftar').addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (f !== 'poin') return;
    const a = APP_STATE._timDraft[Number(e.target.dataset.i)];
    a.poin = e.target.value;
    a._manual = true;              // sekali diketik, usulan tidak pernah menimpanya
    gambarTotalPoin();
  });
  $('#timDaftar').addEventListener('change', e => {
    const f = e.target.dataset.f, i = Number(e.target.dataset.i);
    if (f !== 'kode' && f !== 'peran') return;
    const a = APP_STATE._timDraft[i];
    a[f] = e.target.value;
    // Peran mengikuti peran utama petugas begitu namanya dipilih — kecuali kasir
    // sudah mengubahnya sendiri.
    if (f === 'kode' && !a._peranManual) {
      a.peran = normalPeran((APP_STATE.daftarPetugas.find(p => p.kode === a.kode) || {}).peran_utama);
    }
    if (f === 'peran') a._peranManual = true;
    // Perannya menentukan bobot, jadi usulan poin ikut dihitung ulang — kecuali
    // untuk baris yang poinnya sudah diketik sendiri.
    if (!APP_STATE._timDraft.some(x => x._manual)) _usulkanPoin();
    gambarAnggotaTim();
  });

  /* --- keranjang --- */
  $('#isiKeranjang').addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const id = e.target.closest('.baris-item').dataset.id;
    const b = Keranjang.baris.find(x => x.id === id);
    if (btn.dataset.aksi === 'tambah') Keranjang.ubahQty(id, b.qty + 1);
    if (btn.dataset.aksi === 'kurang') Keranjang.ubahQty(id, b.qty - 1);
    if (btn.dataset.aksi === 'tim')    return bukaTim(id);
    if (btn.dataset.aksi === 'detail') return bukaDetailItem(b);
    gambarKeranjang();
  });
  $('#isiKeranjang').addEventListener('change', e => {
    if (e.target.dataset.aksi !== 'qty') return;
    // Nilai dikirim mentah — Keranjang.ubahQty yang membedakan "kosong" dari "nol".
    Keranjang.ubahQty(e.target.closest('.baris-item').dataset.id, e.target.value);
    gambarKeranjang();
  });
  $('#btnKosongkan').addEventListener('click', () => {
    if (Keranjang.kosong || confirm('Kosongkan keranjang?')) {
      Keranjang.kosongkan(); $('#selPelanggan').value = ''; $('#selLevel').value = 'eceran';
      gambarPilihanPetugas(); gambarKeranjang();
    }
  });
  $('#pegangan').addEventListener('click', () => $('#panelKeranjang').classList.toggle('buka'));

  /* --- detail item --- */
  let itemAktif = null;
  function bukaDetailItem(b) {
    itemAktif = b;
    $('#itmNama').textContent = b.nama;
    $('#itmQty').value = b.qty;
    $('#itmHarga').value = b.harga_satuan;
    $('#itmHarga').disabled = !APP_STATE.flag.ubah_harga_saat_jual;
    $('#itmDiskon').value = b.diskon;
    const satuanLain = [{ nama: b._produk.satuan || 'pcs', isi: 1 }, ...(b._produk.satuan_lain || [])];
    $('#itmSatuan').innerHTML = satuanLain.map(s =>
      `<option value="${esc(s.nama)}" ${s.nama === b.satuan ? 'selected' : ''}>${esc(s.nama)} (isi ${s.isi})</option>`).join('');
    $('#itmInfo').textContent =
      `Sumber harga: ${b.sumber_harga} · batas diskon peran Anda ${APP_STATE.diskonMaks}%` +
      (APP_STATE.flag.ubah_harga_saat_jual ? '' : ' · Anda tidak berhak mengubah harga');
    $('#tiraiItem').classList.add('tampil');
  }
  $('#btnSimpanItem').addEventListener('click', () => {
    if (!itemAktif) return;
    const satuanBaru = $('#itmSatuan').value;
    if (satuanBaru !== itemAktif.satuan) {
      // Ganti satuan = hapus lalu tambah ulang agar harga & faktor dihitung dari awal
      const p = itemAktif._produk;
      Keranjang.hapus(itemAktif.id);
      Keranjang.tambah(p, { qty: Number($('#itmQty').value), satuan: satuanBaru,
                            daftarSatuan: p.satuan_lain || [], daftarTier: p.tier || [] });
    } else {
      Keranjang.ubahQty(itemAktif.id, Number($('#itmQty').value));
      if (APP_STATE.flag.ubah_harga_saat_jual) Keranjang.ubahHarga(itemAktif.id, $('#itmHarga').value);
      Keranjang.ubahDiskon(itemAktif.id, $('#itmDiskon').value);
    }
    $('#tiraiItem').classList.remove('tampil');
    gambarKeranjang();
  });
  $('#btnHapusItem').addEventListener('click', () => {
    if (itemAktif) Keranjang.hapus(itemAktif.id);
    $('#tiraiItem').classList.remove('tampil');
    gambarKeranjang();
  });

  /* --- pembayaran --- */
  $('#btnBayar').addEventListener('click', bukaBayar);
  $('#btnBatalBayar').addEventListener('click', () => $('#tiraiBayar').classList.remove('tampil'));
  $('#btnTambahMetode').addEventListener('click', () => {
    const t = Keranjang.total().total;
    const sudah = APP_STATE.metodeBayar.reduce((a, m) => a + Number(m.jumlah || 0), 0);
    APP_STATE.metodeBayar.push({ metode: 'transfer', jumlah: Math.max(0, t - sudah), referensi: '' });
    gambarBayar();
  });
  $('#byrDaftarMetode').addEventListener('input', e => {
    const i = Number(e.target.dataset.i), f = e.target.dataset.f;
    if (f !== 'jumlah') return;
    APP_STATE.metodeBayar[i].jumlah = Number(e.target.value);
    // Hanya ringkasannya yang diperbarui — kolom yang sedang diketik JANGAN disentuh.
    gambarRingkasBayar();
  });
  $('#byrDaftarMetode').addEventListener('change', e => {
    const i = Number(e.target.dataset.i), f = e.target.dataset.f;
    if (f !== 'metode') return;
    APP_STATE.metodeBayar[i].metode = e.target.value;
    gambarBayar();          // barisnya berubah susunan (deret pecahan muncul/hilang)
  });
  $('#byrDaftarMetode').addEventListener('click', e => {
    const t = e.target.closest('[data-f]');
    if (!t) return;
    const f = t.dataset.f, i = Number(t.dataset.i);
    const m = APP_STATE.metodeBayar[i];

    if (f === 'hapus') { APP_STATE.metodeBayar.splice(i, 1); return gambarBayar(); }
    if (!m) return;

    if (f === 'pecahan')   m.jumlah = Number(m.jumlah || 0) + Number(t.dataset.nilai);
    else if (f === 'nol')  m.jumlah = 0;
    else if (f === 'pas') {
      // "Uang pas" = sisa yang belum tertutup metode lain, bukan total nota.
      const lain = APP_STATE.metodeBayar.reduce((a, x, j) => j === i ? a : a + Number(x.jumlah || 0), 0);
      m.jumlah = Math.max(0, Keranjang.total().total - lain);
    } else return;

    const inp = $(`#byrDaftarMetode input[data-f=jumlah][data-i="${i}"]`);
    if (inp) inp.value = m.jumlah;     // isi kolomnya langsung, tanpa gambar ulang
    gambarRingkasBayar();
  });
  $('#byrDiskonNota').addEventListener('input', e => {
    Keranjang.setDiskonNota(e.target.value);
    /* Jumlah uang yang diterima TIDAK ikut diubah di sini. Diskon mengubah yang
       harus dibayar, bukan yang sudah dipegang kasir; menimpanya akan menghapus
       angka yang barusan diketik. */
    gambarKeranjang(); gambarRingkasBayar();
  });
  $('#btnSelesaikan').addEventListener('click', selesaikanTransaksi);

  /* --- persetujuan diskon --- */
  $('#byrJagaDiskon').addEventListener('click', e => {
    if (e.target.id === 'btnMintaOtorisasi') bukaOtorisasiDiskon();
  });
  $('#btnBatalOtorisasi').addEventListener('click', () => {
    $('#otPin').value = '';
    $('#tiraiOtorisasi').classList.remove('tampil');
  });
  $('#btnKirimOtorisasi').addEventListener('click', kirimOtorisasiDiskon);
  $('#otPin').addEventListener('keydown', e => { if (e.key === 'Enter') kirimOtorisasiDiskon(); });
  $('#otAlasan').addEventListener('keydown', e => { if (e.key === 'Enter') kirimOtorisasiDiskon(); });

  /* --- shift --- */
  $('#lncShift').addEventListener('click', () => { if (!APP_STATE.idShift) menujuBukaShift(); });
  $('#lncShift').addEventListener('keydown', (e) => {
    if (!APP_STATE.idShift && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); menujuBukaShift(); }
  });
  $('#btnBukaShift').addEventListener('click', async () => {
    try {
      const d = await API.bukaShift({ kas_awal: Number($('#inpKasAwal').value) });
      APP_STATE.idShift = d.id_shift;
      await DB.kvSet('id_shift', d.id_shift);
      await periksaShift();
      alert('Shift dibuka: ' + d.id_shift);
    } catch (e) { alert('Gagal membuka shift: ' + e.message); }
  });
  $('#btnTutupShift').addEventListener('click', async () => {
    if (!APP_STATE.idShift) return alert('Tidak ada shift aktif.');
    const tertahan = await DB.outboxJumlah();
    if (tertahan > 0) {
      if (!confirm(`Masih ada ${tertahan} nota belum terkirim. Angka kas sistem bisa belum lengkap. Lanjutkan?`)) return;
    }
    $('#tsHasil').innerHTML = '';
    $('#tiraiTutupShift').classList.add('tampil');
  });
  $('#btnBatalTutup').addEventListener('click', () => $('#tiraiTutupShift').classList.remove('tampil'));
  $('#btnKonfirmasiTutup').addEventListener('click', async () => {
    try {
      const d = await API.tutupShift({ id_shift: APP_STATE.idShift,
        kas_fisik: Number($('#tsKasFisik').value), catatan: $('#tsCatatan').value });
      $('#tsHasil').innerHTML = `<div class="pesan ${Math.abs(d.selisih) < 1 ? 'sukses' : 'galat'}">
        Kas sistem ${rp(d.kas_sistem)} · fisik ${rp(d.kas_fisik)}<br>
        <strong>Selisih ${rp(d.selisih)}</strong><br>
        ${d.jumlah_nota} nota · omzet ${rp(d.total_penjualan)}</div>`;
      APP_STATE.idShift = null;
      await DB.kvSet('id_shift', null);
      await periksaShift();
    } catch (e) { $('#tsHasil').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
  });

  /* --- pengaturan --- */
  $('#btnHubungkanPrinter').addEventListener('click', async () => {
    try { const n = await Struk.hubungkanBluetooth(); alert('Terhubung: ' + n); perbaruiInfoData(); }
    catch (e) { alert('Gagal: ' + e.message); }
  });
  $('#btnUjiCetak').addEventListener('click', () => {
    Struk.cetak({
      no_nota: 'UJI-CETAK', tanggal: tanggalLokal(), jam: new Date().toTimeString().substring(0, 8),
      level_harga: 'eceran', kode_pelanggan: '',
      item: [{ nama: 'Uji cetak struk', qty: 1, satuan: 'pcs', harga_satuan: 1000, diskon: 0 }],
      diskon_nota: 0, ppn: 0, total: 1000,
      bayar: [{ metode: 'tunai', jumlah: 1000 }],
      _total: { bruto: 1000, diskon_item: 0 }, _kembali: 0
    });
  });
  $('#btnTarikMaster').addEventListener('click', async () => {
    try { await Sync.tarikMaster(true); await Sync.tarikStok(); await muatMaster(); await gambarProduk(''); alert('Data master diperbarui.'); }
    catch (e) { alert('Gagal: ' + e.message); }
  });
  $('#btnKirimSekarang').addEventListener('click', async () => { await Sync.kirim(); await perbaruiInfoData(); });

  /* Master baru turun — dari tombol "Tarik ulang", dari sinkron berkala, atau
     setelah petugas disimpan di back office. Tanpa penyegaran ini, nama yang baru
     ditambahkan tidak muncul di layar kasir sampai aplikasinya dimuat ulang. */
  document.addEventListener('master:diperbarui', async () => {
    try { APP_STATE.daftarPetugas = await DB.all('petugas'); }
    catch (e) { return; }
    gambarPilihanPetugas();
  });

  $('#btnGantiPin').addEventListener('click', async () => {
    const baru = $('#pinBaru').value;
    if (!/^\d{6}$/.test(baru)) return pesan('#pesanGantiPin', 'PIN baru harus 6 digit angka.', 'galat');
    try {
      await API.gantiPin({ pin_lama: $('#pinLama').value, pin_baru: baru });
      $('#pinLama').value = ''; $('#pinBaru').value = '';
      pesan('#pesanGantiPin', 'PIN berhasil diganti.', 'sukses');
    } catch (e) { pesan('#pesanGantiPin', e.message, 'galat'); }
  });

  /* --- laporan --- */
  $('#btnLaporan').addEventListener('click', tampilkanLaporan);
  $('#btnLabaRugi').addEventListener('click', tampilkanLabaRugi);
  $('#btnNeraca').addEventListener('click', tampilkanNeraca);
  $('#btnUji').addEventListener('click', tampilkanUji);
  $('#btnTutupBuku').addEventListener('click', async () => {
    const periode = $('#keuPeriode').value;
    if (!confirm(`Kunci periode ${periode}? Setelah dikunci, tidak ada transaksi baru yang bisa masuk ke periode itu — koreksi harus lewat periode berjalan.`)) return;
    try {
      await API.tutupBuku({ periode });
      Admin.toast('Periode ' + periode + ' dikunci.');
    } catch (e) {
      $('#hasilKeuangan').innerHTML = `<div class="pesan galat">${esc(e.message)}
        ${e.detail ? `<ul style="margin:8px 0 0 16px">${e.detail.map(h =>
          `<li>${esc(h.uji)} — ${esc(h.nilai)}</li>`).join('')}</ul>` : ''}</div>`;
    }
  });

  $('#isiRiwayat').addEventListener('click', async e => {
    const uuid = e.target.dataset?.cetak; if (!uuid) return;
    const n = await DB.get('penjualan', uuid);
    if (n) Struk.cetak({ ...n, _offline: n.status_sync !== 'SYNCED' });
  });

  /* --- status sinkronisasi --- */
  document.addEventListener('sync:status', e => {
    const s = e.detail;
    const el = $('#lncSync');
    if (!API.online)          { el.textContent = 'Offline'; el.className = 'lencana merah'; }
    else if (s.mengirim)      { el.textContent = 'Mengirim…'; el.className = 'lencana kuning'; }
    else if (s.tertahan > 0)  { el.textContent = s.tertahan + ' menunggu'; el.className = 'lencana kuning'; }
    else                      { el.textContent = 'Tersinkron'; el.className = 'lencana hijau'; }
    if (s.tertahan >= CONFIG.PERINGATAN_OUTBOX) {
      el.textContent = '⚠ ' + s.tertahan + ' tertahan'; el.className = 'lencana merah';
    }
    /* Nota yang DITOLAK server tidak lagi dihitung "menunggu", jadi tanpa baris
       ini lencana kembali hijau seolah semuanya beres — padahal ada uang yang
       tidak pernah sampai ke pembukuan. Ini harus menang atas status lain. */
    if (s.ditolak > 0) {
      el.textContent = '⚠ ' + s.ditolak + ' nota ditolak';
      el.className = 'lencana merah bisa-klik';
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
      el.title = 'Klik untuk melihat nota yang ditolak server';
    } else {
      el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('title');
    }
  });
  $('#lncSync').addEventListener('click', () => { if (Sync.status.ditolak > 0) tampilkanDitolak(); });
  $('#lncSync').addEventListener('keydown', e => {
    if (Sync.status.ditolak > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tampilkanDitolak(); }
  });
  document.addEventListener('koneksi:berubah', () => document.dispatchEvent(
    new CustomEvent('sync:status', { detail: Sync.status })));
  document.addEventListener('sesi:berakhir', () => {
    alert('Sesi berakhir. Silakan login ulang. Nota yang belum terkirim tetap aman di perangkat ini.');
    location.reload();
  });
  document.addEventListener('stok:diperbarui', () => gambarProduk($('#inpCari').value));
  document.addEventListener('stok_cabang:diperbarui', () => gambarProduk($('#inpCari').value));

  /* --- pintasan keyboard (kasir PC bisa bekerja tanpa mouse) --- */
  document.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); $('#inpCari').focus(); $('#inpCari').select(); }
    if (e.key === 'F12') { e.preventDefault(); bukaBayar(); }
    if (e.key === 'Escape') $$('.tirai').forEach(t => t.classList.remove('tampil'));
    if (e.key === 'Enter' && $('#tiraiBayar').classList.contains('tampil')
        && !$('#btnSelesaikan').disabled && e.target.tagName !== 'SELECT') {
      e.preventDefault(); selesaikanTransaksi();
    }
  });
}

/* ==================== MULAI ==================== */
(async function mulai() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW gagal:', e));
  }
  await DB.buka();
  pasangEvent();
  Admin.pasang();

  const hariIni = tanggalLokal();
  $('#lapDari').value = hariIni;
  $('#lapSampai').value = hariIni;
  $('#keuPeriode').value = hariIni.substring(0, 7);

  pasangPenandaSibuk();

  // Coba lanjutkan sesi yang tersimpan (termasuk saat offline)
  const token = await DB.kvGet('token', null);
  const sesi = await DB.kvGet('sesi', null);
  if (token && sesi) {
    API.setToken(token);
    await mulaiSesi(sesi);
  } else {
    $('#inpUsername').focus();
  }
})();
