import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
