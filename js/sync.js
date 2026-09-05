/**
 * POS SINDIKAT KARTU — sync.js
 * Mesin sinkronisasi latar belakang.
 *
 * Aturan yang tidak boleh dilanggar:
 *   - Kasir TIDAK PERNAH menunggu sinkronisasi. Nota disimpan lokal lalu dicetak, titik.
 *   - Dokumen hanya dihapus dari outbox setelah server mengonfirmasi UUID-nya.
 *   - Kiriman ganda aman: server menolak UUID yang sudah ada (idempotent).
 */
const Sync = (() => {
  let jalan = false;
  let timerOutbox = null, timerMaster = null;

  /* `umur_jam` — umur data master dalam jam, disiarkan bersama status.
     Lencana digambar oleh penangan yang SINKRON sedangkan umurnya dibaca dari
     IndexedDB; menyelipkan pembacaan async di dalam penggambar berarti lencana
     yang berkedip. Diangkut di sini, penggambarnya tetap sederhana. */
  const status = { mengirim: false, tertahan: 0, ditolak: 0, terakhir: null,
                   galat: null, umur_jam: 0 };

  function kabarkan() { document.dispatchEvent(new CustomEvent('sync:status', { detail: { ...status } })); }

  /** Masukkan dokumen penjualan ke antrian kirim. */
  async function antrikanPenjualan(dok) {
    await DB.put('outbox', {
      uuid: dok.uuid, jenis: 'penjualan', status: 'PENDING',
      dibuat: new Date().toISOString(), percobaan: 0, dokumen: dok
    });
    status.tertahan = await DB.outboxJumlah();
    status.ditolak = (await DB.outboxDitolak()).length;
    kabarkan();
    kirim();   // coba langsung; kalau offline akan gagal diam-diam dan dicoba lagi nanti
  }

  /**
   * Antrikan JEJAK cetak ulang struk di luar shift berjalan.
   *
   * Lewat outbox, bukan dipanggil langsung ke server, karena jejak yang menguap
   * saat internet mati bukan jejak — dan cetak ulang justru paling mungkin
   * terjadi saat kasir sedang sibuk melayani orang di depan meja, bukan saat
   * jaringan sedang bagus.
   */
  async function antrikanCetakUlang(jejak) {
    await DB.put('outbox', {
      uuid: 'CU-' + (jejak.uuid || '') + '-' + Date.now(),
      jenis: 'cetak_ulang', status: 'PENDING',
      dibuat: new Date().toISOString(), percobaan: 0, dokumen: jejak
    });
    kirim();
  }

  /** Kirim isi outbox secara berkelompok. */
  async function kirim() {
    if (status.mengirim || !API.online || !API.getToken()) return;
    const antri = await DB.outboxAntri('PENDING');
    status.tertahan = antri.length;

    /* Umur data DIHITUNG SEBELUM jalan keluar di bawah. Saat online outbox
       hampir selalu kosong, jadi menghitungnya sesudah baris itu berarti
       peringatan data basi tidak akan pernah muncul justru pada perangkat yang
       paling membutuhkannya — jebakan yang sama persis dengan B1. */
    status.umur_jam = await umurDataJam();

    if (!antri.length) { kabarkan(); return; }

    status.mengirim = true; status.galat = null; kabarkan();

    /* Paket penjualan yang sedang dipertaruhkan saat ini. Catch di bawah berada
       DI LUAR perulangan, jadi tanpa penanda ini ia tidak punya cara menyentuh
       dokumen yang barusan ditolak — dan itulah sebabnya penghitung percobaannya
       diam di nol selama ini. */
    let sedangDikirim = [];
    try {
      for (let i = 0; i < antri.length; i += CONFIG.BATCH_SIZE) {
        const paket = antri.slice(i, i + CONFIG.BATCH_SIZE);
        /* Jejak cetak ulang dikirim satu per satu dan TIDAK menghalangi apa pun:
           kegagalannya hanya membuatnya dicoba lagi nanti. Ditaruh sebelum
           penjualan supaya `continue` di bawah — yang melompati paket tanpa
           nota — tidak ikut melompati jejaknya. */
        for (const o of paket.filter(o => o.jenis === 'cetak_ulang')) {
          try {
            await API.catatCetakUlang(o.dokumen);
            o.status = 'SYNCED'; o.waktu_sinkron = new Date().toISOString();
          } catch (e) {
            o.percobaan = (o.percobaan || 0) + 1;
            if (o.percobaan >= 5) o.status = 'DITOLAK';
          }
          await DB.put('outbox', o);
        }

        const penjualan = paket.filter(o => o.jenis === 'penjualan');
        if (!penjualan.length) continue;

        sedangDikirim = penjualan;
        const hasil = await API.kirimPenjualan({
          cabang: APP_STATE.cabang,
          dokumen: penjualan.map(o => o.dokumen)
        }, { latar: true });
        sedangDikirim = [];   // paketnya selamat; yang gagal sesudah ini bukan salahnya

        // Diterima maupun duplikat sama-sama berarti "sudah aman di server"
        const beres = new Set([...(hasil.diterima || []), ...(hasil.duplikat || [])]);
        for (const o of penjualan) {
          if (beres.has(o.uuid)) {
            o.status = 'SYNCED'; o.waktu_sinkron = hasil.waktu;
            await DB.put('outbox', o);
            const nota = await DB.get('penjualan', o.uuid);
            if (nota) { nota.status_sync = 'SYNCED'; await DB.put('penjualan', nota); }
          }
        }

        // Dokumen yang ditolak server ditandai agar tidak diulang terus-menerus
        for (const g of (hasil.gagal || [])) {
          const o = penjualan.find(x => x.uuid === g.uuid);
          if (!o) continue;
          o.percobaan = (o.percobaan || 0) + 1;
          o.pesan_galat = g.pesan;
          if (o.percobaan >= 3) o.status = 'DITOLAK';
          await DB.put('outbox', o);
          console.warn('Dokumen ditolak server:', g.uuid, g.pesan);
        }
      }
      status.terakhir = new Date().toISOString();
      await DB.kvSet('sync_terakhir', status.terakhir);
      await DB.outboxBersihkan(7);
    } catch (e) {
      /* Kegagalan tingkat PAKET — `API.kirimPenjualan()` sendiri yang melempar,
         bukan server yang menolak dokumen satu per satu. Dua pertanyaan yang
         BERBEDA harus dijawab di sini, dan menyamakannya adalah asal masalahnya.

         (1) Apakah ini membakar jatah percobaan dokumennya?
             HANYA untuk penolakan yang akan berulang persis sama sampai ada
             manusia yang mengubah sesuatu: IZIN dan VALIDASI. Owner memindahkan
             kasir ke peran yang lupa dicentang `penjualan · buat` sementara 8
             nota tertahan — sejak itu tiap 30 detik ditolak IZIN, dan sampai
             v1.56 penghitungnya tidak pernah naik. Statusnya tetap PENDING
             selamanya: lencana KUNING "8 menunggu", rupanya sama persis dengan
             antrean sehat yang sedang menunggu jaringan.

             Yang lain TIDAK boleh membakarnya. Aplikasi ini offline-first;
             kalau kehabisan sinyal ikut dihitung, tiga kali offline sudah cukup
             membuat nota yang sehat ditandai DITOLAK — jauh lebih mahal daripada
             masalah yang diobati. SESI juga tidak: login ulang menyembuhkannya.
             HTTP 500 juga tidak: server yang tumbang sembuh sendiri.

         (2) Apakah ini pantas terlihat merah di lencana?
             Semua yang bukan gangguan jaringan biasa. Untuk jaringan, keadaannya
             sudah punya lencananya sendiri ("Offline" / "N menunggu"), dan
             lencana yang merah tiap kali sinyal berkedip adalah lencana yang
             berhenti dibaca. */
      var jaringan = ['JARINGAN', 'OFFLINE', 'TIMEOUT'].includes(e.kode);
      status.galat = jaringan ? null : e.message;

      if (['IZIN', 'VALIDASI'].includes(e.kode)) {
        for (const o of sedangDikirim) {
          o.percobaan = (o.percobaan || 0) + 1;
          o.pesan_galat = e.message;
          if (o.percobaan >= 3) o.status = 'DITOLAK';
          await DB.put('outbox', o);
        }
        console.warn('Paket ditolak server:', e.kode, e.message,
                     '(' + sedangDikirim.length + ' dokumen)');
      } else if (!jaringan) {
        console.warn('Sinkronisasi gagal:', e.kode || '-', e.message);
      }
    } finally {
      status.mengirim = false;
      status.tertahan = await DB.outboxJumlah();
      status.ditolak = (await DB.outboxDitolak()).length;
      kabarkan();
    }
  }

  /** Tarik master data bila versinya berubah di server. */
  async function tarikMaster(paksa = false, latar = false) {
    if (!API.online) return { perubahan: false, offline: true };

    /* Dibungkus API.tugas, bukan dibiarkan pada penghitung `panggil()` saja.
       Permintaannya sendiri cepat; yang lama adalah kosongkan() + putBanyak()
       seluruh katalog sesudahnya. Tanpa pembungkus ini penandanya padam persis
       saat pekerjaan terberatnya baru mulai — itulah "loading berhenti, lalu
       beberapa detik kemudian baru muncul notifikasi". */
    return API.tugas(async () => {
      const versi = await DB.kvGet('versi_master', '0');
      const d = await API.tarikMaster({ versi, paksa }, { latar });
      if (!d.perubahan) {
        await DB.kvSet('master_diperbarui', new Date().toISOString());
        return d;
      }

      await DB.kosongkan('produk');
      await DB.putBanyak('produk', d.produk.map(p => ({
        ...p,
        satuan_lain: d.satuan[p.sku] || [],
        tier: d.tier[p.sku] || [],
        varian: d.varian[p.sku] || [],
        /**
         * Indeks pencarian kasir. Sengaja menggabungkan SEMUA yang mungkin diketik orang:
         * nama, SKU, merek, kategori, kolom tipe HP, deskripsi bebas, kata kunci alias,
         * dan daftar kompatibilitas terstruktur.
         *
         * Inilah yang menyelesaikan kasus tempered glass: satu SKU yang cocok untuk puluhan
         * tipe HP tetap ketemu apa pun tipe yang disebut pelanggan.
         */
        _cari: [
          p.nama, p.sku, p.merek, p.tipe_hp, p.kategori, p.deskripsi, p.kata_kunci,
          (p.kompatibel || []).map(k => k.merek + ' ' + k.tipe).join(' ')
        ].filter(Boolean).join(' ').toLowerCase()
      })));

      await DB.kosongkan('pelanggan');
      await DB.putBanyak('pelanggan', d.pelanggan);

      // Server lama (belum dimigrasi) tidak mengirim `petugas` sama sekali. Menimpa
      // daftar lokal dengan array kosong dalam keadaan itu akan menghapus pilihan
      // petugas dari layar kasir tanpa sebab, jadi yang tidak dikirim dibiarkan.
      if (Array.isArray(d.petugas)) {
        await DB.kosongkan('petugas');
        await DB.putBanyak('petugas', d.petugas);
      }

      await DB.kvSet('versi_master', d.versi);
      await DB.kvSet('setting', d.setting);
      await DB.kvSet('cabang_list', d.cabang);
      await DB.kvSet('coa', d.coa);
      await DB.kvSet('master_diperbarui', new Date().toISOString());

      document.dispatchEvent(new Event('master:diperbarui'));
      return d;
    });
  }

  /** Tarik stok terkini (perkiraan yang dipakai saat offline). */
  async function tarikStok(latar = false) {
    if (!API.online) return;
    try {
      const d = await API.stokTerkini({ cabang: APP_STATE.cabang }, { latar });
      await DB.kosongkan('stok');
      await DB.putBanyak('stok', d.stok.map(s => ({
        key: s.sku + '|' + (s.kode_varian || ''), sku: s.sku, qty: s.qty
      })));
      await DB.kvSet('stok_diperbarui', new Date().toISOString());
      document.dispatchEvent(new Event('stok:diperbarui'));
    } catch (e) {
      console.warn('Gagal menarik stok:', e.message);
    }
  }

  /**
   * Tarik stok SELURUH cabang dan simpan di perangkat.
   * Ini bagian "cepat" dari pendekatan hybrid: kasir melihat stok cabang lain seketika,
   * bahkan saat offline. Angkanya bisa tertinggal beberapa menit — untuk memastikan,
   * kasir menekan "cek terkini" yang memanggil API.cekStokTerkini().
   */
  async function tarikStokSemuaCabang(latar = false) {
    if (!API.online) return;
    try {
      const d = await API.stokSemuaCabang({}, { latar });
      await DB.kosongkan('stok_cabang');
      await DB.putBanyak('stok_cabang', d.stok.map(s => ({
        key: s.cabang + '|' + s.sku + '|' + (s.kode_varian || ''),
        cabang: s.cabang, sku: s.sku, kode_varian: s.kode_varian || '', qty: s.qty
      })));
      await DB.kvSet('stok_cabang_diperbarui', d.diperbarui || new Date().toISOString());
      document.dispatchEvent(new Event('stok_cabang:diperbarui'));
    } catch (e) {
      console.warn('Gagal menarik stok antar cabang:', e.message);
    }
  }

  /** Stok satu SKU di seluruh cabang, dibaca dari cache lokal (instan). */
  async function stokCabangLain(sku) {
    const semua = await DB.all('stok_cabang');
    return semua.filter(s => s.sku === sku);
  }

  let timerStokCabang = null;

  function mulai() {
    if (jalan) return;
    jalan = true;
    /* Ketiganya LATAR — lihat _sibukOrang di api.js. Tanpa penanda itu layar
       mengunci dirinya sendiri tiap 5 dan 10 menit, tanpa ada yang menekan
       apa pun. */
    timerOutbox = setInterval(kirim, CONFIG.SYNC_INTERVAL_MS);
    timerMaster = setInterval(() => tarikMaster(false, true).catch(() => {}), CONFIG.MASTER_POLL_MS);
    timerStokCabang = setInterval(() => tarikStokSemuaCabang(true), CONFIG.STOK_CABANG_POLL_MS);
    document.addEventListener('koneksi:berubah', () => { if (API.online) kirim(); });
    kirim();
  }

  function berhenti() {
    jalan = false;
    clearInterval(timerOutbox); clearInterval(timerMaster); clearInterval(timerStokCabang);
  }

  /** Umur data master dalam jam — dipakai untuk memperingatkan kasir yang lama offline. */
  async function umurDataJam() {
    const t = await DB.kvGet('master_diperbarui', null);
    if (!t) return Infinity;
    return (Date.now() - new Date(t).getTime()) / 3600000;
  }

  return { mulai, berhenti, kirim, antrikanPenjualan, antrikanCetakUlang, tarikMaster, tarikStok,
           tarikStokSemuaCabang, stokCabangLain, umurDataJam,
           get status() { return { ...status }; } };
})();
