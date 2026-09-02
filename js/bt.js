/**
 * POS SINDIKAT KARTU — bt.js
 * SLOT PRINTER BLUETOOTH — dipakai bersama oleh printer struk dan printer label.
 *
 * Toko ini memakai DUA printer sekaligus: printer struk (ESC/POS) di meja kasir
 * dan printer label (TSPL) untuk barcode. Keduanya butuh urutan yang persis
 * sama — pilih perangkat, sambung GATT, cari characteristic, tulis per potongan,
 * sambung ulang kalau putus, lepaskan saat tab tidak dilihat — dan menyalin
 * urutan itu ke dua tempat berarti dua tempat yang akan berpisah jalan. Berkas
 * ini yang memilikinya; `print.js` dan `label.js` cuma memakainya.
 *
 * Kenapa "slot": satu slot = satu peran, bukan satu perangkat. Printer struk
 * boleh diganti kapan saja tanpa printer label ikut terlupa, dan sebaliknya.
 */

const BT = (() => {

  /**
   * Service yang mungkin dipakai printer termal Bluetooth.
   *
   * Web Bluetooth TIDAK MENGIZINKAN menelusuri service yang tidak disebutkan
   * lebih dulu — `getPrimaryServices()` hanya mengembalikan yang ada di
   * `filters` atau `optionalServices`. Jadi "cari sendiri" hanya bisa sejauh
   * daftar ini. Untuk printer di luar daftar, layar Perangkat menyediakan
   * pengisian UUID manual; itu bukan kemewahan melainkan satu-satunya jalan.
   */
  const SERVICE_DIKENAL = [
    '000018f0-0000-1000-8000-00805f9b34fb', // ESC/POS termal paling umum
    '0000ff00-0000-1000-8000-00805f9b34fb', // sebagian Xprinter & Goojprt
    '0000ffe0-0000-1000-8000-00805f9b34fb', // modul HM-10 / JDY
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e'  // Nordic UART
  ];

  /* Ukuran potongan tulis. Banyak printer termal punya buffer kecil dan
     MEMBUANG sisa paket yang melewatinya tanpa memberi tahu — hasilnya struk
     terpotong di tengah tanpa satu pun galat. 180 byte + jeda 40ms adalah
     angka yang sudah terbukti di printer toko ini sejak v1.2. */
  const POTONG = 180;
  const JEDA = 40;

  const semuaSlot = [];

  /**
   * Satu slot printer.
   * @param {string} nama  kunci penyimpanan, mis. 'struk' atau 'label'.
   */
  function buat(nama) {
    const KUNCI = 'bt_' + nama;
    let perangkat = null, karakteristik = null;

    /** Ingatan per perangkat: nama, UUID service & characteristic yang KETEMU. */
    const ingat = async (svcUuid, karUuid) => {
      try {
        await DB.kvSet(KUNCI, {
          nama_perangkat: perangkat ? perangkat.name : '',
          svc: svcUuid || '', kar: karUuid || ''
        });
      } catch (e) { console.warn('simpan ingatan printer: ' + e.message); }
    };

    const diingat = async () => {
      try { return (await DB.kvGet(KUNCI, null)) || null; } catch (e) { return null; }
    };

    /**
     * Cari characteristic yang bisa DITULIS di antara service yang boleh dilihat.
     *
     * Dicari, bukan ditebak. Printer label dan printer struk memakai UUID yang
     * berbeda-beda antar merek dan bahkan antar batch; menanam satu pasang UUID
     * di kode berarti fitur ini mati begitu printernya diganti.
     */
    async function telusuri(server, svcPilihan) {
      const daftar = svcPilihan
        ? [await server.getPrimaryService(svcPilihan)]
        : await server.getPrimaryServices();
      for (const svc of daftar) {
        let kars = [];
        try { kars = await svc.getCharacteristics(); } catch (e) { continue; }
        for (const k of kars) {
          if (k.properties && (k.properties.write || k.properties.writeWithoutResponse)) {
            return { svc: svc.uuid, kar: k, karUuid: k.uuid };
          }
        }
      }
      return null;
    }

    async function sambung(svcPilihan, karPilihan) {
      const server = await perangkat.gatt.connect();
      /* Jalan cepat: UUID yang sudah pernah ketemu dipakai langsung. */
      if (svcPilihan && karPilihan) {
        try {
          const svc = await server.getPrimaryService(svcPilihan);
          karakteristik = await svc.getCharacteristic(karPilihan);
          return karakteristik;
        } catch (e) { /* perangkatnya berubah — jatuh ke penelusuran */ }
      }
      const temu = await telusuri(server, svcPilihan);
      if (!temu) throw new Error('Printer tersambung tapi tidak punya jalur tulis yang dikenali.');
      karakteristik = temu.kar;
      await ingat(temu.svc, temu.karUuid);
      return karakteristik;
    }

    /**
     * Minta pengguna memilih perangkat. WAJIB dari sentuhan pengguna.
     * @param {{semua?:boolean, svc?:string}} opsi
     *   semua — tampilkan seluruh perangkat Bluetooth, bukan cuma yang
     *           service-nya dikenal. Untuk printer yang tidak muncul di daftar.
     *   svc   — UUID service yang diisi manual di layar Perangkat.
     */
    async function pilih(opsi = {}) {
      if (!navigator.bluetooth) {
        throw new Error('Peramban ini tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.');
      }
      const tambahan = opsi.svc ? [String(opsi.svc).toLowerCase()] : [];
      const kandidat = SERVICE_DIKENAL.concat(tambahan);
      const permintaan = (opsi.semua || opsi.svc)
        ? { acceptAllDevices: true, optionalServices: kandidat }
        : { filters: kandidat.map(s => ({ services: [s] })), optionalServices: kandidat };

      perangkat = await navigator.bluetooth.requestDevice(permintaan);
      /* Putus diam-diam DITANDAI. Tanpa ini `karakteristik` menyimpan objek yang
         sudah mati, dan cetak berikutnya melempar "GATT Server is disconnected"
         alih-alih menyambung ulang. */
      perangkat.addEventListener('gattserverdisconnected', () => { karakteristik = null; });
      await sambung(opsi.svc || null, null);
      await ingat((await diingat() || {}).svc, (await diingat() || {}).kar);
      return perangkat.name || '(tanpa nama)';
    }

    /**
     * Pastikan siap dipakai — menyambung ulang bila perlu, TANPA sentuhan.
     *
     * `requestDevice` wajib dari sentuhan pengguna; `gatt.connect()` pada
     * perangkat yang izinnya sudah diberikan TIDAK. Pemisahan itulah yang
     * membuat pelepasan-lalu-sambung-ulang mungkin sama sekali.
     */
    async function pastikan() {
      if (!perangkat) throw new Error('Printer ' + nama + ' belum dipilih.');
      if (karakteristik && perangkat.gatt.connected) return karakteristik;
      const ing = (await diingat()) || {};
      return sambung(ing.svc || null, ing.kar || null);
    }

    /**
     * Lepaskan printer supaya aplikasi lain bisa memakainya.
     *
     * Printer termal hanya menerima SATU koneksi. Tablet kasir toko ini
     * menjalankan dua aplikasi transaksi; selama kita menahan GATT-nya sampai
     * tab ditutup, yang lain tidak akan pernah bisa mengambilnya.
     */
    function lepas() {
      try {
        if (perangkat && perangkat.gatt && perangkat.gatt.connected) perangkat.gatt.disconnect();
      } catch (e) { console.warn('lepas printer ' + nama + ': ' + e.message); }
      karakteristik = null;
    }

    /** Kirim bita ke printer, dipotong sesuai buffer-nya. */
    async function tulis(data) {
      const kar = await pastikan();
      for (let i = 0; i < data.length; i += POTONG) {
        await kar.writeValue(data.slice(i, i + POTONG));
        await new Promise(r => setTimeout(r, JEDA));
      }
    }

    const slot = {
      nama, pilih, pastikan, lepas, tulis, diingat,
      get terpilih() { return !!perangkat; },
      get tersambung() { return !!(perangkat && perangkat.gatt && perangkat.gatt.connected); },
      get namaPerangkat() { return perangkat ? (perangkat.name || '') : ''; },
      /* Hanya untuk uji: memasang perangkat palsu tanpa lewat requestDevice. */
      _pasang(p) { perangkat = p; karakteristik = null; }
    };
    semuaSlot.push(slot);
    return slot;
  }

  /* Satu penyimak untuk SEMUA slot. Dipasang sekali di sini, bukan sekali per
     modul: dua penyimak yang melakukan hal yang sama adalah dua tempat yang
     bisa berselisih. */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) semuaSlot.forEach(s => s.lepas());
    });
  }

  return { buat, SERVICE_DIKENAL, POTONG, JEDA, _slot: semuaSlot };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}
