/**
 * ============================================================
 * Aplikasi Perencanaan Pembangunan dan Keuangan Daerah — Frontend
 * SPA murni di GitHub Pages; semua data lewat fetch ke backend Google Apps Script (js/api.js).
 * Token sesi hanya di memori JS (tidak disimpan di browser, tidak ada di URL).
 * Pemeriksaan hak akses di sini hanya untuk tampilan; penegakan ada di server.
 * ============================================================
 */

// ════════════════════════════════════════════════════════
// BAGIAN 1: STATE & UTILITAS
// ════════════════════════════════════════════════════════

const State = {
  token: null, user: null, config: {}, tahun: null, tahunList: [],
  page: null, data: null, idx: null, dash: null, pengguna: [], pengaturan: null, pdf: null, rekening: null, prognosis: null,
  filter: { q: '', status: '', idProgram: '' }, filterCatatan: 'Terbuka',
  buka: {}, charts: {}
};

const KFG = {
  program: { kode: 'KodeProgram', nama: 'NamaProgram', label: 'Program', lv: 1 },
  kegiatan: { kode: 'KodeKegiatan', nama: 'NamaKegiatan', label: 'Kegiatan', lv: 2 },
  subkegiatan: { kode: 'KodeSubkegiatan', nama: 'NamaSubkegiatan', label: 'Subkegiatan', lv: 3 }
};
const STATUS_LIST = ['Draf', 'Menunggu Verifikasi', 'Perlu Perbaikan', 'Disetujui'];
const PERAN_LABEL = { kabag: 'Kepala Bagian (Admin)', kasubag: 'Kepala Sub Bagian', staf: 'Staf' };
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const el = id => document.getElementById(id);
const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const angka = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const rp = n => 'Rp ' + angka(n);
function rpRingkas(n) {
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e12) return 'Rp ' + (n / 1e12).toFixed(2).replace('.', ',') + ' T';
  if (a >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2).replace('.', ',') + ' M';
  if (a >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1).replace('.', ',') + ' Jt';
  return rp(n);
}
function tgl(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return s || '-';
  return m[3] + ' ' + BLN[+m[2] - 1] + ' ' + m[1] + (m[4] ? ', ' + m[4] + ':' + m[5] : '');
}
const inisial = nama => String(nama || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const warna = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const nilai = id => { const e = el(id); return e ? e.value.trim() : ''; };

function badge(st) {
  const k = { 'Disetujui': 'st-ok', 'Menunggu Verifikasi': 'st-wait', 'Perlu Perbaikan': 'st-rev', 'Draf': 'st-draf' }[st] || 'st-draf';
  return '<span class="badge-st ' + k + '"><span class="dot"></span>' + esc(st) + '</span>';
}

function toast(judul, pesan, tipe) {
  const ikon = { success: 'bi-check-circle-fill', danger: 'bi-x-octagon-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[tipe || 'info'];
  const warnaIkon = { success: 'var(--primary)', danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--tertiary)' }[tipe || 'info'];
  const t = document.createElement('div');
  t.className = 'toast-x ' + (tipe || 'info');
  t.setAttribute('role', tipe === 'danger' ? 'alert' : 'status');
  t.innerHTML = '<i class="bi ' + ikon + '" style="color:' + warnaIkon + ';font-size:18px"></i><div><div class="tt">' + esc(judul) + '</div><div class="tb">' + esc(pesan) + '</div></div>';
  el('toastWrap').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, tipe === 'danger' ? 7000 : 4000);
}

/** Jalankan aksi tulis dengan indikator loading pada tombol. Kembalikan respons sukses atau null. */
async function kirim(tombol, nama, ...args) {
  const asli = tombol ? tombol.innerHTML : '';
  if (tombol) { tombol.disabled = true; tombol.innerHTML = '<span class="spinner spinner-sm"></span> Memproses...'; }
  try {
    const res = await panggil(nama, State.token, ...args);
    if (!res.success) { toast('Gagal', res.message, 'danger'); return null; }
    return res;
  } catch (e) {
    if (e.message !== 'sesi') toast('Error', e.message, 'danger');
    return null;
  } finally {
    if (tombol && document.body.contains(tombol)) { tombol.disabled = false; tombol.innerHTML = asli; }
  }
}

// ── Modal ──
function tampilModal(judul, body, footer) {
  el('mdTitle').textContent = judul;
  el('mdBody').innerHTML = body;
  el('mdFooter').innerHTML = footer || '';
  bootstrap.Modal.getOrCreateInstance(el('modalUtama')).show();
}
function tutupModalUtama() {
  return new Promise(res => {
    const m = el('modalUtama');
    if (!m.classList.contains('show')) return res();
    m.addEventListener('hidden.bs.modal', () => res(), { once: true });
    bootstrap.Modal.getOrCreateInstance(m).hide();
  });
}
async function konfirmasi(judul, pesanHtml, opsi) {
  opsi = opsi || {};
  await tutupModalUtama();
  return new Promise(resolve => {
    el('kfTitle').textContent = judul;
    el('kfBody').innerHTML = pesanHtml;
    const ok = el('kfOk');
    ok.textContent = opsi.label || 'Ya, lanjutkan';
    ok.className = 'btn-x ' + (opsi.gaya || 'btn-danger-x');
    const m = bootstrap.Modal.getOrCreateInstance(el('modalKonfirmasi'));
    let hasil = false;
    ok.onclick = () => { hasil = true; m.hide(); };
    el('modalKonfirmasi').addEventListener('hidden.bs.modal', () => {
      resolve(hasil);
      if (!hasil && opsi.kembali) opsi.kembali();
    }, { once: true });
    m.show();
  });
}

// ── Form helper ──
function fld(label, id, ctrl, o) {
  o = o || {};
  return '<div class="mb-3"><label class="lbl" for="' + id + '">' + label + (o.req ? ' <span class="req">*</span>' : '') + '</label>' + ctrl +
    (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '<div class="err" id="err_' + id + '" role="alert" hidden></div></div>';
}
function setErr(id, pesan) {
  const e = el('err_' + id), c = el(id);
  if (e) { e.textContent = pesan || ''; e.hidden = !pesan; }
  if (c) c.classList.toggle('is-invalid', !!pesan);
}
function bersihErr(ids) { ids.forEach(i => setErr(i, '')); }
function formatPagu(i) { const d = i.value.replace(/\D/g, ''); i.value = d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''; }
function togglePassword(id, btn) {
  const i = el(id), t = i.type === 'password';
  i.type = t ? 'text' : 'password';
  btn.innerHTML = t ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
  btn.setAttribute('aria-label', t ? 'Sembunyikan password' : 'Tampilkan password');
}
function sandiAcak(n) {
  n = n || 12;
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = new Uint32Array(n); crypto.getRandomValues(b);
  return Array.from(b, x => a[x % a.length]).join('');
}
const tampilLoading = (c, teks) => { c.innerHTML = '<div class="page-loading"><div class="spinner"></div><div>' + esc(teks || 'Memuat data...') + '</div></div>'; };

// ── Tema ──
function terapkanTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-bs-theme', t);
  const l = el('lblTema'); if (l) l.textContent = t === 'dark' ? 'Mode Terang' : 'Mode Gelap';
}
function toggleTema() {
  const baru = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  terapkanTema(baru);
  try { localStorage.setItem('tema', baru); } catch (e) { /* penyimpanan browser bisa diblokir */ }
  if (State.page === 'dashboard' || State.page === 'laporan') gambarGrafikSaatIni();
}

// ── Sidebar mobile ──
function bukaSidebar() { el('sidebar').classList.add('show'); el('sbBackdrop').classList.add('show'); }
function tutupSidebar() { el('sidebar').classList.remove('show'); el('sbBackdrop').classList.remove('show'); }

// ════════════════════════════════════════════════════════
// BAGIAN 2: INISIALISASI, LOGIN, LOGOUT
// ════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  let tema = 'dark';
  try { tema = localStorage.getItem('tema') || 'dark'; } catch (e) { /* abaikan */ }
  terapkanTema(tema);
  State.config = { appName: 'e-Perencanaan & Keuangan Daerah', instansi: '', logoUrl: '' };
  let pesanBackend = '';
  panggil('getTampilanPublik').then(r => { if (r && r.data) { State.config = Object.assign(State.config, r.data); terapkanBranding(); } })
    .catch(e => { pesanBackend = e.message; }) // mis. URL backend belum diisi / server tidak terjangkau
    .finally(() => { tampilLogin(); selesaiMuat(); if (pesanBackend) tampilError(pesanBackend); });
});

function selesaiMuat() {
  const o = el('loadingOverlay');
  o.style.opacity = '0';
  setTimeout(() => { o.style.display = 'none'; }, 300);
}

function setMark(id) {
  const m = el(id); if (!m) return;
  m.innerHTML = '<i class="bi bi-bank2"></i>';
  const u = State.config.logoUrl;
  if (u && /^https:\/\//.test(u)) {
    const img = new Image(); img.alt = 'Logo';
    img.onload = () => { m.innerHTML = ''; m.appendChild(img); };
    img.src = u;
  }
}
function terapkanBranding() {
  const c = State.config;
  document.title = c.appName || 'e-Perencanaan';
  el('loginTitle').textContent = c.appName || '';
  el('loginInstansi').textContent = c.instansi || 'Sistem Informasi Perencanaan Pembangunan';
  el('sbTitle').textContent = c.appName || '';
  el('sbInstansi').textContent = c.instansi || '';
  setMark('loginMark'); setMark('sbMark');
}

function tampilLogin() {
  el('viewApp').hidden = true;
  el('viewLogin').hidden = false;
  el('lgUser').focus();
}

function tampilError(pesan) { const e = el('lgError'); e.textContent = pesan; e.hidden = !pesan; }

async function handleLogin(ev) {
  ev.preventDefault();
  tampilError('');
  const u = nilai('lgUser'), p = el('lgPass').value;
  if (!u || !p) { tampilError('Isi username dan password.'); return; }
  const btn = el('btnLogin');
  const asli = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-sm"></span> Memproses...';
  try {
    const res = await panggil('doLogin', u, p);
    if (!res.success) { tampilError(res.message); return; }
    State.token = res.data.token;
    State.user = res.data.user;
    State.config = res.data.config;
    State.tahun = res.data.config.tahunAktif;
    State.tahunList = [State.tahun];
    el('lgPass').value = '';
    mulaiApp();
  } catch (e) {
    tampilError(e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = asli;
  }
}

function mulaiApp() {
  el('viewLogin').hidden = true;
  el('viewApp').hidden = false;
  terapkanBranding();
  el('userNama').textContent = State.user.nama;
  el('userPeran').textContent = PERAN_LABEL[State.user.peran] || State.user.peran;
  el('userAvatar').textContent = inisial(State.user.nama);
  isiTahun();
  renderNavigasi();
  navigateTo('dashboard');
}

async function handleLogout() {
  try { await panggil('doLogout', State.token); } catch (e) { /* tetap keluar di sisi client */ }
  paksaKeluar('Anda telah keluar.');
}

function paksaKeluar(pesan) {
  Object.keys(State.charts).forEach(k => { try { State.charts[k].destroy(); } catch (e) { /* abaikan */ } });
  Object.assign(State, { token: null, user: null, page: null, data: null, idx: null, dash: null, pengguna: [], pengaturan: null, pdf: null, rekening: null, prognosis: null, charts: {} });
  State.filter = { q: '', status: '', idProgram: '' };
  ['modalUtama', 'modalKonfirmasi', 'modalPreview'].forEach(id => { try { bootstrap.Modal.getOrCreateInstance(el(id)).hide(); } catch (e) { /* abaikan */ } });
  el('app-container').innerHTML = '';
  tutupSidebar();
  tampilLogin();
  if (pesan) toast('Info', pesan, 'info');
}

// ════════════════════════════════════════════════════════
// BAGIAN 3: NAVIGASI SPA
// ════════════════════════════════════════════════════════

function menuUntuk(peran) {
  const m = [
    { id: 'dashboard', ikon: 'bi-grid-1x2', label: 'Dashboard Utama' },
    { id: 'daftar', ikon: 'bi-diagram-3', label: 'Daftar Program & Subkegiatan' },
    { id: 'prognosis', ikon: 'bi-graph-up-arrow', label: 'Prognosis Anggaran' }
  ];
  if (peran === 'kabag') m.push({ id: 'approval', ikon: 'bi-patch-check', label: 'Approval & Verifikasi', badge: 'biru' });
  m.push({ id: 'catatan', ikon: 'bi-chat-left-text', label: 'Catatan Perbaikan', badge: 'rev' });
  m.push({ id: 'laporan', ikon: 'bi-file-earmark-pdf', label: 'Rekap & Cetak PDF' });
  if (peran === 'kabag') {
    m.push({ seksi: 'Administrasi Sistem' });
    m.push({ id: 'pengguna', ikon: 'bi-people', label: 'Kelola Pengguna' });
    m.push({ id: 'pengaturan', ikon: 'bi-gear', label: 'Pengaturan & Log' });
  }
  return m;
}
const JUDUL = { dashboard: 'Dashboard Utama', daftar: 'Daftar Program & Subkegiatan', prognosis: 'Prognosis Anggaran', approval: 'Approval & Verifikasi', catatan: 'Catatan Perbaikan', laporan: 'Rekap & Cetak PDF', pengguna: 'Kelola Pengguna', pengaturan: 'Pengaturan & Log' };

function renderNavigasi() {
  el('sbNav').innerHTML = menuUntuk(State.user.peran).map(m => m.seksi
    ? '<li class="sb-sec" style="padding-left:4px">' + esc(m.seksi) + '</li>'
    : '<li><a href="javascript:void(0)" class="nav-item-x" data-page="' + m.id + '" onclick="navigateTo(\'' + m.id + '\')">' +
      '<i class="bi ' + m.ikon + '"></i><span>' + esc(m.label) + '</span>' +
      (m.badge ? '<span class="nav-badge ' + (m.badge === 'biru' ? 'biru' : '') + '" id="bdg-' + m.id + '" hidden>0</span>' : '') + '</a></li>').join('');
}

function perbaruiLencana() {
  if (!State.data) return;
  const d = State.data;
  const menunggu = d.program.concat(d.kegiatan, d.subkegiatan).filter(x => x.Status === 'Menunggu Verifikasi').length;
  const catatan = d.catatan.filter(c => c.Status === 'Terbuka').length;
  const set = (id, n) => { const b = el(id); if (b) { b.textContent = n; b.hidden = !n; } };
  set('bdg-approval', menunggu); set('bdg-catatan', catatan);
}

function isiTahun() {
  const s = el('selTahun');
  const list = State.tahunList.length ? State.tahunList : [State.tahun];
  s.innerHTML = list.map(t => '<option value="' + t + '"' + (t === State.tahun ? ' selected' : '') + '>TA ' + t + '</option>').join('');
}
function ubahTahun(v) {
  State.tahun = Number(v); State.data = null; State.dash = null; State.idx = null;
  navigateTo(State.page, true);
}

async function muatData(paksa) {
  if (!paksa && State.data && State.data.tahun === State.tahun) return;
  const res = await panggil('getDataPerencanaan', State.token, State.tahun);
  if (!res.success) throw new Error(res.message);
  State.data = res.data;
  State.tahunList = res.data.tahunList;
  bangunIndeks();
  isiTahun();
  perbaruiLencana();
}
async function muatDash(paksa) {
  if (!paksa && State.dash && State.dash.tahun === State.tahun) return;
  const res = await panggil('getDashboard', State.token, State.tahun);
  if (!res.success) throw new Error(res.message);
  State.dash = res.data;
}

const MUAT = {
  dashboard: async () => { await Promise.all([muatData(), muatDash()]); },
  daftar: async () => { await muatData(); },
  prognosis: async () => { await Promise.all([muatData(), muatPrognosis()]); },
  approval: async () => { await muatData(); },
  catatan: async () => { await muatData(); },
  laporan: async () => { await Promise.all([muatData(), muatDash()]); },
  pengguna: async () => {
    const r = await panggil('getPengguna', State.token);
    if (!r.success) throw new Error(r.message);
    State.pengguna = r.data;
  },
  pengaturan: async () => {
    const [k, l] = await Promise.all([panggil('getKonfigurasi', State.token), panggil('getLog', State.token)]);
    if (!k.success) throw new Error(k.message);
    State.pengaturan = { config: k.data, log: l.success ? l.data : [] };
  }
};
const RENDER = { dashboard: renderDashboard, daftar: renderDaftar, prognosis: renderPrognosis, approval: renderApproval, catatan: renderCatatan, laporan: renderLaporan, pengguna: renderPengguna, pengaturan: renderPengaturan };

async function navigateTo(halaman, paksa) {
  if (!State.token || !MUAT[halaman]) return;
  State.page = halaman;
  document.querySelectorAll('.nav-item-x').forEach(a => a.classList.toggle('active', a.dataset.page === halaman));
  el('pageTitle').textContent = JUDUL[halaman] || '';
  tutupSidebar();
  const c = el('app-container');
  tampilLoading(c);
  try {
    if (paksa) { State.dash = null; if (halaman === 'pengguna' || halaman === 'pengaturan') { /* selalu segar */ } }
    await MUAT[halaman]();
    if (State.page !== halaman) return; // pengguna sudah pindah halaman
    RENDER[halaman]();
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.message === 'sesi') return;
    c.innerHTML = '<div class="card-x kosong"><i class="bi bi-wifi-off"></i><div class="mb-3">' + esc(e.message) + '</div>' +
      '<button class="btn-x btn-secondary-x" onclick="navigateTo(\'' + halaman + '\', true)"><i class="bi bi-arrow-clockwise"></i> Coba lagi</button></div>';
  }
}

