import type { ByteStreamSource } from "./byte-source";
import type { Mp3Decoder } from "./webcodecs-mp3-decoder";
import { describe, expect, it, vi } from "vitest";
import { StreamingMp3Source } from "./streaming-mp3-source";

// Helper to create an MP3 frame: MPEG1, L3, 128kbps, 44100Hz, Stereo
function createMp3Frame(
  bitrateKbps = 128,
  sampleRateHz = 44100,
  padding = 0,
): Uint8Array {
  const frameLength =
    Math.floor((144 * bitrateKbps * 1000) / sampleRateHz) + padding;
  const frame = new Uint8Array(frameLength);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG 1, Layer III, no CRC
  frame[2] = 0x90 | (padding << 1); // 128 kbps, 44.1 kHz
  frame[3] = 0x00; // Stereo
  return frame;
}

function controllableSource(): {
  source: ByteStreamSource;
  push(chunk: Uint8Array): void;
  close(): void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  return {
    source: {
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(next) {
            controller = next;
          },
        }),
    },
    push(chunk) {
      controller?.enqueue(chunk);
    },
    close() {
      controller?.close();
    },
  };
}

function createMockDecoderFactory(samplesPerFrame = 1152) {
  return vi
    .fn()
    .mockImplementation(
      async (config: { sampleRate: number; channelCount: number }) => {
        let frameIndex = 0;
        const decoder: Mp3Decoder = {
          decode: vi.fn(async (_chunk: Uint8Array) => {
            const out = Array.from({ length: config.channelCount }, () => {
              const arr = new Float32Array(samplesPerFrame);
              for (let i = 0; i < samplesPerFrame; i++) {
                arr[i] = Math.sin((frameIndex * samplesPerFrame + i) * 0.1);
              }
              return arr;
            });
            frameIndex++;
            return out;
          }),
          flush: vi.fn(async () => []),
          close: vi.fn(),
        };
        return decoder;
      },
    );
}

describe("StreamingMp3Source", () => {
  it("initializes metadata from the first MP3 frame", async () => {
    const frame = createMp3Frame(128, 44100);
    const stream = controllableSource();
    const decoderFactory = createMockDecoderFactory();

    const promise = StreamingMp3Source.fromByteSource(stream.source, {
      decoderFactory,
    });
    stream.push(frame);
    const source = await promise;

    expect(source.sampleRate).toBe(44100);
    expect(source.channelCount).toBe(2);
    expect(source.duration).toBeGreaterThan(0);
  });

  it("waits for missing samples and resolves reads as chunks arrive", async () => {
    const frame1 = createMp3Frame(128, 44100);
    const frame2 = createMp3Frame(128, 44100);
    const stream = controllableSource();
    const decoderFactory = createMockDecoderFactory(100);

    const promise = StreamingMp3Source.fromByteSource(stream.source, {
      decoderFactory,
    });
    stream.push(frame1);
    const source = await promise;

    // Request samples from time 0 to 0.003s (~132 samples at 44.1kHz, so requires frame 2)
    const read = source.read({ channel: 0, startTime: 0, endTime: 0.003 });
    let resolved = false;
    void Promise.resolve(read).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Push second frame
    stream.push(frame2);
    const samples = await read;
    expect(samples.length).toBeGreaterThan(0);
  });

  it("emits available ranges when chunks decode", async () => {
    const frame1 = createMp3Frame(128, 44100);
    const frame2 = createMp3Frame(128, 44100);
    const stream = controllableSource();
    const decoderFactory = createMockDecoderFactory(1152);

    const promise = StreamingMp3Source.fromByteSource(stream.source, {
      decoderFactory,
    });
    stream.push(frame1);
    const source = await promise;

    const handler = vi.fn();
    source.onRangeAvailable(handler);

    stream.push(frame2);
    // Give async decode a microtick
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalled();
  });
});
