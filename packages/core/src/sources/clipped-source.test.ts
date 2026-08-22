import type { AudioSource } from "../types";
import { describe, expect, it } from "vitest";
import { ClippedAudioSource, clipAudioSource } from "./clipped-source";

function createMockSource(duration = 20, sampleRate = 1000): AudioSource {
  return {
    sampleRate,
    duration,
    channelCount: 1,
    id: `mock:${duration}:${sampleRate}`,
    read({ channel, startTime, endTime }) {
      if (channel !== 0) throw new Error("Invalid channel");
      const length = Math.floor((endTime - startTime) * sampleRate);
      const data = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        data[i] = (startTime * sampleRate + i) / sampleRate;
      }
      return data;
    },
  };
}

describe("ClippedAudioSource", () => {
  it("initializes clip bounds within underlying source duration", () => {
    const source = createMockSource(30);
    const clipped = new ClippedAudioSource(source, {
      clipStart: 5,
      clipEnd: 15,
    });

    expect(clipped.clipStart).toBe(5);
    expect(clipped.clipEnd).toBe(15);
    expect(clipped.clipDuration).toBe(10);
    expect(clipped.sampleRate).toBe(1000);
    expect(clipped.channelCount).toBe(1);
    expect(clipped.duration).toBe(30);
  });

  it("clamps requested reads to clip bounds and zero-pads outside bounds", () => {
    const source = createMockSource(30, 100);
    const clipped = new ClippedAudioSource(source, {
      clipStart: 5,
      clipEnd: 10,
    });

    // Request exactly within bounds
    const read1 = clipped.read({
      channel: 0,
      startTime: 5,
      endTime: 7,
    }) as Float32Array;
    expect(read1.length).toBe(200);
    expect(read1[0]).toBeCloseTo(5);

    // Request starting before clipStart: 4s to 6s (1s zeros, 1s real samples)
    const read2 = clipped.read({
      channel: 0,
      startTime: 4,
      endTime: 6,
    }) as Float32Array;
    expect(read2.length).toBe(200);
    expect(read2[0]).toBe(0); // Before clipStart -> zero padded
    expect(read2[99]).toBe(0);
    expect(read2[100]).toBeCloseTo(5); // At clipStart

    // Request entirely outside clip bounds (e.g. 0 to 2s)
    const read3 = clipped.read({
      channel: 0,
      startTime: 0,
      endTime: 2,
    }) as Float32Array;
    expect(read3.length).toBe(200);
    expect(read3.every((v) => v === 0)).toBe(true);
  });

  it("dynamically updates clip bounds via setClipBounds", () => {
    const source = createMockSource(30);
    const clipped = new ClippedAudioSource(source, {
      clipStart: 5,
      clipEnd: 15,
    });

    let eventEmitted = false;
    clipped.on("clipchange", (e) => {
      eventEmitted = true;
      expect(e.clipStart).toBe(8);
      expect(e.clipEnd).toBe(22);
    });

    clipped.setClipBounds({ clipStart: 8, clipEnd: 22 });
    expect(clipped.clipStart).toBe(8);
    expect(clipped.clipEnd).toBe(22);
    expect(clipped.clipDuration).toBe(14);
    expect(eventEmitted).toBe(true);
  });

  it("clipAudioSource helper un-nests already clipped sources", () => {
    const source = createMockSource(30);
    const clipped1 = clipAudioSource(source, { clipStart: 2, clipEnd: 20 });
    const clipped2 = clipAudioSource(clipped1, { clipStart: 5, clipEnd: 12 });

    expect(clipped2.underlyingSource).toBe(source);
    expect(clipped2.clipStart).toBe(5);
    expect(clipped2.clipEnd).toBe(12);
  });
});
