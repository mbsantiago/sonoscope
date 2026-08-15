export type Mp3FrameHeader = {
  version: number; // 1, 2, or 2.5
  layer: number; // 1, 2, or 3
  sampleRate: number;
  channelCount: number;
  bitrate: number; // in kbps
  padding: number;
  samplesPerFrame: number;
  frameLength: number; // in bytes
  hasCrc: boolean;
};

export type Mp3Info = {
  sampleRate: number;
  channelCount: number;
  duration: number;
  firstFrameOffset: number;
  isVbr: boolean;
  totalFrames?: number;
  totalBytes?: number;
};

const BITRATES_MPEG1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_MPEG1_L2 = [
  0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384,
];
const BITRATES_MPEG1_L1 = [
  0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448,
];
const BITRATES_MPEG2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const BITRATES_MPEG2_L1 = [
  0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256,
];

const SAMPLE_RATES_MPEG1 = [44100, 48000, 32000];
const SAMPLE_RATES_MPEG2 = [22050, 24000, 16000];
const SAMPLE_RATES_MPEG25 = [11025, 12000, 8000];

export function parseId3Header(bytes: Uint8Array): { id3Size: number } | null {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return null;
  }
  const flags = bytes[5]!;
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const footerSize = (flags & 0x10) !== 0 ? 10 : 0;
  return { id3Size: 10 + size + footerSize };
}

export function parseMp3FrameHeader(
  bytes: Uint8Array,
  offset = 0,
): Mp3FrameHeader | null {
  if (offset + 4 > bytes.length) return null;

  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;

  // Sync bits: 11 bits set (0xFFE0 mask)
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0x03;
  if (versionBits === 1) return null; // reserved

  let version = 1;
  if (versionBits === 0) version = 2.5;
  else if (versionBits === 2) version = 2;

  const layerBits = (b1 >> 1) & 0x03;
  if (layerBits === 0) return null; // reserved

  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
  const hasCrc = (b1 & 0x01) === 0;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  if (bitrateIndex === 0 || bitrateIndex === 15) return null; // bad / free format

  let bitrate = 0;
  if (version === 1) {
    if (layer === 3) bitrate = BITRATES_MPEG1_L3[bitrateIndex] ?? 0;
    else if (layer === 2) bitrate = BITRATES_MPEG1_L2[bitrateIndex] ?? 0;
    else bitrate = BITRATES_MPEG1_L1[bitrateIndex] ?? 0;
  } else {
    if (layer === 1) bitrate = BITRATES_MPEG2_L1[bitrateIndex] ?? 0;
    else bitrate = BITRATES_MPEG2_L3[bitrateIndex] ?? 0;
  }
  if (bitrate === 0) return null;

  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (sampleRateIndex === 3) return null; // reserved

  let sampleRate = 0;
  if (version === 1) sampleRate = SAMPLE_RATES_MPEG1[sampleRateIndex] ?? 0;
  else if (version === 2) sampleRate = SAMPLE_RATES_MPEG2[sampleRateIndex] ?? 0;
  else sampleRate = SAMPLE_RATES_MPEG25[sampleRateIndex] ?? 0;
  if (sampleRate === 0) return null;

  const padding = (b2 >> 1) & 0x01;
  const channelMode = (b3 >> 6) & 0x03;
  const channelCount = channelMode === 3 ? 1 : 2;

  let samplesPerFrame = 1152;
  let frameLength = 0;

  if (layer === 1) {
    samplesPerFrame = 384;
    frameLength = Math.floor(
      ((12 * bitrate * 1000) / sampleRate + padding) * 4,
    );
  } else if (layer === 2) {
    samplesPerFrame = 1152;
    frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
  } else {
    samplesPerFrame = version === 1 ? 1152 : 576;
    const coef = version === 1 ? 144 : 72;
    frameLength = Math.floor((coef * bitrate * 1000) / sampleRate) + padding;
  }

  if (frameLength <= 4) return null;

  return {
    version,
    layer,
    sampleRate,
    channelCount,
    bitrate,
    padding,
    samplesPerFrame,
    frameLength,
    hasCrc,
  };
}

