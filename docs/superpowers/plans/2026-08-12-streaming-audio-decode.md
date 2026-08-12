# Streaming Audio Decode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start spectrogram rendering before the whole audio file is decoded by adding a streaming WAV/PCM source with full-buffer fallback for unsupported formats.

**Architecture:** Add small byte-source interfaces, a focused WAV parser/PCM decoder module, and a `StreamingWavSource` that implements the existing `AudioSource` contract. The viewer remains tile-driven; it waits on source reads for unavailable ranges, shows placeholders, and rerenders when streaming sources report newly available decoded ranges.

**Tech Stack:** TypeScript, browser `fetch`, `ReadableStream<Uint8Array>`, existing Vitest test suite, existing `AudioSource` and `SpectrogramViewer` APIs.

## Global Constraints

- Keep existing `DecodedAudioSource` full-buffer behavior as fallback.
- Stream WAV/PCM first; do not implement MP3, Opus, AAC, or FLAC streaming.
- Keep existing `AudioSource.read(options)` shape: `Float32Array | Promise<Float32Array>`.
- Keep rendering selected-channel only; do not reintroduce multichannel rendering.
- Use opaque placeholders for missing decoded or uncomputed ranges.
- Prefer small focused modules over broad framework abstractions.
- Do not add runtime dependencies.

---

## File Structure

- Create `src/byte-source.ts`: byte-source interfaces, fetch-backed implementation, seekable type guard, and small byte-reading helpers.
- Create `src/wav.ts`: pure WAV header parsing, supported format detection, PCM sample conversion, and time-to-byte-range conversion.
- Create `src/streaming-wav-source.ts`: `StreamingWavSource` implementation with decoded range buffering, pending read resolution, optional range availability notifications, sequential streaming, and seekable range reads.
- Modify `src/source.ts`: keep `DecodedAudioSource`; add `createAudioSourceFromUrl(url, options?)` that chooses streaming WAV or full-buffer decode.
- Modify `src/types.ts`: add optional `onRangeAvailable` to `AudioSource`.
- Modify `src/viewer.ts`: subscribe to source range notifications and schedule rerender when a newly available range intersects the viewport.
- Modify `src/index.ts`: export new byte-source, WAV, streaming-source, and source helper APIs.
- Create `src/byte-source.test.ts`: fetch-backed source and helper tests.
- Create `src/wav.test.ts`: WAV parser and PCM conversion tests.
- Create `src/streaming-wav-source.test.ts`: streaming source read/wait/range tests.
- Modify `src/source.test.ts`: fallback helper tests.
- Modify `src/viewer.test.ts`: rerender-on-range-available test.

---

### Task 1: Byte Source Interfaces And Fetch Adapter

**Files:**
- Create: `src/byte-source.ts`
- Create: `src/byte-source.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `ByteStreamSource`, `SeekableByteSource`, `FetchByteSource`, `isSeekableByteSource`, `readPrefix`, `concatChunks`.
- Consumes: browser `fetch`, `ReadableStream<Uint8Array>`.

- [ ] **Step 1: Write failing tests for byte helpers and fetch source**

Add `src/byte-source.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchByteSource, concatChunks, isSeekableByteSource, readPrefix } from './byte-source';

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

describe('byte source helpers', () => {
  it('concatenates chunks', () => {
    expect(Array.from(concatChunks([Uint8Array.from([1, 2]), Uint8Array.from([3])]))).toEqual([1, 2, 3]);
  });

  it('reads a prefix without requiring one large chunk', async () => {
    const prefix = await readPrefix({ stream: () => streamFrom([Uint8Array.from([1]), Uint8Array.from([2, 3, 4])]) }, 3);
    expect(Array.from(prefix)).toEqual([1, 2, 3]);
  });
});

describe('FetchByteSource', () => {
  it('streams bytes from fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: streamFrom([Uint8Array.from([5, 6])]) }) as typeof fetch;
    const source = FetchByteSource.fromUrl('audio.wav');
    const chunks: number[] = [];
    for await (const chunk of source.stream()) chunks.push(...chunk);
    expect(chunks).toEqual([5, 6]);
  });

  it('reads byte ranges with a Range header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(Uint8Array.from([7, 8]).buffer) }) as typeof fetch;
    const source = FetchByteSource.fromUrl('audio.wav');
    expect(isSeekableByteSource(source)).toBe(true);
    expect(Array.from(await source.readRange(10, 12))).toEqual([7, 8]);
    expect(globalThis.fetch).toHaveBeenCalledWith('audio.wav', { headers: { Range: 'bytes=10-11' } });
  });

  it('throws when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    await expect(FetchByteSource.fromUrl('missing.wav').stream().getReader().read()).rejects.toThrow(/Failed to fetch byte stream: 404/);
  });
});
```

- [ ] **Step 2: Run byte-source tests and verify they fail**

Run: `npm test -- --run src/byte-source.test.ts`

Expected: FAIL because `src/byte-source.ts` does not exist.

- [ ] **Step 3: Implement byte-source module**

Create `src/byte-source.ts`:

```ts
export type ByteStreamSource = {
  stream(): ReadableStream<Uint8Array>;
};

