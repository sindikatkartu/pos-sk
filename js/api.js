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
  const _kabar = () => document.dispatchEvent(
    new CustomEvent('api:sibuk', { detail: { jumlah: _sibuk } }));

  async function panggil(aksi, data = {}, opsi = {}) {
    if (!_online && !opsi.paksa) {
      throw Object.assign(new Error('Sedang offline'), { kode: 'OFFLINE' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opsi.timeout || 30000);
    _sibuk++; _kabar();
    try {
      const resp = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ aksi, token: _token, data }),
        signal: ctrl.signal,
        redirect: 'follow'
      });
      if (!resp.ok) throw Object.assign(new Error('HTTP ' + resp.status), { kode: 'HTTP' });
      const j = await resp.json();
      if (!j.ok) {
        const e = new Error(j.pesan || 'Permintaan gagal');
        e.kode = j.kode; e.detail = j.detail;
        throw e;
      }
      return j.data;
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('Server tidak menjawab'), { kode: 'TIMEOUT' });
      if (e.message === 'Failed to fetch') throw Object.assign(new Error('Tidak dapat menghubungi server'), { kode: 'JARINGAN' });
      throw e;
    } finally {
      clearTimeout(timer);
      _sibuk--; _kabar();
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
  async function tugas(fn) {
    _sibuk++; _kabar();
    try { return await fn(); }
    finally { _sibuk--; _kabar(); }
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
    setToken(t) { _token = t; },
    getToken()  { return _token; },
    tugas,

    ping:            ()  => panggil('ping'),
    login:           (d) => panggil('login', d),
    logout:          ()  => panggil('logout'),
    catatKeluarPaksa:(d) => panggil('catat_keluar_paksa', d),
    gantiPin:        (d) => panggil('ganti_pin', d),

    tarikMaster:     (d) => panggil('tarik_master', d, { timeout: 60000 }),
    simpanProduk:    (d) => panggil('simpan_produk', d),
    imporProduk:     (d) => panggil('impor_produk', d, { timeout: 120000 }),
    simpanPelanggan: (d) => panggil('simpan_pelanggan', d),

    bukaShift:       (d) => panggil('buka_shift', d),
    tutupShift:      (d) => panggil('tutup_shift', d),
    shiftAktif:      ()  => panggil('shift_aktif'),
    daftarShift:     (d) => panggil('daftar_shift', d),
    laporanShift:    (d) => panggil('laporan_shift', d, { timeout: 90000 }),
    catatCetakUlang: (d) => panggil('catat_cetak_ulang', d),

    kirimPenjualan:  (d) => ulang(() => panggil('kirim_penjualan', d, { timeout: 60000 })),
    voidPenjualan:   (d) => panggil('void_penjualan', d),

    stokTerkini:     (d) => panggil('stok_terkini', d, { timeout: 60000 }),
    kartuStok:       (d) => panggil('kartu_stok', d),
    simpanPembelian: (d) => panggil('simpan_pembelian', d),
    simpanKas:       (d) => panggil('simpan_kas', d),
    daftarKas:       (d) => panggil('daftar_kas', d),

    laporanPenjualan:(d) => panggil('laporan_penjualan', d, { timeout: 60000 }),
    laporanDiskon:   (d) => panggil('laporan_diskon', d, { timeout: 60000 }),
    otorisasiDiskon: (d) => panggil('otorisasi_diskon', d),
    labaRugi:        (d) => panggil('laba_rugi', d, { timeout: 60000 }),
    neraca:          (d) => panggil('neraca', d, { timeout: 60000 }),
    ujiKebenaran:    (d) => panggil('uji_kebenaran', d, { timeout: 90000 }),

    daftarPerangkat: ()  => panggil('daftar_perangkat'),
    setujuiPerangkat:(d) => panggil('setujui_perangkat', d),

    /* --- back office --- */
    dashboard:         (d) => panggil('ringkasan_dashboard', d, { timeout: 90000 }),
    daftarProduk:      (d) => panggil('daftar_produk', d, { timeout: 90000 }),
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
    tambahCabang:      (d) => panggil('tambah_cabang', d, { timeout: 120000 }),
    simpanCabang:      (d) => panggil('simpan_cabang', d),
    daftarSetting:     ()  => panggil('daftar_setting'),
    simpanSetting:     (d) => panggil('simpan_setting', d),
    daftarPiutang:     (d) => panggil('daftar_piutang', d, { timeout: 60000 }),
    bayarPiutang:      (d) => panggil('bayar_piutang', d),
    logAudit:          (d) => panggil('log_audit', d, { timeout: 60000 }),
    daftarPembelian:   (d) => panggil('daftar_pembelian', d),

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
    stokSemuaCabang: (d) => panggil('stok_semua_cabang', d, { timeout: 60000 }),
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
    call: (aksi, d, opsi) => panggil(aksi, d || {}, opsi || {})
  };
})();
