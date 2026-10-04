import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, transform, finish, encodeWav, presets, phaseRotate } from '../src/dsp.js';
import { parsePreset, serializePreset } from '../src/preset-file.js';
import { APP_NAME, exportMetadata, infoChunk } from '../src/export-profile.js';
const rate = 44100;
const sine = (hz, seconds = 2, amplitude = 0.5) => Float32Array.from({ length: rate * seconds }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate));
const frequency = data => {
  const start = Math.floor(data.length * .2), end = Math.floor(data.length * .8);
  let crossings = 0;
  for (let i = start + 1; i < end; i++) if (data[i - 1] <= 0 && data[i] > 0) crossings++;
  return crossings * rate / (end - start);
};
test('bypass keeps decoded samples and stereo separation exactly', () => {
  const a = sine(440), b = sine(220), original = a.slice();
  const result = finish(transform([a, b], rate, presets.bypass.values), presets.bypass.values);
  assert.deepEqual(result.channels[0], original);
  assert.notDeepEqual(result.channels[0], result.channels[1]);
  assert.equal(result.attenuation, 0);
});
test('pitch +46 cents changes frequency without changing duration', () => {
  const result = transform([sine(440)], rate, { ...presets.bypass.values, pitch: 46 });
  assert.equal(result[0].length, rate * 2);
  assert.ok(Math.abs(frequency(result[0]) - 440 * 2 ** (46 / 1200)) < 2);
});
test('tempo 102% shortens duration independently of pitch', () => {
  const result = transform([sine(440)], rate, { ...presets.bypass.values, tempo: 102 });
  assert.equal(result[0].length, Math.round(rate * 2 / 1.02));
  assert.ok(Math.abs(frequency(result[0]) - 440) < 2);
});
test('tempo 98% extends audio, pitch -50 cents remains independent', () => {
  const result = transform([sine(440)], rate, { ...presets.bypass.values, tempo: 98, pitch: -50 });
  assert.equal(result[0].length, Math.round(rate * 2 / .98));
  assert.ok(Math.abs(frequency(result[0]) - 440 * 2 ** (-50 / 1200)) < 2);
});
test('reference preset produces finite stereo output and linked gain protection', () => {
  const channels = transform([sine(440, 2, 1.2), sine(220, 2, .5)], rate, presets.reference.values);
  const result = finish(channels, presets.reference.values);
  assert.ok(result.stats.peak <= -1 + 1e-5);
  assert.ok(result.stats.peak > -1.01);
  assert.equal(result.stats.clipped, 0);
  assert.ok(result.channels.every(c => c.every(Number.isFinite)));
});
test('silence stays silent with effects and WAV has valid PCM headers', () => {
  const result = finish(transform([new Float32Array(rate)], rate, presets.reference.values), presets.reference.values);
  assert.equal(analyze(result.channels).peak, -Infinity);
  for (const bits of [16, 24]) {
    const encoded = encodeWav(result.channels, rate, bits), view = new DataView(encoded);
    assert.equal(view.getUint16(34, true), bits);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), rate);
    const payload = result.channels[0].length * bits / 8;
    assert.equal(encoded.byteLength, 44 + payload + payload % 2);
    assert.ok(new Uint8Array(encoded, 44).every(v => v === 0));
  }
});
test('PCM clamps hot samples and interleaves channels correctly', () => {
  const view = new DataView(encodeWav([new Float32Array([1.5, -.5]), new Float32Array([-1.5, .5])], rate, 16));
  assert.equal(view.getInt16(44, true), 32767); assert.equal(view.getInt16(46, true), -32768);
  assert.ok(Math.abs(view.getInt16(48, true) + 16384) <= 1); assert.ok(Math.abs(view.getInt16(50, true) - 16384) <= 1);
});

test('12-stage all-pass preserves impulse energy and magnitude while changing phase', () => {
  for (const sampleRate of [22050, 44100, 48000, 96000]) {
    const impulse = new Float32Array(sampleRate / 10); impulse[0] = 1;
    const [result] = phaseRotate([impulse], sampleRate, 95);
    assert.notEqual(result[0], 1);
    const energy = result.reduce((sum, x) => sum + x * x, 0);
    assert.ok(Math.abs(energy - 1) < 1e-5);
    for (const frequency of [100, 500, 2000, 8000]) {
      let real = 0, imaginary = 0;
      for (let i = 0; i < result.length; i++) { const angle = 2 * Math.PI * frequency * i / sampleRate; real += result[i] * Math.cos(angle); imaginary -= result[i] * Math.sin(angle); }
      assert.ok(Math.abs(Math.hypot(real, imaginary) - 1) < 1e-5);
    }
    assert.equal(impulse[0], 1); // source remains unchanged
  }
});