export type SeekableByteSource = ByteStreamSource & {
  readRange(start: number, end: number): Promise<Uint8Array>;
  size?: number;
};

export function isSeekableByteSource(source: ByteStreamSource): source is SeekableByteSource {
  return 'readRange' in source && typeof (source as { readRange?: unknown }).readRange === 'function';
}

export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function readPrefix(source: ByteStreamSource, length: number): Promise<Uint8Array> {
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < length) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  return concatChunks(chunks).slice(0, length);
}

export class FetchByteSource implements SeekableByteSource {
  private constructor(readonly url: string, readonly size?: number) {}

  static fromUrl(url: string, options?: { size?: number }): FetchByteSource {
    return new FetchByteSource(url, options?.size);
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const response = await fetch(this.url);
          if (!response.ok) throw new Error(`Failed to fetch byte stream: ${response.status}`);
          if (!response.body) throw new Error('Fetch response does not expose a readable body');
          const reader = response.body.getReader();
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            controller.enqueue(result.value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) throw new Error('Invalid byte range');
    const response = await fetch(this.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (!response.ok) throw new Error(`Failed to fetch byte range: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
```

- [ ] **Step 4: Export byte-source APIs**

Modify `src/index.ts`:

```ts
export { FetchByteSource, concatChunks, isSeekableByteSource, readPrefix } from './byte-source';
export type { ByteStreamSource, SeekableByteSource } from './byte-source';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --run src/byte-source.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/byte-source.ts src/byte-source.test.ts src/index.ts
git commit -m "feat: add byte source helpers"
```

---

### Task 2: WAV Header Parser And PCM Conversion

**Files:**
- Create: `src/wav.ts`
- Create: `src/wav.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Uint8Array` byte data.
- Produces: `parseWavHeader(bytes: Uint8Array): WavInfo`, `decodeWavPcm(bytes: Uint8Array, info: WavInfo, byteOffset?: number): Float32Array[]`, `wavTimeToByteRange(info: WavInfo, startTime: number, endTime: number): { start: number; end: number }`, `isWavBytes(bytes: Uint8Array): boolean`.

- [ ] **Step 1: Write failing WAV parser and decoder tests**

Add `src/wav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeWavPcm, isWavBytes, parseWavHeader, wavTimeToByteRange } from './wav';

function wavBytes(options: { format?: number; channels?: number; sampleRate?: number; bitsPerSample?: number; samples: number[] }): Uint8Array {
  const format = options.format ?? 1;
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 4;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = options.samples.length * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + dataSize, true);
  bytes.set([87, 65, 86, 69], 8);
  bytes.set([102, 109, 116, 32], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of options.samples) {
    if (bitsPerSample === 8) view.setUint8(offset, sample);
    if (bitsPerSample === 16) view.setInt16(offset, sample, true);
    if (bitsPerSample === 24) {
      view.setUint8(offset, sample & 0xff);
      view.setUint8(offset + 1, (sample >> 8) & 0xff);
      view.setUint8(offset + 2, (sample >> 16) & 0xff);
    }
    if (bitsPerSample === 32 && format === 1) view.setInt32(offset, sample, true);
    if (bitsPerSample === 32 && format === 3) view.setFloat32(offset, sample, true);
    offset += bytesPerSample;
  }
  return bytes;
}

describe('wav helpers', () => {
  it('parses RIFF/WAVE metadata', () => {
    const info = parseWavHeader(wavBytes({ channels: 2, sampleRate: 8, bitsPerSample: 16, samples: [0, 0, 100, -100] }));
    expect(info).toMatchObject({ format: 1, channelCount: 2, sampleRate: 8, bitsPerSample: 16, dataOffset: 44, dataSize: 8 });
    expect(info.duration).toBe(0.25);
  });

  it('detects WAV bytes', () => {
    expect(isWavBytes(wavBytes({ samples: [0] }))).toBe(true);
    expect(isWavBytes(Uint8Array.from([1, 2, 3, 4]))).toBe(false);
  });

  it('decodes interleaved 16-bit PCM to per-channel float arrays', () => {
    const bytes = wavBytes({ channels: 2, sampleRate: 2, bitsPerSample: 16, samples: [0, 32767, -32768, 16384] });
    const info = parseWavHeader(bytes);
    const channels = decodeWavPcm(bytes.slice(info.dataOffset), info, info.dataOffset);
    expect(Array.from(channels[0]!).map((value) => Number(value.toFixed(4)))).toEqual([0, -1]);
    expect(Array.from(channels[1]!).map((value) => Number(value.toFixed(4)))).toEqual([1, 0.5]);
  });

  it('decodes 8-bit unsigned PCM', () => {
    const bytes = wavBytes({ bitsPerSample: 8, samples: [0, 128, 255] });
    const info = parseWavHeader(bytes);
    const values = Array.from(decodeWavPcm(bytes.slice(info.dataOffset), info, info.dataOffset)[0]!).map((value) => Number(value.toFixed(4)));
    expect(values).toEqual([-1, 0, 0.9922]);
  });

  it('decodes 24-bit and 32-bit samples', () => {
    const pcm24 = wavBytes({ bitsPerSample: 24, samples: [0x7fffff, -0x800000] });
    const info24 = parseWavHeader(pcm24);
    expect(Array.from(decodeWavPcm(pcm24.slice(info24.dataOffset), info24, info24.dataOffset)[0]!).map((value) => Math.round(value))).toEqual([1, -1]);

    const float32 = wavBytes({ format: 3, bitsPerSample: 32, samples: [0.25, -0.5] });
    const info32 = parseWavHeader(float32);
    expect(Array.from(decodeWavPcm(float32.slice(info32.dataOffset), info32, info32.dataOffset)[0]!)).toEqual([0.25, -0.5]);
  });

  it('converts time ranges to frame-aligned byte ranges', () => {
    const info = parseWavHeader(wavBytes({ channels: 2, sampleRate: 10, bitsPerSample: 16, samples: Array.from({ length: 20 }, () => 0) }));
    expect(wavTimeToByteRange(info, 0.2, 0.5)).toEqual({ start: 52, end: 64 });
  });

  it('throws for unsupported WAV variants', () => {
    expect(() => parseWavHeader(wavBytes({ format: 6, bitsPerSample: 8, samples: [0] }))).toThrow(/Unsupported WAV format/);
  });
});
```

- [ ] **Step 2: Run WAV tests and verify they fail**

Run: `npm test -- --run src/wav.test.ts`

Expected: FAIL because `src/wav.ts` does not exist.

- [ ] **Step 3: Implement WAV helpers**

Create `src/wav.ts`:

```ts
export type WavInfo = {
  format: number;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  duration: number;
};

const PCM_FORMAT = 1;
const FLOAT_FORMAT = 3;

export function isWavBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WAVE';
}

export function parseWavHeader(bytes: Uint8Array): WavInfo {
  if (!isWavBytes(bytes)) throw new Error('Invalid WAV header');
  const view = viewFor(bytes);
  let offset = 12;
  let format: number | undefined;
  let channelCount: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let blockAlign: number | undefined;
  let dataOffset: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const id = text(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (body + 16 > bytes.byteLength) throw new Error('Invalid WAV fmt chunk');
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      blockAlign = view.getUint16(body + 12, true);
      bitsPerSample = view.getUint16(body + 14, true);
    }
    if (id === 'data') {
      dataOffset = body;
      dataSize = Math.min(size, bytes.byteLength - body);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (format === undefined || channelCount === undefined || sampleRate === undefined || bitsPerSample === undefined || blockAlign === undefined) throw new Error('WAV fmt chunk not found');
  if (dataOffset === undefined || dataSize === undefined) throw new Error('WAV data chunk not found');
  if (format !== PCM_FORMAT && format !== FLOAT_FORMAT) throw new Error(`Unsupported WAV format ${format}`);
  if (format === FLOAT_FORMAT && bitsPerSample !== 32) throw new Error('Unsupported WAV float bit depth');
  if (format === PCM_FORMAT && ![8, 16, 24, 32].includes(bitsPerSample)) throw new Error(`Unsupported WAV bit depth ${bitsPerSample}`);
  const frameCount = Math.floor(dataSize / blockAlign);
  return { format, channelCount, sampleRate, bitsPerSample, blockAlign, dataOffset, dataSize, duration: frameCount / sampleRate };
}

export function wavTimeToByteRange(info: WavInfo, startTime: number, endTime: number): { start: number; end: number } {
  const firstFrame = Math.max(0, Math.floor(startTime * info.sampleRate));
  const endFrame = Math.min(Math.floor(info.dataSize / info.blockAlign), Math.ceil(endTime * info.sampleRate));
  return { start: info.dataOffset + firstFrame * info.blockAlign, end: info.dataOffset + endFrame * info.blockAlign };
}

export function decodeWavPcm(bytes: Uint8Array, info: WavInfo, byteOffset = info.dataOffset): Float32Array[] {
  const bytesPerSample = info.bitsPerSample / 8;
  const skipBytes = Math.max(0, info.dataOffset - byteOffset);
  const available = bytes.slice(skipBytes, skipBytes + Math.floor((bytes.length - skipBytes) / info.blockAlign) * info.blockAlign);
  const frameCount = available.length / info.blockAlign;
  const channels = Array.from({ length: info.channelCount }, () => new Float32Array(frameCount));
  const view = viewFor(available);

  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < info.channelCount; channel++) {
      const offset = frame * info.blockAlign + channel * bytesPerSample;
      channels[channel]![frame] = readSample(view, offset, info.format, info.bitsPerSample);
    }
  }
  return channels;
}

function readSample(view: DataView, offset: number, format: number, bitsPerSample: number): number {
  if (format === FLOAT_FORMAT) return view.getFloat32(offset, true);
  if (bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128;
  if (bitsPerSample === 16) return view.getInt16(offset, true) / 32768;
  if (bitsPerSample === 24) {
    let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }
  return view.getInt32(offset, true) / 2147483648;
}

function viewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
```

- [ ] **Step 4: Export WAV helpers**

Modify `src/index.ts`:

```ts
export { decodeWavPcm, isWavBytes, parseWavHeader, wavTimeToByteRange } from './wav';
export type { WavInfo } from './wav';
```

- [ ] **Step 5: Run WAV tests and typecheck**

Run: `npm test -- --run src/wav.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/wav.ts src/wav.test.ts src/index.ts
git commit -m "feat: parse streaming wav data"
```

---

### Task 3: Streaming WAV Source With Sequential Decode

**Files:**
- Create: `src/streaming-wav-source.ts`
- Create: `src/streaming-wav-source.test.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `ByteStreamSource`, `parseWavHeader`, `decodeWavPcm`, `AudioSource`.
- Produces: `StreamingWavSource.fromByteSource(source, options?)`, `StreamingWavSource.read(options)`, `StreamingWavSource.onRangeAvailable(handler)`.

- [ ] **Step 1: Extend AudioSource type with optional range notification**

Modify `src/types.ts`:

```ts
export type AudioRange = { startTime: number; endTime: number };

export interface AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  read(options: { channel: number; startTime: number; endTime: number }): Float32Array | Promise<Float32Array>;
  onRangeAvailable?(handler: (range: AudioRange) => void): () => void;
}
```

- [ ] **Step 2: Write failing sequential streaming tests**

Add `src/streaming-wav-source.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ByteStreamSource } from './byte-source';
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

function controllableSource(): { source: ByteStreamSource; push(chunk: Uint8Array): void; close(): void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  return {
    source: { stream: () => new ReadableStream<Uint8Array>({ start(next) { controller = next; } }) },
    push(chunk) { controller!.enqueue(chunk); },
    close() { controller!.close(); },
  };
}

describe('StreamingWavSource sequential decode', () => {
  it('parses metadata before the full file is available', async () => {
    const bytes = wavBytes([0, 32767, -32768, 16384]);
    const source = await StreamingWavSource.fromByteSource({ stream: () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, 44)); controller.close(); } }) });
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
    void Promise.resolve(read).then(() => { resolved = true; });
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
});
```

- [ ] **Step 3: Run streaming source tests and verify they fail**

Run: `npm test -- --run src/streaming-wav-source.test.ts`

Expected: FAIL because `src/streaming-wav-source.ts` does not exist.

- [ ] **Step 4: Implement sequential StreamingWavSource**

Create `src/streaming-wav-source.ts`:

```ts
import { concatChunks, isSeekableByteSource, readPrefix, type ByteStreamSource, type SeekableByteSource } from './byte-source';
import type { AudioRange, AudioSource } from './types';
import { decodeWavPcm, parseWavHeader, wavTimeToByteRange, type WavInfo } from './wav';

