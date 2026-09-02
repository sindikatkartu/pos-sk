/**
 * POS SINDIKAT KARTU — label.js
 * CETAK LABEL BARCODE ke printer label TSPL (mis. Xprinter XP-365B).
 *
 * Beda dari `print.js`: itu printer STRUK berbahasa ESC/POS, ini printer LABEL
 * berbahasa TSPL. Perangkatnya beda, bahasanya beda, kertasnya beda. Yang sama
 * cuma jalur Bluetooth-nya — dan itu dipinjam dari `bt.js`, tidak disalin.
 *
 * ATURAN ISI LABEL (diputuskan pemilik 1 Sep 2026):
 *   - Produk yang barcode pabriknya SUDAH tercetak di kemasan tidak dilabeli.
 *     Barcode pabriknya sudah bisa discan; menempel barcode kedua di satu barang
 *     selalu berakhir dengan kasir men-scan yang salah.
 *   - Produk tanpa barcode pabrik dilabeli dengan SKU-nya sebagai CODE128.
 *
 * KENAPA LEBARNYA DIHITUNG, BUKAN DITAKSIR. Label 33mm hanya menyediakan 29mm
 * setelah margin. Pada 203 dpi lebar bar tersempit harus 2 titik (0,25mm) —
 * 1 titik tidak terbaca andal karena panas melebarkan bar sendiri. 29mm : 0,25mm
 * = 116 modul, dan CODE128 memakai `11 × (jumlah simbol) + 13` modul. Kode yang
 * melewati itu HARUS DITOLAK, bukan dicetak terpotong: barcode terpotong terbaca
 * sebagai barang lain atau tidak terbaca sama sekali, dan dua-duanya lebih mahal
 * daripada label yang tidak jadi dicetak.
 */

