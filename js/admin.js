/**
 * POS SINDIKAT KARTU — admin.js
 * Modul back office di dalam aplikasi yang sama.
 *
 * Menu apa yang muncul ditentukan di app.js (daftar MENU + hak akses). File ini hanya
 * mengisi layar yang sudah diizinkan. Server tetap memeriksa ulang setiap panggilan —
 * menyembunyikan menu di sini bukan pengamanan, hanya kenyamanan tampilan.
 *
 * Back office sengaja bekerja ONLINE saja. Berbeda dengan kasir yang harus tetap jalan
 * saat internet mati, pekerjaan admin dilakukan di meja dan justru berbahaya kalau
 * dikerjakan dari data basi.
 */
const Admin = (() => {

  let cacheProduk = [], cachePeran = null, cacheKamus = null;

  /* ==================== Helper tampilan ==================== */

  /* Dibungkus `.gulir-x` — bukan mengandalkan `.kartu { overflow-x: auto }` yang
     hanya hidup di bawah 760px. Sejak kolom angka dilarang patah baris, tabel
     lebar menembus bingkai kartunya di rentang 761–±975px: garis kanan kartu
     terlukis melintasi baris data dan kolom terakhir terpotong di luar kartu.
     Pembungkusnya menyelesaikannya di semua lebar, tanpa memberi `.kartu`
     konteks pemformatan baru yang bisa memotong elemen lain di dalamnya.

     Setiap `<td>` membawa `data-l` berisi nama kolomnya. Di HP tegak, `thead`
     disembunyikan dan tiap baris berubah jadi kartu bertumpuk — nama kolomnya
     digambar dari `data-l` lewat `::before`. Tanpa itu, kartu bertumpuk hanya
     menyisakan deretan angka telanjang: "25.000" tanpa keterangan ia modal,
     eceran, atau grosir. Diletakkan di penggambar bersama ini supaya berlaku
     untuk SELURUH tabel back office sekaligus, bukan disalin ke lima belas
     layar satu per satu. */
  const tabelPolos = (kolom, baris, opsi = {}) => `
    <div class="gulir-x">
    <table>
      <thead><tr>${kolom.map(k => `<th class="${k.angka ? 'angka' : ''} ${k.kelas || ''}">${esc(k.judul)}</th>`).join('')}</tr></thead>
      <tbody>${baris.length ? baris.map(r => `<tr ${opsi.dataAttr ? opsi.dataAttr(r) : ''}>${
        kolom.map(k => `<td data-l="${esc(k.judul)}" class="${k.angka ? 'angka' : ''} ${k.kelas || ''}">${
          k.render ? k.render(r) : k.tgl ? esc(tglTampil(r[k.kunci])) : esc(r[k.kunci] ?? '')}</td>`).join('')
      }</tr>`).join('')
        : `<tr><td colspan="${kolom.length}" style="text-align:center;color:var(--teks-redup);padding:28px">${esc(opsi.kosong || 'Belum ada data')}</td></tr>`}
      </tbody>
    </table>
    </div>`;

  /**
   * Tabel master, dengan baris NONAKTIF dikeluarkan dari daftar utama.
   *
   * Produk, pengguna, petugas, pelanggan, supplier dan cabang semuanya bisa
   * dinonaktifkan, dan sebelumnya semua bercampur — barang yang sudah lama stop
   * jual tetap ikut terbaca setiap kali daftarnya dibuka. Tapi menyembunyikannya
   * sama sekali lebih buruk: orang mengira produknya hilang lalu membuat SKU
   * kembar, dan SKU kembar merusak kartu stok.
   *
   * Jalan tengahnya: keluar dari daftar utama, tetap SATU KLIK jauhnya, dengan
   * jumlahnya tertulis supaya tidak perlu dibuka hanya untuk memastikan kosong.
   * Dipasang di penggambar bersama ini, bukan disalin ke enam layar.
   */
  const tabel = (kolom, baris, opsi = {}) => {
    if (!opsi.pisahNonaktif) return tabelPolos(kolom, baris, opsi);
    const rows = baris || [];
    // `aktif !== false`, bukan `aktif === true`: baris lama yang kolomnya belum
    // pernah diisi bernilai undefined, dan itu bukan alasan menyembunyikannya.
    // Sebagian daftar tidak punya kolom `aktif` — perangkat kasir memakai
    // `status: DIBLOKIR`. Karena itu penentunya bisa diberikan pemanggil.
    const mati_p = opsi.nonaktif || ((r) => r.aktif === false);
    const hidup = rows.filter(r => !mati_p(r));
    const mati = rows.filter(mati_p);
    return tabelPolos(kolom, hidup, opsi) + (mati.length ? `
      <details class="blok-nonaktif">
        <summary>Nonaktif <span class="lencana">${mati.length}</span></summary>
        ${tabelPolos(kolom, mati, opsi)}
      </details>` : '');
  };

  const memuat = (el) => { $(el).innerHTML = '<div class="kartu">Memuat…</div>'; };
  const galat = (el, e) => { $(el).innerHTML = `<div class="pesan galat">${esc(e.message || e)}</div>`; };

  function bukaModal(judul, isi, aksi) {
    $('#modalUmum').innerHTML = `<h3>${esc(judul)}</h3>${isi}
      <div class="aksi-modal">${aksi || '<button class="tombol" data-tutup="1">Tutup</button>'}</div>`;
    $('#tiraiUmum').classList.add('tampil');
  }
  const tutupModal = () => $('#tiraiUmum').classList.remove('tampil');

  const nilai = (id) => ($('#' + id)?.value ?? '').trim();
  /**
   * Kolom uang ('1.250.000') diurai lewat angkaDari; sisanya lewat Number.
   *
   * Pemilahannya WAJIB lewat class `uang`, bukan menyapu semua kolom:
   * `pPoinSatuan` berlangkah 0,5 dan membuang titiknya mengubah 0,5 poin jadi
   * 5 poin — bertambah sepuluh kali lipat, diam-diam.
   */
  const angka = (id) => {
    const el = $('#' + id);
    if (!el) return 0;
    return el.classList.contains('uang') ? angkaDari(el.value) : Number(el.value || 0);
  };
  const centang = (id) => !!$('#' + id)?.checked;

  /** Bilang "berhasil" lalu muat ulang layar yang sedang aktif. */
  /**
   * Konfirmasi DULU, baru muat ulang layarnya.
   *
   * Urutan sebaliknya pernah dipakai, dan hasilnya menyesatkan: dokumennya sudah
   * tersimpan begitu server menjawab, tapi notifikasinya tertahan sampai seluruh
   * layar selesai dimuat ulang — beberapa detik pada katalog besar. Selama itu
   * orang mengira simpanannya gagal, lalu menekan tombolnya sekali lagi.
   *
   * Muat ulangnya tetap ditunggu (pemanggilnya berhak tahu kapan selesai), dan
   * tetap terhitung sibuk, jadi penandanya berjalan sampai layarnya benar-benar
   * segar.
   */
  async function sukses(pesanTeks, layar) {
    tutupModal();
    if (pesanTeks) toast(pesanTeks);
    if (layar) await muat(layar);
  }

  function toast(teks, jenis = 'sukses') {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = 'toast ' + jenis;
    el.textContent = teks;
    el.classList.add('tampil');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('tampil'), 3200);
  }

  /* ==================== EKSPOR / UNDUH ==================== */

  /** Ubah base64 dari server menjadi berkas yang terunduh di perangkat. */
  function unduhBase64(nama, mime, b64) {
    const biner = atob(b64);
    const buf = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) buf[i] = biner.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = nama;
    document.body.appendChild(a); a.click(); a.remove();
    // Jeda sebelum melepas URL — Safari sempat gagal mengunduh bila langsung dicabut
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  /**
   * Tombol ekspor: SATU tombol dengan menu pilihan format.
   *
   * Sebelumnya tiga tombol berjajar (Excel · PDF · CSV) di enam layar berbeda.
   * Itu memakan lebar bar alat, dan tiga tombol sederajat memberi kesan tiga
   * pekerjaan berbeda — padahal pekerjaannya satu: mengunduh. Formatnya cuma
   * detail dari pekerjaan itu, jadi tempatnya di dalam menu.
   *
   * `params` disimpan sebagai JSON di atribut, sama seperti versi lama, sehingga
   * pengirim ekspor di bawah tidak perlu tahu tombolnya berbentuk apa.
   */
  const FORMAT_EKSPOR = [
    { kode: 'xlsx', label: 'Excel',    ket: '.xlsx' },
    { kode: 'pdf',  label: 'PDF',      ket: '.pdf'  },
    { kode: 'csv',  label: 'CSV',      ket: '.csv'  }
  ];

  const tombolEkspor = (jenis, params = {}) => {
    const p = esc(JSON.stringify(params));
    return `<span class="ekspor">
      <button class="tombol kecil" data-ekspor-buka aria-haspopup="true" aria-expanded="false">
        <svg class="ikon-svg" viewBox="0 0 24 24" style="width:15px;height:15px">
          <path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/></svg>
        Ekspor
        <svg class="ikon-svg tanda-panah" viewBox="0 0 24 24" style="width:13px;height:13px">
          <path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="ekspor-menu" role="menu">
        ${FORMAT_EKSPOR.map(f => `<button role="menuitem" data-ekspor="${esc(jenis)}"
            data-format="${f.kode}" data-params='${p}'>${f.label}<span>${f.ket}</span></button>`).join('')}
      </div>
    </span>`;
  };

  /** Tutup semua menu ekspor yang sedang terbuka. */
  function tutupMenuEkspor() {
    $$('.ekspor.buka').forEach(g => {
      g.classList.remove('buka');
      const b = g.querySelector('[data-ekspor-buka]');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  async function jalankanEkspor(btn) {
    // Keadaan "sedang menyiapkan" ditaruh di tombol pemicu, bukan di item menunya —
    // menunya menutup begitu dipilih, jadi label di dalamnya tak akan sempat terbaca.
    const grup = btn.closest('.ekspor');
    const pemicu = grup ? grup.querySelector('[data-ekspor-buka]') : btn;
    const semula = pemicu.innerHTML;
    tutupMenuEkspor();
    pemicu.disabled = true; pemicu.textContent = 'Menyiapkan…';
    try {
      let params = {};
      try { params = JSON.parse(btn.dataset.params || '{}'); } catch (e) {}
      const d = await API.ekspor({ jenis: btn.dataset.ekspor, format: btn.dataset.format, ...params });
      unduhBase64(d.nama, d.mime, d.base64);
      toast('Berkas ' + d.nama + ' diunduh.');
    } catch (e) { toast(e.message, 'galat'); }
    // innerHTML, bukan textContent: labelnya berisi ikon SVG yang harus kembali utuh.
    pemicu.disabled = false; pemicu.innerHTML = semula;
  }

  /* ==================== DASHBOARD ==================== */

  async function muatDashboard() {
    memuat('#isiDashboard');
    try {
      const d = await API.dashboard({});
      /**
       * Penjagaan ini ditambahkan setelah kejadian nyata: tepat setelah Apps Script
       * di-deploy ulang, permintaan pertama mengenai celah propagasi dan jawabannya
       * kosong. `d.hari_ini` undefined, lalu membaca `.nota` melempar galat — dan
       * gangguan sesaat yang seharusnya tidak terlihat malah tampil sebagai kotak
       * merah di depan kasir. Jawaban tak lengkap adalah kondisi jaringan yang wajar,
       * bukan hal luar biasa, jadi kodenya harus tahan menghadapinya.
       */
      if (!d || !d.hari_ini) {
        throw new Error('Server membalas tanpa data ringkasan. ' +
                        'Biasanya ini sementara — coba muat ulang beberapa saat lagi.');
      }
      const h = d.hari_ini;
      $('#isiDashboard').innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">Nota hari ini</div><div class="nilai">${h.nota}</div></div>
          <div class="kartu statistik"><div class="label">Omzet hari ini</div><div class="nilai">${rp(h.omzet)}</div></div>
          ${h.laba_kotor !== undefined ? `<div class="kartu statistik"><div class="label">Laba kotor</div><div class="nilai">${rp(h.laba_kotor)}</div></div>` : ''}
          <div class="kartu statistik"><div class="label">Piutang beredar</div><div class="nilai">${rp(d.piutang_total)}</div>
            ${d.piutang_jatuh_tempo > 0 ? `<div style="color:var(--bahaya);font-size:12px;margin-top:4px">${rp(d.piutang_jatuh_tempo)} lewat tempo</div>` : ''}</div>
        </div>

        <div class="kartu"><h3>Penjualan per cabang — ${esc(tglTampil(d.tanggal))}</h3>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Nota', kunci: 'nota', angka: true },
            { judul: 'Omzet', angka: true, render: r => rp(r.omzet) },
            ...(d.per_cabang[0]?.laba_kotor !== undefined ? [{ judul: 'Laba kotor', angka: true, render: r => rp(r.laba_kotor) }] : [])
          ], d.per_cabang, { kosong: 'Belum ada transaksi hari ini' })}
        </div>

        ${d.shift_terbuka.length ? `<div class="kartu"><h3>Shift masih terbuka <span class="lencana kuning">${d.shift_terbuka.length}</span></h3>
          <p style="color:var(--teks-redup);font-size:13px">Shift yang tidak ditutup membuat selisih kas tidak bisa dilacak.</p>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Kasir', kunci: 'id_user' },
            { judul: 'Dibuka', render: r => esc(waktuTampil(r.buka)) }
          ], d.shift_terbuka)}</div>` : ''}

        <div class="kartu grafik">
          <div class="bar-alat">
            <h3 style="margin:0">Tren penjualan</h3>
            <div style="flex:1"></div>
            <select id="grafikHari" style="width:auto">
              <option value="14">14 hari</option>
              <option value="30" selected>30 hari</option>
              <option value="60">60 hari</option>
              <option value="90">90 hari</option>
            </select>
          </div>
          <div id="wadahGrafik"><p class="grafik-kosong">Memuat grafik…</p></div>
        </div>

        <div class="kartu"><h3>Stok menipis
          ${d.jumlah_stok_kritis ? `<span class="lencana merah">${d.jumlah_stok_kritis}</span>` : '<span class="lencana hijau">aman</span>'}</h3>
          <p style="color:var(--teks-redup);font-size:13px">Cabang ${esc(APP_STATE.cabang)}. Produk yang stoknya sudah menyentuh ambang minimum.</p>
          ${tabel([
            { judul: 'SKU', kunci: 'sku' },
            { judul: 'Nama', kunci: 'nama' },
            { judul: 'Stok', kunci: 'qty', angka: true },
            { judul: 'Minimum', kunci: 'stok_min', angka: true }
          ], d.stok_kritis, { kosong: 'Tidak ada produk di bawah stok minimum' })}
        </div>`;
      muatGrafik(30);
    } catch (e) { galat('#isiDashboard', e); }
  }

  async function muatGrafik(hari) {
    const w = $('#wadahGrafik');
    if (!w) return;
    w.innerHTML = '<p class="grafik-kosong">Memuat grafik…</p>';
    try {
      const g = await API.dataGrafik({ hari });
      const r = g.ringkas;

      w.innerHTML = `
        <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px">
          <div class="statistik"><div class="label">Omzet ${hari} hari</div><div class="nilai">${rp(r.omzet)}</div></div>
          <div class="statistik"><div class="label">Rata-rata per hari</div><div class="nilai">${rp(r.rata_per_hari)}</div></div>
          <div class="statistik"><div class="label">Rata-rata per nota</div><div class="nilai">${rp(r.rata_per_nota)}</div></div>
          ${r.margin !== undefined ? `<div class="statistik"><div class="label">Margin kotor</div><div class="nilai">${r.margin}%</div></div>` : ''}
        </div>
        <div id="gPenjualan"></div>
        <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-top:22px">
          <div><h4 class="judul-grafik">Omzet per kategori</h4><div id="gKategori"></div></div>
          <div><h4 class="judul-grafik">Metode pembayaran</h4><div id="gMetode"></div></div>
          <div><h4 class="judul-grafik">10 produk teratas</h4><div id="gProduk"></div></div>
          ${g.tren_bulanan ? '<div><h4 class="judul-grafik">Laba kotor 6 bulan</h4><div id="gBulanan"></div></div>' : ''}
        </div>`;

      // Satu garis per cabang bila lintas cabang; kalau hanya satu cabang, satu garis omzet.
      const seri = g.seri_cabang.length > 1
        ? g.seri_cabang
        : [{ nama: 'Omzet', data: g.deret_harian.map(x => x.total) }];
      Grafik.garis($('#gPenjualan'), { tanggal: g.tanggal, seri });

      Grafik.batang($('#gKategori'), {
        data: g.kategori.map(k => ({ label: k.kategori, nilai: k.omzet })) });
      Grafik.batang($('#gMetode'), {
        data: g.metode_bayar.map(m => ({ label: m.metode.toUpperCase(), nilai: m.jumlah })) });
      Grafik.batang($('#gProduk'), {
        data: g.produk_teratas.map(p => ({ label: p.nama, nilai: p.omzet,
                                           tambahan: p.qty + ' terjual' })) });
      if (g.tren_bulanan) {
        Grafik.garis($('#gBulanan'), {
          tanggal: g.tren_bulanan.map(t => t.periode),
          seri: [{ nama: 'Laba kotor', data: g.tren_bulanan.map(t => t.laba_kotor) }]
        });
      }
    } catch (e) {
      w.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
    }
  }

  /**
   * Level harga yang masih hidup — satu sumber untuk SELURUH layar back office.
   *
   * Sebelumnya daftar ini ditulis ulang di tiga tempat, dan saat `reseller`
   * dihapus dua di antaranya tertinggal: dropdown tier harga dan form pelanggan
   * masih menawarkannya. Tidak ada galat — hanya level yang sudah tidak dikenal
   * mesin harga, lalu diam-diam jatuh ke grosir.
   */
  const LEVEL_HARGA = ['eceran', 'grosir'];

  /**
   * Petakan nilai lama ke pilihan yang masih ada SEBELUM <select> digambar.
   *
   * Tanpa ini, baris yang nilainya sudah dihapus membuat browser memilih opsi
   * PERTAMA tanpa suara — dan begitu formnya disimpan, nilai lamanya tertimpa
   * nilai yang tidak pernah dipilih siapa pun. Untuk level harga arahnya selalu
   * merugikan: reseller (termurah) jadi eceran (termahal).
   */
  const normalLevelWeb = (l) => {
    const v = String(l || '').toLowerCase();
    return (v === 'grosir' || v === 'reseller') ? 'grosir' : 'eceran';
  };

  /** Pasangannya untuk peran petugas. PEMBANTU dilebur ke PEMASANG, seperti migrasinya. */
  const normalPeranWeb = (p) => {
    const v = String(p || '').toUpperCase();
    if (v === 'PEMASANG' || v === 'PEMBANTU') return 'PEMASANG';
    return 'PENJUAL';
  };

  /* ==================== PRODUK ==================== */

  /** Isi dropdown kategori. Nilai kosong = semua, supaya selalu ada jalan kembali. */
  const opsiKategori = (daftar, terpilih) =>
    `<option value="">Semua kategori</option>` +
    (daftar || []).map(k =>
      `<option value="${esc(k)}" ${k === terpilih ? 'selected' : ''}>${esc(k)}</option>`).join('');

  /**
   * Kolom tambahan pada daftar produk — SATU yang tampil, dipilih dari dropdown.
   *
   * Sebelumnya Margin dan Turunan jadi kolom tetap. Dengan Modal, Eceran, Grosir
   * dan Stok yang juga tetap, tabelnya sudah sembilan lajur sebelum kolom apa pun
   * ditambahkan — di layar kasir yang lebar 1366 itu berarti menggulir ke samping
   * untuk membaca satu angka. Menambah Poin sebagai kolom tetap kesepuluh hanya
   * memperburuknya.
   *
   * Jadi keduanya turun ke sini bersama Poin: dipilih, bukan dicentang. Satu
   * dropdown, satu kolom, tanpa kotak centang yang harus dibuka-tutup.
   */
  const KOLOM_PRODUK = [
    { id: 'poin', judul: 'Poin', angka: true,
      // Angka telanjang, bukan "2 poin": kolomnya sudah bernama Poin, dan
      // satuan yang diulang di tiap baris justru memperlambat membaca.
      render: r => Number(r.poin_satuan) > 0 ? String(r.poin_satuan) : '—' },
    { id: 'margin', judul: 'Margin', angka: true, butuhModal: true,
      render: r => (r.margin_eceran || 0).toFixed(1) + '%' },
    { id: 'turunan', judul: 'Turunan', render: r => [
        r.satuan.length ? `<span class="lencana">${r.satuan.length} satuan</span>` : '',
        r.tier.length ? `<span class="lencana">${r.tier.length} tier</span>` : '',
        r.varian.length ? `<span class="lencana">${r.varian.length} varian</span>` : ''
      ].filter(Boolean).join(' ') || '—' },
    { id: 'stok_min', judul: 'Stok min', angka: true, render: r => String(r.stok_min ?? 0) },
    { id: 'barcode', judul: 'Barcode', render: r => esc(r.barcode || '') || '—' },
    { id: 'satuan_dasar', judul: 'Satuan', render: r => esc(r.satuan_dasar || 'pcs') }
  ];

  /** Penyaring baris. Kosong = semua, supaya selalu ada jalan kembali. */
  const SARING_PRODUK = [
    { id: '', label: 'Semua produk', lolos: () => true },
    { id: 'berpoin', label: 'Berpoin', lolos: r => Number(r.poin_satuan) > 0 },
    { id: 'tanpa_poin', label: 'Tanpa poin', lolos: r => !(Number(r.poin_satuan) > 0) }
    /* Pilihan "Nonaktif" dibuang: produk nonaktif sekarang punya tempatnya
       sendiri di bawah daftar. Dua jalan menuju hal yang sama hanya membuat
       orang bertanya-tanya apakah keduanya menunjukkan isi yang berbeda. */
  ];

  /* Pilihan layar, bukan pengaturan akun: hidup selama sesi ini saja dan tidak
     ikut tersimpan. Membuka aplikasi besok kembali ke Poin. */
  let kolomProduk = 'poin', saringProduk = '';
  let dataProduk = null, kueriProduk = '', kategoriProduk = '';

  async function muatProduk(kueri = '', kategori = '') {
    memuat('#isiProduk');
    try {
      const d = await API.daftarProduk({ cari: kueri, kategori, termasuk_nonaktif: true });
      cacheProduk = d.produk;
      dataProduk = d;
      kueriProduk = kueri;
      kategoriProduk = kategori;
      gambarProduk();
    } catch (e) { galat('#isiProduk', e); }
  }

  /**
   * Menggambar ulang daftar produk DARI DATA YANG SUDAH ADA.
   *
   * Mengganti kolom atau penyaring tidak menembak API lagi: daftarnya sudah di
   * tangan, dan memuat ulang dari server hanya untuk mengganti satu lajur itu
   * pemborosan yang baru terasa ketika koneksinya lambat — persis keadaan toko.
   */
  function gambarProduk() {
    const d = dataProduk;
    if (!d) return;
    const modal = d.boleh_harga_modal;

    const pilihan = KOLOM_PRODUK.filter(k => !k.butuhModal || modal);
    // Tanpa izin harga modal, Margin tidak ada dalam daftar. Kalau ia yang
    // sedang terpilih, jangan tinggalkan dropdown menunjuk pilihan yang lenyap.
    if (kolomProduk && !pilihan.some(k => k.id === kolomProduk)) kolomProduk = 'poin';
    const kolomAktif = pilihan.find(k => k.id === kolomProduk);

    const saring = SARING_PRODUK.find(s => s.id === saringProduk) || SARING_PRODUK[0];
    const baris = cacheProduk.filter(saring.lolos);
    const hitung = baris.length === cacheProduk.length
      ? `${cacheProduk.length} produk`
      : `${baris.length} dari ${cacheProduk.length} produk`;

    $('#isiProduk').innerHTML = `
      <div class="kartu">
        <div class="bar-alat">
          <input type="text" id="cariProduk" placeholder="Cari SKU, nama, merek, tipe HP…" value="${esc(kueriProduk)}" style="max-width:300px">
          <select id="filterKategori" style="max-width:180px">${opsiKategori(d.kategori_ada, kategoriProduk)}</select>
          <select id="kolomProduk" style="max-width:170px" title="Kolom tambahan yang ditampilkan">
            ${pilihan.map(k => `<option value="${k.id}" ${k.id === kolomProduk ? 'selected' : ''}>Tampilkan: ${esc(k.judul)}</option>`).join('')}
            <option value="" ${kolomProduk ? '' : 'selected'}>Tampilkan: tidak ada</option>
          </select>
          <select id="saringProduk" style="max-width:160px" title="Saring baris">
            ${SARING_PRODUK.map(s => `<option value="${s.id}" ${s.id === saringProduk ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
          <span class="jumlah-baris">${hitung}</span>
          <div class="kanan">
            ${tombolEkspor('produk')}
            ${bolehIzin('produk', 'buat') ? `
              <button class="tombol utama" id="btnProdukBaru">+ Produk baru</button>
              <button class="tombol" id="btnImporProduk">Impor massal</button>` : ''}
          </div>
        </div>
      </div>
      <div class="kartu">
        ${tabel([
          { judul: 'SKU', kunci: 'sku' },
          { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}
            <div class="meta-kecil">${esc([r.kategori, r.merek, r.tipe_hp].filter(Boolean).join(' · '))}</div>` },
          ...(modal ? [{ judul: 'Modal', angka: true, render: r => rp(r.harga_beli_terakhir) }] : []),
          { judul: 'Eceran', angka: true, render: r => rp(r.harga_eceran) },
          { judul: 'Grosir', angka: true, render: r => rp(r.harga_grosir) },
          { judul: 'Stok', angka: true, render: r => `<span class="${r.stok <= r.stok_min ? 'stok-kritis' : ''}">${r.stok ?? '-'}</span>` },
          ...(kolomAktif ? [kolomAktif] : []),
          { judul: '', render: r => `<button class="tombol kecil" data-edit-produk="${esc(r.sku)}">Ubah</button>` }
        ], baris, { pisahNonaktif: true, kosong: (kueriProduk || saringProduk)
            ? 'Tidak ada produk cocok'
            : 'Belum ada produk — mulai dengan "Produk baru" atau "Impor massal"' })}
      </div>`;
  }

  function editorProduk(sku) {
    const p = sku ? cacheProduk.find(x => x.sku === sku) : null;
    const baru = !p;
    const modal = APP_STATE.flag.lihat_harga_modal;

    bukaModal(baru ? 'Produk baru' : 'Ubah produk — ' + p.sku, `
      <div class="tab-modal">
        <button class="aktif" data-tabm="umum">Umum</button>
        <button data-tabm="cocok">Kecocokan &amp; pencarian</button>
        <button data-tabm="satuan">Satuan bertingkat</button>
        <button data-tabm="tier">Tier harga</button>
        <button data-tabm="varian">Varian</button>
        <button data-tabm="tim">Tim &amp; poin</button>
      </div>

      <div data-panel="umum">
        <div class="baris2">
          <div class="grup"><label>SKU *</label>
            <input type="text" id="pSku" value="${esc(p?.sku || '')}" ${baru ? '' : 'disabled'}></div>
          <div class="grup"><label>Barcode</label><input type="text" id="pBarcode" value="${esc(p?.barcode || '')}"></div>
        </div>
        <div class="grup"><label>Nama produk *</label><input type="text" id="pNama" value="${esc(p?.nama || '')}"></div>
        <div class="baris3">
          <div class="grup"><label>Kategori</label><input type="text" id="pKategori" value="${esc(p?.kategori || '')}"></div>
          <div class="grup"><label>Merek</label><input type="text" id="pMerek" value="${esc(p?.merek || '')}"></div>
          <div class="grup"><label>Tipe HP cocok</label><input type="text" id="pTipe" value="${esc(p?.tipe_hp || '')}"
            placeholder="mis. iPhone 13/14"></div>
        </div>
        <div class="baris3">
          <div class="grup"><label>Satuan dasar</label><input type="text" id="pSatuanDasar" value="${esc(p?.satuan_dasar || 'pcs')}"></div>
          <div class="grup"><label>Stok minimum</label><input type="number" id="pStokMin" value="${p?.stok_min || 0}"></div>
          ${modal ? `<div class="grup"><label>Harga beli ${baru ? '(awal)' : '(dari pembelian)'}</label>
            <input type="text" inputmode="numeric" class="uang" id="pHargaBeli" value="${ribuan(p?.harga_beli_terakhir || 0)}" ${baru ? '' : 'disabled'}></div>` : '<div></div>'}
        </div>
        <div class="baris3">
          <div class="grup"><label>Harga eceran *</label><input type="text" inputmode="numeric" class="uang" id="pEceran" value="${ribuan(p?.harga_eceran || 0)}"></div>
          <div class="grup"><label>Harga grosir</label><input type="text" inputmode="numeric" class="uang" id="pGrosir" value="${ribuan(p?.harga_grosir || 0)}"></div>
        </div>
        <label class="cek"><input type="checkbox" id="pAktif" ${p?.aktif !== false ? 'checked' : ''}> Produk aktif</label>
        ${baru ? '' : '<p class="petunjuk">Harga beli tidak bisa diubah dari sini — ia dihitung ulang otomatis setiap ada pembelian, supaya HPP dan laba tetap sahih.</p>'}
      </div>

      <div data-panel="cocok" class="sembunyi">
        <p class="petunjuk">Dibuat untuk kasus seperti <strong>tempered glass</strong>: satu SKU yang cocok untuk puluhan tipe HP.
          Ketiga kolom di bawah semuanya ikut dicari kasir, jadi pelanggan cukup menyebut tipe HP-nya.</p>

        <div class="grup">
          <label>Deskripsi</label>
          <textarea id="pDeskripsi" rows="3"
            placeholder="Tempered glass bening universal 6.5 inci, tebal 0.3mm, 9H. Cocok untuk HP layar 6.4–6.6 inci tanpa lengkung tepi.">${esc(p?.deskripsi || '')}</textarea>
        </div>

        <div class="grup">
          <label>Kata kunci pencarian (alias &amp; salah ketik)</label>
          <input type="text" id="pKataKunci" value="${esc(p?.kata_kunci || '')}"
            placeholder="tg antigores anti gores screen guard pelindung layar ip13 iphone13">
          <p class="petunjuk" style="margin-top:6px">Tulis semua cara orang menyebut barang ini, dipisah spasi. Termasuk singkatan
            (<code>tg</code>, <code>ip13</code>) dan salah ketik yang sering terjadi. Kasir tidak perlu hafal nama resminya.</p>
        </div>

        <label>Daftar HP yang cocok</label>
        <p class="petunjuk">Berbeda dari kata kunci, daftar ini terstruktur — nanti bisa dipakai untuk menyaring
          "tampilkan semua barang yang cocok Redmi 13".</p>
        <div id="barisKompatibel"></div>
        <button class="tombol" id="btnTambahKompatibel">+ Tambah tipe HP</button>
      </div>

      <div data-panel="satuan" class="sembunyi">
        <p class="petunjuk">Satuan turunan seperti lusin atau box. Kolom <em>isi</em> adalah jumlah satuan dasar di dalamnya (lusin = 12).</p>
        <div id="barisSatuan"></div>
        <button class="tombol" id="btnTambahSatuan">+ Tambah satuan</button>
      </div>

      <div data-panel="tier" class="sembunyi">
        <p class="petunjuk">Harga turun otomatis saat pembelian mencapai qty tertentu. Berlaku pada satuan dasar. Ambang tertinggi yang terpenuhi yang dipakai.</p>
        <div id="barisTier"></div>
        <button class="tombol" id="btnTambahTier">+ Tambah tier</button>
      </div>

      <div data-panel="varian" class="sembunyi">
        <p class="petunjuk">Varian warna/model. Stok dihitung terpisah per varian. Selisih harga boleh negatif.</p>
        <div id="barisVarian"></div>
        <button class="tombol" id="btnTambahVarian">+ Tambah varian</button>
      </div>

      <div data-panel="tim" class="sembunyi">
        <p class="petunjuk">Isi poin di sini, dan produk ini otomatis bisa dibagi berdua di
          meja kasir — tombol <strong>+ Pemasang</strong> muncul sendiri pada barisnya.
          Tidak ada yang perlu dicentang, dan tidak ada yang wajib: kalau penjualnya
          mengerjakan sendiri, dia mendapat seluruh poin baris itu; kalau ada yang membantu
          memasang, kasir menambahkan namanya dan poinnya dibagi menurut bobot peran.</p>

        <div class="grup" style="margin-top:12px;max-width:220px">
          <label>Poin per satuan dasar</label>
          <input type="number" id="pPoinSatuan" min="0" step="0.5" value="${p?.poin_satuan || 0}">
        </div>

        <p class="petunjuk"><strong>Poin per satuan dasar.</strong> Nilai yang diisi di
          sini dikalikan qty dasar pada nota — 12 pcs dengan 3 poin menghasilkan 36 poin
          untuk baris itu.<br>
          <strong>0 berarti penjualan produk ini tidak berpoin</strong> — omzetnya tetap
          tercatat atas nama petugasnya, hanya poinnya nol.<br>
          Poin dibagi ke petugas menurut bobot peran, yang diatur di menu
          <strong>Petugas</strong>. Kasir tidak dapat mengubah angkanya.</p>
      </div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       ${!baru && bolehIzin('produk', 'hapus') ? '<button class="tombol bahaya" id="btnNonaktifProduk">Nonaktifkan</button>' : ''}
       <button class="tombol utama" id="btnSimpanProduk">Simpan</button>`);

    (p?.satuan || []).forEach(s => tambahBarisSatuan(s));
    (p?.tier || []).forEach(t => tambahBarisTier(t));
    (p?.varian || []).forEach(v => tambahBarisVarian(v));
    (p?.kompatibel || []).forEach(k => tambahBarisKompatibel(k));
  }

  function tambahBarisKompatibel(k = {}) {
    $('#barisKompatibel').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="kompatibel">
        <input type="text" data-f="merek" placeholder="merek (Xiaomi)" value="${esc(k.merek || '')}">
        <input type="text" data-f="tipe" placeholder="tipe (Redmi 13)" value="${esc(k.tipe || '')}" style="flex:2">
        <input type="text" data-f="catatan" placeholder="catatan (mis. pas mepet)" value="${esc(k.catatan || '')}">
        ${barisHapus}
      </div>`);
  }

  const barisHapus = '<button class="tombol bahaya kecil" data-hapus-baris="1">×</button>';

  function tambahBarisSatuan(s = {}) {
    $('#barisSatuan').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="satuan">
        <input type="text" data-f="nama_satuan" placeholder="lusin" value="${esc(s.nama_satuan || '')}">
        <input type="number" data-f="isi" placeholder="isi" value="${s.isi || ''}">
        <input type="text" inputmode="numeric" class="uang" data-f="harga_eceran" placeholder="eceran" value="${s.harga_eceran ? ribuan(s.harga_eceran) : ''}">
        <input type="text" inputmode="numeric" class="uang" data-f="harga_grosir" placeholder="grosir" value="${s.harga_grosir ? ribuan(s.harga_grosir) : ''}">
        ${barisHapus}
      </div>`);
  }
  function tambahBarisTier(t = {}) {
    $('#barisTier').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="tier">
        <!-- Dibawa diam-diam melewati editor. Tanpa ini, tier yang sengaja
             dinonaktifkan migrasi (karena bentrok, dan menunggu diputuskan
             manusia) akan hidup kembali hanya karena seseorang membetulkan nama
             produknya — lalu ada DUA tier grosir aktif pada qty yang sama, dan
             harga yang berlaku ditentukan urutan baris di sheet. -->
        <input type="hidden" data-f="aktif" value="${t.aktif === false ? 'false' : 'true'}">
        <select data-f="level_harga">
          ${LEVEL_HARGA.map(l =>
            `<option value="${l}" ${normalLevelWeb(t.level_harga) === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <input type="number" data-f="qty_min" placeholder="qty min" value="${t.qty_min || ''}">
        <input type="text" inputmode="numeric" class="uang" data-f="harga" placeholder="harga" value="${t.harga ? ribuan(t.harga) : ''}">
        ${t.aktif === false ? '<span class="lencana merah" title="Dinonaktifkan migrasi karena bentrok — hapus salah satu">nonaktif</span>' : ''}
        ${barisHapus}
      </div>`);
  }
  function tambahBarisVarian(v = {}) {
    $('#barisVarian').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="varian">
        <input type="text" data-f="kode_varian" placeholder="kode" value="${esc(v.kode_varian || '')}">
        <input type="text" data-f="nama_varian" placeholder="nama (Merah)" value="${esc(v.nama_varian || '')}">
        <input type="text" data-f="barcode" placeholder="barcode" value="${esc(v.barcode || '')}">
        <input type="text" inputmode="numeric" class="uang" data-f="selisih_harga" placeholder="selisih" value="${v.selisih_harga ? ribuan(v.selisih_harga) : ''}">
        ${barisHapus}
      </div>`);
  }

  const kumpulkanAnak = (jenis) => $$(`[data-anak="${jenis}"]`).map(el => {
    const o = {};
    /* Kolom uang diurai DI SINI, di titik pengumpulan — bukan di tiap pemakai
       di hilirnya. Baris harga per satuan, tier, varian, item pembelian, dan
       item retur semuanya lewat fungsi ini; kalau tiap pembaca harus ingat
       sendiri, satu yang lupa sudah cukup untuk mengubah Rp 1.000.000 jadi
       Rp 1 tanpa satu pun pesan galat. */
    el.querySelectorAll('[data-f]').forEach(i => {
      /* Kolom uang KOSONG tetap dikembalikan sebagai '' — bukan 0.
         Penyaring baris kosong di bawah memakai `String(nilai).trim() !== ''`,
         jadi 0 terbaca sebagai "terisi": satu baris satuan yang ditambah lalu
         ditinggalkan kosong akan ikut tersimpan, bernama kosong, berisi 0.
         Di hilirnya Number('') tetap 0, persis seperti sebelum perubahan ini. */
      const u = i.classList.contains('uang');
      o[i.dataset.f] = u ? (String(i.value).trim() === '' ? '' : angkaDari(i.value)) : i.value;
    });
    return o;
  }).filter(o => Object.keys(o).some(
    k => !KOLOM_OTOMATIS.includes(k) && String(o[k] ?? '').trim() !== ''));

  /**
   * Kolom yang terisi SENDIRI, jadi tidak boleh dipakai menilai apakah sebuah
   * baris sungguhan: `level_harga` adalah <select> yang selalu punya nilai, dan
   * `aktif` selalu 'true'/'false'. Tanpa daftar ini, baris tier yang ditambahkan
   * lalu ditinggalkan kosong ikut tersimpan — dan `qty_min` 0 berharga 0 cocok
   * untuk SETIAP qty, sehingga produknya tidak bisa dijual sama sekali di level
   * itu.
   *
   * Yang dibuang di sini HANYA baris yang benar-benar hampa. Baris yang terisi
   * SEBAGIAN sengaja tetap dikirim, biar server yang menolaknya dengan menyebut
   * nomor barisnya.
   *
   * Bedanya bukan soal selera. Baris turunan ditulis ulang seluruhnya per SKU,
   * jadi baris yang disaring di sini bukan cuma "tidak jadi ditambahkan" — ia
   * TERHAPUS dari master. Menyaring baris yang belum lengkap berarti satuan
   * "box" beserta harganya bisa lenyap dari seluruh perangkat hanya karena
   * seseorang membetulkan nama produknya, dengan notifikasi berbunyi
   * "Produk tersimpan."
   */
  const KOLOM_OTOMATIS = ['aktif', 'level_harga'];

  async function simpanProduk() {
    const body = {
      sku: nilai('pSku'), barcode: nilai('pBarcode'), nama: nilai('pNama'),
      kategori: nilai('pKategori'), merek: nilai('pMerek'), tipe_hp: nilai('pTipe'),
      satuan_dasar: nilai('pSatuanDasar') || 'pcs', stok_min: angka('pStokMin'),
      harga_beli_terakhir: $('#pHargaBeli') ? angka('pHargaBeli') : 0,
      harga_eceran: angka('pEceran'), harga_grosir: angka('pGrosir'),
      aktif: centang('pAktif'),
      deskripsi: nilai('pDeskripsi'), kata_kunci: nilai('pKataKunci'),
      // `butuh_tim` sengaja TIDAK dikirim lagi — penanda wajib-tim dihapus
      // 24 Agu 2026; poin sendiri yang menentukan apakah barisnya bisa dibagi.
      poin_satuan: angka('pPoinSatuan'),
      satuan: kumpulkanAnak('satuan'), tier: kumpulkanAnak('tier'),
      varian: kumpulkanAnak('varian'), kompatibel: kumpulkanAnak('kompatibel')
    };
    if (!body.sku || !body.nama) return toast('SKU dan nama wajib diisi.', 'galat');
    try {
      /* Tiga langkah, satu tugas. Tanpa pembungkus ini penghitung sibuk turun ke
         nol dua kali di tengah jalan, dan tombol Simpan sempat terbuka kembali
         sebelum katalognya selesai ditarik ulang. */
      await API.tugas(async () => {
        await API.simpanProdukLengkap(body);
        await Sync.tarikMaster(true);
        await sukses('Produk tersimpan.', 'produk');
      });
    } catch (e) { toast(e.message, 'galat'); }
  }

  /* ==================== IMPOR PRODUK ==================== */

  /**
   * Angka dari berkas impor. Aturannya HARUS sama persis dengan _angka() di
   * 17_Ekspor.gs, karena berkas yang sama dibaca dua kali: di sini untuk
   * pratinjau, di server untuk menyimpan. Kalau dua aturan itu berbeda, yang
   * dilihat pemakainya bukan yang tersimpan.
   *
   * Titik hanya dibuang bila diikuti TEPAT tiga angka. Jadi "25.000" jadi 25000
   * sementara "2.5" tetap 2,5 — poin memang boleh pecahan, dan pembersih lama
   * yang membuang semua titik mengubah 2,5 poin menjadi 25 poin tanpa satu pun
   * tanda di layar.
   */
  const angkaImpor = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^\d\-.]/g, '').replace(/\.(?=\d{3}\b)/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const KOLOM_IMPOR = {
    produk: 'sku, barcode, nama, kategori, merek, tipe_hp, satuan_dasar, harga_beli_terakhir, ' +
            'harga_eceran, harga_grosir, stok_min, poin_satuan — wajib: sku, nama, harga_eceran',
    pelanggan: 'nama, telepon, alamat, level_harga, limit_kredit, termin_hari — wajib: nama',
    supplier: 'nama, kontak, telepon, alamat, termin_hari — wajib: nama',
    stok_awal: 'sku, qty, hpp — semuanya wajib'
  };

  function dialogImpor(entitas = 'produk') {
    bukaModal('Impor data massal', `
      <div class="grup">
        <label>Data yang diimpor</label>
        <select id="imporEntitas">
          ${Object.keys(KOLOM_IMPOR).map(k =>
            `<option value="${k}" ${k === entitas ? 'selected' : ''}>${
              { produk: 'Produk', pelanggan: 'Pelanggan', supplier: 'Supplier',
                stok_awal: 'Stok awal (saat go-live)' }[k]}</option>`).join('')}
        </select>
      </div>
      <p class="petunjuk">Kolom yang dikenali: <code id="imporKolom">${esc(KOLOM_IMPOR[entitas])}</code></p>
      <button class="tombol kecil" id="btnTemplateImpor">Unduh template Excel</button>

      <hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">

      <div class="grup">
        <label>Cara 1 — unggah berkas Excel (.xlsx) atau CSV</label>
        <input type="file" id="imporBerkas" accept=".xlsx,.xls,.csv">
      </div>
      <div class="grup">
        <label>Cara 2 — tempel langsung dari Excel/Google Sheets</label>
        <textarea id="imporTeks" rows="7" placeholder="sku	nama	harga_eceran	harga_grosir
AC-CS-010	Softcase Bening	25000	18000"></textarea>
      </div>
      <button class="tombol" id="btnPratinjauImpor">Pratinjau</button>
      <p class="petunjuk">Impor bersifat semua-atau-tidak sama sekali: bila ada satu baris bermasalah,
        tidak ada satu pun yang tersimpan. Lebih baik Anda memperbaiki berkasnya daripada menemukan
        setengah data masuk dan setengah tidak.</p>
      <div id="hasilPratinjau"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnJalankanImpor" disabled>Impor</button>`);
  }

  let barisImpor = [], barisMentah = [];

  function pratinjauImpor(barisSiap) {
    const entitas = nilai('imporEntitas') || 'produk';
    let baris, judul, pisah;

    if (barisSiap) {
      baris = barisSiap.filter(r => r.some(c => String(c).trim() !== ''));
      judul = baris[0].map(h => String(h).trim().toLowerCase());
    } else {
      const teks = $('#imporTeks').value.trim();
      if (!teks) return toast('Unggah berkas atau tempel datanya dulu.', 'galat');
      pisah = teks.includes('\t') ? '\t' : ',';
      baris = teks.split(/\r?\n/).filter(b => b.trim()).map(b => b.split(pisah));
      judul = baris[0].map(h => String(h).trim().toLowerCase());
    }

    const wajib = { produk: ['sku', 'nama', 'harga_eceran'], pelanggan: ['nama'],
                    supplier: ['nama'], stok_awal: ['sku', 'qty'] }[entitas];
    const hilang = wajib.filter(w => !judul.includes(w));
    if (hilang.length) {
      $('#hasilPratinjau').innerHTML = `<div class="pesan galat">Kolom wajib belum ada: ${hilang.join(', ')}</div>`;
      $('#btnJalankanImpor').disabled = true;
      return;
    }

    const angkaKol = ['harga_beli_terakhir', 'harga_eceran', 'harga_grosir',
                      'stok_min', 'limit_kredit', 'termin_hari', 'qty', 'hpp',
                      'poin_satuan'];
    barisImpor = baris.slice(1).map(sel => {
      const o = {};
      judul.forEach((h, i) => {
        let v = String(sel[i] ?? '').trim();
        if (angkaKol.includes(h)) v = angkaImpor(v);
        o[h] = v;
      });
      return o;
    });
    barisMentah = baris;

    const salah = [];
    const kunci = new Set();
    barisImpor.forEach((r, i) => {
      const no = i + 1;
      if (entitas === 'produk' || entitas === 'stok_awal') {
        if (!r.sku) salah.push(`Baris ${no}: SKU kosong`);
        else if (kunci.has(r.sku)) salah.push(`Baris ${no}: SKU ${r.sku} ganda dalam berkas`);
        else kunci.add(r.sku);
      }
      if (entitas === 'produk') {
        if (!r.nama) salah.push(`Baris ${no}: nama kosong`);
        if (!(r.harga_eceran > 0)) salah.push(`Baris ${no}: harga eceran harus > 0`);
        if (r.harga_beli_terakhir > r.harga_eceran) salah.push(`Baris ${no}: harga beli melebihi harga eceran`);
      }
      if (entitas === 'pelanggan' || entitas === 'supplier') {
        if (!r.nama) salah.push(`Baris ${no}: nama kosong`);
      }
      if (entitas === 'stok_awal') {
        if (!(r.qty > 0)) salah.push(`Baris ${no}: qty harus > 0`);
        if (!(r.hpp > 0)) salah.push(`Baris ${no}: hpp/harga beli wajib diisi`);
      }
    });

    $('#hasilPratinjau').innerHTML = `
      ${salah.length ? `<div class="pesan galat"><strong>${salah.length} masalah — impor dibatalkan seluruhnya bila diteruskan:</strong>
        <ul style="margin:8px 0 0 16px">${salah.slice(0, 15).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        ${salah.length > 15 ? `<div style="margin-top:6px">…dan ${salah.length - 15} lainnya</div>` : ''}</div>`
        : `<div class="pesan sukses">${barisImpor.length} baris siap diimpor.</div>`}
      <div style="max-height:220px;overflow:auto">
        ${tabel(judul.slice(0, 6).map(h => ({ judul: h, kunci: h })), barisImpor.slice(0, 30))}
      </div>`;
    $('#btnJalankanImpor').disabled = salah.length > 0;
  }

  async function jalankanImpor() {
    $('#btnJalankanImpor').disabled = true;
    const entitas = nilai('imporEntitas') || 'produk';
    try {
      const d = await API.imporMaster({ entitas, baris: barisMentah, cabang: APP_STATE.cabang });
      await Sync.tarikMaster(true);
      if (entitas === 'stok_awal') await Sync.tarikStok();
      await sukses(`${d.diimpor} baris diimpor.`, entitas === 'produk' ? 'produk' : 'mitra');
    } catch (e) {
      $('#hasilPratinjau').innerHTML = `<div class="pesan galat">${esc(e.message)}
        ${e.detail ? `<ul style="margin:8px 0 0 16px">${e.detail.slice(0, 15).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
      $('#btnJalankanImpor').disabled = false;
    }
  }

  /* ==================== STOK ==================== */

  async function muatStok(katStok = '') {
    memuat('#isiStok');
    try {
      const [stok, prod] = await Promise.all([
        API.stokTerkini({ cabang: APP_STATE.cabang }),
        API.daftarProduk({})
      ]);
      const nama = Object.fromEntries(prod.produk.map(p => [p.sku, p]));
      const rows = stok.stok.map(s => ({
        ...s, nama: nama[s.sku]?.nama || s.sku, stok_min: nama[s.sku]?.stok_min || 0,
        kategori: nama[s.sku]?.kategori || ''
      })).sort((a, b) => a.qty - b.qty);

      const totalNilai = rows.reduce((a, r) => a + (r.nilai || 0), 0);
      const punyaNilai = rows[0]?.nilai !== undefined;
      /* Tabelnya HARUS ikut disaring. Dropdown yang menampilkan "Casing" di atas
         tabel berisi seluruh kategori lebih buruk daripada saringan yang tereset:
         yang satu jujur mengaku lupa, yang satu berbohong. */
      const tampil = katStok ? rows.filter(r => r.kategori === katStok) : rows;

      $('#isiStok').innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">SKU bergerak</div><div class="nilai">${rows.length}</div></div>
          ${punyaNilai ? `<div class="kartu statistik"><div class="label">Nilai persediaan</div><div class="nilai">${rp(totalNilai)}</div></div>` : ''}
          <div class="kartu statistik"><div class="label">Di bawah minimum</div>
            <div class="nilai">${rows.filter(r => r.qty <= r.stok_min).length}</div></div>
        </div>
        <div class="kartu">
          <div class="bar-alat">
            <input type="text" id="cariStok" placeholder="Cari SKU / nama…" style="max-width:320px">
            <select id="stokKategori" style="max-width:200px">${opsiKategori(prod.kategori_ada, katStok)}</select>
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <span class="lencana hijau">HPP: FIFO</span>
            <div style="flex:1"></div>
            ${tombolEkspor('stok', { cabang: APP_STATE.cabang })}
          </div>
          <div id="tabelStok">${tabelStok(tampil, punyaNilai)}</div>
        </div>`;
      $('#isiStok')._rows = rows;
      $('#isiStok')._punyaNilai = punyaNilai;
    } catch (e) { galat('#isiStok', e); }
  }

  const tabelStok = (rows, punyaNilai) => tabel([
    { judul: 'SKU', kunci: 'sku' },
    { judul: 'Nama', kunci: 'nama' },
    { judul: 'Varian', render: r => esc(r.kode_varian || '—') },
    { judul: 'Stok', angka: true, render: r => `<span class="${r.qty <= r.stok_min ? 'stok-kritis' : ''}">${r.qty}</span>` },
    { judul: 'Min', kunci: 'stok_min', angka: true },
    ...(punyaNilai ? [
      // Dengan FIFO, satu SKU bisa punya beberapa harga modal. Kolom ini menunjukkan
      // rata-rata tertimbangnya, dan menandai bila stoknya terdiri dari beberapa lapisan.
      { judul: 'HPP rata2', angka: true, render: r => rp(r.hpp) +
          (r.jumlah_lapisan > 1
            ? `<div class="meta-kecil">${r.jumlah_lapisan} lapisan · ${rp(r.hpp_min)}–${rp(r.hpp_maks)}</div>`
            : '') },
      { judul: 'Nilai', angka: true, render: r => rp(r.nilai) }] : []),
    { judul: '', render: r => `<button class="tombol kecil" data-kartu-stok="${esc(r.sku)}">Kartu stok</button>` }
  ], rows, { kosong: 'Belum ada mutasi stok' });

  async function lihatKartuStok(sku) {
    bukaModal('Kartu stok — ' + sku, '<div id="isiKartuStok">Memuat…</div>');
    try {
      const d = await API.kartuStok({ sku, cabang: APP_STATE.cabang });
      const punyaLapisan = (d.lapisan || []).length > 0;
      $('#isiKartuStok').innerHTML = `
        <p class="petunjuk">Saldo akhir: <strong>${d.saldo_akhir}</strong> · ${d.mutasi.length} mutasi ·
          metode <span class="lencana hijau">${esc(d.metode_hpp || 'FIFO')}</span></p>

        ${punyaLapisan ? `<div class="kartu" style="background:var(--bg)">
          <h3 style="font-size:14px">Lapisan yang masih tersisa</h3>
          <p class="petunjuk">Dengan FIFO, satu SKU bisa punya beberapa harga modal sekaligus.
            Lapisan paling atas yang akan terjual lebih dulu.</p>
          ${tabel([
            { judul: '#', render: (l, i) => '' },
            { judul: 'Masuk', render: l => esc(tglTampil(l.tanggal)) },
            { judul: 'Sisa qty', angka: true, render: l => l.minus
                ? `<span class="stok-kritis">${l.qty}</span>` : l.qty },
            { judul: 'Harga modal', angka: true, render: l => rp(l.hpp) },
            { judul: 'Nilai', angka: true, render: l => rp(l.nilai) },
            { judul: '', render: l => l.minus
                ? '<span class="lencana merah">stok minus</span>'
                : '<span class="lencana">antre</span>' }
          ], d.lapisan)}
        </div>` : ''}

        <div style="max-height:360px;overflow:auto">
        ${tabel([
          { judul: 'Tanggal', render: r => `${esc(tglTampil(r.tanggal))}<div class="meta-kecil">${esc(String(r.waktu).substring(0, 8))}</div>` },
          { judul: 'Tipe', render: r => `<span class="lencana ${r.qty > 0 ? 'hijau' : 'kuning'}">${esc(r.tipe)}</span>` },
          { judul: 'Qty', kunci: 'qty', angka: true },
          { judul: 'Saldo', kunci: 'saldo', angka: true },
          { judul: 'Lapisan terpakai', render: r => r.lapisan
              ? `<code class="meta-kecil">${esc(r.lapisan)}</code>` : '—' },
          { judul: 'Keterangan', kunci: 'keterangan' }
        ], d.mutasi, { kosong: 'Belum ada mutasi' })}</div>`;
    } catch (e) { $('#isiKartuStok').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`; }
  }

  /* ==================== PEMBELIAN ==================== */

  async function muatPembelian() {
    memuat('#isiPembelian');
    try {
      const rows = await API.daftarPembelian({ cabang: APP_STATE.cabang });
      $('#isiPembelian').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <div style="flex:1"></div>
            ${bolehIzin('pembelian', 'buat') ? '<button class="tombol utama" id="btnPembelianBaru">+ Pembelian baru</button>' : ''}
          </div>
        </div>
        <div class="kartu">
          <!-- "rata-rata bergerak" — keterangan yang salah sejak awal dan diperbaiki
               24 Agu 2026. Mesin persediaannya FIFO berlapis (06_Stock.gs), dan
               metode_hpp yang dikembalikan API pun berbunyi FIFO. Angka rata-rata yang
               tampil di layar Stok hanyalah rata-rata tertimbang dari lapisan yang
               MASIH TERSISA — untuk dilihat, bukan yang dipakai menghitung HPP.
               Keterangan yang salah di layar cepat atau lambat disalin ke manual,
               lalu dipercaya saat menyelisihkan HPP. -->
          <p class="petunjuk">Setiap pembelian menaikkan stok dan membentuk lapisan FIFO baru pada harga belinya (diskon dokumen ikut memotong nilai lapisan), lalu membukukan jurnal Persediaan / Utang secara otomatis.</p>
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Supplier', kunci: 'nama_supplier' },
            { judul: 'Bayar', render: r => `<span class="lencana">${esc(r.tipe_bayar)}</span>` },
            { judul: 'Total', angka: true, render: r => rp(r.total) }
          ], rows, { kosong: 'Belum ada pembelian tercatat' })}
        </div>`;
    } catch (e) { galat('#isiPembelian', e); }
  }

  async function formPembelian() {
    const [sup, prod] = await Promise.all([API.daftarSupplier(), API.daftarProduk({})]);
    bukaModal('Pembelian baru', `
      <div class="baris3">
        <div class="grup"><label>Tanggal</label><input type="date" id="beliTanggal" value="${tanggalLokal()}"></div>
        <div class="grup"><label>No dokumen / faktur</label><input type="text" id="beliNo"></div>
        <div class="grup"><label>Supplier</label><select id="beliSupplier">
          <option value="">—</option>
          ${sup.filter(s => s.aktif).map(s => `<option value="${esc(s.kode)}">${esc(s.nama)}</option>`).join('')}
        </select></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Cara bayar</label><select id="beliTipe">
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option>
          <option value="kredit">Kredit (utang)</option></select></div>
        <div class="grup"><label>Jatuh tempo (bila kredit)</label><input type="date" id="beliJatuhTempo"></div>
      </div>

      <label>Item</label>
      <div id="barisBeli"></div>
      <button class="tombol" id="btnTambahBaris">+ Tambah baris</button>

      <datalist id="dlProduk">${prod.produk.map(p =>
        `<option value="${esc(p.sku)}">${esc(p.nama)}</option>`).join('')}</datalist>

      <div class="baris2" style="margin-top:14px">
        <div class="grup"><label>Diskon dokumen</label><input type="text" inputmode="numeric" class="uang" id="beliDiskon" value="0"></div>
        <div class="grup"><label>PPN</label><input type="text" inputmode="numeric" class="uang" id="beliPpn" value="0"></div>
      </div>
      <div class="total-baris besar" style="font-size:20px"><span>TOTAL</span><span id="beliTotal">Rp 0</span></div>
      <div id="pesanBeli"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPembelian">Simpan pembelian</button>`);
    tambahBarisBeli();
  }

  function tambahBarisBeli() {
    $('#barisBeli').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="beli">
        <input type="text" data-f="sku" list="dlProduk" placeholder="SKU" style="flex:2">
        <input type="number" data-f="qty" placeholder="qty" value="1">
        <input type="text" data-f="satuan" placeholder="pcs" value="pcs">
        <input type="number" data-f="faktor" placeholder="isi" value="1" title="Isi per satuan (lusin = 12)">
        <input type="text" inputmode="numeric" class="uang" data-f="harga_satuan" placeholder="harga beli">
        ${barisHapus}
      </div>`);
  }

  function hitungTotalBeli() {
    const item = kumpulkanAnak('beli');
    const sub = item.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga_satuan) || 0), 0);
    const total = sub - angka('beliDiskon') + angka('beliPpn');
    $('#beliTotal').textContent = rp(total);
  }

  async function simpanPembelian() {
    const item = kumpulkanAnak('beli').filter(i => i.sku && Number(i.qty) > 0);
    if (!item.length) return toast('Minimal satu item.', 'galat');
    const btn = $('#btnSimpanPembelian');
    btn.disabled = true;
    try {
      await API.simpanPembelian({
        uuid: crypto.randomUUID ? crypto.randomUUID() : 'B' + Date.now(),
        cabang: APP_STATE.cabang,
        tanggal: nilai('beliTanggal'), no_dokumen: nilai('beliNo'),
        kode_supplier: nilai('beliSupplier'), tipe_bayar: nilai('beliTipe'),
        jatuh_tempo: nilai('beliJatuhTempo'),
        diskon: angka('beliDiskon'), ppn: angka('beliPpn'),
        item: item.map(i => ({
          sku: i.sku, qty: Number(i.qty), satuan: i.satuan || 'pcs',
          faktor: Number(i.faktor) || 1, harga_satuan: Number(i.harga_satuan) || 0, diskon: 0
        }))
      });
      await Sync.tarikMaster(true);
      await Sync.tarikStok();
      await sukses('Pembelian tersimpan, stok & HPP diperbarui.', 'pembelian');
    } catch (e) {
      $('#pesanBeli').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
      btn.disabled = false;
    }
  }

  /* ==================== PELANGGAN & SUPPLIER ==================== */

  async function muatMitra() {
    memuat('#isiMitra');
    try {
      /* Ditarik TERPISAH, masing-masing dengan penjagaannya sendiri.
         Dulu keduanya dalam satu Promise.all, dan itu bug nyata: Kepala Cabang
         punya izin pelanggan tapi TIDAK punya supplier, jadi permintaan supplier
         ditolak server, satu penolakan menjatuhkan seluruh Promise.all, dan
         daftar pelanggan mereka ikut lenyap di balik kotak merah — gara-gara
         tabel yang memang bukan urusan mereka.
         `null` berarti "tidak boleh / gagal", dan kartunya tidak digambar sama
         sekali. Kartu kosong tanpa keterangan lebih membingungkan daripada
         tidak ada kartu. */
      const [pel, sup] = await Promise.all([
        bolehIzin('pelanggan', 'lihat') ? API.daftarPelanggan().catch(() => null) : null,
        bolehIzin('supplier', 'lihat') ? API.daftarSupplier().catch(() => null) : null
      ]);
      $('#isiMitra').innerHTML = `
        ${pel ? `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Pelanggan</h3><div style="flex:1"></div>
            ${bolehIzin('pelanggan', 'buat') ? '<button class="tombol utama" id="btnPelangganBaru">+ Pelanggan</button>' : ''}</div>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
            { judul: 'Telepon', kunci: 'telepon' },
            { judul: 'Level harga', render: r => `<span class="lencana">${esc(normalLevelWeb(r.level_harga))}</span>` },
            { judul: 'Limit kredit', angka: true, render: r => rp(r.limit_kredit) },
            { judul: 'Termin', render: r => r.termin_hari ? r.termin_hari + ' hari' : '—' },
            { judul: 'Piutang', angka: true, render: r => r.sisa_piutang > 0
                ? `<span class="stok-kritis">${rp(r.sisa_piutang)}</span>` : '—' },
            { judul: '', render: r => `<button class="tombol kecil" data-edit-pelanggan="${esc(r.kode)}">Ubah</button>` }
          ], pel, { kosong: 'Belum ada pelanggan', pisahNonaktif: true })}
        </div>` : ''}

        ${sup ? `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Supplier</h3><div style="flex:1"></div>
            ${bolehIzin('supplier', 'buat') ? '<button class="tombol utama" id="btnSupplierBaru">+ Supplier</button>' : ''}</div>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama', kunci: 'nama' },
            { judul: 'Kontak', kunci: 'kontak' },
            { judul: 'Telepon', kunci: 'telepon' },
            { judul: 'Termin', render: r => r.termin_hari ? r.termin_hari + ' hari' : '—' },
            { judul: '', render: r => `<button class="tombol kecil" data-edit-supplier="${esc(r.kode)}">Ubah</button>` }
          ], sup, { kosong: 'Belum ada supplier', pisahNonaktif: true })}
        </div>` : ''}`;
      $('#isiMitra')._pel = pel;
      $('#isiMitra')._sup = sup;
    } catch (e) { galat('#isiMitra', e); }
  }

  function editorPelanggan(kode) {
    const p = kode ? ($('#isiMitra')._pel || []).find(x => x.kode === kode) : null;
    bukaModal(p ? 'Ubah pelanggan' : 'Pelanggan baru', `
      <div class="baris2">
        <div class="grup"><label>Kode</label><input type="text" id="cKode" value="${esc(p?.kode || '')}" ${p ? 'disabled' : ''} placeholder="otomatis"></div>
        <div class="grup"><label>Nama *</label><input type="text" id="cNama" value="${esc(p?.nama || '')}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Telepon</label><input type="text" id="cTelepon" value="${esc(p?.telepon || '')}"></div>
        <div class="grup"><label>Level harga</label><select id="cLevel">
          ${LEVEL_HARGA.map(l =>
            `<option value="${l}" ${normalLevelWeb(p?.level_harga) === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </div>
      <div class="grup"><label>Alamat</label><input type="text" id="cAlamat" value="${esc(p?.alamat || '')}"></div>
      <div class="baris2">
        <div class="grup"><label>Limit kredit (Rp)</label><input type="text" inputmode="numeric" class="uang" id="cLimit" value="${ribuan(p?.limit_kredit || 0)}"></div>
        <div class="grup"><label>Termin (hari)</label><input type="number" id="cTermin" value="${p?.termin_hari || 0}"></div>
      </div>
      <label class="cek"><input type="checkbox" id="cAktif" ${p?.aktif !== false ? 'checked' : ''}> Aktif</label>
      <p class="petunjuk">Level harga yang dipilih di sini otomatis dipakai kasir begitu pelanggan ini dipilih di layar kasir.</p>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPelanggan">Simpan</button>`);
  }

  function editorSupplier(kode) {
    const s = kode ? ($('#isiMitra')._sup || []).find(x => x.kode === kode) : null;
    bukaModal(s ? 'Ubah supplier' : 'Supplier baru', `
      <div class="baris2">
        <div class="grup"><label>Kode</label><input type="text" id="sKode" value="${esc(s?.kode || '')}" ${s ? 'disabled' : ''} placeholder="otomatis"></div>
        <div class="grup"><label>Nama *</label><input type="text" id="sNama" value="${esc(s?.nama || '')}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Kontak</label><input type="text" id="sKontak" value="${esc(s?.kontak || '')}"></div>
        <div class="grup"><label>Telepon</label><input type="text" id="sTelepon" value="${esc(s?.telepon || '')}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Alamat</label><input type="text" id="sAlamat" value="${esc(s?.alamat || '')}"></div>
        <div class="grup"><label>Termin (hari)</label><input type="number" id="sTermin" value="${s?.termin_hari || 0}"></div>
      </div>
      <label class="cek"><input type="checkbox" id="sAktif" ${s?.aktif !== false ? 'checked' : ''}> Aktif</label>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanSupplier">Simpan</button>`);
  }

  /* ==================== PETUGAS (FRONTLINER) ====================
   * Daftar orang yang boleh mengklaim penjualan. Sengaja terpisah dari Pengguna:
   * pramuniaga dan tim pemasang biasanya tidak pernah menyentuh mesin kasir, jadi
   * memaksa mereka punya akun berarti membagikan kredensial tanpa alasan.
   *
   * Tidak ada tombol Hapus. Baris petugas adalah rujukan klaim-klaim lama; yang
   * keluar dinonaktifkan, supaya laporan poin bulan lalu tetap bisa dibaca.
   */
  const LABEL_PERAN_PETUGAS = { PENJUAL: 'Penjual', PEMASANG: 'Pemasang' };

  /** Bobot peran yang sedang berlaku, dibaca dari setting master. */
  function bobotSekarang() {
    try {
      const j = JSON.parse(APP_STATE.setting?.bobot_peran_klaim || '{}');
      if (Number(j.PENJUAL) > 0 || Number(j.PEMASANG) > 0) {
        return { PENJUAL: Number(j.PENJUAL) || 0, PEMASANG: Number(j.PEMASANG) || 0 };
      }
    } catch (e) { /* setting rusak — pakai bawaan */ }
    return { PENJUAL: 60, PEMASANG: 40 };
  }

  /**
   * Pratinjau pembagian. Dua angka bobot itu abstrak sampai orang melihat
   * akibatnya pada satu pekerjaan nyata — dan bobot yang dipahami setengah-setengah
   * adalah bobot yang akan diprotes belakangan.
   */
  function contohBobot(b) {
    const t = Number(b.PENJUAL) + Number(b.PEMASANG);
    if (!(t > 0)) return 'Isi salah satu bobot lebih dari 0.';
    const p1 = Math.round(Number(b.PENJUAL) / t * 1000) / 10;
    const poin1 = Math.round(10 * Number(b.PENJUAL) / t * 10) / 10;
    return `Pekerjaan bernilai 10 poin dibagi berdua: penjual ${poin1} poin (${p1}%), ` +
           `pemasang ${Math.round((10 - poin1) * 10) / 10} poin (${Math.round((100 - p1) * 10) / 10}%). ` +
           `Omzet & laba dibagi dengan persentase yang sama.`;
  }

  async function muatPetugas() {
    memuat('#isiPetugas');
    try {
      const rows = await API.daftarPetugas();
      const b = bobotSekarang();
      $('#isiPetugas').innerHTML = `
        <div class="kartu">
          <h3>Bobot peran</h3>
          <p class="petunjuk">Menentukan pembagian poin — dan pembagian omzet — antara
             yang menjual dan yang memasang. Kasir tidak bisa mengubahnya; di layar
             kasir ia hanya memilih orangnya, dan perannya mengikuti urutan
             (yang pertama menjual, yang kedua memasang).</p>
          <div class="baris2">
            <div class="grup"><label>Penjual</label>
              <input type="number" id="bobotPenjual" min="0" step="1" value="${b.PENJUAL}"
                     ${bolehIzin('petugas', 'ubah') ? '' : 'disabled'}></div>
            <div class="grup"><label>Pemasang</label>
              <input type="number" id="bobotPemasang" min="0" step="1" value="${b.PEMASANG}"
                     ${bolehIzin('petugas', 'ubah') ? '' : 'disabled'}></div>
          </div>
          <div class="pesan info" id="bobotContoh">${esc(contohBobot(b))}</div>
          ${bolehIzin('petugas', 'ubah')
            ? '<button class="tombol utama" id="btnSimpanBobot">Simpan bobot</button>' : ''}
          <div id="pesanBobot"></div>
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Petugas / pramuniaga</h3><div style="flex:1"></div>
            ${bolehIzin('petugas', 'buat') ? '<button class="tombol utama" id="btnPetugasBaru">+ Petugas</button>' : ''}</div>
          <p class="petunjuk">Nama di daftar inilah yang muncul di layar kasir saat menutup nota.
             Petugas yang sudah keluar cukup dinonaktifkan — jangan dihapus, karena
             klaim dan poin lamanya masih menunjuk ke sini.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
            { judul: 'Peran utama', render: r => `<span class="lencana">${esc(LABEL_PERAN_PETUGAS[r.peran_utama] || r.peran_utama)}</span>` },
            { judul: 'Cabang', render: r => r.cabang === '*' ? 'semua cabang' : esc(r.cabang) },
            { judul: 'Telepon', kunci: 'telepon' },
            { judul: '', render: r => bolehIzin('petugas', 'ubah')
                ? `<button class="tombol kecil" data-edit-petugas="${esc(r.kode)}">Ubah</button>` : '' }
          ], rows, { kosong: 'Belum ada petugas — kasir belum bisa mengklaimkan penjualan ke siapa pun', pisahNonaktif: true })}
        </div>`;
      $('#isiPetugas')._rows = rows;
    } catch (e) { galat('#isiPetugas', e); }
  }

  function editorPetugas(kode) {
    const p = kode ? ($('#isiPetugas')._rows || []).find(x => x.kode === kode) : null;
    const lintas = !!APP_STATE.flag.akses_lintas_cabang;
    bukaModal(p ? 'Ubah petugas' : 'Petugas baru', `
      <div class="baris2">
        <div class="grup"><label>Kode</label>
          <input type="text" id="ptKode" value="${esc(p?.kode || '')}" ${p ? 'disabled' : ''} placeholder="otomatis"></div>
        <div class="grup"><label>Nama *</label><input type="text" id="ptNama" value="${esc(p?.nama || '')}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Peran utama</label><select id="ptPeran">
          ${Object.keys(LABEL_PERAN_PETUGAS).map(k =>
            `<option value="${k}" ${normalPeranWeb(p?.peran_utama) === k ? 'selected' : ''}>${LABEL_PERAN_PETUGAS[k]}</option>`).join('')}
        </select></div>
        <div class="grup"><label>Telepon</label><input type="text" id="ptTelepon" value="${esc(p?.telepon || '')}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Cabang</label><select id="ptCabang">
          ${(APP_STATE.daftarCabang || []).map(c =>
            `<option value="${esc(c)}" ${p?.cabang === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          ${lintas ? `<option value="*" ${p?.cabang === '*' ? 'selected' : ''}>Semua cabang</option>` : ''}
        </select></div>
      </div>
      <label class="cek"><input type="checkbox" id="ptAktif" ${p?.aktif !== false ? 'checked' : ''}> Aktif</label>
      <p class="petunjuk"><strong>Peran utama</strong> dipakai sebagai bawaan saat namanya
        dimasukkan ke sebuah tim, dan menentukan bobot pembagian bila kasir tidak
        mengisi poin sendiri.<br>
        Tidak ada tarif per orang: nilai pekerjaan melekat pada <strong>produk</strong>,
        supaya dua orang yang mengerjakan hal yang sama mendapat poin yang sama.</p>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPetugas">Simpan</button>`);
  }

  /* ==================== LAPORAN PERFORMA (id layar tetap 'poin') ============
   * Sistem berhenti pada poin. Berapa rupiah satu poin sengaja tidak ada di sini —
   * itu keputusan pemilik, bisa berubah tiap bulan, dan bisa berbentuk apa pun.
   *
   * Layarnya bernama Performa sejak v1.22 karena isinya bukan poin saja: ada
   * omzet, jumlah nota, dan peringkat cabang. Id layar, kunci izin, wadah
   * #isiPoin dan jenis ekspor tetap 'poin' — lihat catatan di MENU pada app.js.
   */

  /* Urutan peringkat. Nilainya <ukuran>_<arah> supaya satu dropdown cukup untuk
     "poin/omzet" DAN "tertinggi/terendah" tanpa kotak centang tambahan. */
  const URUT_PETUGAS = [
    { id: 'poin_desc', label: 'Poin tertinggi' },
    { id: 'poin_asc', label: 'Poin terendah' },
    { id: 'omzet_desc', label: 'Omzet tertinggi' },
    { id: 'omzet_asc', label: 'Omzet terendah' }
  ];
  const URUT_CABANG = [
    { id: 'omzet_desc', label: 'Omzet tertinggi' },
    { id: 'omzet_asc', label: 'Omzet terendah' }
  ];

  /** Salinan terurut — array aslinya tidak diubah supaya bisa diurut ulang. */
  const urutkan = (rows, kunciArah) => {
    const [kunci, arah] = String(kunciArah || 'poin_desc').split('_');
    return rows.slice().sort((a, b) => arah === 'asc'
      ? Number(a[kunci]) - Number(b[kunci])
      : Number(b[kunci]) - Number(a[kunci]));
  };

  let dataPoin = null, urutPetugas = 'poin_desc', urutCabang = 'omzet_desc';

  async function muatPoin() {
    memuat('#isiPoin');
    try {
      const rows = await API.daftarPetugas().catch(() => []);
      const kini = new Date();
      // tanggalLokal(), BUKAN toISOString(): yang kedua itu UTC, dan tengah
      // malam 1 Agustus di WIB masih 31 Juli pukul 17:00 UTC. Rentang bawaannya
      // dulu mundur sehari dan ikut menarik penjualan hari terakhir bulan lalu.
      const awal = tanggalLokal(new Date(kini.getFullYear(), kini.getMonth(), 1));
      $('#isiPoin').innerHTML = `
        <div class="kartu">
          <h3>Performa petugas &amp; cabang</h3>
          <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
            <div style="max-width:170px"><label>Dari</label>
              <input type="date" id="poinDari" value="${awal}"></div>
            <div style="max-width:170px"><label>Sampai</label>
              <input type="date" id="poinSampai" value="${tanggalLokal(kini)}"></div>
            <div style="max-width:220px"><label>Petugas</label><select id="poinPetugas">
              <option value="">Semua petugas</option>
              ${rows.map(r => `<option value="${esc(r.kode)}">${esc(r.nama)}</option>`).join('')}
            </select></div>
            <button class="tombol utama" id="btnLaporanPoin">Tampilkan</button>
          </div>
          <p class="petunjuk">Angka di sini dibekukan saat notanya masuk, bukan dihitung ulang
             sekarang. Menaikkan poin sebuah produk hari ini tidak mengubah pekerjaan yang
             sudah selesai bulan lalu. Nota yang dibatalkan otomatis keluar dari hitungan.</p>
        </div>
        <div id="hasilPoin"></div>`;
    } catch (e) { galat('#isiPoin', e); }
  }

  async function gambarHasilPoin() {
    const wadah = $('#hasilPoin');
    wadah.innerHTML = '<div class="kartu">Menghitung…</div>';
    try {
      dataPoin = await API.laporanPoin({
        dari: nilai('poinDari'), sampai: nilai('poinSampai'),
        kode_petugas: nilai('poinPetugas') || undefined
      });
      gambarPeringkat();
    } catch (e) { galat('#hasilPoin', e); }
  }

  /**
   * Menggambar peringkat DARI HASIL YANG SUDAH ADA.
   *
   * Mengganti urutan tidak menghitung ulang lewat server: laporan ini membaca
   * seluruh penjualan dan klaim sebulan di beberapa cabang — itu perhitungan
   * paling berat di aplikasi, dan mengulangnya hanya untuk membalik urutan
   * membuat layar diam beberapa detik tanpa satu pun angka yang berubah.
   */
  function gambarPeringkat() {
    const wadah = $('#hasilPoin');
    const d = dataPoin;
    if (!d) return;
    const r = d.ringkas;
    const adaLaba = r.laba !== undefined;
    const bobot = Object.keys(d.bobot || {})
      .map(k => `${esc(LABEL_PERAN_PETUGAS[k] || k)} ${d.bobot[k]}`).join(' : ');

    const cabang = urutkan(d.per_cabang || [], urutCabang);
    /* Selisih antara omzet cabang dan omzet yang terbagi ke petugas = penjualan
       yang tidak punya petugas sama sekali. Itu bukan galat, tapi harus terlihat:
       tanpa angka ini, peringkat petugas terlihat menjelaskan seluruh omzet
       padahal tidak. */
    const takTerklaim = cabang.reduce((t, c) =>
      t + Math.max(0, Number(c.omzet) - Number(c.omzet_klaim)), 0);
    const petugas = urutkan(d.petugas || [], urutPetugas);
    const pilihUrut = (id, daftar, terpilih) =>
      `<select id="${id}" style="max-width:180px">${daftar.map(u =>
        `<option value="${u.id}" ${u.id === terpilih ? 'selected' : ''}>${esc(u.label)}</option>`
      ).join('')}</select>`;

    wadah.innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">Petugas</div><div class="nilai">${r.petugas}</div></div>
          <div class="kartu statistik"><div class="label">Nota terklaim</div><div class="nilai">${r.nota}</div></div>
          <div class="kartu statistik"><div class="label">Total poin</div><div class="nilai">${r.poin}</div></div>
          <div class="kartu statistik"><div class="label">Omzet terklaim</div><div class="nilai">${rp(r.omzet)}</div></div>
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Peringkat cabang</h3>
            <div style="flex:1"></div>
            <label style="margin:0">Urutkan</label>${pilihUrut('urutCabang', URUT_CABANG, urutCabang)}</div>
          ${tabel([
            { judul: '#', angka: true, kelas: 'sempit', render: x => `<strong>${cabang.indexOf(x) + 1}</strong>` },
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Nota', angka: true, kunci: 'nota' },
            { judul: 'Omzet', angka: true, render: x => `<strong>${rp(x.omzet)}</strong>` },
            { judul: 'Poin', angka: true, kunci: 'poin' },
            { judul: 'Petugas', angka: true, kunci: 'petugas' }
          ], cabang, { kosong: 'Belum ada penjualan pada rentang tanggal ini' })}
          ${takTerklaim > 0 ? `<p class="petunjuk"><strong>${rp(takTerklaim)}</strong> dari omzet
             di atas <strong>belum terklaim</strong> — nota terjual tanpa petugas, jadi tidak
             muncul di peringkat petugas mana pun. Omzet cabang dibaca dari penjualan, omzet
             petugas dari klaim; selisih inilah bedanya.</p>` : ''}
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Peringkat per petugas</h3>
            <div style="flex:1"></div>
            <label style="margin:0">Urutkan</label>${pilihUrut('urutPetugas', URUT_PETUGAS, urutPetugas)}
            ${tombolEkspor('poin', { dari: nilai('poinDari'), sampai: nilai('poinSampai') })}</div>
          <p class="petunjuk">Omzet petugas adalah <strong>porsi</strong> dia, bukan nilai nota
             penuh: nota 100.000 yang dikerjakan berdua terbagi menurut bobot peran, jadi jumlah
             omzet semua petugas tidak dobel. Nilai poin diatur per produk di menu Produk → tab
             <strong>Tim &amp; poin</strong>. Bobot peran saat kasir tidak mengisi
             sendiri: ${bobot || '—'}. Berapa rupiah satu poin sengaja tidak dihitung
             sistem — itu keputusan Anda.</p>
          ${tabel([
            { judul: '#', angka: true, kelas: 'sempit', render: x => `<strong>${petugas.indexOf(x) + 1}</strong>` },
            { judul: 'Petugas', kunci: 'nama' },
            { judul: 'Poin', angka: true, render: x => `<strong>${x.poin}</strong>` },
            { judul: 'Nota', angka: true, kunci: 'nota' },
            { judul: 'Klaim', angka: true, kunci: 'klaim' },
            { judul: 'Omzet', angka: true, render: x => rp(x.omzet) },
            ...(adaLaba ? [{ judul: 'Laba', angka: true, render: x => rp(x.laba) }] : []),
            { judul: 'Rincian peran', render: x => x.per_peran.map(p =>
                `<span class="lencana">${esc(LABEL_PERAN_PETUGAS[p.peran] || p.peran)} ${p.poin}</span>`).join(' ') }
          ], petugas, { kosong: 'Belum ada klaim pada rentang tanggal ini' })}
        </div>

        <div class="kartu">
          <h3>Rincian klaim</h3>
          ${d.dipotong ? '<p class="petunjuk">Hanya 500 klaim terbaru yang ditampilkan. Gunakan Ekspor untuk data penuh.</p>' : ''}
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'Petugas', kunci: 'nama' },
            { judul: 'Peran', render: x => esc(LABEL_PERAN_PETUGAS[x.peran] || x.peran) },
            { judul: 'Cakupan', render: x => x.jenis === 'NOTA'
                ? '<span class="lencana">seluruh nota</span>'
                : `<span class="lencana kuning">baris ${x.baris}</span>` },
            { judul: 'Poin', angka: true, kunci: 'poin' },
            { judul: 'Bagian', angka: true, render: x => x.porsi + '%' },
            { judul: 'Omzet', angka: true, render: x => rp(x.omzet) }
          ], d.rinci, { kosong: 'Belum ada klaim' })}
        </div>`;
  }

  /* ==================== PIUTANG ==================== */

  async function muatPiutang() {
    memuat('#isiPiutang');
    try {
      const d = await API.daftarPiutang({});
      const a = d.aging;
      $('#isiPiutang').innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">Belum jatuh tempo</div><div class="nilai">${rp(a.lancar)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 1–30 hari</div><div class="nilai">${rp(a.h30)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 31–60</div><div class="nilai">${rp(a.h60)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 61–90</div><div class="nilai">${rp(a.h90)}</div></div>
          <div class="kartu statistik"><div class="label">Telat &gt; 90 hari</div>
            <div class="nilai" style="color:var(--bahaya)">${rp(a.lebih)}</div></div>
        </div>
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Daftar piutang — total ${rp(d.total)}</h3>
            <div style="flex:1"></div>${tombolEkspor('piutang')}</div>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Pelanggan', kunci: 'nama_pelanggan' },
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'Jatuh tempo', render: r => esc(tglTampil(r.jatuh_tempo)) },
            { judul: 'Telat', render: r => r.hari_telat > 0
                ? `<span class="lencana ${r.hari_telat > 60 ? 'merah' : 'kuning'}">${r.hari_telat} hari</span>`
                : '<span class="lencana hijau">lancar</span>' },
            { judul: 'Sisa', angka: true, render: r => rp(r.sisa) },
            { judul: '', render: r => bolehIzin('piutang', 'buat')
                ? `<button class="tombol kecil utama" data-bayar-piutang="${esc(r.uuid)}" data-cabang="${esc(r.cabang)}">Terima bayar</button>` : '' }
          ], d.piutang, { kosong: 'Tidak ada piutang beredar' })}
        </div>`;
      $('#isiPiutang')._rows = d.piutang;
    } catch (e) { galat('#isiPiutang', e); }
  }

  function dialogBayarPiutang(uuid, cabang) {
    const p = ($('#isiPiutang')._rows || []).find(x => x.uuid === uuid);
    if (!p) return;
    bukaModal('Terima pembayaran piutang', `
      <p class="petunjuk">${esc(p.nama_pelanggan)} · nota ${esc(tglTampil(p.tanggal))} · sisa <strong>${rp(p.sisa)}</strong></p>
      <div class="baris2">
        <div class="grup"><label>Tanggal</label><input type="date" id="bpTanggal" value="${tanggalLokal()}"></div>
        <div class="grup"><label>Jumlah bayar</label><input type="text" inputmode="numeric" class="uang" id="bpJumlah" value="${ribuan(p.sisa)}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Metode</label><select id="bpMetode">
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option>
          <option value="qris">QRIS</option></select></div>
        <div class="grup"><label>Referensi</label><input type="text" id="bpRef"></div>
      </div>
      <div id="pesanBayarPiutang"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol sukses" id="btnKonfirmasiBayarPiutang"
         data-uuid="${esc(uuid)}" data-cabang="${esc(cabang)}">Simpan pembayaran</button>`);
  }

  /* ==================== USER & HAK AKSES ==================== */

  async function muatPengguna() {
    memuat('#isiPengguna');
    try {
      const [user, peran, perangkat] = await Promise.all([
        API.daftarUser(), API.daftarPeran(), API.daftarPerangkat()
      ]);
      cachePeran = peran.peran;
      cacheKamus = { modul: peran.modul, aksi: peran.aksi, flag: peran.flag };

      $('#isiPengguna').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Pengguna</h3><div style="flex:1"></div>
            ${bolehIzin('user', 'buat') ? '<button class="tombol utama" id="btnUserBaru">+ Pengguna</button>' : ''}</div>
          ${tabel([
            { judul: 'ID', kunci: 'id_user' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}
              ${r.wajib_ganti_pin ? ' <span class="lencana kuning">PIN awal</span>' : ''}` },
            { judul: 'Username', kunci: 'username' },
            { judul: 'Peran', render: r => `<span class="lencana">${esc(r.nama_peran)}</span>` },
            { judul: 'Cabang', render: r => r.cabang === '*' ? 'semua' : esc(r.cabang) },
            { judul: 'Login terakhir', render: r => esc(waktuTampil(r.terakhir_login)) },
            { judul: '', render: r => `
              <button class="tombol kecil" data-edit-user="${esc(r.id_user)}">Ubah</button>
              ${bolehIzin('user', 'ubah') ? `<button class="tombol kecil" data-reset-pin="${esc(r.id_user)}">Reset PIN</button>` : ''}` }
          ], user, { kosong: 'Belum ada pengguna', pisahNonaktif: true })}
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Peran &amp; hak akses</h3><div style="flex:1"></div>
            ${bolehIzin('user', 'ubah') ? '<button class="tombol utama" id="btnPeranBaru">+ Peran baru</button>' : ''}</div>
          <p class="petunjuk">Peran menentukan menu apa yang muncul dan aksi apa yang diizinkan. Peran OWNER sengaja dikunci agar sistem tidak bisa terkunci dari dirinya sendiri.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode_peran' },
            { judul: 'Nama', kunci: 'nama' },
            { judul: 'Keterangan', kunci: 'keterangan' },
            { judul: 'Batas diskon', render: r => (r.flag.diskon_maks_persen ?? 0) + '%' },
            { judul: 'Harga modal', render: r => r.flag.lihat_harga_modal
                ? '<span class="lencana hijau">boleh</span>' : '<span class="lencana">tidak</span>' },
            { judul: '', render: r => r.kode_peran === 'OWNER'
                ? '<span class="lencana">terkunci</span>'
                : `<button class="tombol kecil" data-edit-peran="${esc(r.kode_peran)}">Atur hak akses</button>` }
          ], cachePeran)}
        </div>

        <div class="kartu">
          <h3>Perangkat terdaftar</h3>
          <p class="petunjuk">Perangkat baru wajib disetujui sebelum bisa transaksi — ini yang mencegah PIN kasir yang bocor dipakai dari HP pribadi.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama perangkat', kunci: 'nama' },
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Status', render: r => `<span class="lencana ${
                r.status === 'DISETUJUI' ? 'hijau' : (r.status === 'DIBLOKIR' ? 'merah' : 'kuning')}">${esc(r.status)}</span>` },
            { judul: 'Sinkron terakhir', render: r => esc(waktuTampil(r.terakhir_sinkron)) },
            { judul: '', render: r => bolehIzin('user', 'setujui') ? `
              ${r.status !== 'DISETUJUI' ? `<button class="tombol kecil sukses" data-perangkat="${esc(r.id_perangkat)}" data-status="DISETUJUI">Setujui</button>` : ''}
              ${r.status !== 'DIBLOKIR' ? `<button class="tombol kecil bahaya" data-perangkat="${esc(r.id_perangkat)}" data-status="DIBLOKIR">Blokir</button>` : ''}` : '' }
          ], perangkat, { kosong: 'Belum ada perangkat', pisahNonaktif: true,
               nonaktif: r => r.status === 'DIBLOKIR' })}
        </div>`;
      $('#isiPengguna')._user = user;
    } catch (e) { galat('#isiPengguna', e); }
  }

  function editorUser(id) {
    const u = id ? ($('#isiPengguna')._user || []).find(x => x.id_user === id) : null;
    const cabangOpsi = ['*', ...APP_STATE.daftarCabang];
    bukaModal(u ? 'Ubah pengguna — ' + u.username : 'Pengguna baru', `
      <div class="baris2">
        <div class="grup"><label>Nama lengkap *</label><input type="text" id="uNama" value="${esc(u?.nama || '')}"></div>
        <div class="grup"><label>Username *</label>
          <input type="text" id="uUsername" value="${esc(u?.username || '')}" ${u ? 'disabled' : ''} autocapitalize="none"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Peran *</label><select id="uPeran">
          ${(cachePeran || []).map(p => `<option value="${esc(p.kode_peran)}" ${u?.peran === p.kode_peran ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}
        </select></div>
        <div class="grup"><label>Cabang</label><select id="uCabang">
          ${cabangOpsi.map(c => `<option value="${esc(c)}" ${u?.cabang === c ? 'selected' : ''}>${c === '*' ? 'Semua cabang' : esc(c)}</option>`).join('')}
        </select></div>
      </div>
      ${u ? `<label class="cek"><input type="checkbox" id="uAktif" ${u.aktif ? 'checked' : ''}> Aktif</label>`
          : `<div class="baris2">
              <div class="grup"><label>PIN (6 digit, kosongkan untuk acak)</label><input type="text" id="uPin" inputmode="numeric" maxlength="6"></div>
              <div class="grup"><label>Password (kosongkan untuk acak)</label><input type="text" id="uPassword"></div>
             </div>
             <p class="petunjuk">PIN dipakai kasir untuk masuk cepat. Password dipakai peran manajerial. Pengguna baru wajib mengganti PIN saat pertama masuk.</p>`}
      <div id="pesanUser"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanUser" ${u ? `data-id="${esc(u.id_user)}"` : ''}>Simpan</button>`);
  }

  /** Editor matriks hak akses — inti dari "menu muncul sesuai peran". */
  function editorPeran(kode) {
    const p = kode ? cachePeran.find(x => x.kode_peran === kode) : null;
    const { modul, aksi, flag } = cacheKamus;
    const punya = (m, a) => {
      const v = p?.izin?.[m];
      return v === '*' || (Array.isArray(v) && v.includes(a));
    };

    bukaModal(p ? 'Hak akses — ' + p.nama : 'Peran baru', `
      <div class="baris2">
        <div class="grup"><label>Kode peran *</label>
          <input type="text" id="rKode" value="${esc(p?.kode_peran || '')}" ${p ? 'disabled' : ''} placeholder="mis. SUPERVISOR"></div>
        <div class="grup"><label>Nama tampilan *</label><input type="text" id="rNama" value="${esc(p?.nama || '')}"></div>
      </div>
      <div class="grup"><label>Keterangan</label><input type="text" id="rKet" value="${esc(p?.keterangan || '')}"></div>

      <label>Matriks izin</label>
      <p class="petunjuk">Menu di bilah atas hanya muncul bila izin yang dibutuhkannya tercentang. Contoh: menu Produk butuh <code>produk · buat</code>, jadi peran yang hanya punya <code>produk · lihat</code> tetap bisa berjualan tanpa melihat menu master produk.</p>
      <div class="matriks">
        <table>
          <thead><tr><th>Modul</th>${aksi.map(a => `<th style="text-align:center">${esc(a)}</th>`).join('')}</tr></thead>
          <tbody>
            ${modul.map(m => `<tr>
              <td>${esc(m)}</td>
              ${aksi.map(a => `<td style="text-align:center">
                <input type="checkbox" data-izin="${esc(m)}" data-aksi="${esc(a)}" ${punya(m, a) ? 'checked' : ''}></td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <label style="margin-top:14px">Izin khusus</label>
      <div class="petak-flag">
        ${flag.map(f => `<label class="cek">
          <input type="checkbox" data-flag="${esc(f)}" ${p?.flag?.[f] ? 'checked' : ''}> ${esc(f.replace(/_/g, ' '))}</label>`).join('')}
      </div>
      <div class="grup" style="max-width:220px;margin-top:12px">
        <label>Batas diskon maksimal (%)</label>
        <input type="number" id="rDiskon" value="${p?.flag?.diskon_maks_persen ?? 0}" min="0" max="100">
      </div>
      <div id="pesanPeran"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPeran">Simpan hak akses</button>`);
  }

  /* ==================== CABANG ==================== */

  async function muatCabang() {
    memuat('#isiCabang');
    try {
      const rows = await API.daftarCabangAdmin();
      $('#isiCabang').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Cabang</h3><div style="flex:1"></div>
            ${bolehIzin('cabang', 'buat') ? '<button class="tombol utama" id="btnCabangBaru">+ Cabang baru</button>' : ''}</div>
          <p class="petunjuk">Setiap cabang punya file database sendiri di Google Drive. Pemisahan inilah yang membuat kasir cabang A tidak pernah menunggu cabang B saat menyimpan transaksi.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode_cabang' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
            { judul: 'Alamat', kunci: 'alamat' },
            { judul: 'Telepon', kunci: 'telepon' },
            { judul: 'Prefix nota', kunci: 'prefix_nota' },
            { judul: '', render: r => `<button class="tombol kecil" data-edit-cabang="${esc(r.kode_cabang)}">Ubah</button>` }
          ], rows, { kosong: 'Belum ada cabang', pisahNonaktif: true })}
        </div>`;
      $('#isiCabang')._rows = rows;
    } catch (e) { galat('#isiCabang', e); }
  }

  function editorCabang(kode) {
    const c = kode ? ($('#isiCabang')._rows || []).find(x => x.kode_cabang === kode) : null;
    bukaModal(c ? 'Ubah cabang' : 'Cabang baru', `
      <div class="baris2">
        <div class="grup"><label>Kode cabang *</label>
          <input type="text" id="bKode" value="${esc(c?.kode_cabang || '')}" ${c ? 'disabled' : ''} placeholder="BR02" maxlength="8"></div>
        <div class="grup"><label>Nama *</label><input type="text" id="bNama" value="${esc(c?.nama || '')}"></div>
      </div>
      <div class="grup"><label>Alamat</label><input type="text" id="bAlamat" value="${esc(c?.alamat || '')}"></div>
      <div class="baris2">
        <div class="grup"><label>Telepon</label><input type="text" id="bTelepon" value="${esc(c?.telepon || '')}"></div>
        ${c ? `<div class="grup"><label>Prefix nota</label><input type="text" id="bPrefix" value="${esc(c.prefix_nota || '')}"></div>` : '<div></div>'}
      </div>
      ${c ? `<label class="cek"><input type="checkbox" id="bAktif" ${c.aktif ? 'checked' : ''}> Aktif</label>`
          : '<p class="petunjuk">Pembuatan cabang membuat file spreadsheet baru di Drive — proses ini bisa memakan waktu sampai satu menit. Jangan tutup jendela.</p>'}
      <div id="pesanCabang"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanCabang">Simpan</button>`);
  }

  /* ==================== SETTING SISTEM ==================== */

  /**
   * Setting yang sudah punya layar khususnya sendiri, jadi tidak ikut ditampilkan
   * sebagai kolom mentah di layar Sistem.
   */
  const SETTING_PUNYA_LAYAR_SENDIRI = ['bobot_peran_klaim'];

  const LABEL_SETTING = {
    nama_usaha: 'Nama usaha (tercetak di struk)',
    alamat_usaha: 'Alamat usaha', telepon_usaha: 'Telepon usaha',
    npwp: 'NPWP', pkp: 'Pengusaha Kena Pajak (PPN dihitung per nota)',
    tarif_ppn: 'Tarif PPN (%)',
    izinkan_stok_minus: 'Boleh menjual saat stok 0 (ditandai untuk opname)',
    harga_per_cabang: 'Cabang boleh punya harga sendiri',
    metode_hpp: 'Metode HPP', footer_struk: 'Baris penutup struk',
    lebar_struk: 'Lebar kertas struk (mm)', mdr_qris: 'Potongan QRIS (%)',
    auto_jurnal: 'Posting jurnal otomatis'
  };
  const SETTING_BOOL = ['pkp', 'izinkan_stok_minus', 'harga_per_cabang', 'auto_jurnal'];

  async function muatSistem() {
    memuat('#isiSistem');
    try {
      /* Bobot peran punya layarnya sendiri di menu Petugas — lengkap dengan
         pratinjau pembagiannya. Membiarkannya juga muncul di sini sebagai JSON
         mentah berarti dua tempat mengubah satu hal, dan yang terakhir menyimpan
         menang tanpa ada yang tahu. */
      const rows = (await API.daftarSetting())
        .filter(r => !SETTING_PUNYA_LAYAR_SENDIRI.includes(r.kunci));
      $('#isiSistem').innerHTML = `
        <div class="kartu">
          <h3>Pengaturan sistem</h3>
          <p class="petunjuk">Perubahan berlaku untuk seluruh cabang dan langsung ditarik perangkat kasir pada sinkronisasi berikutnya.</p>
          <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
            ${rows.map(r => {
              const label = LABEL_SETTING[r.kunci] || r.kunci;
              if (SETTING_BOOL.includes(r.kunci)) {
                return `<label class="cek kartu-cek">
                  <input type="checkbox" data-setting="${esc(r.kunci)}" ${String(r.nilai) === 'true' ? 'checked' : ''}>
                  <span>${esc(label)}</span></label>`;
              }
              return `<div class="grup"><label>${esc(label)}</label>
                <input type="text" data-setting="${esc(r.kunci)}" value="${esc(r.nilai)}"></div>`;
            }).join('')}
          </div>
          ${bolehIzin('setting', 'ubah') ? '<button class="tombol utama" id="btnSimpanSetting" style="margin-top:14px">Simpan pengaturan</button>' : ''}
        </div>`;
    } catch (e) { galat('#isiSistem', e); }
  }

  /* ==================== AUDIT ==================== */

  async function muatAudit() {
    memuat('#isiAudit');
    try {
      const rows = await API.logAudit({ batas: 300 });
      $('#isiAudit').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Jejak audit</h3>
            <div style="flex:1"></div>${tombolEkspor('audit')}</div>
          <p class="petunjuk">Catatan setiap perubahan penting. Tidak bisa dihapus dari dalam aplikasi.</p>
          ${tabel([
            /* SATU-SATUNYA layar yang SENGAJA tetap yyyy-MM-dd, bukan dd/mm/yy.
               Ini catatan forensik: nilainya harus bisa dicocokkan huruf per
               huruf dengan isi sheet mentah saat menelusuri kejadian, dan tahun
               dua digit menghilangkan abad pada arsip lama. */
            { judul: 'Waktu', render: r => esc(String(r.waktu).replace('T', ' ')) },
            { judul: 'User', kunci: 'id_user' },
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Aksi', render: r => `<span class="lencana ${
                String(r.aksi).includes('VOID') || String(r.aksi).includes('GAGAL') ? 'merah' : ''}">${esc(r.aksi)}</span>` },
            { judul: 'Objek', render: r => `${esc(r.entitas)} ${esc(r.id_entitas)}` },
            { judul: 'Perubahan', render: r => `<span class="meta-kecil">${esc((r.nilai_baru || '').substring(0, 90))}</span>` }
          ], rows, { kosong: 'Belum ada catatan audit' })}
        </div>`;
    } catch (e) { galat('#isiAudit', e); }
  }

  /* ==================== LAPORAN DISKON ====================
   * Diskon adalah satu-satunya cara kasir bisa mengurangi uang masuk tanpa
   * menyentuh stok. Tanpa layar ini, satu-satunya cara menemukan pola yang
   * ganjil adalah membuka nota satu per satu — yang berarti tidak akan pernah
   * dilakukan. Urutannya sengaja dari rupiah terbesar, bukan terbaru.
   */
  async function muatDiskon() {
    const hariIni = tanggalLokal();
    const awalBulan = hariIni.substring(0, 8) + '01';
    if (!$('#dskDari')) {
      $('#isiDiskon').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <h3 style="margin:0">Diskon</h3>
            <div style="flex:1"></div>
            <input type="date" id="dskDari" value="${awalBulan}" style="width:auto">
            <input type="date" id="dskSampai" value="${hariIni}" style="width:auto">
            <button class="tombol utama" id="btnMuatDiskon">Tampilkan</button>
          </div>
          <p class="petunjuk">Persentase dihitung dari total diskon (baris + nota) terhadap nilai bruto.
            Kolom <strong>Disetujui</strong> berisi nama atasan yang menyetujui diskon di atas batas peran kasirnya.</p>
        </div>
        <div id="hasilDiskon"></div>`;
    }
    gambarHasilDiskon();
  }

  async function gambarHasilDiskon() {
    const w = $('#hasilDiskon');
    if (!w) return;
    w.innerHTML = '<div class="kartu">Memuat…</div>';
    try {
      const d = await API.laporanDiskon({ dari: $('#dskDari').value, sampai: $('#dskSampai').value });
      const r = d.ringkas;
      w.innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">Nota berdiskon</div>
            <div class="nilai">${r.nota_berdiskon}</div>
            <div class="meta-kecil">dari ${r.jumlah_nota} nota</div></div>
          <div class="kartu statistik"><div class="label">Total diskon</div>
            <div class="nilai">${rp(r.diskon)}</div>
            <div class="meta-kecil">${r.persen_rata}% dari bruto</div></div>
          <div class="kartu statistik"><div class="label">Perlu persetujuan</div>
            <div class="nilai">${r.disetujui}</div>
            <div class="meta-kecil">nota di atas batas peran</div></div>
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Per kasir</h3>
            <div style="flex:1"></div>${tombolEkspor('diskon_kasir', { dari: $('#dskDari').value, sampai: $('#dskSampai').value })}</div>
          ${tabel([
            { judul: 'Kasir', kunci: 'nama' },
            { judul: 'Nota', render: x => `${x.nota_diskon} / ${x.nota}`, kanan: true },
            { judul: 'Total diskon', render: x => rp(x.diskon), kanan: true },
            { judul: 'Rata-rata', render: x => x.persen_rata + '%', kanan: true },
            { judul: 'Tertinggi', render: x => `<span class="lencana ${x.persen_maks > 20 ? 'merah' : ''}">${x.persen_maks}%</span>`, kanan: true },
            { judul: 'Disetujui atasan', render: x => x.disetujui || '—', kanan: true }
          ], d.kasir, { kosong: 'Tidak ada diskon pada rentang ini' })}
        </div>

        <div class="kartu">
          <h3>Nota berdiskon</h3>
          ${d.dipotong ? '<p class="petunjuk">Hanya 300 nota terbesar yang ditampilkan.</p>' : ''}
          ${tabel([
            { judul: 'Tanggal', render: x => `${esc(tglTampil(x.tanggal))} ${esc(String(x.jam).substring(0, 5))}` },
            { judul: 'Nota', kunci: 'no_nota' },
            { judul: 'Kasir', kunci: 'kasir' },
            { judul: 'Bruto', render: x => rp(x.subtotal), kanan: true },
            { judul: 'Diskon', render: x => rp(x.diskon), kanan: true },
            { judul: '%', render: x => `<span class="lencana ${x.persen > 20 ? 'merah' : (x.persen > 10 ? 'kuning' : '')}">${x.persen}%</span>`, kanan: true },
            { judul: 'Disetujui', render: x => x.penyetuju ? esc(x.penyetuju) : '<span class="meta-kecil">—</span>' }
          ], d.nota, { kosong: 'Tidak ada nota berdiskon pada rentang ini' })}
        </div>`;
    } catch (e) { galat('#hasilDiskon', e); }
  }

  /* ==================== TRANSFER ANTAR CABANG ==================== */

  const LENCANA_TRANSFER = {
    DIKIRIM: 'kuning', DITERIMA: 'hijau', SELISIH: 'merah', DIBATALKAN: ''
  };

  async function muatTransfer() {
    memuat('#isiTransfer');
    try {
      const rows = await API.daftarTransfer({});
      const menunggu = rows.filter(r => r.bisa_diterima);

      $('#isiTransfer').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            ${menunggu.length ? `<span class="lencana kuning">${menunggu.length} menunggu diterima</span>` : ''}
            <div style="flex:1"></div>
            ${bolehIzin('transfer', 'buat') ? '<button class="tombol utama" id="btnTransferBaru">+ Kirim barang</button>' : ''}
          </div>
          <p class="petunjuk">Transfer berjalan dua langkah. Saat <strong>dikirim</strong>, stok keluar dari cabang asal dan nilainya
            masuk ke akun <em>Persediaan Dalam Perjalanan</em>. Saat cabang tujuan <strong>menerima</strong>, nilainya pindah ke
            persediaan cabang tujuan. Kekurangan saat penerimaan otomatis dibukukan sebagai Barang Rusak/Hilang di cabang pengirim —
            jadi barang yang hilang di jalan tidak bisa lolos diam-diam.</p>
        </div>

        ${menunggu.length ? `<div class="kartu">
          <h3>Menunggu penerimaan Anda</h3>
          ${tabel([
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Dari', kunci: 'cabang_asal' },
            { judul: 'Dikirim', render: r => esc(waktuTampil(r.tanggal_kirim)) },
            { judul: 'Item', render: r => r.item.length + ' baris · ' +
                r.item.reduce((a, i) => a + i.qty_kirim, 0) + ' pcs' },
            { judul: '', render: r => `<button class="tombol kecil sukses" data-terima-transfer="${esc(r.uuid)}">Terima barang</button>` }
          ], menunggu)}
        </div>` : ''}

        <div class="kartu">
          <h3>Riwayat transfer</h3>
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Rute', render: r => `${esc(r.cabang_asal)} → ${esc(r.cabang_tujuan)}` },
            { judul: 'Item', render: r => String(r.item.length) },
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_TRANSFER[r.status] || ''}">${esc(r.status)}</span>` },
            ...(rows[0]?.nilai_hpp !== undefined ? [{ judul: 'Nilai', angka: true, render: r => rp(r.nilai_hpp) }] : []),
            { judul: '', render: r => `
              <button class="tombol kecil" data-detail-transfer="${esc(r.uuid)}">Detail</button>
              ${r.status === 'DIKIRIM' && r.cabang_asal === APP_STATE.cabang && bolehIzin('transfer', 'hapus')
                ? `<button class="tombol kecil bahaya" data-batal-transfer="${esc(r.uuid)}">Batal</button>` : ''}` }
          ], rows, { kosong: 'Belum ada transfer' })}
        </div>`;
      $('#isiTransfer')._rows = rows;
    } catch (e) { galat('#isiTransfer', e); }
  }

  async function formKirimTransfer() {
    const [prod, cab] = await Promise.all([API.daftarProduk({}), API.daftarCabangAdmin().catch(() => [])]);
    const tujuan = (cab.length ? cab.filter(c => c.aktif).map(c => c.kode_cabang) : APP_STATE.daftarCabangSemua)
      .filter(k => k !== APP_STATE.cabang);

    if (!tujuan.length) {
      return bukaModal('Kirim barang', '<div class="pesan info">Belum ada cabang lain sebagai tujuan. Tambahkan cabang dulu di menu Cabang.</div>');
    }

    bukaModal('Kirim barang ke cabang lain', `
      <div class="baris3">
        <div class="grup"><label>Dari</label><input type="text" value="${esc(APP_STATE.cabang)}" disabled></div>
        <div class="grup"><label>Ke cabang *</label><select id="tfTujuan">
          ${tujuan.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></div>
        <div class="grup"><label>Tanggal</label><input type="date" id="tfTanggal" value="${tanggalLokal()}"></div>
      </div>
      <label>Barang yang dikirim</label>
      <p class="petunjuk">Transfer tidak boleh membuat stok minus — memindahkan barang yang tidak ada hanya memindahkan masalah ke cabang lain.</p>
      <div id="barisTf"></div>
      <button class="tombol" id="btnTambahBarisTf">+ Tambah baris</button>
      <datalist id="dlProdukTf">${prod.produk.map(p =>
        `<option value="${esc(p.sku)}">${esc(p.nama)} — stok ${p.stok ?? '?'}</option>`).join('')}</datalist>
      <div class="grup" style="margin-top:14px"><label>Catatan</label><input type="text" id="tfCatatan" placeholder="mis. dikirim lewat kurir X"></div>
      <div id="pesanTf"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanTransfer">Kirim</button>`);
    tambahBarisTf();
  }

  function tambahBarisTf() {
    $('#barisTf').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="tf">
        <input type="text" data-f="sku" list="dlProdukTf" placeholder="SKU" style="flex:3">
        <input type="text" data-f="kode_varian" placeholder="varian (opsional)" style="flex:2">
        <input type="number" data-f="qty" placeholder="qty" value="1">
        ${barisHapus}
      </div>`);
  }

  async function dialogTerimaTransfer(uuid) {
    const t = ($('#isiTransfer')._rows || []).find(x => x.uuid === uuid);
    if (!t) return;
    bukaModal(`Terima barang — ${t.no_dokumen}`, `
      <p class="petunjuk">Dari <strong>${esc(t.cabang_asal)}</strong>, dikirim ${esc(waktuTampil(t.tanggal_kirim))}.
        Isi jumlah yang <em>benar-benar sampai</em>. Kekurangan akan dibukukan sebagai Barang Rusak/Hilang di cabang pengirim dan
        dokumen ditandai SELISIH untuk ditelusuri.</p>
      <div class="gulir-x"><table>
        <thead><tr><th>Produk</th><th class="angka">Dikirim</th><th class="angka" style="width:120px">Diterima</th></tr></thead>
        <tbody>${t.item.map(i => `<tr>
          <td>${esc(i.nama_produk)}<div class="meta-kecil">${esc(i.sku)}${i.kode_varian ? ' · ' + esc(i.kode_varian) : ''}</div></td>
          <td class="angka">${i.qty_kirim}</td>
          <td><input type="number" data-terima-baris="${i.baris}" value="${i.qty_kirim}" min="0" max="${i.qty_kirim}"></td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="grup" style="margin-top:12px"><label>Catatan penerimaan</label><input type="text" id="tfCatatanTerima"></div>
      <div id="pesanTerima"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol sukses" id="btnKonfirmasiTerima" data-uuid="${esc(uuid)}">Konfirmasi terima</button>`);
  }

  function detailTransfer(uuid) {
    const t = ($('#isiTransfer')._rows || []).find(x => x.uuid === uuid);
    if (!t) return;
    bukaModal(`Transfer ${t.no_dokumen}`, `
      <p class="petunjuk">${esc(t.cabang_asal)} → ${esc(t.cabang_tujuan)} ·
        <span class="lencana ${LENCANA_TRANSFER[t.status] || ''}">${esc(t.status)}</span><br>
        Dikirim ${esc(waktuTampil(t.tanggal_kirim))} oleh ${esc(t.user_kirim)}
        ${t.tanggal_terima ? `<br>Diterima ${esc(waktuTampil(t.tanggal_terima))} oleh ${esc(t.user_terima)}` : ''}
        ${t.catatan ? `<br>Catatan: ${esc(t.catatan)}` : ''}
        ${t.catatan_terima ? `<br>Catatan terima: ${esc(t.catatan_terima)}` : ''}</p>
      ${tabel([
        { judul: 'SKU', kunci: 'sku' },
        { judul: 'Nama', kunci: 'nama_produk' },
        { judul: 'Dikirim', kunci: 'qty_kirim', angka: true },
        { judul: 'Diterima', angka: true, render: i => i.qty_terima === null ? '—' : i.qty_terima },
        { judul: 'Selisih', angka: true, render: i => i.selisih ? `<span class="stok-kritis">${i.selisih}</span>` : '—' }
      ], t.item)}`);
  }

  /* ==================== STOK OPNAME ==================== */

  const LENCANA_OPNAME = { DRAFT: 'kuning', REVIEW: 'kuning', POSTED: 'hijau', DIBATALKAN: '' };
  let opnameAktif = null;   // dokumen yang sedang dihitung

  async function muatOpname() {
    memuat('#isiOpname');
    try {
      const rows = await API.daftarOpname({ cabang: APP_STATE.cabang });
      const berjalan = rows.find(r => r.status === 'DRAFT' || r.status === 'REVIEW');
      const punyaNilai = rows.some(r => r.nilai_selisih !== undefined);

      $('#isiOpname').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <div style="flex:1"></div>
            ${berjalan
              ? `<button class="tombol utama" data-lanjut-opname="${esc(berjalan.uuid)}">
                   Lanjutkan ${esc(berjalan.no_dokumen)} (${esc(berjalan.status)})</button>`
              : '<button class="tombol utama" id="btnOpnameBaru">+ Mulai opname</button>'}
          </div>
          <p class="petunjuk">Stok sistem dikunci pada <strong>detik barang itu dihitung</strong>, bukan saat diposting.
            Jadi toko boleh tetap berjualan selama opname — penjualan yang terjadi setelah suatu barang dihitung
            tidak akan muncul sebagai selisih palsu. Saat posting, sistem hanya menambahkan selisihnya,
            bukan menimpa stok dengan angka fisik.</p>
        </div>

        <div class="kartu">
          <h3>Riwayat opname</h3>
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Cakupan', render: r => `<span class="lencana">${esc(r.cakupan)}</span>${
                r.buta ? ' <span class="lencana kuning">buta</span>' : ''}` },
            { judul: 'Item', kunci: 'jumlah_item', angka: true },
            { judul: 'Selisih', angka: true, render: r => r.jumlah_selisih
                ? `<span class="stok-kritis">${r.jumlah_selisih}</span>` : '—' },
            ...(punyaNilai ? [{ judul: 'Nilai selisih', angka: true, render: r => r.nilai_selisih === undefined ? '—'
                : (r.nilai_selisih < 0
                    ? `<span style="color:var(--bahaya)">− ${rp(-r.nilai_selisih)}</span>`
                    : (r.nilai_selisih > 0 ? `<span style="color:var(--sukses)">+ ${rp(r.nilai_selisih)}</span>` : '—')) }] : []),
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_OPNAME[r.status] || ''}">${esc(r.status)}</span>` },
            { judul: '', render: r => `<button class="tombol kecil" data-lanjut-opname="${esc(r.uuid)}">${
                r.status === 'POSTED' || r.status === 'DIBATALKAN' ? 'Lihat' : 'Lanjutkan'}</button>` }
          ], rows, { kosong: 'Belum pernah opname' })}
        </div>`;
    } catch (e) { galat('#isiOpname', e); }
  }

  async function wizardOpname() {
    let f = { kategori: [], merek: [] };
    try { f = await API.filterOpname(); } catch (e) {}

    bukaModal('Mulai stok opname', `
      <div class="grup">
        <label>Cakupan</label>
        <select id="opCakupan">
          <option value="PARSIAL">Parsial — per kategori atau merek</option>
          <option value="PENUH">Penuh — seluruh SKU aktif</option>
          <option value="SPOT">Spot check — beberapa SKU tertentu</option>
        </select>
      </div>

      <div id="opFilterParsial">
        <div class="baris2">
          <div class="grup"><label>Kategori</label><select id="opKategori">
            <option value="">— semua kategori —</option>
            ${(f.kategori || []).map(k => `<option value="${esc(k.nama)}">${esc(k.nama)} (${k.jumlah})</option>`).join('')}
          </select></div>
          <div class="grup"><label>Merek</label><select id="opMerek">
            <option value="">— semua merek —</option>
            ${(f.merek || []).map(k => `<option value="${esc(k.nama)}">${esc(k.nama)} (${k.jumlah})</option>`).join('')}
          </select></div>
        </div>
        <p class="petunjuk">Isi salah satu atau keduanya. Kalau dua-duanya dikosongkan, pilih cakupan Penuh.</p>
      </div>

      <div id="opFilterSpot" class="sembunyi">
        <div class="grup">
          <label>Daftar SKU (satu per baris, atau dipisah koma)</label>
          <textarea id="opSkuList" rows="4" placeholder="AC-PB-001&#10;AC-TWS-01&#10;AC-CH-002"></textarea>
        </div>
      </div>

      <label class="cek kartu-cek" style="margin-top:10px">
        <input type="checkbox" id="opButa" checked>
        <span><strong>Mode buta</strong> — petugas tidak melihat stok sistem sampai selesai menghitung</span>
      </label>
      <p class="petunjuk">Sangat disarankan. Kalau petugas bisa melihat angka sistem, godaan untuk
        "menyesuaikan" hitungan agar cocok itu besar — dan selisih yang sebenarnya jadi tidak pernah ketahuan.
        Angkanya bukan sekadar disembunyikan di layar; server memang tidak mengirimkannya sama sekali.</p>

      <div class="grup"><label>Catatan</label><input type="text" id="opCatatan" placeholder="mis. opname rutin akhir bulan"></div>
      <div id="pesanOpname"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnMulaiOpname">Mulai menghitung</button>`);
  }

  async function bukaLayarHitung(uuid) {
    bukaModal('Memuat…', '<p class="petunjuk">Menyiapkan daftar barang…</p>');
    try {
      const d = await API.detailOpname({ uuid, cabang: APP_STATE.cabang });
      opnameAktif = d;
      if (d.status === 'DRAFT') gambarLayarHitung(d);
      else gambarReviewOpname(d);
    } catch (e) {
      bukaModal('Gagal', `<div class="pesan galat">${esc(e.message)}</div>`);
    }
  }

  function gambarLayarHitung(d) {
    // Gabungkan yang sudah dihitung dan yang belum, supaya petugas melihat satu daftar utuh
    const sudah = new Map(d.item.map(i => [i.sku, i]));
    const semua = [
      ...d.item.map(i => ({ sku: i.sku, nama: i.nama_produk, qty_fisik: i.qty_fisik,
                            qty_sistem: i.qty_sistem, sudah: true })),
      ...d.belum_dihitung.filter(b => !sudah.has(b.sku))
                         .map(b => ({ sku: b.sku, nama: b.nama, kategori: b.kategori,
                                      qty_fisik: '', qty_sistem: b.qty_sistem, sudah: false }))
    ];

    bukaModal(`Menghitung — ${d.no_dokumen}`, `
      <div class="bar-alat">
        <span class="lencana">${esc(d.cakupan)}</span>
        ${d.buta ? '<span class="lencana kuning">mode buta</span>' : ''}
        <span class="lencana" id="opProgres">${d.item.length} / ${semua.length} dihitung</span>
        <div style="flex:1"></div>
        <input type="text" id="opCari" placeholder="Saring daftar…" style="max-width:200px">
      </div>
      ${d.buta ? '<p class="petunjuk">Stok sistem sengaja tidak ditampilkan. Hitung apa adanya — selisih baru terlihat setelah Anda menekan "Selesai menghitung".</p>' : ''}
      <div style="max-height:52vh;overflow:auto" id="wadahHitung">
        <table>
          <thead><tr>
            <th>Produk</th>
            ${d.buta ? '' : '<th class="angka">Sistem</th>'}
            <th class="angka" style="width:120px">Fisik</th>
          </tr></thead>
          <tbody>${semua.map(r => `
            <tr data-baris-hitung data-sku="${esc(r.sku)}" data-nama="${esc((r.nama || '').toLowerCase())}">
              <td>${esc(r.nama)}<div class="meta-kecil">${esc(r.sku)}${r.kategori ? ' · ' + esc(r.kategori) : ''}</div></td>
              ${d.buta ? '' : `<td class="angka">${r.qty_sistem ?? '—'}</td>`}
              <td><input type="number" data-hitung="${esc(r.sku)}" value="${r.qty_fisik === '' ? '' : r.qty_fisik}"
                         min="0" placeholder="—" class="${r.sudah ? 'sudah-hitung' : ''}"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="petunjuk">Kosongkan berarti belum dihitung. Isi <strong>0</strong> bila barangnya memang habis —
        itu berbeda artinya dan akan tercatat sebagai selisih bila sistem mengira masih ada.</p>
      <div id="pesanHitung"></div>`,
      `<button class="tombol bahaya" data-batal-opname="${esc(d.uuid)}">Batalkan opname</button>
       <button class="tombol" id="btnSimpanHitungan" data-uuid="${esc(d.uuid)}">Simpan sementara</button>
       <button class="tombol utama" id="btnSelesaiHitung" data-uuid="${esc(d.uuid)}">Selesai menghitung</button>`);
  }

  function gambarReviewOpname(d) {
    const selisih = d.item.filter(i => i.selisih !== 0 && i.selisih !== undefined);
    const cocok = d.item.length - selisih.length;
    const punyaNilai = d.nilai_selisih !== undefined;

    bukaModal(`Hasil opname — ${d.no_dokumen}`, `
      <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <div class="kartu statistik"><div class="label">Dihitung</div><div class="nilai">${d.item.length}</div></div>
        <div class="kartu statistik"><div class="label">Cocok</div>
          <div class="nilai" style="color:var(--sukses)">${cocok}</div></div>
        <div class="kartu statistik"><div class="label">Selisih</div>
          <div class="nilai" style="color:${selisih.length ? 'var(--bahaya)' : 'inherit'}">${selisih.length}</div></div>
        ${punyaNilai ? `<div class="kartu statistik"><div class="label">Nilai bersih</div>
          <div class="nilai" style="color:${d.nilai_selisih < 0 ? 'var(--bahaya)' : 'var(--sukses)'}">${
            (d.nilai_selisih < 0 ? '− ' : '+ ') + rp(Math.abs(d.nilai_selisih))}</div></div>` : ''}
      </div>

      ${punyaNilai && (d.nilai_lebih || d.nilai_kurang) ? `<p class="petunjuk">
        Barang lebih ${rp(d.nilai_lebih)} · barang kurang ${rp(d.nilai_kurang)}.
        Keduanya dibukukan terpisah di buku besar, bukan hanya angka bersihnya — supaya
        kehilangan tidak tertutupi oleh kelebihan di barang lain.</p>` : ''}

      <div style="max-height:44vh;overflow:auto">
        ${selisih.length ? tabel([
          { judul: 'Produk', render: i => `${esc(i.nama_produk)}<div class="meta-kecil">${esc(i.sku)}</div>` },
          { judul: 'Sistem', kunci: 'qty_sistem', angka: true },
          { judul: 'Fisik', kunci: 'qty_fisik', angka: true },
          { judul: 'Selisih', angka: true, render: i => `<strong style="color:${i.selisih < 0 ? 'var(--bahaya)' : 'var(--sukses)'}">${
              i.selisih > 0 ? '+' : ''}${i.selisih}</strong>` },
          ...(punyaNilai ? [{ judul: 'Nilai', angka: true, render: i => rp(i.nilai_selisih) }] : []),
          { judul: 'Dihitung', render: i => esc(waktuTampil(i.waktu_hitung)) }
        ], selisih) : '<div class="pesan sukses">Tidak ada selisih sama sekali — stok sistem dan fisik cocok semua.</div>'}
      </div>

      ${d.status === 'POSTED'
        ? `<div class="pesan info">Sudah diposting ${esc(waktuTampil(d.waktu_posting))}
             oleh ${esc(d.id_user_posting || '—')}. Untuk mengoreksi, buat opname baru.</div>`
        : (d.boleh_posting
            ? `<div class="grup" style="margin-top:12px"><label>Catatan posting</label>
                 <input type="text" id="opCatatanPosting" placeholder="mis. sudah dicek ulang bersama kepala cabang"></div>`
            : '<div class="pesan info">Anda tidak berizin memposting. Minta atasan meninjau dan memposting dokumen ini.</div>')}
      <div id="pesanReview"></div>`,
      d.status === 'POSTED' || d.status === 'DIBATALKAN'
        ? '<button class="tombol" data-tutup="1">Tutup</button>'
        : `<button class="tombol" data-tutup="1">Nanti dulu</button>
           ${d.boleh_posting ? `<button class="tombol sukses" id="btnPostingOpname" data-uuid="${esc(d.uuid)}">
             Posting &amp; sesuaikan stok</button>` : ''}`);
  }

  /** Kumpulkan hanya baris yang benar-benar diisi — kosong berarti belum dihitung. */
  function hitunganTerisi() {
    return $$('[data-hitung]')
      .filter(i => String(i.value).trim() !== '')
      .map(i => ({ sku: i.dataset.hitung, qty_fisik: Number(i.value) }));
  }

  /* ==================== RETUR ==================== */

  let notaTerpilih = null;

  async function muatRetur() {
    memuat('#isiRetur');
    try {
      const rows = await API.daftarRetur({ cabang: APP_STATE.cabang });
      $('#isiRetur').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <div style="flex:1"></div>
            ${bolehIzin('penjualan', 'ubah') && APP_STATE.flag.void_transaksi
              ? '<button class="tombol bahaya" id="btnVoidNota">Void nota</button>' : ''}
            <button class="tombol utama" id="btnReturBaru">+ Retur baru</button>
          </div>
          <p class="petunjuk"><strong>Retur berbeda dengan Void.</strong> Void dipakai bila transaksinya memang salah — seluruh nota
            dibalik seolah tidak pernah terjadi. Retur dipakai bila transaksinya benar dan pelanggan mengembalikan barang belakangan;
            penjualannya tetap tercatat, dan nilainya muncul di Laba Rugi sebagai <em>Retur Penjualan</em> — angka yang justru perlu
            Anda pantau, karena retur yang tinggi menandakan masalah kualitas barang.</p>
        </div>
        <div class="kartu">
          <h3>Riwayat retur</h3>
          ${tabel([
            { judul: 'Tanggal', render: r => `${esc(tglTampil(r.tanggal))}<div class="meta-kecil">${esc(r.jam)}</div>` },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Nota asal', render: r => esc(r.no_nota_asal || 'tanpa nota') },
            { judul: 'Jenis', render: r => `<span class="lencana ${r.jenis === 'TUKAR' ? 'kuning' : ''}">${esc(r.jenis)}</span>` },
            { judul: 'Nilai retur', angka: true, render: r => rp(r.nilai_retur) },
            { judul: 'Selisih', angka: true, render: r => r.selisih < 0
                ? `<span style="color:var(--bahaya)">− ${rp(-r.selisih)}</span>`
                : (r.selisih > 0 ? `<span style="color:var(--sukses)">+ ${rp(r.selisih)}</span>` : '—') },
            { judul: 'Alasan', kunci: 'alasan' }
          ], rows, { kosong: 'Belum ada retur' })}
        </div>`;
    } catch (e) { galat('#isiRetur', e); }
  }

  /**
   * Void memakai pencarian nota yang sama persis dengan Retur (API.cariNota) —
   * server sudah hanya mengembalikan nota berstatus AKTIF, jadi hasil pencarian
   * di sini tidak akan pernah menawarkan nota yang sudah dibatalkan sebelumnya.
   */
  function formVoid() {
    bukaModal('Void nota', `
      <p class="petunjuk">Void membalik <strong>seluruh</strong> nota seolah tidak pernah terjadi — stok kembali ke
        lapisan asal, jurnal dibalik penuh, dan piutang terkait ikut dibatalkan. Klaim petugas pada nota ini juga
        ditandai dibatalkan. Tindakan ini tidak bisa diurungkan; pakai hanya bila transaksinya memang salah, bukan
        untuk barang yang dikembalikan pelanggan (pakai Retur untuk itu).</p>
      <div class="grup">
        <label>Cari nota (nomor nota atau nama pelanggan)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="voidCari" placeholder="mis. SK01-A3F/2608/00042">
          <button class="tombol utama" id="btnCariNotaVoid" style="flex:0 0 auto">Cari</button>
        </div>
      </div>
      <div id="hasilCariNotaVoid"></div>`,
      '<button class="tombol" data-tutup="1">Tutup</button>');
  }

  function formRetur() {
    notaTerpilih = null;
    bukaModal('Retur baru', `
      <div class="grup">
        <label>Cari nota asal (nomor nota atau nama pelanggan)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="returCari" placeholder="mis. SK01-A3F/2608/00042">
          <button class="tombol utama" id="btnCariNota" style="flex:0 0 auto">Cari</button>
        </div>
      </div>
      <div id="hasilCariNota"></div>
      <p class="petunjuk">Pelanggan kehilangan struk?
        <a href="#" id="lnkTanpaNota" style="color:var(--utama-gelap)">Lanjut tanpa nota</a> —
        HPP akan memakai rata-rata saat ini, bukan HPP asli nota, jadi laba historis bisa sedikit meleset.</p>
      <div id="formIsiRetur"></div>`,
      '<button class="tombol" data-tutup="1">Tutup</button>');
  }

  function gambarFormRetur(nota) {
    notaTerpilih = nota;
    $('#hasilCariNota').innerHTML = nota
      ? `<div class="pesan sukses">Nota ${esc(nota.no_nota)} · ${esc(nota.tanggal)} · ${rp(nota.total)}</div>`
      : '<div class="pesan info">Retur tanpa nota asal.</div>';

    const barisAwal = nota
      ? nota.item.filter(i => i.sisa_bisa_retur > 0).map((i, n) => `
        <div class="baris-anak" data-anak="rt">
          <input type="text" data-f="sku" value="${esc(i.sku)}" readonly style="flex:2">
          <input type="hidden" data-f="kode_varian" value="${esc(i.kode_varian || '')}">
          <input type="hidden" data-f="nama" value="${esc(i.nama_produk)}">
          <input type="hidden" data-f="satuan" value="${esc(i.satuan)}">
          <input type="hidden" data-f="faktor" value="${i.faktor || 1}">
          <input type="number" data-f="qty" value="0" min="0" max="${i.sisa_bisa_retur}"
                 title="maksimal ${i.sisa_bisa_retur}">
          <input type="text" inputmode="numeric" class="uang" data-f="harga_satuan" value="${ribuan(i.harga_satuan)}" readonly>
          <select data-f="kondisi">
            <option value="LAYAK_JUAL">layak jual</option>
            <option value="RUSAK">rusak</option>
          </select>
        </div>
        <div class="meta-kecil" style="margin:-4px 0 8px 2px">${esc(i.nama_produk)} — dibeli ${i.qty} ${esc(i.satuan)}${
          i.sudah_diretur > 0 ? `, sudah diretur ${i.sudah_diretur}` : ''}</div>`).join('')
      : '';

    $('#formIsiRetur').innerHTML = `
      <hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">
      <label>Barang yang dikembalikan</label>
      <p class="petunjuk">Isi qty yang diretur. Barang <strong>rusak</strong> tidak masuk kembali ke stok jual —
        nilainya langsung dibebankan ke akun Barang Rusak/Hilang.</p>
      <div id="barisRt">${barisAwal}</div>
      ${nota ? '' : '<button class="tombol" id="btnTambahBarisRt">+ Tambah barang</button>'}
      ${nota ? '' : `<datalist id="dlProdukRt"></datalist>`}

      <div class="grup" style="margin-top:16px">
        <label>Penyelesaian</label>
        <select id="returJenis">
          <option value="TUNAI">Kembali uang</option>
          <option value="TUKAR">Tukar barang</option>
        </select>
      </div>

      <div id="blokPengganti" class="sembunyi">
        <label>Barang pengganti</label>
        <div id="barisRp"></div>
        <button class="tombol" id="btnTambahBarisRp">+ Tambah pengganti</button>
        <datalist id="dlProdukRp"></datalist>
      </div>

      <div class="baris2" style="margin-top:14px">
        <div class="grup"><label>Alasan retur *</label>
          <input type="text" id="returAlasan" placeholder="mis. kabel putus dalam 3 hari"></div>
        <div class="grup"><label>Metode selisih uang</label><select id="returMetode">
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option>
          <option value="qris">QRIS</option></select></div>
      </div>

      <div class="kartu" style="background:var(--bg);margin-top:10px">
        <div class="total-baris"><span>Nilai barang kembali</span><span id="rtNilaiRetur">Rp 0</span></div>
        <div class="total-baris"><span>Nilai barang pengganti</span><span id="rtNilaiPengganti">Rp 0</span></div>
        <div class="total-baris besar" style="font-size:20px">
          <span id="rtLabelSelisih">Uang dikembalikan</span><span id="rtSelisih">Rp 0</span></div>
      </div>
      <div id="pesanRetur"></div>
      <button class="tombol sukses besar" id="btnSimpanRetur" style="margin-top:12px">Proses retur</button>`;

    isiDatalistProduk();
    hitungRetur();
  }

  async function isiDatalistProduk() {
    const semua = await DB.all('produk');
    const opsi = semua.map(p => `<option value="${esc(p.sku)}">${esc(p.nama)}</option>`).join('');
    ['dlProdukRt', 'dlProdukRp'].forEach(id => { if ($('#' + id)) $('#' + id).innerHTML = opsi; });
  }

  function tambahBarisRetur(jenis) {
    const wadah = jenis === 'rt' ? '#barisRt' : '#barisRp';
    const list = jenis === 'rt' ? 'dlProdukRt' : 'dlProdukRp';
    $(wadah).insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="${jenis}">
        <input type="text" data-f="sku" list="${list}" placeholder="SKU" style="flex:2">
        <input type="number" data-f="qty" placeholder="qty" value="1">
        <input type="text" inputmode="numeric" class="uang" data-f="harga_satuan" placeholder="harga">
        ${jenis === 'rt' ? `<select data-f="kondisi">
          <option value="LAYAK_JUAL">layak jual</option><option value="RUSAK">rusak</option></select>` : ''}
        ${barisHapus}
      </div>`);
  }

  function hitungRetur() {
    const nilai = (jenis) => kumpulkanAnak(jenis)
      .reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga_satuan) || 0), 0);
    const r = nilai('rt'), p = nilai('rp');
    const selisih = p - r;

    $('#rtNilaiRetur').textContent = rp(r);
    $('#rtNilaiPengganti').textContent = rp(p);
    $('#rtLabelSelisih').textContent = selisih < 0 ? 'Uang dikembalikan' :
                                       (selisih > 0 ? 'Pelanggan menambah bayar' : 'Selisih');
    $('#rtSelisih').textContent = rp(Math.abs(selisih));
    $('#rtSelisih').style.color = selisih > 0 ? 'var(--sukses)' : (selisih < 0 ? 'var(--bahaya)' : 'var(--teks)');
  }

  async function simpanRetur() {
    const btn = $('#btnSimpanRetur');
    const jenis = nilai('returJenis');
    const itemRetur = kumpulkanAnak('rt')
      .filter(i => i.sku && Number(i.qty) > 0)
      .map(i => ({ sku: i.sku, kode_varian: i.kode_varian || '', nama: i.nama || '',
                   qty: Number(i.qty), satuan: i.satuan || 'pcs', faktor: Number(i.faktor) || 1,
                   harga_satuan: Number(i.harga_satuan) || 0, kondisi: i.kondisi || 'LAYAK_JUAL' }));

    if (!itemRetur.length) return toast('Isi minimal satu barang yang diretur (qty > 0).', 'galat');
    if (!nilai('returAlasan')) return toast('Alasan retur wajib diisi.', 'galat');

    const itemPengganti = jenis === 'TUKAR'
      ? kumpulkanAnak('rp').filter(i => i.sku && Number(i.qty) > 0)
          .map(i => ({ sku: i.sku, kode_varian: '', nama: '', qty: Number(i.qty),
                       satuan: 'pcs', faktor: 1, harga_satuan: Number(i.harga_satuan) || 0 }))
      : [];
    if (jenis === 'TUKAR' && !itemPengganti.length) return toast('Retur tukar wajib punya barang pengganti.', 'galat');

    btn.disabled = true;
    try {
      const d = await API.buatRetur({
        uuid: crypto.randomUUID ? crypto.randomUUID() : 'R' + Date.now(),
        cabang: APP_STATE.cabang,
        uuid_penjualan: notaTerpilih ? notaTerpilih.uuid : '',
        jenis, item_retur: itemRetur, item_pengganti: itemPengganti,
        metode_selisih: nilai('returMetode'), alasan: nilai('returAlasan'),
        id_shift: APP_STATE.idShift || ''
      });
      await Sync.tarikStok();
      bukaModal('Retur selesai — ' + d.no_dokumen, `
        <div class="pesan sukses">Retur tercatat dan sudah dibukukan.</div>
        <table>
          <tr><td>Nilai barang kembali</td><td class="angka">${rp(d.nilai_retur)}</td></tr>
          ${d.nilai_pengganti ? `<tr><td>Nilai barang pengganti</td><td class="angka">${rp(d.nilai_pengganti)}</td></tr>` : ''}
          ${d.uang_dikembalikan ? `<tr class="tebal"><td>UANG DIKEMBALIKAN</td>
            <td class="angka" style="font-size:20px;color:var(--bahaya)">${rp(d.uang_dikembalikan)}</td></tr>` : ''}
          ${d.tambahan_bayar ? `<tr class="tebal"><td>PELANGGAN MENAMBAH BAYAR</td>
            <td class="angka" style="font-size:20px;color:var(--sukses)">${rp(d.tambahan_bayar)}</td></tr>` : ''}
        </table>`,
        '<button class="tombol utama" data-tutup="1" id="btnSelesaiRetur">Selesai</button>');
    } catch (e) {
      $('#pesanRetur').innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
      btn.disabled = false;
    }
  }

  /* ==================== RETUR PEMBELIAN ==================== */

  let beliTerpilih = null;

  async function muatReturbeli() {
    memuat('#isiReturbeli');
    try {
      const rows = await API.daftarReturBeli({ cabang: APP_STATE.cabang });
      $('#isiReturbeli').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <div style="flex:1"></div>
            <button class="tombol utama" id="btnReturBeliBaru">+ Retur ke supplier</button>
          </div>
          <p class="petunjuk">Ada dua angka yang dicatat terpisah, dan biasanya memang berbeda:
            <strong>nilai klaim</strong> (harga beli asli — yang ditagihkan ke supplier) dan
            <strong>nilai persediaan</strong> (HPP rata-rata — yang benar-benar keluar dari stok).
            Selisihnya muncul karena harga beli berubah sejak barang itu masuk, dan sengaja dibukukan
            ke Selisih Persediaan alih-alih disamakan paksa — kalau disamakan, nilai persediaan di buku
            besar tidak lagi cocok dengan kartu stok.</p>
        </div>
        <div class="kartu">
          <h3>Riwayat retur pembelian</h3>
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Supplier', kunci: 'nama_supplier' },
            { judul: 'Faktur asal', render: r => esc(r.no_dok_pembelian || '—') },
            { judul: 'Klaim', angka: true, render: r => rp(r.nilai_klaim) },
            { judul: 'Persediaan', angka: true, render: r => rp(r.nilai_persediaan) },
            { judul: 'Selisih', angka: true, render: r => r.selisih_nilai
                ? `<span style="color:${r.selisih_nilai < 0 ? 'var(--bahaya)' : 'var(--sukses)'}">${
                    r.selisih_nilai > 0 ? '+' : ''}${rp(r.selisih_nilai)}</span>` : '—' },
            { judul: 'Penyelesaian', render: r => `<span class="lencana">${
                r.penyelesaian === 'POTONG_UTANG' ? 'potong utang' : 'uang kembali'}</span>` }
          ], rows, { kosong: 'Belum ada retur pembelian' })}
        </div>`;
    } catch (e) { galat('#isiReturbeli', e); }
  }

  function formReturBeli() {
    beliTerpilih = null;
    bukaModal('Retur ke supplier', `
      <div class="grup">
        <label>Cari faktur pembelian (nomor dokumen atau nama supplier)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="rbCari" placeholder="mis. INV-2026-0412">
          <button class="tombol utama" id="btnCariBeli" style="flex:0 0 auto">Cari</button>
        </div>
      </div>
      <div id="hasilCariBeli"></div>
      <p class="petunjuk">Memakai faktur asal jauh lebih baik: harga beli yang ditagihkan ke supplier
        diambil persis dari faktur itu, bukan dari tebakan.
        <a href="#" id="lnkTanpaFaktur" style="color:var(--utama-gelap)">Lanjut tanpa faktur</a>.</p>
      <div id="formIsiReturBeli"></div>`,
      '<button class="tombol" data-tutup="1">Tutup</button>');
  }

  async function gambarFormReturBeli(beli) {
    beliTerpilih = beli;
    $('#hasilCariBeli').innerHTML = beli
      ? `<div class="pesan sukses">Faktur ${esc(beli.no_dokumen)} · ${esc(beli.tanggal)} · ${rp(beli.total)}</div>`
      : '<div class="pesan info">Retur tanpa faktur asal — harga beli diisi manual.</div>';

    const baris = beli
      ? beli.item.filter(i => i.sisa_bisa_retur > 0).map(i => `
        <div class="baris-anak" data-anak="rb">
          <input type="text" data-f="sku" value="${esc(i.sku)}" readonly style="flex:2">
          <input type="hidden" data-f="kode_varian" value="${esc(i.kode_varian || '')}">
          <input type="hidden" data-f="satuan" value="${esc(i.satuan)}">
          <input type="hidden" data-f="faktor" value="${i.faktor || 1}">
          <input type="number" data-f="qty" value="0" min="0" max="${i.sisa_bisa_retur}">
          <input type="text" inputmode="numeric" class="uang" data-f="harga_beli" value="${ribuan(i.harga_beli)}" readonly>
        </div>
        <div class="meta-kecil" style="margin:-4px 0 8px 2px">${esc(i.nama_produk)} — dibeli ${i.qty} ${esc(i.satuan)}${
          i.sudah_diretur > 0 ? `, sudah diretur ${i.sudah_diretur}` : ''}</div>`).join('')
      : '';

    $('#formIsiReturBeli').innerHTML = `
      <hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">
      <label>Barang yang dikembalikan</label>
      <div id="barisRb">${baris}</div>
      ${beli ? '' : '<button class="tombol" id="btnTambahBarisRb">+ Tambah barang</button><datalist id="dlProdukRb"></datalist>'}

      <div class="baris2" style="margin-top:14px">
        <div class="grup"><label>Penyelesaian</label><select id="rbPenyelesaian">
          <option value="POTONG_UTANG">Potong utang ke supplier</option>
          <option value="UANG_KEMBALI">Uang dikembalikan</option>
        </select></div>
        <div class="grup"><label>Metode (bila uang kembali)</label><select id="rbMetode">
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option>
        </select></div>
      </div>
      <div class="grup"><label>Alasan retur *</label>
        <input type="text" id="rbAlasan" placeholder="mis. 12 pcs cacat produksi, disepakati diganti"></div>

      <div class="kartu" style="background:var(--bg)">
        <div class="total-baris besar" style="font-size:19px;border:none;margin:0">
          <span>Nilai klaim ke supplier</span><span id="rbTotal">Rp 0</span></div>
      </div>
      <div id="pesanReturBeli"></div>
      <button class="tombol sukses besar" id="btnSimpanReturBeli" style="margin-top:12px">Proses retur pembelian</button>`;

    if (!beli) {
      const semua = await DB.all('produk');
      $('#dlProdukRb').innerHTML = semua.map(p =>
        `<option value="${esc(p.sku)}">${esc(p.nama)}</option>`).join('');
      tambahBarisRb();
    }
    hitungReturBeli();
  }

  function tambahBarisRb() {
    $('#barisRb').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="rb">
        <input type="text" data-f="sku" list="dlProdukRb" placeholder="SKU" style="flex:2">
        <input type="number" data-f="qty" placeholder="qty" value="1">
        <input type="text" inputmode="numeric" class="uang" data-f="harga_beli" placeholder="harga beli">
        ${barisHapus}
      </div>`);
  }

  function hitungReturBeli() {
    const t = kumpulkanAnak('rb')
      .reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.harga_beli) || 0), 0);
    if ($('#rbTotal')) $('#rbTotal').textContent = rp(t);
  }

  /* ==================== ARSIP ==================== */

  async function muatArsip() {
    memuat('#isiArsip');
    try {
      const u = await API.ukuranBerkas();
      const warna = { AMAN: 'hijau', PERHATIAN: 'kuning', KRITIS: 'merah' };
      const tahunIni = new Date().getFullYear();

      $('#isiArsip').innerHTML = `
        <div class="kartu">
          <h3>Kapasitas berkas</h3>
          <p class="petunjuk">Google Sheets membatasi <strong>10 juta sel per berkas</strong>. Satu cabang ramai
            bisa menghasilkan sekitar 6,5 juta sel setahun — jadi tanpa rotasi, di tahun kedua berkas cabang akan
            menolak transaksi baru, dan itu terjadi tepat di jam sibuk. Halaman ini agar Anda tahu jauh sebelum itu.</p>
          <div class="pesan ${u.saran.indexOf('Belum perlu') === 0 ? 'sukses' : 'galat'}">${esc(u.saran)}</div>
          ${tabel([
            { judul: 'Berkas', kunci: 'berkas' },
            { judul: 'Sel terpakai', angka: true, render: b => b.galat ? '—'
                : new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(b.sel)) },
            { judul: 'Kapasitas', angka: true, render: b => b.galat ? '—' : b.persen + '%' },
            { judul: 'Status', render: b => b.galat
                ? `<span class="lencana merah">galat</span>`
                : `<span class="lencana ${warna[b.status]}">${esc(b.status)}</span>` },
            { judul: 'Sheet terbesar', render: b => (b.terbesar || []).slice(0, 3)
                .map(x => `${esc(x.sheet)} (${new Intl.NumberFormat(CONFIG.LOCALE).format(x.baris)} baris)`)
                .join('<br>') || '—' }
          ], u.berkas)}
        </div>

        <div class="kartu">
          <h3>Rotasi arsip tahunan</h3>
          <p class="petunjuk">Memindahkan transaksi tahun lama ke berkas terpisah di folder
            <code>ARSIP</code> pada Drive Anda. Data tidak dihapus — hanya dipindah, dan tetap bisa dibuka.
            Tabel <code>saldo_bulanan</code> sengaja tidak ikut dipindah, sehingga Laba Rugi dan Neraca
            tahun lama tetap bisa diterbitkan.</p>

          <div class="pesan info">
            <strong>Empat penjagaan yang tidak bisa dilewati:</strong>
            <ol style="margin:8px 0 0 18px;line-height:1.7">
              <li>Seluruh periode tahun itu harus sudah <strong>ditutup buku</strong>.</li>
              <li>Harus sudah ada <strong>snapshot stok</strong> setelah tanggal batas — tanpa itu, menghapus
                  mutasi lama sama dengan menghapus stok.</li>
              <li>Data <strong>disalin dan diverifikasi jumlah barisnya dulu</strong>, baru dihapus dari berkas asal.</li>
              <li>Tahun berjalan tidak akan pernah bisa diarsipkan.</li>
            </ol>
          </div>

          <div class="baris2" style="max-width:420px;margin-top:14px">
            <div class="grup"><label>Tahun yang diarsipkan</label>
              <select id="arsipTahun">
                ${[tahunIni - 1, tahunIni - 2, tahunIni - 3].map(t =>
                  `<option value="${t}">${t}</option>`).join('')}
              </select></div>
            <div class="grup"><label>Cabang</label>
              <select id="arsipCabang">
                <option value="">Semua cabang</option>
                ${APP_STATE.daftarCabangSemua.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select></div>
          </div>

          <button class="tombol utama" id="btnUjiArsip">Jalankan uji coba (tidak menghapus apa pun)</button>
          <button class="tombol bahaya sembunyi" id="btnJalankanArsip" style="margin-top:8px">
            Jalankan sungguhan</button>
          <div id="hasilArsip"></div>
        </div>`;
    } catch (e) { galat('#isiArsip', e); }
  }

  function gambarHasilArsip(d) {
    const total = d.total_dipindah;
    $('#hasilArsip').innerHTML = `
      <div class="pesan ${d.uji_coba ? 'info' : 'sukses'}" style="margin-top:14px">
        ${d.uji_coba ? '<strong>UJI COBA</strong> — tidak ada satu baris pun yang dipindah atau dihapus.'
                     : '<strong>SELESAI</strong> — data sudah dipindah ke folder ARSIP di Drive Anda.'}
        <br>Tahun ${esc(String(d.tahun))} · batas tanggal &lt; ${esc(d.batas)} ·
        <strong>${new Intl.NumberFormat(CONFIG.LOCALE).format(total)} baris</strong>
        ${d.uji_coba ? 'akan dipindah' : 'dipindah'}.
      </div>
      ${d.peringatan.length ? `<div class="pesan galat">
        <strong>Perlu diperhatikan:</strong>
        <ul style="margin:8px 0 0 18px">${d.peringatan.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${d.cabang.map(c => `<div class="kartu" style="background:var(--bg)">
        <strong>${esc(c.cabang)}</strong>
        <span class="lencana ${c.status === 'OK' ? 'hijau' : (c.status === 'GAGAL' ? 'merah' : 'kuning')}">${esc(c.status)}</span>
        ${c.pesan ? `<div class="petunjuk">${esc(c.pesan)}</div>` : ''}
        ${c.sheet && c.sheet.length ? tabel([
          { judul: 'Sheet', kunci: 'nama' },
          { judul: 'Dipindah', kunci: 'dipindah', angka: true },
          { judul: 'Tersisa', kunci: 'tersisa', angka: true }
        ], c.sheet) : '<div class="petunjuk">Tidak ada baris yang perlu dipindah.</div>'}
      </div>`).join('')}
      ${d.ledger && d.ledger.dipindah ? `<div class="kartu" style="background:var(--bg)">
        <strong>DB_LEDGER</strong>
        ${tabel([{ judul: 'Sheet', kunci: 'nama' }, { judul: 'Dipindah', kunci: 'dipindah', angka: true }], d.ledger.sheet)}
        <div class="petunjuk">${esc(d.ledger.catatan || '')}</div>
      </div>` : ''}`;

    // Tombol "sungguhan" hanya muncul setelah uji coba dijalankan dan tanpa peringatan
    const btn = $('#btnJalankanArsip');
    if (btn) btn.classList.toggle('sembunyi', !(d.uji_coba && total > 0 && !d.peringatan.length));
  }

  /* ==================== ROUTER LAYAR ==================== */

  /**
   * Pintu masuk tunggal ke setiap layar back office.
   *
   * Seluruh isinya dibungkus API.tugas supaya penanda proses juga mencakup
   * PENYUSUNAN TABELNYA, bukan cuma lama permintaan ke server. Pada katalog
   * besar, menyusun ribuan baris memakan waktu yang jelas terasa — dan selama
   * itu `panggil()` sudah selesai menghitung, jadi layar tampak membeku tanpa
   * penjelasan. Karena semua layar lewat sini, satu pembungkus di tempat ini
   * menutup seluruh rantai simpan → tarik master → muat ulang sekaligus.
   */
  async function muat(layar) {
    return API.tugas(() => _muat(layar));
  }

  async function _muat(layar) {
    if (!API.online) {
      const wadah = { produk: '#isiProduk', stok: '#isiStok', pembelian: '#isiPembelian',
                      mitra: '#isiMitra', petugas: '#isiPetugas', poin: '#isiPoin',
                      piutang: '#isiPiutang', pengguna: '#isiPengguna',
                      cabang: '#isiCabang', sistem: '#isiSistem', audit: '#isiAudit',
                      dashboard: '#isiDashboard', transfer: '#isiTransfer', retur: '#isiRetur',
                      diskon: '#isiDiskon',
                      opname: '#isiOpname', returbeli: '#isiReturbeli', arsip: '#isiArsip' }[layar];
      if (wadah) {
        $(wadah).innerHTML = `<div class="pesan info">Menu ini butuh koneksi internet.
          Data admin sengaja tidak di-cache supaya Anda tidak mengubah master berdasarkan data basi.
          Layar Kasir tetap berfungsi penuh tanpa internet.</div>`;
      }
      return;
    }
    switch (layar) {
      case 'dashboard': return muatDashboard();
      case 'produk':    return muatProduk($('#cariProduk')?.value || '', $('#filterKategori')?.value || '');
      case 'stok':      return muatStok($('#stokKategori')?.value || '');
      case 'pembelian': return muatPembelian();
      case 'mitra':     return muatMitra();
      case 'petugas':   return muatPetugas();
      case 'poin':      return muatPoin();
      case 'piutang':   return muatPiutang();
      case 'pengguna':  return muatPengguna();
      case 'cabang':    return muatCabang();
      case 'sistem':    return muatSistem();
      case 'audit':     return muatAudit();
      case 'diskon':    return muatDiskon();
      case 'transfer':  return muatTransfer();
      case 'opname':    return muatOpname();
      case 'returbeli': return muatReturbeli();
      case 'arsip':     return muatArsip();
      case 'retur':     return muatRetur();
    }
  }

  /* ==================== EVENT (delegasi tunggal) ==================== */

  function pasang() {
    document.addEventListener('click', async (e) => {
      const t = e.target.closest('button, [data-tutup]');
      if (!t) return;
      const d = t.dataset;

      /* --- modal --- */
      if (d.tutup) return tutupModal();
      if (d.hapusBaris) return t.closest('.baris-anak').remove();
      if (d.tabm) {
        $$('.tab-modal button').forEach(b => b.classList.toggle('aktif', b === t));
        $$('[data-panel]').forEach(p => p.classList.toggle('sembunyi', p.dataset.panel !== d.tabm));
        return;
      }

      /* --- produk --- */
      if (t.id === 'btnProdukBaru')   return editorProduk(null);
      if (d.editProduk)               return editorProduk(d.editProduk);
      if (t.id === 'btnTambahSatuan') return tambahBarisSatuan();
      if (t.id === 'btnTambahTier')   return tambahBarisTier();
      if (t.id === 'btnTambahVarian') return tambahBarisVarian();
      if (t.id === 'btnTambahKompatibel') return tambahBarisKompatibel();
      if (t.id === 'btnSimpanProduk') return simpanProduk();
      if (t.id === 'btnNonaktifProduk') {
        if (!confirm('Nonaktifkan produk ini? Data historis tetap utuh, produk hanya hilang dari layar kasir.')) return;
        try {
          await API.nonaktifkanProduk({ sku: nilai('pSku') });
          await Sync.tarikMaster(true);
          await sukses('Produk dinonaktifkan.', 'produk');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (t.id === 'btnImporProduk')    return dialogImpor();
      if (t.id === 'btnPratinjauImpor') return pratinjauImpor();
      if (t.id === 'btnTemplateImpor') {
        try {
          const d = await API.templateImpor({ entitas: nilai('imporEntitas') });
          unduhBase64(d.nama, d.mime, d.base64);
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (t.id === 'btnJalankanImpor')  return jalankanImpor();

      /* --- stok --- */
      if (d.kartuStok) return lihatKartuStok(d.kartuStok);

      /* --- pembelian --- */
      if (t.id === 'btnPembelianBaru')    return formPembelian();
      if (t.id === 'btnTambahBaris')      return tambahBarisBeli();
      if (t.id === 'btnSimpanPembelian')  return simpanPembelian();

      /* --- mitra --- */
      if (t.id === 'btnPelangganBaru') return editorPelanggan(null);
      if (d.editPelanggan)             return editorPelanggan(d.editPelanggan);
      if (t.id === 'btnSupplierBaru')  return editorSupplier(null);
      if (d.editSupplier)              return editorSupplier(d.editSupplier);
      if (t.id === 'btnSimpanPelanggan') {
        try {
          await API.simpanPelanggan({
            kode: nilai('cKode') || undefined, nama: nilai('cNama'), telepon: nilai('cTelepon'),
            alamat: nilai('cAlamat'), level_harga: nilai('cLevel'),
            limit_kredit: angka('cLimit'), termin_hari: angka('cTermin'), aktif: centang('cAktif')
          });
          await Sync.tarikMaster(true);
          await sukses('Pelanggan tersimpan.', 'mitra');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      /* --- petugas & poin --- */
      if (t.id === 'btnSimpanBobot') {
        const b = { PENJUAL: angka('bobotPenjual'), PEMASANG: angka('bobotPemasang') };
        if (b.PENJUAL < 0 || b.PEMASANG < 0) {
          return pesan('#pesanBobot', 'Bobot tidak boleh negatif.', 'galat');
        }
        if (b.PENJUAL + b.PEMASANG <= 0) {
          // Kalau keduanya nol, tidak ada pembagian yang masuk akal — dan server
          // akan diam-diam kembali ke bobot bawaan. Lebih jujur ditolak di sini.
          return pesan('#pesanBobot', 'Salah satu bobot harus lebih dari 0.', 'galat');
        }
        try {
          await API.tugas(async () => {
            await API.simpanSetting({ setting: { bobot_peran_klaim: JSON.stringify(b) } });
            // Bobot dipakai layar kasir untuk pratinjau, jadi perangkat ini perlu
            // menariknya ulang supaya angkanya tidak tertinggal.
            await Sync.tarikMaster(true);
            await sukses('Bobot peran disimpan.', 'petugas');
          });
        } catch (e) { pesan('#pesanBobot', e.message, 'galat'); }
        return;
      }
      if (t.id === 'btnPetugasBaru')   return editorPetugas(null);
      if (d.editPetugas)               return editorPetugas(d.editPetugas);
      if (t.id === 'btnLaporanPoin')   return gambarHasilPoin();
      if (t.id === 'btnSimpanPetugas') {
        try {
          await API.simpanPetugas({
            kode: nilai('ptKode') || undefined, nama: nilai('ptNama'),
            peran_utama: nilai('ptPeran'), telepon: nilai('ptTelepon'),
            cabang: nilai('ptCabang'), aktif: centang('ptAktif')
          });
          // Daftar petugas ikut turun lewat tarik_master, jadi layar kasir di
          // perangkat ini langsung mengenal nama baru itu tanpa perlu login ulang.
          await Sync.tarikMaster(true);
          await sukses('Petugas tersimpan.', 'petugas');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      if (t.id === 'btnSimpanSupplier') {
        try {
          await API.simpanSupplier({
            kode: nilai('sKode') || undefined, nama: nilai('sNama'), kontak: nilai('sKontak'),
            telepon: nilai('sTelepon'), alamat: nilai('sAlamat'),
            termin_hari: angka('sTermin'), aktif: centang('sAktif')
          });
          await sukses('Supplier tersimpan.', 'mitra');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* --- piutang --- */
      if (d.bayarPiutang) return dialogBayarPiutang(d.bayarPiutang, d.cabang);
      if (t.id === 'btnKonfirmasiBayarPiutang') {
        t.disabled = true;
        try {
          const r = await API.bayarPiutang({
            uuid: crypto.randomUUID ? crypto.randomUUID() : 'P' + Date.now(),
            uuid_piutang: d.uuid, cabang: d.cabang, tanggal: nilai('bpTanggal'),
            jumlah: angka('bpJumlah'), metode: nilai('bpMetode'), referensi: nilai('bpRef')
          });
          await sukses(r.lunas ? 'Piutang lunas.' : 'Pembayaran tercatat, sisa ' + rp(r.sisa), 'piutang');
        } catch (x) {
          $('#pesanBayarPiutang').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }

      /* --- user & peran --- */
      if (t.id === 'btnUserBaru') return editorUser(null);
      if (d.editUser)             return editorUser(d.editUser);
      if (t.id === 'btnPeranBaru')return editorPeran(null);
      if (d.editPeran)            return editorPeran(d.editPeran);
      if (t.id === 'btnSimpanUser') {
        t.disabled = true;
        try {
          const r = await API.simpanUser({
            id_user: d.id || undefined, nama: nilai('uNama'), username: nilai('uUsername'),
            peran: nilai('uPeran'), cabang: nilai('uCabang'),
            aktif: $('#uAktif') ? centang('uAktif') : true,
            pin: nilai('uPin') || undefined, password: nilai('uPassword') || undefined
          });
          if (r.baru) {
            bukaModal('Pengguna dibuat', `
              <div class="pesan sukses">Catat kredensial ini sekarang — tidak akan ditampilkan lagi.</div>
              <table>
                <tr><td>Username</td><td><strong>${esc(r.username)}</strong></td></tr>
                <tr><td>PIN</td><td><strong style="font-size:20px">${esc(r.pin)}</strong></td></tr>
                <tr><td>Password</td><td><strong>${esc(r.password)}</strong></td></tr>
              </table>
              <p class="petunjuk">Pengguna wajib mengganti PIN saat pertama kali masuk.</p>`,
              '<button class="tombol utama" data-tutup="1">Sudah dicatat</button>');
            await muat('pengguna');
          } else {
            await sukses('Pengguna tersimpan.', 'pengguna');
          }
        } catch (x) {
          $('#pesanUser').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (d.resetPin) {
        if (!confirm('Reset PIN pengguna ini? Seluruh sesi aktifnya akan dicabut.')) return;
        try {
          const r = await API.resetPinUser({ id_user: d.resetPin });
          bukaModal('PIN berhasil direset', `
            <div class="pesan sukses">Catat sekarang — tidak akan ditampilkan lagi.</div>
            <table>
              <tr><td>PIN baru</td><td><strong style="font-size:20px">${esc(r.pin)}</strong></td></tr>
              <tr><td>Password baru</td><td><strong>${esc(r.password)}</strong></td></tr>
            </table>`, '<button class="tombol utama" data-tutup="1">Sudah dicatat</button>');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (t.id === 'btnSimpanPeran') {
        const izin = {};
        $$('[data-izin]').forEach(c => {
          if (!c.checked) return;
          (izin[c.dataset.izin] = izin[c.dataset.izin] || []).push(c.dataset.aksi);
        });
        const flag = {};
        $$('[data-flag]').forEach(c => flag[c.dataset.flag] = c.checked);
        flag.diskon_maks_persen = angka('rDiskon');
        try {
          await API.simpanPeran({
            kode_peran: nilai('rKode').toUpperCase(), nama: nilai('rNama'),
            keterangan: nilai('rKet'), izin, flag
          });
          await sukses('Hak akses tersimpan. Pengguna terkait perlu login ulang agar menunya menyesuaikan.', 'pengguna');
        } catch (x) {
          $('#pesanPeran').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (d.perangkat) {
        try {
          await API.setujuiPerangkat({ id_perangkat: d.perangkat, status: d.status, cabang: APP_STATE.cabang });
          await muat('pengguna');
          toast('Perangkat ' + d.status.toLowerCase() + '.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* --- cabang --- */
      if (t.id === 'btnCabangBaru') return editorCabang(null);
      if (d.editCabang)             return editorCabang(d.editCabang);
      if (t.id === 'btnSimpanCabang') {
        t.disabled = true;
        const baru = !$('#bKode').disabled;
        try {
          if (baru) {
            $('#pesanCabang').innerHTML = '<div class="pesan info">Membuat spreadsheet cabang di Drive…</div>';
            await API.tambahCabang({ kode_cabang: nilai('bKode').toUpperCase(), nama: nilai('bNama'),
                                     alamat: nilai('bAlamat'), telepon: nilai('bTelepon') });
          } else {
            await API.simpanCabang({ kode_cabang: nilai('bKode'), nama: nilai('bNama'),
                                     alamat: nilai('bAlamat'), telepon: nilai('bTelepon'),
                                     prefix_nota: nilai('bPrefix'), aktif: centang('bAktif') });
          }
          await Sync.tarikMaster(true);
          await sukses('Cabang tersimpan.', 'cabang');
        } catch (x) {
          $('#pesanCabang').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }

      /* --- transfer --- */
      if (t.id === 'btnTransferBaru')   return formKirimTransfer();
      if (t.id === 'btnTambahBarisTf')  return tambahBarisTf();
      if (d.detailTransfer)             return detailTransfer(d.detailTransfer);
      if (d.terimaTransfer)             return dialogTerimaTransfer(d.terimaTransfer);
      if (t.id === 'btnSimpanTransfer') {
        const item = kumpulkanAnak('tf').filter(i => i.sku && Number(i.qty) > 0)
          .map(i => ({ sku: i.sku, kode_varian: i.kode_varian || '', qty: Number(i.qty) }));
        if (!item.length) return toast('Minimal satu barang.', 'galat');
        t.disabled = true;
        try {
          const r = await API.kirimTransfer({
            uuid: crypto.randomUUID ? crypto.randomUUID() : 'T' + Date.now(),
            cabang_asal: APP_STATE.cabang, cabang_tujuan: nilai('tfTujuan'),
            tanggal: nilai('tfTanggal'), catatan: nilai('tfCatatan'), item
          });
          await Sync.tarikStok();
          await Sync.tarikStokSemuaCabang();
          await sukses('Barang dikirim — ' + r.no_dokumen + '. Menunggu konfirmasi cabang tujuan.', 'transfer');
        } catch (x) {
          $('#pesanTf').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (t.id === 'btnKonfirmasiTerima') {
        t.disabled = true;
        const item = $$('[data-terima-baris]').map(i => ({
          baris: Number(i.dataset.terimaBaris), qty_terima: Number(i.value)
        }));
        try {
          const r = await API.terimaTransfer({ uuid: d.uuid, item, catatan: nilai('tfCatatanTerima') });
          await Sync.tarikStok();
          await Sync.tarikStokSemuaCabang();
          await sukses(r.status === 'SELISIH'
            ? `Diterima dengan SELISIH senilai ${rp(r.nilai_selisih)} — sudah dibukukan ke cabang pengirim.`
            : 'Barang diterima, stok bertambah.', 'transfer');
        } catch (x) {
          $('#pesanTerima').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (d.batalTransfer) {
        const alasan = prompt('Alasan pembatalan (minimal 5 karakter):');
        if (!alasan || alasan.trim().length < 5) return;
        try {
          await API.batalTransfer({ uuid: d.batalTransfer, alasan });
          await Sync.tarikStok();
          await sukses('Transfer dibatalkan, barang kembali ke cabang asal.', 'transfer');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* --- laporan diskon --- */
      if (t.id === 'btnMuatDiskon') return gambarHasilDiskon();

      /* --- ekspor --- */
      if (d.eksporBuka !== undefined) {
        const grup = t.closest('.ekspor');
        const terbuka = grup.classList.contains('buka');
        tutupMenuEkspor();                       // hanya satu menu boleh terbuka
        if (!terbuka) {
          grup.classList.add('buka');
          t.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      if (d.ekspor) return jalankanEkspor(t);

      /* --- retur pembelian --- */
      if (t.id === 'btnReturBeliBaru')  return formReturBeli();
      if (t.id === 'btnTambahBarisRb')  return tambahBarisRb();
      if (t.id === 'btnCariBeli') {
        $('#hasilCariBeli').innerHTML = '<div class="pesan info">Mencari…</div>';
        try {
          const rows = await API.cariPembelian({ cari: nilai('rbCari'), cabang: APP_STATE.cabang });
          if (!rows.length) {
            $('#hasilCariBeli').innerHTML = '<div class="pesan galat">Faktur tidak ditemukan.</div>';
            return;
          }
          $('#hasilCariBeli').innerHTML = `<div style="max-height:200px;overflow:auto">${tabel([
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            { judul: '', render: r => `<button class="tombol kecil utama" data-pilih-beli="${esc(r.uuid)}">Pilih</button>` }
          ], rows)}</div>`;
          $('#hasilCariBeli')._rows = rows;
        } catch (x) { $('#hasilCariBeli').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`; }
        return;
      }
      if (d.pilihBeli) {
        const b = ($('#hasilCariBeli')._rows || []).find(x => x.uuid === d.pilihBeli);
        if (b) await gambarFormReturBeli(b);
        return;
      }
      if (t.id === 'btnSimpanReturBeli') {
        const item = kumpulkanAnak('rb').filter(i => i.sku && Number(i.qty) > 0)
          .map(i => ({ sku: i.sku, kode_varian: i.kode_varian || '', qty: Number(i.qty),
                       satuan: i.satuan || 'pcs', faktor: Number(i.faktor) || 1,
                       harga_beli: Number(i.harga_beli) || 0 }));
        if (!item.length) return toast('Isi minimal satu barang (qty > 0).', 'galat');
        if (!nilai('rbAlasan')) return toast('Alasan retur wajib diisi.', 'galat');
        t.disabled = true;
        try {
          const r = await API.buatReturBeli({
            uuid: crypto.randomUUID ? crypto.randomUUID() : 'RB' + Date.now(),
            cabang: APP_STATE.cabang,
            uuid_pembelian: beliTerpilih ? beliTerpilih.uuid : '',
            kode_supplier: beliTerpilih ? beliTerpilih.kode_supplier : '',
            item, penyelesaian: nilai('rbPenyelesaian'), metode: nilai('rbMetode'),
            alasan: nilai('rbAlasan')
          });
          await Sync.tarikStok();
          bukaModal('Retur pembelian selesai — ' + r.no_dokumen, `
            <div class="pesan sukses">Tercatat dan sudah dibukukan.</div>
            <table>
              <tr><td>Nilai klaim ke supplier</td><td class="angka"><strong>${rp(r.total_klaim)}</strong></td></tr>
              <tr><td>Nilai persediaan keluar</td><td class="angka">${rp(r.nilai_persediaan)}</td></tr>
              <tr><td>Selisih ke Selisih Persediaan</td><td class="angka">${rp(r.selisih_nilai)}</td></tr>
              <tr><td>Penyelesaian</td><td class="angka">${r.penyelesaian === 'POTONG_UTANG' ? 'potong utang' : 'uang kembali'}</td></tr>
            </table>`,
            '<button class="tombol utama" data-tutup="1" id="btnSelesaiReturBeli">Selesai</button>');
        } catch (x) {
          $('#pesanReturBeli').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (t.id === 'btnSelesaiReturBeli') { tutupModal(); return muat('returbeli'); }

      /* --- arsip --- */
      if (t.id === 'btnUjiArsip' || t.id === 'btnJalankanArsip') {
        const sungguhan = t.id === 'btnJalankanArsip';
        if (sungguhan && !confirm(
          'Jalankan rotasi SUNGGUHAN?\n\nData akan dipindah ke berkas arsip dan dihapus dari berkas cabang. ' +
          'Penyalinan diverifikasi lebih dulu, tapi tetap pastikan Anda sudah membaca hasil uji coba.')) return;
        t.disabled = true;
        $('#hasilArsip').innerHTML = '<div class="pesan info" style="margin-top:14px">Memproses… ini bisa memakan beberapa menit untuk data setahun penuh. Jangan tutup jendela.</div>';
        try {
          const r = await API.rotasiArsip({ tahun: Number(nilai('arsipTahun')),
                                            cabang: nilai('arsipCabang') || undefined,
                                            uji_coba: !sungguhan });
          gambarHasilArsip(r);
          if (sungguhan) toast('Rotasi arsip selesai.');
        } catch (x) {
          $('#hasilArsip').innerHTML = `<div class="pesan galat" style="margin-top:14px">${esc(x.message)}
            ${Array.isArray(x.detail) ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
        }
        t.disabled = false;
        return;
      }

      /* --- stok opname --- */
      if (t.id === 'btnOpnameBaru')  return wizardOpname();
      if (d.lanjutOpname)            return bukaLayarHitung(d.lanjutOpname);
      if (t.id === 'btnMulaiOpname') {
        const cakupan = nilai('opCakupan');
        const filter = {};
        if (cakupan === 'PARSIAL') {
          filter.kategori = nilai('opKategori');
          filter.merek = nilai('opMerek');
          if (!filter.kategori && !filter.merek) {
            return toast('Pilih kategori atau merek dulu, atau ganti ke cakupan Penuh.', 'galat');
          }
        }
        if (cakupan === 'SPOT') {
          filter.sku = nilai('opSkuList').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
          if (!filter.sku.length) return toast('Isi minimal satu SKU.', 'galat');
        }
        t.disabled = true;
        try {
          const r = await API.buatOpname({
            uuid: crypto.randomUUID ? crypto.randomUUID() : 'O' + Date.now(),
            cabang: APP_STATE.cabang, cakupan, filter,
            buta: centang('opButa'), catatan: nilai('opCatatan')
          });
          await bukaLayarHitung(r.uuid);
          toast(`${r.produk.length} produk siap dihitung.`);
        } catch (x) {
          $('#pesanOpname').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail?.uuid ? `<br><button class="tombol kecil" data-lanjut-opname="${esc(x.detail.uuid)}"
              style="margin-top:8px">Lanjutkan yang itu</button>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (t.id === 'btnSimpanHitungan') {
        const item = hitunganTerisi();
        if (!item.length) return toast('Belum ada satu pun yang diisi.', 'galat');
        t.disabled = true;
        try {
          const r = await API.simpanHitungan({ uuid: d.uuid, cabang: APP_STATE.cabang, item });
          $('#opProgres').textContent = `${r.total_dihitung} dihitung`;
          $$('[data-hitung]').forEach(i => { if (String(i.value).trim() !== '') i.classList.add('sudah-hitung'); });
          toast(`${r.tersimpan} hitungan tersimpan. Stok sistem dikunci pada ${
            String(r.waktu_kunci).replace('T', ' ').substring(11, 19)}.`);
        } catch (x) { toast(x.message, 'galat'); }
        t.disabled = false;
        return;
      }
      if (t.id === 'btnSelesaiHitung') {
        const item = hitunganTerisi();
        if (!item.length) return toast('Belum ada satu pun yang diisi.', 'galat');
        if (!confirm(`Selesaikan penghitungan? ${item.length} barang akan dikunci dan tidak bisa diubah lagi.`)) return;
        t.disabled = true;
        try {
          await API.simpanHitungan({ uuid: d.uuid, cabang: APP_STATE.cabang, item });
          await API.selesaiHitung({ uuid: d.uuid, cabang: APP_STATE.cabang });
          await bukaLayarHitung(d.uuid);   // muat ulang, kini status REVIEW
        } catch (x) {
          $('#pesanHitung').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (t.id === 'btnPostingOpname') {
        if (!confirm('Posting opname? Stok akan disesuaikan dan selisihnya dibukukan. Tindakan ini tidak bisa dibatalkan.')) return;
        t.disabled = true;
        try {
          const r = await API.postingOpname({ uuid: d.uuid, cabang: APP_STATE.cabang,
                                              catatan: nilai('opCatatanPosting') });
          await Sync.tarikStok();
          await Sync.tarikStokSemuaCabang();
          await sukses(r.tanpa_selisih
            ? 'Opname diposting — tidak ada selisih.'
            : `Opname diposting. ${r.item_disesuaikan} barang disesuaikan.`, 'opname');
        } catch (x) {
          $('#pesanReview').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (d.batalOpname) {
        const alasan = prompt('Alasan pembatalan opname (minimal 5 karakter):');
        if (!alasan || alasan.trim().length < 5) return;
        try {
          await API.batalOpname({ uuid: d.batalOpname, cabang: APP_STATE.cabang, alasan });
          await sukses('Opname dibatalkan.', 'opname');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* --- retur --- */
      if (t.id === 'btnReturBaru')      return formRetur();
      if (t.id === 'btnTambahBarisRt')  return tambahBarisRetur('rt');
      if (t.id === 'btnTambahBarisRp')  return tambahBarisRetur('rp');
      if (t.id === 'btnSimpanRetur')    return simpanRetur();
      if (t.id === 'btnSelesaiRetur')   { tutupModal(); return muat('retur'); }
      if (t.id === 'btnCariNota') {
        const q = nilai('returCari');
        if (!q) return;
        $('#hasilCariNota').innerHTML = '<div class="pesan info">Mencari…</div>';
        try {
          const rows = await API.cariNota({ cari: q, cabang: APP_STATE.cabang });
          if (!rows.length) {
            $('#hasilCariNota').innerHTML = '<div class="pesan galat">Nota tidak ditemukan di cabang ini.</div>';
            return;
          }
          $('#hasilCariNota').innerHTML = `<div style="max-height:200px;overflow:auto">${tabel([
            { judul: 'No nota', kunci: 'no_nota' },
            { judul: 'Tanggal', render: r => `${esc(tglTampil(r.tanggal))} ${esc(r.jam)}` },
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            { judul: '', render: r => `<button class="tombol kecil utama" data-pilih-nota="${esc(r.uuid)}">Pilih</button>` }
          ], rows)}</div>`;
          $('#hasilCariNota')._rows = rows;
        } catch (x) {
          $('#hasilCariNota').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (d.pilihNota) {
        const nota = ($('#hasilCariNota')._rows || []).find(x => x.uuid === d.pilihNota);
        if (nota) gambarFormRetur(nota);
        return;
      }

      /* --- void --- */
      if (t.id === 'btnVoidNota') return formVoid();
      if (t.id === 'btnCariNotaVoid') {
        const q = nilai('voidCari');
        if (!q) return;
        $('#hasilCariNotaVoid').innerHTML = '<div class="pesan info">Mencari…</div>';
        try {
          const rows = await API.cariNota({ cari: q, cabang: APP_STATE.cabang });
          if (!rows.length) {
            $('#hasilCariNotaVoid').innerHTML = '<div class="pesan galat">Nota tidak ditemukan di cabang ini.</div>';
            return;
          }
          $('#hasilCariNotaVoid').innerHTML = `<div style="max-height:200px;overflow:auto">${tabel([
            { judul: 'No nota', kunci: 'no_nota' },
            { judul: 'Tanggal', render: r => `${esc(tglTampil(r.tanggal))} ${esc(r.jam)}` },
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            { judul: '', render: r => `<button class="tombol kecil bahaya" data-void-nota="${esc(r.uuid)}">Void</button>` }
          ], rows)}</div>`;
          $('#hasilCariNotaVoid')._rows = rows;
        } catch (x) {
          $('#hasilCariNotaVoid').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (d.voidNota) {
        const nota = ($('#hasilCariNotaVoid')._rows || []).find(x => x.uuid === d.voidNota);
        if (!nota) return;
        if (!confirm(`Void nota ${nota.no_nota} senilai ${rp(nota.total)}?\n\nSeluruh nota akan dibalik — stok, jurnal, dan piutang terkait. Tindakan ini tidak bisa diurungkan.`)) return;
        const alasan = prompt('Alasan pembatalan (minimal 5 karakter):');
        if (!alasan || alasan.trim().length < 5) return;
        try {
          await API.voidPenjualan({ uuid: nota.uuid, alasan, cabang: APP_STATE.cabang });
          await Sync.tarikStok();
          await sukses('Nota ' + nota.no_nota + ' dibatalkan (void).', 'retur');
        } catch (x) {
          toast(x.message, 'galat');
        }
        return;
      }

      /* --- setting --- */
      if (t.id === 'btnSimpanSetting') {
        const setting = {};
        $$('[data-setting]').forEach(i => {
          setting[i.dataset.setting] = i.type === 'checkbox' ? String(i.checked) : i.value;
        });
        try {
          await API.simpanSetting({ setting });
          await Sync.tarikMaster(true);
          await muatMaster();
          toast('Pengaturan tersimpan.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
    });

    /* --- pencarian & hitung ulang --- */
    let timer;
    document.addEventListener('input', (e) => {
      if (e.target.id === 'cariProduk') {
        clearTimeout(timer);
        timer = setTimeout(() => muatProduk(e.target.value, $('#filterKategori')?.value || ''), 300);
      }
      /* Kategori dimuat seketika, tanpa jeda: ini pilihan yang ditekan sekali,
         bukan ketikan beruntun. Pendengarnya WAJIB ada — tanpa ini dropdownnya
         cuma hiasan, dan saringannya baru berlaku kebetulan kalau pengguna
         sesudahnya mengetik di kolom cari. */
      // Pratinjau bobot ikut hidup saat angkanya diketik — dua angka abstrak
      // baru berarti setelah orang melihat akibatnya.
      if (e.target.id === 'bobotPenjual' || e.target.id === 'bobotPemasang') {
        const c = $('#bobotContoh');
        if (c) c.textContent = contohBobot({ PENJUAL: angka('bobotPenjual'),
                                             PEMASANG: angka('bobotPemasang') });
        return;
      }
      if (e.target.id === 'filterKategori') {
        clearTimeout(timer);
        /* Fokus dikembalikan setelah layar digambar ulang. Tanpa ini, pengguna
           papan ketik terkunci di kategori pertama: satu ArrowDown memicu muat
           ulang, elemen select-nya diganti yang baru, dan panah berikutnya jatuh
           ke elemen yang sudah tidak ada. */
        return muatProduk($('#cariProduk')?.value || '', e.target.value)
          .then(() => $('#filterKategori')?.focus());
      }
      /* Kolom dan penyaring digambar ulang dari data yang sudah ada — tidak
         menembak API. Fokus dikembalikan dengan alasan yang sama seperti
         kategori di atas: elemennya diganti yang baru saat digambar ulang. */
      /* Peringkat diurut ulang dari hasil yang sudah ada — alasannya sama, dan
         di sini bahkan lebih penting: laporan ini membaca sebulan penjualan dan
         klaim di beberapa cabang. */
      if (e.target.id === 'urutPetugas' || e.target.id === 'urutCabang') {
        const id = e.target.id;
        if (id === 'urutPetugas') urutPetugas = e.target.value;
        else urutCabang = e.target.value;
        gambarPeringkat();
        $('#' + id)?.focus();
        return;
      }
      if (e.target.id === 'kolomProduk' || e.target.id === 'saringProduk') {
        const id = e.target.id;
        if (id === 'kolomProduk') kolomProduk = e.target.value;
        else saringProduk = e.target.value;
        gambarProduk();
        $('#' + id)?.focus();
        return;
      }
      if (e.target.id === 'cariStok' || e.target.id === 'stokKategori') {
        const q = ($('#cariStok')?.value || '').toLowerCase();
        const kat = $('#stokKategori')?.value || '';
        const wadah = $('#isiStok');
        const rows = (wadah._rows || []).filter(r =>
          (!kat || r.kategori === kat) &&
          (r.sku + ' ' + r.nama).toLowerCase().includes(q));
        $('#tabelStok').innerHTML = tabelStok(rows, wadah._punyaNilai);
      }
      if (e.target.closest('#barisBeli') || ['beliDiskon', 'beliPpn'].includes(e.target.id)) {
        hitungTotalBeli();
      }
      if (e.target.closest('#barisRt') || e.target.closest('#barisRp')) hitungRetur();
      if (e.target.closest('#barisRb')) hitungReturBeli();

      if (e.target.id === 'opCari') {
        const q = e.target.value.toLowerCase();
        $$('[data-baris-hitung]').forEach(tr => {
          const cocok = tr.dataset.sku.toLowerCase().includes(q) || tr.dataset.nama.includes(q);
          tr.style.display = cocok ? '' : 'none';
        });
      }
      // Tandai baris yang sudah diisi agar petugas tahu sampai mana ia menghitung
      if (e.target.dataset && e.target.dataset.hitung !== undefined) {
        e.target.classList.toggle('sudah-hitung', String(e.target.value).trim() !== '');
      }
    });

    document.addEventListener('change', async (e) => {
      if (e.target.id === 'grafikHari') { muatGrafik(Number(e.target.value)); return; }
      if (e.target.id === 'imporEntitas') {
        $('#imporKolom').textContent = KOLOM_IMPOR[e.target.value] || '';
        $('#hasilPratinjau').innerHTML = '';
        $('#btnJalankanImpor').disabled = true;
        return;
      }
      if (e.target.id === 'imporBerkas') {
        const f = e.target.files[0];
        if (!f) return;
        $('#hasilPratinjau').innerHTML = '<div class="pesan info">Membaca berkas…</div>';
        try {
          const b64 = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(',')[1]);
            fr.onerror = rej;
            fr.readAsDataURL(f);
          });
          const d = await API.bacaBerkasImpor({ base64: b64, nama: f.name, mime: f.type });
          pratinjauImpor(d.baris);
        } catch (x) {
          $('#hasilPratinjau').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (e.target.closest('#barisRb')) hitungReturBeli();
      if (e.target.id === 'opCakupan') {
        $('#opFilterParsial').classList.toggle('sembunyi', e.target.value !== 'PARSIAL');
        $('#opFilterSpot').classList.toggle('sembunyi', e.target.value !== 'SPOT');
      }
      if (e.target.id === 'returJenis') {
        const tukar = e.target.value === 'TUKAR';
        $('#blokPengganti').classList.toggle('sembunyi', !tukar);
        if (tukar && !$('#barisRp').children.length) tambahBarisRetur('rp');
        if (!tukar) $('#barisRp').innerHTML = '';
        hitungRetur();
      }
      if (e.target.closest('#barisRt') || e.target.closest('#barisRp')) hitungRetur();
    });

    // "Lanjut tanpa nota" — pelanggan kehilangan struk
    /**
     * Menu ekspor menutup saat klik di luar atau tekan Escape.
     * Dipasang di fase CAPTURE supaya berjalan lebih dulu daripada pengirim klik
     * di atas — kalau tidak, klik pada tombol pemicu akan menutup lalu membuka lagi.
     */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ekspor')) tutupMenuEkspor();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') tutupMenuEkspor();
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'lnkTanpaNota') {
        e.preventDefault();
        gambarFormRetur(null);
        tambahBarisRetur('rt');
      }
      if (e.target.id === 'lnkTanpaFaktur') {
        e.preventDefault();
        gambarFormReturBeli(null);
      }
    });
  }

  // tombolEkspor ikut diekspor supaya app.js memakai komponen yang SAMA,
  // bukan menyalin bentuk tombolnya sendiri.
  return { muat, pasang, toast, modal: bukaModal, tutupModal, tabel, tombolEkspor };
})();
