import { describe, expect, it } from "vitest";
import { isWavBytes, parseWavHeader } from "./wav";
import { encodeWavBlob, encodeWavBuffer } from "./wav-encoder";

describe("wav-encoder", () => {
  it("encodes valid 16-bit PCM mono WAV header and data", () => {
    const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = encodeWavBuffer(samples, 44100);
    const uint8 = new Uint8Array(buffer);

    expect(isWavBytes(uint8)).toBe(true);
    const header = parseWavHeader(uint8);
    expect(header.format).toBe(1); // PCM
    expect(header.channelCount).toBe(1);
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
    expect(header.dataSize).toBe(samples.length * 2);
  });

  it("encodes valid stereo WAV", () => {
    const left = new Float32Array(100);
    const right = new Float32Array(100);
    const blob = encodeWavBlob([left, right], 48000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 100 * 2 * 2); // 44 header + 100 samples * 2 channels * 2 bytes
  });

  it("encodes 32-bit float WAV format when specified", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const buffer = encodeWavBuffer(samples, 44100, { bitDepth: 32 });
    const header = parseWavHeader(new Uint8Array(buffer));
    expect(header.format).toBe(3); // IEEE float
    expect(header.bitsPerSample).toBe(32);
    expect(header.dataSize).toBe(3 * 4);
  });
});
