import { transform, finish, encodeWav, analyze } from './dsp.js';
import { integratedLufs } from './mastering.js';
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'transform') {
      let last = -1;
      const channels = transform(data.channels, data.sampleRate, data.params, p => {
        const percent = Math.floor(p * 100);
        if (percent !== last) { self.postMessage({ progress: p }); last = percent; }
      });
      self.postMessage({ channels }, channels.map(c => c.buffer));
    } else if (data.type === 'finish') {
      const result = finish(data.channels, data.params, data.sampleRate);
      self.postMessage(result, result.channels.map(c => c.buffer));
    } else if (data.type === 'encode') {
      const wav = encodeWav(data.channels, data.sampleRate, data.bits, data.metadata, data.dither);
      self.postMessage({ wav }, [wav]);
    } else if (data.type === 'analyze') {
      self.postMessage({ stats: { ...analyze(data.channels), lufs: integratedLufs(data.channels, data.sampleRate) } });
    }
  } catch (error) { self.postMessage({ error: error.message }); }
};
