// Direct-form II transposed biquads, with independent state for each stream.
export function biquad(coefficients) {
  const [b0, b1, b2, a1, a2] = coefficients; let z1 = 0, z2 = 0;
  return x => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
}
export function passFilter(rate, frequency, high = false) {
  const w = 2 * Math.PI * frequency / rate, cosine = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha;
  const b0 = (high ? 1 + cosine : 1 - cosine) / 2;
  return biquad([b0 / a0, (high ? -2 : 2) * b0 / a0, b0 / a0, -2 * cosine / a0, (1 - alpha) / a0]);
}

// BS.1770 K weighting: pre-filter + RLB high-pass, bilinear sample-rate mapping.
export function kWeighting(rate) {
  const k = Math.tan(Math.PI * 1681.974450955533 / rate), q = 0.7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20), vb = vh ** 0.4996667741545416, a0 = 1 + k / q + k * k;
  const shelf = biquad([(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]);
  const kh = Math.tan(Math.PI * 38.13547087602444 / rate), qh = 0.5003270373238773, ah = 1 + kh / qh + kh * kh;
  const high = biquad([1, -2, 1, 2 * (kh * kh - 1) / ah, (1 - kh / qh + kh * kh) / ah]);
  return x => high(shelf(x));
}

// Mono/stereo integrated loudness. Full 400 ms windows, 100 ms hop,
// -70 LUFS absolute gate and -10 LU relative gate. Sub-400 ms input is unmeasurable.
export function integratedLufs(channels, sampleRate) {
  const window = Math.round(sampleRate * .4), hop = Math.round(sampleRate * .1), n = channels[0].length;
  if (n < window) return null;
  const blocks = new Float64Array(Math.floor((n - window) / hop) + 1);
  for (const samples of channels) {
    const filter = kWeighting(sampleRate), ring = new Float64Array(window); let sum = 0, block = 0;
    for (let i = 0; i < n; i++) {
      const y = filter(samples[i]), square = y * y, at = i % window;
      sum += square - ring[at]; ring[at] = square;
      if (i >= window - 1 && (i - window + 1) % hop === 0) blocks[block++] += Math.max(0, sum) / window;
    }
  }
  const lufs = energy => energy > 0 ? -0.691 + 10 * Math.log10(energy) : -Infinity;
  const absolute = [...blocks].filter(energy => lufs(energy) >= -70);
  if (!absolute.length) return null;
  const relative = lufs(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
  const gated = absolute.filter(energy => lufs(energy) >= relative);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// Harmonic residual generated at 4x sample rate, then band-limited before decimation.
// This adds upper-band harmonics; it does not restore information missing from the source.
export function exciteAir(channels, rate, amount = 0) {
  if (!(amount > 0) || rate / 2 <= 16000) return channels;
  const up = rate * 4, top = Math.min(22000, rate * .49), mix = amount / 100 * .65;
  for (const samples of channels) {
    const feed = passFilter(rate, 6000, true), hp = passFilter(up, 16000, true);
    const lp1 = passFilter(up, top), lp2 = passFilter(up, top);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      const dry = samples[i], current = feed(dry); let harmonic = 0;
      for (let sub = 1; sub <= 4; sub++) {
        const x = previous + (current - previous) * sub / 4;
        harmonic = lp2(lp1(hp(Math.tanh(x * 4) / 4 - x)));
      }
      samples[i] = dry + harmonic * mix; previous = current;
    }
  }
  return channels;
}

// Stereo-linked mid/side bass management. Mid remains unchanged; side rolls off
// below cutoff with two cascaded Butterworth high-pass sections (24 dB/oct).
export function monoSubBass(channels, rate, cutoff = 0) {
  if (!(cutoff > 0) || channels.length !== 2) return channels;
  const hp1 = passFilter(rate, cutoff, true), hp2 = passFilter(rate, cutoff, true);
  const [left, right] = channels;
  for (let i = 0; i < left.length; i++) {
    const mid = (left[i] + right[i]) * .5, side = hp2(hp1((left[i] - right[i]) * .5));
    left[i] = mid + side; right[i] = mid - side;
  }
  return channels;
}

// Deterministic band-shaped noise: level is calibrated RMS before loudness gain.
export function addShapedNoise(channels, rate, levelDb) {
  for (let c = 0; c < channels.length; c++) {
    let seed = 912367 + c * 7841;
    const hp = passFilter(rate, 1200, true), lp = passFilter(rate, Math.min(12000, rate * .4));
    const noise = new Float32Array(channels[c].length); let sum = 0;
    for (let i = 0; i < noise.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const value = lp(hp((seed >>> 0) / 2147483648 - 1)); noise[i] = value; sum += value * value;
    }
    const gain = sum > 0 ? 10 ** (levelDb / 20) / Math.sqrt(sum / noise.length) : 0;
    for (let i = 0; i < noise.length; i++) channels[c][i] += noise[i] * gain;
  }
  return channels;
}
