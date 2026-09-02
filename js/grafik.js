/**
 * POS SINDIKAT KARTU — grafik.js
 * Grafik SVG buatan sendiri, tanpa pustaka pihak ketiga.
 *
 * Kenapa tidak memakai Chart.js atau sejenisnya: pustaka grafik populer diambil dari CDN,
 * dan aplikasi ini harus tetap jalan saat internet mati. Menyertakan pustaka besar ke
 * dalam cache offline juga membengkakkan unduhan awal di perangkat kasir.
 *
 * PALET (v1.8, disesuaikan untuk latar TERANG).
 *
 * Palet lama dipilih untuk latar gelap dan tidak boleh dibawa apa adanya: diuji ulang
 * dengan `node uji/palet.mjs`, dua dari enam warnanya gagal kontras 3:1 terhadap kartu
 * putih. Palet di bawah lolos kontras untuk keenam slot (`3,55`–`11,99`).
 *
 * Soal buta warna — perlu jujur di sini. Enam warna kategoris yang sekaligus (a) enak
 * dilihat, (b) berkontras cukup di atas putih, dan (c) terbedakan penuh oleh penderita
 * deuteranopia TIDAK bisa dicapai; setiap kali pemeriksaan ΔE dipaksa lolos, hasilnya
 * palet keruh yang terlihat murah. Jadi jalan keluarnya bukan memaksa warna, melainkan
 * BERHENTI bergantung pada warna: setiap seri garis juga punya pola putus dan bentuk
 * penanda sendiri, legenda menampilkan pola itu (bukan cuma titik warna), dan setiap
 * grafik punya tombol tabel. Warna tinggal jadi isyarat pendukung, bukan satu-satunya.
 */
