import { describe, expect, it, vi } from 'vitest';
import type { ByteStreamSource, SeekableByteSource } from './byte-source';
import { StreamingWavSource } from './streaming-wav-source';

function wavBytes(samples: number[], sampleRate = 4): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function controllableSource(): { source: ByteStreamSource; push(chunk: Uint8Array): void; close(): void } {
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
      controller!.enqueue(chunk);
    },
    close() {
      controller!.close();
    },
  };
}

describe('StreamingWavSource sequential decode', () => {
  it('parses metadata before the full file is available', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    const source = await StreamingWavSource.fromByteSource({ stream: () => streamFrom([bytes.slice(0, 44)]) });
    expect(source.sampleRate).toBe(4);
    expect(source.duration).toBe(1);
    expect(source.channelCount).toBe(1);
  });

  it('waits for missing samples and resolves reads as chunks arrive', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    const stream = controllableSource();
    const created = StreamingWavSource.fromByteSource(stream.source);
    stream.push(bytes.slice(0, 44));
    const source = await created;
    const read = source.read({ channel: 0, startTime: 0, endTime: 0.5 });
    let resolved = false;
    void Promise.resolve(read).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    stream.push(bytes.slice(44, 48));
    expect(Array.from(await read).map((value) => Number(value.toFixed(4)))).toEqual([0, 1]);
  });

  it('emits available ranges when sequential samples decode', async () => {
    const bytes = wavBytes([0, 32767]);
    const stream = controllableSource();
    const created = StreamingWavSource.fromByteSource(stream.source);
    stream.push(bytes.slice(0, 44));
    const source = await created;
    const handler = vi.fn();
    source.onRangeAvailable(handler);
    stream.push(bytes.slice(44));
    await source.read({ channel: 0, startTime: 0, endTime: 0.5 });
    expect(handler).toHaveBeenCalledWith({ startTime: 0, endTime: 0.5 });
  });

  it('does not re-emit duplicate ranges when decoding additional chunks', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    const stream = controllableSource();
    const created = StreamingWavSource.fromByteSource(stream.source);
    stream.push(bytes.slice(0, 44));
    const source = await created;
    const handler = vi.fn();
    source.onRangeAvailable(handler);

    stream.push(bytes.slice(44, 48));
    await source.read({ channel: 0, startTime: 0, endTime: 0.5 });
    stream.push(bytes.slice(48, 52));
    await source.read({ channel: 0, startTime: 0.5, endTime: 1 });

    expect(handler).toHaveBeenNthCalledWith(1, { startTime: 0, endTime: 0.5 });
    expect(handler).toHaveBeenNthCalledWith(2, { startTime: 0.5, endTime: 1 });
  });

  it('uses seekable byte ranges to satisfy far-ahead reads before sequential decode arrives', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    const ranges: Array<[number, number]> = [];
    const seekableSource: SeekableByteSource = {
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 44));
          },
        }),
      readRange: async (start: number, end: number) => {
        ranges.push([start, end]);
        return bytes.slice(start, end);
      },
    };
    const source = await StreamingWavSource.fromByteSource(seekableSource);

    const values = await source.read({ channel: 0, startTime: 0.5, endTime: 1 });

    expect(ranges).toEqual([[48, 52]]);
    expect(Array.from(values).map((value) => Number(value.toFixed(4)))).toEqual([-1, 0.5]);
  });

  it('does not resolve earlier missing reads when a seekable far-ahead range decodes', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    let resolveEarlierRange: ((bytes: Uint8Array) => void) | undefined;
    const seekableSource: SeekableByteSource = {
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 44));
          },
        }),
      readRange: async (start: number, end: number) => {
        if (start === 44) {
          return new Promise<Uint8Array>((resolve) => {
            resolveEarlierRange = resolve;
          });
        }
        return bytes.slice(start, end);
      },
    };
    const source = await StreamingWavSource.fromByteSource(seekableSource);
    const earlier = source.read({ channel: 0, startTime: 0, endTime: 0.5 });
    let earlierResolved = false;
    void Promise.resolve(earlier).then(() => {
      earlierResolved = true;
    });

    await source.read({ channel: 0, startTime: 0.5, endTime: 1 });
    await Promise.resolve();

    expect(earlierResolved).toBe(false);

    resolveEarlierRange!(bytes.slice(44, 48));
    expect(Array.from(await earlier).map((value) => Number(value.toFixed(4)))).toEqual([0, 1]);
  });
});
