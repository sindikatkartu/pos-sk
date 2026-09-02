/**
 * POS SINDIKAT KARTU — pos.js
 * Mesin harga & keranjang. Ini logika bisnis paling kritis di sisi kasir:
 * salah sedikit di sini, seluruh laporan laba ikut salah.
 *
 * Urutan penentuan harga (yang lebih spesifik menang):
 *   1. Satuan bertingkat  (lusin/box)  -> harga satuan tersebut menurut level pelanggan
 *   2. Tier qty           (>= qty_min) -> hanya berlaku untuk satuan dasar
 *   3. Harga level dasar  (eceran / grosir)
 *   4. + selisih harga varian
 */
const Harga = (() => {

  /**
   * @param {Object} p     produk { sku, satuan, harga:{eceran,grosir} }
   * @param {Object} opsi  { level, qty, satuan, varian, daftarSatuan, daftarTier }
   * @return {Object} { harga_satuan, faktor, satuan, sumber }
   */
  function hitung(p, opsi = {}) {
    /* Dinormalkan SEKALI di sini, lalu dipakai jalur tier maupun jalur level
       dasar. Sebelumnya hanya pilihLevel() yang memetakan reseller, sedangkan
       pencarian tier tetap memakai nilai mentah — jadi pelanggan reseller lama
       mendapat harga grosir dasar tapi kehilangan seluruh diskon qty-nya.
       Diam, tanpa galat, dan arahnya selalu merugikan pelanggan. */
    const level = normalLevel(opsi.level);
    const qty = Number(opsi.qty) || 1;
    const satuan = opsi.satuan || p.satuan || 'pcs';
    const daftarSatuan = opsi.daftarSatuan || [];
    const daftarTier = opsi.daftarTier || [];

    let harga, faktor = 1, sumber = 'level';

    // 1) Satuan bertingkat
    if (satuan !== (p.satuan || 'pcs')) {
      const s = daftarSatuan.find(x => x.nama === satuan);
      if (!s) throw new Error(`Satuan "${satuan}" tidak terdaftar untuk ${p.sku}`);
      faktor = Number(s.isi) || 1;
      harga = pilihLevel(s.harga, level);
      // Bila harga satuan turunan belum diisi, turunkan dari harga dasar × isi
      if (!harga) harga = pilihLevel(p.harga, level) * faktor;
      sumber = 'satuan';
    } else {
      // 2) Tier qty (hanya untuk satuan dasar) — daftar sudah terurut menurun di server
      const tier = daftarTier
        .filter(t => t.level === level && qty >= Number(t.qty_min))
        .sort((a, b) => b.qty_min - a.qty_min)[0];
      if (tier) { harga = Number(tier.harga); sumber = 'tier'; }
      else      { harga = pilihLevel(p.harga, level); }
    }

    // 4) Selisih varian
    if (opsi.varian && opsi.varian.selisih) harga += Number(opsi.varian.selisih);

    if (!(harga > 0)) throw new Error(`Harga ${p.sku} belum diatur untuk level ${level}`);
    return { harga_satuan: bulat(harga), faktor, satuan, sumber };
  }

  /**
   * Petakan level apa pun ke level yang masih hidup.
   *
   * `reseller` dihapus v1.12 tapi masih ADA di data: baris `pelanggan` lama dan
   * seluruh riwayat `penjualan.level_harga`. Ia dipetakan ke grosir — tingkat
   * terdekat di bawahnya — bukan dibiarkan jatuh ke eceran.
   *
   * Bedanya besar dan senyap: dibiarkan tak dikenal, pelanggan grosir lama
   * mendadak ditagih harga ECERAN, dan tidak ada satu pun galat yang memberi
   * tahu. Notanya tetap tercetak dan tetap seimbang.
   */
  function normalLevel(l) {
    const v = String(l || '').toLowerCase();
    return (v === 'grosir' || v === 'reseller') ? 'grosir' : 'eceran';
  }

  /**
   * Harga menurut level, turun bertingkat bila level itu belum diisi.
   *
   * `reseller` dihapus v1.12, tapi masih ADA di data: baris `pelanggan` lama dan
   * seluruh riwayat `penjualan.level_harga` menyimpannya. Ia sengaja dipetakan ke
   * grosir — tingkat terdekat di bawahnya — bukan dibiarkan jatuh ke eceran.
   *
   * Bedanya besar dan senyap: dibiarkan tak dikenal, pelanggan grosir lama
   * mendadak ditagih harga ECERAN, dan tidak ada satu pun galat yang memberi tahu.
   * Nota tetap tercetak, angkanya saja yang salah.
   */
  function pilihLevel(h, level) {
    if (!h) return 0;
    if (normalLevel(level) === 'grosir') return Number(h.grosir || h.eceran || 0);
    return Number(h.eceran || 0);
  }

  const bulat = (n) => Math.round(Number(n) || 0);

  return { hitung, pilihLevel, normalLevel, bulat };
})();


/**
 * Keranjang belanja. Menyimpan baris, menghitung total, dan menyusun dokumen nota.
 */
