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
   * Bentuk anggota: { kode, peran, poin }. `poin` boleh dikosongkan SEMUA, dan
   * server membagi poin bawaan produk menurut bobot peran. Yang tidak boleh:
   * mengisi sebagian saja — itu ditolak, bukan ditebak.
   *
   * Jumlah poin TIDAK harus 100. Porsi omzet & laba diturunkan server dari
   * perbandingan poinnya, jadi satu angka mengerjakan dua hal sekaligus.
   */
  let petugasNota = [];

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

    /** Nilai poin bawaan sebuah baris: qty dasar x poin per satuan produknya. */
    poinBaris(id) {
      const b = baris.find(x => x.id === id);
      if (!b) return 0;
      return Math.round(b.qty * b.faktor * (Number(b.poin_satuan) || 0) * 100) / 100;
    },

    /** Poin bawaan seluruh baris yang TIDAK punya timnya sendiri — dasar klaim nota. */
    poinSisaNota() {
      return Math.round(baris.reduce((a, b) =>
        a + ((b.tim || []).length ? 0 : b.qty * b.faktor * (Number(b.poin_satuan) || 0)), 0) * 100) / 100;
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

    /**
     * Baris yang menuntut tim tapi belum punya anggota cukup.
     * Dipakai layar bayar untuk menahan nota SEBELUM dikirim — server memeriksa
     * hal yang sama, tapi kalau hanya server yang menjaga, kasir baru tahu
     * notanya ditolak beberapa menit kemudian saat pelanggannya sudah pergi.
     */
    barisTimKurang() {
      return baris.filter(b => {
        if (!b.butuh_tim) return false;
        const min = Math.max(2, Number(b.min_petugas) || 2);
        return (b.tim || []).length < min;
      });
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
        min_petugas: Number(produk.min_petugas) || (produk.butuh_tim ? 2 : 0),
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
    },

    /** Susun dokumen nota yang akan disimpan lokal & dikirim ke server. */
    dokumen({ uuid, no_nota, id_shift, bayar, jatuh_tempo, id_otorisasi }) {
      const t = total();
      const now = new Date();
      return {
        uuid, no_nota,
        tanggal: tanggalLokal(now),
        jam: now.toTimeString().substring(0, 8),
        id_shift,
        kode_pelanggan: pelanggan ? pelanggan.kode : '',
        level_harga: level,
        item: baris.map(b => ({
          sku: b.sku, kode_varian: b.kode_varian, nama: b.nama,
          qty: b.qty, satuan: b.satuan, faktor: b.faktor,
          harga_satuan: b.harga_satuan, diskon: b.diskon,
          // Tim baris ikut dikirim mentah; server yang memutuskan sah atau tidak.
          klaim: (b.tim || []).map(t => ({ kode: t.kode, peran: t.peran, poin: t.poin }))
        })),
        klaim: petugasNota.map(t => ({ kode: t.kode, peran: t.peran, poin: t.poin })),
        bayar,
        diskon_nota: t.diskon_nota,
        ppn: t.ppn,
        total: t.total,
        jatuh_tempo: jatuh_tempo || '',
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

/** Penomoran nota yang aman offline: prefix cabang + kode perangkat + urutan lokal. */
async function nomorNotaBerikutnya(prefixCabang, kodePerangkat) {
  const d = new Date();
  const ym = String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0');
  // Dinaikkan dalam satu transaksi — lihat DB.naikkan(). Pola baca-lalu-tulis
  // yang lama bisa menghasilkan dua nota bernomor sama dari dua tab sekaligus.
  const urut = await DB.naikkan('urut_' + ym);
  return `${prefixCabang}-${kodePerangkat}/${ym}/${String(urut).padStart(5, '0')}`;
}

// Ekspor untuk pengujian di Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Harga, tanggalLokal };
}
