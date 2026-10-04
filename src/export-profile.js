export const APP_NAME = 'AIHUMN Studio 1.3';
export const exportProfiles = {
  standard: { name: 'AIHUMN · standar', suffix: '' },
  ableton12: { name: 'Ableton Live 12 Master', suffix: '-ableton12-profile' },
};

export function exportMetadata(profileId, title) {
  if (!Object.hasOwn(exportProfiles, profileId)) throw new Error('Profil ekspor tidak dikenal.');
  const profile = exportProfiles[profileId];
  return {
    INAM: title,
    ISFT: APP_NAME,
    ICMT: profileId === 'ableton12'
      ? `User-selected export profile: ${profile.name}. Processed by ${APP_NAME}; not an Ableton application render or project.`
      : `Processed by ${APP_NAME}.`,
  };
}

// RIFF INFO strings are null-terminated and each subchunk is word-aligned.
// UTF-8 allows track names in Indonesian and other languages; reader support varies.
export function infoChunk(metadata = {}) {
  const encoder = new TextEncoder();
  const fields = ['INAM', 'IART', 'ISFT', 'ICMT'].flatMap(id => {
    if (typeof metadata[id] !== 'string' || !metadata[id].trim()) return [];
    const data = encoder.encode(metadata[id].replace(/\0/g, '').slice(0, 1000));
    const size = data.length + 1;
    return [{ id, data, size, padded: size + size % 2 }];
  });
  if (!fields.length) return new Uint8Array();
  const length = 12 + fields.reduce((sum, f) => sum + 8 + f.padded, 0);
  const result = new Uint8Array(length), view = new DataView(result.buffer);
  result.set(encoder.encode('LIST'), 0); view.setUint32(4, length - 8, true); result.set(encoder.encode('INFO'), 8);
  let at = 12;
  for (const field of fields) {
    result.set(encoder.encode(field.id), at); view.setUint32(at + 4, field.size, true);
    result.set(field.data, at + 8); at += 8 + field.padded;
  }
  return result;
}