const Keranjang = (() => {
  let baris = [];
  let level = 'eceran';
  let pelanggan = null;
  let diskonNota = 0;
  let catatan = '';
  /**
   * Klaim penjualan — siapa yang berhak atas penjualan ini.
   *
   * `petugasNota` berlaku untuk seluruh baris yang TIDAK punya timnya sendiri.
   * Baris yang punya `tim` keluar dari cakupan itu; kalau tidak, pemasangan
   * tempered glass akan terhitung dua kali — sekali untuk timnya, sekali lagi
   * untuk pramuniaga yang memegang notanya.
   *
   * Bentuk anggota: { kode } saja — paling banyak dua orang.
   *
   * Tidak ada peran maupun poin di sini, dan itu disengaja. Peran ditentukan
   * urutan (yang pertama menjual, yang kedua memasang) dan poin berasal dari
   * master produk; keduanya diputuskan server. Menyimpannya di perangkat hanya
   * menciptakan angka kedua yang bisa berbeda dari yang tercatat.
   */
  let petugasNota = [];

  /**
   * Pemasang untuk seluruh nota — SATU kode, bukan daftar.
   *
   * Dipilih sekali di layar bayar dan berlaku pada setiap baris yang butuh
   * dipasang dan belum punya timnya sendiri. Disimpan terpisah, bukan langsung
   * ditulis ke `baris[].tim`, karena penjualnya masih bisa berganti sesudahnya:
   * kalau sudah terlanjur tertulis, tim baris memegang penjual yang lama dan
   * layarnya menampilkan yang baru.
   */
  let pemasangNota = '';

  const total = () => {
    const bruto = baris.reduce((a, b) => a + b.qty * b.harga_satuan, 0);
    const diskonItem = baris.reduce((a, b) => a + (b.diskon || 0), 0);
    const netto = bruto - diskonItem - diskonNota;
    const ppn = APP_STATE.pkp ? Math.round(netto * APP_STATE.tarifPpn / 100) : 0;
    return {
      bruto: Math.round(bruto),
      diskon_item: Math.round(diskonItem),
      diskon_nota: Math.round(diskonNota),
      netto: Math.round(netto),
      ppn,
      total: Math.round(netto + ppn),
      jumlah_item: baris.reduce((a, b) => a + b.qty * b.faktor, 0)
    };
  };

  return {
    get baris()     { return baris; },
    get level()     { return level; },
    get pelanggan() { return pelanggan; },
    get diskonNota(){ return diskonNota; },
    get kosong()    { return baris.length === 0; },
    get petugasNota(){ return petugasNota; },
    total,

    setLevel(l) {
      // Dinormalkan di pintu masuk, supaya nilai yang sudah dihapus tidak pernah
      // sampai ke <select> di layar — di sana ia menghasilkan kotak KOSONG.
      level = Harga.normalLevel(l);
      // Harga seluruh baris dihitung ulang mengikuti level baru
      baris = baris.map(b => this._hitungUlang(b));
    },

    setPelanggan(p) {
      pelanggan = p;
      if (p && p.level_harga) this.setLevel(p.level_harga);
    },

    setDiskonNota(n) { diskonNota = Math.max(0, Math.round(Number(n) || 0)); },

    /**
     * Persentase SELURUH diskon (baris + nota) terhadap nilai bruto.
     *
     * Batas peran harus diukur dari angka gabungan ini, bukan dari salah satunya.
     * Membatasi diskon baris saja meninggalkan kolom "Diskon nota" terbuka lebar —
     * dan itulah celah yang membuat batas kasir 5% dulu tidak ada artinya.
     */
    persenDiskon() {
      const t = total();
      if (t.bruto <= 0) return 0;
      return (t.diskon_item + t.diskon_nota) / t.bruto * 100;
    },
    setCatatan(t)    { catatan = t || ''; },

    /* ---------- Klaim petugas ---------- */

    /** Daftar petugas yang mengklaim seluruh nota (di luar baris yang punya tim). */
    setPetugasNota(daftar) {
      petugasNota = (daftar || []).filter(x => x && x.kode);
    },

    get pemasangNota() { return pemasangNota; },
    setPemasangNota(kode) { pemasangNota = String(kode || ''); },

    /** Ada barang yang butuh dipasang dan belum punya timnya sendiri? */
    adaButuhPasang() {
      return baris.some(b => b.butuh_pasang && !(b.tim || []).length);
    },

    /** Tim yang BERLAKU untuk satu baris — lihat timEfektifBaris(). */
    timEfektif(b) { return timEfektifBaris(b, petugasNota, pemasangNota); },

    /** Nilai poin bawaan sebuah baris: qty dasar x poin per satuan produknya. */
    poinBaris(id) {
      const b = baris.find(x => x.id === id);
      if (!b) return 0;
      return Math.round(b.qty * b.faktor * (Number(b.poin_satuan) || 0) * 100) / 100;
    },

    /**
     * Poin bawaan seluruh baris yang TIDAK punya timnya sendiri — dasar klaim nota.
     *
     * Memakai tim EFEKTIF, bukan `b.tim` mentah: baris yang mendapat pemasang
     * dari layar bayar juga keluar dari klaim nota, dan menghitungnya di sini
     * berarti angka yang ditampilkan memuat pekerjaan yang bukan lagi miliknya.
     */
    poinSisaNota() {
      return Math.round(baris.reduce((a, b) =>
        a + (timEfektifBaris(b, petugasNota, pemasangNota).length
             ? 0 : b.qty * b.faktor * (Number(b.poin_satuan) || 0)), 0) * 100) / 100;
    },

    /** Tim yang mengerjakan satu baris. Daftar kosong = baris itu ikut klaim nota. */
    setTimBaris(id, daftar) {
      const b = baris.find(x => x.id === id);
      if (!b) return;
      const bersih = (daftar || []).filter(x => x && x.kode);
      if (bersih.length) b.tim = bersih; else delete b.tim;
    },

    timBaris(id) {
      const b = baris.find(x => x.id === id);
      return (b && b.tim) ? b.tim : [];
    },


    _hitungUlang(b) {
      const h = Harga.hitung(b._produk, {
        level, qty: b.qty, satuan: b.satuan, varian: b._varian,
        daftarSatuan: b._satuan, daftarTier: b._tier
      });
      return { ...b, harga_satuan: b.hargaManual ? b.harga_satuan : h.harga_satuan,
               faktor: h.faktor, sumber_harga: h.sumber };
    },

    /** Tambah produk. Bila SKU+varian+satuan sudah ada, qty-nya ditambah. */
    tambah(produk, { qty = 1, satuan = null, varian = null, daftarSatuan = [], daftarTier = [] } = {}) {
      const st = satuan || produk.satuan || 'pcs';
      const kodeVarian = varian ? varian.kode : '';
      const idx = baris.findIndex(b => b.sku === produk.sku && b.kode_varian === kodeVarian && b.satuan === st);

      if (idx >= 0 && !baris[idx].hargaManual) {
        baris[idx].qty += qty;
        baris[idx] = this._hitungUlang(baris[idx]);   // qty naik bisa memicu tier harga
        return baris[idx];
      }
      // Baris ber-qty 0 pernah lolos ke nota lewat jalur "ganti satuan"
      // (hapus lalu tambah ulang) saat kolom qty sedang kosong.
      if (!(Number(qty) > 0)) throw new Error('Qty harus lebih dari 0.');
      const h = Harga.hitung(produk, { level, qty, satuan: st, varian,
                                        daftarSatuan, daftarTier });
      const b = {
        id: 'B' + Date.now() + Math.floor(Math.random() * 1000),
        sku: produk.sku, kode_varian: kodeVarian,
        nama: produk.nama + (varian ? ' — ' + varian.nama : ''),
        qty, satuan: st, faktor: h.faktor,
        harga_satuan: h.harga_satuan, diskon: 0,
        sumber_harga: h.sumber, hargaManual: false,
        // Disalin ke baris, bukan dibaca ulang dari produk saat dibutuhkan: baris
        // nota harus tetap tahu ia butuh tim dan bernilai berapa poin walau master
        // produk berubah di tengah transaksi (mis. tarik master kebetulan jalan
        // saat itu juga).
        butuh_tim: !!produk.butuh_tim,
        butuh_pasang: !!produk.butuh_pasang,
        poin_satuan: Number(produk.poin_satuan) || 0,
        _produk: produk, _varian: varian, _satuan: daftarSatuan, _tier: daftarTier
      };
      baris.push(b);
      return b;
    },

    /**
     * Ubah qty sebuah baris.
     *
     * Nilainya diterima MENTAH, bukan sudah lewat Number(). Sebabnya: Number('')
     * bernilai 0, sehingga "kolom sedang dikosongkan untuk diketik ulang" tidak
     * bisa dibedakan dari "qty-nya nol" — dan barisnya terhapus tepat saat kasir
     * hendak mengoreksinya. Penjagaannya ditaruh di sini, bukan di pemanggil,
     * supaya berlaku juga untuk pemanggil berikutnya.
     */
    ubahQty(id, qty) {
      const i = baris.findIndex(b => b.id === id);
      if (i < 0) return;
      // Termasuk yang hanya berisi spasi: Number('   ') juga bernilai 0.
      if (qty === null || qty === undefined || String(qty).trim() === '') return;
      const n = Number(qty);
      if (!Number.isFinite(n)) return;
      if (n <= 0) { baris.splice(i, 1); return; }
      baris[i].qty = n;
      baris[i] = this._hitungUlang(baris[i]);
    },

    /** Ubah harga manual — hanya boleh bila peran punya flag ubah_harga_saat_jual. */
    ubahHarga(id, harga) {
      const b = baris.find(x => x.id === id);
      if (!b) return;
      b.harga_satuan = Math.round(Number(harga) || 0);
      b.hargaManual = true;
      b.sumber_harga = 'manual';
    },

    /** Diskon per baris. Dibatasi flag diskon_maks_persen dari peran. */
    ubahDiskon(id, nilai, persen = false) {
      const b = baris.find(x => x.id === id);
      if (!b) return;
      const bruto = b.qty * b.harga_satuan;
      let d = persen ? bruto * (Number(nilai) || 0) / 100 : (Number(nilai) || 0);
      const maks = bruto * (APP_STATE.diskonMaks || 0) / 100;
      if (d > maks) { d = maks; b.diskonDipotong = true; } else { b.diskonDipotong = false; }
      b.diskon = Math.round(Math.max(0, Math.min(d, bruto)));
    },

    hapus(id) { baris = baris.filter(b => b.id !== id); },

    kosongkan() {
      baris = []; diskonNota = 0; catatan = ''; pelanggan = null; level = 'eceran';
      // Petugas nota ikut dikosongkan. Membiarkannya menempel ke nota berikutnya
      // terasa praktis, tapi berarti pramuniaga sebelumnya diam-diam mengklaim
      // penjualan yang tidak ia layani.
      petugasNota = [];
      pemasangNota = '';
    },

    /** Susun dokumen nota yang akan disimpan lokal & dikirim ke server. */
    dokumen({ uuid, no_nota, id_shift, bayar, jatuh_tempo, id_otorisasi, garansi_hari }) {
      const t = total();
      const now = new Date();
      const tgl = tanggalLokal(now);
      // Dibulatkan & tidak boleh negatif — kolom preset di layar Bayar sudah
      // menjamin ini, tapi dokumen() tidak boleh percaya begitu saja pada
      // pemanggilnya sendiri.
      const garansiHari = Math.max(0, Math.round(Number(garansi_hari) || 0));
      return {
        uuid, no_nota,
        tanggal: tgl,
        jam: now.toTimeString().substring(0, 8),
        id_shift,
        kode_pelanggan: pelanggan ? pelanggan.kode : '',
        level_harga: level,
        item: baris.map(b => ({
          sku: b.sku, kode_varian: b.kode_varian, nama: b.nama,
          qty: b.qty, satuan: b.satuan, faktor: b.faktor,
          harga_satuan: b.harga_satuan, diskon: b.diskon,
          /* Tim EFEKTIF, bukan `b.tim` mentah: pemasang yang dipilih di layar
             bayar harus ikut terkirim, kalau tidak layarnya menyebut sebuah nama
             dan notanya tidak — dan selisihnya baru ketahuan saat bagi hasil,
             saat sudah tidak ada yang ingat notanya.
             Isinya tetap dikirim mentah; server yang memutuskan sah atau tidak. */
          klaim: timEfektifBaris(b, petugasNota, pemasangNota).map(t => ({ kode: t.kode }))
        })),
        klaim: petugasNota.map(t => ({ kode: t.kode })),
        bayar,
        diskon_nota: t.diskon_nota,
        ppn: t.ppn,
        total: t.total,
        jatuh_tempo: jatuh_tempo || '',
        // 0 berarti "tidak ada garansi" — garansi_sampai sengaja dikosongkan,
        // bukan ditulis sama dengan tanggal nota, supaya struk & layar Riwayat
        // tidak perlu menerka apakah "0 hari" berarti tidak bergaransi atau
        // bergaransi tapi kedaluwarsa hari itu juga.
        garansi_hari: garansiHari,
        garansi_sampai: garansiHari > 0 ? tanggalTambahHari(tgl, garansiHari) : '',
        catatan,
        id_otorisasi: id_otorisasi || '',
        dibuat_lokal: now.toISOString()
      };
    }
  };
})();

