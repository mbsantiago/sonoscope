export type WavInfo = {
  format: number;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  duration: number;
};

const PCM_FORMAT = 1;
const FLOAT_FORMAT = 3;

export function isWavBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    text(bytes, 0, 4) === "RIFF" &&
    text(bytes, 8, 4) === "WAVE"
  );
}

export function parseWavHeader(bytes: Uint8Array): WavInfo {
  if (!isWavBytes(bytes)) throw new Error("Invalid WAV header");
  const view = viewFor(bytes);
  let offset = 12;
  let format: number | undefined;
  let channelCount: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let blockAlign: number | undefined;
  let dataOffset: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const id = text(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > bytes.byteLength)
        throw new Error("Invalid WAV fmt chunk");
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      blockAlign = view.getUint16(body + 12, true);
      bitsPerSample = view.getUint16(body + 14, true);
    }
    if (id === "data") {
      dataOffset = body;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (
    format === undefined ||
    channelCount === undefined ||
    sampleRate === undefined ||
    bitsPerSample === undefined ||
    blockAlign === undefined
  )
    throw new Error("WAV fmt chunk not found");
  if (dataOffset === undefined || dataSize === undefined)
    throw new Error("WAV data chunk not found");
  if (format !== PCM_FORMAT && format !== FLOAT_FORMAT)
    throw new Error(`Unsupported WAV format ${format}`);
  if (format === FLOAT_FORMAT && bitsPerSample !== 32)
    throw new Error("Unsupported WAV float bit depth");
  if (format === PCM_FORMAT && ![8, 16, 24, 32].includes(bitsPerSample))
    throw new Error(`Unsupported WAV bit depth ${bitsPerSample}`);
  if (channelCount <= 0 || sampleRate <= 0 || blockAlign <= 0)
    throw new Error("Invalid WAV format metadata");
  const frameCount = Math.floor(dataSize / blockAlign);
  return {
    format,
    channelCount,
    sampleRate,
    bitsPerSample,
    blockAlign,
    dataOffset,
    dataSize,
    duration: frameCount / sampleRate,
  };
}

export function wavTimeToByteRange(
  info: WavInfo,
  startTime: number,
  endTime: number,
): { start: number; end: number } {
  const firstFrame = Math.max(0, Math.floor(startTime * info.sampleRate));
  const endFrame = Math.min(
    Math.floor(info.dataSize / info.blockAlign),
    Math.ceil(endTime * info.sampleRate),
  );
  return {
    start: info.dataOffset + firstFrame * info.blockAlign,
    end: info.dataOffset + endFrame * info.blockAlign,
  };
}

