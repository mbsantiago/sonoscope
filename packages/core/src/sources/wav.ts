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

type AlignedConstructor = {
  readonly BYTES_PER_ELEMENT: number;
  new (
    buffer: ArrayBufferLike,
    byteOffset?: number,
    length?: number,
  ): Int16Array | Int32Array | Float32Array;
};

function alignedSamples(
  Ctor: AlignedConstructor,
  bytes: Uint8Array,
  skipBytes: number,
  startByte: number,
  count: number,
): Int16Array | Int32Array | Float32Array {
  const isAligned = startByte % Ctor.BYTES_PER_ELEMENT === 0;
  return isAligned
    ? new Ctor(bytes.buffer, startByte, count)
    : new Ctor(
        bytes.slice(skipBytes, skipBytes + count * Ctor.BYTES_PER_ELEMENT)
          .buffer,
      );
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
  const { channelCount } = info;
  let sampleAt: (index: number) => number;

  if (info.format === PCM_FORMAT && info.bitsPerSample === 16) {
    const pcm = alignedSamples(
      Int16Array,
      bytes,
      skipBytes,
      startByte,
      frameCount * channelCount,
    );
    const factor = 1 / 32768;
    sampleAt = (index) => pcm[index]! * factor;
  } else if (info.format === PCM_FORMAT && info.bitsPerSample === 32) {
    const pcm = alignedSamples(
      Int32Array,
      bytes,
      skipBytes,
      startByte,
      frameCount * channelCount,
    );
    const factor = 1 / 2147483648;
    sampleAt = (index) => pcm[index]! * factor;
  } else if (info.format === FLOAT_FORMAT && info.bitsPerSample === 32) {
    const f32 = alignedSamples(
      Float32Array,
      bytes,
      skipBytes,
      startByte,
      frameCount * channelCount,
    );
    sampleAt = (index) => f32[index]!;
  } else if (info.format === PCM_FORMAT && info.bitsPerSample === 8) {
    const factor = 1 / 128;
    sampleAt = (index) => (bytes[skipBytes + index]! - 128) * factor;
  } else if (info.format === PCM_FORMAT && info.bitsPerSample === 24) {
    const factor = 1 / 8388608;
    sampleAt = (index) => {
      const b = skipBytes + index * 3;
      let val = bytes[b]! | (bytes[b + 1]! << 8) | (bytes[b + 2]! << 16);
      if (val & 0x800000) val |= 0xff000000;
      return val * factor;
    };
  } else {
    throw new Error(
      `Unsupported WAV format ${info.format} with ${info.bitsPerSample} bits per sample`,
    );
  }

  for (let f = 0; f < frameCount; f++) {
    for (let ch = 0; ch < channelCount; ch++) {
      channels[ch]![targetOffset + f] = sampleAt(f * channelCount + ch);
    }
  }
  return channels;
}

function viewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