function segarkanData() { State.data = null; State.dash = null; navigateTo(State.page, true); toast('Info', 'Data dimuat ulang.', 'info'); }

/** Muat ulang data setelah perubahan, lalu gambar ulang halaman tanpa layar loading penuh. */
async function segarkan() {
  try {
    State.dash = null;
    await muatData(true);
    if (State.page === 'dashboard' || State.page === 'laporan') await muatDash(true);
    if (RENDER[State.page] && State.page !== 'pengguna' && State.page !== 'pengaturan') RENDER[State.page]();
  } catch (e) { if (e.message !== 'sesi') toast('Error', e.message, 'danger'); }
}

// ════════════════════════════════════════════════════════
// BAGIAN 4: INDEKS DATA & HAK AKSES (TAMPILAN)
// ════════════════════════════════════════════════════════

function bangunIndeks() {
  const d = State.data, ix = { kegPerProg: {}, subPerKeg: {}, kinPerSub: {}, indPerKin: {}, catPerData: {}, paguKeg: {}, paguProg: {}, nSubKeg: {}, nSubProg: {}, byId: {}, jenisPerSub: {}, rincianPerJenis: {}, nRincianSub: {}, rekSub: {} };
  d.program.forEach(p => { ix.byId[p.ID] = { jenis: 'program', item: p }; ix.paguProg[p.ID] = 0; ix.nSubProg[p.ID] = 0; });
  d.kegiatan.forEach(k => { ix.byId[k.ID] = { jenis: 'kegiatan', item: k }; (ix.kegPerProg[k.IDProgram] = ix.kegPerProg[k.IDProgram] || []).push(k); ix.paguKeg[k.ID] = 0; ix.nSubKeg[k.ID] = 0; });
  d.subkegiatan.forEach(s => {
    ix.byId[s.ID] = { jenis: 'subkegiatan', item: s };
    (ix.subPerKeg[s.IDKegiatan] = ix.subPerKeg[s.IDKegiatan] || []).push(s);
    ix.paguKeg[s.IDKegiatan] = (ix.paguKeg[s.IDKegiatan] || 0) + s.NilaiPagu;
    ix.nSubKeg[s.IDKegiatan] = (ix.nSubKeg[s.IDKegiatan] || 0) + 1;
    const keg = ix.byId[s.IDKegiatan];
    if (keg) { const pid = keg.item.IDProgram; ix.paguProg[pid] = (ix.paguProg[pid] || 0) + s.NilaiPagu; ix.nSubProg[pid] = (ix.nSubProg[pid] || 0) + 1; }
  });
  d.kinerja.forEach(k => { (ix.kinPerSub[k.IDSubkegiatan] = ix.kinPerSub[k.IDSubkegiatan] || []).push(k); });
  d.indikator.forEach(i => { (ix.indPerKin[i.IDKinerja] = ix.indPerKin[i.IDKinerja] || []).push(i); });
  const subDariJenis = {};
  (d.jenis || []).forEach(j => { subDariJenis[j.ID] = j.IDSubkegiatan; (ix.jenisPerSub[j.IDSubkegiatan] = ix.jenisPerSub[j.IDSubkegiatan] || []).push(j); });
  (d.rincian || []).forEach(r => {
    (ix.rincianPerJenis[r.IDJenisKegiatan] = ix.rincianPerJenis[r.IDJenisKegiatan] || []).push(r);
    const sid = subDariJenis[r.IDJenisKegiatan];
    if (sid) { ix.nRincianSub[sid] = (ix.nRincianSub[sid] || 0) + 1; ix.rekSub[sid] = (ix.rekSub[sid] || '') + ' ' + r.KodeRekening; }
  });
  d.catatan.forEach(c => { (ix.catPerData[c.IDData] = ix.catPerData[c.IDData] || []).push(c); });
  State.idx = ix;
}
const cariItem = (jenis, id) => { const e = State.idx && State.idx.byId[id]; return e && e.jenis === jenis ? e.item : null; };
const namaUser = u => (State.data && State.data.pengguna[u]) || u;

const adalahKabag = () => State.user.peran === 'kabag';
const bolehInput = () => State.user.peran === 'kabag' || State.user.peran === 'kasubag';
function bolehUbahItem(it) {
  if (adalahKabag()) return true;
  return State.user.peran === 'kasubag' && it.DibuatOleh === State.user.username && (it.Status === 'Draf' || it.Status === 'Perlu Perbaikan');
}
const bolehAjukan = it => bolehUbahItem(it) && (it.Status === 'Draf' || it.Status === 'Perlu Perbaikan');
const bolehSetujui = it => adalahKabag() && (it.Status === 'Menunggu Verifikasi' || (it.Status === 'Draf' && it.DibuatOleh === State.user.username));

// ════════════════════════════════════════════════════════
// BAGIAN 5: DASHBOARD & GRAFIK
// ════════════════════════════════════════════════════════

function kartuKpi(o) {
  return '<div class="card-x hover h-100"><div class="kpi-top"><span class="kpi-lbl">' + o.lbl + '</span>' +
    '<span class="ico-box" style="width:32px;height:32px;font-size:16px;background:color-mix(in srgb,' + o.warna + ' 18%,transparent);color:' + o.warna + '"><i class="bi ' + o.ikon + '"></i></span></div>' +
    '<div class="kpi-val" style="color:' + o.warna + '" title="' + esc(rp(o.nilai)) + '">' + esc(rpRingkas(o.nilai)) + '</div>' +
    '<div class="kpi-sub"><span>' + o.kiri + '</span><span class="mono" style="color:' + o.warna + '">' + o.kanan + '</span></div>' +
    '<div class="bar" role="progressbar" aria-valuenow="' + Math.round(o.pct) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(o.lbl) + '"><span style="width:' + Math.min(100, o.pct) + '%;background:' + o.bar + '"></span></div></div>';
}

function renderDashboard() {
  const d = State.dash, st = d.status, total = d.total || 0;
  const pct = n => total > 0 ? (n / total * 100) : 0;
  const peran = State.user.peran;
  let pill;
  if (peran === 'kabag') {
    pill = '<div class="ico-box" style="background:color-mix(in srgb,var(--st-rev-tx) 18%,transparent);color:var(--st-rev-tx)"><i class="bi bi-exclamation-lg"></i></div>' +
      '<div><div style="font-weight:600">Menunggu Tindakan Anda</div><div class="muted" style="font-size:12px"><b style="color:var(--st-wait-tx)">' + d.menunggu + ' usulan</b> butuh persetujuan • <b style="color:var(--st-rev-tx)">' + d.jumlahCatatanTerbuka + ' catatan</b> perbaikan aktif</div></div>' +
      '<button class="btn-x btn-secondary-x btn-sm-x" onclick="navigateTo(\'approval\')">Tinjau</button>';
  } else if (peran === 'kasubag') {
    pill = '<div class="ico-box" style="background:color-mix(in srgb,var(--st-rev-tx) 18%,transparent);color:var(--st-rev-tx)"><i class="bi bi-chat-left-text"></i></div>' +
      '<div><div style="font-weight:600">Tindak Lanjut Anda</div><div class="muted" style="font-size:12px"><b style="color:var(--st-rev-tx)">' + d.jumlahCatatanTerbuka + ' catatan</b> perbaikan aktif</div></div>' +
      '<button class="btn-x btn-secondary-x btn-sm-x" onclick="navigateTo(\'catatan\')">Lihat</button>';
  } else {
    pill = '<div class="ico-box" style="background:color-mix(in srgb,var(--tertiary) 18%,transparent);color:var(--tertiary)"><i class="bi bi-eye"></i></div>' +
      '<div><div style="font-weight:600">Akses Lihat Saja</div><div class="muted" style="font-size:12px">Anda dapat melihat data dan mencetak rekap.</div></div>';
  }

  const kpi = [
    kartuKpi({ lbl: 'Total Alokasi Pagu TA ' + d.tahun, ikon: 'bi-wallet2', warna: 'var(--tertiary)', bar: 'var(--tertiary)', nilai: total, pct: total ? 100 : 0, kiri: d.jumlahSub + ' subkegiatan', kanan: Math.round(pct(st['Disetujui'].pagu)) + '% disetujui' }),
    kartuKpi({ lbl: 'Pagu Disetujui', ikon: 'bi-patch-check', warna: 'var(--st-ok-tx)', bar: 'var(--st-ok-bd)', nilai: st['Disetujui'].pagu, pct: pct(st['Disetujui'].pagu), kiri: pct(st['Disetujui'].pagu).toFixed(1) + '% dari total pagu', kanan: st['Disetujui'].jumlah + ' Subkegiatan' }),
    kartuKpi({ lbl: 'Menunggu Verifikasi', ikon: 'bi-hourglass-split', warna: 'var(--st-wait-tx)', bar: 'var(--st-wait-bd)', nilai: st['Menunggu Verifikasi'].pagu, pct: pct(st['Menunggu Verifikasi'].pagu), kiri: pct(st['Menunggu Verifikasi'].pagu).toFixed(1) + '% butuh persetujuan', kanan: st['Menunggu Verifikasi'].jumlah + ' Subkegiatan' }),
    kartuKpi({ lbl: 'Perlu Perbaikan', ikon: 'bi-pencil-square', warna: 'var(--st-rev-tx)', bar: 'var(--st-rev-bd)', nilai: st['Perlu Perbaikan'].pagu, pct: pct(st['Perlu Perbaikan'].pagu), kiri: pct(st['Perlu Perbaikan'].pagu).toFixed(1) + '% dalam perbaikan', kanan: st['Perlu Perbaikan'].jumlah + ' Subkegiatan' })
  ].map(k => '<div class="col-12 col-sm-6 col-xl-3">' + k + '</div>').join('');

  const catatan = d.catatanTerbuka.length ? d.catatanTerbuka.map(c =>
    '<div class="catatan"><div class="meta"><span class="mono" style="color:var(--st-rev-tx)">' + esc(c.Kode) + '</span><span>' + esc(c.Pembuat) + '</span><span class="faint">' + tgl(c.Tanggal) + '</span></div>' +
    '<div class="isi">' + esc(c.Isi) + '</div>' +
    '<button class="btn-x btn-ghost-x btn-sm-x mt-2" onclick="bukaDetail(\'' + esc(c.JenisData) + '\',\'' + esc(c.IDData) + '\')"><i class="bi bi-box-arrow-up-right"></i> Buka data</button></div>').join('')
    : '<div class="kosong" style="padding:24px"><i class="bi bi-check2-circle"></i>Tidak ada catatan perbaikan terbuka.</div>';

  el('app-container').innerHTML =
    '<div class="d-grid gap-3">' +
    '<section class="banner"><div class="d-flex flex-wrap justify-content-between align-items-center gap-3">' +
      '<div><div class="d-flex flex-wrap align-items-center gap-2 mb-2"><span class="badge-st st-ok">Penyusunan Anggaran</span><span class="mono" style="color:var(--tertiary);font-size:13px;font-weight:600">TA ' + d.tahun + '</span></div>' +
      '<h2 style="font-size:28px;line-height:36px;font-weight:700;letter-spacing:-.02em">Selamat Datang, ' + esc(State.user.nama) + '</h2>' +
      '<div class="muted mt-1">' + esc(PERAN_LABEL[State.user.peran]) + (State.config.instansi ? ' — ' + esc(State.config.instansi) : '') + '</div></div>' +
      '<div class="pill-info">' + pill + '</div></div></section>' +
    '<div class="row g-3">' + kpi + '</div>' +
    '<div class="row g-3"><div class="col-12 col-xl-8"><section class="card-x h-100"><div class="card-title"><i class="bi bi-bar-chart-line" style="color:var(--tertiary)"></i>Grafik Perbandingan Pagu per Program</div>' +
      '<div class="card-sub">Total pagu dibandingkan dengan pagu yang sudah disetujui, TA ' + d.tahun + '</div>' +
      (d.perProgram.length ? '<div class="chart-box"><canvas id="chartDash" role="img" aria-label="Grafik batang perbandingan pagu per program"></canvas></div>' : '<div class="kosong"><i class="bi bi-bar-chart"></i>Belum ada program pada TA ini.</div>') + '</section></div>' +
    '<div class="col-12 col-xl-4 d-grid gap-3" style="align-content:start"><section class="insight"><div class="card-title"><i class="bi bi-stars" style="color:var(--secondary)"></i>Analisis Otomatis</div><ul class="mt-2">' +
      d.insight.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul></section>' +
      '<section class="card-x"><div class="card-title"><i class="bi bi-chat-left-dots" style="color:var(--st-rev-tx)"></i>Catatan Perbaikan Terbuka</div><div class="card-sub">Terbaru dari Kepala Bagian</div>' + catatan + '</section></div></div></div>';
  gambarGrafik('chartDash', d.perProgram);
}