export function decodeWavPcm(
  bytes: Uint8Array,
  info: WavInfo,
  byteOffset = info.dataOffset,
  target?: Float32Array[],
  targetOffset = 0,
): Float32Array[] {
  const skipBytes = Math.max(0, info.dataOffset - byteOffset);
  const frameBytes = Math.max(0, bytes.length - skipBytes);
  const frameCount = Math.floor(frameBytes / info.blockAlign);
  if (frameCount === 0) {
    return (
      target ??
      Array.from({ length: info.channelCount }, () => new Float32Array(0))
    );
  }

  const channels =
    target ??
    Array.from(
      { length: info.channelCount },
      () => new Float32Array(frameCount),
    );

  const startByte = bytes.byteOffset + skipBytes;
  const buffer = bytes.buffer;

  // Format 1: PCM Integer
  if (info.format === PCM_FORMAT) {
    if (info.bitsPerSample === 16) {
      const isAligned = startByte % 2 === 0;
      const int16 = isAligned
        ? new Int16Array(buffer, startByte, frameCount * info.channelCount)
        : new Int16Array(
            bytes.slice(skipBytes, skipBytes + frameCount * info.blockAlign)
              .buffer,
          );
      const factor = 1 / 32768;

      if (info.channelCount === 1) {
        const out = channels[0]!;
        for (let i = 0; i < frameCount; i++) {
          out[targetOffset + i] = int16[i]! * factor;
        }
      } else if (info.channelCount === 2) {
        const left = channels[0]!;
        const right = channels[1]!;
        let srcIdx = 0;
        for (let i = 0; i < frameCount; i++) {
          left[targetOffset + i] = int16[srcIdx++]! * factor;
          right[targetOffset + i] = int16[srcIdx++]! * factor;
        }
      } else {
        let srcIdx = 0;
        for (let f = 0; f < frameCount; f++) {
          for (let ch = 0; ch < info.channelCount; ch++) {
            channels[ch]![targetOffset + f] = int16[srcIdx++]! * factor;
          }
        }
      }
      return channels;
    }

    if (info.bitsPerSample === 24) {
      const factor = 1 / 8388608;
      let b = skipBytes;
      if (info.channelCount === 1) {
        const out = channels[0]!;
        for (let f = 0; f < frameCount; f++) {
          let val = bytes[b]! | (bytes[b + 1]! << 8) | (bytes[b + 2]! << 16);
          if (val & 0x800000) val |= 0xff000000;
          out[targetOffset + f] = val * factor;
          b += 3;
        }
      } else if (info.channelCount === 2) {
        const left = channels[0]!;
        const right = channels[1]!;
        for (let f = 0; f < frameCount; f++) {
          let val0 = bytes[b]! | (bytes[b + 1]! << 8) | (bytes[b + 2]! << 16);
          if (val0 & 0x800000) val0 |= 0xff000000;
          left[targetOffset + f] = val0 * factor;
          b += 3;

          let val1 = bytes[b]! | (bytes[b + 1]! << 8) | (bytes[b + 2]! << 16);
          if (val1 & 0x800000) val1 |= 0xff000000;
          right[targetOffset + f] = val1 * factor;
          b += 3;
        }
      } else {
        for (let f = 0; f < frameCount; f++) {
          for (let ch = 0; ch < info.channelCount; ch++) {
            let val = bytes[b]! | (bytes[b + 1]! << 8) | (bytes[b + 2]! << 16);
            if (val & 0x800000) val |= 0xff000000;
            channels[ch]![targetOffset + f] = val * factor;
            b += 3;
          }
        }
      }
      return channels;
    }

    if (info.bitsPerSample === 32) {
      const isAligned = startByte % 4 === 0;
      const int32 = isAligned
        ? new Int32Array(buffer, startByte, frameCount * info.channelCount)
        : new Int32Array(
            bytes.slice(skipBytes, skipBytes + frameCount * info.blockAlign)
              .buffer,
          );
      const factor = 1 / 2147483648;

      if (info.channelCount === 1) {
        const out = channels[0]!;
        for (let i = 0; i < frameCount; i++) {
          out[targetOffset + i] = int32[i]! * factor;
        }
      } else if (info.channelCount === 2) {
        const left = channels[0]!;
        const right = channels[1]!;
        let srcIdx = 0;
        for (let i = 0; i < frameCount; i++) {
          left[targetOffset + i] = int32[srcIdx++]! * factor;
          right[targetOffset + i] = int32[srcIdx++]! * factor;
        }
      } else {
        let srcIdx = 0;
        for (let f = 0; f < frameCount; f++) {
          for (let ch = 0; ch < info.channelCount; ch++) {
            channels[ch]![targetOffset + f] = int32[srcIdx++]! * factor;
          }
        }
      }
      return channels;
    }

    if (info.bitsPerSample === 8) {
      const factor = 1 / 128;
      let b = skipBytes;
      if (info.channelCount === 1) {
        const out = channels[0]!;
        for (let f = 0; f < frameCount; f++) {
          out[targetOffset + f] = (bytes[b++]! - 128) * factor;
        }
      } else if (info.channelCount === 2) {
        const left = channels[0]!;
        const right = channels[1]!;
        for (let f = 0; f < frameCount; f++) {
          left[targetOffset + f] = (bytes[b++]! - 128) * factor;
          right[targetOffset + f] = (bytes[b++]! - 128) * factor;
        }
      } else {
        for (let f = 0; f < frameCount; f++) {
          for (let ch = 0; ch < info.channelCount; ch++) {
            channels[ch]![targetOffset + f] = (bytes[b++]! - 128) * factor;
          }
        }
      }
      return channels;
    }
  }

  // Format 3: 32-bit Float
  if (info.format === FLOAT_FORMAT && info.bitsPerSample === 32) {
    const isAligned = startByte % 4 === 0;
    const f32 = isAligned
      ? new Float32Array(buffer, startByte, frameCount * info.channelCount)
      : new Float32Array(
          bytes.slice(skipBytes, skipBytes + frameCount * info.blockAlign)
            .buffer,
        );

    if (info.channelCount === 1) {
      channels[0]!.set(f32, targetOffset);
    } else if (info.channelCount === 2) {
      const left = channels[0]!;
      const right = channels[1]!;
      let srcIdx = 0;
      for (let i = 0; i < frameCount; i++) {
        left[targetOffset + i] = f32[srcIdx++]!;
        right[targetOffset + i] = f32[srcIdx++]!;
      }
    } else {
      let srcIdx = 0;
      for (let f = 0; f < frameCount; f++) {
        for (let ch = 0; ch < info.channelCount; ch++) {
          channels[ch]![targetOffset + f] = f32[srcIdx++]!;
        }
      }
    }
    return channels;
  }

  throw new Error(
    `Unsupported WAV format ${info.format} with ${info.bitsPerSample} bits per sample`,
  );
}

function viewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
