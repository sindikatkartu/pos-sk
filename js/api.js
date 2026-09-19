/**
 * POS SINDIKAT KARTU — api.js
 * LAPISAN ABSTRAKSI API (Prinsip P4 pada blueprint).
 *
 * Seluruh aplikasi HANYA berbicara ke objek API di file ini. Tidak ada satu pun
 * modul lain yang tahu bahwa backend-nya Google Apps Script. Kalau suatu hari
 * pindah ke Supabase/Postgres, cukup ganti isi fungsi `panggil()` di bawah —
 * sisa aplikasi tidak perlu disentuh sama sekali.
 */
const API = (() => {
  let _token = null;
  let _online = navigator.onLine;

  window.addEventListener('online',  () => { _online = true;  document.dispatchEvent(new Event('koneksi:berubah')); });
  window.addEventListener('offline', () => { _online = false; document.dispatchEvent(new Event('koneksi:berubah')); });

  /**
   * Pemanggilan mentah ke backend.
   * Content-Type sengaja text/plain agar browser TIDAK melakukan preflight OPTIONS
   * (Apps Script tidak menjawab OPTIONS, jadi preflight akan selalu gagal).
   */
  /**
   * Berapa permintaan yang sedang berjalan. Dihitung DI SINI, bukan di tiap
   * pemanggil, karena ini satu-satunya pintu keluar aplikasi — dengan begitu
   * setiap permintaan otomatis ikut terhitung, termasuk yang ditulis nanti.
   */
  let _sibuk = 0;
  /**
   * Berapa permintaan yang lahir dari TINDAKAN ORANG — bukan dari timer.
   *
   * Dihitung terpisah karena keduanya menuntut perlakuan yang berlawanan.
   * `_sibuk` menyalakan garis muat di puncak layar, dan garis itu memang harus
   * ikut menyala untuk sinkronisasi latar: pemakainya berhak tahu ada yang
   * sedang berjalan. Tapi KUNCI layar tidak boleh mengikutinya —
   * `tarikMaster` jalan tiap 5 menit dan `tarikStokSemuaCabang` tiap 10 menit,
   * jadi layar akan mengunci dirinya sendiri secara berkala tanpa ada yang
   * menekan apa pun. Yang melihatnya menyimpulkan aplikasinya rusak, dan dia
   * benar.
   *
   * Bawaannya "dari orang". Yang latar sedikit dan namanya diketahui
   * (`sync.js`), sedangkan endpoint yang ditulis nanti hampir pasti lahir dari
   * tombol — jadi yang harus diingat penulisnya adalah pengecualiannya, bukan
   * kelazimannya.
   */
  let _sibukOrang = 0;

  /**
   * JEJAK WAKTU per aksi — bahan diagnosa, bukan hiasan.
   *
   * Dilaporkan pemilik 7 Sep 2026: layar Stok/Produk/Laporan "lebih dari 8
   * detik, kadang gagal". Angka itu sendiri tidak bisa dipakai memperbaiki apa
   * pun, karena ia menggabungkan dua hal yang obatnya BERTOLAK BELAKANG:
   * server yang berpikir lama (perbaiki kuerinya) dan perjalanan yang lama
   * (kurangi jumlah panggilan, gambar dari data lokal). Menebak salah satunya
   * berarti separuh kemungkinan mengerjakan yang sia-sia berhari-hari.
   *
   * Server melaporkan waktunya sendiri lewat `_ms` pada amplop jawaban (lihat
   * `_keluar` di 04_Api.gs); total dikurangi `_ms` adalah perjalanannya.
   *
   * Disimpan DI MEMORI saja, dan dibatasi. Menulisnya ke IndexedDB berarti satu
   * penulisan tambahan pada tiap permintaan — pengukur yang ikut memperlambat
   * apa yang diukurnya. Konsekuensinya jujur: jejaknya hilang saat halaman
   * dimuat ulang, dan itu memang cukup untuk membuka satu layar lalu melihat
   * angkanya.
   */
  const _JEJAK_MAKS = 200;
  const _jejak = [];

  function _catatWaktu(aksi, total, server, galat, ulang) {
    _jejak.push({ aksi, total: Math.round(total),
                  server: server === null || server === undefined ? null : Math.round(server),
                  galat: galat || null, ulang: ulang || 0, waktu: Date.now() });
    if (_jejak.length > _JEJAK_MAKS) _jejak.shift();
  }

  /** Ringkasan per aksi: jumlah, tengah, terburuk — total maupun sisi server. */
  function ringkasanWaktu() {
    const per = {};
    _jejak.forEach(j => {
      const a = per[j.aksi] || (per[j.aksi] = { aksi: j.aksi, n: 0, galat: 0, ulang: 0, total: [], server: [] });
      a.n++;
      if (j.galat) a.galat++;
      a.ulang += j.ulang || 0;
      a.total.push(j.total);
      if (j.server !== null) a.server.push(j.server);
    });
    /* TENGAH, bukan rata-rata: satu permintaan 30 detik yang kena batas waktu
       akan menarik rata-rata sepuluh permintaan sehat ke angka yang tidak
       pernah dialami siapa pun. */
    const tengah = (arr) => {
      if (!arr.length) return null;
      const u = arr.slice().sort((x, y) => x - y);
      return u[Math.floor(u.length / 2)];
    };
    return Object.values(per).map(a => ({
      aksi: a.aksi, n: a.n, galat: a.galat, ulang: a.ulang,
      total: tengah(a.total), server: tengah(a.server),
      /* Perjalanan dihitung dari TENGAH masing-masing, bukan tengah selisihnya.
         Cukup untuk memutuskan sisi mana yang dikerjakan, dan tidak berpura-pura
         lebih teliti daripada itu. */
      jalan: tengah(a.total) === null || tengah(a.server) === null
        ? null : Math.max(0, tengah(a.total) - tengah(a.server)),
      terburuk: Math.max.apply(null, a.total)
    })).sort((x, y) => y.terburuk - x.terburuk);
  }
  const _kabar = () => document.dispatchEvent(
    new CustomEvent('api:sibuk', { detail: { jumlah: _sibuk, orang: _sibukOrang } }));

  /**
   * JAWABAN YANG HILANG DI JALUR GOOGLE — dan mengapa diulang DI SINI.
   *
   * Diukur 13 Sep 2026 (KONTEKS §164). Satu POST ke /exec dijawab Google
   * dengan 302 ke script.googleusercontent.com/macros/echo; hop kedua itulah
   * yang sesekali menjawab 404 atau baru menjawab sesudah 7–69 detik, PADAHAL
   * skripnya sudah selesai (dasbor eksekusi mencatat SELESAI 1 detik pada
   * jam yang sama). Dari sesi Owner pukul 12.00, 6 dari 8 panggilan pembuka
   * gagal "HTTP 404" dalam 18–36 detik. Kodenya tidak salah; jawabannya yang
   * tidak sampai — dan layar yang menyerah pada 404 pertama membuat seluruh
   * aplikasi tampak mati padahal servernya sehat.
   *
   * Pengulangannya di sini, satu pintu yang dilalui SETIAP permintaan — bukan
   * di delapan puluh pemanggil. Yang diulang hanya aksi yang AMAN diulang:
   * pembacaan, dan tulisan yang servernya menjaga duplikat per uuid (kiriman
   * ulang dijawab "duplikat: true", tidak ditulis dua kali). "kirim_penjualan"
   * sengaja TIDAK di daftar: ia sudah dibungkus ulang() di bawah, dan dua lapis
   * berarti sembilan percobaan.
   *
   * Tulisan tanpa penjaga (buka/tutup shift, void, tutup buku, terima transfer,
   * proses permintaan, akun & peran) TIDAK diulang: jawaban yang hilang bukan
   * bukti datanya tidak masuk. Untuk itu pesannya menyebut kemungkinan itu,
   * supaya orang memeriksa dulu sebelum menekan lagi (5 Sep 2026: pembelian
   * 101 baris masuk dua kali karena "gagal" dipercaya begitu saja).
   *
   * Setiap nama di sini harus ada rutenya di 04_Api.gs — dijaga uji.js.
   */
  const AMAN_DIULANG = new Set([
    /* pembacaan */
    'ping', 'tarik_master', 'shift_aktif', 'daftar_shift', 'laporan_shift',
    'stok_terkini', 'kartu_stok', 'daftar_kas', 'laporan_penjualan', 'laporan_nota',
    'laporan_diskon', 'laba_rugi', 'neraca', 'uji_kebenaran', 'ringkasan_dashboard',
    'daftar_produk', 'produk_satu', 'lencana_nav', 'produk_terjual', 'daftar_pelanggan',
    'daftar_supplier', 'daftar_user', 'daftar_peran', 'daftar_cabang_admin',
    'daftar_setting', 'daftar_piutang', 'daftar_utang', 'log_audit', 'daftar_pembelian',
    'rincian_pembelian', 'daftar_petugas', 'laporan_poin', 'daftar_transfer',
    'stok_semua_cabang', 'cek_stok_terkini', 'daftar_permintaan', 'daftar_retur_beli',
    'cari_pembelian', 'data_grafik', 'ukuran_berkas', 'daftar_opname', 'detail_opname',
    'filter_opname', 'daftar_retur', 'cari_nota', 'daftar_perangkat', 'baca_berkas_impor',
    'daftar_minta_void', 'ubah_perangkat', 'daftar_lini', 'pratinjau_pulsa', 'keadaan_pulsa',
    'keadaan_pulsa_pos', 'daftar_sumber_pulsa', 'shift_pulsa_aktif', 'daftar_shift_pulsa',
    'rincian_shift_pulsa', 'ringkasan_konsolidasi', 'accurate_periode',
    /* tulisan yang servernya menjaga duplikat per uuid */
    'simpan_kas', 'simpan_pembelian', 'kirim_transfer', 'buat_permintaan',
    'buat_retur', 'buat_retur_beli', 'buat_opname', 'posting_opname',
    'bayar_piutang', 'bayar_utang',
    /* Pengajuan void dijaga uuid-nya sendiri di MASTER; keputusan yang sudah
       DISETUJUI dijawab "duplikat", tidak pernah membatalkan nota dua kali.
       Justru inilah aksi yang paling perlu diulang otomatis: 404 di tengah
       persetujuan meninggalkan admin menebak apakah notanya jadi batal. */
    'ajukan_void', 'putus_minta_void', 'tarik_minta_void'
  ]);
  /* Endpoint yang SENGAJA tidak diulang otomatis — seluruhnya MENULIS, dan
     ditetapkan dengan membaca badan fungsinya, bukan menebak dari namanya
     (19 Sep 2026; enam di antaranya menulis lewat fungsi lain — _siapVoid,
     cabutSesi, audit — jadi penyapu penanda sederhana melewatkannya).

     Daftar ini ada bukan untuk dibaca manusia, melainkan supaya endpoint BARU
     tidak bisa lolos tanpa keputusan: uji statis menuntut setiap `case` di
     04_Api.gs muncul di salah satu dari dua daftar ini. Yang tidak terdaftar
     berarti BELUM DIPUTUSKAN, bukan berarti aman — dan sebelum penjaga ini ada,
     sebuah endpoint baca yang lupa didaftarkan akan melempar galat ke layar
     tiap kali Google menjawab 404 sesaat. */
  const TIDAK_DIULANG = new Set([
    'batal_opname', 'batal_pembelian', 'batal_permintaan', 'batal_transfer',
    'buka_shift', 'buka_shift_pulsa', 'catat_cetak_ulang',
    'catat_keluar_paksa', 'ekspor', 'ganti_cabang', 'ganti_pin',
    'hapus_perangkat', 'impor_master', 'impor_produk', 'kirim_penjualan',
    'logout', 'nonaktifkan_produk', 'otorisasi_diskon', 'proses_permintaan',
    'reset_pin_user', 'rotasi_arsip', 'selesai_hitung', 'setujui_perangkat',
    'setup_pulsa', 'siapkan_pulsa_pos', 'simpan_cabang', 'simpan_hitungan',
    'simpan_lini', 'simpan_pelanggan', 'simpan_peran', 'simpan_petugas',
    'simpan_produk', 'simpan_produk_lengkap', 'simpan_setting',
    'simpan_sumber_pulsa', 'simpan_supplier', 'simpan_user', 'tambah_cabang',
    'tandai_butuh_pasang', 'template_impor', 'terima_transfer', 'tutup_buku',
    'tutup_shift', 'tutup_shift_pulsa', 'unggah_accurate', 'unggah_foto_pulsa',
    'void_penjualan'
  ]);

  /* Status yang lahir dari JALUR, bukan dari kode: 404 (echo Google hilang),
     408/429 (antre), 5xx (pintu depan). 400/401/403 bukan — itu jawaban tentang
     permintaannya, dan mengulanginya cuma mengulangi penolakannya. */
  const STATUS_SEMENTARA = new Set([404, 408, 429, 500, 502, 503, 504]);
  /* Dua ulangan, jeda menaik. Yang ketiga kalinya masih gagal berarti Google
     sedang tidak bisa dipakai, dan menunggu lebih lama hanya menahan layar. */
  const JEDA_ULANG_MS = [1500, 4000];
  const _tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  /* TIMEOUT ikut: hop yang lambat 30–69 detik memutus sambungan sementara
     servernya selesai — untuk aksi yang aman diulang, mengulanginya benar. */
  function _sementara(e) {
    if (e.kode === 'HTTP') return STATUS_SEMENTARA.has(e.status);
    return e.kode === 'SERVER_HTML' || e.kode === 'JARINGAN' || e.kode === 'TIMEOUT';
  }

  /* ---------- Permintaan yang tertahan saat tabnya dibekukan ---------- */

  /**
   * BATAS WAKTU YANG TIDAK IKUT MATI BERSAMA TABNYA.
   *
   * `_sekali()` menjaga dirinya dengan `setTimeout(… ctrl.abort())`. Itu cukup
   * selama halamannya hidup, dan tidak cukup sama sekali begitu Chrome
   * MEMBEKUKAN tabnya: tab beku tidak menjalankan apa pun. Timernya tidak
   * berdetak, callback fetch-nya tidak diproses, dan `finally` tidak pernah
   * sampai — jadi `_sibuk` tertinggal di atas nol dan layarnya terkunci
   * "sedang memuat" padahal tidak ada satu pun yang sedang berjalan.
   *
   * Terjadi 18 Sep 2026 pada `setup_pulsa`, di laptop: diukur 196 detik masih
   * menunggu, batas 60 detiknya TIDAK menggigit, dan dasbor eksekusi Apps
   * Script tidak mencatat satu pun doPost pada jam itu — permintaannya bahkan
   * belum sempat berangkat. Empat gejala, satu sebab (KONTEKS bagian 185).
   *
   * Yang bisa diperbuat BUKAN menggigit selama beku — tidak ada kode kita yang
   * jalan di sana — melainkan menggigit begitu tabnya BANGUN. Karena itu
   * ukurannya JAM DINDING, bukan timer: jam dinding tetap maju selama tabnya
   * tidur, timer tidak. Penjaga yang bersandar pada timer untuk menjaga dari
   * matinya timer tidak menjaga apa-apa.
   *
   * Dipasang di sini, satu pintu yang dilalui SETIAP permintaan — bukan di
   * delapan puluh pemanggil.
   */
  const _tertahan = new Set();
/* Sekali saja per pemuatan halaman. Dipasang waktu jawaban PERTAMA tiba —
   berhasil atau gagal — karena yang menandakan susulanRilis sudah lewat
   adalah servernya sempat menjawab, bukan jawabannya bagus. */
let _pernahJawab = false;

  function _periksaTertahan() {
    const kini = Date.now();
    _tertahan.forEach((p) => {
      /* `signal.aborted` yang dibaca, bukan bendera sendiri: satu keadaan
         lebih sedikit, dan yang dibaca persis yang menentukan. */
      if (p.ctrl.signal.aborted) return;
      if (kini - p.mulai < p.batas) return;
      p.ctrl.abort();
    });
  }

  /* Hanya saat tabnya TERLIHAT lagi. Yang masih tersembunyi dibiarkan
     berjalan: tab latar yang sehat memang harus boleh menyelesaikan
     sinkronisasinya, dan membatalkannya di sana berarti sinkronisasi berkala
     mati setiap kali orang berpindah tab. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _periksaTertahan();
  });

  /**
   * SATU percobaan: kirim, tunggu, urai. Melempar galat berkode dan tidak
   * menghitung apa pun — penghitung dan jejak milik panggil(), supaya tiga
   * percobaan tetap terbaca sebagai SATU permintaan di layar dan di jejak.
   */
  async function _sekali(aksi, data, opsi) {
    const ctrl = new AbortController();
    /* Panggilan PERTAMA sesudah halaman dimuat menanggung susulanRilis(), yang
       memigrasikan skema sekali per versi. Terukur 44,7 detik — di atas batas
       bawaan 30 detik, jadi orang pertama yang membuka POS sesudah rilis melihat
       "tidak ada jawaban" padahal servernya sedang bekerja, lalu mengulang dan
       membuatnya bekerja dua kali.

       Yang dilonggarkan HANYA nilai BAWAANNYA, dan hanya untuk panggilan pertama.
       Dua batas yang sengaja TIDAK disentuh:

       - batas yang diminta pemanggil. Percobaan pertama memakai Math.max dan
         menimpanya; uji-tertahan langsung merah enam kali, karena pemanggil yang
         meminta satu detik memang bermaksud satu detik. Penjaga yang membatalkan
         niat pemanggilnya lebih berbahaya daripada tidak ada.
       - seluruh panggilan sesudah yang pertama. Batas longgar untuk semuanya
         berarti kasir menunggu dua menit sebelum tahu jaringannya mati — obat
         yang lebih buruk dari penyakitnya. */
    const batas = opsi.timeout || (_pernahJawab ? 30000 : 120000);
    const timer = setTimeout(() => ctrl.abort(), batas);
    /* Didaftarkan supaya `_periksaTertahan()` masih bisa menemukannya kalau
       timer di atas ikut mati bersama tabnya. Dicabut lagi di `finally`. */
    const pantau = { ctrl, mulai: Date.now(), batas };
    _tertahan.add(pantau);
    try {
      const resp = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ aksi, token: _token, data }),
        signal: ctrl.signal,
        redirect: 'follow'
      });
      /* Servernya SEMPAT menjawab, jadi susulanRilis sudah lewat. Dipasang
         SEBELUM status diperiksa: 404 pun membuktikan pintunya menjawab, dan
         yang ditunggu batas 120 detik itu bukan jawaban yang bagus melainkan
         jawaban yang sampai. */
      _pernahJawab = true;
      if (!resp.ok) throw Object.assign(new Error('HTTP ' + resp.status), { kode: 'HTTP', status: resp.status });

      /* Apps Script bisa menjawab HALAMAN HTML dengan status 200.
         ------------------------------------------------------------------
         Terjadi tepat sesudah deploy ulang, saat kuota eksekusi habis, atau saat
         izin skripnya perlu disetujui ulang. Sampai v1.62 `resp.json()` dibiarkan
         melempar apa adanya, dan yang sampai ke kasir adalah

             Unexpected token '<', "<!DOCTYPE "... is not valid JSON

         Itu pesan pengurai JSON, bukan keterangan tentang apa yang terjadi. Yang
         membacanya di lantai toko tidak punya satu pun petunjuk bahwa ini
         keadaan sementara yang akan pulih sendiri — jadi ia menganggap
         aplikasinya rusak, dan berhenti. */
      let j;
      try {
        j = await resp.json();
      } catch (x) {
        throw Object.assign(
          new Error('Server menjawab halaman, bukan data. Biasanya sementara — ' +
                    'terjadi sesaat setelah pembaruan atau saat kuota Apps Script ' +
                    'penuh. Tunggu sebentar lalu coba lagi.'),
          { kode: 'SERVER_HTML' });
      }
      if (!j || !j.ok) {
        if (!j) throw Object.assign(new Error('Server menjawab kosong.'), { kode: 'SERVER_HTML' });
        const e = new Error(j.pesan || 'Permintaan gagal');
        e.kode = j.kode; e.detail = j.detail;
        throw e;
      }
      return j;
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('Server tidak menjawab'), { kode: 'TIMEOUT' });
      if (e.message === 'Failed to fetch') throw Object.assign(new Error('Tidak dapat menghubungi server'), { kode: 'JARINGAN' });
      throw e;
    } finally {
      clearTimeout(timer);
      _tertahan.delete(pantau);
    }
  }

  async function panggil(aksi, data = {}, opsi = {}) {
    if (!_online && !opsi.paksa) {
      throw Object.assign(new Error('Sedang offline'), { kode: 'OFFLINE' });
    }
    const latar = opsi.latar === true;
    _sibuk++; if (!latar) _sibukOrang++; _kabar();
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let _msServer = null, _galat = null, _ulang = 0;
    try {
      const bolehUlang = opsi.ulang !== false && AMAN_DIULANG.has(aksi);
      const jeda = (typeof CONFIG !== 'undefined' && CONFIG.JEDA_ULANG_MS) || JEDA_ULANG_MS;
      for (let ke = 0; ; ke++) {
        try {
          const j = await _sekali(aksi, data, opsi);
          _msServer = typeof j._ms === 'number' ? j._ms : null;
          return j.data;
        } catch (e) {
          if (bolehUlang && ke < jeda.length && _sementara(e)) {
            _ulang++;
            await _tunggu(jeda[ke]);
            continue;
          }
          /* Tulisan tanpa penjaga yang jawabannya hilang: jangan menyuruh
             "coba lagi" — suruh MEMERIKSA. Kode galatnya tetap, hanya pesannya. */
          /* TIMEOUT ikut di sini sejak v1.200: batas waktu yang menggigit
             SESUDAH tabnya bangun tidak tahu apa-apa soal nasib permintaannya
             — ia bisa saja sudah sampai dan sudah ditulis. "Coba lagi" untuk
             tulisan tanpa penjaga persis kalimat yang melahirkan pembelian
             101 baris dua kali (5 Sep 2026). */
          if (!bolehUlang && (e.kode === 'SERVER_HTML' || e.kode === 'TIMEOUT' ||
                              (e.kode === 'HTTP' && STATUS_SEMENTARA.has(e.status)))) {
            e.message = 'Jawaban server hilang di jalan (' +
              (e.kode === 'HTTP' ? 'HTTP ' + e.status :
               e.kode === 'TIMEOUT' ? 'tidak ada jawaban sampai batas waktu' :
               'halaman, bukan data') +
              '). Datanya mungkin sudah masuk — periksa dulu sebelum mengulang.';
          }
          throw e;
        }
      }
    } catch (e) {
      _galat = e.kode || 'GALAT';
      /* Sesi kedaluwarsa diumumkan DI SINI, dan hanya di sini.

         Sampai v1.56 pengumumnya ada di catch milik `kirim()` di sync.js — dan
         kirim() keluar lebih dulu kalau outboxnya kosong. Saat online outbox
         SELALU kosong, jadi tidak ada permintaan yang lahir di sana dan kode
         SESI tidak pernah terlihat siapa pun. Token 12 jam habis di tengah
         shift: membuka Riwayat/Shift/Laporan cuma memunculkan kotak merah di
         dalam layar, tombol Keluar ditolak ("tutup shift dulu"), dan Tutup shift
         gagal karena app.js hanya memulihkan NOTFOUND dan STATUS. Kasir
         terkurung, dan satu-satunya jalan keluar adalah memuat ulang halaman
         sendiri — yang tidak ada yang tahu harus dilakukan.

         `panggil()` adalah satu-satunya pintu yang dilalui SETIAP permintaan,
         termasuk yang ditulis nanti. Dijaga ketat pada kode SESI: menyiarkan
         untuk galat apa pun berarti gangguan jaringan sesaat melempar kasir
         keluar dari shift yang sedang berjalan — persis yang paling tidak boleh
         terjadi di aplikasi offline-first. Kode SESI hanya lahir dari gerbang
         token di _router (04_Api.gs); `login` tidak pernah melewatinya, jadi
         layar login tidak bisa menyiarkannya untuk dirinya sendiri. */
      if (e.kode === 'SESI') document.dispatchEvent(new Event('sesi:berakhir'));
      throw e;
    } finally {
      /* Dicatat di `finally`, jadi permintaan yang GAGAL ikut terukur. Justru
         yang gagal itulah yang paling perlu terlihat: "kadang gagal" adalah
         separuh dari keluhan yang sedang didiagnosa. */
      _catatWaktu(aksi, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0,
                  _msServer, _galat, _ulang);
      _sibuk--; if (!latar) _sibukOrang--; _kabar();
    }
  }

  /**
   * Hitung SELURUH operasi sebagai sibuk, bukan cuma lama permintaannya.
   *
   * `panggil()` berhenti menghitung begitu jawaban server tiba. Padahal sebagian
   * pekerjaan yang paling lama justru terjadi SESUDAH itu — menulis seluruh
   * katalog ke IndexedDB, atau menyusun ulang tabel ribuan baris. Selama fase itu
   * layar tampak diam tanpa sebab, dan orang menekan tombolnya lagi.
   *
   * Sama pentingnya untuk rantai beberapa permintaan berurutan: tanpa pembungkus
   * ini penghitungnya sempat menyentuh nol di antara dua permintaan, penandanya
   * padam, dan tombolnya terbuka kembali di tengah operasi yang belum selesai.
   *
   * Penurunannya di `finally` — kalau tidak, satu galat membuat aplikasi terkunci
   * "sibuk" selamanya, dan itu jauh lebih buruk daripada masalah yang diobati.
   */
  async function tugas(fn, opsi = {}) {
    const latar = opsi.latar === true;
    _sibuk++; if (!latar) _sibukOrang++; _kabar();
    try { return await fn(); }
    finally { _sibuk--; if (!latar) _sibukOrang--; _kabar(); }
  }

  /** Coba ulang dengan jeda menaik — dipakai sinkronisasi latar belakang. */
  async function ulang(fn, kali = 3) {
    let terakhir;
    for (let i = 0; i < kali; i++) {
      try { return await fn(); }
      catch (e) {
        terakhir = e;
        if (['SESI', 'IZIN', 'VALIDASI', 'AUTH'].includes(e.kode)) throw e; // percuma diulang
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
    throw terakhir;
  }

  return {
    get online() { return _online; },
    get sibuk()  { return _sibuk; },
    get sibukOrang() { return _sibukOrang; },
    setToken(t) { _token = t; },
    getToken()  { return _token; },
    tugas,

    /* Opsinya diteruskan supaya pemeriksa versi berkala bisa lewat sebagai
       LATAR. Tanpa itu penanda sibuk menyala dan layar mengunci tombolnya
       tiap lima menit tanpa ada yang menekan apa pun — lihat _sibukOrang. */
    ping:            (o)  => panggil('ping', {}, o || {}),
    login:           (d) => panggil('login', d),
    logout:          ()  => panggil('logout'),
    gantiCabang:     (d) => panggil('ganti_cabang', d),
    catatKeluarPaksa:(d) => panggil('catat_keluar_paksa', d),
    gantiPin:        (d) => panggil('ganti_pin', d),

    /* Empat endpoint di bawah dipakai DUA cara: dari tombol, dan dari timer
       sinkronisasi. Karena itu mereka meneruskan `o` — `sync.js` mengisinya
       `{ latar: true }` saat yang memanggil timer. Lihat _sibukOrang di atas. */
    tarikMaster:     (d, o) => panggil('tarik_master', d, { timeout: 60000, ...o }),
    simpanProduk:    (d) => panggil('simpan_produk', d),
    imporProduk:     (d) => panggil('impor_produk', d, { timeout: 120000 }),
    simpanPelanggan: (d) => panggil('simpan_pelanggan', d),

    bukaShift:       (d) => panggil('buka_shift', d),
    tutupShift:      (d) => panggil('tutup_shift', d),
    shiftAktif:      ()  => panggil('shift_aktif'),
    daftarShift:     (d) => panggil('daftar_shift', d),
    laporanShift:    (d) => panggil('laporan_shift', d, { timeout: 90000 }),
    catatCetakUlang: (d) => panggil('catat_cetak_ulang', d),

    kirimPenjualan:  (d, o) => ulang(() => panggil('kirim_penjualan', d, { timeout: 60000, ...o })),
    voidPenjualan:   (d) => panggil('void_penjualan', d),

    /* Pengajuan void: kasir mengajukan, admin memutuskan dari akunnya sendiri.
       `voidPenjualan` di atas tetap ada untuk yang memang berhak membatalkan
       langsung (Owner, Manajer, Kepala Cabang). */
    ajukanVoid:      (d) => panggil('ajukan_void', d),
    daftarMintaVoid: (d, o) => panggil('daftar_minta_void', d || {}, o || {}),
    putusMintaVoid:  (d) => panggil('putus_minta_void', d),
    tarikMintaVoid:  (d) => panggil('tarik_minta_void', d),

    stokTerkini:     (d, o) => panggil('stok_terkini', d, { timeout: 60000, ...o }),
    kartuStok:       (d) => panggil('kartu_stok', d),
    /* 120 detik, bukan 30 detik bawaan. Satu pembelian menulis dokumen + satu
       baris item + satu mutasi stok + satu lapisan FIFO PER BARIS, lalu jurnalnya.
       Nota 101 baris menembus 30 detik dengan mudah — dan yang terjadi waktu itu
       bukan gagal: peramban memutus sambungan sementara SERVERNYA SELESAI. Dari
       layar itu terbaca "gagal", orangnya menyimpan lagi, dan pembelian masuk dua
       kali (5 Sep 2026, nota 101 baris senilai Rp 2.743.000). Batas waktu yang
       terlalu pendek pada tulisan yang panjang bukan kehati-hatian; ia pabrik
       dokumen dobel. */
    simpanPembelian: (d) => panggil('simpan_pembelian', d, { timeout: 120000 }),
    batalPembelian:  (d) => panggil('batal_pembelian', d, { timeout: 90000 }),
    simpanKas:       (d) => panggil('simpan_kas', d),
    daftarKas:       (d) => panggil('daftar_kas', d),

    laporanPenjualan:(d) => panggil('laporan_penjualan', d, { timeout: 60000 }),
    /* Riwayat nota dibaca per rentang dan bisa ratusan baris; batas waktunya
       disamakan dengan laporan penjualan, bukan dengan panggilan kecil. */
    laporanNota:     (d) => panggil('laporan_nota', d, { timeout: 90000 }),
    laporanDiskon:   (d) => panggil('laporan_diskon', d, { timeout: 60000 }),
    otorisasiDiskon: (d) => panggil('otorisasi_diskon', d),
    labaRugi:        (d) => panggil('laba_rugi', d, { timeout: 60000 }),
    neraca:          (d) => panggil('neraca', d, { timeout: 60000 }),
    ujiKebenaran:    (d) => panggil('uji_kebenaran', d, { timeout: 90000 }),

    daftarPerangkat: ()  => panggil('daftar_perangkat'),
    setujuiPerangkat:(d) => panggil('setujui_perangkat', d),
    ubahPerangkat:   (d) => panggil('ubah_perangkat', d),
    hapusPerangkat:  (d) => panggil('hapus_perangkat', d),

    /* --- back office --- */
    /* `o` diteruskan supaya bagian BERAT bisa ditarik sebagai latar sesudah
       bagian inti tergambar — tanpa itu layar mengunci diri selama peringkat
       dan stok dihitung, padahal angkanya sudah bisa dibaca. */
    dashboard:         (d, o) => panggil('ringkasan_dashboard', d, Object.assign({ timeout: 90000 }, o || {})),
    daftarProduk:      (d) => panggil('daftar_produk', d, { timeout: 90000 }),
    produkSatu:        (d) => panggil('produk_satu', d),
    /* `opsi` diteruskan supaya penyegaran berkala bisa lewat sebagai LATAR.
       Tanpa itu lencana yang menyegar diri tiap beberapa menit menyalakan
       penanda sibuk dan mengunci layar tanpa ada yang menekan apa pun.
       Lihat _sibukOrang di atas. */
    lencanaNav:        (o) => panggil('lencana_nav', {}, o || {}),
    produkTerjual:     (d) => panggil('produk_terjual', d, { timeout: 90000 }),
    simpanProdukLengkap:(d)=> panggil('simpan_produk_lengkap', d),
    nonaktifkanProduk: (d) => panggil('nonaktifkan_produk', d),
    tandaiButuhPasang: (d) => panggil('tandai_butuh_pasang', d, { timeout: 90000 }),
    daftarPelanggan:   ()  => panggil('daftar_pelanggan', {}, { timeout: 60000 }),
    daftarSupplier:    ()  => panggil('daftar_supplier'),
    simpanSupplier:    (d) => panggil('simpan_supplier', d),
    daftarUser:        ()  => panggil('daftar_user'),
    simpanUser:        (d) => panggil('simpan_user', d),
    resetPinUser:      (d) => panggil('reset_pin_user', d, { timeout: 60000 }),
    daftarPeran:       ()  => panggil('daftar_peran'),
    simpanPeran:       (d) => panggil('simpan_peran', d),
    daftarCabangAdmin: ()  => panggil('daftar_cabang_admin'),
    daftarLini:        ()  => panggil('daftar_lini'),
    pratinjauPulsa:    (d) => panggil('pratinjau_pulsa', d, { timeout: 60000 }),
    keadaanPulsa:      ()  => panggil('keadaan_pulsa', {}, { timeout: 60000 }),
    setupPulsa:        (d) => panggil('setup_pulsa', d, { timeout: 60000 }),
    /* Pulsa di POS (bagian 187) — jangan tertukar dengan dua di atas, yang
       membaca spreadsheet aplikasi lama. `siapkanPulsaPos` membuat berkas
       baru di Drive, dan itu bisa memakan waktu sampai satu menit. */
    keadaanPulsaPos:   ()  => panggil('keadaan_pulsa_pos', {}, { timeout: 60000 }),
    siapkanPulsaPos:   ()  => panggil('siapkan_pulsa_pos', {}, { timeout: 120000 }),
    daftarSumberPulsa: ()  => panggil('daftar_sumber_pulsa', {}, { timeout: 60000 }),
    simpanSumberPulsa: (d) => panggil('simpan_sumber_pulsa', d, { timeout: 60000 }),
    shiftPulsaAktif:   (d) => panggil('shift_pulsa_aktif', d || {}, { timeout: 60000 }),
    bukaShiftPulsa:    (d) => panggil('buka_shift_pulsa', d, { timeout: 90000 }),
    tutupShiftPulsa:   (d) => panggil('tutup_shift_pulsa', d, { timeout: 90000 }),
    daftarShiftPulsa:  (d) => panggil('daftar_shift_pulsa', d || {}, { timeout: 60000 }),
    rincianShiftPulsa: (d) => panggil('rincian_shift_pulsa', d, { timeout: 60000 }),
    ringkasanKonsolidasi: (d) => panggil('ringkasan_konsolidasi', d || {}, { timeout: 90000 }),
    /* Berkas xlsx dikirim base64; batas waktunya panjang karena penguraiannya
       terjadi di server dan jaringan toko tidak selalu kencang. */
    unggahAccurate:    (d) => panggil('unggah_accurate', d, { timeout: 120000 }),
    accuratePeriode:   (d) => panggil('accurate_periode', d || {}, { timeout: 60000 }),
    /* Foto dikirim base64; batas waktunya panjang karena unggahan ke Drive
       melewati jaringan toko yang tidak selalu kencang. */
    unggahFotoPulsa:   (d) => panggil('unggah_foto_pulsa', d, { timeout: 120000 }),
    simpanLini:        (d) => panggil('simpan_lini', d),
    tambahCabang:      (d) => panggil('tambah_cabang', d, { timeout: 120000 }),
    simpanCabang:      (d) => panggil('simpan_cabang', d),
    daftarSetting:     ()  => panggil('daftar_setting'),
    simpanSetting:     (d) => panggil('simpan_setting', d),
    daftarPiutang:     (d) => panggil('daftar_piutang', d, { timeout: 60000 }),
    bayarPiutang:      (d) => panggil('bayar_piutang', d),
    daftarUtang:       (d) => panggil('daftar_utang', d, { timeout: 60000 }),
    bayarUtang:        (d) => panggil('bayar_utang', d),
    logAudit:          (d) => panggil('log_audit', d, { timeout: 60000 }),
    daftarPembelian:   (d) => panggil('daftar_pembelian', d),
    rincianPembelian:  (d) => panggil('rincian_pembelian', d),

    /* --- klaim penjualan per petugas --- */
    daftarPetugas:     ()  => panggil('daftar_petugas'),
    simpanPetugas:     (d) => panggil('simpan_petugas', d),
    laporanPoin:       (d) => panggil('laporan_poin', d, { timeout: 90000 }),

    tutupBuku:         (d) => panggil('tutup_buku', d, { timeout: 120000 }),

    /* --- transfer & stok antar cabang --- */
    kirimTransfer:   (d) => panggil('kirim_transfer', d, { timeout: 90000 }),
    terimaTransfer:  (d) => panggil('terima_transfer', d, { timeout: 90000 }),
    batalTransfer:   (d) => panggil('batal_transfer', d, { timeout: 90000 }),
    daftarTransfer:  (d) => panggil('daftar_transfer', d, { timeout: 60000 }),

    /* --- permintaan barang --- */
    buatPermintaan:   (d) => panggil('buat_permintaan', d, { timeout: 60000 }),
    daftarPermintaan: (d) => panggil('daftar_permintaan', d, { timeout: 60000 }),
    /* Timeout sepanjang kirimTransfer, dan itu memang harus: memproses
       permintaan MENJALANKAN kirim transfer — FIFO, mutasi stok, dan jurnalnya
       sekaligus. Timeout yang lebih pendek akan memutus sambungan di tengah
       pekerjaan yang tetap berlanjut di server. */
    prosesPermintaan: (d) => panggil('proses_permintaan', d, { timeout: 90000 }),
    batalPermintaan:  (d) => panggil('batal_permintaan', d, { timeout: 60000 }),
    stokSemuaCabang: (d, o) => panggil('stok_semua_cabang', d, { timeout: 60000, ...o }),
    // Menghitung ulang satu SKU di semua cabang — sengaja diberi tenggang panjang
    cekStokTerkini:  (d) => panggil('cek_stok_terkini', d, { timeout: 120000 }),

    /* --- retur pembelian --- */
    buatReturBeli:   (d) => panggil('buat_retur_beli', d, { timeout: 90000 }),
    daftarReturBeli: (d) => panggil('daftar_retur_beli', d, { timeout: 60000 }),
    cariPembelian:   (d) => panggil('cari_pembelian', d, { timeout: 60000 }),

    /* --- grafik, ekspor/impor, arsip --- */
    dataGrafik:      (d) => panggil('data_grafik', d, { timeout: 120000 }),
    ekspor:          (d) => panggil('ekspor', d, { timeout: 180000 }),
    bacaBerkasImpor: (d) => panggil('baca_berkas_impor', d, { timeout: 120000 }),
    imporMaster:     (d) => panggil('impor_master', d, { timeout: 180000 }),
    templateImpor:   (d) => panggil('template_impor', d, { timeout: 90000 }),
    rotasiArsip:     (d) => panggil('rotasi_arsip', d, { timeout: 300000 }),
    ukuranBerkas:    ()  => panggil('ukuran_berkas', {}, { timeout: 120000 }),

    /* --- stok opname --- */
    buatOpname:      (d) => panggil('buat_opname', d, { timeout: 120000 }),
    simpanHitungan:  (d) => panggil('simpan_hitungan', d, { timeout: 90000 }),
    selesaiHitung:   (d) => panggil('selesai_hitung', d, { timeout: 90000 }),
    postingOpname:   (d) => panggil('posting_opname', d, { timeout: 120000 }),
    batalOpname:     (d) => panggil('batal_opname', d),
    daftarOpname:    (d) => panggil('daftar_opname', d, { timeout: 60000 }),
    detailOpname:    (d) => panggil('detail_opname', d, { timeout: 120000 }),
    filterOpname:    ()  => panggil('filter_opname'),

    /* --- retur --- */
    buatRetur:       (d) => panggil('buat_retur', d, { timeout: 90000 }),
    daftarRetur:     (d) => panggil('daftar_retur', d, { timeout: 60000 }),
    cariNota:        (d) => panggil('cari_nota', d, { timeout: 60000 }),

    /** Jalur umum — untuk aksi baru yang belum punya pembungkus khusus. */
    call: (aksi, d, opsi) => panggil(aksi, d || {}, opsi || {}),

    /**
     * Berapa permintaan yang masih menunggu jawaban.
     *
     * Diekspor demi PENJAGANYA. `_tertahan` yang lupa dicabut di `finally`
     * tidak kelihatan dari mana pun — aplikasinya tetap benar, himpunannya
     * cuma tumbuh terus, dan yang menemukannya adalah tablet kasir yang
     * kehabisan memori setelah seharian. Angka yang tidak bisa dibaca tidak
     * bisa dijaga.
     */
    menunggu: () => _tertahan.size,

    /* --- diagnosa waktu (lihat _jejak di atas) --- */
    ringkasanWaktu,
    jejakWaktu: () => _jejak.slice(),
    kosongkanJejak: () => { _jejak.length = 0; }
  };
})();
