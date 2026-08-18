# Blob, Array, and Python Audio Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `Sonoscope` to be created from `Blob` / `File`, raw `ArrayBuffer` / `Uint8Array`, and raw float arrays (`Float32Array` / `number[]`) + `sampleRate` across `@sonoscope/core` and `@sonoscope/react`, and support creating Jupyter/Marimo `Sonoscope` anywidgets from local file paths or NumPy arrays via binary traitlets.

**Architecture:** 
1. **Core Sources:** Add `BlobByteSource` and `BufferByteSource` to `@sonoscope/core` (implementing `SeekableByteSource`), allowing `StreamingWavSource` and `StreamingMp3Source` to stream-parse local in-memory files instantly without waiting for full Web Audio decoding. Add `ArrayAudioSource` for zero-overhead direct float sample reading and an in-memory `encodeWavBlob` utility for `<audio>` playback synchronization.
2. **Core Factory APIs:** Add `Sonoscope.fromBlob()`, `Sonoscope.fromBuffer()`, and `Sonoscope.fromArray()` with automatic `HTMLAudioElement` object URL binding and cleanup.
3. **React Integration:** Update `useSonoscope` hook to accept `blob`, `buffer`, `array`, and `sampleRate`.
4. **Python Anywidget:** Add `audio_bytes` binary traitlet, `Sonoscope.from_file(path)`, `Sonoscope.from_array(audio, sample_rate)`, and automatic NumPy-to-WAV encoding in Python with zero mandatory external dependencies. Update `widget.ts` to instantiate `Sonoscope.fromBlob` from binary buffers.

**Tech Stack:** TypeScript, `@sonoscope/core`, `@sonoscope/react`, `@sonoscope/anywidget` (Python + anywidget + traitlets), Vitest, Web Audio API.

## Global Constraints
- Full backwards compatibility with existing `Sonoscope.fromUrl()`, `Sonoscope.fromAudio()`, `Sonoscope.fromAudioBuffer()`, and `Sonoscope.fromSource()`.
- Zero required external Python dependencies for NumPy/array WAV encoding (use Python standard library `wave` and `struct`, with numpy support when present).
- Ensure all object URLs created via `URL.createObjectURL` are properly revoked on `scope.destroy()` or React unmount.
- All existing tests across the monorepo must continue to pass.

---

### Task 1: `BlobByteSource`, `BufferByteSource` & Blob/Buffer Source Helpers in `@sonoscope/core`

**Files:**
- Modify: `packages/core/src/sources/byte-source.ts`
- Modify: `packages/core/src/sources/byte-source.test.ts`
- Modify: `packages/core/src/sources/source.ts`
- Modify: `packages/core/src/sources/source.test.ts`

**Interfaces:**
- Produces:
  - `class BlobByteSource implements SeekableByteSource`: constructor `(blob: Blob, options?: { size?: number })`
  - `class BufferByteSource implements SeekableByteSource`: constructor `(buffer: ArrayBuffer | Uint8Array, options?: { size?: number })`
  - `createAudioSourceFromBlob(blob: Blob, options?: CreateAudioSourceOptions): Promise<AudioSource>`
  - `createAudioSourceFromBuffer(buffer: ArrayBuffer | Uint8Array, options?: CreateAudioSourceOptions): Promise<AudioSource>`
  - `DecodedAudioSource.fromBlob(blob: Blob, options?): Promise<DecodedAudioSource>`
  - `DecodedAudioSource.fromBuffer(buffer: ArrayBuffer | Uint8Array, options?): Promise<DecodedAudioSource>`

- [ ] **Step 1: Write failing tests for `BlobByteSource`, `BufferByteSource`, `createAudioSourceFromBlob`, and `createAudioSourceFromBuffer`**

Add tests to `packages/core/src/sources/byte-source.test.ts` and `packages/core/src/sources/source.test.ts`:
```ts
// in byte-source.test.ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/core/src/sources/byte-source.test.ts`
Expected: FAIL (`BlobByteSource` / `BufferByteSource` not defined)