/** Tanggal lokal format yyyy-MM-dd (jangan pakai toISOString — itu UTC dan bisa mundur sehari). */
function tanggalLokal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Tambahkan N hari ke tanggal 'yyyy-MM-dd', kembalikan format yang sama.
 *
 * Dipakai untuk menghitung tanggal jatuh tempo garansi. Lewat komponen
 * tahun/bulan/tanggal murni, BUKAN toISOString(), dengan alasan yang sama persis
 * dengan tanggalLokal(): itu UTC dan bisa mundur/maju sehari tergantung jam saat
 * nota dibuat.
 */
function tanggalTambahHari(tglYmd, hari) {
  const b = String(tglYmd).split('-').map(Number);
  return tanggalLokal(new Date(b[0], b[1] - 1, b[2] + (Math.round(Number(hari)) || 0)));
}

/* ==================== TAMPILAN TANGGAL ====================
 * Tanggal DISIMPAN sebagai teks `yyyy-MM-dd` dan dibandingkan sebagai teks di
 * seluruh backend (`String(x.tanggal) >= dari`). Format itu TIDAK boleh diubah —
 * yang diubah hanya rupanya di layar.
 *
 * SATU pemformat untuk seluruh aplikasi. Sebelum ini ada tiga yang berbeda-beda
 * (tglPendek di grafik.js, toLocaleString di app.js, Utilities.formatDate di
 * 17_Ekspor.gs) dan tidak satu pun jadi acuan — tiga rupa tanggal di satu
 * aplikasi membuat orang mengira dua layar menampilkan hal yang berbeda.
 */

