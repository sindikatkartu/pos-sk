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

  const status = { mengirim: false, tertahan: 0, terakhir: null, galat: null };

  function kabarkan() { document.dispatchEvent(new CustomEvent('sync:status', { detail: { ...status } })); }

  /** Masukkan dokumen penjualan ke antrian kirim. */
  async function antrikanPenjualan(dok) {
    await DB.put('outbox', {
      uuid: dok.uuid, jenis: 'penjualan', status: 'PENDING',
      dibuat: new Date().toISOString(), percobaan: 0, dokumen: dok
    });
    status.tertahan = await DB.outboxJumlah();
    kabarkan();
    kirim();   // coba langsung; kalau offline akan gagal diam-diam dan dicoba lagi nanti
  }

  /** Kirim isi outbox secara berkelompok. */
  async function kirim() {
    if (status.mengirim || !API.online || !API.getToken()) return;
    const antri = await DB.outboxAntri('PENDING');
    status.tertahan = antri.length;
    if (!antri.length) { kabarkan(); return; }

    status.mengirim = true; status.galat = null; kabarkan();
    try {
      for (let i = 0; i < antri.length; i += CONFIG.BATCH_SIZE) {
        const paket = antri.slice(i, i + CONFIG.BATCH_SIZE);
        const penjualan = paket.filter(o => o.jenis === 'penjualan');
        if (!penjualan.length) continue;

        const hasil = await API.kirimPenjualan({
          cabang: APP_STATE.cabang,
          dokumen: penjualan.map(o => o.dokumen)
        });

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
      status.galat = e.message;
      if (e.kode === 'SESI') document.dispatchEvent(new Event('sesi:berakhir'));
    } finally {
      status.mengirim = false;
      status.tertahan = await DB.outboxJumlah();
      kabarkan();
    }
  }

  /** Tarik master data bila versinya berubah di server. */
  async function tarikMaster(paksa = false) {
    if (!API.online) return { perubahan: false, offline: true };
    const versi = await DB.kvGet('versi_master', '0');
    const d = await API.tarikMaster({ versi, paksa });
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

    await DB.kvSet('versi_master', d.versi);
    await DB.kvSet('setting', d.setting);
    await DB.kvSet('cabang_list', d.cabang);
    await DB.kvSet('coa', d.coa);
    await DB.kvSet('master_diperbarui', new Date().toISOString());

    document.dispatchEvent(new Event('master:diperbarui'));
    return d;
  }

  /** Tarik stok terkini (perkiraan yang dipakai saat offline). */
  async function tarikStok() {
    if (!API.online) return;
    try {
      const d = await API.stokTerkini({ cabang: APP_STATE.cabang });
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
  async function tarikStokSemuaCabang() {
    if (!API.online) return;
    try {
      const d = await API.stokSemuaCabang({});
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
    timerOutbox = setInterval(kirim, CONFIG.SYNC_INTERVAL_MS);
    timerMaster = setInterval(() => tarikMaster().catch(() => {}), CONFIG.MASTER_POLL_MS);
    timerStokCabang = setInterval(() => tarikStokSemuaCabang(), CONFIG.STOK_CABANG_POLL_MS);
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

  return { mulai, berhenti, kirim, antrikanPenjualan, tarikMaster, tarikStok,
           tarikStokSemuaCabang, stokCabangLain, umurDataJam,
           get status() { return { ...status }; } };
})();
