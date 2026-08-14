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
): Float32Array[] {
  const bytesPerSample = info.bitsPerSample / 8;
  const skipBytes = Math.max(0, info.dataOffset - byteOffset);
  const frameBytes = Math.max(0, bytes.length - skipBytes);
  const available = bytes.slice(
    skipBytes,
    skipBytes + Math.floor(frameBytes / info.blockAlign) * info.blockAlign,
  );
  const frameCount = available.length / info.blockAlign;
  const channels = Array.from(
    { length: info.channelCount },
    () => new Float32Array(frameCount),
  );
  const view = viewFor(available);

  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < info.channelCount; channel++) {
      const offset = frame * info.blockAlign + channel * bytesPerSample;
      channels[channel]![frame] = readSample(
        view,
        offset,
        info.format,
        info.bitsPerSample,
      );
    }
  }
  return channels;
}

function readSample(
  view: DataView,
  offset: number,
  format: number,
  bitsPerSample: number,
): number {
  if (format === FLOAT_FORMAT) return view.getFloat32(offset, true);
  if (bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128;
  if (bitsPerSample === 16) return view.getInt16(offset, true) / 32768;
  if (bitsPerSample === 24) {
    let value =
      view.getUint8(offset) |
      (view.getUint8(offset + 1) << 8) |
      (view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }
  return view.getInt32(offset, true) / 2147483648;
}

function viewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
