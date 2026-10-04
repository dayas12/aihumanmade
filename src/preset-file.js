import { defaults } from './dsp.js';

const limits = { pitch: [-50, 50, 1], tempo: [98, 102, 0.1], deharsh: [0, 100, 1], room: [0, 25, 0.5], punch: [0, 100, 1], allpass: [0, 100, 1], flutter: [0, 100, 1], warmth: [0, 100, 1], trim: [-6, 6, 0.5] };
export function parsePreset(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('File bukan JSON yang valid.'); }
  if (data?.schema !== 'aihumn.preset' || data.version !== 1 || !data.values || typeof data.values !== 'object' || Array.isArray(data.values)) throw new Error('Gunakan file JSON hasil Ekspor preset AIHUMN.');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 40) throw new Error('Nama preset harus berisi 1–40 karakter.');
  const values = { ...defaults };
  for (const [key, [min, max, step]] of Object.entries(limits)) {
    if (!(key in data.values)) continue;
    const value = data.values[key], steps = (value - min) / step;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs(steps - Math.round(steps)) > 1e-6) throw new Error(`Nilai ${key} tidak valid.`);
    values[key] = value;
  }
  if ('protect' in data.values) {
    if (typeof data.values.protect !== 'boolean') throw new Error('Nilai proteksi peak tidak valid.');
    values.protect = data.values.protect;
  }
  if ('ceiling' in data.values) {
    if (![-1, -1.5, -2].includes(data.values.ceiling)) throw new Error('Batas peak tidak valid.');
    values.ceiling = data.values.ceiling;
  }
  return { name: data.name.trim(), values };
}

export function serializePreset(name, values) {
  return JSON.stringify({ schema: 'aihumn.preset', version: 1, name: name.slice(0, 40), values }, null, 2);
}
