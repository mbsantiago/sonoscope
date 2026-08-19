export function encodeWavBuffer(
  channels: Float32Array | Float32Array[] | number[] | number[][],
  sampleRate: number,
  options?: { bitDepth?: 16 | 32 },
): ArrayBuffer {
  const chs: Float32Array[] =
    Array.isArray(channels) &&
    channels.length > 0 &&
    (Array.isArray(channels[0]) || channels[0] instanceof Float32Array)
      ? (channels as Array<Float32Array | number[]>).map((c) =>
          c instanceof Float32Array ? c : new Float32Array(c),
        )
      : [
          channels instanceof Float32Array
            ? channels
            : new Float32Array(channels as number[]),
        ];

  const numChannels = chs.length;
  const numSamples = chs[0]?.length ?? 0;
  const bitDepth = options?.bitDepth ?? 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk Descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM / IEEE Float)
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 1 = PCM, 3 = IEEE Float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave and write samples
  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const chData = chs[ch];
        const val = chData ? (chData[i] ?? 0) : 0;
        const sample = Math.max(-1, Math.min(1, val));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, Math.round(int16), true);
        offset += 2;
      }
    }
  } else {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const chData = chs[ch];
        const val = chData ? (chData[i] ?? 0) : 0;
        view.setFloat32(offset, val, true);
        offset += 4;
      }
    }
  }

  return buffer;
}

export function encodeWavBlob(
  channels: Float32Array | Float32Array[] | number[] | number[][],
  sampleRate: number,
  options?: { bitDepth?: 16 | 32 },
): Blob {
  const buffer = encodeWavBuffer(channels, sampleRate, options);
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