/**
 * `yyyy-MM-dd` (atau ISO lengkap) -> `DD/MM/YYYY`. Untuk DILIHAT, bukan disimpan.
 *
 * TAHUNNYA EMPAT ANGKA, dan itu keputusan pemilik (2 Sep 2026): "semua bagian
 * yang berkaitan dengan tanggal harus DD/MM/YYYY". Sebelumnya dua angka —
 * `25/08/26`. Dua angka menghemat tiga karakter dan membeli satu keraguan:
 * pada dokumen yang dicetak dan disimpan bertahun-tahun, `03/04/26` bisa
 * dibaca sebagai 2026 atau 1926, dan tidak ada apa pun di kertas itu yang
 * menjawabnya.
 *
 * Nilai yang tidak berbentuk tanggal harian dikembalikan APA ADANYA, tidak
 * dipaksa: `yyyy-MM` (periode bulanan) tetap utuh, dan data rusak tampil rusak
 * alih-alih menjelma jadi tanggal yang tampak masuk akal.
 */
function tglTampil(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * `yyyy-MM-ddTHH:mm:ss` (atau berspasi) -> `DD/MM/YYYY HH:mm:ss`.
 *
 * Detiknya ikut kalau ada di sumbernya; yang dipotong hanya milidetik dan zona
 * waktu, karena keduanya tidak pernah dibaca manusia dan hanya memanjangkan
 * lajur tabel.
 */
function waktuTampil(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '—';
  const jam = s.length > 10 ? ' ' + s.substring(11, 19) : '';
  const tgl = tglTampil(s);
  return tgl === s ? s : tgl + jam;
}

/**
 * Bagian JAM saja, `HH:mm:ss`. Untuk kalimat yang tanggalnya sudah jelas dari
 * kalimatnya sendiri ("dikunci pada 14:30:05" — hari ini, baru saja).
 *
 * Ada di sini, bukan dipotong di tempat pemakaian: tiap pemotongan sendiri
 * adalah satu tempat lagi yang bisa berbeda dari yang lain, dan itulah yang
 * membuat tiga tempat menggambar ISO mentah sampai 2 Sep 2026.
 */
function jamTampil(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '—';
  const m = /(\d{2}:\d{2}(?::\d{2})?)/.exec(s.length > 10 ? s.substring(10) : s);
  return m ? m[1] : s;
}

/** Penomoran nota yang aman offline: prefix cabang + kode perangkat + urutan lokal. */
async function nomorNotaBerikutnya(prefixCabang, kodePerangkat) {
  const d = new Date();
  const ym = String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0');
  // Dinaikkan dalam satu transaksi — lihat DB.naikkan(). Pola baca-lalu-tulis
  // yang lama bisa menghasilkan dua nota bernomor sama dari dua tab sekaligus.
  const urut = await DB.naikkan('urut_' + ym);
  return `${prefixCabang}-${kodePerangkat}/${ym}/${String(urut).padStart(5, '0')}`;
}

/* ==================== KOLOM ANGKA ====================
 *
 * Dua keluhan pemakai yang sebenarnya satu perkara:
 *
 *   1. Kolom yang sudah berisi `0` memaksa kasir menggeser kursor dan menghapus
 *      dulu sebelum bisa mengetik — tiga sentuhan untuk satu angka, puluhan kali
 *      sehari.
 *   2. `1500000` tidak terbaca. Satu nol lebih atau kurang tidak kelihatan
 *      sampai notanya tercetak.
 *
 * Jawaban no.1: isi kolom DIPILIH otomatis saat difokus, jadi ketikan pertama
 * langsung menimpanya. Berlaku untuk semua kolom angka, termasuk qty.
 *
 * Jawaban no.2: kolom uang bertitik ribuan sambil diketik. Ini menuntut kolomnya
 * `type="text"`, karena `type="number"` MENOLAK '1.000' — nilainya jadi kosong
 * dan angkanya hilang tanpa jejak.
 *
 * ⚠️ BAHAYA yang menentukan seluruh bentuk kode di bawah:
 * `Number('1.000')` bukan galat dan bukan NaN — hasilnya **1**. Satu pembaca
 * yang terlewat mengubah Rp 1.000.000 jadi Rp 1, diam-diam. Karena itu ada SATU
 * pengurai bersama (`angkaDari`), pengurainya dipasang di titik PENGUMPULAN
 * (`angka()` dan `kumpulkanAnak()` di admin.js) bukan di tiap pemakai, dan ada
 * uji bagian AS yang mendaftar setiap kolom uang satu per satu.
 *
 * Rupiah di aplikasi ini selalu bilangan bulat — tidak ada sen. Itu sebabnya
 * membuang semua titik aman di sini, dan TIDAK aman untuk `poin_satuan` yang
 * berlangkah 0,5. Pemilahannya lewat class `uang`, bukan menyapu semua kolom.
 */

/* ==================== URUTAN ====================
 *
 * Satu pembanding untuk seluruh aplikasi. Dilaporkan dari lapangan 28 Agu 2026:
 * dropdown dan tabel keluar dengan urutan baris sheet — yaitu urutan orang itu
 * diketik bertahun-tahun lalu, yang bagi pemakainya sama saja dengan acak.
 * Dengan 382 produk, mencari satu nama berarti membaca seluruh daftar.
 *
 * `numeric: true` bukan hiasan. Tanpanya urutan teks murni menghasilkan
 *
 *     Samsung A10 · Samsung A15 · Samsung A2 · Samsung A26 · Samsung A3
 *
 * karena dibandingkan karakter demi karakter. Katalog ini hampir seluruhnya
 * bernama "merek + angka", jadi tanpa perbandingan angka, mengurutkannya nyaris
 * tidak menolong siapa pun. Dengan `numeric`:
 *
 *     Samsung A2 · Samsung A3 · Samsung A10 · Samsung A15 · Samsung A26
 *
 * `sensitivity: 'base'` membuat besar-kecil huruf tidak memisahkan "iPhone"
 * dari "IPHONE" — katalog hasil migrasi memuat keduanya.
 */
const _KOLATOR = (typeof Intl !== 'undefined' && Intl.Collator)
  ? new Intl.Collator('id', { sensitivity: 'base', numeric: true })
  : null;

/** Bandingkan dua teks seperti manusia membacanya. Dipakai dropdown & tabel. */
function urutNama(a, b) {
  const x = String(a == null ? '' : a), y = String(b == null ? '' : b);
  return _KOLATOR ? _KOLATOR.compare(x, y) : (x < y ? -1 : x > y ? 1 : 0);
}

/**
 * SALINAN larik yang sudah urut menurut satu kunci.
 *
 * Mengembalikan salinan, tidak mengurutkan di tempat: sebagian daftar yang
 * diurutkan untuk dropdown juga dipegang APP_STATE dan dibaca bagian lain yang
 * mengandalkan urutan aslinya — urutan anggota tim menentukan PERANNYA (lihat
 * `_peranUrutKlaim`). Mengurutkan di tempat akan menukar penjual dan pemasang.
 */
function urutkanOleh(arr, ambil) {
  return (arr || []).slice().sort((a, b) => urutNama(ambil(a), ambil(b)));
}

/* ==================== PEMASANGAN ====================
 *
 * Diminta pemilik 29 Agu 2026, dari praktik lapangan: tempered glass dipasang,
 * casing tidak; dan sebagian petugas bisa menjual tapi tidak bisa memasang.
 *
 * Dua kolom baru menampung kenyataan itu — `produk.butuh_pasang` dan
 * `petugas.bisa_jual` / `petugas.bisa_pasang` — dan dua fungsi di bawah adalah
 * SATU-SATUNYA tempat aturannya ditulis. Panel "poin masuk ke siapa" di layar
 * bayar, struk, dan isi nota yang dikirim ke server semuanya membacanya dari
 * sini; kalau masing-masing menghitung sendiri, ketiganya pasti berpisah jalan
 * dan yang paling sering salah adalah yang paling jarang dilihat.
 */

/**
 * Petugas yang boleh mengisi sebuah peran.
 *
 * Cadangan "kembalikan semua" bukan kelalaian: kolomnya baru, dan sampai
 * pemiliknya sempat mengisi, menyaring dengan kolom kosong akan mengosongkan
 * dropdown pemasang di layar kasir. Dari lantai toko, dropdown kosong terbaca
 * sebagai aplikasi rusak — bukan sebagai "datanya memang belum diisi".
 */
function petugasUntukPeran(daftar, peran) {
  const semua = daftar || [];
  const kunci = String(peran).toUpperCase() === 'PEMASANG' ? 'bisa_pasang' : 'bisa_jual';
  // Sel Sheets bisa mengirim boolean maupun teks 'true'; keduanya diterima.
  const cocok = semua.filter(p => p && (p[kunci] === true || p[kunci] === 'true'));
  return cocok.length ? cocok : semua;
}

/**
 * Tim yang BERLAKU untuk satu baris keranjang.
 *
 * Pemasang dipilih sekali di layar bayar, lalu menempel hanya pada baris yang
 * memang butuh dipasang. Yang lain tetap ikut klaim nota, karena menempelkan
 * pemasang ke casing berarti memotong poin penjualnya untuk pekerjaan yang
 * tidak pernah ada.
 *
 * Empat keadaan yang dijawab di sini, semuanya pernah jadi pertanyaan nyata:
 *   · tim baris diisi tangan  → itu yang menang, selalu
 *   · penjual = pemasang      → jangan dipecah; satu orang berhak penuh
 *   · belum ada penjual       → pemasang sendirian sah (peran BARIS tunggal
 *                               memang PEMASANG, lihat _peranUrutKlaim)
 *   · klaim nota sudah berdua → pemasangnya sudah disebut; jangan tambah lagi
 */
function timEfektifBaris(baris, petugasNota, pemasangNota) {
  const b = baris || {};
  const tim = b.tim || [];
  if (tim.length) return tim;
  const pemasang = String(pemasangNota || '');
  if (!b.butuh_pasang || !pemasang) return [];
  const nota = petugasNota || [];
  if (nota.length > 1) return [];
  const penjual = String((nota[0] || {}).kode || '');
  if (!penjual) return [{ kode: pemasang }];
  if (penjual === pemasang) return [];
  return [{ kode: penjual }, { kode: pemasang }];
}

/* ==================== MENCARI PRODUK ====================
 *
 * Katalog toko ini punya satu bentuk yang merusak pencarian naif: satu tempered
 * glass cocok untuk sepuluh tipe HP, dan sepuluh tipe itu tidak muat di nama
 * produk. Akibatnya 98 dari 382 SKU memakai salah satu dari empat nama generik
 * — yang terbesar dipakai 41 SKU sekaligus. Mencari lewat nama saja
 * mengembalikan 41 baris yang tidak bisa dibedakan satu pun.
 *
 * Yang membedakannya ada di kolom lain yang MEMANG sudah terisi: tipe_hp, baris
 * produk_kompatibel, dan kata_kunci (tempat menaruh nama barang versi
 * supplier). Ketiganya ikut dicari di sini.
 */

/** Semua teks yang bisa dipakai menemukan satu produk, digabung & huruf kecil. */
function tokenProduk(p) {
  const o = p || {};
  return [o.nama, o.sku, o.barcode, o.merek, o.kategori, o.tipe_hp, o.kata_kunci, o.deskripsi,
          (o.kompatibel || []).map(k => `${k.merek || ''} ${k.tipe || ''}`).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * Cocok bila SETIAP kata pada kueri ada — bukan satu potongan berurutan.
 *
 * Inilah yang tidak bisa dilakukan `<datalist>` bawaan peramban, dan alasan
 * pemilihnya digambar sendiri: dengan puluhan SKU bernama sama, satu kata tidak
 * pernah cukup mempersempit. "og a11" harus menyisakan satu baris, dan dua kata
 * itu hidup di dua kolom yang berbeda.
 */
function cocokProduk(p, kueri) {
  const kata = String(kueri == null ? '' : kueri).toLowerCase().split(/\s+/).filter(Boolean);
  if (!kata.length) return true;
  const t = tokenProduk(p);
  return kata.every(k => t.indexOf(k) !== -1);
}

/**
 * Hasil pencarian yang sudah urut dan dibatasi jumlahnya.
 *
 * Pengurutan keduanya memakai tipe HP, tidak berhenti di nama. Untuk 41 SKU
 * bernama sama, berhenti di nama berarti urutannya ditentukan urutan baris di
 * sheet — urutan yang tidak pernah diputuskan siapa pun. Daftar yang posisinya
 * tidak stabil membuat orang berhenti memakai posisi sebagai petunjuk, lalu
 * membaca seluruh daftar lagi setiap kali.
 *
 * Batas jumlah bukan kerapian: barisnya digambar ulang pada SETIAP ketikan, dan
 * 382 baris per ketikan membuat modalnya tersendat di HP.
 */
function cariProduk(daftar, kueri, batas) {
  const q = String(kueri == null ? '' : kueri).trim().toLowerCase();
  const hasil = (daftar || []).filter(p => cocokProduk(p, q));
  hasil.sort((a, b) => {
    // SKU yang diketik utuh — biasanya disalin dari faktur supplier — didahulukan.
    const sa = String(a.sku || '').toLowerCase() === q ? 0 : 1;
    const sb = String(b.sku || '').toLowerCase() === q ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return urutNama(a.nama, b.nama) || urutNama(a.tipe_hp, b.tipe_hp)
        || urutNama(a.sku, b.sku);
  });
  return hasil.slice(0, batas || 30);
}

/**
 * Teks satu baris untuk produk yang SUDAH dipilih.
 *
 * Nama saja tidak cukup: kolom yang berbunyi "TG OG Multi_Device" tidak memberi
 * tahu apa pun kepada orang berikutnya yang memeriksa faktur itu.
 */
function teksProduk(p) {
  const o = p || {};
  const tipe = String(o.tipe_hp || (o.kompatibel || []).map(k => k.tipe).join(' / ') || '').trim();
  const nama = String(o.nama || o.sku || '').trim();
  return tipe ? nama + ' — ' + tipe : nama;
}

/**
 * Angka dari teks sel tabel, untuk PENGURUTAN saja.
 *
 * Berbeda dari `angkaDari()`, yang membuang seluruh titik dan koma karena
 * rupiah di aplikasi ini selalu bulat. Di sini desimal harus dipertahankan:
 * kolom Poin berlangkah 0,5 dan `angkaDari('0,5')` menghasilkan 5 — yang akan
 * menaruh 0,5 poin DI ATAS 3 poin. Urutan yang salah lebih buruk daripada tidak
 * ada urutan sama sekali, karena ia tetap terlihat rapi.
 */
function angkaUrut(t) {
  const s = String(t == null ? '' : t).replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const n = Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** '1.250.000' → 1250000 · 'Rp 1.000' → 1000 · '-5.000' → -5000 · '' → 0 */
function angkaDari(v) {
  if (typeof v === 'number') return Math.trunc(v) || 0;
  const s = String(v == null ? '' : v);
  const minus = /^\s*-/.test(s);
  const d = s.replace(/\D/g, '');
  if (!d) return 0;
  return (minus ? -1 : 1) * Number(d);
}

/**
 * 1250000 → '1.250.000'
 *
 * Menerima nilai yang SUDAH berformat dan mengembalikannya utuh. Kolom digambar
 * ulang berkali-kali dan nilainya dibaca balik dari DOM; ribuan() yang memakai
 * Number() mentah akan mengubah '1.250.000' jadi '0' — kerugian senyap.
 */
function ribuan(n) {
  const x = angkaDari(n);
  return (x < 0 ? '-' : '') + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Kolom yang dilayani. Sengaja TIDAK memakai `inputmode`: kolom PIN bertype
 * password + inputmode=numeric, dan memilih isi kolom sandi bukan perilaku yang
 * diminta siapa pun.
 */
function kolomAngka(el) {
  return !!el && el.tagName === 'INPUT' && !el.disabled && !el.readOnly &&
         (el.type === 'number' || (el.classList && el.classList.contains('uang')));
}

/** Rapikan titik ribuan satu kolom, dengan kursor tetap di tempatnya. */
function rapikanUang(el) {
  const lama = String(el.value);
  /* Kolom kosong dibiarkan kosong (placeholder-nya masih berguna), dan '-'
     sendirian adalah keadaan sah di tengah mengetik angka negatif. */
  if (lama.trim() === '' || lama.trim() === '-') return;
  const baru = ribuan(lama);
  if (baru === lama) return;
  /* Kursor dihitung dari JUMLAH ANGKA di kirinya, bukan indeks huruf — titik
     yang baru muncul menggeser indeks, angkanya tidak. */
  const sebelum = (lama.slice(0, el.selectionStart == null ? lama.length : el.selectionStart)
                       .match(/\d/g) || []).length;
  el.value = baru;
  let i = 0, n = 0;
  while (i < baru.length && n < sebelum) { if (baru.charCodeAt(i) > 47 && baru.charCodeAt(i) < 58) n++; i++; }
  try { el.setSelectionRange(i, i); } catch (e) { /* sebagian peramban menolak */ }
}

function pasangKolomAngka(akar) {
  const doc = akar || document;

  doc.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!kolomAngka(el)) return;
    el._baruFokus = true;
    el._nilaiFokus = el.value;
    try { el.select(); } catch (err) {}
    /* Sebagian peramban menaruh kursornya SESUDAH focusin selesai; pemilihan
       diulang di gilir berikutnya supaya tidak keburu batal.
       ⚠️ Isi kolomnya DIPERIKSA dulu — dan inilah bagian yang pernah salah.
       "Gilir berikutnya" tidak dijamin datang sebelum orangnya mengetik: kalau
       mesinnya sibuk, ia tiba SESUDAH angka pertama masuk. Yang terpilih lalu
       bukan angka lama melainkan angka yang baru diketik, dan ketikan
       berikutnya menimpanya — Rp 250.000 menjadi Rp 50.000, masih masuk akal
       di layar, tanpa satu pun galat. Terjadi sungguhan 29 Agu 2026, dan hanya
       di mesin yang lebih lambat. Kalau isinya sudah berubah, berarti orangnya
       sudah memegang kendali dan pemilihan ulang tidak berhak lagi. */
    setTimeout(() => {
      if (document.activeElement === el && el._baruFokus && el.value === el._nilaiFokus) {
        try { el.select(); } catch (err) {}
      }
    }, 0);
  });

  /* Dengan tetikus, klik menaruh kursor lewat mouseup — sesudah focusin — dan
     itu membatalkan pemilihannya. mouseup PERTAMA sesudah fokus dibatalkan;
     klik kedua tetap bisa menaruh kursor seperti biasa. */
  doc.addEventListener('mouseup', (e) => {
    const el = e.target;
    if (kolomAngka(el) && el._baruFokus) { el._baruFokus = false; e.preventDefault(); }
  });
  doc.addEventListener('focusout', (e) => { if (e.target) e.target._baruFokus = false; });

  /* Satu penyimak untuk seluruh aplikasi: kolom yang digambar belakangan oleh
     admin.js ikut terlayani tanpa perlu didaftarkan satu per satu. */
  doc.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('uang')) rapikanUang(el);
  });
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  pasangKolomAngka(document);
}

