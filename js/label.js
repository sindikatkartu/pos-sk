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
    margin_mm: 2,

    /* Tinggi huruf dan tinggi batang, dalam mm — bisa disetel dari layar
       Setelan. Diminta pemilik 6 Sep 2026: tulisan di bawah barcode kekecilan,
       dan tinggi barcodenya ingin bisa diatur.

       BAWAANNYA PERSIS SEPERTI SEBELUM SETELAN INI ADA, dan itu bukan
       kehati-hatian kosong: stiker yang sudah tercetak dan tertempel di ratusan
       barang tidak boleh berubah bentuk hanya karena aplikasinya diperbarui.

       `tinggi_bar_mm: 0` berarti OTOMATIS — batangnya mengambil seluruh sisa
       ruang sesudah teks, seperti selama ini. Angka di atas nol berarti tinggi
       yang ditetapkan orang, dan sisanya jadi ruang kosong.

       Ketiganya berebut tinggi label yang sama. Pada stiker 15mm, huruf yang
       dibesarkan MEMENDEKKAN batangnya — itu bukan cacat melainkan aritmetika,
       dan yang menyetelnya harus melihat akibatnya. Karena itu layar Setelan
       menggambar contohnya dari fungsi yang sama dengan yang mencetak. */
    huruf_kode_mm: 2.6,
    huruf_nama_mm: 2.0,
    tinggi_bar_mm: 0,
    /* Berapa BARIS nama paling banyak (bagian 332, pemilik 4 Okt 2026: "supaya
       baris nama sku bertambah, supaya jika namanya panjang tetap bisa
       masuk"). Bawaannya SATU — persis seperti sebelum setelan ini ada, dengan
       alasan yang sama dengan tiga angka di atas. Nama pendek tetap memakai
       satu baris walau batasnya 2 atau 3; barcode otomatis memendek hanya
       sebanyak baris yang benar-benar terpakai. */
    baris_nama: 1
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
  /**
   * Pecah nama jadi paling banyak `maks` baris berisi `per` huruf.
   *
   * Baris yang BUKAN terakhir dipatahkan di batas kata; satu kata yang lebih
   * panjang dari barisnya dipenggal. Baris TERAKHIR yang diizinkan mengambil
   * sisanya dan dipotong keras di `per` huruf — persis perilaku satu-baris
   * yang lama, jadi `maks = 1` menghasilkan stiker yang identik dengan
   * sebelum bagian 332.
   */
  function pecahNama(nama, per, maks) {
    const baris = [];
    let sisa = String(nama == null ? '' : nama).trim();
    per = Math.max(1, Math.floor(Number(per) || 1));
    maks = Math.max(1, Math.floor(Number(maks) || 1));
    while (sisa && baris.length < maks) {
      if (baris.length === maks - 1 || sisa.length <= per) { baris.push(sisa.slice(0, per)); break; }
      let potong = sisa.lastIndexOf(' ', per);
      if (potong <= 0) potong = per;
      baris.push(sisa.slice(0, potong).trim());
      sisa = sisa.slice(potong).trim();
    }
    return baris.filter((b) => b !== '');
  }
  /** Jarak antar baris nama, dalam kelipatan tinggi hurufnya. */
  const JARAK_BARIS_NAMA = 1.15;
  /** Jumlah baris nama yang diminta setelan: 1–3, selain itu 1. */
  const batasBarisNama = (o) => Math.max(1, Math.min(3, Math.round(Number(o && o.baris_nama) || 1)));

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

    /* Tinggi huruf diambil dari setelan, dengan BAWAAN sebagai cadangan —
       stiker yang dicetak perangkat yang setelannya belum pernah disentuh harus
       keluar persis seperti sebelum setelan ini ada. */
    const hKode = Number(o.huruf_kode_mm) > 0 ? Number(o.huruf_kode_mm) : HURUF.kode;
    const hNama = Number(o.huruf_nama_mm) > 0 ? Number(o.huruf_nama_mm) : HURUF.nama;

    /* Tinggi dibagi dari atas ke bawah, sisanya jadi tinggi batang. Dihitung,
       bukan dihafal: label 15mm dan label 25mm memakai rumus yang sama. */
    const atas = 1, selaKode = 0.6, selaNama = 0.4, bawah = 0.8;
    /* Nama dipecah LEBIH DULU: tinggi batang bergantung pada berapa baris yang
       benar-benar terpakai, bukan pada batasnya. */
    const hurufPerBaris = Math.floor((W - 2 * o.margin_mm) / (hNama * RASIO_HURUF));
    const barisNama = nama ? pecahNama(nama, hurufPerBaris, batasBarisNama(o)) : [];
    let sisa = H - atas - selaKode - hKode - bawah;
    if (barisNama.length) sisa -= selaNama + hNama + (barisNama.length - 1) * hNama * JARAK_BARIS_NAMA;

    /* Tinggi batang yang DIMINTA orang dipakai apa adanya; sisanya dibiarkan
       kosong. Ditolak kalau tidak muat, dan penolakannya menyebut ANGKANYA —
       "terlalu pendek" tanpa angka tidak memberi tahu siapa pun berapa yang
       harus dikurangi. */
    const minta = Number(o.tinggi_bar_mm) || 0;
    if (minta > 0 && minta > sisa) {
      throw new Error(`Tinggi barcode ${minta}mm tidak muat: label ${H}mm hanya menyisakan ` +
        `${sisa.toFixed(1)}mm sesudah tulisannya. Kecilkan tinggi barcode, kecilkan ukuran ` +
        `huruf, atau pakai stiker yang lebih tinggi.`);
    }
    const tBar = minta > 0 ? minta : sisa;
    if (tBar < 3) {
      throw new Error(`Label ${H}mm terlalu pendek untuk barcode + teks — tersisa ` +
        `${sisa.toFixed(1)}mm untuk batangnya, minimal 3mm. Kecilkan ukuran huruf atau ` +
        `pakai stiker yang lebih tinggi.`);
    }

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

    const yKode = atas + tBar + selaKode + hKode * 0.82;
    bagian.push(`<text x="${bulat(W / 2)}" y="${bulat(yKode)}" font-size="${hKode}"` +
                ` text-anchor="middle" font-family="monospace">${esc(kode)}</text>`);

    /* Berapa huruf yang muat ikut menyusut saat hurufnya dibesarkan — kalau
       tidak, nama yang tadinya pas akan menjulur keluar stiker begitu ukurannya
       dinaikkan. Pemecahannya di pecahNama() di atas. */
    barisNama.forEach((teks, i) => {
      const yNama = yKode + selaNama + hNama + i * hNama * JARAK_BARIS_NAMA;
      bagian.push(`<text x="${bulat(W / 2)}" y="${bulat(yNama)}" font-size="${hNama}"` +
                  ` text-anchor="middle" font-family="monospace">${esc(teks)}</text>`);
    });

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

  /** Berapa label bersebelahan dalam satu baris kertas. Maksimal 3 — roll yang
      dipakai toko ini "3 line", dan lebih dari itu tidak pernah ada. */
  function jumlahKolom(o) {
    return Math.max(1, Math.min(3, Math.round(Number(o.kolom) || 1)));
  }

  /**
   * Kolom mana saja yang benar-benar dicetak, sebagai nomor 1-basis yang urut.
   *
   * Diminta pemilik 6 Sep 2026: "terkadang print ganjil menyisakan kertas label
   * kosong". Roll 3 line yang barisnya tinggal separuh terpakai tidak bisa
   * dipakai habis kalau pencetakannya selalu mulai dari kolom 1 — sisa kolom 2
   * dan 3 terbuang setiap kali.
   *
   * `slot` yang tidak disebut berarti SELURUH kolom, jadi pemanggil lama tidak
   * berubah perilakunya sedikit pun. Nomor di luar jangkauan dibuang, kembarnya
   * dibuang, dan urutannya ditegakkan — "3,1" dan "1,3" sama saja bagi kertas,
   * dan mengizinkan urutan bebas hanya melahirkan cara baru untuk salah.
   */
  function slotDipakai(o) {
    const kolom = jumlahKolom(o);
    if (!Array.isArray(o.slot)) {
      const semua = [];
      for (let k = 1; k <= kolom; k++) semua.push(k);
      return semua;
    }
    const bersih = [];
    o.slot.map(n => Math.round(Number(n)))
      .filter(n => n >= 1 && n <= kolom)
      .sort((a, b) => a - b)
      .forEach(n => { if (bersih.indexOf(n) === -1) bersih.push(n); });
    if (!bersih.length) {
      throw new Error('Tidak ada kolom yang dipilih — centang minimal satu kolom.');
    }
    return bersih;
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
  /**
   * SATU-SATUNYA tempat yang memutuskan stiker mana mendarat di sel mana.
   *
   * Dipakai bersama oleh `halaman()` (yang keluar ke printer) dan
   * `pratinjauSemua()` (yang dilihat orang di layar). Sampai 6 Sep 2026 kedua
   * penyusun itu ditulis terpisah, dan pelajaran dari v1.104.0 masih segar:
   * pratinjau yang punya penyusun sendiri suatu hari akan berbeda dari
   * kertasnya, dan hari itu tidak ada yang tahu mana yang benar.
   *
   * Mengembalikan array baris; tiap baris array sepanjang `kolom`, berisi
   * item atau `null` untuk sel yang dilewati. Sel yang dilewati TETAP ADA —
   * kertasnya maju satu baris penuh, dan sel kosong harus tetap memakan
   * tempatnya atau seluruh baris melenceng satu kolom.
   */
  function _potongBaris(semua, kolom, slot) {
    const baris = [];
    /* Nol slot tidak mungkin lolos ke sini (`slotDipakai` melempar), tapi
       langkah nol memutar for-loop ini selamanya dan mematikan tabnya tanpa
       satu pesan pun — ditemukan lewat mutasi, bukan lewat pembacaan. */
    const langkah = Math.max(1, slot.length);
    for (let i = 0; i < semua.length; i += langkah) {
      const potong = semua.slice(i, i + langkah);
      const sel = [];
      for (let k = 1; k <= kolom; k++) {
        const ke = slot.indexOf(k);
        sel.push(ke >= 0 && potong[ke] ? potong[ke] : null);
      }
      baris.push(sel);
    }
    return baris;
  }

  function halaman(daftar, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const kolom = jumlahKolom(o);
    const slot = slotDipakai(o);
    const semua = sebar(daftar);
    const lebarHalaman = bulat(kolom * o.lebar_mm + (kolom - 1) * o.jarak_mm);

    /* Barisnya SELALU selebar seluruh kolom, walau yang dicetak cuma kolom 2.
       Kertasnya tetap maju satu baris penuh, dan sel yang dilewati harus tetap
       memakan tempatnya — kalau tidak, stiker kolom 2 tercetak di posisi kolom
       1 dan seluruh baris melenceng. */
    const baris = _potongBaris(semua, kolom, slot).map(sel =>
      `<div class="baris">${sel.map(isi =>
        `<div class="sel">${isi ? svg(isi, o) : ''}</div>`).join('')}</div>`);

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

  /**
   * Satu BARIS kertas sebagai HTML pratinjau — SELURUH kolomnya, termasuk yang
   * dilewati.
   *
   * Digambar di sini, bukan di layar yang memanggilnya, dengan alasan yang sama
   * seperti contoh di layar Setelan: pratinjau yang punya penggambar sendiri
   * suatu hari akan berbeda dari kertasnya, dan hari itu tidak akan ada yang
   * tahu mana yang benar.
   *
   * Yang dilewati digambar sebagai kotak bergaris putus-putus seukuran
   * stikernya — bukan dihilangkan. Yang perlu dilihat orang justru POSISINYA:
   * "stiker saya akan keluar di kolom kedua, kolom pertama dibiarkan kosong".
   */
  function pratinjauSemua(daftar, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    const kolom = jumlahKolom(o);
    const slot = slotDipakai(o);
    return _potongBaris(sebar(daftar), kolom, slot).map(sel =>
      `<div class="baris-pratinjau" style="gap:${o.jarak_mm}mm">${sel.map(isi => isi
        ? `<div class="sel-pratinjau">${svg(isi, o)}</div>`
        : `<div class="sel-pratinjau kosong" style="width:${o.lebar_mm}mm;height:${o.tinggi_mm}mm"></div>`
      ).join('')}</div>`).join('');
  }

  /**
   * Berapa BARIS KERTAS yang akan keluar — tanpa menggambar satu pun stiker.
   *
   * Layar menggambar seluruh barisnya, jadi angkanya bisa saja dihitung dengan
   * membaca hasil gambarnya. Tapi angka yang dibaca dari gambar akan ikut salah
   * kalau gambarnya salah, dan yang dibutuhkan justru angka yang berdiri
   * sendiri. Dihitung di sini dengan pembagi yang SAMA dengan yang dipakai
   * mencetak — bukan dibagi tiga di layar, yang akan benar selama ketiga
   * kolomnya menyala lalu berbohong begitu satu kolom dimatikan.
   */
  function jumlahBarisCetak(daftar, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    return _potongBaris(sebar(daftar), jumlahKolom(o), slotDipakai(o)).length;
  }

  /**
   * Satu baris berisi SATU kode yang diulang di seluruh kolom aktif.
   *
   * Ini bukan tata letak sungguhan melainkan ILUSTRASI "beginilah satu baris
   * penuh akan terlihat" — dipakai contoh di layar Setelan. Ia sengaja jadi
   * pembungkus tipis `pratinjauSemua`, bukan penggambar kedua: `lembar`
   * disetel sebanyak slot aktif, jadi sebar() menghasilkan tepat satu baris
   * penuh dan hasilnya identik sampai ke karakternya.
   */
  function barisPratinjau(isi, opsi = {}) {
    const o = Object.assign({}, BAWAAN, opsi);
    return pratinjauSemua([{ kode: isi.kode, nama: isi.nama,
                             lembar: slotDipakai(o).length }], opsi);
  }

  /* ---------- Pengaturan ---------- */

  /** Ukuran label disimpan PER PERANGKAT: satu toko bisa punya dua roll. */
  async function ukuran() {
    try {
      const u = await DB.kvGet('label_ukuran', null);
      return Object.assign({}, BAWAAN, u || {});
    } catch (e) { return Object.assign({}, BAWAAN); }
  }
  /** Bulatkan ke satu angka di belakang koma — lihat simpanUkuran(). */
  const _satuDesimal = (n) => Math.round(n * 10) / 10;

  /** Isi stiker (bukan ukuran kertas) — inilah yang disimpan sebagai PROFIL. */
  const KUNCI_ISI = ['huruf_kode_mm', 'huruf_nama_mm', 'tinggi_bar_mm', 'baris_nama'];
  function jepitIsi(u) {
    u = u || {};
    return {
      huruf_kode_mm: _satuDesimal(Math.max(1.2, Math.min(8, Number(u.huruf_kode_mm) || BAWAAN.huruf_kode_mm))),
      huruf_nama_mm: _satuDesimal(Math.max(1.2, Math.min(8, Number(u.huruf_nama_mm) || BAWAAN.huruf_nama_mm))),
      tinggi_bar_mm: _satuDesimal(Math.max(0, Math.min(60, Number(u.tinggi_bar_mm) || 0))),
      baris_nama: batasBarisNama(u)
    };
  }

  async function simpanUkuran(u) {
    /* Pemanggil lama tidak mengirim `baris_nama`; yang tidak dikirim memakai
       yang tersimpan, bukan diam-diam kembali ke satu baris. */
    if (u.baris_nama === undefined) u = Object.assign({}, u, { baris_nama: (await ukuran()).baris_nama });
    /* Profil pertama dipotret SEBELUM setelannya berubah (lihat profil()). */
    try { await profil(); } catch (e) { /* profil bukan syarat menyimpan ukuran */ }
    const bersih = {
      lebar_mm: Math.max(10, Math.min(100, Number(u.lebar_mm) || BAWAAN.lebar_mm)),
      tinggi_mm: Math.max(10, Math.min(100, Number(u.tinggi_mm) || BAWAAN.tinggi_mm)),
      jarak_mm: Math.max(0, Math.min(10, Number(u.jarak_mm) || 0)),
      /* Maksimal 3, bukan 10: roll yang dipakai toko ini "3 line". Diminta
         pemilik 6 Sep 2026, dan angka yang sama dipakai jumlahKolom(). */
      kolom: Math.max(1, Math.min(3, Math.round(Number(u.kolom) || BAWAAN.kolom))),
      /* Dijepit DI SINI, bukan hanya lewat atribut min/max di layar: `type=number`
         tidak menghalangi angka yang diketik langsung, dan huruf 40mm pada stiker
         15mm menghasilkan stiker yang isinya cuma satu huruf raksasa. Sama
         persis alasannya dengan `printer_umpan` di app.js. */
      /* Dibulatkan ke satu desimal. Stepper `step="0.1"` pada sebagian peramban
         menghasilkan 2.7000000000000006, dan angka sepanjang itu muncul apa
         adanya di kolomnya — terbaca sebagai aplikasi yang mengarang angka. */
      huruf_kode_mm: _satuDesimal(Math.max(1.2, Math.min(8, Number(u.huruf_kode_mm) || BAWAAN.huruf_kode_mm))),
      huruf_nama_mm: _satuDesimal(Math.max(1.2, Math.min(8, Number(u.huruf_nama_mm) || BAWAAN.huruf_nama_mm))),
      /* Nol DIPERTAHANKAN — ia berarti "otomatis", bukan "kosong". */
      tinggi_bar_mm: _satuDesimal(Math.max(0, Math.min(60, Number(u.tinggi_bar_mm) || 0))),
      baris_nama: batasBarisNama(u)
    };
    await DB.kvSet('label_ukuran', bersih);
    return bersih;
  }

  /* ---------- Profil isi stiker (bagian 332; di SERVER sejak bagian 340) ----------
   * Pemilik, 4 Okt 2026: "sediakan penyimpanan profile setingan … yang bisa
   * disave dan ada set default", lalu "di sini tidak membahas ukuran kertas,
   * saya hanya memikirkan adjust isi kontennya". Jadi profil memuat ISI saja
   * (KUNCI_ISI); ukuran kertas tetap satu set per perangkat di label_ukuran.
   *
   * DI SERVER (bagian 340). Pemilik, 5 Okt 2026: "profile label berlaku server
   * bukan lokal", dan yang boleh mengubahnya hanya Owner. Daftar profil dan
   * profil bawaannya disimpan di setelan `label_profil` (sheet setting, satu
   * baris JSON — tanpa sheet baru) dan turun ke semua perangkat lewat tarik
   * master, jadi tetap terbaca saat offline:
   *   setelan `label_profil`  : { daftar: [{ id, nama, isi }], bawaan: id }
   *   kv `label_profil_aktif` : id yang sedang dibuka di kartu — PER PERANGKAT;
   *                             memilihnya tidak butuh izin maupun internet.
   * Selama server belum punya profil, perangkat memakai daftar lokalnya (kv
   * `label_profil`, bentuk bagian 332). Saat Owner pertama kali mengubah
   * profil, daftar lokal perangkat itulah yang naik ke server.
   */
  const NAMA_PROFIL_MAKS = 30;
  const _setelanApp = () => (typeof APP_STATE !== 'undefined' && APP_STATE && APP_STATE.setting) || null;
  function _profilServer() {
    const s = _setelanApp();
    const t = s && s.label_profil;
    if (!t) return null;
    /* Setelan rusak jatuh ke daftar lokal, bukan ke kartu kosong. */
    try {
      const j = typeof t === 'string' ? JSON.parse(t) : t;
      return j && Array.isArray(j.daftar) && j.daftar.length ? j : null;
    } catch (e) { return null; }
  }
  /** Boleh mengubah daftar profil: hanya pemegang setting·ubah (Owner). Server memeriksa ulang. */
  function bolehUbahProfil() {
    return typeof bolehIzin === 'function' && !!bolehIzin('setting', 'ubah');
  }
  async function profil() {
    const srv = _profilServer();
    let aktif = null;
    try { aktif = await DB.kvGet('label_profil_aktif', null); } catch (e) { aktif = null; }
    let p = null;
    if (srv) p = { daftar: srv.daftar, bawaan: srv.bawaan, aktif: aktif };
    else {
      try { p = await DB.kvGet('label_profil', null); } catch (e) { p = null; }
      if (!p || !Array.isArray(p.daftar) || !p.daftar.length) {
        /* DITULIS saat pertama kali dibuat. Profil yang hanya dirakit di ingatan
           ikut berubah tiap kali setelannya diubah: isi aslinya hilang dan tanda
           "belum disimpan" tidak pernah muncul — ditangkap uji-profil-label,
           4 Okt 2026. Potretnya harus diambil SEKALI, sebelum perubahan apa pun. */
        p = { daftar: [{ id: 'bawaan', nama: 'Bawaan', isi: jepitIsi(await ukuran()) }], bawaan: 'bawaan', aktif: 'bawaan' };
        try { await DB.kvSet('label_profil', p); } catch (e) { /* tanpa simpanan: tetap bisa dipakai sesi ini */ }
      }
      p = { daftar: p.daftar, bawaan: p.bawaan, aktif: aktif || p.aktif };
    }
    p.server = !!srv;
    p.daftar = p.daftar.map((x) => ({ id: String(x.id), nama: String(x.nama || ''), isi: jepitIsi(x.isi) }));
    if (!p.daftar.some((x) => x.id === p.bawaan)) p.bawaan = p.daftar[0].id;
    if (!p.daftar.some((x) => x.id === p.aktif)) p.aktif = p.bawaan;
    return p;
  }
  /** Profil yang sedang dibuka: milik PERANGKAT — tanpa izin, tanpa internet. */
  async function _tulisAktif(p, id) {
    p.aktif = id;
    try { await DB.kvSet('label_profil_aktif', id); } catch (e) { /* cukup untuk sesi ini */ }
    if (!p.server) { try { await DB.kvSet('label_profil', { daftar: p.daftar, bawaan: p.bawaan, aktif: id }); } catch (e) { /* idem */ } }
    return p;
  }
  /** Daftar & bawaan: milik SERVER — hanya Owner, dan butuh internet. Gagal = tidak ada yang berubah. */
  async function _tulisDaftar(p) {
    if (!bolehUbahProfil()) throw new Error('Profil label hanya bisa diubah Owner. Memilih profil tetap boleh.');
    const nilai = JSON.stringify({ daftar: p.daftar.map((x) => ({ id: x.id, nama: x.nama, isi: jepitIsi(x.isi) })), bawaan: p.bawaan });
    await API.simpanSetting({ setting: { label_profil: nilai } });
    const s = _setelanApp();
    if (s) {
      s.label_profil = nilai;
      try { await DB.kvSet('setting', s); } catch (e) { /* tarik master berikutnya membawanya */ }
    }
    p.server = true;
    return _tulisAktif(p, p.aktif);
  }
  function _namaProfilSah(p, nama, kecualiId) {
    const n = String(nama == null ? '' : nama).replace(/\s+/g, ' ').trim();
    if (!n) throw new Error('Nama profil wajib diisi.');
    if (n.length > NAMA_PROFIL_MAKS) throw new Error('Nama profil paling panjang ' + NAMA_PROFIL_MAKS + ' huruf.');
    if (p.daftar.some((x) => x.id !== kecualiId && x.nama.toLowerCase() === n.toLowerCase())) throw new Error('Sudah ada profil bernama "' + n + '".');
    return n;
  }
  const _cariProfil = (p, id) => { const x = p.daftar.filter((y) => y.id === String(id))[0]; if (!x) throw new Error('Profil tidak ditemukan.'); return x; };

  /** Tulis setelan isi yang sedang terpasang ke profil `id`. */
  async function simpanProfil(id) {
    const p = await profil();
    _cariProfil(p, id).isi = jepitIsi(await ukuran());
    return _tulisDaftar(p);
  }
  /** Profil baru dari setelan isi yang sedang terpasang; langsung jadi yang aktif. */
  async function profilBaru(nama) {
    const p = await profil();
    const n = _namaProfilSah(p, nama, null);
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    p.daftar.push({ id, nama: n, isi: jepitIsi(await ukuran()) });
    p.aktif = id;
    return _tulisDaftar(p);
  }
  async function gantiNamaProfil(id, nama) {
    const p = await profil();
    const x = _cariProfil(p, id);
    x.nama = _namaProfilSah(p, nama, x.id);
    return _tulisDaftar(p);
  }
  async function hapusProfil(id) {
    const p = await profil();
    const x = _cariProfil(p, id);
    if (p.daftar.length === 1) throw new Error('Profil terakhir tidak bisa dihapus.');
    if (x.id === p.bawaan) throw new Error('Profil bawaan tidak bisa dihapus — jadikan profil lain bawaan dulu.');
    p.daftar = p.daftar.filter((y) => y.id !== x.id);
    if (p.aktif === x.id) p.aktif = p.bawaan;
    return _tulisDaftar(p);
  }
  async function jadikanBawaan(id) {
    const p = await profil();
    p.bawaan = _cariProfil(p, id).id;
    return _tulisDaftar(p);
  }
  /** Buka profil `id` di kartu: isinya dipasang ke label_ukuran (ukuran kertas tidak disentuh). */
  async function pilihProfil(id) {
    const p = await profil();
    const x = _cariProfil(p, id);
    await _tulisAktif(p, x.id);
    return simpanUkuran(Object.assign(await ukuran(), x.isi));
  }
  /** Ukuran kertas perangkat ini + isi profil `id` — untuk Keranjang stiker. Tidak menyimpan apa pun. */
  async function ukuranProfil(id) {
    const p = await profil();
    return Object.assign(await ukuran(), _cariProfil(p, id).isi);
  }
  /** Apakah setelan isi yang terpasang berbeda dari profil aktifnya (belum disimpan)? */
  async function profilBerubah() {
    const p = await profil();
    return JSON.stringify(jepitIsi(await ukuran())) !== JSON.stringify(_cariProfil(p, p.aktif).isi);
  }

  /**
   * Kode yang dicetak untuk sebuah produk. `null` hanya bila keduanya kosong.
   *
   * Kalau produknya punya BARCODE PABRIK, yang dicetak barcode itu — bukan SKU.
   *
   * Sampai v1.90 fungsi ini mengembalikan `null` untuk produk berbarcode, dan
   * layar Produk memakainya untuk MENYEMBUNYIKAN tombol Label sama sekali.
   * Kekhawatirannya waktu itu benar: dua barcode berbeda di satu barang berakhir
   * dengan kasir men-scan yang salah.
   *
   * Yang keliru jalan keluarnya. Menyembunyikan tombol menghilangkan gejalanya,
   * bukan bahayanya — sekaligus menghilangkan satu-satunya cara mencetak stiker
   * untuk barang yang stiker pabriknya sobek, pudar, atau tertutup label harga.
   * Dilaporkan pemilik 4 Sep 2026: "ada salah satu produk yang tidak ada tombol
   * label" (SKU CS01040075).
   *
   * Mencetak barcode pabriknya menutup bahayanya SUNGGUHAN: kedua stiker
   * memindai ke kode yang sama, jadi tidak ada lagi "yang salah" untuk discan.
   */
  function kodeProduk(p) {
    const bc = String((p && p.barcode) || '').trim();
    if (bc) return bc;
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
           ukuran, simpanUkuran, cetak, barisPratinjau, pratinjauSemua, jumlahBarisCetak,
           slotDipakai, jumlahKolom, pecahNama, jepitIsi, KUNCI_ISI,
           profil, simpanProfil, profilBaru, gantiNamaProfil, hapusProfil, jadikanBawaan,
           pilihProfil, ukuranProfil, profilBerubah, bolehUbahProfil,
           BAWAAN, HURUF, POLA, TITIK_PER_MM, mmKeTitik };
})();

/* Inti murninya diekspor untuk diuji di Node: penyandi CODE128, penyusun pola
   batang dan penyusun lembar cetak tidak menyentuh DOM maupun printer sama
   sekali, jadi ia bisa dibuktikan sampai ke nilai simbolnya tanpa peramban. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Label;
}
