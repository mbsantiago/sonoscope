import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BlobByteSource,
  BufferByteSource,
  concatChunks,
  FetchByteSource,
  isSeekableByteSource,
  readPrefix,
} from "./byte-source";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).fetch;
});

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("byte source helpers", () => {
  it("concatenates chunks", () => {
    expect(
      Array.from(concatChunks([Uint8Array.from([1, 2]), Uint8Array.from([3])])),
    ).toEqual([1, 2, 3]);
  });

  it("reads a prefix without requiring one large chunk", async () => {
    const prefix = await readPrefix(
      {
        stream: () =>
          streamFrom([Uint8Array.from([1]), Uint8Array.from([2, 3, 4])]),
      },
      3,
    );
    expect(Array.from(prefix)).toEqual([1, 2, 3]);
  });
});

describe("FetchByteSource", () => {
  it("streams bytes from fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFrom([Uint8Array.from([5, 6])]),
    }) as typeof fetch;
    const source = FetchByteSource.fromUrl("audio.wav");
    const chunks: number[] = [];
    for await (const chunk of source.stream()) chunks.push(...chunk);
    expect(chunks).toEqual([5, 6]);
  });

  it("reads byte ranges with a Range header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(Uint8Array.from([7, 8]).buffer),
    }) as typeof fetch;
    const source = FetchByteSource.fromUrl("audio.wav");
    expect(isSeekableByteSource(source)).toBe(true);
    expect(Array.from(await source.readRange(10, 12))).toEqual([7, 8]);
    expect(globalThis.fetch).toHaveBeenCalledWith("audio.wav", {
      headers: { Range: "bytes=10-11" },
    });
  });

  it("throws when fetch fails", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    await expect(
      FetchByteSource.fromUrl("missing.wav").stream().getReader().read(),
    ).rejects.toThrow(/Failed to fetch byte stream: 404/);
  });
});

describe("BlobByteSource", () => {
  it("streams and reads ranges from a Blob", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const blob = new Blob([bytes]);
    const source = new BlobByteSource(blob);
    expect(source.size).toBe(8);

    const range = await source.readRange(2, 6);
    expect(Array.from(range)).toEqual([3, 4, 5, 6]);

    const prefix = await readPrefix(source, 4);
    expect(Array.from(prefix)).toEqual([1, 2, 3, 4]);
  });
});

describe("BufferByteSource", () => {
  it("streams and reads ranges from ArrayBuffer / Uint8Array", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    const source = new BufferByteSource(bytes);
    expect(source.size).toBe(5);

    const range = await source.readRange(1, 4);
    expect(Array.from(range)).toEqual([20, 30, 40]);

    const prefix = await readPrefix(source, 3);
    expect(Array.from(prefix)).toEqual([10, 20, 30]);
  });
});
