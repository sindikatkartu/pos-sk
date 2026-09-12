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
  uuidNota: null, otorisasiDiskon: null,
  /* Lencana nav: { <id layar>: <berapa yang menunggu tindakan> }. Diisi
     `tarikLencanaNav()`, dibaca penggambar nav dan flyout. Kosong = tidak ada
     yang menunggu ATAU belum sempat ditarik; keduanya digambar sama, dan itu
     disengaja — lihat catatan di `tarikLencanaNav`. */
  lencanaNav: {}
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const rp = (n) => CONFIG.MATA_UANG + ' ' + new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(Number(n) || 0));
/**
 * Lolos-kan teks untuk HTML — termasuk kutip TUNGGAL.
 *
 * Kutip tunggal ditambahkan v1.63. Sebelumnya hanya & < > dan kutip ganda yang
 * ditutup, sementara satu-satunya atribut berkutip tunggal di seluruh frontend
 * justru diisi lewat sini: `data-params='${p}'` pada tombol ekspor (admin.js).
 * Nilai yang masuk ke sana hari ini terbatas bentuknya — kode cabang dan
 * `input[type=date]` — jadi belum bisa dieksploitasi. Tapi yang membuatnya aman
 * bukan pembantunya, melainkan kebetulan; dan pembantu bernama `esc` akan
 * dipakai orang berikutnya untuk atribut mana pun.
 */
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/**
 * Kasir sebagaimana ditampilkan: NAMA orangnya, dengan kodenya di belakang.
 *
 * Yang disimpan di setiap nota adalah `id_user` (U004), dan itu benar — nama
 * berubah, kode tidak. Tapi yang dibaca manusia harus nama: admin yang membaca
 * "U004" harus menghafal peta kode ke orang, dan peta hafalan adalah tempat
 * kekeliruan lahir tanpa diketahui siapa pun.
 *
 * Kodenya TIDAK dibuang, hanya diredupkan. Dua orang bisa bernama sama, dan
 * kode itulah satu-satunya yang membedakan mereka — juga satu-satunya yang bisa
 * dicocokkan dengan log audit.
 */
function kasirTampil(o) {
  const x = o || {};
  const kode = String(x.id_user || '');
  const nama = String(x.nama || '') || kode;
  if (!kode) return esc(nama);
  if (nama === kode) return esc(kode);
  return esc(nama) + ' <span class="kode-redup">' + esc(kode) + '</span>';
}

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
  // Kas: digantung pada `kas.buat`, bukan `.lihat`. Layar ini gunanya MENCATAT uang
  // laci yang keluar/masuk di luar penjualan — ongkos kirim, beli galon, setoran ke
  // bank. Tanpa layar ini `kas_sistem` di tutup shift tidak pernah cocok dengan uang
  // fisik, dan selisihnya dibukukan sebagai beban/pendapatan yang tidak pernah ada.
  { id: 'kas',        label: 'Kas',        grup: 'Penjualan',  izin: ['kas', 'buat'] },
  // Retur: digambar admin.js, tapi BUKAN back office — kasir wajib bisa mengaksesnya.
  { id: 'retur',      label: 'Retur Jual', grup: 'Penjualan',  izin: ['retur', 'buat'],              admin: true },
  { id: 'produk',     label: 'Produk',     grup: 'Persediaan', izin: ['produk', 'buat'],             admin: true, backoffice: true },
  { id: 'stok',       label: 'Stok',       grup: 'Persediaan', izin: ['laporan_stok', 'lihat'],      admin: true, backoffice: true },
  { id: 'transfer',   label: 'Transfer',   grup: 'Persediaan', izin: ['transfer', 'lihat'],          admin: true, backoffice: true },
  // Permintaan digantung pada `permintaan.lihat`, bukan `.buat`: admin gudang
  // MEMPROSES permintaan tanpa pernah boleh membuatnya, dan menu yang digantung
  // pada `.buat` akan menyembunyikan seluruh daftar pekerjaannya.
  { id: 'permintaan', label: 'Permintaan', grup: 'Persediaan', izin: ['permintaan', 'lihat'],        admin: true, backoffice: true },
  { id: 'opname',     label: 'Opname',     grup: 'Persediaan', izin: ['opname', 'buat'],             admin: true, backoffice: true },
  { id: 'pembelian',  label: 'Pembelian',  grup: 'Persediaan', izin: ['pembelian', 'lihat'],         admin: true, backoffice: true },
  { id: 'returbeli',  label: 'Retur Beli', grup: 'Persediaan', izin: ['pembelian', 'buat'],          admin: true, backoffice: true },
  /* Satu layar, dua tabel — jadi namanya harus jujur "Mitra", bukan "Pelanggan".
     `izinAtau`: pintunya terbuka bagi pemegang izin pelanggan ATAU supplier.
     Digantung pada `pelanggan.ubah` saja, Staf Gudang — yang punya supplier:'*'
     tanpa izin pelanggan — terkunci di luar dari master yang justru urusannya. */
  { id: 'mitra',      label: 'Mitra',      grup: 'Relasi',     izin: ['pelanggan', 'ubah'],
    izinAtau: [['pelanggan', 'ubah'], ['supplier', 'ubah']],                    admin: true, backoffice: true },
  // Petugas digantung pada `petugas.buat`, bukan `.lihat` — kasir memang butuh
  // `petugas.lihat` untuk memilih pramuniaga di layar kasir, tapi tidak boleh
  // membuka master petugas. Pola yang sama dipakai menu Produk.
  { id: 'petugas',    label: 'Petugas',    grup: 'Relasi',     izin: ['petugas', 'buat'],            admin: true, backoffice: true },
  { id: 'piutang',    label: 'Piutang',    grup: 'Relasi',     izin: ['piutang', 'lihat'],           admin: true, backoffice: true },
  // Utang ke supplier — pasangan Piutang, ditambahkan 5 Sep 2026. Sebelumnya
  // pembelian kredit menaikkan saldo Utang Usaha tanpa satu pun layar untuk
  // melunasinya.
  { id: 'utang',      label: 'Utang',      grup: 'Relasi',     izin: ['utang', 'lihat'],             admin: true, backoffice: true },
  { id: 'laporan',    label: 'Laporan',    grup: 'Laporan',    izin: ['laporan_penjualan', 'lihat'] },
  /* Label 'Poin & Performa' sejak 9 Sep 2026 — dulu 'Poin', lalu 'Performa'.
     Dua kali berganti karena dua kali salah arah: "Poin" menyempitkan isinya
     (ada omzet, nota, peringkat cabang), sementara "Performa" menyembunyikan
     justru hal yang paling dicari orang saat membuka layar ini. Nama yang
     menyebut keduanya bisa ditemukan lewat kata mana pun. */
  // Id, kunci izin `laporan_poin`, wadah #isiPoin dan jenis ekspor 'poin'
  // SENGAJA tidak ikut berganti: mengganti id memutus rute layar, dan
  // mengganti kunci izin mencabut akses semua peran yang punya.
  { id: 'poin',       label: 'Poin & Performa', grup: 'Laporan',    izin: ['laporan_poin', 'lihat'],      admin: true, backoffice: true },
  { id: 'keuangan',   label: 'Keuangan',   grup: 'Laporan',    izin: ['laporan_keuangan', 'lihat'] },
  { id: 'diskon',     label: 'Diskon',     grup: 'Laporan',    izin: ['laporan_penjualan', 'lihat'], admin: true, backoffice: true },
  { id: 'pengguna',   label: 'Pengguna',   grup: 'Sistem',     izin: ['user', 'lihat'],              admin: true, backoffice: true },
  { id: 'cabang',     label: 'Cabang',     grup: 'Sistem',     izin: ['cabang', 'lihat'],            admin: true, backoffice: true },
  { id: 'sistem',     label: 'Pengaturan Sistem', grup: 'Sistem',     izin: ['setting', 'lihat'],           admin: true, backoffice: true },
  { id: 'audit',      label: 'Audit',      grup: 'Sistem',     izin: ['audit', 'lihat'],             admin: true, backoffice: true },
  { id: 'arsip',      label: 'Arsip',      grup: 'Sistem',     izin: ['setting', 'hapus'],           admin: true, backoffice: true },
  /* `popover: true` — tiga baris ini tidak lagi berdiri di nav sejak v1.148.0;
     mereka menghuni popover kartu pengguna di kaki sidebar. Grupnya tetap
     'Akun' karena `kelompokMenu` masih memakainya untuk urutan, dan karena
     mencabut grupnya akan membuat mereka jatuh ke 'Lainnya' kalau suatu hari
     penyaring popovernya dilepas. */
  { id: 'akun',       label: 'Akun saya',  grup: 'Akun',       izin: null, popover: true },  // selalu tampil
  { id: 'tentang',    label: 'Tentang',    grup: 'Akun',       izin: null, popover: true },  // selalu tampil
  // Manual book & SOP — statis dalam aplikasi, jadi tetap terbaca saat internet
  // mati. Selalu tampil karena kasir baru justru paling butuh ini di hari pertama,
  // saat perannya belum tentu dibekali akses ke menu lain.
  /* Bantuan TIDAK ikut ke popover, atas keputusan pemilik 9 Sep 2026. Alasannya
     sama dengan alasan ia selalu tampil: kasir baru paling membutuhkannya di
     hari pertama, dan sesuatu yang harus ditemukan dulu di balik popover bukan
     sesuatu yang bisa diandalkan hari itu. `mandiri: true` — ia berdiri sendiri
     di kaki nav, dipisah garis, tanpa judul kelompok yang cuma mengulang
     namanya sendiri. */
  { id: 'bantuan',    label: 'Bantuan',    grup: 'Akun',       izin: null, mandiri: true },  // selalu tampil
  { id: 'pengaturan', label: 'Perangkat & Printer', grup: 'Akun',  izin: null, popover: true }   // selalu tampil
];

/** Urutan kelompok di sidebar. Menu bergrup lain (kalau ada) diletakkan di akhir. */
/* 'Akun' dipisah dari 'Sistem': "Akun saya", "Bantuan", "Perangkat" dan
   "Tentang" adalah urusan PRIBADI pemakai — selalu tampil untuk semua peran —
   sementara Sistem berisi pengaturan yang mengubah keadaan seluruh toko.
   Mencampurnya membuat kelompok Sistem panjang dan isinya tidak sederajat. */
const URUT_GRUP = ['Ringkasan', 'Penjualan', 'Persediaan', 'Relasi', 'Laporan', 'Sistem', 'Akun'];

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
      <div style="font-size:var(--fs-13);margin-top:4px">${esc(o.pesan_galat || 'Tanpa keterangan')}</div>
      <div class="meta-kecil">Dicoba ${o.percobaan || 0}x · ${esc(waktuTampil(o.dibuat).substring(0, 14))}</div>
      <button class="tombol kecil" data-kirim-ulang="${esc(o.uuid)}"
              style="margin-top:8px">Kirim ulang</button>
    </div>`).join('');
  Admin.modal('Nota ditolak server', `
    <p>Nota berikut sudah tercatat di perangkat ini tapi <strong>ditolak server</strong>,
       jadi belum masuk pembukuan. Tunjukkan daftar ini ke pemilik — sebagian butuh
       tindakan di sisi server dulu (mis. periode yang sudah ditutup).</p>
    <p class="petunjuk"><strong>Sesudah sebabnya dibereskan, kirim ulang dari sini —
       jangan diketik ulang di kasir.</strong> Kiriman ulang membawa nomor nota, jam,
       shift, dan pembayaran yang ASLI; nota baru membawa nomor dan jam hari ini,
       sehingga struk yang sudah di tangan pelanggan tidak lagi cocok dengan
       pembukuan. Server menolak uuid yang sama dua kali, jadi menekan tombol ini
       tidak bisa menggandakan notanya.</p>
    ${isi}`);
}

/**
 * Kembalikan satu nota yang DITOLAK ke antrean kirim.
 *
 * Penolakan yang sebabnya di sisi server — periode terkunci, izin peran yang
 * lupa dicentang, setelan `izinkan_stok_minus` yang mati — akan berulang persis
 * sama sampai ada manusia yang mengubah sesuatu. Itulah kenapa jatah
 * percobaannya habis dan statusnya jadi DITOLAK. Begitu manusianya mengubahnya,
 * satu-satunya jalan yang tersisa sampai sekarang adalah mengetik ulang notanya
 * di kasir — dan itu melahirkan nota kedua dengan nomor dan jam yang berbeda,
 * sementara nota aslinya tetap hilang dari pembukuan.
 *
 * Aman diulang: `apiKirimPenjualan` mengenali uuid yang sudah ada dan
 * memasukkannya ke daftar `duplikat`, bukan menulisnya dua kali.
 */
async function kirimUlangDitolak(uuid) {
  const o = await DB.get('outbox', uuid);
  if (!o) return Admin.toast('Nota itu sudah tidak ada di antrean perangkat ini.', 'galat');
  o.status = 'PENDING';
  o.percobaan = 0;
  /* `pesan_galat` SENGAJA tidak dikosongkan di sini. Setiap jalan yang membuat
     notanya tetap tertolak — penolakan per dokumen maupun penolakan setingkat
     paket — sudah menimpanya dengan alasan yang baru di sync.js, dan jalan yang
     TIDAK menimpanya (jaringan mati) juga tidak menampilkannya di mana pun
     karena notanya keluar dari daftar DITOLAK. Baris pengosongan di sini pernah
     ada dan terbukti tidak bisa dibuat merah oleh mutasi mana pun: kode yang
     tidak bisa gagal bukan penjagaan, ia hiasan. */
  await DB.put('outbox', o);
  await Sync.kirim();

  const lagi = await DB.get('outbox', uuid);
  if (lagi && lagi.status === 'SYNCED') {
    Admin.toast('Nota ' + (o.dokumen?.no_nota || uuid) + ' masuk pembukuan.', 'sukses');
  } else if (lagi && lagi.pesan_galat) {
    /* Ditolak lagi → LANGSUNG kembali ke DITOLAK, tidak menunggu jatah tiga
       percobaan habis.
       Tiga percobaan itu untuk antrean yang berjalan sendiri: penolakan pertama
       bisa saja gara-gara keadaan yang lewat sendiri. Percobaan yang diminta
       MANUSIA bukan itu — manusianya sudah membetulkan sesuatu lalu menekan
       tombol, dan jawabannya sudah didapat. Membiarkannya PENDING berarti
       lencana kembali KUNING "1 menunggu" selama satu menit berikutnya: rupanya
       persis sama dengan antrean sehat, padahal tidak ada yang berubah. Diam
       adalah kegagalan terburuk di sistem kasir. */
    lagi.status = 'DITOLAK';
    await DB.put('outbox', lagi);
    Admin.toast('Masih ditolak: ' + lagi.pesan_galat, 'galat');
  } else {
    /* Tidak terkirim DAN tidak ditolak — jaringannya yang mati. Ini justru
       keadaan yang jatah percobaannya memang untuk itu: biarkan PENDING. */
    Admin.toast('Nota dikembalikan ke antrean kirim.');
  }
  const sisa = await DB.outboxDitolak();
  if (sisa.length) return tampilkanDitolak();
  Admin.tutupModal();
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
/**
 * SATU BENTUK TABEL untuk seluruh aplikasi.
 *
 * Tata letak kartu di HP (`@media (max-width: 620px)`) berdiri di atas dua hal:
 * baris kepala berada di dalam `<thead>` supaya bisa disembunyikan, dan setiap
 * sel membawa `data-l` supaya nama kolomnya bisa dicetak di depan nilainya.
 * `Admin.tabel` selalu memenuhi keduanya. Sembilan belas tabel yang ditulis
 * tangan — Riwayat, Laporan, Keuangan, Shift, Kas, Neraca, dan modal-modalnya —
 * tidak satu pun memenuhinya.
 *
 * Akibatnya di HP tabel lebar tetap jadi tabel lebar. Dan karena `.gulir-x`
 * sengaja dimatikan penggulingannya di lebar itu (isinya semestinya sudah jadi
 * kartu), tabelnya tidak bisa digulir juga: ia MENDORONG kartunya keluar layar.
 * Dilaporkan pemilik 1 Sep 2026 di layar "Laporan shift" — kartunya 570px di
 * layar 390px, dan sisanya terpotong diam-diam.
 *
 * Diperbaiki di SATU tempat, bukan sembilan belas: setiap tabel yang masuk ke
 * halaman dirapikan begitu digambar. Yang sudah benar dilewati, dan tabel yang
 * ditulis besok ikut terjaga tanpa perlu diingat — alasan yang sama dengan
 * `pasangPenandaSibuk()` di bawah ini.
 */
function rapikanTabel(akar) {
  if (!akar || akar.nodeType !== 1) return;
  const daftar = [];
  if (akar.matches && akar.matches('table:not([data-rapi])')) daftar.push(akar);
  if (akar.querySelectorAll) daftar.push(...akar.querySelectorAll('table:not([data-rapi])'));

  for (const t of daftar) {
    t.dataset.rapi = '1';

    /* Baris kepala yang ditulis sebagai `<tr><th>` langsung di bawah tabelnya
       masuk ke `<tbody>` menurut penguraian HTML, bukan ke `<thead>`. Ia jadi
       baris biasa: tidak tersembunyi di HP, dan ikut terbawa saat tabelnya
       diurutkan. Syaratnya SEMUA selnya `<th>` — satu `<td>` di antaranya
       berarti itu baris data, bukan kepala. */
    if (!t.tHead) {
      const pertama = t.rows[0];
      if (pertama && pertama.cells.length &&
          [...pertama.cells].every(sel => sel.tagName === 'TH')) {
        t.createTHead().appendChild(pertama);
      }
    }
    if (!t.tHead || !t.tHead.rows[0]) continue;

    const judul = [...t.tHead.rows[0].cells].map(sel => sel.textContent.trim());
    for (const tb of t.tBodies) {
      for (const baris of tb.rows) {
        [...baris.cells].forEach((sel, i) => {
          /* Sel ber-colspan adalah baris keadaan kosong ("Belum ada data"); ia
             tidak sejajar dengan kolom mana pun dan sudah punya aturannya
             sendiri di CSS. */
          if (sel.hasAttribute('data-l') || sel.hasAttribute('colspan')) return;
          sel.dataset.l = judul[i] || '';
        });
      }
    }
  }
}

/**
 * Pengawas yang menjalankan `rapikanTabel` pada apa pun yang baru digambar.
 *
 * Diletakkan di satu pengawas, bukan dipanggil di puluhan tempat `innerHTML`
 * diisi: yang dipanggil di puluhan tempat selalu terlupa di tempat yang
 * kedua puluh satu. Biayanya kecil — hanya simpul yang BARU ditambahkan yang
 * disisir, dan tabel yang sudah dirapikan ditandai supaya tidak disentuh lagi.
 */
function pasangPengawasTabel() {
  rapikanTabel(document.body);
  rapikanTanggal(document.body);
  new MutationObserver((daftarUbah) => {
    for (const u of daftarUbah) for (const n of u.addedNodes) {
      rapikanTabel(n);
      rapikanTanggal(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

/* ==================== KOLOM TANGGAL: DD/MM/YYYY ====================
 *
 * Keluhan pemilik, 2 Sep 2026: "input date kok masih mm/dd/yyyy … saya orang
 * indonesia binggung jika melihat tampilan mm/dd/yyyy."
 *
 * Sebabnya BUKAN aplikasi ini. Chrome menggambar `input[type=date]` menurut
 * BAHASA PERAMBAN — bukan `lang` dokumen, bukan `lang` elemennya. Ketiganya
 * sudah diuji satu per satu, dan Chrome berbahasa Inggris tetap menggambar
 * mm/dd/yyyy pada ketiganya.
 *
 * Menyusun ulang ruasnya lewat CSS (`order` pada
 * `::-webkit-datetime-edit-*-field`) MEMANG mengubah rupanya — dan itu jebakan
 * yang hampir saya kirim. Urutan PENGETIKAN tidak ikut berpindah: layarnya
 * menyorot ruas "dd" sementara angka yang diketik masuk ke ruas bulan.
 * Terbukti: mengetik 25 12 2026 menghasilkan nilai `122026-02-05`. Tanggal yang
 * salah diam-diam jauh lebih mahal daripada tanggal yang urutannya asing.
 *
 * Jadi kolomnya diganti: satu kotak teks biasa yang menerima dan menampilkan
 * DD/MM/YYYY, dengan tombol kalender yang memanggil pemilih tanggal BAWAAN
 * lewat `showPicker()`.
 *
 * Yang TIDAK berubah, dan inilah kenapa cara ini dipilih:
 *   - Elemen `input[type=date]` aslinya TETAP ADA di DOM, dengan id yang sama.
 *     Seluruh kode yang membaca `$('#lapDari').value` tidak perlu tahu apa pun.
 *   - Nilainya tetap `yyyy-MM-dd`, format yang dibaca server.
 *   - Menyetel `.value` dari kode (tombol rentang cepat, misalnya) ikut
 *     memperbarui tampilannya — lihat pembungkus properti di bawah.
 */

/** `yyyy-MM-dd` -> `DD/MM/YYYY`; nilai tak dikenal jadi string kosong. */
function _isoKeRupa(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * `DD/MM/YYYY` -> `yyyy-MM-dd`, atau '' bila belum lengkap / tidak masuk akal.
 *
 * Tanggal DIPERIKSA, bukan sekadar disusun ulang: 31/02/2026 bukan tanggal, dan
 * menyusunnya jadi `2026-02-31` menghasilkan rentang yang diam-diam kosong di
 * server tanpa satu pun pesan.
 */
function _rupaKeIso(v) {
  const a = String(v || '').match(/\d/g);
  if (!a || a.length !== 8) return '';
  const d = a.slice(0, 2).join(''), b = a.slice(2, 4).join(''), t = a.slice(4).join('');
  const iso = `${t}-${b}-${d}`;
  const cek = new Date(iso + 'T00:00:00');
  if (isNaN(cek.getTime())) return '';
  /* `new Date('2026-02-31')` tidak melempar — ia menggeser ke 3 Maret. Yang
     membuktikan tanggalnya nyata adalah ketiga komponennya kembali utuh. */
  if (cek.getFullYear() !== Number(t) || cek.getMonth() + 1 !== Number(b) ||
      cek.getDate() !== Number(d)) return '';
  return iso;
}

/** Sisipkan garis miring saat mengetik, tanpa mengganggu penghapusan. */
function _ketikTanggal(teks) {
  const a = String(teks || '').match(/\d/g);
  if (!a) return '';
  const d = a.slice(0, 8);
  let out = d.slice(0, 2).join('');
  if (d.length > 2) out += '/' + d.slice(2, 4).join('');
  if (d.length > 4) out += '/' + d.slice(4, 8).join('');
  return out;
}

function rapikanTanggal(akar) {
  if (!akar || akar.nodeType !== 1) return;
  const daftar = [];
  if (akar.matches && akar.matches('input[type="date"]:not([data-tgl])')) daftar.push(akar);
  if (akar.querySelectorAll) daftar.push(...akar.querySelectorAll('input[type="date"]:not([data-tgl])'));

  for (const asli of daftar) {
    asli.dataset.tgl = '1';

    const bungkus = document.createElement('span');
    bungkus.className = 'kolom-tgl';
    asli.parentNode.insertBefore(bungkus, asli);
    bungkus.appendChild(asli);

    const rupa = document.createElement('input');
    rupa.type = 'text';
    rupa.className = 'tgl-rupa';
    rupa.inputMode = 'numeric';
    rupa.placeholder = 'dd/mm/yyyy';
    rupa.maxLength = 10;
    rupa.autocomplete = 'off';
    /* Label yang menunjuk kolom aslinya harus tetap menunjuk sesuatu yang bisa
       difokuskan — dan yang dilihat orang sekarang kotak inilah. */
    if (asli.id) rupa.setAttribute('aria-labelledby', asli.id + '_lbl');
    rupa.setAttribute('aria-label', asli.getAttribute('aria-label') || 'Tanggal (dd/mm/yyyy)');
    rupa.value = _isoKeRupa(asli.value);
    if (asli.disabled) rupa.disabled = true;
    bungkus.appendChild(rupa);

    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'tgl-pilih';
    tombol.tabIndex = -1;          // kotak teksnya yang di jalur papan ketik
    tombol.setAttribute('aria-label', 'Buka pemilih tanggal');
    bungkus.appendChild(tombol);

    /* Ketikan orang -> nilai ISO di elemen aslinya, lalu `input` DAN `change`
       dibangkitkan di elemen ASLI supaya seluruh penangan yang sudah ada
       (delegasi `document.addEventListener('input', …)`) berjalan seperti
       biasa. Tanpa dua baris itu, mengganti tanggal tidak memuat apa pun. */
    rupa.addEventListener('input', () => {
      const posAkhir = rupa.selectionStart === rupa.value.length;
      rupa.value = _ketikTanggal(rupa.value);
      if (posAkhir) rupa.setSelectionRange(rupa.value.length, rupa.value.length);
      const iso = _rupaKeIso(rupa.value);
      /* Kosong DIBIARKAN kosong: mengetik ulang berarti melewati keadaan
         setengah jadi, dan menembak server di tiap huruf akan membuat layar
         berkedip sepanjang orang mengetik. Yang dikirim hanya tanggal utuh. */
      if (iso !== asli.value && (iso || rupa.value === '')) {
        asli.value = iso;
        asli.dispatchEvent(new Event('input', { bubbles: true }));
        asli.dispatchEvent(new Event('change', { bubbles: true }));
      }
      rupa.classList.toggle('tgl-salah', rupa.value.length === 10 && !iso);
    });

    /* Yang belum lengkap saat kolomnya ditinggalkan dikembalikan ke nilai yang
       sah — kotak berisi "25/1" yang dibiarkan begitu terbaca sebagai tanggal
       yang tersimpan, padahal tidak ada yang tersimpan. */
    rupa.addEventListener('blur', () => {
      rupa.value = _isoKeRupa(asli.value);
      rupa.classList.remove('tgl-salah');
    });

    const bukaPemilih = () => {
      try { asli.showPicker(); }
      catch (e) { asli.focus(); asli.click(); }
    };
    tombol.addEventListener('click', bukaPemilih);

    /* Pemilih bawaan menulis ke elemen aslinya; tampilannya menyusul dari sini. */
    asli.addEventListener('change', () => { rupa.value = _isoKeRupa(asli.value); });

    /* Kode lain menyetel `.value` langsung (tombol rentang cepat, pemuatan
       layar). Penyetelan properti tidak membangkitkan event apa pun, jadi
       satu-satunya cara tampilannya ikut adalah menumpangi properti itu.
       Pembacaan diteruskan apa adanya ke pengakses bawaannya — tidak ada
       perilaku yang berubah, hanya bertambah. */
    const asal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(asli, 'value', {
      configurable: true,
      get() { return asal.get.call(this); },
      set(v) { asal.set.call(this, v); rupa.value = _isoKeRupa(asal.get.call(this)); }
    });
  }
}

/**
 * Roda tetikus tidak boleh mengubah isi kolom angka.
 *
 * Peramban memperlakukan `<input type="number">` yang sedang FOKUS sebagai
 * pengatur: menggulir halaman dengan penunjuk di atasnya menaik-turunkan
 * angkanya, terus-menerus, tanpa satu pun tanda bahwa nilainya berubah.
 * Dilaporkan pemilik 6 Sep 2026: "number steppernya suka ngaco angkanya jalan
 * terus".
 *
 * Akibatnya bukan cuma menjengkelkan. Kolom `isi` pada baris pembelian
 * menentukan berapa satuan dasar per satuan beli; angka yang bergeser diam-diam
 * di sana MENGALIKAN stok yang masuk dan MEMBAGI harga modalnya.
 *
 * Yang dilakukan MELEPAS FOKUS, bukan `preventDefault()`. Menahan kejadiannya
 * ikut menahan gulir halamannya — orang lalu mengira layarnya macet, dan itu
 * menukar satu masalah dengan masalah lain. Dengan melepas fokus, halaman tetap
 * bergulir seperti biasa dan angkanya berhenti berubah.
 *
 * Pendengarnya `passive`: ia memang tidak pernah membatalkan apa pun, dan
 * memberitahukannya membuat peramban tidak perlu menunggu keputusan kita
 * sebelum menggulir.
 */
function pasangPenjagaRoda() {
  document.addEventListener('wheel', (e) => {
    const el = e.target;
    if (el && el.tagName === 'INPUT' && el.type === 'number' && el === document.activeElement) {
      el.blur();
    }
  }, { passive: true });
}

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
      pasangTunggu();
    }, 0);
  }, true);

  /* ---------- Kunci konteks selama satu TINDAKAN ORANG berjalan ----------
   *
   * Kunci per-tombol di atas hanya menutup tombol yang ditekan. Yang belum
   * dijaga: tombol LAIN dan menu. Petugas menekan Simpan, lalu selagi menunggu
   * pindah menu atau membuka dokumen kedua — dan prosesnya jadi kacau tanpa
   * satu pun galat.
   *
   * DIPAKAI PENGHITUNG ORANG, BUKAN PENGHITUNG SELURUH PERMINTAAN. `tarikMaster`
   * jalan tiap 5 menit dan `tarikStokSemuaCabang` tiap 10 menit; mengikuti
   * penghitung total berarti layar mengunci dirinya sendiri secara berkala
   * tanpa ada yang menekan apa pun. Yang melihatnya menyimpulkan aplikasinya
   * rusak. Lihat _sibukOrang di api.js.
   *
   * Ditunda 350 ms. Tindakan yang selesai dalam sekejap tidak boleh membuat
   * seluruh layar berkedip gelap — kedipan itu terbaca sebagai kerusakan,
   * pelajaran yang sama dengan JEDA_PADAM di atas.
   *
   * Ada batas waktu keras, dan itu bukan kehati-hatian berlebihan: layar yang
   * terkunci SELAMANYA jauh lebih buruk daripada masalah yang diobatinya —
   * peringatan yang sudah tertulis di `tugas()` pada api.js.
   */
  const TUNDA_TUNGGU = 350;
  const BATAS_TUNGGU = 150000;      // permintaan terlama di aplikasi ini 120 detik
  let tundaTunggu = null, batasTunggu = null, padamTunggu = null;

  /* Dibaca dengan tegas, dan jatuh kembali ke penghitung total kalau versinya
     belum mengenal `sibukOrang` — api.js lama yang masih tersisa di cache tidak
     boleh membuat penguncian ini mati diam-diam. */
  const orangSibuk = () => {
    const o = API && API.sibukOrang;
    return Number(o === undefined ? jumlahSibuk() : o) || 0;
  };

  function lepasTunggu() {
    clearTimeout(tundaTunggu); tundaTunggu = null;
    clearTimeout(batasTunggu); batasTunggu = null;
    document.body.classList.remove('tunggu');
  }

  function pasangTunggu() {
    if (tundaTunggu || document.body.classList.contains('tunggu')) return;
    tundaTunggu = setTimeout(() => {
      tundaTunggu = null;
      if (orangSibuk() <= 0) return;     // sudah selesai sebelum 350 ms — tidak perlu dikunci
      document.body.classList.add('tunggu');
      batasTunggu = setTimeout(() => {
        batasTunggu = null;
        /* Layarnya dibuka kembali, TOMBOLNYA TIDAK. Permintaannya masih
           berjalan di suatu tempat, dan menekan tombol yang sama persis di
           detik itu adalah cara paling mudah melahirkan dokumen kembar —
           persis kejadian pembelian dobel 5 Sep 2026. Tombolnya dilepas
           `lepas()` di atas, saat permintaannya benar-benar selesai. */
        document.body.classList.remove('tunggu');
      }, BATAS_TUNGGU);
    }, TUNDA_TUNGGU);
  }

  /* Pendengar TERPISAH dari yang menyalakan garis muat. Garis mengikuti seluruh
     permintaan (sinkronisasi latar pun berhak terlihat); kunci hanya mengikuti
     tindakan orang. Menggabungkan keduanya berarti salah satu ikut salah. */
  document.addEventListener('api:sibuk', (e) => {
    const orang = e.detail.orang === undefined ? e.detail.jumlah : e.detail.orang;
    clearTimeout(padamTunggu); padamTunggu = null;
    if (Number(orang) > 0) return;
    padamTunggu = setTimeout(lepasTunggu, JEDA_PADAM);
  });
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
    `<div class="baris-tentang"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')
    + tabelWaktu();
}

/**
 * Waktu permintaan per aksi — alat diagnosa, bukan pajangan.
 *
 * Dilaporkan pemilik 7 Sep 2026: Stok/Produk/Laporan "lebih dari 8 detik,
 * kadang gagal". Yang menentukan obatnya bukan totalnya melainkan PEMBAGIANNYA:
 * server yang berpikir lama diperbaiki di kuerinya, perjalanan yang lama
 * diperbaiki dengan mengurangi jumlah panggilan dan menggambar dari data lokal.
 * Dua arah yang berlawanan, dan menebak berarti separuh kemungkinan salah.
 *
 * Ditaruh di layar Tentang, bukan di konsol peramban: yang bisa menjawab
 * "berapa lama tadi" adalah orang yang mengalaminya di lantai toko, dan ia tidak
 * membuka DevTools. Layar ini juga sudah jadi tempat orang mencari nomor versi
 * saat melapor.
 *
 * Kosong sampai ada permintaan yang lewat — jejaknya di memori dan hilang saat
 * halaman dimuat ulang, jadi urutannya: muat ulang, buka layar yang lambat,
 * baru buka Tentang.
 */
function tabelWaktu() {
  const r = (API.ringkasanWaktu ? API.ringkasanWaktu() : []) || [];
  if (!r.length) return '';
  const ms = (v) => v === null || v === undefined ? '—' :
    (v >= 1000 ? (v / 1000).toFixed(1) + ' d' : Math.round(v) + ' md');

  /**
   * Kolom yang tidak menambah apa pun DIBUANG, bukan dikecilkan.
   *
   * Dilaporkan pemilik 7 Sep 2026: kolom Aksi terpotong dan tabelnya harus
   * digeser. Tujuh kolom memang tidak muat di kartu selebar ini — tapi dua di
   * antaranya sedang tidak mengatakan apa pun:
   *
   *   - `Terburuk` sama persis dengan `Tengah` untuk tiap baris ber-n=1, dan
   *     hampir semua baris ber-n=1. Kolom yang mengulang tetangganya bukan
   *     informasi, ia cuma memakan lebar yang dibutuhkan nama aksinya.
   *   - `Gagal` kosong di seluruh baris selama tidak ada yang gagal.
   *
   * Keduanya MUNCUL KEMBALI begitu ada isinya — yang dibuang keadaannya, bukan
   * kolomnya. Justru saat ada yang gagal atau ada satu permintaan yang jauh
   * lebih lambat daripada tengahnya, kolom itu yang paling perlu terlihat.
   */
  const adaGagal = r.some(x => (x.galat || 0) > 0);
  const adaTerburuk = r.some(x => x.terburuk !== x.total);

  const kolom = [
    { judul: 'Aksi', isi: (x) => esc(x.aksi) },
    { judul: 'n', angka: true, isi: (x) => x.n },
    { judul: 'Tengah', angka: true, isi: (x) => esc(ms(x.total)) },
    { judul: 'Server', angka: true, isi: (x) => esc(ms(x.server)) },
    { judul: 'Jalan', angka: true, isi: (x) => esc(ms(x.jalan)) }
  ];
  if (adaTerburuk) kolom.push({ judul: 'Terburuk', angka: true, isi: (x) => esc(ms(x.terburuk)) });
  if (adaGagal) kolom.push({ judul: 'Gagal', angka: true, isi: (x) => x.galat || '' });

  /* `data-l` WAJIB di tiap sel. Di bawah 620px tabelnya berhenti jadi tabel dan
     tiap baris berubah jadi kartu "Nama kolom …… isi"; nama kolomnya diambil
     dari atribut ini (lihat blok TABEL DI HP TEGAK di app.css). Tanpa itu, yang
     terlihat di HP hanya deretan angka telanjang tanpa satu pun keterangan —
     dan itulah keadaan tabel ini sejak v1.116.0. Aturannya sudah tertulis di
     app.css: jangan pasang salah satunya tanpa yang lain. */
  return `<h3 style="margin-top:22px">Waktu permintaan</h3>
    <p class="petunjuk">Sejak halaman ini terakhir dimuat. <strong>Server</strong> = lama Apps Script
    mengerjakannya; <strong>jalan</strong> = sisanya, yaitu perjalanan bolak-balik.</p>
    <div class="gulir-x"><table><thead><tr>${kolom.map(k =>
      `<th class="${k.angka ? 'angka' : ''}">${esc(k.judul)}</th>`).join('')}</tr></thead>
      <tbody>${r.map(x => `<tr>${kolom.map(k =>
        `<td data-l="${esc(k.judul)}" class="${k.angka ? 'angka' : ''}">${k.isi(x)}</td>`).join('')
      }</tr>`).join('')}</tbody></table></div>`;
}

/* Kamus ikon PINDAH ke pos.js v1.174 — satu sumber untuk sidebar, bar alat,
   tombol tindakan dan baris tabel sekaligus, diambil dari Lucide. Dulu ada tiga
   kamus terpisah (di sini, di pos.js, dan satu lagi di dalam admin.js) yang
   menggambar goresan yang sama dengan angka yang berbeda.
   `IKON` di bawah adalah var global dari pos.js, yang dimuat lebih dulu. */