/**
 * Peran ditentukan URUTAN, bukan dipilih kasir. Cermin persis `_peranUrut()` di
 * 21_Klaim.gs — kalau keduanya berbeda, struk menyebut peran yang tidak sama
 * dengan yang dicatat sistem, dan tidak ada satu pun galat yang memberi tahu.
 */
function _peranUrutKlaim(jumlah, jenis) {
  if (jumlah <= 1) return [jenis === 'BARIS' ? 'PEMASANG' : 'PENJUAL'];
  return ['PENJUAL', 'PEMASANG'];
}

/**
 * SATU daftar tunggal "siapa mengerjakan apa di nota ini".
 *
 * MASALAH YANG DISELESAIKAN (dilaporkan dari lapangan 28 Agu 2026, hari pertama
 * jualan). Ada dua tempat mengisi petugas — dropdown "Pramuniaga" untuk seluruh
 * nota, dan tombol "Tim" untuk satu baris — dan aturannya: baris yang punya tim
 * sendiri KELUAR dari klaim nota. Aturannya benar, tapi hasilnya tidak pernah
 * ditampilkan sebagai satu kesatuan:
 *
 *   · layar bayar hanya menyebut klaim NOTA
 *   · struk hanya mencetak klaim NOTA
 *   · yang memasang tempered glass tidak muncul di keduanya
 *
 * Jadi orang yang mengerjakan pekerjaan paling berat justru tidak terlihat di
 * mana pun sampai Laporan poin dibuka berhari-hari kemudian — sementara nama
 * yang TERCETAK di struk adalah orang yang tidak mengerjakan baris itu. Dari
 * lantai toko, itu terbaca sebagai dua aturan yang saling bertentangan.
 *
 * Fungsi ini jawabannya: dua jalur PENGISIAN boleh tetap berbeda (yang cepat
 * untuk nota biasa, yang rinci untuk baris pemasangan), tapi HASILNYA satu.
 * Layar bayar dan struk sama-sama membacanya dari sini — bukan masing-masing
 * menyusun daftarnya sendiri, karena dua penyusun selalu berakhir berbeda.
 *
 * Murni: tidak menyentuh APP_STATE/CONFIG/DOM, jadi bisa diuji di Node.
 * Menerima bentuk nota SIAP KIRIM (`item[].klaim`) maupun bentuk keranjang
 * (`item[].tim`) — layar bayar memakai yang kedua, sebelum notanya ada.
 *
 * Kode yang tidak ada di `daftarPetugas` (petugasnya sudah dinonaktifkan sejak
 * nota lama itu dibuat) ditampilkan APA ADANYA sebagai kode, bukan disembunyikan:
 * nota yang bisu lebih berbahaya daripada nota yang menyebut kode mentah.
 *
 * @param {{klaim?: Array, item?: Array}} nota
 * @param {Array<{kode:string,nama:string}>} daftarPetugas
 * @return {{penjual: string[], pemasang: string[],
 *           rinci: Array<{kode:string,nama:string,peran:string,pekerjaan:string}>,
 *           adaSisaNota: boolean, tanpaPetugas: string[]}}
 */
