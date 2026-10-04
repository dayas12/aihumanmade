import { analyze } from './dsp.js';
import { integratedLufs } from './mastering.js';
export const arrays = buffer => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
export function asBuffer(channels, sampleRate) {
  const buffer = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate });
  channels.forEach((c, i) => buffer.copyToChannel(c, i)); return buffer;
}
export function task(type, payload, signal, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Dibatalkan', 'AbortError'));
    const worker = new Worker(new URL('./audio.worker.js', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Dibatalkan', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = e => { cleanup(); reject(new Error(e.message || 'Worker audio gagal.')); };
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) { onProgress(data.progress); return; }
      cleanup(); if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    worker.postMessage({ type, ...payload }, payload.channels?.map(c => c.buffer) || []);
  });
}
function syntheticRoom(context) {
  const ir = context.createBuffer(2, Math.ceil(context.sampleRate * 0.32), context.sampleRate);
  let seed = 98321;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let c = 0; c < 2; c++) {
    const samples = ir.getChannelData(c);
    for (let i = 0; i < samples.length; i++) {
      const t = i / context.sampleRate;
      samples[i] = t < 0.008 ? 0 : (random() * 2 - 1) * Math.exp(-t * 25) * 0.07;
    }
    [0.012, 0.021, 0.037, 0.059].forEach((t, i) => { samples[Math.floor((t + c * 0.0013) * context.sampleRate)] += 0.65 ** (i + 1); });
  }
  return ir;
}
export async function render(buffer, params, ir, signal, progress) {
  progress(0.02, 'Menyiapkan karakter audio…');
  const sampleRate = buffer.sampleRate;
  const first = await task('transform', { channels: arrays(buffer), sampleRate, params }, signal, p => progress(0.05 + p * 0.43, p >= 0.9 && params.allpass > 0 ? 'Merotasi fase · 12-stage all-pass…' : 'Membentuk pitch, tempo & dinamika…'));
  if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
  const dry = asBuffer(first.channels, sampleRate);
  const tail = params.room > 0 ? (ir ? ir.duration : 0.32) : 0;
  const context = new OfflineAudioContext(dry.numberOfChannels, dry.length + Math.ceil(tail * sampleRate), sampleRate);
  const source = context.createBufferSource(); source.buffer = dry;
  let last = source;
  if (params.deharsh > 0) for (const frequency of [3150, 4400, 6250]) {
    const filter = context.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = Math.min(frequency, sampleRate * 0.45);
    filter.Q.value = 2.8; filter.gain.value = -4.5 * params.deharsh / 100;
    last.connect(filter); last = filter;
  }
  if (params.room > 0) {
    const convolution = context.createConvolver(); convolution.buffer = ir || syntheticRoom(context);
    const wet = context.createGain(); wet.gain.value = params.room / 100;
    const direct = context.createGain(); direct.gain.value = 1 - params.room / 100 * 0.35;
    last.connect(direct).connect(context.destination);
    last.connect(convolution).connect(wet).connect(context.destination);
  } else last.connect(context.destination);
  source.start(); progress(0.52, 'Merender tonal & ruang…');
  const rendered = await context.startRendering();
  if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
  progress(0.85, 'Memeriksa peak & menyiapkan hasil…');
  const final = await task('finish', { channels: arrays(rendered), sampleRate, params }, signal);
  return { buffer: asBuffer(final.channels, sampleRate), stats: final.stats, attenuation: final.attenuation, loudness: final.loudness, params: { ...params } };
}
export function demoAudio() {
  const sampleRate = 44100, duration = 12;
  const ch = [new Float32Array(sampleRate * duration), new Float32Array(sampleRate * duration)];
  const notes = [220, 261.626, 329.628, 293.665, 220, 261.626, 391.995, 329.628];
  for (let i = 0; i < ch[0].length; i++) {
    const t = i / sampleRate, beat = t % 0.5;
    const kick = Math.sin(2 * Math.PI * (48 * beat + 3 * (1 - Math.exp(-beat * 32)))) * Math.exp(-beat * 15) * 0.28;
    const note = notes[Math.floor(t * 2) % notes.length];
    const env = Math.min(1, beat * 50) * Math.exp(-beat * 5);
    const fade = Math.min(1, t * 4, (duration - t) * 2);
    for (let c = 0; c < 2; c++) {
      const melody = (Math.sin(2 * Math.PI * note * t) + 0.16 * Math.sin(2 * Math.PI * note * 2 * t + c * 0.15)) * 0.18 * env;
      ch[c][i] = (kick + melody + 0.04 * Math.sin(2 * Math.PI * 110 * t + c * 0.12)) * fade;
    }
  }
  const buffer = asBuffer(ch, sampleRate);
  return { buffer, stats: { ...analyze(ch), lufs: integratedLufs(ch, sampleRate) } };
}