const svgIkon = (id) =>
  `<svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON[id] || IKON.pengaturan}</svg>`;

/* `izinAtau` untuk menu yang isinya lebih dari satu master: cukup punya salah
   satu izinnya untuk melihat menunya. Isi layarnya sendiri yang menyaring lagi. */
const menuTampil = () => MENU.filter(m =>
  !m.izin || (m.izinAtau || [m.izin]).some(i => bolehIzin(i[0], i[1])));

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

/* ---------- Rute #/<layar> ----------------------------------------------
   Alamat layar dibuat bisa disebut. Sebelum ini seluruh aplikasi tinggal di
   satu alamat, jadi tidak ada satu pun cara menautkan "buka layar Piutang":
   tombol Kembali peramban selalu keluar dari aplikasi, memuat ulang halaman
   selalu melempar ke layar pertama, dan menyuruh orang lewat WhatsApp berarti
   menuliskan urutan kliknya.

   Dipakai hash, bukan History API, karena aplikasi ini disajikan GitHub Pages
   sebagai berkas statis: `/piutang` akan dijawab 404 oleh servernya, dan
   satu-satunya penyelamat adalah service worker yang mungkin belum terpasang
   pada kunjungan pertama. Hash tidak pernah sampai ke server sama sekali.  */
const idDariHash = () => (String(location.hash).match(/^#\/([a-z0-9_-]+)$/i) || [])[1] || '';

/* Hash boleh datang dari LUAR — diketik, ditempel dari obrolan, atau tersimpan
   sebagai bookmark oleh orang yang perannya sejak itu diganti. `bukaLayar`
   sendiri tidak memeriksa izin dan memang tidak boleh: ia dipanggil dari dalam
   aplikasi, tempat menunya sudah disaring. Pintu dari luar inilah satu-satunya
   yang tidak tersaring, jadi penjagaan dipasang di sini. */
const bolehLayar = (id) => menuTampil().some(m => m.id === id);

/** Layar yang SEDANG tergambar. Dipakai router untuk mengenali hash yang
 *  ditulisnya sendiri, supaya tidak ada penggambaran kedua. */
let layarKini = null;

/* ---------- Kelompok nav yang bisa dilipat --------------------------------
   Menu OWNER lebih panjang dari layar laptop dan terpotong di tengah sebuah
   kelompok — `.sisi-isi` sudah punya bayang gulir untuk itu, tapi menggulir
   bukan jawaban bagi orang yang sepanjang hari cuma memakai dua kelompok.

   Keadaannya per PERANGKAT, bukan per akun: PC kasir dan tablet gudang punya
   kebiasaan berbeda, dan alasan yang sama sudah dipakai untuk keadaan lipat
   sidebar. Ditaruh di localStorage, bukan IndexedDB, karena ia dibaca saat
   nav digambar — sebelum satu pun `await` sempat berjalan. */
const KUNCI_NAV_GRUP = 'possk_nav_grup';

function bacaLipatGrup() {
  try { return JSON.parse(localStorage.getItem(KUNCI_NAV_GRUP)) || {}; }
  catch (e) { return {}; }   /* rusak atau diblokir = semua terbuka */
}
function simpanLipatGrup(peta) {
  try { localStorage.setItem(KUNCI_NAV_GRUP, JSON.stringify(peta)); } catch (e) { /* diblokir */ }
}

function bangunNav() {
  const daftar = menuTampil();

  /* Tiga saringan atas SATU daftar yang sudah disaring hak akses — bukan tiga
     daftar terpisah. Menu yang lolos izin tapi tidak masuk salah satu dari tiga
     ini akan HILANG tanpa jejak; itu sebabnya `mandiri` dan `popover` dibaca
     sebagai pengecualian dari kelompok, bukan sebagai daftar tersendiri. */
  const diGrup   = daftar.filter(m => !m.popover && !m.mandiri);
  const mandiri  = daftar.filter(m => m.mandiri);

  /* Kelompok yang memuat layar yang sedang dituju DIPAKSA terbuka. Melipatnya
     berarti item aktifnya tidak terlihat sama sekali — orang membuka aplikasi
     dan tidak menemukan tanda di mana dirinya berada. */
  const tuju = idDariHash();
  const layarAwal = bolehLayar(tuju) ? tuju : (diGrup[0] || daftar[0]).id;
  const grupAktif = (daftar.find(m => m.id === layarAwal) || {}).grup;
  const lipat = bacaLipatGrup();

  const itemHtml = (m) =>
    /* TAUTAN sungguhan, bukan tombol: Ctrl+klik membuka layar itu di tab
       baru, dan tombol Kembali bekerja.
       tabindex=-1 pada semuanya: satu item saja yang boleh menerima Tab
       (roving tabindex), dan `bukaLayar` yang menentukan mana.

       TANPA `title=` sejak v1.151.0. Dulu ia yang menggantikan label saat
       sidebar terlipat; sekarang flyout yang melakukannya, dan dua tooltip
       untuk satu ikon berarti gelembung peramban muncul menimpa flyout
       setengah detik kemudian. Namanya tidak hilang bagi pembaca layar:
       `.item-nama` tetap ADA di dokumen saat terlipat, cuma disembunyikan
       secara visual — bukan `display:none`, yang mencabutnya dari pohon
       aksesibilitas.

       Kotak lencananya SELALU digambar, kosong dan `hidden`. Menyisipkan dan
       mencabut simpul tiap kali angkanya berubah berarti penggambar lencana
       harus tahu urutan anak `<a>`; menyalakan `hidden` tidak. */
    `<li><a class="item-nav" href="#/${m.id}" data-layar="${m.id}" tabindex="-1">` +
    `${svgIkon(m.id)}<span class="item-nama">${esc(m.label)}</span>` +
    `<span class="sisi-lencana" data-lencana="${m.id}" hidden></span></a></li>`;

  $('#navSisi').innerHTML = kelompokMenu(diGrup).map((g, i) => {
    /* Judul kelompok jadi <h2> berisi <button> yang dirujuk <ul>-nya lewat
       aria-labelledby. Tanpa itu pembaca layar mengumumkan "daftar, 7 butir"
       tujuh kali tanpa pernah menyebut kelompok mana — dan justru pengelompokan
       itulah yang membuat menu sepanjang ini bisa dipakai.
       Tombolnya <button aria-expanded/aria-controls>, pola disclosure baku:
       judul yang bisa diklik tapi bukan tombol adalah jebakan bagi keyboard. */
    const idGrup = 'navGrup' + i, idDaftar = 'navDaftar' + i;
    const buka = g.nama === grupAktif || lipat[g.nama] !== false;
    return `<h2 class="sisi-grup">` +
      `<button class="sisi-grup-tombol" id="${idGrup}" data-grup="${esc(g.nama)}"` +
      ` aria-expanded="${buka}" aria-controls="${idDaftar}">` +
      `<svg class="ikon-svg tanda-lipat" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>` +
      `<span>${esc(g.nama)}</span></button></h2>` +
      `<ul class="sisi-daftar${buka ? '' : ' tutup'}" id="${idDaftar}" aria-labelledby="${idGrup}">` +
      g.isi.map(itemHtml).join('') +
      `</ul>`;
  }).join('') +
  /* Item mandiri: berdiri di kaki nav, dipisah garis, TANPA judul kelompok yang
     cuma akan mengulang namanya sendiri. `aria-label` menggantikan
     `aria-labelledby` supaya daftarnya tetap punya nama bagi pembaca layar. */
  (mandiri.length
    ? `<ul class="sisi-daftar sisi-mandiri" aria-label="Bantuan">` +
      mandiri.map(itemHtml).join('') + `</ul>`
    : '');

  bangunPopoverAkun(daftar);
  /* Angka yang sudah di tangan dipasang lagi: nav yang digambar ulang lahir
     tanpa lencana, dan menunggu tarikan berikutnya berarti angkanya berkedip
     hilang setiap kali menu berubah. */
  gambarLencanaNav();

  bukaLayar(layarAwal);
}

/** Isi popover kartu pengguna: menu pribadi saja.
 *  Pemilih tema dicabut dari sini 10 Sep 2026 (pemilik): satu tempat saja, di
 *  Pengaturan > Setelan toko. Yang diterapkan ke layar tetap `terapkanTema`,
 *  dipanggil saat master ditarik. */
function bangunPopoverAkun(daftar) {
  const isi = (daftar || menuTampil()).filter(m => m.popover);
  $('#popoverIsi').innerHTML = isi.map(m =>
    `<a class="popover-item" role="menuitem" href="#/${m.id}" data-layar="${m.id}">` +
    `${svgIkon(m.id)}<span>${esc(m.label)}</span></a>`).join('');
}

function bukaPopoverAkun() {
  /* Gelembung nav tidak boleh menumpuk di atas popover — di tangkapan layar
     pemilik 9 Sep 2026 "Sistem · Cabang" menggantung tepat di atas kartu
     pengguna yang barusan dibuka. */
  sembunyiFlyoutSisi();
  $('#popoverAkun').hidden = false;
  $('#btnKartuUser').setAttribute('aria-expanded', 'true');
  const f = $('#popoverAkun').querySelector('a, button, input');
  if (f) f.focus();
}
function tutupPopoverAkun(kembalikanFokus) {
  if ($('#popoverAkun').hidden) return;
  $('#popoverAkun').hidden = true;
  $('#btnKartuUser').setAttribute('aria-expanded', 'false');
  /* Fokus dikembalikan hanya bila ia masih DI DALAM popover. Menutup karena
     orang mengklik layar lain, lalu merebut fokusnya kembali ke kartu
     pengguna, adalah kursor yang melompat tanpa sebab. */
  if (kembalikanFokus && $('#popoverAkun').contains(document.activeElement)) {
    $('#btnKartuUser').focus();
  }
}

/* ---------- Lencana nav & flyout mode terlipat (poin 5 & 7) ---------------
   Dua hal berbeda yang berbagi satu sumber angka, jadi ditulis berdampingan.
*/

/** Tulis angka lencana ke nav yang SUDAH ada. Tidak menggambar ulang navnya:
 *  `bangunNav()` memanggil `bukaLayar()` di ujungnya, dan menggambar ulang
 *  hanya untuk satu angka berarti setiap penyegaran berkala melempar layar
 *  yang sedang dibuka kembali ke layar awal. */
function gambarLencanaNav() {
  const peta = APP_STATE.lencanaNav || {};
  $$('#navSisi [data-lencana]').forEach(el => {
    const n = Number(peta[el.dataset.lencana]) || 0;
    el.hidden = !n;
    /* Angkanya dipotong di 99+. Lencana empat angka melebarkan dirinya sampai
       nama menunya terpotong, dan "berapa persisnya" bukan pertanyaan yang
       dijawab lencana — itu pertanyaan untuk layarnya. */
    if (n) el.innerHTML = (n > 99 ? '99+' : String(n)) +
      '<span class="hanya-pembaca"> menunggu tindakan</span>';
  });
}

let _lencanaTerakhir = 0;

/**
 * Tarik angka lencana dari server.
 *
 * DIAM saat gagal, dan angka lama DIPERTAHANKAN. Dua alasan: lencana adalah
 * petunjuk, bukan catatan — kotak merah untuknya melatih orang mengabaikan
 * kotak merah; dan mengosongkannya saat jaringan tersendat membuat angkanya
 * berkedip hilang-muncul, yang terbaca sebagai "pekerjaannya sudah beres".
 *
 * `latar: true` untuk yang dipicu timer dan perpindahan layar. Tanpa itu
 * penanda sibuk menyala dan layar mengunci diri sendiri tiap lima menit tanpa
 * ada yang menekan apa pun — lihat _sibukOrang di api.js.
 */
async function tarikLencanaNav(latar) {
  if (!API.online) return;
  _lencanaTerakhir = Date.now();
  try {
    const d = await API.lencanaNav(latar ? { latar: true } : {});
    APP_STATE.lencanaNav = d.lencana || {};
    gambarLencanaNav();
  } catch (e) { /* sengaja diam — lihat catatan di atas */ }
}

/** Segarkan setelah berpindah layar, tapi paling cepat sekali per menit.
 *  Yang dikejar: angka yang turun sesudah orang menyetujui perangkat atau
 *  menerima kiriman, tanpa perlu satu penangan khusus di tiap layar yang
 *  mengubahnya — dan tanpa satu permintaan tiap kali menu diklik. */
function segarkanLencanaNav() {
  if (Date.now() - _lencanaTerakhir < 60000) return;
  tarikLencanaNav(true);
}

let timerLencana = null;
function mulaiLencanaNav() {
  /* clearInterval dulu: login kedua di tab yang sama akan menumpuk timer, dan
     timer yang menumpuk melipatgandakan permintaan tanpa satu pun tanda. */
  if (timerLencana) clearInterval(timerLencana);
  tarikLencanaNav(false);
  timerLencana = setInterval(() => tarikLencanaNav(true), CONFIG.LENCANA_POLL_MS);
}

/**
 * FLYOUT saat sidebar terlipat.
 *
 * Menggantikan tooltip bawaan peramban, yang punya tiga masalah di rel 68px:
 * ia baru muncul sesudah jeda satu detik, ia tidak pernah muncul untuk fokus
 * papan ketik, dan ia tidak bisa memuat apa pun selain teks datar — sementara
 * yang hilang saat dilipat bukan cuma nama menunya, melainkan juga NAMA
 * KELOMPOKNYA (judul kelompok berubah jadi garis 1px) dan angka lencananya.
 *
 * `position: fixed`, bukan absolut di dalam sidebar. `.sisi-isi` bergulir
 * dengan `overflow-y:auto`, dan apa pun yang digambar di dalamnya terpotong di
 * tepi rel selebar 68px itu. Karena fixed, letaknya dihitung dari
 * getBoundingClientRect tiap kali ditampilkan — dan disembunyikan saat navnya
 * digulir, karena letak yang dihitung sekali akan tertinggal di belakang.
 *
 * `aria-hidden`: namanya sudah diumumkan `.item-nama` yang tetap ada di
 * dokumen. Mengumumkannya dua kali membuat pembaca layar menyebut tiap menu
 * dua kali.
 */
/**
 * Boleh tidaknya flyout muncul. TIGA syarat, dan ketiganya lahir dari kerusakan
 * yang dilaporkan pemilik 9 Sep 2026: "flyout sidebar nyangkut ketika diswipe".
 *
 * 1. Kelas `sisi-lipat` saja TIDAK CUKUP. Di layar sempit sidebar berubah jadi
 *    LACI, dan CSS lacinya mengembalikan seluruh label — tapi kelas
 *    `sisi-lipat` tetap menempel, karena keadaan lipat tersimpan per perangkat
 *    dan tidak ada yang mencabutnya saat lebar layar berubah. Jadi gelembungnya
 *    muncul di sebelah menu yang labelnya sudah terbaca jelas: dua nama untuk
 *    satu baris. Yang ditanya di sini LEBARNYA, bukan kelasnya — itu satu-satunya
 *    yang benar di semua breakpoint sekaligus.
 * 2. Perangkat sentuh tidak punya "berhenti di atas". Satu ketukan menembakkan
 *    mouseover lalu TIDAK PERNAH menembakkan mouseout, jadi gelembungnya
 *    tertinggal menggantung — persis "nyangkut" yang dilaporkan. `(hover: hover)`
 *    memisahkan tetikus sungguhan dari jari.
 * 3. Sidebar yang sedang jadi laci tidak pernah berflyout, apa pun lebarnya.
 */
function bolehFlyout() {
  const sisi = $('.sisi');
  if (!sisi || !$('#app').classList.contains('sisi-lipat')) return false;
  if (sisi.classList.contains('buka')) return false;      // sedang jadi laci
  if (sisi.offsetWidth > 100) return false;               // labelnya sudah terbaca sendiri
  /* Ditangkap dan DIABAIKAN dengan sengaja: peramban yang tidak punya
     matchMedia (atau melarangnya) tidak boleh mematikan flyout sama sekali —
     dua syarat di atas sudah cukup ketat. Yang hilang cuma penyaring sentuh. */
  try { if (!window.matchMedia('(hover: hover)').matches) return false; } catch (e) { /* tanpa matchMedia: lanjut */ }
  return true;
}

function tampilFlyoutSisi(a) {
  const el = $('#flyoutSisi');
  if (!el || !a || !bolehFlyout()) return;
  const id = a.dataset.layar;
  const m = MENU.find(x => x.id === id);
  const n = Number((APP_STATE.lencanaNav || {})[id]) || 0;
  el.innerHTML =
    (m && m.grup ? `<span class="flyout-grup">${esc(m.grup)}</span>` : '') +
    `<span class="flyout-nama">${esc((m && m.label) || a.textContent.trim())}</span>` +
    (n ? `<span class="sisi-lencana">${n > 99 ? '99+' : n}</span>` : '');
  el.hidden = false;
  const r = a.getBoundingClientRect();
  el.style.top = Math.round(r.top + r.height / 2) + 'px';
  el.style.left = Math.round(r.right + 8) + 'px';
}

function sembunyiFlyoutSisi() {
  const el = $('#flyoutSisi');
  if (el && !el.hidden) el.hidden = true;
}

/** Item nav yang BENAR-BENAR terjangkau — dipakai roving tabindex dan panah.
 *
 *  Item di kelompok yang terlipat dikeluarkan. Panah yang tetap melewatinya
 *  memindahkan fokus ke elemen yang tidak terlihat: kursornya hilang, dan
 *  tekanan Enter berikutnya membuka layar yang tidak pernah dilihat orangnya.
 *
 *  Diperiksa lewat CLASS, bukan lewat tata letak (`offsetParent`). Saat nav
 *  digambar ulang, atau selama layar login masih menutupi sidebar, seluruh
 *  sidebar belum punya tata letak sama sekali — pemeriksaan berbasis tata letak
 *  akan menjawab "tidak ada satu pun item" dan meninggalkan nav tanpa titik
 *  masuk Tab. */
const itemNav = () => $$('#navSisi a[data-layar]')
  .filter(a => !a.closest('.sisi-daftar')?.classList.contains('tutup'));

/** Hanya SATU item yang boleh bertabindex 0, dan itu titik masuk Tab ke nav. */
function pindahTitikTab(el) {
  const item = itemNav();
  if (!item.length) return;
  item.forEach(x => { x.tabIndex = -1; });
  (el && item.indexOf(el) !== -1 ? el : item[0]).tabIndex = 0;
}

function bukaLayar(id) {
  layarKini = id;
  sembunyiFlyoutSisi();
  segarkanLencanaNav();
  /* Hash disamakan DI SINI, bukan di penangan klik menu. Layar juga dibuka
     dari lencana bar atas, dari tombol di dalam layar lain, dan dari susulan
     rilis — kalau hashnya hanya ikut saat menu diklik, alamat di bilah alamat
     berbohong tepat pada jalur yang paling sering dipakai. */
  if (location.hash !== '#/' + id) location.hash = '#/' + id;

  let aktif = null;
  /* Ruang lingkupnya `#sisi`, bukan `#navSisi`: sejak v1.148.0 tiga layar
     pribadi hidup di popover kartu pengguna, dan tautan di sana berhak atas
     penanda "sedang di sini" yang sama. */
  $$('#sisi a[data-layar]').forEach(a => {
    const ini = a.dataset.layar === id;
    a.classList.toggle('aktif', ini);
    /* aria-current MENDAMPINGI class 'aktif', tidak menggantikannya: yang satu
       untuk mata (batang biru + huruf tebal), yang satu untuk pembaca layar.
       Warna dan tebal huruf tidak pernah sampai ke pembaca layar. */
    if (ini) { a.setAttribute('aria-current', 'page'); aktif = a; }
    else a.removeAttribute('aria-current');
  });
  /* Layar yang tidak punya item nav (dibuka dari dalam layar lain) tetap harus
     meninggalkan satu titik masuk Tab — kalau tidak, seluruh nav hilang dari
     jangkauan keyboard sampai layar berganti lagi. */
  pindahTitikTab(aktif);

  $$('.layar').forEach(l => l.classList.remove('aktif'));
  const el = $('#layar' + id[0].toUpperCase() + id.slice(1));
  if (el) el.classList.add('aktif');

  const m = MENU.find(x => x.id === id);
  $('#judulLayar').textContent = m ? m.label : '';
  tutupLaci();
  /* Fokusnya TIDAK dikembalikan ke kartu pengguna: layar sudah berganti, dan
     melompatkan kursor kembali ke kaki sidebar sesudahnya tidak menolong
     siapa pun. */
  tutupPopoverAkun(false);

  if (m && m.admin) return Admin.muat(id);
  /* Laporan memuat sendiri saat pertama dibuka, dengan periode yang terpilih
     di dropdown (bawaannya Hari ini) — layar laporan yang terbuka kosong dan
     menunggu ditekan adalah langkah yang tidak perlu ada. Pembukaan berikutnya
     membiarkan rentang yang sedang dilihat. */
  if (id === 'laporan' && !LAP.dari) return terapkanPeriodeLaporan($('#lapPeriode')?.value || 'hari');
  if (id === 'riwayat') return gambarRiwayat();
  if (id === 'pengaturan') return perbaruiInfoData();
  if (id === 'shift') return periksaShift();
  if (id === 'kas') return muatKas();
  if (id === 'tentang') return gambarTentang();
  if (id === 'kasir') { $('#inpCari').focus(); Tahanan.segarkanLencana(); }
}

/* ---------- Sidebar: laci (layar sempit) & lipat (layar lebar) ---------- */

/** Elemen yang membuka laci — fokus dikembalikan ke sini saat laci ditutup. */
let pemicuLaci = null;

/** Yang bisa menerima fokus DI DALAM sidebar, dalam urutan tampil. */
const fokusSisi = () => Array.from($('#sisi').querySelectorAll(
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  .filter(el => el.offsetParent !== null || el === document.activeElement);

function bukaLaci() {
  /* Disimpan SEBELUM fokus dipindahkan. */
  pemicuLaci = document.activeElement;
  $('#sisi').classList.add('buka');
  $('#tiraiSisi').classList.add('buka');
  $('#btnLaci').setAttribute('aria-expanded', 'true');
  /* Fokus masuk ke dalam laci. Tanpa ini pembaca layar tetap membaca halaman
     di belakang tirai, dan Tab pertama membawa orang ke bar atas yang justru
     sedang tertutup — mereka menekan Enter pada tombol yang tidak terlihat. */
  const f = fokusSisi();
  if (f.length) f[0].focus();
}
function tutupLaci() {
  const tadinyaBuka = $('#sisi').classList.contains('buka');
  $('#sisi').classList.remove('buka');
  $('#tiraiSisi').classList.remove('buka');
  $('#btnLaci').setAttribute('aria-expanded', 'false');
  /* Fokus dikembalikan HANYA kalau lacinya memang tadi terbuka. `tutupLaci()`
     dipanggil pada tiap pergantian layar, termasuk di layar lebar yang lacinya
     tidak pernah ada — merebut fokus di sana akan melempar kursor orang keluar
     dari kolom yang sedang diketiknya. */
  if (tadinyaBuka && pemicuLaci && document.contains(pemicuLaci)) {
    /* Kecuali fokusnya sudah dipindahkan ke DALAM layar oleh yang memanggil —
       `bukaLayar('kasir')` menaruhnya di kotak cari, dan itu tujuan yang lebih
       baik daripada tombol ☰. */
    if (!$('#sisi').contains(document.activeElement)) { /* sudah pindah, biarkan */ }
    else pemicuLaci.focus();
  }
  if (tadinyaBuka) pemicuLaci = null;
}

/** Keadaan lipat diingat per perangkat — PC kasir sempit dan tablet gudang
 *  punya kebiasaan berbeda, dan tidak ada yang mau melipatnya tiap pagi. */
async function terapkanLipat(lipat, simpan = true) {
  $('#app').classList.toggle('sisi-lipat', !!lipat);
  /* Flyout cuma hidup di mode terlipat. Membentangkan sidebar sementara
     gelembungnya masih terbuka meninggalkannya menggantung di tengah layar,
     menunjuk item yang sekarang punya labelnya sendiri. */
  sembunyiFlyoutSisi();
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
  /* OK dimatikan selama PIN belum genap 6 digit.
     Dibiarkan hidup, satu-satunya keluaran yang bisa dicapai adalah pesan
     "PIN 6 digit." — dan tombol yang hanya bisa menghasilkan galat itu jebakan,
     bukan tombol. Lebih jelas mematikannya: enam titik di atasnya sudah
     memberitahu berapa lagi yang kurang. */
  const okBtn = $('.papan-pin button[data-pin="masuk"]');
  if (okBtn) okBtn.disabled = pinBuffer.length < 6;
}

/* Penjaga login ganda. Dulu digit ke-6 yang memulai login, tapi pinBuffer tetap
   berisi 6 angka selama menunggu server — satu ketukan lagi memicu login KEDUA dengan
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

  /* Tombolnya menandai DIRINYA SENDIRI, tidak menumpang pasangPenandaSibuk().
   *
   * Penanda otomatis itu menyalakan pemintal pada tombol yang kliknya
   * MELAHIRKAN permintaan, diperiksa satu gilir sesudah kliknya. Di sini
   * `idPerangkat()` (baca IndexedDB) ditunggu lebih dulu, jadi pada saat
   * diperiksa belum ada permintaan apa pun dan tombolnya dilewati — hasilnya
   * tombol OK yang tidak berubah sedikit pun selama beberapa detik menunggu
   * jaringan seluler. `_sedangLogin` memang sudah menolak panggilan kedua, tapi
   * penolakan yang tidak terlihat sama saja dengan tombol yang rusak: pemakainya
   * tidak punya cara membedakan "sedang jalan" dari "tidak bereaksi", lalu
   * menekan berkali-kali. Dijaga uji uji-login.mjs.
   */
  const tblLogin = pakaiPassword ? $('#btnLoginPassword')
                                 : $('.papan-pin button[data-pin="masuk"]');
  if (tblLogin) { tblLogin.classList.add('sibuk'); tblLogin.disabled = true; }

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
    await laporkanKeluarPaksa();
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
    if (tblLogin) {
      tblLogin.classList.remove('sibuk');
      /* JANGAN sekadar `disabled = false`. Jalur galat mengosongkan pinBuffer
         lalu menggambar ulang papan PIN, dan gambarPin() yang menentukan OK
         hidup atau mati (mati sampai enam digit penuh). Menghidupkannya di sini
         akan mengembalikan tombol yang hanya bisa menghasilkan "PIN 6 digit." */
      if (pakaiPassword) tblLogin.disabled = false; else gambarPin();
    }
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
  /* Di bawah nama toko: NOMOR VERSI, bukan kode cabang.
     Kode cabangnya tidak hilang — ia ada di lencana header (#lncCabang) dan di
     kartu "Cabang aktif" di layar Perangkat, dua tempat yang memang dilihat
     saat orang mempertanyakan cabang. Yang selama ini tidak punya tempat sama
     sekali justru nomor versinya, padahal setiap laporan dari lapangan harus
     dimulai dengan menebak versi mana yang sedang dipakai orang itu — dan
     tebakan itu salah tepat ketika perangkatnya belum sempat memuat ulang. */
  $('#sisiVersi').textContent = 'Versi ' + CONFIG.VERSI;
  $('#sisiVersi').title       = 'Versi aplikasi · cabang ' + d.cabang +
                                (d.nama_cabang ? ' (' + d.nama_cabang + ')' : '');

  await terapkanLipat(await DB.kvGet('sisi_lipat', false), false);
  bangunNav();
  $('#btnTutupBuku').classList.toggle('sembunyi', !APP_STATE.flag.tutup_buku);

  await muatMaster();
  /* SESUDAH muatMaster(): daftar cabang lengkapnya (`daftarCabangSemua`) baru
     terisi di dalamnya, dari store lokal `cabang_list`. Dipasang lebih awal,
     dropdownnya kosong dan penyaringnya tidak pernah muncul. */
  pasangPilihCabangLaporan();
  Sync.mulai();
  Sync.tarikStok();
  Sync.tarikStokSemuaCabang();
  mulaiLencanaNav();
  await periksaShift();
  await gambarProduk('');
  gambarKeranjang();
  await perbaruiInfoData();

  if (d.user.wajib_ganti_pin) {
    // Kasus yang sama seperti shift: jangan sebut nama menu, antar saja.
    if (await Admin.tanya('PIN Anda masih PIN awal',
          '<p class="petunjuk">Sebaiknya segera diganti — PIN awal sama untuk semua akun baru.</p>',
          { ya: 'Ganti sekarang', batal: 'Nanti' })) {
      menujuKartu('akun', 'kartuAkun', '#pinLama');
    }
  }
}

/**
 * Turunkan seluruh nilai yang dipakai layar dari APP_STATE.setting.
 *
 * Dipisah supaya bisa dipanggil ULANG setiap kali master ditarik, bukan hanya
 * saat login. Bobot peran dipakai dialog Tim untuk pratinjau pembagian; kalau ia
 * tertinggal, layar memperlihatkan angka yang berbeda dari yang akan dicatat
 * server — dan itu justru yang dijanjikan tidak mungkin terjadi.
 */
/**
 * Pasang tema tampilan. Satu sakelar milik pemilik, berlaku di semua perangkat.
 *
 * Nilainya datang dari setelan `tema` lewat tarik_master, jadi perangkat lain
 * mengikutinya pada sinkronisasi berikutnya — bukan seketika. Yang berubah cuma
 * satu atribut di <html>; seluruh warna hidup di token CSS dan ikut sendiri.
 *
 * Disalin ke localStorage supaya pemasang di <head> punya sesuatu untuk dibaca
 * sebelum gambar pertama. Tanpa itu ada kilatan putih setiap kali aplikasi
 * dibuka — beberapa puluh kali sehari di toko bermode gelap.
 *
 * Dibungkus try: peramban yang memblokir penyimpanan situs membuat localStorage
 * MELEMPAR, bukan mengembalikan null. Gagal di sini berarti kedipannya kembali,
 * bukan aplikasinya mati.
 */
function terapkanTema(nilai) {
  const gelap = String(nilai) === 'gelap';
  const sebelum = document.documentElement.dataset.tema || 'terang';
  const sesudah = gelap ? 'gelap' : 'terang';
  if (gelap) document.documentElement.dataset.tema = 'gelap';
  else       delete document.documentElement.dataset.tema;

  /* Bilah alamat peramban dan bilah status Android ikut warnanya. Tanpa ini,
     aplikasi gelap masih dibingkai putih di layar penuh. Nilainya dibaca dari
     token `--panel` yang SEDANG berlaku — warna bilah atas aplikasi — bukan
     angka tersendiri: sampai v1.157 di sini tertulis warna hampir hitam, lebih gelap
     dari bilah atas (#30302e), jadi bilah statusnya terlihat sebagai pita
     lain. Pemasang di <head> index.html memasang nilai yang sama lebih awal,
     untuk aplikasi yang dipasang ke layar utama. */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
    meta.setAttribute('content', panel || (gelap ? '#30302e' : '#ffffff'));
  }

  try { localStorage.setItem('possk_tema', sesudah); } catch (e) { /* diblokir */ }

  /* Warna kotak dan teks berubah seketika karena token CSS. Grafik TIDAK — ia
     SVG yang sudah tergambar. Tanpa siaran ini, pemilik yang sedang membuka
     Dashboard saat menyalakan mode gelap melihat grafik terang tertinggal di
     tengah layar yang sudah gelap. Disiarkan hanya bila BERUBAH: menggambar
     ulang grafik pada tiap sinkronisasi lima menit adalah kedipan tanpa sebab. */
  if (sebelum !== sesudah) {
    document.dispatchEvent(new CustomEvent('tema:berubah', { detail: sesudah }));
  }
}

function bacaSettingKeState() {
  const st = APP_STATE.setting || {};
  terapkanTema(st.tema);
  APP_STATE.pkp = String(st.pkp) === 'true';
  APP_STATE.tarifPpn = Number(st.tarif_ppn || 0);
  const brs = $('#brsPpn');
  if (brs) brs.style.display = APP_STATE.pkp ? 'flex' : 'none';

  APP_STATE.klaimWajib = String(st.klaim_petugas_wajib) === 'true';

  // Disaring sama ketatnya dengan server: nilai negatif atau tak berhingga
  // membatalkan seluruh setting, bukan cuma dirinya.
  let b = {};
  try { b = JSON.parse(st.bobot_peran_klaim || '{}'); } catch (e) { b = {}; }
  const bersih = {}; let jml = 0, sah = true;
  PERAN_TIM.forEach(k => {
    // Kunci hilang = tidak sah, sama seperti server. Dua semantik berbeda untuk
    // satu setting berarti layar dan catatan bisa memberi angka yang berbeda.
    if (!b || !Object.prototype.hasOwnProperty.call(b, k)) { sah = false; return; }
    const v = Number(b[k]);
    if (!isFinite(v) || v < 0) { sah = false; return; }
    bersih[k] = v; jml += v;
  });
  APP_STATE.bobotPeran = (sah && jml > 0) ? bersih : { PENJUAL: 60, PEMASANG: 40 };
}

/* PEMILIH CABANG & MODE TINJAU DICABUT — 9 Sep 2026, atas permintaan pemilik.

   Yang dicabut: `pasangPemilihCabang`, `modeTinjau`, `tanyaTinjau`,
   `gambarModeTinjau`, `APP_STATE.cabangKerja`, dan kunci kv `cabang_kerja`.

   Sebab pertama, dari lapangan: dropdown pramuniaga di layar kasir berisi
   petugas CABANG LAIN, dan tidak ada yang bisa menjelaskannya dari layar.
   Mekanismenya — `apiTarikMaster` menyaring `petugas` menurut `sesi.cabang`,
   jadi muatannya per cabang; tapi kunci cachenya `versi_master` yang GLOBAL.
   Berpindah cabang tidak mengubah nomor versi, jadi tarikan berikutnya dijawab
   "tidak ada perubahan" dan perangkat itu menyimpan daftar petugas cabang
   tempat ia kebetulan terakhir menarik master. Racun yang menetap sampai ada
   yang menekan Tarik ulang data master — dan tidak ada satu pun tanda di layar
   yang menyebut sebabnya. Jebakan yang sama persis dengan §105.

   Sebab kedua: cabang aktif per SESI memang bukan pola yang dipakai toko ini.
   Melihat cabang lain sudah tersedia lewat penyaring cabang di Dashboard,
   Stok, dan Laporan — laporan lintas cabang, operasional satu cabang. Untuk
   BEKERJA di cabang lain: keluar, lalu masuk lagi; login membawa
   `cabang_terakhir` dan servernya yang menentukan.

   `apiGantiCabang` di server DIBIARKAN. Ia tidak lagi punya pemanggil dari
   layar, dan mencabut endpoint yang masih dirujuk uji server hanya menambah
   risiko tanpa menambah keamanan apa pun. */

async function muatMaster() {
  /* Penanda versinya membawa cabang sejak v1.144.0 (05_Master.gs), jadi
     perangkat yang cabangnya berganti otomatis menarik ulang — termasuk yang
     sudah terlanjur menyimpan daftar petugas cabang lain. Tidak ada tambalan
     sekali-jalan di sini: dua mekanisme untuk satu aturan cepat atau lambat
     berselisih, dan yang di server berlaku untuk SEMUA perangkat sekaligus. */
  try { await Sync.tarikMaster(); }
  catch (e) { console.warn('Master tidak dapat ditarik:', e.message); }

  APP_STATE.setting = await DB.kvGet('setting', {});
  bacaSettingKeState();

  const daftarCabang = await DB.kvGet('cabang_list', []);
  const cab = daftarCabang.find(c => c.kode === APP_STATE.cabang);
  APP_STATE.namaCabang = cab ? cab.nama : APP_STATE.cabang;
  // Seluruh cabang aktif — dipakai layar "intip stok", termasuk cabang yang user ini
  // tidak berhak bertransaksi di sana. Yang ditampilkan hanya jumlah stok, bukan harga modal.
  APP_STATE.daftarCabangSemua = daftarCabang.map(c => c.kode).sort(urutNama);

  const pel = await DB.all('pelanggan');
  $('#selPelanggan').innerHTML = '<option value="">Pelanggan umum</option>' +
    // Labelnya ikut dinormalkan supaya tidak bertentangan dengan kolom level di
    // sebelahnya: memilih pelanggan lama membuat #selLevel berbunyi "Grosir",
    // dan label yang tetap berbunyi "(reseller)" hanya membingungkan kasir.
    urutkanOleh(pel, p => p.nama)
      .map(p => `<option value="${esc(p.kode)}">${esc(p.nama)} (${esc(Harga.normalLevel(p.level_harga))})</option>`).join('');

  /* Daftar petugas. Store `petugas` baru ada sejak DB_VERSI 3; perangkat yang
     belum sempat memutakhirkan skema lokalnya tidak boleh gagal memuat kasir
     hanya karena satu store belum ada. */
  try { APP_STATE.daftarPetugas = await DB.all('petugas'); }
  catch (e) { APP_STATE.daftarPetugas = []; console.warn('Daftar petugas belum tersedia:', e.message); }
  gambarPilihanPetugas();

  $('#keuCabang').innerHTML =
    (APP_STATE.flag.akses_lintas_cabang ? '<option value="*">Semua cabang</option>' : '') +
    APP_STATE.daftarCabang.slice().sort(urutNama).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

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

/**
 * Daftar tipe HP yang cocok, dengan yang SEDANG DICARI di depan.
 *
 * Baris keterangan di kartu produk dipotong elipsis. Untuk tempered glass
 * multi-fit yang cocok belasan tipe, urutan apa adanya berarti tipe yang barusan
 * diketik kasir justru yang terpotong — daftarnya panjang, dan yang dicari bisa
 * ada di urutan kesebelas. Yang mengandung kueri karena itu didahulukan.
 *
 * `penuh` dipakai untuk atribut `title`: yang tidak muat di layar tetap bisa
 * dibaca tanpa membuka apa pun.
 */
function cocokDidahulukan(p, q) {
  const semua = [];
  if (p.tipe_hp) semua.push(String(p.tipe_hp));
  (p.kompatibel || []).forEach(k => { if (k && k.tipe) semua.push(String(k.tipe)); });
  if (!semua.length) return { ringkas: '', penuh: '' };

  const urut = q
    ? semua.slice().sort((a, b) => {
        const ca = a.toLowerCase().includes(q) ? 0 : 1;
        const cb = b.toLowerCase().includes(q) ? 0 : 1;
        return ca - cb;
      })
    : semua;

  const TAMPIL = 4;
  const sisa = urut.length - TAMPIL;
  return {
    ringkas: urut.slice(0, TAMPIL).map(esc).join(', ') + (sisa > 0 ? ` +${sisa} lagi` : ''),
    penuh: urut.join(', ')
  };
}

/**
 * Tandai kolom bar alat kasir yang sedang TIDAK di nilai bawaannya.
 *
 * Keempat kolom itu menyebut nama fieldnya sendiri selama masih bawaan
 * ("Semua kategori", "Harga Eceran", "Pelanggan umum", "Tanpa pramuniaga"),
 * dan berhenti menyebutnya begitu diisi — yang tersisa cuma "Grosir" atau
 * sebuah nama. Justru di keadaan itulah kolomnya paling perlu terlihat.
 *
 * Bawaannya string kosong untuk tiga kolom, dan 'eceran' untuk tingkat
 * harga — bukan kosong, karena harga selalu punya tingkat.
 */
function tandaiKendaliKasir() {
  const tandai = (el, bukanBawaan) => el && el.classList.toggle('disetel', !!bukanBawaan);
  tandai($('#kasirKategori'), $('#kasirKategori')?.value);
  tandai($('#selLevel'), $('#selLevel')?.value && $('#selLevel').value !== 'eceran');
  tandai($('#selPelanggan'), $('#selPelanggan')?.value);
  tandai($('#selPetugas'), $('#selPetugas')?.value);
}

/**
 * true bila produk boleh dijual di cabang yang sedang aktif di perangkat ini.
 *
 * Lapis KEDUA. Yang pertama di server: `apiTarikMaster` sudah tidak mengirim
 * SKU khusus cabang lain, dan penanda versinya memuat kode cabang sehingga
 * berpindah cabang menarik ulang katalog. Lapis ini menjaga jendela di antara
 * keduanya — cabang baru dipilih, katalog lama masih di IndexedDB — supaya
 * barang yang tidak dijual di sini tidak sempat masuk keranjang, lalu ditolak
 * server saat sinkron. Kosong atau '*' = semua cabang.
 */
function produkDijualDiSini(p) {
  const c = String(p?.cabang || '').trim();
  if (!c || c === '*') return true;
  const kini = String(APP_STATE.cabang || '').trim().toUpperCase();
  if (!kini) return true;
  return c.split(',').some(k => k.trim().toUpperCase() === kini);
}

async function gambarProduk(kueri) {
  const semuaProduk = (await DB.all('produk')).filter(produkDijualDiSini);
  const stok = await DB.all('stok');
  const petaStok = Object.fromEntries(stok.map(s => [s.key, s.qty]));
  /* BEDAKAN "belum tahu" dari "nol".
     Daftar stok dari server hanya memuat SKU yang punya mutasi — barang yang
     belum pernah masuk pembelian/opname tidak punya baris sama sekali. Dulu
     keduanya sama-sama digambar "stok ?", sehingga barang yang stoknya memang
     habis terlihat seperti data yang belum termuat, dan setelah dijual pun
     tetap "?" alih-alih minus. Begitu stok pernah ditarik sekali, tidak adanya
     baris ARTINYA nol; "?" disisakan hanya untuk keadaan yang benar-benar tidak
     diketahui, yaitu belum pernah menarik stok sama sekali. */
  const stokSiap = !!(await DB.kvGet('stok_diperbarui', null));
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
    /* SKU ikut dicocokkan persis, bukan cuma barcode.
       Sejak label barcode dicetak dari SKU (produk tanpa barcode pabrik),
       men-scan label toko sendiri akan jatuh ke daftar hasil pencarian di bawah
       alih-alih langsung masuk keranjang — fiturnya jalan tapi terasa rusak.
       Barcode tetap didahulukan: kalau sebuah barcode pabrik kebetulan sama
       dengan SKU produk lain, yang menang barang yang barcode-nya dipindai. */
    const cocokBarcode = semuaProduk.filter(p => String(p.barcode).toLowerCase() === q);
    const persis = cocokBarcode.length
      ? cocokBarcode
      : semuaProduk.filter(p => String(p.sku).toLowerCase() === q);
    if (persis.length === 1) {
      /* DITANDAI, supaya Enter yang datang sesudah ini tahu bahwa kolomnya
         dikosongkan PROGRAM, bukan memang kosong. Tanpa penanda ini, jari yang
         menekan Enter sesudah barcode masuk sendiri akan menambahkan
         `produkTampil[0]` — produk pertama katalog, barang yang sama sekali
         lain. Audit 5 Sep 2026. */
      APP_STATE.baruAutoTambah = true;
      tambahKeKeranjang(persis[0]); $('#inpCari').value = ''; return gambarProduk('');
    }
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
    const mentah = petaStok[p.sku + '|'];
    const qty = (mentah === undefined || mentah === null) ? (stokSiap ? 0 : null) : mentah;
    const harga = Harga.pilihLevel(p.harga, level);
    const diLain = petaLain[p.sku] || [];
    // Yang paling menolong kasir: saat barang habis di sini, langsung terlihat cabang mana yang punya
    const petunjukLain = (qty !== null && qty <= 0 && diLain.length)
      ? `<div class="ada-di-lain">ada di ${diLain.slice(0, 3).map(s => esc(s.cabang) + ' (' + s.qty + ')').join(', ')}${
          diLain.length > 3 ? ' +' + (diLain.length - 3) : ''}</div>` : '';

    /* SATU baris keterangan, bukan dua. Sebelumnya identitas produk dan daftar
       kecocokan menempati barisnya sendiri-sendiri, dan kartunya jadi 106px:
       lima produk per layar dari katalog 3.310. Sekarang satu baris terpotong
       elipsis — yang terlihat sekaligus naik lebih dari dua kali lipat.

       Yang terpotong tidak hilang: `title` membawa teks utuhnya, dan tipe yang
       SEDANG DICARI didahulukan (`cocokDidahulukan`) supaya justru bagian yang
       dicari kasir bukan yang lenyap di ujung baris. */
    const cocok = cocokDidahulukan(p, q);
    const keterangan = [
      esc(p.sku),
      p.merek ? esc(p.merek) : '',
      (p.satuan_lain || []).length ? p.satuan_lain.map(s => esc(s.nama)).join('/') : '',
      cocok.ringkas ? 'cocok: ' + cocok.ringkas : ''
    ].filter(Boolean).join(' · ');

    return `<div class="kartu-produk ${i === 0 ? 'sorot' : ''}" data-sku="${esc(p.sku)}">
      <div class="kiri-produk">
        <div class="nama">${esc(p.nama)}</div>
        <div class="meta"${cocok.penuh ? ` title="${esc(cocok.penuh)}"` : ''}>${keterangan}</div>
        ${petunjukLain}
      </div>
      <div class="kanan-produk">
        <div class="harga">${rp(harga)}</div>
        <div class="baris-stok">
          ${lencanaStok(qty, p.stok_min, { awalan: 'stok ', kosong: 'stok ?',
            tombol: true, sku: p.sku, ikon: svgIkon('cabang') })}
        </div>
      </div>
    </div>`;
  }).join('') : '<p style="color:var(--teks-redup);text-align:center;padding:36px 0">Tidak ada produk cocok</p>';

  /* Bukan cuma saat kolomnya diubah orang: memilih pelanggan menyetel tingkat
     harga dari kode, dan perubahan yang datang dari kode tidak memicu
     'change'. Digambar ulang di sini, di satu titik yang dilewati semua
     jalur itu. */
  tandaiKendaliKasir();
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
          : `<span class="lencana kuning">ringkasan</span> Diperbarui ${esc(waktuTampil(waktu))}.
             Tekan "Cek terkini" sebelum menjanjikan barang ke pelanggan.`}
      </p>
      <div class="gulir-x"><table>
        <thead><tr><th>Cabang</th><th class="angka">Stok</th><th></th></tr></thead>
        <tbody>${daftar.map(c => {
          const q = peta[c] ?? 0;
          const sini = c === APP_STATE.cabang;
          return `<tr>
            <td>${esc(c)}${sini ? ' <span class="lencana">cabang ini</span>' : ''}</td>
            <td class="angka" style="font-size:var(--fs-17);font-weight:700;${q > 0 ? '' : 'color:var(--teks-redup)'}">${q}</td>
            <td>${q > 0 ? '<span class="lencana hijau">tersedia</span>' : '<span class="lencana">kosong</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`,
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
    Admin.toast(e.message, 'galat');
  }
}

/* ==================== NOTA DITAHAN ====================
 *
 * Diminta kasir lewat pemilik, 10 Sep 2026: "hold/keep transaksi yang belum
 * selesai karena urusan belum selesai dengan pembeli, sehingga ada yang
 * memotong antrean". Keranjang yang sedang dilayani disimpan sebentar, kasir
 * melayani orang berikutnya, lalu keranjang tadi dilanjutkan.
 *
 * Keputusan pemilik (AskUserQuestion, hari yang sama):
 *   1. Disimpan DI PERANGKAT INI (IndexedDB `kv`, kunci `nota_tahan`) — bukan
 *      sheet di server. Tahanan hanya bermakna di kasir yang sama pada hari
 *      yang sama; tidak butuh sinkron, tidak membebani server, tetap jalan
 *      saat internet mati, dan bertahan walau tab ditutup.
 *   2. Dibuang saat TUTUP SHIFT — kasir diberi tahu jumlahnya sebelum
 *      menutup. Tahanan bukan nota: tidak ada nomor nota, poin, stok, atau
 *      HPP yang tersentuh sampai Bayar ditekan seperti biasa.
 *   3. "Lanjutkan" saat keranjang aktif masih berisi → keranjang aktif
 *      DITAHAN dulu otomatis (tukar), tidak ditumpuk, tidak dibuang diam-diam.
 *
 * Yang disimpan adalah RUJUKAN baris (sku, varian, satuan, qty, diskon,
 * harga manual, tim), bukan objek produk beserta harganya. Saat dilanjutkan,
 * tiap baris dibangun ulang lewat `Keranjang.tambah` dari katalog SEKARANG:
 * harga yang berubah selama ditahan mengikuti harga baru (kasir diberi tahu),
 * SKU yang sudah nonaktif / tidak dijual di cabang ini dilepas dengan toast.
 * Stok TIDAK dipesan saat ditahan — menahan stok membuat barang "hilang" dari
 * kasir lain untuk transaksi yang belum tentu jadi.
 *
 * Paling banyak TAHANAN_MAKS per perangkat: daftar yang bisa tumbuh tanpa
 * batas berubah jadi tempat sampah, dan yang ke-11 hampir pasti sudah pergi.
 */
const TAHANAN_MAKS = 10;
const Tahanan = (() => {
  const KUNCI = 'nota_tahan';
  const daftar = async () => {
    const d = await DB.kvGet(KUNCI, []);
    return Array.isArray(d) ? d : [];
  };
  const simpan = (d) => DB.kvSet(KUNCI, d);

  /** Potret keranjang aktif — cukup untuk dibangun ulang, tanpa objek produk. */
  function potret(label) {
    const t = Keranjang.total();
    const now = new Date();
    return {
      id: 'T' + now.getTime() + Math.floor(Math.random() * 1000),
      waktu: now.toISOString(), tanggal: tanggalLokal(now),
      jam: now.toTimeString().substring(0, 5),
      label: String(label || '').trim().slice(0, 40),
      cabang: APP_STATE.cabang || '', id_user: APP_STATE.user?.id_user || '',
      level: Keranjang.level,
      pelanggan: Keranjang.pelanggan ? { kode: Keranjang.pelanggan.kode, nama: Keranjang.pelanggan.nama } : null,
      diskon_nota: Keranjang.diskonNota,
      petugas_nota: Keranjang.petugasNota.slice(),
      pemasang_nota: Keranjang.pemasangNota,
      baris: Keranjang.baris.map(b => ({
        sku: b.sku, kode_varian: b.kode_varian || '', nama: b.nama, qty: b.qty, satuan: b.satuan,
        harga_satuan: b.harga_satuan, harga_manual: !!b.hargaManual, diskon: b.diskon || 0,
        tim: (b.tim || []).map(x => ({ kode: x.kode }))
      })),
      jumlah_item: t.jumlah_item, total: t.total
    };
  }

  /** Simpan keranjang aktif sebagai tahanan, lalu kosongkan keranjang. */
  async function tahan(label) {
    if (Keranjang.kosong) { Admin.toast('Keranjang kosong — tidak ada yang ditahan.', 'galat'); return null; }
    const d = await daftar();
    if (d.length >= TAHANAN_MAKS) {
      Admin.toast(`Sudah ${TAHANAN_MAKS} nota ditahan. Lanjutkan atau buang salah satu dulu.`, 'galat');
      return null;
    }
    const t = potret(label);
    d.unshift(t);
    await simpan(d);
    kosongkanLayarKeranjang();
    gambarLencana(d.length);
    return t;
  }

  /** Keranjang + kolom-kolom bar alat yang mengikutinya, dikosongkan bersama. */
  function kosongkanLayarKeranjang() {
    Keranjang.kosongkan();
    $('#selPelanggan').value = ''; $('#selLevel').value = 'eceran';
    gambarPilihanPetugas(); gambarKeranjang();
    gambarProduk($('#inpCari').value);
  }

  /**
   * Bangun ulang keranjang dari sebuah tahanan. Keranjang aktif yang masih
   * berisi ditahan lebih dulu (keputusan 3). Mengembalikan ringkasan yang
   * dilepas / berubah supaya pemanggil bisa memberi tahu kasir.
   */
  async function lanjutkan(id) {
    let d = await daftar();
    const t = d.find(x => x.id === id);
    if (!t) { Admin.toast('Nota tahanan itu sudah tidak ada.', 'galat'); gambarLencana(d.length); return null; }
    if (!Keranjang.kosong) {
      /* Ditulis ke daftar yang SAMA, sebelum yang dilanjutkan dicabut — kalau
         daftarnya penuh, yang dilanjutkan memberi tempatnya sendiri. */
      d = d.filter(x => x.id !== id);
      d.unshift(potret(''));
    } else {
      d = d.filter(x => x.id !== id);
    }
    await simpan(d);

    Keranjang.kosongkan();
    /* Pelanggan dulu (ia bisa membawa level harga), lalu level yang tersimpan
       — urutan ini yang membuat level pilihan kasir menang atas level bawaan
       pelanggan, persis seperti saat ia mengisinya. */
    const pel = t.pelanggan?.kode ? await DB.get('pelanggan', t.pelanggan.kode) : null;
    Keranjang.setPelanggan(pel || null);
    Keranjang.setLevel(t.level || 'eceran');
    const hilang = [], berubah = [];
    for (const b of t.baris || []) {
      const p = await DB.get('produk', b.sku);
      if (!p || !produkDijualDiSini(p)) { hilang.push(b.nama || b.sku); continue; }
      const varian = b.kode_varian ? (p.varian || []).find(v => v.kode === b.kode_varian) || null : null;
      try {
        const nb = Keranjang.tambah(p, { qty: b.qty, satuan: b.satuan, varian,
                                         daftarSatuan: p.satuan_lain || [], daftarTier: p.tier || [] });
        if (b.harga_manual && APP_STATE.flag.ubah_harga_saat_jual) Keranjang.ubahHarga(nb.id, b.harga_satuan);
        else if (nb.harga_satuan !== b.harga_satuan) berubah.push(b.nama || b.sku);
        if (b.diskon > 0) Keranjang.ubahDiskon(nb.id, b.diskon);
        if ((b.tim || []).length) Keranjang.setTimBaris(nb.id, b.tim);
      } catch (e) {
        hilang.push(b.nama || b.sku);
      }
    }
    Keranjang.setDiskonNota(t.diskon_nota || 0);
    Keranjang.setPetugasNota(t.petugas_nota || []);
    Keranjang.setPemasangNota(t.pemasang_nota || '');

    $('#selPelanggan').value = pel ? pel.kode : '';
    $('#selLevel').value = Keranjang.level;
    gambarPilihanPetugas(); gambarKeranjang();
    gambarProduk($('#inpCari').value);
    gambarLencana(d.length);
    return { tahanan: t, hilang, berubah };
  }

  async function buang(id) {
    const d = (await daftar()).filter(x => x.id !== id);
    await simpan(d);
    gambarLencana(d.length);
    return d;
  }

  async function buangSemua() {
    await simpan([]);
    gambarLencana(0);
  }

  async function jumlah() { return (await daftar()).length; }

  /** Lencana "Tahanan · n" di bar alat kasir; disembunyikan bila nol. */
  function gambarLencana(n) {
    const l = $('#lncTahanan');
    if (!l) return;
    l.textContent = `Tahanan · ${n}`;
    l.classList.toggle('sembunyi', !(n > 0));
  }
  async function segarkanLencana() { gambarLencana(await jumlah()); }

  const judulTahanan = (t) => t.label || (t.pelanggan?.nama) || (t.baris?.[0]?.nama || '') + (t.baris?.length > 1 ? ` +${t.baris.length - 1}` : '');

  /** Daftar tahanan di modal umum: Lanjutkan / Buang per baris. */
  async function bukaDaftar() {
    const d = await daftar();
    const hariIni = tanggalLokal(new Date());
    const isi = d.length ? `<div class="daftar-tahanan">${d.map(t => `
      <div class="tahanan ${t.tanggal !== hariIni ? 'lewat' : ''}" data-id="${esc(t.id)}">
        <div class="tahanan-info">
          <div class="judul">${esc(judulTahanan(t))}</div>
          <div class="rinci">${esc(t.jam)}${t.tanggal !== hariIni ? ' · <span class="lencana kuning">kemarin</span>' : ''}
            · ${t.jumlah_item} item · <strong>${rp(t.total)}</strong>
            ${t.pelanggan?.nama && t.label ? ' · ' + esc(t.pelanggan.nama) : ''}</div>
        </div>
        <div class="tahanan-aksi">
          <button class="tombol kecil" data-tahan-buang="${esc(t.id)}">Buang</button>
          <button class="tombol kecil utama" data-tahan-lanjut="${esc(t.id)}">Lanjutkan</button>
        </div>
      </div>`).join('')}</div>`
      : '<p class="petunjuk" style="text-align:center;padding:20px 0">Tidak ada nota yang ditahan.</p>';
    Admin.modal('Nota ditahan',
      `<p class="petunjuk" style="margin-top:0">Tersimpan di perangkat ini saja dan dibuang saat shift ditutup.
         Harga dihitung ulang dari katalog saat dilanjutkan.</p>${isi}`);
  }

  return { daftar, tahan, lanjutkan, buang, buangSemua, jumlah, gambarLencana, segarkanLencana, bukaDaftar, kosongkanLayarKeranjang };
})();

/* ==================== KERANJANG ==================== */

/**
 * Daftar petugas baris, kalau memang ada. TIDAK PERNAH merah.
 *
 * Diubah 24 Agu 2026: dulu baris produk bertanda `butuh_tim` diwarnai merah
 * "butuh 2 petugas — baru 0" sampai kasir mengisinya. Padahal tempered glass
 * tidak selalu dipasangkan — sering penjualnya mengerjakan sendiri. Merah di
 * layar berarti "ada yang salah", dan memerahkan keadaan yang justru normal
 * mengajari kasir mengabaikan warna merah.
 */
function gambarBarisTim(x) {
  /* Tim EFEKTIF: pemasang yang dipilih di layar bayar ikut terlihat di barisnya,
     bukan cuma di panel ringkasan. Kasir harus bisa melihat akibat pilihannya di
     tempat barangnya berada — kalau tidak, "sudah dipilih atau belum" jadi
     pertanyaan yang cuma bisa dijawab dengan membuka layar lain. */
  const tim = Keranjang.timEfektif(x);
  if (!tim.length) return '';
  /* Kata yang ditulis adalah PERANNYA (`pasang`, `jual+pasang`), bukan label
     `tim` yang tidak menyebut apa pun. Kasir mengisi peran di sini tanpa
     pernah memilihnya — perannya ditentukan URUTAN — dan satu nama di baris
     berarti orang itu mengambil seluruh poin, omzet, dan laba baris itu.
     Akibat sebesar itu tidak boleh baru terbaca dua layar kemudian.

     Bedanya tim yang diisi tangan dan tim turunan tidak hilang: itu terbaca
     dari tombolnya — `Tim` lawan `+ Pemasang`. */
  return `<br><span class="tanda-tier">${labelTimBaris(tim)}: ${
    esc(tim.map(t => namaPetugas(t.kode)).join(', '))}</span>`;
}

/**
 * Tombol pemasang — muncul di baris yang memang DIPASANG.
 *
 * Riwayat aturannya, dan kenapa berubah dua kali:
 *
 *   · sampai 24 Agu 2026 — ditentukan `butuh_tim` di master. Salah, karena
 *     `butuh_tim` berarti "wajib berdua" dan tempered glass sering dipasang
 *     sendiri: mencentangnya memaksa dua nama walau dikerjakan satu orang,
 *     tidak mencentangnya membuat pemasangnya tidak pernah bisa dicatat.
 *   · 24 Agu 2026 — ditentukan ada-tidaknya POIN. Benar untuk masalah saat itu,
 *     tapi kelewat lebar: casing berpoin ikut mendapat tombol "+ Pemasang",
 *     padahal casing tidak pernah dipasang.
 *   · 29 Agu 2026 — ditentukan `butuh_pasang`, penanda yang artinya memang
 *     persis itu. Dilaporkan pemilik: "barang yang tidak memerlukan penanganan
 *     pemasangan tetap ada pilihan pemasangan, kurang tepat." Tombol yang
 *     muncul di tempat yang tidak ada gunanya membuat kasir menebak apa
 *     maksudnya — dan tebakan itu berakhir jadi data karangan.
 *
 * Membagi baris berpoin BIASA tetap mungkin; pintunya pindah ke tombol ⋯, bukan
 * hilang. Baris yang SUDAH punya tim selalu menampilkan tombolnya apa pun
 * penandanya — kalau tidak, tim yang terlanjur terisi tidak bisa dikoreksi lagi.
 */
/**
 * Tombol tim SENGAJA berada paling belakang di deretnya.
 *
 * Ia satu-satunya tombol yang membawa kata, jadi lebarnya mengikuti isi dan
 * bisa mencapai 94px. Di lembar keranjang HP deretan itu cuma 266px, sehingga
 * satu tombol pasti turun ke baris kedua — dan yang turun harus tombol INI,
 * bukan `⋯` yang terdesak olehnya. Sampai v1.33 urutannya − qty + [tim] ⋯,
 * jadi yang terlempar justru `⋯`, meninggalkan satu tombol yatim di baris bawah
 * yang terbaca seperti salah taruh. Urutan ini dijaga uji `uji/uji-rapi.mjs`:
 * `⋯` wajib sebaris dengan kolom qty di semua ukuran layar.
 */
function tombolTimBaris(x) {
  const tim = x.tim || [];
  if (!tim.length && !x.butuh_pasang) return '';
  /* Satu kata, satu arti. Label "Tim" tersisa dari masa tombol ini bisa memuat
     beberapa nama dengan peran yang ditebak dari urutan; sejak 8 Sep 2026 yang
     ditanyakan cuma SATU hal — siapa yang memasang. Tombol yang menjanjikan
     "tim" lalu membuka satu dropdown pemasang adalah janji yang tidak ditepati. */
  return `<button data-aksi="tim" title="Petugas yang memasang baris ini">${
    tim.length ? 'Pemasang' : '+ Pemasang'}</button>`;
}

function gambarKeranjang() {
  const b = Keranjang.baris;
  const t = Keranjang.total();

  $('#isiKeranjang').innerHTML = b.length ? b.map(x => `
    <div class="baris-item" data-id="${x.id}">
      <div class="info">
        <div class="judul">${esc(x.nama)}</div>
        <div class="rinci">${x.qty} ${esc(x.satuan)} × ${rp(x.harga_satuan)}
          ${x.sumber_harga === 'tier' ? '<span class="tanda-tier">tier</span>' : ''}
          ${x.sumber_harga === 'satuan' ? '<span class="tanda-tier">' + esc(x.satuan) + '</span>' : ''}
          ${x.hargaManual ? '<span class="tanda-manual">manual</span>' : ''}
          ${x.diskon > 0 ? '<br>Diskon −' + rp(x.diskon) : ''}
          ${x.diskonDipotong ? '<br><span style="color:var(--peringatan)">diskon dipotong ke batas peran</span>' : ''}
          ${gambarBarisTim(x)}
        </div>
      </div>
      <div class="kanan">${rp(x.qty * x.harga_satuan - x.diskon)}</div>
      <div class="aksi">
        <button data-aksi="kurang">−</button>
        <input type="number" value="${x.qty}" data-aksi="qty" min="0">
        <button data-aksi="tambah">+</button>
        <button data-aksi="detail">⋯</button>
        ${tombolTimBaris(x)}
      </div>
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
const LABEL_PERAN = { PENJUAL: 'Penjual', PEMASANG: 'Pemasang' };


/**
 * Peran ditentukan URUTAN, bukan dipilih.
 *
 * Cerminan `_peranUrut()` di server, dan server tetap yang memutuskan — ini hanya
 * supaya label di layar menyebut peran yang sama dengan yang akan tercatat.
 *
 *   Klaim NOTA  — satu orang berarti dia yang MENJUAL.
 *   Klaim BARIS — satu orang berarti dia yang MEMASANG.
 *   Dua orang   — pertama PENJUAL, kedua PEMASANG.
 */
const peranUrut = (jumlah, jenis) =>
  jumlah <= 1 ? [jenis === 'BARIS' ? 'PEMASANG' : 'PENJUAL'] : ['PENJUAL', 'PEMASANG'];
const namaPetugas = (kode) =>
  (APP_STATE.daftarPetugas.find(p => p.kode === kode) || {}).nama || kode;

/**
 * Isi SATU dropdown pramuniaga.
 *
 * Ada dua di layar: `#selPetugas` di bar alat kasir (disetel di awal, terlihat
 * sekilas selagi barang di-scan) dan `#selPetugasBayar` di layar Bayar (tempat
 * memastikannya sebelum uang diterima). Keduanya tampilan dari SATU keadaan —
 * `Keranjang.petugasNota` — dan digambar fungsi ini, bukan disalin. Dua salinan
 * daftar yang sama adalah cara paling pasti membuat keduanya berbeda diam-diam.
 */
function isiSatuDropdownPetugas(sel) {
  if (!sel) return;
  /* Diurutkan A-Z DI PENGGAMBAR, bukan saat daftarnya dimuat.
     `APP_STATE.daftarPetugas` sengaja dibiarkan apa adanya: satu-satunya yang
     butuh urut abjad adalah yang DILIHAT orang. Mengurutkan di titik muat
     berarti ada jalur muat lain yang bisa terlewat — dan dropdown yang kembali
     acak di satu layar saja adalah jenis cacat yang tidak pernah dilaporkan,
     cuma dijalani. */
  /* Disaring menurut kemampuan MENJUAL, alasannya sama dengan kolom Pemasang:
     nama yang tidak pernah bisa menjual tidak perlu ditawarkan sebagai penjual.
     `petugasUntukPeran` menawarkan semua orang selama belum ada satu pun yang
     ditandai — jadi toko yang belum sempat mengisi kolomnya tidak kehilangan
     apa pun. */
  const daftar = urutkanOleh(petugasUntukPeran(APP_STATE.daftarPetugas || [], 'PENJUAL'),
                             p => p.nama);
  const dipilih = Keranjang.petugasNota;

  // Toko yang belum mengisi daftar petugas tidak perlu melihat kolom yang selalu kosong.
  sel.classList.toggle('sembunyi', daftar.length === 0);
  if (!daftar.length) return;

  /* Cabang "lebih dari satu nama" DICABUT 8 Sep 2026 bersama tombol Tim tingkat
     nota. Ia menggambar ringkasan `2 pramuniaga` yang hanya bisa disunting lewat
     tombol itu; tanpa tombolnya, ringkasan yang sama jadi kolom mati yang tidak
     punya jalan keluar. Keadaannya sendiri sudah tidak mungkin: `setPetugasNota`
     memangkas ke satu nama. */
  const terpilih = (dipilih[0] || {}).kode || '';
  sel.innerHTML =
    `<option value="">${APP_STATE.klaimWajib ? '— pilih pramuniaga —' : 'Tanpa pramuniaga'}</option>` +
    daftar.map(p => `<option value="${esc(p.kode)}" ${p.kode === terpilih ? 'selected' : ''}>${
      esc(p.nama)}${p.peran_utama && p.peran_utama !== 'PENJUAL'
        ? ' · ' + esc(String(p.peran_utama).toLowerCase()) : ''}</option>`).join('');
}

/**
 * Kolom PEMASANG di layar bayar — muncul hanya kalau memang ada yang dipasang.
 *
 * Diminta pemilik 29 Agu 2026. Sebelum ini satu-satunya jalan menyebut pemasang
 * adalah tombol "Tim" per baris: kasir harus tahu baris mana yang dipasang,
 * membukanya, lalu memilih dua nama — untuk pekerjaan yang terjadi di hampir
 * setiap nota tempered glass. Sekarang cukup satu pilihan di layar bayar, dan
 * ia menempel sendiri ke baris-baris yang butuh dipasang.
 *
 * Kolomnya SEMBUNYI selama tidak ada barang yang dipasang. Kolom yang selalu
 * ada tapi hampir selalu kosong mengajari orang mengabaikannya — dan yang
 * diabaikan sama saja dengan yang tidak ada.
 */
function gambarPilihanPemasang() {
  const baris = $('#barisPemasang');
  const sel = $('#selPemasangBayar');
  if (!baris || !sel) return;

  const perlu = Keranjang.adaButuhPasang();
  baris.classList.toggle('sembunyi', !perlu);
  if (!perlu) return;

  // Dropdown yang sedang dibuka tidak boleh disusun ulang di tengah orang memilih.
  if (document.activeElement === sel) return;

  const daftar = urutkanOleh(petugasUntukPeran(APP_STATE.daftarPetugas || [], 'PEMASANG'),
                             p => p.nama);
  const kini = Keranjang.pemasangNota;
  sel.innerHTML = '<option value="">— belum dipilih —</option>' +
    daftar.map(p => `<option value="${esc(p.kode)}" ${p.kode === kini ? 'selected' : ''}>${
      esc(p.nama)}</option>`).join('');
}

/** Gambar ulang KEDUA dropdown pramuniaga sekaligus, supaya tidak pernah beda. */
/**
 * Tarik ulang master DENGAN PAKSA, lalu gambar ulang yang bergantung padanya.
 *
 * `paksa` bukan hiasan. `tarikMaster()` biasa mengirim `versi_master` yang
 * tersimpan, dan server menjawab "tidak ada perubahan" kalau nomornya sama —
 * jadi perangkat yang menarik master SEBELUM sebuah kolom baru ada tidak akan
 * pernah menerimanya, berapa kali pun ia sinkron. Itulah yang membuat daftar
 * petugas bisa kosong selamanya di satu mesin sementara mesin sebelah baik-baik
 * saja.
 *
 * Satu fungsi, dua pemanggil (tombol di layar Perangkat dan cip di bar alat
 * kasir). Dua salinan urutan langkah ini akan berpisah jalan, dan yang berpisah
 * di sini berarti salah satunya menyegarkan separuh.
 */
async function tarikUlangMaster() {
  try {
    await Sync.tarikMaster(true);
    await Sync.tarikStok();
    await muatMaster();
    await gambarProduk($('#inpCari')?.value || '');
    Admin.toast('Data master diperbarui.');
  } catch (e) {
    Admin.toast('Gagal menarik master: ' + e.message, 'galat');
  }
}

function gambarPilihanPetugas() {
  isiSatuDropdownPetugas($('#selPetugas'));
  isiSatuDropdownPetugas($('#selPetugasBayar'));

  /* Kolomnya tetap disembunyikan saat daftarnya kosong — keputusan lama, dan
     alasannya masih berlaku: toko yang belum mengisi daftar petugas tidak perlu
     melihat kolom yang selalu kosong.

     Yang salah bukan itu, melainkan bahwa keadaan itu TIDAK MENINGGALKAN JEJAK
     APA PUN. Dilaporkan pemilik 8 Sep 2026: pramuniaga dan pemasangan "hilang".
     Keduanya memang tidak digambar, dan tidak ada satu kata pun di layar yang
     membedakan "toko ini memang belum punya petugas" dari "daftarnya gagal
     turun ke mesin ini". Cip ini yang membedakannya — dan ia membawa
     tindakannya sekaligus, bukan cuma keluhan. */
  const kosong = petugasUntukPeran(APP_STATE.daftarPetugas || [], 'PENJUAL').length === 0;
  $('#lncPetugasKosong')?.classList.toggle('sembunyi', !kosong);
}

/**
 * Klaim petugas di layar bayar — sekarang BISA DIUBAH DI TEMPAT.
 *
 * Sebelum 24 Agu 2026 bagian ini hanya mengabarkan bahwa klaimnya kurang lalu
 * menyuruh kasir keluar: "Pilih siapa yang melayani di kolom pramuniaga pada
 * layar kasir." Itu jalan buntu tepat di detik pembeli menyodorkan uang —
 * tombol Selesaikan mati, dan satu-satunya jalan keluar adalah menutup layar
 * bayar, memperbaiki, lalu mengulang seluruh pengisian pembayaran.
 *
 * Dropdown di bar alat kasir SENGAJA tidak dipindah ke sini, hanya digandakan
 * tampilannya: pramuniaga diketahui saat pembeli datang, bukan saat membayar,
 * dan menyetelnya di awal berarti layar bayar tinggal memastikan. Keduanya
 * membaca dan menulis satu keadaan yang sama.
 *
 * @return {boolean} boleh dilanjutkan
 */
/**
 * SIAPA MENDAPAT APA — satu daftar, terlihat sebelum notanya ditutup.
 *
 * Dilaporkan dari lapangan 28 Agu 2026: petugas bingung karena ada DUA tempat
 * mengisi nama (dropdown "Pramuniaga" untuk nota, tombol "Tim" untuk baris) tapi
 * cuma SATU yang pernah ditampilkan. Yang memasang tempered glass tidak muncul
 * di layar bayar maupun di struk — namanya baru bisa dicek berhari-hari kemudian
 * di Laporan poin, saat sudah tidak ada yang ingat notanya. Dari lantai toko itu
 * terbaca sebagai dua aturan yang saling bertentangan.
 *
 * Jalur pengisiannya sengaja TIDAK diubah — yang cepat tetap cepat. Yang
 * ditambahkan cuma satu: hasil akhirnya dipampang, dan dipampang dari sumber
 * yang SAMA dengan yang dipakai struk (`susunPeranNota` di print.js). Menyusun
 * daftar kedua di sini akan mengulang persis kesalahan yang sedang diperbaiki.
 *
 * Poin sengaja tidak diangkakan di layar ini. Angka pastinya diputuskan server
 * lewat bobot peran, dan menampilkan taksiran di sisi kasir hanya melahirkan
 * angka kedua yang bisa berbeda dari yang tercatat — persis pola yang sudah
 * dihindari `Keranjang.petugasNota` (lihat komentarnya di pos.js).
 */
function gambarRosterKlaim() {
  const hitungNama = {};
  Keranjang.baris.forEach(b => { hitungNama[b.nama] = (hitungNama[b.nama] || 0) + 1; });
  const semu = {
    klaim: Keranjang.petugasNota,
    /* Tim EFEKTIF, bukan `b.tim` mentah — pemasang yang baru dipilih di layar
       bayar harus ikut terlihat di panel ini. Sumbernya sama persis dengan yang
       dikirim ke server dan yang dicetak di struk (`timEfektifBaris` di pos.js),
       jadi ketiganya tidak mungkin berbeda. */
    /* Nama produk di katalog ini TIDAK unik — 98 dari 382 SKU memakai salah
       satu dari empat nama generik, yang terbesar dipakai 41 SKU (lihat
       `tokenProduk` di pos.js). Tiga baris "TG OG Multi_Fit" dengan tiga
       pemasang berbeda karena itu terbaca seperti satu barang yang dikerjakan
       bertiga. Pembedanya ditambahkan HANYA saat namanya memang kembar di
       keranjang ini — kalau selalu, panelnya jadi penuh kode yang tidak
       dibutuhkan. Pembedanya dikurung, BUKAN dipisah titik-tengah: daftar
       pekerjaan satu orang juga dipisah titik-tengah, dan dua pemisah yang sama
       membuat "A \u00b7 Samsung A20 \u00b7 B" tidak bisa dibaca sebagai dua pekerjaan
       atau tiga. Ketahuan saat dilihat dengan mata, bukan saat dipikirkan.
       Ini nama untuk DILIHAT saja; yang dikirim ke server dan
       dicetak di struk tetap nama aslinya. */
    item: Keranjang.baris.map(b => ({
      nama: b.nama + (hitungNama[b.nama] > 1
        ? ' (' + ((b._produk && b._produk.tipe_hp) || b.sku) + ')' : ''),
      poin_satuan: b.poin_satuan, tim: Keranjang.timEfektif(b)
    }))
  };
  const r = susunPeranNota(semu, APP_STATE.daftarPetugas);
  if (!r.rinci.length && !r.tanpaPetugas.length) return '';

  /* Digabung per ORANG + PERAN. Satu pemasang yang mengerjakan tiga baris cukup
     muncul sekali dengan ketiga pekerjaannya, bukan tiga baris berbeda yang
     terbaca seperti tiga orang. */
  const peta = [];
  r.rinci.forEach(x => {
    const ada = peta.find(y => y.kode === x.kode && y.peran === x.peran);
    if (ada) ada.kerja.push(x.pekerjaan);
    else peta.push({ kode: x.kode, nama: x.nama, peran: x.peran, kerja: [x.pekerjaan] });
  });

  /* "baris tanpa tim sendiri" benar tapi memaksa kasir menebak yang mana.
     Barisnya disebut namanya, sama seperti baris lain di panel ini. Dipotong
     di tiga: daftar sepanjang keranjang membuat panel ini lebih tinggi
     daripada isi yang dijelaskannya. */
  const sisa = semu.item.filter(i => !i.tim.length).map(i => i.nama).filter(Boolean);
  const sisaTeks = !sisa.length ? 'seluruh nota'
    : sisa.slice(0, 3).join(', ') + (sisa.length > 3 ? ` +${sisa.length - 3} lagi` : '');
  const kerjaTeks = (k) => k.map(x => x === 'nota' ? sisaTeks : x).join(' · ');

  const baris = peta.map(p => `
    <div style="display:flex;gap:8px;align-items:baseline;padding:4px 0">
      <strong style="min-width:0">${esc(p.nama)}</strong>
      <span class="lencana ${p.peran === 'PEMASANG' ? 'kuning' : 'hijau'}">${
        p.peran === 'PEMASANG' ? 'memasang' : 'melayani'}</span>
      <span style="color:var(--teks-redup);font-size:var(--fs-12);flex:1;min-width:0">${esc(kerjaTeks(p.kerja))}</span>
    </div>`).join('');

  /* Baris berpoin yang tidak dimiliki siapa pun disebut NAMANYA, bukan cuma
     dihitung. "1 baris belum ada petugasnya" memaksa kasir menebak yang mana;
     menyebut namanya membuatnya bisa langsung ditekan tombol Tim-nya. */
  const yatim = r.tanpaPetugas.length && !Keranjang.petugasNota.length
    ? `<div class="pesan galat" style="margin-top:6px">Belum ada yang mengklaim: <strong>${
        esc(r.tanpaPetugas.join(', '))}</strong></div>`
    : '';

  /* Kalau pramuniaga nota sudah dipilih tapi SELURUH baris punya timnya sendiri,
     namanya memang tidak muncul di daftar — itu aturan servernya, bukan bug.
     Tanpa keterangan ini kasir melihat nama yang barusan ia pilih lenyap begitu
     saja dari panel, dan itu menambah kebingungan yang sedang diobati.
     Menjelaskan lebih baik daripada diam-diam menghilangkan. */
  const notaTakDipakai = !r.adaSisaNota && Keranjang.petugasNota.length
    ? `<div class="pesan" style="margin-top:6px">Seluruh baris sudah punya timnya sendiri, jadi
        <strong>${esc(Keranjang.petugasNota.map(x => namaPetugas(x.kode)).join(', '))}</strong>
        tidak mendapat poin di nota ini.</div>`
    : '';

  return `<div class="pesan info" style="text-align:left">
      <div style="font-size:var(--fs-12);color:var(--teks-redup);margin-bottom:4px">Poin nota ini masuk ke</div>
      ${baris || '<em>belum ada</em>'}
    </div>${yatim}${notaTakDipakai}`;
}

function gambarJagaKlaim() {
  const w = $('#byrJagaKlaim');
  if (!w) return true;

  /* Tidak ada lagi penahan "tim belum lengkap". Sejak 24 Agu 2026 pemasang
     bersifat opsional per baris — memaksa dua nama pada tempered glass yang
     sering dikerjakan sendiri hanya membuat kasir mengarang nama kedua supaya
     tombolnya hidup, dan data karangan lebih buruk daripada data kosong. */

  // Ada baris yang masih bergantung pada klaim nota?
  const adaSisa = Keranjang.baris.some(b => !(b.tim || []).length);
  const daftar = Keranjang.petugasNota;
  const kurang = APP_STATE.klaimWajib && adaSisa && !daftar.length;

  /* Peringatan, BUKAN penahan. Kadang penjualnya memasang sendiri, kadang
     pelanggan memasang di rumah — menahan nota berarti menahan uang masuk demi
     data yang belum tentu kurang. Warnanya kuning, bukan merah: merah berarti
     "ada yang salah", dan yang ini cuma "periksa dulu".
     Muncul hanya kalau memang ada barang yang dipasang dan pemasangnya belum
     dipilih; baris yang sudah punya timnya sendiri tidak dihitung kurang. */
  const pasangKosong = Keranjang.adaButuhPasang() && !Keranjang.pemasangNota;
  const ket = (kurang
    ? '<div class="pesan galat">Nota ini belum ada pramuniaganya — pilih di sini.</div>'
    : '') + (pasangKosong
    ? '<div class="pesan peringatan">Ada barang yang dipasang, tapi pemasangnya belum dipilih.</div>'
    : '') + gambarRosterKlaim();

  /* Digambar ulang setiap kali ringkasan bayar berubah — termasuk pada setiap
     ketikan jumlah uang. Menyusun ulang elemen yang sedang dipakai akan
     merampas fokus dan menutup daftar dropdown yang sedang dibuka, jadi
     rangkanya hanya dibuat SEKALI lalu isinya saja yang diperbarui. */
  if (!w.querySelector('#selPetugasBayar')) {
    w.innerHTML =
      `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
         <label style="margin:0;white-space:nowrap">Pramuniaga</label>
         <select id="selPetugasBayar" style="flex:1;min-width:0"
                 title="Pramuniaga yang melayani nota ini"></select>
       </div>
       <div id="barisPemasang" class="sembunyi"
            style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
         <label style="margin:0;white-space:nowrap">Pemasang</label>
         <select id="selPemasangBayar" style="flex:1;min-width:0"
                 title="Petugas yang memasang barang di nota ini"></select>
       </div>
       <div id="byrKetKlaim"></div>`;
  }
  /* Isinya tetap disegarkan tiap kali — kecuali saat kolomnya SEDANG DIPAKAI.
     Menyusun ulang <option> pada dropdown yang sedang terbuka akan menutup
     daftarnya di tengah kasir memilih. */
  const sel = $('#selPetugasBayar');
  if (document.activeElement !== sel) isiSatuDropdownPetugas(sel);
  gambarPilihanPemasang();
  $('#byrKetKlaim').innerHTML = ket;
  return !kurang;
}

/* ---------- Modal tim ---------- */

/**
 * Dialog SATU pertanyaan: siapa yang memasang baris ini.
 *
 * Jalur '#NOTA' DICABUT 8 Sep 2026 bersama tombol Tim tingkat nota. Pramuniaga
 * nota sudah punya satu-satunya tempatnya — dropdown di bar alat kasir, yang
 * digandakan di layar bayar — dan satu nota hanya boleh punya satu penjual.
 * Dialog kedua untuk hal yang sama cuma menambah tempat orang bisa salah.
 *
 * @param idBaris id baris keranjang.
 */
function bukaTim(idBaris) {
  const b = Keranjang.baris.find(x => x.id === idBaris);
  if (!b) return;
  if (!APP_STATE.daftarPetugas.length) {
    return Admin.toast('Daftar petugas masih kosong. Isi lebih dulu lewat menu Petugas.', 'galat');
  }

  /* Satu nota = satu penjual, mutlak (keputusan pemilik, 8 Sep 2026). Karena itu
     penjual sebuah BARIS tidak pernah bisa berbeda dari pramuniaga notanya, dan
     pemasang selalu MENDAMPINGI penjualnya — tidak pernah menggantikannya.
     Tanpa pramuniaga nota, tidak ada penjual yang bisa dikunci ke barisnya.

     Inilah yang dulu bocor: tim baris berisi satu nama membuat orang itu
     PEMASANG yang mengambil 100% poin, omzet, dan laba baris tersebut, dan
     penjualnya lenyap dari baris itu tanpa satu pun tanda di layar. */
  const penjual = (Keranjang.petugasNota[0] || {}).kode || '';
  if (!penjual) {
    return Admin.toast('Pilih pramuniaga nota ini dulu di bar alat kasir — '
                     + 'pemasang mendampingi penjualnya, bukan menggantikannya.', 'galat');
  }

  APP_STATE.timBaris = idBaris;
  // Poin bawaan pekerjaan ini — dari `poin_satuan` produk dikali qty dasarnya.
  const poinDasar = Keranjang.poinBaris(idBaris);
  APP_STATE._timPoinDasar = poinDasar;

  $('#timJudul').textContent = 'Pemasang — ' + b.nama;
  $('#timRingkas').innerHTML = `<p class="petunjuk">Penjualnya sudah pasti pramuniaga
    nota ini. Yang dipilih di sini hanya <strong>siapa yang memasang</strong> baris ini
    — dan karena itu baris ini keluar dari klaim nota.
    Pekerjaan ini bernilai <strong>${poinDasar} poin</strong> menurut master produk,
    dan dibagi menurut bobot peran. Keduanya diatur back office — di sini tinggal
    memilih orangnya.</p>
    ${poinDasar > 0 ? '' : `<div class="pesan info">Produk ini belum diberi nilai poin,
      jadi penjualannya tidak berpoin. Omzetnya tetap tercatat atas nama petugas.</div>`}`;

  /* BENTUK DRAFT-nya TETAP: dua slot, selalu. Penjual TERKUNCI ke pramuniaga
     nota, pemasang yang boleh dipilih — dan boleh dikosongkan.

     Tim baris lama yang cuma berisi SATU nama dibaca sebagai pemasangnya, bukan
     penjualnya — itu memang artinya menurut `_peranUrutKlaim(1, 'BARIS')`. */
  const timLama = Keranjang.timBaris(idBaris);
  const pemasangLama = timLama.length > 1 ? (timLama[1] || {}).kode || ''
                     : (timLama[0] || {}).kode || '';
  APP_STATE._timDraft = [{ kode: penjual },
                         { kode: pemasangLama === penjual ? '' : pemasangLama }];

  pesan('#pesanTim', '');
  gambarAnggotaTim();
  $('#tiraiTim').classList.add('tampil');
  setTimeout(() => $$('#timDaftar select[data-f=kode]')[0]?.focus(), 60);
}

function gambarAnggotaTim() {
  const d = APP_STATE._timDraft || [];

  /* Tiap slot hanya menawarkan orang yang MAMPU mengerjakan perannya. Slot
     "Pemasang" yang berisi seluruh nama adalah cara paling mudah mencatat
     pemasangan atas nama orang yang tidak pernah bisa memasang — dan itu baru
     ketahuan saat bagi hasil, saat sudah tidak ada yang ingat notanya.
     Nama yang SUDAH terpilih tetap ikut ditampilkan meski tidak lolos saringan,
     supaya klaim lama tidak lenyap dari layar tanpa penjelasan. */
  /* Penjualnya sendiri TIDAK ditawarkan sebagai pemasang. Menuliskan satu nama
     dua kali di satu baris justru memotong poin orang itu sendiri, dan
     "dipasang sendiri" sudah punya jalannya: kosongkan saja pemasangnya. */
  const penjualKini = (d[0] || {}).kode || '';
  const opsi = (peran, terpilih) => {
    const boleh = petugasUntukPeran(APP_STATE.daftarPetugas || [], peran)
      .filter(p => peran !== 'PEMASANG' || p.kode !== penjualKini);
    const ada = boleh.some(p => p.kode === terpilih);
    const daftar = ada || !terpilih ? boleh
      : boleh.concat((APP_STATE.daftarPetugas || []).filter(p => p.kode === terpilih));
    return urutkanOleh(daftar, p => p.nama).map(p =>
      `<option value="${esc(p.kode)}" ${p.kode === terpilih ? 'selected' : ''}>${esc(p.nama)}</option>`).join('');
  };

  /* SATU bentuk TETAP, bukan daftar yang bisa tumbuh: penjual yang terkunci —
     ditampilkan supaya kasir melihat atas nama siapa barisnya, tapi tidak bisa
     diubah — lalu satu pilihan pemasang yang BOLEH dikosongkan. Kosong artinya
     baris ini dikerjakan sendiri oleh penjualnya, bukan artinya belum diisi. */
  $('#timDaftar').innerHTML =
      `<div class="baris-anak" style="margin-bottom:8px">
         <label>Penjual</label>
         <input type="text" data-f="penjual" readonly tabindex="-1"
                title="Satu nota, satu penjual — diubah di bar alat kasir"
                value="${esc(namaPetugas((d[0] || {}).kode))}"></div>
       <div class="baris-anak" style="margin-bottom:8px">
         <label>Pemasang</label>
         <select data-i="1" data-f="kode">
           <option value="">— tidak ada, dipasang sendiri —</option>${opsi('PEMASANG', (d[1] || {}).kode)}
         </select></div>`;

  gambarBagianTim();
}

/**
 * Pratinjau pembagian — hanya untuk DIBACA.
 *
 * Kasir tidak mengetik satu angka pun di sini: poin berasal dari master produk,
 * dan pembagiannya dari bobot peran yang diatur back office. Yang ditampilkan
 * adalah hasil aturan itu, dihitung dengan cara yang sama seperti di server,
 * supaya kasir bisa melihat akibat pilihannya sebelum menyimpan.
 */
/* `peranSlot`, `peranKodeSlot`, dan `rapikanDraft` DICABUT 8 Sep 2026.

   Ketiganya ada untuk satu hal: daftar slot yang panjangnya bisa berubah, yang
   karenanya bisa punya slot kosong di atas slot terisi — dan saat itu terjadi,
   satu orang di slot kedua tampil "Pemasang" padahal server mencatatnya
   "Penjual", karena yang dikirim sudah disaring `filter(a => a.kode)`.

   Bentuk draftnya sekarang TETAP — nota satu slot, baris penjual-terkunci +
   pemasang — jadi tidak ada lagi urutan yang bisa bergeser, dan peran tidak
   lagi ditebak dari posisi. Bahayanya hilang bersama mekanismenya, bukan
   dijaga oleh perapian. Penjaganya di uji.js ikut diganti. */

function gambarBagianTim() {
  const d = APP_STATE._timDraft || [];
  const total = Number(APP_STATE._timPoinDasar) || 0;
  // Dialog ini hanya pernah membicarakan satu BARIS sejak jalur '#NOTA' dicabut.
  const jenis = 'BARIS';

  $('#timTotalPoin').textContent = total + ' poin';
  $('#timTotalPoin').style.color = total > 0 ? 'var(--sukses)' : 'var(--teks-redup)';

  const elR = $('#timPorsi');
  const isi = d.filter(a => a.kode);
  if (!isi.length) { elR.textContent = 'pilih petugasnya dulu'; return; }

  /* Baris tanpa pemasang BUKAN tim beranggota satu: ia kembali ikut klaim
     nota, dan di sana penjualnya sendirian — seluruhnya miliknya. Menghitungnya
     sebagai tim satu orang akan menyebutnya PEMASANG, peran yang justru tidak
     terjadi di baris itu. */
  if (isi.length === 1) {
    elR.textContent = `${namaPetugas(isi[0].kode).split(' ')[0]} ${total} poin (100%)`;
    return;
  }

  /* Dihitung dari yang TERISI — persis daftar yang dikirim ke server. */
  const porsi = porsiDariBobot(peranUrut(isi.length, jenis));
  const bagi = bagiRata(total, porsi);
  elR.textContent = isi.map((a, i) =>
    `${namaPetugas(a.kode).split(' ')[0]} ${bagi[i]} poin (${porsi[i]}%)`).join(' · ');
}

/** Bobot peran -> porsi persen yang selalu berjumlah 100. Cerminan server. */
function porsiDariBobot(peran) {
  const w = peran.map(p => Math.max(Number((APP_STATE.bobotPeran || {})[p]) || 0, 0.0001));
  const jml = w.reduce((a, b) => a + b, 0);
  const out = []; let kumpul = 0;
  for (let i = 0; i < peran.length; i++) {
    if (i === peran.length - 1) { out.push(Math.round((100 - kumpul) * 100) / 100); break; }
    const v = Math.round(w[i] / jml * 10000) / 100;
    out.push(v); kumpul += v;
  }
  return out;
}

/** Bagi sebuah nilai menurut porsi; bagian terakhir mengambil sisanya. */
function bagiRata(total, porsi) {
  const out = []; let sisa = Math.round(total * 100) / 100;
  for (let i = 0; i < porsi.length; i++) {
    if (i === porsi.length - 1) { out.push(Math.round(sisa * 100) / 100); break; }
    const v = Math.round(total * porsi[i]) / 100;
    out.push(v); sisa = Math.round((sisa - v) * 100) / 100;
  }
  return out;
}

function simpanTim() {
  const d = APP_STATE._timDraft || [];
  const penjual = (d[0] || {}).kode || '';
  const b = Keranjang.baris.find(x => x.id === APP_STATE.timBaris);
  if (!b) { $('#tiraiTim').classList.remove('tampil'); return; }

  const pemasang = (d[1] || {}).kode || '';
  /* Pemasang kosong ATAU pemasang = penjualnya berarti dikerjakan sendiri:
     barisnya tidak punya tim, ia kembali ikut klaim nota, dan penjualnya
     mendapat seluruhnya. Menuliskan satu nama yang sama dua kali justru
     memotong poin orang itu sendiri (§19). */
  Keranjang.setTimBaris(APP_STATE.timBaris,
    (pemasang && pemasang !== penjual) ? [{ kode: penjual }, { kode: pemasang }] : []);

  $('#tiraiTim').classList.remove('tampil');
  APP_STATE.timBaris = null;
  gambarPilihanPetugas();
  gambarKeranjang();
  if ($('#tiraiBayar').classList.contains('tampil')) gambarRingkasBayar();
}

/* ==================== PEMBAYARAN ==================== */
/**
 * Buka sendiri lipatan "Opsional" begitu isinya tidak lagi kosong.
 *
 * Diskon nota dan Garansi dilipat sejak v1.166 karena jarang dipakai dan
 * menempati bagian paling atas layar. Tapi nilai yang SUDAH terisi lalu
 * tersembunyi adalah nilai yang terlupa - dan lupa memberi diskon lebih mahal
 * daripada satu baris ekstra di layar. Jadi lipatannya hanya menutup selama
 * benar-benar kosong.
 *
 * Hanya pernah MEMBUKA, tidak pernah menutup: kasir yang sengaja membuka
 * lipatan untuk melihat-lihat tidak boleh diatupkan lagi oleh gambar ulang
 * yang berjalan pada setiap ketikan jumlah uang.
 */
function segarkanLipatanOpsional() {
  const d = $('#byrOpsional');
  if (!d || d.open) return;
  if (angkaDari($('#byrDiskonNota').value || '0') > 0 ||
      Number($('#byrGaransi').value || 0) > 0) d.open = true;
}

function bukaBayar() {
  if (Keranjang.kosong) return;
  if (!APP_STATE.idShift) {
    /* Dulu di sini hanya ada alert yang menunjuk nama menu lama. Menunya sudah
       berganti nama jadi "Perangkat", jadi pesannya mengarahkan ke tempat yang
       tidak ada — dan layar pengaturan sistem memang tersembunyi bagi kasir. Sekarang
       pengguna langsung diantar ke kartu shift-nya. */
    /* Sengaja TIDAK di-await, dan `bukaBayar` sengaja tidak dijadikan async:
       ia dipanggil dari penangan klik DAN dari pintasan F12, dan tidak ada satu
       baris pun sesudah ini yang bergantung pada jawabannya. */
    Admin.tanya('Shift belum dibuka',
      '<p class="petunjuk">Transaksi belum bisa disimpan sebelum shift dibuka.</p>',
      { ya: 'Buka shift' }).then(ya => { if (ya) menujuBukaShift(); });
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
  $('#byrDiskonNota').value = ribuan(Keranjang.diskonNota);
  $('#byrJatuhTempo').value = '';
  $('#byrGaransi').value = '0';
  segarkanLipatanOpsional();
  pesan('#pesanBayar', '');
  pesan('#byrJagaKlaim', '');
  gambarBayar();
  $('#tiraiBayar').classList.add('tampil');
  /* Kolomnya dipilih SEKALIGUS digulirkan ke tengah kotak isi.

     Tanpa gulir, kasir di HP mendarat di puncak layar - TOTAL, lipatan
     Opsional, tiga kotak penjagaan - sementara kolom Jumlah dan baris pintasan
     uang (500 ... 100.000, Uang pas) ada di bawah lipatan. Itulah sebabnya
     pemilik mengira pintasannya belum ada dan memintanya dibuat: fiturnya ada
     sejak lama, orangnya tidak pernah melihatnya.

     Dipakai block:center, bukan block:nearest - yang perlu terlihat bukan
     hanya kolomnya, tapi juga deretan cip TEPAT DI BAWAHNYA. */
  setTimeout(() => {
    const inp = $$('#byrDaftarMetode input[data-f=jumlah]')[0];
    if (!inp) return;
    inp.select();
    (inp.closest('.baris2') || inp).scrollIntoView({ block: 'center' });
  }, 60);
}

/* Pecahan rupiah yang beredar. Dipakai sebagai tombol tambah-cepat pada
   pembayaran tunai: kasir menekan pecahan yang diterima, bukan mengetik. */
const PECAHAN = [500, 1000, 2000, 5000, 10000, 20000, 50000, 75000, 100000];
/**
 * Label tombol pecahan: "500", "1k", "75k", "100k".
 *
 * SEBELUM v1.173 ditulis penuh ("100.000") dengan alasan yang masuk akal saat
 * itu: angkanya sama persis dengan yang tercetak di uangnya, jadi tidak perlu
 * diterjemahkan di kepala saat buru-buru.
 *
 * Alasan itu gugur begitu tombolnya DIGAMBAR MENYERUPAI LEMBARAN UANG
 * (permintaan pemilik 11 Sep 2026). "50k" di atas persegi biru seukuran dan
 * sewarna uang lima puluh ribu bukan lagi angka yang harus diurai — ia label di
 * atas benda yang sudah dikenali sebelum dibaca. Yang dipertukarkan: dua
 * karakter lebih pendek, sehingga sembilan tombol muat satu baris di tablet
 * kasir tanpa membungkus.
 *
 * Di bawah seribu TIDAK disingkat: "500" sudah sependek mungkin, dan "0,5k"
 * justru menambah pekerjaan membaca.
 */
const labelPecahan = (n) => n >= 1000
  ? (n / 1000) + 'k'
  : new Intl.NumberFormat(CONFIG.LOCALE).format(n);

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
        <div style="flex:1"><label>Jumlah${m.metode === 'piutang' ? ' <span style="color:var(--teks-redup);font-weight:400">(sisa, dihitung)</span>' : ''}</label>
          <input type="text" inputmode="numeric" class="uang" data-i="${i}" data-f="jumlah"
                 value="${ribuan(m.jumlah)}"${m.metode === 'piutang' ? ' readonly' : ''}></div>
        ${i > 0 ? `<button class="tombol bahaya" data-i="${i}" data-f="hapus" style="padding:12px 12px">×</button>` : ''}
      </div>
    </div>
    ${m.metode === 'tunai' ? `
    <div class="pecahan" role="group" aria-label="Uang diterima (metode ${i + 1})">
      ${/* `uang u-N` dipakai CSS untuk mewarnai tiap pecahan sesuai lembaran
             aslinya. Kelasnya dari NILAI, bukan urutan — menyisipkan pecahan
             baru di tengah tidak akan menggeser warna tetangganya.
             (Tanpa petik-balik: blok ini di dalam template literal.) */''}
      ${/* DUA BARIS, dipisah wadah — bukan dibiarkan membungkus sendiri.
             Dibiarkan, "75k" dan "100k" turun menemani "Uang pas" dan "C" di
             baris kedua, dan nominal bercampur perintah. Kasir yang mencari
             pecahan jadi harus menyaring dua tombol yang bukan uang di antara
             deretan uang. Dipisah, kedua kelompok selalu utuh berapa pun lebar
             layarnya. (Tanpa petik-balik: blok ini di dalam template literal.) */''}
      <div class="pecahan-baris">
        ${PECAHAN.map(n => `<button type="button" class="cip uang u-${n}" data-i="${i}" data-f="pecahan"
            data-nilai="${n}" title="Tambah ${rp(n)}"><span>${labelPecahan(n)}</span></button>`).join('')}
      </div>
      <div class="pecahan-baris">
        <button type="button" class="cip pas" data-i="${i}" data-f="pas">Uang pas</button>
        <button type="button" class="cip kosong" data-i="${i}" data-f="nol" title="Nolkan">C</button>
      </div>
    </div>` : ''}`).join('');
}

function gambarBayar() { gambarMetode(); gambarRingkasBayar(); }

function gambarRingkasBayar() {
  const t = Keranjang.total();
  $('#byrTotal').textContent = rp(t.total);

  /* Baris PIUTANG dihitung, tidak diketik: nilainya adalah sisa yang belum
     tertutup metode lain. Itu definisi utang, bukan pilihan — dan server
     menghitungnya dengan cara yang sama persis (lihat _susunPenjualan di
     07_Sales.gs). Kalau layar membiarkannya diketik, angka di struk yang
     tercetak di sini akan berbeda dari yang masuk pembukuan. */
  const iPiutang = APP_STATE.metodeBayar.findIndex(m => m.metode === 'piutang');
  if (iPiutang >= 0) {
    const lain = APP_STATE.metodeBayar.reduce((a, m, j) => j === iPiutang ? a : a + Number(m.jumlah || 0), 0);
    APP_STATE.metodeBayar[iPiutang].jumlah = Math.max(0, t.total - lain);
    const inp = $(`#byrDaftarMetode input[data-f=jumlah][data-i="${iPiutang}"]`);
    if (inp) inp.value = ribuan(APP_STATE.metodeBayar[iPiutang].jumlah);
  }

  const dibayar = APP_STATE.metodeBayar.reduce((a, m) => a + Number(m.jumlah || 0), 0);
  const selisih = dibayar - t.total;
  const adaPiutang = iPiutang >= 0;

  $('#byrDibayar').textContent = rp(dibayar);
  segarkanLipatanOpsional();
  $('#byrLabelSisa').textContent = selisih >= 0 ? 'Kembali' : 'Kurang';
  $('#byrSisa').textContent = rp(Math.abs(selisih));
  $('#byrSisa').style.color = selisih < 0 ? 'var(--bahaya)' : 'var(--sukses)';
  $('#grupJatuhTempo').classList.toggle('sembunyi', !adaPiutang);
  /* Tidak ada lagi pengecualian untuk nota bon. Dulu `!adaPiutang && selisih < 0`
     membiarkan kurang bayar lewat justru pada nota yang paling mudah salah —
     cermin dari lubang yang sama di server. Sekarang barisnya sudah dihitung,
     jadi selisihnya memang tidak akan pernah negatif; penjagaannya tetap ada
     supaya perubahan berikutnya tidak diam-diam membukanya lagi. */
  $('#btnSelesaikan').disabled = selisih < 0;
  /* KELEBIHAN BAYAR HANYA MASUK AKAL UNTUK TUNAI.
     Uang kembalian diambil dari laci; ia tidak bisa diberikan dari transfer,
     QRIS, atau kartu. `selesaikanTransaksi()` memang hanya memotong kelebihan
     dari baris TUNAI — dan itu benar. Yang salah adalah layarnya: sampai audit
     5 Sep 2026 ia tetap menampilkan "Kembali" berwarna hijau dan membiarkan
     Selesaikan ditekan. Struk tercetak, uang diserahkan, lalu SERVER yang
     menolak notanya karena jumlah bayar tidak sama dengan total. Uang keluar,
     nota tidak pernah masuk pembukuan. Salah ketik satu nol pada kolom transfer
     sudah cukup. */
  const tunai = APP_STATE.metodeBayar
    .filter(m => m.metode === 'tunai')
    .reduce((a, m) => a + Number(m.jumlah || 0), 0);
  if (selisih > 0 && selisih > tunai + 0.5) {
    pesan('#pesanBayar',
      `Kelebihan ${rp(selisih - tunai)} ada di metode non-tunai — kembalian tidak bisa ` +
      'diberikan dari transfer/QRIS/kartu. Betulkan jumlahnya.', 'galat');
    $('#btnSelesaikan').disabled = true;
  }
  if (adaPiutang && APP_STATE.metodeBayar[iPiutang].jumlah <= 0) {
    pesan('#pesanBayar', 'Nota ini sudah lunas dari metode lain — hapus baris piutangnya.', 'galat');
    $('#btnSelesaikan').disabled = true;
  }
  if (APP_STATE.metodeBayar.filter(m => m.metode === 'piutang').length > 1) {
    pesan('#pesanBayar', 'Satu nota hanya boleh punya satu baris piutang.', 'galat');
    $('#btnSelesaikan').disabled = true;
  }

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
  /* Dimatikan DAN diberi pemintal. Dimatikan saja tidak cukup: tombol padat
     berwarna yang tiba-tiba redup terbaca sebagai "tidak bisa ditekan", bukan
     "sedang dikerjakan" — dan penandanya harus sama persis dengan tombol lain,
     bukan gaya tersendiri. Penanda otomatis di pasangPenandaSibuk() tidak
     mengenai tombol ini: nomor nota dan arsip lokal ditunggu lebih dulu, jadi
     saat penanda memeriksa belum ada permintaan apa pun. */
  btn.disabled = true;
  btn.classList.add('sibuk');
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
      garansi_hari: Number($('#byrGaransi').value) || 0,
      id_otorisasi: APP_STATE.otorisasiDiskon?.id || ''
    });

    // 1) Simpan lokal  2) antre kirim  3) cetak. Kasir tidak menunggu server.
    /* `_diterima` — uang yang BENAR-BENAR diserahkan pelanggan, sebelum
       kembalian dipotong. `bayar` di atas sengaja sudah dipotong: itu angka
       PEMBUKUAN (kas bersih), dan mengubahnya akan merusak jurnal kas. Yang
       dibutuhkan STRUK justru angka sebelum potong — tanpa ini struk mencetak
       "TUNAI 5.000 / KEMBALI 15.000" untuk uang 20.000, dan pelanggan memegang
       bukti yang menyebut kembalian lebih besar daripada uang yang ia serahkan
       (nota SK01-SLW/2609/00071, dilaporkan 4 Sep 2026).

       Hanya di ARSIP LOKAL, tidak ikut `dok` ke server: pembukuan tidak boleh
       melihat angka ini sama sekali. */
    const arsip = { ...dok, status_sync: 'PENDING', _total: t,
                    _kembali: kembali,
                    _diterima: APP_STATE.metodeBayar
                      .map(m => ({ metode: m.metode, jumlah: Math.round(Number(m.jumlah) || 0) }))
                      .filter(m => m.jumlah > 0),
                    _nama_pelanggan: Keranjang.pelanggan?.nama || '' };
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

    /* SESUDAH fokus dikembalikan ke kolom cari, bukan sebelum: baris di atas
       merebut fokus, dan tombol Selesai yang kehilangan fokus berarti Enter
       tidak menutup layarnya.

       Ditampilkan SEBELUM struk dicetak: kembaliannya dibutuhkan detik ini,
       sementara pencetakan bisa makan waktu dan bisa gagal. */
    bukaLayarSukses(arsip);

    /* Urutannya penting: stok lokal dikurangi DULU, baru daftarnya digambar.
       Kalau dibalik, kartu produk masih memperlihatkan stok sebelum penjualan —
       barang terakhir tetap tertulis "stok 1" sampai ada yang memicu gambar ulang. */
    try { await kurangiStokLokal(dok); }
    catch (e) { console.warn('Stok lokal gagal dikurangi:', e.message); }
    await gambarProduk('');

    try { await Struk.cetak({ ...arsip, _offline: !API.online }); }
    catch (e) {
      // Dulu hanya console.warn: kasir mengira struk tercetak padahal tidak.
      /* Masuk ke layar sukses yang SEDANG terbuka, bukan toast: toast hilang
         sendiri dan kasir mengira struknya tercetak. */
      pesan('#skPesan', 'Nota tersimpan, tapi gagal dicetak: ' + e.message, 'galat');
      Admin.toast('Nota tersimpan, tapi gagal dicetak: ' + e.message, 'galat');
    }
  } catch (e) {
    pesan('#pesanBayar', 'Gagal: ' + e.message, 'galat');
  } finally {
    btn.disabled = false;
    btn.classList.remove('sibuk');
  }
}