function gambarGrafik(id, perProgram) {
  const cv = el(id);
  if (!cv || typeof Chart === 'undefined') return;
  if (State.charts[id]) State.charts[id].destroy();
  const tx = warna('--tx-2'), garis = warna('--grid-line');
  State.charts[id] = new Chart(cv, {
    type: 'bar',
    data: {
      labels: perProgram.map(p => p.kode),
      datasets: [
        { label: 'Total pagu', data: perProgram.map(p => p.pagu), backgroundColor: warna('--tertiary'), borderRadius: 6, maxBarThickness: 48 },
        { label: 'Disetujui', data: perProgram.map(p => p.disetujui), backgroundColor: warna('--primary'), borderRadius: 6, maxBarThickness: 48 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: tx, usePointStyle: true } },
        tooltip: { callbacks: { title: it => { const p = perProgram[it[0].dataIndex]; return p.kode + ' — ' + p.nama; }, label: c => c.dataset.label + ': ' + rp(c.parsed.y) } }
      },
      scales: { x: { ticks: { color: tx }, grid: { display: false } }, y: { ticks: { color: tx, callback: v => rpRingkas(v) }, grid: { color: garis } } }
    }
  });
}
function gambarGrafikSaatIni() {
  if (!State.dash) return;
  gambarGrafik(State.page === 'laporan' ? 'chartLaporan' : 'chartDash', State.dash.perProgram);
}

// ════════════════════════════════════════════════════════
// BAGIAN 6: DAFTAR HIERARKI (PROGRAM → KEGIATAN → SUBKEGIATAN)
// ════════════════════════════════════════════════════════

function hitungBaris() {
  const d = State.data, ix = State.idx, f = State.filter, q = f.q.trim().toLowerCase();
  const aktif = !!(q || f.status);
  const cocokTeks = t => !q || t.toLowerCase().includes(q);
  const cocokStatus = it => !f.status || it.Status === f.status;
  const urut = (a, b, k) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
  const baris = [];
  d.program.filter(p => !f.idProgram || p.ID === f.idProgram).sort((a, b) => urut(a, b, 'KodeProgram')).forEach(p => {
    const pTeks = cocokTeks(p.KodeProgram + ' ' + p.NamaProgram);
    const kegs = (ix.kegPerProg[p.ID] || []).slice().sort((a, b) => urut(a, b, 'KodeKegiatan'));
    const kegBaris = [];
    kegs.forEach(g => {
      const gTeks = pTeks || cocokTeks(g.KodeKegiatan + ' ' + g.NamaKegiatan);
      const subs = (ix.subPerKeg[g.ID] || []).slice().sort((a, b) => urut(a, b, 'KodeSubkegiatan'))
        .filter(s => (gTeks || cocokTeks(s.KodeSubkegiatan + ' ' + s.NamaSubkegiatan + ' ' + s.KodeRekening + ' ' + (ix.rekSub[s.ID] || ''))) && cocokStatus(s));
      if ((gTeks && cocokStatus(g)) || subs.length) kegBaris.push({ g: g, subs: subs });
    });
    if ((pTeks && cocokStatus(p)) || kegBaris.length) {
      const tampilKeg = aktif || State.buka[p.ID] !== false;
      baris.push({ lv: 1, item: p, anak: (ix.kegPerProg[p.ID] || []).length > 0 });
      if (tampilKeg) kegBaris.forEach(kb => {
        const tampilSub = aktif || State.buka[kb.g.ID] !== false;
        baris.push({ lv: 2, item: kb.g, anak: (ix.subPerKeg[kb.g.ID] || []).length > 0 });
        if (tampilSub) kb.subs.forEach(s => baris.push({ lv: 3, item: s, anak: false }));
      });
    }
  });
  return baris;
}

