import { describe, expect, it } from "vitest";
import {
  decodeWavPcm,
  isWavBytes,
  parseWavHeader,
  wavTimeToByteRange,
} from "./wav";

function wavBytes(options: {
  format?: number;
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  samples: number[];
}): Uint8Array {
  const format = options.format ?? 1;
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 4;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = options.samples.length * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + dataSize, true);
  bytes.set([87, 65, 86, 69], 8);
  bytes.set([102, 109, 116, 32], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of options.samples) {
    if (bitsPerSample === 8) view.setUint8(offset, sample);
    if (bitsPerSample === 16) view.setInt16(offset, sample, true);
    if (bitsPerSample === 24) {
      view.setUint8(offset, sample & 0xff);
      view.setUint8(offset + 1, (sample >> 8) & 0xff);
      view.setUint8(offset + 2, (sample >> 16) & 0xff);
    }
    if (bitsPerSample === 32 && format === 1)
      view.setInt32(offset, sample, true);
    if (bitsPerSample === 32 && format === 3)
      view.setFloat32(offset, sample, true);
    offset += bytesPerSample;
  }
  return bytes;
}

describe("wav helpers", () => {
  it("parses RIFF/WAVE metadata", () => {
    const info = parseWavHeader(
      wavBytes({
        channels: 2,
        sampleRate: 8,
        bitsPerSample: 16,
        samples: [0, 0, 100, -100],
      }),
    );
    expect(info).toMatchObject({
      format: 1,
      channelCount: 2,
      sampleRate: 8,
      bitsPerSample: 16,
      dataOffset: 44,
      dataSize: 8,
    });
    expect(info.duration).toBe(0.25);
  });

  it("detects WAV bytes", () => {
    expect(isWavBytes(wavBytes({ samples: [0] }))).toBe(true);
    expect(isWavBytes(Uint8Array.from([1, 2, 3, 4]))).toBe(false);
  });

  it("decodes interleaved 16-bit PCM to per-channel float arrays", () => {
    const bytes = wavBytes({
      channels: 2,
      sampleRate: 2,
      bitsPerSample: 16,
      samples: [0, 32767, -32768, 16384],
    });
    const info = parseWavHeader(bytes);
    const channels = decodeWavPcm(
      bytes.slice(info.dataOffset),
      info,
      info.dataOffset,
    );
    expect(
      Array.from(channels[0]!).map((value) => Number(value.toFixed(4))),
    ).toEqual([0, -1]);
    expect(
      Array.from(channels[1]!).map((value) => Number(value.toFixed(4))),
    ).toEqual([1, 0.5]);
  });

  it("decodes 8-bit unsigned PCM", () => {
    const bytes = wavBytes({ bitsPerSample: 8, samples: [0, 128, 255] });
    const info = parseWavHeader(bytes);
    const values = Array.from(
      decodeWavPcm(bytes.slice(info.dataOffset), info, info.dataOffset)[0]!,
    ).map((value) => Number(value.toFixed(4)));
    expect(values).toEqual([-1, 0, 0.9922]);
  });

  it("decodes 24-bit and 32-bit samples", () => {
    const pcm24 = wavBytes({
      bitsPerSample: 24,
      samples: [0x7fffff, -0x800000],
    });
    const info24 = parseWavHeader(pcm24);
    expect(
      Array.from(
        decodeWavPcm(
          pcm24.slice(info24.dataOffset),
          info24,
          info24.dataOffset,
        )[0]!,
      ).map((value) => Math.round(value)),
    ).toEqual([1, -1]);

    const float32 = wavBytes({
      format: 3,
      bitsPerSample: 32,
      samples: [0.25, -0.5],
    });
    const info32 = parseWavHeader(float32);
    expect(
      Array.from(
        decodeWavPcm(
          float32.slice(info32.dataOffset),
          info32,
          info32.dataOffset,
        )[0]!,
      ),
    ).toEqual([0.25, -0.5]);
  });

  it("converts time ranges to frame-aligned byte ranges", () => {
    const info = parseWavHeader(
      wavBytes({
        channels: 2,
        sampleRate: 10,
        bitsPerSample: 16,
        samples: Array.from({ length: 20 }, () => 0),
      }),
    );
    expect(wavTimeToByteRange(info, 0.2, 0.5)).toEqual({ start: 52, end: 64 });
  });

  it("throws for unsupported WAV variants", () => {
    expect(() =>
      parseWavHeader(wavBytes({ format: 6, bitsPerSample: 8, samples: [0] })),
    ).toThrow(/Unsupported WAV format/);
  });
});
