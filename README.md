# AIHUMN Studio

Aplikasi mastering audio lokal, berbahasa Indonesia, siap dipasang di Vercel. Tidak membutuhkan API key, backend, database, atau akun Suno. Audio dipilih dari perangkat dan diproses di browser dengan Web Audio dan Web Worker.

## Mulai di komputer

Gunakan Node.js **22.12 atau lebih baru** dan pnpm **10.26 atau lebih baru**.

```sh
corepack enable
corepack prepare pnpm@10.26.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Jika Corepack tidak tersedia, instal pnpm dengan `npm install -g pnpm@10.26.0`.

```sh
pnpm test
pnpm build
pnpm preview
```

Buka alamat lokal yang ditampilkan terminal. Jangan membuka `index.html` menggunakan `file://`; modul JavaScript dan worker memerlukan HTTP/HTTPS.

## Deploy ke Vercel

1. Ekstrak ZIP. Masukkan **isi folder `aihumn-studio`** ke repository GitHub/GitLab/Bitbucket Anda. Jangan sertakan `node_modules`.
2. Di Vercel, pilih **Add New → Project**, kemudian impor repository tersebut.
3. Jika repository berisi folder `aihumn-studio`, pilih folder itu sebagai **Root Directory**. Jika file `package.json` berada langsung di root repository, biarkan root bawaan.
4. Gunakan **Framework: Vite**, **Build Command: `pnpm run build`**, **Output Directory: `dist`**, dan Node.js **22.x** atau lebih baru. `vercel.json` sudah menyediakan konfigurasi build dan header.
5. Klik **Deploy**. Tidak ada environment variable yang wajib diisi.

Alternatif terminal, dari folder proyek:

```sh
npx vercel
npx vercel --prod
```

Perintah tersebut meminta login Vercel bila diperlukan. Proyek ini **belum dipublikasikan ke akun Vercel Anda**. Folder `dist` juga disertakan dalam paket sebagai hasil build siap hosting statis.

