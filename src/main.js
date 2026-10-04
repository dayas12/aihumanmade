import './style.css';
import { createIcons, AudioLines, SlidersHorizontal, Headphones, Upload, Plus, Play, Pause, SkipBack, Download, ShieldCheck, ChevronDown, X, Check, Save, RotateCcw, Trash2, Music2, Volume2, Info, FileAudio, LoaderCircle, Settings2, ArrowUpRight, FolderOpen } from 'lucide';
import { defaults, presets, analyze } from './dsp.js';
import { render, task, arrays, demoAudio } from './audio.js';
import { parsePreset, serializePreset } from './preset-file.js';

const $ = selector => document.querySelector(selector);
const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
const icons = () => createIcons({ icons: { AudioLines, SlidersHorizontal, Headphones, Upload, Plus, Play, Pause, SkipBack, Download, ShieldCheck, ChevronDown, X, Check, Save, RotateCcw, Trash2, Music2, Volume2, Info, FileAudio, LoaderCircle, Settings2, ArrowUpRight, FolderOpen }, attrs: { 'stroke-width': 1.65 } });
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const db = value => Number.isFinite(value) ? value.toFixed(1) : '−∞';
const controls = [
  ['pitch', 'Pitch micro-shift', 'Geser nada tanpa mengubah tempo.', -50, 50, 1, 'cents'],
  ['tempo', 'Tempo adjustment', 'Atur kecepatan, pertahankan nada.', 98, 102, 0.1, '%'],
  ['deharsh', 'Multiband de-squeak', 'Lembutkan 3.15, 4.4 & 6.25 kHz.', 0, 100, 1, '%'],
  ['room', 'Studio room · IR convolution', 'Campurkan pantulan ruang pendek.', 0, 25, 0.5, '%'],
  ['punch', 'Transient punch', 'Tegaskan serangan drum & instrumen.', 0, 100, 1, '%'],
  ['allpass', '12-stage all-pass', 'Rotasi fase, bukan jaminan penghapusan watermark.', 0, 100, 1, '%'],
  ['flutter', 'Tape micro-flutter', 'Modulasi waktu halus, opsional.', 0, 100, 1, '%'],
  ['warmth', 'Tape warmth', 'Saturasi lembut untuk warna harmonik.', 0, 100, 1, '%'],
];
let params = { ...defaults }, tracks = [], selected = null, mode = 'original', ir = null, irName = '', irVersion = 0;
let busy = false, importing = false, controller = null, context, source, gain, playing = false, position = 0, startedAt = 0, downloadBusy = false;
let customs = {};
try { const raw = JSON.parse(localStorage.getItem('aihumn.presets.v1') || '{}'); for (const [key, p] of Object.entries(raw)) if (p && typeof p.name === 'string' && p.values) customs[key] = p; } catch { /* Storage is optional. */ }
const selectedTrack = () => tracks.find(t => t.id === selected);
const fingerprint = () => JSON.stringify([params, irVersion]);
const fresh = track => track?.result && track.signature === fingerprint();
const activeBuffer = () => { const t = selectedTrack(); return mode === 'master' && fresh(t) ? t.result.buffer : t?.buffer; };
const formatting = (key, value, unit) => `${key === 'pitch' && value > 0 ? '+' : ''}${['room', 'tempo'].includes(key) ? value.toFixed(1) : value} ${unit}`;