/* ==================== LAYAR SUKSES SESUDAH NOTA ====================
   Sampai v1.166 modal Bayar tertutup diam-diam sesudah "Selesaikan & Cetak",
   dan angka Kembalian lenyap PERSIS saat kasir membutuhkannya untuk menyerahkan
   uang. Kasir lalu menghitung ulang di kepala, atau menunggu struk tercetak. */

/** Berapa lama layar sukses bertahan sebelum menutup diri. Keputusan pemilik. */
const SUKSES_DETIK = 30;

let _timerSukses = null;
let _uuidSukses  = '';

function hentikanTimerSukses() {
  if (_timerSukses) { clearInterval(_timerSukses); _timerSukses = null; }
}

/**
 * Tahan hasil transaksi di layar sampai kasir siap.
 *
 * Menutup sendiri sesudah SUKSES_DETIK supaya antrean tidak pernah tersandera
 * layar yang lupa ditutup, dan hitungannya ditulis di tombol Selesai supaya
 * kasir tahu sisa waktunya alih-alih menebak.
 *
 * Dipanggil SEBELUM struk dicetak, bukan sesudah: angka kembalian dibutuhkan
 * saat itu juga, sementara pencetakan bisa makan beberapa detik dan bisa gagal.
 * Kalau gagal, pesannya muncul DI DALAM layar ini — bukan sebagai toast yang
 * keburu hilang sebelum dibaca.
 */
