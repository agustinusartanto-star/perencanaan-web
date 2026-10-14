/**
 * api.js — jembatan ke backend Google Apps Script (REST API).
 * Semua panggilan memakai POST dengan Content-Type text/plain agar browser
 * tidak mengirim CORS preflight (yang tidak didukung Apps Script).
 * Bentuk permintaan : { action: 'namaAksi', args: [token, ...] }
 * Bentuk respons    : { success, data, message, sesiBerakhir? }
 */
const API_TIMEOUT_MS = 120000; // unggah berkas besar & PDF bisa memakan waktu

function backendSiap() {
  return typeof GAS_URL === 'string' && GAS_URL.indexOf('https://script.google.com/') === 0 &&
    /\/exec$/.test(GAS_URL) && GAS_URL.indexOf('XXXX') < 0;
}

async function panggil(nama, ...args) {
  if (!backendSiap()) {
    throw new Error('URL backend belum diisi. Buka js/config.js lalu isi GAS_URL dengan URL /exec dari Apps Script.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  let teks;
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // WAJIB text/plain
      body: JSON.stringify({ action: nama, args: args }),
      signal: ctrl.signal
    });
    teks = await res.text();
  } catch (e) {
    throw new Error(e && e.name === 'AbortError'
      ? 'Server terlalu lama merespons. Coba lagi.'
      : 'Tidak dapat terhubung ke server. Periksa koneksi internet dan URL backend di js/config.js.');
  } finally {
    clearTimeout(timer);
  }
  let hasil;
  try { hasil = JSON.parse(teks); } catch (e) {
    throw new Error('Respons server tidak valid. Pastikan deployment Apps Script memakai "Execute as: Me", akses "Anyone", dan sudah versi terbaru.');
  }
  if (hasil && hasil.sesiBerakhir) {
    paksaKeluar('Sesi Anda berakhir. Silakan masuk kembali.');
    throw new Error('sesi');
  }
  return hasil;
}
