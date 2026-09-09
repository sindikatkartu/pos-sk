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
  /* Judul kolom BISA DIKLIK untuk mengurutkan — A→Z, kecil→besar, dan sebaliknya.
     Dilaporkan dari lapangan 28 Agu 2026: tabel keluar dengan urutan baris sheet,
     yang bagi pemakainya sama saja dengan acak. Dipasang di penggambar bersama
     ini, bukan di lima belas layar satu per satu — persis alasan `data-l` untuk
     kartu bertumpuk di HP juga ada di sini.

     `data-urut` membawa nilai MENTAH untuk kolom yang punya kunci. Teks selnya
     sudah diformat (tanggal jadi '28/08/26', angka jadi 'Rp 1.250.000'), dan
     mengurutkan hasil format berarti mengurutkan tanggal menurut HARInya.
     Kolom `render` tidak punya nilai mentah; ia jatuh ke teks sel, dan itu
     memang yang dibaca orang di layar.

     Kolom tanpa judul (lajur tombol Ubah) tidak diberi penanda: tidak ada yang
     bisa diurutkan dari kolom tombol, dan judul kosong yang bisa diklik hanya
     membuat orang mengira ada yang rusak. */
  const tabelPolos = (kolom, baris, opsi = {}) => `
    <div class="gulir-x${opsi.kelasWadah ? ' ' + opsi.kelasWadah : ''}">
    <table>
      <thead><tr>${kolom.map((k, i) => `<th class="${k.angka ? 'angka' : ''} ${k.kelas || ''}${
        k.judul ? ' bisa-urut' : ''}"${k.judul ? ` data-urut-kol="${i}"` : ''}>${esc(k.judul)}</th>`).join('')}</tr></thead>
      <tbody>${baris.length ? baris.map(r => `<tr ${opsi.dataAttr ? opsi.dataAttr(r) : ''}>${
        kolom.map(k => `<td data-l="${esc(k.judul)}"${
          k.kunci ? ` data-urut="${esc(r[k.kunci] ?? '')}"` : ''} class="${k.angka ? 'angka' : ''} ${k.kelas || ''}">${
          k.render ? k.render(r) : k.tgl ? esc(tglTampil(r[k.kunci])) : esc(r[k.kunci] ?? '')}</td>`).join('')
      }</tr>`).join('')
        : `<tr><td colspan="${kolom.length}" style="text-align:center;color:var(--teks-redup);padding:28px">${esc(opsi.kosong || 'Belum ada data')}</td></tr>`}
      </tbody>
    </table>
    </div>`;

  /**
   * Urutkan satu tabel DI TEMPAT, dengan memindahkan simpul `<tr>`-nya.
   *
   * Tidak menggambar ulang layar, dan itu disengaja. Tabel di sini disusun
   * sebagai teks HTML oleh belasan fungsi berbeda, masing-masing dengan sumber
   * datanya sendiri; menitipkan keadaan urutan ke semuanya berarti menyentuh
   * belasan tempat dan melupakan satu. Menyusun ulang barisnya berlaku untuk
   * SEMUA tabel sekaligus, tanpa satu pun pemanggil perlu tahu.
   *
   * Konsekuensinya jujur: urutannya kembali ke asal begitu layarnya dimuat
   * ulang. Itu perilaku yang sama dengan penyaring di layar Produk.
   */
  function urutkanTabel(th) {
    const tbl = th.closest('table');
    const tbody = tbl && tbl.tBodies[0];
    if (!tbody) return;
    const idx = Number(th.dataset.urutKol);
    /* Baris keadaan-kosong ('Belum ada data') memakai colspan dan tidak boleh
       ikut diurutkan — kalau ikut, ia bisa terlempar ke tengah daftar. */
    const rows = Array.from(tbody.rows).filter(r => !r.querySelector('td[colspan]'));
    if (rows.length < 2) return;

    const arah = th.dataset.arah === 'naik' ? 'turun' : 'naik';
    Array.from(th.parentNode.children).forEach(x => {
      delete x.dataset.arah; x.removeAttribute('aria-sort');
    });
    th.dataset.arah = arah;
    th.setAttribute('aria-sort', arah === 'naik' ? 'ascending' : 'descending');

    const nilai = (r) => {
      const td = r.cells[idx];
      if (!td) return '';
      return td.dataset.urut !== undefined ? td.dataset.urut : td.textContent.trim();
    };
    const angkaKol = th.classList.contains('angka');
    const arahNum = arah === 'naik' ? 1 : -1;
    rows.sort((a, b) => arahNum * (angkaKol
      ? angkaUrut(nilai(a)) - angkaUrut(nilai(b))
      : urutNama(nilai(a), nilai(b))));
    rows.forEach(r => tbody.appendChild(r));
  }

  /* ==================== MODE NONAKTIF ====================
     Baris nonaktif dikeluarkan dari daftar utama, dan jalan menuju ke sana ada
     di menu tindakan "⋮" masing-masing daftar.

     Sampai v1.149.0 bentuknya blok terlipat di ATAS daftar utama. Paginasi
     mematahkannya: blok itu hanya melihat baris yang sedang dipegang tabel, jadi
     di layar Produk ia menghitung 100 baris halaman ini, bukan 3.500 baris
     katalog — "Nonaktif (2)" padahal yang mati 47. Pemilik melaporkannya
     9 Sep 2026 ("produk yang dinonaktifkan mana?") dan memutuskan tempat
     barunya: "produk nonaktif letakkan di titik tiga / tombol tindakan lainnya".

     Bentuknya sekarang MODE, bukan blok: menyalakannya menukar isi daftar utama
     menjadi yang nonaktif saja. Tiga hal yang tidak bisa dilakukan blok lama:
       1. Pencarian, penyaring, kolom dan paginasi ikut bekerja di sana.
       2. Angkanya dihitung dari SELURUH daftar, bukan dari halaman ini.
       3. Daftar utama tinggal SATU tabel, jadi "baris pertama di layar ini"
          punya satu arti lagi — dulu `#isiProduk tbody tr` mengembalikan
          baris nonaktif lebih dulu.
     Harganya jujur dan ditebus di satu tempat: yang nonaktif tidak lagi terlihat
     sekilas, jadi JUMLAHNYA ditulis di butir menunya — supaya menunya tidak
     perlu dibuka hanya untuk memastikan kosong.

     Menyembunyikannya sama sekali bukan pilihan, dan itu alasan yang belum
     berubah sejak blok lama: orang mengira produknya hilang lalu membuat SKU
     kembar, dan SKU kembar merusak kartu stok.

     Keadaannya satu Set untuk seluruh aplikasi, dikunci per daftar. Pindah layar
     tidak meresetnya dengan sengaja — yang sedang membereskan produk mati lalu
     melihat Stok sebentar tidak perlu menyalakannya dua kali. Ia hilang saat
     aplikasinya dimuat ulang, sama seperti penyaring layar Produk.
  */
  const modeNonaktif = new Set();

  /* Penggambar ulang per kunci, didaftarkan masing-masing layar saat memuat.
     Tombolnya dilayani SATU penangan klik bersama, dan penangan itu tidak boleh
     tahu nama fungsi tujuh layar. */
  const GAMBAR_NONAKTIF = {};

  /** Spanduk "sedang melihat yang nonaktif" berikut jalan kembalinya.
   *  Jalan kembali ada DUA — di sini dan di menunya — karena yang di menu
   *  mengharuskan orang mengingat dari mana ia masuk. */
  const spandukNonaktif = (kunci) => `
    <div class="spanduk-nonaktif" role="status">
      <span class="lencana merah">Nonaktif</span>
      <span>Daftar ini hanya menampilkan yang nonaktif.</span>
      <button class="tombol kecil" data-nonaktif="${esc(kunci)}">Kembali ke daftar aktif</button>
    </div>`;

  /**
   * Butir menu "⋮" untuk masuk / keluar mode nonaktif.
   *
   * Kosong kalau tidak ada satu pun yang nonaktif DAN modenya sedang mati:
   * butir yang membuka daftar kosong cuma menambah yang harus dibaca. Saat
   * modenya menyala butirnya SELALU digambar — itu jalan pulangnya.
   */
  function butirNonaktif(kunci, jumlah) {
    if (modeNonaktif.has(kunci)) {
      return `<button class="popover-item" role="menuitem" data-nonaktif="${esc(kunci)}">
          <span>Kembali ke daftar aktif</span></button>`;
    }
    if (!jumlah) return '';
    return `<button class="popover-item" role="menuitem" data-nonaktif="${esc(kunci)}">
        <span>Lihat yang nonaktif</span><span class="lencana">${jumlah}</span></button>`;
  }

  /** Berapa baris yang nonaktif — dihitung dari daftar PENUH, bukan halaman. */
  const hitungMati = (rows, pred) =>
    (rows || []).filter(pred || ((r) => r.aktif === false)).length;

  const IKON_TITIK_TIGA = `<svg class="ikon-svg" viewBox="0 0 24 24" style="width:18px;height:18px">
          <circle cx="12" cy="5"  r="1.6" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg>`;

  /**
   * Menu tindakan "⋮" — SATU bentuk untuk tujuh daftar.
   *
   * Isi kosong berarti tombolnya tidak digambar sama sekali: tombol yang membuka
   * menu kosong lebih buruk daripada tidak ada tombol. Id-nya diberikan
   * pemanggil, bukan diturunkan dari kuncinya, supaya layar Produk tetap memakai
   * `btnMenuProduk`/`menuProduk` yang sudah dikenal ujinya dan penangannya.
   */
  function menuTindakan(o) {
    if (!o.isi) return '';
    /* `data-menu-kunci` bukan hiasan: sesudah mode nonaktif dinyalakan, seluruh
       kartunya digambar ulang dan tombol yang barusan ditekan sudah tidak ada
       lagi sebagai simpul. Penanda inilah yang membuat fokus bisa dikembalikan
       ke penggantinya tanpa penangan kliknya perlu hafal tujuh id. */
    return `<div class="menu-lain">
      <button class="tombol" id="${o.idTombol}" aria-haspopup="menu" aria-expanded="false"
              aria-controls="${o.id}" data-menu-kunci="${esc(o.kunci || '')}"
              aria-label="Tindakan lain" title="Tindakan lain">
        ${IKON_TITIK_TIGA}${o.titik || ''}
      </button>
      <div class="popover-akun popover-menu" id="${o.id}" role="menu"
           aria-labelledby="${o.idTombol}" hidden>${o.isi}</div>
    </div>`;
  }

  const tabel = (kolom, baris, opsi = {}) => {
    /* Penanda `daftar-utama` dipasang di SEMUA tabel yang lahir dari sini,
       bukan cuma yang punya mode nonaktif. Tabel Stok, Pembelian dan Transfer
       tidak memakai `pisahNonaktif`; kalau penandanya hanya menempel pada yang
       memakainya, "daftar utama layar ini" jadi istilah yang kadang ada kadang
       tidak — dan pemilih yang bekerja di satu layar diam-diam gagal di layar
       lain. */
    const utama = Object.assign({}, opsi, { kelasWadah: 'daftar-utama' });
    if (!opsi.pisahNonaktif) return tabelPolos(kolom, baris, utama);
    const rows = baris || [];
    // `aktif !== false`, bukan `aktif === true`: baris lama yang kolomnya belum
    // pernah diisi bernilai undefined, dan itu bukan alasan menyembunyikannya.
    // Sebagian daftar tidak punya kolom `aktif` — perangkat kasir memakai
    // `status: DIBLOKIR`. Karena itu penentunya bisa diberikan pemanggil.
    const mati_p = opsi.nonaktif || ((r) => r.aktif === false);
    if (opsi.kunci && modeNonaktif.has(opsi.kunci)) {
      return spandukNonaktif(opsi.kunci) +
        tabelPolos(kolom, rows.filter(mati_p),
          Object.assign({}, utama, { kosong: 'Tidak ada yang nonaktif' }));
    }
    return tabelPolos(kolom, rows.filter(r => !mati_p(r)), utama);
  };

  const memuat = (el) => { $(el).innerHTML = '<div class="kartu">Memuat…</div>'; };

  /**
   * RANGKA (skeleton) — bentuk layar yang sedang datang, bukan kata "Memuat…".
   *
   * Layar Produk menunggu ~10 detik: server membaca sheet lalu mengirim ratusan
   * KB. Selama itu satu kata di tengah kartu kosong tidak memberi tahu apa pun —
   * tidak berapa lama lagi, tidak apa yang akan muncul, dan tidak apakah
   * aplikasinya masih hidup. Rangka menjawab ketiganya sekaligus dengan
   * menempati ruang yang persis akan diisi isinya, jadi layarnya juga tidak
   * melompat saat datanya tiba.
   *
   * Ia TIDAK mempercepat apa pun, dan itu penting untuk diingat sesi
   * berikutnya: yang diperbaiki rasa menunggu, bukan lamanya. Yang memperpendek
   * waktunya ada di tempat lain — muatan `apiDaftarProduk` (v1.149.0).
   *
   * `prefers-reduced-motion` dihormati di CSS: denyutnya padam, rangkanya tetap.
   */
  const rangkaBaris = (n, lebar) => Array.from({ length: n }, (_, i) =>
    `<div class="rangka-baris"><span class="rangka" style="width:${lebar[i % lebar.length]}"></span></div>`).join('');

  const rangkaProduk = () => { $('#isiProduk').innerHTML = `
    <div class="kartu"><div class="rangka-alat">
      ${['300px', '180px', '170px', '160px'].map(w =>
        `<span class="rangka tinggi" style="width:${w}"></span>`).join('')}
    </div></div>
    <div class="kartu" aria-busy="true" aria-label="Memuat daftar produk">
      ${rangkaBaris(12, ['92%', '78%', '86%', '70%'])}
    </div>`; };

  const rangkaDashboard = () => { $('#isiDashboard').innerHTML = `
    <div class="bar-alat rapat"><span class="rangka tinggi" style="width:150px"></span></div>
    <!-- Bentuknya memakai .mini yang SAMA dengan kartu KPI sungguhan, bukan
         kotak karangan sendiri: rangka yang ukurannya berbeda dari isinya
         membuat layar melompat tepat saat datanya tiba, dan lompatan itu
         justru yang paling terasa sesudah menunggu sepuluh detik.
         (Tanpa petik-balik: blok ini ada di dalam template literal.) -->
    <div class="petak-mini" aria-busy="true" aria-label="Memuat ringkasan">
      ${Array.from({ length: 6 }, () => `<div class="mini">
        <div class="mini-label"><span class="rangka" style="width:70px"></span></div>
        <div class="mini-nilai"><span class="rangka tinggi" style="width:110px"></span></div>
        <div class="mini-ekor"><span class="rangka" style="width:48px"></span></div>
      </div>`).join('')}
    </div>
    <div class="kartu" aria-busy="true">
      <span class="rangka" style="width:120px"></span>
      ${rangkaBaris(6, ['88%', '64%', '80%', '72%'])}
    </div>`; };
  const galat = (el, e) => { $(el).innerHTML = `<div class="pesan galat">${esc(e.message || e)}</div>`; };

  /**
   * Stok dua cabang yang ikut ditulis di tiap baris hasil pencarian produk.
   *
   * Diminta pemilik 6 Sep 2026 untuk layar Permintaan: "ketika dari cabang mana
   * ke cabang tujuan dipilih, maka dropdown menu disertakan juga stok cabang
   * tujuan ... misal: stok A : 6 - Stok B : 10". Dua angka inilah yang
   * menentukan keputusannya: gudangnya punya atau tidak, dan cabang yang
   * meminta sudah punya berapa.
   *
   * null = dropdown biasa, tanpa tambahan. Dikosongkan di `bukaModal` supaya
   * satu formulir tidak pernah mewarisi setelan formulir sebelumnya — tujuh
   * layar lain memakai pemilih produk yang sama, dan angka cabang yang
   * nyangkut di sana akan berbunyi seperti fakta.
   */
  let stokDuaCabang = null;

  function bukaModal(judul, isi, aksi) {
    stokDuaCabang = null;
    $('#modalUmum').innerHTML = `<h3>${esc(judul)}</h3>${isi}
      <div class="aksi-modal">${aksi || '<button class="tombol" data-tutup="1">Tutup</button>'}</div>`;
    $('#tiraiUmum').classList.add('tampil');
  }
  const tutupModal = () => $('#tiraiUmum').classList.remove('tampil');

  /* ==================== TANYA — pengganti confirm() dan prompt() ==================== */

  /**
   * Pertanyaan ya/tidak — dan, bila diminta, satu isian — di atas layar apa pun.
   *
   * ALASANNYA BUKAN RUPA. Chrome menempelkan kotak centang "Cegah halaman ini
   * membuat dialog tambahan" pada dialog KEDUA yang muncul berturut-turut, dan
   * sekali dicentang setiap confirm() berikutnya mengembalikan `false` tanpa
   * satu piksel pun muncul: tanpa galat, tanpa jejak di konsol, dan tanpa cara
   * mematikannya kembali selain memuat ulang tab. Yang terlihat pemilik adalah
   * tombol Kosongkan yang "tidak berfungsi" — dilaporkan 8 Sep 2026, dan
   * kodenya memang sehat; jawabannyalah yang dipalsukan peramban. prompt() dan
   * alert() ikut dimatikan kotak centang yang sama, jadi tidak satu pun dari
   * ketiganya boleh memikul keputusan.
   *
   * TIRAINYA SENDIRI (#tiraiTanya), bukan #tiraiUmum. Enam pemanggilnya
   * bertanya dari DALAM modal yang sedang terbuka — Nonaktifkan produk dari
   * editor produk, Void nota dari daftar nota, Posting opname dan Tutup
   * hitungan dari layar hitung, Reset PIN dari daftar pengguna. `bukaModal`
   * menimpa innerHTML #modalUmum: memakai tirai yang sama akan MENGHAPUS layar
   * yang justru jadi pokok pertanyaannya, lalu mengembalikan orang ke layar
   * kosong apa pun jawabannya.
   *
   * MENUTUP DENGAN CARA APA PUN BERARTI "TIDAK": Batal, Escape, klik latar —
   * dan juga tangan lain yang membuang `.tampil`, karena pintasan Escape di
   * app.js menyapu SELURUH `.tirai` sekaligus. Yang terakhir itu sebabnya ada
   * MutationObserver di sini: janji yang tidak pernah dijawab menggantungkan
   * pemanggilnya selamanya, dan `await` yang tidak pernah kembali tidak
   * meninggalkan satu pun jejak untuk dilacak.
   *
   * Escape ditangkap pada fase CAPTURE lalu dihentikan di situ. Tanpa itu satu
   * tekanan Escape menjawab pertanyaannya SEKALIGUS menutup modal di
   * belakangnya — dua tindakan dari satu niat.
   *
   * @param {string} judul  judul pertanyaan (teks polos).
   * @param {string} isi    badan pertanyaan (HTML; pemanggil yang menyusunnya).
   * @param {object} [opsi] ya/batal = label tombol; jenis 'bahaya' untuk
   *   tindakan yang tidak bisa diurungkan; isian = string placeholder untuk
   *   meminta teks; minimal = panjang minimum teks itu; tanpaBatal = kabar yang
   *   hanya perlu diakui, bukan pertanyaan (satu tombol saja).
   * @returns {Promise<boolean|string|null>} tanpa `isian`: true/false. Dengan
   *   `isian`: teks yang diketik, atau null bila dibatalkan.
   */
  let _tanyaSelesai = null;

  function tanya(judul, isi, opsi) {
    const o = opsi || {};
    const berisian = o.isian !== undefined && o.isian !== null && o.isian !== false;
    const tidak = () => (berisian ? null : false);

    /* Pertanyaan baru sebelum yang lama dijawab: yang lama dijawab "tidak"
       lebih dulu. Satu tirai, satu janji — pemanggil yang tirainya baru saja
       diambil orang lain harus dilepas, bukan ditinggal menunggu. */
    if (_tanyaSelesai) _tanyaSelesai(tidak());

    const tirai = $('#tiraiTanya');
    const fokusSemula = document.activeElement;
    tirai.innerHTML =
      `<div class="modal" id="modalTanya" role="alertdialog" aria-modal="true"
            aria-labelledby="judulTanya">
         <h3 id="judulTanya">${esc(judul)}</h3>
         ${isi || ''}
         ${berisian ? `<input type="text" id="isiTanya" autocomplete="off"
              placeholder="${esc(o.isian === true ? '' : o.isian)}">
            <div class="pesan galat rapat sembunyi" id="pesanTanya"></div>` : ''}
         <div class="aksi-modal">
           <button class="tombol ${o.tanpaBatal ? 'sembunyi' : ''}" id="btnTanyaBatal"
                   type="button">${esc(o.batal || 'Batal')}</button>
           <button class="tombol ${o.jenis === 'bahaya' ? 'bahaya' : 'utama'}"
                   id="btnTanyaYa" type="button">${esc(o.ya || 'Ya')}</button>
         </div>
       </div>`;
    tirai.classList.add('tampil');

    const ya  = $('#btnTanyaYa');
    const btl = $('#btnTanyaBatal');
    const inp = berisian ? $('#isiTanya') : null;

    return new Promise(resolve => {
      let sudah = false;
      const pengamat = new MutationObserver(() => {
        if (!tirai.classList.contains('tampil')) selesai(tidak());
      });

      function selesai(jawab) {
        if (sudah) return;
        sudah = true;
        _tanyaSelesai = null;
        pengamat.disconnect();
        document.removeEventListener('keydown', kunci, true);
        tirai.removeEventListener('click', latar);
        tirai.classList.remove('tampil');
        tirai.innerHTML = '';
        /* Fokus dikembalikan ke tombol yang memulai. Tanpa ini fokus jatuh ke
           <body>, dan pintasan keyboard berikutnya tidak punya sasaran — pada
           kasir yang bekerja tanpa mouse itu berarti berhenti total. */
        // Kosong dengan sengaja: elemen yang memulai pertanyaan bisa sudah
        // dibuang bersama layar yang digambar ulang, dan fokus yang gagal
        // kembali bukan kabar untuk siapa pun.
        try { fokusSemula && fokusSemula.focus && fokusSemula.focus(); } catch (e) {}
        resolve(jawab);
      }
      function kunci(e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation(); e.preventDefault();
        selesai(tidak());
      }
      function latar(e) { if (e.target === tirai) selesai(tidak()); }

      _tanyaSelesai = selesai;
      pengamat.observe(tirai, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('keydown', kunci, true);
      tirai.addEventListener('click', latar);

      ya.addEventListener('click', () => {
        if (!berisian) return selesai(true);
        const teks = String(inp.value || '').trim();
        /* Teks yang kependekan ditolak DI TEMPAT. prompt() lama mengembalikan
           teks itu ke pemanggilnya, yang lalu `return` tanpa sepatah kata pun —
           orangnya mengira tombolnya rusak, lalu menekannya lagi. */
        if (o.minimal && teks.length < o.minimal) {
          const p = $('#pesanTanya');
          p.textContent = `Minimal ${o.minimal} karakter.`;
          p.classList.remove('sembunyi');
          inp.focus();
          return;
        }
        selesai(teks);
      });
      btl.addEventListener('click', () => selesai(tidak()));
      if (inp) inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); ya.click(); }
      });

      /* Fokus bawaan di BATAL, bukan di tombol yang mengiyakan: sebagian besar
         pertanyaan ini tidak bisa diurungkan, dan Enter yang tidak sengaja
         tidak boleh menjadi jawabannya. Kecuali saat ada isian — di situ yang
         ditunggu memang ketikan — atau saat tidak ada Batal untuk difokuskan. */
      (inp || (o.tanpaBatal ? ya : btl)).focus();
    });
  }

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

  /** Menu "⋮" yang sedang terbuka, kalau ada. Cuma boleh satu. */
  const menuLainTerbuka = () => $$('.menu-lain .popover-menu').find(m => !m.hidden) || null;

  /** Tutup SEMUA menu "⋮" yang terbuka.
   *  Sejak menunya ada di tujuh daftar, menutup "menu Produk" saja berarti enam
   *  menu lain bisa tertinggal menganga saat orang mengklik ke tempat lain. */
  function tutupMenuLain() {
    $$('.menu-lain .popover-menu').forEach(m => {
      if (m.hidden) return;
      m.hidden = true;
      document.getElementById(m.getAttribute('aria-labelledby'))
        ?.setAttribute('aria-expanded', 'false');
    });
  }

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
      // Kosong dengan sengaja: `esc()` melarikan petik tunggal, jadi atribut
      // ini tidak bisa terpotong dan JSON-nya selalu utuh. Penjaganya ada
      // supaya ekspor tetap jalan (tanpa penyaring) kalau suatu hari salah,
      // bukan mati di tangan tanda baca.
      try { params = JSON.parse(btn.dataset.params || '{}'); } catch (e) {}
      const d = await API.ekspor({ jenis: btn.dataset.ekspor, format: btn.dataset.format, ...params });
      unduhBase64(d.nama, d.mime, d.base64);
      toast('Berkas ' + d.nama + ' diunduh.');
    } catch (e) { toast(e.message, 'galat'); }
    // innerHTML, bukan textContent: labelnya berisi ikon SVG yang harus kembali utuh.
    pemicu.disabled = false; pemicu.innerHTML = semula;
  }

  /* ==================== DASHBOARD ==================== */

  /**
   * Dashboard — dipadatkan dan diberi pembanding, 28 Agu 2026.
   *
   * Sampai v1.40 isinya empat kotak besar berisi angka HARI INI, dan satu angka
   * tanpa pembanding tidak bisa dipakai memutuskan apa pun: omzet Rp 3 juta itu
   * bagus atau buruk hanya bisa dijawab kalau kemarin diketahui. Sekarang tiap
   * angka inti membawa selisihnya terhadap periode sepanjang yang sama tepat
   * sebelumnya, dan pemilihan periodenya ada di satu tempat.
   *
   * Kepadatan dikejar dengan mengecilkan JARAK dan UKURAN HURUF, bukan dengan
   * membuang isi. Satu layar yang harus digulir tiga kali sama saja dengan tiga
   * layar — dan bagian bawahnya tidak pernah dibaca.
   */
  let periodeDash = 'hari';

  const LABEL_PERIODE = { hari: 'Hari ini', '7': '7 hari', '30': '30 hari', bulan: 'Bulan berjalan' };

  /**
   * Selisih terhadap periode pembanding, sebagai lencana.
   *
   * Dari NOL ke angka berapa pun bukan "naik 100%" — itu pembagian dengan nol
   * yang disamarkan. Ditulis "baru" supaya tidak ada yang mengutipnya sebagai
   * pertumbuhan. Selisih di bawah 0,5% dianggap datar: angka yang bergoyang
   * setengah persen tiap kali dibuka membuat lencananya berhenti diperhatikan.
   */
  function lencanaSelisih(kini, lalu) {
    const a = Number(kini) || 0, b = Number(lalu) || 0;
    if (b === 0) return a > 0 ? '<span class="delta baru">baru</span>' : '';
    const persen = (a - b) / Math.abs(b) * 100;
    if (Math.abs(persen) < 0.5) return '<span class="delta datar">tetap</span>';
    const naik = persen > 0;
    return `<span class="delta ${naik ? 'naik' : 'turun'}">${naik ? '▲' : '▼'} ${
      Math.abs(persen).toFixed(persen >= 10 || persen <= -10 ? 0 : 1)}%</span>`;
  }

  /**
   * Selisih dalam POIN PERSENTASE, bukan persen dari persen.
   *
   * Margin 51% yang jadi 0% bukan "turun 100%" — margin sudah berupa persen,
   * dan persentase dari persentase adalah angka yang tidak berarti apa pun.
   * Yang benar selisih poinnya. Bentuknya SENGAJA sama dengan `lencanaSelisih`:
   * panah lalu angka. Enam kotak sebaris yang lima memakai panah dan satu
   * memakai kalimat "dulu 51.0%" terbaca seperti dua tabel yang tidak sengaja
   * bersebelahan — itulah yang dilihat pemilik toko pada v1.74.0.
   */
  function lencanaPoin(kini, lalu) {
    if (lalu === undefined || lalu === null) return '';
    const d = (Number(kini) || 0) - (Number(lalu) || 0);
    if (Math.abs(d) < 0.05) return '<span class="delta datar">tetap</span>';
    return `<span class="delta ${d > 0 ? 'naik' : 'turun'}">${d > 0 ? '▲' : '▼'} ${
      Math.abs(d).toFixed(1)} poin</span>`;
  }

  const petakMini = (isi) => `<div class="petak-mini">${isi}</div>`;
  /* Baris ekor SELALU digambar, walau kosong. Kotak yang punya pembanding
     isinya 28px lebih tinggi daripada yang tidak, dan karena satu baris kotak
     tingginya disamakan, yang tanpa pembanding berlubang di dalam — ruang
     kosong di dalam kotak bergaris terbaca seperti isi yang gagal dimuat.
     Tingginya dipesan di CSS (`.mini-ekor { min-height }`), bukan dengan
     mengarang teks pengisi: tidak ada angka palsu yang bisa dikutip orang. */
  const kotakMini = (label, nilai, ekor) => `<div class="mini">
      <div class="mini-label">${esc(label)}</div>
      <div class="mini-nilai">${nilai}</div>
      <div class="mini-ekor">${ekor || ''}</div>
    </div>`;

  /** Tabel peringkat: ringkas, tanpa kepala tebal, angka rata kanan. */
  const kartuPeringkat = (judul, kolom, baris, kosong) => `
    <div class="kartu rapat">
      <h4>${esc(judul)}</h4>
      ${tabel(kolom, baris || [], { kosong: kosong || 'Belum ada data' })}
    </div>`;

  async function muatDashboard() {
    rangkaDashboard();
    try {
      const d = await API.dashboard({ periode: periodeDash });
      /**
       * Penjagaan ini ditambahkan setelah kejadian nyata: tepat setelah Apps Script
       * di-deploy ulang, permintaan pertama mengenai celah propagasi dan jawabannya
       * kosong. `d.hari_ini` undefined, lalu membaca `.nota` melempar galat — dan
       * gangguan sesaat yang seharusnya tidak terlihat malah tampil sebagai kotak
       * merah di depan kasir. Jawaban tak lengkap adalah kondisi jaringan yang wajar,
       * bukan hal luar biasa, jadi kodenya harus tahan menghadapinya.
       *
       * `kini` dipakai lebih dulu, `hari_ini` sebagai cadangan: server LAMA yang
       * masih dijalankan sesaat setelah terbit hanya mengirim bentuk yang lama.
       */
      const k = (d && (d.kini || d.hari_ini));
      if (!d || !k) {
        throw new Error('Server membalas tanpa data ringkasan. ' +
                        'Biasanya ini sementara — coba muat ulang beberapa saat lagi.');
      }
      const l = d.lalu || {};
      const st = d.stok || {};
      const kas = d.kas || {};
      const pi = (kas.piutang) || {};
      const pk = d.peringkat || {};
      const adaMargin = k.laba_kotor !== undefined;

      $('#isiDashboard').innerHTML = `
        <div class="bar-alat rapat">
          <select id="periodeDash" style="width:auto">
            ${Object.keys(LABEL_PERIODE).map(x =>
              `<option value="${x}" ${x === periodeDash ? 'selected' : ''}>${LABEL_PERIODE[x]}</option>`).join('')}
          </select>
          <span class="petunjuk" style="margin:0">${esc(tglTampil(d.dari))} – ${esc(tglTampil(d.sampai))}
            · dibanding ${esc(tglTampil(d.dari_lalu))} – ${esc(tglTampil(d.sampai_lalu))}</span>
        </div>

        ${petakMini([
          kotakMini('Omzet', rp(k.omzet), lencanaSelisih(k.omzet, l.omzet)),
          kotakMini('Nota', k.nota, lencanaSelisih(k.nota, l.nota)),
          kotakMini('Rata-rata/nota', rp(k.rata_nota || 0), lencanaSelisih(k.rata_nota, l.rata_nota)),
          adaMargin ? kotakMini('Laba kotor', rp(k.laba_kotor), lencanaSelisih(k.laba_kotor, l.laba_kotor)) : '',
          adaMargin ? kotakMini('Margin', (k.margin || 0).toFixed(1) + '%',
            lencanaPoin(k.margin, l.margin)) : '',
          kotakMini('Piutang beredar', rp(pi.total || 0),
            (pi.d1_30 + pi.d30plus) > 0
              ? `<span class="delta turun">${rp(pi.d1_30 + pi.d30plus)} lewat tempo</span>` : '')
        ].join(''))}

        <div class="petak-2">
          <div class="kartu rapat">
            <h4>Jam ramai</h4>
            <div id="wadahJam"><p class="grafik-kosong">Belum ada penjualan</p></div>
          </div>
          <div class="kartu rapat">
            <h4>Kas masuk &amp; piutang</h4>
            ${tabel([
              { judul: 'Metode', render: r => esc(String(r.metode).toUpperCase()) },
              { judul: 'Jumlah', angka: true, render: r => rp(r.jumlah) }
            ], kas.per_metode || [], { kosong: 'Belum ada pembayaran' })}
            <div class="umur-piutang">
              <div><span>Belum jatuh tempo</span><strong>${rp(pi.belum || 0)}</strong></div>
              <div><span>Lewat 1–30 hari</span><strong class="${pi.d1_30 > 0 ? 'peringatan' : ''}">${rp(pi.d1_30 || 0)}</strong></div>
              <div><span>Lewat 30+ hari</span><strong class="${pi.d30plus > 0 ? 'bahaya' : ''}">${rp(pi.d30plus || 0)}</strong></div>
            </div>
          </div>
        </div>

        <div class="petak-2">
          ${kartuPeringkat('Produk terlaris', [
            { judul: 'Produk', kunci: 'nama' },
            { judul: 'Qty', kunci: 'qty', angka: true },
            { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }
          ], pk.produk, 'Belum ada penjualan')}
          ${kartuPeringkat('Kategori', [
            { judul: 'Kategori', kunci: 'nama' },
            { judul: 'Omzet', angka: true, render: r => rp(r.omzet) },
            ...(adaMargin ? [{ judul: 'Margin', angka: true, render: r => (r.margin || 0).toFixed(1) + '%' }] : [])
          ], pk.kategori, 'Belum ada penjualan')}
          ${kartuPeringkat('Petugas', [
            { judul: 'Nama', kunci: 'nama' },
            { judul: 'Poin', kunci: 'poin', angka: true },
            { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }
          ], pk.petugas, 'Belum ada klaim petugas')}
          ${kartuPeringkat('Cabang', [
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Nota', kunci: 'nota', angka: true },
            { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }
          ], pk.cabang || d.per_cabang, 'Belum ada transaksi')}
        </div>

        <div class="kartu rapat">
          <h4>Kesehatan stok <span class="petunjuk" style="font-weight:400">· cabang ${esc(APP_STATE.cabang)}</span></h4>
          ${petakMini([
            kotakMini('Nilai persediaan', rp(st.nilai || 0)),
            /* "Hari persediaan" = nilai stok dibagi HPP per hari. Tanpa penjualan
               sama sekali jawabannya bukan nol melainkan tidak terhingga — server
               mengirim null, dan di sini ditulis '—'. */
            kotakMini('Hari persediaan', st.hari_persediaan === null || st.hari_persediaan === undefined
              ? '—' : st.hari_persediaan + ' hari'),
            kotakMini('Nilai barang mati', rp(st.nilai_mati || 0),
              st.jumlah_mati ? `<span class="delta turun">${st.jumlah_mati} SKU tak terjual</span>` : ''),
            kotakMini('Stok menipis', String(st.jumlah_kritis || 0),
              st.jumlah_kritis ? '<span class="delta turun">perlu dipesan</span>'
                               : '<span class="delta naik">aman</span>')
          ].join(''))}
          <!-- Jaraknya dari margin-bottom milik .petak-mini di atasnya, bukan dari
               margin-top di sini: dua sumber jarak untuk satu celah selalu berakhir
               jadi 26px yang tidak diputuskan siapa pun. -->
          <div class="petak-2">
            <div>
              <div class="petunjuk">Stok menyentuh ambang minimum</div>
              ${tabel([
                { judul: 'Produk', kunci: 'nama' },
                { judul: 'Stok', kunci: 'qty', angka: true },
                { judul: 'Min', kunci: 'stok_min', angka: true }
              ], st.kritis || [], { kosong: 'Tidak ada' })}
            </div>
            <div>
              <div class="petunjuk">Bernilai besar tapi tidak terjual periode ini</div>
              ${tabel([
                { judul: 'Produk', kunci: 'nama' },
                { judul: 'Stok', kunci: 'qty', angka: true },
                { judul: 'Nilai', angka: true, render: r => rp(r.nilai) }
              ], st.mati || [], { kosong: 'Semua produk berstok terjual' })}
            </div>
          </div>
        </div>

        ${(d.shift_terbuka || []).length ? `<div class="kartu rapat"><h4>Shift masih terbuka
          <span class="lencana kuning">${d.shift_terbuka.length}</span></h4>
          <p class="petunjuk">Shift yang tidak ditutup membuat selisih kas tidak bisa dilacak.</p>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Kasir', kunci: 'id_user' },
            { judul: 'Dibuka', render: r => esc(waktuTampil(r.buka)) }
          ], d.shift_terbuka)}</div>` : ''}

        <div class="kartu grafik rapat">
          <div class="bar-alat">
            <h4 style="margin:0">Tren penjualan</h4>
            <div style="flex:1"></div>
            <select id="grafikHari" style="width:auto">
              <option value="14">14 hari</option>
              <option value="30" selected>30 hari</option>
              <option value="60">60 hari</option>
              <option value="90">90 hari</option>
            </select>
          </div>
          <div id="wadahGrafik"><p class="grafik-kosong">Memuat grafik…</p></div>
        </div>`;

      /* Jam ramai. Jam yang NOL sengaja ikut dikirim server lalu disaring di sini,
         bukan disaring di server: yang menentukan jam buka toko adalah pemiliknya,
         dan menyaring di server berarti memutuskan untuk semua toko. */
      const jam = (d.per_jam || []).filter(x => x.nota > 0);
      if (jam.length) {
        Grafik.batang($('#wadahJam'), {
          data: jam.map(x => ({ label: String(x.jam).padStart(2, '0') + ':00',
                                nilai: x.omzet, tambahan: x.nota + ' nota' }))
        });
      }
      muatGrafik(30);
    } catch (e) { galat('#isiDashboard', e); }
  }

  /* Muatan grafik terakhir, disimpan supaya perubahan tema bisa menggambar ulang
     TANPA memanggil server lagi. SVG yang sudah tergambar tidak ikut berubah
     warna sendiri seperti kotak dan teks — token CSS tidak menyentuh atribut
     `fill` dan `stroke` yang sudah ditulis ke dalam elemennya. */
  let grafikTerakhir = null;

  /** Hanya menggambar. Tidak mengambil data, tidak menyentuh innerHTML wadahnya. */
  function pasangGrafik(g) {
    if (!g || !$('#gPenjualan')) return;
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
  }

  /* Tema diubah pemilik dari perangkat lain; perangkat ini baru tahu saat
     sinkronisasi. Kotak dan teks sudah ikut gelap lewat token CSS — grafiknya
     belum, dan grafik terang di tengah layar gelap terbaca sebagai kerusakan.
     Digambar ulang dari muatan yang sudah ada: tidak ada panggilan server. */
  document.addEventListener('tema:berubah', () => {
    if (grafikTerakhir) pasangGrafik(grafikTerakhir);
  });

  async function muatGrafik(hari) {
    const w = $('#wadahGrafik');
    if (!w) return;
    w.innerHTML = '<p class="grafik-kosong">Memuat grafik…</p>';
    try {
      const g = await API.dataGrafik({ hari });
      const r = g.ringkas;

      w.innerHTML = `
        <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));margin-bottom:16px">
          <div class="statistik"><div class="label">Omzet ${hari} hari</div><div class="nilai">${rp(r.omzet)}</div></div>
          <div class="statistik"><div class="label">Rata-rata per hari</div><div class="nilai">${rp(r.rata_per_hari)}</div></div>
          <div class="statistik"><div class="label">Rata-rata per nota</div><div class="nilai">${rp(r.rata_per_nota)}</div></div>
          ${r.margin !== undefined ? `<div class="statistik"><div class="label">Margin kotor</div><div class="nilai">${r.margin}%</div></div>` : ''}
        </div>
        <div id="gPenjualan"></div>
        <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));margin-top:22px">
          <div><h4 class="judul-grafik">Omzet per kategori</h4><div id="gKategori"></div></div>
          <div><h4 class="judul-grafik">Metode pembayaran</h4><div id="gMetode"></div></div>
          <div><h4 class="judul-grafik">10 produk teratas</h4><div id="gProduk"></div></div>
          ${g.tren_bulanan ? '<div class="lebar-penuh"><h4 class="judul-grafik">Laba kotor 6 bulan</h4><div id="gBulanan"></div></div>' : ''}
        </div>`;

      grafikTerakhir = g;
      pasangGrafik(g);
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
    /* Diurutkan A-Z di sini, satu tempat untuk kedua layar yang memakainya
       (Produk dan Stok). Urutan aslinya adalah urutan kemunculan di sheet. */
    (daftar || []).slice().sort(urutNama).map(k =>
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
    /* Sejak v1.149.0 daftar hanya membawa JUMLAHNYA, dan itu pun hanya kalau
       kolom ini sedang dipakai — pola yang sama dengan kolom "Terjual".
       `butuhTurunan` yang memicu penarikannya. */
    { id: 'turunan', judul: 'Turunan', butuhTurunan: true, render: r => [
        r.n_satuan ? `<span class="lencana">${r.n_satuan} satuan</span>` : '',
        r.n_tier ? `<span class="lencana">${r.n_tier} tier</span>` : '',
        r.n_varian ? `<span class="lencana">${r.n_varian} varian</span>` : ''
      ].filter(Boolean).join(' ') || '—' },
    { id: 'stok_min', judul: 'Stok min', angka: true, render: r => String(r.stok_min ?? 0) },
    { id: 'barcode', judul: 'Barcode', render: r => esc(r.barcode || '') || '—' },
    { id: 'satuan_dasar', judul: 'Satuan', render: r => esc(r.satuan_dasar || 'pcs') }
  ];

  /**
   * Penyaring baris. Kosong = semua, supaya selalu ada jalan kembali.
   *
   * `urut` opsional: penyaring yang punya urutannya sendiri memakainya, sisanya
   * mempertahankan urutan katalog. Dipasang di sini, bukan di penggambar, supaya
   * "saring apa" dan "urut bagaimana" tinggal di satu baris yang sama —
   * penyaring Terlaris yang mengurutkan menurut poin akan jadi kebingungan yang
   * tidak bisa dibaca dari layar.
   */
  const SARING_PRODUK = [
    { id: '', label: 'Semua produk', lolos: () => true },
    /* Terlaris butuh data penjualan yang TIDAK ikut di daftar produk. Datanya
       ditarik sekali saat pilihan ini dipakai, lalu disimpan selama layar ini
       hidup — lihat `muatTerjual()`. */
    { id: 'terlaris', label: 'Terlaris', butuhTerjual: true,
      lolos: r => terjualProduk.qty[r.sku] > 0,
      urut: (a, b) => (terjualProduk.qty[b.sku] || 0) - (terjualProduk.qty[a.sku] || 0) },
    { id: 'tak_laku', label: 'Tidak laku', butuhTerjual: true,
      lolos: r => !(terjualProduk.qty[r.sku] > 0) },
    { id: 'berpoin', label: 'Berpoin', lolos: r => Number(r.poin_satuan) > 0 },
    { id: 'tanpa_poin', label: 'Tanpa poin', lolos: r => !(Number(r.poin_satuan) > 0) }
    /* Pilihan "Nonaktif" dibuang: produk nonaktif sekarang punya tempatnya
       sendiri di bawah daftar. Dua jalan menuju hal yang sama hanya membuat
       orang bertanya-tanya apakah keduanya menunjukkan isi yang berbeda. */
  ];

  /* Rentang BAWAAN, bukan rentang tetap: pemiliknya memilih sendiri (2 Sep
     2026), dan 30 hari cuma titik berangkatnya. */
  const HARI_TERLARIS = 30;

  /** Rentang bawaan: 30 hari terakhir sampai hari ini, dalam waktu LOKAL. */
  function rentangBawaanTerjual() {
    const kini = new Date();
    /* tanggalLokal(), BUKAN toISOString(): yang kedua itu UTC, dan tengah malam
       di WIB masih pukul 17:00 hari sebelumnya di UTC — rentangnya akan mundur
       sehari. Kesalahan yang sama pernah terjadi di layar Poin. */
    return { dari: tanggalLokal(new Date(kini.getTime() - (HARI_TERLARIS - 1) * 86400000)),
             sampai: tanggalLokal(kini) };
  }

  /* Pilihan layar, bukan pengaturan akun: hidup selama sesi ini saja dan tidak
     ikut tersimpan. Membuka aplikasi besok kembali ke Poin. */
  let kolomProduk = 'poin', saringProduk = '';
  let dataProduk = null, kueriProduk = '', kategoriProduk = '';

  /* PAGINASI — v1.149.0.
     Diukur di panggung dengan 3.500 produk: satu gambar penuh menghasilkan
     45.647 node di dalam #isiProduk, dan node itu TIDAK hilang saat pindah
     layar (`bukaLayar` hanya mencabut class `aktif`), jadi setiap layar lain
     sesudahnya ikut memikulnya. 100 baris = sekitar 1.300 node.
     Yang dipotong hanya YANG DIGAMBAR: cari, saring kategori, saring baris dan
     ekspor tetap bekerja atas SELURUH katalog seperti sebelumnya. */
  const BARIS_PER_HAL = 100;
  let halProduk = 1;
  /* `qty` peta SKU → jumlah terjual; `kunci` menandai rentang MANA yang sudah
     di tangan. Dulu penandanya cuma `siap` (benar/salah) — itu cukup selama
     rentangnya tetap, tapi begitu rentangnya bisa diganti, peta 30 hari akan
     tetap dipakai untuk rentang 7 hari tanpa satu pun tanda di layar.
     Peta kosong yang sudah ditarik dan peta kosong yang belum ditarik terlihat
     sama, jadi penandanya harus terpisah dari isinya — tanpa itu layar akan
     menembak server berulang-ulang di toko yang memang belum menjual apa pun. */
  let rentangTerjual = rentangBawaanTerjual();
  let terjualProduk = { qty: {}, kunci: '', dari: '', sampai: '', hari: HARI_TERLARIS };
  const kunciRentang = (r) => r.dari + '|' + r.sampai;
  const terjualSiap = () => terjualProduk.kunci === kunciRentang(rentangTerjual);

  /**
   * Tarik SELURUH katalog — sekali per pembukaan layar, tanpa kata kunci.
   *
   * Dulu tiap ketikan di kolom cari menembak `daftar_produk` lagi, dan tiap
   * jawabannya menimpa seluruh layar: kolom carinya IKUT dibuang dan dibuat
   * baru, jadi fokus dan posisi kursor hilang di tengah orang mengetik.
   * Mengetik "m5" bisa memutus dirinya sendiri.
   *
   * Sekarang saringannya di perangkat, persis seperti layar Kasir. Ini bukan
   * penambahan beban: saat kolom carinya kosong — keadaan setiap kali layar
   * dibuka — seluruh katalog memang sudah ditarik. Yang hilang justru
   * panggilan-panggilan tambahan itu.
   *
   * Seluruh kolom yang dicari server (`deskripsi`, `kata_kunci`, `kompatibel`)
   * ikut terkirim di dalam tiap baris, jadi saringan di sini menemukan barang
   * yang SAMA — bukan versi yang lebih dangkal.
   */
  /** Apakah tarikan terakhir sudah membawa jumlah satuan/tier/varian. */
  let turunanSiap = false;
  /* Penjaga gelang. `gambarProduk` menjadwalkan penarikan ulang saat kolom
     Turunan dipilih, dan `muatProduk` menggambar lagi sesudahnya — kalau
     servernya menjawab tanpa `turunan_ada` (server LAMA yang masih berjalan
     sesaat setelah terbit; lihat catatan serupa di muatDashboard), keduanya
     akan saling memanggil tanpa henti dan layarnya berkedip selamanya.
     Dicoba SEKALI; gagal berarti kolomnya tetap kosong, bukan aplikasi mati. */
  let turunanDicoba = false;

  async function muatProduk() {
    rangkaProduk();
    try {
      /* `turunan` diminta hanya kalau kolomnya memang sedang dipilih. Tiga
         pembacaan sheet (441 md) tidak dibayar orang yang cuma mencari satu
         harga. */
      const minta = { termasuk_nonaktif: true };
      if (kolomProduk === 'turunan') minta.turunan = true;
      const d = await API.daftarProduk(minta);
      turunanSiap = d.turunan_ada === true;
      if (turunanSiap) turunanDicoba = false;   /* boleh dicoba lagi nanti */
      cacheProduk = d.produk;
      /* Teks pencarian disusun SEKALI per barang, bukan tiap ketikan. Pada 362
         produk bedanya belum terasa; pada katalog yang tumbuh, menyusun ulang
         empat larik kompatibel untuk tiap huruf yang diketik terasa. */
      cacheProduk.forEach(r => {
        r._cari = [r.sku, r.nama, r.kategori, r.merek, r.tipe_hp, r.barcode,
                   r.deskripsi, r.kata_kunci,
                   (r.kompatibel || []).map(k => k.merek + ' ' + k.tipe).join(' ')]
          .join(' ').toLowerCase();
      });
      dataProduk = d;
      gambarProduk();
    } catch (e) { galat('#isiProduk', e); }
  }

  /**
   * Katalog DASAR layar ini: aktif saja, atau nonaktif saja.
   *
   * Pemisahannya dikerjakan di sini, BUKAN di dalam `tabel()` seperti enam
   * daftar lainnya, dan itu karena layar ini satu-satunya yang berpaginasi.
   * Kalau baris mati baru dibuang di dalam tabel, penghitung ("240 dari 3.500"),
   * bilah halaman dan potongan 100 baris semuanya menghitung baris yang tidak
   * jadi digambar — halaman 2 bisa datang setengah kosong tanpa satu pun galat.
   */
  function katalogDasar() {
    const mati = modeNonaktif.has('produk');
    return cacheProduk.filter(r => (r.aktif === false) === mati);
  }

  /** Saring katalog di perangkat: kata kunci + kategori. */
  function saringKatalog() {
    const q = kueriProduk.toLowerCase().trim();
    return katalogDasar().filter(r =>
      (!kategoriProduk || String(r.kategori || '').trim() === kategoriProduk) &&
      (!q || r._cari.includes(q)));
  }

  /**
   * Tarik jumlah terjual 30 hari terakhir — SEKALI per pembukaan layar.
   *
   * Dipisah dari `muatProduk` dengan sengaja: `penjualan_item` tabel terbesar di
   * sistem, dan daftar produk dibuka puluhan kali sehari untuk urusan yang tidak
   * ada hubungannya dengan penjualan.
   */
  async function muatTerjual() {
    if (terjualSiap()) return true;
    const minta = { dari: rentangTerjual.dari, sampai: rentangTerjual.sampai };
    try {
      const d = await API.produkTerjual(minta);
      const qty = {};
      (d.terjual || []).forEach(x => { qty[x.sku] = Number(x.qty) || 0; });
      /* Rentang yang DIJAWAB server yang dipakai, bukan yang diminta: server
         membetulkan rentang terbalik dan menjepit yang kepanjangan, dan layar
         yang tetap menulis angkanya sendiri akan menyebut rentang yang tidak
         pernah dihitung siapa pun. */
      rentangTerjual = { dari: d.dari || minta.dari, sampai: d.sampai || minta.sampai };
      terjualProduk = { qty, kunci: kunciRentang(rentangTerjual),
                        dari: rentangTerjual.dari, sampai: rentangTerjual.sampai,
                        hari: d.hari || HARI_TERLARIS };
      return true;
    } catch (e) {
      toast('Gagal menarik data terjual: ' + e.message, 'galat');
      return false;
    }
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
    let kolomAktif = pilihan.find(k => k.id === kolomProduk);
    /* Kolom yang butuh data turunan tapi datanya belum ditarik dikembalikan ke
       "tidak ada" untuk gambar ini, DAN penarikannya dijadwalkan. Kalau
       dibiarkan, kolomnya menampilkan "—" untuk seluruh katalog — jawaban yang
       salah, bukan jawaban yang kosong. Pola dan alasannya sama dengan
       `saring.butuhTerjual` di bawah. */
    if (kolomAktif && kolomAktif.butuhTurunan && !turunanSiap) {
      kolomAktif = null;
      if (!turunanDicoba) { turunanDicoba = true; muatProduk(); }
    }

    let saring = SARING_PRODUK.find(s => s.id === saringProduk) || SARING_PRODUK[0];
    /* Penyaring yang butuh data penjualan tapi datanya belum ada dikembalikan ke
       "Semua produk", bukan dijalankan atas peta kosong — kalau dijalankan, ia
       menyembunyikan SELURUH katalog dan terlihat persis seperti daftar produk
       yang hilang. */
    if (saring.butuhTerjual && !terjualSiap()) { saring = SARING_PRODUK[0]; saringProduk = ''; }
    const terlihat = saringKatalog();
    const baris = terlihat.filter(saring.lolos);
    if (saring.urut) baris.sort(saring.urut);
    /* Penyebutnya katalog DASAR, bukan `cacheProduk`: dalam mode nonaktif
       "12 dari 3.500 produk" menyebut dua himpunan yang berbeda dalam satu
       kalimat, dan yang membaca akan mengira 3.488 produknya hilang. */
    const dasar = katalogDasar();
    const kata = modeNonaktif.has('produk') ? 'produk nonaktif' : 'produk';
    const hitung = baris.length === dasar.length
      ? `${dasar.length} ${kata}`
      : `${baris.length} dari ${dasar.length} ${kata}`;

    $('#isiProduk').innerHTML = `
      <div class="kartu">
        <!-- URUTAN BAR ALAT — disusun ulang v1.149.0 atas permintaan pemilik.
             Sebelumnya lima tombol berjajar dengan bobot yang sama persis, dan
             "+ Produk baru" — satu-satunya yang dipakai berkali-kali sehari —
             terjepit di antara "Tandai butuh pemasangan" dan "Impor massal",
             dua tombol yang dipakai beberapa kali setahun.

             Susunannya sekarang: yang MENYARING lebih dulu (cari → kategori →
             saring baris), lalu yang mengubah TAMPILAN (kolom tambahan), lalu
             jumlah barisnya. Tindakan pindah ke kanan: satu tombol utama, dan
             sisanya di balik "⋯".

             Kolom cari berdiri paling kiri karena itu jalan masuk yang paling
             sering dipakai; menyaring kategori dan menyaring baris berdempetan
             karena keduanya mengurangi baris, sementara "Tampilkan" tidak
             mengurangi apa pun — ia menambah lajur. Mencampur ketiganya
             membuat orang mengira "Tampilkan: Poin" ikut menyembunyikan barang. -->
        <div class="bar-alat bar-alat-menu">
          <!-- DUA KOTAK, bukan satu deretan yang membungkus.
               Saringan mengalir di kiri dan boleh membungkus sendiri; tindakan
               diam di kanan atas dan tidak pernah ikut turun. Sebelum ini
               (percobaan pertama v1.149.0) tombol ⋮ dikunci dengan
               position:absolute dan tombol utama dibiarkan di aliran — di
               1024px tombol utama turun sendirian ke baris kedua, rata kanan,
               di bawah ⋮ yang tetap di atas: dua tindakan yang sederajat di dua
               baris berbeda. Persis bentuk berantakan yang mau dihilangkan.
               Dengan dua kotak, keduanya SELALU berdampingan, dan yang
               membungkus hanya saringannya — itu wajar, karena saringan memang
               daftar, sementara tindakan adalah pasangan.
               (Tanpa petik-balik: blok ini ada di dalam template literal.) -->
          <div class="saringan">
            <input type="text" id="cariProduk" placeholder="Cari SKU, nama, merek, tipe HP…" value="${esc(kueriProduk)}" style="max-width:300px">
            <select id="filterKategori" style="max-width:180px">${opsiKategori(d.kategori_ada, kategoriProduk)}</select>
            <select id="saringProduk" style="max-width:160px" title="Saring baris">
              ${SARING_PRODUK.map(s => `<option value="${s.id}" ${s.id === saringProduk ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>
            <select id="kolomProduk" style="max-width:170px" title="Kolom tambahan yang ditampilkan">
              ${pilihan.map(k => `<option value="${k.id}" ${k.id === kolomProduk ? 'selected' : ''}>Tampilkan: ${esc(k.judul)}</option>`).join('')}
              <option value="" ${kolomProduk ? '' : 'selected'}>Tampilkan: tidak ada</option>
            </select>
            ${saring.butuhTerjual ? `
              <span style="display:inline-flex;gap:6px;align-items:center;white-space:nowrap"
                    title="Rentang penjualan yang dihitung">
                <input type="date" id="terjualDari" value="${esc(terjualProduk.dari)}" style="max-width:150px">
                <span style="color:var(--teks-redup)">–</span>
                <input type="date" id="terjualSampai" value="${esc(terjualProduk.sampai)}" style="max-width:150px">
              </span>` : ''}
          </div>
          <div class="aksi">
            ${bolehIzin('produk', 'buat')
              ? `<button class="tombol utama" id="btnProdukBaru">+ Produk baru</button>` : ''}
            ${menuLainProduk()}
          </div>
        </div>
      </div>
      <div class="kartu" id="wadahTabelProduk">
        ${isiTabelProduk(baris, modal, saring, kolomAktif, hitung)}
      </div>`;
  }

  /**
   * Isi kartu tabel: penghitung, tabel, bilah halaman.
   *
   * Penghitung PINDAH dari bar alat ke sini v1.149.0. Di bar alat ia jadi
   * kendali kelima yang bukan kendali — tidak bisa ditekan, tidak bisa diubah,
   * dan ikut mendorong bar alatnya membungkus jadi dua baris. Tempatnya yang
   * benar menempel pada apa yang dihitungnya.
   *
   * Ia juga menjawab pertanyaan yang berbeda dari bilah halaman di kaki:
   * penghitung menyebut BERAPA YANG COCOK ("240 dari 3.500 produk" saat
   * disaring), bilah halaman menyebut SEBELAH MANA yang sedang dilihat
   * ("1–100 · halaman 1/3"). Karena itu keduanya ada, dan karena itu pula
   * "dari 3.500" dibuang dari bilah halaman — dulu ia mengulang angka yang
   * sudah berdiri dua sentimeter di atasnya.
   *
   * Kelas `.jumlah-baris` DIPERTAHANKAN: layar Laporan memakainya juga
   * (`#lapNotaHitung`), dan uji layar Produk mencari lewat kelas itu.
   */
  function isiTabelProduk(baris, modal, saring, kolomAktif, hitung) {
    return (modeNonaktif.has('produk') ? spandukNonaktif('produk') : '') +
      `<div class="kepala-tabel"><span class="jumlah-baris">${hitung}</span></div>` +
      tabelProduk(potongHal(baris), modal, saring, kolomAktif) +
      pagerProduk(baris.length);
  }

  /** Baris untuk halaman yang sedang dilihat. Menjepit halamannya sekalian:
   *  mengetik di kolom cari bisa membuat halaman 12 tidak ada lagi, dan
   *  halaman kosong terbaca sebagai "tidak ada produk cocok" yang salah. */
  function potongHal(baris) {
    const maks = Math.max(1, Math.ceil(baris.length / BARIS_PER_HAL));
    if (halProduk > maks) halProduk = maks;
    if (halProduk < 1) halProduk = 1;
    return baris.slice((halProduk - 1) * BARIS_PER_HAL, halProduk * BARIS_PER_HAL);
  }

  /** Bilah halaman. Disembunyikan kalau semuanya muat di satu halaman —
   *  kendali yang tidak pernah bisa ditekan cuma menambah yang harus dibaca. */
  function pagerProduk(total) {
    const maks = Math.ceil(total / BARIS_PER_HAL);
    if (maks <= 1) return '';
    const dari = (halProduk - 1) * BARIS_PER_HAL + 1;
    const sampai = Math.min(halProduk * BARIS_PER_HAL, total);
    return `
      <nav class="pager" aria-label="Halaman daftar produk">
        <button class="tombol kecil" data-hal="prev" ${halProduk <= 1 ? 'disabled' : ''}
          aria-label="Halaman sebelumnya">‹ Sebelumnya</button>
        <span class="pager-teks" aria-live="polite">
          ${dari}–${sampai} · halaman ${halProduk}/${maks}
        </span>
        <button class="tombol kecil" data-hal="next" ${halProduk >= maks ? 'disabled' : ''}
          aria-label="Halaman berikutnya">Berikutnya ›</button>
      </nav>`;
  }

  /**
   * Hanya TABEL-nya yang digambar ulang saat orang mengetik di kolom cari.
   *
   * Menggambar ulang seluruh kartu berarti kolom carinya sendiri ikut dibuang
   * dan dibuat baru — fokus lepas, kursor pindah ke ujung, dan halaman melompat
   * ke atas. Itu yang membuat mengetik "m5" terasa seperti aplikasi merebut
   * papan ketik. Bar alatnya hanya perlu digambar ulang kalau ISINYA yang
   * berubah (kolom Terjual muncul, kolom tanggal muncul), dan itu bukan yang
   * terjadi saat mengetik.
   */
  function gambarBarisProduk() {
    const d = dataProduk;
    if (!d || !$('#wadahTabelProduk')) return;
    const modal = d.boleh_harga_modal;
    const pilihan = KOLOM_PRODUK.filter(k => !k.butuhModal || modal);
    const kolomAktif = pilihan.find(k => k.id === kolomProduk);
    let saring = SARING_PRODUK.find(s => s.id === saringProduk) || SARING_PRODUK[0];
    if (saring.butuhTerjual && !terjualSiap()) saring = SARING_PRODUK[0];

    const terlihat = saringKatalog();
    const baris = terlihat.filter(saring.lolos);
    if (saring.urut) baris.sort(saring.urut);
    /* Penghitungnya ikut digambar ulang di sini, bukan ditambal sesudahnya.
       `$('.jumlah-baris')` mencari ke SELURUH dokumen: kalau layar Produk
       kebetulan tidak punya penghitung, ia akan menemukan milik layar Laporan
       (`#lapNotaHitung`) dan menimpanya dengan jumlah produk. */
    /* Penyebutnya katalog DASAR, bukan `cacheProduk`: dalam mode nonaktif
       "12 dari 3.500 produk" menyebut dua himpunan yang berbeda dalam satu
       kalimat, dan yang membaca akan mengira 3.488 produknya hilang. */
    const dasar = katalogDasar();
    const kata = modeNonaktif.has('produk') ? 'produk nonaktif' : 'produk';
    const hitung = baris.length === dasar.length
      ? `${dasar.length} ${kata}`
      : `${baris.length} dari ${dasar.length} ${kata}`;
    $('#wadahTabelProduk').innerHTML = isiTabelProduk(baris, modal, saring, kolomAktif, hitung);
  }

  /** Bentuk tabel produk — SATU tempat, dipakai penggambaran penuh dan parsial. */
  /**
   * Menu "⋯" layar Produk: tindakan yang jarang dipakai, dikumpulkan.
   *
   * Stiker, Ekspor, "Tandai butuh pemasangan" dan "Impor massal" dulu berjajar
   * sederajat dengan "+ Produk baru". Empat dari lima tombol itu dipakai
   * beberapa kali setahun; yang kelima dipakai tiap hari.
   *
   * TIGA hal yang tidak boleh hilang saat dilipat ke dalam menu:
   *
   * 1. Penghitung stiker. Keranjang stiker adalah tempat menumpuk sebelum
   *    dicetak, dan angkanya yang mengingatkan bahwa masih ada yang menunggu.
   *    Menyembunyikannya di balik menu berarti orang lupa mencetak. Karena itu
   *    tombol "⋯" sendiri memakai titik penanda saat keranjangnya berisi, dan
   *    angkanya tetap ditulis di butir pertama.
   * 2. Format ekspor. `tombolEkspor` membawa dropdown-nya sendiri, dan menu di
   *    dalam menu adalah dua lapis yang harus dibuka untuk satu tindakan. Jadi
   *    ketiga formatnya DIRATAKAN jadi butir tersendiri — id dan data-atribut
   *    yang sama persis, jadi penangan ekspor yang sudah ada tetap bekerja.
   * 3. Hak akses. Butir yang perannya tidak berhak TIDAK digambar, sama seperti
   *    sebelum dilipat. Kalau seluruh isinya kosong, tombol "⋮" pun tidak
   *    digambar — tombol yang membuka menu kosong lebih buruk daripada tidak
   *    ada tombol.
   *
   * Butir "Lihat yang nonaktif" berdiri PALING ATAS dan sendirian, dipisah dari
   * sisanya. Ia satu-satunya butir di sini yang mengubah apa yang sedang
   * dilihat, bukan menjalankan sesuatu lalu selesai; menaruhnya berdempetan
   * dengan Ekspor membuat dua jenis tindakan itu terbaca sederajat.
   */
  function menuLainProduk() {
    const bolehUbah = bolehIzin('produk', 'ubah');
    const bolehBuat = bolehIzin('produk', 'buat');
    /* Dihitung dari `cacheProduk`, BUKAN dari baris yang sedang digambar:
       angka yang ikut menyusut saat orang mengetik di kolom cari bukan jawaban
       atas "berapa produk saya yang nonaktif". */
    const nMati = hitungMati(cacheProduk);
    const butirMati = butirNonaktif('produk', nMati);
    const butir =
      (butirMati ? `<div class="popover-pisah">${butirMati}</div>` : '') +
      `<button class="popover-item" role="menuitem" id="btnKeranjangLabel">
         <span>Keranjang stiker</span><span class="lencana" id="lencanaStiker">0</span>
       </button>` +
      `<div class="popover-pisah">
         <p class="petunjuk" style="padding:2px 10px 4px;margin:0">Ekspor daftar ini</p>
         ${FORMAT_EKSPOR.map(f => `<button class="popover-item" role="menuitem"
             data-ekspor="produk" data-format="${f.kode}" data-params='{}'>
             <span>${esc(f.label)}</span><span class="petunjuk">${esc(f.ket)}</span></button>`).join('')}
       </div>` +
      ((bolehUbah || bolehBuat) ? `<div class="popover-pisah">
         ${bolehUbah ? `<button class="popover-item" role="menuitem" id="btnTandaiPasang">
             <span>Tandai butuh pemasangan</span></button>` : ''}
         ${bolehBuat ? `<button class="popover-item" role="menuitem" id="btnImporProduk">
             <span>Impor massal</span></button>` : ''}
       </div>` : '');

    return menuTindakan({
      id: 'menuProduk', idTombol: 'btnMenuProduk', kunci: 'produk', isi: butir,
      titik: '<span class="titik-tanda sembunyi" id="titikStiker" aria-hidden="true"></span>'
    });
  }

  function tabelProduk(baris, modal, saring, kolomAktif) {
    return tabel([
          { judul: 'SKU', kunci: 'sku' },
          { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}
            <div class="meta-kecil">${esc([r.kategori, r.merek, r.tipe_hp].filter(Boolean).join(' · '))}</div>` },
          ...(modal ? [{ judul: 'Modal', angka: true, render: r => rp(r.harga_beli_terakhir) }] : []),
          { judul: 'Eceran', angka: true, render: r => rp(r.harga_eceran) },
          { judul: 'Grosir', angka: true, render: r => rp(r.harga_grosir) },
          { judul: 'Stok', angka: true, render: r => lencanaStok(r.stok, r.stok_min) },
          /* Kolom Terjual muncul SENDIRI saat penyaringnya dipakai, tanpa perlu
             memilihnya lagi di dropdown kolom. Daftar yang diurut menurut angka
             yang tidak kelihatan adalah daftar yang urutannya tidak bisa
             dipercaya siapa pun. */
          ...(saring.butuhTerjual ? [{
            judul: 'Terjual', angka: true,
            render: r => String(terjualProduk.qty[r.sku] || 0)
          }] : []),
          ...(kolomAktif ? [kolomAktif] : []),
          /* Tombol Label ada di SETIAP baris.
             Sampai v1.90 ia disembunyikan pada produk yang punya barcode pabrik,
             supaya tidak ada dua barcode berbeda di satu barang. Kekhawatirannya
             benar, jalan keluarnya keliru: yang hilang bukan bahayanya melainkan
             satu-satunya cara mencetak stiker untuk barang yang stiker pabriknya
             sobek atau pudar — dan pemiliknya melaporkannya sebagai kerusakan
             (4 Sep 2026), karena baris yang tombolnya hilang tidak menjelaskan
             apa pun tentang dirinya. Sekarang `Label.kodeProduk` mencetak
             barcode PABRIKNYA untuk produk itu, jadi kedua stiker memindai ke
             kode yang sama dan tidak ada lagi "yang salah" untuk discan. */
          { judul: '', render: r => `<button class="tombol kecil" data-edit-produk="${esc(r.sku)}">Ubah</button>` +
              ` <button class="tombol kecil" data-label-produk="${esc(r.sku)}">Label</button>` }
        /* TANPA `pisahNonaktif`: layar ini memisahkannya lebih awal, di
           `katalogDasar()`, karena paginasinya harus menghitung baris yang
           benar-benar digambar. Lihat catatan di sana. */
        ], baris, { kosong: (kueriProduk || kategoriProduk || saringProduk)
            ? 'Tidak ada produk cocok'
            : (modeNonaktif.has('produk')
                ? 'Tidak ada produk yang nonaktif'
                : 'Belum ada produk — mulai dengan "Produk baru" atau "Impor massal"') });
  }

  /* ==================== CETAK LABEL BARCODE ====================
     Diminta pemilik 1 Sep 2026. Aturannya diputuskan di sana dan ditulis di
     `label.js`; layar ini cuma pintunya. Yang penting di sini: kalau kodenya
     tidak muat di stikernya, tombolnya MENOLAK dan menyebut angkanya — barcode
     terpotong terbaca sebagai barang lain, dan itu jauh lebih mahal daripada
     label yang tidak jadi tercetak. */
  /* ==================== KERANJANG STIKER ====================
     Diminta pemilik 6 Sep 2026: "ada situasi dimana cuma membutuhkan 1 label
     saja, sedangkan sekali printah print 1 baris harus berjalan. saya berharap
     ada jalur yang bisa diadjust perlabel sehingga 1 baris terisi semua dengan
     berbeda sku".

     Mesinnya sudah bisa sejak awal — `Label.cetak()` menerima ARRAY dan
     `sebar()` mengembangkannya per lembar. Yang tidak ada cuma jalannya: dialog
     cetak selalu diberi satu produk saja, jadi satu stiker memakan satu baris
     kertas penuh dan dua kolom sisanya terbuang. Roll 3 line yang dipakai toko
     ini membuang dua pertiga kertasnya setiap kali mencetak satu barang.

     Keranjangnya BERTAHAN di perangkat (IndexedDB, sama seperti outbox kasir).
     Mengumpulkan tiga SKU berarti tiga kali mencari di katalog; kehilangan
     kumpulan itu karena tab tertutup atau aplikasi memuat versi baru berarti
     mengulang seluruh pencariannya. */

  const KUNCI_KERANJANG = 'label_keranjang';

  const muatKeranjangLabel = async () => {
    const k = await DB.kvGet(KUNCI_KERANJANG, []);
    return Array.isArray(k) ? k : [];
  };
  const simpanKeranjangLabel = async (k) => {
    await DB.kvSet(KUNCI_KERANJANG, k);
    perbaruiLencanaStiker(k);
  };

  /** Angka di butir Stiker = jumlah STIKER, bukan jumlah baris keranjang. */
  function perbaruiLencanaStiker(k) {
    const n = (k || []).reduce((a, x) => a + (Number(x.lembar) || 1), 0);
    const el = $('#lencanaStiker');
    if (el) el.textContent = String(n);
    /* Penanda di tombol "⋯" — sejak keranjang stiker pindah ke dalam menu,
       angkanya tidak lagi terlihat tanpa membukanya. Titik kecil ini yang
       menggantikan tugas mengingatkan: ada yang menunggu dicetak. Tanpa itu,
       melipat tombolnya ke dalam menu sama saja dengan membuang pengingatnya. */
    const t = $('#titikStiker');
    if (t) t.classList.toggle('sembunyi', n === 0);
  }

  /**
   * Cari produk untuk keranjang — dari KATALOG CACHE di perangkat, bukan server.
   *
   * Diminta pemilik di kalimat yang sama: "kalau bisa ada sistem cache supaya
   * bisa digunakan dengan cepat". `DB.all('produk')` membaca store IndexedDB
   * yang sudah diisi Sync.tarikMaster, dan store itu SUDAH ber-cache baca di
   * memori (lihat CACHEABLE di db.js) — pencarian kedua dan seterusnya tidak
   * menyentuh disk sama sekali, apalagi jaringan.
   *
   * TIDAK ada lapisan cache kedua di sini, dan itu disengaja. Cache milik db.js
   * dibuang setiap kali katalognya ditulis ulang, dan pembuangannya disiarkan
   * ke tab lain lewat BroadcastChannel. Menyimpan salinan sendiri di sini
   * berarti salinan itu tidak ikut dibuang — sesudah tarik master, pencarian
   * stiker akan menyajikan katalog basi selamanya, tanpa satu pun tanda.
   *
   * Konsekuensinya tetap jujur: katalognya sesegar tarikan master terakhir,
   * jadi produk yang dibuat menit ini belum ada sampai master ditarik lagi.
   */
  const katalogStiker = () => DB.all('produk');

  /** Satu baris keranjang dari sebuah produk, atau null kalau tak punya kode. */
  function barisStikerDari(p) {
    const kode = Label.kodeProduk(p);
    if (!kode) return null;
    return { sku: String(p.sku), kode, nama: String(p.nama || p.sku), lembar: 1 };
  }

  async function tambahKeranjangLabel(sku) {
    if (typeof Label === 'undefined') {
      return toast('Muat ulang aplikasi sekali lagi supaya modul label ikut terpasang.', 'galat');
    }
    let p = cacheProduk.find(x => x.sku === sku);
    if (!p) p = (await katalogStiker()).find(x => String(x.sku) === String(sku));
    if (!p) return toast('Produk tidak ditemukan.', 'galat');

    const baris = barisStikerDari(p);
    if (!baris) return toast('Produk ini tidak punya SKU maupun barcode untuk dicetak.', 'galat');

    const k = await muatKeranjangLabel();
    /* SKU yang sama ditambah JUMLAHNYA, bukan jadi baris kedua. Dua baris
       dengan SKU sama membuat orang mengira ia salah pencet, lalu membuang
       salah satunya — dan yang terbuang membawa jumlahnya. */
    const ada = k.find(x => x.sku === baris.sku);
    if (ada) ada.lembar = Math.min(999, (Number(ada.lembar) || 1) + 1);
    else k.push(baris);
    await simpanKeranjangLabel(k);

    /* TANPA esc(): toast() menulis lewat textContent, jadi meloloskannya di sini
       justru memunculkan "&amp;" pada nama produk yang memuat "&". */
    toast(`${baris.nama} masuk keranjang stiker (${
      k.reduce((a, x) => a + (Number(x.lembar) || 1), 0)} stiker).`);
    if ($('#modalUmum') && $('#modalUmum')._label) gambarKeranjangLabel();
  }

  /* ---------- dialog keranjang ---------- */

  async function bukaKeranjangLabel() {
    if (typeof Label === 'undefined') {
      return toast('Muat ulang aplikasi sekali lagi supaya modul label ikut terpasang.', 'galat');
    }
    const u = await Label.ukuran();
    u.kolom = Label.jumlahKolom(u);
    const lebarHalaman = u.lebar_mm * u.kolom + (u.kolom - 1) * u.jarak_mm;

    bukaModal('Keranjang stiker', `
      <div class="petak-tunggal" style="max-width:none">
        <div class="grup">
          <label for="labCari">Tambah produk</label>
          <input type="text" id="labCari" placeholder="Cari SKU, nama, merek, tipe HP…" autocomplete="off">
          <div id="labHasil" class="hasil-stiker sembunyi"></div>
        </div>
        <div class="grup">
          <label>Isi keranjang</label>
          <div id="labIsi"></div>
        </div>
        <div class="grup">
          <label>Kolom yang dicetak</label>
          <div class="bar-alat" style="gap:14px;margin-top:4px">
            ${Array.from({ length: u.kolom }, (_, i) => `<label class="cek" style="margin:0">
              <input type="checkbox" class="labSlot" data-slot="${i + 1}" checked> Kolom ${i + 1}</label>`).join('')}
          </div>
          <p class="petunjuk" style="margin:4px 0 0">Baris kertas yang tinggal separuh tidak
            perlu dibuang: matikan kolom yang stikernya sudah terpakai, dan cetakan berikutnya
            mulai dari kolom yang masih kosong.</p>
        </div>
        <label class="cek"><input type="checkbox" id="labNama"> Sertakan nama produk di label</label>
        <div class="grup">
          <label>Pratinjau — ukuran sesungguhnya, seluruh barisnya</label>
          <div id="labPratinjau" style="margin-top:6px"></div>
          <p class="petunjuk" id="labKetPratinjau" style="margin:6px 0 0"></p>
        </div>
        <div id="pesanLabel"></div>
        <p class="petunjuk" style="margin:0">Di dialog cetak: pilih printer label,
          kertas ${lebarHalaman} × ${u.tinggi_mm} mm, margin <strong>None</strong>,
          skala <strong>100%</strong>, header/footer dimatikan.</p>
      </div>`,
      `<button class="tombol" data-tutup="1">Tutup</button>
       <button class="tombol" id="btnKosongkanLabel">Kosongkan</button>
       <button class="tombol utama" id="btnCetakLabel">Cetak</button>`);

    $('#modalUmum')._label = { ukuran: u };
    await gambarKeranjangLabel();

    $('#labNama').addEventListener('change', gambarKeranjangLabel);
    $$('.labSlot').forEach(c => c.addEventListener('change', gambarKeranjangLabel));
    $('#labCari').addEventListener('input', cariProdukStiker);
    $('#labCari').addEventListener('blur', () => setTimeout(() => $('#labHasil')?.classList.add('sembunyi'), 150));
  }

  async function cariProdukStiker() {
    const kotak = $('#labCari'), wadah = $('#labHasil');
    if (!kotak || !wadah) return;
    const q = kotak.value.trim().toLowerCase();
    if (q.length < 2) return wadah.classList.add('sembunyi');
    /* Penyaring AND lintas kata, sama seperti pemilih produk di form Pembelian:
       "og a11" harus menyisakan yang memuat KEDUANYA. */
    const kata = q.split(/\s+/).filter(Boolean);
    const hasil = (await katalogStiker()).filter(p => {
      const t = String(p._cari || (p.nama + ' ' + p.sku)).toLowerCase();
      return kata.every(w => t.indexOf(w) >= 0);
    }).slice(0, 12);
    wadah.innerHTML = hasil.length
      ? hasil.map(p => `<div class="baris-prd" data-stiker-tambah="${esc(p.sku)}">
          <div class="prd-judul">${esc(p.nama)}</div>
          <div class="prd-ekor">${esc(p.sku)}${p.tipe_hp ? ' · ' + esc(p.tipe_hp) : ''}</div>
        </div>`).join('')
      : '<div class="prd-kosong">Tidak ada produk cocok</div>';
    wadah.classList.remove('sembunyi');
  }

  /** Nomor kolom yang dicentang, 1-basis dan urut. */
  const slotLabelTerpilih = () =>
    $$('.labSlot').filter(c => c.checked).map(c => Number(c.dataset.slot));

  /** Isi keranjang siap cetak: nama ikut hanya kalau centangnya menyala. */
  function isiCetakDari(k) {
    const pakaiNama = $('#labNama') && $('#labNama').checked;
    return k.map(x => ({ kode: x.kode, nama: pakaiNama ? x.nama : '',
                         lembar: Math.max(1, Number(x.lembar) || 1) }));
  }

  async function gambarKeranjangLabel() {
    const d = $('#modalUmum') && $('#modalUmum')._label;
    if (!d) return;
    const k = await muatKeranjangLabel();
    const u = d.ukuran;

    /* Setiap baris diperiksa SENDIRI-SENDIRI: satu SKU panjang di tengah
       keranjang tidak boleh diam-diam tercetak terpotong, dan barcode terpotong
       terbaca sebagai barang lain. */
    const tidakMuat = [];
    $('#labIsi').innerHTML = k.length ? k.map(x => {
      const c = Label.muat(x.kode, u);
      if (!c.muat) tidakMuat.push(x);
      return `<div class="baris-anak labBaris" data-sku="${esc(x.sku)}">
        <div style="flex:2;min-width:0">
          <strong>${esc(x.nama)}</strong>
          <div class="meta-kecil"><code>${esc(x.kode)}</code>${c.muat ? '' :
            ` <span style="color:var(--bahaya)">tidak muat — butuh ${c.lebar.toFixed(1)}mm dari ${
              c.tersedia.toFixed(0)}mm</span>`}</div>
        </div>
        <input type="number" class="labQty" data-sku="${esc(x.sku)}" value="${
          Number(x.lembar) || 1}" min="1" max="999" step="1" style="max-width:90px">
        <button class="tombol kecil bahaya" data-stiker-buang="${esc(x.sku)}">Buang</button>
      </div>`;
    }).join('') : '<p class="petunjuk" style="margin:0">Keranjang masih kosong — cari produk di atas, atau tekan tombol Label di baris produk.</p>';

    $$('.labQty').forEach(i => i.addEventListener('change', ubahJumlahStiker));
    perbaruiLencanaStiker(k);

    const btn = $('#btnCetakLabel');
    const pesan = $('#pesanLabel');
    if (tidakMuat.length) {
      pesan.innerHTML = `<div class="pesan galat">${tidakMuat.length} kode terlalu panjang untuk
        stiker ${u.lebar_mm} × ${u.tinggi_mm} mm. Buang barisnya, atau pakai stiker lebih lebar.</div>`;
    } else { pesan.innerHTML = ''; }
    /* Tombol Cetak DISEMBUNYIKAN, bukan sekadar dinonaktifkan — dialog yang
       menawarkan Cetak untuk kode yang tidak muat adalah dialog yang mengajak
       membuang stiker. */
    if (btn) btn.hidden = !k.length || tidakMuat.length > 0;

    /* SELURUH BARIS digambar, sampai ke bawah — diminta pemilik 6 Sep 2026:
       "harusnya pratinjaunya tampak sampai ke bawah sesuai isi keranjang".

       Sempat dibatasi satu baris pada percobaan sebelumnya, dan itu salah
       membaca keluhannya. Yang ia lihat waktu itu adalah dua baris kertas
       tergambar BERDAMPINGAN gara-gara `.baris-pratinjau { inline-flex }` —
       yang terbaca seperti satu baris berisi enam stiker. Cacatnya di CSS, bukan
       pada jumlah baris yang digambar. Membatasi jadi satu baris menyembunyikan
       cacatnya sekaligus membuang yang memang ingin ia lihat: keranjang 14
       stiker harus terlihat 14 stiker.

       Jumlah barisnya tetap disebut dengan ANGKA, dihitung `jumlahBarisCetak`
       memakai pembagi yang sama dengan yang mencetak — bukan dibagi tiga di
       sini, yang akan benar selama ketiga kolomnya menyala lalu berbohong
       begitu satu kolom dimatikan. */
    const el = $('#labPratinjau');
    const ket = $('#labKetPratinjau');
    try {
      const opsi = Object.assign({}, u, { slot: slotLabelTerpilih() });
      el.innerHTML = k.length ? Label.pratinjauSemua(isiCetakDari(k), opsi) : '';
      if (ket) {
        const nBaris = k.length ? Label.jumlahBarisCetak(isiCetakDari(k), opsi) : 0;
        const nStiker = k.reduce((a, x) => a + (Number(x.lembar) || 1), 0);
        ket.textContent = k.length
          ? `${nBaris} baris kertas · ${nStiker} stiker.`
          : '';
      }
    } catch (e) {
      el.innerHTML = `<p style="color:var(--bahaya);font-size:var(--fs-12);margin:0">${esc(e.message)}</p>`;
      if (ket) ket.textContent = '';
    }
  }

  async function ubahJumlahStiker(e) {
    const sku = e.target.dataset.sku;
    const n = Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1)));
    const k = await muatKeranjangLabel();
    const b = k.find(x => x.sku === sku);
    if (!b) return;
    b.lembar = n;
    await simpanKeranjangLabel(k);
    await gambarKeranjangLabel();
  }

  async function buangStiker(sku) {
    await simpanKeranjangLabel((await muatKeranjangLabel()).filter(x => x.sku !== sku));
    await gambarKeranjangLabel();
  }

  async function kosongkanKeranjangLabel() {
    await simpanKeranjangLabel([]);
    await gambarKeranjangLabel();
  }

  async function kirimLabel() {
    const d = $('#modalUmum') && $('#modalUmum')._label;
    if (!d) return;
    const k = await muatKeranjangLabel();
    if (!k.length) return toast('Keranjang stiker masih kosong.', 'galat');
    const slot = slotLabelTerpilih();
    const jumlah = k.reduce((a, x) => a + (Number(x.lembar) || 1), 0);
    try {
      await Label.cetak(isiCetakDari(k), { slot });
      /* Dikosongkan SESUDAH cetak berhasil, bukan sebelum. Kalau jendela
         cetaknya gagal dibuka (pemblokir popup), keranjangnya harus masih utuh
         — mengumpulkan ulang sepuluh SKU karena satu popup terblokir adalah
         hukuman untuk kesalahan yang bukan milik orangnya. */
      await kosongkanKeranjangLabel();
      tutupModal();
      toast(`${jumlah} stiker dikirim ke dialog cetak` +
            (slot.length < 3 ? ` (kolom ${slot.join(' & ')}).` : '.'), 'sukses');
    } catch (e) { toast('Gagal mencetak: ' + e.message, 'galat'); }
  }

  /**
   * Formulir "Ubah produk" menarik produknya SENDIRI, segar — v1.149.0.
   *
   * Sampai v1.148.0 ia mengisi kolomnya dari `cacheProduk`, potret yang diambil
   * saat layar Produk dibuka. Itu bisa berjam-jam sebelumnya, dan akibatnya
   * persis yang diceritakan `_konflikProduk` di 11_Admin.gs: A membetulkan
   * ejaan pukul 09:10 dari salinan pukul 09:00, dan tier grosir yang B tambahkan
   * pukul 09:05 hilang tanpa jejak.
   *
   * Sejak daftar berhenti mengangkut satuan/tier/varian, penarikan ini bukan
   * lagi ongkos tambahan — ia memindahkan ongkos yang sama dari 3.500 produk
   * ke satu produk yang benar-benar dibuka.
   *
   * Penjaga konflik di server TETAP ADA: dua orang masih bisa membuka formulir
   * yang sama pada menit yang sama. Yang berubah panjang jendelanya.
   */
  async function editorProduk(sku) {
    let p = null;
    if (sku) {
      try {
        p = await API.produkSatu({ sku });
      } catch (e) {
        /* GAGAL BERARTI TIDAK DIBUKA. Tidak ada cadangan ke `cacheProduk`.
           Sejak v1.149.0 daftar tidak lagi mengangkut satuan/tier/varian, dan
           `apiSimpanProdukLengkap` MENGHAPUS-LALU-MENULIS-ULANG ketiganya dari
           apa yang dikirim formulir. Formulir yang diisi dari salinan daftar
           karena itu akan menghapus seluruh satuan, tier dan varian produk itu
           begitu Simpan ditekan — diam-diam, tanpa satu pun galat.
           Formulir yang tidak jadi terbuka menghalangi pekerjaan selama
           beberapa detik; formulir yang terbuka dengan larik kosong menghapus
           data yang tidak bisa dikembalikan. */
        return toast('Gagal menarik data produk — ' + e.message +
                     ' Coba lagi — formulir tidak dibuka supaya satuan, tier ' +
                     'dan varian produk ini tidak terhapus saat disimpan.', 'galat');
      }
    }
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

        <label class="cek" style="margin-top:14px"><input type="checkbox" id="pButuhPasang"
          ${p?.butuh_pasang ? 'checked' : ''}> Barang ini <strong>dipasang</strong>, bukan sekadar diserahkan</label>
        <p class="petunjuk">Dicentang untuk tempered glass dan sejenisnya. Akibatnya satu:
          begitu barang ini masuk keranjang, layar bayar menanyakan <strong>siapa yang
          memasang</strong> — dan hanya menawarkan petugas yang memang bisa memasang.
          Tetap tidak wajib diisi: kalau penjualnya memasang sendiri, biarkan kosong dan
          seluruh poin baris itu jadi miliknya.<br>
          Untuk menandai banyak sekaligus, pakai tombol <strong>Tandai butuh pemasangan</strong>
          di layar Produk — mencentang 155 tempered glass satu per satu tidak akan pernah selesai.</p>

        <p class="petunjuk"><strong>Poin per satuan dasar.</strong> Nilai yang diisi di
          sini dikalikan qty dasar pada nota — 12 pcs dengan 3 poin menghasilkan 36 poin
          untuk baris itu.<br>
          <strong>0 berarti penjualan produk ini tidak berpoin</strong> — omzetnya tetap
          tercatat atas nama petugasnya, hanya poinnya nol.<br>
          Poin dibagi ke petugas menurut bobot peran, yang diatur di menu
          <strong>Petugas</strong>. Kasir tidak dapat mengubah angkanya.</p>
      </div>

      <!-- Cap waktu salinan YANG SEDANG DISUNTING, dikirim balik saat menyimpan.
           Server menolak kalau capnya sudah berbeda — tanpa itu dua orang di
           layar ini saling menimpa tanpa satu pun galat. Lihat _konflikProduk()
           di 11_Admin.gs. -->
      <input type="hidden" id="pDiubah" value="${esc(p?.diubah || '')}">
      <div id="pesanProduk"></div>`,
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

  /* ==================== PEMILIH PRODUK ====================
   *
   * Dilaporkan dari lapangan 29 Agu 2026, dengan tangkapan layar: di form
   * Pembelian, mengetik "multi" memunculkan dua puluh baris yang SELURUHNYA
   * berbunyi "TG OG Multi_Device" — hanya SKU-nya yang berbeda. Memilih yang
   * benar cuma bisa dilakukan dengan menghafal SKU.
   *
   * Sebabnya bukan penamaan produk. Satu tempered glass memang cocok untuk
   * sepuluh tipe HP dan sepuluh tipe itu tidak muat di nama; 98 dari 382 SKU
   * berbagi salah satu dari empat nama generik. Sebabnya adalah pemilihnya:
   * `<datalist>` bawaan peramban hanya bisa menampilkan value + satu label, dan
   * hanya bisa mencocokkan satu potongan berurutan. Padahal `apiDaftarProduk`
   * SUDAH mengirim tipe_hp, kompatibel, kata_kunci, stok, dan harga beli
   * terakhir di jawaban yang sama — datanya sudah di tangan, tidak pernah
   * ditampilkan.
   *
   * Digambar sendiri supaya bisa: mencocokkan banyak kata sekaligus lintas
   * kolom (lihat `cariProduk` di pos.js), menampilkan tipe HP di bawah nama,
   * dan mengisi satuan serta harga beli begitu produknya dipilih.
   */

  /* Daftar yang sedang dipakai pemilih. Diisi tiap form sebelum barisnya
     digambar, karena sumbernya memang berbeda: pembelian & transfer memakai
     jawaban server (ada stok & harga beli), retur memakai salinan lokal. */
  let daftarPilihProduk = [];

  function barisPilihProduk(lebar) {
    /* SKU disimpan di kolom TERSEMBUNYI, terpisah dari kotak yang diketik.
       `kumpulkanAnak` membaca [data-f] apa adanya; kalau kotak pencariannya
       yang membawa data-f="sku", yang terkirim ke server adalah teks pencarian
       ("og a11") dan dokumennya ditolak dengan pesan yang tidak menyebut
       sebabnya. */
    return `<div class="pilih-produk" style="flex:${lebar || 2}">
        <input type="hidden" data-f="sku">
        <input type="text" class="cari-prd" autocomplete="off"
               placeholder="cari nama, tipe HP, atau SKU">
        <div class="hasil-prd sembunyi"></div>
      </div>`;
  }

  const _produkSku = (sku) => daftarPilihProduk.find(p => String(p.sku) === String(sku));

  /**
   * "SK01: 6 · SK02: 10" — asal dulu, tujuan sesudahnya.
   *
   * Fungsi MURNI atas `stokDuaCabang`: tidak menyentuh DOM, tidak membaca
   * IndexedDB, jadi urutan dan bentuknya bisa dibuktikan uji apa adanya.
   * Angka nol DITULIS, bukan dilewati — "SK01: 0" adalah jawaban yang paling
   * penting di layar ini, dan baris yang diam soal gudang kosong akan membuat
   * orang mengirim permintaan yang tidak mungkin dipenuhi.
   */
  function teksStokDuaCabang(sku) {
    const d = stokDuaCabang;
    if (!d) return '';
    const q = (cab) => Number((d.peta || {})[String(cab) + '|' + String(sku)] || 0);
    /* Asal dan tujuan yang SAMA disebut sekali. Bisa terjadi sesaat sementara
       orang masih menggeser kedua dropdownnya. */
    const cab = d.asal === d.tujuan ? [d.asal] : [d.asal, d.tujuan];
    return cab.filter(Boolean).map(c => esc(c) + ': ' + q(c)).join(' · ');
  }

  function gambarHasilProduk(kotak) {
    const wadah = kotak.parentElement.querySelector('.hasil-prd');
    if (!wadah) return;
    const hasil = cariProduk(daftarPilihProduk, kotak.value);
    wadah.innerHTML = hasil.length ? hasil.map((p, i) => {
      const tipe = String(p.tipe_hp || (p.kompatibel || []).map(k => k.tipe).join(' / ') || '');
      const ekor = [esc(p.sku),
        /* Stok DUA CABANG menggantikan "stok" tunggal saat layarnya memintanya:
           di layar Permintaan, angka tanpa nama cabang tidak bisa dibaca
           siapa pun — "stok 6" itu di gudang atau di cabang yang meminta? */
        stokDuaCabang ? teksStokDuaCabang(p.sku)
          : (p.stok === undefined || p.stok === null ? '' : 'stok ' + p.stok),
        p.harga_beli_terakhir ? 'beli ' + rp(p.harga_beli_terakhir) : ''
      ].filter(Boolean).join(' · ');
      return `<div class="baris-prd${i === 0 ? ' aktif' : ''}" data-sku="${esc(p.sku)}">
          <div class="prd-judul">${esc(p.nama)}${
            p.kategori ? ` <span class="prd-kat">${esc(p.kategori)}</span>` : ''}</div>
          ${tipe ? `<div class="prd-tipe">${esc(tipe)}</div>` : ''}
          <div class="prd-ekor">${ekor}</div>
        </div>`;
    }).join('') : '<div class="prd-kosong">Tidak ada produk yang cocok</div>';
    wadah.classList.remove('sembunyi');
    tempatkanHasil(kotak);
  }

  /**
   * Letakkan panel hasil tepat di bawah kotak pencariannya.
   *
   * Dihitung tangan karena panelnya `position: fixed` — dan itu disengaja:
   * elemen `absolute` TETAP dihitung sebagai isi yang bisa digulir oleh modal
   * yang membungkusnya, jadi membuka daftar produk menumbuhkan bilah gulir
   * naik-turun di layar Pembelian padahal tidak ada isi yang bertambah.
   * Dilaporkan dari lapangan 29 Agu 2026.
   *
   * Tingginya dibatasi ruang yang benar-benar tersisa, dan panelnya membalik ke
   * ATAS kotak kalau ruang di bawah lebih sempit — daftar yang menjulur keluar
   * layar sama saja dengan daftar yang isinya tidak bisa dibaca.
   */
  function tempatkanHasil(kotak) {
    const wadah = kotak.parentElement.querySelector('.hasil-prd');
    if (!wadah || wadah.classList.contains('sembunyi')) return;
    const r = kotak.getBoundingClientRect();
    const ruangBawah = window.innerHeight - r.bottom - 8;
    const ruangAtas = r.top - 8;
    const keAtas = ruangBawah < 150 && ruangAtas > ruangBawah;
    const ruang = Math.max(120, keAtas ? ruangAtas : ruangBawah);
    wadah.style.left = r.left + 'px';
    wadah.style.width = r.width + 'px';
    wadah.style.maxHeight = Math.min(290, ruang) + 'px';
    if (keAtas) {
      wadah.style.top = 'auto';
      wadah.style.bottom = (window.innerHeight - r.top + 3) + 'px';
    } else {
      wadah.style.top = (r.bottom + 3) + 'px';
      wadah.style.bottom = 'auto';
    }
  }

  const tutupHasilProduk = (kecuali) => $$('.hasil-prd').forEach(w => {
    if (w !== kecuali) w.classList.add('sembunyi');
  });

  /* Panel yang melayang tidak ikut bergerak sendiri saat modalnya digulir —
     itu ongkos dari `fixed`. Letaknya dihitung ulang, bukan panelnya ditutup:
     menutup daftar hanya karena layar bergeser sedikit membuat orang harus
     mengetik ulang kuerinya. */
  const ikutiGulir = () => {
    const w = $('.hasil-prd:not(.sembunyi)');
    if (w) tempatkanHasil(w.parentElement.querySelector('.cari-prd'));
  };

  /**
   * Isi kolom lain begitu produknya dipilih.
   *
   * Harga beli sebelumnya diketik ulang di setiap baris pembelian. Angka yang
   * diketik ulang adalah angka yang bisa salah ketik, dan salah ketik harga
   * beli merusak HPP — lalu seluruh laba yang dihitung darinya, tanpa satu pun
   * galat yang muncul.
   *
   * Angka yang DIISI SENDIRI ditandai `data-auto`; angka yang diketik orang
   * tidak. Menukar produk menimpa yang bertanda itu saja — mengganti produk
   * tanpa mengganti harganya berarti membeli barang B dengan harga barang A.
   */
  /**
   * Harga produk, dari BENTUK DATA MANA PUN.
   *
   * Ada dua bentuk produk yang beredar di back office, dan keduanya sah:
   *
   *   jawaban API  : { harga_eceran, harga_grosir, harga_beli_terakhir }
   *   salinan lokal: { harga: { eceran, grosir }, harga_beli }
   *
   * Layar Pembelian & Transfer memakai yang pertama (`API.daftarProduk()`);
   * layar Retur & Retur Beli memakai yang kedua (`DB.all('produk')`), karena
   * retur dibuka dari nota yang sudah ada dan tidak boleh menunggu jaringan.
   *
   * Sampai v1.53 pengisi otomatis hanya mengenal bentuk pertama. Di layar Retur
   * ia membaca `undefined` lalu keluar diam-diam — kolom harga barang pengganti
   * tetap KOSONG, padahal di layar Pembelian kolom yang sama terisi sendiri,
   * jadi tidak ada yang menyangka harus mengetiknya. Retur diproses, barang
   * pengganti bernilai Rp 0, barang keluar gratis. Tidak ada galat di mana pun:
   * kedua nama kolom itu sama-sama "ada", yang salah cuma yang dicari.
   */
  function hargaProduk(p, jenis) {
    const o = p || {};
    if (jenis === 'beli') return Number(o.harga_beli_terakhir ?? o.harga_beli) || 0;
    return Number(o.harga_eceran ?? o.harga?.eceran) || 0;
  }

  function isiOtomatisBaris(baris, p) {
    const jenis = baris.dataset.anak;
    const isi = (f, v) => {
      const el = baris.querySelector(`[data-f="${f}"]`);
      if (el) { el.value = v; el.dataset.auto = '1'; }
    };
    const isiUang = (f, v) => {
      const el = baris.querySelector(`[data-f="${f}"]`);
      if (!el || !(Number(v) > 0)) return;
      if (String(el.value).trim() !== '' && !el.dataset.auto) return;  // angka ketikan orang
      el.value = ribuan(v); el.dataset.auto = '1';
    };
    /* Satuan & faktor sudah tidak punya kolom di formulir pembelian sejak
       6 Sep 2026 — keduanya dikunci 'pcs' dan 1 di simpanPembelian(). Penjaga
       querySelector di bawah tetap ada karena formulir LAIN (retur beli) masih
       membawa keduanya sebagai input tersembunyi, dan mengisi kolom yang tidak
       ada adalah galat yang menghentikan seluruh pemilihan produk. */
    if (baris.querySelector('[data-f="satuan"]')) isi('satuan', p.satuan_dasar || 'pcs');
    if (baris.querySelector('[data-f="faktor"]')) isi('faktor', 1);
    isiUang('harga_beli', hargaProduk(p, 'beli'));
    // Retur jual & barang pengganti bergerak pada harga JUAL, pembelian pada harga beli.
    isiUang('harga_satuan', hargaProduk(p, jenis === 'beli' ? 'beli' : 'jual'));
  }

  function pilihProduk(baris, sku) {
    const p = _produkSku(sku);
    if (!p) return;
    baris.querySelector('input[data-f="sku"]').value = p.sku;
    const kotak = baris.querySelector('.cari-prd');
    kotak.value = teksProduk(p);
    kotak.title = teksProduk(p);
    baris.querySelector('.hasil-prd')?.classList.add('sembunyi');
    isiOtomatisBaris(baris, p);
    hitungUlangSemua();
  }

  /* Satu pintu ke seluruh penghitung total: baris yang terisi otomatis harus
     ikut mengubah total, dan menebak layar mana yang sedang terbuka dari sini
     lebih rapuh daripada memanggil yang ada. */
  function hitungUlangSemua() {
    if ($('#beliTotal')) hitungTotalBeli();
    if ($('#rtSelisih')) hitungRetur();
    if ($('#rbTotal')) hitungReturBeli();
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
      // Berbeda dari butuh_tim: ini tidak mewajibkan apa pun, hanya membuat
      // layar bayar BERTANYA siapa pemasangnya.
      butuh_pasang: centang('pButuhPasang'),
      satuan: kumpulkanAnak('satuan'), tier: kumpulkanAnak('tier'),
      varian: kumpulkanAnak('varian'), kompatibel: kumpulkanAnak('kompatibel'),
      /* Cap waktu salinan yang dibuka layar ini. Server membandingkannya dengan
         yang tersimpan, dan menolak kalau sudah berbeda — lihat _konflikProduk()
         di 11_Admin.gs. Kosong untuk produk baru, dan itu memang benar. */
      diubah: nilai('pDiubah')
    };
    if (!body.sku || !body.nama) return toast('SKU dan nama wajib diisi.', 'galat');
    const kotakPesan = $('#pesanProduk');
    if (kotakPesan) kotakPesan.innerHTML = '';
    try {
      /* Tiga langkah, satu tugas. Tanpa pembungkus ini penghitung sibuk turun ke
         nol dua kali di tengah jalan, dan tombol Simpan sempat terbuka kembali
         sebelum katalognya selesai ditarik ulang. */
      await API.tugas(async () => {
        await API.simpanProdukLengkap(body);
        await Sync.tarikMaster(true);
        await sukses('Produk tersimpan.', 'produk');
      });
    } catch (e) {
      /* Ditampilkan MENETAP di dalam modalnya, bukan lewat toast yang hilang
         sendiri. Pesan bentroknya panjang, ia menyuruh melakukan sesuatu, dan
         suntingan yang sudah diketik masih utuh di layar — orang harus sempat
         membacanya sampai habis, lalu memutuskan. Toast hanya dipakai kalau
         kotaknya tidak ada, mis. saat modalnya sudah tertutup. */
      if (kotakPesan) kotakPesan.innerHTML = `<div class="pesan galat">${esc(e.message)}</div>`;
      else toast(e.message, 'galat');
    }
  }

  /* ==================== IMPOR PRODUK ==================== */

  /**
   * Angka dari berkas impor. Aturannya HARUS sama persis dengan `_angka()` di
   * 17_Ekspor.gs, karena berkas yang sama dibaca dua kali: di sini untuk
   * pratinjau, di server untuk menyimpan. Kalau dua aturan itu berbeda, yang
   * dilihat pemakainya bukan yang tersimpan. Ada uji di §BI yang menjalankan
   * KEDUANYA atas daftar kasus yang sama; jangan mengubah yang satu saja.
   *
   * Pemisah TERAKHIR yang menentukan, dan penentunya jumlah angka sesudahnya:
   * tepat tiga berarti pemisah ribuan, selain itu desimal. Jadi "25.000" dan
   * "25,000" sama-sama 25000, sementara "2,5" dan "2.5" sama-sama 2,5.
   *
   * Sampai v1.54 koma dibuang begitu saja — "2,5" terbaca 25. Poin satuan
   * memang boleh pecahan (step="0.5" di layar produk), dan poin adalah dasar
   * bagi hasil ke orang: salahnya sepuluh kali lipat, tanpa satu pun tanda.
   */
  const angkaImpor = (v) => {
  if (v === null || v === undefined || v === '') return 0;
      let t = String(v).replace(/[^\d\-.,]/g, '');
    if (!t || !/\d/.test(t)) return 0;
      let minus = t.charAt(0) === '-';
    t = t.replace(/-/g, '');

    /* Pemisah TERAKHIR yang menentukan, dan yang menentukannya adalah JUMLAH
       ANGKA sesudahnya:
         tepat 3 angka  -> pemisah ribuan   ("25.000", "1.250.000", "25,000")
         selain itu     -> pemisah desimal  ("2,5", "2.5", "1.000,50")
       Aturan ini menerima gaya Indonesia (koma desimal) DAN gaya lama berkas ini
       (titik desimal), tanpa harus menebak dari mana berkasnya berasal. */
      let akhir = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
      let n;
    if (akhir === -1) {
      n = Number(t);
    } else if (t.length - akhir - 1 === 3) {
      n = Number(t.replace(/[.,]/g, ''));
    } else {
      n = Number(t.substring(0, akhir).replace(/[.,]/g, '') + '.' + t.substring(akhir + 1));
    }
    if (isNaN(n)) return 0;
    return minus ? -n : n;
  };

  const KOLOM_IMPOR = {
    produk: 'sku, barcode, nama, kategori, merek, tipe_hp, satuan_dasar, harga_beli_terakhir, ' +
            'harga_eceran, harga_grosir, stok_min, poin_satuan — wajib: sku, nama, harga_eceran',
    pelanggan: 'nama, telepon, alamat, level_harga, limit_kredit, termin_hari — wajib: nama',
    supplier: 'nama, kontak, telepon, alamat, termin_hari — wajib: nama',
    stok_awal: 'sku, qty, hpp — semuanya wajib'
  };

  /**
   * Tandai butuh pemasangan untuk seluruh kategori sekaligus.
   *
   * Per kategori, bukan per produk, karena begitulah bentuk kenyataannya:
   * seluruh isi "TG 9H", "TG OG", "TG Privacy" dipasang, seluruh isi "Case B"
   * tidak. Mencentang 155 tempered glass satu per satu adalah pekerjaan yang
   * tidak akan pernah selesai — dan kolom yang tidak pernah terisi sama saja
   * dengan fitur yang tidak pernah ada.
   */
  function dialogTandaiPasang() {
    const kategori = urutkanOleh([...new Set(cacheProduk.map(p => p.kategori).filter(Boolean))],
                                 k => k);
    if (!kategori.length) return toast('Belum ada kategori produk.', 'galat');
    /* Berapa yang SUDAH bertanda ditampilkan per kategori. Tanpa angka itu,
       dialognya menyuruh memilih tanpa memberi tahu keadaan sekarang — dan
       menandai ulang yang sudah bertanda terasa seperti tidak terjadi apa-apa. */
    const sudah = {};
    cacheProduk.forEach(p => {
      const k = p.kategori || '';
      sudah[k] = sudah[k] || { total: 0, tanda: 0 };
      sudah[k].total++;
      if (p.butuh_pasang) sudah[k].tanda++;
    });
    bukaModal('Tandai butuh pemasangan', `
      <p class="petunjuk">Pilih kategori yang barangnya <strong>dipasang</strong> — tempered
        glass dan sejenisnya. Layar bayar akan menanyakan siapa pemasangnya setiap kali
        barang dari kategori ini masuk keranjang.</p>
      <div class="matriks" style="max-height:320px">
        ${kategori.map(k => `<label class="cek" style="padding:6px 10px">
          <input type="checkbox" class="katPasang" value="${esc(k)}"
            ${sudah[k] && sudah[k].tanda === sudah[k].total ? 'checked' : ''}>
          ${esc(k)} <span class="petunjuk">· ${sudah[k].tanda} dari ${sudah[k].total} sudah bertanda</span>
        </label>`).join('')}
      </div>
      <div class="grup" style="margin-top:12px">
        <label>Tindakan</label>
        <select id="tandaiNilai">
          <option value="1">Tandai butuh pemasangan</option>
          <option value="0">Lepas tandanya</option>
        </select>
      </div>
      <div id="pesanTandai"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnJalankanTandai">Terapkan</button>`);
  }

  async function jalankanTandaiPasang() {
    const kategori = $$('.katPasang:checked').map(c => c.value);
    if (!kategori.length) {
      return pesan('#pesanTandai', 'Pilih dulu minimal satu kategori.', 'galat');
    }
    const nilaiBaru = nilai('tandaiNilai') === '1';
    const btn = $('#btnJalankanTandai');
    btn.disabled = true;
    try {
      const r = await API.tandaiButuhPasang({ kategori, nilai: nilaiBaru });
      await Sync.tarikMaster(true);
      await sukses(`${r.diubah} produk diperbarui dari ${r.cocok} yang cocok.`, 'produk');
    } catch (e) {
      pesan('#pesanTandai', e.message, 'galat');
      btn.disabled = false;
    }
  }

  function dialogImpor(entitas = 'produk') {
    /* Dialog yang dibuka ulang mulai dari kosong. Tanpa ini, berkas yang dibaca
       pada pembukaan SEBELUMNYA masih tersimpan, dan mencentang "lewati SKU
       yang sudah terdaftar" akan menggambar pratinjau berkas kemarin di dialog
       yang layarnya kosong. */
    barisBerkas = null; barisImpor = []; barisMentah = [];
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
      <label class="pilih" id="barisLewatiAda" style="display:flex;gap:8px;align-items:flex-start;margin:12px 0${
        entitas === 'produk' ? '' : ';display:none'}">
        <input type="checkbox" id="imporLewatiAda" style="margin-top:3px">
        <span>Lewati SKU yang sudah terdaftar<br>
          <small class="petunjuk">Untuk berkas katalog PENUH dari pemasok: yang sudah ada dibiarkan
          apa adanya, yang baru saja yang ditambahkan. Tanpa centang ini, satu SKU yang sudah ada
          membatalkan seluruh berkas.</small></span>
      </label>
      <button class="tombol" id="btnPratinjauImpor">Pratinjau</button>
      <p class="petunjuk">Impor bersifat semua-atau-tidak sama sekali: bila ada satu baris bermasalah,
        tidak ada satu pun yang tersimpan. Lebih baik Anda memperbaiki berkasnya daripada menemukan
        setengah data masuk dan setengah tidak. Centang di atas hanya melunakkan SATU hal — SKU yang
        sudah ada — dan tidak pernah menimpa data lama.</p>
      <div id="hasilPratinjau"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnJalankanImpor" disabled>Impor</button>`);
  }

  let barisImpor = [], barisMentah = [], barisBerkas = null;

  /**
   * SKU yang sudah ada menurut salinan lokal. PERKIRAAN, dan sengaja begitu:
   * `DB.all('produk')` hanya berisi produk AKTIF — itu yang diturunkan
   * `apiTarikMaster` — sedangkan yang memutuskan dilewati atau tidak adalah
   * server, yang membaca sheet MASTER/produk seutuhnya termasuk yang nonaktif.
   * Jadi angka di pratinjau boleh lebih kecil dari kenyataan; ia tidak boleh
   * lebih besar, dan tidak pernah dipakai untuk membuang baris dari kiriman.
   */
  async function skuTerdaftar() {
    try { return new Set((await DB.all('produk')).map(p => String(p.sku))); }
    catch (e) { return new Set(); }
  }

  async function pratinjauImpor(barisSiap) {
    const entitas = nilai('imporEntitas') || 'produk';
    if (barisSiap) barisBerkas = barisSiap;
    let baris, judul, pisah;

    /* Berkas yang sudah dibaca DIINGAT, supaya mencentang "lewati SKU yang
       sudah terdaftar" bisa menggambar ulang pratinjau tanpa memaksa
       pemakainya memilih berkasnya sekali lagi. Tempelan teks tetap menang
       bila ada isinya: itu yang baru saja diketik orangnya. */
    const teks = ($('#imporTeks')?.value || '').trim();
    if (!barisSiap && teks) barisBerkas = null;

    if (barisBerkas) {
      baris = barisBerkas.filter(r => r.some(c => String(c).trim() !== ''));
      judul = baris[0].map(h => String(h).trim().toLowerCase());
    } else {
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

    /* Hanya produk yang punya opsi ini — impor pelanggan, supplier dan stok
       awal tidak mengenal `lewati_ada` di server, jadi centangnya tidak boleh
       ikut mengubah pratinjaunya. */
    const lewatiAda = entitas === 'produk' && !!$('#imporLewatiAda')?.checked;
    const sudahAda = lewatiAda ? await skuTerdaftar() : null;

    const salah = [];
    const kunci = new Set();
    let dilewati = 0;
    barisImpor.forEach((r, i) => {
      const no = i + 1;
      /* Baris yang SKU-nya sudah terdaftar tidak diperiksa isinya sama sekali —
         ia tidak akan ditulis ke mana pun, jadi nama dan harganya tidak
         menentukan apa pun. Urutannya sengaja sama dengan server
         (`apiImporProduk`, 05_Master.gs): pratinjau yang memeriksa apa yang
         TIDAK diperiksa server akan memerahkan berkas yang sebenarnya lolos,
         dan pratinjau yang bohong lebih buruk daripada tidak ada pratinjau. */
      if (sudahAda && r.sku && sudahAda.has(String(r.sku))) { dilewati++; return; }
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
        : lewatiAda
          ? `<div class="pesan sukses">${barisImpor.length - dilewati} baris baru siap diimpor.
             <br><small>${dilewati} baris SKU-nya sudah ada dan akan dilewati. Angka ini perkiraan
             dari salinan katalog di perangkat ini — produk yang dinonaktifkan tidak terhitung di
             sini dan baru dilewati oleh server.</small></div>`
          : `<div class="pesan sukses">${barisImpor.length} baris siap diimpor.</div>`}
      <div style="max-height:220px;overflow:auto">
        ${tabel(judul.slice(0, 6).map(h => ({ judul: h, kunci: h })), barisImpor.slice(0, 30))}
      </div>`;
    /* Tidak ada baris baru sama sekali = tidak ada yang bisa dikerjakan tombol
       Impor. Aman dimatikan dari sini: daftar lokal hanya berisi SEBAGIAN SKU
       yang sudah ada, jadi hitungan "baru" di layar selalu lebih besar atau
       sama dengan yang akan ditemukan server — kalau layar bilang nol, server
       pun nol. */
    $('#btnJalankanImpor').disabled = salah.length > 0 || barisImpor.length - dilewati === 0;
  }

  async function jalankanImpor() {
    $('#btnJalankanImpor').disabled = true;
    const entitas = nilai('imporEntitas') || 'produk';
    const lewatiAda = entitas === 'produk' && !!$('#imporLewatiAda')?.checked;
    try {
      const d = await API.imporMaster({ entitas, baris: barisMentah, cabang: APP_STATE.cabang,
                                        lewati_ada: lewatiAda });
      /* Tarik ulang HANYA bila memang ada yang berubah. Impor yang seluruh
         barisnya dilewati tidak mengubah katalog apa pun, dan `tarikMaster(true)`
         memaksa unduhan penuh — ongkos yang ditagihkan ke perangkat ini tanpa
         satu pun perubahan untuk dijemput. */
      if (d.diimpor > 0) await Sync.tarikMaster(true);
      if (entitas === 'stok_awal') await Sync.tarikStok();
      await sukses(d.dilewati
        ? `${d.diimpor} baris baru diimpor, ${d.dilewati} dilewati karena SKU-nya sudah terdaftar.`
        : `${d.diimpor} baris diimpor.`, entitas === 'produk' ? 'produk' : 'mitra');
    } catch (e) {
      $('#hasilPratinjau').innerHTML = `<div class="pesan galat">${esc(e.message)}
        ${e.detail ? `<ul style="margin:8px 0 0 16px">${e.detail.slice(0, 15).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
      $('#btnJalankanImpor').disabled = false;
    }
  }

  /* ==================== STOK ==================== */

  /** Layar Stok sedang menampilkan seluruh cabang berjajar, bukan cabang ini. */
  let stokLintas = false;

  /** Boleh melihat perbandingan antar cabang? Servernya tetap memeriksa sendiri. */
  const bolehStokLintas = () =>
    !!APP_STATE.flag?.akses_lintas_cabang && APP_STATE.daftarCabangSemua.length > 1;

  /**
   * Susun baris perbandingan stok antar cabang. FUNGSI MURNI.
   *
   * Tidak menyentuh DOM maupun IndexedDB — masuk daftar stok mentah dan daftar
   * produk, keluar baris siap gambar. Itu yang membuat aturannya bisa dibuktikan
   * uji apa adanya: SKU yang tidak punya baris stok di sebuah cabang bernilai
   * NOL di sana, bukan hilang dari tabelnya.
   *
   * Diurut menurut TOTAL menurun. Layar stok satu cabang mengurut menaik supaya
   * yang menipis muncul di atas; di sini yang dicari justru "apa yang menumpuk,
   * dan menumpuk di mana" — dan ribuan baris nol di puncak tabel tidak menjawab
   * pertanyaan siapa pun. Kepala kolomnya tetap bisa diklik untuk mengurut ulang.
   */
  function barisStokLintas(stokMentah, produk, cabang) {
    const peta = {};
    (stokMentah || []).forEach(r => {
      const k = String(r.sku) + '|' + String(r.cabang);
      peta[k] = (peta[k] || 0) + Number(r.qty || 0);
    });
    return (produk || []).map(p => {
      const baris = { sku: String(p.sku), nama: String(p.nama || p.sku),
                      kategori: String(p.kategori || ''), total: 0 };
      cabang.forEach(c => {
        const q = Number(peta[baris.sku + '|' + c] || 0);
        baris['c_' + c] = q;
        baris.total += q;
      });
      return baris;
    }).sort((a, b) => b.total - a.total || urutNama(a.nama, b.nama));
  }

  /**
   * Tabel perbandingan: satu baris per SKU, satu kolom per cabang.
   *
   * Angka nol DIREDUPKAN, bukan dikosongkan. Sel kosong terbaca sebagai "datanya
   * tidak ada"; yang benar adalah "barangnya tidak ada di sana", dan itu justru
   * jawaban yang dicari orang saat membuka layar ini.
   */
  const tabelStokLintas = (rows, cabang) => tabel([
    { judul: 'SKU', kunci: 'sku' },
    { judul: 'Nama', kunci: 'nama' },
    ...cabang.map(c => ({
      judul: c, angka: true, kunci: 'c_' + c,
      render: r => r['c_' + c] > 0
        ? `<span${c === APP_STATE.cabang ? ' style="font-weight:600"' : ''}>${r['c_' + c]}</span>`
        : '<span style="color:var(--teks-redup)">0</span>'
    })),
    { judul: 'TOTAL', angka: true, kunci: 'total',
      render: r => `<strong>${r.total}</strong>` }
  ], rows, { kosong: 'Belum ada satu pun produk di katalog' });

  /**
   * Layar Stok versi SELURUH CABANG.
   *
   * Angkanya dibaca dari store `stok_cabang` di perangkat — ringkasan yang sama
   * yang dipakai kasir mengintip stok cabang lain. Tabelnya terbuka SEKETIKA dan
   * tetap terbuka saat internet mati; ongkosnya angkanya sesegar tarikan
   * terakhir, dan umur itu DITULIS di atas tabel, tidak disembunyikan. Tombol
   * "Hitung ulang" menariknya lagi dari server.
   *
   * Katalognya pun dari `DB.all('produk')`, bukan API: satu panggilan jaringan
   * di layar yang menjanjikan "seketika" membatalkan janjinya.
   */
  async function muatStokSemuaCabang(katStok = '') {
    memuat('#isiStok');
    try {
      const [stokMentah, produk, waktu] = await Promise.all([
        DB.all('stok_cabang'), DB.all('produk'),
        DB.kvGet('stok_cabang_diperbarui', '')
      ]);
      const cabang = APP_STATE.daftarCabangSemua.slice().sort(urutNama);
      const rows = barisStokLintas(stokMentah, produk, cabang);
      const tampil = katStok ? rows.filter(r => r.kategori === katStok) : rows;
      const kategoriAda = [...new Set(produk.map(p => (p.kategori || '').trim()).filter(Boolean))].sort();

      $('#isiStok').innerHTML = `
        <div class="petak petak-4">
          ${cabang.map(c => `<div class="kartu statistik"><div class="label">Stok ${esc(c)}</div>
            <div class="nilai">${rows.reduce((a, r) => a + r['c_' + c], 0)}</div></div>`).join('')}
          <div class="kartu statistik"><div class="label">Seluruh cabang</div>
            <div class="nilai">${rows.reduce((a, r) => a + r.total, 0)}</div></div>
        </div>
        <div class="kartu">
          <div class="bar-alat">
            <input type="text" id="cariStok" placeholder="Cari SKU / nama…" style="max-width:320px">
            <select id="stokKategori" style="max-width:200px">${opsiKategori(kategoriAda, katStok)}</select>
            <select id="stokLingkup" style="max-width:170px">
              <option value="sini">Cabang ${esc(APP_STATE.cabang)}</option>
              <option value="semua" selected>Semua cabang</option>
            </select>
            <div style="flex:1"></div>
            <button class="tombol" id="btnSegarkanStokLintas">Hitung ulang</button>
          </div>
          <p class="petunjuk" style="margin:0 0 10px">
            Angka ini <strong>ringkasan tersimpan di perangkat ini</strong>, diperbarui
            ${waktu ? esc(waktuTampil(waktu)) : 'belum pernah'}. Cukup untuk membandingkan
            dan memutuskan kirim-mengirim; sebelum menjanjikan barang ke pelanggan,
            tekan Hitung ulang.
          </p>
          <div id="tabelStok">${tabelStokLintas(tampil, cabang)}</div>
        </div>`;
      $('#isiStok')._rows = rows;
      $('#isiStok')._cabang = cabang;
    } catch (e) { galat('#isiStok', e); }
  }

  async function muatStok(katStok = '') {
    if (stokLintas && bolehStokLintas()) return muatStokSemuaCabang(katStok);
    memuat('#isiStok');
    try {
      /**
       * SATU panggilan, bukan dua — dan itu perbaikan yang diukur, bukan ditebak.
       *
       * Sampai v1.119.0 layar ini memanggil `stok_terkini` untuk angkanya lalu
       * `daftar_produk` semata-mata untuk NAMA. Diukur 7 Sep 2026 di data
       * produksi:
       *
       *     stok_terkini   1.052 md ·    85 KB
       *     daftar_produk  3.511 md · 1.538 KB   <- hanya untuk namanya
       *
       * Satu setengah megabita tiap kali layar dibuka, ditambah satu perjalanan
       * bolak-balik (~2 detik), dan `apiDaftarProduk` menghitung `petaStok` lagi
       * di ujungnya — peta yang sama, dua kali, untuk satu layar.
       *
       * Sekarang servernya yang menggabungkan (`dengan_produk: true`), dan
       * produk yang belum pernah bergerak ikut dari sana dengan penanda `diam`.
       *
       * AKUNTING punya `stok` tapi tidak punya `produk`. Penggabungannya di
       * server tidak melewati `wajibIzin(produk)` — ia bagian dari layar Stok,
       * dan izin `stok · lihat` yang menjaganya. Jadi peran itu tidak lagi
       * kehilangan nama produk seperti pada audit 5 Sep 2026.
       */
      const stok = await API.stokTerkini({ cabang: APP_STATE.cabang, dengan_produk: true });
      const bergerak = stok.stok.filter(s => !s.diam);

      /**
       * Produk yang BELUM PERNAH bergerak ikut ditampilkan, stok 0.
       *
       * `apiStokTerkini` mengembalikan isi `petaStok`, dan peta itu dibangun dari
       * snapshot + mutasi. Produk yang belum pernah dibeli, diopname, atau
       * ditransfer tidak punya satu pun mutasi — jadi ia tidak ada di peta, dan
       * layar Stok tidak pernah menyebutnya sama sekali. Master produknya ada,
       * layar Produk menampilkannya, layar Stok bilang tidak ada. Dilaporkan
       * pemilik 4 Sep 2026 (SKU CS01090043); di sheet produksi hari itu 362 SKU
       * punya baris stok sementara master produknya jauh lebih banyak.
       *
       * "Tidak ada mutasi" BUKAN "tidak ada barangnya" — artinya stoknya nol.
       * Dan justru nol itulah yang paling perlu terlihat: barang yang belum
       * pernah masuk gudang adalah barang yang tidak bisa dijual, dan ia harus
       * ikut terhitung di "Di bawah minimum".
       *
       * Hanya SKU: varian yang belum pernah bergerak tidak dikarang di sini —
       * yang tahu daftar varian adalah master produk, dan menebaknya berarti
       * menampilkan baris untuk kombinasi yang mungkin tidak pernah ada.
       */
      const diam = stok.stok.filter(s => s.diam);

      const rows = stok.stok.slice().sort((a, b) => a.qty - b.qty);

      const totalNilai = rows.reduce((a, r) => a + (r.nilai || 0), 0);
      /* Diperiksa pada baris yang BERGERAK, bukan `rows[0]`: sesudah pengurutan,
         baris teratas bisa saja produk diam yang memang tidak punya `nilai`, dan
         kolom Nilai lenyap dari layar peran yang berhak melihatnya. */
      const punyaNilai = bergerak[0]?.nilai !== undefined;
      /* Tabelnya HARUS ikut disaring. Dropdown yang menampilkan "Casing" di atas
         tabel berisi seluruh kategori lebih buruk daripada saringan yang tereset:
         yang satu jujur mengaku lupa, yang satu berbohong. */
      const tampil = katStok ? rows.filter(r => r.kategori === katStok) : rows;

      $('#isiStok').innerHTML = `
        ${/* `petak-4` — ambang kolomnya 160px, bukan 180px. Sejak kartu "Belum
              pernah bergerak" ikut digambar, jumlahnya jadi EMPAT, dan di lebar
              tablet petak biasa hanya memuat tiga: yang keempat turun sendirian
              dan melar setengah baris. Kotak tunggal selebar itu terbaca sebagai
              kotak yang gagal berpasangan. */''}
        <div class="petak petak-4">
          ${/* Tetap `bergerak.length`, BUKAN `rows.length`. Sejak produk yang
                belum pernah bergerak ikut ditampilkan, `rows` berisi seluruh
                katalog — dan angka di bawah judul "SKU bergerak" akan berhenti
                berarti apa pun. Yang belum bergerak dihitung terpisah. */''}
          <div class="kartu statistik"><div class="label">SKU bergerak</div><div class="nilai">${bergerak.length}</div></div>
          ${diam.length ? `<div class="kartu statistik"><div class="label">Belum pernah bergerak</div>
            <div class="nilai">${diam.length}</div></div>` : ''}
          ${punyaNilai ? `<div class="kartu statistik"><div class="label">Nilai persediaan</div><div class="nilai">${rp(totalNilai)}</div></div>` : ''}
          <div class="kartu statistik"><div class="label">Di bawah minimum</div>
            <div class="nilai">${rows.filter(r => r.qty <= r.stok_min).length}</div></div>
        </div>
        <div class="kartu">
          <div class="bar-alat">
            <input type="text" id="cariStok" placeholder="Cari SKU / nama…" style="max-width:320px">
            <select id="stokKategori" style="max-width:200px">${opsiKategori(stok.kategori_ada || [], katStok)}</select>
            ${bolehStokLintas() ? `<select id="stokLingkup" style="max-width:170px">
              <option value="sini" selected>Cabang ${esc(APP_STATE.cabang)}</option>
              <option value="semua">Semua cabang</option>
            </select>` : `<span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>`}
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
    { judul: 'Stok', angka: true, render: r => lencanaStok(r.qty, r.stok_min) },
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
          <h3 style="font-size:var(--fs-14)">Lapisan yang masih tersisa</h3>
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
            /* Nomornya digarisbawahi supaya barisnya terbaca BISA DIBUKA. Baris
               yang membuka sesuatu tapi tampak persis seperti baris mati tidak
               akan pernah diklik siapa pun — itu sama saja tidak ada. */
            { judul: 'No dokumen', kunci: 'no_dokumen',
              render: r => `<span class="tautan-baris">${esc(r.no_dokumen || '(tanpa nomor)')}</span>` },
            { judul: 'Supplier', kunci: 'nama_supplier' },
            { judul: 'Bayar', render: r => `<span class="lencana">${esc(r.tipe_bayar)}</span>` },
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            /* Status ditampilkan sejak v1.94: kolomnya sudah ada di sheet sejak awal
               tapi tidak pernah tergambar, jadi dokumen yang dibatalkan terlihat
               persis seperti yang masih berlaku. */
            { judul: 'Status', render: r => r.status === 'DIBATALKAN'
                ? '<span class="lencana merah">DIBATALKAN</span>'
                : '<span class="lencana hijau">AKTIF</span>' },
            { judul: '', render: r => r.status !== 'DIBATALKAN' && bolehIzin('pembelian', 'hapus')
                ? `<button class="tombol kecil bahaya" data-batal-pembelian="${esc(r.uuid)}">Batal</button>` : '' }
          ], rows, { kosong: 'Belum ada pembelian tercatat',
                     dataAttr: r => `data-rincian-beli="${esc(r.uuid)}" class="baris-klik"` })}
        </div>`;
    } catch (e) { galat('#isiPembelian', e); }
  }

  /**
   * Rincian satu dokumen pembelian.
   *
   * Diminta pemilik 6 Sep 2026: "saya tidak ada jalur akses rincian pembelian,
   * sehingga tidak tahu dibagian mana pembeliannya yang harus saya batalkan,
   * karena tanggal 5 banyak melakukan pembelian". Menu ini sejak awal cuma
   * memperlihatkan kepala dokumennya, sementara tombol Batal-nya sudah ada —
   * menyuruh orang membatalkan sesuatu yang isinya tidak pernah bisa ia lihat.
   *
   * Kolom yang paling penting di sini MODAL MASUK, dan ia bukan hiasan: satu
   * baris `8 pcs isi 8` memperlihatkan qty 8, harga 14.000 dan subtotal 112.000
   * yang semuanya tampak wajar — yang janggal hanya modal masuknya, Rp 1.750.
   * Tanpa kolom itu layar ini tidak akan pernah menjawab pertanyaan yang
   * membuatnya dibuat.
   *
   * Tombol Batal ikut dipasang di kaki modal supaya orang tidak perlu menutup,
   * mencari barisnya lagi, lalu menebak apakah itu memang yang tadi dilihat.
   */
  async function rincianPembelian(uuid) {
    bukaModal('Rincian pembelian', '<p class="petunjuk">Memuat…</p>');
    let d;
    try {
      d = await API.rincianPembelian({ uuid, cabang: APP_STATE.cabang });
    } catch (x) {
      return bukaModal('Rincian pembelian', `<div class="pesan galat">${esc(x.message)}</div>`);
    }
    const item = d.item || [];
    const janggal = item.filter(i => i.sebab_janggal);
    const bolehBatal = d.status !== 'DIBATALKAN' && bolehIzin('pembelian', 'hapus');

    bukaModal(`Pembelian ${d.no_dokumen || '(tanpa nomor)'}`, `
      <p class="petunjuk">${esc(tglTampil(d.tanggal))} · ${esc(d.nama_supplier || '—')} ·
        <span class="lencana">${esc(d.tipe_bayar)}</span>
        ${d.status === 'DIBATALKAN'
          ? '<span class="lencana merah">DIBATALKAN</span>'
          : '<span class="lencana hijau">AKTIF</span>'}
        ${d.jatuh_tempo ? `<br>Jatuh tempo ${esc(tglTampil(d.jatuh_tempo))}` : ''}
        ${d.catatan ? `<br>Catatan: ${esc(d.catatan)}` : ''}</p>
      ${janggal.length ? `<div class="pesan galat">${janggal.length} baris isinya janggal.
        Stok yang masuk berlipat dan modalnya ikut mengecil sebanyak itu juga.
        Dokumen ini perlu DIBATALKAN lalu diketik ulang.</div>` : ''}
      ${tabel([
        { judul: 'SKU', kunci: 'sku' },
        { judul: 'Nama', kunci: 'nama',
          render: i => esc(i.nama) + (i.sebab_janggal
            ? `<div class="meta-kecil" style="color:var(--bahaya)">${esc(i.sebab_janggal)}</div>` : '') },
        { judul: 'Qty', angka: true, kunci: 'qty' },
        { judul: 'Satuan', kunci: 'satuan' },
        { judul: 'Isi', angka: true, kunci: 'faktor',
          render: i => i.faktor === 1 ? '1' : `<span class="stok-kritis">${esc(String(i.faktor))}</span>` },
        { judul: 'Masuk stok', angka: true, kunci: 'qty_dasar',
          render: i => `${esc(String(i.qty_dasar))} ${esc(i.satuan_dasar)}` },
        { judul: 'Harga beli', angka: true, kunci: 'harga_satuan', render: i => rp(i.harga_satuan) },
        { judul: 'Subtotal', angka: true, kunci: 'subtotal', render: i => rp(i.subtotal) },
        { judul: 'Modal masuk', angka: true, kunci: 'modal_per_dasar',
          render: i => i.sebab_janggal
            ? `<span class="stok-kritis">${rp(i.modal_per_dasar)}</span>`
            : rp(i.modal_per_dasar) }
      ], item, { kosong: 'Dokumen ini tidak punya baris barang' })}
      <p class="petunjuk">Modal masuk = subtotal ÷ jumlah yang benar-benar masuk stok.
        Angka itulah yang muncul di kolom Modal pada layar Produk.</p>
      <div class="total-baris"><span>Subtotal</span><span>${rp(d.subtotal)}</span></div>
      ${d.diskon ? `<div class="total-baris"><span>Diskon dokumen</span><span>-${rp(d.diskon)}</span></div>` : ''}
      ${d.ppn ? `<div class="total-baris"><span>PPN</span><span>${rp(d.ppn)}</span></div>` : ''}
      <div class="total-baris besar"><span>TOTAL</span><span>${rp(d.total)}</span></div>`,
      `<button class="tombol" data-tutup="1">Tutup</button>
       ${bolehBatal
         ? `<button class="tombol bahaya" data-batal-pembelian="${esc(d.uuid)}">Batalkan pembelian</button>`
         : ''}`);
  }

  /**
   * uuid dokumen pembelian yang sedang diketik.
   *
   * DIBUAT SAAT FORM DIBUKA, bukan saat tombol Simpan ditekan — dan itu seluruh
   * perbaikan dari kejadian 5 Sep 2026. Dulu `crypto.randomUUID()` dipanggil di
   * dalam panggilan API, jadi setiap penekanan tombol melahirkan uuid BARU.
   * Akibatnya penjaga idempoten di `apiSimpanPembelian`
   * (`if (cari(cabang,'pembelian','uuid',p.uuid)) return duplikat`) tidak akan
   * pernah bisa menyala untuk percobaan ulang: kiriman kedua tampak seperti
   * dokumen yang benar-benar lain. Nota 101 baris masuk dua kali karena itu.
   *
   * Dengan uuid yang bertahan selama form terbuka, menekan Simpan berkali-kali
   * setelah gagal adalah tindakan yang AMAN — persis seperti outbox kasir, yang
   * memang mengulang dengan uuid yang sama dan tidak pernah dobel.
   */
  let uuidPembelian = null;

  /**
   * uuid untuk SETIAP jenis dokumen lain, dengan aturan yang sama persis.
   *
   * Audit 5 September 2026: perbaikan `uuidPembelian` di atas tidak pernah
   * disalin ke tujuh formulir lain — retur, bayar piutang, transfer,
   * permintaan, proses permintaan, retur beli, opname. Semuanya memanggil
   * `crypto.randomUUID()` DI DALAM penangan tombolnya, jadi penjaga duplikat di
   * server tidak akan pernah menyala untuk percobaan ulang. Untuk transfer
   * akibatnya paling parah: tidak ada penjaga isi sama sekali, sehingga stok
   * benar-benar keluar DUA KALI dari gudang.
   *
   * Aturannya satu kalimat: uuid lahir saat FORMULIRNYA dibuka, bukan saat
   * tombolnya ditekan. `lepasUuidDokumen()` di pembuka formulir memastikan
   * dokumen berikutnya mendapat uuid yang baru — tanpa itu, dokumen kedua akan
   * dijawab "duplikat" dan tidak pernah tersimpan.
   */
  const _uuidDok = {};
  function uuidDokumen(nama) {
    if (!_uuidDok[nama]) {
      _uuidDok[nama] = crypto.randomUUID
        ? crypto.randomUUID()
        : nama + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }
    return _uuidDok[nama];
  }
  function lepasUuidDokumen(nama) {
    delete _uuidDok[nama];
  }

  async function formPembelian() {
    /* `.catch` di TIAP janji, bukan satu untuk semuanya. Promise.all gagal
       seluruhnya begitu satu ditolak — dan KEPALA_CABANG punya
       `pembelian:['lihat','buat']` tanpa modul `supplier` sama sekali, jadi
       sampai audit 5 Sep 2026 ia tidak bisa mencatat SATU PUN pembelian:
       tombolnya ada, modalnya tidak pernah muncul. Pelajaran yang sama sudah
       tertulis di 00_Config.gs dan sudah diperbaiki sekali di muatMitra.
       Daftar kosong lebih baik daripada layar yang tidak bisa dibuka: nomor
       faktur dan barangnya tetap bisa dicatat, suppliernya menyusul. */
    const [sup, prod] = await Promise.all([
      /* Ditangkap DAN dikatakan. Menelan galatnya diam-diam sama buruknya
         dengan menjatuhkan layarnya: dropdown supplier yang kosong tanpa sebab
         terbaca sebagai data yang hilang. Pesan aslinya dari server ikut
         ditampilkan, supaya yang terbaca "Anda tidak berhak (supplier.lihat)",
         bukan "entah kenapa kosong". */
      API.daftarSupplier().catch(e => {
        toast('Daftar supplier tidak bisa dimuat — ' + (e.message || e) +
              '. Pembeliannya tetap bisa dicatat tanpa memilih supplier.', 'galat');
        return [];
      }),
      API.daftarProduk({ ramping: true })
    ]);
    uuidPembelian = crypto.randomUUID ? crypto.randomUUID() : 'B' + Date.now();
    bukaModal('Pembelian baru', `
      <div class="baris3">
        <div class="grup"><label>Tanggal</label><input type="date" id="beliTanggal" value="${tanggalLokal()}"></div>
        <div class="grup"><label>No dokumen / faktur</label><input type="text" id="beliNo"></div>
        <div class="grup"><label>Supplier</label><select id="beliSupplier">
          <option value="">—</option>
          ${urutkanOleh(sup.filter(s => s.aktif), s => s.nama).map(s => `<option value="${esc(s.kode)}">${esc(s.nama)}</option>`).join('')}
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

      <div class="baris2" style="margin-top:14px">
        <div class="grup"><label>Diskon dokumen</label><input type="text" inputmode="numeric" class="uang" id="beliDiskon" value="0"></div>
        <div class="grup"><label>PPN</label><input type="text" inputmode="numeric" class="uang" id="beliPpn" value="0"></div>
      </div>
      <div class="total-baris besar" style="font-size:var(--fs-21)"><span>TOTAL</span><span id="beliTotal">Rp 0</span></div>
      <div id="pesanBeli"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPembelian">Simpan pembelian</button>`);
    daftarPilihProduk = prod.produk;
    tambahBarisBeli();
  }

  function tambahBarisBeli() {
    $('#barisBeli').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="beli">
        ${barisPilihProduk(3)}
        <input type="number" data-f="qty" placeholder="qty" value="1">
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
      const r = await API.simpanPembelian({
        uuid: uuidPembelian,
        cabang: APP_STATE.cabang,
        tanggal: nilai('beliTanggal'), no_dokumen: nilai('beliNo'),
        kode_supplier: nilai('beliSupplier'), tipe_bayar: nilai('beliTipe'),
        jatuh_tempo: nilai('beliJatuhTempo'),
        diskon: angka('beliDiskon'), ppn: angka('beliPpn'),
        /* SATUAN DIKUNCI 'pcs' DAN ISINYA 1, mati, bukan dibaca dari layar.
           Diminta pemilik 6 Sep 2026: "hapus text field isi per satuan karena
           selain membingungkan petugas juga saya tidak menggunakan satuan selain
           pcs, tidak ada lusin kilo dan sebagainya. hanya fix 1pcs = 1pcs".
           Kolomnya sudah tidak ada di formulir; nilainya ditulis DI SINI supaya
           tidak ada satu jalan pun yang bisa mengirim angka lain — termasuk
           kalau suatu hari ada yang menambahkan kembali inputnya tanpa membaca
           permintaan ini.

           Yang dicegah bukan kebingungan saja. Satu angka salah di kolom sempit
           itu menggandakan stok sekaligus mengecilkan modal berkali lipat, tanpa
           satu galat pun — persis yang terjadi pada nota 5 Sep 2026 (lihat
           _galatSatuanPembelian di 06_Stock.gs). Kolom yang tidak ada tidak bisa
           salah diisi, dan roda tetikus tidak bisa menggeser apa yang tidak ada. */
        item: item.map(i => ({
          sku: i.sku, qty: Number(i.qty), satuan: 'pcs',
          faktor: 1, harga_satuan: Number(i.harga_satuan) || 0, diskon: 0
        }))
      });
      await Sync.tarikMaster(true);
      await Sync.tarikStok();
      await sukses(r?.duplikat
        ? 'Pembelian ini SUDAH tersimpan sebelumnya — kiriman ulang dikenali, tidak dobel.'
        : 'Pembelian tersimpan, stok & HPP diperbarui.', 'pembelian');
    } catch (e) {
      /* Kalimat kedua itu yang mencegah dokumen dobel berikutnya. Yang paling
         mungkin gagal di sini adalah waktu habis pada nota panjang — dan waktu
         habis TIDAK berarti servernya gagal. Tanpa kalimat ini orangnya
         mengetik ulang seluruh notanya, dan itulah cara dobel lahir. */
      $('#pesanBeli').innerHTML = `<div class="pesan galat">${esc(e.message)}
        <div style="margin-top:8px">Tekan <strong>Simpan pembelian</strong> sekali lagi —
        jangan mengetik ulang notanya. Kiriman kedua dikenali sebagai dokumen yang sama
        dan tidak akan masuk dua kali.</div></div>`;
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
      $('#isiMitra')._pel = pel;
      $('#isiMitra')._sup = sup;
      gambarMitra();
    } catch (e) { galat('#isiMitra', e); }
  }

  /**
   * Menggambar dari data yang SUDAH di tangan.
   *
   * Dipisah dari `muatMitra` supaya menyalakan mode nonaktif tidak menembak
   * server lagi. Datanya sudah tersimpan di elemennya untuk keperluan editor;
   * yang berubah cuma baris mana yang digambar, dan itu tidak butuh jaringan.
   * Alasan dan bentuknya sama dengan `gambarProduk` di layar Produk.
   */
  function gambarMitra() {
    const w = $('#isiMitra');
    if (!w) return;
    const pel = w._pel, sup = w._sup;
    w.innerHTML = `
      ${pel ? `
      <div class="kartu">
        <div class="bar-alat"><h3 style="margin:0">Pelanggan</h3><div style="flex:1"></div>
          ${bolehIzin('pelanggan', 'buat') ? '<button class="tombol utama" id="btnPelangganBaru">+ Pelanggan</button>' : ''}
          ${menuTindakan({ id: 'menuPelanggan', kunci: 'pelanggan', idTombol: 'btnMenuPelanggan',
              isi: butirNonaktif('pelanggan', hitungMati(pel)) })}</div>
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
        ], pel, { kosong: 'Belum ada pelanggan', pisahNonaktif: true, kunci: 'pelanggan' })}
      </div>` : ''}

      ${sup ? `
      <div class="kartu">
        <div class="bar-alat"><h3 style="margin:0">Supplier</h3><div style="flex:1"></div>
          ${bolehIzin('supplier', 'buat') ? '<button class="tombol utama" id="btnSupplierBaru">+ Supplier</button>' : ''}
          ${menuTindakan({ id: 'menuSupplier', kunci: 'supplier', idTombol: 'btnMenuSupplier',
              isi: butirNonaktif('supplier', hitungMati(sup)) })}</div>
        ${tabel([
          { judul: 'Kode', kunci: 'kode' },
          { judul: 'Nama', kunci: 'nama' },
          { judul: 'Kontak', kunci: 'kontak' },
          { judul: 'Telepon', kunci: 'telepon' },
          { judul: 'Termin', render: r => r.termin_hari ? r.termin_hari + ' hari' : '—' },
          { judul: '', render: r => `<button class="tombol kecil" data-edit-supplier="${esc(r.kode)}">Ubah</button>` }
        ], sup, { kosong: 'Belum ada supplier', pisahNonaktif: true, kunci: 'supplier' })}
      </div>` : ''}`;
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
      $('#isiPetugas')._rows = await API.daftarPetugas();
      gambarPetugas();
    } catch (e) { galat('#isiPetugas', e); }
  }

  /* Penggambar dipisah dari penarik supaya mode nonaktif tidak menembak server.
     Kartu "Bobot peran" ikut digambar ulang — isinya dibaca dari APP_STATE yang
     sama, jadi nilainya tidak bisa berbeda; memisahkannya hanya menambah satu
     tempat lagi yang harus disamakan. */
  function gambarPetugas() {
    const w = $('#isiPetugas');
    if (!w) return;
    const rows = w._rows || [];
    const b = bobotSekarang();
    w.innerHTML = `
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
            ${bolehIzin('petugas', 'buat') ? '<button class="tombol utama" id="btnPetugasBaru">+ Petugas</button>' : ''}
            ${menuTindakan({ id: 'menuPetugas', kunci: 'petugas', idTombol: 'btnMenuPetugas',
                isi: butirNonaktif('petugas', hitungMati(rows)) })}</div>
          <p class="petunjuk">Nama di daftar inilah yang muncul di layar kasir saat menutup nota.
             Petugas yang sudah keluar cukup dinonaktifkan — jangan dihapus, karena
             klaim dan poin lamanya masih menunjuk ke sini.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
            { judul: 'Peran utama', render: r => `<span class="lencana">${esc(LABEL_PERAN_PETUGAS[r.peran_utama] || r.peran_utama)}</span>` },
            /* Kemampuan ditampilkan di tabel, bukan hanya di dalam editornya.
               Pertanyaan "siapa saja yang bisa memasang?" adalah pertanyaan
               harian; menjawabnya dengan membuka satu per satu berarti tidak
               pernah dijawab. */
            { judul: 'Kemampuan', render: r => [
                r.bisa_jual !== false ? '<span class="lencana hijau">jual</span>' : '',
                r.bisa_pasang ? '<span class="lencana kuning">pasang</span>' : ''
              ].filter(Boolean).join(' ') || '<span class="petunjuk">—</span>' },
            { judul: 'Cabang', render: r => r.cabang === '*' ? 'semua cabang' : esc(r.cabang) },
            { judul: 'Telepon', kunci: 'telepon' },
            { judul: '', render: r => bolehIzin('petugas', 'ubah')
                ? `<button class="tombol kecil" data-edit-petugas="${esc(r.kode)}">Ubah</button>` : '' }
          ], rows, { kosong: 'Belum ada petugas — kasir belum bisa mengklaimkan penjualan ke siapa pun',
               pisahNonaktif: true, kunci: 'petugas' })}
        </div>`;
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
      <label>Kemampuan</label>
      <p class="petunjuk" style="margin-top:0">Menentukan di kolom mana namanya ditawarkan
        kepada kasir. Orang yang bisa keduanya cukup dicentang dua-duanya — tidak perlu
        dua nama.</p>
      <label class="cek"><input type="checkbox" id="ptBisaJual"
        ${p ? (p.bisa_jual !== false ? 'checked' : '') : 'checked'}> Bisa <strong>menjual</strong> (muncul di kolom Pramuniaga)</label>
      <label class="cek"><input type="checkbox" id="ptBisaPasang"
        ${p?.bisa_pasang ? 'checked' : ''}> Bisa <strong>memasang</strong> (muncul di kolom Pemasang)</label>
      <label class="cek" style="margin-top:10px"><input type="checkbox" id="ptAktif" ${p?.aktif !== false ? 'checked' : ''}> Aktif</label>
      <p class="petunjuk"><strong>Peran utama</strong> menentukan bobot pembagian poin;
        <strong>kemampuan</strong> menentukan siapa yang boleh dipilih di layar kasir.
        Keduanya sengaja terpisah — orang yang bisa memasang belum tentu selalu berperan
        sebagai pemasang di setiap nota.<br>
        Selama <em>belum ada satu pun</em> petugas yang ditandai bisa memasang, layar kasir
        menawarkan semua nama: daftar kosong terbaca sebagai aplikasi rusak, bukan sebagai
        data yang belum diisi.<br>
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

  /**
   * Penyaring cabang layar Performa — diminta pemilik 7 Sep 2026.
   *
   * Aturan tampilnya SAMA PERSIS dengan penyaring di layar Laporan dan pemilih
   * cabang aktif di puncak layar: hanya untuk akun berbendera lintas cabang,
   * dan hanya bila cabangnya lebih dari satu. Tiga tempat dengan tiga aturan
   * berbeda adalah cara paling mudah membuat satu peran melihat pilihan yang
   * tidak pernah bisa ia pakai.
   *
   * `apiLaporanPoin` sudah menerima `p.cabang` sejak lama dan memeriksa haknya
   * sendiri lewat `wajibCabang()`. Tidak ada endpoint baru, tidak ada baris
   * baru di Sheets — dan menyempitkan ke satu cabang justru membuat servernya
   * memutari satu cabang, bukan tiga.
   */
  function pilihCabangPoin() {
    const sumber = (APP_STATE.daftarCabangSemua && APP_STATE.daftarCabangSemua.length)
      ? APP_STATE.daftarCabangSemua : (APP_STATE.daftarCabang || []);
    const daftar = sumber.slice().sort(urutNama);
    if (!APP_STATE.flag?.akses_lintas_cabang || daftar.length < 2) return '';
    return `<div style="max-width:200px"><label>Cabang</label><select id="poinCabang">
        <option value="*">Semua cabang</option>
        ${daftar.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select></div>`;
  }

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
              ${urutkanOleh(rows, r => r.nama).map(r => `<option value="${esc(r.kode)}">${esc(r.nama)}</option>`).join('')}
            </select></div>
            ${pilihCabangPoin()}
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
        kode_petugas: nilai('poinPetugas') || undefined,
        /* Jatuh ke '*' bila penyaringnya tidak tergambar. Aman untuk semua
           peran: server menerjemahkan '*' jadi "seluruh cabang aktif" HANYA
           bagi yang berbendera lintas cabang, dan jadi cabang sesi bagi yang
           tidak — persis perilaku layar ini sebelum penyaringnya ada. */
        cabang: nilai('poinCabang') || '*'
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
            /* Jam diambil dari notanya lewat gabungan di server — penjualan_klaim
               sendiri tidak menyimpan jam. Nota lama yang notanya sudah dihapus
               (mis. dibatalkan lalu dibersihkan) tidak punya jam; ditulis '—'
               supaya jelas datanya memang tidak ada, bukan pukul 00:00. */
            { judul: 'Jam', kunci: 'jam', render: x => esc(x.jam ? x.jam.substring(0, 5) : '—') },
            { judul: 'Nota', kunci: 'no_nota' },
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
    lepasUuidDokumen('bayar_piutang');       // dokumen BARU — lihat uuidDokumen()
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

  /* ==================== UTANG SUPPLIER ====================
   *
   * Cermin dari layar Piutang di atas, dan sengaja dibaca sebagai pasangannya.
   * Bedanya cuma arah uangnya: di sini toko yang membayar. Ditambahkan
   * 5 Sep 2026 — sebelumnya pembelian kredit menaikkan saldo Utang Usaha tanpa
   * satu pun layar untuk melihat atau melunasinya.
   */
  async function muatUtang() {
    memuat('#isiUtang');
    try {
      const d = await API.daftarUtang({});
      const a = d.aging;
      $('#isiUtang').innerHTML = `
        <div class="petak">
          <div class="kartu statistik"><div class="label">Belum jatuh tempo</div><div class="nilai">${rp(a.lancar)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 1–30 hari</div><div class="nilai">${rp(a.h30)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 31–60</div><div class="nilai">${rp(a.h60)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 61–90</div><div class="nilai">${rp(a.h90)}</div></div>
          <div class="kartu statistik"><div class="label">Telat &gt; 90 hari</div>
            <div class="nilai" style="color:var(--bahaya)">${rp(a.lebih)}</div></div>
        </div>
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Utang ke supplier — total ${rp(d.total)}</h3>
            <div style="flex:1"></div>${tombolEkspor('utang')}</div>
          <p class="petunjuk">Hanya pembelian bertipe <strong>Kredit (utang)</strong> yang muncul di sini.
             Pembelian yang dibayar Tunai atau Transfer sudah lunas saat dicatat.</p>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Supplier', kunci: 'nama_supplier' },
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'Jatuh tempo', render: r => esc(tglTampil(r.jatuh_tempo)) },
            { judul: 'Telat', render: r => r.hari_telat > 0
                ? `<span class="lencana ${r.hari_telat > 60 ? 'merah' : 'kuning'}">${r.hari_telat} hari</span>`
                : '<span class="lencana hijau">lancar</span>' },
            { judul: 'Sisa', angka: true, render: r => rp(r.sisa) },
            { judul: '', render: r => bolehIzin('utang', 'buat')
                ? `<button class="tombol kecil utama" data-bayar-utang="${esc(r.uuid)}" data-cabang="${esc(r.cabang)}">Bayar</button>` : '' }
          ], d.utang, { kosong: 'Tidak ada utang ke supplier' })}
        </div>`;
      $('#isiUtang')._rows = d.utang;
    } catch (e) { galat('#isiUtang', e); }
  }

  function dialogBayarUtang(uuid, cabang) {
    lepasUuidDokumen('bayar_utang');         // dokumen BARU — lihat uuidDokumen()
    const u = ($('#isiUtang')._rows || []).find(x => x.uuid === uuid);
    if (!u) return;
    bukaModal('Bayar utang supplier', `
      <p class="petunjuk">${esc(u.nama_supplier)} · faktur ${esc(tglTampil(u.tanggal))} · sisa <strong>${rp(u.sisa)}</strong></p>
      <div class="baris2">
        <div class="grup"><label>Tanggal</label><input type="date" id="buTanggal" value="${tanggalLokal()}"></div>
        <div class="grup"><label>Jumlah bayar</label><input type="text" inputmode="numeric" class="uang" id="buJumlah" value="${ribuan(u.sisa)}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Metode</label><select id="buMetode">
          <option value="transfer">Transfer bank</option><option value="tunai">Tunai</option>
          <option value="qris">QRIS</option></select></div>
        <div class="grup"><label>Referensi / no. bukti transfer</label><input type="text" id="buRef"></div>
      </div>
      <div id="pesanBayarUtang"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol sukses" id="btnKonfirmasiBayarUtang"
         data-uuid="${esc(uuid)}" data-cabang="${esc(cabang)}">Simpan pembayaran</button>`);
  }

  /* ==================== USER & HAK AKSES ==================== */

  /* Ikon aksi baris perangkat. Diminta pemilik 4 Sep 2026: tiga tombol berteks
     ("Setujui", "Blokir", "Hapus") membuat kolom terakhir selebar tiga kolom
     data, dan di HP barisnya patah. Bentuknya mengikuti `IKON` di app.js —
     viewBox 24, garis saja, tanpa isian. */
  const IKON_AKSI = {
    setujui: '<path d="m5 13 4 4L19 7"/>',
    blokir : '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    hapus  : '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/>' +
             '<path d="M6 7h12l-.9 12.1a1.5 1.5 0 0 1-1.5 1.4H8.4a1.5 1.5 0 0 1-1.5-1.4Z"/>' +
             '<path d="M9.5 7V4.8A.8.8 0 0 1 10.3 4h3.4a.8.8 0 0 1 .8.8V7"/>'
  };

  /**
   * Tombol yang isinya CUMA ikon.
   *
   * `title` DAN `aria-label` keduanya wajib, dan itu bukan pengulangan: yang
   * pertama untuk mata yang menunggu di atas tombol, yang kedua untuk pembaca
   * layar yang tidak pernah melihat `title`. Ikon tanpa keduanya adalah tombol
   * yang tidak menyebutkan namanya kepada siapa pun.
   */
  const tombolIkon = (gaya, judul, jalur, atribut) =>
    `<button class="tombol kecil ikon-saja ${gaya}" title="${esc(judul)}" aria-label="${esc(judul)}" ${atribut}>` +
    `<svg class="ikon-svg" viewBox="0 0 24 24" style="width:15px;height:15px">${jalur}</svg></button>`;

  /**
   * Kolom "Pemilik" satu baris perangkat.
   *
   * Diminta pemilik 4 Sep 2026: kolom `nama` dirakit peramban dari platform dan
   * ukuran layar ("Win32 · 1920x1080"), jadi memutuskan mana yang harus diblokir
   * selalu jadi tebak-tebakan.
   *
   * Server mengirim `user_terakhir` sebagai **id_user**, dan namanya dipetakan
   * DI SINI dari daftar user yang sudah ditarik permintaan yang sama. Mengirim
   * namanya dari server berarti satu pembacaan sheet `user` tambahan untuk data
   * yang sudah ada di tangan layar ini.
   *
   * Kosong bukan kegagalan. Baris perangkat lahir sebelum ada yang terbukti tahu
   * PIN, jadi perangkat MENUNGGU memang belum pernah dimasuki siapa pun — dan
   * itu justru keterangan yang dicari orang yang sedang menimbang mau memblokir.
   * Karena itu ditulis dengan kalimat, bukan dengan tanda hubung yang bisa
   * dikira data yang gagal dimuat.
   */
  function pemilikPerangkat(r, daftarUser) {
    const id = String(r.user_terakhir || '');
    if (!id) return '<span class="petunjuk">belum pernah dipakai</span>';
    const u = (daftarUser || []).find(x => String(x.id_user) === id);
    /* Pengguna yang barisnya sudah dihapus tetap ditampilkan id-nya, bukan
       dikosongkan: "pernah dipakai orang yang sekarang tidak ada" adalah
       keterangan yang berbeda dari "belum pernah dipakai", dan justru yang
       kedua itu yang mencurigakan. */
    const nama = u ? u.nama : id;
    return `${esc(nama)}<br><span class="meta-kecil">${esc(waktuTampil(r.login_terakhir))}</span>`;
  }

  async function muatPengguna() {
    memuat('#isiPengguna');
    try {
      const [user, peran, perangkat] = await Promise.all([
        API.daftarUser(), API.daftarPeran(), API.daftarPerangkat()
      ]);
      cachePeran = peran.peran;
      cacheKamus = { modul: peran.modul, aksi: peran.aksi, flag: peran.flag };
      $('#isiPengguna')._user = user;
      /* Disimpan supaya dialog konfirmasi Hapus bisa menyebut perangkat yang
         MANA — kode, nama, cabang — tanpa menembak server lagi hanya untuk
         mengulang data yang barusan digambar. */
      $('#isiPengguna')._perangkat = perangkat;
      gambarPengguna();
    } catch (e) { galat('#isiPengguna', e); }
  }

  function gambarPengguna() {
    const w = $('#isiPengguna');
    if (!w) return;
    const user = w._user || [], perangkat = w._perangkat || [];
    w.innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3 style="margin:0">Pengguna</h3><div style="flex:1"></div>
            ${bolehIzin('user', 'buat') ? '<button class="tombol utama" id="btnUserBaru">+ Pengguna</button>' : ''}
            ${menuTindakan({ id: 'menuUser', kunci: 'user', idTombol: 'btnMenuUser',
                isi: butirNonaktif('user', hitungMati(user)) })}</div>
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
          ], user, { kosong: 'Belum ada pengguna', pisahNonaktif: true, kunci: 'user' })}
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
          <div class="bar-alat"><h3 style="margin:0">Perangkat terdaftar</h3><div style="flex:1"></div>
            ${menuTindakan({ id: 'menuPerangkat', kunci: 'perangkat', idTombol: 'btnMenuPerangkat',
                isi: butirNonaktif('perangkat', hitungMati(perangkat, r => r.status === 'DIBLOKIR')) })}</div>
          <p class="petunjuk">Perangkat baru wajib disetujui sebelum bisa transaksi — ini yang mencegah PIN kasir yang bocor dipakai dari HP pribadi.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            { judul: 'Nama perangkat', kunci: 'nama' },
            { judul: 'Pemilik', render: r => pemilikPerangkat(r, user) },
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Status', render: r => `<span class="lencana ${
                r.status === 'DISETUJUI' ? 'hijau' : (r.status === 'DIBLOKIR' ? 'merah' : 'kuning')}">${esc(r.status)}</span>` },
            { judul: 'Sinkron terakhir', render: r => esc(waktuTampil(r.terakhir_sinkron)) },
            { judul: '', render: r => `
              ${bolehIzin('user', 'setujui') ? `
                ${r.status !== 'DISETUJUI' ? tombolIkon('sukses', 'Setujui perangkat', IKON_AKSI.setujui,
                    `data-perangkat="${esc(r.id_perangkat)}" data-status="DISETUJUI"`) : ''}
                ${r.status !== 'DIBLOKIR' ? tombolIkon('bahaya', 'Blokir perangkat', IKON_AKSI.blokir,
                    `data-perangkat="${esc(r.id_perangkat)}" data-status="DIBLOKIR"`) : ''}` : ''}
              ${/* Hapus TIDAK muncul untuk yang DISETUJUI — server pun menolaknya.
                    Tombol yang satu-satunya keluaran mungkinnya pesan galat itu
                    jebakan, bukan tombol; yang masih hidup diblokir dulu, dan
                    langkah itulah yang memutus aksesnya. */
                 bolehIzin('user', 'hapus') && r.status !== 'DISETUJUI'
                ? tombolIkon('bahaya', 'Hapus perangkat', IKON_AKSI.hapus,
                    `data-hapus-perangkat="${esc(r.id_perangkat)}"`) : ''}` }
          ], perangkat, { kosong: 'Belum ada perangkat', pisahNonaktif: true, kunci: 'perangkat',
               nonaktif: r => r.status === 'DIBLOKIR' })}
        </div>`;
  }

  function editorUser(id) {
    const u = id ? ($('#isiPengguna')._user || []).find(x => x.id_user === id) : null;
    const cabangOpsi = ['*', ...APP_STATE.daftarCabang];
    /* Username adalah kunci masuk orang lain. Izin `user.ubah` dipegang peran
       manajerial supaya mereka bisa membetulkan nama dan cabang; memindahkan
       kunci masuk dibatasi lebih ketat daripada itu. Servernya memeriksa hal
       yang sama — yang di sini cuma supaya isian yang pasti ditolak tidak
       terlihat bisa diisi. */
    const bolehUsername = String(APP_STATE.user?.peran || '') === 'OWNER';
    bukaModal(u ? 'Ubah pengguna — ' + u.username : 'Pengguna baru', `
      <div class="baris2">
        <div class="grup"><label>Nama lengkap *</label><input type="text" id="uNama" value="${esc(u?.nama || '')}"></div>
        <div class="grup"><label>Username *</label>
          <input type="text" id="uUsername" value="${esc(u?.username || '')}"
                 ${u && !bolehUsername ? 'disabled' : ''} autocapitalize="none" autocorrect="off"
                 spellcheck="false" pattern="[a-z0-9._]{3,32}"></div>
      </div>
      <p class="petunjuk">Username: huruf kecil, angka, titik, garis bawah. Tanpa spasi.
        ${u ? (bolehUsername
                ? 'Menggantinya tidak memutus riwayat apa pun — penjualan dan poin terkunci pada kode ' +
                  esc(u.id_user) + ', bukan pada username. PIN juga tidak berubah. ' +
                  'Beri tahu petugasnya sebelum ia masuk berikutnya.'
                : 'Hanya Owner yang boleh mengganti username.')
             : ''}</p>
      <div class="baris2">
        <div class="grup"><label>Peran *</label><select id="uPeran">
          ${urutkanOleh(cachePeran || [], p => p.nama).map(p => `<option value="${esc(p.kode_peran)}" ${u?.peran === p.kode_peran ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}
        </select></div>
        <div class="grup"><label>Cabang</label><select id="uCabang">
          ${cabangOpsi.slice().sort(urutNama).map(c => `<option value="${esc(c)}" ${u?.cabang === c ? 'selected' : ''}>${c === '*' ? 'Semua cabang' : esc(c)}</option>`).join('')}
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
      $('#isiCabang')._rows = await API.daftarCabangAdmin();
      gambarCabang();
    } catch (e) { galat('#isiCabang', e); }
  }

  function gambarCabang() {
    const w = $('#isiCabang');
    if (!w) return;
    const rows = w._rows || [];
    w.innerHTML = `
      <div class="kartu">
        <div class="bar-alat"><h3 style="margin:0">Cabang</h3><div style="flex:1"></div>
          ${bolehIzin('cabang', 'buat') ? '<button class="tombol utama" id="btnCabangBaru">+ Cabang baru</button>' : ''}
          ${menuTindakan({ id: 'menuCabang', kunci: 'cabang', idTombol: 'btnMenuCabang',
              isi: butirNonaktif('cabang', hitungMati(rows)) })}</div>
        <p class="petunjuk">Setiap cabang punya file database sendiri di Google Drive. Pemisahan inilah yang membuat kasir cabang A tidak pernah menunggu cabang B saat menyimpan transaksi.</p>
        ${tabel([
          { judul: 'Kode', kunci: 'kode_cabang' },
          { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
          { judul: 'Alamat', kunci: 'alamat' },
          { judul: 'Telepon', kunci: 'telepon' },
          { judul: 'Prefix nota', kunci: 'prefix_nota' },
          { judul: '', render: r => `<button class="tombol kecil" data-edit-cabang="${esc(r.kode_cabang)}">Ubah</button>` }
        ], rows, { kosong: 'Belum ada cabang', pisahNonaktif: true, kunci: 'cabang' })}
      </div>`;
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

  /* LABEL. Dipendekkan sampai jadi NAMA setelan saja. Penjelasannya pindah ke
     `.set-bantu` di bawah kotak dan `<em>` di dalam kartu centang: label yang
     menampung penjelasan ikut memanjang dan berhenti terbaca sebagai nama
     kolom — di layar sempit ia bahkan membungkus jadi dua baris sementara
     kotak isiannya tetap satu baris. */
  const LABEL_SETTING = {
    nama_usaha: 'Nama usaha', alamat_usaha: 'Alamat usaha',
    telepon_usaha: 'Telepon usaha', npwp: 'NPWP',
    pkp: 'Pengusaha Kena Pajak (PKP)', tarif_ppn: 'Tarif PPN',
    izinkan_stok_minus: 'Boleh menjual saat stok 0',
    tema: 'Tema tampilan', metode_hpp: 'Metode HPP',
    footer_struk: 'Baris penutup struk', lebar_struk: 'Lebar kertas struk',
    mdr_qris: 'Potongan QRIS', auto_jurnal: 'Posting jurnal otomatis',
    klaim_petugas_wajib: 'Wajib klaim petugas'
  };

  /* Keterangan sebaris di bawah kotak isian. */
  const BANTU_SETTING = {
    nama_usaha: 'Tercetak paling atas di struk.',
    alamat_usaha: 'Dikosongkan berarti baris alamat tidak dicetak.',
    telepon_usaha: 'Dikosongkan berarti baris telepon tidak dicetak.',
    npwp: 'Hanya dipakai bila PKP menyala.',
    tarif_ppn: 'Hanya dipakai bila PKP menyala.',
    footer_struk: 'Baris terakhir sebelum kertas terpotong.',
    lebar_struk: '58 atau 80.',
    mdr_qris: 'Dicatat sebagai beban di jurnal.',
    tema: 'Berlaku untuk SEMUA perangkat, bukan perangkat ini saja.'
  };

  /* Baris kedua di dalam kartu sakelar: apa yang terjadi kalau ia dinyalakan. */
  const SUB_SETTING = {
    pkp: 'PPN dihitung per nota.',
    izinkan_stok_minus: 'Nota tetap jalan, selisihnya ditandai untuk opname.',
    auto_jurnal: 'Setiap transaksi langsung masuk jurnal.',
    klaim_petugas_wajib: 'Nota ditolak bila belum ada petugas yang mengklaimnya.'
  };

  /* Satuan yang duduk DI DALAM kotak. Ditulis di label, ia terbaca sebagai
     bagian dari nama setelannya — "Tarif PPN (%)" adalah nama yang aneh. */
  const SATUAN_SETTING = { tarif_ppn: '%', mdr_qris: '%', lebar_struk: 'mm' };

  /* Contoh isi untuk kotak yang masih kosong. Kotak kosong tanpa contoh tidak
     memberi tahu bentuk isian yang diharapkan. */
  const CONTOH_SETTING = {
    alamat_usaha: 'Jl. …', telepon_usaha: '08…', npwp: '00.000.000.0-000.000'
  };

  /* `klaim_petugas_wajib` ikut di sini sejak v1.132.0. Sebelumnya ia tidak
     terdaftar di mana pun, jadi layar menggambarnya sebagai kotak isian bebas
     berlabel mentah `klaim_petugas_wajib` — dan servernya membaca nilainya
     dengan `String(x) === 'true'`, sehingga apa pun yang diketik selain kata
     itu berarti mati, tanpa satu pun galat. */
  const SETTING_BOOL = ['pkp', 'izinkan_stok_minus', 'auto_jurnal', 'klaim_petugas_wajib'];

  /* SETELAN YANG DIBUANG. Membuangnya dari benih di 00_Config.gs saja tidak
     cukup: barisnya SUDAH ada di sheet toko yang berjalan sejak Agustus, dan
     tanpa penyaring ini ia justru muncul kembali di layar — kali ini sebagai
     kotak isian bernama mentah `harga_per_cabang`, tanpa label, tepat di
     sebelah setelan yang sungguhan. */
  const SETTING_DIBUANG = ['harga_per_cabang'];

  /* SETELAN BACA-SAJA. Mesin persediaan selalu FIFO dan tidak ada satu baris
     pun yang membaca `metode_hpp`. Kotak isian yang menerima "RATA-RATA" lalu
     tidak melakukan apa-apa adalah kebohongan yang paling mahal di layar ini:
     yang mengisinya percaya HPP seluruh tokonya sudah berubah. Barisnya tetap
     ditampilkan — pemiliknya berhak tahu metode apa yang dipakai — tapi sebagai
     keterangan, bukan isian. */
  const SETTING_BACA_SAJA = ['metode_hpp'];

  /* SETELAN BERPILIHAN. Kotak isian bebas menerima "Gelap", "dark", atau salah
     ketik — dan yang terjadi kemudian bukan galat melainkan tema yang diam-diam
     tidak berubah, tanpa satu pun petunjuk kenapa. */
  const SETTING_PILIHAN = {
    tema: [['terang', 'Terang'], ['gelap', 'Gelap']]
  };

  /* IKON LAYAR SETTING. Digambar sebaris, sama seperti `tombolIkon` di atas:
     aplikasi harus tetap utuh saat internet mati, jadi tidak ada satu pun ikon
     yang datang dari CDN. Jalurnya 24x24, digoreskan oleh `.ikon-svg`. */
  const IKON_SETTING = {
    usaha:    '<path d="m2.5 7.5 1.6-4.2h15.8l1.6 4.2"/><path d="M2.5 7.5h19v1.6a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-4.2 0 2.7 2.7 0 0 1-4.2 0 2.7 2.7 0 0 1-5.3 0Z"/><path d="M4.6 12.6v8.4h14.8v-8.4"/><path d="M9.6 21v-5h4.8v5"/>',
    pajak:    '<path d="M19 7.5v-2A1.8 1.8 0 0 0 17.2 3.7H5.4a1.8 1.8 0 0 0 0 3.6h14a1.4 1.4 0 0 1 1.4 1.4v3.3"/><path d="M3.6 5.5v13a1.8 1.8 0 0 0 1.8 1.8h13.4a1.8 1.8 0 0 0 1.8-1.8v-2.6"/><path d="M17.6 12.6a2 2 0 0 0 0 4h3.2v-4Z"/>',
    struk:    '<path d="M4 2.6v18.8l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2.6l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8.5 8h7"/><path d="M8.5 12h5"/>',
    stok:     '<rect x="2.5" y="3.5" width="19" height="4.6" rx="1.4"/><path d="M4.4 8.1v10.4a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2V8.1"/><path d="M10 12.2h4"/>',
    tampilan: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8.5 20.5h7"/><path d="M12 16.5v4"/>',
    lain:     '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.4a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 1.9-2.7 3.7"/><circle cx="12" cy="17" r="1"/>',
    gembok:   '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    terang:   '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m5.2 5.2 1.4 1.4"/><path d="m17.4 17.4 1.4 1.4"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m5.2 18.8 1.4-1.4"/><path d="m17.4 6.6 1.4-1.4"/>',
    gelap:    '<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6Z"/>'
  };
  const ikonSetting = (id) =>
    `<svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON_SETTING[id] || ''}</svg>`;

  /* KELOMPOK SETELAN. Tiga belas setelan yang berderet dalam satu petak tanpa
     pengelompokan memaksa pembacanya menyaring sendiri mana yang soal pajak,
     mana yang soal kertas struk, dan mana yang soal aturan kasir. Urutan DI
     SINI yang menentukan urutan di layar — bukan urutan baris di sheet, yang
     ditentukan oleh urutan penyemaian dan tidak berarti apa-apa bagi pembaca. */
  const GRUP_SETTING = [
    { judul: 'Identitas usaha', ikon: 'usaha',
      ket: 'Tercetak di kepala setiap struk.',
      kunci: ['nama_usaha', 'alamat_usaha', 'telepon_usaha'] },
    { judul: 'Pajak & pembukuan', ikon: 'pajak',
      ket: 'Menentukan cara nota dan jurnal dihitung.',
      kunci: ['pkp', 'npwp', 'tarif_ppn', 'auto_jurnal', 'metode_hpp'] },
    { judul: 'Struk & cetak', ikon: 'struk',
      ket: 'Bentuk kertas yang keluar dari printer kasir.',
      kunci: ['footer_struk', 'lebar_struk'] },
    { judul: 'Penjualan & stok', ikon: 'stok',
      ket: 'Aturan yang dipakai kasir saat melayani.',
      kunci: ['izinkan_stok_minus', 'klaim_petugas_wajib', 'mdr_qris'] },
    { judul: 'Tampilan', ikon: 'tampilan',
      ket: 'Berlaku untuk semua perangkat yang masuk.',
      kunci: ['tema'] }
  ];

  /* SETELAN YANG NILAINYA BERGANTUNG PADA SETELAN LAIN. Kuncinya diredupkan
     saat induknya mati — DIREDUPKAN, bukan dikosongkan: NPWP yang terhapus
     saat PKP dimatikan harus diketik ulang saat PKP dinyalakan lagi. */
  const SETTING_IKUT_PKP = ['npwp', 'tarif_ppn'];

  /**
   * Susun baris setelan menjadi kelompok, menurut GRUP_SETTING.
   *
   * Kunci yang TIDAK terdaftar di GRUP_SETTING tetap digambar, di kelompok
   * "Lainnya" paling bawah. Tanpa itu, setelan baru yang disemai di
   * 00_Config.gs besok akan hilang dari layar tanpa satu pun galat — dan yang
   * menyemainya tidak akan pernah tahu bahwa layarnya berhenti menampilkannya.
   *
   * Kelompok yang seluruh kuncinya tidak ada di sheet tidak digambar sama
   * sekali: kepala kelompok tanpa isi adalah garis yang tidak menerangkan apa
   * pun.
   */
  function susunGrupSetting(rows) {
    const sisa = new Map(rows.map(r => [r.kunci, r]));
    const out = [];
    GRUP_SETTING.forEach(g => {
      const isi = [];
      g.kunci.forEach(k => {
        if (!sisa.has(k)) return;
        isi.push(sisa.get(k));
        sisa.delete(k);
      });
      if (isi.length) out.push({ grup: g, isi: isi });
    });
    if (sisa.size) {
      out.push({
        grup: { judul: 'Lainnya', ikon: 'lain', ket: 'Belum dikelompokkan.' },
        isi: [...sisa.values()]
      });
    }
    return out;
  }

  /** Satu kepala kelompok. Duduk DI ATAS petaknya, bukan di dalamnya. */
  const kepalaGrupSetting = (g) =>
    `<div class="set-kepala">${ikonSetting(g.ikon)}` +
    `<div><b>${esc(g.judul)}</b><span>${esc(g.ket)}</span></div></div>`;

  /** Satu kendali setelan. */
  function isianSetting(r) {
    const label = LABEL_SETTING[r.kunci] || r.kunci;
    const bantu = BANTU_SETTING[r.kunci]
      ? `<span class="set-bantu">${esc(BANTU_SETTING[r.kunci])}</span>` : '';
    /* Tanpa `data-setting` penyimpan di bawah tidak akan menyentuhnya — dan itu
       memang yang diinginkan: nilainya tidak boleh berubah dari sini. */
    if (SETTING_BACA_SAJA.includes(r.kunci)) {
      return `<div class="grup"><label>${esc(label)}</label>
        <p class="set-baca">${ikonSetting('gembok')}<span class="lencana hijau">${esc(r.nilai)}</span>
        <span class="set-bantu">ditetapkan mesin persediaan, tidak bisa diubah</span></p></div>`;
    }
    if (SETTING_PILIHAN[r.kunci]) {
      /* Kendali bersegmen, bukan <select>: dua pilihan yang keduanya sudah
         terlihat tidak perlu dibuka dulu untuk diketahui isinya.
         Nilainya dititipkan ke <input type=hidden> — penyimpan di pendengar
         klik membaca SETIAP `[data-setting]` dan tidak perlu tahu bentuk
         kendalinya; tanpa titipan itu ia harus dibuatkan cabang khusus, dan
         setiap kendali baru berikutnya butuh cabangnya sendiri. */
      const tombol = SETTING_PILIHAN[r.kunci].map(([v, t]) =>
        `<button type="button" class="${String(r.nilai) === v ? 'pas' : ''}"` +
        ` data-segmen="${esc(r.kunci)}" data-segmen-nilai="${esc(v)}">` +
        `${ikonSetting(v)}<span>${esc(t)}</span></button>`).join('');
      return `<div class="grup"><label>${esc(label)}</label>
        <input type="hidden" data-setting="${esc(r.kunci)}" value="${esc(r.nilai)}">
        <div class="segmen">${tombol}</div>${bantu}</div>`;
    }
    if (SETTING_BOOL.includes(r.kunci)) {
      return `<label class="cek kartu-cek set-cek">
        <input type="checkbox" class="sakelar" data-setting="${esc(r.kunci)}" ${String(r.nilai) === 'true' ? 'checked' : ''}>
        <span><b>${esc(label)}</b><em>${esc(SUB_SETTING[r.kunci] || '')}</em></span></label>`;
    }
    if (SATUAN_SETTING[r.kunci]) {
      return `<div class="grup"><label>${esc(label)}</label>
        <div class="isian-satuan">
          <input type="text" inputmode="decimal" data-setting="${esc(r.kunci)}" value="${esc(r.nilai)}">
          <span>${esc(SATUAN_SETTING[r.kunci])}</span>
        </div>${bantu}</div>`;
    }
    return `<div class="grup"><label>${esc(label)}</label>
      <input type="text" data-setting="${esc(r.kunci)}" value="${esc(r.nilai)}" placeholder="${esc(CONTOH_SETTING[r.kunci] || '')}">${bantu}</div>`;
  }

  /* JEJAK PERUBAHAN. Tombol Simpan yang selalu menyala tidak membedakan layar
     yang belum disentuh dari layar yang sudah diubah tiga kali — dan yang
     menekannya tidak pernah tahu apa yang sedang ia kirim. Nilai awalnya
     direkam saat layar digambar, lalu setiap ketikan dibandingkan dengannya. */
  let _awalSetting = {};

  function bacaSetting() {
    const nilai = {};
    $$('#isiSistem [data-setting]').forEach(i => {
      nilai[i.dataset.setting] = i.type === 'checkbox' ? String(i.checked) : i.value;
    });
    return nilai;
  }

  /**
   * Segarkan dua hal yang bergantung pada isi layar: setelan yang ikut mati
   * bersama induknya, dan hitungan perubahan yang belum disimpan.
   *
   * Peredupan dikerjakan SEBELUM tombolnya dicari. Peran tanpa izin
   * `setting·ubah` tidak punya tombol Simpan sama sekali; kalau urutannya
   * dibalik, layar baca-saja miliknya berhenti menunjukkan bahwa NPWP tidak
   * berlaku — padahal justru dia yang cuma bisa membaca.
   */
  function segarkanJejakSetting() {
    const kini = bacaSetting();
    const pkpMati = kini.pkp === 'false';
    SETTING_IKUT_PKP.forEach(k => {
      const el = $(`#isiSistem [data-setting="${k}"]`);
      const grup = el && el.closest('.grup');
      if (grup) grup.classList.toggle('set-tidur', pkpMati);
    });
    const tombol = $('#btnSimpanSetting');
    if (!tombol) return;
    const n = Object.keys(kini).filter(k => kini[k] !== _awalSetting[k]).length;
    tombol.disabled = n === 0;
    const jejak = $('#jejakSetting');
    if (jejak) {
      jejak.classList.toggle('ada', n > 0);
      jejak.textContent = n === 0
        ? 'Belum ada perubahan.'
        : n + ' perubahan belum disimpan.';
    }
  }

  async function muatSistem() {
    memuat('#isiSistem');
    try {
      /* Bobot peran punya layarnya sendiri di menu Petugas — lengkap dengan
         pratinjau pembagiannya. Membiarkannya juga muncul di sini sebagai JSON
         mentah berarti dua tempat mengubah satu hal, dan yang terakhir menyimpan
         menang tanpa ada yang tahu. */
      const rows = (await API.daftarSetting())
        .filter(r => !SETTING_PUNYA_LAYAR_SENDIRI.includes(r.kunci))
        .filter(r => !SETTING_DIBUANG.includes(r.kunci));
      $('#isiSistem').innerHTML = `
        <p class="petunjuk">Perubahan berlaku untuk seluruh cabang dan langsung ditarik perangkat kasir pada sinkronisasi berikutnya.</p>
        ${/* SATU KARTU PER KELOMPOK, bukan satu kartu besar yang dibagi garis.
              Garis pemisah di dalam satu petak terbaca sebagai tabel yang bocor;
              kotak terbaca sebagai kelompok.
              Kolomnya `auto-fill`, BUKAN `auto-fit`: `auto-fit` mengempiskan
              jalur yang kosong, jadi kelompok berisi dua isian melebarkan
              kotaknya sampai setengah layar sementara kelompok di atasnya
              bertiga — lima kelompok jadi lima lebar kotak yang berbeda.
              `auto-fill` menyisakan jalur kosongnya, jadi kotak isian di
              seluruh layar ini berbaris lurus dari kartu ke kartu. */''}
        ${susunGrupSetting(rows).map(k => `<div class="kartu set-grup">
          ${kepalaGrupSetting(k.grup)}
          <div class="petak petak-form" style="grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))">
            ${k.isi.map(isianSetting).join('')}
          </div>
        </div>`).join('')}
        ${bolehIzin('setting', 'ubah') ? `<div class="set-kaki">
          <span class="set-jejak" id="jejakSetting">Belum ada perubahan.</span>
          <button class="tombol utama besar" id="btnSimpanSetting" disabled>Simpan pengaturan</button>
        </div>` : ''}`;
      /* Dipasang sebagai PROPERTI, bukan addEventListener: layar ini digambar
         ulang setiap kali menunya dibuka, dan pendengar yang ditambahkan akan
         menumpuk — hitungan perubahannya tetap benar, tapi jumlah pemanggilan
         per ketikan naik terus sepanjang sesi. */
      $('#isiSistem').oninput = segarkanJejakSetting;
      $('#isiSistem').onchange = segarkanJejakSetting;
      _awalSetting = bacaSetting();
      segarkanJejakSetting();
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
            { judul: 'Waktu', render: r => esc(waktuTampil(r.waktu)) },
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
            /* Nomornya digarisbawahi supaya barisnya terbaca BISA DIBUKA —
               pola yang sama dengan daftar Pembelian. Baris yang membuka
               sesuatu tapi tampak persis seperti baris mati tidak akan pernah
               diklik siapa pun. `kunci` tetap ada supaya kolomnya masih bisa
               diurut: `data-urut` membaca nilai mentah, bukan teks selnya. */
            { judul: 'No dokumen', kunci: 'no_dokumen',
              render: r => `<span class="tautan-baris">${esc(r.no_dokumen || '(tanpa nomor)')}</span>` },
            { judul: 'Rute', render: r => `${esc(r.cabang_asal)} → ${esc(r.cabang_tujuan)}` },
            { judul: 'Item', render: r => String(r.item.length) },
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_TRANSFER[r.status] || ''}">${esc(r.status)}</span>` },
            ...(rows[0]?.nilai_hpp !== undefined ? [{ judul: 'Nilai', angka: true, render: r => rp(r.nilai_hpp) }] : []),
            { judul: '', render: r =>
              r.status === 'DIKIRIM' && r.cabang_asal === APP_STATE.cabang && bolehIzin('transfer', 'hapus')
                ? `<button class="tombol kecil bahaya" data-batal-transfer="${esc(r.uuid)}">Batal</button>` : '' }
          ], rows, { kosong: 'Belum ada transfer',
                     /* Tombol "Detail" dibuang, digantikan klik pada barisnya —
                        diminta pemilik 7 Sep 2026, disamakan dengan Pembelian.
                        Tombol Batal TETAP tombol: `closest()` mengambil leluhur
                        TERDEKAT, jadi menekannya tidak berubah jadi membuka
                        rincian. */
                     dataAttr: r => `data-detail-transfer="${esc(r.uuid)}" class="baris-klik"` })}
        </div>`;
      $('#isiTransfer')._rows = rows;
    } catch (e) { galat('#isiTransfer', e); }
  }

  async function formKirimTransfer() {
    lepasUuidDokumen('transfer');            // dokumen BARU — lihat uuidDokumen()
    const [prod, cab] = await Promise.all([API.daftarProduk({ ramping: true }), API.daftarCabangAdmin().catch(() => [])]);
    const tujuan = (cab.length ? cab.filter(c => c.aktif).map(c => c.kode_cabang) : APP_STATE.daftarCabangSemua)
      .filter(k => k !== APP_STATE.cabang);

    if (!tujuan.length) {
      return bukaModal('Kirim barang', '<div class="pesan info">Belum ada cabang lain sebagai tujuan. Tambahkan cabang dulu di menu Cabang.</div>');
    }

    bukaModal('Kirim barang ke cabang lain', `
      <div class="baris3">
        <div class="grup"><label>Dari</label><input type="text" value="${esc(APP_STATE.cabang)}" disabled></div>
        <div class="grup"><label>Ke cabang *</label><select id="tfTujuan">
          ${tujuan.slice().sort(urutNama).map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></div>
        <div class="grup"><label>Tanggal</label><input type="date" id="tfTanggal" value="${tanggalLokal()}"></div>
      </div>
      <label>Barang yang dikirim</label>
      <p class="petunjuk">Transfer tidak boleh membuat stok minus — memindahkan barang yang tidak ada hanya memindahkan masalah ke cabang lain.</p>
      <div id="barisTf"></div>
      <button class="tombol" id="btnTambahBarisTf">+ Tambah baris</button>
      <div class="grup" style="margin-top:14px"><label>Catatan</label><input type="text" id="tfCatatan" placeholder="mis. dikirim lewat kurir X"></div>
      <div id="pesanTf"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanTransfer">Kirim</button>`);
    daftarPilihProduk = prod.produk;
    tambahBarisTf();
  }

  function tambahBarisTf() {
    $('#barisTf').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="tf">
        ${barisPilihProduk(3)}
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
      ], t.item)}`,
      `<button class="tombol" data-tutup="1">Tutup</button>
       <button class="tombol utama" data-cetak-transfer="${esc(uuid)}">Cetak</button>`);
  }

  /**
   * Susun dokumen A4 satu transfer. Fungsi MURNI: hanya membaca `t` dan
   * `konteks`, tidak menyentuh DOM dan tidak mencetak — supaya isinya bisa
   * diperiksa uji apa adanya, bukan lewat tangkapan layar.
   *
   * Ini dokumen ARSIP, bukan surat jalan yang dibawa kurir. Karena itu:
   *
   *   - **Harga modal TIDAK PERNAH ikut.** `apiDaftarTransfer` menyertakan
   *     `nilai_hpp` untuk peran ber-flag `lihat_harga_modal`, dan kertas yang
   *     keluar dari sini bisa berpindah tangan ke siapa saja di toko. Nilainya
   *     ada di layar bagi yang berhak; di kertas tidak.
   *   - **Kolom Diterima & Selisih hanya muncul kalau barangnya memang sudah
   *     diterima.** Mencetak dua kolom kosong pada dokumen yang baru dikirim
   *     membuat pembacanya mengira ada isian yang terlewat.
   *
   * Setiap nilai diloloskan `esc()`: yang menerima hasil fungsi ini
   * (`Struk.cetakDokumen`) memasangnya apa adanya ke dalam halaman.
   */
  function dokumenTransfer(t, konteks) {
    const k = konteks || {};
    const s = k.setting || {};
    const item = t.item || [];
    const sudahTerima = item.some(i => i.qty_terima !== null && i.qty_terima !== undefined);
    const jum = (kunci) => item.reduce((a, i) => a + (Number(i[kunci]) || 0), 0);

    const infoBaris = (kiri, kanan) =>
      `<tr><td class="k">${esc(kiri)}</td><td>${kanan}</td></tr>`;

    const kepalaKolom = ['<th>SKU</th>', '<th>Nama produk</th>', '<th class="n">Dikirim</th>']
      .concat(sudahTerima ? ['<th class="n">Diterima</th>', '<th class="n">Selisih</th>'] : []);

    const badan = item.length
      ? item.map(i => '<tr>' +
          `<td>${esc(i.sku)}</td><td>${esc(i.nama_produk)}</td>` +
          `<td class="n">${esc(i.qty_kirim)}</td>` +
          (sudahTerima
            ? `<td class="n">${i.qty_terima === null || i.qty_terima === undefined ? '—' : esc(i.qty_terima)}</td>` +
              `<td class="n">${i.selisih ? esc(i.selisih) : '—'}</td>`
            : '') +
        '</tr>').join('')
      : `<tr><td colspan="${kepalaKolom.length}">Tidak ada rincian barang.</td></tr>`;

    const kaki = item.length
      ? '<tfoot><tr>' +
          `<td colspan="2">${item.length} baris</td>` +
          `<td class="n">${esc(jum('qty_kirim'))}</td>` +
          (sudahTerima ? `<td class="n">${esc(jum('qty_terima'))}</td><td class="n">${esc(jum('selisih'))}</td>` : '') +
        '</tr></tfoot>'
      : '';

    return `<h1>${esc(String(s.nama_usaha || 'SINDIKAT KARTU').toUpperCase())}</h1>` +
      (s.alamat_usaha ? `<p class="sub">${esc(s.alamat_usaha)}</p>` : '') +
      (s.telepon_usaha ? `<p class="sub">${esc(s.telepon_usaha)}</p>` : '') +
      `<h2>BUKTI TRANSFER ANTAR CABANG</h2>
      <table class="info">
        ${infoBaris('No dokumen', `<strong>${esc(t.no_dokumen)}</strong>`)}
        ${infoBaris('Status', esc(t.status))}
        ${infoBaris('Dari', esc(t.cabang_asal) + ' &rarr; ' + esc(t.cabang_tujuan))}
        ${infoBaris('Dikirim', esc(waktuTampil(t.tanggal_kirim)) + ' oleh ' + esc(t.user_kirim))}
        ${t.tanggal_terima
            ? infoBaris('Diterima', esc(waktuTampil(t.tanggal_terima)) + ' oleh ' + esc(t.user_terima))
            : ''}
        ${t.catatan ? infoBaris('Catatan kirim', esc(t.catatan)) : ''}
        ${t.catatan_terima ? infoBaris('Catatan terima', esc(t.catatan_terima)) : ''}
      </table>
      <table class="isi">
        <thead><tr>${kepalaKolom.join('')}</tr></thead>
        <tbody>${badan}</tbody>
        ${kaki}
      </table>
      <p class="kaki">Dicetak ${esc(waktuTampil(k.waktu))} oleh ${esc(k.user || '—')} ·
        ${esc(String(s.nama_usaha || 'SINDIKAT KARTU'))} · POS SINDIKAT KARTU v${esc(k.versi || '')}</p>`;
  }

  function cetakTransfer(uuid) {
    const t = ($('#isiTransfer')._rows || []).find(x => x.uuid === uuid);
    if (!t) return;
    /* Waktu cetak diambil di sini, bukan di dalam penyusunnya: fungsi yang
       memanggil `new Date()` sendiri tidak bisa diuji tanpa memalsukan jam.

       Jamnya dirakit dari komponen LOKAL, bukan `toISOString()` — persis alasan
       yang sudah tertulis di `tanggalLokal()`: toISOString itu UTC, dan di WIB
       (UTC+7) setiap cetakan sebelum pukul 07.00 akan tertanggal SEHARI
       SEBELUMNYA. Pada dokumen arsip, tanggal yang meleset sehari adalah
       satu-satunya isi yang benar-benar dipakai orang untuk mencarinya. */
    const kini = new Date();
    const isi = dokumenTransfer(t, {
      setting: APP_STATE.setting || {},
      user: (APP_STATE.user && APP_STATE.user.nama) || '',
      versi: CONFIG.VERSI,
      waktu: tanggalLokal(kini) + 'T' + kini.toTimeString().substring(0, 8)
    });
    try { Struk.cetakDokumen('Transfer ' + t.no_dokumen, isi); }
    catch (e) { toast(e.message); }
  }

  /* ==================== PERMINTAAN BARANG ==================== */

  /* Warna lencana mengikuti ARTI, bukan urutan: kuning = ada pekerjaan yang
     belum selesai, hijau = tuntas, abu = tidak ada lagi yang perlu dikerjakan.
     MENUNGGU dan SEBAGIAN sama-sama kuning dengan sengaja — bagi admin gudang
     keduanya berarti hal yang sama persis: masih ada yang harus disiapkan. */
  const LENCANA_PERMINTAAN = {
    MENUNGGU: 'kuning', SEBAGIAN: 'kuning', SELESAI: 'hijau', DIBATALKAN: ''
  };

  const _totalMinta  = (t) => t.item.reduce((a, i) => a + i.qty_minta, 0);
  const _totalProses = (t) => t.item.reduce((a, i) => a + Math.min(i.qty_proses, i.qty_minta), 0);

  async function muatPermintaan() {
    memuat('#isiPermintaan');
    try {
      const rows = await API.daftarPermintaan({});
      /* Antrean gudang: yang HARUS dikerjakan orang yang sedang membuka layar
         ini. Disaring dengan `bisa_diproses` dari server — bukan dengan
         menghitung status di sini — supaya aturan siapa-boleh-apa hanya tinggal
         di satu tempat. */
      const antre = bolehIzin('permintaan', 'setujui') ? rows.filter(r => r.bisa_diproses) : [];

      $('#isiPermintaan').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            ${antre.length ? `<span class="lencana kuning">${antre.length} menunggu disiapkan</span>` : ''}
            <div style="flex:1"></div>
            ${bolehIzin('permintaan', 'buat')
              ? '<button class="tombol utama" id="btnPermintaanBaru">+ Minta barang</button>' : ''}
          </div>
          <p class="petunjuk">Permintaan barang adalah <strong>daftar pekerjaan untuk gudang</strong>, bukan transaksi:
            membuatnya tidak menggerakkan stok dan tidak membuat jurnal. Saat gudang menekan <strong>Siapkan</strong>,
            jumlah yang benar-benar disiapkan langsung menjadi dokumen <strong>Transfer</strong> — lengkap dengan FIFO
            dan jurnalnya — dan cabang tujuan tetap harus mengonfirmasi penerimaan di menu Transfer.
            Sisanya boleh disiapkan menyusul; statusnya menjadi <em>Sebagian</em> sampai seluruh baris terpenuhi.</p>
        </div>

        ${antre.length ? `<div class="kartu">
          <h3>Menunggu disiapkan gudang Anda</h3>
          ${tabel([
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Untuk', kunci: 'cabang_tujuan' },
            { judul: 'Diminta', tgl: true, kunci: 'tanggal' },
            { judul: 'Kemajuan', render: r => `${_totalProses(r)} / ${_totalMinta(r)} pcs` },
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_PERMINTAAN[r.status] || ''}">${esc(r.status)}</span>` },
            { judul: '', render: r => `<button class="tombol kecil sukses" data-proses-permintaan="${esc(r.uuid)}">Siapkan</button>` }
          ], antre)}
        </div>` : ''}

        <div class="kartu">
          <h3>Semua permintaan</h3>
          ${tabel([
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'No dokumen', kunci: 'no_dokumen' },
            { judul: 'Rute', render: r => `${esc(r.cabang_asal)} &rarr; ${esc(r.cabang_tujuan)}` },
            { judul: 'Peminta', kunci: 'nama_peminta' },
            { judul: 'Kemajuan', render: r => `${_totalProses(r)} / ${_totalMinta(r)} pcs
              <div class="meta-kecil">${r.item.length} baris${r.transfer.length ? ' &middot; ' + r.transfer.length + ' transfer' : ''}</div>` },
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_PERMINTAAN[r.status] || ''}">${esc(r.status)}</span>` },
            { judul: '', render: r => `
              <button class="tombol kecil" data-detail-permintaan="${esc(r.uuid)}">Detail</button>
              ${r.bisa_dibatalkan && bolehIzin('permintaan', 'hapus')
                ? `<button class="tombol kecil bahaya" data-batal-permintaan="${esc(r.uuid)}">Batal</button>` : ''}` }
          ], rows, { kosong: 'Belum ada permintaan barang' })}
        </div>`;
      $('#isiPermintaan')._rows = rows;
    } catch (e) { galat('#isiPermintaan', e); }
  }

  async function formPermintaanBaru() {
    lepasUuidDokumen('permintaan');          // dokumen BARU — lihat uuidDokumen()
    /* `daftarCabangAdmin` menuntut izin `cabang.lihat`, dan Staf Gudang tidak
       punya itu. Ditangkap lalu jatuh ke daftar yang sudah ada di memori —
       pola yang sama persis dipakai formKirimTransfer, dan alasannya sama:
       layar yang mati total karena satu daftar hiasan tidak bisa dibaca. */
    const [prod, cab] = await Promise.all([
      API.daftarProduk({ ramping: true }), API.daftarCabangAdmin().catch(() => [])
    ]);
    const semua = (cab.length ? cab.filter(c => c.aktif).map(c => c.kode_cabang)
                              : APP_STATE.daftarCabangSemua).slice().sort(urutNama);
    /* Yang dikunci cabang TUJUAN, bukan asal — sama dengan yang dijaga server.
       Kepala cabang meminta untuk cabangnya sendiri; pemilik dan manajer, yang
       berbendera akses lintas cabang, bebas memilih untuk cabang mana pun. */
    const lintas = !!APP_STATE.flag?.akses_lintas_cabang;
    const tujuanBoleh = lintas ? semua : [APP_STATE.cabang];
    const asalBoleh = semua.filter(k => k !== (lintas ? '' : APP_STATE.cabang));

    if (!asalBoleh.length) {
      return bukaModal('Minta barang',
        '<div class="pesan info">Belum ada cabang lain sebagai gudang asal. Tambahkan cabang dulu di menu Cabang.</div>');
    }

    bukaModal('Minta barang ke gudang', `
      <div class="baris3">
        <div class="grup"><label>Diminta ke gudang *</label><select id="pmAsal">
          ${asalBoleh.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select></div>
        <div class="grup"><label>Untuk cabang *</label><select id="pmTujuan"${lintas ? '' : ' disabled'}>
          ${tujuanBoleh.map(k => `<option value="${esc(k)}"${k === APP_STATE.cabang ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div class="grup"><label>Tanggal</label><input type="date" id="pmTanggal" value="${tanggalLokal()}"></div>
      </div>
      <label>Barang yang diminta</label>
      <p class="petunjuk">Stok gudang <strong>tidak</strong> diperiksa di sini — yang tahu isi rak adalah gudang, saat
        menyiapkannya. Satu SKU cukup satu baris: gabungkan qty-nya, jangan menulisnya dua kali.</p>
      <div id="barisPm"></div>
      <button class="tombol" id="btnTambahBarisPm">+ Tambah baris</button>
      <div class="grup" style="margin-top:14px"><label>Catatan</label>
        <input type="text" id="pmCatatan" placeholder="mis. stok etalase habis, butuh sebelum akhir pekan"></div>
      <div id="pesanPm"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" id="btnSimpanPermintaan">Kirim permintaan</button>`);
    daftarPilihProduk = prod.produk;

    /* Stok kedua cabang dibaca dari store `stok_cabang` di perangkat — yang
       sama dengan yang dipakai kasir untuk mengintip stok cabang lain. Instan
       dan tetap jalan saat internet mati; umurnya sesegar tarikan terakhir
       (tiap 10 menit, lihat Sync.mulai). Itu cukup untuk memutuskan MEMINTA;
       yang memastikan isi rak tetap gudang, saat menyiapkannya. */
    const semuaStok = await DB.all('stok_cabang');
    const peta = {};
    semuaStok.forEach(r => {
      const k = String(r.cabang) + '|' + String(r.sku);
      peta[k] = (peta[k] || 0) + Number(r.qty || 0);
    });
    const segarkanStokPm = () => {
      stokDuaCabang = { asal: nilai('pmAsal'), tujuan: nilai('pmTujuan'), peta };
      /* Daftar yang sedang TERBUKA digambar ulang. Tanpa ini, mengganti cabang
         sementara daftarnya terbuka meninggalkan angka cabang yang lama di
         layar — angka yang salah dan tidak menyebut dirinya salah. */
      const kotak = $$('.cari-prd').find(k =>
        !k.parentElement.querySelector('.hasil-prd').classList.contains('sembunyi'));
      if (kotak) gambarHasilProduk(kotak);
    };
    segarkanStokPm();
    $('#pmAsal').addEventListener('change', segarkanStokPm);
    $('#pmTujuan').addEventListener('change', segarkanStokPm);

    tambahBarisPm();
  }

  function tambahBarisPm() {
    $('#barisPm').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="pm">
        ${barisPilihProduk(3)}
        <input type="text" data-f="kode_varian" placeholder="varian (opsional)" style="flex:2">
        <input type="number" data-f="qty" placeholder="qty" value="1">
        ${barisHapus}
      </div>`);
  }

  function dialogProsesPermintaan(uuid) {
    lepasUuidDokumen('proses_permintaan');   // dokumen BARU — lihat uuidDokumen()
    const t = ($('#isiPermintaan')._rows || []).find(x => x.uuid === uuid);
    if (!t) return;
    /* Baris yang sisanya sudah nol tetap DITAMPILKAN, hanya tidak bisa diisi.
       Menyembunyikannya membuat dokumen di layar tidak lagi sama dengan dokumen
       yang diminta cabang, dan orang yang membandingkannya dengan kertas akan
       mengira ada baris yang hilang. */
    bukaModal(`Siapkan barang &mdash; ${esc(t.no_dokumen)}`, `
      <p class="petunjuk">Untuk <strong>${esc(t.cabang_tujuan)}</strong>, diminta ${esc(tglTampil(t.tanggal))}
        oleh ${esc(t.nama_peminta)}. Isi jumlah yang <em>benar-benar disiapkan</em> &mdash; boleh kurang dari yang
        diminta, sisanya bisa menyusul. Menekan tombol di bawah <strong>langsung membuat dokumen transfer</strong>
        dan mengeluarkan stok dari gudang ${esc(t.cabang_asal)}.</p>
      ${t.catatan ? `<p class="petunjuk">Catatan peminta: ${esc(t.catatan)}</p>` : ''}
      <div class="gulir-x"><table>
        <thead><tr><th>Produk</th><th class="angka">Diminta</th><th class="angka">Sudah</th>
          <th class="angka">Sisa</th><th class="angka" style="width:120px">Disiapkan</th></tr></thead>
        <tbody>${t.item.map(i => `<tr>
          <td>${esc(i.nama_produk)}<div class="meta-kecil">${esc(i.sku)}${i.kode_varian ? ' &middot; ' + esc(i.kode_varian) : ''}</div></td>
          <td class="angka">${i.qty_minta}</td>
          <td class="angka">${i.qty_proses}</td>
          <td class="angka">${i.qty_sisa}</td>
          <td><input type="number" data-siap-baris="${i.baris}" value="${i.qty_sisa}"
                     min="0" max="${i.qty_sisa}"${i.qty_sisa ? '' : ' disabled'}></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="grup" style="margin-top:12px"><label>Catatan pengiriman</label>
        <input type="text" id="pmCatatanProses" placeholder="mis. dikirim lewat kurir X"></div>
      <div id="pesanProses"></div>`,
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol sukses" id="btnKonfirmasiProses" data-uuid="${esc(uuid)}">Siapkan &amp; kirim</button>`);
  }

  function detailPermintaan(uuid) {
    const t = ($('#isiPermintaan')._rows || []).find(x => x.uuid === uuid);
    if (!t) return;
    bukaModal(`Permintaan ${t.no_dokumen}`, `
      <p class="petunjuk">${esc(t.cabang_asal)} &rarr; ${esc(t.cabang_tujuan)} &middot;
        <span class="lencana ${LENCANA_PERMINTAAN[t.status] || ''}">${esc(t.status)}</span><br>
        Diminta ${esc(tglTampil(t.tanggal))} oleh ${esc(t.nama_peminta)}
        ${t.catatan ? `<br>Catatan: ${esc(t.catatan)}` : ''}
        ${t.status === 'DIBATALKAN' ? `<br>Dibatalkan ${esc(waktuTampil(t.tanggal_batal))} &mdash; ${esc(t.alasan_batal)}` : ''}</p>
      ${tabel([
        { judul: 'SKU', kunci: 'sku' },
        { judul: 'Nama', kunci: 'nama_produk' },
        { judul: 'Diminta', kunci: 'qty_minta', angka: true },
        { judul: 'Disiapkan', kunci: 'qty_proses', angka: true },
        { judul: 'Sisa', angka: true, render: i => i.qty_sisa
            ? `<span class="stok-kritis">${i.qty_sisa}</span>` : '&mdash;' }
      ], t.item)}
      <h3 style="margin-top:18px">Dokumen transfer yang memenuhinya</h3>
      <p class="petunjuk">Inilah yang menghitung kemajuan permintaan ini. Transfer yang dibatalkan tidak ikut
        dihitung &mdash; barangnya kembali ke gudang, jadi permintaannya kembali menunggu.</p>
      ${tabel([
        { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
        { judul: 'No dokumen', kunci: 'no_dokumen' },
        { judul: 'Status transfer', kunci: 'status' }
      ], t.transfer, { kosong: 'Belum ada satu pun kiriman' })}`);
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
    lepasUuidDokumen('opname');              // dokumen BARU — lihat uuidDokumen()
    /* Kegagalannya DIKATAKAN, bukan ditelan.

       Sampai 8 Sep 2026 catch-nya kosong, dan akibatnya mahal: kedua dropdown
       tinggal berisi "— semua kategori —", yang terbaca persis seperti "toko
       ini memang belum punya kategori". Orangnya lalu membaca petunjuk di
       bawahnya — "kalau dua-duanya dikosongkan, pilih cakupan Penuh" — dan
       menghitung SELURUH SKU aktif. Opname penuh itu berjam-jam kerja, dipilih
       karena satu panggilan yang gagal tanpa sepatah kata.

       Wizardnya tetap dibuka: Penuh dan Spot check tidak butuh daftar ini. */
    let f = { kategori: [], merek: [] };
    let galatFilter = '';
    try { f = await API.filterOpname(); } catch (e) { galatFilter = e.message || String(e); }

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
        ${galatFilter ? `<div class="pesan peringatan">Daftar kategori &amp; merek gagal dimuat
          (${esc(galatFilter)}), jadi kedua kolom di bawah kosong — itu <strong>bukan</strong>
          berarti tokonya tidak punya. Coba lagi sebentar lagi sebelum memilih cakupan Penuh.</div>` : ''}
        <div class="baris2">
          <div class="grup"><label>Kategori</label><select id="opKategori">
            <option value="">— semua kategori —</option>
            ${urutkanOleh(f.kategori || [], k => k.nama).map(k => `<option value="${esc(k.nama)}">${esc(k.nama)} (${k.jumlah})</option>`).join('')}
          </select></div>
          <div class="grup"><label>Merek</label><select id="opMerek">
            <option value="">— semua merek —</option>
            ${urutkanOleh(f.merek || [], k => k.nama).map(k => `<option value="${esc(k.nama)}">${esc(k.nama)} (${k.jumlah})</option>`).join('')}
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
      /* "Tutup" ada di sini sejak v1.51 karena sebelumnya TIDAK ada. Ketiga
         tombol lamanya berbuat sesuatu: "Batalkan opname" membuang SELURUH
         dokumennya, "Simpan sementara" menyimpan tapi tidak menutup, "Selesai
         menghitung" mengunci hitungan dan tidak bisa diurungkan. Orang yang
         cuma ingin menutup jendela akan mencari tombol paling kiri yang
         bukan tombol utama — dan menemukan tombol merah yang membuang
         hitungan ratusan barang yang sedang berjalan.

         Letaknya paling kiri, bukan setelah tombol merah: jalan keluar harus
         berada di tempat mata mencarinya, dan yang menghancurkan tidak boleh. */
      `<button class="tombol" id="btnTutupHitung">Tutup</button>
       <button class="tombol bahaya" data-batal-opname="${esc(d.uuid)}">Batalkan opname</button>
       <button class="tombol" id="btnSimpanHitungan" data-uuid="${esc(d.uuid)}">Simpan sementara</button>
       <button class="tombol utama" id="btnSelesaiHitung" data-uuid="${esc(d.uuid)}">Selesai menghitung</button>`);
  }

  function gambarReviewOpname(d) {
    const selisih = d.item.filter(i => i.selisih !== 0 && i.selisih !== undefined);
    const cocok = d.item.length - selisih.length;
    const punyaNilai = d.nilai_selisih !== undefined;

    bukaModal(`Hasil opname — ${d.no_dokumen}`, `
      <div class="petak" style="grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))">
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
             oleh ${esc(d.nama_user_posting || d.id_user_posting || '—')}${
               d.nama_user_posting && d.id_user_posting
                 ? ` <span class="kode-redup">${esc(d.id_user_posting)}</span>` : ''
             }. Untuk mengoreksi, buat opname baru.</div>`
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
    lepasUuidDokumen('retur');       // dokumen BARU — lihat uuidDokumen()
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

  async function gambarFormRetur(nota) {
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
        <div class="meta-kecil" data-sku-meta="${esc(i.sku)}" style="margin:-4px 0 8px 2px">${esc(i.nama_produk)} — dibeli ${i.qty} ${esc(i.satuan)}${
          i.sudah_diretur > 0 ? `, sudah diretur ${i.sudah_diretur}` : ''}</div>`).join('')
      : '';

    $('#formIsiRetur').innerHTML = `
      <hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">
      <label>Barang yang dikembalikan</label>
      <p class="petunjuk">Isi qty yang diretur. Barang <strong>rusak</strong> tidak masuk kembali ke stok jual —
        nilainya langsung dibebankan ke akun Barang Rusak/Hilang.</p>
      <div id="barisRt">${barisAwal}</div>
      ${nota ? '' : '<button class="tombol" id="btnTambahBarisRt">+ Tambah barang</button>'}

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
        <div class="total-baris besar" style="font-size:var(--fs-21)">
          <span id="rtLabelSelisih">Uang dikembalikan</span><span id="rtSelisih">Rp 0</span></div>
      </div>
      <div id="pesanRetur"></div>
      <button class="tombol sukses besar" id="btnSimpanRetur" style="margin-top:12px">Proses retur</button>`;

    await muatDaftarPilihProduk();
    hitungRetur();
  }

  /* Layar retur bekerja dari salinan lokal, bukan dari server: ia dibuka dari
     nota yang sudah ada dan tidak boleh menunggu jaringan hanya untuk mengisi
     daftar pilihan. Konsekuensinya salinan ini tidak membawa stok maupun harga
     beli terakhir — pemilihnya sudah menyembunyikan keduanya kalau kosong. */
  async function muatDaftarPilihProduk() {
    daftarPilihProduk = await DB.all('produk');
    lengkapiTipeBaris();
  }

  /**
   * Tempelkan tipe HP pada baris yang datang DARI NOTA, yang tidak pernah lewat
   * pemilih produk sama sekali.
   *
   * Baris itu menampilkan `nama_produk` seperti yang tercatat saat penjualan —
   * dan justru nama itulah yang berbunyi "TG OG Multi_Device" untuk 41 SKU
   * sekaligus. Tanpa tipe HP-nya, orang yang memproses retur tidak bisa tahu
   * barang mana yang sedang dikembalikan, padahal keterangannya ada di master.
   */
  function lengkapiTipeBaris() {
    $$('[data-sku-meta]').forEach(el => {
      const p = _produkSku(el.dataset.skuMeta);
      const tipe = p ? String(p.tipe_hp || '') : '';
      if (tipe && el.textContent.indexOf(tipe) === -1) {
        el.insertAdjacentHTML('beforeend', ` <span class="prd-kat">· ${esc(tipe)}</span>`);
      }
    });
  }

  function tambahBarisRetur(jenis) {
    const wadah = jenis === 'rt' ? '#barisRt' : '#barisRp';
    $(wadah).insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="${jenis}">
        ${barisPilihProduk(3)}
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
        uuid: uuidDokumen('retur'),
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
            <td class="angka" style="font-size:var(--fs-21);color:var(--bahaya)">${rp(d.uang_dikembalikan)}</td></tr>` : ''}
          ${d.tambahan_bayar ? `<tr class="tebal"><td>PELANGGAN MENAMBAH BAYAR</td>
            <td class="angka" style="font-size:var(--fs-21);color:var(--sukses)">${rp(d.tambahan_bayar)}</td></tr>` : ''}
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
    lepasUuidDokumen('retur_beli');  // dokumen BARU — lihat uuidDokumen()
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
        <div class="meta-kecil" data-sku-meta="${esc(i.sku)}" style="margin:-4px 0 8px 2px">${esc(i.nama_produk)} — dibeli ${i.qty} ${esc(i.satuan)}${
          i.sudah_diretur > 0 ? `, sudah diretur ${i.sudah_diretur}` : ''}</div>`).join('')
      : '';

    $('#formIsiReturBeli').innerHTML = `
      <hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">
      <label>Barang yang dikembalikan</label>
      <div id="barisRb">${baris}</div>
      ${beli ? '' : '<button class="tombol" id="btnTambahBarisRb">+ Tambah barang</button>'}

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
        <div class="total-baris besar" style="font-size:var(--fs-19);border:none;margin:0">
          <span>Nilai klaim ke supplier</span><span id="rbTotal">Rp 0</span></div>
      </div>
      <div id="pesanReturBeli"></div>
      <button class="tombol sukses besar" id="btnSimpanReturBeli" style="margin-top:12px">Proses retur pembelian</button>`;

    /* Dimuat juga saat retur berasal dari faktur: barisnya memang tidak lewat
       pemilih, tapi tipe HP-nya tetap perlu ditempelkan ke keterangan baris. */
    await muatDaftarPilihProduk();
    if (!beli) tambahBarisRb();
    hitungReturBeli();
  }

  function tambahBarisRb() {
    $('#barisRb').insertAdjacentHTML('beforeend', `
      <div class="baris-anak" data-anak="rb">
        ${barisPilihProduk(3)}
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
                ${APP_STATE.daftarCabangSemua.slice().sort(urutNama).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
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
    /* Rotasi arsip satu-satunya operasi di aplikasi ini yang MENGHAPUS data
       produksi, dan sampai v1.58 spanduknya hijau "SELESAI" apa pun yang
       terjadi — kegagalan hanya tercatat sebagai lencana merah kecil di kartu
       cabang, jauh di bawah. Pemilik menutup layarnya dengan yakin semuanya
       beres, padahal separuh sheet-nya sudah lenyap. */
    const gagal = String(d.status) === 'GAGAL';
    $('#hasilArsip').innerHTML = `
      <div class="pesan ${gagal ? 'galat' : (d.uji_coba ? 'info' : 'sukses')}" style="margin-top:14px">
        ${gagal ? `<strong>BERHENTI DI TENGAH</strong> — rotasi tidak selesai${
                    d.berhenti_di ? ' (berhenti di ' + esc(String(d.berhenti_di)) + ')' : ''}.
                   Baca peringatan di bawah, betulkan sebabnya, lalu jalankan lagi:
                   baris yang sudah pindah tidak akan tersalin dua kali.`
                : d.uji_coba ? '<strong>UJI COBA</strong> — tidak ada satu baris pun yang dipindah atau dihapus.'
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
                      piutang: '#isiPiutang', utang: '#isiUtang', pengguna: '#isiPengguna',
                      cabang: '#isiCabang', sistem: '#isiSistem', audit: '#isiAudit',
                      dashboard: '#isiDashboard', transfer: '#isiTransfer', retur: '#isiRetur',
                      permintaan: '#isiPermintaan',
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
      case 'produk':    return muatProduk();
      case 'stok':      return muatStok($('#stokKategori')?.value || '');
      case 'pembelian': return muatPembelian();
      case 'mitra':     return muatMitra();
      case 'petugas':   return muatPetugas();
      case 'poin':      return muatPoin();
      case 'piutang':   return muatPiutang();
      case 'utang':     return muatUtang();
      case 'pengguna':  return muatPengguna();
      case 'cabang':    return muatCabang();
      case 'sistem':    return muatSistem();
      case 'audit':     return muatAudit();
      case 'diskon':    return muatDiskon();
      case 'transfer':  return muatTransfer();
      case 'permintaan': return muatPermintaan();
      case 'opname':    return muatOpname();
      case 'returbeli': return muatReturbeli();
      case 'arsip':     return muatArsip();
      case 'retur':     return muatRetur();
    }
  }

  /* ==================== EVENT (delegasi tunggal) ==================== */

  function pasang() {
    /* PETA PENGGAMBAR ULANG MODE NONAKTIF.
       Didaftarkan di sini, bukan di sebelah masing-masing layar, supaya
       tujuh kunci itu terbaca sekaligus — kunci yang salah ketik menghasilkan
       tombol yang ditekan tanpa terjadi apa-apa, dan itu jenis kerusakan yang
       paling sulit dilihat. Ujinya membandingkan peta ini dengan seluruh
       `kunci:` yang dipakai di berkas ini.
       Layar Produk mereset halamannya: halaman 7 dari 3.500 produk aktif
       hampir pasti tidak ada di antara 47 yang nonaktif, dan `potongHal`
       yang menjepitnya diam-diam membuat orang mengira daftarnya melompat. */
    Object.assign(GAMBAR_NONAKTIF, {
      produk:    () => { halProduk = 1; gambarProduk(); },
      pelanggan: gambarMitra,
      supplier:  gambarMitra,
      petugas:   gambarPetugas,
      user:      gambarPengguna,
      perangkat: gambarPengguna,
      cabang:    gambarCabang
    });

    /* Klik judul kolom = urutkan. Pendengarnya SATU, di dokumen, bukan dipasang
       ulang tiap kali tabel digambar: seluruh tabel back office dibuat sebagai
       teks HTML yang mengganti innerHTML, jadi pendengar yang dipasang ke
       elemennya akan hilang pada penggambaran berikutnya — dan hilangnya tidak
       kelihatan sampai ada yang mengklik dan tidak terjadi apa-apa. */
    document.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-urut-kol]');
      if (th) urutkanTabel(th);
    });

    /* JARING PENGAMAN untuk seluruh penangan klik aksi back office.
       ------------------------------------------------------------------
       `tanganiKlikAksi` panjangnya 588 baris dan sebagian besar cabangnya
       berbentuk `return formX()` — mengembalikan Promise yang tidak ada yang
       menunggu. Sampai v1.56 tidak ada penangkap galat di luarnya, jadi setiap
       penolakan server di dalamnya menjadi unhandled rejection: modal tidak
       muncul, tidak ada toast, tidak ada apa-apa. Tombolnya ditekan dan layar
       diam saja.

       Yang memicunya nyata: `formPembelian()` memanggil `API.daftarSupplier()`,
       yang menuntut izin `supplier.lihat` — dan peran KEPALA_CABANG punya
       `pembelian:['lihat','buat']` tapi TIDAK punya modul `supplier` sama
       sekali. Dari lantai toko itu terbaca sebagai aplikasi rusak, bukan sebagai
       izin yang kurang, dan tidak ada satu pun jejak untuk mendiagnosisnya.

       Sengaja diletakkan sebagai pembungkus di SATU tempat, bukan try/catch di
       tiap cabang: cabang ke-89 yang ditulis nanti akan lupa. Cabang yang sudah
       punya try/catch sendiri tetap sah — yang lebih dekat menangani lebih dulu,
       dan yang lolos jatuh ke sini.

       Dicatat ke konsol SEKALIGUS ditoast. Toast hilang dalam beberapa detik dan
       tidak bisa disalin; tanpa jejak konsol yang tersisa untuk mendiagnosis
       hanya "katanya tidak bisa". */
    document.addEventListener('click', (e) => {
      tanganiKlikAksi(e).catch((x) => {
        console.error('Aksi back office gagal:', x);
        toast(x && x.message ? x.message : 'Aksi gagal dijalankan.', 'galat');
      });
    });

    async function tanganiKlikAksi(e) {
      /* `tr[data-rincian-beli]` ikut dicari supaya seluruh BARIS daftar
         pembelian bisa diklik. Yang membuat ini aman: closest() mengambil
         leluhur TERDEKAT, bukan yang pertama disebut di selektornya — jadi klik
         pada tombol Batal di dalam baris itu tetap mengembalikan tombolnya.
         `button` karena itu tidak boleh hilang dari sini: tanpa dia, menekan
         Batal berubah jadi membuka rincian dan pembatalannya tidak pernah
         jalan. */
      const t = e.target.closest('button, [data-tutup], tr[data-rincian-beli], tr[data-detail-transfer], [data-stiker-tambah]');
      if (!t) return;

      /* ---- KUNCI KONTEKS TINDAKAN ----
       * Selama satu tindakan orang berjalan, `body.tunggu` menyala dan CSS
       * mematikan SELURUH <button> — termasuk menu, jadi pindah layar ikut
       * tertahan. Tapi baris tabel yang bisa diklik BUKAN tombol, dan sejak
       * Riwayat transfer memakai klik-baris lubang itu melebar: menekan Simpan
       * lalu mengklik baris lain membuka dokumen kedua di tengah penyimpanan
       * yang belum selesai — tanpa satu pun galat.
       *
       * Dijaga DI SINI, bukan dengan menambah `pointer-events` di CSS: penjaga
       * yang bisa dijalankan uji lebih berharga daripada penjaga yang hanya
       * bisa dilihat mata, dan dua mekanisme untuk satu aturan cepat atau
       * lambat berselisih.
       *
       * TIDAK bisa mengunci selamanya: `body.tunggu` dilepas paling lama 150
       * detik oleh BATAS_TUNGGU di app.js, dan hanya dipasang oleh klik ORANG —
       * sinkronisasi latar tiap 5 menit tidak pernah menyalakannya. */
      if (document.body.classList.contains('tunggu')) return;

      const d = t.dataset;

      /* --- modal --- */
      if (d.tutup) return tutupModal();
      if (d.hapusBaris) return t.closest('.baris-anak').remove();
      if (d.tabm) {
        $$('.tab-modal button').forEach(b => b.classList.toggle('aktif', b === t));
        $$('[data-panel]').forEach(p => p.classList.toggle('sembunyi', p.dataset.panel !== d.tabm));
        return;
      }

      /* --- menu tindakan "⋮": SATU penangan untuk tujuh daftar ---
         Dicari lewat `aria-controls`, bukan lewat daftar id. Penangan yang
         menghafal id akan melupakan menu kedelapan, dan menu yang tidak pernah
         bisa dibuka adalah kerusakan yang tidak mengeluarkan satu pun galat. */
      const pemicuMenu = t.closest('.menu-lain > [aria-controls]');
      if (pemicuMenu) {
        const m = document.getElementById(pemicuMenu.getAttribute('aria-controls'));
        const buka = m && m.hidden;
        tutupMenuLain();
        if (m) {
          m.hidden = !buka;
          pemicuMenu.setAttribute('aria-expanded', String(!!buka));
          if (buka) m.querySelector('button')?.focus();
        }
        return;
      }
      /* Memilih apa pun di dalamnya menutupnya. Butir ekspor pun: unduhannya
         berjalan sendiri, dan menu yang tetap menganga sesudah tindakannya
         selesai terbaca seperti tombol yang tidak jadi menekan. */
      const dalamMenu = t.closest('.menu-lain .popover-menu');
      if (dalamMenu) {
        const pemicu = document.getElementById(dalamMenu.getAttribute('aria-labelledby'));
        setTimeout(() => { dalamMenu.hidden = true;
          pemicu?.setAttribute('aria-expanded', 'false'); }, 0);
      }

      /* --- mode nonaktif ---
         Satu tombol untuk tujuh daftar; yang membedakan cuma kuncinya. Fokus
         dikembalikan ke tombol "⋮" daftar yang bersangkutan SESUDAH gambar
         ulang, karena tombol yang barusan ditekan — baik butir menunya maupun
         tombol di spanduk — sudah tidak ada lagi sebagai simpul. */
      if (d.nonaktif) {
        const kunci = d.nonaktif;
        if (modeNonaktif.has(kunci)) modeNonaktif.delete(kunci);
        else modeNonaktif.add(kunci);
        tutupMenuLain();
        const gambar = GAMBAR_NONAKTIF[kunci];
        if (gambar) gambar();
        $(`[data-menu-kunci="${kunci}"]`)?.focus();
        return;
      }
      if (d.hal) {
        const arah = d.hal === 'next' ? 1 : -1;
        halProduk += arah;
        gambarBarisProduk();
        /* Digulirkan ke kepala tabel, bukan dibiarkan di tempat: menekan
           "Berikutnya" di kaki halaman lalu tetap berada di kaki berarti
           melihat baris 200 dari halaman baru, bukan baris 101. */
        $('#wadahTabelProduk')?.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
      if (t.id === 'btnProdukBaru')   return editorProduk(null);
      if (d.editProduk)               return editorProduk(d.editProduk);
      if (d.labelProduk)              return tambahKeranjangLabel(d.labelProduk);
      if (t.id === 'btnKeranjangLabel') return bukaKeranjangLabel();
      if (d.stikerTambah)             return tambahKeranjangLabel(d.stikerTambah);
      if (d.stikerBuang)              return buangStiker(d.stikerBuang);
      if (t.id === 'btnKosongkanLabel') return kosongkanKeranjangLabel();
      if (t.id === 'btnCetakLabel')   return kirimLabel();
      if (t.id === 'btnTambahSatuan') return tambahBarisSatuan();
      if (t.id === 'btnTambahTier')   return tambahBarisTier();
      if (t.id === 'btnTambahVarian') return tambahBarisVarian();
      if (t.id === 'btnTambahKompatibel') return tambahBarisKompatibel();
      if (t.id === 'btnSimpanProduk') return simpanProduk();
      if (t.id === 'btnNonaktifProduk') {
        if (!(await tanya('Nonaktifkan produk ini?',
              '<p class="petunjuk">Data historisnya tetap utuh — produk hanya hilang dari layar kasir.</p>',
              { ya: 'Nonaktifkan', jenis: 'bahaya' }))) return;
        try {
          await API.nonaktifkanProduk({ sku: nilai('pSku') });
          await Sync.tarikMaster(true);
          await sukses('Produk dinonaktifkan.', 'produk');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (t.id === 'btnTandaiPasang')   return dialogTandaiPasang();
      if (t.id === 'btnJalankanTandai') return jalankanTandaiPasang();
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
            bisa_jual: centang('ptBisaJual'), bisa_pasang: centang('ptBisaPasang'),
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

      /* --- utang supplier --- */
      if (d.bayarUtang) return dialogBayarUtang(d.bayarUtang, d.cabang);
      if (t.id === 'btnKonfirmasiBayarUtang') {
        t.disabled = true;
        try {
          const r = await API.bayarUtang({
            uuid: uuidDokumen('bayar_utang'),
            uuid_utang: d.uuid, cabang: d.cabang, tanggal: nilai('buTanggal'),
            jumlah: angka('buJumlah'), metode: nilai('buMetode'), referensi: nilai('buRef')
          });
          lepasUuidDokumen('bayar_utang');
          tutupModal();
          toast(r.lunas ? 'Utang LUNAS.' : 'Pembayaran tersimpan — sisa ' + rp(r.sisa));
          return muat('utang');
        } catch (e) {
          t.disabled = false;
          return pesan('#pesanBayarUtang',
            e.message + ' — tekan Simpan pembayaran sekali lagi, jumlahnya tidak akan tercatat dua kali.',
            'galat');
        }
      }

      /* --- piutang --- */
      if (d.bayarPiutang) return dialogBayarPiutang(d.bayarPiutang, d.cabang);
      if (t.id === 'btnKonfirmasiBayarPiutang') {
        t.disabled = true;
        try {
          const r = await API.bayarPiutang({
            uuid: uuidDokumen('bayar_piutang'),
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
                <tr><td>PIN</td><td><strong style="font-size:var(--fs-21)">${esc(r.pin)}</strong></td></tr>
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
        if (!(await tanya('Reset PIN pengguna ini?',
              '<p class="petunjuk">Seluruh sesi aktifnya ikut dicabut — ia harus masuk lagi.</p>',
              { ya: 'Reset PIN', jenis: 'bahaya' }))) return;
        try {
          const r = await API.resetPinUser({ id_user: d.resetPin });
          bukaModal('PIN berhasil direset', `
            <div class="pesan sukses">Catat sekarang — tidak akan ditampilkan lagi.</div>
            <table>
              <tr><td>PIN baru</td><td><strong style="font-size:var(--fs-21)">${esc(r.pin)}</strong></td></tr>
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
      if (d.hapusPerangkat) {
        const r = ($('#isiPengguna')._perangkat || [])
          .find(x => String(x.id_perangkat) === String(d.hapusPerangkat));
        /* Konfirmasinya menyebut perangkat yang MANA. "Hapus perangkat ini?"
           tidak bisa dijawab siapa pun yang baru saja menggeser daftar sepuluh
           baris — dan penghapusan ini tidak bisa diurungkan. */
        const ket = r
          ? `${r.kode} · ${r.nama}\nCabang ${r.cabang || '—'} · status ${r.status}` +
            `\nPemilik terakhir: ${String(r.user_terakhir || '') ? (
                ($('#isiPengguna')._user || []).find(u => String(u.id_user) === String(r.user_terakhir))?.nama
                || r.user_terakhir) : 'belum pernah dipakai'}`
          : d.hapusPerangkat;
        if (!(await tanya('Hapus perangkat ini dari daftar?',
              `<div class="pesan info" style="white-space:pre-line">${esc(ket)}</div>
               <p class="petunjuk">Riwayat nota &amp; shiftnya TIDAK ikut terhapus. Kalau
                  perangkat ini dipakai lagi, ia muncul kembali sebagai MENUNGGU.</p>`,
              { ya: 'Hapus perangkat', jenis: 'bahaya' }))) return;
        try {
          const h = await API.hapusPerangkat({ id_perangkat: d.hapusPerangkat });
          await muat('pengguna');
          toast('Perangkat ' + (h.kode || '') + ' dihapus' +
                (h.sesi_dicabut ? ' — ' + h.sesi_dicabut + ' sesi ikut dicabut.' : '.'));
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
      if (d.cetakTransfer)              return cetakTransfer(d.cetakTransfer);
      if (d.terimaTransfer)             return dialogTerimaTransfer(d.terimaTransfer);
      if (t.id === 'btnSimpanTransfer') {
        const item = kumpulkanAnak('tf').filter(i => i.sku && Number(i.qty) > 0)
          .map(i => ({ sku: i.sku, kode_varian: i.kode_varian || '', qty: Number(i.qty) }));
        if (!item.length) return toast('Minimal satu barang.', 'galat');
        t.disabled = true;
        try {
          const r = await API.kirimTransfer({
            uuid: uuidDokumen('transfer'),
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
        const alasan = await tanya('Batalkan transfer ini?',
          '<p class="petunjuk">Barang kembali ke cabang asal. Alasannya ikut tercatat.</p>',
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Batalkan transfer', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          await API.batalTransfer({ uuid: d.batalTransfer, alasan });
          await Sync.tarikStok();
          await sukses('Transfer dibatalkan, barang kembali ke cabang asal.', 'transfer');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      if (t.id === 'btnSegarkanStokLintas') {
        /* Ditarik ulang dari SERVER, lalu digambar ulang dari store yang baru
           saja diisi ulang. Tombolnya dinonaktifkan selama menunggu: tarikan
           seluruh cabang bisa memakan puluhan detik, dan tombol yang tetap
           hidup mengundang tekanan kedua yang menggandakan pekerjaannya. */
        t.disabled = true;
        try {
          await Sync.tarikStokSemuaCabang();
          await muatStok($('#stokKategori')?.value || '');
          toast('Stok seluruh cabang diperbarui.');
        } catch (x) {
          toast('Gagal memperbarui: ' + (x.message || x), 'galat');
          t.disabled = false;
        }
        return;
      }
      if (d.rincianBeli) return rincianPembelian(d.rincianBeli);

      if (d.batalPembelian) {
        const alasan = await tanya('Batalkan pembelian ini?',
          '<p class="petunjuk">Stok dan jurnalnya dibalik. Alasannya ikut tercatat.</p>',
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Batalkan pembelian', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          const r = await API.batalPembelian({ uuid: d.batalPembelian, cabang: APP_STATE.cabang, alasan });
          await Sync.tarikStok();
          await sukses(`Pembelian dibatalkan — ${rp(r.total)}, ${r.item} baris. Stok & jurnalnya sudah dibalik.`,
                       'pembelian');
        } catch (x) {
          /* Rinciannya ditampilkan, bukan cuma kalimat utamanya: kalau ditolak
             karena barangnya sudah bergerak, yang orang butuhkan justru daftar
             SKU mana yang sudah bergerak. */
          toast(x.message, 'galat');
          if (x.detail) {
            bukaModal('Tidak bisa dibatalkan', `<div class="pesan galat">${esc(x.message)}
              <ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`);
          }
        }
        return;
      }

      /* --- permintaan barang --- */
      if (t.id === 'btnPermintaanBaru')  return formPermintaanBaru();
      if (t.id === 'btnTambahBarisPm')   return tambahBarisPm();
      if (d.detailPermintaan)            return detailPermintaan(d.detailPermintaan);
      if (d.prosesPermintaan)            return dialogProsesPermintaan(d.prosesPermintaan);
      if (t.id === 'btnSimpanPermintaan') {
        const item = kumpulkanAnak('pm').filter(i => i.sku && Number(i.qty) > 0)
          .map(i => ({ sku: i.sku, kode_varian: i.kode_varian || '', qty: Number(i.qty) }));
        if (!item.length) return toast('Minimal satu barang.', 'galat');
        t.disabled = true;
        try {
          const r = await API.buatPermintaan({
            uuid: uuidDokumen('permintaan'),
            cabang_asal: nilai('pmAsal'), cabang_tujuan: nilai('pmTujuan'),
            tanggal: nilai('pmTanggal'), catatan: nilai('pmCatatan'), item
          });
          await sukses('Permintaan ' + r.no_dokumen + ' terkirim ke gudang.', 'permintaan');
        } catch (x) {
          $('#pesanPm').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (t.id === 'btnKonfirmasiProses') {
        /* uuid transfernya dibuat SEKALI di sini, bukan di server. Jaringan yang
           putus sesudah server selesai membuat transfernya membuat orang menekan
           tombol ini lagi; dengan uuid yang sama, kiriman kedua dikenali sebagai
           duplikat dan stok tidak keluar dua kali. */
        const uuidTf = uuidDokumen('proses_permintaan');
        t.disabled = true;
        const item = $$('[data-siap-baris]').map(i => ({
          baris: Number(i.dataset.siapBaris), qty_siap: Number(i.value || 0)
        }));
        try {
          const r = await API.prosesPermintaan({
            uuid: d.uuid, uuid_transfer: uuidTf, item, catatan: nilai('pmCatatanProses')
          });
          await Sync.tarikStok();
          await Sync.tarikStokSemuaCabang();
          await sukses(r.status === 'SELESAI'
            ? `Permintaan SELESAI &mdash; transfer ${r.no_dokumen_transfer} dibuat, menunggu konfirmasi cabang tujuan.`
            : `Sebagian disiapkan &mdash; transfer ${r.no_dokumen_transfer} dibuat. Sisanya masih menunggu.`,
            'permintaan');
        } catch (x) {
          $('#pesanProses').innerHTML = `<div class="pesan galat">${esc(x.message)}
            ${x.detail ? `<ul style="margin:8px 0 0 16px">${x.detail.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>`;
          t.disabled = false;
        }
        return;
      }
      if (d.batalPermintaan) {
        const alasan = await tanya('Batalkan permintaan ini?',
          '<p class="petunjuk">Alasannya ikut tercatat dan terbaca cabang yang meminta.</p>',
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Batalkan permintaan', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          await API.batalPermintaan({ uuid: d.batalPermintaan, alasan });
          await sukses('Permintaan dibatalkan.', 'permintaan');
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
            uuid: uuidDokumen('retur_beli'),
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
        if (sungguhan && !(await tanya('Jalankan rotasi SUNGGUHAN?',
              '<p class="petunjuk">Data dipindah ke berkas arsip dan dihapus dari berkas cabang.'
              + ' Penyalinannya diverifikasi lebih dulu, tapi tetap pastikan Anda sudah membaca'
              + ' hasil uji coba.</p>',
              { ya: 'Jalankan rotasi', jenis: 'bahaya' }))) return;
        t.disabled = true;
        $('#hasilArsip').innerHTML = '<div class="pesan info" style="margin-top:14px">Memproses… ini bisa memakan beberapa menit untuk data setahun penuh. Jangan tutup jendela.</div>';
        try {
          const r = await API.rotasiArsip({ tahun: Number(nilai('arsipTahun')),
                                            cabang: nilai('arsipCabang') || undefined,
                                            uji_coba: !sungguhan });
          gambarHasilArsip(r);
          if (sungguhan) {
            toast(String(r.status) === 'GAGAL'
                    ? 'Rotasi arsip BERHENTI di tengah — baca laporannya.'
                    : 'Rotasi arsip selesai.',
                  String(r.status) === 'GAGAL' ? 'galat' : undefined);
          }
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
            uuid: uuidDokumen('opname'),
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
      /* Menutup TIDAK boleh membuang hitungan diam-diam. Jendela ini digambar
         ulang dari data server setiap kali dibuka, jadi angka yang sudah
         diketik tapi belum disimpan memang hilang saat ditutup — dan itu harus
         dikatakan, bukan dibiarkan. Yang sudah tersimpan bertanda
         `.sudah-hitung`; sisanya yang terisi berarti belum. */
      if (t.id === 'btnTutupHitung') {
        const belum = $$('[data-hitung]').filter(i =>
          String(i.value).trim() !== '' && !i.classList.contains('sudah-hitung'));
        if (belum.length && !(await tanya('Tutup tanpa menyimpan?',
              `<div class="pesan peringatan">${belum.length} hitungan belum disimpan dan akan hilang.</div>`,
              { ya: 'Tutup saja', jenis: 'bahaya' }))) return;
        tutupModal();
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
            jamTampil(r.waktu_kunci)}.`);
        } catch (x) { toast(x.message, 'galat'); }
        t.disabled = false;
        return;
      }
      if (t.id === 'btnSelesaiHitung') {
        const item = hitunganTerisi();
        if (!item.length) return toast('Belum ada satu pun yang diisi.', 'galat');
        if (!(await tanya('Selesaikan penghitungan?',
              `<p class="petunjuk">${item.length} barang akan dikunci dan tidak bisa diubah lagi.</p>`,
              { ya: 'Selesaikan', jenis: 'bahaya' }))) return;
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
        if (!(await tanya('Posting opname?',
              '<p class="petunjuk">Stok disesuaikan dan selisihnya dibukukan. Tindakan ini tidak bisa dibatalkan.</p>',
              { ya: 'Posting', jenis: 'bahaya' }))) return;
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
        const alasan = await tanya('Batalkan opname ini?',
          '<p class="petunjuk">Hitungan yang sudah masuk tetap tersimpan, tapi opnamenya tidak diposting.</p>',
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Batalkan opname', jenis: 'bahaya' });
        if (!alasan) return;
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
        /* Dulu DUA dialog beruntun: confirm lalu prompt. Justru pasangan itu
           yang memicu kotak centang "Cegah halaman ini membuat dialog tambahan"
           di Chrome — dan sesudah dicentang, void berhenti bekerja tanpa satu
           pun tanda. Sekarang satu pertanyaan: keputusan dan alasannya sekalian. */
        const alasan = await tanya(`Void nota ${nota.no_nota}?`,
          `<div class="pesan peringatan">Senilai ${rp(nota.total)}. Seluruh nota dibalik —
             stok, jurnal, dan piutang terkait. Tidak bisa diurungkan.</div>`,
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Void nota', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          await API.voidPenjualan({ uuid: nota.uuid, alasan, cabang: APP_STATE.cabang });
          await Sync.tarikStok();
          await sukses('Nota ' + nota.no_nota + ' dibatalkan (void).', 'retur');
        } catch (x) {
          toast(x.message, 'galat');
        }
        return;
      }

      /* --- setting: kendali bersegmen ---
         Nilainya tidak disimpan di tombolnya melainkan dituliskan ke
         `<input type=hidden data-setting>` di sebelahnya, supaya penyimpan di
         bawah — yang menyapu SETIAP `[data-setting]` — tidak perlu tahu bentuk
         kendalinya. */
      if (d.segmen) {
        const isi = $(`#isiSistem [data-setting="${d.segmen}"]`);
        if (isi) isi.value = d.segmenNilai;
        $$(`#isiSistem [data-segmen="${d.segmen}"]`)
          .forEach(b => b.classList.toggle('pas', b === t));
        segarkanJejakSetting();
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
          /* Yang baru tersimpan JADI titik nolnya yang baru. Tanpa baris ini
             tombolnya tetap menyala dan jejaknya tetap menyebut angka yang
             sudah tidak berlaku — layar yang bersih terbaca sebagai layar yang
             masih punya perubahan tertunda. */
          _awalSetting = bacaSetting();
          segarkanJejakSetting();
          toast('Pengaturan tersimpan.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
    }

    /* --- pemilih produk ---
       Pendengarnya di dokumen, sama alasannya dengan pengurut tabel: barisnya
       disisipkan lewat insertAdjacentHTML setiap kali "+ Tambah baris" ditekan,
       jadi pendengar yang menempel ke elemennya hanya hidup untuk baris yang
       kebetulan ada saat itu. */
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('cari-prd')) {
        /* Mengetik ulang MEMBATALKAN pilihan sebelumnya. Kalau tidak, kotaknya
           menampilkan barang yang satu sementara SKU tersembunyi masih memegang
           barang yang lain — dan yang tersimpan adalah yang tidak terlihat. */
        e.target.closest('.baris-anak').querySelector('input[data-f="sku"]').value = '';
        return gambarHasilProduk(e.target);
      }
      // Angka yang disentuh orang berhenti dianggap isian otomatis.
      if (e.target.dataset && e.target.dataset.auto) delete e.target.dataset.auto;
    });

    document.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('cari-prd')) gambarHasilProduk(e.target);
      else tutupHasilProduk();
    });

    // Fase CAPTURE: gulir di dalam modal tidak menggelembung ke dokumen.
    document.addEventListener('scroll', ikutiGulir, true);
    window.addEventListener('resize', ikutiGulir);

    document.addEventListener('click', (e) => {
      const b = e.target.closest('.baris-prd');
      if (b) return pilihProduk(b.closest('.baris-anak'), b.dataset.sku);
      if (!e.target.closest('.pilih-produk')) tutupHasilProduk();
    });

    /* Papan ketik penuh: ↓ ↑ pindah, Enter pilih, Esc tutup. Tanpa ini pemilih
       yang digambar sendiri justru MUNDUR dari <datalist> bawaan, yang sejak
       awal bisa dikemudikan tanpa menyentuh tetikus — dan pekerjaan pembelian
       memang dikerjakan dua tangan di papan ketik. */
    document.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('cari-prd')) return;
      const wadah = e.target.parentElement.querySelector('.hasil-prd');
      if (!wadah || wadah.classList.contains('sembunyi')) {
        if (e.key === 'ArrowDown') gambarHasilProduk(e.target);
        return;
      }
      const baris = Array.from(wadah.querySelectorAll('.baris-prd'));
      if (!baris.length) return;
      const kini = baris.findIndex(x => x.classList.contains('aktif'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const ke = e.key === 'ArrowDown'
          ? Math.min(baris.length - 1, kini + 1) : Math.max(0, kini - 1);
        baris.forEach((x, i) => x.classList.toggle('aktif', i === ke));
        baris[ke].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pilihProduk(e.target.closest('.baris-anak'), baris[Math.max(0, kini)].dataset.sku);
      } else if (e.key === 'Escape') {
        wadah.classList.add('sembunyi');
      }
    });

    /* --- pencarian & hitung ulang --- */
    /* `async`: satu cabang di dalamnya (penyaring Terlaris) perlu menarik data
       penjualan sekali sebelum menggambar ulang. */
    document.addEventListener('input', async (e) => {
      if (e.target.id === 'cariProduk') {
        /* Tanpa jeda, tanpa panggilan server, tanpa menggambar ulang kolomnya
           sendiri. Katalognya sudah di tangan sejak layar dibuka; yang berubah
           cuma baris mana yang ditampilkan. Jeda 300ms dulu ada karena tiap
           ketikan menembak server — sekarang tidak ada yang perlu ditunggu, dan
           menunda 300ms hanya membuat huruf terasa tertinggal. */
        kueriProduk = e.target.value;
        /* Kembali ke halaman 1 setiap kali saringannya berubah. Tanpa ini,
           mengetik saat sedang di halaman 12 menampilkan halaman 12 dari hasil
           yang baru — yang hampir selalu kosong, dan terbaca sebagai "tidak ada
           produk cocok" padahal cocoknya ada di halaman 1. */
        halProduk = 1;
        gambarBarisProduk();
        return;
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
        /* Ikut disaring di perangkat. Fokus tidak perlu dikembalikan lagi karena
           elemennya tidak diganti — dulu ia harus, dan pengguna papan ketik
           terkunci di kategori pertama setiap kali lupa. */
        kategoriProduk = e.target.value;
        halProduk = 1;
        gambarBarisProduk();
        return;
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
        /* Keduanya MENGUBAH BENTUK bar alat — kolom Terjual dan sepasang kolom
           tanggal muncul atau hilang — jadi di sini memang harus digambar penuh,
           dan fokusnya dikembalikan. Beda dengan mengetik di kolom cari, yang
           tidak mengubah bentuk apa pun. */
        if (id === 'kolomProduk') kolomProduk = e.target.value;
        else saringProduk = e.target.value;
        halProduk = 1;   /* jumlah barisnya berubah — lihat catatan di kolom cari */
        /* Penyaring yang butuh data penjualan menariknya SEKARANG. Penjaga
           "jangan tarik dua kali" ada DI DALAM `muatTerjual()`, satu tempat
           saja — penjaga kedua di sini akan membuat penjaga yang sebenarnya
           tidak pernah teruji. Kalau penarikannya gagal, `gambarProduk()` yang
           mengembalikan pilihannya ke "Semua produk". */
        const s = SARING_PRODUK.find(x => x.id === saringProduk);
        if (s && s.butuhTerjual) {
          e.target.disabled = true;
          await muatTerjual();
          e.target.disabled = false;
        }
        gambarProduk();
        $('#' + id)?.focus();
        return;
      }
      if (e.target.id === 'terjualDari' || e.target.id === 'terjualSampai') {
        /* Rentangnya diganti: petanya WAJIB ditarik ulang. `terjualSiap()`
           membandingkan kunci rentang, jadi peta rentang lama tidak akan
           terpakai diam-diam untuk rentang baru. */
        const id = e.target.id;
        rentangTerjual = { dari: $('#terjualDari').value || rentangTerjual.dari,
                           sampai: $('#terjualSampai').value || rentangTerjual.sampai };
        e.target.disabled = true;
        await muatTerjual();
        e.target.disabled = false;
        gambarProduk();
        $('#' + id)?.focus();
        return;
      }
      /* Lingkupnya digambar ULANG dari awal, bukan disaring: kolomnya sendiri
         yang berbeda antara "cabang ini" dan "semua cabang". */
      if (e.target.id === 'stokLingkup') {
        stokLintas = e.target.value === 'semua';
        return muatStok($('#stokKategori')?.value || '');
      }
      if (e.target.id === 'cariStok' || e.target.id === 'stokKategori') {
        const q = ($('#cariStok')?.value || '').toLowerCase();
        const kat = $('#stokKategori')?.value || '';
        const wadah = $('#isiStok');
        const rows = (wadah._rows || []).filter(r =>
          (!kat || r.kategori === kat) &&
          (r.sku + ' ' + r.nama).toLowerCase().includes(q));
        $('#tabelStok').innerHTML = stokLintas
          ? tabelStokLintas(rows, wadah._cabang || [])
          : tabelStok(rows, wadah._punyaNilai);
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
      /* Periode dashboard menembak ulang API — beda dengan penyaring layar Produk
         yang menggambar ulang dari data di tangan. Di sini memang harus: omzet,
         peringkat, dan pembandingnya semua dihitung server per rentang tanggal,
         dan menyalin perhitungan itu ke perangkat berarti dua tempat menghitung
         satu angka. */
      if (e.target.id === 'periodeDash') { periodeDash = e.target.value; muatDashboard(); return; }
      if (e.target.id === 'imporEntitas') {
        $('#imporKolom').textContent = KOLOM_IMPOR[e.target.value] || '';
        $('#hasilPratinjau').innerHTML = '';
        $('#btnJalankanImpor').disabled = true;
        /* Berkas yang sudah dibaca DILUPAKAN saat jenis datanya berganti:
           kolom berkas produk tidak berarti apa-apa untuk impor pelanggan, dan
           menggambar pratinjau lama di atas jenis baru adalah cara tercepat
           mengimpor berkas yang salah. */
        barisBerkas = null;
        /* Centangnya DISEMBUNYIKAN, bukan sekadar diabaikan. Opsi yang terlihat
           tapi tidak berpengaruh mengajarkan hal yang salah: pemakainya
           mencentangnya untuk impor pelanggan, tidak terjadi apa-apa, dan
           kepercayaannya pada centang itu ikut hilang untuk impor produk.
           Nilainya juga dipadamkan supaya tidak ada keadaan tersembunyi yang
           menyala saat ia kembali ke produk. */
        {
          const produk = e.target.value === 'produk';
          $('#barisLewatiAda').style.display = produk ? 'flex' : 'none';
          if (!produk) $('#imporLewatiAda').checked = false;
        }
        return;
      }
      /* Mencentang/melepas "lewati SKU yang sudah terdaftar" menggambar ulang
         pratinjau dari berkas yang SAMA — tanpa ini, angka di layar tetap
         angka aturan yang lama sementara tombol Impor mengirim aturan yang
         baru. */
      if (e.target.id === 'imporLewatiAda') { await pratinjauImpor(); return; }
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
          await pratinjauImpor(d.baris);
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
      /* Menu "⋯" ikut aturan yang sama. `.menu-lain` mencakup tombol DAN
         popovernya, jadi klik di dalam keduanya tidak menutupnya di sini —
         yang menutup sesudah sebuah butir dipilih adalah penangan butirnya
         sendiri. */
      if (!e.target.closest('.menu-lain')) tutupMenuLain();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      tutupMenuEkspor();
      /* Esc mengembalikan fokus ke tombolnya. Menutup menu lalu meninggalkan
         fokus di elemen yang baru saja disembunyikan membuat Tab berikutnya
         melompat ke tempat yang tidak bisa ditebak siapa pun. */
      const menuBuka = menuLainTerbuka();
      const pemicuBuka = menuBuka &&
        document.getElementById(menuBuka.getAttribute('aria-labelledby'));
      tutupMenuLain();
      pemicuBuka?.focus();
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
  return { muat, pasang, toast, modal: bukaModal, tutupModal, tanya, tabel, tombolEkspor };
})();