function htmlBaris(r) {
  const ix = State.idx, it = r.item;
  const jenis = r.lv === 1 ? 'program' : r.lv === 2 ? 'kegiatan' : 'subkegiatan';
  const cfg = KFG[jenis], kode = it[cfg.kode], nama = it[cfg.nama];
  const terbuka = State.buka[it.ID] !== false;
  const chev = r.anak ? '<button class="chev ' + (terbuka ? 'buka' : '') + '" onclick="lipat(\'' + it.ID + '\')" aria-expanded="' + terbuka + '" aria-label="' + (terbuka ? 'Ciutkan ' : 'Perluas ') + esc(kode) + '"><i class="bi bi-chevron-right"></i></button>' : '<span class="chev-spacer"></span>';
  const jumlahCat = (ix.catPerData[it.ID] || []).filter(c => c.Status === 'Terbuka').length;
  let sub, pagu, paguNote = '';
  if (r.lv === 1) { sub = (ix.kegPerProg[it.ID] || []).length + ' kegiatan • ' + ix.nSubProg[it.ID] + ' subkegiatan'; pagu = ix.paguProg[it.ID]; paguNote = 'total program'; }
  else if (r.lv === 2) { sub = ix.nSubKeg[it.ID] + ' subkegiatan'; pagu = ix.paguKeg[it.ID]; paguNote = 'total kegiatan'; }
  else {
    pagu = it.NilaiPagu;
    const kin = (ix.kinPerSub[it.ID] || [])[0];
    const ind = kin ? (ix.indPerKin[kin.ID] || [])[0] : null;
    sub = ind ? 'Indikator: ' + ind.UraianIndikator + ' — ' + ind.Target + ' ' + ind.Satuan : '';
  }
  const subHtml = r.lv === 3 && !sub ? '<div class="sub" style="color:var(--warning)"><i class="bi bi-exclamation-triangle"></i> Belum ada kinerja &amp; indikator</div>' : '<div class="sub">' + esc(sub) + '</div>';
  const aksi = '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaDetail(\'' + jenis + '\',\'' + it.ID + '\')" aria-label="Detail ' + esc(kode) + '" title="Detail"><i class="bi bi-eye"></i></button>' +
    (bolehUbahItem(it) ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaForm(\'' + jenis + '\',\'' + it.ID + '\')" aria-label="Ubah ' + esc(kode) + '" title="Ubah"><i class="bi bi-pencil"></i></button>' : '') +
    (bolehSetujui(it) ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--primary)" onclick="setujui(\'' + jenis + '\',\'' + it.ID + '\')" aria-label="Setujui ' + esc(kode) + '" title="Setujui"><i class="bi bi-check2-circle"></i></button>' : '');
  return '<div class="tr-row lv-' + r.lv + '" role="row">' +
    '<div class="c-kode kode"><div class="kode">' + chev + '<div><span>' + esc(kode) + '</span>' + (r.lv === 3 ? '<div class="rek">' + (ix.nRincianSub[it.ID] ? ix.nRincianSub[it.ID] + ' rincian belanja' : (it.KodeRekening ? 'Rek: ' + esc(it.KodeRekening) : 'Belum ada rincian')) + '</div>' : '') + '</div></div></div>' +
    '<div class="c-nama nama"><div>' + esc(nama) + '</div>' + subHtml + (jumlahCat ? '<div class="cat-flag"><i class="bi bi-chat-left-text"></i> ' + jumlahCat + ' catatan perbaikan terbuka</div>' : '') + '</div>' +
    '<div class="c-pagu pagu">' + rp(pagu) + (paguNote ? '<small>' + paguNote + '</small>' : '') + '</div>' +
    '<div class="c-pic"><div style="font-size:13px;font-weight:600">' + esc(namaUser(it.DibuatOleh)) + '</div><div class="faint" style="font-size:11px">' + tgl(it.DiubahPada) + '</div></div>' +
    '<div class="c-status">' + badge(it.Status) + '</div>' +
    '<div class="c-aksi aksi">' + aksi + '</div></div>';
}

function renderDaftar() {
  const d = State.data, f = State.filter;
  const opsiProg = '<option value="">Semua Program</option>' + d.program.slice().sort((a, b) => a.KodeProgram < b.KodeProgram ? -1 : 1).map(p => '<option value="' + p.ID + '"' + (f.idProgram === p.ID ? ' selected' : '') + '>' + esc(p.KodeProgram + ' — ' + p.NamaProgram) + '</option>').join('');
  const opsiSt = '<option value="">Semua Status</option>' + STATUS_LIST.map(s => '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>').join('');
  el('app-container').innerHTML =
    '<div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h2 style="font-size:22px;font-weight:700">Daftar Program, Kegiatan &amp; Subkegiatan</h2>' +
    '<div class="muted">Hierarki: Program → Kegiatan → Subkegiatan → Rekening Belanja &amp; Indikator Kinerja • TA ' + d.tahun + '</div></div>' +
    '<div class="d-flex flex-wrap gap-2"><button class="btn-x btn-secondary-x" onclick="navigateTo(\'laporan\')"><i class="bi bi-file-earmark-pdf"></i> Cetak Rekap PDF</button>' +
    (bolehInput() ? '<button class="btn-x btn-primary-x" onclick="bukaForm(\'program\')"><i class="bi bi-plus-lg"></i> Input Program</button>' : '') + '</div></div>' +
    '<div class="toolbar"><div class="grow"><i class="bi bi-search"></i><label class="sr-only" for="fCari">Cari</label><input id="fCari" class="inp" placeholder="Cari kode, rekening, atau nomenklatur..." value="' + esc(f.q) + '" oninput="ubahFilter(\'q\', this.value)"></div>' +
    '<div style="min-width:180px"><label class="sr-only" for="fStatus">Status</label><select id="fStatus" class="sel" onchange="ubahFilter(\'status\', this.value)">' + opsiSt + '</select></div>' +
    '<div style="min-width:220px;max-width:320px"><label class="sr-only" for="fProg">Program</label><select id="fProg" class="sel" onchange="ubahFilter(\'idProgram\', this.value)">' + opsiProg + '</select></div></div>' +
    '<div id="daftarTree"></div>';
  gambarTree();
}
function gambarTree() {
  const baris = hitungBaris();
  const c = el('daftarTree');
  if (!c) return;
  if (!baris.length) {
    c.innerHTML = '<div class="tree"><div class="kosong"><i class="bi bi-inbox"></i><div>' + (State.data.program.length ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data untuk TA ' + State.data.tahun + '.') + '</div>' +
      (!State.data.program.length && bolehInput() ? '<button class="btn-x btn-primary-x mt-3" onclick="bukaForm(\'program\')"><i class="bi bi-plus-lg"></i> Input Program Pertama</button>' : '') + '</div></div>';
    return;
  }
  c.innerHTML = '<div class="tree" role="table" aria-label="Daftar program, kegiatan, dan subkegiatan"><div class="tr-head" role="row"><div>Kode &amp; Rekening</div><div>Nomenklatur &amp; Indikator Kinerja</div><div style="text-align:right">Pagu Anggaran</div><div>Penginput</div><div>Status</div><div style="text-align:right">Aksi</div></div>' +
    baris.map(htmlBaris).join('') + '</div><div class="faint mt-2" style="font-size:12px">' + baris.length + ' baris ditampilkan</div>';
}
let timerCari = null;
function ubahFilter(k, v) {
  State.filter[k] = v;
  if (k === 'q') { clearTimeout(timerCari); timerCari = setTimeout(gambarTree, 200); } else gambarTree();
}
function lipat(id) { State.buka[id] = State.buka[id] === false; gambarTree(); }

// ════════════════════════════════════════════════════════
// BAGIAN 7: DETAIL, FORM, AKSI WORKFLOW
// ════════════════════════════════════════════════════════

function bukaDetail(jenis, id) {
  const it = cariItem(jenis, id);
  if (!it) { toast('Info', 'Data tidak ditemukan. Muat ulang halaman.', 'warning'); return; }
  const cfg = KFG[jenis], ix = State.idx, d = State.data;
  const kode = it[cfg.kode], nama = it[cfg.nama];
  let jalur = '';
  if (jenis === 'kegiatan') { const p = cariItem('program', it.IDProgram); jalur = p ? p.KodeProgram : ''; }
  if (jenis === 'subkegiatan') { const g = cariItem('kegiatan', it.IDKegiatan); const p = g ? cariItem('program', g.IDProgram) : null; jalur = (p ? p.KodeProgram + ' › ' : '') + (g ? g.KodeKegiatan : ''); }
  const meta = [['Status', badge(it.Status)], ['Tahun Anggaran', esc(it.TahunAnggaran)], ['Penginput', esc(namaUser(it.DibuatOleh))], ['Terakhir diubah', esc(tgl(it.DiubahPada))]];
  if (jenis === 'subkegiatan') {
    if (it.KodeRekening && !ix.nRincianSub[id]) meta.push(['Kode Rekening Belanja', '<span class="mono">' + esc(it.KodeRekening) + '</span>']);
    meta.push(['Nilai Pagu', '<span class="mono">' + rp(it.NilaiPagu) + '</span><div class="faint" style="font-size:11px;font-weight:400">' + (ix.nRincianSub[id] ? 'Total rincian belanja' : 'Nilai lama (belum ada rincian belanja)') + '</div>']);
  }
  else if (jenis === 'kegiatan') meta.push(['Total Pagu', '<span class="mono">' + rp(ix.paguKeg[id]) + '</span>'], ['Jumlah Subkegiatan', ix.nSubKeg[id]]);
  else meta.push(['Total Pagu', '<span class="mono">' + rp(ix.paguProg[id]) + '</span>'], ['Jumlah Kegiatan', (ix.kegPerProg[id] || []).length]);

  let body = (jalur ? '<div class="mono faint mb-1" style="font-size:12px">' + esc(jalur) + '</div>' : '') +
    '<h3 style="font-size:18px;line-height:26px;font-weight:700"><span class="mono" style="color:var(--c-' + (jenis === 'subkegiatan' ? 'sub' : jenis) + ')">' + esc(kode) + '</span> ' + esc(nama) + '</h3>' +
    '<div class="detail-grid">' + meta.map(m => '<div><div class="k">' + m[0] + '</div><div class="v">' + m[1] + '</div></div>').join('') + '</div>';

  if (jenis === 'subkegiatan') body += htmlRincianSection(id);

  if (jenis === 'subkegiatan') {
    const boleh = bolehUbahItem(it);
    body += '<div class="sec-title"><span><i class="bi bi-bullseye"></i> Kinerja &amp; Indikator</span>' + (boleh ? '<button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaFormKinerja(\'' + id + '\')"><i class="bi bi-plus-lg"></i> Kinerja</button>' : '') + '</div>';
    const kins = ix.kinPerSub[id] || [];
    body += kins.length ? kins.map(k => {
      const inds = ix.indPerKin[k.ID] || [];
      return '<div class="kin-box"><div class="d-flex justify-content-between align-items-start gap-2"><div style="font-weight:600">' + esc(k.UraianKinerja) + '</div><div class="d-flex gap-1">' +
        (boleh ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaFormKinerja(\'' + id + '\',\'' + k.ID + '\')" aria-label="Ubah kinerja"><i class="bi bi-pencil"></i></button>' : '') +
        (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--danger)" onclick="hapusKinerja(\'' + id + '\',\'' + k.ID + '\')" aria-label="Hapus kinerja"><i class="bi bi-trash"></i></button>' : '') + '</div></div>' +
        inds.map(i => '<div class="ind"><div><i class="bi bi-dot"></i>' + esc(i.UraianIndikator) + ' — <b class="mono">' + esc(i.Target) + '</b> ' + esc(i.Satuan) + '</div><div class="d-flex gap-1">' +
          (boleh ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaFormIndikator(\'' + id + '\',\'' + k.ID + '\',\'' + i.ID + '\')" aria-label="Ubah indikator"><i class="bi bi-pencil"></i></button>' : '') +
          (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--danger)" onclick="hapusIndikator(\'' + id + '\',\'' + i.ID + '\')" aria-label="Hapus indikator"><i class="bi bi-trash"></i></button>' : '') + '</div></div>').join('') +
        (boleh ? '<button class="btn-x btn-ghost-x btn-sm-x mt-2" onclick="bukaFormIndikator(\'' + id + '\',\'' + k.ID + '\')"><i class="bi bi-plus-lg"></i> Indikator</button>' : '') + '</div>';
    }).join('') : '<div class="muted">Belum ada kinerja dan indikator.</div>';
  }

  const cats = (ix.catPerData[id] || []).slice().sort((a, b) => a.Tanggal < b.Tanggal ? 1 : -1);
  body += '<div class="sec-title"><span><i class="bi bi-chat-left-text"></i> Catatan Perbaikan</span></div>';
  body += cats.length ? cats.map(c =>
    '<div class="catatan ' + (c.Status === 'Selesai' ? 'selesai' : '') + '"><div class="meta"><b>' + esc(c.Pembuat) + '</b><span class="badge-st ' + (c.Status === 'Selesai' ? 'st-ok' : 'st-rev') + '">' + esc(c.Status) + '</span><span class="faint">' + tgl(c.Tanggal) + '</span>' +
    (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-sm-x ms-auto" onclick="alihStatusCatatan(\'' + c.ID + '\',\'' + (c.Status === 'Terbuka' ? 'Selesai' : 'Terbuka') + '\',\'' + jenis + '\',\'' + id + '\')">' + (c.Status === 'Terbuka' ? 'Tandai selesai' : 'Buka kembali') + '</button>' : '') + '</div><div class="isi">' + esc(c.IsiCatatan) + '</div></div>').join('')
    : '<div class="muted">Belum ada catatan perbaikan.</div>';

  let ft = '';
  if (jenis === 'program' && bolehInput()) ft += '<button class="btn-x btn-secondary-x" onclick="bukaForm(\'kegiatan\',null,\'' + id + '\')"><i class="bi bi-plus-lg"></i> Kegiatan</button>';
  if (jenis === 'kegiatan' && bolehInput()) ft += '<button class="btn-x btn-secondary-x" onclick="bukaForm(\'subkegiatan\',null,\'' + id + '\')"><i class="bi bi-plus-lg"></i> Subkegiatan</button>';
  if (bolehUbahItem(it)) ft += '<button class="btn-x btn-secondary-x" onclick="bukaForm(\'' + jenis + '\',\'' + id + '\')"><i class="bi bi-pencil"></i> Ubah</button>';
  if (bolehAjukan(it)) ft += '<button class="btn-x btn-secondary-x" onclick="ajukan(\'' + jenis + '\',\'' + id + '\')"><i class="bi bi-send"></i> Ajukan</button>';
  if (adalahKabag()) ft += '<button class="btn-x btn-warn-x" onclick="bukaFormCatatan(\'' + jenis + '\',\'' + id + '\')"><i class="bi bi-chat-left-text"></i> Catatan Perbaikan</button>';
  if (bolehSetujui(it)) ft += '<button class="btn-x btn-primary-x" onclick="setujui(\'' + jenis + '\',\'' + id + '\')"><i class="bi bi-check2-circle"></i> Setujui</button>';
  if (adalahKabag()) ft += '<button class="btn-x btn-danger-x" onclick="hapusItem(\'' + jenis + '\',\'' + id + '\')"><i class="bi bi-trash"></i> Hapus</button>';
  ft += '<button class="btn-x btn-ghost-x" data-bs-dismiss="modal">Tutup</button>';
  tampilModal(cfg.label + ' — Detail', body, ft);
}

function bukaForm(jenis, id, indukId) {
  const cfg = KFG[jenis], lama = id ? cariItem(jenis, id) : null, d = State.data;
  let h = '<form id="formEntitas" novalidate onsubmit="return false">';
  if (jenis === 'kegiatan') {
    const pilih = lama ? lama.IDProgram : (indukId || '');
    h += fld('Program', 'fInduk', '<select id="fInduk" class="sel"' + (lama ? ' disabled' : '') + '><option value="">— Pilih program —</option>' +
      d.program.slice().sort((a, b) => a.KodeProgram < b.KodeProgram ? -1 : 1).map(p => '<option value="' + p.ID + '"' + (p.ID === pilih ? ' selected' : '') + '>' + esc(p.KodeProgram + ' — ' + p.NamaProgram) + '</option>').join('') + '</select>',
      { req: true, hint: lama ? 'Induk tidak dapat dipindahkan. Hubungi Kepala Bagian bila salah pilih.' : (d.program.length ? '' : 'Belum ada program. Input program terlebih dahulu.') });
  }
  if (jenis === 'subkegiatan') {
    const pilih = lama ? lama.IDKegiatan : (indukId || '');
    const opt = d.program.slice().sort((a, b) => a.KodeProgram < b.KodeProgram ? -1 : 1).map(p => {
      const kegs = (State.idx.kegPerProg[p.ID] || []).slice().sort((a, b) => a.KodeKegiatan < b.KodeKegiatan ? -1 : 1);
      return kegs.length ? '<optgroup label="' + esc(p.KodeProgram + ' — ' + p.NamaProgram) + '">' + kegs.map(g => '<option value="' + g.ID + '"' + (g.ID === pilih ? ' selected' : '') + '>' + esc(g.KodeKegiatan + ' — ' + g.NamaKegiatan) + '</option>').join('') + '</optgroup>' : '';
    }).join('');
    h += fld('Kegiatan', 'fInduk', '<select id="fInduk" class="sel"' + (lama ? ' disabled' : '') + '><option value="">— Pilih kegiatan —</option>' + opt + '</select>',
      { req: true, hint: lama ? 'Induk tidak dapat dipindahkan. Hubungi Kepala Bagian bila salah pilih.' : (d.kegiatan.length ? '' : 'Belum ada kegiatan. Input kegiatan terlebih dahulu.') });
  }
  h += '<div class="row g-3"><div class="col-12 col-md-5">' + fld('Kode ' + cfg.label, 'fKode', '<input id="fKode" class="inp mono" maxlength="40" autocomplete="off" value="' + esc(lama ? lama[cfg.kode] : '') + '" placeholder="mis. 1.01.01.2.01">', { req: true, hint: 'Angka, huruf, titik, dan strip. Harus unik per tahun anggaran.' }) + '</div>';
  h += '<div class="col-12 col-md-7">' + fld('Nomenklatur ' + cfg.label, 'fNama', '<input id="fNama" class="inp" maxlength="300" autocomplete="off" value="' + esc(lama ? lama[cfg.nama] : '') + '">', { req: true }) + '</div></div>';
  if (jenis === 'program') {
    h += fld('Tahun Anggaran', 'fTahun', '<input id="fTahun" class="inp mono" inputmode="numeric" maxlength="4" value="' + esc(lama ? lama.TahunAnggaran : State.tahun) + '"' + (lama && (State.idx.kegPerProg[id] || []).length ? ' disabled' : '') + '>',
      { req: true, hint: lama && (State.idx.kegPerProg[id] || []).length ? 'Tidak dapat diubah karena program sudah memiliki kegiatan.' : 'Kegiatan dan subkegiatan akan mengikuti tahun ini.' });
  }
  if (jenis === 'subkegiatan') {
    h += '<div class="pill-info mb-3"><i class="bi bi-info-circle" style="color:var(--tertiary);font-size:18px"></i><div class="muted" style="font-size:12px">Nilai pagu dihitung otomatis dari total rincian belanja. Setelah subkegiatan disimpan, buka <b>Detail</b> untuk menambah jenis kegiatan dan rincian belanja.</div></div>';
  }
  h += '</form>';
  const ft = '<button class="btn-x btn-ghost-x" data-bs-dismiss="modal">Batal</button><button class="btn-x btn-primary-x" id="btnSimpan" onclick="simpanForm(\'' + jenis + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>';
  tampilModal((lama ? 'Ubah ' : 'Input ') + cfg.label, h, ft);
  setTimeout(() => { const f = el(jenis === 'program' || lama ? 'fKode' : 'fInduk'); if (f) f.focus(); }, 300);
}

async function simpanForm(jenis, id, btn) {
  const cfg = KFG[jenis];
  const ids = ['fInduk', 'fKode', 'fNama', 'fTahun', 'fRek', 'fPagu'];
  bersihErr(ids);
  const rec = {}; let ok = true;
  const wajib = (fid, pesan) => { if (el(fid) && !nilai(fid)) { setErr(fid, pesan); ok = false; } };
  if (id) rec.ID = id;
  if (el('fInduk')) { wajib('fInduk', 'Pilih induk terlebih dahulu.'); rec[jenis === 'kegiatan' ? 'IDProgram' : 'IDKegiatan'] = nilai('fInduk'); }
  wajib('fKode', 'Kode wajib diisi.'); wajib('fNama', 'Nomenklatur wajib diisi.');
  rec[cfg.kode] = nilai('fKode'); rec[cfg.nama] = nilai('fNama');
  if (rec[cfg.kode] && !/^[0-9A-Za-z.\-]{1,40}$/.test(rec[cfg.kode])) { setErr('fKode', 'Hanya angka, huruf, titik, dan strip.'); ok = false; }
  if (el('fTahun')) { rec.TahunAnggaran = Number(nilai('fTahun')); if (!(rec.TahunAnggaran >= 2000 && rec.TahunAnggaran <= 2100)) { setErr('fTahun', 'Masukkan tahun 2000–2100.'); ok = false; } }
  if (el('fRek')) { wajib('fRek', 'Kode rekening wajib diisi.'); rec.KodeRekening = nilai('fRek'); }
  if (el('fPagu')) { rec.NilaiPagu = Number(nilai('fPagu').replace(/\D/g, '')); if (!(rec.NilaiPagu > 0)) { setErr('fPagu', 'Nilai pagu harus lebih dari 0.'); ok = false; } }
  if (!ok) return;
  const res = await kirim(btn, 'simpanEntitas', jenis, rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await tutupModalUtama();
  if (jenis === 'program' && rec.TahunAnggaran && rec.TahunAnggaran !== State.tahun) { State.tahun = rec.TahunAnggaran; State.data = null; }
  await segarkan();
  if (jenis === 'subkegiatan' && !id && res.data && res.data.ID) bukaDetail('subkegiatan', res.data.ID); // lanjut isi jenis kegiatan & rincian
}

async function ajukan(jenis, id) {
  const it = cariItem(jenis, id);
  const ya = await konfirmasi('Ajukan untuk verifikasi?', 'Data <b>' + esc(it[KFG[jenis].kode]) + '</b> akan dikirim ke Kepala Bagian. Setelah diajukan, data tidak dapat Anda ubah sampai ada catatan perbaikan.', { label: 'Ajukan', gaya: 'btn-primary-x', kembali: () => bukaDetail(jenis, id) });
  if (!ya) return;
  const res = await kirim(null, 'ajukanEntitas', jenis, id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); }
}
async function setujui(jenis, id) {
  const it = cariItem(jenis, id);
  const ya = await konfirmasi('Setujui data ini?', 'Data <b>' + esc(it[KFG[jenis].kode]) + '</b> — ' + esc(it[KFG[jenis].nama]) + ' akan berstatus <b>Disetujui</b>.', { label: 'Setujui', gaya: 'btn-primary-x', kembali: () => bukaDetail(jenis, id) });
  if (!ya) return;
  const res = await kirim(null, 'setujuiEntitas', jenis, id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); }
}
async function hapusItem(jenis, id) {
  const it = cariItem(jenis, id);
  const ya = await konfirmasi('Hapus ' + KFG[jenis].label + '?', 'Anda akan menghapus <b>' + esc(it[KFG[jenis].kode]) + '</b> — ' + esc(it[KFG[jenis].nama]) + (jenis === 'subkegiatan' ? ' beserta kinerja, indikator, dan catatannya' : '') + '. Tindakan ini tidak dapat dibatalkan.', { label: 'Hapus', kembali: () => bukaDetail(jenis, id) });
  if (!ya) return;
  const res = await kirim(null, 'hapusEntitas', jenis, id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); }
}

// ── Catatan perbaikan ──
function bukaFormCatatan(jenis, id) {
  const it = cariItem(jenis, id);
  const body = '<div class="mb-3"><span class="mono" style="color:var(--c-' + (jenis === 'subkegiatan' ? 'sub' : jenis) + ')">' + esc(it[KFG[jenis].kode]) + '</span> ' + esc(it[KFG[jenis].nama]) + '</div>' +
    fld('Catatan perbaikan', 'fCatatan', '<textarea id="fCatatan" class="txa" maxlength="1000" placeholder="Jelaskan bagian yang perlu diperbaiki..."></textarea>', { req: true, hint: 'Status data akan berubah menjadi Perlu Perbaikan dan penginput diberi notifikasi email.' });
  tampilModal('Catatan Perbaikan', body, '<button class="btn-x btn-ghost-x" onclick="bukaDetail(\'' + jenis + '\',\'' + id + '\')">Kembali</button><button class="btn-x btn-warn-x" onclick="kirimCatatan(\'' + jenis + '\',\'' + id + '\',this)"><i class="bi bi-send"></i> Kirim Catatan</button>');
}
async function kirimCatatan(jenis, id, btn) {
  setErr('fCatatan', '');
  const isi = nilai('fCatatan');
  if (isi.length < 3) { setErr('fCatatan', 'Tulis catatan minimal 3 karakter.'); return; }
  const res = await kirim(btn, 'tambahCatatan', jenis, id, isi);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await tutupModalUtama();
  await segarkan();
}
async function alihStatusCatatan(idCatatan, status, jenis, id) {
  const res = await kirim(null, 'ubahStatusCatatan', idCatatan, status);
  if (!res) return;
  await segarkan();
  if (State.idx.byId[id]) bukaDetail(jenis, id);
}

// ── Kinerja & indikator ──
function bukaFormKinerja(idSub, id) {
  const lama = id ? (State.idx.kinPerSub[idSub] || []).find(k => k.ID === id) : null;
  const body = fld('Uraian kinerja', 'fKin', '<textarea id="fKin" class="txa" maxlength="500" placeholder="mis. Tersusunnya dokumen perencanaan tepat waktu">' + esc(lama ? lama.UraianKinerja : '') + '</textarea>', { req: true });
  tampilModal(lama ? 'Ubah Kinerja' : 'Tambah Kinerja', body, '<button class="btn-x btn-ghost-x" onclick="bukaDetail(\'subkegiatan\',\'' + idSub + '\')">Kembali</button><button class="btn-x btn-primary-x" onclick="simpanKinerja(\'' + idSub + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
}
async function simpanKinerja(idSub, id, btn) {
  setErr('fKin', '');
  const u = nilai('fKin');
  if (u.length < 3) { setErr('fKin', 'Uraian kinerja minimal 3 karakter.'); return; }
  const rec = { IDSubkegiatan: idSub, UraianKinerja: u }; if (id) rec.ID = id;
  const res = await kirim(btn, 'simpanKinerja', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await segarkan(); bukaDetail('subkegiatan', idSub);
}
function bukaFormIndikator(idSub, idKin, id) {
  const lama = id ? (State.idx.indPerKin[idKin] || []).find(i => i.ID === id) : null;
  const body = fld('Uraian indikator', 'fInd', '<input id="fInd" class="inp" maxlength="300" value="' + esc(lama ? lama.UraianIndikator : '') + '" placeholder="mis. Jumlah dokumen perencanaan yang ditetapkan">', { req: true }) +
    '<div class="row g-3"><div class="col-6">' + fld('Target', 'fTarget', '<input id="fTarget" class="inp mono" maxlength="60" value="' + esc(lama ? lama.Target : '') + '" placeholder="mis. 3">', { req: true }) + '</div>' +
    '<div class="col-6">' + fld('Satuan', 'fSatuan', '<input id="fSatuan" class="inp" maxlength="40" value="' + esc(lama ? lama.Satuan : '') + '" placeholder="mis. Dokumen">', { req: true }) + '</div></div>';
  tampilModal(lama ? 'Ubah Indikator' : 'Tambah Indikator', body, '<button class="btn-x btn-ghost-x" onclick="bukaDetail(\'subkegiatan\',\'' + idSub + '\')">Kembali</button><button class="btn-x btn-primary-x" onclick="simpanIndikator(\'' + idSub + '\',\'' + idKin + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
}
async function simpanIndikator(idSub, idKin, id, btn) {
  bersihErr(['fInd', 'fTarget', 'fSatuan']);
  let ok = true;
  [['fInd', 'Uraian indikator wajib diisi.'], ['fTarget', 'Target wajib diisi.'], ['fSatuan', 'Satuan wajib diisi.']].forEach(x => { if (!nilai(x[0])) { setErr(x[0], x[1]); ok = false; } });
  if (!ok) return;
  const rec = { IDKinerja: idKin, UraianIndikator: nilai('fInd'), Target: nilai('fTarget'), Satuan: nilai('fSatuan') }; if (id) rec.ID = id;
  const res = await kirim(btn, 'simpanIndikator', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await segarkan(); bukaDetail('subkegiatan', idSub);
}
async function hapusKinerja(idSub, id) {
  const ya = await konfirmasi('Hapus kinerja?', 'Kinerja beserta seluruh indikatornya akan dihapus.', { label: 'Hapus', kembali: () => bukaDetail('subkegiatan', idSub) });
  if (!ya) return;
  const res = await kirim(null, 'hapusKinerja', id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); bukaDetail('subkegiatan', idSub); }
}
async function hapusIndikator(idSub, id) {
  const ya = await konfirmasi('Hapus indikator?', 'Indikator ini akan dihapus.', { label: 'Hapus', kembali: () => bukaDetail('subkegiatan', idSub) });
  if (!ya) return;
  const res = await kirim(null, 'hapusIndikator', id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); bukaDetail('subkegiatan', idSub); }
}

// ════════════════════════════════════════════════════════
// JENIS KEGIATAN & RINCIAN BELANJA (Nilai Pagu = total rincian belanja)
// ════════════════════════════════════════════════════════

function htmlRincianSection(idSub) {
  const ix = State.idx, it = cariItem('subkegiatan', idSub), boleh = bolehUbahItem(it);
  const jens = ix.jenisPerSub[idSub] || [];
  let total = 0;
  let h = '<div class="sec-title"><span><i class="bi bi-receipt"></i> Jenis Kegiatan &amp; Rincian Belanja</span>' +
    (boleh ? '<button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaFormJenis(\'' + idSub + '\')"><i class="bi bi-plus-lg"></i> Jenis Kegiatan</button>' : '') + '</div>';
  if (!jens.length) h += '<div class="muted">Belum ada jenis kegiatan.' + (boleh ? ' Tambahkan jenis kegiatan, lalu rincian belanjanya.' : '') + '</div>';
  jens.forEach(j => {
    const rs = ix.rincianPerJenis[j.ID] || [];
    const subtotal = rs.reduce((a, r) => a + r.Jumlah, 0);
    total += subtotal;
    h += '<div class="kin-box"><div class="d-flex justify-content-between align-items-start gap-2 mb-2"><div style="font-weight:600"><i class="bi bi-folder2-open"></i> ' + esc(j.NamaJenis) + '</div><div class="d-flex gap-1">' +
      (boleh ? '<button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaFormRincian(\'' + idSub + '\',\'' + j.ID + '\')"><i class="bi bi-plus-lg"></i> Rincian</button>' +
        '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaFormJenis(\'' + idSub + '\',\'' + j.ID + '\')" aria-label="Ubah jenis kegiatan"><i class="bi bi-pencil"></i></button>' : '') +
      (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--danger)" onclick="hapusJenis(\'' + idSub + '\',\'' + j.ID + '\')" aria-label="Hapus jenis kegiatan"><i class="bi bi-trash"></i></button>' : '') + '</div></div>';
    h += rs.length ? '<div class="tbl-wrap"><table class="tbl rincian"><thead><tr><th>Kode Rekening &amp; Uraian</th><th class="num">Volume</th><th class="num">Harga Satuan</th><th class="num">Jumlah</th><th></th></tr></thead><tbody>' +
      rs.map(r => '<tr><td><div class="mono" style="font-size:12px;font-weight:600;color:var(--c-sub)">' + esc(r.KodeRekening) + '</div><div>' + esc(r.Uraian) + '</div></td>' +
        '<td class="num">' + esc(String(r.Volume).replace('.', ',')) + ' ' + esc(r.Satuan) + '</td><td class="num">' + rp(r.HargaSatuan) + '</td><td class="num" style="font-weight:700">' + rp(r.Jumlah) + '</td>' +
        '<td><div class="d-flex gap-1 justify-content-end">' +
        (boleh ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaFormRincian(\'' + idSub + '\',\'' + j.ID + '\',\'' + r.ID + '\')" aria-label="Ubah rincian"><i class="bi bi-pencil"></i></button>' : '') +
        (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--danger)" onclick="hapusRincian(\'' + idSub + '\',\'' + r.ID + '\')" aria-label="Hapus rincian"><i class="bi bi-trash"></i></button>' : '') + '</div></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3" style="font-weight:600;padding:8px 12px">Subtotal</td><td class="num" style="font-weight:700;padding:8px 12px">' + rp(subtotal) + '</td><td></td></tr></tfoot></table></div>'
      : '<div class="muted" style="font-size:13px">Belum ada rincian belanja.</div>';
    h += '</div>';
  });
  if (jens.length) h += '<div class="total-bar"><span>Nilai Pagu <span class="muted">(total seluruh rincian belanja)</span></span><b class="mono">' + rp(total) + '</b></div>';
  return h;
}

// ── Jenis kegiatan ──
function bukaFormJenis(idSub, id) {
  const lama = id ? (State.idx.jenisPerSub[idSub] || []).find(j => j.ID === id) : null;
  const body = fld('Nama jenis kegiatan', 'fJenis', '<input id="fJenis" class="inp" maxlength="200" autocomplete="off" value="' + esc(lama ? lama.NamaJenis : '') + '" placeholder="mis. Rapat koordinasi penyusunan dokumen">',
    { req: true, hint: 'Kelompok pekerjaan di dalam subkegiatan. Rincian belanja ditambahkan di bawah jenis kegiatan ini.' });
  tampilModal(lama ? 'Ubah Jenis Kegiatan' : 'Tambah Jenis Kegiatan', body,
    '<button class="btn-x btn-ghost-x" onclick="bukaDetail(\'subkegiatan\',\'' + idSub + '\')">Kembali</button><button class="btn-x btn-primary-x" onclick="simpanJenis(\'' + idSub + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
  setTimeout(() => { const f = el('fJenis'); if (f) f.focus(); }, 300);
}
async function simpanJenis(idSub, id, btn) {
  setErr('fJenis', '');
  const nama = nilai('fJenis');
  if (nama.length < 3) { setErr('fJenis', 'Nama jenis kegiatan minimal 3 karakter.'); return; }
  const rec = { IDSubkegiatan: idSub, NamaJenis: nama }; if (id) rec.ID = id;
  const res = await kirim(btn, 'simpanJenisKegiatan', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await segarkan(); bukaDetail('subkegiatan', idSub);
}
async function hapusJenis(idSub, id) {
  const ya = await konfirmasi('Hapus jenis kegiatan?', 'Jenis kegiatan beserta seluruh rincian belanjanya akan dihapus, dan nilai pagu subkegiatan dihitung ulang.', { label: 'Hapus', kembali: () => bukaDetail('subkegiatan', idSub) });
  if (!ya) return;
  const res = await kirim(null, 'hapusJenisKegiatan', id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); bukaDetail('subkegiatan', idSub); }
}

// ── Daftar kode rekening belanja (dropdown + pencarian) ──
async function muatRekening() {
  if (State.rekening) return true;
  try {
    const res = await panggil('getRekeningBelanja', State.token);
    if (!res.success) { toast('Gagal', res.message, 'danger'); return false; }
    const grup = {};
    res.data.grup.forEach(g => { grup[g[0]] = g[1]; });
    State.rekening = { grup: grup, daftar: res.data.daftar.map(r => ({ k: r[0], u: r[1], t: (r[0] + ' ' + r[1]).toLowerCase() })) };
    return true;
  } catch (e) {
    if (e.message !== 'sesi') toast('Error', e.message, 'danger');
    return false;
  }
}

let rekHasil = [], rekAktif = -1;
function cariRekening() {
  const inp = el('fRekCari'), list = el('rekList');
  if (!inp || !list || !State.rekening) return;
  const kata = inp.value.toLowerCase().split(/\s+/).filter(Boolean), g = nilai('fRekGrup');
  const d = State.rekening.daftar;
  let total = 0;
  rekHasil = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    if (g && r.k.indexOf(g) !== 0) continue;
    if (kata.every(t => r.t.indexOf(t) >= 0)) { total++; if (rekHasil.length < 40) rekHasil.push(r); }
  }
  rekAktif = rekHasil.length ? 0 : -1;
  list.innerHTML = rekHasil.length
    ? rekHasil.map((r, i) => '<div class="combo-opt' + (i === 0 ? ' aktif' : '') + '" role="option" id="rekopt' + i + '" onmousedown="pilihRekeningIdx(event,' + i + ')"><span class="mono">' + esc(r.k) + '</span><span>' + esc(r.u) + '</span></div>').join('') +
      (total > 40 ? '<div class="combo-info">Menampilkan 40 dari ' + angka(total) + ' hasil. Persempit pencarian atau pilih kelompok.</div>' : '')
    : '<div class="combo-info">Tidak ada kode rekening yang cocok.</div>';
  list.hidden = false;
  inp.setAttribute('aria-expanded', 'true');
}
function tutupRekening() {
  const l = el('rekList'), i = el('fRekCari');
  if (l) l.hidden = true;
  if (i) i.setAttribute('aria-expanded', 'false');
}
function sorotRekening(idx) {
  const opts = document.querySelectorAll('#rekList .combo-opt');
  if (!opts.length) return;
  rekAktif = (idx + opts.length) % opts.length;
  opts.forEach((o, i) => o.classList.toggle('aktif', i === rekAktif));
  opts[rekAktif].scrollIntoView({ block: 'nearest' });
}
function tombolRekening(ev) {
  if (ev.key === 'ArrowDown') { ev.preventDefault(); if (el('rekList').hidden) cariRekening(); else sorotRekening(rekAktif + 1); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); sorotRekening(rekAktif - 1); }
  else if (ev.key === 'Enter') { if (!el('rekList').hidden && rekHasil[rekAktif]) { ev.preventDefault(); pilihRekening(rekHasil[rekAktif].k); } }
  else if (ev.key === 'Escape') { ev.stopPropagation(); tutupRekening(); }
}
function pilihRekeningIdx(ev, i) { ev.preventDefault(); if (rekHasil[i]) pilihRekening(rekHasil[i].k); }
function pilihRekening(kode) {
  const r = State.rekening.daftar.find(x => x.k === kode);
  el('fRek').value = kode;
  el('fRekCari').value = '';
  el('rekTerpilih').innerHTML = '<span class="mono" style="font-weight:600;color:var(--c-sub)">' + esc(kode) + '</span> — ' + esc(r ? r.u : '(tidak ada dalam daftar)');
  setErr('fRek', '');
  tutupRekening();
  if (el('fUraian') && !nilai('fUraian') && r) el('fUraian').focus();
}

// ── Rincian belanja ──
const angkaVolume = s => Number(String(s).replace(',', '.')) || 0;
function hitungJumlahRincian() {
  const j = el('fJumlah');
  if (j) j.textContent = rp(Math.round(angkaVolume(nilai('fVol')) * (Number(nilai('fHarga').replace(/\D/g, '')) || 0)));
}
async function bukaFormRincian(idSub, idJenis, id) {
  const lama = id ? (State.idx.rincianPerJenis[idJenis] || []).find(r => r.ID === id) : null;
  if (!State.rekening) toast('Info', 'Memuat daftar kode rekening belanja...', 'info');
  if (!(await muatRekening())) return;
  const jen = (State.idx.jenisPerSub[idSub] || []).find(j => j.ID === idJenis);
  const grupOpt = '<option value="">Semua kelompok</option>' + Object.keys(State.rekening.grup).sort().map(k => '<option value="' + esc(k) + '">' + esc(k + ' — ' + State.rekening.grup[k]) + '</option>').join('');
  const body = '<div class="muted mb-3" style="font-size:13px"><i class="bi bi-folder2-open"></i> Jenis kegiatan: <b>' + esc(jen ? jen.NamaJenis : '') + '</b></div>' +
    '<div class="mb-3"><label class="lbl" for="fRekCari">Kode rekening belanja <span class="req">*</span></label><div class="row g-2">' +
    '<div class="col-12 col-md-5"><select id="fRekGrup" class="sel" onchange="cariRekening()" aria-label="Filter kelompok rekening">' + grupOpt + '</select></div>' +
    '<div class="col-12 col-md-7 combo"><input id="fRekCari" class="inp" role="combobox" aria-expanded="false" aria-controls="rekList" aria-autocomplete="list" autocomplete="off" placeholder="Ketik kode atau uraian, mis. alat tulis" oninput="cariRekening()" onfocus="cariRekening()" onblur="setTimeout(tutupRekening,150)" onkeydown="tombolRekening(event)">' +
    '<div id="rekList" class="combo-list" role="listbox" hidden></div></div></div>' +
    '<input type="hidden" id="fRek" value="' + esc(lama ? lama.KodeRekening : '') + '"><div id="rekTerpilih" class="rek-pilih" aria-live="polite"><span class="faint">Belum ada kode rekening dipilih. Pilih dari dropdown atau cari dengan kata kunci.</span></div>' +
    '<div class="err" id="err_fRek" role="alert" hidden></div></div>' +
    fld('Uraian rincian belanja', 'fUraian', '<input id="fUraian" class="inp" maxlength="300" autocomplete="off" value="' + esc(lama ? lama.Uraian : '') + '" placeholder="mis. Konsumsi rapat koordinasi penyusunan RKA">', { req: true }) +
    '<div class="row g-3"><div class="col-6 col-md-3">' + fld('Volume', 'fVol', '<input id="fVol" class="inp mono" inputmode="decimal" autocomplete="off" oninput="this.value=this.value.replace(/[^0-9,]/g,\'\');hitungJumlahRincian()" value="' + esc(lama ? String(lama.Volume).replace('.', ',') : '') + '" placeholder="0">', { req: true, hint: 'Desimal pakai koma.' }) + '</div>' +
    '<div class="col-6 col-md-3">' + fld('Satuan', 'fSat', '<input id="fSat" class="inp" maxlength="40" autocomplete="off" value="' + esc(lama ? lama.Satuan : '') + '" placeholder="mis. Orang">', { req: true }) + '</div>' +
    '<div class="col-12 col-md-6">' + fld('Harga Satuan (Rp)', 'fHarga', '<input id="fHarga" class="inp mono" inputmode="numeric" autocomplete="off" oninput="formatPagu(this);hitungJumlahRincian()" value="' + (lama ? angka(lama.HargaSatuan) : '') + '" placeholder="0">', { req: true }) + '</div></div>' +
    '<div class="total-bar"><span>Jumlah (Volume × Harga Satuan)</span><b class="mono" id="fJumlah">' + rp(lama ? lama.Jumlah : 0) + '</b></div>';
  tampilModal(lama ? 'Ubah Rincian Belanja' : 'Tambah Rincian Belanja', body,
    '<button class="btn-x btn-ghost-x" onclick="bukaDetail(\'subkegiatan\',\'' + idSub + '\')">Kembali</button><button class="btn-x btn-primary-x" onclick="simpanRincian(\'' + idSub + '\',\'' + idJenis + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
  if (lama) pilihRekening(lama.KodeRekening);
  else setTimeout(() => { const f = el('fRekCari'); if (f) f.focus(); }, 300);
}
async function simpanRincian(idSub, idJenis, id, btn) {
  bersihErr(['fRek', 'fUraian', 'fVol', 'fSat', 'fHarga']);
  let ok = true;
  const kode = nilai('fRek'), vol = angkaVolume(nilai('fVol')), harga = Number(nilai('fHarga').replace(/\D/g, '')) || 0;
  if (!kode) { setErr('fRek', 'Pilih kode rekening dari daftar.'); ok = false; }
  if (nilai('fUraian').length < 3) { setErr('fUraian', 'Uraian minimal 3 karakter.'); ok = false; }
  if (!(vol > 0)) { setErr('fVol', 'Volume harus lebih dari 0.'); ok = false; }
  if (!nilai('fSat')) { setErr('fSat', 'Satuan wajib diisi.'); ok = false; }
  if (!(harga > 0)) { setErr('fHarga', 'Harga satuan harus lebih dari 0.'); ok = false; }
  if (!ok) return;
  const rec = { IDJenisKegiatan: idJenis, KodeRekening: kode, Uraian: nilai('fUraian'), Volume: vol, Satuan: nilai('fSat'), HargaSatuan: harga }; if (id) rec.ID = id;
  const res = await kirim(btn, 'simpanRincian', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await segarkan(); bukaDetail('subkegiatan', idSub);
}
async function hapusRincian(idSub, id) {
  const ya = await konfirmasi('Hapus rincian belanja?', 'Rincian ini akan dihapus dan nilai pagu subkegiatan dihitung ulang.', { label: 'Hapus', kembali: () => bukaDetail('subkegiatan', idSub) });
  if (!ya) return;
  const res = await kirim(null, 'hapusRincian', id);
  if (res) { toast('Berhasil', res.message, 'success'); await segarkan(); bukaDetail('subkegiatan', idSub); }
}

// ════════════════════════════════════════════════════════
// PROGNOSIS ANGGARAN: Subkegiatan → Jenis Kegiatan → Anggaran, Realisasi, Sisa, Bukti Dukung
// ════════════════════════════════════════════════════════

async function muatPrognosis(paksa) {
  if (!paksa && State.prognosis && State.prognosis.tahun === State.tahun) return;
  const res = await panggil('getDataPrognosis', State.token, State.tahun);
  if (!res.success) throw new Error(res.message);
  const px = { realPerJenis: {}, buktiPerReal: {} };
  res.data.realisasi.forEach(r => { (px.realPerJenis[r.IDJenisKegiatan] = px.realPerJenis[r.IDJenisKegiatan] || []).push(r); });
  res.data.bukti.forEach(b => { (px.buktiPerReal[b.IDRealisasi] = px.buktiPerReal[b.IDRealisasi] || []).push(b); });
  State.prognosis = { tahun: res.data.tahun, px: px };
}
async function segarkanPrognosis() {
  try { await muatPrognosis(true); if (State.page === 'prognosis') renderPrognosis(); }
  catch (e) { if (e.message !== 'sesi') toast('Error', e.message, 'danger'); }
}

const anggaranJenis = jid => (State.idx.rincianPerJenis[jid] || []).reduce((a, r) => a + r.Jumlah, 0);
const realisasiJenis = jid => (State.prognosis.px.realPerJenis[jid] || []).reduce((a, r) => a + r.Jumlah, 0);
const jumlahBuktiJenis = jid => (State.prognosis.px.realPerJenis[jid] || []).reduce((a, r) => a + (State.prognosis.px.buktiPerReal[r.ID] || []).length, 0);
const bolehIsiPrognosis = () => State.user.peran === 'kabag' || State.user.peran === 'kasubag'; // kabag: koreksi; kasubag: input
const bolehTambahReal = () => State.user.peran === 'kasubag'; // realisasi baru hanya diinput Kepala Sub Bagian
const bolehUbahReal = r => State.user.peran === 'kabag' || (State.user.peran === 'kasubag' && r.DibuatOleh === State.user.username);
const persen = (a, b) => (b > 0 ? a / b * 100 : 0);
const fmtPersen = n => n.toFixed(1).replace('.', ',') + '%';
function fmtUkuran(n) { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

let cariProg = '';
function renderPrognosis() {
  const ix = State.idx;
  const subs = State.data.subkegiatan.filter(s => (ix.jenisPerSub[s.ID] || []).length).sort((a, b) => (a.KodeSubkegiatan < b.KodeSubkegiatan ? -1 : 1));
  let tA = 0, tR = 0;
  subs.forEach(s => ix.jenisPerSub[s.ID].forEach(j => { tA += anggaranJenis(j.ID); tR += realisasiJenis(j.ID); }));
  const kpi = [
    kartuKpi({ lbl: 'Jumlah Anggaran TA ' + State.tahun, ikon: 'bi-wallet2', warna: 'var(--tertiary)', bar: 'var(--tertiary)', nilai: tA, pct: tA ? 100 : 0, kiri: 'Total rincian belanja', kanan: subs.length + ' subkegiatan' }),
    kartuKpi({ lbl: 'Realisasi Anggaran', ikon: 'bi-cash-coin', warna: 'var(--st-ok-tx)', bar: 'var(--st-ok-bd)', nilai: tR, pct: persen(tR, tA), kiri: fmtPersen(persen(tR, tA)) + ' dari anggaran', kanan: '' }),
    kartuKpi({ lbl: 'Sisa Anggaran', ikon: 'bi-piggy-bank', warna: 'var(--st-wait-tx)', bar: 'var(--st-wait-bd)', nilai: tA - tR, pct: persen(tA - tR, tA), kiri: fmtPersen(persen(tA - tR, tA)) + ' belum terealisasi', kanan: '' })
  ].map(k => '<div class="col-12 col-md-4">' + k + '</div>').join('');
  el('app-container').innerHTML = '<div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h2 style="font-size:22px;font-weight:700">Prognosis Anggaran</h2>' +
    '<div class="muted">Anggaran, realisasi, sisa, dan bukti dukung per jenis kegiatan • TA ' + State.tahun + (bolehIsiPrognosis() ? '' : ' • Akses lihat saja') + '</div></div></div>' +
    '<div class="row g-3 mb-3">' + kpi + '</div>' +
    '<div class="toolbar"><div class="grow"><i class="bi bi-search"></i><label class="sr-only" for="fCariProg">Cari</label><input id="fCariProg" class="inp" placeholder="Cari subkegiatan atau jenis kegiatan..." value="' + esc(cariProg) + '" oninput="cariProg=this.value;gambarProgTabel()"></div></div>' +
    '<div id="progTabel"></div>';
  gambarProgTabel();
}

function gambarProgTabel() {
  const ix = State.idx, q = cariProg.trim().toLowerCase(), c = el('progTabel');
  if (!c) return;
  const subs = State.data.subkegiatan.filter(s => (ix.jenisPerSub[s.ID] || []).length).sort((a, b) => (a.KodeSubkegiatan < b.KodeSubkegiatan ? -1 : 1));
  let baris = '';
  subs.forEach(s => {
    const semua = ix.jenisPerSub[s.ID];
    const tampil = semua.filter(j => !q || (s.KodeSubkegiatan + ' ' + s.NamaSubkegiatan + ' ' + j.NamaJenis).toLowerCase().indexOf(q) >= 0);
    if (!tampil.length) return;
    const a = semua.reduce((t, j) => t + anggaranJenis(j.ID), 0), r = semua.reduce((t, j) => t + realisasiJenis(j.ID), 0);
    baris += '<tr class="row-sub"><td><span class="mono" style="color:var(--c-sub)">' + esc(s.KodeSubkegiatan) + '</span> ' + esc(s.NamaSubkegiatan) + '</td><td class="num">' + rp(a) + '</td><td class="num">' + rp(r) + '</td><td class="num">' + rp(a - r) + '</td><td colspan="3"></td></tr>';
    tampil.forEach(j => {
      const ang = anggaranJenis(j.ID), rea = realisasiJenis(j.ID), p = persen(rea, ang), nb = jumlahBuktiJenis(j.ID);
      baris += '<tr><td style="padding-left:32px"><i class="bi bi-folder2-open faint"></i> ' + esc(j.NamaJenis) + '</td><td class="num">' + rp(ang) + '</td><td class="num">' + rp(rea) + '</td>' +
        '<td class="num" style="font-weight:700;color:' + (ang - rea < 0 ? 'var(--danger)' : 'var(--tx)') + '">' + rp(ang - rea) + '</td>' +
        '<td style="min-width:110px"><div class="mono" style="font-size:12px">' + fmtPersen(p) + '</div><div class="bar" style="margin-top:4px" role="progressbar" aria-valuenow="' + Math.round(p) + '" aria-valuemin="0" aria-valuemax="100" aria-label="Realisasi ' + esc(j.NamaJenis) + '"><span style="width:' + Math.min(100, p) + '%;background:var(--primary)"></span></div></td>' +
        '<td class="num"><i class="bi bi-paperclip"></i> ' + nb + '</td>' +
        '<td class="text-end"><button class="btn-x ' + (bolehIsiPrognosis() ? 'btn-primary-x' : 'btn-secondary-x') + ' btn-sm-x" onclick="bukaPrognosis(\'' + j.ID + '\')">' + (bolehIsiPrognosis() ? 'Kelola' : 'Lihat') + '</button></td></tr>';
    });
  });
  c.innerHTML = baris
    ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Subkegiatan / Jenis Kegiatan</th><th class="num">Jumlah Anggaran</th><th class="num">Realisasi</th><th class="num">Sisa Anggaran</th><th>Realisasi %</th><th class="num">Bukti</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>'
    : '<div class="card-x kosong"><i class="bi bi-graph-up-arrow"></i><div>' + (q ? 'Tidak ada data yang cocok.' : 'Belum ada jenis kegiatan pada TA ' + State.tahun + '.') + '</div>' +
      (q ? '' : '<div class="faint mt-1" style="font-size:12px">Tambahkan jenis kegiatan dan rincian belanja lewat Daftar Program &amp; Subkegiatan → Detail subkegiatan.</div>') + '</div>';
}

function bukaPrognosis(idJenis) {
  const px = State.prognosis.px, j = (State.data.jenis || []).find(x => x.ID === idJenis);
  if (!j) { toast('Info', 'Jenis kegiatan tidak ditemukan. Muat ulang halaman.', 'warning'); return; }
  const sub = cariItem('subkegiatan', j.IDSubkegiatan);
  const ang = anggaranJenis(idJenis), rea = realisasiJenis(idJenis), p = persen(rea, ang), boleh = bolehIsiPrognosis();
  const reals = (px.realPerJenis[idJenis] || []).slice().sort((a, b) => (a.Tanggal < b.Tanggal ? 1 : -1));
  let body = '<div class="mono faint mb-1" style="font-size:12px">' + esc(sub ? sub.KodeSubkegiatan : '') + '</div>' +
    '<h3 style="font-size:18px;line-height:26px;font-weight:700">' + esc(j.NamaJenis) + '</h3><div class="muted">' + esc(sub ? sub.NamaSubkegiatan : '') + '</div>' +
    '<div class="detail-grid"><div><div class="k">Jumlah Anggaran</div><div class="v mono">' + rp(ang) + '</div></div><div><div class="k">Realisasi</div><div class="v mono">' + rp(rea) + '</div></div>' +
    '<div><div class="k">Sisa Anggaran</div><div class="v mono">' + rp(ang - rea) + '</div></div><div><div class="k">Realisasi %</div><div class="v mono">' + fmtPersen(p) + '</div></div></div>' +
    '<div class="bar" style="margin:0 0 4px" role="progressbar" aria-valuenow="' + Math.round(p) + '" aria-valuemin="0" aria-valuemax="100" aria-label="Persentase realisasi"><span style="width:' + Math.min(100, p) + '%;background:var(--primary)"></span></div>' +
    '<div class="sec-title"><span><i class="bi bi-cash-coin"></i> Realisasi &amp; Bukti Dukung</span>' + (bolehTambahReal() ? '<button class="btn-x btn-primary-x btn-sm-x" onclick="bukaFormRealisasi(\'' + idJenis + '\')"><i class="bi bi-plus-lg"></i> Realisasi</button>' : '') + '</div>';
  body += reals.length ? reals.map(r => {
    const bs = px.buktiPerReal[r.ID] || [], own = bolehUbahReal(r);
    return '<div class="kin-box"><div class="d-flex justify-content-between align-items-start gap-2 flex-wrap"><div><div class="mono" style="font-weight:700;font-size:15px">' + rp(r.Jumlah) + '</div>' +
      '<div class="faint" style="font-size:12px">' + esc(tgl(r.Tanggal)) + ' • ' + esc(namaUser(r.DibuatOleh)) + '</div>' + (r.Keterangan ? '<div class="mt-1">' + esc(r.Keterangan) + '</div>' : '') + '</div>' +
      '<div class="d-flex gap-1">' + (own ? '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" onclick="bukaFormRealisasi(\'' + idJenis + '\',\'' + r.ID + '\')" aria-label="Ubah realisasi"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn-x btn-ghost-x btn-icon btn-sm-x" style="color:var(--danger)" onclick="hapusReal(\'' + idJenis + '\',\'' + r.ID + '\')" aria-label="Hapus realisasi"><i class="bi bi-trash"></i></button>' : '') + '</div></div>' +
      '<div class="mt-2">' + (bs.length ? bs.map(b => '<span class="chip-file"><i class="bi ' + (b.Mime === 'application/pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-image') + '"></i>' +
        '<button type="button" class="lk" onclick="lihatBukti(\'' + idJenis + '\',\'' + b.ID + '\')" title="' + esc(b.NamaBerkas) + '">' + esc(b.NamaBerkas.length > 28 ? b.NamaBerkas.slice(0, 25) + '...' : b.NamaBerkas) + '</button><span class="faint">' + fmtUkuran(b.Ukuran) + '</span>' +
        (own ? '<button type="button" class="x" onclick="hapusBuktiUI(\'' + idJenis + '\',\'' + b.ID + '\')" aria-label="Hapus berkas ' + esc(b.NamaBerkas) + '"><i class="bi bi-x-lg"></i></button>' : '') + '</span>').join('') : '<span class="faint" style="font-size:12px">Belum ada bukti dukung.</span>') +
      (own && bs.length < 5 ? '<input type="file" id="up_' + r.ID + '" class="sr-only" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onchange="unggahBuktiDipilih(\'' + idJenis + '\',\'' + r.ID + '\',this)">' +
        '<button type="button" class="btn-x btn-secondary-x btn-sm-x mt-1" onclick="el(\'up_' + r.ID + '\').click()"><i class="bi bi-upload"></i> Unggah bukti</button>' : '') + '</div></div>';
  }).join('') : '<div class="muted">Belum ada realisasi.' + (bolehTambahReal() ? ' Klik <b>+ Realisasi</b> untuk menambahkan.' : '') + '</div>';
  tampilModal('Prognosis Anggaran', body, '<button class="btn-x btn-ghost-x" data-bs-dismiss="modal">Tutup</button>');
}

function bukaFormRealisasi(idJenis, id) {
  const px = State.prognosis.px, lama = id ? (px.realPerJenis[idJenis] || []).find(r => r.ID === id) : null;
  const sisa = anggaranJenis(idJenis) - realisasiJenis(idJenis) + (lama ? lama.Jumlah : 0);
  const h = new Date(), iso = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0');
  const body = fld('Tanggal realisasi', 'fTglReal', '<input id="fTglReal" type="date" class="inp" value="' + esc(lama ? lama.Tanggal : iso) + '">', { req: true }) +
    fld('Jumlah realisasi (Rp)', 'fJmlReal', '<input id="fJmlReal" class="inp mono" inputmode="numeric" autocomplete="off" oninput="formatPagu(this)" value="' + (lama ? angka(lama.Jumlah) : '') + '" placeholder="0">', { req: true, hint: 'Sisa anggaran yang dapat direalisasikan: <b>' + rp(sisa) + '</b>' }) +
    fld('Keterangan', 'fKetReal', '<textarea id="fKetReal" class="txa" maxlength="300" style="min-height:72px" placeholder="mis. Pembayaran konsumsi rapat koordinasi">' + esc(lama ? lama.Keterangan : '') + '</textarea>') +
    fld('Bukti dukung (opsional)', 'fBukti', '<input id="fBukti" type="file" class="inp" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png">', { hint: 'PDF, JPG, atau PNG. Maks. 5 MB per berkas dan 5 berkas per realisasi.' });
  tampilModal(lama ? 'Ubah Realisasi' : 'Tambah Realisasi', body,
    '<button class="btn-x btn-ghost-x" onclick="bukaPrognosis(\'' + idJenis + '\')">Kembali</button><button class="btn-x btn-primary-x" onclick="simpanRealisasiForm(\'' + idJenis + '\',' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
}

function bacaBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Gagal membaca berkas.'));
    fr.readAsDataURL(file);
  });
}
/** Unggah beberapa berkas satu per satu. Mengembalikan jumlah yang berhasil. */
async function unggahBerkas(idReal, files, btn) {
  let sukses = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i], ext = (f.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'jpg', 'jpeg', 'png'].indexOf(ext) < 0) { toast('Gagal', f.name + ': format harus PDF, JPG, atau PNG.', 'danger'); continue; }
    if (f.size > 5 * 1024 * 1024) { toast('Gagal', f.name + ': ukuran melebihi 5 MB.', 'danger'); continue; }
    if (btn) btn.innerHTML = '<span class="spinner spinner-sm"></span> Mengunggah ' + (i + 1) + '/' + files.length;
    else toast('Info', 'Mengunggah ' + f.name + '...', 'info');
    let b64;
    try { b64 = await bacaBase64(f); } catch (e) { toast('Gagal', f.name + ': ' + e.message, 'danger'); continue; }
    if (await kirim(null, 'unggahBukti', { IDRealisasi: idReal, Nama: f.name, Base64: b64 })) sukses++;
  }
  return sukses;
}
async function simpanRealisasiForm(idJenis, id, btn) {
  bersihErr(['fTglReal', 'fJmlReal', 'fBukti']);
  let ok = true;
  const tgl = nilai('fTglReal'), jml = Number(nilai('fJmlReal').replace(/\D/g, '')) || 0, files = Array.from(el('fBukti').files || []);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) { setErr('fTglReal', 'Pilih tanggal realisasi.'); ok = false; }
  if (!(jml > 0)) { setErr('fJmlReal', 'Jumlah realisasi harus lebih dari 0.'); ok = false; }
  if (files.length > 5) { setErr('fBukti', 'Maksimal 5 berkas.'); ok = false; }
  if (!ok) return;
  const rec = { IDJenisKegiatan: idJenis, Tanggal: tgl, Jumlah: jml, Keterangan: nilai('fKetReal') }; if (id) rec.ID = id;
  const res = await kirim(btn, 'simpanRealisasi', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  if (files.length) { btn.disabled = true; await unggahBerkas(res.data.ID, files, btn); }
  await segarkanPrognosis(); bukaPrognosis(idJenis);
}
async function unggahBuktiDipilih(idJenis, idReal, input) {
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  const n = await unggahBerkas(idReal, files, null);
  if (n) toast('Berhasil', n + ' berkas bukti dukung terunggah.', 'success');
  await segarkanPrognosis(); bukaPrognosis(idJenis);
}
async function hapusReal(idJenis, id) {
  const ya = await konfirmasi('Hapus realisasi?', 'Realisasi beserta seluruh berkas bukti dukungnya akan dihapus.', { label: 'Hapus', kembali: () => bukaPrognosis(idJenis) });
  if (!ya) return;
  const res = await kirim(null, 'hapusRealisasi', id);
  if (res) toast('Berhasil', res.message, 'success');
  await segarkanPrognosis(); bukaPrognosis(idJenis);
}
async function hapusBuktiUI(idJenis, id) {
  const ya = await konfirmasi('Hapus berkas?', 'Berkas bukti dukung ini akan dihapus.', { label: 'Hapus', kembali: () => bukaPrognosis(idJenis) });
  if (!ya) return;
  const res = await kirim(null, 'hapusBukti', id);
  if (res) toast('Berhasil', res.message, 'success');
  await segarkanPrognosis(); bukaPrognosis(idJenis);
}

function unduhBase64(nama, mime, base64) {
  const bin = atob(base64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Gambar tampil di pratinjau; PDF langsung diunduh. */
async function lihatBukti(idJenis, idBukti) {
  const res = await kirim(null, 'unduhBukti', idBukti);
  if (!res) return;
  const f = res.data;
  if (f.mime !== 'image/jpeg' && f.mime !== 'image/png') { unduhBase64(f.nama, f.mime, f.base64); toast('Unduhan', f.nama + ' diunduh.', 'info'); return; }
  await tutupModalUtama();
  el('pvTitle').textContent = f.nama;
  el('pvFrame').srcdoc = '<body style="margin:0;background:#0b1120;display:flex;justify-content:center"><img alt="Bukti dukung" style="max-width:100%;height:auto" src="data:' + f.mime + ';base64,' + f.base64 + '"></body>';
  el('pvUnduh').onclick = () => unduhBase64(f.nama, f.mime, f.base64);
  el('modalPreview').addEventListener('hidden.bs.modal', () => bukaPrognosis(idJenis), { once: true });
  bootstrap.Modal.getOrCreateInstance(el('modalPreview')).show();
}

// ════════════════════════════════════════════════════════
// BAGIAN 8: APPROVAL & CATATAN PERBAIKAN
// ════════════════════════════════════════════════════════

function renderApproval() {
  const d = State.data;
  const daftar = [];
  d.program.forEach(x => daftar.push({ jenis: 'program', it: x }));
  d.kegiatan.forEach(x => daftar.push({ jenis: 'kegiatan', it: x }));
  d.subkegiatan.forEach(x => daftar.push({ jenis: 'subkegiatan', it: x }));
  const menunggu = daftar.filter(x => x.it.Status === 'Menunggu Verifikasi').sort((a, b) => a.it.DiubahPada < b.it.DiubahPada ? 1 : -1);
  const baris = menunggu.map(x => {
    const cfg = KFG[x.jenis];
    return '<tr><td><span class="badge-st st-draf">' + cfg.label + '</span></td><td class="mono" style="font-weight:600">' + esc(x.it[cfg.kode]) + '</td><td>' + esc(x.it[cfg.nama]) + '</td>' +
      '<td class="num">' + (x.jenis === 'subkegiatan' ? rp(x.it.NilaiPagu) : '—') + '</td><td>' + esc(namaUser(x.it.DibuatOleh)) + '<div class="faint" style="font-size:11px">' + tgl(x.it.DiubahPada) + '</div></td>' +
      '<td><div class="d-flex gap-1 justify-content-end"><button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaDetail(\'' + x.jenis + '\',\'' + x.it.ID + '\')">Detail</button>' +
      '<button class="btn-x btn-warn-x btn-sm-x" onclick="bukaFormCatatan(\'' + x.jenis + '\',\'' + x.it.ID + '\')">Catatan</button>' +
      '<button class="btn-x btn-primary-x btn-sm-x" onclick="setujui(\'' + x.jenis + '\',\'' + x.it.ID + '\')">Setujui</button></div></td></tr>';
  }).join('');
  el('app-container').innerHTML = '<h2 style="font-size:22px;font-weight:700" class="mb-1">Approval &amp; Verifikasi</h2><div class="muted mb-3">Usulan yang menunggu persetujuan Anda • TA ' + d.tahun + '</div>' +
    (menunggu.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Jenis</th><th>Kode</th><th>Nomenklatur</th><th class="num">Pagu</th><th>Pengusul</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>'
      : '<div class="card-x kosong"><i class="bi bi-check2-all"></i>Tidak ada usulan yang menunggu verifikasi.</div>');
}

function renderCatatan() {
  const d = State.data, f = State.filterCatatan;
  const daftar = d.catatan.filter(c => (f === 'Semua' || c.Status === f) && State.idx.byId[c.IDData]).sort((a, b) => a.Tanggal < b.Tanggal ? 1 : -1);
  const kartu = daftar.map(c => {
    const e = State.idx.byId[c.IDData], cfg = KFG[e.jenis];
    return '<div class="catatan ' + (c.Status === 'Selesai' ? 'selesai' : '') + '"><div class="meta"><span class="badge-st st-draf">' + cfg.label + '</span><span class="mono" style="font-weight:600">' + esc(e.item[cfg.kode]) + '</span><span class="badge-st ' + (c.Status === 'Selesai' ? 'st-ok' : 'st-rev') + '">' + esc(c.Status) + '</span><span class="faint">' + esc(c.Pembuat) + ' • ' + tgl(c.Tanggal) + '</span></div>' +
      '<div class="muted mb-1" style="font-size:12px">' + esc(e.item[cfg.nama]) + '</div><div class="isi">' + esc(c.IsiCatatan) + '</div>' +
      '<div class="d-flex gap-2 mt-2"><button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaDetail(\'' + e.jenis + '\',\'' + c.IDData + '\')"><i class="bi bi-box-arrow-up-right"></i> Buka data</button>' +
      (adalahKabag() ? '<button class="btn-x btn-ghost-x btn-sm-x" onclick="alihStatusCatatan(\'' + c.ID + '\',\'' + (c.Status === 'Terbuka' ? 'Selesai' : 'Terbuka') + '\',\'' + e.jenis + '\',\'' + c.IDData + '\')">' + (c.Status === 'Terbuka' ? 'Tandai selesai' : 'Buka kembali') + '</button>' : '') + '</div></div>';
  }).join('');
  el('app-container').innerHTML = '<div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h2 style="font-size:22px;font-weight:700">Catatan Perbaikan</h2><div class="muted">Catatan dari Kepala Bagian • TA ' + d.tahun + '</div></div>' +
    '<div style="min-width:180px"><label class="sr-only" for="fFilterCat">Filter status catatan</label><select id="fFilterCat" class="sel" onchange="State.filterCatatan=this.value;renderCatatan()">' +
    ['Terbuka', 'Selesai', 'Semua'].map(s => '<option' + (f === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div></div>' +
    (daftar.length ? kartu : '<div class="card-x kosong"><i class="bi bi-chat-left"></i>Tidak ada catatan perbaikan ' + (f === 'Semua' ? '' : f.toLowerCase()) + '.</div>');
}

// ════════════════════════════════════════════════════════
// BAGIAN 9: LAPORAN & CETAK PDF
// ════════════════════════════════════════════════════════

function renderLaporan() {
  const d = State.dash, data = State.data;
  const opsiProg = '<option value="">Semua Program</option>' + data.program.slice().sort((a, b) => a.KodeProgram < b.KodeProgram ? -1 : 1).map(p => '<option value="' + p.ID + '">' + esc(p.KodeProgram + ' — ' + p.NamaProgram) + '</option>').join('');
  const opsiSt = '<option value="">Semua Status</option>' + STATUS_LIST.map(s => '<option>' + s + '</option>').join('');
  const totalSetuju = d.perProgram.reduce((a, p) => a + p.disetujui, 0);
  const baris = d.perProgram.map(p => '<tr><td class="mono" style="font-weight:600;color:var(--c-program)">' + esc(p.kode) + '</td><td>' + esc(p.nama) + '</td><td class="num">' + p.jumlahKegiatan + '</td><td class="num">' + p.jumlahSub + '</td><td class="num">' + rp(p.pagu) + '</td><td class="num">' + rp(p.disetujui) + '</td><td class="num">' + (p.pagu ? Math.round(p.disetujui / p.pagu * 100) : 0) + '%</td></tr>').join('');
  el('app-container').innerHTML = '<h2 style="font-size:22px;font-weight:700" class="mb-1">Rekap &amp; Cetak PDF</h2><div class="muted mb-3">Laporan perencanaan TA ' + d.tahun + '</div>' +
    '<section class="card-x mb-3"><div class="card-title"><i class="bi bi-file-earmark-pdf" style="color:var(--st-rev-tx)"></i>Cetak Rekap Kodefikasi &amp; Perencanaan</div><div class="card-sub">PDF memuat hierarki program, kegiatan, subkegiatan, kode rekening, pagu, kinerja, dan indikator.</div>' +
    '<div class="row g-3 align-items-end"><div class="col-12 col-md-5"><label class="lbl" for="rProg">Program</label><select id="rProg" class="sel">' + opsiProg + '</select></div>' +
    '<div class="col-12 col-md-4"><label class="lbl" for="rStatus">Status</label><select id="rStatus" class="sel">' + opsiSt + '</select></div>' +
    '<div class="col-12 col-md-3"><button class="btn-x btn-primary-x w-100" onclick="pratinjauPdf(this)"><i class="bi bi-file-earmark-pdf"></i> Pratinjau &amp; Unduh</button></div></div></section>' +
    '<div class="row g-3"><div class="col-12 col-xl-6"><section class="card-x h-100"><div class="card-title"><i class="bi bi-bar-chart-line" style="color:var(--tertiary)"></i>Pagu per Program</div><div class="card-sub">Total pagu dan pagu disetujui</div>' +
      (d.perProgram.length ? '<div class="chart-box"><canvas id="chartLaporan" role="img" aria-label="Grafik batang pagu per program"></canvas></div>' : '<div class="kosong"><i class="bi bi-bar-chart"></i>Belum ada data.</div>') + '</section></div>' +
    '<div class="col-12 col-xl-6"><section class="card-x h-100"><div class="card-title"><i class="bi bi-table" style="color:var(--c-sub)"></i>Ringkasan per Program</div><div class="card-sub">Tabel yang sama dengan grafik</div>' +
      (d.perProgram.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Program</th><th class="num">Keg.</th><th class="num">Sub.</th><th class="num">Pagu</th><th class="num">Disetujui</th><th class="num">%</th></tr></thead><tbody>' + baris +
      '</tbody><tfoot><tr><td colspan="4" style="font-weight:700;padding:12px 16px">Total</td><td class="num" style="font-weight:700;padding:12px 16px">' + rp(d.total) + '</td><td class="num" style="font-weight:700;padding:12px 16px">' + rp(totalSetuju) + '</td><td></td></tr></tfoot></table></div>' : '<div class="kosong"><i class="bi bi-table"></i>Belum ada data.</div>') + '</section></div></div>';
  gambarGrafik('chartLaporan', d.perProgram);
}

async function pratinjauPdf(btn) {
  const res = await kirim(btn, 'buatRekapPdf', { tahun: State.tahun, idProgram: nilai('rProg'), status: nilai('rStatus') });
  if (!res) return;
  State.pdf = res.data;
  el('pvTitle').textContent = res.data.nama;
  el('pvFrame').srcdoc = res.data.html;
  el('pvUnduh').onclick = unduhPdf;
  bootstrap.Modal.getOrCreateInstance(el('modalPreview')).show();
}
function unduhPdf() {
  const p = State.pdf; if (!p) return;
  const bin = atob(p.base64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = p.nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Unduhan', 'PDF juga tersimpan otomatis di folder Rekap_PDF pada Google Drive.', 'info');
}

// ════════════════════════════════════════════════════════
// BAGIAN 10: KELOLA PENGGUNA & PENGATURAN (KHUSUS ADMIN)
// ════════════════════════════════════════════════════════

function renderPengguna() {
  const baris = State.pengguna.map(u => '<tr><td class="mono" style="font-weight:600">' + esc(u.Username) + '</td><td>' + esc(u.Nama) + '</td><td>' + esc(PERAN_LABEL[u.Peran] || u.Peran) + '</td><td>' + esc(u.Email) + '</td>' +
    '<td><span class="badge-st ' + (u.Aktif === 'Ya' ? 'st-ok' : 'st-draf') + '"><span class="dot"></span>' + (u.Aktif === 'Ya' ? 'Aktif' : 'Nonaktif') + '</span></td>' +
    '<td class="text-end"><button class="btn-x btn-secondary-x btn-sm-x" onclick="bukaFormPengguna(\'' + u.ID + '\')"><i class="bi bi-pencil"></i> Ubah</button></td></tr>').join('');
  el('app-container').innerHTML = '<div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h2 style="font-size:22px;font-weight:700">Kelola Pengguna</h2><div class="muted">' + State.pengguna.length + ' akun terdaftar. Bagikan username dan password kepada pengguna secara langsung.</div></div>' +
    '<button class="btn-x btn-primary-x" onclick="bukaFormPengguna()"><i class="bi bi-person-plus"></i> Tambah Pengguna</button></div>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>' + baris + '</tbody></table></div>';
}

function bukaFormPengguna(id) {
  const lama = id ? State.pengguna.find(u => u.ID === id) : null;
  const sel = (v, arr) => arr.map(a => '<option value="' + a[0] + '"' + (v === a[0] ? ' selected' : '') + '>' + a[1] + '</option>').join('');
  const body = '<form onsubmit="return false" novalidate><div class="row g-3"><div class="col-12 col-md-6">' +
    fld('Username', 'uUser', '<input id="uUser" class="inp mono" maxlength="30" autocomplete="off" autocapitalize="none" value="' + esc(lama ? lama.Username : '') + '"' + (lama ? ' disabled' : '') + '>', { req: true, hint: 'Huruf kecil, angka, titik, strip, garis bawah.' }) + '</div>' +
    '<div class="col-12 col-md-6">' + fld('Nama lengkap', 'uNama', '<input id="uNama" class="inp" maxlength="80" value="' + esc(lama ? lama.Nama : '') + '">', { req: true }) + '</div>' +
    '<div class="col-12 col-md-6">' + fld('Peran', 'uPeran', '<select id="uPeran" class="sel">' + sel(lama ? lama.Peran : 'staf', [['kabag', 'Kepala Bagian (Admin)'], ['kasubag', 'Kepala Sub Bagian'], ['staf', 'Staf (lihat saja)']]) + '</select>', { req: true }) + '</div>' +
    '<div class="col-12 col-md-6">' + fld('Status akun', 'uAktif', '<select id="uAktif" class="sel">' + sel(lama ? lama.Aktif : 'Ya', [['Ya', 'Aktif'], ['Tidak', 'Nonaktif']]) + '</select>') + '</div></div>' +
    fld('Email', 'uEmail', '<input id="uEmail" class="inp" type="email" maxlength="120" value="' + esc(lama ? lama.Email : '') + '">', { req: true, hint: 'Dipakai untuk notifikasi otomatis.' }) +
    fld(lama ? 'Password baru' : 'Password', 'uPass', '<div class="d-flex gap-2"><input id="uPass" class="inp mono" maxlength="64" autocomplete="new-password" placeholder="' + (lama ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter') + '"><button type="button" class="btn-x btn-secondary-x" onclick="el(\'uPass\').value=sandiAcak(12)"><i class="bi bi-magic"></i> Acak</button></div>',
      { req: !lama, hint: 'Catat password sebelum menyimpan, lalu bagikan ke pengguna. Password tidak dapat dilihat kembali.' }) + '</form>';
  tampilModal(lama ? 'Ubah Pengguna' : 'Tambah Pengguna', body, '<button class="btn-x btn-ghost-x" data-bs-dismiss="modal">Batal</button><button class="btn-x btn-primary-x" onclick="simpanPengguna(' + (id ? '\'' + id + '\'' : 'null') + ',this)"><i class="bi bi-check-lg"></i> Simpan</button>');
}
async function simpanPengguna(id, btn) {
  bersihErr(['uUser', 'uNama', 'uEmail', 'uPass']);
  const rec = { Username: nilai('uUser').toLowerCase(), Nama: nilai('uNama'), Peran: nilai('uPeran'), Aktif: nilai('uAktif'), Email: nilai('uEmail'), Password: el('uPass').value };
  if (id) rec.ID = id;
  let ok = true;
  if (!/^[a-z0-9._-]{3,30}$/.test(rec.Username)) { setErr('uUser', 'Username 3–30 karakter: huruf kecil, angka, . _ -'); ok = false; }
  if (rec.Nama.length < 3) { setErr('uNama', 'Nama minimal 3 karakter.'); ok = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.Email)) { setErr('uEmail', 'Format email tidak valid.'); ok = false; }
  if ((!id && rec.Password.length < 8) || (id && rec.Password && rec.Password.length < 8)) { setErr('uPass', 'Password minimal 8 karakter.'); ok = false; }
  if (!ok) return;
  const res = await kirim(btn, 'simpanPengguna', rec);
  if (!res) return;
  toast('Berhasil', res.message, 'success');
  await tutupModalUtama();
  navigateTo('pengguna', true);
}

function renderPengaturan() {
  const c = State.pengaturan.config, log = State.pengaturan.log;
  const baris = log.map(l => '<tr><td class="mono" style="white-space:nowrap">' + esc(tgl(l.Waktu)) + '</td><td>' + esc(l.Pengguna) + '</td><td>' + esc(l.Aksi) + '</td><td class="muted">' + esc(l.DataTerkait) + '</td></tr>').join('');
  el('app-container').innerHTML = '<h2 style="font-size:22px;font-weight:700" class="mb-3">Pengaturan &amp; Log</h2>' +
    '<div class="row g-3"><div class="col-12 col-xl-5"><section class="card-x"><div class="card-title"><i class="bi bi-gear" style="color:var(--tertiary)"></i>Identitas Aplikasi</div><div class="card-sub">Tampil di halaman login, sidebar, dan PDF.</div>' +
    '<form onsubmit="return false" novalidate>' + fld('Nama aplikasi', 'cNama', '<input id="cNama" class="inp" maxlength="80" value="' + esc(c.appName) + '">', { req: true }) +
    fld('Nama instansi / unit', 'cInstansi', '<input id="cInstansi" class="inp" maxlength="120" value="' + esc(c.instansi) + '">') +
    fld('URL logo (opsional)', 'cLogo', '<input id="cLogo" class="inp" maxlength="500" placeholder="https://..." value="' + esc(c.logoUrl) + '">', { hint: 'Harus diawali https://' }) +
    fld('URL aplikasi (alamat GitHub Pages)', 'cUrlApp', '<input id=\"cUrlApp\" class=\"inp\" maxlength=\"300\" placeholder=\"https://namaanda.github.io/nama-repo/\" value=\"' + esc(c.urlAplikasi || '') + '\">', { hint: 'Dipakai sebagai tautan &quot;Buka aplikasi&quot; pada email notifikasi.' }) +
    fld('Tahun anggaran aktif', 'cTahun', '<input id="cTahun" class="inp mono" inputmode="numeric" maxlength="4" value="' + esc(c.tahunAktif) + '">', { req: true, hint: 'Tahun yang dibuka pertama kali saat pengguna masuk.' }) +
    '<button class="btn-x btn-primary-x" onclick="simpanPengaturan(this)"><i class="bi bi-check-lg"></i> Simpan Pengaturan</button></form></section></div>' +
    '<div class="col-12 col-xl-7"><section class="card-x"><div class="d-flex justify-content-between align-items-start"><div><div class="card-title"><i class="bi bi-journal-text" style="color:var(--c-kegiatan)"></i>Log Aktivitas</div><div class="card-sub">150 aktivitas terakhir</div></div>' +
    '<button class="btn-x btn-ghost-x btn-sm-x" onclick="navigateTo(\'pengaturan\', true)"><i class="bi bi-arrow-clockwise"></i> Muat ulang</button></div>' +
    '<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="tbl"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Data</th></tr></thead><tbody>' + (baris || '<tr><td colspan="4" class="muted">Belum ada aktivitas.</td></tr>') + '</tbody></table></div></section></div></div>';
}
async function simpanPengaturan(btn) {
  bersihErr(['cNama', 'cLogo', 'cUrlApp', 'cTahun']);
  const rec = { appName: nilai('cNama'), instansi: nilai('cInstansi'), logoUrl: nilai('cLogo'), urlAplikasi: nilai('cUrlApp'), tahunAktif: Number(nilai('cTahun')) };
  let ok = true;
  if (rec.appName.length < 3) { setErr('cNama', 'Nama aplikasi minimal 3 karakter.'); ok = false; }
  if (rec.logoUrl && !/^https:\/\/\S+$/.test(rec.logoUrl)) { setErr('cLogo', 'URL harus diawali https:// tanpa spasi.'); ok = false; }
  if (rec.urlAplikasi && !/^https:\/\/\S+$/.test(rec.urlAplikasi)) { setErr('cUrlApp', 'URL harus diawali https:// tanpa spasi.'); ok = false; }
  if (!(rec.tahunAktif >= 2000 && rec.tahunAktif <= 2100)) { setErr('cTahun', 'Masukkan tahun 2000–2100.'); ok = false; }
  if (!ok) return;
  const res = await kirim(btn, 'simpanKonfigurasi', rec);
  if (!res) return;
  State.config = Object.assign(State.config, res.data);
  terapkanBranding();
  toast('Berhasil', res.message, 'success');
}