function bukaLayarSukses(arsip) {
  _uuidSukses = arsip.uuid || '';
  const kembali  = Number(arsip._kembali || 0);
  const adaTunai = (arsip._diterima || []).some(m => m.metode === 'tunai');

  /* Layar ini tetap muncul walau kembaliannya nol. Gunanya bukan cuma angka:
     ia juga satu-satunya kepastian bahwa notanya benar-benar masuk. */
  $('#skAngka').textContent = kembali > 0 ? 'Kembali ' + rp(kembali)
                            : adaTunai    ? 'Uang pas'
                            :               'Lunas';
  $('#skNota').textContent = [arsip.no_nota || '', arsip._nama_pelanggan || 'Umum']
                             .filter(Boolean).join(' \u00b7 ');
  pesan('#skPesan', '');

  let sisa = SUKSES_DETIK;
  const btn = $('#btnSelesaiSukses');
  const tulis = () => { btn.textContent = 'Selesai (' + sisa + ')'; };
  tulis();

  hentikanTimerSukses();
  _timerSukses = setInterval(() => {
    /* Tirainya bisa tertutup lewat jalan lain — penangan Escape global menutup
       SELURUH .tirai sekaligus. Tanpa penjagaan ini timernya tetap berdetak,
       lalu merebut fokus ke kolom cari 30 detik kemudian di tengah pekerjaan
       lain. Timernya memeriksa sendiri apakah layarnya masih ada. */
    if (!$('#tiraiSukses').classList.contains('tampil')) { hentikanTimerSukses(); return; }
    sisa--;
    if (sisa <= 0) { tutupLayarSukses(); return; }
    tulis();
  }, 1000);

  $('#tiraiSukses').classList.add('tampil');
  btn.focus();
}