type PendingRead = {
  channel: number;
  startFrame: number;
  endFrame: number;
  resolve: (samples: Float32Array) => void;
  reject: (error: Error) => void;
};

export class StreamingWavSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly decoded: Float32Array[];
  private decodedUntilFrame = 0;
  private readonly pending: PendingRead[] = [];
  private readonly handlers = new Set<(range: AudioRange) => void>();
  private readonly seekable: SeekableByteSource | undefined;

  private constructor(
    private readonly byteSource: ByteStreamSource,
    private readonly info: WavInfo,
    options?: { id?: string },
  ) {
    this.sampleRate = info.sampleRate;
    this.duration = info.duration;
    this.channelCount = info.channelCount;
    this.id = options?.id ?? `streaming-wav:${info.sampleRate}:${info.dataSize}:${info.channelCount}`;
    this.decoded = Array.from({ length: info.channelCount }, () => new Float32Array(Math.floor(info.dataSize / info.blockAlign)));
    this.seekable = isSeekableByteSource(byteSource) ? byteSource : undefined;
    void this.decodeSequentially().catch((error) => this.rejectPending(error instanceof Error ? error : new Error(String(error))));
  }

  static async fromByteSource(byteSource: ByteStreamSource, options?: { id?: string }): Promise<StreamingWavSource> {
    const header = await readPrefix(byteSource, 4096);
    const info = parseWavHeader(header);
    return new StreamingWavSource(byteSource, info, options);
  }

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array | Promise<Float32Array> {
    if (options.channel < 0 || options.channel >= this.channelCount) throw new Error(`Invalid channel ${options.channel}`);
    const startFrame = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const endFrame = Math.min(this.decoded[options.channel]!.length, Math.ceil(options.endTime * this.sampleRate));
    if (endFrame <= this.decodedUntilFrame) return this.decoded[options.channel]!.slice(startFrame, endFrame);
    return new Promise((resolve, reject) => {
      this.pending.push({ channel: options.channel, startFrame, endFrame, resolve, reject });
      this.resolveReadyPending();
    });
  }

  onRangeAvailable(handler: (range: AudioRange) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private async decodeSequentially(): Promise<void> {
    const reader = this.byteSource.stream().getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
      if (total <= this.info.dataOffset) continue;
      const bytes = concatChunks(chunks);
      const frameCount = Math.floor((bytes.length - this.info.dataOffset) / this.info.blockAlign);
      if (frameCount <= this.decodedUntilFrame) continue;
      const endByte = this.info.dataOffset + frameCount * this.info.blockAlign;
      this.copyDecoded(bytes.slice(this.info.dataOffset, endByte), this.info.dataOffset, 0);
    }
  }

  private copyDecoded(bytes: Uint8Array, byteOffset: number, startFrame: number): void {
    const decoded = decodeWavPcm(bytes, this.info, byteOffset);
    for (let channel = 0; channel < this.channelCount; channel++) this.decoded[channel]!.set(decoded[channel]!, startFrame);
    const previous = this.decodedUntilFrame;
    this.decodedUntilFrame = Math.max(this.decodedUntilFrame, startFrame + decoded[0]!.length);
    if (this.decodedUntilFrame > previous) this.emitRange(previous / this.sampleRate, this.decodedUntilFrame / this.sampleRate);
    this.resolveReadyPending();
  }

  private resolveReadyPending(): void {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const pending = this.pending[index]!;
      if (pending.endFrame > this.decodedUntilFrame) continue;
      this.pending.splice(index, 1);
      pending.resolve(this.decoded[pending.channel]!.slice(pending.startFrame, pending.endFrame));
    }
  }

  private rejectPending(error: Error): void {
    while (this.pending.length > 0) this.pending.pop()!.reject(error);
  }

  private emitRange(startTime: number, endTime: number): void {
    const range = { startTime, endTime };
    for (const handler of this.handlers) handler(range);
  }
}
```

- [ ] **Step 5: Remove unused imports if typecheck reports them**

If `wavTimeToByteRange` or `SeekableByteSource` is unused in this task, remove that import now. They are added back in Task 4.

- [ ] **Step 6: Export StreamingWavSource**

Modify `src/index.ts`:

```ts
export { StreamingWavSource } from './streaming-wav-source';
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- --run src/streaming-wav-source.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/types.ts src/streaming-wav-source.ts src/streaming-wav-source.test.ts src/index.ts
git commit -m "feat: stream wav samples sequentially"
```

---

### Task 4: Seekable Range Decode Priority

**Files:**
- Modify: `src/streaming-wav-source.ts`
- Modify: `src/streaming-wav-source.test.ts`

**Interfaces:**
- Consumes: `SeekableByteSource.readRange(start, end)`, `wavTimeToByteRange(info, startTime, endTime)`.
- Produces: visible range reads that request byte ranges and resolve before sequential decode reaches them.

- [ ] **Step 1: Add failing seekable priority test**

Append to `src/streaming-wav-source.test.ts`:

```ts
it('uses seekable byte ranges to satisfy far-ahead reads before sequential decode arrives', async () => {
  const bytes = wavBytes([0, 32767, -32768, 16384]);
  const ranges: Array<[number, number]> = [];
  const source = await StreamingWavSource.fromByteSource({
    stream: () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, 44)); } }),
    readRange: async (start: number, end: number) => {
      ranges.push([start, end]);
      return bytes.slice(start, end);
    },
  });

  const values = await source.read({ channel: 0, startTime: 0.5, endTime: 1 });

  expect(ranges).toEqual([[48, 52]]);
  expect(Array.from(values).map((value) => Number(value.toFixed(4)))).toEqual([-1, 0.5]);
});
```

- [ ] **Step 2: Run seekable test and verify it fails**

Run: `npm test -- --run src/streaming-wav-source.test.ts -t seekable`

Expected: FAIL because `read` does not call `readRange`.

- [ ] **Step 3: Implement seekable range reads**

Modify `StreamingWavSource.read` in `src/streaming-wav-source.ts`:

```ts
    if (endFrame <= this.decodedUntilFrame) return this.decoded[options.channel]!.slice(startFrame, endFrame);
    if (this.seekable) return this.readSeekableRange(options.channel, options.startTime, options.endTime, startFrame, endFrame);