$('#app').innerHTML = `
<header class="app-header">
  <a class="brand" href="/" aria-label="AIHUMN Studio">${icon('audio-lines')}<span>AIHUMN<span class="brand-dot">.</span></span><span class="brand-tag">STUDIO</span></a>
  <div class="header-right"><span class="local-badge">${icon('shield-check')} Audio tetap di perangkat Anda</span><button class="icon-button" id="help" aria-label="Panduan studio">${icon('info')}</button></div>
</header>
<div class="app-layout">
  <nav class="rail" aria-label="Studio"><div class="rail-active" title="Mastering studio">${icon('sliders-horizontal')}</div><span class="rail-word">AUDIO FINISHING</span><div class="rail-bottom">01</div></nav>
  <main>
    <div class="workspace-heading"><div><div class="eyebrow">WORKSPACE <span>/</span> MASTERING</div><h1>Beri suara Anda karakter.</h1><p>Sentuhan halus. Detail terjaga. Kendali di tangan Anda.</p></div><span class="engine-tag">${icon('headphones')} LOCAL ENGINE</span></div>
    <section class="workspace-card" aria-label="Audio workspace">
      <div class="card-top"><div class="section-title">${icon('audio-lines')} Audio workspace <span id="track-count" class="count">0</span></div><button class="button small" id="add-top">${icon('plus')} Tambah audio</button></div>
      <div class="track-heading"><div><div class="eyebrow" id="active-label">SIAP UNTUK REKAMAN ANDA</div><h2 id="track-title">Mulai dengan sebuah lagu</h2><div class="track-meta" id="track-meta">WAV, MP3, FLAC, OGG, M4A · hingga 60 MB per file</div></div><span class="file-badge" id="file-badge">AUDIO</span></div>
      <div class="wave-area" id="drop-zone"><canvas id="waveform" aria-label="Visualisasi waveform audio"></canvas><div class="drop-content" id="drop-content"><button class="upload-orb" id="upload-orb" aria-label="Pilih file audio">${icon('upload')}</button><strong>Tarik audio ke sini</strong><span>atau <button class="text-button" id="browse">pilih file dari perangkat</button></span><button class="demo-button" id="demo">${icon('play')} Coba audio demo · 12 detik</button></div><div class="wave-label" id="wave-label" hidden>ORIGINAL</div><div class="wave-scale"><span>0 dB</span><span>−∞</span><span>0 dB</span></div></div>
      <div class="timeline-labels"><span id="time-start">00:00</span><span id="time-middle">—</span><span id="time-end">00:00</span></div>
      <input type="range" id="seek" class="seek" min="0" max="1000" value="0" aria-label="Posisi pemutaran" disabled />
      <div class="transport"><div class="playback-controls"><button class="icon-button" id="restart" aria-label="Kembali ke awal" disabled>${icon('skip-back')}</button><button class="play-button" id="play" aria-label="Putar audio" disabled>${icon('play')}</button><span class="play-time"><b id="current-time">00:00</b><span>/</span><span id="duration">00:00</span></span></div><div class="ab-switch" role="group" aria-label="Bandingkan audio"><button class="active" id="original" aria-pressed="true">A <span>Asli</span></button><button id="master" aria-pressed="false" disabled>B <span>Hasil</span></button></div><div class="volume-control">${icon('volume-2')}<input id="volume" type="range" min="0" max="100" value="70" aria-label="Volume pemutaran" /></div></div>
      <div class="meter-strip"><div><span>SAMPLE PEAK</span><strong id="peak">— <small>dBFS</small></strong></div><div><span>RMS LEVEL</span><strong id="rms">— <small>dBFS</small></strong></div><div><span>CREST FACTOR</span><strong id="crest">— <small>dB</small></strong></div><label class="match-label"><input type="checkbox" id="match" checked /> Samakan level A/B <span title="Menyamakan RMS preview dengan menurunkan sisi yang lebih keras. Tidak mengubah ekspor.">${icon('info')}</span></label></div>
    </section>
    <section class="queue-section"><div class="queue-heading"><h2>Antrean audio <span id="queue-count">00</span></h2><span>Sesi lokal · tidak diunggah</span></div><div id="queue" class="queue"><div class="queue-empty">${icon('music-2')}<span>File Anda akan muncul di sini.<small>Tambahkan beberapa lagu untuk proses berurutan.</small></span></div></div></section>
    <section class="export-card"><div class="export-heading">${icon('download')}<div><h2>Siapkan master Anda</h2><p>WAV lossless · sample rate mengikuti hasil decode browser</p></div></div><div class="export-options"><label for="bit-depth">Format ekspor<select id="bit-depth"><option value="24">WAV · 24-bit PCM</option><option value="16">WAV · 16-bit PCM</option></select></label><button id="download" class="button" disabled>${icon('download')} Unduh WAV</button><button id="report" class="icon-button" aria-label="Unduh laporan pemrosesan JSON" title="Unduh laporan pemrosesan" disabled>${icon('file-audio')}</button></div></section>
    <div class="bottom-note">${icon('shield-check')} File sumber tidak ditimpa. Semua perubahan diekspor sebagai file baru.</div>
  </main>
  <aside class="parameters"><div class="parameter-heading"><div><span class="eyebrow">SHAPE YOUR SOUND</span><h2>Karakter & mastering</h2></div>${icon('settings-2')}</div>
    <div class="preset-block"><label for="preset">PRESET</label><div class="preset-row"><select id="preset"></select><button class="icon-button" id="save-preset" title="Simpan preset" aria-label="Simpan preset">${icon('save')}</button><button class="icon-button" id="delete-preset" title="Hapus preset custom" aria-label="Hapus preset custom" hidden>${icon('trash-2')}</button></div><div class="preset-files"><button class="text-button" id="import-preset">${icon('folder-open')} Impor preset</button><button class="text-button" id="export-preset">${icon('download')} Ekspor preset</button></div><div class="preset-caption" id="preset-caption">Mulai ringan. Dengarkan, lalu sesuaikan.</div></div>
    <div class="parameter-scroll"><div class="control-group-title"><span>01</span> TONE & TEXTURE</div>
      ${controls.map(([key, label, detail, min, max, step, unit]) => `${key === 'allpass' ? '<div class="control-group-title output-title"><span>02</span> PHASE & STUDIO WARMTH</div>' : ''}<div class="parameter-control"><div class="control-label"><label for="${key}">${label}</label><output id="${key}-value" for="${key}">${formatting(key, params[key], unit)}</output></div><p>${detail}</p><input id="${key}" data-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}" /><div class="range-ends"><span>${min}${unit === '%' ? '%' : ''}</span><span>${max}${unit === '%' ? '%' : ''}</span></div></div>`).join('')}
      <div class="ir-section"><div><span>Room impulse response</span><small id="ir-label">Ruang sintetis pendek · bawaan</small></div><div class="ir-actions"><button class="text-button" id="load-ir">Pilih IR WAV</button><button class="icon-button" id="clear-ir" aria-label="Hapus impulse response" hidden>${icon('x')}</button></div></div>
      <div class="control-group-title output-title"><span>03</span> OUTPUT GUARD</div>
      <div class="parameter-control"><div class="control-label"><label for="trim">Output gain</label><output id="trim-value">0 dB</output></div><input id="trim" data-param="trim" type="range" min="-6" max="6" step="0.5" value="0" /></div>
      <label class="toggle-row"><span>Proteksi sample peak<small>Reduksi gain transparan, tanpa kompresi.</small></span><input id="protect" type="checkbox" role="switch" checked /></label>
      <div class="ceiling-row"><label for="ceiling">Batas peak</label><select id="ceiling"><option value="-1">−1.0 dBFS</option><option value="-1.5">−1.5 dBFS</option><option value="-2">−2.0 dBFS</option></select></div>
      <p class="honesty-note">Mastering membentuk suara; tidak mengubah asal AI menjadi buatan manusia dan tidak menjamin skor detektor.</p>
    </div>
    <div class="process-area"><div class="progress-status"><span id="process-status" role="status" aria-live="polite">Tambahkan audio untuk mulai</span><button id="reset" class="text-button" title="Reset ke Natural">${icon('rotate-ccw')} Reset</button></div><progress id="progress" max="100" value="0" hidden></progress><button id="process" class="button primary" disabled>${icon('audio-lines')} Proses audio</button><button id="batch" class="text-button batch-button" hidden>Proses seluruh antrean</button><button id="cancel" class="text-button batch-button" hidden>Batalkan proses</button><p>Ekspor baru. Audio asli tetap utuh.</p></div>
  </aside>