function susunPeranNota(nota, daftarPetugas) {
  const namaDari = (kode) => {
    const p = (daftarPetugas || []).find(x => String(x.kode) === String(kode));
    return p ? p.nama : String(kode);
  };
  const hasil = { penjual: [], pemasang: [], rinci: [], adaSisaNota: false, tanpaPetugas: [] };
  const sudah = {};
  const tambah = (peran, kode, pekerjaan) => {
    if (!kode) return;
    const nama = namaDari(kode);
    hasil.rinci.push({ kode: String(kode), nama: nama, peran: peran, pekerjaan: pekerjaan });
    /* Daftar nama untuk struk DIBUAT UNIK per peran. Satu orang yang memasang
       tiga baris cukup disebut sekali; mengulang namanya tiga kali membuat
       struk panjang tanpa menambah satu pun keterangan baru. */
    const kunci = peran + '|' + kode;
    if (sudah[kunci]) return;
    sudah[kunci] = true;
    (peran === 'PEMASANG' ? hasil.pemasang : hasil.penjual).push(nama);
  };

  const item = (nota && Array.isArray(nota.item)) ? nota.item : [];
  item.forEach(function (it) {
    const tim = (Array.isArray(it.klaim) && it.klaim.length) ? it.klaim
              : (Array.isArray(it.tim) ? it.tim : []);
    if (!tim.length) {
      hasil.adaSisaNota = true;
      // Baris berpoin yang tidak punya tim DAN tidak tertutup klaim nota =
      // pekerjaan yang tidak ada pemiliknya. Dikumpulkan supaya layar bayar bisa
      // menyebutnya sebelum notanya ditutup, bukan sesudah.
      if (Number(it.poin_satuan) > 0) hasil.tanpaPetugas.push(String(it.nama || it.sku || ''));
      return;
    }
    const peran = _peranUrutKlaim(tim.length, 'BARIS');
    tim.slice(0, 2).forEach((a, i) => tambah(peran[i], a.kode, String(it.nama || it.sku || '')));
  });

  /* Nota tanpa satu baris pun dianggap PUNYA sisa: dipakai layar Uji cetak dan
     nota lama yang itemnya tidak ikut tersimpan. Tanpa ini klaim notanya lenyap
     dari struk hanya karena daftar itemnya kosong. */
  if (!item.length) hasil.adaSisaNota = true;

  if (hasil.adaSisaNota) {
    const klaim = (nota && Array.isArray(nota.klaim)) ? nota.klaim : [];
    const peran = _peranUrutKlaim(klaim.length, 'NOTA');
    klaim.slice(0, 2).forEach((a, i) => tambah(peran[i], a.kode, 'nota'));
  } else {
    /* Seluruh baris sudah punya timnya sendiri, jadi klaim nota memang TIDAK
       dipakai sistem. Ia tidak boleh ikut tercetak — struk yang menyebut nama
       yang tidak mendapat apa-apa persis sumber kebingungan yang diperbaiki. */
    hasil.tanpaPetugas = [];
  }
  return hasil;
}

/**
 * Penjual & Pemasang dari klaim TINGKAT NOTA saja.
 *
 * Dipertahankan sebagai pembungkus tipis di atas `susunPeranNota()` — BUKAN
 * disalin ulang — supaya aturan peran hidup di satu tempat. Dua salinan aturan
 * yang sama selalu berpisah jalan, dan yang berpisah di sini berarti struk
 * menyebut peran yang berbeda dari yang dicatat sistem.
 *
 * @return {{penjual: ?string, pemasang: ?string}}
 */
function resolvePenjualPemasang(nota, daftarPetugas) {
  const r = susunPeranNota({ klaim: (nota || {}).klaim, item: [] }, daftarPetugas);
  return { penjual: r.penjual[0] || null, pemasang: r.pemasang[0] || null };
}

// Ekspor untuk pengujian di Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Harga, tanggalLokal, tanggalTambahHari, tglTampil, waktuTampil, jamTampil,
                     angkaDari, ribuan, susunPeranNota, resolvePenjualPemasang,
                     urutNama, urutkanOleh, angkaUrut,
                     tokenProduk, cocokProduk, cariProduk, teksProduk,
                     timEfektifBaris, petugasUntukPeran };
}