function tutupLayarSukses() {
  hentikanTimerSukses();
  $('#tiraiSukses').classList.remove('tampil');
  $('#inpCari').focus();
}
/** Kurangi perkiraan stok lokal agar tampilan tetap masuk akal selama offline. */
async function kurangiStokLokal(dok) {
  for (const it of dok.item) {
    const key = it.sku + '|' + (it.kode_varian || '');
    /* Baris yang belum ada DIBUAT, bukan dilewati.
       Barang yang belum pernah punya mutasi tidak punya baris stok; `if (s)`
       membuat penjualannya tidak berbekas sama sekali di perangkat, sehingga
       kartunya tetap menyebut nol padahal sudah keluar satu. Yang benar: mulai
       dari nol lalu dikurangi, persis seperti yang nanti dihitung server. */
    const s = (await DB.get('stok', key)) || { key, sku: it.sku, qty: 0 };
    s.qty -= it.qty * it.faktor;
    await DB.put('stok', s);
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

/* ==================== LAPORAN SHIFT ====================
 *
 * Diminta admin toko 29 Agu 2026. Angkanya sudah dihitung sejak dulu saat tutup
 * shift; yang tidak pernah ada adalah pintunya. Layar ini pintunya.
 */

/** Isi kolom tanggal dengan hari ini, sekali, saat layar Shift pertama dibuka. */
function siapkanRentangShift() {
  const d = $('#shiftDari'), sp = $('#shiftSampai');
  if (!d || !sp) return;
  if (!d.value) d.value = tanggalLokal();
  if (!sp.value) sp.value = tanggalLokal();
}

async function muatDaftarShift() {
  const wadah = $('#isiRiwayatShift');
  if (!wadah) return;
  siapkanRentangShift();
  wadah.innerHTML = '<p class="petunjuk">Memuat…</p>';
  try {
    const d = await API.daftarShift({ dari: $('#shiftDari').value, sampai: $('#shiftSampai').value });
    const rows = d.shift || [];
    if (!rows.length) {
      wadah.innerHTML = '<p style="color:var(--teks-redup)">Tidak ada shift pada rentang ini.</p>';
      return;
    }
    wadah.innerHTML = `<div class="gulir-x"><table>
      <tr><th>Shift</th><th>Kasir</th><th>Buka</th><th>Tutup</th>
          <th class="angka">Nota</th><th class="angka">Penjualan</th><th class="angka">Selisih kas</th><th></th></tr>
      ${rows.map(r => `<tr>
        <td>${esc(r.id_shift)}</td>
        <td>${kasirTampil(r)}</td>
        <td>${esc(waktuTampil(r.buka))}</td>
        <td>${r.tutup ? esc(waktuTampil(r.tutup)) : '<span class="lencana hijau">berjalan</span>'}</td>
        <td class="angka">${r.tutup ? r.jumlah_nota : '—'}</td>
        <td class="angka">${r.tutup ? rp(r.total_penjualan) : '—'}</td>
        <td class="angka">${r.tutup
          ? `<span class="${Math.abs(r.selisih) >= 1 ? 'bahaya' : ''}">${rp(r.selisih)}</span>` : '—'}</td>
        <td><button class="tombol" data-lapshift="${esc(r.id_shift)}"
              style="padding:6px 10px;font-size:var(--fs-13)">Laporan</button></td>
      </tr>`).join('')}</table></div>
      ${d.boleh_semua ? '' : '<p class="petunjuk">Anda hanya melihat shift Anda sendiri.</p>'}`;
  } catch (e) { wadah.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

async function bukaLaporanShift(idShift) {
  $('#lapShiftJudul').textContent = 'Laporan shift ' + idShift;
  $('#lapShiftIsi').innerHTML = '<p class="petunjuk">Memuat…</p>';
  $('#tiraiLapShift').classList.add('tampil');
  try {
    const d = await API.laporanShift({ id_shift: idShift });
    const k = d.kas, p = d.penjualan;
    const baris = (label, nilai, tebal) => `<div class="total-baris${tebal ? ' besar' : ''}">
      <span>${esc(label)}</span><span>${nilai}</span></div>`;
    /* Angka yang belum ada ditulis "—", bukan Rp 0. Nol itu angka, dan angka
       yang salah lebih buruk daripada tanda hubung: "selisih kas Rp 0" pada
       shift yang belum ditutup terbaca sebagai "sudah cocok". */
    const rpAtau = (v) => (v === null || v === undefined) ? '—' : rp(v);

    $('#lapShiftIsi').innerHTML = `
      ${d.berjalan ? '<div class="pesan info">Shift ini masih berjalan — angkanya berjalan juga, ' +
        'dan dihitung dengan rumus yang sama persis dengan saat nanti ditutup.</div>' : ''}
      <p class="petunjuk">Kasir ${kasirTampil(d.shift)} · perangkat ${esc(d.shift.id_perangkat || '—')}<br>
        Buka ${esc(waktuTampil(d.shift.buka))}${d.shift.tutup ? ' · tutup ' + esc(waktuTampil(d.shift.tutup)) : ''}</p>

      <div class="kartu" style="background:var(--bg)">
        ${baris('Kas awal laci', rp(k.awal))}
        ${baris('Penerimaan tunai', rp(k.tunai_masuk))}
        ${baris('Kas keluar (di luar penjualan)', '−' + rp(k.kas_keluar))}
        ${baris('Kas sistem', rp(k.sistem), true)}
        ${baris('Kas fisik dihitung', rpAtau(k.fisik))}
        ${baris('Selisih', rpAtau(k.selisih), true)}
      </div>

      <h4 style="margin:16px 0 6px">Per metode bayar</h4>
      ${d.per_metode.length ? `<div class="gulir-x"><table>
        <tr><th>Metode</th><th class="angka">Diterima</th><th class="angka">MDR</th><th class="angka">Netto</th></tr>
        ${d.per_metode.map(m => `<tr><td>${esc(String(m.metode).toUpperCase())}</td>
          <td class="angka">${rp(m.jumlah)}</td><td class="angka">${rp(m.mdr)}</td>
          <td class="angka">${rp(m.netto)}</td></tr>`).join('')}</table></div>`
        : '<p class="petunjuk">Belum ada pembayaran.</p>'}

      <h4 style="margin:16px 0 6px">Nota
        <span class="petunjuk" style="font-weight:400">· ${p.jumlah_nota} aktif${
          p.jumlah_void ? ', ' + p.jumlah_void + ' dibatalkan' : ''} · ${rp(p.total)}</span></h4>
      ${d.nota.length ? `<div class="gulir-x"><table>
        <tr><th>No Nota</th><th>Jam</th><th>Metode</th><th class="angka">Total</th><th>Status</th></tr>
        ${d.nota.map(n => `<tr><td>${esc(n.no_nota)}</td><td>${esc(n.jam)}</td>
          <td>${esc(n.metode)}</td><td class="angka">${rp(n.total)}</td>
          <td>${n.status === 'AKTIF' ? '<span class="lencana hijau">aktif</span>'
            : `<span class="lencana merah">batal</span> <span class="petunjuk">${esc(n.alasan_batal)}</span>`}</td>
        </tr>`).join('')}</table></div>` : '<p class="petunjuk">Belum ada nota.</p>'}

      <h4 style="margin:16px 0 6px">Poin &amp; omzet petugas</h4>
      ${d.petugas.length ? `<div class="gulir-x"><table>
        <tr><th>Petugas</th><th class="angka">Poin</th><th class="angka">Omzet</th></tr>
        ${d.petugas.map(x => `<tr><td>${esc(x.nama)}</td>
          <td class="angka">${x.poin}</td><td class="angka">${rp(x.omzet)}</td></tr>`).join('')}</table></div>`
        : '<p class="petunjuk">Belum ada klaim petugas di shift ini.</p>'}`;
  } catch (e) {
    $('#lapShiftIsi').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
  }
}

async function periksaShift() {
  try {
    const d = await API.shiftAktif();
    APP_STATE.idShift = d.aktif ? d.id_shift : null;
    await DB.kvSet('id_shift', APP_STATE.idShift);
  } catch (e) {
    APP_STATE.idShift = await DB.kvGet('id_shift', null);   // offline: pakai shift terakhir
  }
  /* Ringkasan shift yang sudah ditutup dibuang begitu ada shift AKTIF lagi.
     Kalau tidak, shift yang ditutup dari perangkat lain akan membuat layar ini
     menayangkan kembali selisih kas KEMARIN dengan judul "Shift terakhir
     ditutup" — angka yang justru dipakai saat serah terima laci. */
  if (APP_STATE.idShift) APP_STATE.hasilTutupShift = null;
  gambarKeadaanShift();
  muatDaftarShift();
}

/**
 * Gambar ulang layar Shift dari APP_STATE — TANPA bertanya ke server.
 *
 * Dipisah dari periksaShift() supaya bisa dipanggil pada saat keadaannya sudah
 * kita ketahui pasti, bukan hanya sesudah jawaban server tiba. Sebelum dipisah
 * ada jendela selebar satu permintaan penuh sesudah shift ditutup: modalnya
 * sudah tertutup, tapi layar di belakangnya masih menawarkan tombol "Tutup
 * shift" untuk shift yang barusan ditutup — dan tombol itu masih bisa dipencet.
 */
function gambarKeadaanShift() {
  const perluBuka = !APP_STATE.idShift;
  /* Lencana "Shift belum dibuka" di bilah atas DICABUT 10 Sep 2026 (pemilik):
     pagarnya sudah ada di layar bayar dan di logout, dan pergantian shift
     selalu lewat logout. Yang tersisa adalah pagar di panel keranjang — di
     ujung layar yang dibaca kasir saat pembeli sudah menyodorkan uang — dan
     kartu Shift itu sendiri. */
  $('#pesanShiftKasir')?.classList.toggle('sembunyi', !perluBuka);
  /* Tombol yang tidak relevan pada state saat ini disembunyikan, bukan cuma
     diblokir saat diklik — supaya kasir tidak perlu menebak tombol mana yang
     "beneran aktif" saat keduanya sama-sama terlihat bisa dipencet. */
  $('#grupKasAwal').classList.toggle('sembunyi', !perluBuka);
  $('#btnBukaShift').classList.toggle('sembunyi', !perluBuka);
  $('#btnTutupShift').classList.toggle('sembunyi', perluBuka);
  const h = APP_STATE.hasilTutupShift;
  $('#infoShift').innerHTML = (APP_STATE.idShift
    ? `<span class="lencana hijau">Aktif</span> <code>${esc(APP_STATE.idShift)}</code>`
    : '<span class="lencana kuning">Belum dibuka</span>')
    /* Ringkasan shift yang baru ditutup bertahan di layar sampai shift berikutnya
       dibuka — ini angka yang dipakai saat serah terima laci, dan ia tidak boleh
       hilang hanya karena notifikasinya sudah lewat. */
    + (!APP_STATE.idShift && h ? `
      <div class="pesan ${Math.abs(h.selisih) < 1 ? 'sukses' : 'galat'}" style="margin-top:12px">
        <strong>Shift terakhir ditutup</strong><br>
        Kas sistem ${rp(h.kas_sistem)} · fisik ${rp(h.kas_fisik)}<br>
        <strong>Selisih ${rp(h.selisih)}</strong><br>
        ${h.jumlah_nota} nota · omzet ${rp(h.total_penjualan)}
      </div>` : '');
}

/* ==================== Kas masuk / keluar ====================
 *
 * Uang laci yang bergerak DI LUAR penjualan: bayar ongkos kirim, beli galon,
 * setor ke bank. `apiSimpanKas` sudah ada di server sejak lama tapi tidak punya
 * satu pun pemanggil — jadi selama ini `kas_sistem` di tutup shift hanya
 * menghitung kas awal + penjualan tunai. Setiap pengeluaran nyata muncul sebagai
 * "selisih kas", lalu dibukukan otomatis jadi Beban/Pendapatan Lain-lain yang
 * tidak pernah terjadi. Layar ini yang menutup lubang itu.
 *
 * TIDAK lewat outbox — sama seperti buka/tutup shift, dan atas alasan yang sama:
 * catatan kas ikut memposting jurnal, dan jurnal tidak boleh disusun dari
 * keadaan perangkat yang belum tentu benar. Kalau internet mati, kasir mencatat
 * di kertas dan memasukkannya begitu tersambung — masih di shift yang sama.
 */

/** Akun mana yang masuk akal jadi lawan kas. Kas & bank dikeluarkan: itu SISI kasnya. */
const _AKUN_KAS_SENDIRI = ['1-1100', '1-1200', '1-1210'];

async function muatKas() {
  const adaShift = !!APP_STATE.idShift;
  $('#infoKasShift').innerHTML = adaShift
    ? `Dicatat ke shift <code>${esc(APP_STATE.idShift)}</code>.`
    : '<span class="lencana kuning">Shift belum dibuka</span> — buka shift dulu di menu Shift. ' +
      'Kas tanpa shift tidak akan ikut terhitung saat tutup laci.';
  $('#btnSimpanKas').disabled = !adaShift;

  /* Daftar akun diambil dari COA yang SUDAH tersinkron ke perangkat, bukan
     daftar mati di kode: begitu pemilik menambah akun beban baru, akun itu
     langsung muncul di sini — dan daftarnya tetap ada saat internet mati.

     NAMA KOLOMNYA `kode`/`nama`/`transaksi`, BUKAN nama kolom sheet-nya.
     `apiTarikMaster` (05_Master.gs) memetakan ulang baris COA sebelum
     mengirimnya: kode_akun→kode, saldo_normal→normal, boleh_transaksi→transaksi.
     Salah nama kolom di sini tidak melempar galat apa pun — JavaScript cuma
     memberi `undefined`, dan dropdown-nya terisi baris kosong yang tampak
     seperti daftar sungguhan sampai ada yang mencoba memilihnya.

     Saringannya memakai `transaksi` (boleh_transaksi), BUKAN daftar tipe akun.
     Tipe adalah tebakan yang harus diperbarui tiap kali COA berubah; `transaksi`
     adalah pernyataan COA itu sendiri tentang akun mana yang boleh menerima
     jurnal. Tanpa itu, akun induk seperti "1-0000 ASET" ikut bisa dipilih dan
     jurnal menempel di akun ringkasan. */
  const coa = await DB.kvGet('coa', []);
  const pilihan = (coa || [])
    .filter(c => c.transaksi === true || String(c.transaksi) === 'true')
    .filter(c => _AKUN_KAS_SENDIRI.indexOf(String(c.kode)) === -1)
    .map(c => `<option value="${esc(c.kode)}">${esc(c.kode)} — ${esc(c.nama)}</option>`);
  $('#kasAkun').innerHTML = pilihan.length
    ? pilihan.join('')
    : '<option value="">(daftar akun belum tersinkron — tarik master dulu)</option>';

  await gambarDaftarKas();
}

async function gambarDaftarKas() {
  if (!APP_STATE.idShift) {
    $('#ringkasKas').textContent = '';
    $('#daftarKas').innerHTML = '<p class="petunjuk">Belum ada shift aktif.</p>';
    return;
  }
  try {
    const d = await API.daftarKas({ cabang: APP_STATE.cabang, id_shift: APP_STATE.idShift });
    $('#ringkasKas').innerHTML =
      `Masuk ${rp(d.masuk)} · Keluar ${rp(d.keluar)} · <strong>Bersih ${rp(d.bersih)}</strong>`;
    $('#daftarKas').innerHTML = d.kas.length
      ? '<div class="gulir-x"><table><thead><tr><th>Jam</th><th>Jenis</th><th>Akun</th>' +
        '<th class="angka">Jumlah</th><th>Keterangan</th></tr></thead><tbody>' +
        d.kas.map(k => `<tr>
          <td>${esc(k.waktu)}</td>
          <td><span class="lencana ${k.tipe === 'KELUAR' ? 'merah' : 'hijau'}">${esc(k.tipe)}</span></td>
          <td>${esc(k.nama_akun)}</td>
          <td class="angka">${rp(k.jumlah)}</td>
          <td>${esc(k.keterangan)}</td></tr>`).join('') +
        '</tbody></table></div>'
      : '<p class="petunjuk">Belum ada catatan kas di shift ini.</p>';
  } catch (e) {
    // Offline bukan kegagalan yang perlu diteriakkan — form-nya tetap bisa dipakai
    // begitu tersambung, dan daftar ini cuma cermin.
    $('#ringkasKas').textContent = '';
    $('#daftarKas').innerHTML = `<p class="petunjuk">Daftar tidak bisa dimuat: ${esc(e.message)}</p>`;
  }
}

/**
 * uuid catatan kas yang sedang diketik — satu per CATATAN, bukan per klik.
 *
 * Dilepas hanya sesudah servernya benar-benar menjawab berhasil. Sampai saat
 * itu, menekan Simpan berkali-kali adalah tindakan yang aman: kiriman kedua
 * membawa uuid yang sama dan dikenali server sebagai duplikat.
 */
let _uuidKas = null;
function uuidKas() {
  if (!_uuidKas) {
    _uuidKas = 'KAS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }
  return _uuidKas;
}

async function simpanKasBaru() {
  if (!APP_STATE.idShift) return Admin.toast('Buka shift dulu sebelum mencatat kas.', 'galat');
  const akun = $('#kasAkun').value;
  const jumlah = angkaDari($('#kasJumlah').value);
  const ket = $('#kasKeterangan').value.trim();
  if (!akun) return Admin.toast('Pilih akun lawannya dulu.', 'galat');
  if (!(jumlah > 0)) return Admin.toast('Jumlah harus lebih dari nol.', 'galat');
  if (!ket) return Admin.toast('Keterangan wajib diisi — inilah satu-satunya penjelasan uang yang keluar.', 'galat');

  const b = $('#btnSimpanKas');
  b.classList.add('sibuk');
  b.disabled = true;
  try {
    await API.simpanKas({
      cabang: APP_STATE.cabang,
      /* uuid bertahan sampai catatannya BERHASIL tersimpan — bukan dibuat ulang
         tiap penekanan tombol. Komentar lama di sini menjelaskan dengan benar
         kenapa uuid itu penting ("server mengenalinya sebagai duplikat"), lalu
         membuatnya di tempat yang membuat penjelasan itu tidak berlaku: setiap
         klik melahirkan uuid baru, jadi penjaga duplikat di server tidak pernah
         menyala dan pengeluaran yang sama tercatat dua kali. Audit 5 Sep 2026 —
         cacat yang sama dengan pembelian dobel. */
      uuid: uuidKas(),
      id_shift: APP_STATE.idShift,
      tipe: $('#kasTipe').value,
      kode_akun: akun,
      jumlah: jumlah,
      keterangan: ket
    });
    // Tersimpan — catatan BERIKUTNYA harus punya uuid sendiri, kalau tidak
    // server akan menjawabnya "duplikat" dan ia tidak pernah masuk.
    _uuidKas = null;
    $('#kasJumlah').value = '';
    $('#kasKeterangan').value = '';
    Admin.toast('Catatan kas tersimpan.');
    await gambarDaftarKas();
  } catch (e) {
    Admin.toast('Gagal menyimpan kas: ' + e.message, 'galat');
  } finally {
    b.classList.remove('sibuk');
    b.disabled = false;
  }
}

/**
 * Antrikan satu kejadian keluar-tanpa-tutup-shift.
 *
 * ANTREAN, bukan satu slot. Perangkat bisa offline berhari-hari, dan dua
 * kejadian sebelum sempat dilaporkan berarti yang pertama lenyap tanpa jejak —
 * padahal justru jejak itulah gunanya.
 *
 * `kunci` dibuat di sini dan ikut terkirim: kalau jawaban server hilang di
 * tengah jalan, catatannya tertahan dan dikirim lagi di login berikutnya. Tanpa
 * kunci, satu kejadian bisa tercatat dua kali di log_audit — sheet yang justru
 * tidak boleh dipalsukan.
 */
async function antrikanKeluarPaksa(extra) {
  const antre = await DB.kvGet('keluar_paksa', []);
  const daftar = Array.isArray(antre) ? antre : (antre && antre.id_shift ? [antre] : []);
  daftar.push(Object.assign({
    kunci: 'KP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    id_shift: APP_STATE.idShift,
    /* APP_STATE.user, BUKAN APP_STATE.sesi — yang kedua tidak pernah ada, jadi
       pelakunya selalu tercatat kosong dan kolom id_user audit terisi oleh orang
       yang login BERIKUTNYA. Catatannya justru menuduh orang lain. */
    /* `id_user`, bukan `id`. Yang dikirim server saat login bernama `id_user`;
       `APP_STATE.user.id` tidak pernah ada, jadi pelakunya tercatat kosong —
       persis kegagalan yang komentar di atas ini klaim sudah diperbaiki. */
    id_user: APP_STATE.user?.id_user || '',
    cabang: APP_STATE.cabang || '',
    waktu: new Date().toISOString()
  }, extra || {}));
  await DB.kvSet('keluar_paksa', daftar.slice(-20));
}

/**
 * Laporkan keluar-paksa yang tertunda, lalu hapus yang berhasil.
 *
 * Dipanggil setelah login BERHASIL — kesempatan pertama perangkat ini punya sesi
 * yang sah lagi. Kegagalan diabaikan dengan sengaja: yang gagal tetap mengantre
 * untuk login berikutnya, dan yang jelas tidak boleh terjadi adalah kasir gagal
 * masuk gara-gara laporan ini.
 */
async function laporkanKeluarPaksa() {
  const antre = await DB.kvGet('keluar_paksa', []);
  const daftar = Array.isArray(antre) ? antre : (antre && antre.id_shift ? [antre] : []);
  if (!daftar.length) return;
  const sisa = [];
  for (const c of daftar) {
    if (!c || !c.id_shift) continue;
    try { await API.catatKeluarPaksa(c); }
    catch (e) { sisa.push(c); console.warn('Laporan keluar paksa ditunda:', e.message); }
  }
  await DB.kvSet('keluar_paksa', sisa);
}

/* ==================== LAPORAN ====================
 *
 * Dilengkapi v1.49 atas laporan pemilik: "menu Laporan kurang informatif,
 * sedikit sekali yang disajikan". Sebagiannya memang begitu — tapi `per_kasir`
 * dan `per_hari` sudah dikirim server sejak lama dan dibuang tanpa pernah
 * digambar. Menghitung sesuatu lalu membuangnya adalah biaya yang dibayar
 * setiap kali layar dibuka, tanpa satu pun manfaat.
 *
 * Perannya sengaja DIBEDAKAN dari Dashboard: Dashboard menjawab "bagaimana
 * keadaannya sekarang", Laporan menjawab "apa saja yang terjadi di rentang
 * tanggal ini" — rinci, bisa diurut, bisa diekspor dan dicetak. Kalau keduanya
 * menampilkan hal yang sama, yang bertambah cuma tempat untuk salah baca.
 */

/** Isi kolom tanggal dari tombol rentang cepat. */
/* ==================== LAYAR LAPORAN: PERIODE ====================
 *
 * Dirombak 10 Sep 2026 atas permintaan pemilik: "tools bar diperingkas,
 * opsi hari ini dan lain-lain dibuat dropdown, tombol Tampilkan dievaluasi".
 *
 * Hasil evaluasinya: tombol Tampilkan DIHAPUS. Ia ada karena dulu orang harus
 * mengisi dua tanggal lalu menekan sesuatu; dengan dropdown periode, memilih
 * "Bulan lalu" sudah menyebut rentangnya lengkap, dan menuntut satu tekanan
 * lagi hanya menambah langkah tanpa menambah informasi. Dashboard sudah
 * memakai pola yang sama sejak lama. Tanggal kustom pun memuat sendiri begitu
 * keduanya terisi dan urutannya masuk akal.
 */

/**
 * Rentang tanggal untuk satu pilihan dropdown periode; null untuk 'kustom'
 * (tanggalnya diketik, bukan dihitung). `kini` hanya untuk uji.
 */
function rentangPeriodeLaporan(jenis, kini) {
  if (jenis === 'kustom') return null;
  const hariIni = kini ? new Date(kini) : new Date();
  const f = (d) => tanggalLokal(d);
  const mundur = (n) => { const d = new Date(hariIni); d.setDate(d.getDate() - n); return d; };
  let dari = hariIni, sampai = hariIni;
  if (jenis === 'kemarin')          { dari = sampai = mundur(1); }
  else if (jenis === '7')           { dari = mundur(6); }
  else if (jenis === '30')          { dari = mundur(29); }
  else if (jenis === 'bulan')       { dari = new Date(hariIni.getFullYear(), hariIni.getMonth(), 1); }
  else if (jenis === 'bulan_lalu')  {
    dari = new Date(hariIni.getFullYear(), hariIni.getMonth() - 1, 1);
    sampai = new Date(hariIni.getFullYear(), hariIni.getMonth(), 0);   // hari 0 = akhir bulan lalu
  }
  return { dari: f(dari), sampai: f(sampai) };
}

/**
 * Terapkan pilihan periode: isi kedua tanggal (atau buka kolom kustom), lalu
 * muat. Satu-satunya jalan masuk dari dropdown maupun dari pembukaan layar.
 */
function terapkanPeriodeLaporan(jenis) {
  const sel = $('#lapPeriode');
  if (sel && sel.value !== jenis) sel.value = jenis;
  const r = rentangPeriodeLaporan(jenis);
  const kustom = $('#lapKustom');
  if (kustom) kustom.hidden = !!r;
  if (r) {
    $('#lapDari').value = r.dari;
    $('#lapSampai').value = r.sampai;
  }
  return tampilkanLaporan();
}

/** Lencana selisih terhadap periode pembanding. Aturannya sama dengan dashboard. */
function selisihLaporan(kini, lalu) {
  const a = Number(kini) || 0, b = Number(lalu) || 0;
  if (b === 0) return a > 0 ? '<span class="delta baru">baru</span>' : '';
  const persen = (a - b) / Math.abs(b) * 100;
  if (Math.abs(persen) < 0.5) return '<span class="delta datar">tetap</span>';
  const naik = persen > 0;
  return `<span class="delta ${naik ? 'naik' : 'turun'}">${naik ? '▲' : '▼'} ${
    Math.abs(persen).toFixed(Math.abs(persen) >= 10 ? 0 : 1)}%</span>`;
}

/* ==================== LAYAR LAPORAN, BERTAB ====================
 *
 * Diminta pemilik 2 Sep 2026: riwayat transaksi lengkap, per shift, per
 * petugas, dan rincian void — "cari solusi supaya tidak berat, misal dengan
 * tab ketika masuk ke tab baru proses menampilan data".
 *
 * Itulah aturannya di sini: SATU tab, SATU panggilan, dan hanya saat tabnya
 * benar-benar dibuka. Menarik kelimanya sekaligus berarti orang yang cuma ingin
 * melihat omzet hari ini ikut menunggu empat ratus baris riwayat dibaca dari
 * sheet terbesar di sistem.
 *
 * Yang sudah ditarik DISIMPAN selama rentangnya tidak berubah: bolak-balik
 * antar tab tidak boleh menembak server lagi. Mengganti rentang membuang
 * semuanya — data satu rentang yang dipakai untuk rentang lain adalah angka
 * yang terlihat masuk akal dan sepenuhnya keliru.
 *
 * Cetak (v1.156) adalah pengecualian yang disengaja: ia menarik tab yang belum
 * pernah dibuka, karena dokumen A4-nya memuat kelima bagian.
 */
const LAP = { dari: '', sampai: '', cabang: '*', tab: 'ringkas', data: {} };

/* Satu tab, satu cara menariknya.
 *
 * `cabang` dititipkan lewat `par`, bukan dipatok di sini. Sampai v1.129.0 tab
 * Shift memaksa `cabang: '*'`, dan itu memang benar SELAMA belum ada
 * penyaringnya — tanpa itu `apiDaftarShift` hanya menjawab cabang sesi, tidak
 * seperti keempat tab lain yang menggabungkan semuanya. Sekarang nilainya
 * datang dari satu tempat untuk kelima tab; memaksanya di sini akan membuat
 * satu tab mengabaikan penyaring yang keempat tab lain patuhi. */
const LAP_TARIK = {
  ringkas: (par) => API.laporanPenjualan(par),
  nota:    (par) => API.laporanNota({ ...par, status: 'AKTIF' }),
  shift:   (par) => API.daftarShift({ ...par }),
  petugas: (par) => API.laporanPoin({ ...par }),
  void:    (par) => API.laporanNota({ ...par, status: 'DIBATALKAN' })
};

/* Urutan dan judul bagian — dipakai tab di layar DAN dokumen cetak. */
const LAP_BAGIAN = [
  { id: 'ringkas', judul: 'Ringkasan' },
  { id: 'nota',    judul: 'Riwayat transaksi' },
  { id: 'shift',   judul: 'Per shift' },
  { id: 'petugas', judul: 'Per petugas' },
  { id: 'void',    judul: 'Void' }
];

/**
 * Penyaring cabang layar Laporan.
 *
 * Diminta pemilik 7 Sep 2026. Sebelum ini akun berbendera `akses_lintas_cabang`
 * SELALU melihat gabungan seluruh cabang, tanpa cara menyempitkannya — padahal
 * servernya sudah menerima `p.cabang` sejak lama di kelima endpointnya, dan
 * memeriksa haknya sendiri lewat `wajibCabang()`.
 *
 * Tidak ada data baru yang ditulis ke Sheets, dan tidak ada endpoint baru.
 * Menyempitkan ke satu cabang justru membuat servernya memutari SATU cabang,
 * bukan tiga — jadi laporannya lebih cepat, bukan lebih lambat.
 *
 * Tersembunyi untuk yang cuma berhak atas satu cabang, dengan aturan yang sama
 * persis seperti pemilih cabang aktif di puncak layar: dropdown berisi satu
 * pilihan bukan pilihan, ia hiasan yang mengundang klik tanpa hasil.
 */
function pasangPilihCabangLaporan() {
  const el = $('#lapCabang'), grup = $('#grupLapCabang');
  if (!el || !grup) return;
  /* `daftarCabangSemua` datang dari store lokal `cabang_list`, dan store itu
     bisa saja belum pernah terisi — perangkat baru yang login sekali lalu
     kehilangan jaringan. Jatuh kembali ke daftar dari jawaban login, yang
     selalu ada. Tanpa penjagaan ini penyaringnya menghilang diam-diam persis
     pada perangkat yang paling jarang dipakai, dan tidak ada yang tahu kenapa. */
  const sumber = (APP_STATE.daftarCabangSemua && APP_STATE.daftarCabangSemua.length)
    ? APP_STATE.daftarCabangSemua : (APP_STATE.daftarCabang || []);
  const daftar = sumber.slice().sort(urutNama);
  if (!APP_STATE.flag.akses_lintas_cabang || daftar.length < 2) return;   // tetap tersembunyi

  el.innerHTML = '<option value="*">Semua cabang</option>' +
    daftar.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  grup.classList.remove('sembunyi');

  /* Digambar ulang SEKETIKA. Layar ini menyimpan hasil tiap tab selama
     rentangnya sama; mengganti cabang tanpa membuang simpanan itu membuat
     angka cabang lama tetap terpampang di bawah nama cabang yang baru — angka
     yang terlihat masuk akal dan sepenuhnya keliru. `tampilkanLaporan()`
     membuang seluruh simpanan itu. */
  el.addEventListener('change', () => {
    if (!LAP.dari || !LAP.sampai) { LAP.cabang = el.value; return; }
    tampilkanLaporan();
  });
}

/** Teks cabang yang sedang dilaporkan, untuk kop dokumen. */
function labelCabangLaporan() {
  if (LAP.cabang && LAP.cabang !== '*') return LAP.cabang;
  return APP_STATE.flag.akses_lintas_cabang ? 'Semua cabang' : (APP_STATE.cabang || '—');
}

function gambarPetunjukLaporan(teks) {
  $('#hasilLaporan').innerHTML = `<div class="kartu"><p class="petunjuk">${esc(teks)}</p></div>`;
}

/**
 * Tombol Ekspor di bar alat ikut rentang yang sedang tampil. Digambar ulang
 * tiap kali rentangnya berganti — parameternya dibekukan ke dalam atribut
 * tombol, jadi tombol lama akan mengunduh rentang lama.
 */
function gambarEksporLaporan() {
  const w = $('#lapEkspor');
  if (!w) return;
  /* Menu "⋮", bukan tombol — v1.178, sama dengan enam layar back office lain.
     `Admin.tombolEkspor` masih hidup untuk kartu unduh Keuangan, dan sengaja. */
  w.innerHTML = (LAP.dari && LAP.sampai)
    ? Admin.menuEkspor('penjualan', { dari: LAP.dari, sampai: LAP.sampai }) : '';
}

/**
 * Muat ulang seluruh laporan dari kedua kolom tanggal. Tidak ada tombol yang
 * memanggilnya lagi — pemicunya dropdown periode, kolom tanggal kustom, dan
 * penyaring cabang. Tanggal yang belum lengkap atau terbalik tidak menembak
 * server; petunjuknya ditulis di tempat hasilnya.
 */
async function tampilkanLaporan() {
  const dari = $('#lapDari').value, sampai = $('#lapSampai').value;
  if (!dari || !sampai) return gambarPetunjukLaporan('Isi kedua tanggal untuk menampilkan laporan.');
  if (dari > sampai) return gambarPetunjukLaporan('Tanggal "dari" melewati tanggal "sampai" — periksa kembali.');
  LAP.dari = dari;
  LAP.sampai = sampai;
  /* Jatuh ke '*' bila penyaringnya tersembunyi. Aman untuk semua peran:
     server menerjemahkan '*' menjadi "seluruh cabang aktif" HANYA bagi yang
     berbendera lintas cabang, dan menjadi cabang sesi bagi yang tidak. */
  LAP.cabang = $('#lapCabang')?.value || '*';
  LAP.data = {};                 // rentang atau cabang baru: seluruh tab basi
  gambarEksporLaporan();
  return gambarTabLaporan(LAP.tab);
}

/** Rangka pemuatan: bentuknya kartu angka + tabel, sama seperti isi tab. */
const rangkaLaporan = () => `
  <div class="petak petak-4" aria-busy="true" aria-label="Memuat laporan">
    ${Array.from({ length: 4 }, () => `<div class="kartu statistik">
      <div class="label"><span class="rangka" style="width:70px"></span></div>
      <div class="nilai"><span class="rangka tinggi" style="width:110px"></span></div>
      <div class="mini-ekor"><span class="rangka" style="width:48px"></span></div></div>`).join('')}
  </div>
  <div class="kartu" aria-busy="true">
    <span class="rangka" style="width:120px"></span>
    ${Array.from({ length: 8 }, (_, i) =>
      `<div class="rangka-baris"><span class="rangka" style="width:${['92%', '78%', '86%', '70%'][i % 4]}"></span></div>`).join('')}
  </div>`;

/** Tarik data satu tab bila belum ada di simpanan; simpanannya per rentang. */
async function tarikTabLaporan(tab) {
  if (!LAP.data[tab]) {
    LAP.data[tab] = await LAP_TARIK[tab]({ dari: LAP.dari, sampai: LAP.sampai, cabang: LAP.cabang });
  }
  return LAP.data[tab];
}

async function gambarTabLaporan(tab) {
  if (!LAP_TARIK[tab]) return;
  LAP.tab = tab;
  $$('#tabLaporan button').forEach(b => b.classList.toggle('aktif', b.dataset.tabLap === tab));
  const w = $('#hasilLaporan');
  if (!LAP.dari || !LAP.sampai) return gambarPetunjukLaporan('Pilih periode di atas untuk menampilkan laporan.');
  if (!LAP.data[tab]) {
    w.innerHTML = rangkaLaporan();
    /* Balapan tab: yang tiba belakangan untuk tab yang sudah ditinggalkan
       tidak boleh menimpa tab yang sedang dibuka. */
    const tiket = { tab, dari: LAP.dari, sampai: LAP.sampai, cabang: LAP.cabang };
    try {
      await tarikTabLaporan(tab);
    } catch (e) {
      if (tiketLaporanBasi(tiket)) return;
      w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
      return;
    }
    if (tiketLaporanBasi(tiket)) return;
  }
  const gambar = { ringkas: gambarLapRingkas, nota: gambarLapNota, shift: gambarLapShift,
                   petugas: gambarLapPetugas, void: gambarLapVoid }[tab];
  gambar(w, LAP.data[tab]);
}

const tiketLaporanBasi = (t) =>
  t.tab !== LAP.tab || t.dari !== LAP.dari || t.sampai !== LAP.sampai || t.cabang !== LAP.cabang;

/* Kotak dan tabel dipakai kelima tab — satu bentuk, bukan lima yang mirip. */
const lapKotak = (label, nilai, ekor) => `<div class="kartu statistik">
  <div class="label">${esc(label)}</div><div class="nilai">${nilai}</div>
  <div class="mini-ekor" title="${esc(String(ekor || '').replace(/<[^>]*>/g, ''))}">${ekor || ''}</div></div>`;

/**
 * Satu kartu tabel laporan. Kolomnya `{ judul, angka?, render(baris) }` —
 * bentuk yang SAMA dipakai `tabelCetakLaporan`, jadi tabel di layar dan di
 * kertas tidak pernah punya dua daftar kolom yang harus dijaga sepakat.
 */
const lapTabel = (judul, kolom, baris, kosong) => `<div class="kartu" data-bagian="${esc(judul)}">
  <h3>${esc(judul)}</h3>
  ${baris.length ? `<div class="gulir-x"><table>
    <thead><tr>${kolom.map(k => `<th class="${k.angka ? 'angka' : ''}">${esc(k.judul)}</th>`).join('')}</tr></thead>
    <tbody>${baris.map(b => `<tr>${kolom.map(k =>
      `<td class="${k.angka ? 'angka' : ''}" data-l="${esc(k.judul)}">${k.render(b)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>` : `<p class="petunjuk">${esc(kosong)}</p>`}</div>`;

/* ---------- Definisi kolom: SATU tempat untuk layar dan cetak ---------- */

const KOLOM_LAP = {
  perHari: () => [
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Nota', angka: true, render: x => x.nota },
    { judul: 'Omzet', angka: true, render: x => rp(x.total) }
  ],
  perKasir: () => [
    { judul: 'Kasir', render: x => kasirTampil(x) },
    { judul: 'Nota', angka: true, render: x => x.nota },
    { judul: 'Omzet', angka: true, render: x => rp(x.total) }
  ],
  perMetode: () => [
    { judul: 'Metode', render: x => esc(String(x.metode).toUpperCase()) },
    { judul: 'Jumlah', angka: true, render: x => rp(x.jumlah) },
    { judul: 'Biaya MDR', angka: true, render: x => rp(x.mdr) },
    { judul: 'Netto', angka: true, render: x => rp(x.jumlah - x.mdr) }
  ],
  perCabang: (d) => [
    { judul: 'Cabang', render: x => esc(x.cabang) },
    { judul: 'Nota', angka: true, render: x => x.nota },
    { judul: 'Omzet', angka: true, render: x => rp(x.total) },
    { judul: 'Retur', angka: true, render: x => rp(x.retur) },
    ...((d.per_cabang || [])[0]?.laba_kotor !== undefined
      ? [{ judul: 'Laba kotor', angka: true, render: x => rp(x.laba_kotor) }] : [])
  ],
  produk: (d) => [
    { judul: 'SKU', render: x => esc(x.sku) },
    { judul: 'Nama', render: x => esc(x.nama) },
    { judul: 'Qty', angka: true, render: x => x.qty },
    { judul: 'Omzet', angka: true, render: x => rp(x.omzet) },
    ...((d.produk_teratas || [])[0]?.margin_persen !== undefined
      ? [{ judul: 'Margin', angka: true, render: x => x.margin_persen + '%' }] : [])
  ],
  retur: () => [
    { judul: 'Dokumen', render: x => esc(x.no_dokumen) },
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Nota asal', render: x => esc(x.no_nota_asal) },
    { judul: 'Jenis', render: x => esc(x.jenis) },
    { judul: 'Nilai', angka: true, render: x => rp(x.nilai_retur) },
    { judul: 'Alasan', render: x => esc(x.alasan) }
  ],
  batal: () => [
    { judul: 'No Nota', render: x => esc(x.no_nota) },
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Jam', render: x => esc(x.jam) },
    { judul: 'Kasir', render: x => kasirTampil(x) },
    { judul: 'Nilai', angka: true, render: x => rp(x.total) },
    { judul: 'Alasan', render: x => esc(x.alasan_batal) }
  ],
  piutang: () => [
    { judul: 'Pelanggan', render: x => esc(x.kode_pelanggan) },
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Jatuh tempo', render: x => esc(x.jatuh_tempo ? tglTampil(x.jatuh_tempo) : '—') },
    { judul: 'Jumlah', angka: true, render: x => rp(x.jumlah) },
    { judul: 'Sisa', angka: true, render: x => rp(x.sisa) },
    { judul: 'Status', render: x => esc(x.status) }
  ],
  nota: (d) => [
    { judul: 'No nota', render: x => esc(x.no_nota) },
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Jam', render: x => esc(x.jam) },
    { judul: 'Cabang', render: x => esc(x.cabang) },
    { judul: 'Kasir', render: x => esc(x.nama_kasir) },
    { judul: 'Shift', render: x => esc(x.id_shift || '—') },
    { judul: 'Pelanggan', render: x => esc(x.kode_pelanggan || 'umum') },
    { judul: 'Item', angka: true, render: x => x.baris_item + ' / ' + x.qty_item },
    { judul: 'Diskon', angka: true, render: x => rp(x.diskon) },
    { judul: 'Total', angka: true, render: x => rp(x.total) },
    ...((d.nota || []).some(n => n.laba_kotor !== undefined)
      ? [{ judul: 'Laba kotor', angka: true, render: x => rp(x.laba_kotor || 0) }] : []),
    { judul: 'Bayar', render: x => esc((x.metode || x.tipe_bayar || '—').toUpperCase()) }
  ],
  shift: () => [
    { judul: 'Shift', render: x => esc(x.id_shift) },
    { judul: 'Cabang', render: x => esc(x.cabang || '—') },
    { judul: 'Petugas', render: x => esc(x.nama) },
    /* Lewat `waktuTampil`, bukan dipotong sendiri: `substring(0,16)` di sini
       menampilkan `2026-08-24 20:10` — ISO mentah, satu-satunya bentuk
       tanggal yang berbeda dari seluruh aplikasi. */
    { judul: 'Buka', render: x => esc(waktuTampil(x.buka)) },
    { judul: 'Tutup', render: x => esc(x.tutup ? waktuTampil(x.tutup) : '—') },
    { judul: 'Nota', angka: true, render: x => x.jumlah_nota },
    { judul: 'Penjualan', angka: true, render: x => rp(x.total_penjualan) },
    { judul: 'Kas awal', angka: true, render: x => rp(x.kas_awal) },
    { judul: 'Kas sistem', angka: true, render: x => rp(x.kas_sistem) },
    { judul: 'Kas fisik', angka: true, render: x => rp(x.kas_fisik) },
    /* Selisih diberi warna karena inilah satu-satunya kolom yang dicari orang
       saat membuka tabel ini. Nol tidak diwarnai — warna yang selalu menyala
       berhenti berarti apa-apa. */
    { judul: 'Selisih', angka: true, render: x => {
        const v = Number(x.selisih) || 0;
        if (Math.abs(v) < 0.5) return rp(0);
        return `<span class="${v < 0 ? 'bahaya' : 'peringatan'}">${rp(v)}</span>`;
      } },
    { judul: 'Status', render: x => x.status === 'BUKA'
        ? '<span class="lencana kuning">BUKA</span>' : esc(x.status) }
  ],
  petugas: (d) => [
    { judul: 'Kode', render: x => esc(x.kode) },
    { judul: 'Nama', render: x => esc(x.nama) },
    { judul: 'Peran', render: x => esc((x.per_peran || [])
        .map(p => p.peran + ' ' + p.poin).join(' · ') || '—') },
    { judul: 'Klaim', angka: true, render: x => x.klaim },
    { judul: 'Nota', angka: true, render: x => x.nota },
    { judul: 'Poin', angka: true, render: x => x.poin },
    { judul: 'Omzet', angka: true, render: x => rp(x.omzet) },
    ...((d.petugas || []).some(x => x.laba !== undefined)
      ? [{ judul: 'Laba', angka: true, render: x => rp(x.laba || 0) }] : [])
  ],
  petugasCabang: () => [
    { judul: 'Cabang', render: x => esc(x.cabang) },
    { judul: 'Nota', angka: true, render: x => x.nota },
    { judul: 'Omzet', angka: true, render: x => rp(x.omzet) },
    { judul: 'Omzet diklaim', angka: true, render: x => rp(x.omzet_klaim) },
    { judul: 'Poin', angka: true, render: x => x.poin },
    { judul: 'Petugas', angka: true, render: x => x.petugas }
  ],
  void: () => [
    { judul: 'No nota', render: x => esc(x.no_nota) },
    { judul: 'Tanggal', render: x => esc(tglTampil(x.tanggal)) },
    { judul: 'Jam', render: x => esc(x.jam) },
    { judul: 'Cabang', render: x => esc(x.cabang) },
    { judul: 'Kasir', render: x => esc(x.nama_kasir) },
    { judul: 'Shift', render: x => esc(x.id_shift || '—') },
    { judul: 'Nilai', angka: true, render: x => rp(x.total) },
    { judul: 'Dibatalkan oleh', render: x => esc(x.dibatalkan_oleh || '—') },
    /* Server mengirim `yyyy-MM-dd HH:mm:ss`; yang tampil harus DD/MM/YYYY
       seperti seluruh aplikasi. */
    { judul: 'Waktu batal', render: x => esc(x.dibatalkan_pada ? waktuTampil(x.dibatalkan_pada) : '—') },
    { judul: 'Alasan', render: x => esc(x.alasan_batal || '—') }
  ],
  voidItem: () => [
    { judul: 'No nota', render: x => esc(x.no_nota) },
    { judul: 'SKU', render: x => esc(x.sku) },
    { judul: 'Nama', render: x => esc(x.nama) },
    { judul: 'Qty', angka: true, render: x => x.qty + ' ' + esc(x.satuan || '') },
    { judul: 'Harga', angka: true, render: x => rp(x.harga) },
    { judul: 'Subtotal', angka: true, render: x => rp(x.subtotal) }
  ]
};

/* Barang pada nota void, satu baris per item, dengan nomor notanya. */
const barisItemVoid = (rows) => rows.flatMap(n => (n.item || []).map(i => ({ ...i, no_nota: n.no_nota })));

/* ---------- Angka ringkas: satu daftar untuk kartu layar dan kotak cetak ---------- */

/** [{ label, nilai(html), ekor(html) }] untuk tab Ringkasan. */
function angkaRingkasLaporan(d) {
  const r = d.ringkas, l = d.lalu || {};
  const pi = d.piutang || { total: 0, sisa: 0, daftar: [] };
  const daftar = [
    { label: 'Jumlah nota', nilai: r.jumlah_nota, ekor: selisihLaporan(r.jumlah_nota, l.jumlah_nota) },
    { label: 'Omzet kotor', nilai: rp(r.total), ekor: selisihLaporan(r.total, l.total) },
    { label: 'Retur', nilai: '−' + rp(r.retur_nilai),
      ekor: r.jumlah_retur ? r.jumlah_retur + ' dokumen' : 'tidak ada' },
    { label: 'Penjualan bersih', nilai: rp(r.penjualan_bersih), ekor: '' }
  ];
  if (r.laba_kotor !== undefined) {
    daftar.push({ label: 'Laba kotor', nilai: rp(r.laba_kotor), ekor: selisihLaporan(r.laba_kotor, l.laba_kotor) });
  }
  daftar.push(
    { label: 'Diskon', nilai: rp(r.diskon), ekor: '' },
    { label: 'Nota batal', nilai: r.jumlah_batal, ekor: r.jumlah_batal ? rp(r.nilai_batal) : '' },
    { label: 'Piutang lahir', nilai: rp(pi.total),
      ekor: pi.sisa ? `<span class="delta turun">${rp(pi.sisa)} belum lunas</span>` : 'lunas semua' }
  );
  return daftar;
}

function angkaNotaLaporan(d) {
  const r = d.ringkas || {};
  return [
    { label: 'Nota', nilai: r.nota || 0, ekor: d.terpotong ? 'daftar dipotong' : '' },
    { label: 'Barang keluar', nilai: r.item || 0, ekor: '' },
    { label: 'Omzet', nilai: rp(r.total || 0), ekor: r.diskon ? 'diskon ' + rp(r.diskon) : '' },
    { label: 'Nota batal', nilai: r.batal || 0, ekor: r.batal ? rp(r.nilai_batal) : 'tidak ada' }
  ];
}

function angkaShiftLaporan(d) {
  const rows = d.shift || [];
  const jml = (f) => rows.reduce((a, b) => a + (Number(b[f]) || 0), 0);
  const selisihAda = rows.filter(x => Math.abs(Number(x.selisih) || 0) > 0.5);
  return [
    { label: 'Shift', nilai: rows.length, ekor: rows.filter(x => x.status === 'BUKA').length + ' masih buka' },
    { label: 'Nota', nilai: jml('jumlah_nota'), ekor: '' },
    { label: 'Penjualan', nilai: rp(jml('total_penjualan')), ekor: '' },
    { label: 'Selisih kas', nilai: rp(jml('selisih')),
      ekor: selisihAda.length ? selisihAda.length + ' shift tidak pas' : 'semua pas' }
  ];
}

function angkaPetugasLaporan(d) {
  const rk = d.ringkas || {}, petugas = d.petugas || [];
  return [
    { label: 'Petugas', nilai: rk.petugas || petugas.length, ekor: '' },
    { label: 'Klaim', nilai: rk.klaim || 0, ekor: (rk.nota || 0) + ' nota diklaim' },
    { label: 'Poin', nilai: rk.poin || 0, ekor: '' },
    { label: 'Omzet diklaim', nilai: rp(rk.omzet || 0), ekor: rk.laba !== undefined ? 'laba ' + rp(rk.laba) : '' }
  ];
}

function angkaVoidLaporan(d) {
  const rows = d.nota || [];
  const nilai = rows.reduce((a, b) => a + (Number(b.total) || 0), 0);
  const perOrang = {};
  rows.forEach(n => {
    const k = n.dibatalkan_oleh || '(tidak tercatat)';
    perOrang[k] = (perOrang[k] || 0) + 1;
  });
  return [
    { label: 'Nota dibatalkan', nilai: rows.length, ekor: '' },
    { label: 'Nilai', nilai: rp(nilai), ekor: '' },
    { label: 'Barang kembali', nilai: rows.reduce((a, b) => a + (b.item || []).length, 0), ekor: 'baris nota' },
    { label: 'Pembatal', nilai: Object.keys(perOrang).length,
      ekor: Object.keys(perOrang).slice(0, 2).map(k => esc(k) + ' ' + perOrang[k] + 'x').join(' · ') }
  ];
}

const petakAngka = (daftar, kelas) =>
  `<div class="petak ${kelas || ''}">${daftar.map(a => lapKotak(a.label, a.nilai, a.ekor)).join('')}</div>`;

function gambarLapRingkas(w, d) {
  const tabel = lapTabel;
  const pi = d.piutang || { total: 0, sisa: 0, daftar: [] };
  w.innerHTML = `
      <div class="kartu">
        <h3>${esc(tglTampil(d.dari))} – ${esc(tglTampil(d.sampai))}</h3>
        <p class="petunjuk" style="margin-top:-4px">Dibanding ${
          esc(tglTampil(d.rentang_lalu.dari))} – ${esc(tglTampil(d.rentang_lalu.sampai))}</p>
      </div>

      ${petakAngka(angkaRingkasLaporan(d))}

      <div class="kartu" data-bagian="Tren harian"><h3>Tren harian</h3><div id="wadahLapTren"></div></div>

      ${tabel('Per hari', KOLOM_LAP.perHari(), d.per_hari || [], 'Tidak ada penjualan di rentang ini.')}
      ${tabel('Per kasir', KOLOM_LAP.perKasir(), d.per_kasir || [], 'Tidak ada penjualan di rentang ini.')}
      ${tabel('Per metode bayar', KOLOM_LAP.perMetode(), d.per_metode || [], 'Belum ada pembayaran.')}
      ${tabel('Per cabang', KOLOM_LAP.perCabang(d), d.per_cabang || [], 'Tidak ada data.')}
      ${tabel('Produk terlaris', KOLOM_LAP.produk(d), (d.produk_teratas || []).slice(0, 25), 'Belum ada penjualan.')}
      ${tabel('Retur', KOLOM_LAP.retur(), d.retur || [], 'Tidak ada retur di rentang ini.')}
      ${tabel('Nota dibatalkan', KOLOM_LAP.batal(), d.batal || [], 'Tidak ada nota yang dibatalkan.')}
      ${tabel('Piutang yang lahir di periode ini', KOLOM_LAP.piutang(), pi.daftar || [], 'Tidak ada penjualan kredit di rentang ini.')}`;

  /* Grafik digambar SESUDAH innerHTML, bukan disisipkan sebagai teks: wadahnya
     baru ada setelah rangkanya terpasang. */
  const hari = d.per_hari || [];
  if (hari.length) {
    Grafik.garis($('#wadahLapTren'), {
      tanggal: hari.map(x => x.tanggal),
      seri: [{ nama: 'Omzet', data: hari.map(x => x.total) }]
    });
  } else {
    $('#wadahLapTren').innerHTML = '<p class="grafik-kosong">Belum ada penjualan pada rentang ini</p>';
  }
}

/* ---------- Tab: riwayat transaksi ---------- */

/**
 * Satu baris per nota, terbaru di atas.
 *
 * Kolom shift dan cabang ikut supaya tabel ini menjawab tiga pertanyaan yang
 * selama ini butuh tiga layar berbeda: apa yang terjual, siapa yang melayani,
 * dan di shift mana. Penyaring di atasnya bekerja DI PERANGKAT — datanya sudah
 * di tangan, dan menembak server lagi hanya untuk menyempitkan daftar yang
 * sudah ada adalah menunggu yang tidak perlu ada.
 */
function gambarLapNota(w, d) {
  w.innerHTML = `
    ${petakAngka(angkaNotaLaporan(d), 'petak-4')}
    ${d.terpotong ? `<div class="pesan peringatan">Daftarnya dipotong pada
       ${d.batas} baris dari ${d.jumlah_cocok} nota yang cocok. Persempit
       rentang tanggalnya untuk melihat sisanya.</div>` : ''}
    <div class="kartu tanpa-cetak">
      <div class="bar-alat">
        <input type="text" class="input-cari" id="lapNotaCari" placeholder="Cari no nota / kasir / pelanggan…"
               style="max-width:280px">
        <select id="lapNotaShift" style="max-width:230px"></select>
        <select id="lapNotaKasir" style="max-width:200px"></select>
        <span class="jumlah-baris" id="lapNotaHitung"></span>
      </div>
    </div>
    <div id="lapNotaTabel"></div>`;

  /* Pilihan penyaring dibangun DARI DATA yang ada, bukan dari daftar master:
     shift dan kasir yang tidak punya nota di rentang ini tidak perlu muncul,
     dan memilihnya hanya menghasilkan tabel kosong yang membingungkan. */
  const unik = (ambil, label) => {
    const peta = {};
    (d.nota || []).forEach(n => { const k = ambil(n); if (k) peta[k] = label(n); });
    return Object.keys(peta).sort().map(k => ({ id: k, label: peta[k] }));
  };
  const isi = (sel, daftar, semua) => {
    $(sel).innerHTML = `<option value="">${semua}</option>` +
      daftar.map(x => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
  };
  isi('#lapNotaShift', unik(n => n.id_shift, n => n.id_shift), 'Semua shift');
  isi('#lapNotaKasir', unik(n => n.id_user, n => n.nama_kasir), 'Semua kasir');

  gambarLapNotaTabel(d);
}

function gambarLapNotaTabel(d) {
  const q = ($('#lapNotaCari')?.value || '').toLowerCase().trim();
  const sh = $('#lapNotaShift')?.value || '';
  const ks = $('#lapNotaKasir')?.value || '';
  const baris = (d.nota || []).filter(n =>
    (!sh || n.id_shift === sh) && (!ks || n.id_user === ks) &&
    (!q || (n.no_nota + ' ' + n.nama_kasir + ' ' + n.kode_pelanggan).toLowerCase().includes(q)));

  $('#lapNotaTabel').innerHTML = lapTabel('Riwayat transaksi', KOLOM_LAP.nota(d), baris,
                                          'Tidak ada nota pada rentang ini.');

  const h = $('#lapNotaHitung');
  if (h) {
    h.textContent = baris.length === (d.nota || []).length
      ? `${baris.length} nota`
      : `${baris.length} dari ${(d.nota || []).length} nota`;
  }
}

/* ---------- Tab: per shift ---------- */

function gambarLapShift(w, d) {
  w.innerHTML = `
    ${petakAngka(angkaShiftLaporan(d), 'petak-4')}
    ${lapTabel('Per shift', KOLOM_LAP.shift(), d.shift || [], 'Tidak ada shift pada rentang ini.')}`;
}

/* ---------- Tab: per petugas ---------- */

/** Kalimat bobot peran, mis. "PENJUAL 60% · PEMASANG 40%". */
const kalimatBobot = (bobot) => Object.keys(bobot || {}).length
  ? Object.keys(bobot).map(k => esc(k) + ' ' + bobot[k] + '%').join(' · ') : 'Belum diatur.';

function gambarLapPetugas(w, d) {
  w.innerHTML = `
    ${petakAngka(angkaPetugasLaporan(d), 'petak-4')}
    <div class="kartu" data-bagian="Bobot peran">
      <h3>Bobot peran</h3>
      <p class="petunjuk">${kalimatBobot(d.bobot)}</p>
    </div>
    ${lapTabel('Per petugas', KOLOM_LAP.petugas(d), d.petugas || [], 'Belum ada klaim petugas pada rentang ini.')}
    ${lapTabel('Per cabang', KOLOM_LAP.petugasCabang(), d.per_cabang || [], 'Tidak ada data.')}`;
}

/* ---------- Tab: void ---------- */

/**
 * Nota yang dibatalkan, BESERTA barangnya.
 *
 * Yang dicari orang saat membuka daftar void bukan berapa nilainya melainkan
 * siapa yang membatalkan dan barang apa yang keluar-masuk lagi. Dua hal itu
 * yang dulu tidak ada di layar mana pun.
 */
function gambarLapVoid(w, d) {
  const rows = d.nota || [];
  w.innerHTML = `
    ${petakAngka(angkaVoidLaporan(d), 'petak-4')}
    ${lapTabel('Riwayat void', KOLOM_LAP.void(), rows, 'Tidak ada nota yang dibatalkan pada rentang ini.')}
    ${lapTabel('Barang pada nota yang dibatalkan', KOLOM_LAP.voidItem(), barisItemVoid(rows),
               'Tidak ada rincian barang.')}`;
}

/* ==================== CETAK LAPORAN: DOKUMEN A4 ====================
 *
 * Sampai v1.155 tombol Cetak memanggil pencetakan peramban atas halaman aplikasi
 * itu sendiri, dengan `@media print` yang menyembunyikan sidebar dan bar alat.
 * Pemilik melaporkannya (10 Sep 2026): "hasil cetak makin tidak jelas, tidak
 * lengkap". Sebabnya bukan satu: yang tercetak hanya tab yang sedang terbuka;
 * tabel lebar dipotong oleh wadah gulir; kartu angka mewarisi tata letak
 * layar yang tidak pernah dirancang untuk kertas; dan setiap perubahan CSS
 * layar diam-diam mengubah hasil cetaknya.
 *
 * Sekarang cetak MENYUSUN DOKUMENNYA SENDIRI — jendela A4 lewat jalur yang
 * sama dengan dokumen Transfer (`Struk.cetakDokumen`): kop usaha, periode,
 * cabang, siapa yang mencetak dan kapan, lalu kelima bagian laporan berurutan
 * dalam tabel bergaris. Tab yang belum pernah dibuka ditarik dulu, sekali,
 * lalu masuk simpanan yang sama dengan tab di layar. Kolomnya `KOLOM_LAP`,
 * satu daftar dengan yang di layar; angkanya `angka*Laporan`, juga satu.
 *
 * Bagian mana yang ikut dipilih di dialog sebelum mencetak — pengganti bar
 * centang "Yang ikut dicetak" yang dulu. Pilihannya diingat selama layar hidup.
 */
const CETAK_LAP_PILIH = new Set(LAP_BAGIAN.map(b => b.id));

/** Tabel dokumen cetak: kolom yang sama dengan `lapTabel`, gaya `table.isi`. */
function tabelCetakLaporan(judul, kolom, baris, kosong) {
  const kepala = kolom.map(k => `<th class="${k.angka ? 'n' : ''}">${esc(k.judul)}</th>`).join('');
  const badan = baris.length
    ? baris.map(b => `<tr>${kolom.map(k => `<td class="${k.angka ? 'n' : ''}">${k.render(b)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${kolom.length}" class="kosong">${esc(kosong)}</td></tr>`;
  return `<h3>${esc(judul)}</h3>
    <table class="isi ${kolom.length > 7 ? 'rapat' : ''}"><thead><tr>${kepala}</tr></thead><tbody>${badan}</tbody></table>`;
}

/** Deret kotak angka di kertas. */
const kotakCetakLaporan = (daftar) => `<div class="kpi">${daftar.map(a =>
  `<div><span class="k">${esc(a.label)}</span><b>${a.nilai}</b>${a.ekor ? `<span class="e">${a.ekor}</span>` : ''}</div>`).join('')}</div>`;

/* Penyusun tiap bagian: (data) -> html. */
const CETAK_LAP_BAGIAN = {
  ringkas: (d) => {
    const pi = d.piutang || { total: 0, sisa: 0, daftar: [] };
    return kotakCetakLaporan(angkaRingkasLaporan(d)) +
      `<p class="sub">Dibanding periode sebelumnya ${esc(tglTampil(d.rentang_lalu.dari))} – ${esc(tglTampil(d.rentang_lalu.sampai))}</p>` +
      tabelCetakLaporan('Per hari', KOLOM_LAP.perHari(), d.per_hari || [], 'Tidak ada penjualan di rentang ini.') +
      tabelCetakLaporan('Per kasir', KOLOM_LAP.perKasir(), d.per_kasir || [], 'Tidak ada penjualan di rentang ini.') +
      tabelCetakLaporan('Per metode bayar', KOLOM_LAP.perMetode(), d.per_metode || [], 'Belum ada pembayaran.') +
      tabelCetakLaporan('Per cabang', KOLOM_LAP.perCabang(d), d.per_cabang || [], 'Tidak ada data.') +
      tabelCetakLaporan('Produk terlaris', KOLOM_LAP.produk(d), (d.produk_teratas || []).slice(0, 50), 'Belum ada penjualan.') +
      tabelCetakLaporan('Retur', KOLOM_LAP.retur(), d.retur || [], 'Tidak ada retur di rentang ini.') +
      tabelCetakLaporan('Nota dibatalkan', KOLOM_LAP.batal(), d.batal || [], 'Tidak ada nota yang dibatalkan.') +
      tabelCetakLaporan('Piutang yang lahir di periode ini', KOLOM_LAP.piutang(), pi.daftar || [], 'Tidak ada penjualan kredit di rentang ini.');
  },
  nota: (d) => kotakCetakLaporan(angkaNotaLaporan(d)) +
    (d.terpotong ? `<p class="sub">Daftar dipotong pada ${d.batas} baris dari ${d.jumlah_cocok} nota yang cocok.</p>` : '') +
    tabelCetakLaporan('Riwayat transaksi', KOLOM_LAP.nota(d), d.nota || [], 'Tidak ada nota pada rentang ini.'),
  shift: (d) => kotakCetakLaporan(angkaShiftLaporan(d)) +
    tabelCetakLaporan('Per shift', KOLOM_LAP.shift(), d.shift || [], 'Tidak ada shift pada rentang ini.'),
  petugas: (d) => kotakCetakLaporan(angkaPetugasLaporan(d)) +
    `<p class="sub">Bobot peran: ${kalimatBobot(d.bobot)}</p>` +
    tabelCetakLaporan('Per petugas', KOLOM_LAP.petugas(d), d.petugas || [], 'Belum ada klaim petugas pada rentang ini.') +
    tabelCetakLaporan('Per cabang', KOLOM_LAP.petugasCabang(), d.per_cabang || [], 'Tidak ada data.'),
  void: (d) => kotakCetakLaporan(angkaVoidLaporan(d)) +
    tabelCetakLaporan('Riwayat void', KOLOM_LAP.void(), d.nota || [], 'Tidak ada nota yang dibatalkan pada rentang ini.') +
    tabelCetakLaporan('Barang pada nota yang dibatalkan', KOLOM_LAP.voidItem(), barisItemVoid(d.nota || []), 'Tidak ada rincian barang.')
};

/**
 * Dokumen lengkap. `bagian` = daftar id yang ikut, urutannya mengikuti
 * LAP_BAGIAN, bukan urutan centang. Setiap nilai sudah diloloskan `esc()` di
 * penyusun kolomnya; yang menerima (`Struk.cetakDokumen`) memasangnya apa
 * adanya.
 */
function dokumenLaporan(bagian, kini) {
  const s = APP_STATE.setting || {};
  const t = kini ? new Date(kini) : new Date();
  const info = (k, v) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`;
  const kop = `<h1>${esc(String(s.nama_usaha || 'SINDIKAT KARTU').toUpperCase())}</h1>` +
    (s.alamat_usaha ? `<p class="sub">${esc(s.alamat_usaha)}</p>` : '') +
    `<h2 class="judul-dok">Laporan Penjualan</h2>
    <table class="info">
      ${info('Periode', esc(tglTampil(LAP.dari)) + ' – ' + esc(tglTampil(LAP.sampai)))}
      ${info('Cabang', esc(labelCabangLaporan()))}
      ${info('Dicetak', esc(tglTampil(tanggalLokal(t))) + ' ' + esc(String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0')) +
              ' oleh ' + esc(APP_STATE.user?.nama || '—'))}
    </table>`;
  const isi = LAP_BAGIAN.filter(b => bagian.includes(b.id)).map(b =>
    `<section class="bagian"><h2>${esc(b.judul)}</h2>${CETAK_LAP_BAGIAN[b.id](LAP.data[b.id])}</section>`).join('');
  const kaki = `<div class="kaki">POS ${esc(String(s.nama_usaha || 'Sindikat Kartu'))} · v${esc(CONFIG.VERSI)} · ${esc(tglTampil(LAP.dari))} – ${esc(tglTampil(LAP.sampai))}</div>`;
  return kop + isi + kaki;
}

/** Dialog pilih bagian, lalu cetak. Dipanggil tombol Cetak di bar alat. */
function bukaDialogCetakLaporan() {
  if (!LAP.dari || !LAP.sampai) return Admin.toast('Pilih periode dulu sebelum mencetak.', 'galat');
  Admin.modal('Cetak laporan', `
    <p class="petunjuk">Dokumen A4 berisi bagian yang dicentang, untuk periode
      <strong>${esc(tglTampil(LAP.dari))} – ${esc(tglTampil(LAP.sampai))}</strong>
      (${esc(labelCabangLaporan())}). Bagian yang belum pernah dibuka ditarik dulu dari server.</p>
    <div class="pilih-bagian-cetak">
      ${LAP_BAGIAN.map(b => `<label class="cek"><input type="checkbox" data-cetak-bagian="${b.id}"
        ${CETAK_LAP_PILIH.has(b.id) ? 'checked' : ''}> ${esc(b.judul)}</label>`).join('')}
    </div>`,
    `<button class="tombol" data-tutup="1">Batal</button>
     <button class="tombol utama" id="btnCetakLaporanJalan">Cetak</button>`);
}

/**
 * Jalankan cetak. Jendelanya dibuka SEBELUM await pertama — izin pop-up
 * peramban terikat pada klik, dan klik itu sudah kedaluwarsa begitu kita
 * menunggu server. Isinya diisi belakangan; kalau tarikan gagal, jendelanya
 * ditutup lagi supaya tidak ada tab kosong yang tertinggal.
 */
async function jalankanCetakLaporan() {
  const pilih = $$('[data-cetak-bagian]').filter(c => c.checked).map(c => c.dataset.cetakBagian);
  if (!pilih.length) return Admin.toast('Centang minimal satu bagian.', 'galat');
  CETAK_LAP_PILIH.clear();
  pilih.forEach(id => CETAK_LAP_PILIH.add(id));
  let jendela;
  try {
    jendela = Struk.bukaJendelaDokumen('Laporan Penjualan');
  } catch (e) {
    return Admin.toast(e.message, 'galat');
  }
  Admin.tutupModal();
  try {
    await API.tugas(async () => {
      for (const id of pilih) await tarikTabLaporan(id);
    });
  } catch (e) {
    try { jendela.close(); } catch (_) { /* jendela sudah ditutup orangnya */ }
    return Admin.toast('Gagal menarik data laporan — ' + e.message, 'galat');
  }
  Struk.isiJendelaDokumen(jendela, 'Laporan Penjualan ' + LAP.dari + ' – ' + LAP.sampai, dokumenLaporan(pilih));
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
    w.innerHTML = tombolUnduh('laba_rugi', par) + `<div class="kartu"><h3>Laba Rugi — ${esc(d.periode)} · ${esc(d.cabang)}</h3><div class="gulir-x"><table>
      ${brs('Penjualan Bruto', d.penjualan_bruto)}
      ${brs('(−) Diskon Penjualan', -d.diskon_penjualan)}
      ${brs('(−) Retur Penjualan', -d.retur_penjualan)}
      ${brs('Penjualan Bersih', d.penjualan_bersih, 'tebal pisah')}
      ${brs('(−) Harga Pokok Penjualan', -d.hpp)}
      ${brs('LABA KOTOR (' + d.margin_kotor_persen + '%)', d.laba_kotor, 'tebal pisah')}
      <tr class="pisah"><td colspan="2" style="color:var(--teks-redup);font-size:var(--fs-12)">BEBAN OPERASIONAL</td></tr>
      ${d.rincian_beban.map(b => brs('  ' + b.kode + ' ' + b.nama, -b.jumlah)).join('')}
      ${brs('Total Beban Operasional', -d.beban_operasional, 'tebal')}
      ${brs('LABA USAHA', d.laba_usaha, 'tebal pisah')}
      ${brs('(+) Pendapatan Lain', d.pendapatan_lain)}
      ${brs('(−) Beban Lain', -d.beban_lain)}
      ${brs('LABA BERSIH (' + d.margin_bersih_persen + '%)', d.laba_bersih, 'tebal pisah')}
      </table></div></div>`;
  } catch (e) { w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

async function tampilkanNeraca() {
  const w = $('#hasilKeuangan');
  w.innerHTML = '<div class="kartu">Menghitung…</div>';
  try {
    const par = { periode: $('#keuPeriode').value, cabang: $('#keuCabang').value };
    const d = await API.neraca(par);
    const tabel = (judul, arr, total) => `<div class="kartu"><h3>${judul}</h3><div class="gulir-x"><table>
      ${arr.map(a => `<tr><td>${esc(a.kode)} ${esc(a.nama)}</td><td class="angka">${rp(a.jumlah)}</td></tr>`).join('')}
      <tr class="tebal pisah"><td>TOTAL</td><td class="angka">${rp(total)}</td></tr></table></div></div>`;
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
      <div class="gulir-x"><table><tr><th>Pemeriksaan</th><th>Nilai</th><th>Hasil</th></tr>
      ${d.hasil.map(h => `<tr><td>${esc(h.uji)}</td><td>${esc(h.nilai)}</td>
        <td class="${h.lulus ? 'uji-lulus' : 'uji-gagal'}">${h.lulus ? 'LULUS' : 'GAGAL'}</td></tr>`).join('')}
      </table></div></div>`;
  } catch (e) { w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
}

/**
 * Riwayat nota — HANYA shift yang sedang berjalan.
 *
 * Diminta admin toko 29 Agu 2026: kasir berikutnya tidak boleh menelusuri nota
 * kasir sebelumnya di perangkat yang sama. Sebelum ini layar ini menampilkan
 * SELURUH nota hari itu di perangkat tersebut — kasir sore membuka Riwayat dan
 * melihat, serta bisa mencetak ulang, seluruh penjualan pagi.
 *
 * Yang menyaring adalah `id_shift` pada notanya, bukan jam: shift bisa melewati
 * tengah malam, dan menyaring dengan tanggal akan memotong shift malam persis
 * di tengahnya.
 *
 * Perlu dikatakan jujur: ini MENYEMBUNYIKAN, bukan mengamankan. Notanya tetap
 * ada di IndexedDB perangkat ini dan di server, dan siapa pun yang tahu caranya
 * tetap bisa membacanya lewat konsol peramban. Yang benar-benar mengikat adalah
 * izin void dan log audit; layar ini hanya menutup jalur yang MUDAH.
 */
async function gambarRiwayat() {
  const semua = await DB.all('penjualan');
  const shift = APP_STATE.idShift;
  /* Tanpa shift aktif, tidak ada yang ditampilkan sama sekali — bukan jatuh
     kembali ke "hari ini". Jatuh ke hari ini justru mengembalikan persis
     keadaan yang sedang diperbaiki, dan tepat pada keadaan yang paling sering
     terjadi: kasir baru datang, shiftnya belum dibuka. */
  const rows = (shift ? semua.filter(n => String(n.id_shift) === String(shift)) : [])
    .sort((a, b) => b.jam.localeCompare(a.jam));
  if (!shift) {
    $('#isiRiwayat').innerHTML = '<p style="color:var(--teks-redup)">Shift belum dibuka. ' +
      'Riwayat menampilkan nota shift yang sedang berjalan.</p>';
    return;
  }
  $('#isiRiwayat').innerHTML = rows.length ? `<div class="gulir-x"><table>
    <tr><th>No Nota</th><th>Jam</th><th class="angka">Total</th><th>Sinkron</th><th></th></tr>
    ${rows.map(n => `<tr><td>${esc(n.no_nota)}</td><td>${esc(n.jam)}</td>
      <td class="angka">${rp(n.total)}</td>
      <td><span class="lencana ${n.status_sync === 'SYNCED' ? 'hijau' : 'kuning'}">${n.status_sync === 'SYNCED' ? 'terkirim' : 'menunggu'}</span></td>
      <td><button class="tombol" data-cetak="${esc(n.uuid)}" style="padding:6px 10px;font-size:var(--fs-13)">Cetak ulang</button></td>
    </tr>`).join('')}</table></div>` : '<p style="color:var(--teks-redup)">Belum ada nota di shift ini.</p>';
}

/**
 * Cari SATU nota lama menurut nomornya — pencocokan PERSIS.
 *
 * Persis, bukan "mengandung", dan itu inti kesepakatannya: pencocokan sebagian
 * mengembalikan daftar, dan daftar itulah yang sedang ditutup. Dengan pencocokan
 * persis, yang bisa menemukan nota lama hanyalah orang yang sudah memegang
 * nomornya — yaitu pelanggan yang membawa struknya.
 *
 * Dicari di perangkat ini saja (IndexedDB). Nota dari perangkat lain memang
 * tidak akan ketemu; itu batas yang jujur, dan layarnya mengatakannya.
 */
async function cariNotaLama() {
  const kueri = ($('#cariNotaRiwayat').value || '').trim().toUpperCase();
  const wadah = $('#hasilNotaLama');
  if (!kueri) { wadah.innerHTML = ''; return; }

  const semua = await DB.all('penjualan');
  const n = semua.find(x => String(x.no_nota || '').toUpperCase() === kueri);
  if (!n) {
    wadah.innerHTML = `<div class="pesan info">Tidak ada nota bernomor <strong>${esc(kueri)}</strong>
      di perangkat ini. Nomornya harus lengkap, dan notanya harus dibuat di perangkat ini.</div>`;
    return;
  }
  const lainShift = String(n.id_shift || '') !== String(APP_STATE.idShift || '');
  wadah.innerHTML = `<div class="gulir-x"><table>
    <tr><th>No Nota</th><th>Tanggal</th><th>Jam</th><th class="angka">Total</th><th></th></tr>
    <tr><td>${esc(n.no_nota)}</td><td>${esc(tglTampil(n.tanggal))}</td><td>${esc(n.jam)}</td>
      <td class="angka">${rp(n.total)}</td>
      <td><button class="tombol" data-cetak="${esc(n.uuid)}" data-luar-shift="${lainShift ? '1' : ''}"
        style="padding:6px 10px;font-size:var(--fs-13)">Cetak ulang</button></td></tr></table></div>
    ${lainShift ? '<p class="petunjuk">Nota ini dari shift lain — cetak ulangnya akan tercatat.</p>' : ''}`;
}

/**
 * Cetak ulang satu nota, dan CATAT bila notanya di luar shift berjalan.
 *
 * Jejaknya lewat outbox, bukan panggilan langsung: cetak ulang paling mungkin
 * terjadi saat kasir sedang melayani orang di depan meja, bukan saat jaringan
 * sedang bagus. Jejak yang menguap ketika internet mati bukan jejak.
 */
/**
 * Nama produk pada nota lokal disegarkan dari katalog sebelum dicetak ulang.
 *
 * Nota yang tersimpan di IndexedDB membawa nama yang berlaku saat nota dibuat.
 * Sejak v1.69 seluruh layar menampilkan nama katalog yang berlaku sekarang; tanpa
 * penyegaran di sini, satu nota yang sama tampil beda — nama baru di back office,
 * nama lama di struk cetak ulang kasir — dan yang memegang keduanya adalah orang
 * yang sedang melayani pelanggan.
 *
 * SKU yang sudah tidak ada di katalog lokal mempertahankan nama bekunya: itu
 * supaya barisnya punya nama sama sekali, bukan supaya nama lamanya terlihat.
 * Yang tersimpan di IndexedDB TIDAK diubah — hanya salinan untuk dicetak.
 */
async function segarkanNamaProduk(nota) {
  if (!nota || !Array.isArray(nota.item)) return nota;
  const item = [];
  for (const it of nota.item) {
    let nama = it.nama;
    try {
      const p = it.sku ? await DB.get('produk', it.sku) : null;
      if (p && p.nama) nama = p.nama;
    } catch (e) { /* katalog lokal belum ada: pakai nama beku */ }
    item.push({ ...it, nama });
  }
  return { ...nota, item };
}

async function cetakUlangNota(uuid, luarShift) {
  const n = await segarkanNamaProduk(await DB.get('penjualan', uuid));
  if (!n) return;
  if (luarShift) {
    try {
      await Sync.antrikanCetakUlang({
        uuid: n.uuid, no_nota: n.no_nota,
        id_shift_nota: n.id_shift || '', id_shift_aktif: APP_STATE.idShift || '',
        waktu: new Date().toISOString()
      });
    } catch (e) { console.warn('Jejak cetak ulang gagal diantrikan:', e.message); }
  }
  await Struk.cetak({ ...n, _offline: n.status_sync !== 'SYNCED' });
}

async function perbaruiInfoData() {
  const umur = await Sync.umurDataJam();
  const tertahan = await DB.outboxJumlah();
  const stokWaktu = await DB.kvGet('stok_diperbarui', null);
  $('#infoData').innerHTML =
    `Data master: ${umur === Infinity ? 'belum pernah' : umur.toFixed(1) + ' jam lalu'}<br>
     Stok: ${esc(waktuTampil(stokWaktu))}<br>
     Antrian kirim: <strong>${tertahan}</strong> dokumen`;
  $('#infoPerangkat').innerHTML =
    `Kode: <strong>${esc(APP_STATE.perangkat?.kode || '—')}</strong><br>${esc(APP_STATE.perangkat?.nama || '')}`;
  const pr = await DB.kvGet('printer_nama', null);
  $('#infoPrinter').textContent = pr ? 'Tersimpan: ' + pr : 'Belum terhubung';
  /* Setelan ekor struk dibaca lewat Struk.bacaEkor(), BUKAN dibaca ulang dari
     IndexedDB di sini. Dua pembaca dengan dua nilai bawaan berbeda berarti layar
     bisa menampilkan "berpisau" untuk printer yang sedang dicetaki tanpa potong,
     dan orang mematikan sakelar yang memang sudah mati. */
  /* Dijaga terhadap print.js versi LAMA yang masih dilayani Service Worker.
     Cache di sini cache-first dan pergantiannya butuh dua kali muat ulang, jadi
     "app.js baru bertemu print.js lama" adalah keadaan yang PASTI terjadi sekali
     di tiap perangkat setiap kali terbit. Tanpa penjagaan ini seluruh
     perbaruiInfoData() melempar, dan layar Perangkat — satu-satunya tempat
     memperbaiki printer — justru yang ikut mati. */
  const ekor = Struk.bacaEkor ? await Struk.bacaEkor() : { potong: true, umpan: 3 };
  if ($('#setPrinterPotong')) $('#setPrinterPotong').checked = ekor.potong;
  if ($('#setPrinterUmpan')) $('#setPrinterUmpan').value = ekor.umpan;
  await perbaruiInfoLabel();
  gambarPreviewStruk();
}

/**
 * Kartu "Kertas label" di layar Perangkat.
 *
 * Dijaga terhadap label.js versi LAMA yang masih dilayani Service Worker —
 * alasannya sama dengan penjagaan `Struk.bacaEkor` di atas: cache di sini
 * cache-first dan pergantiannya butuh dua kali muat ulang, jadi "app.js baru
 * bertemu label.js lama" adalah keadaan yang PASTI terjadi sekali di tiap
 * perangkat setiap kali terbit. `Label.svg` khusus diperiksa: ia baru ada sejak
 * v1.81.0, dan tanpa penjagaan itu seluruh layar Perangkat melempar pada muat
 * pertama setelah terbit.
 */
async function perbaruiInfoLabel() {
  if (typeof Label === 'undefined' || !$('#setLabelLebar')) return;
  const u = await Label.ukuran();
  $('#setLabelLebar').value = u.lebar_mm;
  if ($('#setLabelTinggi')) $('#setLabelTinggi').value = u.tinggi_mm;
  if ($('#setLabelJarak')) $('#setLabelJarak').value = u.jarak_mm;
  if ($('#setLabelKolom')) $('#setLabelKolom').value = u.kolom;
  if ($('#setLabelHurufKode')) $('#setLabelHurufKode').value = u.huruf_kode_mm;
  if ($('#setLabelHurufNama')) $('#setLabelHurufNama').value = u.huruf_nama_mm;
  if ($('#setLabelTinggiBar')) $('#setLabelTinggiBar').value = u.tinggi_bar_mm;
  /* Contoh hasil cetak digambar dari fungsi yang SAMA dengan yang mencetak.
     Pratinjau yang punya penggambar sendiri adalah pratinjau yang suatu hari
     akan berbeda dari kertasnya, dan hari itu tidak akan ada yang tahu mana
     yang benar. */
  if ($('#pratinjauLabelSetel') && typeof Label.svg === 'function') {
    try {
      /* Contohnya MEMBAWA NAMA, sejak ukuran huruf nama bisa disetel di layar
         ini juga: setelan yang akibatnya tidak kelihatan adalah setelan yang
         disetel dengan menebak. */
      $('#pratinjauLabelSetel').innerHTML =
        Label.svg({ kode: 'TG01030006', nama: 'Contoh nama produk' }, u);
    } catch (e) {
      $('#pratinjauLabelSetel').innerHTML =
        `<p style="color:var(--bahaya);font-size:var(--fs-12);margin:0">${esc(e.message)}</p>`;
    }
  }
  /* Angkanya ditulis di layar, bukan disembunyikan di kode: pemilik toko yang
     memilih format kodenya perlu tahu berapa karakter yang muat SEBELUM ia
     terlanjur menamai seratus produk. */
  if ($('#infoLabelMuat')) {
    const tersedia = u.lebar_mm - 2 * Label.BAWAAN.margin_mm;
    /* Tiga bentuk, bukan satu angka. CODE128 memuat DUA digit dalam satu simbol
       tapi hanya satu huruf — jadi "maksimal 7 karakter" benar untuk kode yang
       seluruhnya huruf dan salah jauh untuk kode seperti TG01030006 (10 karakter,
       tetap muat). Satu angka di sini akan membuat pemilik toko menamai produknya
       lebih pendek dari yang perlu, atau lebih panjang dari yang bisa dicetak. */
    const s = simbolData(tersedia);
    $('#infoLabelMuat').textContent =
      `Ruang barcode ${tersedia.toFixed(0)}mm. Muat: ${s * 2} digit bila angka semua · ` +
      `2 huruf + ${Math.max(0, (s - 3) * 2)} digit · ${s} karakter bila huruf semua.`;
  }
}

/* Berapa simbol ISI yang muat, DIHITUNG dari lebar yang tersedia — bukan angka
   hafalan yang akan meleset begitu ukuran stikernya diganti.
   CODE128 memakai `11 × simbol + 13` modul, dan dari jumlah simbol itu DUA
   dipakai simbol mulai dan simbol cek — bukan isi. Huruf memakai satu simbol per
   karakter; angka dua digit per simbol; berpindah dari huruf ke angka memakan
   satu simbol lagi. */
function simbolData(tersediaMm) {
  const modul = Math.floor(tersediaMm * Label.TITIK_PER_MM / Label.BAWAAN.sempit);
  return Math.max(0, Math.floor((modul - 13) / 11) - 2);
}

/**
 * Pratinjau BACA-SAJA kop & footer struk, dari setting global yang sama persis
 * dipakai print.js — bukan disalin ulang, supaya pratinjaunya tidak pernah
 * berbeda dari yang benar-benar tercetak.
 *
 * Tombol "Ubah di Pengaturan Sistem" hanya tampil bila peran ini memang berizin
 * membukanya; kasir biasa melihat pratinjaunya tanpa tombol yang mengarah
 * ke layar yang toh akan ditolak.
 */
function gambarPreviewStruk() {
  const el = $('#previewStruk');
  if (!el) return;
  const s = APP_STATE.setting || {};
  const baris = [(s.nama_usaha || 'SINDIKAT KARTU').toUpperCase()];
  if (s.alamat_usaha) baris.push(s.alamat_usaha);
  if (s.telepon_usaha) baris.push(s.telepon_usaha);
  baris.push('...');
  baris.push(s.footer_struk || 'Terima kasih');
  el.textContent = baris.join('\n');
  $('#btnKeSettingStruk')?.classList.toggle('sembunyi', !bolehIzin('setting', 'lihat'));
}

/* ==================== CARI DI BANTUAN ====================
 * Layar Bantuan 27 bagian. Sampai v1.152.0 satu-satunya cara menemukan sesuatu
 * di sana adalah menggulir seluruhnya sambil membaca judul; diminta pemilik
 * 9 Sep 2026.
 *
 * DUA hal sekaligus, dan yang kedua yang membuatnya berguna:
 *   1. bagian yang tidak memuat kata kuncinya DISEMBUNYIKAN — Ctrl+F peramban
 *      menemukan katanya tapi meninggalkan 26 bagian lain di sekelilingnya,
 *      jadi yang ketemu tetap terkubur;
 *   2. kata yang cocok DITANDAI, supaya mata tahu harus berhenti di mana pada
 *      bagian yang panjangnya belasan baris.
 *
 * Penandanya memakai TEXT NODE, tidak pernah innerHTML. Menyisipkan <mark>
 * lewat innerHTML berarti menyusun ulang HTML halaman ini dari teksnya sendiri
 * setiap ketukan tombol — dan satu tanda kurung di dalam sebuah <strong> sudah
 * cukup untuk merusaknya secara permanen, karena yang rusak lalu jadi sumber
 * penulisan berikutnya.
 */
const bantuanKartu = () => $$('#layarBantuan .kartu').filter(k => !k.classList.contains('cari-bantuan'));

/** Cabut seluruh penanda dan satukan kembali teks yang terpotong olehnya. */
function bersihkanSorotBantuan() {
  $$('#layarBantuan mark.sorot').forEach(m => {
    const induk = m.parentNode;
    if (!induk) return;
    induk.replaceChild(document.createTextNode(m.textContent), m);
    /* `normalize()` menyatukan potongan teks yang tertinggal. Tanpa itu satu
       kalimat berubah jadi belasan simpul teks setelah beberapa kali mencari,
       dan pencarian berikutnya tidak bisa lagi menemukan kata yang kebetulan
       jatuh di sambungannya. */
    induk.normalize();
  });
}

function sorotBantuan(kartu, kueri) {
  const q = kueri.toLowerCase();
  const jalan = document.createTreeWalker(kartu, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || n.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;
      /* Judul kartu ikut ditandai; yang dilewati cuma yang bukan teks bacaan. */
      const t = n.parentNode && n.parentNode.nodeName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'MARK') return NodeFilter.FILTER_REJECT;
      return n.nodeValue.toLowerCase().indexOf(q) >= 0
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  /* Dikumpulkan dulu, BARU diubah. Mengubah pohon sambil menelusurinya membuat
     penelusurnya melompat ke tempat yang tidak bisa ditebak siapa pun. */
  const simpul = [];
  for (let n = jalan.nextNode(); n; n = jalan.nextNode()) simpul.push(n);

  simpul.forEach(n => {
    const teks = n.nodeValue;
    const bagian = document.createDocumentFragment();
    let i = 0;
    for (;;) {
      const k = teks.toLowerCase().indexOf(q, i);
      if (k < 0) break;
      if (k > i) bagian.appendChild(document.createTextNode(teks.slice(i, k)));
      const m = document.createElement('mark');
      m.className = 'sorot';
      m.textContent = teks.slice(k, k + q.length);
      bagian.appendChild(m);
      i = k + q.length;
    }
    if (i < teks.length) bagian.appendChild(document.createTextNode(teks.slice(i)));
    n.parentNode.replaceChild(bagian, n);
  });
}

function cariBantuan(kueri) {
  const kartu = bantuanKartu();
  const q = String(kueri || '').trim();
  bersihkanSorotBantuan();
  const info = $('#hasilBantuan');

  if (!q) {
    kartu.forEach(k => k.classList.remove('sembunyi'));
    if (info) info.textContent = '';
    return kartu.length;
  }

  const ql = q.toLowerCase();
  let cocok = 0;
  kartu.forEach(k => {
    const ada = k.textContent.toLowerCase().indexOf(ql) >= 0;
    k.classList.toggle('sembunyi', !ada);
    if (ada) { cocok++; sorotBantuan(k, q); }
  });

  if (info) {
    /* Angka pembandingnya ikut ditulis. "3 bagian" saja tidak memberi tahu
       apakah itu banyak atau sedikit, dan yang mencari perlu tahu berapa yang
       sedang disembunyikan darinya. */
    info.textContent = cocok
      ? cocok + ' dari ' + kartu.length + ' bagian memuat "' + q + '"'
      : 'Tidak ada bagian yang memuat "' + q + '" — coba kata yang lebih pendek';
  }
  return cocok;
}

/* ==================== EVENT ==================== */
function pasangEvent() {

  /* --- cari di bantuan --- */
  {
    const inp = $('#cariBantuan');
    if (inp) {
      /* Ditunda 150 md. Menyaring 27 bagian sekaligus menandai kata di dalamnya
         menyentuh ribuan simpul teks; dikerjakan tiap ketukan tombol, mengetik
         di kolom ini terasa tersendat pada tablet kasir. */
      let tunda = null;
      inp.addEventListener('input', () => {
        clearTimeout(tunda);
        tunda = setTimeout(() => cariBantuan(inp.value), 150);
      });
      /* Escape mengosongkan, dan mengosongkan SEKETIKA — orang menekannya
         justru karena ingin melihat seluruh halaman lagi sekarang. */
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        inp.value = ''; clearTimeout(tunda); cariBantuan('');
      });
      /* `search` berbunyi saat tombol silang bawaan peramban ditekan. Tanpa ini
         menekan silang mengosongkan kolomnya tapi meninggalkan halaman tersaring
         — kotak kosong yang menyembunyikan 26 bagian. */
      inp.addEventListener('search', () => { clearTimeout(tunda); cariBantuan(inp.value); });
    }
  }


  /* --- login ---
     TIDAK ADA login otomatis di digit ke-6; yang mengirim adalah tombol OK.
     Sampai v1.28 digit ke-6 langsung menembak server, dan itu punya dua akibat
     yang baru terasa saat dipakai sungguhan:
       1. OK tidak pernah bisa memasukkan siapa pun. Buffer dipatok 6, dan pas 6
          login sudah jalan — jadi OK hanya bisa ditekan di 0–5 digit, di mana
          login() langsung menolak "PIN 6 digit." Tombol mati yang menempel.
       2. Salah tekan digit KEENAM langsung jadi percobaan login yang gagal.
          Kasir tidak pernah punya kesempatan menekan ← untuk membetulkannya —
          padahal papan itu justru ada di sebelahnya.
     Dijaga uji/uji-login.mjs. Kalau suatu saat login otomatis mau dihidupkan
     lagi, baca dulu alasan no. 2. */
  $('#titikPin') && gambarPin();
  $$('.papan-pin button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.pin;
    if (v === 'hapus') pinBuffer = pinBuffer.slice(0, -1);
    else if (v === 'masuk') return login(false);
    else if (pinBuffer.length < 6) pinBuffer += v;
    gambarPin();
  }));
  /* Papan ketik fisik. Di laptop, papan PIN yang hanya bisa diklik memaksa
     tangan pindah ke tetikus enam kali untuk sesuatu yang jarinya sudah hafal.
     Angka mengisi, Backspace menghapus, Enter mengirim — Enter mengikuti tombol
     OK persis: diam saja selama PIN belum genap enam digit.

     TIGA PENJAGA, dan yang pertama bukan kehati-hatian berlebihan.
     Penangan ini duduk di `document`, jadi tanpa penjaga pertama ia ikut menelan
     angka yang sedang diketik di kolom Username: username "kasir1" diam-diam
     mengisi PIN dengan "1", lalu digit pertama yang sebenarnya jadi digit KEDUA.
     Kasir tidak akan pernah tahu kenapa PIN-nya "salah".
       1. fokus sedang di kolom isian → biarkan kolomnya yang mengurus
       2. mode password sedang tampil → papan PIN tidak terlihat, dan buffer yang
          menumpuk tanpa terlihat siapa pun itu jebakan
       3. layar login sudah lewat → di dalam aplikasi, angka milik layar lain */
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select')) return;
    if ($('#modePin').classList.contains('sembunyi')) return;
    if ($('#layarLogin').classList.contains('sembunyi')) return;

    if (e.key >= '0' && e.key <= '9' && e.key.length === 1) {
      if (pinBuffer.length < 6) pinBuffer += e.key;
    } else if (e.key === 'Backspace') {
      pinBuffer = pinBuffer.slice(0, -1);
    } else if (e.key === 'Enter') {
      if (pinBuffer.length === 6) login(false);
      return;
    } else return;

    e.preventDefault();   // Backspace tidak boleh memundurkan halaman
    gambarPin();
  });

  $('#btnLoginPassword').addEventListener('click', () => login(true));
  $('#inpPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(true); });
  $('#btnTukarMode').addEventListener('click', () => {
    const pin = $('#modePin').classList.toggle('sembunyi');
    $('#modePassword').classList.toggle('sembunyi', !pin);
    $('#btnTukarMode').textContent = pin ? 'Masuk dengan PIN' : 'Masuk dengan password';
  });

  /* --- navigasi --- */
  $('#navSisi').addEventListener('click', e => {
    const a = e.target.closest('a[data-layar]');
    if (!a) return;
    /* Terkunci saat memuat. `pointer-events:none` di CSS sudah menahan
       tetikus, tapi TIDAK menahan Enter di atas tautan yang sedang fokus — dan
       itu jalur yang dipakai orang yang bekerja dengan papan ketik. */
    if (document.body.classList.contains('tunggu')) { e.preventDefault(); return; }
    /* Klik dengan penyerta dibiarkan sepenuhnya pada peramban — itu "buka di
       tab baru", dan sejak v1.147.0 item ini memang tautan sungguhan. Menangkap
       semua klik akan MENCURI perilaku itu dan menggambar layarnya di tab yang
       sedang dipakai orang. */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    /* Tidak ada preventDefault: hash tetap ditulis peramban, dan
       `hashchange` di bawah akan mengenalinya sebagai layar yang SUDAH
       tergambar lalu berhenti. Yang dikerjakan di sini cuma menggambarnya
       lebih cepat — dan menutup laci saat item yang diklik ternyata layar
       yang sedang aktif, di mana hash tidak berubah dan `hashchange` tidak
       akan pernah berbunyi. */
    bukaLayar(a.dataset.layar);
  });

  /* FLYOUT mode terlipat. Dipasang SEKALI di sini, bukan per item nav:
     navnya digambar ulang tiap kali izin atau menu berubah, dan penangan
     per item harus dipasang ulang tiap kali — yang diam-diam menumpuk kalau
     satu saja lupa dilepas.
     `mouseover`/`mouseout` (yang menggelembung), bukan `mouseenter`/`mouseleave`
     (yang tidak) — pendelegasian menuntut peristiwa yang naik ke wadahnya. */
  /* POINTER events, bukan mouse events — dan ini inti perbaikan "nyangkut"
     kedua (9 Sep 2026, laporan kedua). Di laptop Windows berlayar sentuh,
     `(hover: hover)` bernilai BENAR karena penunjuk utamanya tetikus, jadi
     penyaring itu tidak menolong. Lalu setiap KETUKAN jari disintesis peramban
     jadi rangkaian mouse: touchstart → touchend → mouseover → mousedown → click.
     Penutup `touchstart` menyembunyikannya, dan `mouseover` sintetis yang
     datang SESUDAHNYA membukanya lagi — untuk item yang tidak sedang disentuh
     siapa pun. Pointer events membawa `pointerType`, dan ketukan jari datang
     sebagai 'touch', bukan 'mouse'. Jari tidak pernah membuka flyout, titik. */
  $('#navSisi').addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = e.target.closest('a[data-layar]');
    if (a) tampilFlyoutSisi(a);
  });
  $('#navSisi').addEventListener('pointerout', (e) => {
    /* Pindah DI DALAM satu item (dari ikon ke labelnya) juga menembakkan
       pointerout. Kalau tujuannya masih item yang sama, gelembungnya jangan
       ditutup — kalau ditutup, ia berkedip setiap kali kursor bergeser 2px. */
    const ke = e.relatedTarget;
    if (ke && ke.closest && ke.closest('#navSisi a[data-layar]') === e.target.closest('a[data-layar]')) return;
    sembunyiFlyoutSisi();
  });
  /* DUA JARING TERAKHIR, dan keduanya yang membuat "nyangkut" mustahil apa pun
     urutan peristiwa yang terlewat:
     1. Tekanan di mana pun menutupnya. Flyout adalah petunjuk SEBELUM menekan;
        begitu ada yang ditekan, petunjuknya sudah tidak ditanyakan lagi.
     2. Gerakan penunjuk di LUAR nav menutupnya. Kalau pointerout-nya hilang
        karena sebab apa pun — popover yang muncul di bawah kursor, gambar
        ulang nav, apa saja — gerakan pertama di luar nav tetap membereskannya.
        Diperiksa `hidden` dulu supaya ribuan pointermove per detik tidak
        membayar closest() untuk gelembung yang memang sedang tidak ada. */
  document.addEventListener('pointerdown', sembunyiFlyoutSisi, true);
  document.addEventListener('pointermove', (e) => {
    const el = $('#flyoutSisi');
    if (!el || el.hidden) return;
    if (e.target && e.target.closest && e.target.closest('#navSisi')) return;
    sembunyiFlyoutSisi();
  }, { passive: true });
  /* focusin/focusout, bukan focus/blur: yang terakhir tidak menggelembung. */
  $('#navSisi').addEventListener('focusin', (e) => {
    const a = e.target.closest('a[data-layar]');
    if (a) tampilFlyoutSisi(a);
  });
  $('#navSisi').addEventListener('focusout', sembunyiFlyoutSisi);
  /* Digulir = letak yang sudah dihitung sudah salah. Menghitung ulang tiap
     piksel gulir lebih mahal daripada menutupnya; yang mau melihatnya lagi
     tinggal berhenti di ikonnya. `passive` supaya gulirnya tidak tersendat. */
  $('.sisi-isi').addEventListener('scroll', sembunyiFlyoutSisi, { passive: true });
  /* Jaring pengaman, dan bukan pengulangan: gulir yang dimulai DI LUAR nav
     (halaman, atau layar sentuh yang menggulir seluruh badan) tidak pernah
     sampai ke pendengar di atas, sementara letak flyoutnya sudah salah begitu
     apa pun bergerak. Ketiganya `passive` supaya tidak menghambat gulirnya. */
  window.addEventListener('scroll', sembunyiFlyoutSisi, { passive: true });
  window.addEventListener('resize', sembunyiFlyoutSisi, { passive: true });
  /* Sentuhan menutupnya SEKETIKA. Di layar sentuh gelembungnya memang tidak
     pernah dibuka (lihat bolehFlyout), tapi papan sentuh laptop bisa keduanya:
     tetikus membukanya, lalu jari menggulir dan gelembungnya tertinggal. */
  document.addEventListener('touchstart', sembunyiFlyoutSisi, { passive: true });

  /* Melipat kelompok. Tombolnya di dalam <h2>, jadi kliknya ditangkap di sini
     — bukan dengan penangan per tombol, yang harus dipasang ulang tiap kali
     nav digambar ulang dan diam-diam menumpuk kalau lupa dilepas. */
  $('#navSisi').addEventListener('click', e => {
    const t = e.target.closest('.sisi-grup-tombol');
    if (!t) return;
    const daftar = $('#' + t.getAttribute('aria-controls'));
    const buka = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(buka));
    daftar.classList.toggle('tutup', !buka);
    const peta = bacaLipatGrup();
    peta[t.dataset.grup] = buka;
    simpanLipatGrup(peta);
    /* Titik masuk Tab dihitung ulang: item yang baru saja disembunyikan tidak
       boleh tetap memegangnya, kalau tidak Tab mendarat di elemen tak
       terlihat. */
    pindahTitikTab($('#navSisi a[data-layar].aktif'));
  });

  /* Popover kartu pengguna. */
  $('#btnKartuUser').addEventListener('click', () =>
    $('#popoverAkun').hidden ? bukaPopoverAkun() : tutupPopoverAkun(true));
  /* Klik di LUAR menutupnya. Dipasang di document dengan pemeriksaan
     `contains`, bukan penangan blur pada popovernya: blur berbunyi juga saat
     fokus berpindah ke dalam popover itu sendiri. */
  document.addEventListener('click', e => {
    if ($('#popoverAkun').hidden) return;
    if ($('#popoverAkun').contains(e.target) || $('#btnKartuUser').contains(e.target)) return;
    tutupPopoverAkun(false);
  });

  /* Router. Berbunyi untuk tombol Kembali/Maju, untuk tautan yang ditempel,
     dan untuk hash yang ditulis `bukaLayar` sendiri — yang terakhir berhenti
     di baris `id === layarKini`, jadi tidak ada layar yang tergambar dua kali. */
  window.addEventListener('hashchange', () => {
    const id = idDariHash();
    if (!id || id === layarKini) return;
    if (!bolehLayar(id)) {
      /* Dikembalikan ke layar terakhir yang sah, BUKAN dibiarkan menggambar
         layar kosong. Penulisan balik ini memicu `hashchange` sekali lagi,
         dan yang kedua berhenti sendiri karena id-nya sudah sama dengan
         layarKini. */
      if (layarKini) location.hash = '#/' + layarKini;
      return;
    }
    bukaLayar(id);
  });

  /* Roving tabindex: panah memindahkan fokus DI DALAM nav, Tab keluar darinya.
     Nav 23 butir yang tiap butirnya menerima Tab berarti 23 tekanan Tab untuk
     melewati sidebar — itu yang membuat orang berhenti memakai keyboard. */
  $('#navSisi').addEventListener('keydown', e => {
    const a = e.target.closest('a[data-layar]');
    if (!a) return;
    /* Panah TIDAK dikunci: memindahkan fokus tidak mengubah apa pun. Yang
       dikunci cuma yang membuka layar, dan itu ditangani penangan klik —
       Enter pada tautan menembakkan klik. */
    const item = itemNav();
    const i = item.indexOf(a);
    let j = -1;
    if (e.key === 'ArrowDown')    j = (i + 1) % item.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + item.length) % item.length;
    else if (e.key === 'Home')    j = 0;
    else if (e.key === 'End')     j = item.length - 1;
    if (j === -1) return;
    e.preventDefault();
    /* tabindex ikut BERPINDAH, bukan cuma fokusnya. Kalau hanya fokus yang
       pindah, Tab keluar lalu masuk lagi akan mendarat di item lama — bukan
       di tempat orangnya berhenti. */
    pindahTitikTab(item[j]);
    item[j].focus();
  });
  $('#btnLaci').innerHTML = '<svg class="ikon-svg" viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/></svg>';
  /* Ikon DAN label. Sampai v1.147.0 tombol ini cuma ikon di kaki sidebar, dan
     labelnya hidup di `aria-label` saja; di dalam popover ia berdiri sejajar
     dengan "Akun saya" dan "Tentang", jadi ia harus terbaca seperti mereka. */
  $('#btnKeluar').innerHTML = '<svg class="ikon-svg" viewBox="0 0 24 24"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9"/></svg><span>Keluar</span>';
  $('#btnLaci').addEventListener('click', () =>
    $('#sisi').classList.contains('buka') ? tutupLaci() : bukaLaci());
  $('#tiraiSisi').addEventListener('click', tutupLaci);
  // Gambar ikonnya sekarang juga, jangan tunggu sesi dimulai — kalau tidak, tombolnya
  // sempat tampil kosong dan terlihat seperti bug.
  terapkanLipat(false, false);
  $('#btnLipat').addEventListener('click', () =>
    terapkanLipat(!$('#app').classList.contains('sisi-lipat')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#popoverAkun').hidden) { tutupPopoverAkun(true); return; }
    if (e.key === 'Escape' && $('#sisi').classList.contains('buka')) tutupLaci();
    /* Perangkap fokus selama laci terbuka. Laci menutupi seluruh layar di balik
       tirai, jadi Tab yang keluar darinya membawa orang ke tombol dan kolom
       yang tidak terlihat — mereka mengetik ke tempat yang tidak ada.
       Hanya berlaku saat `.buka` menyala, dan `.buka` hanya pernah menyala di
       tata letak laci (≤1024px); di layar lebar penangan ini tidak pernah
       melakukan apa pun. */
    if (e.key === 'Tab' && $('#sisi').classList.contains('buka')) {
      const f = fokusSisi();
      if (!f.length) return;
      const awal = f[0], akhir = f[f.length - 1];
      if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus(); }
      else if (e.shiftKey && document.activeElement === awal) { e.preventDefault(); akhir.focus(); }
      else if (!$('#sisi').contains(document.activeElement)) { e.preventDefault(); awal.focus(); }
    }
    if (e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      terapkanLipat(!$('#app').classList.contains('sisi-lipat'));
    }
  });

  /**
   * Keluar tidak boleh meninggalkan shift yang masih terbuka.
   *
   * Shift adalah pertanggungjawaban uang laci: kas awal, penerimaan tunai, dan
   * hitungan fisik saat serah terima. Kasir yang keluar tanpa menutupnya
   * meninggalkan laci yang tidak pernah dicocokkan, dan shift itu akan
   * menggantung di laporan tanpa ada yang merasa bertanggung jawab.
   *
   * Tapi menutup shift butuh server. Blokir mutlak berarti kasir yang internetnya
   * mati tidak bisa pulang tanpa menghapus data browser — dan itu ikut membuang
   * nota yang belum terkirim. Jadi: online ditolak tanpa pengecualian, offline
   * diberi jalan keluar yang TERCATAT.
   */
  $('#btnKeluar').addEventListener('click', async () => {
    const tbl = $('#btnKeluar');
    if (tbl.classList.contains('sibuk')) return;

    if (APP_STATE.idShift && API.online) {
      bukaLayar('shift');
      // Admin.toast, bukan toast: `toast` hanya hidup di dalam IIFE admin.js.
      // Memanggilnya telanjang di sini melempar ReferenceError, dan penolakannya
      // jadi tidak pernah terlihat — kasir cuma melihat layar melompat.
      Admin.toast('Tutup shift dulu sebelum keluar — laci ini belum dicocokkan.', 'galat');
      return;
    }

    /* SATU pertanyaan, dirakit dari keadaannya — bukan dua dialog berturut-turut.
     *
     * Dua sebab. Pertama, sampai v1.33 jalur yang paling biasa (tanpa shift,
     * tanpa nota tertahan) tidak bertanya apa pun: satu sentuhan di ikon Keluar
     * yang duduk tepat di bawah nama pengguna langsung mengakhiri sesi, dan
     * ongkos salah sentuh adalah login ulang enam digit di tengah antrean.
     * Kedua, dialog yang muncul beruntun melatih orang menekan "OK" tanpa
     * membaca — dan yang hilang justru peringatan yang paling penting. */
    const alasan = [];
    if (APP_STATE.idShift) alasan.push(
      'Sedang offline, jadi shift tidak bisa ditutup sekarang. Kalau Anda tetap ' +
      'keluar, shift ini menggantung tanpa hitungan kas — dan kejadiannya akan ' +
      'tercatat atas nama Anda begitu perangkat tersambung lagi.');
    const tertahan = await DB.outboxJumlah();
    if (tertahan > 0) alasan.push(
      `Masih ada ${tertahan} nota belum terkirim. Nota tetap tersimpan di ` +
      'perangkat ini dan akan dikirim saat Anda masuk lagi.');

    if (!(await Admin.tanya('Keluar dari akun ini?',
          alasan.map(x => `<div class="pesan peringatan">${esc(x)}</div>`).join(''),
          { ya: 'Keluar', jenis: 'bahaya' }))) return;

    if (APP_STATE.idShift) {
      // Disimpan sekarang, dilaporkan saat login berikutnya — sesi yang sedang
      // berjalan sudah tidak punya jalan ke server.
      await antrikanKeluarPaksa({ sebab: 'OFFLINE' });
    }

    /* Mengakhiri sesi butuh jaringan, dan di jaringan seluler itu beberapa detik.
       Tanpa penanda, ikon yang tidak bereaksi mengundang sentuhan kedua. */
    tbl.classList.add('sibuk'); tbl.disabled = true;
    try {
      // Kosong dengan sengaja: mengakhiri sesi di server itu kebersihan, bukan
      // syarat. Yang menentukan orang benar-benar keluar adalah token yang
      // dibuang di baris berikutnya, dan itu tidak boleh digagalkan jaringan.
      try { await API.logout(); } catch (e) {}
      await DB.kvSet('token', null);
      location.reload();
    } finally {
      /* Biasanya halaman sudah memuat ulang sebelum baris ini berarti apa-apa.
         Ia ada untuk jalur yang TIDAK sampai ke sana — kvSet gagal, penyimpanan
         penuh — supaya tombolnya tidak tertinggal berputar selamanya dengan
         satu-satunya jalan keluar berupa muat ulang manual. */
      tbl.classList.remove('sibuk'); tbl.disabled = false;
    }
  });

  /* --- pencarian & produk --- */
  let timerCari;
  $('#inpCari').addEventListener('input', e => {
    // Mengetik lagi berarti Enter berikutnya memang milik orangnya — alur
    // panah-lalu-Enter tidak boleh ikut tertelan penanda ini.
    APP_STATE.baruAutoTambah = false;
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
      /* Kolom kosong DAN barusan dikosongkan program = barangnya sudah masuk
         keranjang lewat jeda 120 ms. Tidak ada yang perlu ditambahkan lagi.
         Kolom kosong tanpa penanda tetap dilayani: itu alur panah-lalu-Enter
         yang memang disengaja. */
      const barusanOtomatis = APP_STATE.baruAutoTambah;
      APP_STATE.baruAutoTambah = false;
      if (!kueri.trim() && barusanOtomatis) return;
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
  /* Angka stok kini kendali yang bisa difokus (`role=button`, `tabindex=0`).
     Kendali yang bisa difokus tapi tidak bisa ditekan dari papan ketik adalah
     kendali yang setengah ada — dan di konter, papan ketik sering satu-satunya
     yang tersentuh karena tangan yang lain memegang barang. */
  $('#daftarProduk').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-stok-cabang]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    lihatStokCabangLain(el.dataset.stokCabang);
  });
  $('#daftarProduk').addEventListener('click', async e => {
    // Angka stok berada DI DALAM kartu — menekannya jangan sampai ikut menambah ke keranjang
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

  /* Satu pendengar untuk seluruh bar alat, didelegasikan — bukan empat
     pendengar terpisah. Dropdown pramuniaga digambar ULANG setiap kali
     keranjang berubah, jadi pendengar yang dipasang pada elemennya akan
     hilang bersama elemennya (jebakan yang sama sudah tercatat di §12). */
  $('.baris-alat-kasir')?.addEventListener('change', tandaiKendaliKasir);
  /* Cip ini cuma MENGANTAR ke kartu shift; tidak ada dokumen yang dibuat di
     sini, jadi tidak ada yang perlu ditanyakan. Pertanyaannya menunggu di
     tombol Buka shift, tempat shiftnya benar-benar dibuat. */
  $('#btnBukaShiftKasir')?.addEventListener('click', menujuBukaShift);
  const cipPetugas = $('#lncPetugasKosong');
  cipPetugas?.addEventListener('click', () => tarikUlangMaster());
  cipPetugas?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); tarikUlangMaster();
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

  /* --- klaim petugas ---
     Satu pendengar untuk DUA kolom: `#selPetugas` di bar alat kasir dan
     `#selPetugasBayar` di layar bayar. Yang kedua digambar ulang setiap kali
     ringkasan bayar berubah, jadi pendengarnya dipasang di document (delegasi)
     — memasangnya langsung pada elemennya akan hilang bersama elemennya. */
  const ubahPetugasNota = (nilai) => {
    // Satu nama, selalu — `setPetugasNota` sendiri yang memangkasnya.
    Keranjang.setPetugasNota(nilai ? [{ kode: nilai }] : []);
    gambarPilihanPetugas();
    if ($('#tiraiBayar').classList.contains('tampil')) gambarRingkasBayar();
  };
  document.addEventListener('change', e => {
    if (e.target.id === 'selPetugas' || e.target.id === 'selPetugasBayar') {
      ubahPetugasNota(e.target.value);
    }
    if (e.target.id === 'selPemasangBayar') {
      Keranjang.setPemasangNota(e.target.value);
      /* Keranjang ikut digambar ulang: baris yang butuh dipasang sekarang
         menampilkan timnya, jadi kasir melihat akibat pilihannya di tempat
         barangnya berada — bukan cuma di panel ringkasan. */
      gambarKeranjang();
      gambarRingkasBayar();
    }
  });
  /* Tombol ini hidup di dalam modal yang dibuka `tampilkanDitolak()`. Modalnya
     milik Admin, jadi delegasinya harus dipasang di sini — penangan klik Admin
     tidak tahu apa-apa tentang outbox. */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kirim-ulang]');
    if (!b) return;
    b.disabled = true;
    kirimUlangDitolak(b.dataset.kirimUlang)
      .catch(x => Admin.toast(x && x.message ? x.message : 'Kirim ulang gagal.', 'galat'))
      .finally(() => { b.disabled = false; });
  });

  $('#btnBatalTim').addEventListener('click', () => {
    $('#tiraiTim').classList.remove('tampil');
    APP_STATE.timBaris = null;
  });
  $('#btnSimpanTim').addEventListener('click', simpanTim);
  /* Tidak ada lagi kolom yang bisa diketik di sini — hanya siapa orangnya.
     Poin datang dari master produk, pembagiannya dari bobot peran, dan keduanya
     milik back office. Yang tersisa untuk kasir adalah keputusan yang memang
     hanya dia yang tahu: siapa yang mengerjakan. */
  $('#timDaftar').addEventListener('change', e => {
    if (e.target.dataset.f !== 'kode') return;
    const d = APP_STATE._timDraft;
    d[Number(e.target.dataset.i)].kode = e.target.value;
    gambarBagianTim();
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
  $('#btnKosongkan').addEventListener('click', async () => {
    /* Keranjang kosong tidak ditanya apa-apa: tidak ada yang bisa hilang, dan
       pertanyaan atas tindakan yang tidak berakibat mengajari orang menjawab
       tanpa membaca. */
    if (!Keranjang.kosong && !(await Admin.tanya('Kosongkan keranjang?',
          '<p class="petunjuk">Seluruh baris, pelanggan, dan pramuniaga nota ini dilepas.</p>',
          { ya: 'Kosongkan', jenis: 'bahaya' }))) return;
    Tahanan.kosongkanLayarKeranjang();
  });
  $('#pegangan').addEventListener('click', () => $('#panelKeranjang').classList.toggle('buka'));

  /* --- nota ditahan --- */
  const tahanSekarang = async () => {
    if (Keranjang.kosong) return Admin.toast('Keranjang kosong — tidak ada yang ditahan.', 'galat');
    /* Batasnya diperiksa SEBELUM bertanya — mengetik ciri pembeli lalu ditolak
       adalah dua langkah yang terbuang di depan antrean. */
    if ((await Tahanan.jumlah()) >= TAHANAN_MAKS) {
      return Admin.toast(`Sudah ${TAHANAN_MAKS} nota ditahan. Lanjutkan atau buang salah satu dulu.`, 'galat');
    }
    /* Satu isian opsional, Enter langsung menyimpan: antreannya sedang
       menunggu, tapi tanpa ciri apa pun tiga tahanan "2 item" tidak bisa
       dibedakan lima menit kemudian. */
    const label = await Admin.tanya('Tahan nota ini?',
      '<p class="petunjuk">Keranjang dikosongkan untuk pembeli berikutnya; nota ini bisa dilanjutkan dari lencana <strong>Tahanan</strong>.</p>',
      { isian: 'Ciri pembeli, mis. "bapak jaket hitam" (opsional)', ya: 'Tahan' });
    if (label === null) return;
    const t = await Tahanan.tahan(label);
    if (!t) return;
    /* Di HP panel keranjang (lembar bawah) dilipat lagi: keranjangnya kosong,
       dan yang dibutuhkan untuk pembeli berikutnya adalah daftar produk. */
    $('#panelKeranjang').classList.remove('buka');
    Admin.toast(`Nota ditahan (${t.jumlah_item} item, ${rp(t.total)}).`, 'sukses');
  };
  $('#btnTahan').addEventListener('click', tahanSekarang);
  $('#lncTahanan').addEventListener('click', () => Tahanan.bukaDaftar());
  $('#lncTahanan').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Tahanan.bukaDaftar(); }
  });
  document.addEventListener('click', async e => {
    const lanjut = e.target.closest('[data-tahan-lanjut]');
    const buang = e.target.closest('[data-tahan-buang]');
    if (!lanjut && !buang) return;
    if (buang) {
      if (!(await Admin.tanya('Buang nota tahanan ini?',
            '<p class="petunjuk">Barisnya hilang dari perangkat ini. Stok dan nota tidak tersentuh.</p>',
            { ya: 'Buang', jenis: 'bahaya' }))) return;
      await Tahanan.buang(buang.dataset.tahanBuang);
      return Tahanan.bukaDaftar();
    }
    const adaIsi = !Keranjang.kosong;
    const r = await Tahanan.lanjutkan(lanjut.dataset.tahanLanjut);
    Admin.tutupModal();
    if (!r) return;
    $('#panelKeranjang').classList.add('buka');
    const pesan = [];
    if (adaIsi) pesan.push('keranjang sebelumnya ikut ditahan');
    if (r.berubah.length) pesan.push('harga berubah: ' + r.berubah.join(', '));
    if (r.hilang.length) pesan.push('dilepas (tidak dijual lagi di sini): ' + r.hilang.join(', '));
    Admin.toast('Nota dilanjutkan' + (pesan.length ? ' — ' + pesan.join(' · ') : '.'),
                r.hilang.length ? 'galat' : 'sukses');
  });

  /* --- detail item --- */
  let itemAktif = null;
  function bukaDetailItem(b) {
    itemAktif = b;
    $('#itmNama').textContent = b.nama;
    $('#itmQty').value = b.qty;
    $('#itmHarga').value = ribuan(b.harga_satuan);
    $('#itmHarga').disabled = !APP_STATE.flag.ubah_harga_saat_jual;
    $('#itmDiskon').value = ribuan(b.diskon);
    const satuanLain = [{ nama: b._produk.satuan || 'pcs', isi: 1 }, ...(b._produk.satuan_lain || [])];
    $('#itmSatuan').innerHTML = satuanLain.map(s =>
      `<option value="${esc(s.nama)}" ${s.nama === b.satuan ? 'selected' : ''}>${esc(s.nama)} (isi ${s.isi})</option>`).join('');
    $('#itmInfo').textContent =
      `Sumber harga: ${b.sumber_harga} · batas diskon peran Anda ${APP_STATE.diskonMaks}%` +
      (APP_STATE.flag.ubah_harga_saat_jual ? '' : ' · Anda tidak berhak mengubah harga');
    /* Ditawarkan hanya kalau barisnya BERPOIN: membagi pekerjaan yang tidak
       bernilai poin tidak mengubah apa pun, dan tombol yang tidak mengubah apa
       pun cuma menambah pertanyaan. Baris yang butuh dipasang sudah punya
       tombolnya sendiri di keranjang, jadi di sini ia tetap ditawarkan sebagai
       jalan kedua — bukan disembunyikan dengan aturan tambahan yang harus
       diingat orang. */
    $('#btnTimItem').classList.toggle('sembunyi', !(Number(b.poin_satuan) > 0));
    $('#tiraiItem').classList.add('tampil');
  }
  $('#btnTimItem').addEventListener('click', () => {
    if (!itemAktif) return;
    $('#tiraiItem').classList.remove('tampil');
    bukaTim(itemAktif.id);
  });
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
      if (APP_STATE.flag.ubah_harga_saat_jual) Keranjang.ubahHarga(itemAktif.id, angkaDari($('#itmHarga').value));
      Keranjang.ubahDiskon(itemAktif.id, angkaDari($('#itmDiskon').value));
    }
    $('#tiraiItem').classList.remove('tampil');
    gambarKeranjang();
  });
  /* Menutup saja — tidak menyentuh keranjang sama sekali. Isian jendela ini
     memang diisi ulang dari barisnya setiap kali dibuka (`bukaDetailItem`),
     jadi tidak ada yang perlu dikembalikan; yang penting justru TIDAK memanggil
     Keranjang.ubah* apa pun. Tombol bernama "Batal" yang diam-diam menyimpan
     lebih berbahaya daripada tidak ada tombolnya sama sekali. */
  $('#btnBatalItem').addEventListener('click', () => {
    $('#tiraiItem').classList.remove('tampil');
  });
  $('#btnHapusItem').addEventListener('click', () => {
    if (itemAktif) Keranjang.hapus(itemAktif.id);
    $('#tiraiItem').classList.remove('tampil');
    gambarKeranjang();
  });

  /* --- pembayaran --- */
  $('#btnBayar').addEventListener('click', bukaBayar);
  $('#btnBatalBayar').addEventListener('click', () => $('#tiraiBayar').classList.remove('tampil'));
  $('#btnSelesaiSukses').addEventListener('click', tutupLayarSukses);
  $('#btnCetakUlangSukses').addEventListener('click', async () => {
    /* Hitung mundur DIHENTIKAN begitu kasir menekan cetak ulang: layarnya
       tidak boleh menutup diri di tengah orang mengurus struk. Sesudah ini
       hanya tombol Selesai yang menutupnya. */
    hentikanTimerSukses();
    $('#btnSelesaiSukses').textContent = 'Selesai';
    try { await cetakUlangNota(_uuidSukses, false); }
    catch (e) { pesan('#skPesan', 'Gagal mencetak: ' + e.message, 'galat'); }
  });
  $('#btnTambahMetode').addEventListener('click', () => {
    const t = Keranjang.total().total;
    const sudah = APP_STATE.metodeBayar.reduce((a, m) => a + Number(m.jumlah || 0), 0);
    APP_STATE.metodeBayar.push({ metode: 'transfer', jumlah: Math.max(0, t - sudah), referensi: '' });
    gambarBayar();
  });
  $('#byrDaftarMetode').addEventListener('input', e => {
    const i = Number(e.target.dataset.i), f = e.target.dataset.f;
    if (f !== 'jumlah') return;
    APP_STATE.metodeBayar[i].jumlah = angkaDari(e.target.value);
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
    if (inp) inp.value = ribuan(m.jumlah);   // isi kolomnya langsung, tanpa gambar ulang
    gambarRingkasBayar();
  });
  $('#byrDiskonNota').addEventListener('input', e => {
    Keranjang.setDiskonNota(angkaDari(e.target.value));
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
  $('#btnBukaShift').addEventListener('click', async () => {
    try {
      const d = await API.bukaShift({ kas_awal: angkaDari($('#inpKasAwal').value) });
      APP_STATE.idShift = d.id_shift;
      await DB.kvSet('id_shift', d.id_shift);
      gambarKeadaanShift();          // seketika, tanpa menunggu periksaShift()
      await periksaShift();
      Admin.toast('Shift dibuka: ' + d.id_shift);
    } catch (e) { Admin.toast('Gagal membuka shift: ' + e.message, 'galat'); }
  });
  $('#btnTutupShift').addEventListener('click', async () => {
    if (!APP_STATE.idShift) return Admin.toast('Tidak ada shift aktif.', 'galat');
    /* Penanda menunggu dipasang tangan di sini.
     *
     * pasangPenandaSibuk() hanya menyalakan tombol yang memicu permintaan ke
     * SERVER, dan tombol ini tidak: pekerjaannya membaca antrean outbox dari
     * IndexedDB. Pada laci yang menumpuk banyak nota belum terkirim, bacaan itu
     * cukup lama untuk terasa seperti klik yang tidak masuk — persis keluhan
     * yang melahirkan penanda sibuk itu sendiri (§11). Kelasnya sengaja SAMA
     * (`sibuk`), bukan gaya baru, supaya rupanya tidak berbeda sedikit pun dari
     * tombol lain yang sedang menunggu.
     */
    const b = $('#btnTutupShift');
    b.classList.add('sibuk');
    let tertahan;
    try { tertahan = await DB.outboxJumlah(); }
    finally { b.classList.remove('sibuk'); }
    // Penandanya dilepas DULU supaya tidak ada tombol yang berputar-putar di
    // belakang pertanyaan yang justru sedang menunggu manusia.
    if (tertahan > 0) {
      if (!(await Admin.tanya('Tutup shift sekarang?',
            `<div class="pesan peringatan">Masih ada ${tertahan} nota belum terkirim.
               Angka kas sistem bisa belum lengkap.</div>`,
            { ya: 'Lanjutkan', jenis: 'bahaya' }))) return;
    }
    /* Nota yang DITAHAN ikut dibuang bersama shift (keputusan pemilik 10 Sep
       2026) — dan itu disebut SEBELUM menutup, bukan sesudahnya. */
    const ditahan = await Tahanan.jumlah();
    if (ditahan > 0) {
      if (!(await Admin.tanya('Tutup shift sekarang?',
            `<div class="pesan peringatan">Masih ada ${ditahan} nota ditahan di perangkat ini.
               Semuanya akan dibuang saat shift ditutup — lanjutkan atau bayar dulu bila masih ditunggu pembelinya.</div>`,
            { ya: 'Lanjutkan', jenis: 'bahaya' }))) return;
    }
    $('#tsHasil').innerHTML = '';
    $('#tiraiTutupShift').classList.add('tampil');
  });
  $('#btnBatalTutup').addEventListener('click', () => $('#tiraiTutupShift').classList.remove('tampil'));

  /* --- kas masuk/keluar --- */
  $('#btnSimpanKas').addEventListener('click', simpanKasBaru);
  $('#kasJumlah').addEventListener('keydown', e => { if (e.key === 'Enter') $('#kasKeterangan').focus(); });
  $('#kasKeterangan').addEventListener('keydown', e => { if (e.key === 'Enter') simpanKasBaru(); });
  $('#btnKonfirmasiTutup').addEventListener('click', async () => {
    try {
      const d = await API.tutupShift({ id_shift: APP_STATE.idShift,
        kas_fisik: angkaDari($('#tsKasFisik').value), catatan: $('#tsCatatan').value });
      APP_STATE.idShift = null;
      await DB.kvSet('id_shift', null);
      await Tahanan.buangSemua();
      /* Hasilnya dipindah ke layar Shift, lalu modalnya ditutup.
         Membiarkan modal terbuka setelah berhasil membuat orang mengira prosesnya
         belum selesai — dan menutupnya begitu saja akan membuang angka selisih,
         justru angka yang paling perlu dibaca saat serah terima laci. */
      APP_STATE.hasilTutupShift = d;
      $('#tsHasil').innerHTML = '';
      $('#tsKasFisik').value = '0';
      $('#tsCatatan').value = '';
      $('#tiraiTutupShift').classList.remove('tampil');
      /* Layar di belakang modal disegarkan SEKARANG, dari keadaan yang sudah
         pasti (notanya diterima server, shiftnya tertutup) — bukan menunggu
         periksaShift() yang masih harus bertanya lagi ke server. Tanpa ini ada
         jeda selebar satu permintaan penuh di mana modalnya sudah hilang tapi
         layarnya masih menawarkan "Tutup shift" untuk shift yang barusan
         ditutup, lengkap dengan tombol yang masih bisa dipencet. */
      gambarKeadaanShift();
      await periksaShift();
      Admin.toast(Math.abs(d.selisih) < 1
        ? 'Shift ditutup, kas cocok.'
        : `Shift ditutup — selisih ${rp(d.selisih)}.`,
        Math.abs(d.selisih) < 1 ? 'sukses' : 'galat');
    } catch (e) {
      /* Shift yang TIDAK ADA di server, atau yang ternyata sudah tertutup,
         harus dilepaskan perangkat ini — bukan ditampilkan sebagai galat lalu
         dibiarkan.
         Sebelum ini perangkat menyimpan id_shift-nya selamanya: server menjawab
         "Shift tidak ditemukan", pesan itu muncul di modal, dan penandanya tetap
         di tempat. Akibatnya kasir tidak bisa menutup shift itu DAN tidak bisa
         membuka shift baru — perangkatnya berhenti bisa berjualan sama sekali,
         dan satu-satunya jalan keluar adalah membersihkan IndexedDB lewat
         Console. Terjadi sungguhan 28 Agu 2026: shift uji coba seorang petugas
         terhapus bersama pembersihan database cabang, lalu perangkatnya buntu.
         `periksaShift()` sudah bisa memulihkan keadaan ini sendiri, tapi HANYA
         saat online — dan tidak pernah terpanggil di jalur galat ini. */
      if (e.kode === 'NOTFOUND' || e.kode === 'STATUS') {
        APP_STATE.idShift = null;
        await DB.kvSet('id_shift', null);
        APP_STATE.hasilTutupShift = null;
        $('#tiraiTutupShift').classList.remove('tampil');
        gambarKeadaanShift();
        Admin.toast('Shift itu sudah tidak ada di server, jadi dilepas dari perangkat ini. '
                    + 'Silakan buka shift baru.', 'galat');
        return;
      }
      $('#tsHasil').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
    }
  });

  /* --- pengaturan --- */
  /* Menyambung printer Bluetooth bisa memakan belasan detik dan TIDAK lewat
     API sama sekali, jadi penanda otomatis tidak akan pernah mengenainya.
     Tanpa pemintal, tombol yang diam belasan detik ditekan lagi — dan tekanan
     kedua memunculkan dialog pemilihan perangkat kedua di atas yang pertama. */
  $('#btnHubungkanPrinter').addEventListener('click', async () => {
    const b = $('#btnHubungkanPrinter');
    b.classList.add('sibuk'); b.disabled = true;
    try { const n = await Struk.hubungkanBluetooth(); Admin.toast('Printer terhubung: ' + n); perbaruiInfoData(); }
    catch (e) { Admin.toast('Gagal menghubungkan printer: ' + e.message, 'galat'); }
    finally { b.classList.remove('sibuk'); b.disabled = false; }
  });
  /* Disimpan begitu diubah, tanpa tombol Simpan. Setelan ini dicari orang
     justru saat printernya sedang salah, dan tombol Simpan yang terlewat berarti
     mereka menyimpulkan sakelarnya tidak berpengaruh. */
  $('#setPrinterPotong')?.addEventListener('change', async (e) => {
    await DB.kvSet('printer_potong', !!e.target.checked);
    Admin.toast(e.target.checked ? 'Struk akan dipotong otomatis.'
                                 : 'Perintah potong dimatikan untuk perangkat ini.', 'sukses');
  });
  $('#setPrinterUmpan')?.addEventListener('change', async (e) => {
    /* Dijepit 0..6 DI SINI juga, bukan hanya di atribut min/max: `type=number`
       tidak menghalangi angka yang diketik langsung, dan 400 baris kosong per
       struk menghabiskan segulung kertas sebelum ada yang sempat menyadarinya. */
    const n = Math.max(0, Math.min(6, Math.round(Number(e.target.value) || 0)));
    e.target.value = n;
    await DB.kvSet('printer_umpan', n);
    Admin.toast(`Ujung struk: ${n} baris kosong.`, 'sukses');
  });
  $('#btnUjiLabel')?.addEventListener('click', async () => {
    /* Satu BARIS penuh, bukan satu label. Yang paling sering salah pada kertas
       3 line bukan isi labelnya melainkan penjajarannya antar kolom, dan itu
       hanya kelihatan kalau ketiganya dicetak sekaligus. */
    try {
      const u = await Label.ukuran();
      await Label.cetak([{ kode: 'UJI12345', nama: 'Uji cetak', lembar: u.kolom || 1 }]);
    } catch (e) { Admin.toast('Gagal uji cetak label: ' + e.message, 'galat'); }
  });
  const simpanUkuranLabel = async () => {
    const u = await Label.simpanUkuran({
      lebar_mm: Number($('#setLabelLebar').value),
      tinggi_mm: Number($('#setLabelTinggi').value),
      jarak_mm: Number($('#setLabelJarak').value),
      kolom: Number($('#setLabelKolom')?.value),
      huruf_kode_mm: Number($('#setLabelHurufKode')?.value),
      huruf_nama_mm: Number($('#setLabelHurufNama')?.value),
      tinggi_bar_mm: Number($('#setLabelTinggiBar')?.value)
    });
    await perbaruiInfoLabel();
    /* Angka yang dilaporkan dibaca dari HASIL penjepitan, bukan dari kolomnya.
       Kalau seseorang mengetik huruf 40mm, yang tersimpan 8mm — dan pesan yang
       mengulang "40" akan membuatnya mengira setelannya masuk. */
    Admin.toast(`Kertas label: ${u.lebar_mm} × ${u.tinggi_mm} mm, ${u.kolom} per baris. ` +
                `Huruf ${u.huruf_kode_mm}/${u.huruf_nama_mm} mm, barcode ` +
                (u.tinggi_bar_mm > 0 ? `${u.tinggi_bar_mm} mm.` : 'otomatis.'), 'sukses');
  };
  ['#setLabelLebar', '#setLabelTinggi', '#setLabelJarak', '#setLabelKolom',
   '#setLabelHurufKode', '#setLabelHurufNama', '#setLabelTinggiBar']
    .forEach(id => $(id)?.addEventListener('change', simpanUkuranLabel));

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
  $('#btnTarikMaster').addEventListener('click', () => tarikUlangMaster());
  $('#btnKirimSekarang').addEventListener('click', async () => { await Sync.kirim(); await perbaruiInfoData(); });
  $('#btnKeSettingStruk').addEventListener('click', () => bukaLayar('sistem'));

  /* Master baru turun — dari tombol "Tarik ulang", dari sinkron berkala, atau
     setelah petugas disimpan di back office. Tanpa penyegaran ini, nama yang baru
     ditambahkan tidak muncul di layar kasir sampai aplikasinya dimuat ulang. */
  document.addEventListener('master:diperbarui', async () => {
    /* Setting ikut disegarkan, bukan cuma daftar petugas.
       Sebelumnya APP_STATE.setting hanya ditulis saat login, jadi bobot peran
       yang baru disimpan MEMANTUL kembali ke angka lama di layar admin — dan yang
       lebih berbahaya, pratinjau poin di dialog Tim memakai bobot lama sepanjang
       sesi sementara server mencatat bobot baru. Dua angka yang bertentangan,
       persis yang dijanjikan tidak mungkin terjadi. */
    try {
      APP_STATE.setting = await DB.kvGet('setting', {});
      bacaSettingKeState();
      APP_STATE.daftarPetugas = await DB.all('petugas');
    } catch (e) { return; }
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
  /* Tidak ada tombol Tampilkan (v1.156): dropdown periode, kedua kolom tanggal
     kustom, dan penyaring cabang masing-masing memuat sendiri. */
  $('#lapPeriode').addEventListener('change', e => terapkanPeriodeLaporan(e.target.value));
  ['#lapDari', '#lapSampai'].forEach(id => $(id).addEventListener('change', () => {
    if ($('#lapPeriode').value === 'kustom') tampilkanLaporan();
  }));
  /* Cetak: dialog pilih bagian, lalu dokumen A4 di jendela sendiri — bukan
     pencetakan peramban atas halaman aplikasi. Lihat "CETAK LAPORAN: DOKUMEN A4". */
  $('#btnCetakLaporan').addEventListener('click', bukaDialogCetakLaporan);
  document.addEventListener('click', e => {
    if (e.target.closest('#btnCetakLaporanJalan')) jalankanCetakLaporan();
  });

  /* Tab laporan. Datanya ditarik di `gambarTabLaporan`, sekali per tab per
     rentang — lihat komentar di sana. */
  $('#tabLaporan').addEventListener('click', e => {
    const t = e.target.closest('[data-tab-lap]');
    if (t) gambarTabLaporan(t.dataset.tabLap);
  });

  /* Penyaring di dalam tab riwayat: delegasi, karena isinya digambar ulang
     terus-menerus. */
  document.addEventListener('input', e => {
    if (['lapNotaCari', 'lapNotaShift', 'lapNotaKasir'].includes(e.target.id)) {
      const d = LAP.data[LAP.tab];
      if (d) gambarLapNotaTabel(d);
    }
  });
  $('#btnLabaRugi').addEventListener('click', tampilkanLabaRugi);
  $('#btnNeraca').addEventListener('click', tampilkanNeraca);
  $('#btnUji').addEventListener('click', tampilkanUji);
  $('#btnTutupBuku').addEventListener('click', async () => {
    const periode = $('#keuPeriode').value;
    if (!(await Admin.tanya(`Kunci periode ${periode}?`,
          '<p class="petunjuk">Setelah dikunci, tidak ada transaksi baru yang bisa masuk'
          + ' ke periode itu — koreksi harus lewat periode berjalan.</p>',
          { ya: 'Kunci periode', jenis: 'bahaya' }))) return;
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
    await cetakUlangNota(uuid, false);
  });
  $('#hasilNotaLama').addEventListener('click', async e => {
    const uuid = e.target.dataset?.cetak; if (!uuid) return;
    await cetakUlangNota(uuid, e.target.dataset.luarShift === '1');
  });
  $('#btnMuatShift').addEventListener('click', () => muatDaftarShift());
  $('#isiRiwayatShift').addEventListener('click', e => {
    const id = e.target.dataset?.lapshift;
    if (id) bukaLaporanShift(id);
  });
  document.addEventListener('click', e => {
    if (e.target.dataset?.tutupLapshift) $('#tiraiLapShift').classList.remove('tampil');
  });
  $('#btnCariNotaRiwayat').addEventListener('click', () => cariNotaLama());
  $('#cariNotaRiwayat').addEventListener('keydown', e => {
    if (e.key === 'Enter') cariNotaLama();
  });

  /* --- status sinkronisasi --- */
  document.addEventListener('sync:status', e => {
    const s = e.detail;
    const el = $('#lncSync');
    const umur = Number(s.umur_jam) || 0;
    let judulBasi = '';
    if (!API.online)          { el.textContent = 'Offline'; el.className = 'lencana merah'; }
    else if (s.mengirim)      { el.textContent = 'Mengirim…'; el.className = 'lencana kuning'; }
    /* Sinkronisasi yang DITOLAK server, bukan yang sedang menunggu jaringan.
       `status.galat` sudah ditulis sejak lama dan tidak pernah sekali pun
       dibaca — saya sisir seluruh web/js. Nilai yang tidak pernah dibaca bukan
       penanganan galat, cuma catatan untuk diri sendiri. Akibatnya antrean yang
       macet permanen (peran kasir kehilangan izin `penjualan · buat`, misalnya)
       tampil KUNING "8 menunggu" — rupanya sama persis dengan antrean sehat.
       sync.js sengaja mengosongkan galat untuk gangguan jaringan, jadi cabang
       ini hanya menyala untuk sebab yang tidak akan sembuh sendiri. */
    else if (s.galat)         { el.textContent = s.tertahan > 0 ? '⚠ ' + s.tertahan + ' gagal terkirim'
                                                                : '⚠ Gagal sinkron';
                                el.className = 'lencana merah'; }
    /* DATA MASTER BASI. `CONFIG.PERINGATAN_UMUR_JAM` ada sejak lama dan sampai
       v1.63 tidak pernah dibaca satu berkas pun — tetapan yang tidak pernah
       dibaca bukan pengaturan, cuma angka di dalam berkas.

       Yang diperingatkan bukan "kamu offline" (itu sudah punya lencananya
       sendiri, dan kasir tahu) melainkan HARGA YANG DIPAKAI SUDAH LAMA. Perangkat
       yang seminggu tidak menarik master berjualan dengan harga seminggu lalu,
       dan pada aplikasi yang memang dirancang tetap jalan saat internet mati,
       keadaan itu bukan pengecualian melainkan rancangan. */
    else if (umur >= CONFIG.PERINGATAN_UMUR_JAM) {
      const hari = umur / 24;
      el.textContent = '⚠ Harga ' + (hari >= 1 ? Math.floor(hari) + ' hari' :
                                     Math.floor(umur) + ' jam') + ' lalu';
      el.className = 'lencana kuning';
      judulBasi = 'Data master terakhir ditarik ' + umur.toFixed(1) +
                  ' jam lalu. Sambungkan internet supaya harga dan produk ikut segar.';
    }
    else if (s.tertahan > 0)  { el.textContent = s.tertahan + ' menunggu'; el.className = 'lencana kuning'; }
    else                      { el.textContent = 'Tersinkron'; el.className = 'lencana hijau'; }
    if (s.tertahan >= CONFIG.PERINGATAN_OUTBOX) {
      el.textContent = '⚠ ' + s.tertahan + ' tertahan'; el.className = 'lencana merah';
    }
    /* Nota yang tertahan karena MILIK CABANG LAIN — dibuat di SK01, lalu
       perangkatnya login ke SK02. Sejak v1.114.0 nota membawa cabangnya sendiri
       dan tidak lagi ikut terkirim ke cabang yang sedang aktif; konsekuensinya
       ia menunggu, dan menunggu tanpa diberitahu sama saja dengan hilang.
       Menang atas "N menunggu" yang kuning: yang ini tidak sembuh dengan
       menunggu jaringan, ia butuh orang yang login ke cabang itu. */
    const asingCabang = Object.keys(s.tertahan_cabang || {});
    let judulAsing = '';
    if (asingCabang.length) {
      const n = asingCabang.reduce((a, k) => a + s.tertahan_cabang[k], 0);
      el.textContent = '⚠ ' + n + ' nota cabang ' + asingCabang.join(', ');
      el.className = 'lencana merah';
      judulAsing = n + ' nota dibuat di cabang ' + asingCabang.join(', ') +
                   ' dan belum terkirim. Notanya aman di perangkat ini; login ke ' +
                   'cabang itu supaya terkirim ke pembukuan yang benar.';
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
      /* Alasannya, bukan cuma warnanya. Lencana merah tanpa keterangan hanya
         bisa dilaporkan sebagai "lencananya merah" — dan itu tidak cukup untuk
         menebak bahwa yang hilang adalah satu centang izin di layar Peran. */
      if (judulAsing) el.title = judulAsing;
      else if (s.galat) el.title = s.galat;
      /* `removeAttribute('title')` di atas ikut menghapus keterangan harga basi,
         jadi peringatannya harus dipasang ulang di sini — kalau tidak, lencana
         kuning itu muncul tanpa penjelasan apa pun saat ditunjuk. */
      else if (judulBasi) el.title = judulBasi;
    }
  });
  $('#lncSync').addEventListener('click', () => { if (Sync.status.ditolak > 0) tampilkanDitolak(); });
  $('#lncSync').addEventListener('keydown', e => {
    if (Sync.status.ditolak > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tampilkanDitolak(); }
  });
  document.addEventListener('koneksi:berubah', () => document.dispatchEvent(
    new CustomEvent('sync:status', { detail: Sync.status })));
  document.addEventListener('sesi:berakhir', async () => {
    /* Tokennya HARUS dihapus sebelum reload. Tanpa itu `mulai()` memulihkan token
       yang sudah mati, aplikasi terbuka kembali dengan sesi hantu — dan sejak
       tombol Keluar dijaga shift, kasir terkurung: tidak bisa keluar, dan tidak
       bisa menutup shift karena setiap panggilan server ditolak.

       Shift yang menggantung tetap dicatat, dengan alasan yang sama seperti
       keluar-paksa saat offline: pertanggungjawaban lacinya tidak boleh lenyap
       hanya karena sesinya kedaluwarsa. */
    try { if (APP_STATE.idShift) await antrikanKeluarPaksa({ sebab: 'SESI_BERAKHIR' }); }
    catch (e) { console.warn('Catatan shift menggantung gagal disimpan:', e.message); }
    // Kosong dengan sengaja: sesinya sudah mati di server, jadi token yang
    // gagal dibuang tidak membuka apa pun — dan muat ulang di bawah tetap
    // harus terjadi.
    try { await DB.kvSet('token', null); } catch (e) {}
    /* DITUNGGU, bukan toast. Baris sesudahnya memuat ulang halaman: kabar yang
       cuma lewat tiga detik tidak akan pernah terbaca, dan orangnya kembali ke
       layar masuk tanpa tahu kenapa. */
    await Admin.tanya('Sesi berakhir',
      '<p class="petunjuk">Silakan masuk lagi. Nota yang belum terkirim tetap aman di perangkat ini.</p>',
      { ya: 'Masuk lagi', tanpaBatal: true });
    location.reload();
  });
  document.addEventListener('stok:diperbarui', () => gambarProduk($('#inpCari').value));
  document.addEventListener('stok_cabang:diperbarui', () => gambarProduk($('#inpCari').value));

  /* --- pintasan keyboard (kasir PC bisa bekerja tanpa mouse) --- */
  document.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); $('#inpCari').focus(); $('#inpCari').select(); }
    if (e.key === 'F12') { e.preventDefault(); bukaBayar(); }
    if (e.key === 'F9' && $('#layarKasir').classList.contains('aktif')) { e.preventDefault(); $('#btnTahan').click(); }
    if (e.key === 'Escape') $$('.tirai').forEach(t => t.classList.remove('tampil'));
    if (e.key === 'Enter' && $('#tiraiBayar').classList.contains('tampil')
        && !$('#btnSelesaikan').disabled && e.target.tagName !== 'SELECT') {
      e.preventDefault(); selesaikanTransaksi();
    }
  });
}

