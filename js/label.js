/**
 * POS SINDIKAT KARTU — label.js
 * CETAK LABEL BARCODE ke printer label lewat DRIVER sistem (SATO CG408TT).
 *
 * KENAPA BUKAN BLUETOOTH + TSPL (perubahan v1.81.0)
 * v1.80.0 mengirim perintah TSPL lewat Web Bluetooth, dengan asumsi printernya
 * sekelas Xprinter. Printer yang sebenarnya dipakai toko ini SATO CG408TT:
 *   - antarmukanya USB/Serial. TIDAK ADA Bluetooth sama sekali, jadi seluruh
 *     jalur Web Bluetooth tidak akan pernah menyentuhnya.
 *   - bahasanya SBPL. Seri CG4 tidak punya emulasi TSPL, jadi `SIZE/GAP/BARCODE`
 *     akan diabaikan atau keluar sebagai teks mentah di atas kertas.
 * Peramban tidak bisa membuka soket TCP (port 9100) dan WebUSB tertahan driver
 * `usbprint.sys` di Windows. Yang tersisa — dan yang justru paling tahan
 * pergantian printer — adalah MENGGAMBAR labelnya sendiri lalu mencetak lewat
 * dialog cetak peramban ke driver SATO.
 *
 * Konsekuensinya: batang barcode digambar di sini, bukan oleh printer. Itu
 * sekaligus menjawab permintaan preview — yang tampil di layar adalah berkas
 * yang sama persis dengan yang keluar dari printer, bukan gambaran kasarnya.
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
 *
 * KERTAS 3 LINE. Roll yang dipakai toko ini 33×15mm "3 line" — tiga label
 * bersebelahan dalam satu baris selebar ±103mm. Satu halaman cetak = SATU BARIS
 * kertas, bukan satu label; itu yang membuat sensor gap printer maju satu baris
 * per halaman seperti seharusnya.
 */