const Grafik = (() => {

  // Urutan slot bukan hiasan — urutan inilah yang menjaga jarak warna antar seri
  // bersebelahan tetap lebar (ΔE >= 20). Jangan diacak.
  // Keenamnya warna foreground Primer yang sesungguhnya (accent, severe, success,
  // done, sponsors, muted) — jadi grafik memakai bahasa warna yang sama dengan
  // sisa antarmuka, bukan palet asing yang ditempel.
  /* Warna dibaca dari token CSS, bukan disimpan di sini. Daftar warna kedua di
     berkas ini adalah daftar yang cepat atau lambat berpisah jalan dari CSS-nya
     — dan sejak ada mode gelap, berpisah jalan berarti grafik terang di tengah
     layar gelap. Cadangan hex-nya dipertahankan supaya grafik tetap tergambar
     bila berkas CSS gagal dimuat. */
  const CADANGAN = {
    '--seri-1': '#0969da', '--seri-2': '#bc4c00', '--seri-3': '#1a7f37',
    '--seri-4': '#8250df', '--seri-5': '#bf3989', '--seri-6': '#59636e',
    '--teks': '#1f2328', '--teks-redup': '#59636e',
    '--garis': '#d1d9e0', '--kertas-grafik': '#ffffff'
  };
  const token = (nama) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(nama).trim();
      return v || CADANGAN[nama];
    } catch (e) { return CADANGAN[nama]; }
  };

  /* Urutan slot bukan hiasan — lihat catatan di atas. Isinya diperbarui tiap
     kali menggambar, bukan sekali saat berkas dimuat: tema bisa berubah selagi
     aplikasi terbuka. */
  let SERI = [CADANGAN['--seri-1'], CADANGAN['--seri-2'], CADANGAN['--seri-3'],
              CADANGAN['--seri-4'], CADANGAN['--seri-5'], CADANGAN['--seri-6']];
  // Isyarat kedua: pola garis. Slot 1 sengaja utuh — seri tunggal paling sering dipakai.
  const POLA = ['', '6 3', '2 3', '9 3 2 3', '1 4', '12 4'];
  // Isyarat ketiga: bentuk penanda, dipakai saat titik digambar (data <= 14 hari).
  const BENTUK = ['bulat', 'kotak', 'wajik', 'segitiga', 'silang', 'bulat-kosong'];
  let TEKS = CADANGAN['--teks'], TEKS_REDUP = CADANGAN['--teks-redup'],
      GARIS = CADANGAN['--garis'], KERTAS = CADANGAN['--kertas-grafik'];

  /** Dipanggil di awal SETIAP penggambaran, bukan sekali saat berkas dimuat. */
  function segarkanWarna() {
    SERI = ['--seri-1', '--seri-2', '--seri-3', '--seri-4', '--seri-5', '--seri-6'].map(token);
    TEKS = token('--teks'); TEKS_REDUP = token('--teks-redup');
    GARIS = token('--garis'); KERTAS = token('--kertas-grafik');
  }

  /** Gambar penanda seri pada koordinat (cx,cy) sesuai bentuk slotnya. */
  function penanda(si, cx, cy, warna, r = 4) {
    const b = BENTUK[si % BENTUK.length];
    const um = { fill: warna, stroke: KERTAS, 'stroke-width': 1.75 };
    if (b === 'kotak')    return el('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: 1, ...um });
    if (b === 'wajik')    return el('polygon', { points: `${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`, ...um });
    if (b === 'segitiga') return el('polygon', { points: `${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`, ...um });
    if (b === 'silang')   return el('path', { d: `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`,
                                              fill: 'none', stroke: warna, 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    if (b === 'bulat-kosong') return el('circle', { cx, cy, r, fill: KERTAS, stroke: warna, 'stroke-width': 2.4 });
    return el('circle', { cx, cy, r, ...um });
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (t, a = {}) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    return e;
  };
  const esc = (t) => String(t == null ? '' : t)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ringkas = (n) => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' jt';
    if (a >= 1e3) return Math.round(n / 1e3) + ' rb';
    return String(Math.round(n));
  };
  const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
  /* Label sumbu-X sengaja TETAP dd/MM tanpa tahun: satu grafik hanya memuat
     satu rentang, tahunnya sudah jelas dari judulnya, dan menambah "/26" pada
     90 label membuat sumbunya berdesakan. Nilai `yyyy-MM` (tren bulanan)
     dibiarkan utuh — cabang itu yang membuat label bulanan tidak kacau. */
  const tglPendek = (t) => {
    const b = String(t).split('-');
    return b.length === 3 ? b[2] + '/' + b[1] : String(t);
  };

  /** Skala sumbu yang berakhir di angka bulat, supaya label sumbu enak dibaca. */
  function skalaBagus(maks) {
    if (maks <= 0) return { atas: 10, langkah: 5 };
    const pangkat = Math.pow(10, Math.floor(Math.log10(maks)));
    const norm = maks / pangkat;
    const bagus = norm <= 1.2 ? 1.5 : norm <= 2.5 ? 3 : norm <= 5 ? 6 : 10;
    const atas = bagus * pangkat;
    return { atas, langkah: atas / 3 };
  }

  /* ==================== Tooltip bersama ==================== */

  let tip = null;
  function tampilTip(x, y, html) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'grafik-tip';
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    // Jaga agar tooltip tidak keluar layar di sisi kanan
    tip.style.left = Math.min(x + 14, window.innerWidth - r.width - 8) + 'px';
    tip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }
  const sembunyiTip = () => { if (tip) tip.style.display = 'none'; };

  /* ==================== Grafik garis ==================== */

  /**
   * @param wadah  elemen tujuan
   * @param opsi { tanggal:[], seri:[{nama,data:[]}], judul, satuan:'rupiah'|'angka' }
   */
  function garis(wadah, opsi) {
    segarkanWarna();
    const { tanggal = [], seri = [] } = opsi;
    const fmt = opsi.satuan === 'angka' ? (n => String(Math.round(n))) : rupiah;
    if (!tanggal.length || !seri.length) {
      wadah.innerHTML = '<p class="grafik-kosong">Belum ada data pada rentang ini</p>';
      return;
    }

    /* Lebar viewBox MENGIKUTI lebar kotaknya, tidak dipatok 900.
       Dipatok, seluruh isi SVG ikut diperkecil saat kartunya sempit: di HP tegak
       kotaknya 328px, jadi skalanya 0,36× dan tulisan 11px tergambar 4px — angka
       sumbu dan tanggal sama-sama tidak terbaca. Penyakit yang sama sudah
       ditemukan pada grafik batang dan diselesaikan dengan pindah ke HTML;
       grafik garis tidak ikut diperbaiki waktu itu. Di sini penyelesaiannya
       menyamakan satu satuan SVG dengan satu piksel layar, sehingga ukuran huruf
       tetap sama berapa pun lebar kartunya.
       Batas bawah 320 menjaga bentuknya tetap masuk akal bila kotaknya belum
       terukur (masih tersembunyi, clientWidth 0). */
    const W = Math.round(Math.min(900, Math.max(320, wadah.clientWidth || 900)));
    const sempit = W < 560;
    const H = sempit ? 240 : 300;
    const kiri = sempit ? 46 : 62, kanan = 16, atas = 14, bawah = 30;
    const lebar = W - kiri - kanan, tinggi = H - atas - bawah;

    let maks = 0;
    seri.forEach(s => s.data.forEach(v => { if (v > maks) maks = v; }));
    const sk = skalaBagus(maks);

    const x = (i) => kiri + (tanggal.length === 1 ? lebar / 2 : (i / (tanggal.length - 1)) * lebar);
    const y = (v) => atas + tinggi - (v / sk.atas) * tinggi;

    // preserveAspectRatio dibiarkan bawaan (uniform). Memakai "none" akan meregangkan
    // grafik secara tidak proporsional dan membuat ketebalan garis ikut melar.
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafik-svg', role: 'img' });

    // Garis bantu horizontal — sengaja tipis dan redup agar tidak bersaing dengan data
    for (let g = 0; g <= 3; g++) {
      const v = sk.langkah * g;
      svg.appendChild(el('line', { x1: kiri, x2: W - kanan, y1: y(v), y2: y(v),
                                   stroke: GARIS, 'stroke-width': 1 }));
      const t = el('text', { x: kiri - 8, y: y(v) + 4, 'text-anchor': 'end',
                             fill: TEKS_REDUP, 'font-size': 11 });
      t.textContent = ringkas(v);
      svg.appendChild(t);
    }

    // Label tanggal — hanya beberapa, supaya tidak bertabrakan.
    // Label terakhir selalu ditampilkan, TAPI label sebelumnya dibuang bila terlalu
    // berdekatan; tanpa penjagaan ini keduanya saling menimpa di ujung kanan.
    // Berapa label yang muat itu urusan LEBAR, bukan angka tetap. Delapan label
    // "19/08" butuh ±280px; di plot selebar 250px mereka saling menimpa.
    const muat = Math.max(3, Math.floor(lebar / 52));
    const lompat = Math.max(1, Math.ceil(tanggal.length / muat));
    const indeksLabel = [];
    for (let i = 0; i < tanggal.length; i += lompat) indeksLabel.push(i);
    const terakhir = tanggal.length - 1;
    if (indeksLabel[indeksLabel.length - 1] !== terakhir) {
      const jarakMin = lebar / 12;   // ruang minimal agar dua label tidak bersentuhan
      if (x(terakhir) - x(indeksLabel[indeksLabel.length - 1]) < jarakMin) indeksLabel.pop();
      indeksLabel.push(terakhir);
    }
    indeksLabel.forEach(i => {
      const e = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle',
                             fill: TEKS_REDUP, 'font-size': 11 });
      e.textContent = tglPendek(tanggal[i]);
      svg.appendChild(e);
    });

    seri.forEach((s, si) => {
      const warna = SERI[si % SERI.length];
      const d = s.data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      const atr = { d, fill: 'none', stroke: warna, 'stroke-width': 2.2,
                    'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
      // Pola putus = isyarat kedua di samping warna, supaya seri tetap terbedakan
      // saat warnanya bertabrakan bagi penderita buta warna.
      const pola = POLA[si % POLA.length];
      if (pola) { atr['stroke-dasharray'] = pola; atr['stroke-linecap'] = 'butt'; }
      svg.appendChild(el('path', atr));
      // Titik hanya digambar bila datanya sedikit — kalau 30 hari, titik justru bikin ramai
      if (tanggal.length <= 14) {
        s.data.forEach((v, i) => svg.appendChild(penanda(si, x(i), y(v), warna)));
      }
    });

    // Lapisan sorot: garis vertikal + tooltip semua seri pada tanggal yang sama
    const sorot = el('line', { y1: atas, y2: atas + tinggi, stroke: TEKS_REDUP,
                               'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
    svg.appendChild(sorot);
    const tangkap = el('rect', { x: kiri, y: atas, width: lebar, height: tinggi,
                                 fill: 'transparent', style: 'cursor:crosshair' });
    svg.appendChild(tangkap);

    tangkap.addEventListener('mousemove', (ev) => {
      const kotak = svg.getBoundingClientRect();
      const rel = (ev.clientX - kotak.left) / kotak.width * W;
      const i = Math.max(0, Math.min(tanggal.length - 1,
                Math.round((rel - kiri) / lebar * (tanggal.length - 1))));
      sorot.setAttribute('x1', x(i)); sorot.setAttribute('x2', x(i));
      sorot.setAttribute('opacity', 1);
      tampilTip(ev.clientX, ev.clientY,
        `<strong>${esc(tglTampil(tanggal[i]))}</strong>` +
        seri.map((s, si) => `<div class="tip-baris">
            <span class="tip-titik" style="background:${SERI[si % SERI.length]}"></span>
            ${esc(s.nama)}<b>${fmt(s.data[i])}</b></div>`).join(''));
    });
    tangkap.addEventListener('mouseleave', () => { sorot.setAttribute('opacity', 0); sembunyiTip(); });

    wadah.innerHTML = '';
    wadah.appendChild(svg);
    // Legenda wajib ada begitu seri lebih dari satu — identitas tidak boleh hanya lewat warna
    if (seri.length > 1) wadah.appendChild(legenda(seri.map(s => s.nama)));
    wadah.appendChild(tombolTabel(() => tabelDeret(tanggal, seri, fmt)));
  }

  /* ==================== Grafik batang mendatar ==================== */

  /**
   * Batang mendatar dipilih, bukan pai. Panjang jauh lebih mudah dibandingkan
   * daripada sudut, dan nama kategori muat ditulis penuh tanpa dimiringkan.
   *
   * Dibangun dengan HTML/CSS, bukan SVG. Alasannya ditemukan saat memeriksa hasil
   * render: SVG dengan viewBox tetap ikut mengecil saat kartunya sempit, dan teksnya
   * jadi nyaris tak terbaca di kolom dua-lajur. Dengan HTML, ukuran huruf tetap sama
   * berapa pun lebar kartunya.
   */
  function batang(wadah, opsi) {
    segarkanWarna();
    const data = (opsi.data || []).filter(d => d.nilai > 0);
    const fmt = opsi.satuan === 'angka' ? (n => String(Math.round(n))) : rupiah;
    if (!data.length) {
      wadah.innerHTML = '<p class="grafik-kosong">Belum ada data</p>';
      return;
    }

    const maks = Math.max(...data.map(d => d.nilai));
    const satuWarna = opsi.satuWarna !== false;   // satu ukuran → satu warna saja

    const kotak = document.createElement('div');
    kotak.className = 'grafik-batang';
    kotak.innerHTML = data.map((d, i) => {
      const persen = Math.max(1.5, (d.nilai / maks) * 100);
      const warna = satuWarna ? SERI[0] : SERI[i % SERI.length];
      return `<div class="bb" data-i="${i}">
        <div class="bb-label" title="${esc(d.label)}">${esc(d.label)}</div>
        <div class="bb-jalur"><div class="bb-isi" style="width:${persen}%;background:${warna}"></div></div>
        <div class="bb-nilai">${ringkas(d.nilai)}</div>
      </div>`;
    }).join('');

    kotak.addEventListener('mousemove', (ev) => {
      const b = ev.target.closest('.bb');
      if (!b) return sembunyiTip();
      const d = data[Number(b.dataset.i)];
      tampilTip(ev.clientX, ev.clientY,
        `<strong>${esc(d.label)}</strong><div class="tip-baris">${fmt(d.nilai)}</div>` +
        (d.tambahan ? `<div class="tip-baris">${esc(d.tambahan)}</div>` : ''));
    });
    kotak.addEventListener('mouseleave', sembunyiTip);

    wadah.innerHTML = '';
    wadah.appendChild(kotak);
    wadah.appendChild(tombolTabel(() => tabelBatang(data, fmt)));
  }

  /* ==================== Legenda & tampilan tabel ==================== */

  /**
   * Legenda menampilkan CONTOH GARIS, bukan sekadar titik warna — sehingga pola
   * putusnya ikut terbaca dan seri masih bisa dicocokkan tanpa mengandalkan warna.
   * `garis: false` dipakai grafik batang, yang memang tidak punya pola.
   */
  function legenda(nama, garis = true) {
    const d = document.createElement('div');
    d.className = 'grafik-legenda';
    d.innerHTML = nama.map((n, i) => {
      const w = SERI[i % SERI.length];
      const p = POLA[i % POLA.length];
      const contoh = garis
        ? `<svg class="cth" viewBox="0 0 26 12" aria-hidden="true">
             <path d="M1 6h24" fill="none" stroke="${w}" stroke-width="2.2"${p ? ` stroke-dasharray="${p}"` : ''}/>
           </svg>`
        : `<span class="titik" style="background:${w}"></span>`;
      return `<span class="item">${contoh}${esc(n)}</span>`;
    }).join('');
    return d;
  }

  /** Setiap grafik wajib punya jalan keluar berupa tabel — untuk pembaca layar dan penyalinan. */
  function tombolTabel(buatTabel) {
    const bungkus = document.createElement('div');
    const btn = document.createElement('button');
    /* `tanpa-cetak`: ini alat baca layar, bukan isi laporan. Tanpa kelas itu
       tombolnya ikut tercetak di bawah tiap grafik — tombol di atas kertas. */
    btn.className = 'tombol kecil tanpa-cetak';
    btn.style.marginTop = '8px';
    btn.textContent = 'Lihat sebagai tabel';
    const isi = document.createElement('div');
    isi.className = 'sembunyi';
    isi.style.marginTop = '10px';
    btn.addEventListener('click', () => {
      const tampil = isi.classList.toggle('sembunyi');
      btn.textContent = tampil ? 'Lihat sebagai tabel' : 'Sembunyikan tabel';
      if (!tampil && !isi.innerHTML) isi.innerHTML = buatTabel();
    });
    bungkus.appendChild(btn);
    bungkus.appendChild(isi);
    return bungkus;
  }

  const tabelDeret = (tanggal, seri, fmt) => `<table><thead><tr><th>Tanggal</th>${
    seri.map(s => `<th class="angka">${esc(s.nama)}</th>`).join('')}</tr></thead><tbody>${
    tanggal.map((t, i) => `<tr><td>${esc(tglTampil(t))}</td>${
      seri.map(s => `<td class="angka">${fmt(s.data[i])}</td>`).join('')}</tr>`).join('')
    }</tbody></table>`;

  const tabelBatang = (data, fmt) => `<table><thead><tr><th>Nama</th><th class="angka">Nilai</th></tr></thead><tbody>${
    data.map(d => `<tr><td>${esc(d.label)}</td><td class="angka">${fmt(d.nilai)}</td></tr>`).join('')
    }</tbody></table>`;

  /* SERI diekspor sebagai FUNGSI: nilainya berubah bersama tema, jadi acuan
     yang diambil sekali saat berkas dimuat akan basi. Tidak ada pemakai di luar
     berkas ini hari ini; bentuk fungsi menjaganya tetap benar bila suatu saat ada. */
  return { garis, batang, seri: () => SERI.slice(), ringkas };
})();