- [ ] **Step 3: Implement `BlobByteSource`, `BufferByteSource`, `createAudioSourceFromBlob`, and `createAudioSourceFromBuffer`**

In `packages/core/src/sources/byte-source.ts`:
```ts
export class BlobByteSource implements SeekableByteSource {
  readonly size: number;

  constructor(
    private readonly blob: Blob,
    options?: { size?: number },
  ) {
    this.size = options?.size ?? blob.size;
  }

  stream(): ReadableStream<Uint8Array> {
    if (typeof this.blob.stream === "function") {
      return this.blob.stream();
    }
    // Fallback if blob.stream is not available
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const buffer = await this.blob.arrayBuffer();
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start
    ) {
      throw new Error("Invalid byte range");
    }
    const sliced = this.blob.slice(start, end);
    return new Uint8Array(await sliced.arrayBuffer());
  }
}

export class BufferByteSource implements SeekableByteSource {
  readonly size: number;
  private readonly uint8Array: Uint8Array;

  constructor(
    buffer: ArrayBuffer | Uint8Array,
    options?: { size?: number },
  ) {
    this.uint8Array =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.size = options?.size ?? this.uint8Array.byteLength;
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(this.uint8Array);
        controller.close();
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.size
    ) {
      throw new Error("Invalid byte range");
    }
    return this.uint8Array.subarray(start, end);
  }
}
```

In `packages/core/src/sources/source.ts`:
Add `createAudioSourceFromByteSource`, `createAudioSourceFromBlob`, `createAudioSourceFromBuffer`, and methods on `DecodedAudioSource`:
```ts
export async function createAudioSourceFromBlob(
  blob: Blob,
  options?: AudioSourceOptions,
): Promise<AudioSource> {
  const byteSource = new BlobByteSource(blob);
  return createAudioSourceFromByteSource(byteSource, options, async () => {
    const arrayBuffer = await blob.arrayBuffer();
    return DecodedAudioSource.fromBuffer(arrayBuffer, options);
  });
}

export async function createAudioSourceFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  options?: AudioSourceOptions,
): Promise<AudioSource> {
  const byteSource = new BufferByteSource(buffer);
  const arrayBuffer =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
  return createAudioSourceFromByteSource(byteSource, options, async () => {
    return DecodedAudioSource.fromBuffer(arrayBuffer, options);
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run packages/core/src/sources/byte-source.test.ts packages/core/src/sources/source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sources/byte-source.ts packages/core/src/sources/byte-source.test.ts packages/core/src/sources/source.ts packages/core/src/sources/source.test.ts
git commit -m "feat(core): implement BlobByteSource, BufferByteSource and createAudioSourceFromBlob/Buffer"
```

---

### Task 2: `ArrayAudioSource` & In-Memory WAV Encoder in `@sonoscope/core`

**Files:**
- Create: `packages/core/src/sources/array-source.ts`
- Create: `packages/core/src/sources/array-source.test.ts`
- Create: `packages/core/src/sources/wav-encoder.ts`
- Create: `packages/core/src/sources/wav-encoder.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `class ArrayAudioSource implements AudioSource`: constructor `(data: Float32Array | Float32Array[] | number[] | number[][], sampleRate: number, id?: string)`
  - `encodeWavBuffer(channels: Float32Array | Float32Array[], sampleRate: number, options?: { bitDepth?: 16 | 32 }): ArrayBuffer`
  - `encodeWavBlob(channels: Float32Array | Float32Array[], sampleRate: number, options?: { bitDepth?: 16 | 32 }): Blob`

- [ ] **Step 1: Write failing tests for `ArrayAudioSource` and `encodeWavBlob`/`encodeWavBuffer`**

Create `packages/core/src/sources/array-source.test.ts` and `packages/core/src/sources/wav-encoder.test.ts`:
```ts
// array-source.test.ts
import { describe, expect, it } from "vitest";
import { ArrayAudioSource } from "./array-source";

