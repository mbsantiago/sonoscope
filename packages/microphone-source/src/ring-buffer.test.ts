import { describe, expect, it } from "vitest";
import { AudioRingBuffer } from "./ring-buffer";

describe("AudioRingBuffer", () => {
  it("right-aligns audio until the history window fills", () => {
    const buffer = new AudioRingBuffer({
      sampleRate: 1_000,
      channelCount: 1,
      duration: 0.005,
    });

    buffer.append([new Float32Array([1, 2])]);

    expect(
      Array.from(
        buffer.read({
          channel: 0,
          startTime: 0,
          endTime: 0.005,
          sampleRate: 1_000,
        }),
      ),
    ).toEqual([0, 0, 0, 1, 2]);
  });

  it("retains the newest samples once the history window fills", () => {
    const buffer = new AudioRingBuffer({
      sampleRate: 1_000,
      channelCount: 1,
      duration: 0.005,
    });

    buffer.append([new Float32Array([1, 2, 3])]);
    buffer.append([new Float32Array([4, 5, 6])]);

    expect(
      Array.from(
        buffer.read({
          channel: 0,
          startTime: 0,
          endTime: 0.005,
          sampleRate: 1_000,
        }),
      ),
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it("keeps channels independent", () => {
    const buffer = new AudioRingBuffer({
      sampleRate: 1_000,
      channelCount: 2,
      duration: 0.003,
    });

    buffer.append([new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])]);

    expect(
      Array.from(
        buffer.read({
          channel: 1,
          startTime: 0,
          endTime: 0.003,
          sampleRate: 1_000,
        }),
      ),
    ).toEqual([4, 5, 6]);
  });
});