export function findNextMp3Frame(
  bytes: Uint8Array,
  startOffset = 0,
): { offset: number; header: Mp3FrameHeader } | null {
  let offset = startOffset;
  if (startOffset === 0) {
    const id3 = parseId3Header(bytes);
    if (id3) {
      offset = id3.id3Size;
    }
  }

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] === 0xff && (bytes[offset + 1]! & 0xe0) === 0xe0) {
      const header = parseMp3FrameHeader(bytes, offset);
      if (header) {
        // If there's enough data to check the NEXT frame, verify it matches to avoid false syncs in audio payload
        const nextFrameOffset = offset + header.frameLength;
        if (nextFrameOffset + 4 <= bytes.length) {
          const nextHeader = parseMp3FrameHeader(bytes, nextFrameOffset);
          if (
            nextHeader &&
            nextHeader.sampleRate === header.sampleRate &&
            nextHeader.version === header.version &&
            nextHeader.layer === header.layer
          ) {
            return { offset, header };
          }
          // If next frame header didn't match, this was likely a false sync in the bitstream
          offset++;
          continue;
        }
        return { offset, header };
      }
    }
    offset++;
  }
  return null;
}

export function isMp3Bytes(bytes: Uint8Array): boolean {
  if (parseId3Header(bytes)) return true;
  return findNextMp3Frame(bytes, 0) !== null;
}

export function parseXingHeader(
  bytes: Uint8Array,
  frameOffset: number,
  header: Mp3FrameHeader,
): { frameCount?: number; byteCount?: number; isVbr: boolean } | null {
  const baseHeaderSize = header.hasCrc ? 6 : 4;
  let sideInfoSize = 0;
  if (header.version === 1) {
    sideInfoSize = header.channelCount === 1 ? 17 : 32;
  } else {
    sideInfoSize = header.channelCount === 1 ? 9 : 17;
  }

  const xingOffset = frameOffset + baseHeaderSize + sideInfoSize;
  if (xingOffset + 8 <= bytes.length) {
    const tag = text(bytes, xingOffset, 4);
    if (tag === "Xing" || tag === "Info") {
      const isVbr = tag === "Xing";
      const view = viewFor(bytes);
      const flags = view.getUint32(xingOffset + 4, false);
      let cursor = xingOffset + 8;
      let frameCount: number | undefined;
      let byteCount: number | undefined;

      if ((flags & 0x0001) !== 0 && cursor + 4 <= bytes.length) {
        frameCount = view.getUint32(cursor, false);
        cursor += 4;
      }
      if ((flags & 0x0002) !== 0 && cursor + 4 <= bytes.length) {
        byteCount = view.getUint32(cursor, false);
        cursor += 4;
      }
      return {
        isVbr,
        ...(frameCount !== undefined ? { frameCount } : {}),
        ...(byteCount !== undefined ? { byteCount } : {}),
      };
    }
  }

  const vbriOffset = frameOffset + baseHeaderSize + 32;
  if (vbriOffset + 18 <= bytes.length) {
    const tag = text(bytes, vbriOffset, 4);
    if (tag === "VBRI") {
      const view = viewFor(bytes);
      const byteCount = view.getUint32(vbriOffset + 10, false);
      const frameCount = view.getUint32(vbriOffset + 14, false);
      return {
        isVbr: true,
        frameCount,
        byteCount,
      };
    }
  }

  return null;
}

export function parseMp3Info(bytes: Uint8Array, totalBytes?: number): Mp3Info {
  const frame = findNextMp3Frame(bytes, 0);
  if (!frame) {
    throw new Error("No MP3 frame found in audio stream");
  }

  const { offset, header } = frame;
  const xing = parseXingHeader(bytes, offset, header);

  let duration = header.samplesPerFrame / header.sampleRate;
  let isVbr = false;
  let totalFrames: number | undefined;
  let reportedByteCount: number | undefined;

  if (xing) {
    isVbr = xing.isVbr;
    totalFrames = xing.frameCount;
    reportedByteCount = xing.byteCount;
    if (totalFrames && totalFrames > 0) {
      duration = (totalFrames * header.samplesPerFrame) / header.sampleRate;
    }
  }

  if (!totalFrames && totalBytes && totalBytes > offset) {
    const audioBytes = totalBytes - offset;
    // Duration in seconds = (bytes * 8) / (bitrate * 1000)
    duration = (audioBytes * 8) / (header.bitrate * 1000);
  }

  const finalTotalBytes = reportedByteCount ?? totalBytes;

  return {
    sampleRate: header.sampleRate,
    channelCount: header.channelCount,
    duration,
    firstFrameOffset: offset,
    isVbr,
    ...(totalFrames !== undefined ? { totalFrames } : {}),
    ...(finalTotalBytes !== undefined ? { totalBytes: finalTotalBytes } : {}),
  };
}

function viewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
