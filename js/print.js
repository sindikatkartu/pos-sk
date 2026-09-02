/**
 * POS SINDIKAT KARTU — print.js
 * Cetak struk. Dua jalur:
 *   1. ESC/POS lewat Web Bluetooth  — untuk printer thermal Bluetooth (paling andal & cepat)
 *   2. HTML window.print()          — cadangan universal (USB, PDF, printer apa pun)
 *
 * Catatan: Web Bluetooth hanya tersedia di Chrome/Edge Android & desktop, dan wajib HTTPS.
 *
 * Daftar "siapa mengerjakan apa" TIDAK disusun di sini. Aturannya milik domain
 * klaim, bukan domain cetak, dan dipakai juga oleh panel di layar bayar — jadi ia
 * tinggal di pos.js (`susunPeranNota`). Menyalinnya ke sini akan melahirkan
 * daftar kedua, dan dua daftar yang berbeda persis keluhan yang melahirkannya.
 */

const Struk = (() => {

  const ESC = { INIT: [0x1b, 0x40], TENGAH: [0x1b, 0x61, 0x01], KIRI: [0x1b, 0x61, 0x00],
                KANAN: [0x1b, 0x61, 0x02], TEBAL_ON: [0x1b, 0x45, 0x01], TEBAL_OFF: [0x1b, 0x45, 0x00],
                BESAR: [0x1d, 0x21, 0x11], NORMAL: [0x1d, 0x21, 0x00],
                POTONG: [0x1d, 0x56, 0x42, 0x00], LACI: [0x1b, 0x70, 0x00, 0x19, 0xfa] };

  const rupiah = (n) => new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(Number(n) || 0));

  /** Susun baris teks struk (dipakai kedua jalur cetak). */
  function baris(nota, opsi = {}) {
    const L = Number(opsi.lebar || APP_STATE.setting.lebar_struk || 58) === 80 ? 42 : 32;
    const s = APP_STATE.setting;
    const garis = '-'.repeat(L);
    const out = [];

    /**
     * Potong teks menjadi baris-baris yang MUAT di kertas.
     *
     * Printer termal tidak tahu apa itu kata: begitu satu baris melewati lebar
     * kolomnya, ia patah di karakter ke-33 — di tengah kata, kadang di tengah
     * angka. Footer toko ini panjangnya 131 karakter dan alamatnya 37, jadi
     * setiap struk keluar dengan dua blok teks yang patah sembarangan. Itulah
     * "struk berantakan" yang dilaporkan pemilik 28 Agu 2026, hari pertama
     * jualan. Yang salah bukan printernya — tidak ada satu pun baris di sini
     * yang pernah dipotong sebelum dikirim.
     *
     * Pemotongan sadar-kata: kata yang tidak muat pindah baris utuh. Kata yang
     * SENDIRIAN lebih panjang dari kertas (nama produk migrasi seperti
     * "TGOGRL5/RLC20/RLC21/…" panjangnya 77 karakter tanpa satu spasi pun)
     * dipatah paksa per L karakter — itu satu-satunya pilihan yang tersisa, dan
     * jauh lebih baik daripada dibuang diam-diam.
     */
    const bungkus = (t) => {
      const teks = String(t == null ? '' : t);
      if (teks.length <= L) return [teks];
      const hasil = [];
      let kini = '';
      teks.split(/\s+/).filter(Boolean).forEach(kata => {
        while (kata.length > L) {                 // kata tunggal lebih lebar dari kertas
          if (kini) { hasil.push(kini); kini = ''; }
          hasil.push(kata.slice(0, L));
          kata = kata.slice(L);
        }
        if (!kini) { kini = kata; }
        else if (kini.length + 1 + kata.length <= L) { kini += ' ' + kata; }
        else { hasil.push(kini); kini = kata; }
      });
      if (kini) hasil.push(kini);
      return hasil.length ? hasil : [''];
    };
    const satuBaris = (t) => t.length >= L ? t : ' '.repeat(Math.floor((L - t.length) / 2)) + t;
    /* Tengah selalu mengembalikan LARIK: teks panjang ditengahkan baris demi
       baris sesudah dipotong, bukan dikirim utuh lalu dipatah printer. */
    const tengah = (t) => bungkus(t).map(satuBaris);
    /**
     * Dua kolom: keterangan di kiri, nilainya rata kanan. Mengembalikan LARIK,
     * karena tidak semua pasangan muat dalam satu baris.
     *
     * Tiga keadaan, sengaja dibedakan:
     *   1. muat  → satu baris, kanan menempel di tepi kertas
     *   2. kanan masih muat sendirian → kiri yang dipendekkan (keterangan boleh
     *      terpotong; nilainya tidak — itu nominal yang dibayar orang, atau nama
     *      pelanggan di struknya sendiri)
     *   3. kanan SAJA sudah selebar kertas (nama pelanggan panjang) → kanan
     *      turun ke barisnya sendiri dan ikut dipotong
     *
     * Keadaan 3 dulu menghasilkan `substring(0, angka negatif)`, yang diam-diam
     * mengembalikan '' — barisnya justru jadi LEBIH panjang dari kertas dan
     * dipatah printer di tengah nama.
     */
    const duaKolom = (kiri, kanan) => {
      const sisa = L - kiri.length - kanan.length;
      if (sisa > 0) return [kiri + ' '.repeat(sisa) + kanan];
      if (kanan.length + 2 <= L) return [kiri.substring(0, L - kanan.length - 1) + ' ' + kanan];
      return bungkus(kiri).concat(bungkus(kanan));
    };

    out.push(...tengah((s.nama_usaha || 'SINDIKAT KARTU').toUpperCase()));
    if (s.alamat_usaha) out.push(...tengah(s.alamat_usaha));
    if (s.telepon_usaha) out.push(...tengah(s.telepon_usaha));
    /* NPWP. Setelan `npwp` duduk di layar Pengaturan sejak awal dan tidak pernah
       dicetak di mana pun — toko yang mengisinya percaya struknya sudah memuatnya.
       Hanya untuk toko PKP: struk non-PKP yang mencantumkan NPWP mengesankan PPN
       yang tidak pernah dipungut. */
    if (boolStruk(s.pkp) && String(s.npwp || '').trim()) {
      out.push(...tengah('NPWP ' + String(s.npwp).trim()));
    }
    out.push(...tengah(APP_STATE.namaCabang || APP_STATE.cabang));
    out.push(garis);
    out.push(...duaKolom('No', nota.no_nota));
    out.push(...duaKolom(tglTampil(nota.tanggal), nota.jam));
    out.push(...duaKolom('Kasir', APP_STATE.user.nama));
    /* SELURUH yang terlibat, termasuk tim per baris — bukan hanya klaim nota.
       Angka poinnya sengaja TIDAK dicetak: itu angka internal toko, dan struk
       adalah kertas milik pelanggan. Yang perlu terbaca di sini cuma namanya,
       supaya petugas yang bersangkutan bisa memeriksanya di tempat. */
    const pp = susunPeranNota(nota, APP_STATE.daftarPetugas);
    if (pp.penjual.length) out.push(...duaKolom('Dilayani', pp.penjual.join(', ')));
    if (pp.pemasang.length) out.push(...duaKolom('Dipasang', pp.pemasang.join(', ')));
    if (nota.kode_pelanggan && nota.kode_pelanggan !== 'C001') {
      out.push(...duaKolom('Plgn', nota._nama_pelanggan || nota.kode_pelanggan));
    }
    if (nota.level_harga !== 'eceran') out.push(...duaKolom('Harga', nota.level_harga.toUpperCase()));
    out.push(garis);

    nota.item.forEach(it => {
      /* Nama produk DIPOTONG jadi beberapa baris, bukan dipangkas.
         `substring(0, L)` membuang sisanya tanpa tanda apa pun: nama migrasi
         "TGOGRL5/RLC20/RLC21/OPA585G/VOY20/…" tercetak sebagai
         "TGOGRL5/RLC20/RLC21/OPA585G/VOY2" — pelanggan memegang struk yang
         menyebut barang yang tidak persis ia beli, dan tidak ada yang tahu ada
         yang hilang. */
      out.push(...bungkus(it.nama));
      const kiri = `  ${it.qty} ${it.satuan} x ${rupiah(it.harga_satuan)}`;
      out.push(...duaKolom(kiri, rupiah(it.qty * it.harga_satuan)));
      if (it.diskon > 0) out.push(...duaKolom('  Diskon', '-' + rupiah(it.diskon)));
    });

    out.push(garis);
    const t = nota._total || {};
    out.push(...duaKolom('Subtotal', rupiah(t.bruto)));
    if (t.diskon_item > 0) out.push(...duaKolom('Diskon item', '-' + rupiah(t.diskon_item)));
    if (nota.diskon_nota > 0) out.push(...duaKolom('Diskon nota', '-' + rupiah(nota.diskon_nota)));
    if (nota.ppn > 0) out.push(...duaKolom('PPN', rupiah(nota.ppn)));
    out.push(...duaKolom('TOTAL', rupiah(nota.total)));
    out.push(garis);

    (nota.bayar || []).forEach(b => {
      out.push(...duaKolom(b.metode.toUpperCase(), rupiah(b.jumlah)));
    });
    if (nota._kembali > 0) out.push(...duaKolom('KEMBALI', rupiah(nota._kembali)));
    if (nota.jatuh_tempo) out.push(...duaKolom('Jatuh tempo', tglTampil(nota.jatuh_tempo)));
    if (nota.garansi_hari > 0) {
      out.push(...bungkus(`Garansi ${nota.garansi_hari} hari (s.d. ${tglTampil(nota.garansi_sampai)})`));
    }

    out.push('');
    out.push(...tengah(s.footer_struk || 'Terima kasih'));
    if (nota._offline) out.push(...tengah('* belum tersinkron *'));
    out.push('');
    return out;
  }

  /* ---------- Jalur 1: Bluetooth ESC/POS ---------- */

  /* Jalur Bluetooth-nya MILIK `bt.js`, bukan berkas ini.

     Sejak ada printer label, dua printer memakai urutan yang persis sama:
     pilih perangkat, sambung GATT, cari characteristic yang bisa ditulis,
     tulis per potongan, sambung ulang kalau putus, lepaskan saat tab tidak
     dilihat. Menyalinnya ke label.js akan melahirkan dua salinan yang pasti
     berpisah jalan — dan yang satu akan diperbaiki sementara yang lain tidak.
     Penyimak `visibilitychange` juga tinggal di sana, satu untuk semua slot.

     Yang tetap di sini cuma yang memang urusan STRUK: bahasanya (ESC/POS),
     ekor kertasnya, dan laci uangnya. */
  const slotStruk = BT.buat('struk');

  async function hubungkanBluetooth() {
    const nama = await slotStruk.pilih();
    /* `printer_nama` dipertahankan apa adanya: layar Perangkat dan Tentang
       sudah membacanya sejak lama, dan mengganti nama kunci berarti nama
       printer hilang dari layar setiap kasir tanpa satu pun galat. */
    await DB.kvSet('printer_nama', nama);
    return nama;
  }

  /** Siap dipakai — memilih perangkat bila belum pernah, menyambung ulang bila putus. */
  async function pastikanTersambung() {
    if (!slotStruk.terpilih) return hubungkanBluetooth();
    return slotStruk.pastikan();
  }

  /** Lepaskan printer struk supaya aplikasi lain bisa memakainya. */
  function lepasPrinter() { slotStruk.lepas(); }

  /**
   * Ekor struk: berapa baris kosong, lalu potong atau tidak.
   *
   * `GS V 66 0` bukan sekadar "potong". Artinya "MAJUKAN kertas sampai posisi
   * pisau, lalu potong". Printer yang punya pisau memotong di situ dan hasilnya
   * pas. Printer yang TIDAK punya pisau tetap menjalankan bagian majukannya —
   * 2-3 cm kertas kosong keluar setiap struk, lalu tidak terjadi apa-apa.
   * Itu sebabnya dua printer yang diberi data yang sama persis mengeluarkan
   * panjang kertas yang berbeda; dilaporkan pemilik 28 Agu 2026.
   *
   * Tidak ada cara menanyakan ke printer apakah ia berpisau, jadi ini setelan
   * PER PERANGKAT (IndexedDB, bukan setting global): satu toko bisa memakai dua
   * printer berbeda di dua meja, dan setting global akan selalu salah untuk
   * salah satunya. Bawaannya `true` supaya printer yang selama ini sudah benar
   * tidak berubah perilaku; yang tanpa pisau tinggal dimatikan sakelarnya.
   */
  const EKOR_BAWAAN = { potong: true, umpan: 3 };

  /** Penjepit nilai ekor. Sengaja MURNI & sinkron supaya bisa diuji apa adanya. */
  const normalEkor = (potong, umpan) => ({
    potong: potong !== false,
    umpan: Math.max(0, Math.min(6, Math.round(Number(umpan)) || 0))
  });

  async function bacaEkor() {
    try {
      return normalEkor(await DB.kvGet('printer_potong', EKOR_BAWAAN.potong),
                        await DB.kvGet('printer_umpan', EKOR_BAWAAN.umpan));
    } catch (e) { return { ...EKOR_BAWAAN }; }
  }

  /**
   * Rakit bita ESC/POS dari baris teks yang sudah jadi. MURNI dan SINKRON —
   * tidak menyentuh Bluetooth maupun IndexedDB.
   *
   * Dipisah dari `cetakBluetooth` bukan demi kerapian, melainkan supaya isinya
   * bisa diuji sungguhan: penjalan uji di repo ini (`uji()` di uji/uji.js)
   * memanggil fungsi ujinya secara SINKRON dan mengabaikan Promise yang
   * dikembalikan. Uji apa pun yang harus `await` di sana akan selalu hijau,
   * apa pun isinya. Selama perakitan bita masih terkunci di dalam fungsi async,
   * ia tidak bisa dijaga uji sama sekali.
   */
  function bitaStruk(isi, ekor) {
    const enc = new TextEncoder();
    const buf = [];
    const push = (arr) => buf.push(...arr);
    push(ESC.INIT); push(ESC.TENGAH); push(ESC.TEBAL_ON);
    push(Array.from(enc.encode(isi[0] + '\n')));
    push(ESC.TEBAL_OFF); push(ESC.KIRI);
    isi.slice(1).forEach(b => push(Array.from(enc.encode(b + '\n'))));
    for (let i = 0; i < ekor.umpan; i++) push([0x0a]);
    if (ekor.potong) push(ESC.POTONG);
    return new Uint8Array(buf);
  }

  async function cetakBluetooth(nota) {
    await pastikanTersambung();
    const ekor = await bacaEkor();
    /* Disusun SEKALI. Dulu `baris(nota)` dipanggil dua kali — sekali untuk kop,
       sekali untuk sisanya — jadi seluruh struk dirakit dua kali per cetak, dan
       kalau isinya sempat berubah di antara dua panggilan itu, kop dan badan
       struk berasal dari dua versi yang berbeda. */
    const data = bitaStruk(baris(nota), ekor);
    await slotStruk.tulis(data);
  }

  /* Setelan datang dari sheet sebagai TEKS: 'true'/'false', bukan boolean. */
  const boolStruk = (v) => v === true || String(v).toLowerCase() === 'true';

  /**
   * Perlukah laci uang ditendang untuk nota ini?
   *
   * `buka_laci` ada di editor peran sejak awal dengan NOL rujukan, dan
   * `bukaLaci()` di bawah — lengkap dengan bita ESC/POS-nya — tidak pernah
   * dipanggil satu baris pun. Laci uang tidak pernah dibuka aplikasi ini.
   *
   * Hanya nota yang ADA TUNAINYA. Laci yang terbuka sendiri pada setiap nota
   * QRIS adalah laci yang dibiarkan terbuka, dan uang di dalamnya sudah tidak
   * dijaga siapa pun. Bawaan flagnya `false`, kebalikan dari jual_stok_minus:
   * yang satu menghentikan penjualan bila salah, yang ini cuma tidak membuka
   * laci — dan membuka laci orang yang tidak berhak jauh lebih mahal.
   */
  function perluBukaLaci(nota, flag) {
    if (!flag || flag.buka_laci !== true) return false;
    return (nota && nota.bayar || []).some(b => String(b.metode).toLowerCase() === 'tunai');
  }

  async function bukaLaci() {
    if (!slotStruk.terpilih) return;
    await slotStruk.tulis(new Uint8Array(ESC.LACI));
  }

  /* ---------- Jalur 2: HTML print (cadangan universal) ---------- */

  function cetakHtml(nota) {
    const lebar = Number(APP_STATE.setting.lebar_struk || 58);
    const isi = baris(nota).join('\n');
    const w = window.open('', '_blank', 'width=380,height=640');
    // Peramban kiosk sering memblokir pop-up, dan izin klik pengguna sudah
    // kedaluwarsa setelah beberapa await. Tanpa ini, `w.document` melempar
    // TypeError yang tersamar jadi "gagal cetak" tanpa sebab yang bisa dibaca.
    if (!w) throw new Error('Jendela cetak diblokir peramban — izinkan pop-up untuk situs ini.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${nota.no_nota}</title>
<style>
  @page { size: ${lebar}mm auto; margin: 2mm; }
  body { margin:0; font-family: 'Courier New', monospace; font-size: ${lebar === 80 ? 11 : 10}px;
         line-height: 1.35; white-space: pre; }
</style></head><body>${isi.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
  }

  /** Cetak dengan jalur terbaik yang tersedia; tidak pernah menggagalkan transaksi. */
  async function cetak(nota) {
    try {
      if (slotStruk.terpilih || (await DB.kvGet('printer_nama', null))) {
        await cetakBluetooth(nota);
        /* Sesudah struk, bukan sebelumnya: laci yang terbuka sementara printer
           masih menulis membuat kasir mengambil uang lebih dulu dan struknya
           tertinggal di printer. Kegagalannya ditelan — laci yang tidak mau
           terbuka bukan alasan untuk menggagalkan cetak struk. */
        if (perluBukaLaci(nota, APP_STATE.flag)) {
          try { await bukaLaci(); } catch (e) { console.warn('Laci gagal dibuka:', e.message); }
        }
        return 'bluetooth';
      }
    } catch (e) {
      console.warn('Cetak Bluetooth gagal, beralih ke HTML:', e.message);
    }
    cetakHtml(nota);
    return 'html';
  }

  return { cetak, cetakHtml, cetakBluetooth, hubungkanBluetooth, bukaLaci, perluBukaLaci,
           pastikanTersambung, lepasPrinter,
           baris, rupiah,
           bacaEkor, bitaStruk, normalEkor, EKOR_BAWAAN };
})();

// Ekspor untuk pengujian di Node (lihat uji/uji.js). Hanya fungsi murni yang
// diekspor — Struk sendiri bergantung pada DOM/Web Bluetooth dan tidak masuk akal
// dipanggil di luar browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}
