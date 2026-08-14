/**
 * POS SINDIKAT KARTU — print.js
 * Cetak struk. Dua jalur:
 *   1. ESC/POS lewat Web Bluetooth  — untuk printer thermal Bluetooth (paling andal & cepat)
 *   2. HTML window.print()          — cadangan universal (USB, PDF, printer apa pun)
 *
 * Catatan: Web Bluetooth hanya tersedia di Chrome/Edge Android & desktop, dan wajib HTTPS.
 */
const Struk = (() => {
  let perangkatBt = null, karakteristik = null;

  const ESC = { INIT: [0x1b, 0x40], TENGAH: [0x1b, 0x61, 0x01], KIRI: [0x1b, 0x61, 0x00],
                KANAN: [0x1b, 0x61, 0x02], TEBAL_ON: [0x1b, 0x45, 0x01], TEBAL_OFF: [0x1b, 0x45, 0x00],
                BESAR: [0x1d, 0x21, 0x11], NORMAL: [0x1d, 0x21, 0x00],
                POTONG: [0x1d, 0x56, 0x42, 0x00], LACI: [0x1b, 0x70, 0x00, 0x19, 0xfa] };

  const rupiah = (n) => new Intl.NumberFormat(CONFIG.LOCALE).format(Math.round(Number(n) || 0));

  /** Susun baris teks struk (dipakai kedua jalur cetak). */
  function baris(nota, opsi = {}) {
    const L = Number(opsi.lebar || APP_STATE.setting.lebar_struk || 58) === 80 ? 42 : 32;
    const s = APP_STATE.setting;
    const garis = '-'.repeat(L);
    const out = [];

    const tengah = (t) => t.length >= L ? t : ' '.repeat(Math.floor((L - t.length) / 2)) + t;
    const duaKolom = (kiri, kanan) => {
      const sisa = L - kiri.length - kanan.length;
      return sisa > 0 ? kiri + ' '.repeat(sisa) + kanan
                      : kiri.substring(0, L - kanan.length - 1) + ' ' + kanan;
    };

    out.push(tengah((s.nama_usaha || 'SINDIKAT KARTU').toUpperCase()));
    if (s.alamat_usaha) out.push(tengah(s.alamat_usaha));
    if (s.telepon_usaha) out.push(tengah(s.telepon_usaha));
    out.push(tengah(APP_STATE.namaCabang || APP_STATE.cabang));
    out.push(garis);
    out.push(duaKolom('No', nota.no_nota));
    out.push(duaKolom(nota.tanggal, nota.jam));
    out.push(duaKolom('Kasir', APP_STATE.user.nama));
    if (nota.kode_pelanggan && nota.kode_pelanggan !== 'C001') {
      out.push(duaKolom('Plgn', nota._nama_pelanggan || nota.kode_pelanggan));
    }
    if (nota.level_harga !== 'eceran') out.push(duaKolom('Harga', nota.level_harga.toUpperCase()));
    out.push(garis);

    nota.item.forEach(it => {
      out.push(it.nama.substring(0, L));
      const kiri = `  ${it.qty} ${it.satuan} x ${rupiah(it.harga_satuan)}`;
      out.push(duaKolom(kiri, rupiah(it.qty * it.harga_satuan)));
      if (it.diskon > 0) out.push(duaKolom('  Diskon', '-' + rupiah(it.diskon)));
    });

    out.push(garis);
    const t = nota._total || {};
    out.push(duaKolom('Subtotal', rupiah(t.bruto)));
    if (t.diskon_item > 0) out.push(duaKolom('Diskon item', '-' + rupiah(t.diskon_item)));
    if (nota.diskon_nota > 0) out.push(duaKolom('Diskon nota', '-' + rupiah(nota.diskon_nota)));
    if (nota.ppn > 0) out.push(duaKolom('PPN', rupiah(nota.ppn)));
    out.push(duaKolom('TOTAL', rupiah(nota.total)));
    out.push(garis);

    (nota.bayar || []).forEach(b => {
      out.push(duaKolom(b.metode.toUpperCase(), rupiah(b.jumlah)));
    });
    if (nota._kembali > 0) out.push(duaKolom('KEMBALI', rupiah(nota._kembali)));
    if (nota.jatuh_tempo) out.push(duaKolom('Jatuh tempo', nota.jatuh_tempo));

    out.push('');
    out.push(tengah(s.footer_struk || 'Terima kasih'));
    if (nota._offline) out.push(tengah('* belum tersinkron *'));
    out.push('');
    return out;
  }

  /* ---------- Jalur 1: Bluetooth ESC/POS ---------- */

  async function hubungkanBluetooth() {
    if (!navigator.bluetooth) throw new Error('Peramban ini tidak mendukung Web Bluetooth. Gunakan Chrome/Edge.');
    perangkatBt = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });
    const server = await perangkatBt.gatt.connect();
    const svc = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    karakteristik = await svc.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    await DB.kvSet('printer_nama', perangkatBt.name);
    return perangkatBt.name;
  }

  async function cetakBluetooth(nota) {
    if (!karakteristik) await hubungkanBluetooth();
    const enc = new TextEncoder();
    let buf = [];
    const push = (arr) => buf.push(...arr);

    push(ESC.INIT); push(ESC.TENGAH); push(ESC.TEBAL_ON);
    push(Array.from(enc.encode(baris(nota)[0] + '\n')));
    push(ESC.TEBAL_OFF); push(ESC.KIRI);
    baris(nota).slice(1).forEach(b => push(Array.from(enc.encode(b + '\n'))));
    push([0x0a, 0x0a, 0x0a]);
    push(ESC.POTONG);

    // Kirim per 180 byte — banyak printer thermal punya buffer kecil
    const data = new Uint8Array(buf);
    for (let i = 0; i < data.length; i += 180) {
      await karakteristik.writeValue(data.slice(i, i + 180));
      await new Promise(r => setTimeout(r, 40));
    }
  }

  async function bukaLaci() {
    if (!karakteristik) return;
    await karakteristik.writeValue(new Uint8Array(ESC.LACI));
  }

  /* ---------- Jalur 2: HTML print (cadangan universal) ---------- */

  function cetakHtml(nota) {
    const lebar = Number(APP_STATE.setting.lebar_struk || 58);
    const isi = baris(nota).join('\n');
    const w = window.open('', '_blank', 'width=380,height=640');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${nota.no_nota}</title>
<style>
  @page { size: ${lebar}mm auto; margin: 2mm; }
  body { margin:0; font-family: 'Courier New', monospace; font-size: ${lebar === 80 ? 11 : 10}px;
         line-height: 1.35; white-space: pre; }
</style></head><body>${isi.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
  }

  /** Cetak dengan jalur terbaik yang tersedia; tidak pernah menggagalkan transaksi. */
  async function cetak(nota) {
    try {
      if (karakteristik || (await DB.kvGet('printer_nama', null))) {
        await cetakBluetooth(nota);
        return 'bluetooth';
      }
    } catch (e) {
      console.warn('Cetak Bluetooth gagal, beralih ke HTML:', e.message);
    }
    cetakHtml(nota);
    return 'html';
  }

  return { cetak, cetakHtml, cetakBluetooth, hubungkanBluetooth, bukaLaci, baris, rupiah };
})();