const Label = (() => {

  /* ---------- Ukuran & satuan ---------- */

  /** Printer label 203 dpi: 1 mm = 8 titik. */
  const TITIK_PER_MM = 203 / 25.4;
  const mmKeTitik = (mm) => Math.round(mm * TITIK_PER_MM);

  const BAWAAN = {
    lebar_mm: 33, tinggi_mm: 15, jarak_mm: 2,
    /* Berapa label bersebelahan dalam satu baris kertas. Roll toko ini 3 line. */
    kolom: 3,
    /* Lebar bar tersempit. 0,25mm = 2 titik pada 203 dpi. */
    sempit: 2,
    margin_mm: 2
  };

  /* Tinggi huruf, dalam mm. Monospace dipakai supaya lebar teks bisa DIHITUNG
     (±0,6 × tinggi per huruf) — tanpa itu pemotongan nama cuma tebakan. */
  const HURUF = { kode: 2.6, nama: 2.0 };
  const RASIO_HURUF = 0.6;

  /* ---------- CODE128 ---------- */

  /* Nilai simbol khusus. Set A tidak dipakai: seluruh kode di toko ini huruf
     besar dan angka, dan Set B memuat keduanya tanpa perlu berpindah. */
  const MULAI_B = 104, MULAI_C = 105, KE_C = 99, KE_B = 100, STOP = 106;

  /**
   * Pola lebar batang tiap simbol CODE128, indeks 0–106.
   *
   * Tiap angka = lebar satu elemen dalam modul, berselang-seling HITAM–PUTIH
   * dimulai dari hitam. Simbol 0–105 selalu 6 elemen berjumlah 11 modul;
   * simbol stop (106) 7 elemen berjumlah 13. Kedua sifat itu diperiksa oleh
   * uji, bukan dipercaya — satu digit salah ketik di tabel ini menghasilkan
   * barcode yang tercetak rapi dan terbaca sebagai barang lain.
   */
  const POLA = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

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

  /**
   * Ubah nilai simbol jadi deretan lebar elemen, bergantian hitam–putih.
   *
   * Inilah bagian yang dulu dikerjakan firmware printer. Sekarang kita yang
   * menggambarnya, jadi ia harus benar sampai ke satu modul: elemen pertama
   * SELALU hitam, dan jumlah seluruh lebarnya harus sama dengan `modul`.
   *
   * @returns {{lebar:number[], modul:number}} `lebar[0]` hitam, `lebar[1]` putih, dst.
   */
  function pola(teks) {
    const { nilai, modul } = sandi128(teks);
    const lebar = [];
    nilai.concat([STOP]).forEach(v => {
      for (const d of POLA[v]) lebar.push(Number(d));
    });
    return { lebar, modul };
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

  /* ---------- Gambar ---------- */

  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** Teks yang aman digambar: ASCII tercetak saja. */
  const aman = (t) => String(t == null ? '' : t).replace(/[^\x20-\x7e]/g, '').trim();

  const bulat = (n) => Math.round(n * 1000) / 1000;

  /**
   * Gambar SATU label sebagai SVG berukuran mm sesungguhnya.
   *
   * Murni: tidak menyentuh printer, tidak menyentuh DOM, tidak membaca
   * pengaturan. Itu yang membuat seluruh tata letaknya bisa dibuktikan tanpa
   * printer di tangan — dan yang membuat preview di layar dijamin sama dengan
   * yang keluar dari printer, karena keduanya memanggil fungsi ini.
   *
   * @param {{kode:string, nama?:string}} isi
   * @param {object} opsi ukuran label & lebar bar
   */
  function svg(isi, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const kode = aman(isi.kode);
    const nama = aman(isi.nama);

    const cocok = muat(kode, o);
    if (!cocok.muat) {
      throw new Error(`Kode "${kode}" butuh ${cocok.lebar.toFixed(1)}mm, ` +
        `label ${o.lebar_mm}mm hanya menyediakan ${cocok.tersedia.toFixed(1)}mm.`);
    }

    const W = o.lebar_mm, H = o.tinggi_mm;
    const satuan = o.sempit / TITIK_PER_MM;          // lebar satu modul, mm
    const { lebar } = pola(kode);
    const lebarBar = cocok.lebar;

    /* Tinggi dibagi dari atas ke bawah, sisanya jadi tinggi batang. Dihitung,
       bukan dihafal: label 15mm dan label 25mm memakai rumus yang sama. */
    const atas = 1, selaKode = 0.6, selaNama = 0.4, bawah = 0.8;
    let tBar = H - atas - selaKode - HURUF.kode - bawah;
    if (nama) tBar -= selaNama + HURUF.nama;
    if (tBar < 3) throw new Error(`Label ${H}mm terlalu pendek untuk barcode + teks.`);

    let x = (W - lebarBar) / 2;
    const bagian = [];
    lebar.forEach((n, i) => {
      const w = n * satuan;
      /* Elemen genap hitam, ganjil putih. Yang putih tidak digambar — kertasnya
         sudah putih, dan satu <rect> per spasi menggandakan besar berkasnya. */
      if (i % 2 === 0) {
        bagian.push(`<rect x="${bulat(x)}" y="${atas}" width="${bulat(w)}" height="${bulat(tBar)}"/>`);
      }
      x += w;
    });

    const yKode = atas + tBar + selaKode + HURUF.kode * 0.82;
    bagian.push(`<text x="${bulat(W / 2)}" y="${bulat(yKode)}" font-size="${HURUF.kode}"` +
                ` text-anchor="middle" font-family="monospace">${esc(kode)}</text>`);

    if (nama) {
      const tersediaHuruf = Math.floor((W - 2 * o.margin_mm) / (HURUF.nama * RASIO_HURUF));
      const potong = nama.length > tersediaHuruf ? nama.slice(0, tersediaHuruf) : nama;
      const yNama = yKode + selaNama + HURUF.nama;
      bagian.push(`<text x="${bulat(W / 2)}" y="${bulat(yNama)}" font-size="${HURUF.nama}"` +
                  ` text-anchor="middle" font-family="monospace">${esc(potong)}</text>`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" class="label"` +
           ` width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"` +
           ` shape-rendering="crispEdges" fill="#000">${bagian.join('')}</svg>`;
  }

  /* ---------- Lembar cetak ---------- */

  /**
   * Sebarkan permintaan cetak jadi satu entri per label.
   * @param {Array<{kode:string, nama?:string, lembar?:number}>} daftar
   */
  function sebar(daftar) {
    const out = [];
    (daftar || []).forEach(d => {
      const n = Math.max(1, Math.min(999, Math.round(Number(d.lembar) || 1)));
      for (let i = 0; i < n; i++) out.push({ kode: d.kode, nama: d.nama });
    });
    if (!out.length) throw new Error('Tidak ada label untuk dicetak.');
    return out;
  }

  /**
   * Susun halaman cetak lengkap.
   *
   * SATU HALAMAN = SATU BARIS KERTAS, bukan satu label. Pada roll 3 line,
   * halaman selebar 3 label + 2 gap; printer memajukan kertas satu baris per
   * halaman, persis seperti kalau labelnya dicetak dari driver bawaan.
   * `@page margin: 0` wajib — margin bawaan peramban 10mm akan menggeser
   * seluruh barisnya keluar kertas.
   */
  function halaman(daftar, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const kolom = Math.max(1, Math.min(10, Math.round(Number(o.kolom) || 1)));
    const semua = sebar(daftar);
    const lebarHalaman = bulat(kolom * o.lebar_mm + (kolom - 1) * o.jarak_mm);

    const baris = [];
    for (let i = 0; i < semua.length; i += kolom) {
      const sel = semua.slice(i, i + kolom)
        .map(l => `<div class="sel">${svg(l, o)}</div>`).join('');
      baris.push(`<div class="baris">${sel}</div>`);
    }

    return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Label barcode</title>
<style>
  @page { size: ${lebarHalaman}mm ${o.tinggi_mm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .baris { width: ${lebarHalaman}mm; height: ${o.tinggi_mm}mm;
           display: flex; gap: ${o.jarak_mm}mm; break-after: page; page-break-after: always; }
  .baris:last-child { break-after: auto; page-break-after: auto; }
  .sel { width: ${o.lebar_mm}mm; height: ${o.tinggi_mm}mm; overflow: hidden; }
  svg.label { display: block; }
</style></head><body>${baris.join('')}</body></html>`;
  }

  /* ---------- Pengaturan ---------- */

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
      jarak_mm: Math.max(0, Math.min(10, Number(u.jarak_mm) || 0)),
      kolom: Math.max(1, Math.min(10, Math.round(Number(u.kolom) || BAWAAN.kolom)))
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

  /* ---------- Cetak ---------- */

  /**
   * Buka jendela cetak berisi lembar label.
   *
   * Jalur yang sama dengan cetak struk cadangan di `print.js`, termasuk
   * penanganan pop-up yang diblokir: tanpa itu `w.document` melempar TypeError
   * yang tersamar jadi "gagal cetak" tanpa sebab yang bisa dibaca.
   */
  async function cetak(daftar, opsi) {
    const o = Object.assign(await ukuran(), opsi || {});
    const html = halaman(daftar, o);
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) throw new Error('Jendela cetak diblokir peramban — izinkan pop-up untuk situs ini.');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
    return html;
  }

  return { sandi128, pola, lebarMm, muat, svg, halaman, sebar, kodeProduk,
           ukuran, simpanUkuran, cetak,
           BAWAAN, HURUF, POLA, TITIK_PER_MM, mmKeTitik };
})();

/* Inti murninya diekspor untuk diuji di Node: penyandi CODE128, penyusun pola
   batang dan penyusun lembar cetak tidak menyentuh DOM maupun printer sama
   sekali, jadi ia bisa dibuktikan sampai ke nilai simbolnya tanpa peramban. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Label;
}
