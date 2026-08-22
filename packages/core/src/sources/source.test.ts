import type { ClippedAudioSource } from "./clipped-source";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAudioSourceFromBlob,
  createAudioSourceFromBuffer,
  createAudioSourceFromUrl,
  DecodedAudioSource,
} from "./source";
import { StreamingMp3Source } from "./streaming-mp3-source";
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
  delete (globalThis as Partial<typeof globalThis>).OfflineAudioContext;
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
    delete (globalThis as Partial<typeof globalThis>).OfflineAudioContext;
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
    delete (globalThis as Partial<typeof globalThis>).OfflineAudioContext;
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

    const source = await createAudioSourceFromUrl("bat.unknown", options);

    expect(source.id).toBe("decoded");
    expect(decoded).toHaveBeenCalledWith("bat.unknown", options);
  });

  it("uses StreamingMp3Source when MP3 bytes and WebCodecs are supported", async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    vi.spyOn(StreamingMp3Source, "isSupported").mockResolvedValue(true);
    const streaming = vi
      .spyOn(StreamingMp3Source, "fromByteSource")
      .mockResolvedValue({
        id: "streaming-mp3",
        sampleRate: 44100,
        duration: 1,
        channelCount: 2,
        read: () => new Float32Array(0),
      } as unknown as StreamingMp3Source);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFrom(mp3Bytes),
    }) as typeof fetch;

    const source = await createAudioSourceFromUrl("song.mp3");

    expect(source.id).toBe("streaming-mp3");
    expect(streaming).toHaveBeenCalledTimes(1);
  });

  it("uses DecodedAudioSource when preferDecoded is requested", async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const decoded = vi
      .spyOn(DecodedAudioSource, "fromUrl")
      .mockResolvedValue(
        new DecodedAudioSource(makeBuffer(), "decoded-mp3-explicit"),
      );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFrom(mp3Bytes),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }) as typeof fetch;

    const source = await createAudioSourceFromUrl("song.mp3", {
      preferDecoded: true,
    });

    expect(source.id).toBe("decoded-mp3-explicit");
    expect(decoded).toHaveBeenCalledWith("song.mp3", { preferDecoded: true });
  });

  it("falls back to DecodedAudioSource when MP3 streaming fails", async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    vi.spyOn(StreamingMp3Source, "isSupported").mockResolvedValue(true);
    vi.spyOn(StreamingMp3Source, "fromByteSource").mockRejectedValue(
      new Error("decoder error"),
    );
    const decoded = vi
      .spyOn(DecodedAudioSource, "fromUrl")
      .mockResolvedValue(
        new DecodedAudioSource(makeBuffer(), "decoded-after-mp3-failure"),
      );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: streamFrom(mp3Bytes),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }) as typeof fetch;

    const source = await createAudioSourceFromUrl("corrupt.mp3");

    expect(source.id).toBe("decoded-after-mp3-failure");
    expect(decoded).toHaveBeenCalledWith("corrupt.mp3", undefined);
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

describe("createAudioSourceFromBlob and createAudioSourceFromBuffer", () => {
  it("creates a StreamingWavSource from a WAV Blob", async () => {
    const streaming = vi
      .spyOn(StreamingWavSource, "fromByteSource")
      .mockResolvedValue({
        id: "streaming-wav-blob",
        sampleRate: 44100,
        duration: 1,
        channelCount: 1,
        read: () => new Float32Array(0),
      } as unknown as StreamingWavSource);

    const blob = new Blob([wavHeader(44100)]);
    const source = await createAudioSourceFromBlob(blob);
    expect(source.id).toBe("streaming-wav-blob");
    expect(streaming).toHaveBeenCalledTimes(1);
  });

  it("creates a StreamingWavSource from a WAV ArrayBuffer", async () => {
    const streaming = vi
      .spyOn(StreamingWavSource, "fromByteSource")
      .mockResolvedValue({
        id: "streaming-wav-buffer",
        sampleRate: 22050,
        duration: 1,
        channelCount: 1,
        read: () => new Float32Array(0),
      } as unknown as StreamingWavSource);

    const buffer = wavHeader(22050);
    const source = await createAudioSourceFromBuffer(buffer);
    expect(source.id).toBe("streaming-wav-buffer");
    expect(streaming).toHaveBeenCalledTimes(1);
  });

  it("falls back to DecodedAudioSource for non-WAV non-MP3 Blobs", async () => {
    const decoded = vi
      .spyOn(DecodedAudioSource, "fromBuffer")
      .mockResolvedValue(new DecodedAudioSource(makeBuffer(), "decoded-blob"));

    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const source = await createAudioSourceFromBlob(blob);
    expect(source.id).toBe("decoded-blob");
    expect(decoded).toHaveBeenCalledTimes(1);
  });

  it("wraps created source in ClippedAudioSource when clipStart or clipEnd are provided", async () => {
    vi.spyOn(StreamingWavSource, "fromByteSource").mockResolvedValue({
      id: "streaming-wav-raw",
      sampleRate: 44100,
      duration: 30,
      channelCount: 1,
      read: () => new Float32Array(0),
    } as unknown as StreamingWavSource);

    const buffer = wavHeader(44100);
    const source = (await createAudioSourceFromBuffer(buffer, {
      clipStart: 5,
      clipEnd: 15,
    })) as ClippedAudioSource;

    expect(source.id).toContain("clipped:streaming-wav-raw:5:15");
    expect(source.clipStart).toBe(5);
    expect(source.clipEnd).toBe(15);
  });
});