describe("ArrayAudioSource", () => {
  it("initializes from a 1D Float32Array mono audio", () => {
    const data = new Float32Array(44100 * 2); // 2 seconds at 44.1kHz
    data[44100] = 0.5;
    const source = new ArrayAudioSource(data, 44100);

    expect(source.sampleRate).toBe(44100);
    expect(source.channelCount).toBe(1);
    expect(source.duration).toBeCloseTo(2.0);

    const chunk = source.read({ channel: 0, startTime: 1.0, endTime: 1.001 });
    expect(chunk[0]).toBeCloseTo(0.5);
  });

  it("initializes from 2D multi-channel Float32Array", () => {
    const left = new Float32Array(48000);
    const right = new Float32Array(48000);
    left[0] = 0.8;
    right[0] = -0.8;
    const source = new ArrayAudioSource([left, right], 48000);

    expect(source.channelCount).toBe(2);
    expect(source.duration).toBeCloseTo(1.0);
    expect(source.read({ channel: 0, startTime: 0, endTime: 0.1 })[0]).toBeCloseTo(0.8);
    expect(source.read({ channel: 1, startTime: 0, endTime: 0.1 })[0]).toBeCloseTo(-0.8);
  });

  it("supports number[] array inputs", () => {
    const source = new ArrayAudioSource([0.1, 0.2, 0.3, 0.4], 4);
    expect(source.sampleRate).toBe(4);
    expect(source.duration).toBe(1.0);
    expect(source.channelCount).toBe(1);
  });
});
```

```ts
// wav-encoder.test.ts
import { describe, expect, it } from "vitest";
import { encodeWavBuffer, encodeWavBlob } from "./wav-encoder";
import { isWavBytes, parseWavHeader } from "./wav";

