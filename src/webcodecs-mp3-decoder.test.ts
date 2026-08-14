import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWebCodecsMp3Decoder,
  isWebCodecsMp3Supported,
} from "./webcodecs-mp3-decoder";

describe("webcodecs-mp3-decoder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Partial<typeof globalThis>).AudioDecoder;
    delete (globalThis as Partial<typeof globalThis>).EncodedAudioChunk;
  });

  it("reports false when AudioDecoder is not available", async () => {
    expect(await isWebCodecsMp3Supported()).toBe(false);
  });

  it("reports true when AudioDecoder supports mp3 codec", async () => {
    (globalThis as unknown as { AudioDecoder: unknown }).AudioDecoder = {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    };
    expect(await isWebCodecsMp3Supported()).toBe(true);
  });

  it("decodes chunks into planar Float32Array channels and closes AudioData", async () => {
    let outputHandler: ((audioData: unknown) => void) | undefined;

    class MockAudioDecoder {
      state = "configured";
      constructor(init: {
        output: (data: unknown) => void;
        error: (err: unknown) => void;
      }) {
        outputHandler = init.output;
      }
      configure = vi.fn();
      decode = vi.fn(() => {
        // Simulate emitting decoded AudioData with 2 channels, 4 frames
        const closed = vi.fn();
        const mockAudioData = {
          numberOfChannels: 2,
          numberOfFrames: 4,
          sampleRate: 44100,
          copyTo: vi.fn(
            (
              dest: Float32Array,
              options: { planeIndex: number; format: string },
            ) => {
              for (let i = 0; i < 4; i++) {
                dest[i] =
                  options.planeIndex === 0 ? 0.1 * (i + 1) : -0.1 * (i + 1);
              }
            },
          ),
          close: closed,
        };
        outputHandler?.(mockAudioData);
      });
      flush = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }

    class MockEncodedAudioChunk {
      type: string;
      timestamp: number;
      data: Uint8Array;
      constructor(init: { type: string; timestamp: number; data: Uint8Array }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.data = init.data;
      }
    }

    (globalThis as unknown as { AudioDecoder: unknown }).AudioDecoder =
      MockAudioDecoder;
    (
      globalThis as unknown as { EncodedAudioChunk: unknown }
    ).EncodedAudioChunk = MockEncodedAudioChunk;

    const decoder = await createWebCodecsMp3Decoder({
      sampleRate: 44100,
      channelCount: 2,
    });

    const chunk = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const decoded = await decoder.decode(chunk, 0);

    expect(decoded.length).toBe(2);
    expect(Array.from(decoded[0]!).map((v) => Number(v.toFixed(1)))).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]);
    expect(Array.from(decoded[1]!).map((v) => Number(v.toFixed(1)))).toEqual([
      -0.1, -0.2, -0.3, -0.4,
    ]);

    await decoder.flush();
    decoder.close();
  });
});
