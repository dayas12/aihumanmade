import { transform, finish, encodeWav } from './dsp.js';
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
      const result = finish(data.channels, data.params);
      self.postMessage(result, result.channels.map(c => c.buffer));
    } else if (data.type === 'encode') {
      const wav = encodeWav(data.channels, data.sampleRate, data.bits);
      self.postMessage({ wav }, [wav]);
    }
  } catch (error) { self.postMessage({ error: error.message }); }
};