describe("wav-encoder", () => {
  it("encodes valid 16-bit PCM mono WAV header and data", () => {
    const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = encodeWavBuffer(samples, 44100);
    const uint8 = new Uint8Array(buffer);

    expect(isWavBytes(uint8)).toBe(true);
    const header = parseWavHeader(buffer);
    expect(header.audioFormat).toBe(1); // PCM
    expect(header.numChannels).toBe(1);
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
  });

  it("encodes valid stereo WAV", () => {
    const left = new Float32Array(100);
    const right = new Float32Array(100);
    const blob = encodeWavBlob([left, right], 48000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 100 * 2 * 2); // 44 header + 100 samples * 2 channels * 2 bytes
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/core/src/sources/array-source.test.ts packages/core/src/sources/wav-encoder.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement `ArrayAudioSource` and `wav-encoder`**

Create `packages/core/src/sources/array-source.ts`:
```ts
import type { AudioSource } from "../types";

export class ArrayAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  private readonly channels: Float32Array[];

  constructor(
    data: Float32Array | Float32Array[] | number[] | number[][],
    sampleRate: number,
    id?: string,
  ) {
    if (!sampleRate || sampleRate <= 0) {
      throw new Error(`Invalid sample rate: ${sampleRate}`);
    }
    this.sampleRate = sampleRate;

    if (Array.isArray(data) && data.length > 0 && (Array.isArray(data[0]) || data[0] instanceof Float32Array)) {
      this.channels = (data as Array<Float32Array | number[]>).map((ch) =>
        ch instanceof Float32Array ? ch : new Float32Array(ch),
      );
    } else if (data instanceof Float32Array) {
      this.channels = [data];
    } else if (Array.isArray(data)) {
      this.channels = [new Float32Array(data as number[])];
    } else {
      throw new Error("Invalid audio array data");
    }

    this.channelCount = this.channels.length;
    const length = this.channels[0]?.length ?? 0;
    this.duration = length / this.sampleRate;
    this.id = id ?? `array:${this.sampleRate}:${length}:${this.channelCount}`;
  }

  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount) {
      throw new Error(`Invalid channel ${options.channel}`);
    }
    const channelData = this.channels[options.channel];
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(
      channelData.length,
      Math.ceil(options.endTime * this.sampleRate),
    );
    return channelData.slice(start, end);
  }

  getChannelData(channel: number): Float32Array {
    if (channel < 0 || channel >= this.channelCount) {
      throw new Error(`Invalid channel ${channel}`);
    }
    return this.channels[channel];
  }
}
```

Create `packages/core/src/sources/wav-encoder.ts`:
```ts
export function encodeWavBuffer(
  channels: Float32Array | Float32Array[] | number[] | number[][],
  sampleRate: number,
  options?: { bitDepth?: 16 | 32 },
): ArrayBuffer {
  const chs: Float32Array[] =
    Array.isArray(channels) &&
    channels.length > 0 &&
    (Array.isArray(channels[0]) || channels[0] instanceof Float32Array)
      ? (channels as Array<Float32Array | number[]>).map((c) =>
          c instanceof Float32Array ? c : new Float32Array(c),
        )
      : [
          channels instanceof Float32Array
            ? channels
            : new Float32Array(channels as number[]),
        ];

  const numChannels = chs.length;
  const numSamples = chs[0]?.length ?? 0;
  const bitDepth = options?.bitDepth ?? 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk Descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave and write PCM samples
  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, chs[ch][i] || 0));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
  } else {
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        view.setFloat32(offset, chs[ch][i] || 0, true);
        offset += 4;
      }
    }
  }

  return buffer;
}

export function encodeWavBlob(
  channels: Float32Array | Float32Array[] | number[] | number[][],
  sampleRate: number,
  options?: { bitDepth?: 16 | 32 },
): Blob {
  const buffer = encodeWavBuffer(channels, sampleRate, options);
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run packages/core/src/sources/array-source.test.ts packages/core/src/sources/wav-encoder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sources/array-source.ts packages/core/src/sources/array-source.test.ts packages/core/src/sources/wav-encoder.ts packages/core/src/sources/wav-encoder.test.ts packages/core/src/index.ts
git commit -m "feat(core): add ArrayAudioSource and in-memory WAV encoder"
```

---

### Task 3: Static Factory Methods on `Sonoscope` (`fromBlob`, `fromBuffer`, `fromArray`) in `@sonoscope/core`

**Files:**
- Modify: `packages/core/src/sonoscope.ts`
- Modify: `packages/core/src/sonoscope.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

**Interfaces:**
- Produces:
  - `Sonoscope.fromBlob(blob: Blob, options?: Omit<SonoscopeOptions, "source">): Promise<Sonoscope>`
  - `Sonoscope.fromBuffer(buffer: ArrayBuffer | Uint8Array, options?: Omit<SonoscopeOptions, "source">): Promise<Sonoscope>`
  - `Sonoscope.fromArray(data: Float32Array | Float32Array[] | number[] | number[][], sampleRate: number, options?: Omit<SonoscopeOptions, "source">): Sonoscope`
  - Re-export `ArrayAudioSource`, `BlobByteSource`, `BufferByteSource`, `encodeWavBlob`, `encodeWavBuffer`, `createAudioSourceFromBlob`, `createAudioSourceFromBuffer` from `@sonoscope/core`.

- [ ] **Step 1: Write failing tests for `Sonoscope.fromBlob`, `Sonoscope.fromBuffer`, `Sonoscope.fromArray`**

Add tests to `packages/core/src/sonoscope.test.ts`:
```ts
describe("Sonoscope factory methods", () => {
  it("creates Sonoscope from Float32Array array and sampleRate", () => {
    const samples = new Float32Array(44100);
    const scope = Sonoscope.fromArray(samples, 44100);
    expect(scope.source.duration).toBe(1.0);
    expect(scope.getSampleRate()).toBe(44100);
    expect(scope.source).toBeInstanceOf(ArrayAudioSource);
  });

  it("creates Sonoscope from Blob", async () => {
    const wavBlob = encodeWavBlob(new Float32Array(44100), 44100);
    const scope = await Sonoscope.fromBlob(wavBlob);
    expect(scope.source.sampleRate).toBe(44100);
    expect(scope.source.duration).toBe(1.0);
  });

  it("creates Sonoscope from ArrayBuffer", async () => {
    const wavBuffer = encodeWavBuffer(new Float32Array(22050), 22050);
    const scope = await Sonoscope.fromBuffer(wavBuffer);
    expect(scope.source.sampleRate).toBe(22050);
    expect(scope.source.duration).toBe(1.0);
  });

  it("automatically creates and revokes ObjectURLs for attached HTMLAudioElement", async () => {
    const audio = document.createElement("audio");
    const samples = new Float32Array(44100);
    const scope = Sonoscope.fromArray(samples, 44100, { audio });
    expect(audio.src).toBeTruthy();
    expect(audio.src.startsWith("blob:")).toBe(true);

    scope.destroy();
    // Verify cleanup handled without errors
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/core/src/sonoscope.test.ts`
Expected: FAIL (`fromBlob`, `fromBuffer`, `fromArray` are not functions)

- [ ] **Step 3: Implement `Sonoscope.fromBlob`, `Sonoscope.fromBuffer`, `Sonoscope.fromArray`**

In `packages/core/src/sonoscope.ts`:
```ts
  static async fromBlob(
    blob: Blob,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const source = await createAudioSourceFromBlob(blob, options);
    let createdUrl: string | undefined;
    let audio = options?.audio;

    if (audio && !audio.src && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      createdUrl = URL.createObjectURL(blob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }

  static async fromBuffer(
    buffer: ArrayBuffer | Uint8Array,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const source = await createAudioSourceFromBuffer(buffer, options);
    let createdUrl: string | undefined;
    let audio = options?.audio;

    if (audio && !audio.src && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([buffer instanceof ArrayBuffer ? buffer : buffer.buffer]);
      createdUrl = URL.createObjectURL(blob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }

  static fromArray(
    data: Float32Array | Float32Array[] | number[] | number[][],
    sampleRate: number,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    const source = new ArrayAudioSource(data, sampleRate);
    let createdUrl: string | undefined;
    let audio = options?.audio;

    if (audio && !audio.src && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const wavBlob = encodeWavBlob(data, sampleRate);
      createdUrl = URL.createObjectURL(wavBlob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }
```

Update exports in `packages/core/src/index.ts`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run packages/core/src/sonoscope.test.ts packages/core/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sonoscope.ts packages/core/src/sonoscope.test.ts packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat(core): add Sonoscope.fromBlob, Sonoscope.fromBuffer, and Sonoscope.fromArray"
```

---

### Task 4: Extend `@sonoscope/react` (`useSonoscope` support for Blob, Buffer, Array)

**Files:**
- Modify: `packages/react/src/useSonoscope.ts`
- Modify: `packages/react/src/react.test.ts`
- Modify: `packages/react/src/index.ts`

**Interfaces:**
- Produces:
  - `UseSonoscopeOptions` with:
    - `blob?: Blob | undefined`
    - `buffer?: ArrayBuffer | Uint8Array | undefined`
    - `array?: Float32Array | Float32Array[] | number[] | number[][] | undefined`
    - `sampleRate?: number | undefined`

- [ ] **Step 1: Write failing tests for `useSonoscope` with `blob`, `buffer`, and `array`**

Add tests to `packages/react/src/react.test.ts`:
```tsx
it("initializes scope from an array and sampleRate", async () => {
  const samples = new Float32Array(44100);
  const { result } = renderHook(() =>
    useSonoscope({ array: samples, sampleRate: 44100 }),
  );
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
    expect(result.current.scope).not.toBeNull();
    expect(result.current.scope?.getSampleRate()).toBe(44100);
  });
});

it("initializes scope from a Blob", async () => {
  const wavBlob = encodeWavBlob(new Float32Array(44100), 44100);
  const { result } = renderHook(() =>
    useSonoscope({ blob: wavBlob }),
  );
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
    expect(result.current.scope).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: FAIL (options properties not supported / scope is null)

- [ ] **Step 3: Update `useSonoscope` in `packages/react/src/useSonoscope.ts`**

Update `UseSonoscopeOptions` and the `useEffect` branch handling:
```ts
export interface UseSonoscopeOptions {
  url?: string | undefined;
  audio?: HTMLAudioElement | undefined;
  source?: AudioSource | undefined;
  blob?: Blob | undefined;
  buffer?: ArrayBuffer | Uint8Array | undefined;
  array?: Float32Array | Float32Array[] | number[] | number[][] | undefined;
  sampleRate?: number | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
}
```
In `useEffect`:
```ts
if (blob) {
  instance = await Sonoscope.fromBlob(blob, { ...sonoscopeOpts, audio });
} else if (buffer) {
  instance = await Sonoscope.fromBuffer(buffer, { ...sonoscopeOpts, audio });
} else if (array && sampleRate) {
  instance = Sonoscope.fromArray(array, sampleRate, { ...sonoscopeOpts, audio });
} else if (url) {
  instance = await Sonoscope.fromUrl(url, { ...sonoscopeOpts, audio });
} else if (source) {
  instance = new Sonoscope({ ...sonoscopeOpts, source, audio });
} else if (audio) {
  instance = await Sonoscope.fromAudio(audio, sonoscopeOpts);
} else {
  return;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/useSonoscope.ts packages/react/src/react.test.ts packages/react/src/index.ts
git commit -m "feat(react): support blob, buffer, and array inputs in useSonoscope"
```

---

### Task 5: Python Anywidget Updates (File Path, NumPy Array, Binary Traitlets, and JS Renderer)

**Files:**
- Modify: `packages/anywidget/src/sonoscope/__init__.py`
- Create: `packages/anywidget/tests/test_sonoscope.py`
- Modify: `packages/anywidget/js/widget.ts`

**Interfaces:**
- Produces:
  - Python `Sonoscope`:
    - `audio_bytes = traitlets.Bytes().tag(sync=True)`
    - `mime_type = traitlets.Unicode(default_value="audio/wav").tag(sync=True)`
    - `Sonoscope.__init__(url="", path=None, audio=None, sample_rate=None, **kwargs)`
    - `Sonoscope.from_file(path: str | Path, **kwargs) -> Sonoscope`
    - `Sonoscope.from_array(audio, sample_rate: int, **kwargs) -> Sonoscope`
    - `Sonoscope.from_url(url: str, **kwargs) -> Sonoscope`
  - JavaScript Anywidget:
    - Automatically checks `model.get("audio_bytes")` vs `model.get("url")` and instantiates `Sonoscope.fromBlob(blob, ...)` with automatic `<audio>` element creation and object URL attachment.

- [ ] **Step 1: Write Python tests for `Sonoscope.from_file`, `Sonoscope.from_array`, and `Sonoscope.from_url`**

Create `packages/anywidget/tests/test_sonoscope.py`:
```python
import io
import pathlib
import tempfile
import unittest
import wave
import numpy as np
from sonoscope import Sonoscope

class TestSonoscopeAnywidget(unittest.TestCase):
    def test_from_url(self):
        w = Sonoscope.from_url("https://example.com/audio.wav")
        self.assertEqual(w.url, "https://example.com/audio.wav")
        self.assertEqual(len(w.audio_bytes), 0)

    def test_from_array_1d_mono(self):
        sr = 22050
        audio = np.sin(2 * np.pi * 440 * np.linspace(0, 1, sr, endpoint=False)).astype(np.float32)
        w = Sonoscope.from_array(audio, sample_rate=sr)
        
        self.assertGreater(len(w.audio_bytes), 44)
        self.assertEqual(w.mime_type, "audio/wav")
        # Validate wave header
        with wave.open(io.BytesIO(w.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getframerate(), 22050)
            self.assertEqual(wf.getnframes(), sr)

    def test_from_array_2d_stereo(self):
        sr = 44100
        audio = np.zeros((2, 1000), dtype=np.float32)
        w = Sonoscope.from_array(audio, sample_rate=sr)
        with wave.open(io.BytesIO(w.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 2)
            self.assertEqual(wf.getframerate(), 44100)
            self.assertEqual(wf.getnframes(), 1000)

    def test_from_file(self):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(temp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(b"\x00\x00" * 100)

        try:
            w = Sonoscope.from_file(temp_path)
            self.assertEqual(len(w.audio_bytes), pathlib.Path(temp_path).stat().st_size)
            self.assertEqual(w.mime_type, "audio/wav")
        finally:
            pathlib.Path(temp_path).unlink()
```

- [ ] **Step 2: Run python tests to verify failure**

Run: `uv run python -m unittest packages/anywidget/tests/test_sonoscope.py`
Expected: FAIL (`from_file` / `from_array` / `audio_bytes` not defined)

- [ ] **Step 3: Implement Python `sonoscope/__init__.py`**

In `packages/anywidget/src/sonoscope/__init__.py`:
Implement:
- `audio_bytes = traitlets.Bytes(default_value=b"").tag(sync=True)`
- `mime_type = traitlets.Unicode(default_value="audio/wav").tag(sync=True)`
- `_encode_audio_to_wav(audio, sample_rate: int) -> bytes` (zero required dependencies, handles float32/int16, 1D and 2D arrays)
- `Sonoscope.__init__(self, *args, url: str = "", path=None, audio=None, sample_rate=None, **kwargs)`
- Classmethods: `from_file`, `from_array`, `from_url`

- [ ] **Step 4: Update JavaScript frontend `packages/anywidget/js/widget.ts`**

In `widget.ts`:
Support `audio_bytes`:
```ts
const audioBytes = model.get("audio_bytes");
const mimeType = model.get("mime_type") || "audio/wav";
const url = model.get("url");

let scope: Sonoscope;
if (audioBytes && audioBytes.byteLength > 0) {
  const blob = new Blob([audioBytes], { type: mimeType });
  scope = await Sonoscope.fromBlob(blob, {
    followPlayback,
    frequencyScale,
    audio,
  });
} else if (url) {
  scope = await Sonoscope.fromAudio(audio, {
    followPlayback,
    frequencyScale,
  });
}
```

Build the anywidget bundle:
`npm run --workspace=@sonoscope/anywidget build`

- [ ] **Step 5: Run Python and JS tests to verify pass**

Run: `uv run python -m unittest packages/anywidget/tests/test_sonoscope.py`
Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/anywidget/src/sonoscope/__init__.py packages/anywidget/tests/ packages/anywidget/js/widget.ts packages/anywidget/src/sonoscope/static/
git commit -m "feat(anywidget): support file paths, numpy arrays and binary traitlets in Python Sonoscope"
```

---

### Task 6: Full Integration Validation & Documentation

**Files:**
- Modify: `README.md`
- Modify: `packages/anywidget/README.md`
- Test: Run all monorepo test suites (`npm test`, `npm run check:types`, `npm run check:biome`)

- [ ] **Step 1: Run complete monorepo test suites and typechecks**

Run: `npm test`
Run: `npm run check:types`
Run: `npm run check:biome`
Expected: All tests and linters pass cleanly.

- [ ] **Step 2: Update documentation and usage examples in README files**

Update `README.md` and `packages/anywidget/README.md` with:
- Drag-and-drop file upload example (`Sonoscope.fromBlob(file)`)
- Synthesized / Float32Array example (`Sonoscope.fromArray(samples, sampleRate)`)
- Python file path & NumPy array example (`Sonoscope.from_file("audio.wav")`, `Sonoscope.from_array(y, sr)`)

- [ ] **Step 3: Commit**

```bash
git add README.md packages/anywidget/README.md
git commit -m "docs: document Blob, Float32Array, and Python NumPy/file source APIs"
```