/* ==================== VERSI BARU ====================
 * sw.js memakai skipWaiting + clients.claim, jadi SW baru mengambil alih pada
 * muat pertama sesudah terbit — tapi halaman yang SEDANG terbuka sudah
 * terlanjur menjalankan JS/CSS lama dari cache lama. Yang baru dipakai pada
 * muat ulang berikutnya. Dibuktikan 10 Sep 2026 di peramban pemilik: muat
 * pertama CONFIG.VERSI 1.149.0 dengan cache bernama possk-v1.153.0; muat kedua
 * baru 1.153.0. Tiga laporan "masih nyangkut" berturut-turut lahir dari sini:
 * perbaikannya sudah terbit, yang diuji build sebelumnya.
 *
 * TIDAK memuat ulang sendiri. Kasir yang sedang mengetik nota tidak boleh
 * kehilangan keranjangnya karena toko menerbitkan versi baru. Spanduk + tombol,
 * dan tombolnya bertanya dulu kalau keranjang berisi.
 */
function pantauVersiBaru() {
  if (!('serviceWorker' in navigator)) return;
  /* Dicatat SEBELUM register(): ada pengendali berarti ini bukan kunjungan
     pertama, jadi `controllerchange` berikutnya adalah PEMBARUAN. Pada kunjungan
     pertama controllerchange juga berbunyi (clients.claim), dan spanduk
     "versi baru" pada kunjungan pertama adalah kebohongan. */
  const adaPengendali = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW gagal:', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (adaPengendali) tampilSpandukVersi();
  });
}

