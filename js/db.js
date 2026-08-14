/**
 * POS SINDIKAT KARTU — db.js
 * Lapisan IndexedDB. Seluruh data yang dibutuhkan kasir ada di sini,
 * sehingga aplikasi tetap berjalan penuh tanpa internet.
 *
 * Store:
 *   kv            — pasangan kunci/nilai (sesi, versi master, setting, nomor urut nota)
 *   produk        — master produk (index: barcode, nama)
 *   pelanggan     — master pelanggan
 *   stok          — stok terakhir yang diketahui (perkiraan saat offline)
 *   stok_cabang   — stok SELURUH cabang, untuk mengalihkan pelanggan ke cabang yang punya
 *   outbox        — dokumen menunggu kirim  (inti ketahanan offline)
 *   penjualan     — arsip nota lokal untuk cetak ulang & laporan shift
 */
const DB = (() => {
  let _db = null;

  const STORES = {
    kv:        { keyPath: 'k' },
    produk:    { keyPath: 'sku', index: [['barcode', 'barcode'], ['nama', 'nama']] },
    pelanggan: { keyPath: 'kode' },
    stok:        { keyPath: 'key' },
    stok_cabang: { keyPath: 'key', index: [['sku', 'sku']] },
    outbox:    { keyPath: 'uuid', index: [['status', 'status'], ['dibuat', 'dibuat']] },
    penjualan: { keyPath: 'uuid', index: [['tanggal', 'tanggal'], ['no_nota', 'no_nota']] }
  };

  function buka() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(CONFIG.DB_NAMA, CONFIG.DB_VERSI);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        Object.entries(STORES).forEach(([nama, def]) => {
          if (db.objectStoreNames.contains(nama)) return;
          const st = db.createObjectStore(nama, { keyPath: def.keyPath });
          (def.index || []).forEach(([n, k]) => st.createIndex(n, k, { unique: false }));
        });
      };
      req.onsuccess = () => { _db = req.result; res(_db); };
      req.onerror = () => rej(req.error);
    });
  }

  function tx(store, mode) {
    return buka().then(db => db.transaction(store, mode).objectStore(store));
  }

  const bungkus = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  return {
    buka,

    async get(store, key)  { return bungkus((await tx(store, 'readonly')).get(key)); },
    async all(store)       { return bungkus((await tx(store, 'readonly')).getAll()); },
    async put(store, obj)  { return bungkus((await tx(store, 'readwrite')).put(obj)); },
    async del(store, key)  { return bungkus((await tx(store, 'readwrite')).delete(key)); },
    async kosongkan(store) { return bungkus((await tx(store, 'readwrite')).clear()); },
    async jumlah(store)    { return bungkus((await tx(store, 'readonly')).count()); },

    /** Tulis banyak sekaligus dalam satu transaksi — jauh lebih cepat saat tarik master. */
    async putBanyak(store, objs) {
      const db = await buka();
      return new Promise((res, rej) => {
        const t = db.transaction(store, 'readwrite');
        const st = t.objectStore(store);
        objs.forEach(o => st.put(o));
        t.oncomplete = () => res(objs.length);
        t.onerror = () => rej(t.error);
      });
    },

    /* --- kv helper --- */
    async kvGet(k, bawaan) {
      const r = await this.get('kv', k);
      return r === undefined ? bawaan : r.v;
    },
    async kvSet(k, v) { return this.put('kv', { k, v }); },

    /* --- outbox --- */
    async outboxAntri(status = 'PENDING') {
      const semua = await this.all('outbox');
      return semua.filter(o => o.status === status)
                  .sort((a, b) => (a.dibuat < b.dibuat ? -1 : 1));
    },
    async outboxJumlah() { return (await this.outboxAntri()).length; },

    /** Bersihkan dokumen yang sudah tersinkron lebih dari N hari. */
    async outboxBersihkan(hari = 7) {
      const batas = new Date(Date.now() - hari * 86400000).toISOString();
      const semua = await this.all('outbox');
      const buang = semua.filter(o => o.status === 'SYNCED' && o.dibuat < batas);
      for (const o of buang) await this.del('outbox', o.uuid);
      return buang.length;
    }
  };
})();