```

Add this method to `StreamingWavSource`:

```ts
  private async readSeekableRange(channel: number, startTime: number, endTime: number, startFrame: number, endFrame: number): Promise<Float32Array> {
    const range = wavTimeToByteRange(this.info, startTime, endTime);
    const bytes = await this.seekable!.readRange(range.start, range.end);
    const decoded = decodeWavPcm(bytes, this.info, range.start);
    for (let nextChannel = 0; nextChannel < this.channelCount; nextChannel++) this.decoded[nextChannel]!.set(decoded[nextChannel]!, startFrame);
    this.emitRange(startFrame / this.sampleRate, endFrame / this.sampleRate);
    this.resolveReadyPending();
    return this.decoded[channel]!.slice(startFrame, endFrame);
  }
```

Ensure `src/streaming-wav-source.ts` imports `wavTimeToByteRange`:

```ts
import { decodeWavPcm, parseWavHeader, wavTimeToByteRange, type WavInfo } from './wav';
```

- [ ] **Step 4: Run streaming source tests and typecheck**

Run: `npm test -- --run src/streaming-wav-source.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/streaming-wav-source.ts src/streaming-wav-source.test.ts
git commit -m "feat: prioritize seekable wav ranges"
```

---

### Task 5: URL Source Helper With Streaming/Fallback Selection

**Files:**
- Modify: `src/source.ts`
- Modify: `src/source.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `FetchByteSource.fromUrl(url)`, `readPrefix`, `isWavBytes`, `StreamingWavSource.fromByteSource`, `DecodedAudioSource.fromUrl`.
- Produces: `createAudioSourceFromUrl(url, options?)`.

