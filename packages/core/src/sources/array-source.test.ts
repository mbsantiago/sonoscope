import { describe, expect, it } from "vitest";
import { ArrayAudioSource } from "./array-source";

describe("ArrayAudioSource", () => {
  it("initializes from a 1D Float32Array mono audio", () => {
    const data = new Float32Array(44100 * 2); // 2 seconds at 44.1kHz
    data[44100] = 0.5;
    const source = new ArrayAudioSource(data, 44100);

    expect(source.sampleRate).toBe(44100);
    expect(source.channelCount).toBe(1);
    expect(source.duration).toBeCloseTo(2.0);

    const chunk = source.read({ channel: 0, startTime: 1.0, endTime: 1.001 });
    expect(chunk[0]).toBeCloseTo(0.5);
  });

  it("initializes from 2D multi-channel Float32Array", () => {
    const left = new Float32Array(48000);
    const right = new Float32Array(48000);
    left[0] = 0.8;
    right[0] = -0.8;
    const source = new ArrayAudioSource([left, right], 48000);

    expect(source.channelCount).toBe(2);
    expect(source.duration).toBeCloseTo(1.0);
    expect(
      source.read({ channel: 0, startTime: 0, endTime: 0.1 })[0],
    ).toBeCloseTo(0.8);
    expect(
      source.read({ channel: 1, startTime: 0, endTime: 0.1 })[0],
    ).toBeCloseTo(-0.8);
  });

  it("supports number[] array inputs", () => {
    const source = new ArrayAudioSource([0.1, 0.2, 0.3, 0.4], 4);
    expect(source.sampleRate).toBe(4);
    expect(source.duration).toBe(1.0);
    expect(source.channelCount).toBe(1);
  });

  it("throws error for invalid channel access", () => {
    const source = new ArrayAudioSource([0.1, 0.2], 44100);
    expect(() => source.read({ channel: 1, startTime: 0, endTime: 1 })).toThrow(
      /Invalid channel/,
    );
  });

  it("throws error for invalid sample rate", () => {
    expect(() => new ArrayAudioSource([0.1], 0)).toThrow(/Invalid sample rate/);
  });
});