function tampilSpandukVersi() {
  const el = $('#spandukVersi');
  if (el) el.hidden = false;
}

async function muatUlangVersiBaru() {
  if (typeof Keranjang !== 'undefined' && !Keranjang.kosong) {
    const ya = await Admin.tanya('Keranjang masih berisi',
      '<p class="petunjuk">Memuat ulang akan mengosongkan keranjang yang sedang dikerjakan. Selesaikan notanya dulu, atau muat ulang sekarang.</p>',
      { ya: 'Muat ulang sekarang', batal: 'Selesaikan nota dulu' });
    if (!ya) return;
  }
  location.reload();
}

/* ==================== MULAI ==================== */
(async function mulai() {
  pantauVersiBaru();
  $('#btnMuatUlangVersi')?.addEventListener('click', muatUlangVersiBaru);
  $('#btnNantiVersi')?.addEventListener('click', () => { $('#spandukVersi').hidden = true; });
  await DB.buka();
  pasangEvent();
  Admin.pasang();

  const hariIni = tanggalLokal();
  $('#lapDari').value = hariIni;
  $('#lapSampai').value = hariIni;
  $('#keuPeriode').value = hariIni.substring(0, 7);

  pasangPenandaSibuk();
  pasangPenjagaRoda();
  pasangPengawasTabel();

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