const Label = (() => {

  /* ---------- Ukuran & satuan ---------- */

  /** Printer label 203 dpi: 1 mm = 8 titik. */
  const TITIK_PER_MM = 203 / 25.4;
  const mmKeTitik = (mm) => Math.round(mm * TITIK_PER_MM);

  const BAWAAN = {
    lebar_mm: 33, tinggi_mm: 15, jarak_mm: 2,
    /* Lebar bar tersempit. 0,25mm = 2 titik pada 203 dpi. */
    sempit: 2,
    margin_mm: 2
  };

  /* Metrik font bawaan TSPL, dalam titik. Dipakai untuk MEMUSATKAN teks —
     TSPL tidak punya perataan tengah, jadi posisinya harus dihitung sendiri. */
  const FONT = { '1': { l: 8, t: 12 }, '2': { l: 12, t: 20 }, '3': { l: 16, t: 24 } };

  /* ---------- CODE128 ---------- */

  /* Nilai simbol khusus. Set A tidak dipakai: seluruh kode di toko ini huruf
     besar dan angka, dan Set B memuat keduanya tanpa perlu berpindah. */
  const MULAI_B = 104, MULAI_C = 105, KE_C = 99, KE_B = 100;

  const angka = (c) => c >= '0' && c <= '9';

  /** Berapa digit berurutan mulai dari posisi i. */
  function derasAngka(teks, i) {
    let n = 0;
    while (i + n < teks.length && angka(teks[i + n])) n++;
    return n;
  }

  /**
   * Sandikan teks jadi deretan nilai simbol CODE128.
   *
   * Berpindah ke Set C untuk deretan angka BUKAN kemewahan: Set C memuat dua
   * digit dalam satu simbol, dan itulah satu-satunya alasan kode `TG01030006`
   * (2 huruf + 8 angka) muat di label 33mm. Tanpa perpindahan itu ia butuh
   * 145 modul = 36,3mm dan tidak akan pernah muat.
   *
   * Ambang perpindahannya 4 digit — di bawah itu biaya simbol perpindahannya
   * lebih besar daripada hematnya.
   *
   * @returns {{nilai:number[], simbol:number, modul:number}}
   *   `nilai` termasuk simbol mulai dan cek, TIDAK termasuk simbol stop.
   *   `modul` sudah termasuk stop (13 modul).
   */
  function sandi128(teks) {
    const s = String(teks == null ? '' : teks);
    if (!s) throw new Error('Kode kosong.');
    for (const c of s) {
      const k = c.charCodeAt(0);
      if (k < 32 || k > 126) throw new Error('Kode memuat karakter yang tidak bisa disandikan: ' + c);
    }

    const nilai = [];
    let i = 0;
    /* Mulai di Set C bila diawali cukup banyak angka; 4 adalah ambang yang sama
       dengan di tengah kode, supaya hanya ada satu aturan untuk diingat. */
    let setC = derasAngka(s, 0) >= 4 || (derasAngka(s, 0) === s.length && s.length % 2 === 0 && s.length >= 2);
    if (setC && derasAngka(s, 0) % 2 === 1) {
      /* Deretan ganjil: satu digit dikeluarkan dulu di Set B supaya sisanya genap. */
      setC = false;
    }
    nilai.push(setC ? MULAI_C : MULAI_B);

    while (i < s.length) {
      if (setC) {
        if (i + 1 < s.length && angka(s[i]) && angka(s[i + 1])) {
          nilai.push(Number(s.substr(i, 2)));
          i += 2;
        } else {
          nilai.push(KE_B); setC = false;
        }
      } else {
        const deras = derasAngka(s, i);
        /* Pindah hanya bila yang bisa diambil GENAP — Set C tidak bisa memuat
           digit tunggal, dan pindah untuk ganjil malah menambah satu simbol. */
        if (deras >= 4 && deras % 2 === 0) {
          nilai.push(KE_C); setC = true;
        } else if (deras >= 5) {
          /* Ganjil: satu digit di Set B dulu, sisanya genap. */
          nilai.push(s.charCodeAt(i) - 32); i++;
          nilai.push(KE_C); setC = true;
        } else {
          nilai.push(s.charCodeAt(i) - 32); i++;
        }
      }
    }

    /* Cek = (mulai + Σ nilai_ke-n × n) mod 103, n dihitung dari 1. */
    let cek = nilai[0];
    for (let n = 1; n < nilai.length; n++) cek += nilai[n] * n;
    nilai.push(cek % 103);

    return { nilai, simbol: nilai.length, modul: 11 * nilai.length + 13 };
  }

  /** Lebar barcode dalam mm, pada lebar bar tersempit tertentu. */
  function lebarMm(teks, sempit) {
    const n = Number(sempit) || BAWAAN.sempit;
    return sandi128(teks).modul * n / TITIK_PER_MM;
  }

  /**
   * Muatkah barcode kode ini di label seukuran itu?
   * @returns {{muat:boolean, lebar:number, tersedia:number}} — dalam mm.
   */
  function muat(teks, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const tersedia = o.lebar_mm - 2 * o.margin_mm;
    const lebar = lebarMm(teks, o.sempit);
    return { muat: lebar <= tersedia + 0.001, lebar, tersedia };
  }

  /* ---------- TSPL ---------- */

  /** Teks yang aman masuk perintah TSPL: ASCII, tanpa petik ganda. */
  const aman = (t) => String(t == null ? '' : t)
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .trim();

  /**
   * Susun perintah TSPL untuk SATU label.
   *
   * Murni: tidak menyentuh printer, tidak menyentuh DOM. Itu yang membuat
   * seluruh tata letaknya bisa dibuktikan tanpa printer di tangan.
   *
   * @param {{kode:string, nama?:string, lembar?:number}} isi
   * @param {object} opsi ukuran label & lebar bar
   */
  function tspl(isi, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const kode = aman(isi.kode);
    const nama = aman(isi.nama);
    const lembar = Math.max(1, Math.min(99, Math.round(Number(isi.lembar) || 1)));

    const cocok = muat(kode, o);
    if (!cocok.muat) {
      throw new Error(`Kode "${kode}" butuh ${cocok.lebar.toFixed(1)}mm, ` +
        `label ${o.lebar_mm}mm hanya menyediakan ${cocok.tersedia.toFixed(1)}mm.`);
    }

    const L = mmKeTitik(o.lebar_mm), T = mmKeTitik(o.tinggi_mm);
    const lebarBar = sandi128(kode).modul * o.sempit;

    /* Tinggi batang. Turun saat ada baris nama — barcode 7mm masih di atas
       pedoman 15% dari panjangnya, dan itu yang membuat baris nama muat di
       label 15mm tanpa memotong apa pun. */
    const tBar = nama ? mmKeTitik(7) : mmKeTitik(8);
    const fKode = FONT['2'], fNama = FONT['1'];
    const jarak = 4;

    let tinggiIsi = tBar + jarak + fKode.t;
    if (nama) tinggiIsi += 2 + fNama.t;
    const atas = Math.max(0, Math.round((T - tinggiIsi) / 2));

    const xBar = Math.max(0, Math.round((L - lebarBar) / 2));
    const xKode = Math.max(0, Math.round((L - kode.length * fKode.l) / 2));

    const baris = [
      `SIZE ${o.lebar_mm} mm,${o.tinggi_mm} mm`,
      `GAP ${o.jarak_mm} mm,0 mm`,
      'DIRECTION 1',
      'REFERENCE 0,0',
      'CLS',
      /* BARCODE x,y,"jenis",tinggi,teks_manusia,putaran,sempit,lebar,"isi"
         teks_manusia 0: angkanya digambar sendiri di bawah supaya bisa
         dipusatkan — TSPL menaruh versi bawaannya rata kiri barcode. */
      `BARCODE ${xBar},${atas},"128",${tBar},0,0,${o.sempit},${o.sempit * 2},"${kode}"`,
      `TEXT ${xKode},${atas + tBar + jarak},"2",0,1,1,"${kode}"`
    ];
    if (nama) {
      /* Dipotong pada lebar yang benar-benar tersedia, bukan pada angka hafalan. */
      const muatHuruf = Math.floor((L - 2 * mmKeTitik(o.margin_mm)) / fNama.l);
      const potong = nama.length > muatHuruf ? nama.slice(0, muatHuruf) : nama;
      const xNama = Math.max(0, Math.round((L - potong.length * fNama.l) / 2));
      baris.push(`TEXT ${xNama},${atas + tBar + jarak + fKode.t + 2},"1",0,1,1,"${potong}"`);
    }
    baris.push(`PRINT 1,${lembar}`);
    return baris.join('\r\n') + '\r\n';
  }

  /* ---------- Perangkat ---------- */

  const slot = (typeof BT !== 'undefined') ? BT.buat('label') : null;

  /** Ukuran label disimpan PER PERANGKAT: satu toko bisa punya dua roll. */
  async function ukuran() {
    try {
      const u = await DB.kvGet('label_ukuran', null);
      return Object.assign({}, BAWAAN, u || {});
    } catch (e) { return Object.assign({}, BAWAAN); }
  }
  async function simpanUkuran(u) {
    const bersih = {
      lebar_mm: Math.max(10, Math.min(100, Number(u.lebar_mm) || BAWAAN.lebar_mm)),
      tinggi_mm: Math.max(10, Math.min(100, Number(u.tinggi_mm) || BAWAAN.tinggi_mm)),
      jarak_mm: Math.max(0, Math.min(10, Number(u.jarak_mm) || 0))
    };
    await DB.kvSet('label_ukuran', bersih);
    return bersih;
  }

  /** Kode yang dicetak untuk sebuah produk — null bila tidak perlu dilabeli. */
  function kodeProduk(p) {
    const bc = String((p && p.barcode) || '').trim();
    if (bc) return null;                       // sudah ada barcode pabrik di kemasan
    return String((p && p.sku) || '').trim() || null;
  }

  async function hubungkan(opsi) { return slot.pilih(opsi); }
  function lepas() { if (slot) slot.lepas(); }

  async function cetak(isi, opsi) {
    const o = Object.assign(await ukuran(), opsi || {});
    const perintah = tspl(isi, o);
    const bita = new Uint8Array([...perintah].map(c => c.charCodeAt(0) & 0xff));
    await slot.tulis(bita);
    return perintah;
  }

  return { sandi128, lebarMm, muat, tspl, kodeProduk, ukuran, simpanUkuran,
           hubungkan, lepas, cetak, slot, BAWAAN, FONT, TITIK_PER_MM, mmKeTitik };
})();

/* Inti murninya diekspor untuk diuji di Node: penyandi CODE128 dan penyusun
   TSPL tidak menyentuh DOM maupun Bluetooth sama sekali, jadi ia bisa dibuktikan
   sampai ke nilai simbolnya tanpa peramban. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Label;
}