Referensi resmi: [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel CLI](https://vercel.com/docs/cli/deploy).

## Cara menggunakan

1. Tambahkan WAV, MP3, FLAC, OGG, M4A, AAC, AIFF atau WebM yang dapat dibaca browser; atau pilih demo sintetis 12 detik.
2. Mulai dengan **Natural** untuk penyesuaian ringan. Pilih **Bypass** untuk tanpa efek, termasuk tanpa penyesuaian gain proteksi.
3. Sesuaikan kontrol, lalu tekan **Proses audio**. Untuk beberapa lagu, gunakan **Proses seluruh antrean**; ekspor dilakukan per lagu.
4. Bandingkan **A Asli / B Hasil**. Opsi penyamaan level memakai RMS dan hanya menurunkan level preview sisi yang lebih keras; ekspor tidak ikut berubah. Tombol spasi dapat memutar/menjeda saat fokus bukan pada kontrol.
5. Unduh **WAV 24-bit** atau **16-bit**. Ikon laporan mengunduh JSON berisi parameter dan metrik nyata.

Perubahan parameter membuat hasil lama tidak tersedia untuk ekspor sampai diproses ulang, supaya parameter dan audio hasil selalu sesuai. Preset custom tersimpan lokal di browser. Audio dan hasil tidak disimpan setelah halaman ditutup atau dimuat ulang.

## Parameter

| Kontrol | Implementasi | Preset Referensi |
|---|---|---:|
| Pitch micro-shift | SoundTouch time stretching dan pitch shifting | +46 cents |
| Tempo adjustment | Perubahan durasi terpisah dari pitch | 102% |
| Multiband de-harsh | Tiga peaking EQ, Q 2.8, maksimum −4.5 dB di 3.15/4.4/6.25 kHz | 85% |
| Studio room | Convolution reverb, IR sintetis pendek atau IR WAV pilihan | 16% |
| Transient punch | Penguatan transient berdasarkan perbedaan envelope cepat/lambat, stereo linked | 75% |
| Tape warmth | Campuran saturasi tanh lembut | 20% tambahan |
| Tape micro-flutter | Delay termodulasi halus, sama untuk kedua channel | 55% |
| Output gain | Gain −6 sampai +6 dB sebelum EQ/reverb | 0 dB |
| Proteksi sample peak | Pengurangan gain global hanya bila melebihi batas | −1 dBFS |

Preset Referensi mengikuti nilai yang tampak pada gambar pertama dan nilai flutter pada gambar kedua. Nilai tinggi dapat terdengar jelas. Preset **Natural** memakai pitch 0, tempo 100%, de-harsh 15%, room 3%, punch 8%, warmth 6%, flutter 0%, dan proteksi −1 dBFS.

### Preset gambar tambahan · versi 1.1

Pilih **Referensi gambar · +42c / 12-stage** untuk parameter gambar terbaru:

| Parameter pada gambar | Nilai preset |
|---|---:|
| Pitch Micro-Shift | +42 cents |
| Tempo Micro-Drift | 102.0% |
| Multiband De-Squeak, 3.15/4.4/6.25 kHz | 85% |
| Studio Live-Room IR Convolution | 16.0% |
| Transient Attack Punch | 75% |
| 12-Stage All-Pass | 95% |
| Tape Micro-Flutter Drift | 55% |

**Tape warmth = 0%** pada preset baru karena nilainya tidak terlihat pada gambar. Output gain = 0 dB dan proteksi sample peak = −1 dBFS. Preset lama **Referensi · karakter kuat** (+46 cents) tetap tersedia. Natural, Warm dan Bypass memakai all-pass 0%.

All-pass memakai 12 filter orde pertama berantai. Persentase mengatur kedalaman koefisien fase, bukan campuran dry/wet; ini mempertahankan respons magnitudo unit tanpa comb filtering akibat pencampuran. Channel stereo memakai koefisien sama dengan state terpisah. Pada 0%, tahap dilewati sepenuhnya. Pada nilai aktif, tambahan ekor 80 ms menampung peluruhan filter sebelum convolution room. Rotasi fase dapat mengubah bentuk transient dan sample peak meskipun magnitudo spektrum filter tetap rata.

Label “Anti-Watermark” pada referensi tidak digunakan sebagai klaim fungsi. Implementasi ini adalah efek rotasi fase umum; tidak mendeteksi, menargetkan, atau menjamin penghilangan SynthID/AudioSeal. Istilah “neural disruption”, “mel-bin camouflage”, dan skor detektor <30% pada gambar tidak merupakan kemampuan yang sudah terbukti dan tidak ditampilkan sebagai hasil pengukuran aplikasi.

Tombol **Simpan**, **Hapus**, **Impor preset**, dan **Ekspor preset** tersedia di panel preset. Ekspor JSON menyertakan seluruh parameter termasuk all-pass. Impor memeriksa format dan batas parameter, lalu menyimpan preset di browser bila localStorage tersedia. File IR tetap dipilih terpisah. Salinan preset siap impor disertakan di `public/presets/referensi-gambar.json`.

Reverb bawaan merupakan **simulasi ruang**, bukan rekaman ruang fisik. Impor IR WAV mono/stereo hingga 3 detik dan 5 MB untuk memakai rekaman ruang pilihan. Ekor reverb dipertahankan, sehingga durasi hasil bisa sedikit lebih panjang. IR hanya hidup selama sesi browser.

## Menjaga sumber dan memahami hasil

- File sumber tidak pernah ditulis ulang; semua unduhan memakai nama baru. Browser hanya membaca salinan file yang Anda pilih.
- Mengubah suara tidak mengubah asal lagu AI menjadi karya yang seluruhnya dibuat manusia. Aplikasi tidak memberikan skor deteksi, klaim “guaranteed human”, penghilangan watermark, atau identitas DAW palsu.
- Tidak ada jaminan bahwa efek bebas artefak. Dengarkan hasil dan gunakan Bypass atau nilai lebih kecil bila efek mengganggu vokal, stereo, atau transient. Time stretching pada master stereo tidak setara dengan penyuntingan stem secara individual.
- Decode browser saat ini memakai **44.1 kHz**. File dengan sample rate lain dikonversi saat decode; metadata bit depth asli tidak dipertahankan. WAV hasil adalah PCM dari hasil decode/pemrosesan, bukan konversi bit-perfect file sumber. WAV 24-bit tidak memulihkan detail yang hilang dari MP3.
- Sample peak/RMS/crest diukur dari sampel nyata. RMS bukan LUFS. Proteksi adalah sample-peak attenuation, bukan true-peak limiter dengan oversampling. Intersample peak tidak diukur. Tidak ada auto-normalisasi yang menaikkan gain lagu pelan.
- Ekspor PCM memakai TPDF dither. Jika peak hasil melampaui 0 dBFS, unduhan ditahan: aktifkan proteksi atau turunkan output gain, lalu proses ulang. Ini mencegah clipping tambahan saat ekspor.
- Maksimal 60 MB per file, 6 menit per lagu, 6 lagu per antrean, dan 160 MB total sampel sumber terdekompresi. Hasil, salinan kerja, dan convolution memakai memori tambahan. Pada ponsel, proses satu lagu pendek dahulu.
- Pemrosesan inti berjalan di worker; EQ dan convolution memakai OfflineAudioContext. Pembatalan worker segera, sedangkan tahap OfflineAudioContext selesai dahulu sebelum pembatalan diterapkan.
- Dukungan format bergantung pada codec browser. WAV PCM dan MP3 adalah pilihan praktis. Gunakan versi browser modern yang mendukung Web Audio, module worker, dan dialog.
- Audio tidak diunggah. Server hanya mengirim berkas aplikasi. Preset memakai localStorage; tidak ada analitik atau layanan AI eksternal di dalam aplikasi.

## Struktur

```text
src/main.js          Antarmuka, antrean, A/B, preset, impor dan ekspor
src/audio.js         Web Audio, convolution, demo dan orchestration worker
src/dsp.js           SoundTouch, transient/warmth/flutter, metrik dan WAV
src/audio.worker.js  Worker DSP/encoding
src/style.css       Tampilan responsive
tests/dsp.test.js    Uji numerik audio
vercel.json         Konfigurasi deploy
pnpm-lock.yaml      Versi dependensi terkunci
public/licenses/    Lisensi komponen
public/vendor/      Distribusi SoundTouchJS tanpa modifikasi
```

## Verifikasi yang dilakukan

- Build produksi Vite berhasil.
- Sebelas uji numerik lulus: bypass, separasi stereo, frekuensi pitch, durasi tempo, kombinasi pitch/tempo, peak/silence, header dan interleave PCM, respons magnitudo/energi all-pass pada empat sample rate, stabilitas dan stereo, serta validasi file preset.
- Chrome desktop dan viewport mobile: impor demo, proses, pemutaran, A/B, ekspor WAV 24-bit, impor kembali, batch, preset custom tersimpan, penghapusan preset, error file rusak, dan dialog panduan berhasil.
- Tidak ada error JavaScript pada alur browser tersebut.
- Header CSP Vercel diuji pada preview; aplikasi, worker, dan unduhan tetap berfungsi tanpa resource eksternal.
- Ekspor bypass 16-bit dibandingkan terhadap PCM masukan (selisih maksimum 2 LSB setelah decode dan dither), IR custom berhasil, ekspor di atas 0 dBFS diblokir, dan pembatalan file 3 menit mempertahankan sumber.

Pengujian memakai audio sintetis, bukan penilaian kualitas pendengaran lagu Suno Anda. Tidak ada file lagu asli yang disertakan dalam permintaan. Safari/Firefox dan perangkat ponsel fisik belum diuji.

## Komponen sumber terbuka

SoundTouchJS 0.2.3 (LGPL-2.1) dan Lucide 0.468.0 (ISC). Lihat `THIRD_PARTY_NOTICES.md` serta folder `public/licenses`. Kode aplikasi dan build scripts disertakan agar dependency dapat diganti dan hasil build dibuat ulang.
