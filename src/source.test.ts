import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioSourceFromUrl, DecodedAudioSource } from "./source";
import { StreamingWavSource } from "./streaming-wav-source";

function makeBuffer(): AudioBuffer {
  return {
    sampleRate: 10,
    duration: 1,
    length: 10,
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  } as unknown as AudioBuffer;
}

function wavHeader(sampleRate: number): ArrayBuffer {
  const data = new ArrayBuffer(44);
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36, true);
  bytes.set([87, 65, 86, 69], 8);
  bytes.set([102, 109, 116, 32], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, 0, true);
  return data;
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).fetch;
  delete (globalThis as Partial<typeof globalThis>).AudioContext;
});

describe("DecodedAudioSource", () => {
  it("uses the decoded AudioBuffer sample rate", () => {
    const source = new DecodedAudioSource(
      { ...makeBuffer(), sampleRate: 96_000 } as AudioBuffer,
      "fixture",
    );

    expect(source.sampleRate).toBe(96_000);
  });

  it("reads a time range as a copied Float32Array", () => {
    const source = new DecodedAudioSource(makeBuffer(), "fixture");
    expect(
      Array.from(source.read({ channel: 0, startTime: 0.2, endTime: 0.5 })),
    ).toEqual([2, 3, 4]);
  });

  it("decodes WAV files using the file sample rate by default", async () => {
    const contexts: Array<{ sampleRate?: number }> = [];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(wavHeader(192_000)),
    }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(
      this: { decodeAudioData: () => Promise<AudioBuffer> },
      options?: AudioContextOptions,
    ) {
      contexts.push(
        options?.sampleRate === undefined
          ? {}
          : { sampleRate: options.sampleRate },
      );
      this.decodeAudioData = () => Promise.resolve(makeBuffer());
    }) as unknown as typeof AudioContext;

    await DecodedAudioSource.fromUrl("bat.wav");

    expect(contexts).toEqual([{ sampleRate: 192_000 }]);
  });

  it("allows callers to force the decode sample rate", async () => {
    const contexts: Array<{ sampleRate?: number }> = [];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(wavHeader(96_000)),
    }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(
      this: { decodeAudioData: () => Promise<AudioBuffer> },
      options?: AudioContextOptions,
    ) {
      contexts.push(
        options?.sampleRate === undefined
          ? {}
          : { sampleRate: options.sampleRate },
      );
      this.decodeAudioData = () => Promise.resolve(makeBuffer());
    }) as unknown as typeof AudioContext;

    await DecodedAudioSource.fromUrl("bat.wav", { sampleRate: 384_000 });

    expect(contexts).toEqual([{ sampleRate: 384_000 }]);
  });
});

describe("createAudioSourceFromUrl", () => {
  it("uses StreamingWavSource for WAV URLs", async () => {
    const streaming = vi
      .spyOn(StreamingWavSource, "fromByteSource")
      .mockResolvedValue({
        id: "streaming",
        sampleRate: 10,
        duration: 1,
        channelCount: 1,
        read: () => new Float32Array(0),
      } as unknown as StreamingWavSource);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFrom(new Uint8Array(wavHeader(10))),
    }) as typeof fetch;

    const source = await createAudioSourceFromUrl("bat.wav");

    expect(source.id).toBe("streaming");
    expect(streaming).toHaveBeenCalledTimes(1);
  });

  it("falls back to DecodedAudioSource for unknown URLs and passes options through", async () => {
    const options = { sampleRate: 96_000 };
    const decoded = vi
      .spyOn(DecodedAudioSource, "fromUrl")
      .mockResolvedValue(new DecodedAudioSource(makeBuffer(), "decoded"));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: streamFrom(Uint8Array.from([1, 2, 3, 4])),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }) as typeof fetch;

    const source = await createAudioSourceFromUrl("bat.mp3", options);

    expect(source.id).toBe("decoded");
    expect(decoded).toHaveBeenCalledWith("bat.mp3", options);
  });

  it("falls back to DecodedAudioSource when WAV streaming fails", async () => {
    const options = { sampleRate: 48_000 };
    vi.spyOn(StreamingWavSource, "fromByteSource").mockRejectedValue(
      new Error("unsupported wav"),
    );
    const decoded = vi
      .spyOn(DecodedAudioSource, "fromUrl")
      .mockResolvedValue(
        new DecodedAudioSource(makeBuffer(), "decoded-after-streaming-failure"),
      );
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: streamFrom(new Uint8Array(wavHeader(10))),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(wavHeader(10)),
      }) as typeof fetch;

    const source = await createAudioSourceFromUrl("unsupported.wav", options);

    expect(source.id).toBe("decoded-after-streaming-failure");
    expect(decoded).toHaveBeenCalledWith("unsupported.wav", options);
  });
});