test('all-pass 0 is exact bypass; full strength is stable and preserves stereo relationships', () => {
  const a = sine(440), b = Float32Array.from(a, x => x * .5);
  const zero = phaseRotate([a, b], rate, 0); assert.deepEqual(zero, [a, b]);
  const result = phaseRotate([a, b], rate, 100);
  assert.ok(result.every(ch => ch.every(Number.isFinite)));
  for (let i = 0; i < result[0].length; i++) assert.equal(result[1][i], result[0][i] * .5);
  const [silent] = phaseRotate([new Float32Array(rate)], rate, 95);
  assert.ok(silent.every(x => x === 0));
});

test('screenshot preset survives JSON export/import including all-pass', () => {
  const preset = presets.screenshot;
  const restored = parsePreset(serializePreset(preset.name, preset.values));
  assert.deepEqual(restored, preset);
  assert.equal(restored.values.pitch, 42); assert.equal(restored.values.allpass, 95);
  assert.equal(restored.values.flutter, 55); assert.equal(restored.values.warmth, 0);
  const old = { ...preset.values }; delete old.allpass;
  assert.equal(parsePreset(serializePreset('Legacy', old)).values.allpass, 0);
});

test('malformed or out-of-range preset files are rejected', () => {
  assert.throws(() => parsePreset('{broken'));
  assert.throws(() => parsePreset('{"name":"Wrong format","values":{}}'));
  for (const values of [{ allpass: 101 }, { protect: 'false' }, { pitch: 42.5 }, { room: -1 }, { tempo: '102' }, { ceiling: 0 }]) {
    assert.throws(() => parsePreset(serializePreset('Bad values', values)));
  }
});

function readInfo(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), decoder = new TextDecoder();
  const text = (at, length) => decoder.decode(bytes.slice(at, at + length));
  const result = {};
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = text(offset, 4), size = view.getUint32(offset + 4, true);
    assert.ok(offset + 8 + size <= bytes.length);
    if (id === 'LIST' && text(offset + 8, 4) === 'INFO') {
      for (let at = offset + 12; at < offset + 8 + size;) {
        const field = text(at, 4), length = view.getUint32(at + 4, true);
        result[field] = text(at + 8, length - 1); at += 8 + length + length % 2;
      }
    }
    offset += 8 + size + size % 2;
  }
  return result;
}

test('Ableton export label is written to WAV INFO while retaining actual processor', () => {
  const metadata = exportMetadata('ableton12', 'Lagu saya');
  const wav = encodeWav([new Float32Array(5)], 44100, 24, metadata);
  assert.equal(new DataView(wav).getUint32(4, true), wav.byteLength - 8);
  assert.equal(new DataView(wav).getUint32(40, true), 15);
  assert.equal(new Uint8Array(wav)[59], 0); // odd-length data gets a pad before LIST
  assert.deepEqual(readInfo(wav), metadata);
  assert.equal(metadata.ISFT, APP_NAME);
  assert.match(metadata.ICMT, /User-selected export profile: Ableton Live 12 Master/);
  assert.match(metadata.ICMT, /not an Ableton application render/);
});

test('metadata leaves PCM sample layout intact for 16 and 24 bit mono/stereo', () => {
  for (const bits of [16, 24]) for (const channelCount of [1, 2]) {
    const samples = Array.from({ length: channelCount }, (_, c) => new Float32Array([0, .25 * (c ? -1 : 1), -.5, 0, .1]));
    const meta = exportMetadata('standard', 'Judul é 日本');
    const wav = encodeWav(samples, 48000, bits, meta), view = new DataView(wav);
    const scale = 2 ** (bits - 1), bytes = bits / 8;
    for (let i = 0; i < 5; i++) for (let c = 0; c < channelCount; c++) {
      const at = 44 + (i * channelCount + c) * bytes;
      const value = bits === 16 ? view.getInt16(at, true) : (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16));
      assert.ok(Math.abs(value - samples[c][i] * scale) <= 1.5);
    }
    assert.deepEqual(readInfo(wav), meta);
  }
});

test('metadata filters unsupported tags and invalid profiles', () => {
  assert.throws(() => exportMetadata('unknown', 'Track'));
  assert.equal(infoChunk({ unknown: 'ignored' }).length, 0);
  const wav = encodeWav([new Float32Array(2)], 44100, 16, { INAM: 'a\0b', ISFT: APP_NAME, '<script>': 'ignore' });
  assert.deepEqual(readInfo(wav), { INAM: 'ab', ISFT: APP_NAME });
});