- [ ] **Step 1: Add failing source-helper tests**

Modify imports in `src/source.test.ts`:

```ts
import { DecodedAudioSource, createAudioSourceFromUrl } from './source';
import { StreamingWavSource } from './streaming-wav-source';
```

Append tests to `src/source.test.ts`:

```ts
describe('createAudioSourceFromUrl', () => {
  it('uses StreamingWavSource for WAV URLs', async () => {
    const streaming = vi.spyOn(StreamingWavSource, 'fromByteSource').mockResolvedValue({ id: 'streaming', sampleRate: 10, duration: 1, channelCount: 1, read: () => new Float32Array(0) });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(wavHeader(10))); controller.close(); } }) }) as typeof fetch;

    const source = await createAudioSourceFromUrl('bat.wav');

    expect(source.id).toBe('streaming');
    expect(streaming).toHaveBeenCalledTimes(1);
  });

  it('falls back to DecodedAudioSource for unknown URLs', async () => {
    const decoded = vi.spyOn(DecodedAudioSource, 'fromUrl').mockResolvedValue(new DecodedAudioSource(makeBuffer(), 'decoded'));
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Uint8Array.from([1, 2, 3, 4])); controller.close(); } }) }) as typeof fetch;

    const source = await createAudioSourceFromUrl('bat.mp3');

    expect(source.id).toBe('decoded');
    expect(decoded).toHaveBeenCalledWith('bat.mp3', undefined);
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run: `npm test -- --run src/source.test.ts -t createAudioSourceFromUrl`

Expected: FAIL because `createAudioSourceFromUrl` is not exported.

- [ ] **Step 3: Implement helper**

Modify `src/source.ts` imports:

```ts
import { FetchByteSource, readPrefix } from './byte-source';
import { StreamingWavSource } from './streaming-wav-source';
import type { AudioSource } from './types';
import { isWavBytes } from './wav';
```

Add below `DecodedAudioSource`:

```ts
export async function createAudioSourceFromUrl(url: string, options?: AudioContext | { audioContext?: AudioContext; sampleRate?: number }): Promise<AudioSource> {
  const byteSource = FetchByteSource.fromUrl(url);
  const prefix = await readPrefix(byteSource, 64);
  if (isWavBytes(prefix)) {
    try {
      return await StreamingWavSource.fromByteSource(byteSource, { id: url });
    } catch {
      return DecodedAudioSource.fromUrl(url, options);
    }
  }
  return DecodedAudioSource.fromUrl(url, options);
}
```

- [ ] **Step 4: Export helper**

Modify `src/index.ts` so the source export line is:

```ts
export { DecodedAudioSource, createAudioSourceFromUrl } from './source';
```

- [ ] **Step 5: Run source tests and typecheck**

Run: `npm test -- --run src/source.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/source.ts src/source.test.ts src/index.ts
git commit -m "feat: choose streaming audio source from url"
```

---

### Task 6: Viewer Rerender On Available Streaming Ranges

**Files:**
- Modify: `src/viewer.ts`
- Modify: `src/viewer.test.ts`

**Interfaces:**
- Consumes: optional `AudioSource.onRangeAvailable(handler)`.
- Produces: viewer rerenders when available range intersects current viewport.

- [ ] **Step 1: Add failing viewer test**

Append to `src/viewer.test.ts`:

```ts
it('rerenders when a streaming source reports a visible range is available', async () => {
  let rangeHandler: ((range: { startTime: number; endTime: number }) => void) | undefined;
  const streamingSource: AudioSource = {
    ...source,
    duration: 2,
    onRangeAvailable: (handler) => {
      rangeHandler = handler;
      return () => { rangeHandler = undefined; };
    },
  };
  const viewer = await SpectrogramViewer.create({
    canvas: canvas(),
    source: streamingSource,
    viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 },
  });
  const render = vi.spyOn(viewer, 'render').mockResolvedValue(undefined);

  rangeHandler!({ startTime: 0.25, endTime: 0.5 });
  await Promise.resolve();

  expect(render).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run viewer test and verify it fails**

Run: `npm test -- --run src/viewer.test.ts -t "rerenders when a streaming source"`

Expected: FAIL because the viewer does not subscribe to `onRangeAvailable`.

- [ ] **Step 3: Implement source range subscription**

Modify `src/viewer.ts` class fields:

```ts
  private sourceRangeCleanup: (() => void) | undefined;
  private sourceRenderQueued = false;
```

Modify constructor:

```ts
    this.attachPlaybackSync();
    this.attachSourceRangeSync();
```

Modify `setConfig` after `this.renderer.invalidate();`:

```ts
    this.attachSourceRangeSync();
```

Modify `destroy()` before `this.cache.clear();`:

```ts
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
```

Add private methods:

```ts
  private attachSourceRangeSync(): void {
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    const source = this.config.source;
    if (!source?.onRangeAvailable) return;
    this.sourceRangeCleanup = source.onRangeAvailable((range) => {
      if (!this.rangeIntersectsViewport(range.startTime, range.endTime)) return;
      this.queueSourceRangeRender();
    });
  }

  private rangeIntersectsViewport(startTime: number, endTime: number): boolean {
    return startTime < this.config.viewport.endTime && endTime > this.config.viewport.startTime;
  }

  private queueSourceRangeRender(): void {
    if (this.sourceRenderQueued || this.status.state === 'destroyed') return;
    this.sourceRenderQueued = true;
    void Promise.resolve().then(() => {
      this.sourceRenderQueued = false;
      if (this.status.state === 'destroyed') return;
      void this.render().catch((error) => {
        this.events.emit('error', { error: error instanceof Error ? error : new Error(String(error)), recoverable: true, phase: 'source' });
      });
    });
  }
```

- [ ] **Step 4: Add non-visible range test**

Append to `src/viewer.test.ts`:

```ts
it('does not rerender for streaming ranges outside the viewport', async () => {
  let rangeHandler: ((range: { startTime: number; endTime: number }) => void) | undefined;
  const streamingSource: AudioSource = {
    ...source,
    duration: 4,
    onRangeAvailable: (handler) => {
      rangeHandler = handler;
      return () => { rangeHandler = undefined; };
    },
  };
  const viewer = await SpectrogramViewer.create({
    canvas: canvas(),
    source: streamingSource,
    viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 },
  });
  const render = vi.spyOn(viewer, 'render').mockResolvedValue(undefined);

  rangeHandler!({ startTime: 2, endTime: 3 });
  await Promise.resolve();

  expect(render).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run viewer tests and typecheck**

Run: `npm test -- --run src/viewer.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/viewer.ts src/viewer.test.ts
git commit -m "feat: rerender streaming audio ranges"
```

---

### Task 7: Integration Exports, Example Helper, And Full Verification

**Files:**
- Modify: `examples/basic/demo-utils.ts`
- Modify: `src/index.ts`
- Modify: `src/source.test.ts`

**Interfaces:**
- Consumes: `createAudioSourceFromUrl(url)`.
- Produces: examples use streaming WAV automatically while retaining fallback for unsupported URLs.

- [ ] **Step 1: Update shared examples helper to use source selection**

Modify `examples/basic/demo-utils.ts` import:

```ts
import { SpectrogramViewer, createAudioSourceFromUrl, type CacheConfig, type FrequencyScale, type SpectrogramComputeBackend, type ValueMode, type WindowName } from '../../src';
```

Modify decode line in `createViewer`:

```ts
  SpectrogramViewer.renderLoading(options.canvas, 'Decoding audio...');
  const source = await createAudioSourceFromUrl(options.url);
```

- [ ] **Step 2: Ensure public exports are complete**

Verify `src/index.ts` includes these exports exactly once:

```ts
export { FetchByteSource, concatChunks, isSeekableByteSource, readPrefix } from './byte-source';
export type { ByteStreamSource, SeekableByteSource } from './byte-source';
export { DecodedAudioSource, createAudioSourceFromUrl } from './source';
export { StreamingWavSource } from './streaming-wav-source';
export { decodeWavPcm, isWavBytes, parseWavHeader, wavTimeToByteRange } from './wav';
export type { WavInfo } from './wav';
```

- [ ] **Step 3: Add fallback-on-streaming-error test**

Append to `src/source.test.ts` inside `describe('createAudioSourceFromUrl', ...)`:

```ts
  it('falls back to DecodedAudioSource when WAV streaming fails', async () => {
    vi.spyOn(StreamingWavSource, 'fromByteSource').mockRejectedValue(new Error('unsupported wav'));
    const decoded = vi.spyOn(DecodedAudioSource, 'fromUrl').mockResolvedValue(new DecodedAudioSource(makeBuffer(), 'decoded-after-streaming-failure'));
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(wavHeader(10))); controller.close(); } }) }) as typeof fetch;

    const source = await createAudioSourceFromUrl('unsupported.wav');

    expect(source.id).toBe('decoded-after-streaming-failure');
    expect(decoded).toHaveBeenCalledWith('unsupported.wav', undefined);
  });
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test -- --run
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Commit integration changes**

Run:

```bash
git add examples/basic/demo-utils.ts src/index.ts src/source.test.ts
git commit -m "feat: use streaming audio source in examples"
```

---

## Self-Review Notes

- Spec coverage: byte interfaces are Task 1; WAV parser and PCM conversion are Task 2; streaming source and range notification are Task 3; seekable prioritization is Task 4; URL helper and fallback are Task 5; viewer rerender is Task 6; example integration and full verification are Task 7.
- Placeholder scan: no incomplete implementation placeholders are intentionally left in the task steps.
- Type consistency: `ByteStreamSource`, `SeekableByteSource`, `StreamingWavSource`, `createAudioSourceFromUrl`, `AudioRange`, and `onRangeAvailable` use the same signatures across tasks.