</div>
<input id="file-input" type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac" multiple hidden />
<input id="ir-input" type="file" accept=".wav,audio/wav" hidden />
<input id="preset-input" type="file" accept=".json,application/json" hidden />
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<dialog id="help-dialog"><div class="dialog-heading"><h2>Kenali studio Anda</h2><button class="icon-button" data-close="help-dialog" aria-label="Tutup panduan">${icon('x')}</button></div><div class="help-steps"><p><b>01 · Tambahkan audio</b>Pilih rekaman dari perangkat atau coba demo. Maksimal 6 menit per lagu, mono/stereo, dengan total audio terdekompresi 160 MB.</p><p><b>02 · Bentuk karakter</b>Natural memberi sentuhan ringan. Referensi mengikuti nilai gambar dan menghasilkan perubahan yang lebih jelas. Bypass mematikan seluruh efek.</p><p><b>03 · Proses & bandingkan</b>Klik Proses audio, lalu dengarkan A/B. Saat parameter berubah, proses ulang untuk mendengar pengaturan baru. Tombol spasi memutar atau menjeda audio.</p><p><b>04 · Ekspor hasil</b>Unduh WAV 16/24-bit. Ekspor 24-bit tidak mengembalikan informasi yang hilang dari MP3. Level RMS dan sample peak bukan LUFS atau true peak.</p></div><p class="dialog-note">Efek dapat menghasilkan artefak, terutama pitch, tempo, dan flutter. Tidak ada klaim bypass detektor, penghapusan watermark, atau pemalsuan identitas DAW. Gunakan telinga dan preview A/B untuk menilai hasil.</p><button class="button primary" data-close="help-dialog">Mulai berkarya</button></dialog>
<dialog id="save-dialog"><form id="save-form"><div class="dialog-heading"><h2>Simpan karakter Anda</h2><button type="button" class="icon-button" data-close="save-dialog" aria-label="Tutup">${icon('x')}</button></div><label for="preset-name">Nama preset</label><input id="preset-name" type="text" maxlength="40" required placeholder="Misalnya: Vokal hangat" /><p class="dialog-note">Preset disimpan di browser ini. File impulse response perlu dipilih kembali pada sesi berikutnya.</p><button class="button primary" type="submit">Simpan preset</button></form></dialog>`;

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 6000); }
function presetOptions(value = 'natural') {
  $('#preset').innerHTML = [...Object.entries(presets), ...Object.entries(customs)].map(([id, p]) => `<option value="${escape(id)}">${escape(p.name)}</option>`).join('') + '<option value="custom">Custom · pengaturan manual</option>';
  $('#preset').value = value; $('#delete-preset').hidden = !customs[value];
}
function updateControls() {
  for (const [key, , , min, max, , unit] of controls) {
    const el = $(`#${key}`); el.value = params[key]; el.style.setProperty('--fill', `${(params[key] - min) / (max - min) * 100}%`);
    $(`#${key}-value`).textContent = formatting(key, params[key], unit);
  }
  $('#trim').value = params.trim; $('#trim-value').textContent = `${params.trim > 0 ? '+' : ''}${params.trim} dB`;
  $('#trim').style.setProperty('--fill', `${(params.trim + 6) / 12 * 100}%`);
  $('#protect').checked = params.protect; $('#ceiling').value = params.ceiling;
}
function changed() {
  stop(); mode = 'original'; position = 0;
  $('#preset-caption').textContent = $('#preset').value === 'screenshot' ? 'Nilai dari gambar: +42c · 102% · 85% · 16% · 75% · 95% · 55%. Tape warmth 0% karena nilainya tidak terlihat.' : params.pitch || params.tempo !== 100 || params.flutter || params.allpass ? 'Pitch, tempo, flutter atau rotasi fase aktif · dengarkan A/B.' : 'Mulai ringan. Dengarkan, lalu sesuaikan.';
  updateControls(); update();
}
function setPreset(id) {
  const preset = presets[id] || customs[id]; if (!preset) return;
  params = { ...defaults };
  for (const [key, , , min, max] of controls) if (Number.isFinite(preset.values[key])) params[key] = Math.min(max, Math.max(min, preset.values[key]));
  params.trim = Math.min(6, Math.max(-6, Number(preset.values.trim) || 0));
  params.ceiling = [-1, -1.5, -2].includes(preset.values.ceiling) ? preset.values.ceiling : -1;
  params.protect = preset.values.protect !== false;
  presetOptions(id); changed();
}
function update() {
  const t = selectedTrack(), has = !!t, ready = fresh(t), buffer = activeBuffer();
  $('#track-count').textContent = tracks.length; $('#queue-count').textContent = String(tracks.length).padStart(2, '0');
  $('#drop-content').hidden = has; $('#wave-label').hidden = !has;
  $('#track-title').textContent = t?.name || 'Mulai dengan sebuah lagu';
  $('#active-label').textContent = has ? (mode === 'master' ? 'PROCESSED MASTER' : 'ORIGINAL RECORDING') : 'SIAP UNTUK REKAMAN ANDA';
  $('#file-badge').textContent = t ? (t.demo ? 'DEMO' : t.name.split('.').pop().slice(0, 5).toUpperCase()) : 'AUDIO';
  $('#track-meta').textContent = t ? `${time(buffer.duration)} · ${(buffer.sampleRate / 1000).toFixed(1)} kHz · ${buffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'}${t.demo ? ' · audio sintetis untuk uji fitur' : ''}` : 'WAV, MP3, FLAC, OGG, M4A · hingga 60 MB per file';
  $('#duration').textContent = time(buffer?.duration || 0); $('#time-end').textContent = time(buffer?.duration || 0); $('#time-middle').textContent = buffer ? time(buffer.duration / 2) : '—';
  $('#wave-label').textContent = mode === 'master' ? 'PROCESSED' : 'ORIGINAL';
  ['play', 'restart', 'seek'].forEach(id => $(`#${id}`).disabled = !has || importing);
  $('#master').disabled = !ready; $('#original').classList.toggle('active', mode === 'original'); $('#master').classList.toggle('active', mode === 'master');
  $('#original').setAttribute('aria-pressed', mode === 'original'); $('#master').setAttribute('aria-pressed', mode === 'master');
  $('#download').disabled = !ready || downloadBusy || busy; $('#report').disabled = !ready || busy;
  $('#process').disabled = !has || busy || importing; $('#process').innerHTML = `${icon(busy ? 'loader-circle' : 'audio-lines', busy ? 'spin' : '')} ${busy ? 'Memproses audio…' : 'Proses audio'}`;
  $('#batch').hidden = tracks.length < 2 || busy; $('#batch').disabled = importing;
  $('#cancel').hidden = !busy; $('#progress').hidden = !busy;
  if (!busy) $('#process-status').textContent = importing ? 'Membaca audio…' : ready ? 'Master siap dibandingkan & diunduh' : t?.result ? 'Parameter berubah · proses ulang' : has ? 'Siap diproses di perangkat Anda' : 'Tambahkan audio untuk mulai';
  const stats = mode === 'master' && ready ? t.result.stats : t?.stats;
  $('#peak').innerHTML = `${stats ? db(stats.peak) : '—'} <small>dBFS</small>`;
  $('#rms').innerHTML = `${stats ? db(stats.rms) : '—'} <small>dBFS</small>`;
  $('#crest').innerHTML = `${stats ? db(stats.crest) : '—'} <small>dB</small>`;
  $('#peak').classList.toggle('warning-text', stats?.peak >= 0);
  $('#queue').innerHTML = tracks.length ? tracks.map((tr, i) => `<div class="queue-row ${tr.id === selected ? 'selected' : ''}"><button class="track-select" data-select="${tr.id}"><span class="track-index">${String(i + 1).padStart(2, '0')}</span><span class="track-icon">${icon('file-audio')}</span><span class="track-info"><strong>${escape(tr.name)}</strong><small>${time(tr.buffer.duration)} · ${(tr.buffer.sampleRate / 1000).toFixed(1)} kHz · ${tr.buffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'}</small></span></button><span class="track-state ${fresh(tr) ? 'done' : ''}">${tr.working ? 'Memproses' : tr.error ? 'Gagal' : fresh(tr) ? 'Siap ekspor' : tr.result ? 'Perlu proses ulang' : 'Belum diproses'}</span><button class="icon-button remove-track" data-remove="${tr.id}" aria-label="Hapus ${escape(tr.name)}" ${busy || importing ? 'disabled' : ''}>${icon('x')}</button></div>`).join('') : `<div class="queue-empty">${icon('music-2')}<span>File Anda akan muncul di sini.<small>Tambahkan beberapa lagu untuk proses berurutan.</small></span></div>`;
  document.querySelectorAll('.parameters input, .parameters select, #save-preset, #delete-preset, #import-preset, #export-preset, #load-ir, #clear-ir, #reset, #add-top, #demo, #upload-orb, #browse').forEach(el => { el.disabled = busy || importing; });
  $('#ceiling').disabled = busy || importing || !params.protect;
  icons(); draw();
}
async function audioContext() { context ||= new AudioContext({ sampleRate: 44100 }); if (context.state === 'suspended') await context.resume(); return context; }
function stop(reset = false) {
  if (playing) position += context.currentTime - startedAt;
  playing = false;
  if (source) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); source = null; }
  if (gain) { gain.disconnect(); gain = null; }
  if (reset) position = 0;
  $('#play').innerHTML = icon('play'); $('#play').setAttribute('aria-label', 'Putar audio'); icons();
}
function previewGain() {
  const t = selectedTrack(); let value = Number($('#volume').value) / 100;
  if ($('#match').checked && fresh(t)) {
    const a = t.stats.rms, b = t.result.stats.rms;
    if (Number.isFinite(a) && Number.isFinite(b)) value *= 10 ** ((Math.min(a, b) - (mode === 'master' ? b : a)) / 20);
  }
  return value;
}
async function play() {
  if (!activeBuffer()) return;
  if (playing) { stop(); return; }
  try {
    const ctx = await audioContext(), buffer = activeBuffer();
    if (position >= buffer.duration - 0.01) position = 0;
    source = ctx.createBufferSource(); source.buffer = buffer; gain = ctx.createGain(); gain.gain.value = previewGain();
    source.connect(gain).connect(ctx.destination); source.start(0, position); startedAt = ctx.currentTime; playing = true;
    source.onended = () => stop(true);
    $('#play').innerHTML = icon('pause'); $('#play').setAttribute('aria-label', 'Jeda audio'); icons();
  } catch (e) { toast(`Audio tidak dapat diputar: ${e.message}`); }
}
function choose(id) { stop(true); selected = id; mode = 'original'; update(); }
function switchMode(next) {
  if (next === mode || (next === 'master' && !fresh(selectedTrack()))) return;
  const wasPlaying = playing; stop();
  const t = selectedTrack(), ratio = t.result.params.tempo / 100;
  position = next === 'master' ? position / ratio : position * ratio;
  mode = next; position = Math.min(position, activeBuffer().duration); update(); if (wasPlaying) play();
}
let bins = null, drawnBuffer = null;
function draw() {
  const canvas = $('#waveform'), rect = canvas.getBoundingClientRect(), scale = devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * scale) || canvas.height !== Math.round(rect.height * scale)) { canvas.width = Math.round(rect.width * scale); canvas.height = Math.round(rect.height * scale); bins = null; }
  const ctx = canvas.getContext('2d'), w = rect.width, h = rect.height;
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#202b35'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = h / 6; y < h; y += h / 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const buffer = activeBuffer(); if (!buffer) return;
  if (drawnBuffer !== buffer || !bins) {
    const ch = buffer.getChannelData(0), count = Math.max(1, Math.floor(w / 3)); bins = [];
    for (let i = 0; i < count; i++) { let peak = 0; const end = Math.min(ch.length, Math.floor((i + 1) * ch.length / count)); for (let k = Math.floor(i * ch.length / count); k < end; k++) peak = Math.max(peak, Math.abs(ch[k])); bins.push(peak); }
    drawnBuffer = buffer;
  }
  const at = playing ? position + context.currentTime - startedAt : position, cursor = at / buffer.duration * w;
  bins.forEach((peak, i) => { const x = i / bins.length * w; ctx.fillStyle = x <= cursor ? '#c3f98e' : mode === 'master' ? '#91ca66' : '#718e88'; const height = Math.max(2, Math.min(1, peak) * (h - 48)); ctx.fillRect(x, h / 2 - height / 2, 1.7, height); });
  ctx.fillStyle = '#d5fcae'; ctx.fillRect(cursor, 12, 1, h - 24);
}
function tick() {
  const b = activeBuffer(), at = Math.min(b?.duration || 0, playing ? position + context.currentTime - startedAt : position);
  $('#current-time').textContent = time(at); $('#seek').value = b ? at / b.duration * 1000 : 0;
  if (playing) draw(); requestAnimationFrame(tick);
}
async function addFiles(files) {
  if (busy || importing) return;
  importing = true; update(); let added = 0;
  for (const file of files) {
    if (tracks.length >= 6) { toast('Antrean maksimal 6 lagu. Hapus lagu untuk menambah yang lain.'); break; }
    if (!/\.(wav|mp3|flac|ogg|m4a|aac|aif|aiff|webm)$/i.test(file.name)) { toast(`${file.name}: format belum didukung.`); continue; }
    if (file.size > 60 * 1024 ** 2 || !file.size) { toast(`${file.name}: file harus berukuran 1 byte sampai 60 MB.`); continue; }
    try {
      const ctx = await audioContext(), buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      if (buffer.duration > 360 || buffer.numberOfChannels > 2) throw new Error('Maksimal 6 menit dan 2 channel per lagu.');
      const total = tracks.reduce((sum, t) => sum + t.buffer.length * t.buffer.numberOfChannels * 4, 0) + buffer.length * buffer.numberOfChannels * 4;
      if (total > 160 * 1024 ** 2) throw new Error('Batas memori sesi 160 MB tercapai. Hapus audio lain terlebih dahulu.');
      const track = { id: crypto.randomUUID(), name: file.name, buffer, stats: analyze(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))) };
      tracks.push(track); if (!selected) selected = track.id; added++;
    } catch (error) { toast(`${file.name}: ${error.name === 'EncodingError' ? 'Format/codec tidak dapat dibaca browser. Coba WAV atau MP3.' : error.message}`); }
  }
  importing = false; update(); if (added && !$('#toast').hidden) return; if (added) toast(`${added} audio ditambahkan. Pilih preset, lalu proses audio.`);
}
async function processTracks(list) {
  if (busy || importing || !list.length) return;
  stop(true); mode = 'original'; busy = true; controller = new AbortController(); update();
  let done = 0, failed = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i]; if (controller.signal.aborted) break;
    t.working = true; t.error = null; selected = t.id; t.result = null; update();
    try {
      t.result = await render(t.buffer, { ...params }, ir, controller.signal, (p, label) => { $('#progress').value = ((i + p) / list.length) * 100; $('#process-status').textContent = list.length > 1 ? `${i + 1}/${list.length} · ${label}` : label; });
      t.signature = fingerprint(); done++;
    } catch (error) {
      if (error.name === 'AbortError') break;
      t.error = error.message; failed++; toast(`Gagal memproses ${t.name}: ${error.message}`);
    } finally { t.working = false; }
  }
  const aborted = controller.signal.aborted; busy = false; controller = null;
  mode = fresh(selectedTrack()) ? 'master' : 'original'; update();
  toast(aborted ? 'Proses dibatalkan. Audio asli tetap tersedia.' : `${done} master selesai${failed ? `, ${failed} gagal` : ''}. Dengarkan A/B sebelum ekspor.`);
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

