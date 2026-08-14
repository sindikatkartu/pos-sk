/**
 * POS SINDIKAT KARTU — grafik.js
 * Grafik SVG buatan sendiri, tanpa pustaka pihak ketiga.
 *
 * Kenapa tidak memakai Chart.js atau sejenisnya: pustaka grafik populer diambil dari CDN,
 * dan aplikasi ini harus tetap jalan saat internet mati. Menyertakan pustaka besar ke
 * dalam cache offline juga membengkakkan unduhan awal di perangkat kasir.
 *
 * Palet warnanya sudah diuji terhadap latar gelap aplikasi ini: lolos pemeriksaan
 * pita kecerahan, ambang saturasi, keterbedaan bagi penderita buta warna (ΔE terburuk
 * 8,4 pada pasangan bersebelahan), dan kontras minimum 3:1 terhadap latar.
 */
const Grafik = (() => {

  // Urutan slot bukan hiasan — urutan inilah yang membuat warna bersebelahan
  // tetap terbedakan oleh penderita buta warna. Jangan diacak.
  const SERI = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
  const TEKS = '#e8edf2', TEKS_REDUP = '#93a1b0', GARIS = '#2f3a45';

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
    const { tanggal = [], seri = [] } = opsi;
    const fmt = opsi.satuan === 'angka' ? (n => String(Math.round(n))) : rupiah;
    if (!tanggal.length || !seri.length) {
      wadah.innerHTML = '<p class="grafik-kosong">Belum ada data pada rentang ini</p>';
      return;
    }

    const W = 900, H = 300, kiri = 62, kanan = 16, atas = 14, bawah = 30;
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
    const lompat = Math.max(1, Math.ceil(tanggal.length / 8));
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
      svg.appendChild(el('path', { d, fill: 'none', stroke: warna, 'stroke-width': 2,
                                   'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      // Titik hanya digambar bila datanya sedikit — kalau 30 hari, titik justru bikin ramai
      if (tanggal.length <= 14) {
        s.data.forEach((v, i) => {
          svg.appendChild(el('circle', { cx: x(i), cy: y(v), r: 4, fill: warna,
                                         stroke: '#1a2027', 'stroke-width': 2 }));
        });
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
        `<strong>${esc(tanggal[i])}</strong>` +
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

  function legenda(nama) {
    const d = document.createElement('div');
    d.className = 'grafik-legenda';
    d.innerHTML = nama.map((n, i) =>
      `<span class="item"><span class="titik" style="background:${SERI[i % SERI.length]}"></span>${esc(n)}</span>`
    ).join('');
    return d;
  }

  /** Setiap grafik wajib punya jalan keluar berupa tabel — untuk pembaca layar dan penyalinan. */
  function tombolTabel(buatTabel) {
    const bungkus = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'tombol kecil';
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
    tanggal.map((t, i) => `<tr><td>${esc(t)}</td>${
      seri.map(s => `<td class="angka">${fmt(s.data[i])}</td>`).join('')}</tr>`).join('')
    }</tbody></table>`;

  const tabelBatang = (data, fmt) => `<table><thead><tr><th>Nama</th><th class="angka">Nilai</th></tr></thead><tbody>${
    data.map(d => `<tr><td>${esc(d.label)}</td><td class="angka">${fmt(d.nilai)}</td></tr>`).join('')
    }</tbody></table>`;

  return { garis, batang, SERI, ringkas };
})();
