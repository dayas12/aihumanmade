import { SoundTouch, SimpleFilter } from 'soundtouchjs';

export const defaults = { pitch: 0, tempo: 100, deharsh: 15, room: 3, punch: 8, allpass: 0, warmth: 6, flutter: 0, trim: 0, ceiling: -1, protect: true };
export const presets = {
  natural: { name: 'Natural · sentuhan ringan', values: { ...defaults } },
  warm: { name: 'Warm · lembut & dekat', values: { ...defaults, deharsh: 25, room: 5, punch: 12, warmth: 25 } },
  reference: { name: 'Referensi · karakter kuat', values: { ...defaults, pitch: 46, tempo: 102, deharsh: 85, room: 16, punch: 75, flutter: 55, warmth: 20 } },
  screenshot: { name: 'Referensi gambar · +42c / 12-stage', values: { ...defaults, pitch: 42, tempo: 102, deharsh: 85, room: 16, punch: 75, allpass: 95, flutter: 55, warmth: 0 } },
  bypass: { name: 'Bypass · tanpa efek', values: { pitch: 0, tempo: 100, deharsh: 0, room: 0, punch: 0, allpass: 0, warmth: 0, flutter: 0, trim: 0, ceiling: -1, protect: false } },
};

// H(z) = (a + z^-1) / (1 + a*z^-1): unity magnitude, frequency-dependent phase.
// Both channels use identical coefficients and independent filter state.
// Strength scales coefficients, not a dry/wet mix (which would cause comb filtering).
export function phaseRotate(channels, sampleRate, strength = 0, progress = () => {}) {
  const depth = Math.max(0, Math.min(100, Number(strength) || 0)) / 100;
  if (!depth) return channels;
  const frequencies = [90, 140, 220, 350, 550, 850, 1300, 2000, 3100, 4700, 6800, 9500];
  const coefficients = frequencies.map(f => {
    const k = Math.tan(Math.PI * Math.min(f, sampleRate * 0.42) / sampleRate);
    return (k - 1) / (k + 1) * depth;
  });
  const length = channels[0].length + Math.ceil(sampleRate * 0.08);
  return channels.map((input, c) => {
    const output = new Float32Array(length); output.set(input);
    for (let stage = 0; stage < coefficients.length; stage++) {
      const a = coefficients[stage]; let previousInput = 0, previousOutput = 0;
      for (let i = 0; i < length; i++) {
        const x = output[i], y = a * x + previousInput - a * previousOutput;
        output[i] = y; previousInput = x; previousOutput = y;
      }
      progress((c * coefficients.length + stage + 1) / (channels.length * coefficients.length));
    }
    return output;
  });
}

