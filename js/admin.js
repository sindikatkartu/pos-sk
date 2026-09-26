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
     membuat orang mengira ada yang rusak.

     `nilai(r)` (v1.161.0) adalah nilai mentah untuk kolom `render` — kolom Poin
     menggambar '—' untuk 0 dan Eceran menggambar 'Rp 34.000'; tanpa nilai
     mentah keduanya diurutkan menurut teks selnya. `opsi.urut` ({judul, arah})
     menandai judul yang sedang mengurutkan pada tabel yang digambar ulang
     tiap kali diurutkan (daftar berhalaman) — pada tabel lain penandanya
     dipasang `urutkanTabel` langsung ke elemennya.

     `opsi.lebar` ({judul: px}) mengunci lebar kolom lewat `width` pada <th>
     — lihat `lebarKolomDaftar`: daftar berhalaman digambar ulang tiap urut,
     pindah halaman, dan ketikan; tanpa ini lebar kolomnya mengikuti 100 baris
     yang kebetulan tampil dan seluruh tabel bergeser beberapa piksel tiap
     kali (pemilik, 10 Sep 2026: "tabelnya lari-lari"). */
  const nilaiUrut = (k, r) => k.kunci ? r[k.kunci] : k.nilai ? k.nilai(r) : undefined;
  const tabelPolos = (kolom, baris, opsi = {}) => `
    <div class="gulir-x${opsi.kelasWadah ? ' ' + opsi.kelasWadah : ''}">
    <table>
      <thead><tr>${kolom.map((k, i) => `<th class="${k.angka ? 'angka' : ''} ${k.kelas || ''}${
        k.judul ? ' bisa-urut' : ''}"${k.judul ? ` data-urut-kol="${i}"` : ''}${
        opsi.urut && k.judul && opsi.urut.judul === k.judul
          ? ` data-arah="${opsi.urut.arah}" aria-sort="${opsi.urut.arah === 'naik' ? 'ascending' : 'descending'}"` : ''
        }${opsi.lebar && (opsi.lebar[k.judul || '#' + i]) ? ` style="width:${opsi.lebar[k.judul || '#' + i]}px"` : ''
        }>${esc(k.judul)}</th>`).join('')}</tr></thead>
      <tbody>${baris.length ? baris.map(r => `<tr ${opsi.dataAttr ? opsi.dataAttr(r) : ''}>${
        kolom.map(k => `<td data-l="${esc(k.judul)}"${
          (k.kunci || k.nilai) ? ` data-urut="${esc(nilaiUrut(k, r) ?? '')}"` : ''} class="${k.angka ? 'angka' : ''} ${k.kelas || ''}">${
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

  /**
   * LEBAR KOLOM TETAP untuk daftar berhalaman — dihitung dari SELURUH baris.
   *
   * Tabel HTML berlayout otomatis menentukan lebar kolom dari isi yang ADA:
   * kolom Modal selebar "Rp 6.000" di halaman satu, selebar "Rp 16.500" di
   * halaman dua. Daftar berhalaman digambar ulang tiap urut, pindah halaman,
   * dan ketikan — dan setiap kali itu seluruh kolom bergeser beberapa piksel.
   * Pemilik melihatnya sesudah v1.161.0 di laptop: "tabelnya lari-lari".
   *
   * Jalan keluarnya bukan `table-layout: fixed` dengan lebar tebakan — kolom
   * yang ditebak terlalu sempit memotong angkanya. Lebar tiap kolom diukur
   * dari nilai TERLEBAR di seluruh daftar (bukan 100 yang tampil), sekali per
   * daftar, lalu dipasang sebagai `width` pada <th>: layout otomatis tetap
   * bebas melebar bila ada isi yang lebih lebar, tapi tidak pernah menyempit
   * lagi — jadi tidak ada halaman yang lebih sempit dari halaman lain.
   * Kolom `lentur` (Nama) sengaja tidak dikunci: ia yang menyerap sisa lebar.
   *
   * Diukur dengan canvas, bukan dengan menggambar 3.500 sel: teks unik per
   * kolom biasanya ratusan, dan angkanya ditulis dengan `tabular-nums`, jadi
   * setiap digit diukur sebagai "0" (lebar digit tabular semuanya sama).
   * Hasilnya di-cache per larik baris + susunan kolom; larik baru (tarik
   * ulang) = hitung ulang.
   */
  const LEBAR_KOLOM = new WeakMap();
  function lebarKolomDaftar(kolom, semua, wadah) {
    if (!semua || !semua.length || !wadah) return null;
    const tanda = kolom.map(k => k.judul + (k.tanda ? ':' + k.tanda() : '')).join('|');
    const ada = LEBAR_KOLOM.get(semua);
    if (ada && ada.tanda === tanda) return kunciKolomTanpaJudul(kolom, ada.lebar, wadah);
    /* Font <th>/<td> dibaca dari sel sungguhan yang ditempel sebentar di wadah,
       supaya ukuran huruf mengikuti tema dan kartu tempatnya berada. */
    const probe = document.createElement('table');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    probe.innerHTML = '<thead><tr><th class="angka bisa-urut">0</th></tr></thead><tbody><tr><td class="angka">0</td></tr></tbody>';
    wadah.appendChild(probe);
    const fontDari = (el) => { const c = getComputedStyle(el); return `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`; };
    const fontTh = fontDari(probe.querySelector('th')), fontTd = fontDari(probe.querySelector('td'));
    const padTd = (() => { const c = getComputedStyle(probe.querySelector('td')); return parseFloat(c.paddingLeft) + parseFloat(c.paddingRight); })();
    probe.remove();
    const ctx = document.createElement('canvas').getContext('2d');
    const ukur = (font, t) => { ctx.font = font; return ctx.measureText(t).width; };
    const lebar = {};
    for (const k of kolom) {
      if (!k.judul || k.lentur) continue;
      /* Judul + panah urut (12px) — kepala tabel pun tidak boleh lebih sempit. */
      let maks = ukur(fontTh, k.judul) + 12;
      let markup = false;
      const unik = new Set();
      for (const r of semua) {
        let html = k.render ? String(k.render(r)) : k.tgl ? String(tglTampil(r[k.kunci])) : String(r[k.kunci] ?? '');
        /* <span class="rp"> dari rp() bukan lencana: jatah 18 px (padding + tepi
           lencana) tidak berlaku untuknya. Sebelum ini tiap kolom rupiah 18 px
           lebih lebar dari perlunya — tiga kolom = 54 px yang hilang dari Nama
           di tablet (bagian 233). */
        html = html.replace(/<span class="rp">Rp<\/span>/g, 'Rp');
        if (html.indexOf('<') !== -1) markup = true;
        unik.add(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
      }
      for (const t of unik) {
        const w = ukur(fontTd, k.angka ? t.replace(/\d/g, '0') : t);
        if (w > maks) maks = w;
      }
      /* Lencana (stok menipis/habis) menambah padding & tepi di sekitar angkanya. */
      lebar[k.judul] = Math.ceil(maks + padTd + (markup ? 18 : 0) + 1);
    }
    LEBAR_KOLOM.set(semua, { tanda, lebar });
    return lebar;
  }
  /* Lajur tombol (tanpa judul) tidak bisa diukur dari teksnya — lebarnya
     ditentukan tombol dan apakah keduanya sebaris atau bertumpuk, dan itu
     pilihan peramban menurut lebar layar. Jadi ia dikunci dari lebar yang
     SUDAH tergambar: begitu tabelnya ada, lebar <th> tanpa judul dibaca dan
     dipakai untuk penggambaran berikutnya. Tanpa ini sisa lebar dibagi antara
     Nama dan lajur tombol menurut isi halaman — bergeser sepersekian piksel
     tiap gambar ulang. Kuncinya `#indeks`, karena judulnya kosong. */
  function kunciKolomTanpaJudul(kolom, lebar, wadah) {
    const ths = wadah.querySelectorAll('thead th');
    if (ths.length !== kolom.length) return lebar;
    kolom.forEach((k, i) => {
      if (k.judul || lebar['#' + i]) return;
      const w = ths[i].getBoundingClientRect().width;
      if (w > 0) lebar['#' + i] = w;
    });
    return lebar;
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

  /* Titik tiga. Digoreskan sebaris sampai v1.174 — tiga lingkaran berisi,
     r 1,6, satu-satunya ikon di aplikasi ini yang memakai `fill`. Sekarang
     dari kamus bersama seperti yang lain; goresannya jadi sama dengan
     tetangganya di bar alat yang sama. */
  const IKON_TITIK_TIGA = `<svg class="ikon-svg" viewBox="0 0 24 24" style="width:18px;height:18px">${IKON.titik_tiga}</svg>`;

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

  /* ==================== IKON BAR ALAT ====================
     Diminta pemilik 10 Sep 2026: "rapihkan tools bar disemua menu ... jika
     diperlukan tambahkan icon supaya lebih interaktif". Satu kamus kecil,
     goresan 1.8 / viewBox 24 — sama dengan ikon menu di app.js, supaya tombol
     dan menunya terbaca sebagai satu keluarga. Tombol "+ X" memakai ikon plus
     sungguhan, bukan karakter "+": karakter itu berbeda lebar di tiap font dan
     duduk lebih rendah dari huruf di sebelahnya. */
  /* Kamusnya PINDAH ke pos.js v1.173 supaya app.js dan layar Kasir membaca
     sumber yang sama — dulu jalur SVG-nya disalin ke index.html dan dua salinan
     yang sama cepat atau lambat berbeda. `ikonAlat` dipertahankan sebagai nama
     lama: 3 pemanggilan lama tidak perlu ikut diubah, dan penggantian nama demi
     kerapian adalah perubahan yang seluruh risikonya tanpa imbalan. */
  const ikonAlat = (nama) => ikonAksi(nama);
  /** Tombol tindakan utama berikon plus. `label` TANPA "+" — plusnya ikonnya. */
  const tombolTambah = (id, label, kelas) =>
    `<button class="tombol utama ${kelas || ''}" id="${id}">${ikonAlat('tambah')}<span>${esc(label)}</span></button>`;

  /**
   * `memuat()` — rangka, bukan kata "Memuat…". Diminta pemilik 10 Sep 2026
   * untuk "menu-menu besar seperti stok": tiru rangka layar Produk. Daripada
   * satu rangka khusus per layar, yang ini GENERIK dan dipakai kedelapan belas
   * pemanggil sekaligus: satu bar alat dan satu kartu berisi baris-baris.
   * Produk dan Dashboard tetap punya rangkanya sendiri karena bentuk isinya
   * memang berbeda (dua kotak bar alat; enam kotak KPI). Yang lain bentuknya
   * persis ini. Rangka TIDAK mempercepat apa pun — ia mengganti "berapa lama
   * lagi?" dengan "apa yang akan muncul", dan layarnya tidak melompat saat
   * datanya tiba. `rangkaBaris` didefinisikan di bawah; dipanggil saat
   * runtime, jadi urutannya aman. */
  /* Sejak bagian 262 lewat Rangka.pasang (pos.js): bentuk ASLI layar ini yang
     diingat; rangka umum di bawah hanya untuk pembukaan pertama. */
  const memuat = (el) => Rangka.pasang($(el), `
    <div class="kartu"><div class="rangka-alat">
      ${['260px', '160px', '140px'].map(w =>
        `<span class="rangka tinggi" style="width:${w}"></span>`).join('')}
    </div></div>
    <div class="kartu" aria-busy="true" aria-label="Memuat">
      ${rangkaBaris(8, ['90%', '72%', '84%', '66%'])}
    </div>`, el);

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

  const rangkaProduk = () => Rangka.pasang($('#isiProduk'), `
    <div class="kartu"><div class="rangka-alat">
      ${['300px', '180px', '170px', '160px'].map(w =>
        `<span class="rangka tinggi" style="width:${w}"></span>`).join('')}
    </div></div>
    <div class="kartu" aria-busy="true" aria-label="Memuat daftar produk">
      ${rangkaBaris(12, ['92%', '78%', '86%', '70%'])}
    </div>`, '#isiProduk');   // bentuk asli diingat (bagian 262)

  const rangkaDashboard = () => { $('#isiDashboard').innerHTML = `
    <div class="bar-alat rapat bar-dash"><span class="rangka tinggi" style="width:150px"></span>${bolehCabangDash() ? '<span class="rangka tinggi" style="width:130px"></span>' : ''}</div>
    <!-- Bentuknya memakai .mini yang SAMA dengan kartu KPI sungguhan, bukan
         kotak karangan sendiri: rangka yang ukurannya berbeda dari isinya
         membuat layar melompat tepat saat datanya tiba, dan lompatan itu
         justru yang paling terasa sesudah menunggu sepuluh detik.
         (Tanpa petik-balik: blok ini ada di dalam template literal.) -->
    <div class="petak-mini" aria-busy="true" aria-label="Memuat ringkasan">
      ${Array.from({ length: 6 }, () => `<div class="mini">
        <div class="mini-kepala"><span class="mini-ikon"></span><div class="mini-label"><span class="rangka" style="width:70px"></span></div></div>
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

  /* Berkas Accurate yang sedang DIPRATINJAU, menunggu ditekan Simpan.
     Dideklarasikan di sini, bersama keadaan modal yang lain, karena
     `tutupModal()` di bawah melepasnya — dan keadaan yang dilepas satu fungsi
     sebaiknya lahir di dekat fungsi itu, bukan delapan ribu baris jauhnya. */
  let accTertunda = null;

  function bukaModal(judul, isi, aksi) {
    stokDuaCabang = null;
    /* Tanda keranjang stiker milik modal YANG SEDANG terbuka (bagian 255). Tanpa
       ini tanda itu menempel selamanya di #modalUmum, dan tiap stiker yang
       ditambah dari daftar Produk mencoba menggambar #labIsi yang sudah tidak
       ada — 89 galat di satu PC dalam sehari. bukaKeranjangLabel memasangnya
       lagi SESUDAH memanggil bukaModal. */
    $('#modalUmum')._label = null;
    $('#modalUmum').innerHTML = `<h3>${esc(judul)}</h3>${isi}
      <div class="aksi-modal">${aksi || ('<button class="tombol" data-tutup="1">' +
          ikonAlat('batal') + '<span>Tutup</span></button>')}</div>`;
    $('#tiraiUmum').classList.add('tampil');
  }
  /* Menutup modal MELEPAS berkas Accurate yang menunggu disetujui.
     Ditemukan uji-acc-pratinjau: tanpa baris ini, Batal cuma menyembunyikan
     layarnya — berkasnya tetap menggantung, dan penekanan Simpan berikutnya
     menyimpan berkas yang tadi sudah DIBATALKAN. Membatalkan yang tidak
     benar-benar membatalkan lebih buruk daripada tidak ada tombol Batal.
     Ditaruh di sini, bukan di penangan tombolnya, supaya jalan keluar mana
     pun — Batal, klik latar, tangan lain — melepasnya sekaligus. */
  const tutupModal = () => {
    accTertunda = null;
    $('#modalUmum')._label = null;     // lihat bukaModal (bagian 255)
    $('#tiraiUmum').classList.remove('tampil');
  };

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

  /**
   * Angka dari NILAI (bukan dari kolom isian) — pasangan `angka()` di atas.
   *
   * Lahir 21 Sep 2026 sebagai perbaikan, bukan sebagai penambahan: empat tempat
   * di berkas ini memanggil `num()` dan tidak pernah ada satu pun definisinya.
   * Tiga di antaranya baru lahir di v1.225.0, dan akibatnya tombol "Aset tetap
   * baru" serta "Ubah aset" MATI sejak hari rilisnya — ditekan, tidak terjadi
   * apa-apa, dan satu-satunya jejaknya baris merah di konsol yang tidak dilihat
   * siapa pun. Yang keempat lebih tua (v1.192.0) dan merusak seluruh baris
   * tabel Perangkat begitu ada yang terkunci gara-gara salah PIN.
   *
   * 1930 penjaga statis tidak melihatnya karena tidak satu pun MENJALANKAN
   * borangnya. Penawarnya `uji/uji-aset-layar.mjs`, yang membuka kedua borang
   * di peramban sungguhan dan menuntut konsolnya bersih.
   *
   * SENGAJA `Number`, bukan `angkaDari`: `angkaDari` membuang koma (ia untuk
   * kolom rupiah berformat), dan akumulasi penyusutan memang berdesimal —
   * 749.999,97 akan terbaca 74999997.
   */
  const num = (v) => Number(v) || 0;
  /* Cermin boolOf() di 01_Util.gs — nilai boolean yang lewat Sheets bisa datang
     sebagai true, "TRUE", atau 1. Tab Galat memakainya tanpa pernah ada
     definisinya di klien: ReferenceError di toko, 22 Sep 2026 (bagian 230). */
  const boolOf = (v) => v === true || String(v).toLowerCase() === 'true' || String(v) === '1';

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
    /* SALINAN STOK DI PERANGKAT DIBUANG DI SINI, dan sengaja di SATU tempat.
     *
     * Layar Stok menyimpan jawaban server sampai 10 menit (lihat
     * `bacaCacheUmur`). Yang mengubah stok tersebar di banyak layar — posting
     * opname, kirim & terima transfer, terima & batal pembelian, retur jual,
     * retur beli, proses permintaan — dan menaruh pembuangan cache di tiap
     * jalur itu berarti yang kedelapan pasti terlupa. Orang yang baru memposting
     * opname lalu membuka Stok akan melihat angka sebelum opnamenya, dan ia
     * tidak akan melapor "cache basi"; ia akan melapor "opname saya tidak
     * masuk".
     *
     * `sukses()` adalah pintu yang dilewati SEMUA penulisan yang berhasil di
     * back office — dua puluh tiga pemanggil, tanpa kecuali. Membuang di sini
     * memang ikut membuang saat yang disimpan cuma nama pelanggan, dan itu
     * memang dibayar: satu penarikan ulang yang tidak perlu, sesekali. Jauh
     * lebih murah daripada satu angka stok yang salah. */
    try { await DB.kvSet(CACHE_STOK, null); } catch (e) { /* bukan alasan gagal */ }
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
        <svg class="ikon-svg" viewBox="0 0 24 24" style="width:15px;height:15px">${IKON.ekspor}</svg>
        Ekspor
        <svg class="ikon-svg tanda-panah" viewBox="0 0 24 24" style="width:13px;height:13px">${IKON.buka_menu}</svg>
      </button>
      <div class="ekspor-menu" role="menu">
        ${FORMAT_EKSPOR.map(f => `<button role="menuitem" data-ekspor="${esc(jenis)}"
            data-format="${f.kode}" data-params='${p}'>${f.label}<span>${f.ket}</span></button>`).join('')}
      </div>
    </span>`;
  };

  /**
   * Butir ekspor di DALAM menu "⋮" — blok "Ekspor daftar ini" berisi tiga
   * format. Satu bentuk untuk semua layar; sebelumnya cuma layar Produk yang
   * punya, dan ditulis di tempat.
   *
   * Atribut butirnya SAMA PERSIS dengan butir `tombolEkspor` (data-ekspor,
   * data-format, data-params), jadi `jalankanEkspor()` tidak perlu tahu
   * tombolnya berbentuk apa — dan uji yang membaca `[data-ekspor="stok"]`
   * tetap menemukannya.
   */
  const butirEkspor = (jenis, params = {}) => {
    const p = esc(JSON.stringify(params));
    return `<div class="popover-pisah">
      <p class="petunjuk" style="padding:2px 10px 4px;margin:0">Ekspor daftar ini</p>
      ${FORMAT_EKSPOR.map(f => `<button class="popover-item" role="menuitem"
          data-ekspor="${esc(jenis)}" data-format="${f.kode}" data-params='${p}'>
          <span>${esc(f.label)}</span><span class="petunjuk">${esc(f.ket)}</span></button>`).join('')}
    </div>`;
  };

  /**
   * Menu "⋮" yang isinya HANYA ekspor — pengganti tombol Ekspor di bar alat.
   *
   * Diminta pemilik 12 Sep 2026: "semua tombol export, petakan semua. lalu
   * masukkan ke tombol ellipsis-vertical". Tujuh layar (Stok, Poin, Piutang,
   * Utang, Audit, Diskon, Laporan penjualan). Yang DIKECUALIKAN: kartu "Unduh
   * laporan ini" di Keuangan — ia muncul sesudah Laba Rugi/Neraca dihitung,
   * dan menyembunyikannya di menu membuat orang yang baru saja menekan
   * "Laba Rugi" kehilangan jalan mengunduhnya. Itu masih memakai
   * `tombolEkspor`, dan sengaja.
   *
   * Id-nya diturunkan dari jenisnya supaya tidak ada dua layar yang kembar
   * tanpa ada yang mengetik: 'diskon_kasir' -> menuEksporDiskonKasir.
   */
  const menuEkspor = (jenis, params = {}) => {
    const K = String(jenis).split('_').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
    return menuTindakan({
      id: 'menuEkspor' + K, idTombol: 'btnMenuEkspor' + K, kunci: jenis,
      isi: butirEkspor(jenis, params)
    });
  };

  /**
   * Menu "⋮" di DALAM baris tabel (bagian 267): posisinya fixed, dihitung dari
   * tombolnya — menu absolut di dalam pembungkus tabel yang bisa digeser
   * terpotong di baris terakhir. Dibuka ke atas bila ruang di bawah tidak cukup.
   * Menggulir menutupnya: menu fixed tidak ikut bergerak bersama barisnya.
   */
  function letakkanMenuBaris(tombol, m) {
    const r = tombol.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.left = 'auto'; m.style.bottom = 'auto'; m.style.margin = '0';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    const tinggi = m.offsetHeight;
    const bawah = r.bottom + 6 + tinggi <= window.innerHeight - 8;
    /* Dijepit ke dalam layar apa pun posisi tombolnya. */
    const atas = bawah ? r.bottom + 6 : r.top - 6 - tinggi;
    m.style.top = Math.min(Math.max(8, atas), Math.max(8, window.innerHeight - tinggi - 8)) + 'px';
    /* Penutup gulir dipasang SESUDAH gulir yang ikut lahir dari kliknya reda —
       dipasang seketika, peristiwa gulir yang tertunda menutup menu yang baru
       saja dibuka. Hanya satu penutup hidup pada satu waktu. */
    if (letakkanMenuBaris.tutup) window.removeEventListener('scroll', letakkanMenuBaris.tutup, true);
    const tutup = letakkanMenuBaris.tutup = () => {
      window.removeEventListener('scroll', tutup, true);
      if (!m.hidden) tutupMenuLain();
    };
    setTimeout(() => { if (!m.hidden && letakkanMenuBaris.tutup === tutup) window.addEventListener('scroll', tutup, true); }, 250);
  }

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
    /* Tiga kemungkinan tempat tombolnya hidup: widget `tombolEkspor` (Keuangan),
       menu "⋮" (tujuh layar lain sejak v1.178), atau berdiri sendiri. Di dalam
       menu, butirnya sudah tersembunyi saat pekerjaannya mulai — kalau
       keadaannya ditaruh di situ, tidak ada yang melihat "Menyiapkan…" dan
       tombol "⋮" bisa ditekan lagi di tengah unduhan. */
    const grup = btn.closest('.ekspor');
    const lain = btn.closest('.menu-lain');
    const pemicu = grup ? grup.querySelector('[data-ekspor-buka]')
                 : lain ? lain.querySelector('[aria-controls]')
                 : btn;
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
  /** Cabang yang ditampilkan dashboard: '*' = semua (perilaku lama), atau satu kode. */
  let cabangDash = '*';

  /* v1.182: pilihan periode Dashboard = daftar standar komponen Periode (pos.js),
     termasuk Bulan lalu dan Kustom… (rentang kustom dibatasi server 92 hari). */
  const PERIODE_DASH = { id: 'periodeDash', dari: 'dashDari', sampai: 'dashSampai', judul: 'Periode' };
  let dashKustom = { dari: '', sampai: '' };
  const paramDash = () => periodeDash === 'kustom'
    ? { periode: 'kustom', cabang: cabangDash, dari: dashKustom.dari, sampai: dashKustom.sampai }
    : { periode: periodeDash, cabang: cabangDash };

  /* ==================== DATA TERAKHIR DULU (bagian 258) ====================
     Diukur 25 Sep 2026: bagian monitor 32 dtk & berat 24 dtk saat cache server
     kosong. Pemilik memilih: tampilkan angka terakhir yang tersimpan di
     PERANGKAT seketika, bertanda jamnya, lalu segarkan di belakang dan gambar
     ulang. Simpanan per akun + periode + cabang; dibuang saat keluar akun.
     Umur < 60 dtk dipakai tanpa server (hasil penyegaran barusan); lebih tua
     dipakai DULU lalu disegarkan. Penyimpanan yang gagal/diblokir = perilaku
     lama (langsung ke server), bukan galat. */
  const SIMPAN_DASH = 'possk_dash_v1', BASI_DASH_MS = 60000;
  const kunciSimpanDash = (bagian) => JSON.stringify([(APP_STATE.user || {}).id_user || '', bagian,
    /^grafik/.test(bagian) ? null : paramDash()]);
  function bacaSimpanDash(bagian) {
    try { return JSON.parse(localStorage.getItem(SIMPAN_DASH) || '{}')[kunciSimpanDash(bagian)] || null; }
    catch (e) { return null; }
  }
  function tulisSimpanDash(bagian, data) {
    try {
      const s = JSON.parse(localStorage.getItem(SIMPAN_DASH) || '{}');
      s[kunciSimpanDash(bagian)] = { data, waktu: Date.now() };
      const k = Object.keys(s);
      if (k.length > 16) k.sort((a, b) => s[a].waktu - s[b].waktu).slice(0, k.length - 16).forEach((x) => delete s[x]);
      localStorage.setItem(SIMPAN_DASH, JSON.stringify(s));
    } catch (e) { /* penuh/diblokir: tanpa simpanan, lain kali langsung ke server */ }
  }
  /** Simpanan kalau ada (seketika), selain itu server — lalu disimpan. */
  async function ambilDash(bagian, ambil) {
    const s = bacaSimpanDash(bagian);
    if (s) return s.data;
    const d = await ambil();
    tulisSimpanDash(bagian, d);
    return d;
  }
  const basiDash = (bagian) => { const s = bacaSimpanDash(bagian); return s && Date.now() - s.waktu > BASI_DASH_MS ? s.waktu : 0; };
  /* ==================== MONITOR PARALEL (bagian 263) ====================
     Diukur 25 Sep 2026 di toko: bagian monitor 32 dtk — tujuh daftar dikerjakan
     server BERURUTAN dalam satu permintaan (shift 4,5 · permintaan 3,9 · utang
     3,2 · transfer 1,8 · retur & opname per cabang). Kini enam permintaan kecil
     berjalan BERSAMAAN, dikelompokkan supaya seimbang, dan hasilnya digabung
     di sini. Yang digabung hanya DAFTAR yang berdiri sendiri — tidak ada angka
     yang dijumlah ulang di layar. Kelompok yang gagal hanya membuat kartunya
     "Tidak tersedia"; kartu lain tetap tergambar. */
  const GRUP_MONITOR = [['shift'], ['permintaan'], ['utang'], ['transfer', 'audit', 'perangkat'], ['retur_void'], ['opname']];
  const kunciMonitor = (b) => (b === 'perangkat' ? 'perangkat_menunggu' : b);
  async function ambilMonitorParalel(opsi) {
    const hasil = await Promise.allSettled(GRUP_MONITOR.map((g) =>
      API.dashboard({ ...paramDash(), bagian: 'monitor', blok: g.join(',') }, opsi)));
    const m = { bagian: 'monitor' };
    let berhasil = 0, galatPertama = null;
    hasil.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        berhasil++;
        ['dari', 'sampai', 'dihitung'].forEach((k) => { if (m[k] === undefined && r.value[k] !== undefined) m[k] = r.value[k]; });
        GRUP_MONITOR[i].forEach((b) => { if (r.value[kunciMonitor(b)] !== undefined) m[kunciMonitor(b)] = r.value[kunciMonitor(b)]; });
      } else {
        galatPertama = galatPertama || r.reason;
        GRUP_MONITOR[i].forEach((b) => { m[kunciMonitor(b)] = null; });
      }
    });
    if (!berhasil) throw galatPertama || new Error('Kartu pemantauan gagal dimuat.');
    return m;
  }

  /** Segarkan seluruh bagian di latar, lalu gambar ulang dari simpanan yang baru. */
  /* BERSAMAAN, bukan berurutan (bagian 266). Diukur 26 Sep 2026 di toko:
     inti → monitor → berat → grafik bergiliran = 11 + 10 + 11 + 11 ≈ 44 dtk,
     padahal keempatnya tidak saling menunggu. Tiap bagian yang berhasil
     langsung disimpan; yang gagal tidak membuang yang berhasil. Satu gambar
     ulang di akhir, bukan empat. */
  async function segarkanDashLatar(tiket) {
    const tugasSegar = [];
    for (const b of ['inti', 'monitor', 'berat', 'petugas']) {
      if (b === 'monitor' && !kartuMonitorBoleh().length) continue;
      tugasSegar.push((b === 'monitor' ? ambilMonitorParalel({ latar: true })
        : API.dashboard({ ...paramDash(), bagian: b, ...(b === 'inti' ? { tanpa_klaim: true } : {}) }, { latar: true }))
        .then((d) => { if (tiket === tiketDash) tulisSimpanDash(b, d); }));
    }
    if (basiDash('grafik30')) {
      tugasSegar.push(API.dataGrafik({ hari: 30 }, { latar: true }).then((g) => {
        if (tiket !== tiketDash) return;
        tulisSimpanDash('grafik30', g);
        delete grafikMuatan['30'];
      }));
    }
    const hasil = await Promise.allSettled(tugasSegar);
    if (tiket !== tiketDash) return;
    const gagal = hasil.filter((r) => r.status === 'rejected');
    /* Gambar ulang HANYA bila semuanya segar: muatDashboard menyegarkan lagi
       bagian yang masih basi, jadi menggambar ulang sesudah gagal berarti
       putaran ulang tanpa akhir selama servernya gagal. Yang berhasil sudah
       tersimpan dan tampil pada pembukaan berikutnya. */
    if (!gagal.length) { muatDashboard(); return; }
    const l = $('#dashBasi');
    if (l) l.textContent = 'Gagal memperbarui (' + (gagal[0].reason && gagal[0].reason.message) +
      ') — angka di bawah masih yang tersimpan.';
  }

  /**
   * Dropdown cabang dashboard (v1.159, diminta pemilik 10 Sep 2026). Hanya
   * untuk akun lintas cabang dengan lebih dari satu cabang — aturan yang sama
   * dengan penyaring cabang Laporan: dropdown berisi satu pilihan adalah
   * hiasan. `daftarKodeCabang()` sudah dipakai formulir produk.
   */
  const bolehCabangDash = () =>
    !!APP_STATE.flag?.akses_lintas_cabang && daftarKodeCabang().length > 1;
  const pilihCabangDash = () => bolehCabangDash()
    ? `<select id="cabangDash" class="kendali-tetap" title="Cabang">
        <option value="*" ${cabangDash === '*' ? 'selected' : ''}>Semua cabang</option>
        ${daftarKodeCabang().map(c => `<option value="${esc(c)}" ${cabangDash === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>` : '';

  /**
   * Rentang tanggal dashboard dalam bentuk RINGKAS — untuk ponsel.
   *
   * Dulu "10/09/2026 – 10/09/2026 · dibanding 09/09/2026 – 09/09/2026" memakan
   * dua baris di HP (pemilik, 10 Sep 2026). Satu hari ditulis sekali; bila
   * KEEMPAT tanggal setahun, tahunnya disebut SEKALI di ujung dalam kurung
   * (bentuk yang diminta pemilik: "10/09 · vs 09/09 (2026)"). Contoh:
   *   "10/09 · vs 09/09 (2026)"  ·  "04/09 – 10/09 · vs 28/08 – 03/09 (2026)".
   * Lintas tahun tetap menulis tahun di tiap rentang supaya tidak menyesatkan:
   *   "01/01 – 07/01/2026 · vs 25/12 – 31/12/2025".
   * Tanggal tetap DD/MM seperti seluruh aplikasi.
   */
  function ringkasRentang(dari, sampai, tanpaTahun) {
    const u = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? { t: m[1], hb: m[3] + '-' + m[2] } : null; };
    const a = u(dari), b = u(sampai);
    if (!a || !b) return tglTampil(dari) + ' – ' + tglTampil(sampai);
    const thn = tanpaTahun ? '' : '-' + b.t;
    if (a.t + a.hb === b.t + b.hb) return a.hb + thn;
    if (a.t === b.t) return a.hb + ' – ' + b.hb + thn;
    return tglTampil(dari) + ' – ' + tglTampil(sampai);
  }
  function keteranganRentangDash(d) {
    const thn = (v) => String(v || '').slice(0, 4);
    const tahun = thn(d.dari);
    const tahunSama = /^\d{4}$/.test(tahun) && tahun === thn(d.sampai) && tahun === thn(d.dari_lalu) && tahun === thn(d.sampai_lalu);
    const inti = `${ringkasRentang(d.dari, d.sampai, tahunSama)} · vs ${ringkasRentang(d.dari_lalu, d.sampai_lalu, tahunSama)}`;
    return tahunSama ? `${inti} (${tahun})` : inti;
  }

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

  const petakMini = (isi, kelas) => `<div class="petak-mini${kelas ? ' ' + kelas : ''}">${isi}</div>`;
  /* Baris ekor SELALU digambar, walau kosong. Kotak yang punya pembanding
     isinya 28px lebih tinggi daripada yang tidak, dan karena satu baris kotak
     tingginya disamakan, yang tanpa pembanding berlubang di dalam — ruang
     kosong di dalam kotak bergaris terbaca seperti isi yang gagal dimuat.
     Tingginya dipesan di CSS (`.mini-ekor { min-height }`), bukan dengan
     mengarang teks pengisi: tidak ada angka palsu yang bisa dikutip orang. */
  /* Ikon KPI: satu petak berwarna per angka. Warnanya bukan hiasan — enam
     kotak yang bentuknya persis sama dibaca dengan MEMBACA labelnya satu per
     satu; dengan warna dan ikon, mata menemukan "piutang" tanpa membaca.
     Diminta pemilik 10 Sep 2026 ("sentuhan text dan icon warna warni").
     Goresan 1.8, viewBox 24, sama dengan ikon menu di app.js. */
  /* Ikon petak angka. Kamusnya PINDAH ke pos.js v1.177 — sepuluh ikon
     terakhir yang masih digambar di luar kamus bersama. Enam di antaranya
     ternyata GANDAAN ikon sidebar dengan angka yang berbeda: nilai=Produk,
     mati=Retur Beli, kritis=peringatan shift, dan di IKON_SETTING di bawah
     usaha=Cabang, stok=Stok, lain=Bantuan. Satu arti, dua gambar, dua layar. */
  const ikonKpi = (nama, warna) => nama && IKON[nama]
    ? `<span class="mini-ikon ${warna || ''}" aria-hidden="true"><svg class="ikon-svg" viewBox="0 0 24 24">${IKON[nama]}</svg></span>`
    : '';

  /* Baris ekor SELALU digambar, walau kosong. Kotak yang punya pembanding
     isinya 28px lebih tinggi daripada yang tidak, dan karena satu baris kotak
     tingginya disamakan, yang tanpa pembanding berlubang di dalam — ruang
     kosong di dalam kotak bergaris terbaca seperti isi yang gagal dimuat.
     Tingginya dipesan di CSS (`.mini-ekor { min-height }`), bukan dengan
     mengarang teks pengisi: tidak ada angka palsu yang bisa dikutip orang.

     `opsi.ke` menjadikan kotaknya TAUTAN ke layar yang menjelaskan angkanya
     (omzet → Riwayat, piutang → Piutang, stok menipis → Stok). Hanya kalau
     perannya berhak membuka layar itu — kotak yang mengantar ke halaman kosong
     lebih buruk daripada kotak yang diam. */
  const LABEL_LAYAR = { riwayat: 'Riwayat', piutang: 'Piutang', stok: 'Stok', laporan: 'Laporan' };
  const kotakMini = (label, nilai, ekor, opsi) => {
    const o = opsi || {};
    const ke = o.ke && typeof bolehLayar === 'function' && bolehLayar(o.ke) ? o.ke : '';
    /* Ikon berdiri SEBARIS dengan label, bukan di sisi angka. Percobaan
       pertama menaruhnya di kiri seluruh kotak, dan pada enam kotak sebaris
       di 1044px angkanya terpotong jadi "Rp 952.…" — petak 32px + celah
       memakan lebar yang dulu dipakai tiga angka terakhir. Di baris label
       ruangnya memang tersisa, dan angkanya kembali selebar kotak. */
    const isi = `<div class="mini-kepala">${ikonKpi(o.ikon, o.warna)}<div class="mini-label">${esc(label)}</div></div>
      <div class="mini-nilai">${nilai}</div>
      <div class="mini-ekor">${ekor || ''}</div>`;
    return ke
      ? `<a class="mini mini-tautan" href="#/${ke}" data-layar="${ke}" title="Buka ${esc(LABEL_LAYAR[ke] || ke)}">${isi}</a>`
      : `<div class="mini">${isi}</div>`;
  };

  /** Tabel peringkat: ringkas, tanpa kepala tebal, angka rata kanan. */
  /* `id` opsional: kartu yang diisi BELAKANGAN (bagian berat dashboard)
     digambar ulang lewat outerHTML dan harus membawa id-nya sendiri. Kartunya
     tetap anak LANGSUNG petaknya — wadah pembungkus tambahan membuat baris
     petak tidak lagi terbaca sebagai baris oleh uji-ruang, dan jaraknya
     terukur 32px padahal yang tergambar 16px. */
  /* Tiket penggambaran: berganti tiap kali dashboard dimuat. Bagian berat yang
     ditarik di latar untuk periode LAMA tidak boleh menimpa layar periode baru
     yang sudah tergambar — tanpa tiket, mengganti periode dua kali cepat
     berakhir dengan peringkat 30 hari di bawah judul "Hari ini". */
  let tiketDash = 0;
  /* Muatan dashboard yang sedang tampil — dibaca pop-up "Lihat sebagai tabel". */
  let dataDash = null;

  /* ==================== KARTU DASHBOARD (v1.179) ====================
   * Satu bentuk untuk empat belas kartu: judul, isi yang MEMESAN tinggi lima
   * baris (`.isi-dash`), dan kaki "Lihat sebagai tabel" yang menempel di dasar
   * (`.kaki-dash`, margin-top:auto). Kartu sebaris disamakan tingginya oleh
   * `align-items: stretch` di `.petak-dash`.
   *
   * Diminta pemilik 12 Sep 2026: "perpetak ukuran sama ratakan supaya tidak
   * tinggi rendah, meskipun isi tabelnya kurang — tetap sediakan 5 list".
   * Kartu yang isinya dua baris tidak tampak berlubang: yang terlihat kaki
   * yang sejajar dengan tetangganya.
   */
  const kartuDaftarDash = (judul, sub, isi, o = {}) => `<div class="kartu rapat kartu-dash"${o.id ? ` id="${o.id}"` : ''}>
    <h4>${esc(judul)}${sub ? ` <span class="sub">${esc(sub)}</span>` : ''}${o.kanan || ''}</h4>
    <div class="isi-dash">${isi}</div>
    ${o.tabel ? `<div class="kaki-dash"><button type="button" class="tabel-tautan" data-tabel-dash="${o.tabel}">Lihat sebagai tabel${o.kaki ? ' · ' + esc(o.kaki) : ''}</button></div>` : ''}
  </div>`;

  /** Kartu peringkat petugas — dipakai inti lama dan bagian 'petugas' (bagian 268). */
  const kartuPetugasDash = (rows) => kartuDaftarDash('Petugas', '', barisDash((rows || []).slice(0, 5).map(r =>
      [esc(r.nama), rp(r.omzet), r.poin + ' poin']), 'Belum ada klaim petugas'),
    { tabel: 'petugas', kaki: 'semua', id: 'kartuPetugas' });

  async function isiKartuPetugas(tiket, janji) {
    let d;
    try { d = await janji; }
    catch (e) {
      if (tiket !== tiketDash) return;
      /* Gagal = kartu ini saja yang "tidak tersedia", bukan kosong: kosong
         terbaca "belum ada klaim", dan itu jawaban yang salah. */
      const k = $('#kartuPetugas');
      if (k) k.outerHTML = kartuDaftarDash('Petugas', '', `<div class="dr-kosong">Tidak tersedia (${esc(e.message)})</div>`, { id: 'kartuPetugas' });
      return;
    }
    if (tiket !== tiketDash) return;
    if (dataDash) dataDash.petugas = d;
    const k = $('#kartuPetugas');
    if (k) k.outerHTML = kartuPetugasDash((d && d.peringkat && d.peringkat.petugas) || []);
  }

  /** Baris daftar ringkas: [nama, angka, sub?]. Kosong = satu baris keterangan. */
  const barisDash = (rows, kosong) => rows.length
    ? rows.map(r => `<div class="dr-baris"><span class="dr-nama">${r[0]}</span>${r[2] !== undefined && r[2] !== '' ? `<span class="dr-sub">${r[2]}</span>` : ''}<span class="dr-angka">${r[1]}</span></div>`).join('')
    : `<div class="dr-kosong">${esc(kosong || 'Belum ada data')}</div>`;

  const lencanaDash = (teks, warna) => `<span class="lencana ${warna || ''}">${esc(teks)}</span>`;
  const WARNA_STATUS = { MENUNGGU: 'kuning', SEBAGIAN: 'biru', SELESAI: 'hijau', DIKIRIM: 'kuning',
                         DITERIMA: 'hijau', SELISIH: 'merah', BUKA: 'kuning', TUTUP: 'hijau', BELUM: 'abu',
                         DRAFT: 'abu', REVIEW: 'kuning' };
  const labelStatus = (st) => ({ MENUNGGU: 'menunggu', SEBAGIAN: 'sebagian', SELESAI: 'selesai',
    DIKIRIM: 'dikirim', DITERIMA: 'diterima', SELISIH: 'selisih', BUKA: 'buka', TUTUP: 'tutup',
    BELUM: 'belum buka', DRAFT: 'draft', REVIEW: 'review' }[st] || String(st || '').toLowerCase());
  const umurTeks = (n) => n === 0 ? 'hari ini' : n === 1 ? 'kemarin' : n + ' hari';
  const jamDari = (iso) => String(iso || '').slice(11, 16);
  /* "24/08/2026 16:20:00" memakan lebar yang seharusnya untuk rute; di kartu
     cukup "24/08 16:20", dan "hari ini 09:12" bila tanggalnya hari ini. */
  const waktuRingkas = (iso) => {
    const t = String(iso || ''); if (t.length < 16) return t;
    const hariIni = typeof tanggalLokal === 'function' ? tanggalLokal() : '';
    return (t.slice(0, 10) === hariIni ? 'hari ini' : t.slice(8, 10) + '-' + t.slice(5, 7)) + ' ' + t.slice(11, 16);
  };

  /* Strip peringatan di atas KPI: shift terbuka + perangkat menunggu. Yang
     menuntut tindakan sekarang berdiri di atas, bukan di kartu ke-8. */
  function stripDash(d, m) {
    const butir = [];
    const st = (d && d.shift_terbuka) || [];
    if (st.length) butir.push(`<span><strong>${st.length} shift masih terbuka</strong> — ${st.map(x =>
      esc(x.cabang) + ' · ' + esc(x.id_user) + ' · sejak ' + esc(jamDari(x.buka))).join(', ')}</span>`);
    if (m && m.perangkat_menunggu) butir.push(`<span><strong>${m.perangkat_menunggu} perangkat</strong> menunggu persetujuan</span>`);
    if (!butir.length) return '';
    const tautan = [];
    if (st.length && typeof bolehLayar === 'function' && bolehLayar('shift')) tautan.push('<a href="#/shift" data-layar="shift">Buka Shift →</a>');
    if (m && m.perangkat_menunggu && typeof bolehLayar === 'function' && bolehLayar('pengguna')) tautan.push('<a href="#/pengguna" data-layar="pengguna">Pengguna →</a>');
    return `<div class="strip-dash" role="status">${ikonAlat('peringatan')}${butir.join('<span class="pisah">·</span>')}
      ${tautan.length ? `<span class="strip-tautan">${tautan.join(' · ')}</span>` : ''}</div>`;
  }

  /* Kartu monitor yang digambar bergantung pada IZIN peran — rangkanya pun
     mengikuti, supaya tidak ada kotak "memuat" yang berakhir kosong. */
  const KARTU_MONITOR = [
    { id: 'kartuPermintaan', judul: 'Permintaan barang', izin: ['permintaan', 'lihat'], tabel: 'permintaan', kaki: '50 terbaru' },
    { id: 'kartuTransfer',   judul: 'Transfer barang',   izin: ['transfer', 'lihat'],   tabel: 'transfer',   kaki: '50 terbaru' },
    { id: 'kartuReturVoid',  judul: 'Retur jual & void', izin: ['retur', 'lihat'],      tabel: 'retur_void', kaki: '50 terbaru' },
    { id: 'kartuAudit',      judul: 'Aktivitas terakhir', izin: ['audit', 'lihat'],     tabel: 'audit',      kaki: '50 terbaru' },
    { id: 'kartuOpnameUtang', judul: 'Opname & utang',   izin: ['opname', 'lihat'],     tabel: 'opname_utang', kaki: 'semua' },
    { id: 'kartuShift',      judul: 'Shift hari ini',    izin: ['shift', 'lihat'],      tabel: 'shift',      kaki: '30 hari' }
  ];
  const kartuMonitorBoleh = () => KARTU_MONITOR.filter(k => bolehIzin(k.izin[0], k.izin[1]));
  const rangkaMonitor = () => kartuMonitorBoleh().map(k =>
    `<div class="kartu rapat kartu-dash" id="${k.id}" aria-busy="true"><h4>${esc(k.judul)}</h4>
      <div class="isi-dash">${rangkaBaris(4, ['80%', '62%', '74%', '56%'])}</div></div>`).join('');

  async function muatDashboardMonitor(tiket) {
    if (!kartuMonitorBoleh().length) return;
    try {
      const m = await ambilDash('monitor', () => ambilMonitorParalel({ latar: true }));
      if (tiket !== tiketDash) return;
      if (dataDash) dataDash.monitor = m;
      isiKartuMonitor(m);
      const strip = $('#stripDash');
      if (strip && dataDash) strip.innerHTML = stripDash(dataDash.inti, m);
    } catch (e) {
      if (tiket !== tiketDash) return;
      /* Gagalnya monitor TIDAK merobohkan dashboard yang sudah tergambar. */
      kartuMonitorBoleh().forEach(k => {
        const el = $('#' + k.id);
        if (el) el.outerHTML = `<div class="kartu rapat kartu-dash" id="${k.id}"><h4>${esc(k.judul)}</h4>
          <div class="isi-dash"><p class="pesan galat" style="margin:0">Gagal dimuat — ${esc(e.message)}</p></div></div>`;
      });
    }
  }

  function isiKartuMonitor(m) {
    const cap = m && m.dihitung ? '· per ' + m.dihitung : '';
    const ganti = (id, html) => { const el = $('#' + id); if (el) el.outerHTML = html; };
    const pm = m.permintaan, tf = m.transfer, rv = m.retur_void, la = m.audit, op = m.opname, ut = m.utang, sh = m.shift;

    if ($('#kartuPermintaan')) ganti('kartuPermintaan', kartuDaftarDash('Permintaan barang', cap,
      pm === null || pm === undefined ? '<div class="dr-kosong">Tidak tersedia</div>' : `
        <div class="ringkas-dash">${lencanaDash(pm.menunggu + ' menunggu', 'kuning')}${lencanaDash(pm.sebagian + ' sebagian', 'biru')}${lencanaDash(pm.selesai + ' selesai', 'hijau')}</div>
        ${barisDash(pm.daftar.filter(x => x.status !== 'SELESAI').slice(0, 4).map(x => [
          esc(x.no_dokumen) + ' · ' + esc(x.cabang_asal) + ' → ' + esc(x.cabang_tujuan),
          lencanaDash(labelStatus(x.status), WARNA_STATUS[x.status]),
          x.status === 'SEBAGIAN' ? x.n_proses + ' dari ' + x.n_item + ' item' : umurTeks(x.umur_hari)]), 'Tidak ada yang menunggu')}`,
      { id: 'kartuPermintaan', tabel: 'permintaan', kaki: '50 terbaru' }));

    if ($('#kartuTransfer')) ganti('kartuTransfer', kartuDaftarDash('Transfer barang', cap,
      tf === null || tf === undefined ? '<div class="dr-kosong">Tidak tersedia</div>' : `
        <div class="ringkas-dash">${lencanaDash(tf.dikirim + ' di jalan', 'kuning')}${tf.selisih ? lencanaDash(tf.selisih + ' selisih', 'merah') : ''}</div>
        ${barisDash(tf.daftar.slice(0, 4).map(x => [
          esc(x.no_dokumen) + ' · ' + esc(x.cabang_asal) + ' → ' + esc(x.cabang_tujuan),
          lencanaDash(labelStatus(x.status), WARNA_STATUS[x.status]),
          x.status === 'DIKIRIM' ? 'sejak ' + esc(waktuRingkas(x.tanggal_kirim)) : esc(waktuRingkas(x.tanggal_terima || x.tanggal))]), 'Tidak ada transfer')}`,
      { id: 'kartuTransfer', tabel: 'transfer', kaki: '50 terbaru' }));

    if ($('#kartuReturVoid')) ganti('kartuReturVoid', kartuDaftarDash('Retur jual & void', 'periode ini ' + cap,
      rv === null || rv === undefined ? '<div class="dr-kosong">Tidak tersedia</div>' : `
        ${/* rpTeks, bukan rp: lencanaDash meng-escape teksnya, dan rp() memulangkan HTML
           (<span class="rp">) — versi rp() tampil sebagai teks mentah di Dasbor sampai
           22 Sep 2026. Ada penjaga di uji.js untuk polanya. */ ''}
        <div class="ringkas-dash">${lencanaDash(rv.retur.n + ' retur · ' + rpTeks(rv.retur.nilai), 'abu')}${lencanaDash(rv.void.n + ' void · ' + rpTeks(rv.void.nilai), rv.void.n ? 'merah' : 'abu')}</div>
        ${barisDash(rv.daftar.slice(0, 4).map(x => [
          esc(x.no) + ' · ' + x.jenis, esc(x.id_user), esc(x.alasan || '')]), 'Tidak ada retur maupun void')}`,
      { id: 'kartuReturVoid', tabel: 'retur_void', kaki: '50 terbaru' }));

    if ($('#kartuAudit')) ganti('kartuAudit', kartuDaftarDash('Aktivitas terakhir', 'log audit ' + cap,
      la === null || la === undefined ? '<div class="dr-kosong">Tidak tersedia</div>'
        : barisDash(la.slice(0, 5).map(x => [esc(x.aksi) + ' · ' + esc(x.id_entitas || x.entitas), esc(x.id_user), esc(jamDari(x.waktu))]), 'Belum ada catatan'),
      { id: 'kartuAudit', tabel: 'audit', kaki: '50 terbaru' }));

    if ($('#kartuOpnameUtang')) ganti('kartuOpnameUtang', kartuDaftarDash('Opname & utang', cap, `
        <div class="dr-judul">Opname belum diposting</div>
        ${barisDash((op || []).slice(0, 2).map(x => [esc(x.no_dokumen) + ' · ' + esc(x.cabang) + ' · ' + esc(x.status), x.jumlah_selisih + ' selisih', 'sejak ' + esc(waktuRingkas(x.waktu_buka))]), op === null ? 'Tidak tersedia' : 'Tidak ada')}
        <div class="dr-judul">Utang ke supplier</div>
        ${ut ? barisDash([
          ['Belum jatuh tempo', '<strong>' + rp(ut.belum) + '</strong>'],
          ['Jatuh tempo ≤ 7 hari', '<strong class="' + (ut.segera > 0 ? 'peringatan' : '') + '">' + rp(ut.segera) + '</strong>'],
          ['Sudah telat', '<strong class="' + (ut.telat > 0 ? 'bahaya' : '') + '">' + rp(ut.telat) + '</strong>']
        ]) : '<div class="dr-kosong">Tidak tersedia</div>'}`,
      { id: 'kartuOpnameUtang', tabel: 'opname_utang', kaki: 'per supplier' }));

    if ($('#kartuShift')) ganti('kartuShift', kartuDaftarDash('Shift hari ini', 'per cabang ' + cap,
      sh === null || sh === undefined ? '<div class="dr-kosong">Tidak tersedia</div>'
        : barisDash(sh.slice(0, 5).map(x => [
            esc(x.cabang) + ' · ' + esc(x.nama || x.id_user || '—'),
            lencanaDash(x.status === 'TUTUP' ? 'tutup ' + jamDari(x.tutup) : labelStatus(x.status), WARNA_STATUS[x.status]),
            x.status === 'BUKA' ? 'sejak ' + jamDari(x.buka) : x.status === 'TUTUP' ? 'selisih ' + rp(x.selisih) : '']), 'Tidak ada cabang'),
      { id: 'kartuShift', tabel: 'shift', kaki: '30 hari' }));
  }

  /* ==================== POP-UP "LIHAT SEBAGAI TABEL" ====================
   * Tidak memanggil server: seluruh barisnya sudah ikut turun bersama inti,
   * berat, dan monitor. Rincian produk (tipe HP, cocok untuk, kategori, merek)
   * diambil dari katalog di perangkat — permintaan pemilik 12 Sep 2026:
   * "nama produk seperti multi fit tidak terbaca tipe hapenya".
   */
  async function bukaTabelDash(jenis) {
    const d = dataDash || {};
    const inti = d.inti || {}, berat = d.berat || {}, mon = d.monitor || {};
    let judul = '', kolom = [], baris = [], cari = true;
    const katalog = {};
    const perluKatalog = ['produk', 'stok', 'permintaan', 'transfer', 'retur_void'].indexOf(jenis) !== -1;
    if (perluKatalog) {
      try { (await DB.all('produk')).forEach(p => { katalog[p.sku] = p; }); } catch (e) { /* katalog kosong tetap jalan */ }
    }
    const cocok = (sku) => {
      const p = katalog[sku]; if (!p) return '';
      const daftar = [p.tipe_hp].concat((p.kompatibel || []).map(k => (k.merek ? k.merek + ' ' : '') + k.tipe)).filter(Boolean);
      return Array.from(new Set(daftar)).join(' · ');
    };
    const kelompok = (sku) => { const p = katalog[sku]; return p ? [p.kategori, p.merek].filter(Boolean).join(' · ') : ''; };
    const kolProduk = [
      { judul: 'Produk', kunci: 'nama' }, { judul: 'SKU', kunci: 'sku' },
      { judul: 'Cocok untuk', render: r => esc(cocok(r.sku) || '—') },
      { judul: 'Kategori · merek', render: r => esc(kelompok(r.sku) || '—') }
    ];
    switch (jenis) {
      case 'produk':
        judul = 'Produk terlaris · 50 teratas';
        kolom = kolProduk.concat([{ judul: 'Qty', kunci: 'qty', angka: true }, { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }]);
        baris = (berat.peringkat && berat.peringkat.produk) || (inti.peringkat && inti.peringkat.produk) || [];
        break;
      case 'kategori':
        judul = 'Omzet per kategori';
        kolom = [{ judul: 'Kategori', kunci: 'nama' }, { judul: 'Qty', kunci: 'qty', angka: true },
                 { judul: 'Omzet', angka: true, render: r => rp(r.omzet) },
                 { judul: 'Margin', angka: true, render: r => r.margin === undefined ? '—' : (r.margin || 0).toFixed(1) + '%' }];
        baris = (berat.peringkat && berat.peringkat.kategori) || (inti.peringkat && inti.peringkat.kategori) || [];
        break;
      case 'petugas':
        judul = 'Peringkat petugas';
        kolom = [{ judul: 'Nama', kunci: 'nama' }, { judul: 'Poin', kunci: 'poin', angka: true }, { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }];
        baris = (d.petugas && d.petugas.peringkat && d.petugas.peringkat.petugas) ||
                (inti.peringkat && inti.peringkat.petugas) || [];
        break;
      case 'cabang':
        judul = 'Omzet per cabang';
        kolom = [{ judul: 'Cabang', kunci: 'cabang' }, { judul: 'Nota', kunci: 'nota', angka: true }, { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }];
        baris = (inti.peringkat && inti.peringkat.cabang) || inti.per_cabang || [];
        break;
      case 'jam':
        judul = 'Omzet per jam';
        kolom = [{ judul: 'Jam', render: r => String(r.jam).padStart(2, '0') + ':00' }, { judul: 'Nota', kunci: 'nota', angka: true }, { judul: 'Omzet', angka: true, render: r => rp(r.omzet) }];
        baris = (inti.per_jam || []).filter(x => x.nota > 0); cari = false;
        break;
      case 'piutang':
        judul = 'Kas masuk & umur piutang';
        kolom = [{ judul: 'Keterangan', kunci: 'k' }, { judul: 'Nominal', angka: true, render: r => rp(r.v) }];
        { const pi = (inti.kas && inti.kas.piutang) || {};
          baris = ((inti.kas && inti.kas.per_metode) || []).map(r => ({ k: 'Kas masuk · ' + String(r.metode).toUpperCase(), v: r.jumlah }))
            .concat([{ k: 'Piutang belum jatuh tempo', v: pi.belum || 0 }, { k: 'Piutang lewat 1–30 hari', v: pi.d1_30 || 0 }, { k: 'Piutang lewat 30+ hari', v: pi.d30plus || 0 }]); }
        cari = false; break;
      case 'stok':
        judul = 'Kesehatan stok · menipis & barang mati';
        kolom = kolProduk.concat([{ judul: 'Keadaan', kunci: 'keadaan' }, { judul: 'Stok', kunci: 'qty', angka: true }, { judul: 'Min / nilai', angka: true, render: r => r.stok_min !== undefined ? 'min ' + r.stok_min : rp(r.nilai) }]);
        { const st = berat.stok || inti.stok || {};
          baris = (st.kritis || []).map(r => Object.assign({ keadaan: 'menipis' }, r)).concat((st.mati || []).map(r => Object.assign({ keadaan: 'tidak terjual' }, r))); }
        break;
      case 'permintaan':
        judul = 'Permintaan barang · 50 terbaru';
        kolom = [{ judul: 'Dokumen', kunci: 'no_dokumen' }, { judul: 'Tanggal', render: r => esc(tglTampil(r.tanggal)) },
                 { judul: 'Rute', render: r => esc(r.cabang_asal) + ' → ' + esc(r.cabang_tujuan) },
                 { judul: 'Status', render: r => lencanaDash(labelStatus(r.status), WARNA_STATUS[r.status]) },
                 { judul: 'Item', render: r => (r.item || []).map(i => esc(i.nama_produk) + (cocok(i.sku) ? ' <span class="petunjuk">' + esc(cocok(i.sku)) + '</span>' : '') + ' <strong>' + i.qty_proses + '/' + i.qty_minta + '</strong>').join('<br>') }];
        baris = (mon.permintaan && mon.permintaan.daftar) || [];
        break;
      case 'transfer':
        judul = 'Transfer barang · 50 terbaru';
        kolom = [{ judul: 'Dokumen', kunci: 'no_dokumen' }, { judul: 'Tanggal', render: r => esc(tglTampil(r.tanggal)) },
                 { judul: 'Rute', render: r => esc(r.cabang_asal) + ' → ' + esc(r.cabang_tujuan) },
                 { judul: 'Status', render: r => lencanaDash(labelStatus(r.status), WARNA_STATUS[r.status]) },
                 { judul: 'Item', render: r => (r.item || []).map(i => esc(i.nama_produk) + (cocok(i.sku) ? ' <span class="petunjuk">' + esc(cocok(i.sku)) + '</span>' : '') + ' <strong>' + i.qty_kirim + (i.qty_terima !== null && i.qty_terima !== undefined ? '/' + i.qty_terima : '') + '</strong>').join('<br>') }];
        baris = (mon.transfer && mon.transfer.daftar) || [];
        break;
      case 'retur_void':
        judul = 'Retur jual & void · periode ini';
        kolom = [{ judul: 'Jenis', kunci: 'jenis' }, { judul: 'Nomor', kunci: 'no' }, { judul: 'Tanggal', render: r => esc(tglTampil(r.tanggal)) + (r.jam ? ' ' + esc(r.jam) : '') },
                 { judul: 'Cabang', kunci: 'cabang' }, { judul: 'Kasir', kunci: 'id_user' }, { judul: 'Nilai', angka: true, render: r => rp(r.nilai) },
                 { judul: 'Alasan', kunci: 'alasan' },
                 { judul: 'Item', render: r => (r.item || []).map(i => esc(i.nama_produk) + ' × ' + i.qty + (i.kondisi ? ' (' + esc(i.kondisi) + ')' : '')).join('<br>') || '—' }];
        baris = (mon.retur_void && mon.retur_void.daftar) || [];
        break;
      case 'audit':
        judul = 'Aktivitas terakhir · 50 catatan';
        kolom = [{ judul: 'Waktu', render: r => esc(waktuTampil(r.waktu)) }, { judul: 'Pengguna', kunci: 'id_user' }, { judul: 'Aksi', kunci: 'aksi' }, { judul: 'Entitas', render: r => esc(r.entitas) + (r.id_entitas ? ' · ' + esc(r.id_entitas) : '') }];
        baris = mon.audit || [];
        break;
      case 'opname_utang':
        judul = 'Opname belum diposting & utang per supplier';
        kolom = [{ judul: 'Jenis', kunci: 'jenis' }, { judul: 'Keterangan', kunci: 'ket' }, { judul: 'Status / jatuh tempo', kunci: 'st' }, { judul: 'Nilai', angka: true, kunci: 'nilai' }];
        baris = (mon.opname || []).map(o => ({ jenis: 'opname', ket: o.no_dokumen + ' · ' + o.cabang + ' · ' + (o.id_user || ''), st: labelStatus(o.status) + ' · sejak ' + waktuTampil(o.waktu_buka), nilai: o.jumlah_selisih + ' selisih' }))
          .concat(((mon.utang && mon.utang.daftar) || []).map(u => ({ jenis: 'utang', ket: u.nama_supplier, st: u.hari_telat > 0 ? 'telat ' + u.hari_telat + ' hari' : 'jatuh tempo ' + tglTampil(u.jatuh_tempo), nilai: rp(u.sisa) })));
        break;
      case 'shift':
        judul = 'Shift hari ini per cabang';
        kolom = [{ judul: 'Cabang', kunci: 'cabang' }, { judul: 'Kasir', render: r => esc(r.nama || r.id_user || '—') },
                 { judul: 'Status', render: r => lencanaDash(labelStatus(r.status), WARNA_STATUS[r.status]) },
                 { judul: 'Buka', render: r => esc(jamDari(r.buka)) }, { judul: 'Tutup', render: r => esc(jamDari(r.tutup)) },
                 { judul: 'Nota', kunci: 'jumlah_nota', angka: true }, { judul: 'Selisih kas', angka: true, render: r => r.status === 'TUTUP' ? rp(r.selisih) : '—' }];
        baris = mon.shift || []; cari = false;
        break;
      case 'tren':
        judul = 'Tren penjualan';
        { const g = grafikTerakhir;
          if (g && grafikModeKini === 'bulanan' && g.tren_bulanan) {
            kolom = [{ judul: 'Bulan', kunci: 'periode' }, { judul: 'Laba kotor', angka: true, render: r => rp(r.laba_kotor) }];
            baris = g.tren_bulanan;
          } else if (g) {
            kolom = [{ judul: 'Tanggal', render: r => esc(tglTampil(r.tanggal)) }, { judul: 'Nota', kunci: 'nota', angka: true }, { judul: 'Omzet', angka: true, render: r => rp(r.total) }];
            baris = g.deret_harian.map((x, i) => Object.assign({ tanggal: g.tanggal[i] }, x));
          } }
        cari = false; break;
      default: return;
    }
    bukaModal(judul, `
      ${cari ? '<input type="text" class="input-cari" id="cariTabelDash" placeholder="Cari di tabel ini…" style="max-width:320px;margin-bottom:10px">' : ''}
      <div id="isiTabelDash">${tabelPolos(kolom, baris)}</div>
      <p class="petunjuk" style="margin:8px 0 0">${baris.length} baris. Tidak memanggil server — angkanya sama dengan yang di kartu.</p>`);
    if (cari) {
      const inp = $('#cariTabelDash');
      inp.addEventListener('input', () => {
        const q = inp.value.toLowerCase().trim();
        const teks = (r) => kolom.map(k => k.render ? k.render(r) : String(r[k.kunci] ?? '')).join(' ').replace(/<[^>]+>/g, ' ').toLowerCase();
        $('#isiTabelDash').innerHTML = tabelPolos(kolom, q ? baris.filter(r => teks(r).indexOf(q) !== -1) : baris);
      });
      inp.focus();
    }
  }

  async function muatDashboard() {
    rangkaDashboard();
    const tiket = ++tiketDash;
    try {
      /* `bagian: 'inti'` — server lama yang belum mengenalnya membalas bentuk
         penuh, dan itu ditangani: kalau peringkat dan stoknya sudah ikut,
         bagian berat tidak ditarik lagi. */
      const basi = Math.max(basiDash('inti'), basiDash('monitor'), basiDash('berat'), basiDash('grafik30'), basiDash('petugas'));
      /* Peringkat petugas BERANGKAT BERSAMAAN dengan inti (bagian 268) — dulu
         ikut di dalam inti dan menambah 2,0 dtk ke tunggu omzetnya. */
      const janjiPetugas = ambilDash('petugas', () => API.dashboard({ ...paramDash(), bagian: 'petugas' }, { latar: true }));
      janjiPetugas.catch(() => {});                       // ditangani di isiKartuPetugas
      const d = await ambilDash('inti', () => API.dashboard({ ...paramDash(), bagian: 'inti', tanpa_klaim: true }));
      if (tiket !== tiketDash) return;
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

      /* Seluruh muatan disimpan untuk pop-up "Lihat sebagai tabel" — pop-up
         tidak memanggil server (§159). */
      dataDash = { inti: d, berat: null, monitor: null, petugas: null };

      $('#isiDashboard').innerHTML = `
        <div class="bar-alat rapat bar-dash">
          ${Periode.html({ ...PERIODE_DASH, nilai: periodeDash, nilaiDari: dashKustom.dari, nilaiSampai: dashKustom.sampai })}
          ${pilihCabangDash()}
          <span class="petunjuk keterangan-dash" style="margin:0" title="Dibanding periode sebelumnya yang sama panjang">${esc(keteranganRentangDash(d))}</span>
          ${/* Kalimat pembuka Dashboard DIBUANG atas perintah pemilik 23 Sep 2026
             (bagian 236); keterangan-dash di atas tetap kalimat pembuka layarnya. */ ''}
        </div>

        <div id="stripDash">${stripDash(d, null)}</div>

        ${petakMini([
          kotakMini('Omzet', rp(k.omzet), lencanaSelisih(k.omzet, l.omzet),
            { ikon: 'omzet', warna: 'biru', ke: 'riwayat' }),
          kotakMini('Nota', k.nota, lencanaSelisih(k.nota, l.nota),
            { ikon: 'nota', warna: 'ungu', ke: 'riwayat' }),
          kotakMini('Rata-rata/nota', rp(k.rata_nota || 0), lencanaSelisih(k.rata_nota, l.rata_nota),
            { ikon: 'rata', warna: 'teal' }),
          adaMargin ? kotakMini('Laba kotor', rp(k.laba_kotor), lencanaSelisih(k.laba_kotor, l.laba_kotor),
            { ikon: 'laba', warna: 'hijau', ke: 'laporan' }) : '',
          adaMargin ? kotakMini('Margin', (k.margin || 0).toFixed(1) + '%',
            lencanaPoin(k.margin, l.margin), { ikon: 'margin', warna: 'hijau' }) : '',
          kotakMini('Piutang beredar', rp(pi.total || 0),
            (pi.d1_30 + pi.d30plus) > 0
              ? `<span class="delta turun">${rp(pi.d1_30 + pi.d30plus)} lewat tempo</span>` : '',
            { ikon: 'piutang', warna: 'kuning', ke: 'piutang' })
        ].join(''), 'petak-kpi')}

        ${/* BARIS 1 — tren, kas & piutang, jam ramai. Tiga kartu berdiri sendiri,
              sama tinggi (align-items: stretch). */''}
        <div class="petak-dash">
          <div class="kartu rapat kartu-dash" id="kartuTren">
            <h4>Tren penjualan
              <span class="seg" id="grafikMode" role="group" aria-label="Rentang grafik">
                ${[['14', '14'], ['30', '30'], ['60', '60'], ['90', '90'], ['bulanan', 'Laba 6 bln']].map(([v, t]) =>
                  `<button type="button" data-grafik="${v}" class="${v === '30' ? 'aktif' : ''}">${t}</button>`).join('')}
              </span></h4>
            <div class="isi-dash"><div id="wadahGrafik"><p class="grafik-kosong">Memuat grafik…</p></div></div>
            <div class="kaki-dash"><button type="button" class="tabel-tautan" data-tabel-dash="tren">Lihat sebagai tabel</button></div>
          </div>
          ${kartuDaftarDash('Kas & piutang', '', `
            <div class="dr-judul">Kas masuk</div>
            ${barisDash((kas.per_metode || []).map(r => [esc(String(r.metode).toUpperCase()), rp(r.jumlah)]), 'Belum ada pembayaran')}
            <div class="dr-judul">Umur piutang</div>
            ${barisDash([
              ['Belum jatuh tempo', '<strong>' + rp(pi.belum || 0) + '</strong>'],
              ['Lewat 1–30 hari', '<strong class="' + (pi.d1_30 > 0 ? 'peringatan' : '') + '">' + rp(pi.d1_30 || 0) + '</strong>'],
              ['Lewat 30+ hari', '<strong class="' + (pi.d30plus > 0 ? 'bahaya' : '') + '">' + rp(pi.d30plus || 0) + '</strong>']
            ])}`, { tabel: 'piutang', kaki: 'per pelanggan', id: 'kartuKas' })}
          ${kartuDaftarDash('Jam ramai', 'omzet per jam',
            '<div id="wadahJam"><p class="grafik-kosong">Belum ada penjualan</p></div>',
            { tabel: 'jam', kaki: '24 jam', id: 'kartuJam' })}
        </div>

        ${/* BARIS 2 & 3 — kartu monitor. Rangka dulu, diisi belakangan dari
              bagian 'monitor' di latar (sama polanya dengan 'berat'). Kartu yang
              perannya tidak berhak tidak pernah digambar — rangkanya pun tidak. */''}
        <div class="petak-dash" id="petakMonitor">${rangkaMonitor()}</div>

        ${/* BARIS 4 — empat peringkat, empat kartu sendiri. */''}
        <div class="petak-dash petak-dash-4">
          ${rangkaKartuPeringkat('Produk terlaris', 'wadahPeringkatProduk')}
          ${rangkaKartuPeringkat('Kategori', 'wadahPeringkatKategori')}
          ${pk.petugas ? kartuPetugasDash(pk.petugas) : `<div class="kartu rapat kartu-dash" id="kartuPetugas" aria-busy="true">
            <h4>Petugas</h4><div class="isi-dash">${rangkaBaris(4, ['80%', '62%', '74%', '56%'])}</div></div>`}
          ${kartuDaftarDash('Cabang', '', barisDash((pk.cabang || d.per_cabang || []).slice(0, 5).map(r =>
              [esc(r.cabang), rp(r.omzet), r.nota + ' nota']), 'Belum ada transaksi'),
            { tabel: 'cabang', kaki: 'semua', id: 'kartuCabang' })}
        </div>

        ${rangkaKartuStok('wadahStokDash')}`;

      muatGrafik(30);
      /* Peringkat petugas (bagian 268): server LAMA masih mengirimnya di inti —
         kartunya sudah tergambar di atas; selain itu diisi begitu tiba. */
      if (!pk.petugas) isiKartuPetugas(tiket, janjiPetugas);
      /* Kartu monitor ditarik di LATAR sesudah layar terbaca — sama alasannya
         dengan `berat`: mengunci tombol selama tujuh daftar dihitung berarti
         mengunci layar yang sudah selesai. */
      muatDashboardMonitor(tiket);

      /* Jam ramai. Jam yang NOL sengaja ikut dikirim server lalu disaring di sini,
         bukan disaring di server: yang menentukan jam buka toko adalah pemiliknya,
         dan menyaring di server berarti memutuskan untuk semua toko. */
      const jam = (d.per_jam || []).filter(x => x.nota > 0);
      if (jam.length) {
        Grafik.batang($('#wadahJam'), {
          data: jam.map(x => ({ label: String(x.jam).padStart(2, '0') + ':00',
                                nilai: x.omzet, tambahan: x.nota + ' nota' })),
          tanpaTabel: true
        });
      }

      /* Bagian berat. Kalau server (lama) sudah mengirimnya, langsung diisi;
         kalau tidak, ditarik di LATAR — layar sudah bisa dibaca, dan mengunci
         tombol selama peringkat dihitung berarti mengunci layar yang sudah
         selesai. */
      if (pk.produk && d.stok && d.stok.kritis) isiBagianBerat(d, adaMargin);
      else muatDashboardBerat(tiket, adaMargin);

      /* Ada bagian yang digambar dari simpanan lama: sebut jamnya, segarkan. */
      if (basi) {
        const jam = new Date(basi).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        $('#isiDashboard').insertAdjacentHTML('afterbegin',
          `<p class="petunjuk" id="dashBasi" role="status">Angka tersimpan pukul ${esc(jam)} — sedang diperbarui…</p>`);
        segarkanDashLatar(tiket);
      }
    } catch (e) { galat('#isiDashboard', e); }
  }

  async function muatDashboardBerat(tiket, adaMargin) {
    try {
      const b = await ambilDash('berat', () => API.dashboard({ ...paramDash(), bagian: 'berat' }, { latar: true }));
      if (tiket !== tiketDash) return;
      isiBagianBerat(b, adaMargin);
    } catch (e) {
      if (tiket !== tiketDash) return;
      /* Gagalnya bagian berat TIDAK merobohkan dashboard yang sudah tergambar.
         Tiga kartunya diberi pesan, sisanya tetap terbaca. */
      ['wadahPeringkatProduk', 'wadahPeringkatKategori', 'wadahStokDash'].forEach(id => {
        const el = $('#' + id);
        if (el) el.outerHTML = `<div class="kartu rapat" id="${id}"><p class="pesan galat" style="margin:0">Peringkat &amp; stok gagal dimuat — ${esc(e.message)}</p></div>`;
      });
    }
  }

  /** Isi tiga kartu yang datang belakangan: dua peringkat dan kesehatan stok. */
  function isiBagianBerat(b, adaMargin) {
    const pk = (b && b.peringkat) || {};
    const st = (b && b.stok) || {};
    if (dataDash) dataDash.berat = b;
    const cap = b && b.diperbarui ? '· per ' + b.diperbarui : '';
    const wp = $('#wadahPeringkatProduk'), wk = $('#wadahPeringkatKategori'), ws = $('#wadahStokDash');
    /* Lima di layar, lima puluh di dataDash — pop-up membaca yang lima puluh. */
    if (wp) wp.outerHTML = kartuDaftarDash('Produk terlaris', cap,
      barisDash((pk.produk || []).slice(0, 5).map(r => [esc(r.nama), rp(r.omzet), r.qty]), 'Belum ada penjualan'),
      { tabel: 'produk', kaki: '50 teratas', id: 'wadahPeringkatProduk' });
    if (wk) wk.outerHTML = kartuDaftarDash('Kategori', cap,
      barisDash((pk.kategori || []).slice(0, 5).map(r =>
        [esc(r.nama), rp(r.omzet), adaMargin ? (r.margin || 0).toFixed(1) + '%' : '']), 'Belum ada penjualan'),
      { tabel: 'kategori', kaki: 'semua', id: 'wadahPeringkatKategori' });
    if (ws) ws.outerHTML = kartuStokDash(st, cap, 'wadahStokDash');
  }

  /** Kartu "Kesehatan stok" — dipisah supaya bisa digambar belakangan. */
  function kartuStokDash(st, cap, id) {
    return `<div class="kartu rapat kartu-dash"${id ? ` id="${id}"` : ''}>
      <h4>Kesehatan stok <span class="sub">· cabang ${esc(APP_STATE.cabang)} ${esc(cap || '')}</span></h4>
      <div class="isi-dash">
      ${petakMini([
        kotakMini('Nilai persediaan', rp(st.nilai || 0), '', { ikon: 'nilai', warna: 'biru' }),
        kotakMini('Hari persediaan', st.hari_persediaan === null || st.hari_persediaan === undefined
          ? '—' : st.hari_persediaan + ' hari', '', { ikon: 'hari', warna: 'teal' }),
        kotakMini('Nilai barang mati', rp(st.nilai_mati || 0),
          st.jumlah_mati ? `<span class="delta turun">${st.jumlah_mati} SKU tak terjual</span>` : '',
          { ikon: 'mati', warna: 'ungu' }),
        kotakMini('Stok menipis', String(st.jumlah_kritis || 0),
          st.jumlah_kritis ? '<span class="delta turun">perlu dipesan</span>'
                           : '<span class="delta naik">aman</span>',
          { ikon: 'kritis', warna: st.jumlah_kritis ? 'merah' : 'hijau', ke: 'stok' })
      ].join(''), 'petak-stok-mini')}
      <div class="dua-dash">
        <div><div class="dr-judul">Menyentuh ambang minimum</div>
          ${barisDash((st.kritis || []).slice(0, 5).map(r => [esc(r.nama), r.qty + ' / min ' + r.stok_min]), 'Tidak ada')}</div>
        <div><div class="dr-judul">Bernilai besar, tidak terjual</div>
          ${barisDash((st.mati || []).slice(0, 5).map(r => [esc(r.nama), rp(r.nilai), r.qty + ' pcs']), 'Semua produk berstok terjual')}</div>
      </div>
      </div>
      <div class="kaki-dash"><button type="button" class="tabel-tautan" data-tabel-dash="stok">Lihat sebagai tabel · 50 teratas</button></div>
    </div>`;
  }

  /* Rangka untuk kartu yang datang belakangan. Bentuknya kartu sungguhan
     dengan judul yang sudah terbaca — orang tahu APA yang sedang dimuat. */
  const rangkaKartuPeringkat = (judul, id) => `<div class="kartu rapat kartu-dash" id="${id}" aria-busy="true">
      <h4>${esc(judul)}</h4><div class="isi-dash">${rangkaBaris(4, ['84%', '66%', '76%', '58%'])}</div></div>`;
  const rangkaKartuStok = (id) => `<div class="kartu rapat kartu-dash" id="${id}" aria-busy="true">
      <h4>Kesehatan stok</h4><div class="isi-dash">${rangkaBaris(5, ['80%', '62%', '90%', '70%', '54%'])}</div></div>`;

  /* Muatan grafik terakhir, disimpan supaya perubahan tema bisa menggambar ulang
     TANPA memanggil server lagi. SVG yang sudah tergambar tidak ikut berubah
     warna sendiri seperti kotak dan teks — token CSS tidak menyentuh atribut
     `fill` dan `stroke` yang sudah ditulis ke dalam elemennya. */
  let grafikTerakhir = null;

  /** Hanya menggambar. Tidak mengambil data, tidak menyentuh innerHTML wadahnya. */
  function pasangGrafik(g) {
    if (!g || !$('#gPenjualan')) return;
    /* Tinggi 170 px, bukan 300 bawaan grafik.js — diminta pemilik 12 Sep 2026:
       "petak tren penjualan terlalu melebar dan banyak yang lega". Kartunya
       satu kolom, grafiknya mengikuti lebar kartu. */
    if (grafikModeKini === 'bulanan') {
      if (g.tren_bulanan) Grafik.garis($('#gPenjualan'), {
        tanggal: g.tren_bulanan.map(x => x.periode),
        seri: [{ nama: 'Laba kotor', data: g.tren_bulanan.map(x => x.laba_kotor) }],
        tinggi: 140, tanpaTabel: true
      });
      else $('#gPenjualan').innerHTML = '<p class="grafik-kosong">Laba kotor hanya untuk peran yang berhak melihat margin.</p>';
      return;
    }
    // Satu garis per cabang bila lintas cabang; kalau hanya satu cabang, satu garis omzet.
    /* seri_cabang SUDAH berbentuk yang dimengerti Grafik.garis: { nama, data }
       (16_Grafik.gs). v1.179 memetakannya ulang ke dua kunci yang tidak
       ada, dan "Semua cabang" meledak di s.data.forEach (§160). Apa adanya. */
    const seri = g.seri_cabang.length > 1
      ? g.seri_cabang
      : [{ nama: 'Omzet', data: g.deret_harian.map(x => x.total) }];
    Grafik.garis($('#gPenjualan'), { tanggal: g.tanggal, seri, tinggi: 140, tanpaTabel: true });
  }

  /* Tema diubah pemilik dari perangkat lain; perangkat ini baru tahu saat
     sinkronisasi. Kotak dan teks sudah ikut gelap lewat token CSS — grafiknya
     belum, dan grafik terang di tengah layar gelap terbaca sebagai kerusakan.
     Digambar ulang dari muatan yang sudah ada: tidak ada panggilan server. */
  document.addEventListener('tema:berubah', () => {
    if (grafikTerakhir) pasangGrafik(grafikTerakhir);
  });

  /* Muatan grafik dicatat per mode supaya pergantian 14/30/60/90 yang sudah
     pernah ditarik tidak menembak server lagi. */
  const grafikMuatan = {};
  let grafikModeKini = '30';
  async function muatGrafik(hari) {
    const w = $('#wadahGrafik');
    if (!w) return;
    const mode = String(hari);
    grafikModeKini = mode;
    $$('#grafikMode [data-grafik]').forEach(b => b.classList.toggle('aktif', b.dataset.grafik === mode));
    if (!grafikMuatan[mode]) w.innerHTML = '<p class="grafik-kosong">Memuat grafik…</p>';
    try {
      /* "Laba 6 bln" memakai muatan 30 hari (tren_bulanan ikut di dalamnya). */
      const kunci = mode === 'bulanan' ? '30' : mode;
      const g = grafikMuatan[kunci] || (grafikMuatan[kunci] = await ambilDash('grafik' + kunci, () => API.dataGrafik({ hari: Number(kunci) })));
      if (grafikModeKini !== mode) return;              /* orang sudah ganti mode */
      const r = g.ringkas;
      /* Satu baris angka ringkas, bukan empat petak: petak KPI di atas sudah
         menyebut omzet, rata-rata, dan margin untuk periode yang dipilih. */
      w.innerHTML = `
        <div class="tren-angka">${mode === 'bulanan'
          ? '<span>Laba kotor 6 bulan terakhir</span>'
          : `<span>${kunci} hari <strong>${rp(r.omzet)}</strong></span><span>per hari <strong>${rp(r.rata_per_hari)}</strong></span><span>per nota <strong>${rp(r.rata_per_nota)}</strong></span>`}
          ${g.dihitung ? `<span class="petunjuk" style="margin:0 0 0 auto" title="${g.dari_cache ? 'tersimpan sementara di server' : ''}">per ${esc(waktuTampil(g.dihitung))}</span>` : ''}
        </div>
        <div id="gPenjualan"></div>`;
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
    { id: 'poin', judul: 'Poin', angka: true, nilai: r => Number(r.poin_satuan) || 0,
      // Angka telanjang, bukan "2 poin": kolomnya sudah bernama Poin, dan
      // satuan yang diulang di tiap baris justru memperlambat membaca.
      render: r => Number(r.poin_satuan) > 0 ? String(r.poin_satuan) : '—' },
    { id: 'margin', judul: 'Margin', angka: true, butuhModal: true, nilai: r => Number(r.margin_eceran) || 0,
      render: r => (r.margin_eceran || 0).toFixed(1) + '%' },
    /* Sejak v1.149.0 daftar hanya membawa JUMLAHNYA, dan itu pun hanya kalau
       kolom ini sedang dipakai — pola yang sama dengan kolom "Terjual".
       `butuhTurunan` yang memicu penarikannya. */
    { id: 'turunan', judul: 'Turunan', butuhTurunan: true,
      nilai: r => (r.n_satuan || 0) + (r.n_tier || 0) + (r.n_varian || 0), render: r => [
        r.n_satuan ? `<span class="lencana">${r.n_satuan} satuan</span>` : '',
        r.n_tier ? `<span class="lencana">${r.n_tier} tier</span>` : '',
        r.n_varian ? `<span class="lencana">${r.n_varian} varian</span>` : ''
      ].filter(Boolean).join(' ') || '—' },
    { id: 'stok_min', judul: 'Stok min', angka: true, nilai: r => Number(r.stok_min) || 0, render: r => String(r.stok_min ?? 0) },
    { id: 'barcode', judul: 'Barcode', nilai: r => r.barcode || '', render: r => esc(r.barcode || '') || '—' },
    { id: 'satuan_dasar', judul: 'Satuan', nilai: r => r.satuan_dasar || 'pcs', render: r => esc(r.satuan_dasar || 'pcs') }
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
    /* Menipis - DUA LAPIS, keputusan pemilik 11 Sep 2026.
         lapis 1: `stok_min` produk itu, kalau sudah disetel;
         lapis 2: 2 pcs, kalau `stok_min` masih 0.
       Lapis 2 ada karena saat aturan ini dibuat SELURUH 3.488 produk aktif
       ber-`stok_min` 0 - saringan yang hanya membaca `stok_min` akan selamanya
       kosong, dan saringan yang selalu kosong membuat orang berhenti percaya
       pada layarnya. Begitu `stok_min` mulai diisi, lapis 1 mengambil alih
       sendiri tanpa kode ini perlu diubah.

       Stok NOL sengaja TIDAK ikut: itu habis, bukan menipis - dan 2.971 dari
       3.488 produk berstok nol, jadi memasukkannya mengubur 113 baris yang
       benar-benar perlu ditindaklanjuti. */
    { id: 'menipis', label: 'Menipis',
      lolos: r => { const s = Number(r.stok) || 0, m = Number(r.stok_min) || 0;
                    return s > 0 && s <= (m > 0 ? m : 2); },
      urut: (a, b) => (Number(a.stok) || 0) - (Number(b.stok) || 0) },
    { id: 'berpoin', label: 'Berpoin', lolos: r => Number(r.poin_satuan) > 0 },
    { id: 'tanpa_poin', label: 'Tanpa poin', lolos: r => !(Number(r.poin_satuan) > 0) },
    /* SKU yang dibatasi ke cabang tertentu (v1.156). Yang '*' — dijual di
       semua cabang — sengaja tidak punya saringannya sendiri: itu hampir
       seluruh katalog, dan "semua kecuali sedikit" bukan daftar yang dicari. */
    { id: 'khusus_cabang', label: 'Khusus cabang', lolos: r => produkDibatasi(r) }
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

  /**
   * PAGINASI BERSAMA — satu mesin untuk setiap daftar besar (v1.155.0).
   *
   * Lahir di layar Produk (v1.149.0) sebagai tiga fungsi + satu variabel
   * `halProduk`. Pemilik lalu meminta yang sama untuk Stok, dan menyalin
   * ketiganya berarti dua penjepit halaman yang suatu hari berbeda. Sekarang
   * `buatHalaman(nama)` mengembalikan satu objek per daftar; tombolnya
   * membawa `data-hal-untuk="<nama>"` supaya satu penangan klik melayani
   * semuanya, dan `GAMBAR_HALAMAN[nama]` yang tahu cara menggambar ulang
   * daftar itu.
   *
   * Halaman DIJEPIT setiap potong: mengetik di kolom cari bisa membuat halaman
   * 12 tidak ada lagi, dan halaman kosong terbaca sebagai "tidak ada yang
   * cocok" yang salah.
   *
   * URUTAN ikut tinggal di sini (v1.161.0). `urutkanTabel` menyusun ulang
   * <tr> yang ada di layar — dan di daftar berhalaman yang ada di layar cuma
   * 100 dari 3.500 baris. Pemilik mengkliknya 10 Sep 2026 di Produk →
   * Poin: "terbesar ke terkecil" menampilkan 4, 4, 4 … padahal yang berpoin
   * 10 ada di halaman lain. Jadi untuk daftar berhalaman, urutannya adalah
   * KEADAAN (`h.urut` = {judul, arah}) yang dipakai `h.urutkan()` atas
   * SELURUH baris sebelum dipotong 100 — dan pindah halaman, mengetik di
   * kolom cari, atau mengganti saringan tidak menghilangkannya. Klik judul
   * yang sama membalik arahnya; halaman kembali ke 1 karena "halaman 12 dari
   * urutan baru" bukan yang dicari siapa pun.
   */
  function buatHalaman(nama, label) {
    const h = {
      nama, kini: 1, urut: null,
      /* true selama urutannya belum pernah DIPILIH orang lewat judul kolom.
         Dipakai untuk membedakan urutan bawaan (boleh dikalahkan urutan milik
         saringan, mis. Terlaris) dari pilihan sadar (tidak boleh dikalahkan). */
      urutBawaan: true,
      reset() { h.kini = 1; },
      geser(arah) { h.kini += arah; },
      putarUrut(judul) {
        h.urutBawaan = false;   // sejak klik ini, urutannya pilihan orang
        const naik = !(h.urut && h.urut.judul === judul && h.urut.arah === 'naik');
        h.urut = { judul, arah: naik ? 'naik' : 'turun' };
        h.kini = 1;
      },
      /* Salinan `baris` yang urut menurut `h.urut`, dengan definisi kolom yang
         sama dengan yang menggambar tabelnya — nilai mentah (`kunci`/`nilai`)
         dibandingkan sebagai angka bila kolomnya `angka` atau nilainya memang
         angka (Turunan: jumlah satuan+tier+varian), selebihnya sebagai nama;
         kolom yang cuma punya `render` jatuh ke teks gambarnya tanpa tag HTML. Tanpa urutan, atau judulnya sedang tidak ada di tabel
         (kolom Poin diganti Margin), barisnya dikembalikan apa adanya. */
      urutkan(baris, kolom) {
        const u = h.urut;
        const k = u && kolom.find(x => x.judul && x.judul === u.judul);
        if (!k) return baris;
        const nilai = (r) => {
          const v = nilaiUrut(k, r);
          if (v !== undefined) return v;
          return k.render ? String(k.render(r)).replace(/<[^>]*>/g, '').trim() : '';
        };
        const angka = (v) => typeof v === 'number' ? v : angkaUrut(v);
        const arah = u.arah === 'naik' ? 1 : -1;
        return baris.slice().sort((a, b) => {
          const x = nilai(a), y = nilai(b);
          return arah * (k.angka || (typeof x === 'number' && typeof y === 'number')
            ? angka(x) - angka(y) : urutNama(x, y));
        });
      },
      potong(baris) {
        const maks = Math.max(1, Math.ceil(baris.length / BARIS_PER_HAL));
        if (h.kini > maks) h.kini = maks;
        if (h.kini < 1) h.kini = 1;
        return baris.slice((h.kini - 1) * BARIS_PER_HAL, h.kini * BARIS_PER_HAL);
      },
      /* Bilah halaman. Disembunyikan kalau semuanya muat di satu halaman —
         kendali yang tidak pernah bisa ditekan cuma menambah yang harus dibaca. */
      pager(total) {
        const maks = Math.ceil(total / BARIS_PER_HAL);
        if (maks <= 1) return '';
        const dari = (h.kini - 1) * BARIS_PER_HAL + 1;
        const sampai = Math.min(h.kini * BARIS_PER_HAL, total);
        return `
      <nav class="pager" aria-label="Halaman ${esc(label)}">
        <button class="tombol kecil" data-hal="prev" data-hal-untuk="${nama}" ${h.kini <= 1 ? 'disabled' : ''}
          aria-label="Halaman sebelumnya">‹ Sebelumnya</button>
        <span class="pager-teks" aria-live="polite">
          ${dari}–${sampai} · halaman ${h.kini}/${maks}
        </span>
        <button class="tombol kecil" data-hal="next" data-hal-untuk="${nama}" ${h.kini >= maks ? 'disabled' : ''}
          aria-label="Halaman berikutnya">Berikutnya ›</button>
      </nav>`;
      }
    };
    return h;
  }
  const halProduk = buatHalaman('produk', 'daftar produk');
  /* URUTAN BAWAAN daftar produk: nama, A-Z.

     Sampai v1.168 `urut` dibiarkan null, jadi yang tampil urutan baris mentah
     dari sheet. Akibatnya SKU TG01030006 selalu nangkring di puncak hanya
     karena ia baris pertama katalog - dilaporkan pemilik 11 Sep 2026. Bukan
     salah SKU itu; tidak ada satu pun urutan yang pernah ditetapkan.

     Diurutkan menurut NAMA, bukan stok terendah. Stok terendah sempat diminta
     dan diukur dulu sebelum dipasang: 2.971 dari 3.488 produk aktif (85%)
     berstok NOL, jadi "terendah dulu" cuma menukar satu baris sembarang dengan
     ribuan baris sembarang. Nama bisa ditebak, dan orang tahu di mana mencari.

     `urutNama` di pos.js yang membandingkan, jadi "Redmi 9" tetap sebelum
     "Redmi 13" - bukan urutan huruf yang melempar 9 ke belakang 13. */
  halProduk.urut = { judul: 'Nama', arah: 'naik' };
  const halStok   = buatHalaman('stok', 'daftar stok');
  /* nama -> { gambar(), wadah } — penangan klik tombol halaman membacanya. */
  const GAMBAR_HALAMAN = {};
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

  /* ==================== KATALOG DISIMPAN DI PERANGKAT ====================
   *
   * Diukur 11 Sep 2026: membuka layar ini 12.443 ms, TIAP KALI. Itu menu
   * paling lambat di seluruh aplikasi, dan yang membayarnya bukan mesin
   * melainkan orang yang berdiri menunggu.
   *
   * KENAPA BUKAN MEMAKAI KATALOG KASIR YANG SUDAH ADA. §150 menyarankan itu —
   * "layar Kasir memakai katalog IndexedDB, layar Produk tidak". Saran itu
   * TIDAK BISA dipakai apa adanya, dan sebabnya harus tertulis supaya tidak
   * dicoba lagi: `apiTarikMaster` menyaring katalognya DUA KALI sebelum
   * mengirim — `boolOf(r.aktif) && bolehDijualDi(r.cabang, cabangSesi)`.
   * Mengalihkan layar ini ke sana akan membuat mode "Nonaktif" kosong
   * selamanya dan menghilangkan produk cabang lain dari mata pemilik, tanpa
   * satu pun pesan galat. Ia juga tidak membawa `stok`, `aktif`, `diubah`
   * dan `margin_eceran`.
   *
   * YANG DIKERJAKAN: jawaban `daftar_produk` disimpan apa adanya di
   * IndexedDB, berkunci CAKUPANNYA. Pembukaan berikutnya membacanya dari
   * perangkat — tanpa satu pun panggilan server.
   *
   * KENAPA AMAN. Penjualan TIDAK menaikkan versi master; yang menaikkannya
   * cuma simpan/impor produk dan terima/batal pembelian. Jadi cache ini
   * bertahan sepanjang hari, bukan gugur tiap ada nota. Dan setiap jalur yang
   * MENULIS produk di layar ini sudah memanggil `Sync.tarikMaster(true)`
   * sebelum menggambar ulang (simpanProduk, nonaktifkan, tandai pemasangan,
   * impor) — versinya naik, kuncinya berubah, cache-nya otomatis meleset.
   * Tidak ada pembuangan cache yang ditebar di lima tempat dan dilupakan di
   * tempat keenam.
   *
   * KUNCINYA MENYEBUTKAN CAKUPANNYA, dan itu bukan kehati-hatian berlebih:
   * §150 mencatat cacat yang persis sama di cache dasbor — kunci yang tidak
   * menyebut cabang membuat satu cabang dijawab dengan angka cabang lain.
   * Di sini cakupannya versi master + cabang + pengguna: `boleh_harga_modal`
   * bergantung pada peran, dan dua orang bisa memakai tablet yang sama.
   *
   * STOK SENGAJA TIDAK IKUT DIPERCAYA. Ia berubah tiap penjualan sementara
   * versi master tidak, jadi angka stok di dalam cache akan bohong dalam
   * hitungan menit. Ia ditimpa dari store `stok` di perangkat, yang punya
   * penyegar sendiri tiap beberapa menit (sync.js `tarikStok`).
   *
   * BATASNYA, ditulis supaya jujur: produk yang diubah dari perangkat LAIN
   * baru muncul di layar ini setelah denyut master berikutnya (5 menit).
   * Itu tidak membahayakan suntingan, karena formulir "Ubah produk" sejak
   * v1.149.0 selalu memuat ulang barangnya dari server (`apiProdukSatu`) —
   * tidak ada yang menyunting dari salinan basi. Yang tertinggal cuma
   * tampilannya.
   */
  /* ==================== CACHE BERUMUR ====================
   *
   * Beda dari cache katalog di bawah, dan bedanya yang menentukan bentuknya:
   *
   *   Katalog Produk  = data MASTER. Ia berubah beberapa kali sehari, dan
   *                     perubahannya menaikkan versi master. Kuncinya versi.
   *   Angka Stok      = data TRANSAKSI. Ia berubah tiap kali ada nota, dan
   *                     TIDAK menaikkan versi master apa pun. Kunci versi tidak
   *                     menjaga apa-apa di sini — seribu penjualan bisa lewat
   *                     tanpa satu pun kenaikan versi, dan layarnya akan
   *                     memperlihatkan angka kemarin dengan penuh percaya diri.
   *
   * Jadi yang dipakai UMUR, bukan versi. Dan karena umur berarti angkanya boleh
   * tertinggal, dua hal wajib menyertainya — keduanya sudah hidup di layar Stok
   * lintas cabang sejak v1.140, dan aturan ini sekarang sama untuk kedua layar:
   *
   *   1. JAM "diperbarui …" ditulis di layar.
   *   2. Tombol "Hitung ulang" yang memaksa panggilan server.
   *
   * Batas umurnya `CONFIG.STOK_CABANG_POLL_MS` (10 menit) — SENGAJA memakai
   * angka yang sudah ada, bukan angka baru. Ia sudah menjawab pertanyaan yang
   * persis sama ("seberapa basi boleh angka stok di perangkat ini") untuk
   * denyut sinkronisasi dan untuk layar lintas cabang. Tiga angka berbeda untuk
   * satu pertanyaan adalah tiga aturan yang harus dihafal. */
  const bacaCacheUmur = async (kunci, cakupan, maksUmur) => {
    try {
      const t = await DB.kvGet(kunci, null);
      if (!t || t.cakupan !== cakupan || !t.waktu) return null;
      if (Date.now() - t.waktu > maksUmur) return null;
      return t;
    } catch (e) { return null; }
  };
  const simpanCacheUmur = async (kunci, cakupan, d) => {
    /* Gagal menyimpan TIDAK menggagalkan layarnya — datanya sudah di tangan,
       cuma tidak sempat disimpan. Yang hilang kecepatannya, bukan isinya. */
    try { await DB.kvSet(kunci, { cakupan, waktu: Date.now(), d }); }
    catch (e) { console.warn('cache tidak tersimpan (' + kunci + '): ' + e.message); }
  };

  const CACHE_STOK = 'cache_stok_cabang_ini';
  /** Cakupan muatan layar Stok. Cabang JELAS; pengguna karena kolom HPP dan
      Nilai hanya turun untuk peran yang berhak melihat harga modal. */
  const cakupanStok = () =>
    [cabangStokKini(), APP_STATE.user?.id_user || ''].join('|');

  const CACHE_PRODUK = 'cache_daftar_produk';
  const CACHE_PRODUK_TURUNAN = 'cache_daftar_produk_turunan';

  /** Cakupan muatan layar Produk — dipakai sebagai kunci sahnya cache. */
  async function cakupanProduk() {
    /* `versi_master` yang tersimpan KEBETULAN sudah memuat kode cabang
       ('123@SK01'). Cabangnya tetap ditulis terpisah di sini: bentuk penanda
       itu milik endpoint lain dan boleh berubah kapan saja, dan jaminan yang
       bersandar pada kebetulan di berkas sebelah bukan jaminan. */
    return [await DB.kvGet('versi_master', '0'),
            APP_STATE.cabang || '',
            APP_STATE.user?.id_user || ''].join('|');
  }

  /** Stok terkini dari perangkat, menimpa angka yang ikut tersimpan di cache. */
  async function timpaStokPerangkat(rows) {
    try {
      const stok = await DB.all('stok');
      /* Store KOSONG bukan berarti seluruh toko kehabisan barang — itu artinya
         `tarikStok` belum pernah jalan di perangkat ini (baru dipasang, atau
         baru dibersihkan). Menimpanya dengan nol akan membuat 3.500 produk
         terbaca "habis" sekaligus, dan itu kebohongan yang jauh lebih mahal
         daripada angka yang tertinggal beberapa menit. */
      if (!stok.length) return;
      const peta = {};
      /* Kunci store `stok` berbentuk 'sku|kode_varian'. Yang dipakai layar ini
         stok SKU-nya, jadi varian dijumlahkan — sama dengan yang dihitung
         `petaStok()` di server untuk kunci 'sku|'. */
      stok.forEach(x => { peta[x.sku] = (peta[x.sku] || 0) + (Number(x.qty) || 0); });
      rows.forEach(r => { r.stok = peta[r.sku] || 0; });
    } catch (e) {
      /* Gagal membaca stok lokal BUKAN alasan mengosongkan layar. Angka yang
         ikut tersimpan di cache tetap dipakai apa adanya — basi lebih baik
         daripada nol yang terbaca sebagai "barangnya habis". */
      console.warn('stok perangkat tidak terbaca: ' + e.message);
    }
  }

  async function muatProduk() {
    rangkaProduk();
    try {
      /* `turunan` diminta hanya kalau kolomnya memang sedang dipilih. Tiga
         pembacaan sheet (441 md) tidak dibayar orang yang cuma mencari satu
         harga. */
      const perluTurunan = kolomProduk === 'turunan';
      const kunci = perluTurunan ? CACHE_PRODUK_TURUNAN : CACHE_PRODUK;
      const cakupan = await cakupanProduk();

      let d = null;
      const tersimpan = await DB.kvGet(kunci, null);
      if (tersimpan && tersimpan.cakupan === cakupan && Array.isArray(tersimpan.d?.produk)) {
        d = tersimpan.d;
      } else {
        const minta = { termasuk_nonaktif: true };
        if (perluTurunan) minta.turunan = true;
        d = await API.daftarProduk(minta);
        /* Teks pencarian disusun SEKALI per barang, bukan tiap ketikan. Pada 362
           produk bedanya belum terasa; pada katalog yang tumbuh, menyusun ulang
           empat larik kompatibel untuk tiap huruf yang diketik terasa.
           Disusun SEBELUM disimpan, jadi pembukaan berikutnya tidak membayarnya
           lagi sama sekali. */
        d.produk.forEach(r => {
          r._cari = [r.sku, r.nama, r.kategori, r.merek, r.tipe_hp, r.barcode,
                     r.deskripsi, r.kata_kunci,
                     (r.kompatibel || []).map(k => k.merek + ' ' + k.tipe).join(' ')]
            .join(' ').toLowerCase();
        });
        /* Penyimpanan yang gagal (kuota perangkat penuh) TIDAK boleh
           menggagalkan layarnya — datanya sudah di tangan, cuma tidak sempat
           disimpan. Yang hilang kecepatannya, bukan isinya. */
        try { await DB.kvSet(kunci, { cakupan, d }); }
        catch (x) { console.warn('katalog tidak tersimpan: ' + x.message); }
      }

      await timpaStokPerangkat(d.produk);

      turunanSiap = d.turunan_ada === true;
      if (turunanSiap) turunanDicoba = false;   /* boleh dicoba lagi nanti */
      cacheProduk = d.produk;
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
            <input type="text" class="input-cari" id="cariProduk" placeholder="Cari SKU, nama, merek, tipe HP…" value="${esc(kueriProduk)}" style="max-width:300px">
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
              ? tombolTambah('btnProdukBaru', 'Produk baru') : ''}
            ${menuLainProduk()}
          </div>
        </div>
      </div>
      <div class="kartu" id="wadahTabelProduk">
        ${isiTabelProduk(baris, modal, saring, kolomAktif, hitung)}
      </div>`;
  }

  /**
   * Isi kartu tabel: tabel, lalu kaki (penghitung + bilah halaman).
   *
   * Penghitung PINDAH dari bar alat ke sini v1.149.0, dan sejak bagian 236 ke
   * KAKI tabel bersama bilah halaman — pola yang sama dengan Stok (pemilik
   * 23 Sep 2026: "3823 produk pindah ke bawah seperti di layar Stok"). Di bar alat ia jadi
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
    /* Diurutkan atas SELURUH baris yang cocok, BARU dipotong 100 — kalau
       dibalik, "Poin terbesar" cuma terbesar di halaman ini. */
    const kolom = susunKolomProduk(modal, saring, kolomAktif);
    /* Saringan yang membawa urutannya sendiri - Terlaris, menurut jumlah
       terjual - TIDAK boleh ditimpa urutan BAWAAN. Sampai v1.169 urutan bawaan
       tidak ada, jadi soal ini belum pernah muncul; begitu bawaannya dipasang,
       `urutkan()` menyusun ulang seluruh baris menurut nama dan "terbanyak di
       atas" diam-diam berhenti berlaku.

       Uji yang ada TIDAK menangkapnya: di panggung, produk terlaris kebetulan
       juga yang pertama menurut nama, jadi urutan yang salah tetap terlihat
       benar. Fixture-nya sekarang sengaja dibuat berlawanan.

       Pilihan SADAR tetap menang - begitu orang mengklik judul kolom,
       `urutBawaan` padam dan yang dipilihnya berlaku di saringan mana pun. */
    const urut = (saring && saring.urut && halProduk.urutBawaan)
      ? baris
      : halProduk.urutkan(baris, kolom);
    return (modeNonaktif.has('produk') ? spandukNonaktif('produk') : '') +
      tabelProduk(halProduk.potong(urut), kolom) +
      `<div class="kaki-tabel"><span class="jumlah-baris">${hitung}</span>${halProduk.pager(urut.length)}</div>`;
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
      `<button class="popover-item" role="menuitem" id="btnKeranjangLabel">${ikonAlat('label')}
         <span>Keranjang stiker</span><span class="lencana" id="lencanaStiker">0</span>
       </button>` +
      butirEkspor('produk', {}) +
      ((bolehUbah || bolehBuat) ? `<div class="popover-pisah">
         ${bolehUbah ? `<button class="popover-item" role="menuitem" id="btnTandaiPasang">${ikonAlat('setujui')}
             <span>Tandai butuh pemasangan</span></button>` : ''}
         ${bolehBuat ? `<button class="popover-item" role="menuitem" id="btnImporProduk">${ikonAlat('impor')}
             <span>Impor massal</span></button>` : ''}
       </div>` : '');

    return menuTindakan({
      id: 'menuProduk', idTombol: 'btnMenuProduk', kunci: 'produk', isi: butir,
      titik: '<span class="titik-tanda sembunyi" id="titikStiker" aria-hidden="true"></span>'
    });
  }

  /** true bila SKU ini hanya dijual di cabang tertentu (kolom `cabang` bukan '*'). */
  function produkDibatasi(r) {
    const c = String(r?.cabang || '').trim();
    return !!c && c !== '*';
  }

  /** Lencana "hanya SK01" di sebelah nama; kosong untuk SKU semua cabang. */
  function lencanaCabangProduk(r) {
    if (!produkDibatasi(r)) return '';
    return ` <span class="lencana polos" title="Hanya dijual di cabang ${esc(r.cabang)}">hanya ${esc(r.cabang)}</span>`;
  }

  /* Definisi kolom DIPISAH dari penggambarnya supaya pengurut halaman
     (`halProduk.urutkan`) membaca definisi yang persis sama dengan yang
     menggambar — dua daftar kolom cepat atau lambat berbeda satu kolom. */
  function susunKolomProduk(modal, saring, kolomAktif) {
    return [
          { judul: 'SKU', kunci: 'sku' },
          { judul: 'Nama', lentur: true, nilai: r => r.nama || '', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}${lencanaCabangProduk(r)}
            <div class="meta-kecil">${esc([r.kategori, r.merek, r.tipe_hp].filter(Boolean).join(' · '))}</div>` },
          ...(modal ? [{ judul: 'Modal', angka: true, nilai: r => Number(r.harga_beli_terakhir) || 0, render: r => rp(r.harga_beli_terakhir) }] : []),
          { judul: 'Eceran', angka: true, nilai: r => Number(r.harga_eceran) || 0, render: r => rp(r.harga_eceran) },
          { judul: 'Grosir', angka: true, nilai: r => Number(r.harga_grosir) || 0, render: r => rp(r.harga_grosir) },
          { judul: 'Stok', angka: true, nilai: r => Number(r.stok) || 0, render: r => lencanaStok(r.stok, r.stok_min) },
          /* Kolom Terjual muncul SENDIRI saat penyaringnya dipakai, tanpa perlu
             memilihnya lagi di dropdown kolom. Daftar yang diurut menurut angka
             yang tidak kelihatan adalah daftar yang urutannya tidak bisa
             dipercaya siapa pun. */
          ...(saring.butuhTerjual ? [{
            judul: 'Terjual', angka: true, nilai: r => terjualProduk.qty[r.sku] || 0, tanda: () => terjualProduk.kunci,
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
          { judul: '', render: r => `<button class="tombol kecil" data-edit-produk="${esc(r.sku)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>` +
              ` <button class="tombol kecil" data-label-produk="${esc(r.sku)}" title="Cetak label harga">${ikonAlat('label')}<span>Label</span></button>` }
    ];
  }
  function tabelProduk(baris, kolom) {
        /* TANPA `pisahNonaktif`: layar ini memisahkannya lebih awal, di
           `katalogDasar()`, karena paginasinya harus menghitung baris yang
           benar-benar digambar. Lihat catatan di sana. */
    /* Lebar diukur dari SELURUH katalog (`cacheProduk`, termasuk yang
       nonaktif), bukan dari hasil saringan: mengetik di kolom cari pun tidak
       boleh menggeser kolom. */
    /* `#isiProduk`, bukan `#wadahTabelProduk`: pada penggambaran PERTAMA
       wadahnya belum ada (masih teks HTML) — dan halaman pertama pun harus
       sudah terkunci, kalau tidak klik pertama tetap menggeser. */
    return tabel(kolom, baris, { urut: halProduk.urut, lebar: lebarKolomDaftar(kolom, cacheProduk, $('#isiProduk')),
          kosong: (kueriProduk || kategoriProduk || saringProduk)
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
          <input type="text" class="input-cari" id="labCari" placeholder="Cari SKU, nama, merek, tipe HP…" autocomplete="off">
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Tutup</span></button>
       <button class="tombol" id="btnKosongkanLabel">Kosongkan</button>
       <button class="tombol utama" id="btnCetakLabel">${ikonAlat('cetak')}<span>Cetak</span></button>`);

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
    /* Dialognya bisa sudah ditutup selama menunggu keranjang dimuat. */
    const wadahLabel = $('#labIsi');
    if (!wadahLabel || $('#modalUmum')._label !== d) return;
    const u = d.ukuran;

    /* Setiap baris diperiksa SENDIRI-SENDIRI: satu SKU panjang di tengah
       keranjang tidak boleh diam-diam tercetak terpotong, dan barcode terpotong
       terbaca sebagai barang lain. */
    const tidakMuat = [];
    wadahLabel.innerHTML = k.length ? k.map(x => {
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

  /* ==================== PENENTU SKU (bagian 264) ====================
     Membantu petugas memilih SKU produk baru dan memastikan SKU-nya belum
     terpakai. Pola toko: TIPE(2 huruf) + KATEGORI(2) + MEREK(2) + NOMOR(4),
     mis. CS 05 08 0347 = Case A, iPhone, nomor 347.

     Daftarnya DITARIK DARI SERVER (peta_sku), bukan dari katalog perangkat:
     katalog perangkat hanya memuat produk aktif yang dijual di cabang itu,
     jadi nomor produk nonaktif atau khusus cabang lain tidak kelihatan di
     sana — dan usulan dari situ akan menabraknya.

     Arti tiap prefix dibaca dari produk yang ada (keputusan pemilik): nama
     kategori/merek yang PALING SERING dipakai di prefix itu. Nomor urut per
     kategori, tertinggi + 1 — nomor bolong tidak dipakai ulang, karena bisa
     masih tertempel di stiker barang lama.

     Yang menentukan tetap server (apiSimpanProdukLengkap, baru:true): layar
     ini hanya memberi usulan dan peringatan lebih awal. */
  const POLA_SKU_TOKO = /^([A-Z]{2})(\d{2})(\d{2})(\d{4})$/;
  let petaSkuSimpan = null, petaSkuJam = 0;
  const skuPad = (n, w) => String(n).padStart(w, '0');
  const normNamaSku = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

  function htmlPenentuSku() {
    return `<div class="penentu-sku" id="penentuSku">
        <div class="baris3 penentu-pilih" id="skPilih" aria-busy="true">
          <div class="grup"><label>Tipe</label><select id="skTipe" disabled></select></div>
          <div class="grup"><label>Kategori</label><select id="skKategori" disabled></select></div>
          <div class="grup"><label>Merek</label><select id="skMerek" disabled></select></div>
        </div>
        <div id="skTambah"></div>
        <p class="cek-sku sembunyi" id="skCatatan"></p>
        <div class="baris2">
          <div class="grup"><label>SKU *</label><input type="text" id="pSku" autocomplete="off">
            <p class="cek-sku" id="skCek" aria-label="Memuat daftar SKU"><span class="rangka" style="width:220px"></span></p></div>
          <div class="grup"><label>Barcode</label><input type="text" id="pBarcode"></div>
        </div>
      </div>`;
  }

  /** Bentuk ringkas yang dipakai layar: siapa memakai SKU apa, dan arti tiap prefix. */
  function susunPetaSku(d) {
    const p = { sku: new Map(), tipe: Object.assign({}, d.nama_tipe || {}), kat: {}, mer: {},
                maks: {}, pkAda: {}, pmAda: new Set(), awalan: {} };
    const hitK = {}, hitM = {}, hitAwal = {};
    (d.baris || []).forEach(([sku, nama, kategori, merek, aktif]) => {
      p.sku.set(String(sku), { nama: String(nama || ''), aktif: !!aktif });
      /* AWALAN NAMA per kategori (bagian 266): teks sebelum " <merek> " di
         nama produk. Diukur 26 Sep 2026: 3.260 dari 3.422 produk bermerek
         mengikuti "[awalan kategori] [merek] [tipe HP]" — "Case A" bernama
         "Fashion Case A …", "TPU Clear" tetap "TPU Clear …". Dibaca dari
         katalog, bukan diketik di kode: kategori baru ikut dengan sendirinya. */
      const mk = String(merek || ''), nm = String(nama || ''), i = mk ? nm.indexOf(' ' + mk + ' ') : -1;
      if (kategori && i > 0) {
        const o = hitAwal[kategori] = hitAwal[kategori] || {};
        o[nm.slice(0, i)] = (o[nm.slice(0, i)] || 0) + 1;
      }
      const m = POLA_SKU_TOKO.exec(String(sku));
      if (!m) return;
      const [, t, pk, pm, no] = m;
      if (!p.tipe[t]) p.tipe[t] = '';
      (p.pkAda[t] = p.pkAda[t] || new Set()).add(pk);
      p.pmAda.add(pm);
      p.maks[t + pk] = Math.max(p.maks[t + pk] || 0, Number(no));
      if (kategori) { const o = hitK[t + pk] = hitK[t + pk] || {}; o[kategori] = (o[kategori] || 0) + 1; }
      if (merek) { const o = hitM[pm] = hitM[pm] || {}; o[merek] = (o[merek] || 0) + 1; }
    });
    const terbanyak = (o) => Object.keys(o).sort((a, b) => o[b] - o[a] || urutNama(a, b))[0];
    Object.keys(hitK).forEach((k) => { (p.kat[k.slice(0, 2)] = p.kat[k.slice(0, 2)] || {})[k.slice(2)] = terbanyak(hitK[k]); });
    Object.keys(hitM).forEach((pm) => { p.mer[pm] = terbanyak(hitM[pm]); });
    Object.keys(hitAwal).forEach((k) => { p.awalan[k] = terbanyak(hitAwal[k]); });
    return p;
  }

  /**
   * Usulan nama produk baru (bagian 266): "[awalan kategori] [merek] [tipe HP]".
   * Merek Multi = TG serba-muat, yang di katalog bernama "… Multi_Fit".
   * Kosong bila kategori atau merek belum dipilih — nama setengah jadi lebih
   * menyesatkan daripada kolom kosong.
   */
  function usulNamaProduk(peta, namaKat, namaMer, tipeHp) {
    const kat = String(namaKat || '').trim(), mer = String(namaMer || '').trim();
    if (!kat || !mer) return '';
    const awal = (peta && peta.awalan[kat]) || kat;
    if (/^multi$/i.test(mer)) return awal + ' Multi_Fit';
    return [awal, mer, String(tipeHp || '').trim()].filter(Boolean).join(' ');
  }

  /* Nama mengikuti usulan selama isinya masih SAMA dengan usulan sebelumnya
     (atau kosong) — pola yang sama dengan Barcode mengikuti SKU. Sekali
     diketik petugas, tidak ditimpa lagi. */
  function isiNamaUsulan() {
    const nama = $('#pNama');
    if (!nama || !$('#penentuSku')) return;
    const usul = usulNamaProduk(petaSkuSimpan, $('#pKategori').value, $('#pMerek').value, $('#pTipe').value);
    if (!nama.value || nama.value === nama.dataset.usulan) nama.value = usul;
    nama.dataset.usulan = usul;
  }

  /** Prefix bebas berikutnya = tertinggi + 1 (celah tidak diisi, sama dengan nomor urut). */
  function prefixBerikut(terpakai) {
    const angka = [...(terpakai || [])].map(Number).filter((n) => n > 0);
    return skuPad((angka.length ? Math.max(...angka) : 0) + 1, 2);
  }

  function jarakEditSku(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let kiri = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const lama = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, kiri + (a[i - 1] === b[j - 1] ? 0 : 1));
        kiri = lama;
      }
    }
    return d[b.length];
  }

  /** [[prefix, nama], ...] yang mirip nama baru — penjaga salah ketik. Paling mirip dulu. */
  function namaMiripSku(nama, pasangan) {
    const n = normNamaSku(nama);
    if (n.length < 2) return [];
    return pasangan
      .map(([k, x]) => ({ k, x, y: normNamaSku(x) }))
      .filter((o) => o.y !== n && (o.y.includes(n) || n.includes(o.y) || jarakEditSku(n, o.y) <= 2))
      .sort((a, b) => jarakEditSku(n, a.y) - jarakEditSku(n, b.y))
      .slice(0, 3).map((o) => [o.k, o.x]);
  }

  async function muatPetaSku(paksa) {
    if (!paksa && petaSkuSimpan && Date.now() - petaSkuJam < 120000) return petaSkuSimpan;
    petaSkuSimpan = susunPetaSku(await API.petaSku({ latar: true }));
    petaSkuJam = Date.now();
    return petaSkuSimpan;
  }

  async function pasangPenentuSku() {
    const tipe = $('#skTipe'), kat = $('#skKategori'), mer = $('#skMerek'), sku = $('#pSku'), bc = $('#pBarcode');
    /* Barcode mengikuti SKU selama isinya masih SAMA dengan SKU sebelumnya
       (dataset.lalu, diisi juga oleh usulan). Barcode pabrik yang diketik
       sendiri tidak ikut tertimpa. */
    sku.addEventListener('input', () => {
      if (!bc.value || bc.value === sku.dataset.lalu) bc.value = sku.value;
      sku.dataset.lalu = sku.value;
      cekSkuPenentu();
    });
    [tipe, kat, mer].forEach((el) => el.addEventListener('change', () => {
      if (el === tipe) { isiKategoriSku(); ikutPasangTipe(); }
      hitungUsulanSku();
    }));
    /* Centang "dipasang" yang disentuh petugas tidak diikutkan lagi (bagian 267). */
    $('#pButuhPasang')?.addEventListener('change', (e) => { e.target.dataset.disentuh = '1'; });
    $('#skTambah').addEventListener('input', () => hitungUsulanSku());
    $('#pTipe').addEventListener('input', isiNamaUsulan);
    try {
      await muatPetaSku(false);
    } catch (e) {
      /* GAGAL = pilihan disembunyikan, kolom teks lama dibuka lagi. Daftar
         kosong tidak boleh dibaca sebagai "semua SKU belum terpakai". */
      if (!$('#penentuSku')) return;
      $('#skPilih').classList.add('sembunyi');
      $$('#barisKatMerek > .grup').forEach((g) => g.classList.remove('sembunyi'));
      $('#barisKatMerek').classList.remove('baris-tipe-saja');
      tandaCekSku('waspada', 'Daftar SKU gagal dimuat (' + esc(e.message) + '). Ketik SKU sendiri — ' +
        'server tetap menolak SKU yang sudah terpakai.');
      return;
    }
    if (!$('#penentuSku')) return;                       // modal sudah ditutup
    $('#skPilih').removeAttribute('aria-busy');
    const peta = petaSkuSimpan;
    const kodeTipe = Object.keys(peta.tipe).sort();
    tipe.innerHTML = kodeTipe.map((k) => `<option value="${esc(k)}">${esc(k)}${peta.tipe[k] ? ' · ' + esc(peta.tipe[k]) : ''}</option>`).join('') +
      '<option value="+">+ Tipe baru…</option>';
    if (kodeTipe.includes('CS')) tipe.value = 'CS';
    const merek = Object.keys(peta.mer).map((pm) => [pm, peta.mer[pm]]).sort((a, b) => urutNama(a[1], b[1]));
    mer.innerHTML = '<option value="">— pilih merek —</option>' +
      merek.map(([pm, n]) => `<option value="${pm}">${esc(n)} · ${pm}</option>`).join('') +
      '<option value="+">+ Merek baru…</option>';
    [tipe, kat, mer].forEach((el) => { el.disabled = false; });
    isiKategoriSku();
    ikutPasangTipe();
    hitungUsulanSku();
    function tandaCekSku(kelas, html) {
      const c = $('#skCek');
      if (c) { c.className = 'cek-sku ' + kelas; c.innerHTML = html; c.removeAttribute('aria-label'); }
    }
  }

  /**
   * Tipe TG (tempered glass) = barang yang DIPASANG — aturan yang sama dengan
   * impor (_pasangImpor, bagian 267). Centangnya ikut tipe selama petugas belum
   * menyentuhnya; sesudah disentuh, pilihan petugas yang berlaku.
   */
  function ikutPasangTipe() {
    const c = $('#pButuhPasang');
    if (!c || c.dataset.disentuh) return;
    c.checked = $('#skTipe').value === 'TG';
  }

  function isiKategoriSku() {
    const peta = petaSkuSimpan, t = $('#skTipe').value, kat = $('#skKategori');
    const daftar = t === '+' ? [] : Object.keys(peta.kat[t] || {}).map((pk) => [pk, peta.kat[t][pk]])
      .sort((a, b) => urutNama(a[1], b[1]));
    kat.innerHTML = (daftar.length ? '<option value="">— pilih kategori —</option>' : '') +
      daftar.map(([pk, n]) => `<option value="${pk}">${esc(n)} · ${pk}</option>`).join('') +
      '<option value="+">+ Kategori baru…</option>';
    kat.value = daftar.length ? '' : '+';
  }

  /** Isian nama/kode untuk yang "+ baru". Digambar ulang HANYA bila susunannya berubah. */
  function gambarTambahSku(perlu, prefixKat, prefixMer) {
    const wadah = $('#skTambah');
    const kunci = perlu.join(',');
    if (wadah.dataset.susun !== kunci) {
      const simpan = {};
      $$('#skTambah input').forEach((i) => { simpan[i.id] = i.value; });
      const blok = {
        tipe: `<div class="baris2 tambah-prefix"><div class="grup"><label>Kode tipe (2 huruf)</label>
          <input type="text" id="skKodeTipe" maxlength="2" autocomplete="off"></div>
          <div class="grup"><label>Nama tipe</label><input type="text" id="skNamaTipe" autocomplete="off"></div></div>`,
        kat: `<div class="baris2 tambah-prefix"><div class="grup"><label>Nama kategori baru</label>
          <input type="text" id="skNamaKat" autocomplete="off"></div>
          <div class="grup"><label>Prefix</label><input type="text" id="skPrefixKat" disabled></div></div>`,
        mer: `<div class="baris2 tambah-prefix"><div class="grup"><label>Nama merek baru</label>
          <input type="text" id="skNamaMer" autocomplete="off"></div>
          <div class="grup"><label>Prefix</label><input type="text" id="skPrefixMer" disabled></div></div>`
      };
      wadah.innerHTML = perlu.map((k) => blok[k]).join('');
      wadah.dataset.susun = kunci;
      Object.keys(simpan).forEach((id) => { if ($('#' + id)) $('#' + id).value = simpan[id]; });
    }
    if ($('#skPrefixKat')) $('#skPrefixKat').value = prefixKat;
    if ($('#skPrefixMer')) $('#skPrefixMer').value = prefixMer;
  }

  /**
   * Hitung usulan SKU dari pilihan — juga saat nama/kode baru diketik, karena
   * kode tipe baru ikut menjadi awal SKU.
   */
  function hitungUsulanSku() {
    const peta = petaSkuSimpan;
    if (!peta || !$('#penentuSku')) return;
    const vTipe = $('#skTipe').value, vKat = $('#skKategori').value, vMer = $('#skMerek').value;
    const perlu = [];
    if (vTipe === '+') perlu.push('tipe');
    if (vKat === '+') perlu.push('kat');
    if (vMer === '+') perlu.push('mer');
    const catatan = [], galat = [];

    let t = vTipe;
    if (vTipe === '+') {
      t = String($('#skKodeTipe')?.value || '').trim().toUpperCase();
      if ($('#skKodeTipe') && $('#skKodeTipe').value !== t) $('#skKodeTipe').value = t;
    }
    const pkBaru = vTipe === '+' ? '01' : prefixBerikut(peta.pkAda[t]);
    const pmBaru = prefixBerikut(peta.pmAda);
    gambarTambahSku(perlu, pkBaru, pmBaru);

    if (vTipe === '+') {
      if (!/^[A-Z]{2}$/.test(t)) galat.push('Kode tipe harus tepat 2 huruf, mis. AK.');
      else if (peta.tipe[t] !== undefined) galat.push('Tipe ' + t + ' sudah ada — pilih dari daftar Tipe.');
      else catatan.push('Tipe baru <strong>' + esc(t) + '</strong> — kategori pertamanya memakai prefix <strong>01</strong>.');
    }
    const pk = vKat === '+' ? pkBaru : vKat;
    const pm = vMer === '+' ? pmBaru : vMer;
    let namaKat = vKat === '+' ? String($('#skNamaKat')?.value || '').trim() : ((peta.kat[t] || {})[vKat] || '');
    let namaMer = vMer === '+' ? String($('#skNamaMer')?.value || '').trim() : (peta.mer[vMer] || '');

    if (vKat === '+' && vTipe !== '+') {
      const ada = Object.keys(peta.kat[t] || {}).map((k) => [k, peta.kat[t][k]]);
      const sama = ada.find(([, n]) => normNamaSku(n) === normNamaSku(namaKat));
      if (sama) galat.push('Kategori "' + esc(sama[1]) + '" sudah ada (prefix ' + sama[0] + ') — pilih dari daftar Kategori.');
      else {
        catatan.push('Prefix kategori ' + esc(t) + ' bebas berikutnya: <strong>' + pk + '</strong>.');
        const mirip = namaMiripSku(namaKat, ada);
        if (mirip.length) catatan.push('Nama mirip yang sudah ada: ' + mirip.map(([k, n]) => '<strong>' + esc(n) + ' · ' + k + '</strong>').join(', ') + ' — pastikan bukan salah ketik.');
      }
    }
    if (vMer === '+') {
      const ada = Object.keys(peta.mer).map((k) => [k, peta.mer[k]]);
      const sama = ada.find(([, n]) => normNamaSku(n) === normNamaSku(namaMer));
      if (sama) galat.push('Merek "' + esc(sama[1]) + '" sudah ada (prefix ' + sama[0] + ') — pilih dari daftar Merek.');
      else {
        catatan.push('Prefix merek bebas berikutnya: <strong>' + pm + '</strong> — berlaku untuk semua tipe.');
        const mirip = namaMiripSku(namaMer, ada);
        if (mirip.length) catatan.push('Nama mirip yang sudah ada: ' + mirip.map(([k, n]) => '<strong>' + esc(n) + ' · ' + k + '</strong>').join(', ') + ' — pastikan bukan salah ketik.');
      }
    }
    const c = $('#skCatatan');
    const baris = galat.length ? galat : catatan;
    c.className = 'cek-sku' + (galat.length ? ' gagal' : '') + (baris.length ? '' : ' sembunyi');
    c.innerHTML = baris.join('<br>');
    $('#penentuSku').dataset.galat = galat.join(' ').replace(/<[^>]+>/g, '');

    $('#pKategori').value = namaKat;
    $('#pMerek').value = namaMer;
    isiNamaUsulan();
    const sku = $('#pSku'), bc = $('#pBarcode');
    const lengkap = /^[A-Z]{2}$/.test(t) && pk && pm && !galat.length;
    if (lengkap) {
      const baru = t + pk + pm + skuPad((peta.maks[t + pk] || 0) + 1, 4);
      if (!bc.value || bc.value === sku.value) bc.value = baru;
      sku.value = baru;
      sku.dataset.lalu = baru;
    }
    cekSkuPenentu();
  }

  /** Status di bawah kolom SKU: terpakai (oleh siapa), belum, atau nomor bolong. */
  function cekSkuPenentu() {
    const peta = petaSkuSimpan, c = $('#skCek');
    if (!c || !peta) return;
    const v = String($('#pSku').value || '').trim();
    const tanda = (kelas, html) => { c.className = 'cek-sku ' + kelas; c.innerHTML = html; c.removeAttribute('aria-label'); };
    if (!v) return tanda('', 'Pilih kategori dan merek untuk usulan SKU, atau ketik sendiri.');
    const dipakai = peta.sku.get(v);
    if (dipakai) {
      return tanda('gagal', '✗ Sudah dipakai: <strong>' + esc(dipakai.nama) + '</strong>' +
        (dipakai.aktif ? '' : ' (nonaktif)') + ' — pilih nomor lain atau pakai usulan.');
    }
    const m = POLA_SKU_TOKO.exec(v);
    if (!m) return tanda('waspada', '⚠ Belum terpakai, tapi tidak mengikuti pola toko (2 huruf + 8 angka).');
    const maks = peta.maks[m[1] + m[2]] || 0;
    const namaKat = (peta.kat[m[1]] || {})[m[2]];
    if (maks && Number(m[4]) <= maks) {
      return tanda('waspada', '⚠ Belum terpakai, tapi nomor ' + m[4] + ' di bawah nomor tertinggi ' +
        esc(namaKat || m[1] + m[2]) + ' (' + skuPad(maks, 4) + ') — nomor bolong bisa masih tertempel di stiker lama.');
    }
    tanda('ok', '✓ Belum terpakai' + (maks ? ' · nomor tertinggi ' + esc(namaKat || m[1] + m[2]) + ' saat ini ' + skuPad(maks, 4) : ''));
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
        ${baru ? htmlPenentuSku() : `<div class="baris2">
          <div class="grup"><label>SKU *</label>
            <input type="text" id="pSku" value="${esc(p?.sku || '')}" disabled></div>
          <div class="grup"><label>Barcode</label><input type="text" id="pBarcode" value="${esc(p?.barcode || '')}"></div>
        </div>`}
        <div class="grup"><label>Nama produk *</label><input type="text" id="pNama" value="${esc(p?.nama || '')}"></div>
        <div class="baris3${baru ? ' baris-tipe-saja' : ''}" id="barisKatMerek">
          <div class="grup${baru ? ' sembunyi' : ''}"><label>Kategori</label><input type="text" id="pKategori" value="${esc(p?.kategori || '')}"></div>
          <div class="grup${baru ? ' sembunyi' : ''}"><label>Merek</label><input type="text" id="pMerek" value="${esc(p?.merek || '')}"></div>
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
        ${blokCabangProduk(p?.cabang)}
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       ${!baru && bolehIzin('produk', 'hapus') ? ('<button class="tombol bahaya" id="btnNonaktifProduk">' + ikonAlat('nonaktif') + '<span>Nonaktifkan</span></button>') : ''}
       <button class="tombol utama" id="btnSimpanProduk">${ikonAlat('simpan')}<span>Simpan</span></button>`);

    (p?.satuan || []).forEach(s => tambahBarisSatuan(s));
    (p?.tier || []).forEach(t => tambahBarisTier(t));
    (p?.varian || []).forEach(v => tambahBarisVarian(v));
    (p?.kompatibel || []).forEach(k => tambahBarisKompatibel(k));
    if (baru) pasangPenentuSku();
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
  /** Kotak pencarian selebar ini atau kurang dianggap SEMPIT: panelnya
   *  melebar ke seluruh baris. 320px ≈ lebar kotak di tablet 800px; di HP
   *  kotaknya cuma ~200px dan nama produk dua baris patah jadi lima. */
  const KOTAK_SEMPIT_PX = 320;

  function tempatkanHasil(kotak) {
    const wadah = kotak.parentElement.querySelector('.hasil-prd');
    if (!wadah || wadah.classList.contains('sembunyi')) return;
    const r = kotak.getBoundingClientRect();
    /* Lebar panel: selebar kotaknya di layar lebar, tapi selebar SELURUH
       BARIS (`.baris-anak`: kotak + varian + qty + hapus) bila kotaknya
       sempit. Dilaporkan pemilik 10 Sep 2026 dari HP: di layar Permintaan
       kotaknya seperempat baris, dan daftar selebar itu memotong
       "TG Privacy iPhone XSMAX / iPhone 11PROMAX" jadi lima baris yang tidak
       terbaca. Kiri panel = kiri baris, dan tidak pernah melewati tepi layar. */
    const baris = kotak.closest('.baris-anak');
    const rb = baris ? baris.getBoundingClientRect() : r;
    const sempit = r.width < KOTAK_SEMPIT_PX && rb.width > r.width;
    const kiri = sempit ? rb.left : r.left;
    const lebar = Math.min(sempit ? rb.width : r.width, window.innerWidth - kiri - 8);
    const ruangBawah = window.innerHeight - r.bottom - 8;
    const ruangAtas = r.top - 8;
    const keAtas = ruangBawah < 150 && ruangAtas > ruangBawah;
    const ruang = Math.max(120, keAtas ? ruangAtas : ruangBawah);
    wadah.style.left = kiri + 'px';
    wadah.style.width = lebar + 'px';
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
    /* Permintaan (bagian 262): barang yang SUDAH ada di baris lain tidak
       dibuatkan baris kedua — qty baris itu yang ditambah. Server juga
       menolak baris kembar, tapi baru ketahuan sesudah Kirim. */
    if (baris.dataset.anak === 'pm') {
      const varian = (baris.querySelector('[data-f="kode_varian"]')?.value || '').trim();
      const kembar = $$('[data-anak="pm"]').find((b) => b !== baris &&
        b.querySelector('input[data-f="sku"]')?.value === p.sku &&
        (b.querySelector('[data-f="kode_varian"]')?.value || '').trim() === varian);
      if (kembar) {
        const q = kembar.querySelector('[data-f="qty"]');
        const tambahQ = Math.max(1, Number(baris.querySelector('[data-f="qty"]')?.value) || 1);
        q.value = (Number(q.value) || 0) + tambahQ;
        const kotakIni = baris.querySelector('.cari-prd');
        kotakIni.value = ''; baris.querySelector('.hasil-prd')?.classList.add('sembunyi');
        const no = $$('[data-anak="pm"]').indexOf(kembar) + 1;
        toast(`${teksProduk(p)} sudah ada di baris ${no} — qty-nya ditambah ${tambahQ}.`, 'info');
        q.focus();
        return;
      }
    }
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

  /* ---------- Cabang tempat SKU boleh dijual (v1.156) ----------
   *
   * Diminta pemilik 10 Sep 2026: ada barang yang hanya dijual di salah satu
   * cabang, dan akan ada cabang grosir dengan katalog sendiri. Nilainya satu
   * kolom teks di master: '*' (bawaan, semua cabang) atau 'SK01,SK03'.
   *
   * Daftar cabangnya dari `daftarCabangSemua` (store lokal `cabang_list`),
   * jatuh ke daftar dari jawaban login bila store itu belum terisi — alasan
   * yang sama dengan penyaring cabang di layar Laporan. Kode yang tersimpan
   * di produk tapi tidak ada di daftar TETAP digambar (tercentang): kalau
   * dibuang diam-diam, menekan Simpan akan mencabut cabang itu tanpa jejak.
   */
  function daftarKodeCabang() {
    const sumber = (APP_STATE.daftarCabangSemua && APP_STATE.daftarCabangSemua.length)
      ? APP_STATE.daftarCabangSemua : (APP_STATE.daftarCabang || []);
    return sumber.slice().sort(urutNama);
  }

  function blokCabangProduk(nilai) {
    const c = String(nilai || '*').trim() || '*';
    const semua = c === '*';
    const dipilih = semua ? [] : c.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    const kode = daftarKodeCabang().map(k => String(k).toUpperCase());
    dipilih.forEach(k => { if (!kode.includes(k)) kode.push(k); });
    return `<div class="grup" id="grupCabangProduk" style="margin-top:12px">
      <label>Dijual di cabang</label>
      <div class="pilih-cabang-produk">
        <label class="cek"><input type="checkbox" id="pCabangSemua" ${semua ? 'checked' : ''}> Semua cabang</label>
        ${kode.map(k => `<label class="cek"><input type="checkbox" class="pCabang" value="${esc(k)}"
          ${dipilih.includes(k) ? 'checked' : ''} ${semua ? 'disabled' : ''}> ${esc(k)}</label>`).join('')}
      </div>
      <p class="petunjuk" style="margin-top:6px">Kasir cabang yang tidak dicentang tidak akan melihat SKU ini,
        dan server menolak nota yang memuatnya. Stok, transfer, dan pembelian tidak dibatasi.
        Cabang baru otomatis mendapat semua SKU "Semua cabang".</p>
    </div>`;
  }

  /** '*' bila Semua cabang dicentang; daftar kode bila tidak; null bila tidak ada satu pun. */
  function kumpulCabangProduk() {
    if (!$('#pCabangSemua')) return undefined;          // formulir tanpa blok ini
    if ($('#pCabangSemua').checked) return '*';
    const pilih = $$('.pCabang:checked').map(c => c.value);
    return pilih.length ? pilih.sort().join(',') : null;
  }

  function terapkanCabangSemua() {
    const semua = $('#pCabangSemua')?.checked;
    $$('.pCabang').forEach(c => { c.disabled = !!semua; });
  }

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
      cabang: kumpulCabangProduk(),
      satuan: kumpulkanAnak('satuan'), tier: kumpulkanAnak('tier'),
      varian: kumpulkanAnak('varian'), kompatibel: kumpulkanAnak('kompatibel'),
      /* Cap waktu salinan yang dibuka layar ini. Server membandingkannya dengan
         yang tersimpan, dan menolak kalau sudah berbeda — lihat _konflikProduk()
         di 11_Admin.gs. Kosong untuk produk baru, dan itu memang benar. */
      diubah: nilai('pDiubah')
    };
    if (!body.sku || !body.nama) return toast('SKU dan nama wajib diisi.', 'galat');
    /* Produk BARU (bagian 264): server menolak SKU yang sudah ada alih-alih
       menimpanya, dan memeriksa prefix kategori/merek. */
    const penentu = $('#penentuSku');
    if (penentu) {
      if (penentu.dataset.galat) return toast(penentu.dataset.galat, 'galat');
      body.baru = true;
      if ($('#skTipe') && $('#skTipe').value === '+') body.nama_tipe = nilai('skNamaTipe');
    }
    /* null = tidak satu pun cabang dicentang. Server akan menormalkannya jadi
       '*' — kebalikan dari yang dimaksud — jadi ditolak di sini, dengan kalimat
       yang menyebut kedua jalan keluarnya. */
    if (body.cabang === null) {
      return toast('Pilih minimal satu cabang, atau centang "Semua cabang".', 'galat');
    }
    const kotakPesan = $('#pesanProduk');
    if (kotakPesan) kotakPesan.innerHTML = '';
    try {
      /* Tiga langkah, satu tugas. Tanpa pembungkus ini penghitung sibuk turun ke
         nol dua kali di tengah jalan, dan tombol Simpan sempat terbuka kembali
         sebelum katalognya selesai ditarik ulang. */
      await API.tugas(async () => {
        await API.simpanProdukLengkap(body);
        petaSkuSimpan = null;                            // SKU baru: daftar lama sudah basi
        await Sync.tarikMaster(true);
        await sukses('Produk tersimpan.', 'produk');
      });
    } catch (e) {
      /* Ditolak karena SKU/prefix keburu dipakai orang lain: tarik ulang
         daftarnya dan usulkan nomor berikutnya. */
      if (penentu && (e.kode === 'SKU_TERPAKAI' || e.kode === 'PREFIX_SKU')) {
        try { await muatPetaSku(true); hitungUsulanSku(); } catch (e2) { /* pesan utama tetap tampil */ }
      }
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
            'harga_eceran, harga_grosir, stok_min, poin_satuan, deskripsi, kata_kunci, ' +
            'cabang (kosong = semua; "SK01,SK03" = hanya di sana) — wajib: sku, nama, harga_eceran',
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnJalankanTandai">${ikonAlat('jalankan')}<span>Terapkan</span></button>`);
  }

  async function jalankanTandaiPasang() {
    const kategori = $$('.katPasang:checked').map(c => c.value);
    if (!kategori.length) {
      return pesan('#pesanTandai', 'Pilih dulu minimal satu kategori.', 'galat');
    }
    const nilaiBaru = nilai('tandaiNilai') === '1';
    /* Satu klik di sini mengubah SELURUH produk di kategori yang dicentang —
       pada katalog 3.500 barang itu ribuan baris master sekaligus, dan tidak
       ada tombol urung. Pertanyaannya menyebut kategori mana dan jadi apa,
       bukan "Anda yakin?" yang tidak memberi tahu apa-apa. */
    if (!(await tanya('Terapkan ke semua produk di kategori ini?',
          `<div class="pesan info" style="white-space:pre-line">${esc(kategori.join('\n'))}</div>
           <p class="petunjuk">Semua produk di ${kategori.length === 1 ? 'kategori' : kategori.length + ' kategori'}
              di atas akan ditandai <strong>${nilaiBaru ? 'BUTUH pemasangan' : 'TIDAK butuh pemasangan'}</strong>.
              Perubahan ini tidak bisa diurungkan sekaligus — memulihkannya berarti menjalankan ini lagi dengan nilai sebaliknya.</p>`,
          { ya: nilaiBaru ? 'Tandai butuh pemasangan' : 'Hapus tanda pemasangan', jenis: 'bahaya' }))) return;
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
      <button class="tombol kecil" id="btnTemplateImpor">${ikonAlat('ekspor')}<span>Unduh template Excel</span></button>

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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnJalankanImpor" disabled>${ikonAlat('jalankan')}<span>Impor</span></button>`);
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
    const entitas = nilai('imporEntitas') || 'produk';
    const lewatiAda = entitas === 'produk' && !!$('#imporLewatiAda')?.checked;
    /* Pratinjau BUKAN konfirmasi. Ia memperlihatkan bentuk datanya, dan orang
       yang sudah melihatnya benar masih harus memilih untuk menulisnya. Yang
       ditulis impor ini tidak punya tombol urung: baris yang sudah masuk master
       harus dinonaktifkan satu per satu. */
    if (!(await tanya('Tulis ' + barisImpor.length + ' baris ke master?',
          `<p class="petunjuk">Tujuan: <strong>${esc(entitas)}</strong>.
             ${lewatiAda ? 'SKU yang sudah terdaftar dilewati. ' : ''}Baris yang sudah
             masuk tidak bisa dibatalkan sekaligus — yang salah harus dinonaktifkan
             satu per satu.</p>`,
          { ya: 'Impor sekarang', jenis: 'bahaya' }))) return;
    $('#btnJalankanImpor').disabled = true;
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
  /**
   * Cabang yang stoknya sedang ditampilkan di tampilan satu-cabang; '' = cabang
   * sesi. Diminta pemilik 10 Sep 2026: "stok lingkup, tambahkan cabang lainnya
   * bukan cuma SK01". Servernya sudah menerima `p.cabang` dan memeriksa haknya
   * sendiri lewat `wajibCabang()` — yang ditambah cuma pilihannya.
   */
  let stokCabang = '';
  const cabangStokKini = () => stokCabang || APP_STATE.cabang;

  /** Isi dropdown lingkup: cabang ini, tiap cabang lain, lalu semua cabang. */
  function opsiLingkupStok(terpilih) {
    const lain = APP_STATE.daftarCabangSemua.slice().sort(urutNama)
      .filter(c => c !== APP_STATE.cabang);
    return `<option value="sini" ${terpilih === 'sini' ? 'selected' : ''}>Cabang ${esc(APP_STATE.cabang)}</option>` +
      lain.map(c => `<option value="cabang:${esc(c)}" ${terpilih === 'cabang:' + c ? 'selected' : ''}>Cabang ${esc(c)}</option>`).join('') +
      `<option value="semua" ${terpilih === 'semua' ? 'selected' : ''}>Semua cabang</option>`;
  }

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
  /**
   * "Cocok untuk" satu baris (bagian 235): tipe HP produk itu sendiri, lalu
   * daftar kompatibelnya ("merek tipe"), digabung " · ". Lebih dari `maks`
   * dipotong jadi "+N lagi" — tempered glass universal cocok untuk puluhan
   * tipe, dan ditulis semua satu baris tabel Stok jadi setinggi layar HP
   * (keputusan pemilik 23 Sep 2026). Daftar lengkapnya tetap di layar Produk.
   * Satu rumus untuk jalur satu cabang (baris dari server) dan lintas cabang
   * (baris dari katalog perangkat) — keduanya membawa `tipe_hp` + `kompatibel`.
   */
  const teksCocok = (r, maks = 3) => {
    const semua = [];
    const tambah = (t) => { t = String(t || '').trim(); if (t && !semua.includes(t)) semua.push(t); };
    tambah(r.tipe_hp);
    (r.kompatibel || []).forEach(k => tambah((k.merek ? k.merek + ' ' : '') + (k.tipe || '')));
    const sisa = semua.length - maks;
    return semua.slice(0, maks).join(' · ') + (sisa > 0 ? ` +${sisa} lagi` : '');
  };
  /* Baris kedua sel Nama di tabel Stok: kode varian lalu cocok untuk. Kosong
     bila keduanya kosong — produk universal tanpa daftar tidak dapat baris. */
  const metaStok = (r) => {
    const m = [r.kode_varian, teksCocok(r)].filter(Boolean);
    return m.length ? `<div class="meta-kecil">${esc(m.join(' · '))}</div>` : '';
  };

  function barisStokLintas(stokMentah, produk, cabang) {
    const peta = {};
    (stokMentah || []).forEach(r => {
      const k = String(r.sku) + '|' + String(r.cabang);
      peta[k] = (peta[k] || 0) + Number(r.qty || 0);
    });
    return (produk || []).map(p => {
      const baris = { sku: String(p.sku), nama: String(p.nama || p.sku),
                      kategori: String(p.kategori || ''), total: 0,
                      tipe_hp: p.tipe_hp || '', kompatibel: p.kompatibel || [] };
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
  const susunKolomStokLintas = (cabang) => [
    { judul: 'SKU', kunci: 'sku' },
    { judul: 'Nama', kunci: 'nama', lentur: true, nilai: r => r.nama || '',
      render: r => esc(r.nama || '') + metaStok(r) },
    ...cabang.map(c => ({
      judul: c, angka: true, kunci: 'c_' + c,
      /* Angka MINUS digambar apa adanya dan diberi warna, tidak dijadikan "0".
         Sampai 14 Sep 2026 selain-positif semuanya ditulis "0", dan akibatnya
         terlihat di data nyata: TG03050067 tampil SK01 448 · SK02 0 · SK03 0
         dengan TOTAL 442 — kolomnya tidak menjumlah ke totalnya sendiri, tanpa
         satu pun petunjuk kenapa. Stok minus adalah keadaan yang perlu DILIHAT,
         bukan disembunyikan: ia menandakan catatan yang tertinggal. */
      render: r => {
        const q = r['c_' + c];
        if (q < 0) return `<span style="color:var(--bahaya);font-weight:600">${q}</span>`;
        if (q === 0) return '<span style="color:var(--teks-redup)">0</span>';
        return `<span${c === APP_STATE.cabang ? ' style="font-weight:600"' : ''}>${q}</span>`;
      }
    })),
    { judul: 'TOTAL', angka: true, kunci: 'total',
      render: r => `<strong>${r.total}</strong>` }
  ];
  const tabelStokLintas = (rows, kolom) => tabel(kolom, rows,
    { urut: halStok.urut, lebar: lebarKolomDaftar(kolom, $('#isiStok')?._rows, $('#isiStok')),
      kosong: 'Belum ada satu pun produk di katalog' });

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

      const kategoriAda = [...new Set(produk.map(p => (p.kategori || '').trim()).filter(Boolean))].sort();

      $('#isiStok').innerHTML = `
        ${/* Kotak mini Dasbor, bukan kartu statistik (bagian 234, pemilik 23 Sep
              2026: "pertipis ukuran kartu statistik dan berikan aksen ikon").
              Tanpa baris ekor — .petak-stok menyembunyikannya — jadi ±66 px. */''}
        <div class="petak-mini petak-stok">
          ${cabang.map(c => kotakMini('Stok ' + c, rows.reduce((a, r) => a + r['c_' + c], 0), '', { ikon: 'cabang', warna: 'biru' })).join('')}
          ${kotakMini('Seluruh cabang', rows.reduce((a, r) => a + r.total, 0), '', { ikon: 'stok', warna: 'hijau' })}
        </div>
        <div class="kartu">
          <div class="bar-alat bar-alat-menu">
            <div class="saringan">
              <input type="text" class="input-cari" id="cariStok" placeholder="Cari SKU / nama…" style="max-width:320px">
              <select id="stokKategori" style="max-width:200px">${opsiKategori(kategoriAda, katStok)}</select>
              <select id="stokLingkup" style="max-width:170px">${opsiLingkupStok('semua')}</select>
            </div>
            <div class="aksi">
              <button class="tombol" id="btnSegarkanStokLintas"
                title="Angka ringkasan tersimpan di perangkat ini, diperbarui ${waktu ? esc(waktuTampil(waktu)) : 'belum pernah'}; sebelum menjanjikan barang ke pelanggan, tekan Hitung ulang.">${ikonAlat('segarkan')}<span>Hitung ulang</span></button>
            </div>
          </div>
          <div id="tabelStok"></div>
        </div>`;
      $('#isiStok')._rows = rows;
      $('#isiStok')._cabang = cabang;
      halStok.reset();

      /* KATALOG PERANGKAT KOSONG bukan "belum ada produk".
         Layar ini membaca katalog dari perangkat, bukan server — itu yang
         membuatnya terbuka seketika dan tetap terbaca saat internet mati. Tapi
         sampai 14 Sep 2026 keadaan "belum tersalin" dan "katalognya memang
         kosong" dijawab kalimat yang sama, dan yang pertama jauh lebih sering:
         katalog sempat benar-benar kosong 607 md tiap kali master ditarik ulang
         (bagian 169). Pemilik mendapat "Belum ada satu pun produk di katalog"
         padahal ada 3.831 di server.

         Yang diganti HANYA isi tabelnya. Percobaan pertama mengganti seluruh
         layar dan ikut membuang dropdown lingkup — orangnya terjebak, tidak
         bisa kembali ke satu cabang tanpa pindah menu. Uji peramban yang
         menangkapnya, bukan mata saya. */
      if (!produk.length) {
        $('#tabelStok').innerHTML = `
          <div style="padding:18px 4px">
            <p style="margin:0 0 6px"><strong>Katalog belum tersalin ke perangkat ini.</strong>
               Bukan berarti katalog di server kosong.</p>
            <p class="petunjuk" style="margin:0 0 12px">Layar ini sengaja membaca katalog dari
               perangkat supaya terbuka seketika dan tetap terbaca saat internet mati. Paling
               sering terjadi saat baru dibuka di perangkat ini, atau tepat berbarengan dengan
               katalog sedang diperbarui.</p>
            <button class="tombol utama" id="btnTarikKatalog">Tarik katalog sekarang</button>
          </div>`;
        $('#btnTarikKatalog')?.addEventListener('click', async (e) => {
          e.target.disabled = true;
          try { await Sync.tarikMaster(true); await muatStokSemuaCabang(katStok); }
          catch (x) { galat('#isiStok', x); }
        });
        return;
      }
      gambarBarisStok();
    } catch (e) { galat('#isiStok', e); }
  }

  /**
   * Tabel stok digambar dari baris yang SUDAH di tangan, 100 baris per halaman.
   *
   * Diminta pemilik 10 Sep 2026: "tampilkan 100 katalog saja, tapi search box
   * nya tetap berfungsi ke semua katalog". Saringan (kata kunci + kategori)
   * bekerja atas SELURUH `_rows`; yang dipotong 100 hanya yang digambar.
   * Alasannya sama dengan layar Produk (§122): 3.500 <tr> tidak hilang saat
   * pindah layar dan setiap layar lain ikut memikulnya. */
  function gambarBarisStok() {
    const wadah = $('#isiStok');
    const tabelEl = $('#tabelStok');
    if (!wadah || !tabelEl) return;
    const q = ($('#cariStok')?.value || '').toLowerCase().trim();
    const kat = $('#stokKategori')?.value || '';
    const semua = wadah._rows || [];
    /* Status disaring dari HASIL `statusStok()`, bukan dari aturannya ditulis
       ulang di sini. Aturan yang disalin dua tempat cepat atau lambat berbeda —
       dan yang tampil di kolom akan menyebut satu hal sementara saringannya
       menyaring hal lain. */
    const rows = semua.filter(r =>
      (!kat || r.kategori === kat) &&
      (!statusStokPilih || (statusStok(r) || {}).id === statusStokPilih) &&
      (!q || (r.sku + ' ' + r.nama).toLowerCase().includes(q)));
    const hitung = rows.length === semua.length
      ? `${semua.length} baris`
      : `${rows.length} dari ${semua.length} baris`;
    /* Urut dulu atas SELURUH baris yang cocok, baru dipotong 100 — sama
       dengan layar Produk (lihat `buatHalaman`). */
    const kolom = stokLintas ? susunKolomStokLintas(wadah._cabang || []) : susunKolomStok(wadah._punyaNilai);
    const urut = halStok.urutkan(rows, kolom);
    /* Penghitung di KAKI tabel, sebaris dengan pager (bagian 234): di kepala ia
       memakan satu baris sendiri di atas daftar; di kaki ia menumpang baris
       yang memang sudah ada untuk pager. */
    tabelEl.innerHTML =
      (stokLintas ? tabelStokLintas(halStok.potong(urut), kolom) : tabelStok(halStok.potong(urut), kolom)) +
      /* Lencana HPP ikut ke kaki (pemilik: "HPP FIFO dipindah supaya tidak boros
         tempat") — di bar saringan ia membungkus ke baris kedua sendirian. */
      `<div class="kaki-tabel"><span class="jumlah-baris">${hitung}</span>${stokLintas ? '' : '<span class="lencana hijau">HPP: FIFO</span>'}${halStok.pager(urut.length)}</div>`;
  }

  async function muatStok(katStok = '', paksa = false) {
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
      /* Tersimpan di perangkat, umur maksimal 10 menit — lihat `bacaCacheUmur`.
         `paksa` melewatinya: itulah tombol Hitung ulang. */
      const cakupan = cakupanStok();
      const tersimpan = paksa ? null
        : await bacaCacheUmur(CACHE_STOK, cakupan, CONFIG.STOK_CABANG_POLL_MS);

      let stok, waktuStok;
      if (tersimpan && Array.isArray(tersimpan.d?.stok)) {
        stok = tersimpan.d;
        waktuStok = tersimpan.waktu;
        /* Data terjual TETAP dipastikan ada — kolom Status membutuhkannya, dan
           ia punya penampung sendiri yang tidak menembak server dua kali. */
        await muatTerjual();
      } else {
        /* BERBARENGAN, bukan berurutan. Kolom Status membutuhkan data penjualan
           — keenam statusnya membedakan laku/tidak — jadi layar ini selalu
           perlu keduanya. `stokTerkini` yang menghitung FIFO adalah yang paling
           lambat; menumpangkan penarikan penjualan padanya praktis tidak
           menambah waktu, sementara menjalankannya berurutan berarti dua kali
           tunggu.

           Kegagalan penjualan TIDAK menggagalkan layar: `muatTerjual()`
           menangani galatnya sendiri dan memulangkan false, lalu `statusStok()`
           memulangkan null dan kolomnya menampilkan "—". Stok tidak boleh
           hilang dari layar hanya karena angka penjualan tidak datang. */
        [stok] = await Promise.all([
          API.stokTerkini({ cabang: cabangStokKini(), dengan_produk: true }),
          muatTerjual()
        ]);
        waktuStok = Date.now();
        await simpanCacheUmur(CACHE_STOK, cakupan, stok);
      }
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
      /* Tabelnya disaring `gambarBarisStok()` dari nilai dropdown yang sudah
         terpilih — dropdown yang menampilkan "Casing" di atas tabel berisi
         seluruh kategori lebih buruk daripada saringan yang tereset. */

      $('#isiStok').innerHTML = `
        ${/* Kotak mini Dasbor (.petak-mini, auto-fit 132px) — bukan kartu
              statistik (bagian 234). Pemilik: "pertipis ukuran kartu statistik
              dan berikan aksen ikon". Ikonnya menyebut isinya: stok, opname
              (belum bergerak), kas (nilai), peringatan (di bawah minimum). */''}
        <div class="petak-mini petak-stok">
          ${/* Tetap `bergerak.length`, BUKAN `rows.length`. Sejak produk yang
                belum pernah bergerak ikut ditampilkan, `rows` berisi seluruh
                katalog — dan angka di bawah judul "SKU bergerak" akan berhenti
                berarti apa pun. Yang belum bergerak dihitung terpisah. */''}
          ${kotakMini('SKU bergerak', bergerak.length, '', { ikon: 'stok', warna: 'biru' })}
          ${/* SELALU digambar, walau nol (pemilik 23 Sep 2026: "kartu statistik belum
                pernah bergerak jangan dihilangkan"). Kotak yang kadang ada kadang
                tidak membuat orang mengira fiturnya hilang. */''}
          ${kotakMini('Belum pernah bergerak', diam.length, '', { ikon: 'opname', warna: 'kuning' })}
          ${punyaNilai ? kotakMini('Nilai persediaan', rp(totalNilai), '', { ikon: 'kas', warna: 'hijau' }) : ''}
          ${kotakMini('Di bawah minimum', rows.filter(r => r.qty <= r.stok_min).length, '', { ikon: 'peringatan', warna: 'merah' })}
        </div>
        <div class="kartu">
          <div class="bar-alat bar-alat-menu">
            <div class="saringan">
              <input type="text" class="input-cari" id="cariStok" placeholder="Cari SKU / nama…" style="max-width:320px">
              <select id="stokKategori" style="max-width:200px">${opsiKategori(stok.kategori_ada || [], katStok)}</select>
              <select id="stokStatus" style="max-width:200px">${opsiStatusStok(statusStokPilih)}</select>
              ${bolehStokLintas()
                ? `<select id="stokLingkup" style="max-width:170px">${opsiLingkupStok(stokCabang ? 'cabang:' + stokCabang : 'sini')}</select>`
                : `<span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>`}
            </div>
            <div class="aksi">
              <button class="tombol" id="btnSegarkanStok"
                title="Angka ringkasan tersimpan di perangkat ini, diperbarui ${esc(waktuTampil(new Date(waktuStok).toISOString()))}; sebelum menjanjikan barang ke pelanggan, tekan Hitung ulang.">${ikonAlat('segarkan')}<span>Hitung ulang</span></button>
              ${menuEkspor('stok', { cabang: cabangStokKini() })}
            </div>
          </div>
          ${/* Kalimat "ringkasan tersimpan … diperbarui …" DIBUANG dari layar
                (bagian 234, pemilik) — jamnya hidup sebagai tooltip tombol
                Hitung ulang, sama persis di kedua jalur Stok. */''}
          <div id="tabelStok"></div>
        </div>`;
      $('#isiStok')._rows = rows;
      $('#isiStok')._punyaNilai = punyaNilai;
      halStok.reset();
      gambarBarisStok();
    } catch (e) { galat('#isiStok', e); }
  }

  /**
   * Status satu baris stok — SATU jawaban, selalu ada, tidak pernah dua.
   *
   * Dua sumbu: stok (habis / menipis / cukup) x laku (ya / tidak). Tiga kali
   * dua = ENAM, dan keenamnya dipakai. Pemilik semula menyebut empat; dua yang
   * tersisa ("Sehat" dan "Habis, tidak dicari") ditambahkan karena tanpa
   * keduanya mayoritas baris berkolom KOSONG — dan kolom status yang kadang
   * kosong membuat petugas mengira barisnya belum dihitung, bukan mengira
   * barangnya baik-baik saja. Diperiksa di data sungguhan 11 Sep 2026: 1023
   * baris, 1023 status, tidak ada sisa.
   *
   * Ambang "menipis" DUA LAPIS, sama persis dengan saringan Menipis di layar
   * Produk: `stok_min` kalau sudah disetel, 2 pcs kalau masih 0. Satu
   * definisi untuk dua layar — dua definisi cepat atau lambat berbeda.
   *
   * Urutan daftar ini = urutan mendesaknya, dan dropdown mengikutinya. Yang
   * perlu ditindak hari ini selalu di atas.
   */
  const STATUS_STOK = [
    { id: 'habis-dicari',        label: 'Habis, masih dicari',  kelas: 'st-genting',
      cocok: (habis, menipis, laku) => habis && laku },
    { id: 'menipis-laku',        label: 'Menipis & laku',       kelas: 'st-awas',
      cocok: (habis, menipis, laku) => menipis && laku },
    { id: 'sehat',               label: 'Sehat',                kelas: 'st-sehat',
      cocok: (habis, menipis, laku) => !habis && !menipis && laku },
    { id: 'menipis-kurang-laku', label: 'Menipis, kurang laku', kelas: 'st-diam',
      cocok: (habis, menipis, laku) => menipis && !laku },
    { id: 'ada-tak-laku',        label: 'Ada, tidak laku',      kelas: 'st-diam',
      cocok: (habis, menipis, laku) => !habis && !menipis && !laku },
    { id: 'habis-tak-dicari',    label: 'Habis, tidak dicari',  kelas: 'st-sepi',
      cocok: (habis, menipis, laku) => habis && !laku }
  ];

  /** Ambang menipis — dua lapis. Dipakai status DAN saringan, satu tempat. */
  const ambangMenipis = (r) => { const m = Number(r.stok_min) || 0; return m > 0 ? m : 2; };

  /** Status yang sedang dipilih di dropdown; '' = semua. */
  let statusStokPilih = '';
  const opsiStatusStok = (terpilih) =>
    `<option value="">Semua status</option>` + STATUS_STOK.map(x =>
      `<option value="${x.id}" ${x.id === terpilih ? 'selected' : ''}>${esc(x.label)}</option>`).join('');

  /**
   * @returns {object|null} entri STATUS_STOK, atau null bila data penjualan
   * belum ada. Null SENGAJA: kolomnya menampilkan "—", bukan menebak "tidak
   * laku" — menebak akan menuduh barang laris sebagai barang mati.
   */
  function statusStok(r) {
    if (!terjualSiap()) return null;
    const q = Number(r.qty) || 0;
    const habis = q === 0;
    const menipis = !habis && q <= ambangMenipis(r);
    const laku = (terjualProduk.qty[r.sku] || 0) > 0;
    return STATUS_STOK.find(x => x.cocok(habis, menipis, laku)) || null;
  }

  const susunKolomStok = (punyaNilai) => [
    { judul: 'SKU', kunci: 'sku' },
    /* Kode varian pindah KE BAWAH NAMA, kolomnya dibuang (v1.170).
       Di toko ini beda varian hampir selalu beda SKU — barcode pabrik berbeda
       per warna, dan SKU dinomori dari barcode — jadi kolomnya menampilkan "—"
       di 1023 dari 1023 baris. Tapi fitur variannya TIDAK dicabut dan suatu
       saat bisa dipakai, jadi kodenya tetap tampil begitu ada isinya: yang
       dibuang kolomnya, bukan informasinya. */
    { judul: 'Nama', kunci: 'nama', lentur: true, nilai: r => r.nama || '',
      render: r => esc(r.nama || '') + metaStok(r) },
    { judul: 'Status', nilai: r => { const st = statusStok(r); return st ? st.label : ''; },
      render: r => { const st = statusStok(r);
        return st ? `<span class="st ${st.kelas}">${esc(st.label)}</span>`
                  : '<span style="color:var(--teks-redup)">—</span>'; } },
    { judul: 'Stok', angka: true, nilai: r => Number(r.qty) || 0, render: r => lencanaStok(r.qty, r.stok_min) },
    { judul: 'Min', kunci: 'stok_min', angka: true },
    ...(punyaNilai ? [
      // Dengan FIFO, satu SKU bisa punya beberapa harga modal. Kolom ini menunjukkan
      // rata-rata tertimbangnya, dan menandai bila stoknya terdiri dari beberapa lapisan.
      { judul: 'HPP rata2', angka: true, nilai: r => Number(r.hpp) || 0, render: r => rp(r.hpp) +
          (r.jumlah_lapisan > 1
            ? `<div class="meta-kecil">${r.jumlah_lapisan} lapisan · ${rp(r.hpp_min)}–${rp(r.hpp_maks)}</div>`
            : '') },
      { judul: 'Nilai', angka: true, nilai: r => Number(r.nilai) || 0, render: r => rp(r.nilai) }] : []),
    /* Tombol "Kartu stok" dibuang v1.170 atas permintaan pemilik — barisnya
       yang diklik, pola yang sudah dipakai Riwayat transfer dan Pembelian.
       Satu kolom lagi hilang, dan tabelnya jadi lebih lega. */
  ];
  const tabelStok = (rows, kolom) => tabel(kolom, rows,
    { urut: halStok.urut, lebar: lebarKolomDaftar(kolom, $('#isiStok')?._rows, $('#isiStok')),
      kosong: 'Belum ada mutasi stok',
      dataAttr: r => `data-kartu-stok="${esc(r.sku)}" class="baris-klik"` });

  async function lihatKartuStok(sku) {
    bukaModal('Kartu stok — ' + sku,
      '<div id="isiKartuStok">' + rangkaBaris(6, ['70%', '54%', '64%', '46%']) + '</div>');
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

  /* Lencana status dokumen pembelian (bagian 229). AKTIF = status lama sebelum
     alur pemeriksaan ada — dibaca sebagai sudah diperiksa. */
  const lencanaStatusBeli = (st) => ({
    MENUNGGU: lencanaDash('Menunggu periksa', 'kuning'),
    DIPERIKSA: lencanaDash('Diperiksa', 'hijau'),
    AKTIF: lencanaDash('Diperiksa', 'hijau'),
    DITOLAK: lencanaDash('Ditolak', 'merah'),
    DIBATALKAN: lencanaDash('Dibatalkan', 'merah')
  })[String(st)] || lencanaDash(esc(String(st || '')), 'redup');

  async function muatPembelian() {
    memuat('#isiPembelian');
    try {
      const rows = await API.daftarPembelian({ cabang: APP_STATE.cabang });
      $('#isiPembelian').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            <span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>
            <div style="flex:1"></div>
            ${bolehIzin('pembelian', 'buat') ? tombolTambah('btnPembelianBaru', 'Pembelian baru') : ''}
          </div>
          <p class="petunjuk">Staf gudang mencatat barang yang diterima dari supplier — stok dan utangnya langsung tercatat. Head Admin memeriksa dokumennya terhadap faktur; yang sudah diperiksa dibayar lewat menu Utang.</p>
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
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            /* Status ditampilkan sejak v1.94: kolomnya sudah ada di sheet sejak awal
               tapi tidak pernah tergambar, jadi dokumen yang dibatalkan terlihat
               persis seperti yang masih berlaku. */
            { judul: 'Status', render: r => lencanaStatusBeli(r.status) },
            { judul: '', render: r => [
                /* Periksa membuka rinciannya — keputusannya diambil sambil melihat barisnya. */
                r.status === 'MENUNGGU' && bolehIzin('pembelian', 'setujui')
                  ? tombolBaris('utama', 'Periksa', IKON.setujui, `data-periksa-beli="${esc(r.uuid)}"`) : '',
                !['DIBATALKAN', 'DITOLAK'].includes(r.status) && bolehIzin('pembelian', 'hapus')
                  ? tombolBaris('bahaya', 'Batal', IKON.batal, `data-batal-pembelian="${esc(r.uuid)}"`) : ''
              ].join(' ') }
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
    bukaModal('Rincian pembelian', rangkaBaris(6, ['72%', '56%', '66%', '48%']));
    let d;
    try {
      d = await API.rincianPembelian({ uuid, cabang: APP_STATE.cabang });
    } catch (x) {
      return bukaModal('Rincian pembelian', `<div class="pesan galat">${esc(x.message)}</div>`);
    }
    const item = d.item || [];
    const janggal = item.filter(i => i.sebab_janggal);
    const bolehBatal = !['DIBATALKAN', 'DITOLAK'].includes(d.status) && bolehIzin('pembelian', 'hapus');
    const bolehPeriksa = d.status === 'MENUNGGU' && bolehIzin('pembelian', 'setujui');

    bukaModal(`Pembelian ${d.no_dokumen || '(tanpa nomor)'}`, `
      <p class="petunjuk">${esc(tglTampil(d.tanggal))} · ${esc(d.nama_supplier || '—')} ·
        ${lencanaStatusBeli(d.status)}
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
      <div class="total-baris besar"><span>TOTAL</span><span>${rp(d.total)}</span></div>
      ${/* Bagian 244: invoice yang sudah dibayar ke supplier SEBELUM barang datang
           dilunasi saat diperiksa, bertanggal pembayaran sebenarnya. Hanya bagi
           yang juga boleh membayar utang. */ ''}
      ${bolehPeriksa && bolehIzin('utang', 'buat') ? `<div class="kartu rapat" id="pbDimukaKartu" style="margin-top:12px">
        <label class="cek"><input type="checkbox" id="pbDimuka"> Sudah dibayar ke supplier sebelum barang datang</label>
        <div id="pbDimukaIsi" hidden>
          <div class="saring-baris">
            <div class="kendali-tetap"><label>Tanggal dibayar</label><input type="date" id="pbDimukaTgl" value="${esc(String(d.tanggal || '').substring(0, 10))}"></div>
            <div class="kendali-tetap"><label>Dari</label><select id="pbDimukaSumber">
              <option value="transfer">Transfer bank</option><option value="kas_admin">Kas Admin</option></select></div>
            <div class="kendali-tetap"><label>Nominal</label><input type="text" id="pbDimukaJumlah" class="uang" value="${rp0(d.total)}"></div>
          </div>
          <p class="petunjuk">Tanggal saat uangnya diserahkan ke supplier. Utangnya langsung lunas pada tanggal itu;
             kalau jumlahnya kurang dari total, sisanya tetap utang dan dibayar di menu Utang.</p>
        </div>
      </div>` : ''}`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Tutup</span></button>
       ${bolehPeriksa
         ? `<button class="tombol bahaya" data-periksa-tolak="${esc(d.uuid)}">${ikonAlat('blokir')}<span>Tolak…</span></button>
            <button class="tombol sukses" data-periksa-ok="${esc(d.uuid)}">${ikonAlat('setujui')}<span>Sudah diperiksa</span></button>`
         : ''}
       ${bolehBatal && !bolehPeriksa
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
        <!-- TIDAK ADA BAWAAN. "Tunai" dulu jadi pilihan pertama, jadi ia
             terpilih tanpa ada yang memutuskan: 74 dari 74 pembelian
             September 2026 tercatat tunai, dan kas buku jatuh ke −71 juta
             karena uang untuk membayarnya tidak pernah ada di buku.
             Mekanismenya sendiri benar — AKUN_BAYAR memetakan transfer ke
             Bank dan kredit ke Utang Usaha. Yang tidak ada: seseorang yang
             memilih. Satu ketukan tambahan per pembelian adalah ongkos yang
             sengaja dibayar (bagian 207). -->
        <!-- Cara bayar DIBUANG (bagian 229, pemilik 22 Sep 2026): semua pembelian
             jadi utang dulu; uang keluar lewat menu Utang sesudah Head Admin
             memeriksa. Servernya memaksa 'kredit' apa pun yang dikirim. Sejarahnya
             di bagian 207: pilihan pertama "Tunai" sempat terpilih tanpa ada yang
             memutuskan dan kas buku jatuh ke minus 71 juta. -->
        <div class="grup"><label>Jatuh tempo pembayaran</label><input type="date" id="beliJatuhTempo"></div>
        <div class="grup"><label>&nbsp;</label><p class="petunjuk" style="margin:0">Dicatat sebagai utang supplier. Dibayar lewat menu Utang sesudah Head Admin memeriksa.</p></div>
      </div>

      <!-- Scanner pembelian (bagian 254): mesin scan mengetik kodenya lalu
           Enter, sama seperti Opname. -->
      <div class="grup" style="margin-top:6px"><label>Pindai barcode / SKU</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" class="input-cari" id="beliPindai" placeholder="Pindai barcode / SKU…" autocomplete="off" style="flex:1;max-width:320px">
          <span class="op-kelipatan">× <input type="number" id="beliKelipatan" value="1" min="1" style="width:64px" title="Jumlah per pindaian"></span>
        </div>
        <p class="petunjuk" id="beliPindaiInfo" style="margin:4px 0 0">Pindai label barang: barang yang sama menambah jumlahnya, barang baru jadi baris baru dengan harga beli terakhir.</p></div>
      <label>Item</label>
      <div id="barisBeli"></div>
      <button class="tombol" id="btnTambahBaris">+ Tambah baris</button>

      <div class="baris2" style="margin-top:14px">
        <div class="grup"><label>Diskon dokumen</label><input type="text" inputmode="numeric" class="uang" id="beliDiskon" value="0"></div>
        <div class="grup"><label>PPN</label><input type="text" inputmode="numeric" class="uang" id="beliPpn" value="0"></div>
      </div>
      <div class="total-baris besar" style="font-size:var(--fs-21)"><span>TOTAL</span><span id="beliTotal">Rp 0</span></div>
      <div id="pesanBeli"></div>`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanPembelian">${ikonAlat('simpan')}<span>Simpan pembelian</span></button>`);
    daftarPilihProduk = prod.produk;
    tambahBarisBeli();
    siapkanPindaiBeli(prod.produk);
    $('#beliPindai')?.focus();
  }

  /* Peta scanner pembelian (bagian 254) dibangun dari daftar produk SERVER yang
     sudah dimuat form ini — BUKAN katalog perangkat. Sejak bagian 249 katalog
     perangkat hanya memuat produk cabang sesi, sedangkan pembelian dan stok
     tidak disaring cabang: pembelian untuk SKG01 akan menolak semua barcode.
     Barcode yang dipakai lebih dari satu SKU DITANYA, bukan ditebak. */
  let pindaiBeli = null;
  function siapkanPindaiBeli(daftar) {
    const barcode = new Map(), sku = new Map(), nama = new Map();
    (daftar || []).forEach((p) => {
      const k = String(p.sku || '');
      if (!k) return;
      sku.set(k.toLowerCase(), k);
      nama.set(k, String(p.nama || k));
      const b = String(p.barcode || '').trim().toLowerCase();
      if (b) barcode.set(b, (barcode.get(b) || []).concat([k]));
    });
    pindaiBeli = { barcode, sku, nama };
  }

  function pindaiPembelian(kodeMentah) {
    const kode = String(kodeMentah || '').trim();
    const q = kode.toLowerCase();
    const info = $('#beliPindaiInfo');
    if (!q || !pindaiBeli) return;
    const calon = pindaiBeli.barcode.get(q) || (pindaiBeli.sku.has(q) ? [pindaiBeli.sku.get(q)] : null);
    if (!calon) {
      toast(`Kode ${kode} tidak dikenal di katalog.`, 'galat');
      if (info) info.textContent = `Kode ${kode} tidak dikenal — tidak ada yang ditambahkan.`;
      return;
    }
    if (calon.length > 1) {
      const daftar = calon.map((s) => pindaiBeli.nama.get(s) || s).join(', ');
      toast(`Barcode ${kode} dipakai ${calon.length} produk (${daftar}). Pilih lewat kolom cari.`, 'galat');
      if (info) info.textContent = `Barcode ${kode} ganda: ${daftar} — tidak ada yang ditambahkan.`;
      return;
    }
    const sku = calon[0];
    const kelInp = $('#beliKelipatan');
    const kel = Math.max(1, Math.floor(Number(kelInp && kelInp.value) || 1));
    const semua = $$('#barisBeli [data-anak="beli"]');
    let baris = semua.find((b) => b.querySelector('input[data-f="sku"]')?.value === sku);
    let qty;
    if (baris) {
      const inp = baris.querySelector('[data-f="qty"]');
      qty = (Number(inp.value) || 0) + kel;
      inp.value = qty;
    } else {
      baris = semua.find((b) => !b.querySelector('input[data-f="sku"]')?.value);
      if (!baris) { tambahBarisBeli(); const s2 = $$('#barisBeli [data-anak="beli"]'); baris = s2[s2.length - 1]; }
      pilihProduk(baris, sku);
      qty = kel;
      baris.querySelector('[data-f="qty"]').value = qty;
    }
    if (kelInp) kelInp.value = 1;
    hitungTotalBeli();
    baris.classList.remove('baris-pindai'); void baris.offsetWidth; baris.classList.add('baris-pindai');
    baris.scrollIntoView({ block: 'nearest' });
    if (info) info.textContent = `${pindaiBeli.nama.get(sku) || sku} · ${qty} pcs${kel > 1 ? ' (+' + kel + ')' : ' (+1)'}`;
    $('#beliPindai')?.focus();
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
    $('#beliTotal').innerHTML = rp(total);
  }

  async function simpanPembelian() {
    const item = kumpulkanAnak('beli').filter(i => i.sku && Number(i.qty) > 0);
    if (!item.length) return toast('Minimal satu item.', 'galat');
    /* Konfirmasi (bagian 245): stok masuk dan utang supplier tercatat sekarang. */
    if (!(await tanya('Simpan pembelian?',
          `<p class="petunjuk">${item.length} jenis barang, ${item.reduce((a, i) => a + (Number(i.qty) || 0), 0)} pcs masuk stok sekarang dan
             tercatat sebagai utang ke supplier, menunggu diperiksa Head Admin.</p>`,
          { ya: 'Simpan pembelian' }))) return;
    const btn = $('#btnSimpanPembelian');
    btn.disabled = true;
    try {
      const r = await API.simpanPembelian({
        uuid: uuidPembelian,
        cabang: APP_STATE.cabang,
        tanggal: nilai('beliTanggal'), no_dokumen: nilai('beliNo'),
        kode_supplier: nilai('beliSupplier'),   // cara bayar: selalu utang (bagian 229)
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
        <div class="bar-alat"><h3>Pelanggan</h3><div style="flex:1"></div>
          ${bolehIzin('pelanggan', 'buat') ? tombolTambah('btnPelangganBaru', 'Pelanggan') : ''}
          ${menuTindakan({ id: 'menuPelanggan', kunci: 'pelanggan', idTombol: 'btnMenuPelanggan',
              isi: butirNonaktif('pelanggan', hitungMati(pel)) })}</div>
        <p class="petunjuk">Pelanggan dipilih kasir saat menutup nota — untuk poin, piutang, dan harga khusus. Supplier ada di kartu bawah, dipakai saat mencatat pembelian.</p>
        ${tabel([
          { judul: 'Kode', kunci: 'kode' },
          { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
          { judul: 'Telepon', kunci: 'telepon' },
          { judul: 'Level harga', render: r => `<span class="lencana">${esc(normalLevelWeb(r.level_harga))}</span>` },
          { judul: 'Limit kredit', angka: true, render: r => rp(r.limit_kredit) },
          { judul: 'Termin', render: r => r.termin_hari ? r.termin_hari + ' hari' : '—' },
          { judul: 'Piutang', angka: true, render: r => r.sisa_piutang > 0
              ? `<span class="stok-kritis">${rp(r.sisa_piutang)}</span>` : '—' },
          { judul: '', render: r => `<button class="tombol kecil" data-edit-pelanggan="${esc(r.kode)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>` }
        ], pel, { kosong: 'Belum ada pelanggan', pisahNonaktif: true, kunci: 'pelanggan' })}
      </div>` : ''}

      ${sup ? `
      <div class="kartu">
        <div class="bar-alat"><h3>Supplier</h3><div style="flex:1"></div>
          ${bolehIzin('supplier', 'buat') ? tombolTambah('btnSupplierBaru', 'Supplier') : ''}
          ${menuTindakan({ id: 'menuSupplier', kunci: 'supplier', idTombol: 'btnMenuSupplier',
              isi: butirNonaktif('supplier', hitungMati(sup)) })}</div>
        ${tabel([
          { judul: 'Kode', kunci: 'kode' },
          { judul: 'Nama', kunci: 'nama' },
          { judul: 'Kontak', kunci: 'kontak' },
          { judul: 'Telepon', kunci: 'telepon' },
          { judul: 'Termin', render: r => r.termin_hari ? r.termin_hari + ' hari' : '—' },
          { judul: '', render: r => `<button class="tombol kecil" data-edit-supplier="${esc(r.kode)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>` }
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanPelanggan">${ikonAlat('simpan')}<span>Simpan</span></button>`);
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanSupplier">${ikonAlat('simpan')}<span>Simpan</span></button>`);
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
            ? ('<button class="tombol utama" id="btnSimpanBobot">' + ikonAlat('simpan') + '<span>Simpan bobot</span></button>') : ''}
          <div id="pesanBobot"></div>
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3>Petugas / pramuniaga</h3><div style="flex:1"></div>
            ${bolehIzin('petugas', 'buat') ? tombolTambah('btnPetugasBaru', 'Petugas') : ''}
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
                ? `<button class="tombol kecil" data-edit-petugas="${esc(r.kode)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>` : '' }
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanPetugas">${ikonAlat('simpan')}<span>Simpan</span></button>`);
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
  const PERIODE_POIN = { id: 'poinPeriode', dari: 'poinDari', sampai: 'poinSampai', nilai: 'bulan', label: 'Periode' };
  function pilihCabangPoin() {
    const sumber = (APP_STATE.daftarCabangSemua && APP_STATE.daftarCabangSemua.length)
      ? APP_STATE.daftarCabangSemua : (APP_STATE.daftarCabang || []);
    const daftar = sumber.slice().sort(urutNama);
    if (!APP_STATE.flag?.akses_lintas_cabang || daftar.length < 2) return '';
    return `<div class="kendali-tetap"><label>Cabang</label><select id="poinCabang">
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
          <div class="saring-baris">
            ${Periode.html(PERIODE_POIN)}
            <div class="kendali-tetap"><label>Petugas</label><select id="poinPetugas">
              <option value="">Semua petugas</option>
              ${urutkanOleh(rows, r => r.nama).map(r => `<option value="${esc(r.kode)}">${esc(r.nama)}</option>`).join('')}
            </select></div>
            ${pilihCabangPoin()}
          </div>
          <p class="petunjuk">Angka di sini dibekukan saat notanya masuk, bukan dihitung ulang
             sekarang. Menaikkan poin sebuah produk hari ini tidak mengubah pekerjaan yang
             sudah selesai bulan lalu. Nota yang dibatalkan otomatis keluar dari hitungan.</p>
        </div>
        <div id="hasilPoin"></div>`;
      /* v1.182: periode, petugas, dan cabang masing-masing memuat sendiri; layar
         terbuka langsung berisi bulan ini, bukan menunggu ditekan. */
      Periode.pasang(PERIODE_POIN, gambarHasilPoin);
      gambarHasilPoin();
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
        <!-- petak-4: empat kotak angka satu baris (auto-fit ≥160 px) — di tablet
             .petak tiga kolom meninggalkan kotak keempat sendirian (uji-ruang, v1.182;
             baru terukur karena Poin kini memuat sendiri saat dibuka). -->
        <div class="petak petak-4">
          <div class="kartu statistik"><div class="label">Petugas</div><div class="nilai">${r.petugas}</div></div>
          <div class="kartu statistik"><div class="label">Nota terklaim</div><div class="nilai">${r.nota}</div></div>
          <div class="kartu statistik"><div class="label">Total poin</div><div class="nilai">${r.poin}</div></div>
          <div class="kartu statistik"><div class="label">Omzet terklaim</div><div class="nilai">${rp(r.omzet)}</div></div>
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3>Peringkat cabang</h3>
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
          <div class="bar-alat"><h3>Peringkat per petugas</h3>
            <div style="flex:1"></div>
            <label style="margin:0">Urutkan</label>${pilihUrut('urutPetugas', URUT_PETUGAS, urutPetugas)}
            ${menuEkspor('poin', { dari: nilai('poinDari'), sampai: nilai('poinSampai') })}</div>
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
        <p class="petunjuk">Uang pelanggan yang belum dibayar, dikelompokkan menurut lamanya terlambat. Pembayaran dicatat lewat tombol di tiap baris.</p>
        <div class="petak petak-tangga">
          <div class="kartu statistik"><div class="label">Belum jatuh tempo</div><div class="nilai">${rp(a.lancar)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 1–30 hari</div><div class="nilai">${rp(a.h30)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 31–60</div><div class="nilai">${rp(a.h60)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 61–90</div><div class="nilai">${rp(a.h90)}</div></div>
          <div class="kartu statistik"><div class="label">Telat &gt; 90 hari</div>
            <div class="nilai" style="color:var(--bahaya)">${rp(a.lebih)}</div></div>
        </div>
        <div class="kartu laporan-uang">
          <div class="bar-alat"><h3>Daftar piutang — total ${rp(d.total)}</h3><span class="satuan-uang">dalam Rupiah</span>
            <div style="flex:1"></div>${menuEkspor('piutang')}</div>
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
                ? tombolBaris('utama', 'Terima bayar', IKON.terima, `data-bayar-piutang="${esc(r.uuid)}" data-cabang="${esc(r.cabang)}"`) : '' }
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
        <div class="grup"><label>Nominal bayar</label><input type="text" inputmode="numeric" class="uang" id="bpJumlah" value="${ribuan(p.sisa)}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Metode</label><select id="bpMetode">
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option>
          <option value="qris">QRIS</option></select></div>
        <div class="grup"><label>Referensi</label><input type="text" id="bpRef"></div>
      </div>
      <div id="pesanBayarPiutang"></div>`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol sukses" id="btnKonfirmasiBayarPiutang"
         data-uuid="${esc(uuid)}" data-cabang="${esc(cabang)}">${ikonAlat('simpan')}<span>Simpan</span></button>`);
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
        <p class="petunjuk">Tagihan supplier yang belum dibayar, dikelompokkan menurut lamanya terlambat. Pembayaran dicatat lewat tombol di tiap baris.</p>
        <div class="petak petak-tangga">
          <div class="kartu statistik"><div class="label">Belum jatuh tempo</div><div class="nilai">${rp(a.lancar)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 1–30 hari</div><div class="nilai">${rp(a.h30)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 31–60</div><div class="nilai">${rp(a.h60)}</div></div>
          <div class="kartu statistik"><div class="label">Telat 61–90</div><div class="nilai">${rp(a.h90)}</div></div>
          <div class="kartu statistik"><div class="label">Telat &gt; 90 hari</div>
            <div class="nilai" style="color:var(--bahaya)">${rp(a.lebih)}</div></div>
        </div>
        <div class="kartu laporan-uang">
          <div class="bar-alat"><h3>Utang ke supplier — total ${rp(d.total)}</h3><span class="satuan-uang">dalam Rupiah</span>
            <div style="flex:1"></div>${menuEkspor('utang')}</div>
          <p class="petunjuk">Setiap pembelian yang dicatat gudang masuk ke sini sebagai utang. Yang pembeliannya
             <strong>belum diperiksa Head Admin</strong> belum bisa dibayar — periksa dulu di menu Pembelian.</p>
          ${tabel([
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Supplier', kunci: 'nama_supplier' },
            { judul: 'Tanggal', tgl: true, kunci: 'tanggal' },
            { judul: 'Jatuh tempo', render: r => esc(tglTampil(r.jatuh_tempo)) },
            { judul: 'Telat', render: r => r.hari_telat > 0
                ? `<span class="lencana ${r.hari_telat > 60 ? 'merah' : 'kuning'}">${r.hari_telat} hari</span>`
                : '<span class="lencana hijau">lancar</span>' },
            { judul: 'Sisa', angka: true, render: r => rp(r.sisa) },
            { judul: '', render: r => r.status_pembelian === 'MENUNGGU'
                /* Gerbangnya di server (apiBayarUtang); di sini cuma dikatakan. */
                ? lencanaDash('belum diperiksa', 'kuning')
                : (bolehIzin('utang', 'buat')
                    ? tombolBaris('utama', 'Bayar', IKON.kirim, `data-bayar-utang="${esc(r.uuid)}" data-cabang="${esc(r.cabang)}"`) : '') }
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
        <div class="grup"><label>Nominal bayar</label><input type="text" inputmode="numeric" class="uang" id="buJumlah" value="${ribuan(u.sisa)}"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Metode</label><select id="buMetode">
          <option value="transfer">Transfer bank</option><option value="tunai">Tunai</option>
          <option value="qris">QRIS</option></select></div>
        <div class="grup"><label>Referensi / no. bukti transfer</label><input type="text" id="buRef"></div>
      </div>
      <div id="pesanBayarUtang"></div>`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol sukses" id="btnKonfirmasiBayarUtang"
         data-uuid="${esc(uuid)}" data-cabang="${esc(cabang)}">${ikonAlat('simpan')}<span>Simpan</span></button>`);
  }

  /* ==================== USER & HAK AKSES ==================== */

  /* Ikon aksi baris perangkat. Diminta pemilik 4 Sep 2026: tiga tombol berteks
     ("Setujui", "Blokir", "Hapus") membuat kolom terakhir selebar tiga kolom
     data, dan di HP barisnya patah.

     Kamus lokalnya DICABUT v1.174. Ia `const IKON_AKSI` di dalam fungsi ini,
     jadi ia MENUTUPI kamus bersama — dan `hapus`-nya sudah terlanjur berbeda
     dari `hapus` yang dipakai seluruh aplikasi. Ketiganya sekarang diambil dari
     `IKON` di pos.js. */

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
   * Tombol baris tabel: IKON + TEKS. Keputusan pemilik 22 Sep 2026 (§226):
   * ikon-saja (tombolIkon) hanya untuk layar Pengguna, yang tiga-empat
   * tombolnya berjejer di satu sel; di layar lain nama aksinya harus terbaca
   * tanpa menebak — "Terima bayar", "Koreksi balik", "Lepas". Satu pembuat
   * untuk semuanya supaya tingginya lurus (§214: kelurusan datang dari
   * pembuat yang sama). `judul` opsional untuk tooltip yang lebih panjang
   * daripada labelnya.
   */
  const tombolBaris = (gaya, label, jalur, atribut, judul) =>
    `<button class="tombol kecil ${gaya}" title="${esc(judul || label)}" ${atribut}>` +
    `<svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${jalur}</svg><span>${esc(label)}</span></button>`;

  /**
   * Umur dalam KATA, bukan tanggal.
   *
   * "2026-09-07T23:21" menuntut orang menghitung sendiri sebelum bisa
   * memutuskan. "9 hari lalu" menjawab pertanyaannya langsung — dan pertanyaan
   * yang sedang dijawab orang di layar Perangkat selalu sama: masih dipakai
   * atau sudah bisa dibuang?
   */
  function umurKata(iso) {
    if (!iso) return '';
    const t = new Date(String(iso).replace(' ', 'T')).getTime();
    if (!isFinite(t)) return '';
    const menit = Math.floor((Date.now() - t) / 60000);
    if (menit < 1) return 'barusan';
    if (menit < 60) return menit + ' menit lalu';
    const jam = Math.floor(menit / 60);
    if (jam < 24) return jam + ' jam lalu';
    const hari = Math.floor(jam / 24);
    if (hari < 31) return hari + ' hari lalu';
    const bulan = Math.floor(hari / 30);
    return bulan + ' bulan lalu';
  }

  /**
   * Sisa menit penguncian perangkat, atau 0. Cerminan `_sisaKunciMenit` di
   * 03_Auth.gs — perbandingan TEKS pada isonya, sama seperti di sana.
   *
   * Ada karena sampai 16 Sep 2026 penguncian ini TIDAK TERLIHAT di mana pun.
   * Kasir yang salah PIN lima kali melihat "coba lagi dalam 15 menit"; Owner
   * yang dipanggil untuk menolong melihat baris yang tampak sehat, dan tidak
   * punya cara mengetahui apa yang sebenarnya terjadi.
   */
  function terkunciMenit(r) {
    if (!r || !r.kunci_sampai) return 0;
    const sampai = new Date(String(r.kunci_sampai).replace(' ', 'T')).getTime();
    if (!isFinite(sampai)) return 0;
    return Math.max(0, Math.ceil((sampai - Date.now()) / 60000));
  }

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
          <div class="bar-alat"><div style="flex:1"></div>
            ${bolehIzin('user', 'buat') ? tombolTambah('btnUserBaru', 'Pengguna') : ''}
            ${menuTindakan({ id: 'menuUser', kunci: 'user', idTombol: 'btnMenuUser',
                isi: butirNonaktif('user', hitungMati(user)) })}</div>
          <p class="petunjuk">Akun untuk masuk ke aplikasi dan peran yang menentukan menu apa yang bisa dibuka. Perangkat yang dipakai masuk disetujui di kartu bawah.</p>
          ${tabel([
            { judul: 'ID', kunci: 'id_user' },
            { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}
              ${r.wajib_ganti_pin ? ' <span class="lencana kuning">PIN awal</span>' : ''}` },
            { judul: 'Username', kunci: 'username' },
            { judul: 'Peran', render: r => `<span class="lencana">${esc(r.nama_peran)}</span>` },
            { judul: 'Cabang', render: r => r.cabang === '*' ? 'semua' : esc(r.cabang) },
            { judul: 'Login terakhir', render: r => esc(waktuTampil(r.terakhir_login)) },
            /* IKON SAJA, diminta pemilik 21 Sep 2026. Sebelumnya "Ubah"
               bertinggi 28 px (punya ikon) dan "Reset PIN" 27 px (tanpa
               ikon), jadi keduanya meleset 4 px di baris yang sama.
               Lewat tombolIkon keduanya memakai ukuran yang sama dengan
               tombol ikon di tabel Perangkat — kelurusannya bukan diatur
               satu per satu, ia akibat dari memakai pembuat yang sama. */
            { judul: '', render: r => 
              tombolIkon('', 'Ubah', IKON.ubah, `data-edit-user="${esc(r.id_user)}"`) +
              (bolehIzin('user', 'ubah')
                ? tombolIkon('', 'Reset PIN', IKON.reset_pin, `data-reset-pin="${esc(r.id_user)}"`)
                : '') }
          ], user, { kosong: 'Belum ada pengguna', pisahNonaktif: true, kunci: 'user' })}
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3>Peran &amp; hak akses</h3><div style="flex:1"></div>
            ${bolehIzin('setting', 'ubah') ? tombolTambah('btnPeranBaru', 'Peran baru') : ''}</div>
          <p class="petunjuk">Peran menentukan menu apa yang muncul dan aksi apa yang diizinkan. Peran OWNER sengaja dikunci agar sistem tidak bisa terkunci dari dirinya sendiri.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode_peran' },
            { judul: 'Nama', kunci: 'nama' },
            { judul: 'Keterangan', kunci: 'keterangan' },
            { judul: 'Batas diskon', render: r => (r.flag.diskon_maks_persen ?? 0) + '%' },
            { judul: 'Harga modal', render: r => r.flag.lihat_harga_modal
                ? '<span class="lencana hijau">boleh</span>' : '<span class="lencana">tidak</span>' },
            /* Mengatur peran = kunci Sistem (setting·ubah), bukan kunci akun (v1.183).
               Yang tidak berhak melihat daftarnya saja, tanpa tombol. */
            { judul: '', render: r => r.kode_peran === 'OWNER'
                ? '<span class="lencana">terkunci</span>'
                : bolehIzin('setting', 'ubah')
                  ? tombolIkon('', 'Atur hak akses', IKON.atur_akses, `data-edit-peran="${esc(r.kode_peran)}"`)
                  : '<span class="lencana">hanya pemegang Pengaturan</span>' }
          ], cachePeran)}
        </div>

        <div class="kartu">
          <div class="bar-alat"><h3>Perangkat terdaftar</h3><div style="flex:1"></div>
            ${menuTindakan({ id: 'menuPerangkat', kunci: 'perangkat', idTombol: 'btnMenuPerangkat',
                isi: butirNonaktif('perangkat', hitungMati(perangkat, r => r.status === 'DIBLOKIR')) })}</div>
          <p class="petunjuk">Perangkat baru wajib disetujui sebelum bisa transaksi — ini yang mencegah PIN kasir yang bocor dipakai dari HP pribadi.</p>
          ${tabel([
            { judul: 'Kode', kunci: 'kode' },
            /* Baris yang SEDANG DIPAKAI ditandai. Audit 16 Sep 2026 menemukan
               lima baris bernama sama persis ("Windows \u00b7 1920x1080"), dan yang
               paling sering ditanyakan orang yang hendak merapikan daftar adalah
               "yang mana punya saya". Server menolak menghapus perangkat yang
               sedang dipakai, tapi menolak SESUDAH ditekan bukan jawaban yang
               sama dengan memberi tahu SEBELUM. */
            { judul: 'Nama perangkat', render: r => {
                /* Nama KEMBAR ditandai, dan angkanya disebut. Nama bawaan dirakit
                   peramban dari platform + ukuran layar, jadi satu laptop dengan dua
                   profil Chrome tampil dua kali dengan tulisan yang sama persis.
                   Audit 16 Sep 2026 menemukan satu nama muncul LIMA kali di daftar
                   22 baris. Lencana ini mengajarkan tindakan yang benar: yang salah
                   bukan barisnya, melainkan namanya — ganti nama, jangan hapus. */
                const kembar = perangkat.filter(x => String(x.nama) === String(r.nama)).length;
                const ini = String(r.id_perangkat) === String(APP_STATE.perangkat?.id);
                /* MEJA-nya disisipkan sebagai baris kecil, bukan kolom baru.
                   Tabel ini sudah tujuh kolom dan yang kedelapan terdorong keluar
                   layar di tablet — keputusan yang sama diambil 16 Sep 2026 untuk
                   umur, kunci, dan jumlah PIN salah. */
                const lini = String(r.lini || '');
                const namaLini = (APP_STATE.daftarLini || [])
                  .find(x => String(x.kode) === lini);
                return `${esc(r.nama || '')}` +
                  (ini ? ' <span class="lencana hijau">perangkat ini</span>' : '') +
                  (kembar > 1
                    ? ` <span class="lencana kuning">nama ini dipakai ${kembar} baris</span>` : '') +
                  (lini
                    ? `<div class="meta-kecil">meja ${esc(namaLini ? namaLini.nama : lini)}</div>`
                    : '<div class="meta-kecil petunjuk">belum punya meja</div>');
              } },
            { judul: 'Pemilik', render: r => pemilikPerangkat(r, user) },
            { judul: 'Cabang', kunci: 'cabang' },
            { judul: 'Status', render: r => {
                /* TERKUNCI bukan status tersimpan — ia dihitung dari kunci_sampai,
                   dan membuka sendiri sesudah 15 menit. Sampai 16 Sep 2026 keadaan
                   ini tidak terlihat di mana pun: kasir melihat "coba lagi dalam N
                   menit", Owner yang dipanggil menolong melihat baris yang tampak
                   sehat. Yang ditampilkan sisanya, bukan sekadar bahwa ia terkunci —
                   "tunggu 7 menit" adalah jawaban, "terkunci" cuma kabar. */
                const kunci = terkunciMenit(r);
                return `<span class="lencana ${
                  r.status === 'DISETUJUI' ? 'hijau' : (r.status === 'DIBLOKIR' ? 'merah' : 'kuning')
                  }">${esc(r.status)}</span>` +
                  (kunci > 0
                    ? ` <span class="lencana merah">terkunci ${kunci} menit lagi</span>` +
                      `<div class="meta-kecil">${num(r.gagal_login)}\u00d7 PIN salah</div>`
                    : '');
              } },
            /* Umur dalam KATA di atas, tanggal lengkapnya di bawah. Yang dicari
               orang di sini "masih dipakai atau sudah bisa dibuang", dan itu
               pertanyaan tentang JARAK waktu, bukan tentang tanggal.
               `dibuat` ikut karena tanpanya lima baris bernama sama tidak bisa
               dibedakan sama sekali. */
            { judul: 'Sinkron terakhir', render: r => {
                const pernah = !!r.terakhir_sinkron;
                return (pernah
                    ? `${esc(umurKata(r.terakhir_sinkron))}` +
                      `<div class="meta-kecil">${esc(waktuTampil(r.terakhir_sinkron))}</div>`
                    : '<span class="petunjuk">belum pernah</span>') +
                  (r.dibuat
                    ? `<div class="meta-kecil">didaftarkan ${esc(umurKata(r.dibuat))}</div>` : '');
              } },
            { judul: '', render: r => `
              ${bolehIzin('user', 'ubah')
                ? tombolIkon('', 'Ganti nama perangkat', IKON.ubah,
                    `data-nama-perangkat="${esc(r.id_perangkat)}"`) +
                  tombolIkon('', 'Tetapkan meja (lini usaha)', IKON.meja,
                    `data-meja-perangkat="${esc(r.id_perangkat)}"`) : ''}
              ${bolehIzin('user', 'setujui') ? `
                ${r.status !== 'DISETUJUI' ? tombolIkon('sukses', 'Setujui perangkat', IKON.setujui,
                    `data-perangkat="${esc(r.id_perangkat)}" data-status="DISETUJUI"`) : ''}
                ${r.status !== 'DIBLOKIR' ? tombolIkon('bahaya', 'Blokir perangkat', IKON.blokir,
                    `data-perangkat="${esc(r.id_perangkat)}" data-status="DIBLOKIR"`) : ''}` : ''}
              ${/* Hapus TIDAK muncul untuk yang DISETUJUI — server pun menolaknya.
                    Tombol yang satu-satunya keluaran mungkinnya pesan galat itu
                    jebakan, bukan tombol; yang masih hidup diblokir dulu, dan
                    langkah itulah yang memutus aksesnya. */
                 bolehIzin('user', 'hapus') && r.status !== 'DISETUJUI'
                ? tombolIkon('bahaya', 'Hapus perangkat', IKON.hapus,
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanPeran">${ikonAlat('simpan')}<span>Simpan hak akses</span></button>`);
  }

  /* ==================== CABANG ==================== */

  async function muatCabang() {
    memuat('#isiCabang');
    try {
      /* Dua panggilan, satu layar. Daftar meja ditarik dengan `allSettled`
         supaya kegagalannya tidak ikut menjatuhkan daftar cabang — dan yang
         GAGAL dibedakan dari yang KOSONG. Kalau keduanya dijadikan `[]`,
         layarnya akan berbohong: ia menulis "belum ada meja" untuk sesuatu
         yang sebenarnya tidak berhasil ditanya. Jebakan yang sama pernah
         menggigit Laporan Kerugian (KONTEKS bagian 175). */
      const [cab, lini] = await Promise.allSettled([
        API.daftarCabangAdmin(), API.daftarLini()
      ]);
      if (cab.status === 'rejected') throw cab.reason;
      $('#isiCabang')._rows = cab.value;
      $('#isiCabang')._lini = lini.status === 'fulfilled' ? lini.value : null;
      $('#isiCabang')._liniGagal = lini.status === 'rejected'
        ? (lini.reason?.message || String(lini.reason)) : '';
      gambarCabang();
    } catch (e) { galat('#isiCabang', e); }
  }

  function gambarCabang() {
    const w = $('#isiCabang');
    if (!w) return;
    const rows = w._rows || [];
    w.innerHTML = `
      <div class="kartu">
        <div class="bar-alat"><div style="flex:1"></div>
          ${bolehIzin('cabang', 'buat') ? tombolTambah('btnCabangBaru', 'Cabang baru') : ''}
          ${menuTindakan({ id: 'menuCabang', kunci: 'cabang', idTombol: 'btnMenuCabang',
              isi: butirNonaktif('cabang', hitungMati(rows)) })}</div>
        <p class="petunjuk">Setiap cabang punya file database sendiri di Google Drive. Pemisahan inilah yang membuat kasir cabang A tidak pernah menunggu cabang B saat menyimpan transaksi.</p>
        ${tabel([
          { judul: 'Kode', kunci: 'kode_cabang' },
          { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
          { judul: 'Alamat', kunci: 'alamat' },
          { judul: 'Telepon', kunci: 'telepon' },
          { judul: 'Prefix nota', kunci: 'prefix_nota' },
          { judul: '', render: r => `<button class="tombol kecil" data-edit-cabang="${esc(r.kode_cabang)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>` }
        ], rows, { kosong: 'Belum ada cabang', pisahNonaktif: true, kunci: 'cabang' })}
      </div>
      ${gambarLini()}`;
  }

  /**
   * Kartu MEJA (lini usaha) — sumbu kedua di sebelah cabang.
   *
   * Ditaruh di layar yang sama dengan cabang, bukan di layarnya sendiri,
   * karena keduanya menjawab pertanyaan yang bersebelahan: cabang menjawab DI
   * MANA sebuah nota lahir, meja menjawab DIVISI MANA yang memilikinya. Izin
   * keduanya pun sama (`cabang.lihat` / `cabang.buat`), jadi memisahkannya
   * cuma akan menambah satu menu tanpa menambah satu pun kemampuan.
   */
  function gambarLini() {
    const w = $('#isiCabang');
    const rows = w._lini;
    const kepala = `<div class="bar-alat"><h3>Meja &middot; lini usaha</h3><div style="flex:1"></div>` +
      (rows && bolehIzin('cabang', 'buat') ? tombolTambah('btnLiniBaru', 'Meja baru') : '') +
      (rows ? menuTindakan({ id: 'menuLini', kunci: 'lini', idTombol: 'btnMenuLini',
                            isi: butirNonaktif('lini', hitungMati(rows)) }) : '') + `</div>`;

    /* Gagal ditanya TIDAK sama dengan tidak punya. Sebabnya ditulis apa
       adanya, dan tabelnya tidak digambar sama sekali. */
    if (!rows) {
      return `<div class="kartu">${kepala}
        <div class="pesan galat">Daftar meja gagal ditarik${
          w._liniGagal ? ' — ' + esc(w._liniGagal) : ''}. Daftar cabang di atas tetap sahih.</div>
      </div>`;
    }

    return `<div class="kartu">${kepala}
      <p class="petunjuk">Cabang menjawab <strong>di mana</strong> sebuah nota lahir; meja
         menjawab <strong>divisi mana</strong> yang memilikinya. Satu toko bisa punya
         beberapa meja dengan laci dan tanggung jawab sendiri-sendiri — tanpa sumbu ini
         laporan hanya bisa bilang "SK01 untung sekian", tidak pernah bisa bilang divisi
         mana yang menyubsidi divisi mana.</p>
      <p class="petunjuk">Meja dilekatkan ke <strong>perangkat</strong>, bukan ke orang —
         lihat layar Pengguna. Tablet menempel di mejanya sedangkan petugas berganti shift.</p>
      ${tabel([
        { judul: 'Kode', kunci: 'kode_lini' },
        { judul: 'Nama', render: r => `${esc(r.nama)}${r.aktif ? '' : ' <span class="lencana merah">nonaktif</span>'}` },
        { judul: 'Urutan', kunci: 'urutan', angka: true },
        { judul: '', render: r => bolehIzin('cabang', 'ubah')
            ? `<button class="tombol kecil" data-edit-lini="${esc(r.kode_lini)}" title="Ubah">${ikonAlat('ubah')}<span>Ubah</span></button>`
            : '' }
      ], rows, { kosong: 'Belum ada meja', pisahNonaktif: true, kunci: 'lini' })}
    </div>`;
  }

  function editorLini(kode) {
    const l = kode ? ($('#isiCabang')._lini || []).find(x => x.kode_lini === kode) : null;
    bukaModal(l ? 'Ubah meja' : 'Meja baru', `
      <div class="baris2">
        <div class="grup"><label>Kode meja *</label>
          <input type="text" id="lKode" value="${esc(l?.kode_lini || '')}" ${l ? 'disabled' : ''}
                 placeholder="VOUCHER" maxlength="12"></div>
        <div class="grup"><label>Nama *</label>
          <input type="text" id="lNama" value="${esc(l?.nama || '')}" placeholder="Voucher &amp; Aksesoris"></div>
      </div>
      <div class="grup"><label>Urutan</label>
        <input type="number" id="lUrutan" value="${esc(String(l?.urutan ?? 0))}" min="0"></div>
      ${l ? `<label class="cek"><input type="checkbox" id="lAktif" ${l.aktif ? 'checked' : ''}> Aktif</label>` : ''}
      <p class="petunjuk">Kode tidak bisa diubah setelah dibuat — ia sudah membeku pada
         setiap nota yang lahir di meja ini. Namanya bebas diganti kapan saja.</p>
      ${l ? '<p class="petunjuk">Meja yang masih dipakai perangkat tidak bisa dinonaktifkan; lepaskan dulu perangkatnya di layar Pengguna.</p>' : ''}`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanLini">${ikonAlat('simpan')}<span>Simpan</span></button>`);
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanCabang">${ikonAlat('simpan')}<span>Simpan</span></button>`);
  }

  /**
   * Sambungan ke Laporan Pulsa — kartunya sendiri, DI LUAR petak setting.
   *
   * Sengaja tidak dijadikan baris `setting` biasa walau di situ ia akan dapat
   * layar gratis: isi tabel setting ikut turun ke SETIAP tablet kasir lewat
   * `tarik_master`, dan id berkas internal tidak ada urusannya dengan lantai
   * toko. Ia disimpan di sisi server; yang di sini cuma pintunya.
   *
   * Tombolnya berbunyi "Sambungkan & periksa", bukan "Simpan", karena itulah
   * yang sebenarnya terjadi: berkasnya dibuka sungguhan dan isinya dilaporkan.
   * Tombol bernama "Simpan" untuk sesuatu yang juga memeriksa membuat orang
   * mengira diamnya berarti berhasil.
   */
  /* Angka tanpa "Rp" — untuk isi kolom input, yang harus bisa diketik ulang. */
  const rp0 = (n) => new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(Number(n) || 0));
  /* ==================== RINGKASAN GABUNGAN ====================
     Bagian 191. Tiga sumber yang membentuk seluruh usaha, dibaca dari SATU
     angka resmi: Laba Rugi lintas cabang. Layar ini tidak menjumlahkan sendiri
     kartu-kartu di atasnya — jumlah kartu bisa berbeda karena pembulatan, dan
     yang dipercaya orang adalah angka yang paling besar tercetak. */
  const PERIODE_KONS = { id: 'konsPeriodePilih', dari: 'konsPeriode', bulanan: true,
                         nilai: 'bulan', label: 'Periode' };

  async function muatKonsolidasi() {
    const w = $('#isiKonsolidasi');
    if (!w) return;
    if (!$('#konsPeriode')) {
      w.innerHTML = `
        <div class="kartu">
          <div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeKons"></span>
          </div>
          <p class="petunjuk">Tiga sumber yang membentuk seluruh usaha. Angkanya dibaca dari
             Laba Rugi lintas cabang — laporan yang sama persis dengan menu Laporan Keuangan, bukan
             hitungan kedua yang cepat atau lambat akan menyimpang darinya.</p>
        </div>
        <div id="hasilKons"></div>`;
      $('#wadahPeriodeKons').innerHTML = Periode.html(PERIODE_KONS);
      Periode.pasang(PERIODE_KONS, muatHasilKons);
    }
    return muatHasilKons();
  }

  /* TIKET LAYAR RINGKASAN GABUNGAN.

     Dilaporkan pemilik 20 Sep 2026: Laba Rugi dan Neraca Accurate berkata
     "belum ada berkas", TAPI kartu kekayaan gabungan muncul — angka Agustus
     di layar yang sedang menampilkan September.

     Sebabnya bukan datanya. Layar ini menembakkan DUA panggilan, dan yang
     kedua (neraca POS) makan beberapa detik. Pindah periode di tengah itu:

       1. buka Agustus  → permintaan kekayaan Agustus berangkat
       2. pindah September → layar digambar ulang, benar, "belum ada berkas"
       3. jawaban Agustus sampai → ditulis ke layar September

     Yang menang penulis TERAKHIR, bukan yang TERBARU. Dan angka keuangan
     yang berlabel bulan yang salah adalah angka salah yang kelihatan benar.

     Polanya disalin dari muatDashboard (`tiketDash`): tiap pemuatan ambil
     nomor, dan tiap penulisan memeriksa nomornya masih yang terakhir. */
  let tiketKons = 0;

  async function muatHasilKons() {
    const tiket = ++tiketKons;
    memuat('#hasilKons');
    try {
      const d = await API.ringkasanKonsolidasi({ periode: $('#konsPeriode').value });
      if (tiket !== tiketKons) return;   // periodenya sudah diganti
      gambarKons(d, tiket);
    } catch (e) {
      if (tiket !== tiketKons) return;
      galat('#hasilKons', e);
    }
  }

  /* Kartu yang GAGAL harus punya jalan keluar. Tanpa tombol, satu-satunya
     cara mencoba lagi adalah pindah menu lalu kembali — dan orang yang tidak
     tahu jalan pintas itu menyimpulkan layarnya rusak, lalu berhenti memakai
     fiturnya. Ketiga kartu kegagalan di layar ini berarti hal yang sama
     (satu bacaan gagal), jadi tombolnya satu dan sama, bukan tiga penangan.

     body.tunggu sudah mengunci semua <button> selama memuat, jadi tidak ada
     yang perlu ditambahkan supaya tombol ini tidak bisa diklik dua kali. */
  const tombolUlangKons = () =>
    `<button class="tombol kecil" data-ulangkons="1">Coba lagi</button>`;

  /* ANGKA NEGATIF: TANDA DI DEPAN, DAN BERWARNA.

     Mula-mula dipakai kurung akuntansi `(Rp 8.000.000)`. Diputuskan pemilik
     20 Sep 2026: "jangan pakai (8.000.000) tapi -8.000.000 warna merah".
     Alasannya masuk akal — kurung itu konvensi yang harus DIPELAJARI dulu,
     sementara minus merah langsung terbaca siapa pun.

     Merahnya `--bahaya`, warna yang SUDAH dipakai delta turun. Satu warna
     untuk satu arti; merah kedua yang khusus uang cuma menambah kosakata
     yang harus dihafal.

     Minus ditaruh SEBELUM "Rp", bukan di antara Rp dan angkanya. `rp()`
     umum menghasilkan "Rp-9.996.109" — tanda yang terselip di tengah, dan
     justru di baris yang paling perlu dilihat ia paling mudah terlewat.

     HANYA di layar ini. Mengubah `rp()` seluruh aplikasi menyentuh belasan
     pemanggil dan enam berkas uji — pekerjaan tersendiri. */
  /* `rpK` dibuang di v1.215 — aturan minus merah naik ke `rp()` sendiri dan
     berlaku di seluruh aplikasi. Namanya dibiarkan hidup supaya layar ini
     tidak perlu disisir enam kali untuk perubahan yang tidak mengubah apa pun
     yang tergambar.

     PEMBUNGKUS, bukan `const rpK = rp`. Yang kedua membaca `rp` SAAT MUAT,
     dan `rp` tinggal di app.js — panggung uji hanya memuat pos.js, grafik.js
     dan admin.js, jadi seluruh admin.js mati dengan "rp is not defined" dan
     yang terlihat di uji adalah "Admin is not defined" di berkas lain. */
  const rpK = (n) => rp(n);
  /* Nol dipucatkan supaya mata jatuh ke kolom yang BERISI; di matriks lima
     kolom, nol yang setegas angka lain membuat seluruh tabel terbaca rata.
     `null` itu BUKAN nol — ia "tidak ada angkanya", dan digambar em dash. */
  const selK = (n) => (n === null || n === undefined)
    ? '<span class="kosong">—</span>'
    : (Number(n) === 0 ? '<span class="nol">0</span>' : rpK(n));


  const KOLOM_KONS = [
    { kunci: 'pos', judul: 'POS' },
    { kunci: 'pulsa', judul: 'Pulsa' },
    { kunci: 'accurate', judul: 'Accurate' }
  ];

  const jumlahBaris = (b) => (Number(b.pos) || 0) + (Number(b.pulsa) || 0) +
    ((b.accurate === null || b.accurate === undefined) ? 0 : Number(b.accurate));

  function matriksKons(judul, baris, ekor) {
    const kol = KOLOM_KONS;
    const kepala = kol.map(k => `<th class="angka">${esc(k.judul)}</th>`).join('');
    const isi = (baris || []).map((b) => {
      const sel = kol.map(k =>
        `<td class="angka" data-l="${esc(k.judul)}">${selK(b[k.kunci])}</td>`).join('');
      /* Rincian per sumber DALAM sel akunnya. Tersembunyi di layar lebar —
         di sana kolomnya sendiri yang bicara — dan muncul di HP sebagai
         satu baris kecil, menggantikan tiga kolom yang tidak akan muat.
         Digambar SELALU, bukan digambar ulang waktu layarnya berubah:
         yang menentukan lebar itu CSS, dan JS yang ikut menebak lebar
         akan salah tiap kali layarnya diputar. */
      const rinci = kol.map(k =>
        `<span>${esc(k.judul)} ${selK(b[k.kunci])}</span>`).join('');
      return `<tr class="${b.total ? 'subtotal' : ''}">
        <td class="akun">${b.kode ? '<span class="kode">' + esc(b.kode) + '</span> ' : ''}${esc(b.nama)}
          <span class="rinci-sumber">${rinci}</span></td>
        ${sel}<td class="angka gabung" data-l="Gabungan">${selK(jumlahBaris(b))}</td></tr>`;
    }).join('');
    return `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>${esc(judul)}</h3>
        <span class="petunjuk">dalam Rupiah</span>
        <div style="flex:1"></div>${ekor || ''}</div>
      <div class="gulir-x"><table class="matriks-kons">
        <thead><tr><th class="akun">Akun</th>${kepala}
          <th class="angka gabung">Gabungan</th></tr></thead>
        <tbody>${isi}</tbody></table></div></div>`;
  }

  /* Muatan TERAKHIR disimpan supaya menukar tampilan tidak memanggil
     server lagi: yang berubah cuma kolom mana yang digambar, dan datanya
     sudah ada di tangan. Memanggil ulang untuk itu berarti menunggu empat
     detik demi menyembunyikan tiga kolom. */
  let dataKons = null;

  function gambarKons(d, tiket) {
    const w = $('#hasilKons');
    if (!w) return;
    dataKons = d;
    const acc = (d.sumber || []).filter(s => s.kode === 'ACCURATE')[0] || {};

    /* Bacaan yang GAGAL tidak boleh tergambar sebagai "belum ada": yang hilang
       bukan nol, melainkan tidak diketahui. Ketiga kartu kegagalan tetap ada,
       lengkap dengan jalan keluarnya. */
    const bannerPulsa = d.pulsa_gagal ? `<div class="kartu"><p class="pesan galat">
       <strong>Bagian pulsa tidak digambar</strong> karena datanya tidak bisa dibaca:
       ${esc(d.pulsa_gagal)}. Angka POS di bawah karena itu masih memuat pulsa di dalamnya —
       yang hilang bukan nol, melainkan tidak diketahui.</p>
       <p>${tombolUlangKons()}</p></div>` : '';
    const bannerAcc = acc.gagal ? `<div class="kartu"><p class="pesan galat">
       <strong>Accurate tidak bisa dibaca</strong>: ${esc(acc.gagal)}.
       Angka Accurate TIDAK ikut dijumlahkan.</p>
       <p>${tombolUlangKons()}</p></div>` : '';

    const t = d.pertumbuhan || {};
    const arah = (x) => {
      if (!x || x.persen === null || x.persen === undefined) {
        return '<span class="petunjuk">tanpa pembanding</span>';
      }
      const naik = x.persen >= 0;
      return `<span class="delta ${naik ? 'naik' : 'turun'}">${naik ? '▲' : '▼'} ${
        Math.abs(x.persen).toLocaleString('id-ID')} %</span>`;
    };
    /* Bentuknya `.mini`, sama dengan miniKons() — BUKAN `.statistik` mentah.
       `.statistik` tidak menumpuk anaknya, jadi labelnya berdempet dengan
       angkanya ("Margin laba kotor24,4 %"). Ekornya tidak di-esc karena ia
       memang HTML (panah naik/turun); labelnya tetap di-esc. */
    const miniHtml = (label, nilai, ekor) =>
      `<div class="mini"><div class="mini-kepala"><div class="mini-label">${esc(label)}</div></div>` +
      `<div class="mini-nilai">${nilai}</div><div class="mini-ekor">${ekor}</div></div>`;
    const kotakTumbuh = (label, x) => miniHtml(label, rpK(x ? x.kini : 0),
      `${arah(x)} dari ${esc(t.periode || 'periode sebelumnya')}`);

    /* SATU cakupan untuk kepala DAN rasio. Sebelum bagian 205 kepala memakai
       angka gabungan sementara rasio memakai buku POS — dua "pendapatan"
       berbeda di satu layar, dan tidak ada apa pun yang memberi tahu
       pembacanya. Sekarang keduanya membaca bungkus yang sama, dan cakupannya
       ditulis di bawah tiap deretan.

       Jatuh ke buku POS kalau servernya lama dan belum mengirim `gabungan`:
       angka yang benar dengan keterangan yang benar, bukan layar kosong. */
    const gab = d.gabungan || {
      dengan_accurate: false,
      penjualan: d.penjualan_bersih, laba_kotor: d.laba_kotor,
      beban_operasional: d.beban_operasional, laba_bersih: d.laba_bersih
    };
    const lingkup = (b) => b ? 'gabungan — POS + Pulsa + Accurate' : 'buku POS + Pulsa saja';
    const bersih = gab.penjualan || 0;
    const pst = (a, b) => b ? (Math.round(a / b * 1000) / 10).toLocaleString('id-ID') + ' %' : '—';
    const rasio = (label, nilai, ekor) => miniHtml(label, esc(nilai), esc(ekor || ''));


    /* Seimbang atau tidak DIPAJANG, tidak disembunyikan. Neraca yang tidak
       seimbang adalah satu-satunya hal di layar ini yang harus berteriak. */
    const ner = (d.matriks && d.matriks.neraca) || [];
    const cariT = (nama) => (ner.filter(b => b.nama === nama)[0] || {});
    const tA = cariT('Total Aset'), tL = cariT('Total Liabilitas'), tE = cariT('Total Ekuitas');
    const selisih = Math.round(jumlahBaris(tA) - jumlahBaris(tL) - jumlahBaris(tE));
    const lencanaNer = Math.abs(selisih) < 1
      ? lencanaDash('Seimbang', 'hijau')
      : `<span class="lencana merah">Selisih ${rpK(selisih)}</span>`;

    const kb = d.komposisi_beban || [];
    const totalKb = kb.reduce((a, x) => a + x.jumlah, 0);
    const shiftPulsa = ((d.sumber || []).filter(x => x.kode === 'PULSA')[0] || {}).shift;

    w.innerHTML = `
      ${bannerPulsa}${bannerAcc}
      <div class="kepala-kons">
        <div class="utama">
          <div class="label">Laba bersih</div>
          <div class="besar">${rpK(gab.laba_bersih)}</div>
          <div class="sub">Periode ${esc(d.periode)} · ${esc(lingkup(gab.dengan_accurate))}</div>
        </div>
        <div class="kotak"><div class="label">Pendapatan</div>
          <div class="nilai">${rpK(gab.penjualan)}</div></div>
        <div class="kotak"><div class="label">Total aset</div>
          <div class="nilai">${selK(jumlahBaris(tA))}</div></div>
        <div class="pita-kons">${(d.sumber || []).map((sb) => {
          const nilai = sb.gagal ? '?'
            : (sb.belum_tersambung ? '—'
              : rpK((sb.laba === null || sb.laba === undefined) ? 0 : sb.laba));
          /* DARI MANA angkanya, bukan cuma berapa. Yang dijurnal dan yang
             dibaca dari berkas punya tingkat keyakinan berbeda, dan yang
             membacanya berhak tahu yang mana. */
          const tanda = sb.dari_berkas ? lencanaDash('Dari berkas', 'hijau')
            : (sb.terjurnal ? lencanaDash('Terjurnal', 'hijau') : '');
          return `<span><i data-sumber="${esc(sb.kode)}"></i>${esc(sb.nama)}
            <b>${nilai}</b>${tanda}</span>`;
        }).join('')}</div>
      </div>

      ${t.gagal ? `<div class="kartu"><p class="pesan peringatan">Pertumbuhan tidak
         digambar: ${esc(t.gagal)}. Angka periode ini tetap benar.</p></div>` : `
      <div class="petak-mini petak-uang">
        ${kotakTumbuh('Pendapatan', t.pendapatan)}
        ${kotakTumbuh('Laba kotor', t.laba_kotor)}
        ${kotakTumbuh('Laba bersih', t.laba_bersih)}
        ${kotakTumbuh('Total beban', t.beban)}
      </div>
      <p class="petunjuk lingkup-kons">Pertumbuhan dihitung dari
         <strong>${esc(lingkup(t.dengan_accurate))}</strong>${
           t.dengan_accurate ? '' :
           /* BULANNYA disebut, bukan "salah satu dari keduanya". Yang membaca
              ini sedang memutuskan berkas mana yang perlu diunggah, dan
              keterangan yang tidak menyebut bulannya memaksa dia memeriksa
              dua bulan satu per satu untuk tahu. */
           ' — Accurate tidak ikut karena ' + ((t.acc_kurang || []).length
               ? esc((t.acc_kurang || []).map(bulanTeks).join(' dan ')) + ' belum punya berkasnya'
               : 'salah satu bulannya belum punya berkas') +
             ', dan membandingkan bulan yang ber-Accurate dengan yang tidak akan melonjak tanpa ada yang berubah di toko'
         }.</p>`}

      <div class="petak-mini petak-kpi">
        ${rasio('Margin laba kotor', pst(gab.laba_kotor, bersih), 'dari pendapatan')}
        ${rasio('Margin laba bersih', pst(gab.laba_bersih, bersih), 'dari pendapatan')}
        ${rasio('Beban thd pendapatan', pst(gab.beban_operasional, bersih), 'dari pendapatan')}
        ${rasio('Shift pulsa', shiftPulsa === undefined ? '—' : String(shiftPulsa), 'sudah ditutup')}
      </div>
      <p class="petunjuk lingkup-kons">Rasio di atas dihitung dari
         <strong>${esc(lingkup(gab.dengan_accurate))}</strong>.</p>

      ${kartuLikuid(d.likuiditas)}

      ${matriksKons('Laba Rugi', d.matriks && d.matriks.lr)}
      ${matriksKons('Neraca', ner, lencanaNer)}

      <div class="kartu laporan-uang">
        <div class="bar-alat"><h3>Komposisi beban</h3>
          <span class="satuan-uang">dalam Rupiah</span></div>
        <div class="gulir-x"><table class="matriks-kons"><thead><tr>
          <th class="akun">Akun</th><th class="angka">Nominal</th>
          <th class="angka gabung">Porsi</th></tr></thead><tbody>
          ${kb.length ? kb.map(x => `<tr><td class="akun">
            <span class="kode">${esc(x.kode)}</span> ${esc(x.nama)}</td>
            <td class="angka">${selK(x.jumlah)}</td>
            <td class="angka gabung">${x.persen.toLocaleString('id-ID')} %</td></tr>`).join('')
            : '<tr><td colspan="3" class="petunjuk">Belum ada beban di periode ini.</td></tr>'}
          ${kb.length ? `<tr class="subtotal"><td class="akun">Total beban</td>
            <td class="angka">${selK(totalKb)}</td>
            <td class="angka gabung">100 %</td></tr>` : ''}
        </tbody></table></div></div>

      <div class="kartu">
        <h3>Neraca Accurate</h3>
        ${d.accurate_neraca_gagal ? `
          <p class="pesan galat">Neraca yang tersimpan <strong>tidak bisa
             dibaca</strong>: ${esc(d.accurate_neraca_gagal)}. Layar ini sengaja
             tidak bilang "belum ada berkas" — yang hilang bukan nol, melainkan
             tidak diketahui.</p>
          <p>${tombolUlangKons()}</p>
        ` : d.accurate_neraca ? `
          <div class="petak-mini petak-uang">
            ${miniKons('Aset', rpAtau(d.accurate_neraca.aset), 'jumlah aset')}
            ${miniKons('Liabilitas', rpAtau(d.accurate_neraca.kewajiban), 'jumlah kewajiban')}
            ${miniKons('Ekuitas', rpAtau(d.accurate_neraca.ekuitas), 'jumlah ekuitas')}
          </div>
          ${d.accurate_neraca.seimbang === false
            ? `<p class="pesan galat"><strong>Neraca ini tidak seimbang.</strong>
               Aset tidak sama dengan liabilitas ditambah ekuitas. Berkasnya lolos
               waktu diunggah, jadi barisnya kemungkinan berubah sesudah itu —
               unggah ulang ekspornya sebelum angka ini dipakai.</p>`
            : d.accurate_neraca.seimbang === null
              ? `<p class="pesan peringatan">Keseimbangannya <strong>tidak bisa
                 diperiksa</strong>: salah satu baris totalnya tidak ketemu di berkas.
                 Itu bukan berarti seimbang.</p>`
              : `<p class="pesan sukses">Seimbang: aset = liabilitas + ekuitas.</p>`}
          <p class="petunjuk">${esc(d.accurate_neraca.berkas || '')} ·
             ${esc(waktuTampil(d.accurate_neraca.diunggah))}</p>
        ` : `
          <p class="petunjuk">Belum ada berkas neraca untuk periode ini. Unggahnya
             di <strong>menu Accurate</strong>. Laba rugi menjawab berapa yang
             dihasilkan; neraca menjawab apa yang dimiliki dan dihutangi — dan hanya
             neraca yang bisa membuktikan pembukuannya utuh.</p>`}
      </div>

      <div id="kekayaanKons"></div>

      <p class="petunjuk">Gabungan = penjumlahan langsung ketiga sumber, tanpa
         eliminasi. POS dan Pulsa dihitung dari jurnal yang SAMA — yang membedakan
         kolomnya cuma kode akunnya (${esc((d.akun_pulsa || []).join(', '))}). Akun
         yang dipakai bersama tetap masuk kolom POS, karena jurnalnya memang tidak
         memisahkannya. Accurate punya bagan akunnya sendiri, jadi kolomnya hanya
         terisi di baris total — rinciannya ada di menu Accurate.</p>`;

    /* Tidak ditunggu: rapornya sudah tergambar, dan baris ini butuh beberapa
       detik. Menunggunya berarti layar kosong selama itu — tapi karena tidak
       ditunggu, ia WAJIB membawa tiketnya. */
    muatKekayaan(d.accurate_neraca, tiket);
  }

  /* Neraca POS diukur 28 detik lewat POS sungguhan (19 Sep 2026): ia memanggil
     ULANG laba rugi untuk SETIAP bulan sejak Januari. Menyatukannya dengan
     ringkasan konsolidasi (5 dtk) berarti 34 detik — lewat dari batas 30 detik
     _sekali(), dan seluruh layar mati gara-gara satu baris tambahan. Karena itu
     ia panggilan kedua yang menyusul, bukan bagian dari yang pertama. */
  async function muatKekayaan(nerAcc, tiket) {
    const w = $('#kekayaanKons');
    if (!w) return;
    /* Tiket yang tidak diberikan dianggap yang berlaku sekarang — pemanggil
       lama tidak boleh diam-diam berhenti bekerja. */
    if (tiket === undefined) tiket = tiketKons;
    if (tiket !== tiketKons) return;
    /* Tanpa neraca Accurate tidak ada yang digabungkan. Ini BUKAN kegagalan,
       jadi tidak ada yang perlu dikatakan — kartunya memang tidak ada. */
    if (!nerAcc || nerAcc.aset === null || nerAcc.kewajiban === null ||
        nerAcc.ekuitas === null) { w.innerHTML = ''; return; }
    w.innerHTML = `<div class="kartu"><h3>Kekayaan usaha gabungan</h3>
      <p class="petunjuk">Menghitung… neraca POS butuh sekitar setengah menit,
         jadi angka di atas sengaja tidak menunggunya.</p></div>`;
    try {
      const n = await API.neraca({ periode: $('#konsPeriode').value, cabang: '*' });
      if (tiket !== tiketKons) return;   // periodenya sudah diganti
      gambarKekayaan(nerAcc, n);
    } catch (e) {
      if (tiket !== tiketKons) return;
      /* Neraca POS yang gagal ditarik TIDAK boleh jadi "kekayaannya sebesar
         Accurate saja". Separuh angka bukan angka. */
      w.innerHTML = `<div class="kartu"><h3>Kekayaan usaha gabungan</h3>
        <p class="pesan galat">Neraca POS tidak bisa dibaca: ${esc(e.message)}.
           Gabungannya sengaja TIDAK dihitung — yang hilang bukan nol,
           melainkan tidak diketahui.</p></div>`;
    }
  }

  function gambarKekayaan(a, n) {
    const w = $('#kekayaanKons');
    if (!w) return;
    w.innerHTML = `<div class="kartu">
      <h3>Kekayaan usaha gabungan</h3>
      <div class="petak-mini petak-uang">
        ${miniKons('Aset', rp(n.total_aset + a.aset), 'POS + Accurate')}
        ${miniKons('Liabilitas', rp(n.total_liabilitas + a.kewajiban), 'POS + Accurate')}
        ${miniKons('Ekuitas', rp(n.total_ekuitas + a.ekuitas), 'POS + Accurate')}
      </div>
      <p class="petunjuk">Aset POS ${rp(n.total_aset)} + Accurate ${rp(a.aset)}.
         <strong>Penjumlahan ini sah karena tidak ada aset yang tercatat di dua
         buku</strong> — rekening, kas, dan persediaannya terpisah, ditegaskan
         pemilik 19 Sep 2026. Kalau suatu hari beririsan, baris inilah yang
         pertama harus dicabut. Laba rugi menjawab untung atau tidak; baris ini
         menjawab sehat atau tidak, dan keduanya bisa berlawanan.</p>
    </div>`;
  }


  /* rp(null) memulangkan "Rp 0". Baris total yang TIDAK KETEMU di berkas
     karena itu terbaca sebagai aset nol — nol yang dikarang, dan yang paling
     berbahaya justru karena bentuknya wajar. */
  const rpAtau = (n) => (n === null || n === undefined) ? '—' : rp(n);

  /* SATU kolom berkas untuk dua tombol, jenisnya dititipkan di elemennya.
     Dua kolom dengan dua id pernah dipakai dan bekerja, tapi berarti dua
     penangan, dua id, dan dua tempat yang bisa lupa diperbarui. */
  const tombolUnggahAcc = (jenis, label) =>
    `<button class="tombol kecil" data-unggahacc="${jenis}">${esc(label || ('Unggah ' + (jenis === 'NERACA' ? 'Neraca' : 'Laba Rugi')))}</button>`;

  /* Berkas dikirim base64 TELANJANG, tanpa awalan "data:…;base64,". Awalan
     yang ikut terkirim membuat Utilities.base64Decode melempar, dan galatnya
     tidak menyebut sebabnya sama sekali. */
  function berkasKeBase64(file) {
    return new Promise((selesai, gagalkan) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result); selesai(s.slice(s.indexOf(',') + 1)); };
      r.onerror = () => gagalkan(new Error('Berkas tidak bisa dibaca.'));
      r.readAsDataURL(file);
    });
  }

  /* `accTertunda` dideklarasikan di dekat tutupModal() — isinya berkas yang
     sedang dipratinjau, DISIMPAN di sana dan bukan dibaca ulang dari kolom
     berkasnya: `input.value` sudah dikosongkan supaya berkas yang sama bisa
     dipilih lagi, dan membacanya ulang berarti Simpan bisa mengirim berkas
     yang BERBEDA dari yang barusan dilihat orangnya. */
  const BARIS_PRATINJAU_ACC = {
    LR: [['penjualan', 'Penjualan'], ['hpp', 'Beban pokok'],
         ['laba_kotor', 'Laba kotor'], ['beban', 'Beban operasional'],
         ['laba_usaha', 'Laba usaha'], ['laba_bersih', 'Laba bersih']],
    NERACA: [['aset', 'Aset'], ['kewajiban', 'Liabilitas'], ['ekuitas', 'Ekuitas']]
  };

  /**
   * Langkah SATU: baca dan periksa, jangan simpan apa pun.

   * Diminta pemilik 19 Sep 2026 sesudah mengunggah dua berkas dan tidak tahu
   * apa yang masuk. Servernya memang sudah mengerjakan seluruh pemeriksaan
   * sebelum menulis, jadi pratinjau ini jalur yang SAMA — dihentikan lebih
   * awal, bukan jalur kedua yang harus dijaga tetap sama.
   */
  async function kirimBerkasAcc(input, jenis) {
    const f = input.files && input.files[0];
    if (!f) return;
    input.value = '';
    accTertunda = null;
    try {
      toast('Membaca dan memeriksa berkas…');
      const kirim = {
        jenis: jenis, periode: $('#accPeriode').value,
        nama_berkas: f.name, data: await berkasKeBase64(f)
      };
      const h = await API.unggahAccurate(Object.assign({ pratinjau: true }, kirim));
      accTertunda = kirim;
      gambarPratinjauAcc(h);
    } catch (e) { accTertunda = null; toast(e.message, 'galat'); }
  }

  function gambarPratinjauAcc(h) {
    const k = h.kepala || {}, r = h.ringkas || {};
    const jn = h.jenis === 'NERACA' ? 'Neraca' : 'Laba Rugi';

    /* Angka yang tidak ketemu barisnya digambar "—", bukan Rp 0. Nol yang
       dikarang di layar pratinjau adalah nol yang disetujui orangnya. */
    const angka = (BARIS_PRATINJAU_ACC[h.jenis] || []).map(([kunci, label]) =>
      `<tr><td>${esc(label)}</td><td class="angka">${rpAtau(r[kunci])}</td></tr>`)
      .join('');

    /* lencanaDash(), bukan <span class="lencana …"> tulisan tangan: warna
       lencana sudah punya satu tempat, dan menyalinnya berarti satu tempat
       lagi yang lupa ikut berubah. */
    const cek = (h.periksa || []).map((x) => {
      const warna = x.status === 'COCOK' ? 'hijau'
                  : x.status === 'BEDA' ? 'merah' : 'kuning';
      const kata = x.status === 'COCOK' ? 'cocok'
                 : x.status === 'BEDA' ? 'BEDA' : 'tidak bisa diperiksa';
      return `<li>${esc(x.nama)} ${lencanaDash(kata, warna)}</li>`;
    }).join('');

    const isi = `
      <table>
        <tr><td>Berkas</td><td><strong>${esc(accTertunda.nama_berkas)}</strong></td></tr>
        <tr><td>Jenis</td><td>${esc(k.judul || jn)}</td></tr>
        <tr><td>Usaha</td><td>${esc(k.usaha) || '<span class="petunjuk">tidak terbaca</span>'}</td></tr>
        <tr><td>Periode di berkas</td><td>${esc(k.periode) || '<span class="petunjuk">tidak terbaca</span>'}</td></tr>
        <tr><td>Disimpan ke bulan</td><td><strong>${esc(h.periode)}</strong></td></tr>
        <tr><td>Jumlah baris</td><td>${h.jumlah_baris}</td></tr>
      </table>
      <h4>Angkanya</h4>
      <table>${angka}</table>
      <h4>Pemeriksaan</h4>
      <ul>${cek}</ul>
      ${h.periode_terperiksa === false ? `<p class="pesan peringatan">Bulan di berkasnya
         <strong>tidak terbaca</strong>, jadi kecocokannya dengan bulan yang dipilih
         tidak bisa diperiksa. Pastikan sendiri sebelum menyimpan.</p>` : ''}
      ${h.menggantikan && h.menggantikan.gagal
        ? `<p class="pesan peringatan">Tidak bisa dipastikan apakah bulan ini sudah
           punya berkas: ${esc(h.menggantikan.gagal)}.</p>`
        : h.menggantikan
          ? `<p class="pesan peringatan">Ini <strong>menggantikan</strong>
             ${esc(h.menggantikan.berkas)} yang diunggah
             ${esc(waktuTampil(h.menggantikan.diunggah))}. Yang lama tidak dihapus,
             cuma tidak dipakai lagi.</p>`
          : ''}
      <p class="petunjuk">Belum ada yang disimpan. Tekan <strong>Simpan</strong>
         kalau isinya benar.</p>`;

    bukaModal('Periksa dulu — belum disimpan', isi,
      '<button class="tombol utama" data-simpanacc="1">Simpan</button>' +
      '<button class="tombol" data-tutup="1">Batal</button>');
  }

  /**
   * Buka satu foto buku catatan di pop-up.
   *
   * Gambarnya datang sebagai base64 dari server, bukan dari tautan Drive:
   * foldernya tidak dibagikan, jadi tautan Drive cuma terbuka bagi yang
   * kebetulan punya akses ke Drive pemilik. Lewat server, siapa pun yang
   * izin POS-nya membolehkan melihat pulsa bisa membukanya.
   */
  async function bukaFotoPulsa(fileId) {
    try {
      toast('Mengambil foto…');
      const f = await API.fotoPulsa({ file_id: fileId });
      bukaModal(f.nama_file || 'Foto buku catatan',
        `<img src="data:${esc(f.mime || 'image/jpeg')};base64,${esc(f.data)}"
              alt="${esc(f.nama_file)}"
              style="max-width:100%;height:auto;border-radius:8px;display:block">`);
    } catch (e) { toast(e.message, 'galat'); }
  }

  /** Langkah DUA: berkas yang SAMA dikirim lagi, kali ini untuk disimpan. */
  async function simpanBerkasAcc() {
    if (!accTertunda) return;
    const kirim = accTertunda;
    accTertunda = null;
    tutupModal();
    try {
      toast('Menyimpan…');
      const h = await API.unggahAccurate(kirim);
      await muatHasilAcc();
      const tak = (h.periksa || []).filter(x => x.status === 'TAK_TERPERIKSA');
      /* Pemeriksaan yang TIDAK BISA dijalankan disebut, bukan didiamkan: nol
         pemeriksaan yang gagal terlihat persis sama dengan nol yang lolos. */
      const jn = kirim.jenis === 'NERACA' ? 'Neraca' : 'Laba rugi';
      const pesan = tak.length
        ? (jn + ' tersimpan, tapi ' + tak.length + ' pemeriksaan tidak bisa dijalankan — baris totalnya tidak ketemu.')
        : (jn + ' tersimpan. ' + h.jumlah_baris + ' baris, angkanya menjumlah.');
      toast(h.periode_terperiksa === false
        ? (pesan + ' Bulan di berkasnya tidak terbaca, jadi kecocokan periodenya TIDAK diperiksa.')
        : pesan);
    } catch (e) { toast(e.message, 'galat'); }
  }

  /* ==================== MENU ACCURATE — SATU PINTU ====================
     Diminta pemilik 19 Sep 2026: "tools yang berkaitan dengan accurate
     dipisah dengan menu tersendiri, ringkasan gabungan murni rapor".
     Aturan yang sama dengan menu Pulsa (bagian 190): satu urusan, satu menu.

     Layar ini yang MENERIMA; layar Ringkasan yang MELAPORKAN. Tidak ada
     tombol unggah di luar sini. */
  const PERIODE_ACC = { id: 'accPeriodePilih', dari: 'accPeriode', bulanan: true,
                        nilai: 'bulan', label: 'Periode' };

  const RINGKAS_ACC = {
    LR: [['penjualan', 'Penjualan'], ['hpp', 'Beban pokok'], ['laba_kotor', 'Laba kotor'],
         ['beban', 'Beban operasional'], ['laba_bersih', 'Laba bersih']],
    NERACA: [['aset', 'Aset'], ['kewajiban', 'Liabilitas'], ['ekuitas', 'Ekuitas']]
  };
  const JUDUL_ACC = { LR: 'Laba Rugi', NERACA: 'Neraca' };

  async function muatAccurate() {
    const w = $('#isiAccurate');
    if (!w) return;
    if (!$('#accPeriode')) {
      w.innerHTML = `
        <div class="kartu">
          <div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeAcc"></span>
          </div>
          <p class="petunjuk">Unggah hasil ekspor <strong>Excel</strong> Laba Rugi dan
             Neraca dari Accurate, satu kali tiap bulan. Angkanya dipakai menu
             <strong>Ringkasan Gabungan</strong> — layar itu sengaja tidak punya tombol
             apa pun, karena rapor tidak menerima masukan.</p>
          <input type="file" accept=".xlsx" id="fileAcc" class="sembunyi">
        </div>
        <div id="hasilAcc"></div>`;
      $('#wadahPeriodeAcc').innerHTML = Periode.html(PERIODE_ACC);
      Periode.pasang(PERIODE_ACC, muatHasilAcc);
      const inp = $('#fileAcc');
      if (inp) inp.addEventListener('change', () => kirimBerkasAcc(inp, inp._jenis));
    }
    return muatHasilAcc();
  }

  async function muatHasilAcc() {
    memuat('#hasilAcc');
    try {
      const d = await API.accuratePeriode({ periode: $('#accPeriode').value });
      gambarAcc(d);
    } catch (e) { galat('#hasilAcc', e); }
  }

  function gambarAcc(d) {
    const w = $('#hasilAcc');
    if (!w) return;
    const lap = d.laporan || {};
    w.innerHTML = kartuRiwayatAcc(d.riwayat, d.periode) +
                  ['LR', 'NERACA'].map((j) => kartuAcc(j, lap[j])).join('');
  }

  /**
   * Keadaan berkas beberapa bulan terakhir, dalam satu pandangan.
   *
   * Layar ini menampilkan SATU periode, jadi sampai v1.215 satu-satunya cara
   * tahu Agustus sudah lengkap adalah mengganti dropdownnya dan melihat. Yang
   * hanya bisa diketahui dengan mencoba satu per satu akan salah diingat —
   * 20 Sep 2026 saya sendiri menulis "Agustus belum diunggah" di daftar hal
   * tertunda, padahal berkasnya sudah ada sejak semalam sebelumnya.
   *
   * Bulan berjalan DITANDAI, bukan dianggap kurang: bulannya belum habis, dan
   * ekspor Accurate yang final memang belum bisa dibuat. Menandainya merah
   * akan menyuruh orang mengerjakan yang belum waktunya.
   */
  function kartuRiwayatAcc(riwayat, periodeKini) {
    if (!Array.isArray(riwayat) || !riwayat.length) return '';
    const kini = String(periodeKini || '');
    const sel = (ada, berjalan) => ada ? '<span class="lencana hijau">ada</span>'
      : (berjalan ? '<span class="lencana abu">belum waktunya</span>'
                  : '<span class="lencana merah">belum</span>');
    return `<div class="kartu">
      <h3>Keadaan berkas</h3>
      <div class="gulir-x">
        <table class="tabel">
          <thead><tr><th>Bulan</th><th>Laba Rugi</th><th>Neraca</th>
            <th>Terakhir diunggah</th></tr></thead>
          <tbody>${riwayat.map((r) => {
            const berjalan = r.periode === BULAN_BERJALAN();
            const lr = (r.ada || []).indexOf('LR') !== -1;
            const nr = (r.ada || []).indexOf('NERACA') !== -1;
            const waktu = [(r.berkas || {}).LR, (r.berkas || {}).NERACA]
              .filter(Boolean).map((x) => String(x.diunggah)).sort().pop();
            return `<tr>
              <td data-l="Bulan">${esc(bulanTeks(r.periode))}${
                r.periode === kini ? ' <span class="lencana">dilihat</span>' : ''}</td>
              <td data-l="Laba Rugi">${sel(lr, berjalan)}</td>
              <td data-l="Neraca">${sel(nr, berjalan)}</td>
              <td data-l="Terakhir diunggah">${waktu ? esc(waktuTampil(waktu)) : '—'}</td>
            </tr>`; }).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* Bulan berjalan menurut PERANGKAT. Dipakai hanya untuk melunakkan lencana
     bulan yang belum habis; kalau jam perangkatnya meleset, yang terjadi
     paling buruk satu lencana abu yang seharusnya merah. */
  const BULAN_BERJALAN = () => tanggalLokal().substring(0, 7);

  function kartuAcc(jenis, lap) {
    const judul = JUDUL_ACC[jenis];
    if (!lap) {
      return `<div class="kartu">
        <h3>${esc(judul)}</h3>
        <p class="petunjuk">Belum ada berkas ${esc(judul)} untuk periode ini.</p>
        <div class="aksi">${tombolUnggahAcc(jenis)}</div>
      </div>`;
    }
    const baris = lap.baris || [];
    return `<div class="kartu">
      <h3>${esc(judul)} <span class="sub">${esc(lap.periode_teks || '')}</span></h3>
      <div class="petak-mini petak-uang">
        ${RINGKAS_ACC[jenis].map(([k, l]) =>
          miniKons(l, rpAtau(lap.ringkas ? lap.ringkas[k] : null), 'dari berkas')).join('')}
      </div>
      <p class="petunjuk">${esc(lap.nama_berkas)} · ${esc(waktuTampil(lap.diunggah))} ·
         oleh ${esc(lap.oleh)} · ${baris.length} baris · ${esc(lap.usaha || '')}</p>
      <div class="aksi">
        ${tombolUnggahAcc(jenis, 'Ganti berkas')}
        <button class="tombol kecil" data-rinciacc="${jenis}">Lihat rinciannya</button>
      </div>
      <div id="rinci${jenis}" hidden>
        <div class="gulir-x">
          <table class="tabel">
            <thead><tr><th>Keterangan</th><th class="kanan">Nilai</th></tr></thead>
            <tbody>${baris.map((x) => `<tr>
              <td data-l="Keterangan" class="acc-lv${Math.min(x.level || 0, 4)}">${esc(x.deskripsi)}</td>
              <td class="kanan" data-l="Nilai">${x.nilai === null ? '' : rp(x.nilai)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

/* "2026-08" → "Agu 2026". Dipakai keterangan cakupan dan daftar keadaan
   berkas Accurate. Bulan dalam angka memaksa yang membacanya menghitung
   sendiri, dan '2026-08' di tengah kalimat terbaca seperti kode. */
  const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                         'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const bulanTeks = (p) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(p || ''));
    if (!m) return String(p || '');
    return (BULAN_SINGKAT[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
  };

  /**
   * Kartu Kas & likuiditas.
   *
   * TIDAK DIGAMBAR kalau blok likuiditasnya tidak datang. Menggambar nol
   * untuk data yang gagal ditarik adalah kebohongan yang bentuknya
   * meyakinkan — himpunan kosong dari panggilan yang gagal membalik
   * kesimpulan, bukan mengosongkannya.
   *
   * Saldo kas negatif TIDAK dipajang sebagai angka merah lalu dibiarkan.
   * Uang tunai tidak punya nilai negatif, jadi angka itu bukan kabar buruk
   * tentang toko — ia kabar bahwa ada PEMASUKAN yang belum tercatat. Kartu
   * yang cuma memerahkannya membuat orang mencari pengeluaran yang salah,
   * yaitu tempat yang salah.
   */
  function kartuLikuid(lk) {
    if (!lk || !Array.isArray(lk.akun) || !lk.akun.length) return '';
    const kotak = lk.akun.map((a) => miniKons(a.nama, rp(a.jumlah), a.kode))
      .concat([
        miniKons(lk.deposit_nama || 'Deposit pulsa', rp(lk.deposit_pulsa), 'di aplikasi pulsa'),
        miniKons(lk.piutang_nama || 'Piutang usaha', rp(lk.piutang), 'belum tertagih'),
        miniKons(lk.utang_nama || 'Utang usaha', rp(lk.utang), 'belum dibayar')
      ]).join('');
    const minus = (lk.negatif || []).length
      ? `<p class="pesan peringatan"><strong>Saldo kas di bawah nol.</strong>
         Uang tunai tidak bisa kurang dari nol, jadi yang hilang bukan
         pengeluaran yang kelebihan melainkan <strong>pemasukan yang belum
         tercatat</strong> — setoran modal, pembelian yang sebenarnya kredit,
         atau uang dari rekening di luar buku. Catat lewat menu
         <strong>Kas</strong> (pilih <em>di luar laci</em> untuk uang yang tidak
         lewat laci toko), lalu periksa lagi di Uji Kebenaran.</p>`
      : '';
    return `<div class="kartu">
      <h3>Kas &amp; likuiditas</h3>
      <div class="petak-mini petak-uang">${kotak}</div>
      <p class="petunjuk">Kas &amp; setara ${rp(lk.kas_setara)} · ditambah deposit dan
         piutang, dikurangi utang → <strong>posisi likuid ${rp(lk.posisi)}</strong>.
         Semuanya dibaca dari buku besar yang sudah dijurnal, bukan dihitung ulang.</p>
      ${minus}
    </div>`;
  }

  const miniKons = (label, nilai, ekor) =>
    `<div class="mini"><div class="mini-kepala"><div class="mini-label">${esc(label)}</div></div>` +
    `<div class="mini-nilai">${nilai}</div><div class="mini-ekor">${esc(ekor)}</div></div>`;

  /* ==================== MENU PULSA — SATU PINTU ====================
     Diminta pemilik 18 Sep 2026: "pulsa ya semua terkait dengan pulsa kumpul
     disatu menu", jangan terpecah-pecah. Shift, master sumber saldo, dan
     laporannya karena itu tinggal di SATU layar dengan tab.

     Tabnya menampilkan-menyembunyikan wadah yang masing-masing sudah punya
     pemuatnya sendiri — bukan membongkar penggambarnya jadi satu fungsi
     raksasa. Yang dipindah cuma pintunya.

     TOMBOLNYA berbunyi "Mulai hitungan" dan "Kunci hitungan", bukan "Buka shift"
     dan "Tutup shift" (19 Sep 2026, diputuskan pemilik). Sebabnya dari lapangan:
     petugas cuma login, input, lalu logout — kata "buka/tutup shift" di TOMBOL
     menjanjikan kedisiplinan jam kerja yang tidak pernah diminta.

     Yang diganti HANYA kedua tombol itu, diputuskan pemilik sesudah melihat
     hasil penggantian yang lebih luas. Judul, tab, kolom tabel, pesan server,
     dan nama kolom database tetap memakai kata shift — itu kosakata yang sudah
     dikenal, dan menggantinya di mana-mana menukar satu kebingungan dengan
     kebingungan lain. Tombol adalah tempat orang MEMUTUSKAN, jadi di situlah
     kalimatnya harus paling tidak menyesatkan. */
  const TAB_PULSA = [
    ['shift', 'Shift'],
    ['sumber', 'Sumber Saldo'],
    ['laporan', 'Laporan'],
    /* Paling ujung — keputusan pemilik 23 Sep 2026 (bagian 243). */
    ['saldo', 'Saldo']
  ];

  /* ==================== MATRIKS PULSA (bagian 253) ====================
     Kartu paling atas menu Pulsa, hanya pemegang laporan_pulsa (Owner & Head
     Admin). Dimuat saat layar Pulsa DIBUKA, bukan tiap pindah tab. Sejak bagian 256
     berbentuk STRIP kotak per cabang + Total; rinciannya terbuka saat diklik. */
  const PERIODE_MATPULSA = { id: 'matpulsaPeriodePilih', dari: 'matpulsaBulan', bulanan: true,
                             nilai: 'bulan', label: '', judul: 'Periode' };
  /* Tanpa label: dropdown-nya sebaris dengan judul, strip tidak kehilangan satu
     baris (bagian 256). */
  /* Cabang yang rinciannya sedang terbuka di strip (bagian 256); '' = tertutup. */
  let cabMatpulsa = '';

  async function muatMatrikspulsa() {
    const w = $('#isiMatrikspulsa');
    if (!w) return;
    if (!bolehIzin('laporan_pulsa', 'lihat')) { w.innerHTML = ''; return; }
    if (!$('#matpulsaBulan')) {
      /* STRIP, bukan tabel (bagian 256, pemilik: "kurang interaktif, terlalu
         besar sehingga menenggelamkan layar utama"). Satu baris kotak kecil;
         rincian cabang terbuka saat kotaknya diklik. */
      w.innerHTML = `<div class="kartu" id="kartuMatpulsa">
        <div class="bar-alat"><h3>Pulsa per cabang</h3>
          <div class="kanan"><span class="wadah-periode" id="wadahPeriodeMatpulsa"></span></div></div>
        <div id="hasilMatpulsa"></div>
        <p class="petunjuk" style="margin:8px 0 0">Hanya terlihat oleh Owner dan Head Admin. Klik kotak cabang untuk rinciannya.</p>
      </div>`;
      $('#wadahPeriodeMatpulsa').innerHTML = Periode.html(PERIODE_MATPULSA);
      Periode.pasang(PERIODE_MATPULSA, () => API.tugas(muatHasilMatpulsa, { baca: true }));
    }
    return muatHasilMatpulsa();
  }

  async function muatHasilMatpulsa() {
    memuat('#hasilMatpulsa');
    const bln = nilai('matpulsaBulan');
    try {
      $('#hasilMatpulsa')._d = await API.matriksPulsa({ dari: bln ? bln + '-01' : '', sampai: bln ? bln + '-31' : '' });
      gambarMatpulsa();
    } catch (e) { galat('#hasilMatpulsa', e); }
  }

  function gambarMatpulsa() {
    const w = $('#hasilMatpulsa');
    const d = w && w._d;
    if (!d) return;
    const gagal = '<span class="petunjuk" style="margin:0">tidak terbaca</span>';
    /* Ringkas: "1,6 jt", "410 rb" — kotak strip harus muat 5 sebaris di PC. */
    const ringkas = (v) => {
      const a = Math.abs(+v || 0), t = a >= 1e6 ? (a / 1e6).toFixed(1).replace('.', ',') + ' jt'
        : a >= 1e3 ? Math.round(a / 1e3) + ' rb' : String(Math.round(a));
      return (+v || 0) < 0 ? `<span class="uang-minus">-${t}</span>` : t;
    };
    const kotak = (b, judul, kode) => `<button type="button" class="kotak-cab" data-cab-pulsa="${esc(kode)}"
        aria-expanded="${cabMatpulsa === kode ? 'true' : 'false'}" title="Klik untuk rincian ${esc(judul)}">
        <div class="k"><span>${esc(judul)}</span>${b.setor_gagal || (b.belum_setor && b.belum_setor.shift)
          ? '<span class="titik-setor" title="Ada kas belum disetor"></span>' : ''}</div>
        <div class="v">Rp ${ringkas(b.penjualan)}</div>
        <div class="m">margin ${ringkas(b.margin)}</div></button>`;
    const pilih = cabMatpulsa === '*' ? Object.assign({ kode_cabang: 'Total', shift_buka: null }, d.total)
      : (d.cabang || []).find((b) => b.kode_cabang === cabMatpulsa);
    const isi = (lbl, v) => `<div><span class="lbl">${esc(lbl)}</span>${v}</div>`;
    const rinci = pilih ? `<div class="rinci-pulsa" id="rinciMatpulsa">
        ${isi((pilih.kode_cabang === 'Total' ? 'Semua cabang' : pilih.kode_cabang) + ' · shift ditutup', esc(String(pilih.shift_tutup || 0)))}
        ${isi('Modal', rp(pilih.modal))}
        ${isi('Selisih kas', pilih.selisih ? rp(pilih.selisih) : '—')}
        ${isi('Saldo deposit', pilih.saldo_gagal ? gagal : rp(pilih.saldo))}
        ${pilih.kode_cabang === 'Total' ? '' : isi('Shift sekarang', pilih.shift_buka
          ? lencanaDash(pilih.shift_buka.jenis_shift || 'buka', 'hijau') : lencanaDash('tutup', ''))}
        ${isi('Belum disetor', pilih.setor_gagal ? gagal : (pilih.belum_setor && pilih.belum_setor.shift
          ? `<span class="uang-minus" style="font-weight:600">${rpTeks(pilih.belum_setor.kas)}</span> · ${esc(String(pilih.belum_setor.shift))} shift` : '—'))}
      </div>` : '';
    w.innerHTML = `<div class="strip-pulsa">${(d.cabang || []).map((b) => kotak(b, b.kode_cabang, b.kode_cabang)).join('')}${kotak(d.total, 'Total', '*')}</div>${rinci}`;
  }

  /** Klik kotak cabang: buka rinciannya; klik kotak yang sama lagi: tutup. */
  function pilihCabMatpulsa(kode) {
    cabMatpulsa = cabMatpulsa === kode ? '' : kode;
    gambarMatpulsa();
  }

  async function muatPulsa(tab) {
    const w = $('#isiPulsa');
    /* Matriks dimuat saat layar Pulsa dibuka (tanpa tab), tidak tiap pindah tab —
       dan tidak ditunggu: tab Shift tidak boleh menunggu hitungan semua cabang. */
    if (!tab) muatMatrikspulsa().catch(() => {});
    /* Tab Laporan hanya untuk yang memegang laporan_pulsa·lihat — Owner dan
       Head Admin (bagian 251). Akun petugas tidak melihat tabnya sama sekali,
       dan servernya menolak kalau dipanggil juga. */
    const bolehLaporan = bolehIzin('laporan_pulsa', 'lihat');
    const tabBoleh = TAB_PULSA.filter(([id]) => id !== 'laporan' || bolehLaporan);
    let aktif = tab || w?._tab || 'shift';
    if (!tabBoleh.some(([id]) => id === aktif)) aktif = 'shift';
    if (w) {
      w._tab = aktif;
      w.innerHTML = `
        <div class="kartu">
          <!-- .tab-modal, BUKAN .seg. Diminta pemilik 21 Sep 2026: "saya suka
               gaya tab-nya laporan penjualan". Bedanya bukan selera semata —
               .seg itu kelompok tombol berbingkai berhuruf kecil (fs-11) yang
               tepat untuk pengalih DI DALAM kartu, seperti rentang grafik di
               dashboard; .tab-modal itu tab bergaris bawah berhuruf fs-14 yang
               menandakan pindah BAGIAN halaman. Tab Pulsa memindahkan bagian
               halaman, jadi ia milik yang kedua.

               #grafikMode di dashboard SENGAJA tetap .seg — ia pengalih di
               dalam kartu, bukan tab halaman. Dua kelas, dua kegunaan.

               margin-bottom:0 menyalin yang dipakai #tabLaporan: tanpa itu
               .tab-modal membawa jarak 18 px yang menggantung di dasar kartu. -->
          <div class="tab-modal" id="tabPulsa" role="group" aria-label="Bagian pulsa"
               style="margin-bottom:0">
            ${tabBoleh.map(([id, label]) =>
              `<button type="button" data-tabpulsa="${id}" class="${id === aktif ? 'aktif' : ''}">${label}</button>`).join('')}
          </div>
          <p class="petunjuk">Buku pulsa: buka dan tutup shift, saldo tiap aplikasi${bolehLaporan
            ? ', dan laporan shift yang sudah ditutup' : ''}.</p>
        </div>`;
    }
    const peta = { shift: '#isiShiftpulsa', sumber: '#isiSumberpulsa', laporan: '#isiLaporanpulsa',
                   saldo: '#isiSaldopulsa' };
    Object.entries(peta).forEach(([id, sel]) => {
      const el = $(sel);
      if (el) el.hidden = (id !== aktif);
    });
    if (aktif === 'shift') return muatShiftpulsa();
    if (aktif === 'sumber') return muatSumberpulsa();
    if (aktif === 'saldo') return muatSaldopulsa();
    return muatLaporanpulsa();
  }

  /* ---------- Tab saldo (bagian 243) ----------
     Saldo tiap aplikasi di tiap cabang, satu tabel. Sebelum tab ini saldo
     hanya terlihat di tab Shift, untuk cabang tempat orang sedang login —
     memantau tiga cabang berarti pindah cabang tiga kali. Angkanya dari
     server (apiSaldoPulsaCabang), fungsi yang sama dengan Uji kebenaran. */
  async function muatSaldopulsa() {
    memuat('#isiSaldopulsa');
    try {
      $('#isiSaldopulsa')._d = await API.saldoPulsaCabang();
      gambarSaldopulsa();
    } catch (e) { galat('#isiSaldopulsa', e); }
  }

  function gambarSaldopulsa() {
    const w = $('#isiSaldopulsa');
    if (!w) return;
    const d = w._d || { cabang: [], total: 0 };
    const cabang = d.cabang || [];
    /* Kolom = gabungan sumber seluruh cabang, urutan kemunculan. Sumber yang
       tidak dipakai sebuah cabang ditulis "—", bukan 0: 0 berarti saldonya
       habis, "—" berarti aplikasinya tidak ada di sana. */
    const kolom = [];
    cabang.forEach(c => (c.sumber || []).forEach(x => {
      if (!kolom.some(k => k.kode_sumber === x.kode_sumber)) kolom.push({ kode_sumber: x.kode_sumber, nama: x.nama });
    }));
    /* Label kartu di HP diletakkan absolut selebar 35% — nama panjang seperti
       "DIGIPOS by TELKOMSEL" terlipat dua baris dan menabrak baris berikutnya.
       Di kartu cukup nama depannya; judul kolom di layar lebar tetap lengkap. */
    const labelSumber = (n) => String(n || '').split(/\s+by\s+/i)[0].slice(0, 16);
    const sel = (c, k) => {
      const x = (c.sumber || []).find(y => y.kode_sumber === k.kode_sumber);
      return x ? rp(x.saldo) : '<span class="teks-redup">—</span>';
    };
    const totalKolom = (k) => cabang.reduce((a, c) => {
      const x = (c.sumber || []).find(y => y.kode_sumber === k.kode_sumber);
      return a + (x ? +x.saldo || 0 : 0);
    }, 0);
    w.innerHTML = `
      <div class="kartu laporan-uang">
        <div class="bar-alat"><h3>Saldo aplikasi per cabang</h3><span class="satuan-uang">dalam Rupiah</span></div>
        <p class="petunjuk">Saldo akhir tiap aplikasi dari shift terakhir yang sudah ditutup di cabang itu.
           Shift yang masih berjalan belum dihitung — angkanya bergeser begitu shift itu ditutup.</p>
        ${cabang.length ? `<div class="gulir-x">
          <table class="tabel" id="tabelSaldoPulsa">
            <thead><tr><th>Cabang</th>
              ${kolom.map(k => `<th class="angka">${esc(k.nama)}</th>`).join('')}
              <th class="angka">Total</th><th>Shift terakhir ditutup</th><th>Keadaan</th></tr></thead>
            <tbody>${cabang.map(c => `<tr data-cabang="${esc(c.kode_cabang)}">
              <td data-l="Cabang">${esc(c.kode_cabang)}</td>
              ${kolom.map(k => `<td class="angka" data-l="${esc(labelSumber(k.nama))}">${sel(c, k)}</td>`).join('')}
              <td class="angka" data-l="Total"><strong>${rp(c.total)}</strong></td>
              <td data-l="Shift terakhir">${c.shift_terakhir ? esc(c.shift_terakhir.id_shift) : '<span class="teks-redup">belum ada shift</span>'}</td>
              <td data-l="Keadaan">${c.shift_buka ? lencanaDash('shift ' + String(c.shift_buka.jenis_shift || '').toLowerCase() + ' berjalan', 'kuning') : '—'}</td>
            </tr>`).join('')}</tbody>
            ${cabang.length > 1 ? `<tfoot><tr><th>Semua cabang</th>
              ${kolom.map(k => `<th class="angka">${rp(totalKolom(k))}</th>`).join('')}
              <th class="angka">${rp(d.total)}</th><th></th><th></th></tr></tfoot>` : ''}
          </table></div>` : '<p class="petunjuk">Belum ada cabang yang bisa ditampilkan.</p>'}
      </div>`;
  }

  /* ---------- Tab laporan ---------- */
  /* Rentang tanggalnya memakai komponen Periode standar (aturan tetap sejak
     v1.182): satu dropdown, Kustom membuka kolom tanggalnya, tiap perubahan
     langsung memuat, tanpa tombol Tampilkan.

     Servernya SUDAH menerima dari/sampai sejak v1.202.0 — yang hilang cuma
     pengirimnya, jadi layar ini selalu menampilkan 500 shift terakhir apa pun
     yang dicari orang. Tidak ada perubahan server untuk ini. */
  const PERIODE_LAPULSA = { id: 'lapulsaPeriodePilih', dari: 'lapulsaDari',
                            sampai: 'lapulsaSampai', nilai: 'bulan', label: 'Periode' };

  async function muatLaporanpulsa() {
    const w = $('#isiLaporanpulsa');
    if (!w) return;
    if (!$('#lapulsaDari')) {
      w.innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3>Shift pulsa yang sudah ditutup</h3>
            ${/* Shift yang lupa dicatat petugas (bagian 265) — pintu pengawas. */
              bolehKoreksiShift() ? `<div class="kanan">${tombolTambah('btnSusulanShift', 'Shift susulan')}</div>` : ''}</div>
          <div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeLapulsa"></span>
            ${bolehCabangDash() ? `<div class="kendali-tetap"><label>Cabang</label>
              <select id="lapulsaCabang" class="kendali-tetap" title="Cabang">
                <option value="*">Semua cabang</option>
                ${daftarKodeCabang().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select></div>` : ''}
          </div>
        </div>
        <div id="hasilLapulsa"></div>`;
      $('#wadahPeriodeLapulsa').innerHTML = Periode.html(PERIODE_LAPULSA);
      Periode.pasang(PERIODE_LAPULSA, muatHasilLapulsa);
      $('#lapulsaCabang')?.addEventListener('change', () => API.tugas(muatHasilLapulsa, { baca: true }));
    }
    return muatHasilLapulsa();
  }

  async function muatHasilLapulsa() {
    memuat('#hasilLapulsa');
    try {
      /* Cabang dikirim hanya oleh peran lintas cabang; peran lain tetap dikunci
         server ke cabangnya sendiri, apa pun yang dikirim (bagian 251). */
      const d = await API.daftarShiftPulsa({
        dari: $('#lapulsaDari').value, sampai: $('#lapulsaSampai').value,
        cabang: $('#lapulsaCabang')?.value || '' });
      $('#hasilLapulsa')._rows = d.shift || [];
      gambarLaporanpulsa();
    } catch (e) { galat('#hasilLapulsa', e); }
  }

  /* Tombolnya disembunyikan tanpa izin, DAN endpointnya menuntut izin yang
     sama. Yang pertama supaya layarnya tidak menawarkan yang tidak bisa
     dilakukan; yang kedua karena menyembunyikan tombol bukan penjagaan. */
  const bolehHapusShift = () => bolehIzin('pulsa', 'hapus');
  /* Koreksi shift yang sudah ditutup (bagian 260): Owner & Head Admin. */
  const bolehKoreksiShift = () => bolehIzin('laporan_pulsa', 'ubah');
  const adaAksiShift = () => bolehHapusShift() || bolehKoreksiShift();

  /**
   * Tindakan per baris di menu "⋮" (bagian 267, pemilik: "masukkan saja ke
   * tombol ellipsis") — dua tombol berteks membuat tabel 13 kolom tidak muat di
   * laptop 1280 px. Menunya `menu-baris`: ditempatkan fixed saat dibuka,
   * supaya tidak terpotong pembungkus tabel yang bisa digeser.
   */
  function menuBarisShift(r, i) {
    const id = esc(String(r.id_shift));
    const isi = (bolehKoreksiShift() && String(r.status) === 'TUTUP'
      ? `<button class="popover-item" role="menuitem" data-koreksi-shift="${id}"
          title="${r.bisa_hapus ? 'Koreksi saldo akhir, penjualan, reward, atau kas fisik shift ini' : 'Koreksi penjualan, reward, atau kas fisik shift ini'}">
          <svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON.ubah}</svg><span>Koreksi</span></button>` : '') +
      (bolehHapusShift() && r.bisa_hapus
      ? `<button class="popover-item bahaya" role="menuitem" data-hapus-shift="${id}"
          title="Hapus shift tutup terakhir cabang ini; jurnalnya dibalik otomatis">
          <svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON.hapus}</svg><span>Hapus</span></button>` : '');
    if (!isi) return '';
    return menuTindakan({ id: 'menuShiftPulsa' + i, idTombol: 'btnMenuShiftPulsa' + i, kunci: 'shift-pulsa', isi })
      .replace('<div class="menu-lain">', '<div class="menu-lain menu-baris">');
  }

  function gambarLaporanpulsa() {
    const w = $('#hasilLapulsa');
    if (!w) return;
    const rows = w._rows || [];
    const t = rows.reduce((a, r) => ({
      jual: a.jual + (+r.total_penjualan || 0), modal: a.modal + (+r.total_modal_saldo || 0),
      margin: a.margin + (+r.margin || 0), selisih: a.selisih + (+r.selisih || 0),
      topup: a.topup + (+r.total_deposit || 0), reward: a.reward + (+r.total_reward || 0)
    }), { jual: 0, modal: 0, margin: 0, selisih: 0, topup: 0, reward: 0 });

    w.innerHTML = `
      <div class="kartu">
        <p class="pesan info">Angka di layar ini <strong>sudah masuk buku besar</strong> sejak
           v1.203 — tiap shift yang ditutup langsung dijurnal. Yang belum dijurnal ditandai
           merah di kolom terakhir, dan itu berarti sebabnya perlu dibereskan, bukan diabaikan.</p>
        <div class="gulir-x">
          <table class="tabel tabel-padat">
            <thead><tr><th>Tanggal</th><th>Cabang</th><th>Shift</th><th class="kanan">Modal awal</th>
              <th class="kanan">Topup</th>
              <th class="kanan">Modal</th><th class="kanan">Penjualan</th><th class="kanan">Margin</th>
              <th class="kanan">Saldo akhir</th><th class="kanan">Selisih kas</th>
              <th class="kanan">Reward</th><th>Status</th>${adaAksiShift() ? '<th></th>' : ''}</tr></thead>
            <tbody>${rows.map((r, i) => `<tr>
              <td data-l="Tanggal">${esc(tglTampil(r.tanggal))}</td>
              <td data-l="Cabang">${esc(String(r.kode_cabang))}</td>
              <td data-l="Shift">${esc(String(r.jenis_shift))}</td>
              <td class="kanan" data-l="Modal awal">${rp(r.saldo_awal_total)}</td>
              <td class="kanan" data-l="Topup">${rp(r.total_deposit)}</td>
              <td class="kanan" data-l="Modal">${rp(r.total_modal_saldo)}</td>
              <td class="kanan" data-l="Penjualan">${rp(r.total_penjualan)}</td>
              <td class="kanan" data-l="Margin">${rp(r.margin)}</td>
              <td class="kanan" data-l="Saldo akhir">${rp(r.saldo_akhir_total)}</td>
              <td class="kanan" data-l="Selisih kas">${(+r.selisih || 0) !== 0 ? rp(r.selisih) : '—'}</td>
              <td class="kanan" data-l="Reward">${rp(r.total_reward)}</td>
              <td data-l="Status">${esc(String(r.status))}${(+r.koreksi || 0) > 0
                /* Tanda "diedit" ala WhatsApp (bagian 260); diklik = riwayatnya. */
                ? ` <button type="button" class="tanda-diedit" data-riwayat-koreksi="${esc(String(r.id_shift))}"
                    title="Angka shift ini sudah dikoreksi ${+r.koreksi} kali — klik untuk melihat riwayatnya">diedit</button>` : ''}${r.catatan
                ? ` <span class="petunjuk">${esc(String(r.catatan).slice(0, 40))}</span>` : ''}</td>
              ${adaAksiShift() ? `<td data-l="" class="sel-menu">${menuBarisShift(r, i)}</td>` : ''}
            </tr>`).join('')}</tbody>
            ${rows.length ? `<tfoot><tr><th colspan="3">Total ${rows.length} shift</th>
              <th></th><th class="kanan">${rp(t.topup)}</th><th class="kanan">${rp(t.modal)}</th><th class="kanan">${rp(t.jual)}</th>
              <th class="kanan">${rp(t.margin)}</th><th></th><th class="kanan">${rp(t.selisih)}</th>
              <th class="kanan">${rp(t.reward)}</th><th></th>${adaAksiShift() ? '<th></th>' : ''}</tr></tfoot>` : ''}
          </table>
        </div>
        ${rows.length ? '' : '<p class="pesan">Belum ada shift pulsa yang ditutup.</p>'}
      </div>`;
  }

  /* ==================== KOREKSI SHIFT PULSA (bagian 260) ====================
     Form: penjualan & reward per sumber, kas fisik, alasan wajib. Hitungan di
     layar memakai rumus yang SAMA dengan server (hitungShiftpulsa) — yang
     menentukan tetap server. Saldo AKHIR hanya bisa diubah pada shift tutup
     terakhir cabangnya (bagian 265, `bisa_hapus` dari server = aturan yang
     sama): di tengah rantai, saldo akhir sudah menjadi saldo awal shift
     berikutnya. Saldo awal tidak pernah bisa diubah — ia warisan. */
  async function bukaKoreksiShift(id) {
    let r;
    try { r = await API.rincianShiftPulsa({ id_shift: id }); }
    catch (e) { return toast(e.message, 'galat'); }
    const s = r.shift || {}, saldo = r.saldo || [];
    const ujung = !!((($('#hasilLapulsa') || {})._rows || []).find((x) => String(x.id_shift) === id) || {}).bisa_hapus;
    const nama = {};
    ((($('#isiShiftpulsa') || {})._st || {}).sumber || []).forEach((x) => { nama[x.kode_sumber] = x.nama; });
    const isian = (k, v, ket) => `<input type="text" inputmode="numeric" class="uang" data-koreksi="${k}"
      value="${esc(new Intl.NumberFormat(CONFIG.LOCALE).format(+v || 0))}" aria-label="${esc(ket)}">`;
    bukaModal('Koreksi shift ' + (s.jenis_shift || '') + ' ' + (s.kode_cabang || '') + ' · ' + String(s.tanggal || '').slice(0, 10), `
      <p class="petunjuk">${ujung
        ? 'Ini shift terakhir cabang ini, jadi <strong>saldo akhir</strong> masih bisa dikoreksi — angka itu yang akan diwarisi shift berikutnya.'
        : 'Saldo akhir tidak bisa diubah — sudah menjadi saldo awal shift berikutnya.'}
        Koreksi menerbitkan <strong>jurnal koreksi</strong> sebesar selisihnya, dan tercatat di riwayat shift ini.</p>
      <div class="gulir-x"><table class="tabel" id="tabelKoreksi">
        <thead><tr><th>Sumber</th><th class="kanan">Saldo awal</th><th class="kanan">Saldo akhir</th><th class="kanan">Modal</th>
          <th class="kanan">Penjualan</th><th class="kanan">Reward</th></tr></thead>
        <tbody>${saldo.map((b) => `<tr data-sumber="${esc(String(b.kode_sumber))}" data-awal="${+b.saldo_awal || 0}"
            data-akhir="${+b.saldo_akhir || 0}" data-deposit="${+b.deposit || 0}">
          <td data-l="Sumber">${esc(nama[b.kode_sumber] || String(b.kode_sumber))} <span class="petunjuk">${esc(String(b.kode_sumber))}</span></td>
          <td class="kanan" data-l="Saldo awal">${rp(b.saldo_awal)}</td>
          <td class="kanan" data-l="Saldo akhir">${ujung ? isian('saldo_akhir', b.saldo_akhir, 'Saldo akhir ' + b.kode_sumber) : rp(b.saldo_akhir)}</td>
          <td class="kanan" data-l="Modal" data-modal>${rp(b.konsumsi)}</td>
          <td class="kanan" data-l="Penjualan">${isian('penjualan', b.penjualan, 'Penjualan ' + b.kode_sumber)}</td>
          <td class="kanan" data-l="Reward">${isian('reward', b.reward, 'Reward ' + b.kode_sumber)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="grup" style="max-width:320px"><label>Kas fisik (uang di laci)</label>${isian('kas_fisik', s.kas_fisik, 'Kas fisik')}</div>
      <div class="grup"><label>Alasan koreksi *</label>
        <input type="text" id="alasanKoreksi" maxlength="200" placeholder="mis. salah ketik penjualan BOS PULSA, seharusnya 1.056.000"></div>
      <div id="pratinjauKoreksi" class="pratinjau-koreksi"></div>`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanKoreksi">${ikonAlat('simpan')}<span>Simpan koreksi</span></button>`);
    const m = $('#modalUmum');
    m._koreksi = { id, s, ujung };
    const hitung = () => {
      let jual = 0, modal = 0, dep = 0;
      m.querySelectorAll('#tabelKoreksi tbody tr').forEach((tr) => {
        jual += angkaDari(tr.querySelector('[data-koreksi="penjualan"]').value);
        const akhirEl = tr.querySelector('[data-koreksi="saldo_akhir"]');
        const akhir = akhirEl ? angkaDari(akhirEl.value) : (+tr.dataset.akhir || 0);
        /* Rumus yang sama dengan _hitungShiftPulsa: awal + deposit + reward − akhir. */
        const pakai = (+tr.dataset.awal || 0) + (+tr.dataset.deposit || 0) +
          angkaDari(tr.querySelector('[data-koreksi="reward"]').value) - akhir;
        tr.querySelector('[data-modal]').innerHTML = rp(pakai);
        modal += pakai; dep += +tr.dataset.deposit || 0;
      });
      const keluar = +s.total_keluar || 0;
      const kasSistem = (+s.kas_awal || 0) + jual - dep - keluar;
      const kas = angkaDari(m.querySelector('[data-koreksi="kas_fisik"]').value);
      const baris = (l, lama, baru) => `<tr><td>${l}</td><td class="kanan">${rp(lama)}</td><td class="kanan">${rp(baru)}</td></tr>`;
      $('#pratinjauKoreksi').innerHTML = `<table class="tabel"><thead><tr><th>Hasil</th><th class="kanan">Sekarang</th>
        <th class="kanan">Sesudah koreksi</th></tr></thead><tbody>
        ${baris('Modal', s.total_modal_saldo, modal)}
        ${baris('Total penjualan', s.total_penjualan, jual)}${baris('Kas sistem', s.kas_sistem, kasSistem)}
        ${baris('Kas fisik', s.kas_fisik, kas)}${baris('Selisih kas', s.selisih, kas - kasSistem)}
        ${baris('Margin', s.margin, jual - modal - keluar)}</tbody></table>`;
    };
    m.addEventListener('input', (e) => { if (e.target.closest('[data-koreksi]')) hitung(); });
    hitung();
  }

  async function simpanKoreksiShift() {
    const m = $('#modalUmum'), k = m._koreksi;
    if (!k) return;
    const alasan = ($('#alasanKoreksi').value || '').trim();
    if (alasan.length < 5) { toast('Tulis alasan koreksinya — minimal 5 huruf.', 'galat'); $('#alasanKoreksi').focus(); return; }
    const sumber = [...m.querySelectorAll('#tabelKoreksi tbody tr')].map((tr) => {
      const o = { kode_sumber: tr.dataset.sumber,
        penjualan: angkaDari(tr.querySelector('[data-koreksi="penjualan"]').value),
        reward: angkaDari(tr.querySelector('[data-koreksi="reward"]').value) };
      /* Dikirim hanya dari shift terakhir — server menolaknya di tempat lain. */
      const akhir = tr.querySelector('[data-koreksi="saldo_akhir"]');
      if (akhir) o.saldo_akhir = angkaDari(akhir.value);
      return o;
    });
    const kas_fisik = angkaDari(m.querySelector('[data-koreksi="kas_fisik"]').value);
    if (!(await tanya('Simpan koreksi shift ini?',
      `<p>Jurnal koreksi sebesar selisihnya akan terbit di buku besar, dan shift ini ditandai <strong>diedit</strong>
         beserta riwayatnya. Angka lama tetap tercatat di riwayat.</p>`, { ya: 'Simpan koreksi' }))) return;
    try {
      const r = await API.koreksiShiftPulsa({ id_shift: k.id, sumber, kas_fisik, alasan });
      tutupModal();
      toast(`Shift ${k.id} dikoreksi${r.no_jurnal ? ' — jurnal ' + r.no_jurnal : ''}.`, 'sukses');
      await muatLaporanpulsa();
    } catch (e) { toast(e.message, 'galat'); }
  }

  async function bukaRiwayatKoreksi(id) {
    let d;
    try { d = await API.riwayatKoreksiShiftPulsa({ id_shift: id }); }
    catch (e) { return toast(e.message, 'galat'); }
    const rw = d.riwayat || [];
    bukaModal('Riwayat koreksi ' + id, rw.length ? rw.map((x) => `
      <div class="riwayat-koreksi">
        <p style="margin:0 0 4px"><strong>${esc(waktuTampil(x.waktu))}</strong> · ${esc(x.nama)}${x.susulan
          ? ' · <em>dicatat susulan</em>' : ''}${x.no_jurnal
          ? ` · jurnal <code>${esc(x.no_jurnal)}</code>` : ''}</p>
        <p class="petunjuk" style="margin:0 0 6px">Alasan: ${esc(x.alasan || '—')}</p>
        <div class="gulir-x"><table class="tabel"><thead><tr><th>Angka</th><th class="kanan">Sebelum</th><th class="kanan">Sesudah</th></tr></thead>
          <tbody>${x.ubah.map((u) => `<tr><td data-l="Angka">${esc(u.label)}</td><td class="kanan" data-l="Sebelum">${u.lama === null ? '—' : rp(u.lama)}</td>
            <td class="kanan" data-l="Sesudah">${rp(u.baru)}</td></tr>`).join('')}</tbody></table></div>
      </div>`).join('') : '<p class="pesan">Belum ada riwayat koreksi.</p>');
  }

  /* ==================== SHIFT SUSULAN (bagian 265) ====================
     Shift yang lupa dicatat petugas. Saldo awal DIWARISI dari shift terakhir
     cabangnya (dibaca lewat shift_pulsa_aktif, jalur yang sama dengan form
     Buka), jadi yang diketik hanya yang dilaporkan petugas: saldo akhir,
     deposit, penjualan, reward, kas. Server hanya menerima susulan di UJUNG
     rantai — sesudah shift terakhir, tanpa shift yang sedang buka. */
  async function bukaSusulanShift() {
    const cabangList = bolehCabangDash() ? daftarKodeCabang() : [String(APP_STATE.cabang || '')];
    const kemarin = tanggalLokal(new Date(Date.now() - 864e5));
    bukaModal('Shift susulan', `
      <p class="petunjuk">Untuk shift yang lupa dicatat. Saldo awal diwarisi dari shift terakhir cabangnya,
        dan shift susulan hanya bisa ditambahkan <strong>sesudah</strong> shift terakhir, selama tidak ada shift yang sedang buka.
        Jurnalnya bertanggal hari shift itu, dan shiftnya ditandai <strong>diedit</strong>.</p>
      <div class="baris3">
        <div class="grup"><label>Cabang</label><select id="susCabang">
          <option value="">— pilih —</option>
          ${cabangList.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
        <div class="grup"><label>Tanggal shift</label><input type="date" id="susTanggal" value="${esc(kemarin)}" max="${esc(tanggalLokal())}"></div>
        <div class="grup"><label>Jenis shift</label><select id="susJenis">
          ${['PAGI', 'MALAM'].map((j) => `<option value="${j}">${j}</option>`).join('')}</select></div>
      </div>
      <div id="susIsi"><p class="petunjuk">Pilih cabangnya dulu.</p></div>`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanSusulan" disabled>${ikonAlat('simpan')}<span>Simpan shift susulan</span></button>`);
    const m = $('#modalUmum');
    m._susulan = null;
    $('#susCabang').addEventListener('change', () => API.tugas(muatSumberSusulan, { baca: true }));
    m.addEventListener('input', (e) => {
      if (!e.target.closest('[data-sus]')) return;
      /* Kas fisik mengikuti total penjualan sampai orangnya mengetik sendiri. */
      if (e.target.dataset.sus === 'kas_fisik') e.target.dataset.diketik = '1';
      hitungSusulan();
    });
    if (cabangList.length === 1) { $('#susCabang').value = cabangList[0]; await muatSumberSusulan(); }
  }

  async function muatSumberSusulan() {
    const m = $('#modalUmum'), w = $('#susIsi');
    const cabang = $('#susCabang').value;
    m._susulan = null; $('#btnSimpanSusulan').disabled = true;
    if (!cabang) { w.innerHTML = '<p class="petunjuk">Pilih cabangnya dulu.</p>'; return; }
    memuat('#susIsi');
    let st;
    try { st = await API.shiftPulsaAktif({ cabang }); }
    catch (e) { return galat('#susIsi', e); }
    if (st.aktif) {
      w.innerHTML = `<p class="pesan peringatan">Cabang ${esc(cabang)} sedang punya shift yang terbuka. Shift susulan hanya bisa
        ditambahkan di ujung — batalkan shift yang terbuka dulu, atau tunggu sampai ditutup.</p>`;
      return;
    }
    const sumber = st.sumber || [];
    if (!sumber.length) { w.innerHTML = `<p class="pesan galat">Belum ada sumber saldo untuk cabang ${esc(cabang)}.</p>`; return; }
    const isian = (k, ket) => `<input type="text" inputmode="numeric" class="uang" data-sus="${k}" value="0" aria-label="${esc(ket)}">`;
    w.innerHTML = `
      <div class="gulir-x"><table class="tabel" id="tabelSusulan">
        <thead><tr><th>Sumber</th><th class="kanan">Saldo awal</th><th class="kanan">Deposit</th><th class="kanan">Saldo akhir</th>
          <th class="kanan">Modal</th><th class="kanan">Penjualan</th><th class="kanan">Reward</th></tr></thead>
        <tbody>${sumber.map((s) => `<tr data-sumber="${esc(String(s.kode_sumber))}" data-awal="${+s.saldo_awal || 0}">
          <td data-l="Sumber">${esc(s.nama || String(s.kode_sumber))} <span class="petunjuk">${esc(String(s.kode_sumber))}</span></td>
          <td class="kanan" data-l="Saldo awal">${rp(s.saldo_awal)}</td>
          <td class="kanan" data-l="Deposit">${isian('deposit', 'Deposit ' + s.kode_sumber)}</td>
          <td class="kanan" data-l="Saldo akhir">${isian('saldo_akhir', 'Saldo akhir ' + s.kode_sumber)}</td>
          <td class="kanan" data-l="Modal" data-modal>${rp(0)}</td>
          <td class="kanan" data-l="Penjualan">${isian('penjualan', 'Penjualan ' + s.kode_sumber)}</td>
          <td class="kanan" data-l="Reward">${isian('reward', 'Reward ' + s.kode_sumber)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="grup" style="max-width:320px"><label>Kas fisik (uang yang diserahkan)</label>${isian('kas_fisik', 'Kas fisik')}</div>
      <div class="grup"><label>Alasan *</label>
        <input type="text" id="alasanSusulan" maxlength="200" placeholder="mis. petugas lupa mencatat shift malam"></div>
      <div id="pratinjauSusulan" class="pratinjau-koreksi"></div>`;
    m._susulan = { cabang };
    $('#btnSimpanSusulan').disabled = false;
    hitungSusulan();
  }

  function hitungSusulan() {
    const m = $('#modalUmum');
    if (!m._susulan) return;
    let jual = 0, modal = 0, dep = 0;
    m.querySelectorAll('#tabelSusulan tbody tr').forEach((tr) => {
      const v = (k) => angkaDari(tr.querySelector(`[data-sus="${k}"]`).value);
      const pakai = (+tr.dataset.awal || 0) + v('deposit') + v('reward') - v('saldo_akhir');
      tr.querySelector('[data-modal]').innerHTML = rp(pakai);
      modal += pakai; jual += v('penjualan'); dep += v('deposit');
    });
    const kasEl = m.querySelector('[data-sus="kas_fisik"]');
    const kasSistem = jual - dep;
    if (!kasEl.dataset.diketik) kasEl.value = new Intl.NumberFormat(CONFIG.LOCALE).format(Math.max(0, kasSistem));
    const kas = angkaDari(kasEl.value);
    const baris = (l, v) => `<tr><td>${l}</td><td class="kanan">${rp(v)}</td></tr>`;
    $('#pratinjauSusulan').innerHTML = `<table class="tabel"><thead><tr><th>Hasil</th><th class="kanan">Angka</th></tr></thead><tbody>
      ${baris('Modal', modal)}${baris('Total penjualan', jual)}${baris('Margin', jual - modal)}
      ${baris('Kas sistem', kasSistem)}${baris('Selisih kas', kas - kasSistem)}</tbody></table>`;
  }

  async function simpanSusulanShift() {
    const m = $('#modalUmum'), k = m._susulan;
    if (!k) return;
    const alasan = ($('#alasanSusulan').value || '').trim();
    if (alasan.length < 5) { toast('Tulis alasannya — minimal 5 huruf.', 'galat'); $('#alasanSusulan').focus(); return; }
    const tanggal = $('#susTanggal').value, jenis_shift = $('#susJenis').value;
    if (!tanggal) { toast('Isi tanggal shiftnya.', 'galat'); return; }
    const sumber = [...m.querySelectorAll('#tabelSusulan tbody tr')].map((tr) => {
      const v = (x) => angkaDari(tr.querySelector(`[data-sus="${x}"]`).value);
      return { kode_sumber: tr.dataset.sumber, deposit: v('deposit'), saldo_akhir: v('saldo_akhir'),
               penjualan: v('penjualan'), reward: v('reward') };
    });
    const kas_fisik = angkaDari(m.querySelector('[data-sus="kas_fisik"]').value);
    if (!(await tanya(`Simpan shift ${jenis_shift} ${k.cabang} tanggal ${tanggal}?`,
      `<p>Shift ini langsung tercatat <strong>tutup</strong>, jurnalnya terbit di buku besar bertanggal ${esc(tanggal)},
         dan saldo akhirnya menjadi saldo awal shift berikutnya di ${esc(k.cabang)}.</p>`, { ya: 'Simpan shift susulan' }))) return;
    try {
      const r = await API.susulanShiftPulsa({ cabang: k.cabang, tanggal, jenis_shift, sumber, kas_fisik, alasan });
      tutupModal();
      toast(`Shift ${r.id_shift} tercatat${r.no_jurnal ? ' — jurnal ' + r.no_jurnal : ''}.`, 'sukses');
      if (r.jurnal_gagal) toast('Jurnal shift ini gagal: ' + r.jurnal_gagal, 'galat');
      await muatLaporanpulsa();
    } catch (e) { toast(e.message, 'galat'); }
  }

  /* ==================== SHIFT PULSA ====================
     Tahap 2 (bagian 189). Shift pulsa berdiri sendiri — dua laci terpisah,
     jadi kas pulsa punya kas awal, kas fisik, dan selisihnya sendiri.

     Angka di layar ini DIHITUNG ULANG setiap ketikan, tapi yang menentukan
     tetap server: klien cuma memperlihatkan lebih awal apa yang akan dijawab
     server, supaya yang mengisi tidak menekan Tutup lalu ditolak. */
  async function muatShiftpulsa() {
    memuat('#isiShiftpulsa');
    try {
      const d = await API.shiftPulsaAktif({});
      $('#isiShiftpulsa')._st = d;
      gambarShiftpulsa();
    } catch (e) { galat('#isiShiftpulsa', e); }
  }

  /** Hitungan yang SAMA dengan _hitungShiftPulsa di server. */
  function hitungShiftpulsa(st, keluar) {
    let modal = 0, jual = 0, deposit = 0, reward = 0;
    (st.sumber || []).forEach(s => {
      /* Reward = yang di-redeem ke saldo utama (bagian 266) — rumus server. */
      modal += (+s.saldo_awal || 0) + (+s.deposit || 0) + (+s.reward || 0) - (+s.saldo_akhir || 0);
      jual += (+s.penjualan || 0); deposit += (+s.deposit || 0); reward += (+s.reward || 0);
    });
    const kasSistem = (+st.kas_awal || 0) + jual - deposit - (+keluar || 0);
    return { modal, jual, deposit, reward, kasSistem, margin: jual - modal - (+keluar || 0) };
  }

  function gambarShiftpulsa() {
    const w = $('#isiShiftpulsa');
    if (!w) return;
    const st = w._st || {};
    if (!st.aktif) gambarBukaShiftpulsa(w, st);
    else gambarTutupShiftpulsa(w, st);
    kunciModeLihatPulsa(w);
  }

  /** Mode lihat (bagian 257): layar penjual tampil apa adanya — saldo awal yang
   *  diwarisi, form tutup — tetapi semua isian & tombol dikunci. SATU pengecualian:
   *  Batalkan shift salah buka (bagian 252), yang memang tugas pengawas. */
  function kunciModeLihatPulsa(w) {
    if (!modeLihat() || !w) return;
    w.insertAdjacentHTML('afterbegin', '<div class="pita-lihat" id="pitaLihatPulsa" role="status" style="margin-bottom:12px">' +
      'Mode lihat — akun ini tidak berjualan. Tombol yang menyimpan dikunci.</div>');
    w.querySelectorAll('input, select, textarea, button').forEach((e) => {
      if (e.id !== 'btnBatalShiftPulsa') e.disabled = true;
    });
  }

  function gambarBukaShiftpulsa(w, st) {
    const sumber = st.sumber || [];
    w.innerHTML = `
      <div class="kartu">
        <div class="bar-alat"><h3>Buka shift pulsa</h3></div>
        ${sumber.length ? '' : `<p class="pesan galat">Belum ada sumber saldo untuk cabang ini.
           Isi dulu di tab Sumber Saldo — shift tidak bisa dibuka tanpa satu pun sumber.</p>`}
        <div class="saring-baris">
          <div class="kendali-tetap"><label>Jenis shift</label><select id="spsJenis">
            ${/* Dua saja — pemilik, 19 Sep 2026. Servernya menolak selain ini,
                 jadi dropdown dan penjaga server tidak bisa menyimpang diam-diam. */
              ['PAGI', 'MALAM'].map(j => `<option value="${j}">${j}</option>`).join('')}
          </select></div>
        </div>
        ${/* Kas awal shift pulsa SELALU 0 (bagian 242) — tidak ada kolomnya.
             Setoran shift yang belum diterima jadi PENGINGAT, tidak menghalangi:
             petugas pagi tetap bisa bekerja walau Head Admin belum datang. */ ''}
        <p class="petunjuk">Kas shift ini mulai dari 0. Sesudah ditutup, seluruh uangnya diserahkan ke Head Admin.</p>
        ${(st.setoran_tertunda || []).length ? `<div class="pesan peringatan" id="spsSetoranTertunda">
          ${st.setoran_tertunda.map(x => `Kas shift ${esc(x.jenis_shift)} ${esc(x.id_shift)}, ${rpTeks(x.kas_fisik)}, belum diterima Head Admin.`).join('<br>')}
          <br>Uang itu bukan bagian shift ini — serahkan terpisah. Head Admin menerimanya di Kas &amp; Bank → Setoran toko.</div>` : ''}
      </div>
      ${/* Kolom saldo awal TERBUKA hanya kalau server bilang begitu (shift pertama
           cabang + izin pulsa·ubah, bagian 228). Layar tidak menebak sendiri. */ ''}
      <div class="kartu">
        <h3>${st.bisa_ketik_saldo_awal ? 'Saldo awal aplikasi' : 'Saldo awal yang diwarisi'}</h3>
        <p class="petunjuk">${st.bisa_ketik_saldo_awal
          ? 'Belum ada shift di cabang ini. Isi saldo yang SEKARANG ada di tiap aplikasi — diisi sekali saja, dan dicatat ke buku besar sebagai saldo pembukaan (Modal Pemilik). Mulai shift berikutnya, saldo awal diwarisi dari shift sebelumnya.'
          : 'Angka ini saldo akhir shift sebelumnya. Lihat dulu sebelum menekan Buka — sesudah shift berjalan, saldo awalnya tidak bisa diubah.'}</p>
        <div class="gulir-x">
          <table class="tabel">
            <thead><tr><th>Sumber</th><th class="kanan">Saldo awal</th></tr></thead>
            <tbody>${sumber.map(s => `<tr>
              <td data-l="Sumber">${esc(s.nama)} <span class="petunjuk">${esc(s.kode_sumber)}</span></td>
              <td class="kanan" data-l="Saldo awal">${st.bisa_ketik_saldo_awal
                ? `<input type="text" inputmode="numeric" class="uang kendali-tetap" data-saldo-awal="${esc(s.kode_sumber)}" value="0" aria-label="Saldo awal ${esc(s.nama)}">`
                : rp(s.saldo_awal)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="kartu"><div class="aksi">
        <button class="tombol utama" id="btnBukaShiftPulsa" ${sumber.length ? '' : 'disabled'}>Mulai hitungan</button>
      </div></div>`;
  }

  /* Batalkan shift salah buka (bagian 252): pembukanya sendiri, atau pengawas
     pulsa — Owner/Head Admin. Yang menentukan tetap server; ini supaya
     tombolnya tidak ditawarkan kepada orang yang pasti ditolak. */
  function bolehBatalShift(st) {
    const saya = String((APP_STATE.user && APP_STATE.user.id_user) || '');
    return (!!st.id_user && String(st.id_user) === saya && bolehIzin('pulsa', 'buat')) ||
           bolehIzin('laporan_pulsa', 'lihat') || bolehIzin('pulsa', 'hapus');
  }

  /* Cermin penolakan server di apiTutupShiftPulsa (bagian 252): modal ada,
     tapi semua saldo akhir dan penjualan nol — seluruh saldo hilang tanpa
     terjual. Diperiksa SAAT Kunci hitungan ditekan, bukan dipajang terus:
     shift yang baru dibuka memang masih nol semua. */
  function shiftMustahil(st) {
    let modal = 0, akhir = 0, jual = 0;
    (st.sumber || []).forEach((s) => {
      modal += (+s.saldo_awal || 0) + (+s.deposit || 0);
      akhir += Math.abs(+s.saldo_akhir || 0);
      jual += Math.abs(+s.penjualan || 0);
    });
    return modal > 0 && akhir === 0 && jual === 0 ? modal : 0;
  }

  function gambarTutupShiftpulsa(w, st) {
    if (!w._keluar) w._keluar = (st.keluar || []).map(x => ({ keterangan: x.keterangan, jumlah: +x.jumlah || 0 }));
    const keluarBaris = w._keluar;
    const totalKeluar = keluarBaris.reduce((a, x) => a + (+x.jumlah || 0), 0);
    const h = hitungShiftpulsa(st, totalKeluar);
    const selisih = (+w._kasFisik || 0) - h.kasSistem;
    const ganjil = [];
    if (selisih !== 0) ganjil.push('selisih kas ' + rp(selisih));
    if (h.margin < 0) ganjil.push('margin ' + rp(h.margin));
    const foto = st.foto || [];

    w.innerHTML = `
      <div class="kartu">
        <div class="bar-alat"><h3>Tutup shift pulsa</h3>${bolehBatalShift(st)
          ? '<button class="tombol kecil bahaya" id="btnBatalShiftPulsa" style="margin-left:auto">Batalkan shift</button>' : ''}</div>
        <p class="petunjuk">${esc(st.kode_cabang)} · ${esc(st.jenis_shift)} · dibuka
           ${esc(waktuTampil(st.buka))} · id <code>${esc(st.id_shift)}</code></p>
        ${bolehBatalShift(st) ? `<p class="petunjuk">Salah buka shift? Tekan <strong>Batalkan shift</strong>
           selagi belum mengisi apa pun — shiftnya dihapus dan tidak ada yang tercatat. Jangan
           ditutup dengan saldo 0.</p>` : ''}
      </div>
      <div class="kartu">
        <h3>Saldo per sumber</h3>
        <p class="petunjuk">Reward = reward yang di-redeem ke saldo utama selama shift ini. Reward yang belum di-redeem tidak diisi.</p>
        <div class="gulir-x">
          <table class="tabel">
            <thead><tr><th>Sumber</th><th class="kanan">Saldo awal</th><th class="kanan">Deposit masuk</th>
              <th class="kanan">Saldo akhir</th><th class="kanan">Konsumsi (modal)</th>
              <th class="kanan">Penjualan</th><th class="kanan">Reward</th></tr></thead>
            <tbody>${(st.sumber || []).map((s, i) => `<tr>
              <td data-l="Sumber">${esc(s.nama)}<br><span class="petunjuk">${esc(s.kode_sumber)}</span></td>
              <td class="kanan" data-l="Saldo awal">${rp(s.saldo_awal)}<br><span class="petunjuk">terkunci</span></td>
              <td data-l="Deposit masuk"><input type="text" class="kanan uang spsAngka" data-sp="deposit" data-i="${i}" value="${rp0(s.deposit)}"></td>
              <td data-l="Saldo akhir"><input type="text" class="kanan uang spsAngka" data-sp="saldo_akhir" data-i="${i}" value="${rp0(s.saldo_akhir)}"></td>
              <td class="kanan" data-l="Konsumsi (modal)"><strong>${rp((+s.saldo_awal || 0) + (+s.deposit || 0) + (+s.reward || 0) - (+s.saldo_akhir || 0))}</strong></td>
              <td data-l="Penjualan"><input type="text" class="kanan uang spsAngka" data-sp="penjualan" data-i="${i}" value="${rp0(s.penjualan)}"></td>
              <td data-l="Reward"><input type="text" class="kanan uang spsAngka" data-sp="reward" data-i="${i}" value="${rp0(s.reward)}"></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="petunjuk">Reward tidak dijurnal terpisah: ia sudah menambah saldo akhir, jadi
           sudah ikut mengecilkan konsumsi. Menghitungnya dua kali membesarkan untung yang sama.</p>
      </div>
      <div class="kartu">
        <h3>Kas</h3>
        <div class="saring-baris">
          <div class="kendali-tetap"><label>Kas awal</label><input type="text" value="${rp0(st.kas_awal)}" disabled></div>
          <div class="kendali-tetap"><label>Kas akhir fisik</label><input type="text" id="spsKasFisik" class="uang spsAngka" data-sp="kas_fisik" value="${rp0(w._kasFisik)}"></div>
          <div class="kendali-tetap"><label>Pengeluaran</label><input type="text" value="${rp0(totalKeluar)}" disabled></div>
        </div>
        <p class="petunjuk">Kas akhir fisik = hasil menghitung uang sungguhan di laci, bukan angka
           yang dicocokkan supaya selisihnya nol. Pengeluaran dijumlah dari rinciannya di bawah.</p>
      </div>
      <div class="kartu">
        <h3>Pengeluaran lain</h3>
        <div class="gulir-x">
          <table class="tabel">
            <thead><tr><th>Keterangan</th><th class="kanan">Nominal</th><th></th></tr></thead>
            <tbody>${keluarBaris.length ? keluarBaris.map((x, i) => `<tr>
              <td data-l="Keterangan"><input type="text" class="spsKel" data-kel="keterangan" data-i="${i}" value="${esc(x.keterangan || '')}" placeholder="mis. beli plastik"></td>
              <td data-l="Nominal"><input type="text" class="kanan uang spsKel" data-kel="jumlah" data-i="${i}" value="${rp0(x.jumlah)}"></td>
              <td><button class="tombol kecil" data-hapuskel="${i}" title="Hapus">Hapus</button></td>
            </tr>`).join('') : `<tr><td colspan="3">Belum ada pengeluaran.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="aksi"><button class="tombol" id="btnKeluarBaru">Tambah pengeluaran</button></div>
        <p class="petunjuk">Uang yang keluar dari laci pulsa selain deposit. Tiap baris wajib ada keterangannya — tanpa keterangan tidak bisa disimpan, supaya selisih kas bisa ditelusuri.</p>
      </div>
      <div class="kartu">
        <h3>Foto buku catatan</h3>
        ${/* Tiap baris BISA DIBUKA. Daftar nama berkas yang tidak bisa
             dilihat isinya cuma memberi tahu bahwa fotonya pernah ada —
             padahal seluruh gunanya foto buku catatan adalah dibaca waktu
             angkanya dipertanyakan. Lewat server, bukan tautan Drive:
             foldernya tidak dibagikan, dan Head Admin tidak punya akun
             Google di sana. */''}
        ${foto.length ? `<ul class="daftar-rapat">${foto.map(f =>
          `<li><button class="tombol kecil" data-fotopulsa="${esc(f.file_id)}">Lihat</button>
             <span>${esc(f.nama_file)}</span>
             <span class="petunjuk">${Math.round((+f.ukuran || 0) / 1024)} KB · ${esc(waktuTampil(f.waktu_unggah))}</span></li>`).join('')}</ul>`
          : '<p class="pesan">Belum ada foto.</p>'}
        <input type="file" accept="image/*" capture="environment" id="spsFoto" class="sembunyi">
        <div class="aksi"><button class="tombol" id="btnFotoPulsa">Ambil / pilih foto</button></div>
        <p class="petunjuk">Foto dikecilkan dulu di perangkat sebelum dikirim, jadi tidak
           menghabiskan kuota. Hanya bisa diunggah selama shift berjalan — foto yang masuk
           sesudah shift ditutup tidak bisa dibedakan dari yang membetulkan cerita.</p>
      </div>
      <div class="kartu">
        <h3>Hasil hitung</h3>
        <div class="petak-mini petak-uang">
          ${miniSp('Total penjualan', rp(h.jual), 'dari kolom Penjualan')}
          ${miniSp('Modal saldo', rp(h.modal), 'konsumsi seluruh sumber')}
          ${miniSp('Margin laba', rp(h.margin), 'penjualan − modal − pengeluaran')}
          ${miniSp('Selisih kas', rp(selisih), 'fisik − sistem')}
        </div>
        ${ganjil.length ? `<p class="pesan galat"><strong>Perlu catatan sebelum ditutup:</strong>
           ${ganjil.join(' dan ')}. Periksa dulu angkanya — deposit yang terbaca sebagai saldo
           terpakai membuat modal melonjak melewati penjualan. Kalau angkanya memang benar,
           tulis sebabnya di bawah.</p>` : ''}
        <div class="grup"><label>Catatan${ganjil.length ? ' *' : ''}</label>
          <input type="text" id="spsCatatan" value="${esc(w._catatan || '')}"
                 placeholder="${ganjil.length ? 'wajib diisi' : 'boleh dikosongkan'}"></div>
      </div>
      <div id="spsMustahil"></div>
      <div class="kartu"><div class="aksi">
        <button class="tombol utama" id="btnTutupShiftPulsa">Kunci hitungan</button>
      </div></div>`;

    /* Digambar ulang pada CHANGE, bukan INPUT: menggambar ulang di tiap ketikan
       mencabut fokus dari kolom yang sedang diisi, dan yang mengisi kehilangan
       tempatnya di tengah angka. */
    w.querySelectorAll('.spsAngka').forEach(el => {
      el.addEventListener('change', () => { ubahAngkaShiftpulsa(el); gambarShiftpulsa(); });
    });
    w.querySelectorAll('.spsKel').forEach(el => {
      el.addEventListener('change', () => {
        const b = w._keluar[+el.dataset.i];
        if (!b) return;
        if (el.dataset.kel === 'jumlah') b.jumlah = angkaDari(el.value);
        else b.keterangan = el.value;
        gambarShiftpulsa();
      });
    });
    const cat = w.querySelector('#spsCatatan');
    if (cat) cat.addEventListener('input', () => { w._catatan = cat.value; });
    const fot = w.querySelector('#spsFoto');
    if (fot) fot.addEventListener('change', () => kirimFotoPulsa(fot, st));
  }

  /**
   * Kecilkan lalu kirim foto buku.
   *
   * Dikecilkan DI PERANGKAT, bukan dikirim apa adanya: foto HP sekarang 3–8 MB,
   * dan yang dibutuhkan cuma tulisan tangan di buku yang masih terbaca pada
   * 1280px. Mengirim aslinya menghabiskan kuota petugas dan menabrak batas
   * permintaan Apps Script.
   */
  async function kirimFotoPulsa(input, st) {
    const f = input.files && input.files[0];
    if (!f) return;
    input.value = '';
    try {
      toast('Mengecilkan foto…');
      const data = await kecilkanGambar(f, 1280, 0.72);
      await API.unggahFotoPulsa({
        id_shift: st.id_shift, nama_file: st.id_shift + '-buku.jpg',
        mime: 'image/jpeg', data
      });
      await muat('pulsa');
      toast('Foto tersimpan.');
    } catch (e) { toast(e.message, 'galat'); }
  }

  function kecilkanGambar(file, maksSisi, mutu) {
    return new Promise((selesai, gagalkan) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const skala = Math.min(1, maksSisi / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * skala);
        c.height = Math.round(img.height * skala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const url2 = c.toDataURL('image/jpeg', mutu);
        /* Yang dikirim base64 TELANJANG, tanpa awalan "data:image/jpeg;base64,".
           Awalan itu ikut terkirim akan membuat Utilities.base64Decode melempar,
           dan galatnya tidak menyebut sebabnya sama sekali. */
        selesai(url2.slice(url2.indexOf(',') + 1));
      };
      img.onerror = () => { URL.revokeObjectURL(url); gagalkan(new Error('Berkas ini bukan gambar yang bisa dibaca.')); };
      img.src = url;
    });
  }

  const miniSp = (label, nilai, ekor) =>
    `<div class="mini"><div class="mini-kepala"><div class="mini-label">${esc(label)}</div></div>` +
    `<div class="mini-nilai">${nilai}</div><div class="mini-ekor">${esc(ekor)}</div></div>`;

  /* Angka ditulis ke keadaan layar, BUKAN dibaca ulang dari DOM saat menyimpan.
     Membacanya dari DOM berarti satu kolom yang lupa dibaca mengirim nol tanpa
     satu pun tanda — dan nol di kolom saldo akhir melonjakkan modal. */
  function ubahAngkaShiftpulsa(el) {
    const w = $('#isiShiftpulsa');
    if (!w || !w._st) return;
    const v = angkaDari(el.value);
    const sp = el.dataset.sp;
    if (sp === 'kas_fisik') { w._kasFisik = v; }
    else if (sp === 'keluar') { w._keluar = v; }
    else { const s = (w._st.sumber || [])[+el.dataset.i]; if (s) s[sp] = v; }
  }

  /* ==================== SUMBER SALDO PULSA ====================
     Master sumber saldo — aplikasi multi payment dan provider resmi tempat
     saldo pulsa dibeli. Tahap 1 perpindahan pulsa ke POS (bagian 187).

     Layarnya sengaja polos: dua baris yang berubah setahun sekali tidak butuh
     saringan, ekspor, maupun mode nonaktif. Menambahkannya sekarang berarti
     merawat tiga hal yang tidak pernah dipakai siapa pun. */
  async function muatSumberpulsa() {
    memuat('#isiSumberpulsa');
    try {
      const d = await API.daftarSumberPulsa();
      $('#isiSumberpulsa')._rows = d.sumber || [];
      gambarSumberpulsa();
    } catch (e) { galat('#isiSumberpulsa', e); }
  }

  /* Dipisah dari render tabelnya semata supaya template literal tidak
     bersarang tiga lapis — yang bersarang begitu mudah salah dibaca. */
  const tombolUbahSumber = (kode) =>
    bolehIzin('pulsa', 'ubah')
      ? `<button class="tombol kecil" data-edit-sumber="${esc(kode)}" title="Ubah">`
        + `${ikonAlat('ubah')}<span>Ubah</span></button>`
      : '';

  function gambarSumberpulsa() {
    const w = $('#isiSumberpulsa');
    if (!w) return;
    const rows = w._rows || [];
    w.innerHTML = `
      <div class="kartu">
        <div class="bar-alat"><h3>Sumber saldo pulsa</h3><div style="flex:1"></div>
          ${bolehIzin('pulsa', 'ubah') ? tombolTambah('btnSumberBaru', 'Sumber baru') : ''}</div>
        <p class="petunjuk">Saldo awal, deposit, dan saldo akhir dicatat per sumber di tiap
           shift — selisihnya itulah modal pulsa yang terjual.</p>
        ${tabel([
          { judul: 'Kode', kunci: 'kode_sumber' },
          { judul: 'Nama', kunci: 'nama' },
          { judul: 'Jenis', kunci: 'jenis' },
          { judul: 'Cabang', render: r => String(r.cabang || '*') === '*' ? 'Semua cabang' : esc(String(r.cabang)) },
          { judul: 'Urutan', kunci: 'urutan' },
          { judul: '', render: r => tombolUbahSumber(r.kode_sumber) }
        ], rows, { kosong: 'Belum ada sumber saldo' })}
      </div>
      ${kartuPulsaPos()}
      ${kartuPulsa()}`;
    /* Kartu database dan sambungan pulsa tinggal di tab ini sejak bagian 247 —
       dulu di layar Sistem, terjepit di antara kelompok setelan toko dan tombol
       Simpan-nya. Izinnya tetap setting·lihat / setting·ubah, jadi petugas
       pulsa tidak melihat keduanya. */
    muatKeadaanPulsaPos();
    muatKeadaanPulsa();
  }

  function editorSumberpulsa(kode) {
    const s = kode ? ($('#isiSumberpulsa')._rows || []).find(x => x.kode_sumber === kode) : null;
    bukaModal(s ? 'Ubah sumber saldo' : 'Sumber saldo baru', `
      <div class="baris2">
        <div class="grup"><label>Kode *</label>
          <input type="text" id="spKode" value="${esc(s?.kode_sumber || '')}" ${s ? 'disabled' : ''} placeholder="MP01" maxlength="12"></div>
        <div class="grup"><label>Nama *</label><input type="text" id="spNama" value="${esc(s?.nama || '')}" placeholder="BOS PULSA"></div>
      </div>
      <div class="baris2">
        <div class="grup"><label>Jenis</label><select id="spJenis">
          ${['MULTI_PAYMENT', 'PROVIDER_RESMI'].map(j =>
            `<option value="${j}" ${String(s?.jenis || 'MULTI_PAYMENT') === j ? 'selected' : ''}>${j}</option>`).join('')}
        </select></div>
        <div class="grup"><label>Urutan</label><input type="text" id="spUrutan" value="${esc(String(s?.urutan ?? 99))}"></div>
      </div>
      <div class="grup"><label>Cabang</label><input type="text" id="spCabang" value="${esc(String(s?.cabang || '*'))}" placeholder="* atau SK01,SK02"></div>
      <p class="petunjuk">Isi <code>*</code> kalau sumber ini dipakai seluruh cabang, atau daftar
         kode cabang dipisah koma. Kode yang tidak dikenal ditolak server — salah ketik di
         sini baru terlihat berbulan-bulan kemudian sebagai sumber yang tidak pernah muncul
         di cabang mana pun.</p>
      ${s ? `<label class="cek"><input type="checkbox" id="spAktif" ${s.aktif === false ? '' : 'checked'}> Aktif</label>` : ''}`,
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanSumber">${ikonAlat('simpan')}<span>Simpan</span></button>`);
  }

  /**
   * Database pulsa milik POS — kartunya sendiri di menu Pulsa, tab Sumber Saldo.
   *
   * Berkasnya dibuat dari sini, SEKALI, bukan oleh `susulanRilis()`. Panggilan
   * pertama sesudah versi berganti sudah membayar 32,7 detik untuk memigrasikan
   * empat berkas yang ada (bagian 186) — melewati batas 30 detik di sisi klien —
   * dan menambahkan berkas kelima di sana membebani satu-satunya panggilan yang
   * paling tidak mampu menanggungnya.
   */
  function kartuPulsaPos() {
    if (!bolehIzin('setting', 'lihat')) return '';
    return `<div class="kartu">
      <div class="bar-alat"><h3>Database pulsa</h3></div>
      <p class="petunjuk">Berkas tempat POS mencatat shift pulsa, saldo per sumber, dan
         pengeluarannya. Terpisah dari database kasir maupun buku besar.</p>
      <div id="keadaanPulsaPos" class="pesan info">Memeriksa…</div>
      ${bolehIzin('setting', 'ubah')
        ? `<button class="tombol utama" id="btnSiapkanPulsaPos">Siapkan database pulsa</button>
           <p class="petunjuk">Aman ditekan berulang: yang sudah ada hanya disusulkan sheet
              atau kolom yang kurang, tidak satu pun baris data disentuh. Pembuatan berkas
              baru di Drive bisa memakan waktu sampai satu menit — jangan tutup jendela.</p>`
        : ''}
    </div>`;
  }

  async function muatKeadaanPulsaPos() {
    const el = $('#keadaanPulsaPos');
    if (!el) return;
    try {
      const k = await API.keadaanPulsaPos();
      if (!k.siap) {
        el.className = 'pesan';
        /* Tiga keadaan dibedakan — belum dibuat, dibuat tapi tidak terbaca, dan
           kurang sheet — karena ketiganya menuntut tindakan yang berbeda.
           Diringkas jadi satu pesan, dua di antaranya jadi salah (bagian 183). */
        el.textContent = !k.id ? 'Belum dibuat. Tekan tombol di bawah satu kali.'
          : k.pesan ? ('Berkasnya ada tapi tidak bisa dibuka: ' + k.pesan)
          : ('Sheet yang belum ada: ' + (k.sheet_kurang || []).join(', ') + '. Tekan tombol di bawah.');
        return;
      }
      el.className = 'pesan sukses';
      el.textContent = 'Siap. ' + (k.jumlah_sumber
        ? (k.jumlah_sumber + ' sumber saldo terdaftar.')
        : 'Belum ada sumber saldo — isi di tabel di atas.');
    } catch (e) {
      el.className = 'pesan galat';
      el.textContent = e.message;
    }
  }

  function kartuPulsa() {
    if (!bolehIzin('setting', 'lihat')) return '';
    return `<div class="kartu">
      <div class="bar-alat"><h3>Laporan Pulsa</h3></div>
      <p class="petunjuk">Sumber kedua buku konsolidasi. POS <strong>membaca</strong>
         spreadsheet Laporan Pulsa — tidak pernah menulis ke sana. Yang dibaca sheet
         <code>Shift</code> mentah, bukan Rekap, supaya angkanya tidak bergantung pada
         siapa pun yang ingat menekan tombol Refresh di spreadsheet itu.</p>
      <div id="keadaanPulsa" class="pesan info">Memeriksa sambungan…</div>
      ${bolehIzin('setting', 'ubah') ? `
        <label>Id spreadsheet Laporan Pulsa</label>
        <input type="text" id="idPulsa" placeholder="tempel id di sini">
        <p class="petunjuk">Buka spreadsheet Laporan Pulsa, lihat alamatnya di peramban.
           Id-nya bagian panjang di antara <code>/d/</code> dan <code>/edit</code>.</p>
        <button class="tombol utama" id="btnSetupPulsa">Sambungkan &amp; periksa</button>` : ''}
    </div>`;
  }

  async function muatKeadaanPulsa() {
    const el = $('#keadaanPulsa');
    if (!el) return;
    try {
      const k = await API.keadaanPulsa();
      if (!k.tersetel) {
        el.className = 'pesan';
        el.textContent = 'Belum tersambung. Isi id spreadsheet di bawah.';
        return;
      }
      if (!k.sehat) {
        el.className = 'pesan galat';
        el.textContent = 'Tersetel, tapi tidak bisa dibaca: ' + (k.pesan || '');
        return;
      }
      if ($('#idPulsa')) $('#idPulsa').value = k.id;
      /* NOL dijelaskan, tidak dibiarkan berdiri sendiri. "Rp 0" tanpa kalimat
         ini terbaca sebagai omzet nol, padahal artinya belum ada shift yang
         ditutup — dua hal yang jauh berbeda akibatnya. */
      el.className = k.shift_tutup ? 'pesan sukses' : 'pesan';
      el.innerHTML = k.shift_tutup
        ? `Tersambung. <strong>${k.shift_tutup}</strong> shift tertutup
           (${esc(tglTampil(k.tanggal_awal))} s.d. ${esc(tglTampil(k.tanggal_akhir))}), total penjualan
           <strong>${rp(k.total_penjualan)}</strong>.`
        : 'Tersambung, strukturnya sah — tetapi <strong>belum ada satu pun shift yang ditutup</strong> di sana. ' +
          'Jadi belum ada yang bisa dikonsolidasikan; ini bukan sambungan yang rusak.';
    } catch (e) {
      el.className = 'pesan galat';
      el.textContent = e.message;
    }
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
  /* Ikon kelompok setelan. Kamusnya PINDAH ke pos.js v1.177 — lihat catatan
     di IKON_KPI di atas. */
  const ikonSetting = (id) =>
    `<svg class="ikon-svg" viewBox="0 0 24 24" aria-hidden="true">${IKON[id] || ''}</svg>`;

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
        <div class="kartu"><p class="petunjuk">Setelan toko: nama usaha, pajak, struk, dan tampilan. Perubahan berlaku untuk seluruh cabang dan sampai ke perangkat kasir dalam beberapa menit.</p></div>
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

  /* ==================== GALAT APLIKASI (bagian 219) ====================
   *
   * Tab kedua di layar Audit, bukan menu sendiri: menu Audit sudah ada,
   * izinnya sudah ada, dan isinya memang "apa yang terjadi di sistem".
   *
   * Yang dipajang JENIS galat, bukan kejadiannya. Satu bug yang mengamuk 500
   * kali muncul sebagai satu baris berangka 500 — daftar yang menumpuk 500
   * baris yang sama memaksa orang membacanya satu per satu untuk sadar itu
   * masalah yang sama.
   */
  const TAB_AUDIT = [['jejak', 'Jejak audit'], ['galat', 'Galat aplikasi']];

  async function muatAudit(tab) {
    const w = $('#isiAudit');
    if (!w) return;
    const aktif = tab || w._tab || 'jejak';
    w._tab = aktif;
    w.innerHTML = `
      <div class="kartu">
        <div class="tab-modal" id="tabAudit" role="group" aria-label="Bagian audit"
             style="margin-bottom:0">
          ${TAB_AUDIT.map(([id, label]) =>
            `<button type="button" data-tabaudit="${id}" class="${id === aktif ? 'aktif' : ''}">${esc(label)}</button>`).join('')}
        </div>
        <p class="petunjuk">Jejak siapa mengubah apa, dan kerusakan aplikasi yang tidak terlihat. Tidak bisa dihapus dari dalam aplikasi.</p>
      </div>
      <div id="hasilAudit"></div>`;
    /* Dua baris `if` + `return`, bukan ternary. Penjaga "rantai menu → API →
       izin" menelusuri layar bertab dengan mencari pemuat tab yang dikembalikan
       langsung; ternary memutus penelusurannya. Bentuknya sama persis dengan
       layar Pulsa. */
    if (aktif === 'galat') return muatGalatAudit();
    return muatJejakAudit();
  }

  async function muatJejakAudit() {
    memuat('#hasilAudit');
    try {
      const rows = await API.logAudit({ batas: 300 });
      $('#hasilAudit').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3>Jejak audit</h3>
            <div style="flex:1"></div>${menuEkspor('audit')}</div>
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
    } catch (e) { galat('#hasilAudit', e); }
  }

  async function muatGalatAudit() {
    memuat('#hasilAudit');
    try {
      const d = await API.logGalat({ batas: 200 });
      const rows = d.galat || [];
      const bolehTandai = bolehIzin('audit', 'ubah');

      /* Kosong di sini kabar BAIK, dan kalimatnya harus mengatakan itu.
         "Belum ada data" terbaca seperti fitur yang belum jalan — dan orang
         yang membacanya begitu akan berhenti mempercayainya justru saat ia
         benar-benar kosong karena tidak ada yang rusak. */
      const kosong = `<p class="petunjuk">Tidak ada galat yang tercatat. Ini kabar baik:
         artinya tidak ada satu pun kerusakan diam-diam sejak catatan ini dimulai.</p>`;

      const baris = (r) => `<tr>
        <td data-l="Terakhir">${esc(waktuTampil(r.waktu_terakhir))}
          <span class="petunjuk" style="display:block">pertama ${esc(waktuTampil(r.waktu_pertama))}</span></td>
        <td data-l="Galat">${boolOf(r.dibaca) ? '' : lencanaDash('baru', 'merah') + ' '}<strong>${esc(r.pesan)}</strong>
          <span class="petunjuk" style="display:block">${esc(r.sumber || '—')}${
            r.layar ? ' · layar ' + esc(r.layar) : ''}${r.versi ? ' · v' + esc(r.versi) : ''}${
            /* Perangkatnya disebut (bagian 231): nama kalau ada, id kalau perangkatnya sudah dihapus. */
            r.id_perangkat || r.nama_perangkat ? ' · perangkat ' + esc(r.nama_perangkat || r.id_perangkat) : ''}</span></td>
        <td class="kanan" data-l="Kali">${esc(String(r.jumlah))}</td>
        <td data-l="Cabang">${esc(r.cabang || '')}</td>
        <td>${bolehTandai && !boolOf(r.dibaca)
          ? tombolBaris('', 'Tandai sudah diperiksa', IKON.setujui, `data-galat-baca="${esc(r.sidik)}"`) : ''}</td>
      </tr>`;

      $('#hasilAudit').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3>Galat aplikasi</h3>
            <div style="flex:1"></div>
            ${bolehTandai && d.belum ? `<button class="tombol" id="btnGalatSemua">
                ${ikonAlat('setujui')}<span>Tandai semua diperiksa</span></button>` : ''}</div>
          <p class="petunjuk">Kerusakan yang TIDAK terlihat siapa pun — tombol yang ditekan tanpa
             terjadi apa-apa, layar yang berhenti di tengah. Yang sudah muncul sebagai pesan merah
             ke petugas tidak dicatat di sini. Satu baris per jenis; kolom Kali menghitung
             berapa kali ia terulang.</p>
          ${rows.length ? `<div class="gulir-x"><table class="tabel">
            <thead><tr><th>Terakhir</th><th>Galat</th><th class="kanan">Kali</th>
              <th>Cabang</th><th></th></tr></thead>
            <tbody>${rows.map(baris).join('')}</tbody></table></div>` : kosong}
        </div>`;
    } catch (e) { galat('#hasilAudit', e); }
  }

  async function tandaiGalat(sidik) {
    await API.tandaiGalatDibaca(sidik ? { sidik } : {});
    /* Lencana nav ikut disegarkan — angka yang masih menyala sesudah
       dibereskan membuat orang berhenti mempercayainya.

       Lewat PERISTIWA, bukan memanggil `tarikLencanaNav` langsung: fungsi
       itu milik app.js, dan admin.js tidak boleh menambah ketergantungan
       baru padanya — ada penjaga yang menuntut itu, dan alasannya app.js
       ikut dimuat layar Kasir sementara admin.js tidak. */
    document.dispatchEvent(new CustomEvent('possk:segarkan-lencana'));
    return muatGalatAudit();
  }

  /* ==================== LAPORAN DISKON ====================
   * Diskon adalah satu-satunya cara kasir bisa mengurangi uang masuk tanpa
   * menyentuh stok. Tanpa layar ini, satu-satunya cara menemukan pola yang
   * ganjil adalah membuka nota satu per satu — yang berarti tidak akan pernah
   * dilakukan. Urutannya sengaja dari rupiah terbesar, bukan terbaru.
   */
  const PERIODE_DISKON = { id: 'dskPeriode', dari: 'dskDari', sampai: 'dskSampai', nilai: 'bulan', judul: 'Periode diskon' };
  async function muatDiskon() {
    if (!$('#dskDari')) {
      /* v1.182: dropdown periode (komponen Periode), bawaan Bulan ini, memuat
         sendiri — tidak ada tombol Tampilkan. */
      $('#isiDiskon').innerHTML = `
        <div class="kartu">
          <div class="bar-alat dua-kendali">
            ${Periode.html(PERIODE_DISKON)}
          </div>
          <p class="petunjuk">Persentase dihitung dari total diskon (baris + nota) terhadap nilai bruto.
            Kolom <strong>Disetujui</strong> berisi nama atasan yang menyetujui diskon di atas batas peran kasirnya.</p>
        </div>
        <div id="hasilDiskon"></div>`;
      Periode.pasang(PERIODE_DISKON, gambarHasilDiskon);
    }
    gambarHasilDiskon();
  }

  async function gambarHasilDiskon() {
    const w = $('#hasilDiskon');
    if (!w) return;
    /* Bentuk asli diingat (bagian 262); rangka di bawah untuk pembukaan pertama. */
    Rangka.pasang(w, `<div class="petak petak-4" aria-busy="true" aria-label="Memuat diskon">
        ${Array.from({ length: 4 }, () => `<div class="kartu statistik">
          <div class="label"><span class="rangka" style="width:70px"></span></div>
          <div class="nilai"><span class="rangka tinggi" style="width:100px"></span></div></div>`).join('')}
      </div>
      <div class="kartu" aria-busy="true">
        ${rangkaBaris(6, ['86%', '68%', '78%', '62%'])}
      </div>`, '#hasilDiskon');
    try {
      const d = await API.laporanDiskon({ dari: $('#dskDari').value, sampai: $('#dskSampai').value });
      const r = d.ringkas;
      w.innerHTML = `
        <div class="petak petak-uang">
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
          <div class="bar-alat"><h3>Per kasir</h3>
            <div style="flex:1"></div>${menuEkspor('diskon_kasir', { dari: $('#dskDari').value, sampai: $('#dskSampai').value })}</div>
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
            ${bolehIzin('transfer', 'buat') ? tombolTambah('btnTransferBaru', 'Kirim barang') : ''}
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
            /* Cetak LANGSUNG di baris (bagian 262) — dulu hanya di dalam jendela
               rinciannya, dan pemilik tidak menemukannya. Pembuat tombol yang
               sama dengan Batal, supaya setinggi. */
            { judul: '', render: r => `<div class="aksi-baris">${tombolBaris('', 'Cetak', IKON.cetak,
                `data-cetak-transfer="${esc(r.uuid)}"`, 'Cetak bukti transfer dengan kolom tanda tangan')}${
              r.status === 'DIKIRIM' && r.cabang_asal === APP_STATE.cabang && bolehIzin('transfer', 'hapus')
                ? tombolBaris('bahaya', 'Batal', IKON.batal, `data-batal-transfer="${esc(r.uuid)}"`) : ''}</div>` }
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanTransfer">${ikonAlat('kirim')}<span>Kirim</span></button>`);
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol sukses" id="btnKonfirmasiTerima" data-uuid="${esc(uuid)}">${ikonAlat('terima')}<span>Konfirmasi terima</span></button>`);
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Tutup</span></button>
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
      ${/* Tanda tangan (bagian 262, pilihan pemilik): Pengirim · Penerima ·
           Disetujui. Nama terisi bila sudah tercatat; kotak Disetujui untuk
           Owner / Head Admin, dikosongkan untuk ditandatangani tangan. */ ''}
      <table class="ttd"><tr>
        <td><div class="peran">Pengirim</div><div class="cab">${esc(t.cabang_asal)}</div><div class="garis"></div>
          <div class="nama">${esc(t.user_kirim || '')}&nbsp;</div></td>
        <td><div class="peran">Penerima</div><div class="cab">${esc(t.cabang_tujuan)}</div><div class="garis"></div>
          <div class="nama">${esc(t.tanggal_terima ? (t.user_terima || '') : '')}&nbsp;</div></td>
        <td><div class="peran">Disetujui</div><div class="cab">Owner / Head Admin</div><div class="garis"></div>
          <div class="nama">&nbsp;</div></td>
      </tr></table>
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

  /* ==================== PEMBATALAN (pengajuan void) ==================== */

  const LENCANA_MINTA_VOID = {
    MENUNGGU: 'kuning', DISETUJUI: 'hijau', DITOLAK: '', DITARIK: ''
  };

  /* Nomor nota dan sepasang tombol tidak boleh pecah dua baris. Di lebar tablet
     keduanya melakukannya: "Setujui" menumpuk di atas "Tolak", dan nomor nota
     terbelah di tengah. Ditahan di sini, bukan di app.css — yang butuh cuma dua
     sel di satu tabel, dan aturan global akan memaksa tabel lain ikut melebar. */
  const _takPecah = (isi) => '<span style="white-space:nowrap">' + isi + '</span>';

  async function muatPembatalan() {
    memuat('#isiPembatalan');
    try {
      const rows = await API.daftarMintaVoid({});
      const bolehPutus = bolehIzin('void', 'setujui');
      const bolehAjukan = bolehIzin('void', 'buat');

      /* Disaring dengan `bisa_diputus` dari SERVER, bukan dihitung di sini —
         aturan "penyetuju tidak boleh peminta" hanya boleh tinggal di satu
         tempat. Pola yang sama dipakai layar Permintaan. */
      /* Saringan cabang (bagian 262): '*' = semua. */
      const cabP = bolehPilihCabang() ? (cabangLayar.pembatalan || '*') : '*';
      const rowsC = cabP === '*' ? rows : rows.filter(r => String(r.cabang) === cabP);
      const antre = rowsC.filter(r => r.bisa_diputus);
      const riwayat = rowsC.filter(r => !r.bisa_diputus);

      $('#isiPembatalan').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            ${pilihCabangHtml('pembatalan', true)}
            ${antre.length ? `<span class="lencana kuning">${antre.length} menunggu keputusan</span>` : ''}
            <div style="flex:1"></div>
            ${bolehAjukan ? tombolTambah('btnAjukanVoid', 'Ajukan pembatalan') : ''}
          </div>
          <p class="petunjuk">${bolehPutus
            ? `Kasir mengajukan pembatalan dari akunnya sendiri; Anda yang memutuskan. Nota baru benar-benar
               batal <strong>setelah disetujui</strong> — stok kembali ke lapisan asalnya, jurnal dibalik penuh,
               piutang dan klaim petugasnya ikut dibatalkan. Tidak bisa diurungkan.`
            : `Anda tidak membatalkan nota sendiri. Ajukan di sini, lalu admin gudang atau Head Admin yang
               memutuskan — hasilnya muncul di tabel ini. Selama masih menunggu, pengajuan boleh ditarik.`}</p>
          <p class="petunjuk">Untuk barang yang <strong>benar terjual lalu dikembalikan</strong>, pakai
            <strong>Retur</strong>, bukan pembatalan. Pembatalan hanya untuk nota yang memang salah dibuat.</p>
        </div>

        ${bolehPutus ? `<div class="kartu">
          <h3>Menunggu keputusan</h3>
          ${tabel([
            { judul: 'Nota', render: r => _takPecah('<strong>' + esc(r.no_nota) + '</strong>') },
            { judul: 'Cabang', render: r => `<span class="lencana">${esc(r.cabang)}</span>` },
            { judul: 'Nilai', angka: true, render: r => rp(r.total) },
            { judul: 'Diajukan', render: r => `${esc(r.nama_peminta)}
              <div class="meta-kecil">${esc(waktuTampil(r.waktu_minta))}</div>` },
            { judul: 'Alasan', kunci: 'alasan' },
            { judul: '', render: r => _takPecah(
              `<button class="tombol kecil sukses" data-setujui-void="${esc(r.uuid)}">Setujui</button>
               <button class="tombol kecil bahaya" data-tolak-void="${esc(r.uuid)}">Tolak</button>`) }
          ], antre, { kosong: 'Tidak ada yang menunggu keputusan Anda' })}
        </div>` : ''}

        <div class="kartu">
          <h3>${bolehPutus ? 'Riwayat pengajuan' : 'Pengajuan saya'}</h3>
          ${tabel([
            { judul: 'Nota', render: r => _takPecah(esc(r.no_nota)) },
            { judul: 'Nilai', angka: true, render: r => rp(r.total) },
            { judul: 'Diajukan', render: r => `${esc(r.nama_peminta)}
              <div class="meta-kecil">${esc(waktuTampil(r.waktu_minta))}</div>` },
            { judul: 'Alasan', kunci: 'alasan' },
            { judul: 'Status', render: r => `<span class="lencana ${LENCANA_MINTA_VOID[r.status] || ''}">${esc(r.status)}</span>
              ${r.status === 'DITOLAK' && r.alasan_tolak
                ? `<div class="meta-kecil">${esc(r.alasan_tolak)}</div>` : ''}
              ${r.id_penyetuju ? `<div class="meta-kecil">oleh ${esc(r.nama_penyetuju)}</div>` : ''}` },
            { judul: '', render: r => r.bisa_ditarik
              ? `<button class="tombol kecil" data-tarik-void="${esc(r.uuid)}">Tarik</button>` : '' }
          ], riwayat, { kosong: bolehPutus ? 'Belum ada pengajuan' : 'Anda belum pernah mengajukan pembatalan' })}
        </div>`;
    } catch (e) { galat('#isiPembatalan', e); }
  }

  /* Pencari nota untuk pengajuan. Bentuknya sengaja sama dengan formVoid() —
     orang yang sudah terbiasa dengan satu tidak perlu belajar yang lain. */
  function formAjukanVoid() {
    bukaModal('Ajukan pembatalan nota', `
      <p class="petunjuk">Cari notanya, lalu tulis alasannya. Pengajuan Anda masuk ke antrean admin gudang
        dan Head Admin — notanya <strong>belum berubah apa pun</strong> sampai mereka menyetujui.</p>
      <div class="grup">
        <label>Cari nota (nomor nota atau nama pelanggan)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="ajukanCari" placeholder="mis. SK01-A3F/2609/00042">
          <button class="tombol utama" id="btnCariNotaAjukan" style="flex:0 0 auto">${ikonAlat('cari')}<span>Cari</span></button>
        </div>
      </div>
      <div id="hasilCariNotaAjukan"></div>`,
      ('<button class="tombol" data-tutup="1">' + ikonAlat('batal') + '<span>Tutup</span></button>'));
  }

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
              ? tombolTambah('btnPermintaanBaru', 'Minta barang') : ''}
          </div>
          <p class="petunjuk">Daftar barang yang diminta cabang ke gudang. Gudang yang menyiapkan; stok baru berpindah saat kirimannya dicatat. Ini <strong>daftar pekerjaan untuk gudang</strong>, bukan transaksi:
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnSimpanPermintaan">${ikonAlat('kirim')}<span>Kirim permintaan</span></button>`);
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol sukses" id="btnKonfirmasiProses" data-uuid="${esc(uuid)}">${ikonAlat('kirim')}<span>Siapkan &amp; kirim</span></button>`);
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
  /* Pemindai opname (bagian 237). `pindaiPeta` dibangun sekali per jendela dari
     katalog perangkat: barcode produk → barcode varian → SKU, urutan yang sama
     dengan Kasir. `hitunganBerubah` = SKU yang angkanya berubah sejak simpan
     terakhir — HANYA itu yang dikirim. Mengirim seluruh daftar tiap simpan
     berarti pada pindaian ke-2.000 tiap simpan mengirim 2.000 baris lagi, dan
     server membaca ulang seluruh peta stok cabang untuk tiap panggilan.
     Nilainya nomor urut perubahan: pindaian yang datang SELAMA simpan berjalan
     tidak kehilangan tandanya oleh simpan yang sudah lewat.
     `PINDAI_ATUR` boleh ditimpa lewat window.PINDAI_ATUR — untuk uji, supaya
     "30 detik sunyi" tidak harus benar-benar ditunggu 30 detik. */
  const PINDAI_ATUR = Object.assign({ sunyi: 30000, batas: 200 }, window.PINDAI_ATUR || {});
  let pindaiPeta = null;
  const hitunganBerubah = new Map();
  let urutUbah = 0, pindaiSejakSimpan = 0, pindaiTimer = null, sedangSimpan = false, simpanTertunda = false;

  /* ==================== PILIHAN CABANG PER LAYAR (bagian 262) ====================
     Pemilik 25 Sep 2026: "menu opname ... perlu dropdown menu cabang. kenapa sih
     saya sebagai owner seperti terkunci di sk01". Opname, Retur Jual, Retur Beli
     dan Pembatalan memakai cabang SESI (pilihan di pojok kanan atas), padahal
     servernya sudah menerima cabang lain untuk akun lintas cabang (wajibCabang).
     Hanya untuk akun lintas cabang dengan >1 cabang; yang lain tetap melihat
     lencana cabangnya seperti dulu. Pilihannya diingat per layar selama sesi.
     Pembatalan memakai "Semua cabang" sebagai saringan (servernya memang sudah
     mengirim semua cabang untuk akun lintas). */
  const cabangLayar = {};
  const bolehPilihCabang = () => !!(APP_STATE.flag && APP_STATE.flag.akses_lintas_cabang) && daftarKodeCabang().length > 1;
  const cabangDari = (layar) => {
    const v = bolehPilihCabang() ? cabangLayar[layar] : '';
    return v && v !== '*' ? v : APP_STATE.cabang;
  };
  function pilihCabangHtml(layar, denganSemua) {
    if (!bolehPilihCabang()) return `<span class="lencana">Cabang ${esc(APP_STATE.cabang)}</span>`;
    const nilai = cabangLayar[layar] || (denganSemua ? '*' : APP_STATE.cabang);
    return `<select class="kendali-tetap" data-cabang-layar="${layar}" title="Cabang" aria-label="Cabang">` +
      (denganSemua ? `<option value="*"${nilai === '*' ? ' selected' : ''}>Semua cabang</option>` : '') +
      daftarKodeCabang().map((k) => `<option value="${esc(k)}"${k === nilai ? ' selected' : ''}>${esc(k)}</option>`).join('') +
      '</select>';
  }
  document.addEventListener('change', (e) => {
    const sel = e.target.closest && e.target.closest('[data-cabang-layar]');
    if (!sel) return;
    cabangLayar[sel.dataset.cabangLayar] = sel.value;
    API.tugas(() => muat(sel.dataset.cabangLayar), { baca: true });
  });

  async function muatOpname() {
    memuat('#isiOpname');
    try {
      const rows = await API.daftarOpname({ cabang: cabangDari('opname') });
      const berjalan = rows.find(r => r.status === 'DRAFT' || r.status === 'REVIEW');
      const punyaNilai = rows.some(r => r.nilai_selisih !== undefined);

      $('#isiOpname').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            ${pilihCabangHtml('opname')}
            <div style="flex:1"></div>
            ${berjalan
              ? `<button class="tombol utama" data-lanjut-opname="${esc(berjalan.uuid)}">
                   Lanjutkan ${esc(berjalan.no_dokumen)} (${esc(berjalan.status)})</button>`
              : tombolTambah('btnOpnameBaru', 'Mulai opname')}
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
                    ? rp(r.nilai_selisih)   /* minus merah penuh lewat rp() (bagian 256) */
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
      `<button class="tombol" data-tutup="1">${ikonAlat('batal')}<span>Batal</span></button>
       <button class="tombol utama" id="btnMulaiOpname">${ikonAlat('jalankan')}<span>Mulai menghitung</span></button>`);
  }

  async function bukaLayarHitung(uuid) {
    bukaModal('Menyiapkan daftar barang', rangkaBaris(8, ['80%', '62%', '72%', '54%']));
    try {
      const d = await API.detailOpname({ uuid, cabang: cabangDari('opname') });
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
        <input type="text" class="input-cari" id="opPindai" placeholder="Pindai barcode / SKU…" autocomplete="off" style="max-width:260px">
        <label class="op-kelipatan" style="margin:0" title="Jumlah yang ditambahkan pada pindaian berikutnya, lalu kembali ke 1">×
          <input type="number" id="opKelipatan" value="1" min="1" style="width:64px"></label>
        <input type="text" class="input-cari" id="opCari" placeholder="Saring daftar…" style="max-width:200px">
      </div>
      <p class="petunjuk" id="opPindaiInfo">Pindai label barang: hitungan barisnya naik 1 tiap pindaian, dan tersimpan sendiri saat pemindaian berhenti.</p>
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
       <button class="tombol utama" id="btnSelesaiHitung" data-uuid="${esc(d.uuid)}">${ikonAlat('setujui')}<span>Selesai menghitung</span></button>`);
    siapkanPindai();
  }

  /** Peta pencocokan pemindai dari katalog perangkat, dibangun sekali per jendela. */
  async function siapkanPindai() {
    hitunganBerubah.clear(); pindaiSejakSimpan = 0;
    clearTimeout(pindaiTimer); pindaiTimer = null;
    sedangSimpan = false; simpanTertunda = false;
    pindaiPeta = null;
    $('#opPindai')?.focus();
    const barcode = new Map(), sku = new Map(), nama = new Map();
    try {
      (await DB.all('produk')).forEach(p => {
        const kodeSku = String(p.sku || '');
        if (!kodeSku) return;
        sku.set(kodeSku.toLowerCase(), { sku: kodeSku, kode: '' });
        nama.set(kodeSku, String(p.nama || kodeSku));
        /* Satu barcode bisa dipakai lebih dari satu produk (barcode pabrik yang
           sama untuk dua SKU): semuanya disimpan, dan yang ganda DITANYA di
           pindaiOpname, bukan ditebak — salah pilih di sini berarti selisih
           opname pada barang yang tidak pernah disentuh. */
        const b = String(p.barcode || '').trim().toLowerCase();
        if (b) barcode.set(b, (barcode.get(b) || []).concat([{ sku: kodeSku, kode: '' }]));
        (p.varian || []).forEach(v => {
          const bv = String(v.barcode || '').trim().toLowerCase();
          if (bv) barcode.set(bv, (barcode.get(bv) || []).concat([{ sku: kodeSku, kode: String(v.kode || '') }]));
        });
      });
    } catch (e) {
      const info = $('#opPindaiInfo');
      if (info) info.textContent = 'Katalog di perangkat ini tidak terbaca, pemindai tidak bisa mencocokkan kode: ' + e.message;
    }
    pindaiPeta = { barcode, sku, nama };
  }

  function perbaruiProgresHitung() {
    const semua = $$('[data-hitung]');
    const terisi = semua.filter(i => String(i.value).trim() !== '').length;
    const el = $('#opProgres');
    if (el) el.textContent = `${terisi} / ${semua.length} dihitung`;
  }

  /**
   * Satu pindaian = satu label barang. Barcode dulu (produk, lalu varian), baru
   * SKU — label toko dicetak dari SKU untuk barang tanpa barcode pabrik. Yang
   * ketemu di daftar: angkanya naik `× jumlah` (bawaan 1), barisnya menyala dan
   * digulir ke tampilan, lalu fokus kembali ke kotak pindai supaya mesin bisa
   * menembak terus tanpa tangan menyentuh layar. Ada di katalog tapi di luar
   * daftar dokumen: barisnya ditambahkan di atas — server menerima SKU apa pun,
   * dan barang yang nyata di rak harus terhitung, bukan ditolak.
   */
  function pindaiOpname(kodeMentah) {
    const kode = String(kodeMentah || '').trim();
    const q = kode.toLowerCase();
    const info = $('#opPindaiInfo');
    if (!q) return;
    if (!pindaiPeta) { toast('Katalog masih disiapkan, pindai sekali lagi.', 'galat'); return; }
    const calon = pindaiPeta.barcode.get(q) || (pindaiPeta.sku.has(q) ? [pindaiPeta.sku.get(q)] : null);
    if (!calon) {
      toast(`Kode ${kode} tidak dikenal di katalog.`, 'galat');
      if (info) info.textContent = `Kode ${kode} tidak dikenal — angka tidak diubah.`;
      return;
    }
    if (calon.length > 1) {
      const daftar = calon.map(c => pindaiPeta.nama.get(c.sku) || c.sku).join(', ');
      toast(`Barcode ${kode} dipakai ${calon.length} produk (${daftar}). Isi lewat kolom Fisik.`, 'galat');
      if (info) info.textContent = `Barcode ${kode} ganda: ${daftar} — angka tidak diubah.`;
      return;
    }
    const t = calon[0];
    let inp = $$('[data-hitung]').find(i => i.dataset.hitung === t.sku);
    if (!inp) {
      const nm = pindaiPeta.nama.get(t.sku) || t.sku;
      const tbody = $('#wadahHitung tbody');
      if (!tbody) return;
      tbody.insertAdjacentHTML('afterbegin', `
            <tr data-baris-hitung data-sku="${esc(t.sku)}" data-nama="${esc(nm.toLowerCase())}">
              <td>${esc(nm)}<div class="meta-kecil">${esc(t.sku)} · di luar cakupan, ditambahkan dari pindaian</div></td>
              ${opnameAktif && opnameAktif.buta ? '' : '<td class="angka">—</td>'}
              <td><input type="number" data-hitung="${esc(t.sku)}" value="" min="0" placeholder="—"></td>
            </tr>`);
      inp = $$('[data-hitung]').find(i => i.dataset.hitung === t.sku);
      if (!inp) return;
    }
    const kelInp = $('#opKelipatan');
    const kel = Math.max(1, Math.floor(Number(kelInp && kelInp.value) || 1));
    inp.value = (Number(inp.value) || 0) + kel;
    inp.classList.add('sudah-hitung');
    hitunganBerubah.set(t.sku, ++urutUbah);
    if (kelInp) kelInp.value = 1;
    const tr = inp.closest('tr');
    if (tr) {
      tr.classList.remove('baris-pindai'); void tr.offsetWidth; tr.classList.add('baris-pindai');
      tr.style.display = '';
      tr.scrollIntoView({ block: 'nearest' });
    }
    if (info) info.textContent = `${pindaiPeta.nama.get(t.sku) || t.sku}${t.kode ? ' (' + t.kode + ')' : ''} · ${inp.value} pcs${kel > 1 ? ' (+' + kel + ')' : ''}`;
    perbaruiProgresHitung();
    pindaiSejakSimpan++;
    jadwalkanSimpanOtomatis();
    $('#opPindai')?.focus();
  }

  /* Simpan sendiri saat pemindaian BERHENTI (sunyi), atau paling lambat tiap
     `batas` pindaian — bukan tiap N pindaian kecil: dengan ribuan barang, tiap
     panggilan simpan itu berat di server (peta stok cabang dibaca ulang). */
  function jadwalkanSimpanOtomatis() {
    clearTimeout(pindaiTimer); pindaiTimer = null;
    if (pindaiSejakSimpan >= PINDAI_ATUR.batas) { simpanHitunganBerubah(null); return; }
    pindaiTimer = setTimeout(() => { pindaiTimer = null; simpanHitunganBerubah(null); }, PINDAI_ATUR.sunyi);
  }

  /**
   * Kirim HANYA baris yang berubah sejak simpan terakhir — dipakai tombol
   * Simpan sementara maupun simpan otomatis. Berjalan di latar: pindaian yang
   * datang selama simpan berjalan menunggu giliran berikutnya, tidak tertelan
   * dan tidak membuat petugas menunggu.
   */
  async function simpanHitunganBerubah(tombol) {
    const d = opnameAktif;
    if (!d) return;
    const terisi = hitunganTerisi();
    if (tombol && !terisi.length) return toast('Belum ada satu pun yang diisi.', 'galat');
    const kirim = terisi.filter(i => hitunganBerubah.has(i.sku));
    if (!kirim.length) { if (tombol) toast('Tidak ada perubahan sejak simpan terakhir.'); return; }
    if (sedangSimpan) { simpanTertunda = true; return; }
    const versi = new Map(kirim.map(i => [i.sku, hitunganBerubah.get(i.sku)]));
    sedangSimpan = true;
    if (tombol) tombol.disabled = true;
    try {
      const r = await API.simpanHitungan({ uuid: d.uuid, cabang: cabangDari('opname'), item: kirim });
      versi.forEach((v, kodeSku) => { if (hitunganBerubah.get(kodeSku) === v) hitunganBerubah.delete(kodeSku); });
      pindaiSejakSimpan = 0;
      toast(tombol
        ? `${r.tersimpan} hitungan tersimpan. Stok sistem dikunci pada ${jamTampil(r.waktu_kunci)}.`
        : `Tersimpan sendiri: ${r.tersimpan} baris.`);
    } catch (x) { toast(x.message, 'galat'); }
    finally {
      sedangSimpan = false;
      if (tombol) tombol.disabled = false;
      if (simpanTertunda) { simpanTertunda = false; simpanHitunganBerubah(null); }
    }
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
        ? ('<button class="tombol" data-tutup="1">' + ikonAlat('batal') + '<span>Tutup</span></button>')
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
      const rows = await API.daftarRetur({ cabang: cabangDari('retur') });
      $('#isiRetur').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            ${pilihCabangHtml('retur')}
            <div style="flex:1"></div>
            ${bolehIzin('penjualan', 'ubah') && APP_STATE.flag.void_transaksi
              ? '<button class="tombol bahaya" id="btnVoidNota">Void nota</button>' : ''}
            ${tombolTambah('btnReturBaru', 'Retur baru')}
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
                ? rp(r.selisih)   /* minus merah penuh lewat rp() (bagian 256) */
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
          <button class="tombol utama" id="btnCariNotaVoid" style="flex:0 0 auto">${ikonAlat('cari')}<span>Cari</span></button>
        </div>
      </div>
      <div id="hasilCariNotaVoid"></div>`,
      ('<button class="tombol" data-tutup="1">' + ikonAlat('batal') + '<span>Tutup</span></button>'));
  }

  function formRetur() {
    lepasUuidDokumen('retur');       // dokumen BARU — lihat uuidDokumen()
    notaTerpilih = null;
    bukaModal('Retur baru', `
      <div class="grup">
        <label>Cari nota asal (nomor nota atau nama pelanggan)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="returCari" placeholder="mis. SK01-A3F/2608/00042">
          <button class="tombol utama" id="btnCariNota" style="flex:0 0 auto">${ikonAlat('cari')}<span>Cari</span></button>
        </div>
      </div>
      <div id="hasilCariNota"></div>
      <p class="petunjuk">Pelanggan kehilangan struk?
        <a href="#" id="lnkTanpaNota" style="color:var(--utama-gelap)">Lanjut tanpa nota</a> —
        HPP akan memakai rata-rata saat ini, bukan HPP asli nota, jadi laba historis bisa sedikit meleset.</p>
      <div id="formIsiRetur"></div>`,
      ('<button class="tombol" data-tutup="1">' + ikonAlat('batal') + '<span>Tutup</span></button>'));
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

    $('#rtNilaiRetur').innerHTML = rp(r);
    $('#rtNilaiPengganti').innerHTML = rp(p);
    $('#rtLabelSelisih').textContent = selisih < 0 ? 'Uang dikembalikan' :
                                       (selisih > 0 ? 'Pelanggan menambah bayar' : 'Selisih');
    $('#rtSelisih').innerHTML = rp(Math.abs(selisih));
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

    /* Konfirmasi (bagian 245): stok, uang, dan jurnal bergerak sekaligus. */
    if (!(await tanya('Proses retur ini?',
          `<p class="petunjuk">${itemRetur.reduce((a, i) => a + i.qty, 0)} pcs diterima kembali${jenis === 'TUKAR' ? ' dan barang pengganti keluar' : ''}.
             Stok, uang, dan jurnalnya dicatat sekarang; retur tidak bisa dibatalkan dari layar.</p>`,
          { ya: 'Proses retur' }))) return;
    btn.disabled = true;
    try {
      const d = await API.buatRetur({
        uuid: uuidDokumen('retur'),
        cabang: cabangDari('retur'),
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
      const rows = await API.daftarReturBeli({ cabang: cabangDari('returbeli') });
      $('#isiReturbeli').innerHTML = `
        <div class="kartu">
          <div class="bar-alat">
            ${pilihCabangHtml('returbeli')}
            <div style="flex:1"></div>
            ${tombolTambah('btnReturBeliBaru', 'Retur ke supplier')}
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
      ('<button class="tombol" data-tutup="1">' + ikonAlat('batal') + '<span>Tutup</span></button>'));
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
    if ($('#rbTotal')) $('#rbTotal').innerHTML = rp(t);
  }

  /* ==================== ARSIP ==================== */

  /* segarkan = hitung ulang di server; tanpanya server memakai hasil yang
     disimpan 6 jam (bagian 258 — 54 dtk kalau dihitung dari awal). */
  async function muatArsip(segarkan) {
    memuat('#isiArsip');
    try {
      const u = await API.ukuranBerkas(segarkan ? { segarkan: true } : {});
      const warna = { AMAN: 'hijau', PERHATIAN: 'kuning', KRITIS: 'merah' };
      const tahunIni = new Date().getFullYear();

      $('#isiArsip').innerHTML = `
        <div class="kartu">
          <div class="bar-alat"><h3>Kapasitas berkas</h3>
            <div class="kanan"><button class="tombol" id="btnHitungUlangArsip">Hitung ulang</button></div></div>
          <p class="petunjuk">Google Sheets membatasi <strong>10 juta sel per berkas</strong> — dihitung dari seluruh
            petak lembar, termasuk yang masih kosong. Satu cabang ramai
            bisa menghasilkan sekitar 6,5 juta sel setahun — jadi tanpa rotasi, di tahun kedua berkas cabang akan
            menolak transaksi baru, dan itu terjadi tepat di jam sibuk. Halaman ini agar Anda tahu jauh sebelum itu.</p>
          ${u.dihitung ? `<p class="petunjuk" id="arsipDihitung">Dihitung ${esc(waktuTampil(u.dihitung))}${u.dari_simpanan
            ? ' — hasil tersimpan, dihitung ulang tiap 6 jam atau lewat tombol Hitung ulang' : ''}.</p>` : ''}
          <div class="pesan ${u.saran.indexOf('Belum perlu') === 0 ? 'sukses' : 'galat'}">${esc(u.saran)}</div>
          ${tabel([
            { judul: 'Berkas', kunci: 'berkas' },
            { judul: 'Jumlah sel', angka: true, render: b => b.galat ? '—'
                : new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(b.sel)) },
            { judul: 'Kapasitas', angka: true, render: b => b.galat ? '—' : b.persen + '%' },
            { judul: 'Status', render: b => b.galat
                ? `<span class="lencana merah">galat</span>`
                : `<span class="lencana ${warna[b.status]}">${esc(b.status)}</span>` },
            { judul: 'Sheet terbesar', render: b => (b.terbesar || []).slice(0, 3)
                .map(x => `${esc(x.sheet)}${x.baris === null || x.baris === undefined ? ''
                  : ` (${new Intl.NumberFormat(CONFIG.LOCALE).format(x.baris)} baris)`}`)
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

  /* ==================== KAS — MEJA KERJA BACK OFFICE ====================

     Dipindah dari sidebar kasir di v1.217 (bagian 208). Pemilik, 20 Sep 2026:
     "petugas yang ada di toko tidak ada aktivitas kas ... itu semua dikerjakan
     admin saya (back office)."

     Keperluan rumah tangga toko memakai UANG TALANGAN yang sengaja tidak
     dibukukan: ada dana tetap di toko, dipakai, lalu di-reimburse sampai utuh
     lagi. Yang masuk buku cuma reimburse-nya — sebagai beban, dibayar dari
     Kas Admin. Uang setoran tidak pernah diutak-atik.
  */

  /**
   * AKUN YANG MEMEGANG UANG — salinan `AKUN_KAS` di apps-script/00_Config.gs.
   *
   * Salinan, karena klien tidak bisa membaca konstanta server. Ada penjaga
   * statis yang membandingkannya dengan sumbernya — dua daftar yang sama-sama
   * dipatok tangan akan menyimpang diam-diam.
   */
  const AKUN_KAS = ['1-1100', '1-1150', '1-1200', '1-1210'];

  const PERIODE_KAS = { id: 'kasPeriodePilih', dari: 'kasDari', sampai: 'kasSampai',
                        nilai: 'bulan', label: 'Periode' };

  /* LINGKUP CABANG. Bawaannya SEMUA — back office menangani seluruh cabang,
     dan daftar yang hanya memuat cabang tempat adminnya kebetulan login
     menyembunyikan setoran cabang lain tanpa satu pun tanda (dilaporkan
     pemilik 20 Sep 2026, beberapa jam sesudah layar ini terbit).

     Peran tanpa `akses_lintas_cabang` tidak melihat pemilihnya sama sekali,
     dan servernya tetap mengunci mereka ke cabangnya sendiri walau '*' yang
     dikirim — menyembunyikan kendali bukan penjagaan. */
  let cabangKas = '*';
  const pilihCabangKas = () => bolehCabangDash()
    ? `<div class="kendali-tetap"><label>Cabang</label>
        <select id="kasCabang" class="kendali-tetap" title="Cabang">
          <option value="*" ${cabangKas === '*' ? 'selected' : ''}>Semua cabang</option>
          ${daftarKodeCabang().map((c) =>
            `<option value="${esc(c)}" ${cabangKas === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select></div>` : '';

  /* Jenis transaksi yang dilayani meja ini. Dipilih lebih dulu, karena ia yang
     menentukan kendali mana yang masuk akal sesudahnya — akun lawan sebuah
     pemindahan adalah akun kas lain, sementara akun lawan sebuah pengeluaran
     justru tidak boleh akun kas. */
  const JENIS_KAS = [
    ['KELUAR', 'Kas keluar — beban, gaji, reimburse'],
    ['MASUK',  'Kas masuk — setoran modal, pendapatan lain'],
    ['PRIVE',  'Prive — uang pemilik diambil'],
    ['PINDAH', 'Pindah antar akun kas — setor ke bank, pelimpahan QRIS'],
    ['SETOR',  'Terima setoran shift toko']
  ];

  let kasData = null;

  /* ==================== ASET TETAP (bagian 216) ==================== */

  const PERIODE_ASET = { id: 'asetPeriodePilih', dari: 'asetPeriode', bulanan: true,
                         nilai: 'bulan', label: 'Periode' };
  let asetData = null;

  async function muatAset() {
    const w = $('#isiAset');
    if (!w) return;
    if (!$('#asetPeriode')) {
      const bolehUbah = bolehIzin('laporan_keuangan', 'ubah');
      w.innerHTML = `
        <div class="kartu">
          <div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeAset"></span>
            <div class="aksi">
              ${bolehUbah ? tombolTambah('btnAsetBaru', 'Aset') : ''}
              ${bolehUbah ? `<button class="tombol" id="btnSusutkan" title="Hitung penyusutan periode ini">
                  ${ikonAlat('jalankan')}<span>Hitung penyusutan</span></button>` : ''}
            </div>
          </div>
          <p class="petunjuk">Penyusutan dihitung <strong>garis lurus</strong>: harga perolehan
             dikurangi nilai residu, dibagi umur manfaat, sama tiap bulan. Bulan perolehan
             dihitung penuh, dan bulan terakhir mengambil sisanya supaya totalnya pas.
             Menutup buku bulanan menjalankannya sendiri.</p>
        </div>
        <div id="hasilAset"></div>`;
      $('#wadahPeriodeAset').innerHTML = Periode.html(PERIODE_ASET);
      Periode.pasang(PERIODE_ASET, muatHasilAset);
    }
    return muatHasilAset();
  }

  async function muatHasilAset() {
    memuat('#hasilAset');
    try {
      asetData = await API.daftarAset({ periode: nilai('asetPeriode') });
      gambarAset();
    } catch (e) { galat('#hasilAset', e); }
  }

  function gambarAset() {
    const d = asetData;
    const w = $('#hasilAset');
    if (!d || !w) return;

    /* Tiga angka besar dulu, daftarnya sesudahnya: yang ditanyakan orang waktu
       membuka layar ini "berapa nilai buku sekarang", bukan "aset nomor berapa
       yang paling tua". */
    const kabar = d.sudah_disusut
      ? `Penyusutan ${esc(d.periode)} sudah dijurnal.`
      : `Penyusutan ${esc(d.periode)} BELUM dijurnal — tekan Hitung penyusutan, atau tutup buku bulan ini.`;

    /* KOTAK ANGKA, bukan tabel. Tabel dua kolom berisi tiga baris berubah
       jadi tiga kartu dua baris di HP — bentuk yang benar untuk daftar
       panjang, dan berlebihan untuk tiga angka ringkasan. */
    const kotak = (label, nilai, ekor) =>
      `<div class="mini"><div class="mini-kepala"><div class="mini-label">${esc(label)}</div></div><div class="mini-nilai">${rp(nilai)}</div><div class="mini-ekor">${esc(ekor)}</div></div>`;

    const kpi = `<div class="kartu">
      <div class="bar-alat"><h3>Ringkasan</h3>
        <span class="satuan-uang">dalam Rupiah</span></div>
      <!-- .petak-mini SAJA, tanpa .petak-kpi: kelas itu memaksa ENAM kolom
           apa pun jumlah isinya, jadi tiga kotak masing-masing cuma dapat 1/6
           lebar — 137 px, sementara Rp9.999.999.999 butuh 141 px. Konsolidasi
           memakainya untuk PERSENTASE, yang memang pendek. -->
      <div class="petak-mini" style="grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))">
        ${kotak('Harga perolehan', d.total_perolehan, d.aset.length + ' aset')}
        ${kotak('Akumulasi', d.total_akumulasi, 'sudah dijurnal')}
        ${kotak('Nilai buku', d.total_nilai_buku, 'sisa di buku')}
      </div>
      <p class="petunjuk">${kabar}</p>
    </div>`;

    /* Kode, kategori, dan TANGGAL PEROLEHAN jadi satu baris keterangan di
       bawah namanya. Sebelas kolom membuat tanggalnya pecah dua baris di PC
       dan seluruh tabelnya terbaca berantakan; tanggal perolehan juga bukan
       angka yang dibandingkan antar baris, jadi ia tidak butuh kolomnya
       sendiri. */
    const baris = (a) => `<tr>
      <td data-l="Aset"><strong>${esc(a.nama)}</strong>
        <span class="petunjuk" style="display:block">${esc(a.kode)}${a.kategori ? ' · ' + esc(a.kategori) : ''} · <span style="white-space:nowrap">diperoleh ${esc(tglTampil(a.tanggal_perolehan))}</span></span></td>
      <td data-l="Cabang">${esc(a.kode_cabang)}</td>
      <td class="kanan" data-l="Harga">${rp(a.harga_perolehan)}</td>
      <td class="kanan" data-l="Residu">${rp(a.nilai_residu)}</td>
      <td class="kanan" data-l="Umur" style="white-space:nowrap">${a.umur_bulan} bln</td>
      <td class="kanan" data-l="Per bulan">${rp(a.per_bulan)}</td>
      <td class="kanan" data-l="Akumulasi">${rp(a.akumulasi)}</td>
      <td class="kanan" data-l="Nilai buku"><strong>${rp(a.nilai_buku)}</strong></td>
      <td data-l="Keadaan">${a.status !== 'AKTIF' ? lencanaDash(esc(a.status), 'redup')
        : (a.habis ? lencanaDash('habis disusutkan', 'redup') : '')}</td>
      <!-- nowrap: dua tombol di sel tanpa lebar akan membungkus ke bawah,
           dan baris tabelnya jadi setinggi dua tombol. -->
      <td style="white-space:nowrap">${bolehIzin('laporan_keuangan', 'ubah') ? (
        tombolBaris('', 'Ubah', IKON.ubah, `data-edit-aset="${esc(a.kode)}"`, 'Ubah aset') +
        /* Yang sudah DILEPAS tidak menawarkan tombolnya lagi: melepas dua
           kali mengkreditkan asetnya dua kali dan mendebit akumulasinya dua
           kali, dan neraca timpang persis sebesar satu aset. */
        (a.status === 'AKTIF'
          ? tombolBaris('', 'Lepas', IKON.lepas, `data-lepas-aset="${esc(a.kode)}"`,
                        'Lepas aset — dijual, dihibahkan, atau dibuang') : '')
      ) : ''}</td>
    </tr>`;

    const kosong = `<p class="petunjuk">Belum ada aset tetap. Etalase, rak, komputer, dan
       kendaraan yang dipakai bertahun-tahun masuk ke sini — tanpa itu, labanya
       tercatat lebih besar daripada yang sebenarnya, tiap bulan.</p>`;

    w.innerHTML = kpi + `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>Daftar aset</h3>
        <span class="satuan-uang">dalam Rupiah</span></div>
      ${d.aset.length ? `<div class="gulir-x"><table class="tabel">
        <thead><tr><th>Aset</th><th>Cabang</th>
          <th class="kanan">Harga</th><th class="kanan">Residu</th>
          <th class="kanan">Umur</th><th class="kanan">Per bulan</th>
          <th class="kanan">Akumulasi</th><th class="kanan">Nilai buku</th>
          <th>Keadaan</th><th></th></tr></thead>
        <tbody>${d.aset.map(baris).join('')}</tbody></table></div>` : kosong}
    </div>`;
  }

  /* Borang aset. Yang sudah pernah disusutkan DIKUNCI dasarnya — server
     menolaknya juga, dan dua-duanya memang perlu: server supaya tidak bisa
     ditembus, layar supaya orang tahu SEBELUM mengetik satu angka pun. */
  function borangAset(a) {
    const k = a || {};
    const kunci = num(k.akumulasi) > 0;
    const mati = kunci ? 'disabled' : '';
    const alasan = kunci
      ? `<p class="petunjuk">Aset ini sudah disusutkan ${rpTeks(k.akumulasi)}. Harga,
         residu, umur, dan tanggal perolehan tidak bisa diubah lagi — angsuran lama
         dan baru akan dihitung dari dua dasar berbeda, dan totalnya tidak akan pernah
         bertemu dengan akumulasinya. Nama, kategori, dan catatannya tetap bisa.</p>`
      : '';
    return `<div class="baris-form">
      <label>Nama aset</label>
      <input type="text" id="asNama" value="${esc(k.nama || '')}" placeholder="Etalase kaca depan">
      <label>Kategori</label>
      <input type="text" id="asKategori" value="${esc(k.kategori || '')}" placeholder="Perabot, Elektronik, Kendaraan">
      <label>Cabang</label>
      <select id="asCabang">${daftarKodeCabang().map((c) =>
        `<option value="${esc(c)}" ${k.kode_cabang === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label>Tanggal perolehan</label>
      <input type="date" id="asTanggal" value="${esc(k.tanggal_perolehan || '')}" ${mati}>
      <label>Harga perolehan</label>
      <input type="number" id="asHarga" value="${k.harga_perolehan || ''}" ${mati}>
      <label>Nilai residu</label>
      <input type="number" id="asResidu" value="${k.nilai_residu || 0}" ${mati}>
      <label>Umur manfaat (bulan)</label>
      <input type="number" id="asUmur" value="${k.umur_bulan || ''}" ${mati}>
      <label>Catatan</label>
      <input type="text" id="asCatatan" value="${esc(k.catatan || '')}">
      ${alasan}
      ${a ? '' : `<hr style="border:none;border-top:1px solid var(--garis);margin:16px 0">
      <label>Ongkosnya sudah dicatat sebagai apa?</label>
      <select id="asSumber">${SUMBER_ASET.map(([v, t]) =>
        `<option value="${v}">${esc(t)}</option>`).join('')}</select>
      <label id="labelAsAkun">Dibayar dari</label>
      <select id="asAkun"></select>
      <p class="petunjuk" id="petunjukAsSumber"></p>`}
    </div>`;
  }

  function bukaBorangAset(kode) {
    const a = kode ? (asetData.aset || []).filter((x) => x.kode === kode)[0] : null;
    bukaModal(kode ? 'Ubah aset' : 'Aset tetap baru', borangAset(a),
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" data-simpan-aset="${esc(kode || '')}">Simpan</button>`);
    /* Daftar akunnya diisi SESUDAH modalnya ada di DOM, dan berganti tiap
       jawabannya berganti: akun lawan sebuah pembelian tunai adalah kas,
       sementara akun lawan sebuah pemindahan justru tidak boleh kas. */
    if (!kode) {
      isiPilihanAset();
      $('#asSumber')?.addEventListener('change', isiPilihanAset);
    }
  }

  async function simpanAsetLayar(kode) {
    /* Yang terkunci dikirim APA ADANYA dari data lama, bukan dari kolom yang
       disabled: kolom disabled tidak ikut terbaca, dan mengirimkannya kosong
       akan ditolak server sebagai input tidak sah — pesan yang benar untuk
       sebab yang salah. */
    const lama = kode ? (asetData.aset || []).filter((x) => x.kode === kode)[0] : null;
    const kunci = lama && num(lama.akumulasi) > 0;
    await API.simpanAset({
      kode: kode || '',
      nama: nilai('asNama'),
      kategori: nilai('asKategori'),
      kode_cabang: nilai('asCabang'),
      tanggal_perolehan: kunci ? lama.tanggal_perolehan : nilai('asTanggal'),
      harga_perolehan: kunci ? lama.harga_perolehan : angka('asHarga'),
      nilai_residu: kunci ? lama.nilai_residu : angka('asResidu'),
      umur_bulan: kunci ? lama.umur_bulan : angka('asUmur'),
      catatan: nilai('asCatatan'),
      /* Hanya untuk aset BARU. Servernya juga mengabaikannya saat mengubah,
         dan dua-duanya memang perlu: server supaya tidak bisa ditembus,
         layar supaya kolomnya tidak pernah muncul dan menggoda. */
      sumber_dana: kode ? null : { jenis: nilai('asSumber'), akun: nilai('asAkun') }
    });
    tutupModal();
    sukses(kode ? 'Aset diperbarui.' : 'Aset ditambahkan.');
    return muatHasilAset();
  }

  /**
   * SUMBER DANA — hanya untuk aset BARU (bagian 217).
   *
   * Sampai v1.225.0 layar ini menyimpan spesifikasi aset dan tidak menjurnal
   * apa pun, jadi `1-2100` tetap nol sementara akumulasinya menumpuk. Yang
   * memasukkan aset sekarang harus menjawab satu pertanyaan: ongkosnya sudah
   * dicatat sebagai apa?
   *
   * Tiga jawaban, tiga akibat yang berbeda — dan yang tengah paling mahal
   * kalau salah. Etalase yang dibayar tunai biasanya SUDAH tercatat sebagai
   * beban di meja Kas & Bank; menjurnalnya lagi dari kas memotong laba dua
   * kali dan mengurangi kas yang tidak berkurang lagi.
   *
   * Untuk aset yang DIUBAH, bagian ini tidak digambar sama sekali: perolehannya
   * sudah pernah dijurnal (atau sengaja dilewati), dan menanyakannya lagi cuma
   * mengundang jurnal kedua atas barang yang sama.
   */
  const SUMBER_ASET = [
    ['KAS',   'Uangnya baru keluar sekarang — potong dari kas/bank'],
    ['BEBAN', 'Terlanjur dicatat sebagai beban — pindahkan ke aset'],
    ['SUDAH', 'Sudah benar di buku — jangan jurnal apa pun']
  ];

  async function isiPilihanAset() {
    const sel = $('#asSumber');
    if (!sel) return;
    const coa = await DB.kvGet('coa', []);
    const bisa = (coa || []).filter((c) => c.transaksi === true || String(c.transaksi) === 'true');
    const opsi = (arr) => arr.map((c) =>
      `<option value="${esc(c.kode)}">${esc(c.kode)} — ${esc(c.nama)}</option>`).join('');

    const jenis = sel.value;
    let daftar, label, petunjuk;
    if (jenis === 'KAS') {
      daftar = bisa.filter((c) => AKUN_KAS.indexOf(String(c.kode)) !== -1);
      label = 'Dibayar dari';
      petunjuk = 'Dr aset, Cr kas/bank. Pilih ini kalau uangnya baru keluar sekarang dan ' +
                 'BELUM dicatat di meja Kas & Bank.';
    } else if (jenis === 'BEBAN') {
      /* Beban = 5-, 6-, 8-. Servernya menolak yang lain; daftarnya disaring di
         sini supaya orang tidak perlu ditolak untuk tahu. */
      daftar = bisa.filter((c) => '568'.indexOf(String(c.kode).charAt(0)) !== -1);
      label = 'Dulu dicatat sebagai';
      petunjuk = 'Dr aset, Cr akun beban itu. Ongkosnya dipindahkan, bukan dicatat ulang — ' +
                 'labanya sudah terpotong sekali, dan sekali saja yang benar.';
    } else {
      daftar = [];
      label = '—';
      petunjuk = 'Tidak ada jurnal yang dibuat. Pilih ini kalau pembukuan asetnya sudah benar ' +
                 'dari sistem lain, atau kalau bulan perolehannya sudah dikunci.';
    }
    $('#asAkun').innerHTML = opsi(daftar) ||
      (jenis === 'SUDAH' ? '<option value="">(tidak perlu)</option>'
                         : '<option value="">(daftar akun belum tersinkron — tarik master dulu)</option>');
    $('#asAkun').disabled = jenis === 'SUDAH';
    $('#labelAsAkun').textContent = label;
    $('#petunjukAsSumber').textContent = petunjuk;
  }

  /**
   * LEPAS ASET — dijual, dihibahkan, atau dibuang (bagian 217).
   *
   * Sampai v1.225.0 status DILEPAS hanya menghentikan penyusutan; asetnya tetap
   * duduk di neraca dengan harga perolehan dan akumulasinya, selamanya.
   *
   * Nilai bukunya DIBACA dari yang sudah dikirim server, tidak dihitung ulang
   * di sini: hitungan kedua atas hal yang sama pasti menyimpang, dan yang
   * menyimpang adalah angka yang dipakai orang memutuskan harga jual.
   */
  function borangLepas(a) {
    return `<div class="baris-form">
      <p class="petunjuk">${esc(a.nama)} · ${esc(a.kode)} · diperoleh
        ${esc(tglTampil(a.tanggal_perolehan))}</p>
      <label>Nilai buku sekarang</label>
      <input type="text" value="${esc(rpTeks(a.nilai_buku))}" disabled>
      <label>Tanggal pelepasan</label>
      <input type="date" id="lpTanggal" value="${tanggalLokal()}">
      <label>Harga jual</label>
      <input type="number" id="lpHarga" value="0" min="0">
      <label id="labelLpKas">Uangnya masuk ke</label>
      <select id="lpAkun"></select>
      <p class="petunjuk">Harga jual 0 berarti dibuang atau dihibahkan — seluruh nilai
        bukunya jadi rugi pelepasan, dan tidak ada uang yang masuk.</p>
      <p class="petunjuk">Jurnalnya: kas didebit sebesar harga jual, akumulasinya didebit
        sebesar ${esc(rpTeks(a.akumulasi))}, asetnya dikredit sebesar
        ${esc(rpTeks(a.harga_perolehan))}, dan selisihnya masuk Laba atau Rugi Pelepasan
        Aset Tetap. Sesudah ini aset tersebut berhenti disusutkan.</p>
    </div>`;
  }

  async function bukaBorangLepas(kode) {
    const a = (asetData.aset || []).filter((x) => x.kode === kode)[0];
    if (!a) return;
    bukaModal('Lepas aset', borangLepas(a),
      `<button class="tombol" data-tutup="1">Batal</button>
       <button class="tombol utama" data-lepas-simpan="${esc(kode)}">Lepaskan</button>`);
    const coa = await DB.kvGet('coa', []);
    const kas = (coa || []).filter((c) =>
      (c.transaksi === true || String(c.transaksi) === 'true') &&
      AKUN_KAS.indexOf(String(c.kode)) !== -1);
    const sel = $('#lpAkun');
    if (sel) {
      sel.innerHTML = kas.map((c) =>
        `<option value="${esc(c.kode)}">${esc(c.kode)} — ${esc(c.nama)}</option>`).join('') ||
        '<option value="">(daftar akun belum tersinkron — tarik master dulu)</option>';
    }
  }

  async function lepaskanAset(kode) {
    const h = await API.lepasAset({
      kode,
      tanggal: nilai('lpTanggal'),
      harga_jual: angka('lpHarga'),
      akun_kas: nilai('lpAkun')
    });
    tutupModal();
    /* Untung/ruginya dibacakan DARI JAWABAN SERVER, bukan dihitung lagi di
       sini — itu angka yang sudah dijurnal, dan cuma ada satu yang benar. */
    const d = h || {};
    sukses(d.hasil === 'LABA'
      ? `Aset dilepas. Laba pelepasan ${rpTeks(d.selisih)}.`
      : (d.hasil === 'RUGI'
          ? `Aset dilepas. Rugi pelepasan ${rpTeks(Math.abs(num(d.selisih)))}.`
          : 'Aset dilepas, persis sebesar nilai bukunya.'));
    return muatHasilAset();
  }

  async function jalankanSusut() {
    const periode = nilai('asetPeriode');
    if (!(await tanya(`Hitung penyusutan ${periode}?`,
          '<p class="petunjuk">Jurnal penyusutan dibuat untuk seluruh aset aktif di semua ' +
          'cabang. Periode yang sudah pernah disusutkan dilewati, jadi menekannya dua kali ' +
          'tidak melahirkan jurnal kedua.</p>',
          { ya: 'Hitung' }))) return;
    const h = await API.susutkan({ periode });
    sukses(h.dilewati ? `Dilewati — ${h.alasan}.`
                      : `Penyusutan ${periode} dijurnal untuk ${h.jurnal.length} cabang.`);
    return muatHasilAset();
  }

  async function muatKas() {
    const w = $('#isiKas');
    if (!w) return;
    if (!$('#kasDari')) {
      w.innerHTML = `
        <div class="kartu">
          <div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeKas"></span>
            <span id="wadahCabangKas"></span>
          </div>
          <p class="petunjuk">Seluruh pergerakan uang yang bukan penjualan: beban,
             gaji, prive, setoran modal, pemindahan antar akun, dan serah terima
             uang toko. Pembayaran utang supplier punya menunya sendiri di
             <strong>Utang</strong>.</p>
        </div>
        <div id="hasilKas"></div>`;
      $('#wadahPeriodeKas').innerHTML = Periode.html(PERIODE_KAS);
      $('#wadahCabangKas').innerHTML = pilihCabangKas();
      Periode.pasang(PERIODE_KAS, muatHasilKas);
      $('#kasCabang')?.addEventListener('change', (e) => {
        cabangKas = e.target.value;
        muatHasilKas();
      });
    }
    return muatHasilKas();
  }

  async function muatHasilKas() {
    memuat('#hasilKas');
    try {
      /* TIGA panggilan sekaligus, bukan berurutan. Tiap panggilan Apps Script
         membayar ~0,8 detik memuat proyek; berurutan berarti menunggu tiga
         kali lipat untuk data yang tidak saling bergantung. */
      const [kas, setor, ner, arus] = await Promise.all([
        API.daftarKas({ cabang: cabangKas,
                        dari: nilai('kasDari'), sampai: nilai('kasSampai') }),
        API.shiftBelumSetor({ cabang: cabangKas }),
        /* Neracanya ikut lingkupnya juga — saldo gabungan di atas daftar satu
           cabang akan terbaca sebagai saldo cabang itu. */
        API.neraca({ periode: (nilai('kasSampai') || '').substring(0, 7),
                     cabang: cabangKas }),
        API.arusKas({ cabang: cabangKas, bulan: 6 })
      ]);
      kasData = { kas, setor, ner, arus };
      gambarKas();
    } catch (e) { galat('#hasilKas', e); }
  }

  function gambarKas() {
    const w = $('#hasilKas');
    if (!w || !kasData) return;
    const { kas, setor, ner, arus } = kasData;

    /* SALDO dari NERACA, bukan dijumlahkan dari daftar di bawahnya. Kas juga
       bergerak lewat penjualan, pembelian, dan piutang — menjumlahkan daftar
       ini saja akan memajang angka yang tidak pernah cocok dengan buku. */
    const aset = (ner && ner.aset) || [];
    const saldo = AKUN_KAS.map((k) => {
      const a = aset.filter((x) => String(x.kode) === k)[0];
      return { kode: k, nama: (a && a.nama) || k, jumlah: a ? a.jumlah : 0 };
    });

    const belum = (setor && setor.shift || []).filter((x) => !x.setoran);

    w.innerHTML = `
      <div class="petak-mini petak-uang">
        ${saldo.map((x) => miniKons(x.nama, rp(x.jumlah), x.kode)).join('')}
      </div>
      <p class="petunjuk">Saldo di atas dibaca dari buku besar yang sudah dijurnal
         (neraca akhir periode), bukan dijumlahkan dari daftar di bawah — kas juga
         bergerak lewat penjualan dan pembelian. Lingkupnya
         <strong>${cabangKas === '*' ? 'seluruh cabang' : esc(cabangKas)}</strong>.</p>

      ${kartuArusKas(arus)}
      ${kartuSetoran(belum)}
      ${kartuCatatKas()}

      <div class="kartu laporan-uang">
        <div class="bar-alat"><h3>Mutasi kas</h3><span class="satuan-uang">dalam Rupiah</span>
          <div style="flex:1"></div>
          ${menuEkspor('kas', { cabang: cabangKas, dari: nilai('kasDari'), sampai: nilai('kasSampai') })}</div>
        ${daftarMutasiKas(kas)}
      </div>`;
    isiPilihanKas();
    $('#kasJenis')?.addEventListener('change', isiPilihanKas);
    $('#btnSimpanKas')?.addEventListener('click', simpanKasBaru);
  }

  /**
   * Arus kas per bulan — berapa masuk, berapa keluar, bukan cuma sisanya.
   *
   * Saldo akhir menjawab "berapa uang saya sekarang". Ia tidak pernah
   * menjawab "ke mana perginya" — dan kas yang turun 73 juta dalam sebulan
   * terlihat persis sama dengan kas yang memang sedikit, kalau yang dipajang
   * hanya angka terakhirnya.
   *
   * Bulan yang agregatnya BELUM DIHITUNG digambar berbeda dari bulan yang
   * nol. Deretan nol untuk bulan sebelum pembukuan dimulai terbaca sebagai
   * bulan tanpa transaksi, dan itu bohong yang bentuknya meyakinkan.
   */
  function kartuArusKas(arus) {
    if (!arus || !Array.isArray(arus.bulan) || !arus.bulan.length) return '';
    /* Lebar batang relatif terhadap bulan TERSIBUK, bukan terhadap saldo —
       yang dibandingkan mata di sini besarnya pergerakan antar bulan. */
    const puncak = Math.max(1, ...arus.bulan.map((b) => Math.max(b.masuk, b.keluar)));
    const lebar = (v) => Math.round((Math.abs(v) / puncak) * 100);
    return `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>Arus kas — 6 bulan terakhir</h3><span class="satuan-uang">dalam Rupiah</span></div>
      <div class="gulir-x"><table class="tabel">
        <thead><tr><th>Bulan</th><th class="kanan">Masuk</th><th class="kanan">Keluar</th>
          <th class="kanan">Bersih</th><th class="kanan">Saldo akhir</th>
          <th style="width:120px"></th></tr></thead>
        <tbody>${arus.bulan.map((b) => b.ada ? `<tr>
          <td data-l="Bulan">${esc(bulanTeks(b.periode))}</td>
          <td class="kanan" data-l="Masuk">${rp(b.masuk)}</td>
          <td class="kanan" data-l="Keluar">${rp(-Math.abs(b.keluar))}</td>
          <td class="kanan" data-l="Bersih">${rp(b.bersih)}</td>
          <td class="kanan" data-l="Saldo akhir">${rp(b.saldo_akhir)}</td>
          <td data-l="">${batangArus(lebar(b.masuk), lebar(b.keluar))}</td>
        </tr>` : `<tr>
          <td data-l="Bulan">${esc(bulanTeks(b.periode))}</td>
          <td colspan="5" class="petunjuk">Agregat bulan ini belum pernah dihitung —
             bukan berarti tidak ada transaksinya.</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><th>Total ${arus.bulan_terhitung} bulan</th>
          <th class="kanan">${rp(arus.total_masuk)}</th>
          <th class="kanan">${rp(-Math.abs(arus.total_keluar))}</th>
          <th class="kanan">${rp(arus.total_masuk - arus.total_keluar)}</th>
          <th></th><th></th></tr></tfoot>
      </table></div>
      <p class="petunjuk">Dibaca dari agregat bulanan buku besar — arus kasnya sudah
         dijurnal, tidak dihitung ulang dari daftar mutasi.</p>
      ${tabelPerAkun(arus)}
    </div>`;
  }

  /**
   * Rincian per akun: AKUN sebagai baris, BULAN sebagai kolom.
   *
   * Arahnya sengaja begini. Kalau bulan jadi baris dan akun jadi kolom,
   * empat akun kali tiga angka jadi dua belas kolom — tabel yang tidak muat
   * di layar mana pun. Dengan akun sebagai baris, pertanyaan yang benar-benar
   * ditanyakan orang ("akun mana yang terus terkuras?") terbaca dengan
   * menyusuri satu baris dari kiri ke kanan.
   *
   * Yang dipajang BERSIH, bukan saldo. Saldo tiap bulan hanya mengulang
   * angka di tabel atasnya; yang belum pernah terlihat adalah pergerakannya.
   */
  function tabelPerAkun(arus) {
    const ada = (arus.bulan || []).filter((b) => b.ada);
    if (!ada.length || !Array.isArray(arus.akun)) return '';
    /* Bulan TERTUA di kiri — dibaca seperti garis waktu, bukan seperti
       daftar. Tabel di atasnya terbaru-dulu karena di sana yang dicari
       kabar terakhir; di sini yang dicari arahnya. */
    const bln = ada.slice().reverse();
    const namaAkun = {};
    ((kasData && kasData.ner && kasData.ner.aset) || []).forEach((a) => {
      namaAkun[String(a.kode)] = a.nama;
    });
    return `<div class="gulir-x" style="margin-top:14px"><table class="tabel">
      <thead><tr><th>Akun</th>
        ${bln.map((b) => `<th class="kanan">${esc(bulanTeks(b.periode))}</th>`).join('')}
        <th class="kanan">Total</th></tr></thead>
      <tbody>${arus.akun.map((k) => {
        const sel = bln.map((b) => (b.per_akun && b.per_akun[k]) || { bersih: 0 });
        const jml = sel.reduce((a, x) => a + (x.bersih || 0), 0);
        return `<tr>
          <td data-l="Akun">${esc(namaAkun[k] || k)}</td>
          ${sel.map((x, i) => `<td class="kanan" data-l="${esc(bulanTeks(bln[i].periode))}">${rp(x.bersih || 0)}</td>`).join('')}
          <td class="kanan" data-l="Total">${rp(jml)}</td>
        </tr>`; }).join('')}</tbody>
    </table></div>
    <p class="petunjuk">Angka di sini <strong>pergerakan bersih</strong> tiap bulan,
       bukan saldonya — saldo sudah ada di tabel atas. Akun yang terus merah
       adalah akun yang terus terkuras.</p>`;
  }

  /* Dua batang bertumpuk: masuk di atas, keluar di bawah. Panjangnya relatif
     terhadap bulan tersibuk, jadi yang dibaca mata perbandingan antar bulan. */
  const batangArus = (mas, kel) =>
    `<span class="batang-arus" aria-hidden="true"><i class="masuk" style="width:${mas}%"></i><i class="keluar" style="width:${kel}%"></i></span>`;

  /**
   * Shift yang uangnya belum diserahkan ke back office.
   *
   * Inilah jembatan serah terimanya. Angkanya `kas_fisik` — uang yang
   * benar-benar dihitung di laci, bukan yang seharusnya ada; selisihnya sudah
   * dibukukan sendiri saat tutup shift.
   */
  function kartuSetoran(belum) {
    if (!belum.length) {
      return `<div class="kartu"><h3>Setoran toko</h3>
        <p class="petunjuk">Tidak ada shift tertutup yang uangnya belum diserahkan.</p></div>`;
    }
    return `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>Setoran toko ${lencanaDash(belum.length + ' belum diterima', 'kuning')}</h3>
        <span class="satuan-uang">dalam Rupiah</span></div>
      <div class="gulir-x"><table class="tabel">
        <thead><tr><th>Cabang</th><th>Shift</th><th>Tutup</th>
          <th class="kanan">Uang dihitung</th>
          <th class="kanan">Selisih</th><th></th></tr></thead>
        <tbody>${belum.map((sh) => `<tr>
          <td data-l="Cabang">${esc(sh.kode_cabang || '')}</td>
          <td data-l="Shift">${esc(sh.id_shift)}${sh.jenis === 'PULSA' ? ' <span class="lencana">pulsa</span>' : ''}</td>
          <td data-l="Tutup">${esc(waktuTampil(sh.tutup))}</td>
          <td class="kanan" data-l="Uang dihitung">${rp(sh.kas_fisik)}</td>
          <td class="kanan" data-l="Selisih">${sh.selisih ? rp(sh.selisih) : '—'}</td>
          <!-- Cabangnya dari BARISNYA, bukan dari pemilih di bar. Menyetorkan
               uang SK02 ke buku SK01 memindahkan uang yang tidak ada di sana. -->
          <td>${tombolBaris('utama', 'Terima', IKON.terima,
              `data-terima-setor="${esc(sh.id_shift)}" data-cabang="${esc(sh.kode_cabang || '')}" data-jumlah="${sh.kas_fisik}"`)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="petunjuk">Menerima setoran memindahkan uangnya dari
         <strong>Kas di Tangan</strong> ke <strong>Kas Admin</strong>. Shift yang
         belum ditutup tidak muncul di sini — uang di laci yang masih dipakai
         tidak boleh dipindahkan. Shift pulsa ikut di sini, dan tiap shift
         disetor sendiri-sendiri — kas awal shift pulsa selalu 0.</p>
    </div>`;
  }

  function kartuCatatKas() {
    if (!bolehIzin('kas', 'buat')) return '';
    return `<div class="kartu">
      <h3>Catat</h3>
      <div class="saring-baris">
        <!-- Saat lingkupnya seluruh cabang, catatan baru harus menyebut
             cabangnya: jurnal mendarat di buku SATU cabang, dan menebaknya
             dari tempat adminnya login akan salah untuk setiap cabang lain. -->
        ${cabangKas === '*' && bolehCabangDash() ? `<div class="kendali-tetap">
          <label>Cabang tujuan</label>
          <select id="kasCabangTujuan" class="kendali-tetap">
            ${daftarKodeCabang().map((c) =>
              `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select></div>` : ''}
        
        <div class="kendali-penuh"><label>Jenis</label>
          <select id="kasJenis">
            ${JENIS_KAS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
          </select></div>
        <div class="kendali-penuh"><label>Sumber kas</label>
          <select id="kasSumber"></select></div>
        <div class="kendali-penuh"><label id="labelKasLawan">Akun lawan</label>
          <select id="kasAkun"></select></div>
        <div class="kendali-tetap"><label>Nominal</label>
          <input type="text" inputmode="numeric" class="uang kendali-tetap" id="kasJumlah" placeholder="0"></div>
      </div>
      <div class="grup"><label>Keterangan</label>
        <input type="text" id="kasKeterangan" maxlength="120"
               placeholder="mis. gaji September — 3 orang"></div>
      <div class="aksi">
        <button class="tombol utama" id="btnSimpanKas">Simpan catatan kas</button>
      </div>
      <p class="petunjuk" id="petunjukKas"></p>
    </div>`;
  }

  function daftarMutasiKas(kas) {
    const rows = (kas && kas.kas) || [];
    if (!rows.length) return '<p class="petunjuk">Belum ada mutasi kas di periode ini.</p>';
    const banyakCabang = cabangKas === '*';
    return `<div class="gulir-x"><table class="tabel">
      <thead><tr><th>Tanggal</th>
        ${banyakCabang ? '<th>Cabang</th>' : ''}
        <th>Dari akun</th><th>Akun lawan</th>
        <th class="kanan">Nominal</th><th>Keterangan</th><th></th></tr></thead>
      <tbody>${rows.map((k) => `<tr>
        <td data-l="Tanggal">${esc(tglTampil(k.tanggal))}</td>
        ${banyakCabang ? `<td data-l="Cabang">${esc(k.kode_cabang || '')}</td>` : ''}
        <td data-l="Dari akun">${esc(k.nama_akun_kas || k.akun_kas)}</td>
        <td data-l="Akun lawan">${esc(k.nama_akun)}${k.pindah_kas
          ? ' ' + lencanaDash('pindah', 'abu') : ''}</td>
        <td class="kanan" data-l="Nominal">${k.tipe === 'KELUAR'
          ? rp(-Math.abs(k.jumlah)) : rp(k.jumlah)}</td>
        <td data-l="Keterangan">${esc(k.keterangan)}${k.bukti
          ? ' <span class="petunjuk">' + esc(k.bukti) + '</span>' : ''}</td>
        <!-- Baris SERAH TERIMA tidak punya koreksi balik. Membalikkannya
             meninggalkan shiftnya tetap bertanda sudah-disetor — penanda itu
             dibaca dari baris aslinya, yang masih ada. Serah terima yang
             salah dibetulkan dengan pemindahan biasa ke arah sebaliknya, dan
             itu memang terlihat sebagai dua baris, karena memang dua kejadian. -->
        <td>${bolehIzin('kas', 'buat') && !(k.pindah_kas && k.bukti)
          ? tombolBaris('', 'Koreksi balik', IKON.balik, `data-balik-kas="${esc(k.uuid)}"`)
          : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="petunjuk">Baris yang salah tidak disunting maupun dihapus —
       <strong>koreksi balik</strong> membuat baris lawannya, dan jejak keduanya
       tetap utuh. Jurnal yang sudah terbit tidak pernah ditulis ulang.</p>`;
  }

  /* Isi kedua dropdown menurut jenis yang dipilih. Dipanggil ulang tiap kali
     jenisnya berganti: akun lawan sebuah PEMINDAHAN adalah akun kas lain,
     sementara akun lawan sebuah pengeluaran justru tidak boleh akun kas. */
  async function isiPilihanKas() {
    const selJenis = $('#kasJenis');
    if (!selJenis) return;
    const coa = await DB.kvGet('coa', []);
    const bisa = (coa || []).filter((c) => c.transaksi === true || String(c.transaksi) === 'true');
    const opsi = (arr) => arr.map((c) =>
      `<option value="${esc(c.kode)}">${esc(c.kode)} — ${esc(c.nama)}</option>`).join('');

    const jenis = selJenis.value;
    const kasSaja = bisa.filter((c) => AKUN_KAS.indexOf(String(c.kode)) !== -1);
    $('#kasSumber').innerHTML = opsi(kasSaja) ||
      '<option value="">(daftar akun belum tersinkron — tarik master dulu)</option>';

    let lawan, label, petunjuk;
    if (jenis === 'PINDAH') {
      lawan = kasSaja; label = 'Ke akun kas';
      petunjuk = 'Uang berpindah tempat, bukan bertambah atau berkurang. Uang dari laci toko hanya bisa dipindahkan lewat Terima setoran di atas.';
    } else if (jenis === 'PRIVE') {
      lawan = bisa.filter((c) => String(c.kode) === '3-1200');
      label = 'Akun prive';
      petunjuk = 'Uang pemilik yang diambil dari usaha. Bukan beban — ia mengurangi ekuitas.';
    } else if (jenis === 'SETOR') {
      lawan = kasSaja; label = '—';
      petunjuk = 'Pakai tombol Terima di kartu Setoran toko; jumlahnya diambil dari uang yang benar-benar dihitung saat tutup laci.';
    } else {
      lawan = bisa.filter((c) => AKUN_KAS.indexOf(String(c.kode)) === -1);
      label = 'Akun lawan';
      petunjuk = jenis === 'MASUK'
        ? 'Uang masuk ke usaha: setoran modal (3-1100), pendapatan lain (7-1100).'
        : 'Uang keluar dari usaha: gaji (6-1100), listrik, perlengkapan, reimburse uang talangan toko.';
    }
    $('#kasAkun').innerHTML = opsi(lawan) || '<option value="">(tidak ada)</option>';
    $('#labelKasLawan').textContent = label;
    $('#petunjukKas').textContent = petunjuk;
    $('#kasAkun').disabled = jenis === 'SETOR';
    $('#btnSimpanKas').disabled = jenis === 'SETOR';
  }

  /* uuid bertahan sampai catatannya BERHASIL tersimpan — bukan dibuat ulang
     tiap penekanan tombol, supaya penjaga duplikat di server benar-benar
     menyala kalau jawabannya hilang di jalan. */
  let _uuidKas = null;
  const uuidKas = () => (_uuidKas ||
    (_uuidKas = 'KAS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
  /* SATU uuid bersama untuk tiga tombol (Catat, Terima setoran, Balik) membuat
     satu nomor terpakai di dua cabang, dan setoran kedua di cabang yang sama
     dijawab "duplikat, berhasil" tanpa ditulis (bagian 261). Setoran & Balik
     kini ber-uuid dari DOKUMENNYA sendiri: menekan dua kali = satu catatan. */
  const uuidSetoran = (cab, idShift) => 'SETOR-' + cab + '-' + idShift;
  const uuidBalik = (uuidAsli) => 'BALIK-' + uuidAsli;

  async function simpanKasBaru() {
    const jenis = nilai('kasJenis');
    const akun = nilai('kasAkun');
    const sumber = nilai('kasSumber');
    const jumlah = angka('kasJumlah');
    const ket = nilai('kasKeterangan').trim();
    if (!akun) return toast('Pilih akun lawannya dulu.', 'galat');
    if (!sumber) return toast('Pilih sumber kasnya dulu.', 'galat');
    if (!(jumlah > 0)) return toast('Nominal harus lebih dari nol.', 'galat');
    if (!ket) return toast('Keterangan wajib diisi — inilah satu-satunya penjelasan uang yang bergerak.', 'galat');

    /* PRIVE dan PINDAH sama-sama KELUAR dari sumber kasnya; yang membedakan
       akun lawannya, dan itu sudah dipilih dropdown di atas. */
    const tipe = jenis === 'MASUK' ? 'MASUK' : 'KELUAR';
    /* Konfirmasi (bagian 245): uang back office bergerak dan dijurnal. */
    if (!(await tanya(tipe === 'MASUK' ? 'Catat kas masuk?' : 'Catat kas keluar?',
          `<p class="petunjuk">${esc(rpTeks(jumlah))} — ${esc(ket)}. Jurnalnya dicatat sekarang; salah catat dibetulkan dengan tombol Balik.</p>`,
          { ya: 'Simpan catatan kas' }))) return;
    const b = $('#btnSimpanKas');
    b.classList.add('sibuk');
    b.disabled = true;
    try {
      await API.simpanKas({
        cabang: nilai('kasCabangTujuan') ||
                (cabangKas !== '*' ? cabangKas : APP_STATE.cabang),
        uuid: uuidKas(),
        /* Meja ini tidak pernah berada di dalam shift. */
        id_shift: '', luar_laci: true,
        akun_kas: sumber, tipe, kode_akun: akun,
        jumlah, keterangan: ket
      });
      _uuidKas = null;
      $('#kasJumlah').value = '';
      $('#kasKeterangan').value = '';
      toast('Catatan kas tersimpan.');
      await muatHasilKas();
    } catch (e) { toast('Gagal menyimpan kas: ' + e.message, 'galat'); }
    finally { b.classList.remove('sibuk'); b.disabled = false; }
  }

  /* ==================== GAJI & KASBON (bagian 250) ====================
     Server: apps-script/28_Gaji.gs. Dua tab: Gaji (slip per bulan) dan
     Kasbon (buku pembantu 1-1310). Slip DRAF bisa diubah dan dibayar; slip
     DIBAYAR terkunci dan hanya bisa dicetak — slip yang belum dibayar tidak
     dicetak, supaya kertas yang diserahkan selalu sama dengan uang yang keluar. */

  const PERIODE_GAJI = { id: 'gajiPeriodePilih', dari: 'gajiPeriode', bulanan: true,
                         nilai: 'bulan', label: 'Periode' };
  const KOMPONEN_GAJI = [['gaji_pokok', 'Gaji pokok'], ['tunj_kesehatan', 'Tunjangan kesehatan'],
                         ['tunj_makan', 'Tunjangan makan'], ['bonus', 'Bonus'], ['komisi', 'Komisi']];
  let gajiData = null, kasbonData = null, petugasGaji = [], cabangGaji = '*';

  const namaBulan = (per) => {
    const [y, m] = String(per || '').split('-');
    const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
               'September', 'Oktober', 'November', 'Desember'][Number(m) - 1];
    return b ? b + ' ' + y : String(per || '');
  };

  /** Terbilang rupiah untuk slip — bilangan bulat sampai triliunan. */
  function terbilang(n) {
    const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    const t = (x) => x < 12 ? s[x]
      : x < 20 ? t(x - 10) + ' belas'
      : x < 100 ? t(Math.floor(x / 10)) + ' puluh ' + t(x % 10)
      : x < 200 ? 'seratus ' + t(x - 100)
      : x < 1000 ? t(Math.floor(x / 100)) + ' ratus ' + t(x % 100)
      : x < 2000 ? 'seribu ' + t(x - 1000)
      : x < 1e6 ? t(Math.floor(x / 1000)) + ' ribu ' + t(x % 1000)
      : x < 1e9 ? t(Math.floor(x / 1e6)) + ' juta ' + t(x % 1e6)
      : x < 1e12 ? t(Math.floor(x / 1e9)) + ' miliar ' + t(x % 1e9)
      : t(Math.floor(x / 1e12)) + ' triliun ' + t(x % 1e12);
    const v = Math.round(Math.abs(Number(n) || 0));
    return v === 0 ? 'nol rupiah' : (t(v).replace(/\s+/g, ' ').trim() + ' rupiah');
  }

  const namaAkunKas = async () => {
    const coa = await DB.kvGet('coa', []);
    const peta = {};
    (coa || []).forEach((c) => { peta[String(c.kode)] = c.nama; });
    return AKUN_KAS.map((k) => [k, k + ' — ' + (peta[k] || k)]);
  };

  async function muatGaji() {
    const w = $('#isiGaji');
    if (!w) return;
    if (!$('#panelGaji')) {
      w.innerHTML = `
        <div class="kartu" style="padding-bottom:0"><div class="tab-modal" id="tabGaji" style="margin:0">
          <button data-tab-gaji="gaji" class="aktif">Gaji</button>
          <button data-tab-gaji="kasbon">Kasbon</button></div>
          <p class="petunjuk" style="margin-top:10px">Gaji petugas per bulan: tekan <strong>Siapkan gaji bulan ini</strong>,
             periksa angkanya lewat <strong>Ubah</strong>, lalu <strong>Bayar</strong> dan cetak slipnya.
             Gaji pokok dan tunjangan disalin dari bulan lalu.</p></div>
        <div id="panelGaji">
          <div class="kartu"><div class="saring-baris">
            <span class="wadah-periode" id="wadahPeriodeGaji"></span>
            <div class="kendali-tetap"><label>Cabang</label>
              <select id="gajiCabang" class="kendali-tetap" title="Cabang">
                <option value="*">Semua cabang</option>
                ${daftarKodeCabang().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select></div>
          </div><div id="ringkasGaji"></div></div>
          <div id="hasilGaji"></div>
        </div>
        <div id="panelKasbon" hidden><div id="hasilKasbon"></div></div>`;
      $('#wadahPeriodeGaji').innerHTML = Periode.html(PERIODE_GAJI);
      Periode.pasang(PERIODE_GAJI, muatHasilGaji);
      $('#gajiCabang').addEventListener('change', (e) => { cabangGaji = e.target.value; gambarGaji(); });
    }
    if (!$('#panelKasbon').hidden) return muatKasbon();
    return muatHasilGaji();
  }

  function pilihTabGaji(tab) {
    $$('#tabGaji [data-tab-gaji]').forEach((b) => b.classList.toggle('aktif', b.dataset.tabGaji === tab));
    $('#panelGaji').hidden = tab !== 'gaji';
    $('#panelKasbon').hidden = tab !== 'kasbon';
    return API.tugas(() => (tab === 'gaji' ? muatHasilGaji() : muatKasbon()), { baca: true });
  }

  async function muatHasilGaji() {
    memuat('#hasilGaji');
    try {
      gajiData = await API.daftarGaji({ periode: nilai('gajiPeriode') });
      gambarGaji();
    } catch (e) { galat('#hasilGaji', e); }
  }

  function gambarGaji() {
    const d = gajiData;
    if (!d || !$('#hasilGaji')) return;
    const slip = d.slip.filter((s) => cabangGaji === '*' || s.cabang === cabangGaji);
    const jum = (k) => slip.reduce((a, s) => a + (Number(s[k]) || 0), 0);
    const dibayar = slip.filter((s) => s.status === 'DIBAYAR');
    const nPotong = slip.filter((s) => s.potongan_kasbon > 0).length;
    const kotak = (label, isi, ekor) =>
      `<div class="mini"><div class="mini-kepala"><div class="mini-label">${esc(label)}</div></div><div class="mini-nilai">${isi}</div><div class="mini-ekor">${esc(ekor)}</div></div>`;
    $('#ringkasGaji').innerHTML = `<div class="petak-mini petak-uang petak-stok-mini" style="margin-top:12px">
        ${kotak('Total gaji', rp(jum('bruto')), 'sebelum potongan')}
        ${kotak('Potongan kasbon', rp(jum('potongan_kasbon')), nPotong + ' orang')}
        ${kotak('Total diterima', rp(jum('diterima')), 'uang yang keluar')}
        ${kotak('Sudah dibayar', esc(dibayar.length + ' / ' + slip.length), 'orang')}
      </div>
      ${d.belum_disiapkan ? `<p class="petunjuk">${esc(d.belum_disiapkan)} petugas aktif belum punya slip
        ${esc(namaBulan(d.periode))}. Tekan <strong>Siapkan gaji bulan ini</strong> — gaji pokok dan
        tunjangan disalin dari slip terakhir masing-masing.</p>` : ''}`;

    const bolehUbah = bolehIzin('gaji', 'ubah');
    const sisaKb = (k) => ((d.kasbon || {})[k] || { sisa: 0 }).sisa;
    const kolom = [
      { judul: 'Petugas', render: (s) => `<strong>${esc(s.nama)}</strong><span class="petunjuk" style="display:block;margin:0">${
          s.cabang ? esc(s.cabang) : '<span style="color:var(--bahaya)">keliling — pilih cabang</span>'}</span>` },
      { judul: 'Gaji pokok', angka: true, render: (s) => rp(s.gaji_pokok) },
      { judul: 'Tunjangan', angka: true, render: (s) => rp(s.tunj_kesehatan + s.tunj_makan) },
      { judul: 'Bonus + komisi', angka: true, render: (s) => rp(s.bonus + s.komisi) },
      { judul: 'Potongan kasbon', angka: true, render: (s) => rp(s.potongan_kasbon) +
          (s.status === 'DRAF' && sisaKb(s.kode_petugas) > 0
            ? `<span class="petunjuk" style="display:block;margin:0">sisa ${esc(rpTeks(sisaKb(s.kode_petugas)))}</span>` : '') },
      { judul: 'Diterima', angka: true, render: (s) => `<strong>${rp(s.diterima)}</strong>` },
      { judul: 'Status', render: (s) => s.status === 'DIBAYAR'
          ? lencanaDash('Dibayar', 'hijau') : lencanaDash('Draf', '') },
      { judul: 'Aksi', render: (s) => `<div style="display:flex;gap:6px;white-space:nowrap">${
          s.status === 'DIBAYAR'
            ? tombolBaris('', 'Cetak', IKON.cetak, `data-cetak-slip="${esc(s.id_slip)}"`, 'Cetak slip gaji')
            : bolehUbah ? tombolBaris('', 'Ubah', IKON.ubah, `data-ubah-slip="${esc(s.id_slip)}"`, 'Ubah slip') +
                          tombolBaris('utama', 'Bayar', IKON.bayar, `data-bayar-slip="${esc(s.id_slip)}"`, 'Bayar gaji ini')
            : ''}</div>` }
    ];
    /* Siapkan PALING KANAN (bagian 256, pemilik: "letakkan dipaling kanan"). */
    const aksi = [
      dibayar.length ? `<button class="tombol" id="btnCetakSemuaSlip">${ikonAlat('cetak')}<span>Cetak semua slip</span></button>` : '',
      bolehIzin('gaji', 'buat') ? `<button class="tombol" id="btnSiapkanGaji">${ikonAlat('tambah')}<span>Siapkan gaji bulan ini</span></button>` : ''
    ].join('');
    $('#hasilGaji').innerHTML = `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>Slip gaji ${esc(namaBulan(d.periode))}</h3>
        <span class="satuan-uang">dalam Rupiah</span>
        ${aksi ? `<div class="kanan">${aksi}</div>` : ''}</div>
      ${tabel(kolom, slip, { kosong: 'Belum ada slip untuk bulan ini. Tekan "Siapkan gaji bulan ini".' })}
    </div>`;
  }

  const slipDari = (id) => ((gajiData && gajiData.slip) || []).find((s) => s.id_slip === id);

  function bukaUbahSlip(id) {
    const s = slipDari(id);
    if (!s) return;
    const sisa = ((gajiData.kasbon || {})[s.kode_petugas] || { sisa: 0 }).sisa;
    const kolom = KOMPONEN_GAJI.map(([k, l]) =>
      `<label>${esc(l)}</label><input type="text" inputmode="numeric" class="uang" id="gj_${k}" value="${ribuan(s[k] || 0)}">`).join('');
    bukaModal('Ubah slip — ' + s.nama + ', ' + namaBulan(s.periode), `<div class="baris-form">
      ${kolom}
      <label>Potongan kasbon</label>
      <input type="text" inputmode="numeric" class="uang" id="gj_potongan_kasbon" value="${ribuan(s.potongan_kasbon || 0)}" ${sisa > 0 || s.potongan_kasbon ? '' : 'disabled'}>
      <p class="petunjuk">Sisa kasbon ${esc(s.nama)}: <strong>${esc(rpTeks(sisa))}</strong>. Potongan tidak boleh melebihi sisanya.</p>
      <label>Cabang yang menanggung gaji</label>
      <select id="gj_cabang"><option value="">— pilih —</option>${daftarKodeCabang().map((c) =>
        `<option value="${esc(c)}" ${s.cabang === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label>Catatan</label>
      <input type="text" id="gj_catatan" value="${esc(s.catatan || '')}" maxlength="200">
    </div>`,
    `<button class="tombol" data-tutup="1">Batal</button>
     <button class="tombol utama" data-simpan-slip="${esc(s.id_slip)}">Simpan</button>`);
  }

  async function simpanSlipLayar(id) {
    const p = { id_slip: id, cabang: nilai('gj_cabang'), catatan: nilai('gj_catatan') };
    KOMPONEN_GAJI.forEach(([k]) => { p[k] = angka('gj_' + k); });
    if (!$('#gj_potongan_kasbon').disabled) p.potongan_kasbon = angka('gj_potongan_kasbon');
    await API.simpanGaji(p);
    tutupModal();
    toast('Slip disimpan.');
    return muatHasilGaji();
  }

  async function bukaBayarSlip(id) {
    const s = slipDari(id);
    if (!s) return;
    if (!s.cabang) return toast(s.nama + ' petugas keliling — pilih dulu cabangnya lewat Ubah.');
    const akun = await namaAkunKas();
    bukaModal('Bayar gaji — ' + s.nama, `<div class="baris-form">
      <p>Gaji ${esc(namaBulan(s.periode))}: <strong>${rp(s.bruto)}</strong>
         ${s.potongan_kasbon ? `dikurangi kasbon <strong>${rp(s.potongan_kasbon)}</strong>` : ''}.
         Uang yang diserahkan <strong>${rp(s.diterima)}</strong>, dibebankan ke ${esc(s.cabang)}.</p>
      <label>Dibayar dari</label>
      <select id="gjSumber">${akun.map(([k, l]) => `<option value="${esc(k)}" ${k === '1-1150' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label>Tanggal bayar</label>
      <input type="date" id="gjTanggal" value="${esc(tanggalLokal(new Date()))}">
      <p class="petunjuk">Dicatat Dr 6-1100 Beban Gaji / Cr akun di atas${s.potongan_kasbon
        ? ', dan potongan kasbonnya Dr 6-1100 / Cr 1-1310' : ''}. Slip yang sudah dibayar tidak bisa diubah lagi.</p>
    </div>`,
    `<button class="tombol" data-tutup="1">Batal</button>
     <button class="tombol utama" data-bayar-simpan="${esc(s.id_slip)}">${ikonAlat('bayar')}<span>Bayar</span></button>`);
  }

  async function bayarSlipLayar(id) {
    const s = slipDari(id);
    const sel = $('#gjSumber');
    const dari = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : nilai('gjSumber');
    /* Keputusan pemilik 24 Sep 2026 (bagian 251): pembayaran TIDAK bisa
       dibatalkan, jadi kalimat pertamanya menyebut itu, angkanya dirinci,
       dan tombolnya merah. Slip Draf-lah tempat memeriksa. */
    if (!(await tanya('Bayar gaji ' + s.nama + '?',
          `<p><strong>Pembayaran ini tidak bisa dibatalkan.</strong> Sesudah dibayar,
             slipnya terkunci dan angkanya tidak bisa diubah lagi.</p>
           <table class="tabel" style="margin:8px 0"><tbody>
             <tr><td>Gaji</td><td class="kanan">${rp(s.bruto)}</td></tr>
             <tr><td>Potongan kasbon</td><td class="kanan">${rp(s.potongan_kasbon)}</td></tr>
             <tr><td><strong>Diserahkan</strong></td><td class="kanan"><strong>${rp(s.diterima)}</strong></td></tr>
             <tr><td>Dari</td><td class="kanan">${esc(dari)}</td></tr></tbody></table>
           <p class="petunjuk">Belum yakin? Tekan Batal dan periksa lewat Ubah — slip Draf aman diubah kapan saja.</p>`,
          { ya: 'Ya, bayar', jenis: 'bahaya' }))) return;
    await API.bayarGaji({ id_slip: id, akun_kas: nilai('gjSumber'), tanggal: nilai('gjTanggal') });
    tutupModal();
    toast('Gaji ' + s.nama + ' dibayar.');
    return muatHasilGaji();
  }

  /** Satu slip = setengah A4; dua per lembar, dipisah garis gunting. */
  function htmlSlip(s, sisaSesudah, set) {
    const baris = (l, v) => `<tr><td>${esc(l)}</td><td class="n">${esc(ribuan(v))}</td></tr>`;
    return `<div class="slip">
      <div class="kop"><div><h1>${esc(String(set.nama_usaha || 'SINDIKAT KARTU').toUpperCase())}</h1>
          <p class="sub">${esc(set.alamat_usaha || ('Cabang ' + s.cabang))}</p></div>
        <div class="kanan"><h2 class="judul-dok">SLIP GAJI</h2><p class="sub">Periode <b>${esc(namaBulan(s.periode))}</b></p></div></div>
      <table class="info"><tr><td class="k">Nama</td><td><b>${esc(s.nama)}</b></td><td class="k">Dibayar</td><td>${esc(tglTampil(s.tanggal_bayar))}</td></tr>
        <tr><td class="k">Kode</td><td>${esc(s.kode_petugas)}</td><td class="k">Dari</td><td>${esc(s.akun_kas)}</td></tr>
        <tr><td class="k">Cabang</td><td>${esc(s.cabang)}</td><td class="k">No. slip</td><td>${esc(s.id_slip)}</td></tr></table>
      <div class="dua">
        <table class="isi"><thead><tr><th>Penerimaan</th><th class="n">Rp</th></tr></thead><tbody>
          ${KOMPONEN_GAJI.map(([k, l]) => baris(l, s[k])).join('')}</tbody>
          <tfoot><tr><td>Total penerimaan</td><td class="n">${esc(ribuan(s.bruto))}</td></tr></tfoot></table>
        <table class="isi"><thead><tr><th>Potongan</th><th class="n">Rp</th></tr></thead><tbody>
          ${baris('Kasbon', s.potongan_kasbon)}
          <tr><td class="kosong">Sisa kasbon sesudah ini</td><td class="n kosong">${esc(ribuan(sisaSesudah))}</td></tr></tbody>
          <tfoot><tr><td>Total potongan</td><td class="n">${esc(ribuan(s.potongan_kasbon))}</td></tr></tfoot></table>
      </div>
      <div class="terima">Diterima <b>Rp ${esc(ribuan(s.diterima))}</b><span>${esc(terbilang(s.diterima))}</span></div>
      ${s.catatan ? `<p class="sub">Catatan: ${esc(s.catatan)}</p>` : ''}
      <div class="ttd"><div>Penerima<br><br><br>( ${esc(s.nama)} )</div><div>Diserahkan oleh<br><br><br>( ................................ )</div></div>
    </div>`;
  }

  const GAYA_SLIP = `<style>
    @page { size: A4 portrait; margin: 10mm; }
    .slip { height: 136mm; padding: 3mm 1mm; display: flex; flex-direction: column; break-inside: avoid; }
    .slip:nth-child(even) { border-top: 1px dashed #000; break-after: page; }
    .kop { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 4px; }
    .kop .kanan { text-align: right; } .kop .judul-dok { margin: 0; }
    table.info { margin-top: 6px; font-size: 9.5pt; }
    .dua { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
    .terima { margin-top: 8px; border: 2px solid #000; padding: 5px 8px; font-size: 11pt; }
    .terima span { display: block; font-size: 8.5pt; font-style: italic; }
    .ttd { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; text-align: center; font-size: 9pt; }
  </style>`;

  function cetakSlip(daftar) {
    if (!daftar.length) return;
    /* Sisa kasbon SESUDAH slip ini = sisa hari ini ditambah potongan slip-slip
       yang dibayar SESUDAHNYA. Untuk slip bulan berjalan keduanya sama. */
    const sisa = (s) => ((gajiData.kasbon || {})[s.kode_petugas] || { sisa: 0 }).sisa;
    const isi = GAYA_SLIP + daftar.map((s) => htmlSlip(s, sisa(s), APP_STATE.setting || {})).join('');
    try { Struk.cetakDokumen('Slip gaji ' + namaBulan(daftar[0].periode), isi); }
    catch (e) { toast(e.message); }
  }

  async function muatKasbon() {
    memuat('#hasilKasbon');
    try {
      const [k, pt] = await Promise.all([API.daftarKasbon({}), API.daftarPetugas()]);
      kasbonData = k;
      petugasGaji = pt || [];
      gambarKasbon();
    } catch (e) { galat('#hasilKasbon', e); }
  }

  function gambarKasbon() {
    const peta = (kasbonData && kasbonData.kasbon) || {};
    const nama = {};
    petugasGaji.forEach((p) => { nama[p.kode] = p; });
    const baris = Object.keys(peta).map((k) => Object.assign({ kode: k, nama: (nama[k] || {}).nama || k,
      cabang: (nama[k] || {}).cabang || '' }, peta[k])).sort((a, b) => urutNama(a.nama, b.nama));
    const kolom = [
      { judul: 'Petugas', render: (r) => `<strong>${esc(r.nama)}</strong><span class="petunjuk" style="display:block;margin:0">${esc(r.cabang || '')}</span>` },
      { judul: 'Diberikan', angka: true, render: (r) => rp(r.beri) },
      { judul: 'Sudah dipotong', angka: true, render: (r) => rp(r.potong) },
      { judul: 'Sisa', angka: true, render: (r) => `<strong>${rp(r.sisa)}</strong>` },
      { judul: 'Aksi', render: (r) => tombolBaris('', 'Riwayat', IKON.riwayat, `data-riwayat-kasbon="${esc(r.kode)}"`, 'Riwayat kasbon') }
    ];
    $('#hasilKasbon').innerHTML = `<div class="kartu laporan-uang">
      <div class="bar-alat"><h3>Sisa kasbon per petugas</h3><span class="satuan-uang">dalam Rupiah</span>
        ${bolehIzin('gaji', 'buat') ? `<div class="kanan">${tombolTambah('btnBeriKasbon', 'Beri kasbon')}</div>` : ''}</div>
      ${tabel(kolom, baris, { kosong: 'Belum ada kasbon.' })}
      <p class="petunjuk">Kasbon dicatat Dr 1-1310 Piutang Karyawan / Cr kas. Sisanya berkurang saat
         dipotong dari slip gaji yang dibayar.</p>
    </div>`;
  }

  async function formBeriKasbon() {
    const akun = await namaAkunKas();
    const aktif = petugasGaji.filter((p) => p.aktif).sort((a, b) => urutNama(a.nama, b.nama));
    bukaModal('Beri kasbon', `<div class="baris-form">
      <label>Petugas</label>
      <select id="kbPetugas">${aktif.map((p) => `<option value="${esc(p.kode)}">${esc(p.nama)} (${esc(p.cabang || '*')})</option>`).join('')}</select>
      <label>Nominal</label>
      <input type="text" inputmode="numeric" class="uang" id="kbJumlah" value="0">
      <label>Cabang yang mengeluarkan (untuk petugas keliling)</label>
      <select id="kbCabang"><option value="">— cabang petugasnya —</option>${daftarKodeCabang().map((c) =>
        `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <label>Dibayar dari</label>
      <select id="kbSumber">${akun.map(([k, l]) => `<option value="${esc(k)}" ${k === '1-1150' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label>Tanggal</label>
      <input type="date" id="kbTanggal" value="${esc(tanggalLokal(new Date()))}">
      <label>Keterangan</label>
      <input type="text" id="kbKet" maxlength="120" placeholder="mis. keperluan keluarga">
    </div>`,
    `<button class="tombol" data-tutup="1">Batal</button>
     <button class="tombol utama" id="btnSimpanKasbon" data-uuid="${esc(crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2))}">Simpan</button>`);
  }

  async function simpanKasbonLayar(uuidKb) {
    const jml = angka('kbJumlah');
    const sel = $('#kbPetugas');
    const nm = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
    const sk = $('#kbSumber');
    const dariKb = sk && sk.selectedOptions[0] ? sk.selectedOptions[0].textContent : nilai('kbSumber');
    if (!(await tanya('Beri kasbon ' + rpTeks(jml) + '?',
          `<p><strong>Kasbon ini tidak bisa dibatalkan.</strong> Uangnya dicatat keluar dan menjadi
             pinjaman yang dipotong dari gajinya nanti.</p>
           <table class="tabel" style="margin:8px 0"><tbody>
             <tr><td>Petugas</td><td class="kanan">${esc(nm)}</td></tr>
             <tr><td><strong>Nominal</strong></td><td class="kanan"><strong>${rp(jml)}</strong></td></tr>
             <tr><td>Dari</td><td class="kanan">${esc(dariKb)}</td></tr></tbody></table>`,
          { ya: 'Ya, beri kasbon', jenis: 'bahaya' }))) return;
    await API.beriKasbon({ uuid: uuidKb, kode_petugas: nilai('kbPetugas'), jumlah: jml, cabang: nilai('kbCabang'),
                           akun_kas: nilai('kbSumber'), tanggal: nilai('kbTanggal'), keterangan: nilai('kbKet') });
    tutupModal();
    toast('Kasbon dicatat.');
    return muatKasbon();
  }

  async function bukaRiwayatKasbon(kode) {
    const r = await API.daftarKasbon({ kode_petugas: kode });
    const p = petugasGaji.find((x) => x.kode === kode) || { nama: kode };
    const kolom = [
      { judul: 'Tanggal', render: (x) => esc(tglTampil(x.tanggal)) },
      { judul: 'Jenis', render: (x) => x.jenis === 'POTONG' ? 'Dipotong gaji' : 'Diberikan' },
      { judul: 'Nominal', angka: true, render: (x) => rp(x.jumlah) },
      { judul: 'Keterangan', render: (x) => esc(x.keterangan) }
    ];
    bukaModal('Riwayat kasbon — ' + p.nama, tabelPolos(kolom, r.riwayat || [], { kosong: 'Belum ada riwayat.' }));
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
    /* Memuat layar tidak menahan orang pindah menu (bagian 266). */
    return API.tugas(() => _muat(layar), { baca: true });
  }

  async function _muat(layar) {
    if (!API.online) {
      const wadah = { produk: '#isiProduk', stok: '#isiStok', pembelian: '#isiPembelian',
                      mitra: '#isiMitra', petugas: '#isiPetugas', poin: '#isiPoin',
                      piutang: '#isiPiutang', utang: '#isiUtang', pengguna: '#isiPengguna',
                      cabang: '#isiCabang', sistem: '#isiSistem', audit: '#isiAudit',
                      dashboard: '#isiDashboard', transfer: '#isiTransfer', retur: '#isiRetur',
                      permintaan: '#isiPermintaan', pembatalan: '#isiPembatalan',
                      diskon: '#isiDiskon',
                      pulsa: '#isiPulsa',
                      accurate: '#isiAccurate',
                      aset: '#isiAset',
                      gaji: '#isiGaji',
                      kas: '#isiKas',
                      konsolidasi: '#isiKonsolidasi',
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
      case 'pulsa': return muatPulsa();
      case 'accurate': return muatAccurate();
      case 'aset': return muatAset();
      case 'gaji': return muatGaji();
      case 'kas': return muatKas();
      case 'konsolidasi': return muatKonsolidasi();
      case 'retur':     return muatRetur();
      case 'pembatalan': return muatPembatalan();
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
    Object.assign(GAMBAR_HALAMAN, {
      produk: { halaman: halProduk, wadah: '#wadahTabelProduk', gambar: gambarBarisProduk },
      stok:   { halaman: halStok,   wadah: '#tabelStok',        gambar: gambarBarisStok }
    });
    Object.assign(GAMBAR_NONAKTIF, {
      produk:    () => { halProduk.reset(); gambarProduk(); },
      pelanggan: gambarMitra,
      supplier:  gambarMitra,
      petugas:   gambarPetugas,
      user:      gambarPengguna,
      perangkat: gambarPengguna,
      cabang:    gambarCabang,
      /* Kartu meja tinggal DI DALAM layar Cabang, jadi yang menggambarnya
         ulang pun gambarCabang() — ia yang memasang kedua kartunya. */
      lini:      gambarCabang
    });

    /* Klik judul kolom = urutkan. Pendengarnya SATU, di dokumen, bukan dipasang
       ulang tiap kali tabel digambar: seluruh tabel back office dibuat sebagai
       teks HTML yang mengganti innerHTML, jadi pendengar yang dipasang ke
       elemennya akan hilang pada penggambaran berikutnya — dan hilangnya tidak
       kelihatan sampai ada yang mengklik dan tidak terjadi apa-apa. */
    document.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-urut-kol]');
      if (!th) return;
      /* Daftar berhalaman mengurutkan SELURUH barisnya lewat keadaan halaman,
         lalu digambar ulang — menyusun ulang 100 <tr> yang kebetulan tampil
         bukan mengurutkan (lihat `buatHalaman`). */
      const g = Object.values(GAMBAR_HALAMAN).find(x => th.closest(x.wadah));
      if (g) { g.halaman.putarUrut(th.textContent.trim()); g.gambar(); return; }
      urutkanTabel(th);
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
      const t = e.target.closest('button, [data-tutup], tr[data-rincian-beli], tr[data-detail-transfer], tr[data-kartu-stok], [data-stiker-tambah]');
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
          if (buka && pemicuMenu.closest('.menu-baris')) letakkanMenuBaris(pemicuMenu, m);
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
        const g = GAMBAR_HALAMAN[d.halUntuk];
        if (!g) return;
        g.halaman.geser(arah);
        g.gambar();
        /* Digulirkan ke kepala tabel, bukan dibiarkan di tempat: menekan
           "Berikutnya" di kaki halaman lalu tetap berada di kaki berarti
           melihat baris 200 dari halaman baru, bukan baris 101. */
        $(g.wadah)?.scrollIntoView({ block: 'start', behavior: 'auto' });
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
        /* Konfirmasi (bagian 245): uang keluar ke supplier. */
        if (!(await tanya('Bayar utang ini?',
              `<p class="petunjuk">${esc(rpTeks(angka('buJumlah')))} dibayar tanggal ${esc(tglTampil(nilai('buTanggal')))} lewat ${esc(nilai('buMetode') || 'transfer')}, dan jurnalnya dicatat.</p>`,
              { ya: 'Simpan' }))) return;
        t.disabled = true;
        try {
          const r = await API.bayarUtang({
            uuid: uuidDokumen('bayar_utang'),
            uuid_utang: d.uuid, cabang: d.cabang, tanggal: nilai('buTanggal'),
            jumlah: angka('buJumlah'), metode: nilai('buMetode'), referensi: nilai('buRef')
          });
          lepasUuidDokumen('bayar_utang');
          tutupModal();
          toast(r.lunas ? 'Utang LUNAS.' : 'Pembayaran tersimpan — sisa ' + rpTeks(r.sisa));
          return muat('utang');
        } catch (e) {
          t.disabled = false;
          return pesan('#pesanBayarUtang',
            e.message + ' — tekan Simpan sekali lagi, jumlahnya tidak akan tercatat dua kali.',
            'galat');
        }
      }

      /* --- piutang --- */
      if (d.bayarPiutang) return dialogBayarPiutang(d.bayarPiutang, d.cabang);
      if (t.id === 'btnKonfirmasiBayarPiutang') {
        /* Konfirmasi (bagian 245): uang masuk dari pelanggan. */
        if (!(await tanya('Terima pembayaran piutang ini?',
              `<p class="petunjuk">${esc(rpTeks(angka('bpJumlah')))} diterima tanggal ${esc(tglTampil(nilai('bpTanggal')))} lewat ${esc(nilai('bpMetode') || 'tunai')}, dan jurnalnya dicatat.</p>`,
              { ya: 'Simpan' }))) return;
        t.disabled = true;
        try {
          const r = await API.bayarPiutang({
            uuid: uuidDokumen('bayar_piutang'),
            uuid_piutang: d.uuid, cabang: d.cabang, tanggal: nilai('bpTanggal'),
            jumlah: angka('bpJumlah'), metode: nilai('bpMetode'), referensi: nilai('bpRef')
          });
          await sukses(r.lunas ? 'Piutang lunas.' : 'Pembayaran tercatat, sisa ' + rpTeks(r.sisa), 'piutang');
        } catch (x) {
          $('#pesanBayarPiutang').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
          t.disabled = false;
        }
        return;
      }

      /* --- gaji & kasbon (bagian 250) --- */
      if (d.tabGaji)               return pilihTabGaji(d.tabGaji);
      if (d.ubahSlip)              return bukaUbahSlip(d.ubahSlip);
      if (d.bayarSlip)             return bukaBayarSlip(d.bayarSlip);
      if (d.riwayatKasbon)         return bukaRiwayatKasbon(d.riwayatKasbon);
      if (t.id === 'btnBeriKasbon') return formBeriKasbon();
      if (d.cetakSlip)             return cetakSlip([slipDari(d.cetakSlip)].filter(Boolean));
      if (t.id === 'btnCetakSemuaSlip') {
        return cetakSlip(gajiData.slip.filter((s) => s.status === 'DIBAYAR' &&
          (cabangGaji === '*' || s.cabang === cabangGaji)));
      }
      if (t.id === 'btnSiapkanGaji') {
        t.disabled = true;
        try {
          const r = await API.siapkanGaji({ periode: nilai('gajiPeriode') });
          toast(r.dibuat ? r.dibuat + ' slip dibuat.' : 'Semua petugas aktif sudah punya slip bulan ini.');
          await muatHasilGaji();
        } finally { t.disabled = false; }
        return;
      }
      /* Tombol yang menulis dimatikan selama menunggu: dua ketukan cepat pada
         Bayar atau Beri kasbon = dua kali uang keluar (servernya juga menolak,
         tapi orang tidak perlu ditolak untuk tahu). */
      if (d.simpanSlip) {
        t.disabled = true;
        try { await simpanSlipLayar(d.simpanSlip); } finally { t.disabled = false; }
        return;
      }
      if (d.bayarSimpan) {
        t.disabled = true;
        try { await bayarSlipLayar(d.bayarSimpan); } finally { t.disabled = false; }
        return;
      }
      if (t.id === 'btnSimpanKasbon') {
        t.disabled = true;
        try { await simpanKasbonLayar(d.uuid); } finally { t.disabled = false; }
        return;
      }

      /* --- aset tetap (bagian 216) --- */
      if (t.id === 'btnAsetBaru')  return bukaBorangAset(null);
      if (d.editAset)              return bukaBorangAset(d.editAset);
      if (d.lepasAset)             return bukaBorangLepas(d.lepasAset);
      if (d.lepasSimpan) {
        /* Konfirmasi (bagian 245): pelepasan menjurnal laba/rugi dan tidak bisa diurungkan. */
        if (!(await tanya('Lepaskan aset ini?',
              '<p class="petunjuk">Aset dikeluarkan dari daftar, penyusutannya berhenti, dan laba atau rugi pelepasannya dijurnal. Tidak bisa diurungkan.</p>',
              { ya: 'Lepaskan', jenis: 'bahaya' }))) return;
        t.disabled = true;
        try { await lepaskanAset(d.lepasSimpan); }
        finally { t.disabled = false; }
        return;
      }
      if (d.simpanAset !== undefined) {
        /* Tombolnya dimatikan selama simpan. Dua ketukan cepat pada borang
           aset BARU melahirkan dua aset dengan kode berbeda, dan keduanya
           akan menyusut sendiri-sendiri bulan depan. */
        t.disabled = true;
        try { await simpanAsetLayar(d.simpanAset); }
        finally { t.disabled = false; }
        return;
      }
      if (t.id === 'btnSusutkan') {
        t.disabled = true;
        try { await jalankanSusut(); } finally { t.disabled = false; }
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
        /* Yang berubah di sini bukan satu orang melainkan SEBUAH PERAN — dan
           setiap pengguna yang memakainya ikut berubah pada login berikutnya.
           Mencabut satu centang bisa membuat seluruh kasir kehilangan menu yang
           dipakainya tiap hari, dan yang menekan tombolnya tidak melihat
           akibatnya dari layar ini. */
        const kodePeran = nilai('rKode').toUpperCase();
        const nPemakai = ($('#isiPengguna')._user || [])
          .filter(u => String(u.peran || '').toUpperCase() === kodePeran).length;
        if (!(await tanya('Simpan hak akses peran ' + kodePeran + '?',
              `<p class="petunjuk">Berlaku untuk <strong>${nPemakai} pengguna</strong> berperan ini,
                 di seluruh cabang. Mereka perlu keluar lalu masuk lagi agar menunya menyesuaikan.</p>`,
              { ya: 'Simpan hak akses' }))) return;
        try {
          await API.simpanPeran({
            kode_peran: kodePeran, nama: nilai('rNama'),
            keterangan: nilai('rKet'), izin, flag
          });
          await sukses('Hak akses tersimpan. Pengguna terkait perlu login ulang agar menunya menyesuaikan.', 'pengguna');
        } catch (x) {
          $('#pesanPeran').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (d.perangkat) {
        /* KEDUANYA bertanya dulu. Diminta pemilik 12 Sep 2026, dan alasannya
           berbeda untuk masing-masing:

           BLOKIR memutus tablet yang mungkin sedang dipakai berjualan. Kasir
           yang tabletnya mati di tengah antrean tidak tahu apa yang terjadi,
           dan yang menekan tombolnya tidak melihat akibatnya dari layar ini.

           SETUJUI memberi jalan masuk ke seluruh POS — dan itu langkah yang
           tidak bisa ditarik dengan mudah: server MENOLAK menghapus perangkat
           berstatus DISETUJUI (lihat tombol Hapus di atas, yang memang tidak
           muncul untuk baris DISETUJUI). Yang salah setuju harus memblokirnya
           dulu, dan itu berarti dua langkah untuk memperbaiki satu klik.

           Pertanyaannya MENYEBUT perangkat yang mana. "Blokir perangkat ini?"
           tidak bisa dijawab siapa pun yang baru menggeser daftar sepuluh
           baris — pelajaran yang sama dengan tombol Hapus di bawah. */
        const r = ($('#isiPengguna')._perangkat || [])
          .find(x => String(x.id_perangkat) === String(d.perangkat));
        const memblokir = d.status === 'DIBLOKIR';
        const ket = r ? `${r.kode} · ${r.nama}\nCabang ${r.cabang || '—'} · status ${r.status}`
                      : d.perangkat;
        if (!(await tanya(memblokir ? 'Blokir perangkat ini?' : 'Setujui perangkat ini?',
              `<div class="pesan info" style="white-space:pre-line">${esc(ket)}</div>
               <p class="petunjuk">${memblokir
                 ? 'Perangkat ini langsung tidak bisa dipakai — termasuk kalau sedang dipakai berjualan saat ini. Nota yang belum terkirim dari sana akan tertahan.'
                 : 'Perangkat ini akan bisa masuk ke POS. Perangkat yang sudah disetujui TIDAK bisa dihapus — untuk mencabutnya, ia harus diblokir dulu.'}</p>`,
              { ya: memblokir ? 'Blokir perangkat' : 'Setujui perangkat',
                jenis: memblokir ? 'bahaya' : undefined }))) return;
        try {
          await API.setujuiPerangkat({ id_perangkat: d.perangkat, status: d.status, cabang: APP_STATE.cabang });
          await muat('pengguna');
          toast('Perangkat ' + d.status.toLowerCase() + '.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.namaPerangkat) {
        const r = ($('#isiPengguna')._perangkat || [])
          .find(x => String(x.id_perangkat) === String(d.namaPerangkat));
        /* Nama lama dipakai sebagai PLACEHOLDER, bukan isian awal: `tanya`
           tidak punya nilai bawaan, dan menaruh nama lama di dalam kotak akan
           membuat orang menekan OK tanpa mengubah apa pun. */
        const nama = await tanya('Ganti nama perangkat',
          `<div class="pesan info" style="white-space:pre-line">${esc(
             r ? `${r.kode} \u00b7 ${r.nama}` : d.namaPerangkat)}</div>
           <p class="petunjuk">Nama bawaan dirakit peramban dari jenis dan ukuran layar,
              jadi dua alat yang sama tampil sama persis. Beri nama yang Anda kenali —
              misalnya <strong>Laptop Sendi \u2014 profil kerja</strong> atau
              <strong>Tablet SK03 kasir malam</strong>. Ini hanya label; tidak mengubah
              status maupun akses perangkatnya.</p>`,
          { isian: 'Nama baru (maksimal 60 karakter)', minimal: 1, ya: 'Simpan nama' });
        if (!nama) return;
        try {
          await API.ubahPerangkat({ id_perangkat: d.namaPerangkat, nama });
          await muat('pengguna');
          toast('Nama perangkat disimpan.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* MEJA perangkat. Dipisah dari dialog ganti nama, bukan digabung: `tanya`
         hanya menerima satu isian teks, sedangkan meja harus DIPILIH dari daftar
         — mengetik kode meja dengan tangan adalah cara termudah menaruh nota di
         divisi yang salah. Dan dialog ganti nama yang sudah teruji tidak perlu
         dibongkar untuk ini. */
      if (d.mejaPerangkat) {
        const r = ($('#isiPengguna')._perangkat || [])
          .find(x => String(x.id_perangkat) === String(d.mejaPerangkat));
        const daftar = APP_STATE.daftarLini || [];
        if (!daftar.length) {
          toast('Daftar lini usaha belum terisi. Tarik ulang master dulu.', 'galat');
          return;
        }
        const kini = String(r?.lini || '');
        bukaModal('Meja perangkat', `
          <div class="pesan info">${esc(r ? `${r.kode} \u00b7 ${r.nama}` : d.mejaPerangkat)}</div>
          <p class="petunjuk">Meja menentukan <strong>divisi mana</strong> yang memiliki nota
             dari alat ini. Ia melekat pada alatnya, bukan pada orangnya — tablet menempel
             di meja sedangkan petugas berganti shift. PC kantor dan gudang dibiarkan
             <strong>tanpa meja</strong>; mereka memang bukan meja jualan.</p>
          <label>Meja</label>
          <select id="selMejaPerangkat">
            <option value=""${kini ? '' : ' selected'}>— tanpa meja —</option>
            ${daftar.map(x => `<option value="${esc(x.kode)}"${
              String(x.kode) === kini ? ' selected' : ''}>${esc(x.nama)}</option>`).join('')}
          </select>
          <p class="petunjuk">Nota yang sudah terlanjur dibuat <strong>tidak berubah</strong> —
             mejanya dibekukan pada notanya saat ia lahir.</p>`,
          `<button class="tombol" data-tutup="1">Batal</button>
           <button class="tombol utama" id="btnSimpanMeja">Simpan meja</button>`);
        $('#btnSimpanMeja').addEventListener('click', async () => {
          const lini = $('#selMejaPerangkat').value;
          tutupModal();
          try {
            /* `nama` ikut dikirim karena server menuntutnya terisi; yang berubah
               tetap hanya mejanya. */
            await API.ubahPerangkat({ id_perangkat: d.mejaPerangkat, nama: r?.nama || '', lini });
            await muat('pengguna');
            toast(lini ? 'Meja perangkat disimpan.' : 'Perangkat dilepas dari meja.');
          } catch (x) { toast(x.message, 'galat'); }
        });
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
      if (t.id === 'btnSetupPulsa') {
        const id = ($('#idPulsa').value || '').trim();
        if (!id) { toast('Id spreadsheet belum diisi.', 'galat'); return; }
        const el = $('#keadaanPulsa');
        el.className = 'pesan info';
        el.textContent = 'Membuka berkasnya…';
        try {
          const h = await API.setupPulsa({ id });
          toast('Tersambung ke ' + h.nama_berkas + '.');
          await muatKeadaanPulsa();
        } catch (x) {
          el.className = 'pesan galat';
          el.textContent = x.message;
          toast(x.message, 'galat');
        }
        return;
      }

      if (t.id === 'btnCabangBaru') return editorCabang(null);
      if (t.id === 'btnLiniBaru') return editorLini(null);
      if (d.editLini) return editorLini(d.editLini);

      if (t.id === 'btnSimpanLini') {
        const kodeLama = $('#lKode').disabled ? $('#lKode').value : '';
        try {
          await API.simpanLini({
            kode_lini: $('#lKode').value, nama: nilai('lNama'),
            urutan: angka('lUrutan'),
            aktif: $('#lAktif') ? centang('lAktif') : true
          });
          tutupModal();
          /* Daftar meja ikut turun lewat `tarik_master`, dan dropdown di layar
             Pengguna membacanya dari APP_STATE — bukan dari layar ini. Tanpa
             tarikan paksa, meja yang baru dibuat tidak muncul di sana sampai
             jajak berikutnya. Pola yang sama dipakai sesudah simpan petugas. */
          await Sync.tarikMaster(true);
          await muat('cabang');
          toast(kodeLama ? 'Meja disimpan.' : 'Meja baru dibuat.');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.editCabang)             return editorCabang(d.editCabang);
      if (d.editSumber)             return editorSumberpulsa(d.editSumber);
      if (t.id === 'btnSumberBaru') return editorSumberpulsa('');
      if (d.tabpulsa) return muatPulsa(d.tabpulsa);
      if (d.tabaudit) return muatAudit(d.tabaudit);
      if (d.galatBaca) {
        t.disabled = true;
        try { await tandaiGalat(d.galatBaca); } finally { t.disabled = false; }
        return;
      }
      if (t.id === 'btnGalatSemua') {
        t.disabled = true;
        try { await tandaiGalat(null); } finally { t.disabled = false; }
        return;
      }
      /* Satu tombol untuk ketiga kartu gagal di Ringkasan gabungan. Yang
         diulang SELURUH layarnya, bukan bagian yang gagal saja: ketiga
         kegagalannya lahir dari satu panggilan yang sama. */
      if (d.ulangkons) return muatHasilKons();
      if (d.fotopulsa) return bukaFotoPulsa(d.fotopulsa);
      if (d.simpanacc) return simpanBerkasAcc();
      if (d.unggahacc) {
        /* Jenisnya dititipkan di kolom berkasnya, bukan dibaca ulang dari DOM
           saat berkasnya masuk — tombolnya sudah tergambar ulang waktu itu. */
        const i = $('#fileAcc');
        if (i) { i._jenis = d.unggahacc; i.click(); }
        return;
      }
      if (d.rinciacc) {
        const r = $('#rinci' + d.rinciacc);
        if (r) {
          r.hidden = !r.hidden;
          t.textContent = r.hidden ? 'Lihat rinciannya' : 'Sembunyikan rincian';
        }
        return;
      }
      if (t.id === 'btnKeluarBaru') {
        const w = $('#isiShiftpulsa');
        if (w && w._keluar) { w._keluar.push({ keterangan: '', jumlah: 0 }); gambarShiftpulsa(); }
        return;
      }
      if (d.hapuskel !== undefined) {
        const w = $('#isiShiftpulsa');
        if (w && w._keluar) { w._keluar.splice(+d.hapuskel, 1); gambarShiftpulsa(); }
        return;
      }
      if (t.id === 'btnFotoPulsa') { $('#spsFoto')?.click(); return; }
      if (t.id === 'btnBukaShiftPulsa') {
        t.disabled = true;
        try {
          /* Kolom saldo awal hanya ada di shift pertama cabang (bagian 228);
             kalau tidak ada, kuncinya tidak dikirim sama sekali. */
          const ketik = Array.from(document.querySelectorAll('[data-saldo-awal]'));
          const saldoAwal = ketik.length
            ? Object.fromEntries(ketik.map(i => [i.dataset.saldoAwal, angkaDari(i.value)])) : null;
          /* Konfirmasi (bagian 245): saldo awal yang diketik dijurnal ke Modal
             Pemilik dan tidak bisa diketik lagi sesudah shift pertama ditutup. */
          const totalAwal = saldoAwal ? Object.values(saldoAwal).reduce((a, v) => a + (+v || 0), 0) : 0;
          if (totalAwal > 0 && !(await tanya('Mulai shift dengan saldo awal ini?',
                `<p class="petunjuk">Saldo awal aplikasi ${esc(rpTeks(totalAwal))} dicatat ke buku besar sebagai
                   Modal Pemilik. Sesudah shift ini ditutup, angkanya tidak bisa diketik lagi.</p>`,
                { ya: 'Mulai hitungan' }))) { t.disabled = false; return; }
          const h = await API.bukaShiftPulsa({
            jenis_shift: $('#spsJenis') ? $('#spsJenis').value : 'PAGI',
            ...(saldoAwal ? { saldo_awal: saldoAwal } : {})
          });
          await muat('pulsa');
          toast(h && h.jurnal ? 'Shift pulsa dibuka. Saldo awal aplikasi dicatat ke buku besar (' + h.jurnal + ').' : 'Shift pulsa dibuka.');
        } catch (x) { toast(x.message, 'galat'); t.disabled = false; }
        return;
      }
      if (d.cabPulsa !== undefined) return pilihCabMatpulsa(d.cabPulsa);
      if (t.id === 'btnBatalShiftPulsa') {
        const st = ($('#isiShiftpulsa') || {})._st || {};
        if (!(await tanya('Batalkan shift ' + st.kode_cabang + ' · ' + st.jenis_shift + '?',
              `<p><strong>Shift ini dihapus dan tidak bisa dikembalikan.</strong> Tidak ada saldo,
                 penjualan, atau uang yang tercatat dari shift ini — saldo awal aplikasi tetap seperti
                 sebelum shift dibuka.</p>
               <p class="petunjuk">Pakai ini hanya kalau shiftnya salah dibuka. Kalau shiftnya sungguhan,
                 isi saldo akhirnya lalu tekan Kunci hitungan.</p>`,
              { ya: 'Ya, batalkan shift', jenis: 'bahaya' }))) return;
        t.disabled = true;
        try {
          await API.batalShiftPulsa({ id_shift: st.id_shift });
          toast('Shift ' + st.id_shift + ' dibatalkan.');
          const w = $('#isiShiftpulsa');
          if (w) { w._keluar = null; w._kasFisik = 0; w._catatan = ''; }
          await muatShiftpulsa();
        } catch (x) { toast(x.message, 'galat'); t.disabled = false; }
        return;
      }
      if (t.id === 'btnTutupShiftPulsa') {
        const stM = ($('#isiShiftpulsa') || {})._st || {};
        const modalM = shiftMustahil(stM);
        if (modalM) {
          $('#spsMustahil').innerHTML = `<div class="pesan galat">Shift ini tidak bisa ditutup: semua saldo
            akhir 0 dan penjualan 0, padahal saldo awalnya ${rp(modalM)}. Itu berarti seluruh saldo hilang
            tanpa terjual. <strong>Kalau shift ini salah dibuka, tekan Batalkan shift di atas.</strong>
            Kalau belum mengisi saldo akhir, isi dulu angka dari aplikasinya.</div>`;
          $('#spsMustahil').scrollIntoView({ block: 'center' });
          return;
        }
        const w = $('#isiShiftpulsa');
        const st = (w && w._st) || {};
        /* Konfirmasi (bagian 245): menutup shift menjurnal penjualan, modal, dan
           selisih kasnya, lalu mengunci angkanya. */
        if (!(await tanya('Kunci hitungan shift ini?',
              `<p class="petunjuk">Kas fisik ${esc(rpTeks(+(w && w._kasFisik) || 0))} dan saldo akhir tiap aplikasi dicatat,
                 lalu shift dikunci — angkanya tidak bisa diubah lagi. Sesudahnya uang shift ini diserahkan ke Head Admin.</p>`,
              { ya: 'Kunci hitungan' }))) return;
        t.disabled = true;
        try {
          const h = await API.tutupShiftPulsa({
            id_shift: st.id_shift,
            kas_fisik: +w._kasFisik || 0,
            /* Rincian pengeluaran DIKIRIM, bukan totalnya saja: total tanpa
               rinciannya tidak bisa diperiksa siapa pun sesudahnya. */
            keluar: (w._keluar || []).map(x => ({ keterangan: x.keterangan, jumlah: +x.jumlah || 0 })),
            catatan: (w._catatan || '').trim(),
            /* Angka dikirim dari KEADAAN layar, bukan dibaca ulang dari DOM:
               satu kolom yang lupa dibaca mengirim nol tanpa tanda apa pun, dan
               nol di kolom saldo akhir melonjakkan modal. */
            sumber: (st.sumber || []).map(s => ({
              kode_sumber: s.kode_sumber, deposit: +s.deposit || 0,
              saldo_akhir: +s.saldo_akhir || 0, penjualan: +s.penjualan || 0,
              reward: +s.reward || 0
            }))
          });
          await muat('pulsa');
          /* Jurnal yang gagal DISEBUT, tidak ditelan: shift yang tertutup tanpa
             jurnal terlihat persis sama dengan yang berjurnal. */
          if (h.jurnal_gagal) toast('Shift sudah ditutup, tapi pencatatan ke buku besar gagal. Beri tahu admin: ' + h.jurnal_gagal, 'galat');
          else toast('Shift ditutup. Margin ' + rpTeks(h.margin) + ', selisih kas ' + rpTeks(h.selisih) +
                     '. Serahkan uang ' + rpTeks(h.kas_fisik) + ' ke Head Admin — ia menerimanya di Kas & Bank.');
        } catch (x) { toast(x.message, 'galat'); t.disabled = false; }
        return;
      }
      if (t.id === 'btnSiapkanPulsaPos') {
        t.disabled = true;
        const el = $('#keadaanPulsaPos');
        if (el) { el.className = 'pesan info'; el.textContent = 'Menyiapkan berkas di Drive — bisa sampai satu menit…'; }
        try {
          const h = await API.siapkanPulsaPos();
          toast(h.baru ? ('Berkas ' + h.nama + ' dibuat.') : 'Database pulsa diperbarui.');
        } catch (x) {
          toast(x.message, 'galat');
        } finally {
          /* Tombol dihidupkan lagi dan keadaannya digambar ulang APA PUN hasilnya:
             pembuatan yang gagal di tengah meninggalkan berkas setengah jadi, dan
             yang perlu dilihat orang justru keadaan sesudahnya. */
          t.disabled = false;
          await muatKeadaanPulsaPos();
        }
        return;
      }
      if (t.id === 'btnSimpanSumber') {
        t.disabled = true;
        try {
          await API.simpanSumberPulsa({
            kode_sumber: $('#spKode').value, nama: nilai('spNama'),
            jenis: $('#spJenis').value, cabang: nilai('spCabang'),
            urutan: angka('spUrutan'),
            aktif: $('#spAktif') ? centang('spAktif') : true
          });
          tutupModal();
          await muat('sumberpulsa');
          toast('Sumber saldo disimpan.');
        } catch (x) {
          /* Tombol DIHIDUPKAN lagi saat gagal. Dibiarkan mati, satu salah ketik
             mengunci modalnya dan yang tersisa cuma menutup lalu mengisi ulang. */
          toast(x.message, 'galat'); t.disabled = false;
        }
        return;
      }
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
        /* Konfirmasi (bagian 245): stoknya keluar dari cabang ini saat itu juga. */
        if (!(await tanya('Kirim barang ke ' + (nilai('tfTujuan') || 'cabang tujuan') + '?',
              `<p class="petunjuk">${item.length} jenis barang, ${item.reduce((a, i) => a + i.qty, 0)} pcs keluar dari stok cabang ini sekarang.
                 Masih bisa dibatalkan selama cabang tujuan belum menerimanya.</p>`,
              { ya: 'Kirim' }))) return;
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
        const item = $$('[data-terima-baris]').map(i => ({
          baris: Number(i.dataset.terimaBaris), qty_terima: Number(i.value)
        }));
        /* Konfirmasi (bagian 245): penerimaan tidak bisa dibatalkan, dan jumlah
           yang kurang langsung dibukukan hilang di cabang pengirim. */
        if (!(await tanya('Terima barang ini?',
              `<p class="petunjuk">${item.reduce((a, i) => a + (i.qty_terima || 0), 0)} pcs masuk stok cabang ini. Jumlah yang kurang dari kiriman
                 dibukukan sebagai barang hilang di cabang pengirim. Penerimaan tidak bisa dibatalkan.</p>`,
              { ya: 'Terima barang' }))) return;
        t.disabled = true;
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

      if (t.id === 'btnSegarkanStok') {
        /* `paksa` — melewati salinan di perangkat dan menghitung ulang di
           server. Tombolnya dimatikan selama menunggu: perhitungan FIFO satu
           cabang memakan detik, dan tombol yang tetap hidup mengundang tekanan
           kedua yang menggandakan pekerjaannya. Pola yang sama dengan
           tombol sebelah (lintas cabang). */
        t.disabled = true;
        try {
          await muatStok($('#stokKategori')?.value || '', true);
          toast('Stok dihitung ulang dari catatan pusat.');
        } catch (x) {
          toast('Gagal menghitung ulang: ' + (x.message || x), 'galat');
          t.disabled = false;
        }
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

      if (d.terimaSetor) {
        /* Jumlahnya dari `kas_fisik` shift itu, bukan diketik ulang: uang yang
           diserahkan adalah uang yang benar-benar dihitung di laci, dan
           mengetiknya ulang membuka jalan salah ketik pada angka yang tidak
           punya pembanding. */
        const jml = Number(t.dataset.jumlah) || 0;
        const cab = t.dataset.cabang || APP_STATE.cabang;
        if (!(await tanya('Terima setoran shift ini?',
              `<p class="petunjuk">${esc(cab)} · ${esc(d.terimaSetor)} · ${rp(jml)}</p>
               <p class="petunjuk">Uangnya berpindah dari <strong>Kas di Tangan</strong>
               ke <strong>Kas Admin</strong>. Satu shift hanya bisa disetor sekali.</p>`,
              { ya: 'Terima setoran' }))) return;
        t.disabled = true;   // terkunci selama memproses (bagian 261)
        try {
          await API.simpanKas({
            /* Cabang BARISNYA. */
            cabang: cab, uuid: uuidSetoran(cab, d.terimaSetor),
            tipe: 'KELUAR', akun_kas: '1-1100', kode_akun: '1-1150',
            jumlah: jml, bukti: d.terimaSetor,
            keterangan: 'Setoran shift ' + d.terimaSetor,
            id_shift: '', luar_laci: true
          });
          toast('Setoran shift ' + d.terimaSetor + ' diterima.');
          await muatHasilKas();
        } catch (x) { toast(x.message, 'galat'); t.disabled = false; }
        return;
      }

      if (d.balikKas) {
        const asli = ((kasData && kasData.kas && kasData.kas.kas) || [])
          .filter((x) => String(x.uuid) === d.balikKas)[0];
        if (!asli) return toast('Baris itu tidak ada lagi di daftar.', 'galat');
        const alasan = await tanya('Koreksi balik baris ini?',
          `<p class="petunjuk">${esc(asli.nama_akun_kas)} → ${esc(asli.nama_akun)} ·
           ${rp(asli.jumlah)}</p>
           <p class="petunjuk">Baris aslinya tetap ada. Yang dibuat baris
           lawannya, supaya jejak keduanya utuh dan jurnal yang sudah terbit
           tidak pernah ditulis ulang.</p>`,
          { isian: 'Alasan koreksi (minimal 5 karakter)', minimal: 5,
            ya: 'Buat koreksi balik', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          await API.simpanKas({
            /* Cabang BARIS yang dikoreksi, bukan tempat adminnya login. */
            cabang: asli.kode_cabang || APP_STATE.cabang, uuid: uuidBalik(asli.uuid),
            tipe: asli.tipe === 'KELUAR' ? 'MASUK' : 'KELUAR',
            akun_kas: asli.akun_kas, kode_akun: asli.kode_akun,
            jumlah: asli.jumlah,
            keterangan: 'Koreksi balik ' + asli.uuid + ' — ' + alasan,
            id_shift: '', luar_laci: true
          });
          toast('Koreksi balik tercatat.');
          await muatHasilKas();
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      if (d.koreksiShift) return bukaKoreksiShift(d.koreksiShift);          // bagian 260
      if (d.riwayatKoreksi) return bukaRiwayatKoreksi(d.riwayatKoreksi);
      if (t.id === 'btnSimpanKoreksi') return simpanKoreksiShift();
      if (t.id === 'btnSusulanShift') return bukaSusulanShift();            // bagian 265
      if (t.id === 'btnSimpanSusulan') return simpanSusulanShift();
      if (d.hapusShift) {
        /* Angka shiftnya ikut ditulis di pertanyaannya. Menghapus "shift" itu
           abstrak; menghapus shift yang penjualannya Rp0 adalah keputusan yang
           bisa diambil tanpa membuka layar lain. */
        const r0 = (($('#hasilLapulsa') || {})._rows || [])
          .filter((x) => String(x.id_shift) === d.hapusShift)[0] || {};
        if (!(await tanya('Hapus shift pulsa ini?',
              `<p><strong>Tidak bisa dibatalkan.</strong> Shift ini dihapus, dan jurnalnya di buku besar
                 <strong>dibalik otomatis</strong> (jurnal pembalik bertanggal hari ini), jadi angkanya tidak
                 tertinggal sendirian.</p>
               <p class="petunjuk">${esc(String(r0.kode_cabang || ''))} · ${esc(String(r0.tanggal || ''))} · ${esc(String(r0.jenis_shift || ''))} · penjualan ${rp(r0.total_penjualan)}</p>
               <p class="petunjuk">Hanya shift tutup terakhir di tiap cabang yang bisa dihapus — menghapus shift
                 di tengah akan menggeser saldo awal semua shift sesudahnya.</p>`,
              { ya: 'Hapus shift', jenis: 'bahaya' }))) return;
        try {
          const r = await API.hapusShiftPulsa({ id_shift: d.hapusShift });
          /* Daftarnya dimuat ulang LANGSUNG, bukan lewat kunci layar: layar
             Pulsa punya tiga tab, dan memuat ulang layarnya akan melempar
             orang kembali ke tab pertama. */
          toast(`Shift ${d.hapusShift} dihapus — ${r.saldo} baris saldo, ` +
                `${r.keluar} baris pengeluaran` +
                ((r.jurnal_pembalik || []).length ? `, jurnal dibalik ${r.jurnal_pembalik.join(', ')}.` : '.'));
          await muatLaporanpulsa();
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      if (d.periksaBeli) return rincianPembelian(d.periksaBeli);
      if (d.periksaOk) {
        /* Dibaca SEBELUM tanya(): isinya milik modal rincian yang masih terbuka. */
        const dimuka = $('#pbDimuka') && $('#pbDimuka').checked ? {
          tanggal: nilai('pbDimukaTgl'), metode: nilai('pbDimukaSumber') || 'transfer',
          jumlah: angkaDari($('#pbDimukaJumlah') ? $('#pbDimukaJumlah').value : '')
        } : null;
        if (dimuka && !dimuka.tanggal) return toast('Isi tanggal pembayaran ke supplier.', 'galat');
        const sumberTeks = dimuka && dimuka.metode === 'kas_admin' ? 'Kas Admin' : 'Transfer bank';
        if (!(await tanya('Tandai pembelian ini sudah diperiksa?',
              dimuka
                ? `<p class="petunjuk">Barang, jumlah, dan harganya cocok dengan faktur. Pembayaran ${esc(rpTeks(dimuka.jumlah))}
                     tanggal ${esc(tglTampil(dimuka.tanggal))} dari ${sumberTeks} dicatat, dan utangnya dilunasi.</p>`
                : '<p class="petunjuk">Barang, jumlah, dan harganya cocok dengan faktur. Sesudah ini utangnya bisa dibayar di menu Utang.</p>',
              { ya: 'Sudah diperiksa' }))) return;
        try {
          const h = await API.periksaPembelian(Object.assign(
            { uuid: d.periksaOk, cabang: APP_STATE.cabang, keputusan: 'DIPERIKSA' },
            dimuka ? { dibayar_dimuka: dimuka } : {}));
          document.dispatchEvent(new CustomEvent('possk:segarkan-lencana'));
          const b = h && h.dibayar;
          await sukses(b
            ? (b.lunas ? 'Pembelian diperiksa dan utangnya lunas per ' + tglTampil(dimuka.tanggal) + '.'
                       : 'Pembelian diperiksa. Dibayar di muka ' + rpTeks(dimuka.jumlah) + '; sisa utang ' + rpTeks(b.sisa) + ' dibayar di menu Utang.')
            : 'Pembelian ditandai sudah diperiksa — utangnya kini bisa dibayar di menu Utang.', 'pembelian');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.periksaTolak) {
        const alasanTolak = await tanya('Tolak pembelian ini?',
          '<p class="petunjuk">Stok, jurnal, dan utangnya dibalik. Staf gudang mencatat ulang yang benar. Alasannya ikut tercatat dan dibaca gudang.</p>',
          { isian: 'Alasan penolakan (minimal 5 karakter)', minimal: 5, ya: 'Tolak pembelian', jenis: 'bahaya' });
        if (!alasanTolak) return;
        try {
          await API.periksaPembelian({ uuid: d.periksaTolak, cabang: APP_STATE.cabang, keputusan: 'DITOLAK', alasan: alasanTolak });
          await Sync.tarikStok();
          document.dispatchEvent(new CustomEvent('possk:segarkan-lencana'));
          await sukses('Pembelian ditolak — stok, jurnal, dan utangnya sudah dibalik.', 'pembelian');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.batalPembelian) {
        const alasan = await tanya('Batalkan pembelian ini?',
          '<p class="petunjuk">Stok dan jurnalnya dibalik. Alasannya ikut tercatat.</p>',
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5,
            ya: 'Batalkan pembelian', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          const r = await API.batalPembelian({ uuid: d.batalPembelian, cabang: APP_STATE.cabang, alasan });
          await Sync.tarikStok();
          await sukses(`Pembelian dibatalkan — ${rpTeks(r.total)}, ${r.item} baris. Stok & jurnalnya sudah dibalik.`,
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
        /* Ganda dicegah di layar juga (bagian 262); server tetap menjaga. */
        const kunciPm = item.map((i) => i.sku + '|' + String(i.kode_varian || '').trim());
        const ganda = kunciPm.findIndex((k, i) => kunciPm.indexOf(k) !== i);
        if (ganda >= 0) {
          return toast(`Barang ${item[ganda].sku} disebut lebih dari sekali — gabungkan qty-nya jadi satu baris.`, 'galat');
        }
        t.disabled = true;
        try {
          const r = await API.buatPermintaan({
            uuid: uuidDokumen('permintaan'),
            cabang_asal: nilai('pmAsal'), cabang_tujuan: nilai('pmTujuan'),
            tanggal: nilai('pmTanggal'), catatan: nilai('pmCatatan'), item
          });
          await sukses('Permintaan ' + r.no_dokumen + ' terkirim ke gudang.', 'permintaan');
          /* Stok gudang minus (persediaan awal belum lengkap) tidak menolak,
             tapi disebut (bagian 262). */
          if ((r.peringatan || []).length) toast('Perhatian: ' + r.peringatan.join('; ') + '.', 'info');
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
        const item = $$('[data-siap-baris]').map(i => ({
          baris: Number(i.dataset.siapBaris), qty_siap: Number(i.value || 0)
        }));
        /* Konfirmasi (bagian 245): menyiapkan = transfer terbit, stok gudang keluar. */
        if (!(await tanya('Siapkan dan kirim barang ini?',
              `<p class="petunjuk">${item.reduce((a, i) => a + i.qty_siap, 0)} pcs keluar dari stok gudang sekarang sebagai transfer ke cabang peminta.</p>`,
              { ya: 'Siapkan & kirim' }))) return;
        t.disabled = true;
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

      /* --- dashboard (v1.179) --- */
      if (d.grafik !== undefined) return muatGrafik(d.grafik);
      if (d.tabelDash !== undefined) return bukaTabelDash(d.tabelDash);

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
          const rows = await API.cariPembelian({ cari: nilai('rbCari'), cabang: cabangDari('returbeli') });
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
        /* Konfirmasi (bagian 245): stok keluar dan utang/kas supplier bergerak. */
        if (!(await tanya('Proses retur pembelian?',
              `<p class="petunjuk">${item.reduce((a, i) => a + i.qty, 0)} pcs keluar dari stok dan dikembalikan ke supplier, dan jurnalnya dicatat.
                 Retur pembelian tidak bisa dibatalkan dari layar.</p>`,
              { ya: 'Proses retur' }))) return;
        t.disabled = true;
        try {
          const r = await API.buatReturBeli({
            uuid: uuidDokumen('retur_beli'),
            cabang: cabangDari('returbeli'),
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
      if (t.id === 'btnHitungUlangArsip') return API.tugas(() => muatArsip(true), { baca: true });   // bagian 258
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
            cabang: cabangDari('opname'), cakupan, filter,
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
         dikatakan, bukan dibiarkan. Yang belum tersimpan = isi `hitunganBerubah`.
         Sampai bagian 237 penandanya kelas `.sudah-hitung`, padahal kelas itu
         dipasang penangan input BEGITU angka diketik — jadi tidak pernah ada
         yang "belum", dan Tutup membuang hitungan tanpa bertanya. */
      if (t.id === 'btnTutupHitung') {
        const belum = hitunganBerubah.size;
        if (belum && !(await tanya('Tutup tanpa menyimpan?',
              `<div class="pesan peringatan">${belum} hitungan belum disimpan dan akan hilang.</div>`,
              { ya: 'Tutup saja', jenis: 'bahaya' }))) return;
        clearTimeout(pindaiTimer); pindaiTimer = null;
        hitunganBerubah.clear();
        tutupModal();
        return;
      }
      /* Hanya baris yang BERUBAH yang dikirim (bagian 237) — tiga koreksi
         tangan tidak lagi mengirim ulang 3.000 baris. */
      if (t.id === 'btnSimpanHitungan') { await simpanHitunganBerubah(t); return; }
      if (t.id === 'btnSelesaiHitung') {
        const item = hitunganTerisi();
        if (!item.length) return toast('Belum ada satu pun yang diisi.', 'galat');
        if (!(await tanya('Selesaikan penghitungan?',
              `<p class="petunjuk">${item.length} barang akan dikunci dan tidak bisa diubah lagi.</p>`,
              { ya: 'Selesaikan', jenis: 'bahaya' }))) return;
        t.disabled = true;
        clearTimeout(pindaiTimer); pindaiTimer = null;
        try {
          await API.simpanHitungan({ uuid: d.uuid, cabang: cabangDari('opname'), item });
          hitunganBerubah.clear();
          await API.selesaiHitung({ uuid: d.uuid, cabang: cabangDari('opname') });
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
          const r = await API.postingOpname({ uuid: d.uuid, cabang: cabangDari('opname'),
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
          await API.batalOpname({ uuid: d.batalOpname, cabang: cabangDari('opname'), alasan });
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
          const rows = await API.cariNota({ cari: q, cabang: cabangDari('retur') });
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

      /* --- pengajuan pembatalan (v1.189) --- */
      if (t.id === 'btnAjukanVoid') { lepasUuidDokumen('ajukanVoid'); return formAjukanVoid(); }
      if (t.id === 'btnCariNotaAjukan') {
        const q = nilai('ajukanCari');
        if (!q) return;
        $('#hasilCariNotaAjukan').innerHTML = '<div class="pesan info">Mencari…</div>';
        try {
          const rows = await API.cariNota({ cari: q, cabang: cabangDari('pembatalan') });
          if (!rows.length) {
            $('#hasilCariNotaAjukan').innerHTML = '<div class="pesan galat">Nota tidak ditemukan di cabang ini.</div>';
            return;
          }
          $('#hasilCariNotaAjukan').innerHTML = `<div style="max-height:200px;overflow:auto">${tabel([
            { judul: 'No nota', kunci: 'no_nota' },
            { judul: 'Tanggal', render: r => `${esc(tglTampil(r.tanggal))} ${esc(r.jam)}` },
            { judul: 'Total', angka: true, render: r => rp(r.total) },
            { judul: '', render: r => `<button class="tombol kecil" data-ajukan-void-nota="${esc(r.uuid)}">Ajukan</button>` }
          ], rows)}</div>`;
          $('#hasilCariNotaAjukan')._rows = rows;
        } catch (x) {
          $('#hasilCariNotaAjukan').innerHTML = `<div class="pesan galat">${esc(x.message)}</div>`;
        }
        return;
      }
      if (d.ajukanVoidNota) {
        const nota = ($('#hasilCariNotaAjukan')._rows || []).find(x => x.uuid === d.ajukanVoidNota);
        if (!nota) return;
        const alasan = await tanya(`Ajukan pembatalan nota ${nota.no_nota}?`,
          `<div class="pesan info">Senilai ${rp(nota.total)}. Notanya <strong>belum berubah apa pun</strong>
             sampai admin menyetujui. Alasan ini yang mereka baca.</div>`,
          { isian: 'Alasan pembatalan (minimal 5 karakter)', minimal: 5, ya: 'Kirim pengajuan' });
        if (!alasan) return;
        try {
          await API.ajukanVoid({ uuid: uuidDokumen('ajukanVoid'), uuid_penjualan: nota.uuid,
                                 cabang: cabangDari('pembatalan'), alasan });
          lepasUuidDokumen('ajukanVoid');
          await sukses('Pengajuan terkirim. Admin akan memutuskannya.', 'pembatalan');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.setujuiVoid) {
        const ya = await tanya('Setujui pembatalan nota ini?',
          `<div class="pesan peringatan">Begitu disetujui, <strong>seluruh nota dibalik</strong> — stok kembali
             ke lapisan asalnya, jurnal dibalik penuh, piutang dan klaim petugasnya ikut dibatalkan.
             Tidak bisa diurungkan.</div>`,
          { ya: 'Setujui & batalkan nota', jenis: 'bahaya' });
        if (!ya) return;
        try {
          await API.putusMintaVoid({ uuid: d.setujuiVoid, setuju: true });
          await Sync.tarikStok();
          await sukses('Nota dibatalkan.', 'pembatalan');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.tolakVoid) {
        const alasan = await tanya('Tolak pengajuan ini?',
          '<p class="petunjuk">Alasannya dibaca kasir yang mengajukan — sebutkan apa yang harus ia lakukan.</p>',
          { isian: 'Alasan penolakan (minimal 5 karakter)', minimal: 5,
            ya: 'Tolak pengajuan', jenis: 'bahaya' });
        if (!alasan) return;
        try {
          await API.putusMintaVoid({ uuid: d.tolakVoid, setuju: false, alasan_tolak: alasan });
          await sukses('Pengajuan ditolak.', 'pembatalan');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }
      if (d.tarikVoid) {
        const ya = await tanya('Tarik pengajuan ini?',
          '<p class="petunjuk">Pengajuan ditarik dan tidak lagi muncul di antrean admin. Nota tidak berubah.</p>',
          { ya: 'Tarik pengajuan' });
        if (!ya) return;
        try {
          await API.tarikMintaVoid({ uuid: d.tarikVoid });
          await sukses('Pengajuan ditarik.', 'pembatalan');
        } catch (x) { toast(x.message, 'galat'); }
        return;
      }

      /* --- void --- */
      if (t.id === 'btnVoidNota') return formVoid();
      if (t.id === 'btnCariNotaVoid') {
        const q = nilai('voidCari');
        if (!q) return;
        $('#hasilCariNotaVoid').innerHTML = '<div class="pesan info">Mencari…</div>';
        try {
          const rows = await API.cariNota({ cari: q, cabang: cabangDari('retur') });
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
          await API.voidPenjualan({ uuid: nota.uuid, alasan, cabang: cabangDari('retur') });
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
      /* Scanner pembelian (bagian 254): Enter DIHENTIKAN di sini — tanpa itu
         Enter dari mesin scan bisa ikut menekan tombol lain di modal. */
      if (e.target.id === 'beliPindai') {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        const kode = e.target.value;
        e.target.value = '';
        pindaiPembelian(kode);
        return;
      }
      /* Mesin scan mengetik kodenya lalu menekan Enter (bagian 237). */
      if (e.target.id === 'opPindai') {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const kode = e.target.value;
        e.target.value = '';
        pindaiOpname(kode);
        return;
      }
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
        halProduk.reset();
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
        halProduk.reset();
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
        else {
          saringProduk = e.target.value;
          /* Mengganti SARINGAN mengembalikan urutannya ke bawaan.

             Memilih "Terlaris" ITU SENDIRI sudah pernyataan "urutkan menurut
             penjualan" — kalau urutan kolom yang dipilih sebelumnya tetap
             dipegang, saringan yang seluruh gunanya adalah urutan justru
             kehilangan urutannya, dan orang melihat daftar "Terlaris" yang
             tersusun menurut abjad.

             Yang dilepas cuma penandanya, bukan `urut`-nya: saringan tanpa
             urutan sendiri (Semua produk, Berpoin, Menipis...) tetap memakai
             kolom yang tadi dipilih. Sekali orang mengklik judul lagi,
             pilihannya menang kembali. */
          halProduk.urutBawaan = true;
        }
        halProduk.reset();   /* jumlah barisnya berubah — lihat catatan di kolom cari */
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
        const v = e.target.value;
        stokLintas = v === 'semua';
        stokCabang = v.startsWith('cabang:') ? v.slice(7) : '';
        return muatStok($('#stokKategori')?.value || '');
      }
      if (e.target.id === 'stokStatus') {
        statusStokPilih = e.target.value;
        halStok.reset();
        return gambarBarisStok();
      }
      if (e.target.id === 'cariStok' || e.target.id === 'stokKategori') {
        halStok.reset();     // saringan berubah = mulai dari halaman pertama
        gambarBarisStok();
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
        /* Ketikan tangan ikut dicatat sebagai perubahan — simpan hanya
           mengirim yang berubah (bagian 237). */
        hitunganBerubah.set(e.target.dataset.hitung, ++urutUbah);
        perbaruiProgresHitung();
      }
    });

    document.addEventListener('change', async (e) => {
      if (e.target.id === 'pbDimuka') { const x = $('#pbDimukaIsi'); if (x) x.hidden = !e.target.checked; return; }
      if (e.target.id === 'grafikHari') { muatGrafik(Number(e.target.value)); return; }
      if (e.target.id === 'pCabangSemua') { terapkanCabangSemua(); return; }
      /* Periode dashboard menembak ulang API — beda dengan penyaring layar Produk
         yang menggambar ulang dari data di tangan. Di sini memang harus: omzet,
         peringkat, dan pembandingnya semua dihitung server per rentang tanggal,
         dan menyalin perhitungan itu ke perangkat berarti dua tempat menghitung
         satu angka. */
      if (e.target.id === 'periodeDash') {
        periodeDash = e.target.value;
        /* Kustom: tunggu kedua tanggalnya lengkap — barnya baru digambar ulang
           saat memuat, jadi kolom yang setengah terisi tidak boleh dipicu. */
        if (Periode.terapkan(PERIODE_DASH, periodeDash) && periodeDash !== 'kustom') {
          dashKustom = { dari: $('#dashDari').value, sampai: $('#dashSampai').value };
          muatDashboard();
        }
        return;
      }
      if (e.target.id === 'dashDari' || e.target.id === 'dashSampai') {
        if (periodeDash === 'kustom' && Periode.terapkan(PERIODE_DASH, 'kustom')) {
          dashKustom = { dari: $('#dashDari').value, sampai: $('#dashSampai').value };
          muatDashboard();
        }
        return;
      }
      if (e.target.id === 'poinPetugas' || e.target.id === 'poinCabang') return gambarHasilPoin();
      if (e.target.id === 'cabangDash')  { cabangDash = e.target.value; muatDashboard(); return; }
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
  return { muat, pasang, toast, modal: bukaModal, tutupModal, tanya, tabel, tombolEkspor, menuEkspor };
})();