$('#preset').onchange = e => setPreset(e.target.value);
document.querySelectorAll('[data-param]').forEach(el => el.oninput = () => { params[el.dataset.param] = Number(el.value); presetOptions('custom'); changed(); });
$('#protect').onchange = () => { params.protect = $('#protect').checked; presetOptions('custom'); changed(); };
$('#ceiling').onchange = () => { params.ceiling = Number($('#ceiling').value); presetOptions('custom'); changed(); };
$('#reset').onclick = () => setPreset('natural');
$('#help').onclick = () => $('#help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(el => el.onclick = () => $(`#${el.dataset.close}`).close());
$('#save-preset').onclick = () => { $('#preset-name').value = ''; $('#save-dialog').showModal(); };
$('#save-form').onsubmit = e => { e.preventDefault(); const name = $('#preset-name').value.trim(); if (!name) return; const key = `saved-${crypto.randomUUID()}`; customs[key] = { name, values: { ...params } }; try { localStorage.setItem('aihumn.presets.v1', JSON.stringify(customs)); } catch { toast('Penyimpanan browser tidak tersedia. Preset hanya tersimpan di sesi ini.'); } presetOptions(key); $('#save-dialog').close(); };
$('#delete-preset').onclick = () => { delete customs[$('#preset').value]; try { localStorage.setItem('aihumn.presets.v1', JSON.stringify(customs)); } catch {} presetOptions('custom'); toast('Preset custom dihapus.'); };
$('#export-preset').onclick = () => {
  const id = $('#preset').value, name = (presets[id] || customs[id])?.name || 'Karakter custom';
  saveBlob(new Blob([serializePreset(name, params)], { type: 'application/json' }), `aihumn-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-preset.json`);
  toast('Preset diekspor. IR custom tetap perlu dipilih terpisah.');
};
$('#import-preset').onclick = () => $('#preset-input').click();
$('#preset-input').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || busy || importing) return;
  importing = true; update();
  try {
    if (file.size > 32 * 1024) throw new Error('File preset maksimal 32 KB.');
    const preset = parsePreset(await file.text()), key = `saved-${crypto.randomUUID()}`;
    customs[key] = preset; let stored = true;
    try { localStorage.setItem('aihumn.presets.v1', JSON.stringify(customs)); } catch { stored = false; }
    setPreset(key); toast(stored ? 'Preset diimpor dan diterapkan. IR custom dipilih terpisah.' : 'Preset diterapkan untuk sesi ini; penyimpanan browser tidak tersedia.');
  } catch (err) { toast(`Preset gagal diimpor: ${err.message}`); }
  finally { importing = false; update(); }
};
['add-top', 'browse', 'upload-orb'].forEach(id => $(`#${id}`).onclick = () => $('#file-input').click());
$('#file-input').onchange = async e => { await addFiles([...e.target.files]); e.target.value = ''; };
$('#drop-zone').ondragover = e => { e.preventDefault(); if (!busy) $('#drop-zone').classList.add('dragging'); };
$('#drop-zone').ondragleave = () => $('#drop-zone').classList.remove('dragging');
$('#drop-zone').ondrop = e => { e.preventDefault(); $('#drop-zone').classList.remove('dragging'); addFiles([...e.dataTransfer.files]); };
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
$('#demo').onclick = () => { const demo = demoAudio(), track = { ...demo, id: crypto.randomUUID(), name: 'Midnight sketch — demo.wav', demo: true }; tracks.push(track); choose(track.id); };
$('#queue').onclick = e => {
  const remove = e.target.closest('[data-remove]'), select = e.target.closest('[data-select]');
  if (remove && !busy && !importing) { const id = remove.dataset.remove; if (selected === id) stop(true); tracks = tracks.filter(t => t.id !== id); if (selected === id) { selected = tracks[0]?.id || null; mode = 'original'; } update(); }
  else if (select && !busy) choose(select.dataset.select);
};
$('#play').onclick = play; $('#restart').onclick = () => { const was = playing; stop(true); draw(); if (was) play(); };
$('#original').onclick = () => switchMode('original'); $('#master').onclick = () => switchMode('master');
$('#seek').oninput = () => { const at = Number($('#seek').value) / 1000, was = playing; stop(); position = activeBuffer().duration * at; draw(); if (was) play(); };
$('#volume').oninput = $('#match').onchange = () => { if (gain) gain.gain.setTargetAtTime(previewGain(), context.currentTime, 0.015); };
$('#process').onclick = () => processTracks([selectedTrack()].filter(Boolean)); $('#batch').onclick = () => processTracks([...tracks]);
$('#cancel').onclick = () => { controller?.abort(); $('#process-status').textContent = 'Membatalkan setelah tahap render selesai…'; };
$('#download').onclick = async () => {
  const t = selectedTrack(); if (!fresh(t) || downloadBusy) return;
  if (t.result.stats.peak > 0) { toast('Peak melebihi 0 dBFS. Aktifkan proteksi peak atau turunkan output gain, lalu proses ulang sebelum ekspor.'); return; }
  downloadBusy = true; update();
  try { const bits = Number($('#bit-depth').value), result = await task('encode', { channels: arrays(t.result.buffer), sampleRate: t.result.buffer.sampleRate, bits }); saveBlob(new Blob([result.wav], { type: 'audio/wav' }), `${t.name.replace(/\.[^.]+$/, '')}-master-${bits}bit.wav`); toast('WAV siap. File sumber tetap utuh.'); } catch (e) { toast(`Ekspor gagal: ${e.message}`); } finally { downloadBusy = false; update(); }
};
$('#report').onclick = () => {
  const t = selectedTrack(); if (!fresh(t)) return;
  const report = { application: 'AIHUMN Studio 1.1', source: t.name, processedAt: new Date().toISOString(), input: { duration: t.buffer.duration, sampleRate: t.buffer.sampleRate, channels: t.buffer.numberOfChannels, ...t.stats }, output: { duration: t.result.buffer.duration, ...t.result.stats }, parameters: t.result.params, peakGainReductionDb: t.result.attenuation, impulseResponse: irName || 'Synthetic short room', notes: ['AI origin is unchanged. No detector score or human-authorship guarantee.', 'Peak is sample peak, RMS is unweighted; neither is true peak or LUFS.', 'Original file is not modified.'] };
  saveBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${t.name.replace(/\.[^.]+$/, '')}-master-report.json`);
};
$('#load-ir').onclick = () => $('#ir-input').click();
$('#ir-input').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || busy || importing) return;
  importing = true; update();
  try { if (file.size > 5 * 1024 ** 2) throw new Error('Maksimal file IR 5 MB.'); const ctx = await audioContext(), decoded = await ctx.decodeAudioData(await file.arrayBuffer()); if (decoded.duration > 3 || decoded.numberOfChannels > 2) throw new Error('IR maksimal 3 detik, mono atau stereo.'); ir = decoded; irName = file.name; irVersion++; $('#ir-label').textContent = file.name; $('#clear-ir').hidden = false; changed(); toast('IR dipasang. Naikkan Studio room untuk mendengar efeknya.'); } catch (err) { toast(`IR gagal dimuat: ${err.message}`); } finally { importing = false; update(); }
};
$('#clear-ir').onclick = () => { ir = null; irName = ''; irVersion++; $('#ir-label').textContent = 'Ruang sintetis pendek · bawaan'; $('#clear-ir').hidden = true; changed(); };
document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) && !$('dialog[open]')) { e.preventDefault(); play(); } });
new ResizeObserver(draw).observe($('#waveform'));
presetOptions(); updateControls(); update(); tick();
