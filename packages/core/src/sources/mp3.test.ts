import { describe, expect, it } from "vitest";
import {
  findNextMp3Frame,
  isMp3Bytes,
  parseId3Header,
  parseMp3FrameHeader,
  parseMp3Info,
  parseXingHeader,
} from "./mp3";

// Helper to create an MP3 frame header
// MPEG 1, Layer III, 128 kbps, 44100 Hz, Stereo, no padding, no CRC
// Sync (11 bits): 0xFF, 0xFB (11111111 11111011) -> MPEG 1, Layer III, no CRC
// Byte 2: 128kbps (1001), 44100Hz (00), padding 0, private 0 -> 0x90
// Byte 3: Stereo (00), mode ext 00, no copy, original, no emphasis -> 0x00
function createMPEG1Frame(
  bitrateKbps = 128,
  sampleRateHz = 44100,
  padding = 0,
  stereo = true,
): Uint8Array {
  const bitrateMap: Record<number, number> = {
    32: 1,
    40: 2,
    48: 3,
    56: 4,
    64: 5,
    80: 6,
    96: 7,
    112: 8,
    128: 9,
    160: 10,
    192: 11,
    224: 12,
    256: 13,
    320: 14,
  };
  const sampleRateMap: Record<number, number> = {
    44100: 0,
    48000: 1,
    32000: 2,
  };

  const b1 = 0xfb; // MPEG 1, Layer III, no CRC
  const b2 =
    ((bitrateMap[bitrateKbps] ?? 9) << 4) |
    ((sampleRateMap[sampleRateHz] ?? 0) << 2) |
    (padding << 1);
  const b3 = stereo ? 0x00 : 0xc0;

  const frameLength =
    Math.floor((144 * bitrateKbps * 1000) / sampleRateHz) + padding;
  const frame = new Uint8Array(frameLength);
  frame[0] = 0xff;
  frame[1] = b1;
  frame[2] = b2;
  frame[3] = b3;
  return frame;
}

// Helper to create ID3v2.3 header
function createId3Header(payloadSize: number): Uint8Array {
  const header = new Uint8Array(10 + payloadSize);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 3; // version 2.3
  header[4] = 0;
  header[5] = 0; // flags
  // 4 synchsafe bytes for payload size
  header[6] = (payloadSize >> 21) & 0x7f;
  header[7] = (payloadSize >> 14) & 0x7f;
  header[8] = (payloadSize >> 7) & 0x7f;
  header[9] = payloadSize & 0x7f;
  return header;
}

// Helper to create a Xing header inside an MP3 frame
function createXingFrame(
  frameCount: number,
  byteCount: number,
  isVbr = true,
): Uint8Array {
  const frame = createMPEG1Frame(128, 44100, 0, true);
  // For MPEG 1 stereo without CRC, Xing offset is 4 + 32 = 36
  const tag = isVbr ? "Xing" : "Info";
  for (let i = 0; i < 4; i++) {
    frame[36 + i] = tag.charCodeAt(i);
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  // Flags: 0x01 (frames) | 0x02 (bytes) = 0x03
  view.setUint32(40, 0x03, false);
  view.setUint32(44, frameCount, false);
  view.setUint32(48, byteCount, false);
  return frame;
}

describe("mp3 parsing", () => {
  it("detects ID3 header and returns correct total size", () => {
    const id3 = createId3Header(128);
    const parsed = parseId3Header(id3);
    expect(parsed).toEqual({ id3Size: 138 }); // 10 header + 128 payload
  });

  it("returns null for non-ID3 bytes", () => {
    const nonId3 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(parseId3Header(nonId3)).toBeNull();
  });

  it("parses MPEG 1 Layer III frame header correctly", () => {
    const frame = createMPEG1Frame(128, 44100, 0, true);
    const header = parseMp3FrameHeader(frame, 0);
    expect(header).not.toBeNull();
    expect(header?.version).toBe(1);
    expect(header?.layer).toBe(3);
    expect(header?.bitrate).toBe(128);
    expect(header?.sampleRate).toBe(44100);
    expect(header?.channelCount).toBe(2);
    expect(header?.samplesPerFrame).toBe(1152);
    expect(header?.frameLength).toBe(417); // Math.floor(144 * 128000 / 44100) = 417
    expect(header?.hasCrc).toBe(false);
  });

  it("parses MPEG 1 Layer III mono frame with padding correctly", () => {
    const frame = createMPEG1Frame(192, 44100, 1, false);
    const header = parseMp3FrameHeader(frame, 0);
    expect(header).not.toBeNull();
    expect(header?.bitrate).toBe(192);
    expect(header?.channelCount).toBe(1);
    expect(header?.padding).toBe(1);
    expect(header?.frameLength).toBe(627); // Math.floor(144 * 192000 / 44100) + 1 = 627
  });

  it("finds next frame past ID3 or junk bytes", () => {
    const id3 = createId3Header(20);
    const frame = createMPEG1Frame(128, 44100, 0, true);
    const combined = new Uint8Array(id3.length + frame.length);
    combined.set(id3, 0);
    combined.set(frame, id3.length);

    const found = findNextMp3Frame(combined, 0);
    expect(found).not.toBeNull();
    expect(found?.offset).toBe(30); // 10 header + 20 payload = 30
    expect(found?.header.sampleRate).toBe(44100);
  });

  it("identifies MP3 bytes via isMp3Bytes", () => {
    const id3 = createId3Header(20);
    expect(isMp3Bytes(id3)).toBe(true);

    const frame = createMPEG1Frame(128, 44100);
    expect(isMp3Bytes(frame)).toBe(true);

    const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]); // RIFF...WAVE
    expect(isMp3Bytes(wav)).toBe(false);
  });

  it("parses Xing header with frame count and calculates exact duration", () => {
    const xingFrame = createXingFrame(500, 208500, true);
    const header = parseMp3FrameHeader(xingFrame, 0)!;
    const xing = parseXingHeader(xingFrame, 0, header);

    expect(xing).not.toBeNull();
    expect(xing?.isVbr).toBe(true);
    expect(xing?.frameCount).toBe(500);
    expect(xing?.byteCount).toBe(208500);

    const info = parseMp3Info(xingFrame);
    expect(info.sampleRate).toBe(44100);
    expect(info.channelCount).toBe(2);
    expect(info.isVbr).toBe(true);
    expect(info.totalFrames).toBe(500);
    // duration = (500 * 1152) / 44100 = 13.061224...
    expect(info.duration).toBeCloseTo(13.0612, 4);
  });

  it("estimates duration for CBR MP3 when totalBytes is provided", () => {
    const frame = createMPEG1Frame(128, 44100);
    // total file size = 128,000 bytes (128 kbps = 16,000 bytes/sec -> duration = 8s)
    const info = parseMp3Info(frame, 128000);
    expect(info.sampleRate).toBe(44100);
    expect(info.duration).toBeCloseTo(8.0, 1);
  });
});