export function analyze(channels) {
  let peak = 0, sum = 0, clipped = 0;
  const count = channels.length * channels[0].length;
  for (const ch of channels) for (const sample of ch) {
    const x = Number.isFinite(sample) ? sample : 0;
    peak = Math.max(peak, Math.abs(x)); sum += x * x;
    if (Math.abs(x) >= 1) clipped++;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  return { peak: peak ? 20 * Math.log10(peak) : -Infinity, rms: rms ? 20 * Math.log10(rms) : -Infinity, crest: rms ? 20 * Math.log10(peak / rms) : 0, clipped };
}

export function transform(channels, sampleRate, params, progress = () => {}) {
  let output = channels;
  const length = channels[0].length;
  if (params.pitch !== 0 || params.tempo !== 100) {
    const touch = new SoundTouch();
    touch.stretch.setParameters(sampleRate, 0, 0, 12);
    touch.stretch.quickSeek = false;
    touch.pitch = 2 ** (params.pitch / 1200);
    touch.tempo = params.tempo / 100;
    const targetLength = Math.round(length / (params.tempo / 100));
    const left = channels[0], right = channels[1] || left;
    const source = { extract(target, frames, position) {
      const n = Math.max(0, Math.min(frames, length + sampleRate - position));
      for (let i = 0; i < n; i++) {
        target[i * 2] = left[position + i] || 0;
        target[i * 2 + 1] = right[position + i] || 0;
      }
      return n;
    }};
    const filter = new SimpleFilter(source, touch);
    output = channels.map(() => new Float32Array(targetLength));
    const block = new Float32Array(8192);
    let written = 0;
    while (written < targetLength) {
      const n = filter.extract(block, Math.min(4096, targetLength - written));
      if (!n) throw new Error('Pemrosesan pitch/tempo berhenti sebelum audio selesai.');
      for (let c = 0; c < output.length; c++) for (let i = 0; i < n; i++) output[c][written + i] = block[i * 2 + c];
      written += n;
      progress(0.7 * written / targetLength);
    }
  }
  // Linked stereo envelopes preserve the stereo image during transient shaping.
  const n = output[0].length;
  const fastA = Math.exp(-1 / (sampleRate * 0.002));
  const slowA = Math.exp(-1 / (sampleRate * 0.035));
  let fast = 0, slow = 0;
  const drive = 1 + params.warmth / 100 * 1.4;
  const wet = params.warmth / 100 * 0.35;
  const gain = 10 ** (params.trim / 20);
  const flutterInput = params.flutter > 0 ? output.map(c => c.slice()) : null;
  for (let i = 0; i < n; i++) {
    let amplitude = 0;
    for (const ch of output) amplitude = Math.max(amplitude, Math.abs(ch[i]));
    fast = fastA * fast + (1 - fastA) * amplitude;
    slow = slowA * slow + (1 - slowA) * amplitude;
    const transient = 1 + params.punch / 100 * 0.55 * Math.max(0, Math.min(1, (fast - slow) / (slow + 0.01)));
    const delay = flutterInput ? params.flutter / 100 * sampleRate * 0.00035 * (1 + 0.7 * Math.sin(2 * Math.PI * 0.63 * i / sampleRate) + 0.3 * Math.sin(2 * Math.PI * 5.7 * i / sampleRate)) : 0;
    const at = Math.max(0, i - delay), base = Math.floor(at), fraction = at - base;
    for (let c = 0; c < output.length; c++) {
      let x = flutterInput ? flutterInput[c][base] * (1 - fraction) + flutterInput[c][Math.min(base + 1, n - 1)] * fraction : output[c][i];
      x *= transient;
      if (wet) x = x * (1 - wet) + wet * Math.tanh(x * drive) / drive;
      output[c][i] = Number.isFinite(x) ? x * gain : 0;
    }
    if (i % 65536 === 0) progress(0.7 + i / n * (params.allpass > 0 ? 0.2 : 0.3));
  }
  return phaseRotate(output, sampleRate, params.allpass, p => progress(0.9 + p * 0.1));
}

export function finish(channels, params) {
  const before = analyze(channels);
  const attenuation = params.protect && before.peak > params.ceiling ? 10 ** ((params.ceiling - before.peak) / 20) : 1;
  if (attenuation < 1) for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= attenuation;
  return { channels, stats: analyze(channels), attenuation: 20 * Math.log10(attenuation) };
}

// PCM with TPDF dither. Dither is skipped on exact silence.
export function encodeWav(channels, sampleRate, bits = 24) {
  if (![16, 24].includes(bits)) throw new Error('Bit depth tidak didukung.');
  const count = channels.length, frames = channels[0].length, bytes = bits / 8;
  const buffer = new ArrayBuffer(44 + frames * count * bytes);
  const view = new DataView(buffer);
  const str = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, count, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * bytes, true); view.setUint16(32, count * bytes, true); view.setUint16(34, bits, true);
  str(36, 'data'); view.setUint32(40, frames * count * bytes, true);
  const scale = 2 ** (bits - 1);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (const ch of channels) {
    const x = Number.isFinite(ch[i]) ? ch[i] : 0;
    const dither = x === 0 ? 0 : Math.random() - Math.random();
    const value = Math.max(-scale, Math.min(scale - 1, Math.round(x * scale + dither)));
    if (bits === 16) view.setInt16(offset, value, true);
    else { view.setUint8(offset, value & 255); view.setUint8(offset + 1, (value >> 8) & 255); view.setUint8(offset + 2, (value >> 16) & 255); }
    offset += bytes;
  }
  return buffer;
}
