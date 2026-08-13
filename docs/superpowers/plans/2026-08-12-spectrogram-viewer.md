# Spectrogram Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a framework-agnostic TypeScript browser spectrogram viewer that renders lazily computed STFT tiles into a provided canvas, synchronizes with an optional audio element, and exposes query APIs.

**Architecture:** The library centers on `SpectrogramViewer`, which owns config/state, requests time tiles from `SpectrogramCache`, computes missing matrices through a pluggable backend, applies transforms, and delegates canvas drawing to `CanvasSpectrogramRenderer`. V1 ships an `AudioSource` abstraction, `DecodedAudioSource`, main-thread compute backend, color/frequency/value helpers, playback playhead support, and numeric query APIs.

**Tech Stack:** TypeScript, Vite library build, Vitest unit tests, browser DOM APIs, Canvas 2D, Web Audio decoding, no runtime dependencies.

## Global Constraints

- The package must be framework-agnostic and use plain TypeScript exports.
- The common API accepts `{ audio: HTMLAudioElement, canvas: HTMLCanvasElement }` and builds a decoded source automatically when `source` is omitted.
- `audio` is for playback synchronization; `source` is for sample access. Document this distinction clearly.
- V1 must not wrap Wavesurfer.
- V1 must not implement a Web Worker backend, WebGL renderer, calibrated SPL units, chunked browser decode, a multi-resolution pyramid, axes/labels/grids, annotation UI, or framework wrappers.
- V1 should ship no runtime dependencies unless a task explicitly justifies one and updates this plan first.
- `db` values are digital display values derived from decoded samples, not dB SPL.
- Use `linear`, `log`, and `mel` frequency scales in V1.
- Use `magnitude`, `power`, and `db` value modes in V1.
- Expose `queryPoint`, `queryCanvasPoint`, `querySpectrum`, and `queryFrame` in V1.

---

## File Structure

- Create `package.json`: package metadata, scripts, export map, dev dependencies.
- Create `tsconfig.json`: strict TypeScript library config.
- Create `vite.config.ts`: ESM/CJS library build and Vitest config.
- Create `src/index.ts`: public exports only.
- Create `src/types.ts`: shared public and internal type definitions.
- Create `src/events.ts`: small typed event emitter.
- Create `src/config.ts`: defaults, config resolution, validation, cache-relevant hashes.
- Create `src/source.ts`: `AudioSource`, `DecodedAudioSource`, and source creation helpers.
- Create `src/frequency-scale.ts`: linear/log/mel conversion and coordinate mapping helpers.
- Create `src/colormap.ts`: named maps, custom point interpolation, contrast/gamma/brightness adjustment.
- Create `src/value-scale.ts`: magnitude/power/db derivation and normalization.
- Create `src/stft.ts`: window functions, radix-2 FFT, and STFT matrix computation.
- Create `src/backend.ts`: compute backend interface and `MainThreadComputeBackend`.
- Create `src/transforms.ts`: transform pipeline, padding calculation, and crop helpers.
- Create `src/cache.ts`: tile keying, lazy cache, eviction.
- Create `src/renderer.ts`: high-DPI canvas setup, tile painting, playhead drawing.
- Create `src/viewer.ts`: `SpectrogramViewer` orchestration and public API.
- Create `examples/basic/index.html`: minimal browser demo.
- Create `examples/basic/main.ts`: demo initialization.
- Create `README.md`: usage, audio/source distinction, non-calibrated dB note.
- Create tests beside modules as `src/*.test.ts`.

---

### Task 1: Package Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/index.ts`
- Create: `src/types.ts`
- Create: `src/index.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: build/test scripts, public type shell, and `src/index.ts` export surface used by later tasks.

- [ ] **Step 1: Write the failing smoke test**

Create `src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { version } from './index';

describe('public entrypoint', () => {
  it('exports a package version string', () => {
    expect(version).toBe('0.0.0');
  });
});
```

- [ ] **Step 2: Add package and TypeScript tooling**

Create `package.json`:

```json
{
  "name": "spectrogram-js",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@vitest/browser": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*.ts", "vite.config.ts"],
  "exclude": ["dist"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    sourcemap: true,
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add public type shell and entrypoint**

Create `src/types.ts`:

```ts
export type FrequencyScale = 'linear' | 'log' | 'mel';
export type ValueMode = 'magnitude' | 'power' | 'db';
export type WindowName = 'hann' | 'hamming' | 'blackman' | 'rectangular';

export type Rgba = [number, number, number, number];
```

Create `src/index.ts`:

```ts
export const version = '0.0.0';
export type { FrequencyScale, Rgba, ValueMode, WindowName } from './types';
```

- [ ] **Step 4: Run the smoke test**

Run: `npm install`

Run: `npm test -- src/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist/index.js` plus declarations are generated.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/index.ts src/types.ts src/index.test.ts
git commit -m "build: scaffold TypeScript library"
```

---

### Task 2: Shared Types, Config, Events, And Source

**Files:**
- Modify: `src/types.ts`
- Create: `src/events.ts`
- Create: `src/config.ts`
- Create: `src/source.ts`
- Create: `src/config.test.ts`
- Create: `src/events.test.ts`
- Create: `src/source.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `FrequencyScale`, `ValueMode`, `WindowName`, `Rgba` from Task 1.
- Produces: `SpectrogramConfig`, `ResolvedSpectrogramConfig`, `resolveConfig`, `TypedEventEmitter`, `AudioSource`, `DecodedAudioSource`.

- [ ] **Step 1: Expand shared types**

Update `src/types.ts` with these exported types:

```ts
export type FrequencyScale = 'linear' | 'log' | 'mel';
export type ValueMode = 'magnitude' | 'power' | 'db';
export type WindowName = 'hann' | 'hamming' | 'blackman' | 'rectangular';
export type Rgba = [number, number, number, number];

export type StftConfig = {
  windowSize: number;
  fftSize: number;
  hopSize: number;
  window: WindowName;
};

export type ViewportConfig = {
  startTime: number;
  endTime: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
};

export type ValueScaleConfig = {
  mode: ValueMode;
  min?: number;
  max?: number;
  gamma?: number;
  clamp?: boolean;
};

export type BuiltInColorMap = 'gray' | 'viridis' | 'magma' | 'inferno' | 'plasma' | 'turbo';
export type ColorPoint = { at: number; color: string | Rgba };
export type ColorMapConfig =
  | BuiltInColorMap
  | { base: BuiltInColorMap; gamma?: number; contrast?: number; brightness?: number }
  | { points: ColorPoint[]; gamma?: number; contrast?: number; brightness?: number };

export type PlaybackConfig = {
  showPlayhead: boolean;
  follow: boolean;
  followMargin: number;
  renderOnSeek: boolean;
};

export type CacheConfig = {
  tileDurationSeconds: number;
  maxCachedTiles: number;
};

export type SpectrogramMatrix = {
  channel: number;
  timeStart: number;
  timeEnd: number;
  frameStart: number;
  frameCount: number;
  binCount: number;
  sampleRate: number;
  times: Float32Array;
  frequencies: Float32Array;
  magnitude: Float32Array;
  power?: Float32Array;
  db?: Float32Array;
  normalized?: Uint8Array | Float32Array;
};

export type TransformContext = {
  readonly requestedTimeStart: number;
  readonly requestedTimeEnd: number;
  readonly sampleRate: number;
  readonly stft: StftConfig;
};

export type SpectrogramTransform = {
  name: string;
  version: string;
  config?: unknown;
  timePaddingSeconds?: number;
  frequencyPaddingBins?: number;
  apply(matrix: SpectrogramMatrix, context: TransformContext): SpectrogramMatrix | Promise<SpectrogramMatrix>;
};

export type SpectrogramStatus =
  | { state: 'idle' | 'loading' | 'rendering' | 'ready' | 'destroyed'; error?: undefined }
  | { state: 'error'; error: Error };

export type SpectrogramEvents = {
  configchange: { config: ResolvedSpectrogramConfig };
  viewportchange: { viewport: ViewportConfig };
  renderstart: { requestId: string; total: number };
  renderprogress: { requestId: string; completed: number; total: number; progress: number; phase: 'computing' | 'rendering' };
  rendercomplete: { requestId: string; renderedTiles: number; missingTiles: number };
  tileload: { tileId: string; timeStart: number; timeEnd: number; channel: number };
  error: { error: Error; recoverable: boolean; phase: 'decode' | 'source' | 'compute' | 'transform' | 'render' | 'playback' };
};

export type SpectrogramConfig = {
  audio?: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  source?: AudioSource;
  stft?: Partial<StftConfig>;
  viewport?: Partial<ViewportConfig>;
  valueScale?: Partial<ValueScaleConfig>;
  colorMap?: ColorMapConfig;
  playback?: Partial<PlaybackConfig>;
  cache?: Partial<CacheConfig>;
  transforms?: SpectrogramTransform[];
};

export type ResolvedSpectrogramConfig = {
  audio?: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  source?: AudioSource;
  stft: StftConfig;
  viewport: ViewportConfig;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  playback: PlaybackConfig;
  cache: CacheConfig;
  transforms: SpectrogramTransform[];
};

export interface AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  read(options: { channel: number; startTime: number; endTime: number }): Float32Array | Promise<Float32Array>;
}
```

- [ ] **Step 2: Write config validation tests**

Create `src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config';
import type { AudioSource } from './types';

const source: AudioSource = {
  id: 'test-source',
  sampleRate: 48_000,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(0),
};

const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;

describe('resolveConfig', () => {
  it('fills defaults and preserves provided source', () => {
    const config = resolveConfig({ canvas, source });
    expect(config.source).toBe(source);
    expect(config.stft).toEqual({ windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' });
    expect(config.viewport.frequencyScale).toBe('linear');
    expect(config.colorMap).toBe('viridis');
  });

  it('throws when fftSize is not a power of two', () => {
    expect(() => resolveConfig({ canvas, source, stft: { fftSize: 1000 } })).toThrow(/power of two/);
  });

  it('throws when neither source nor audio is provided', () => {
    expect(() => resolveConfig({ canvas })).toThrow(/source or audio/);
  });
});
```

- [ ] **Step 3: Implement config resolution**

Create `src/config.ts`:

```ts
import type { ResolvedSpectrogramConfig, SpectrogramConfig, StftConfig } from './types';

const DEFAULT_STFT: StftConfig = { windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' };

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && 2 ** Math.round(Math.log2(value)) === value;
}

export function resolveConfig(input: SpectrogramConfig): ResolvedSpectrogramConfig {
  if (!input.canvas) throw new Error('SpectrogramViewer requires a canvas');
  if (!input.source && !input.audio) throw new Error('SpectrogramViewer requires either source or audio');

  const stft = { ...DEFAULT_STFT, ...input.stft };
  if (!isPowerOfTwo(stft.fftSize)) throw new Error('stft.fftSize must be a power of two');
  if (stft.fftSize < stft.windowSize) throw new Error('stft.fftSize must be greater than or equal to stft.windowSize');
  if (stft.windowSize <= 0) throw new Error('stft.windowSize must be greater than zero');
  if (stft.hopSize <= 0) throw new Error('stft.hopSize must be greater than zero');

  const viewport = {
    startTime: 0,
    endTime: input.source?.duration ?? input.audio?.duration ?? 1,
    minFrequency: 0,
    maxFrequency: input.source ? input.source.sampleRate / 2 : 22_050,
    frequencyScale: 'linear' as const,
    ...input.viewport,
  };
  if (viewport.endTime <= viewport.startTime) throw new Error('viewport.endTime must be greater than viewport.startTime');
  if (viewport.maxFrequency <= viewport.minFrequency) throw new Error('viewport.maxFrequency must be greater than viewport.minFrequency');

  return {
    audio: input.audio,
    canvas: input.canvas,
    source: input.source,
    stft,
    viewport,
    valueScale: { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true, ...input.valueScale },
    colorMap: input.colorMap ?? 'viridis',
    playback: { showPlayhead: true, follow: false, followMargin: 0.2, renderOnSeek: true, ...input.playback },
    cache: { tileDurationSeconds: 5, maxCachedTiles: 64, ...input.cache },
    transforms: input.transforms ?? [],
  };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'function' ? '[function]' : item));
}
```

- [ ] **Step 4: Write event emitter tests**

Create `src/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TypedEventEmitter } from './events';

type Events = { ping: { value: number } };

describe('TypedEventEmitter', () => {
  it('emits and unsubscribes handlers', () => {
    const emitter = new TypedEventEmitter<Events>();
    const values: number[] = [];
    const off = emitter.on('ping', (event) => values.push(event.value));
    emitter.emit('ping', { value: 1 });
    off();
    emitter.emit('ping', { value: 2 });
    expect(values).toEqual([1]);
  });
});
```

- [ ] **Step 5: Implement event emitter**

Create `src/events.ts`:

```ts
export class TypedEventEmitter<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<(event: Events[keyof Events]) => void>>();

  on<Name extends keyof Events>(name: Name, handler: (event: Events[Name]) => void): () => void {
    const existing = this.handlers.get(name) ?? new Set<(event: Events[keyof Events]) => void>();
    existing.add(handler as (event: Events[keyof Events]) => void);
    this.handlers.set(name, existing);
    return () => existing.delete(handler as (event: Events[keyof Events]) => void);
  }

  emit<Name extends keyof Events>(name: Name, event: Events[Name]): void {
    for (const handler of this.handlers.get(name) ?? []) handler(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
```

- [ ] **Step 6: Write decoded source tests**

Create `src/source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DecodedAudioSource } from './source';

function makeBuffer(): AudioBuffer {
  return {
    sampleRate: 10,
    duration: 1,
    length: 10,
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  } as unknown as AudioBuffer;
}

describe('DecodedAudioSource', () => {
  it('reads a time range as a copied Float32Array', () => {
    const source = new DecodedAudioSource(makeBuffer(), 'fixture');
    expect(Array.from(source.read({ channel: 0, startTime: 0.2, endTime: 0.5 }))).toEqual([2, 3, 4]);
  });
});
```

- [ ] **Step 7: Implement decoded source**

Create `src/source.ts`:

```ts
import type { AudioSource } from './types';

export class DecodedAudioSource implements AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;

  constructor(private readonly buffer: AudioBuffer, readonly id = `decoded:${buffer.sampleRate}:${buffer.length}:${buffer.numberOfChannels}`) {
    this.sampleRate = buffer.sampleRate;
    this.duration = buffer.duration;
    this.channelCount = buffer.numberOfChannels;
  }

  static async fromUrl(url: string, audioContext = new AudioContext()): Promise<DecodedAudioSource> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio source: ${response.status}`);
    const data = await response.arrayBuffer();
    return new DecodedAudioSource(await audioContext.decodeAudioData(data), url);
  }

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array {
    if (options.channel < 0 || options.channel >= this.channelCount) throw new Error(`Invalid channel ${options.channel}`);
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(this.buffer.length, Math.ceil(options.endTime * this.sampleRate));
    return this.buffer.getChannelData(options.channel).slice(start, end);
  }
}
```

- [ ] **Step 8: Export new modules**

Update `src/index.ts`:

```ts
export const version = '0.0.0';
export { resolveConfig, stableHash } from './config';
export { TypedEventEmitter } from './events';
export { DecodedAudioSource } from './source';
export type * from './types';
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test -- src/config.test.ts src/events.test.ts src/source.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/config.ts src/config.test.ts src/events.ts src/events.test.ts src/source.ts src/source.test.ts src/index.ts
git commit -m "feat: add core config and audio source types"
```

---

### Task 3: Frequency, Color, And Value Helpers

**Files:**
- Create: `src/frequency-scale.ts`
- Create: `src/frequency-scale.test.ts`
- Create: `src/colormap.ts`
- Create: `src/colormap.test.ts`
- Create: `src/value-scale.ts`
- Create: `src/value-scale.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `FrequencyScale`, `ColorMapConfig`, `Rgba`, `ValueScaleConfig`.
- Produces: `canvasToTimeFrequency`, `timeFrequencyToCanvas`, `buildColorMap`, `normalizeValue`, `deriveValueArrays`.

- [ ] **Step 1: Write frequency mapping tests**

Create `src/frequency-scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canvasToTimeFrequency, hzToMel, melToHz, timeFrequencyToCanvas } from './frequency-scale';

const viewport = { startTime: 10, endTime: 20, minFrequency: 100, maxFrequency: 10_000, frequencyScale: 'linear' as const };

describe('frequency-scale', () => {
  it('round-trips mel conversion', () => {
    expect(melToHz(hzToMel(1000))).toBeCloseTo(1000, 5);
  });

  it('maps canvas center to viewport center for linear axes', () => {
    expect(canvasToTimeFrequency(50, 50, 100, 100, viewport)).toEqual({ time: 15, frequency: 5050 });
  });

  it('round-trips time/frequency coordinates', () => {
    const point = timeFrequencyToCanvas(12.5, 2575, 100, 100, viewport);
    expect(canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).time).toBeCloseTo(12.5);
    expect(canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).frequency).toBeCloseTo(2575);
  });
});
```

- [ ] **Step 2: Implement frequency mapping**

Create `src/frequency-scale.ts`:

```ts
import type { FrequencyScale, ViewportConfig } from './types';

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function hzToScale(hz: number, scale: FrequencyScale): number {
  if (scale === 'mel') return hzToMel(hz);
  if (scale === 'log') return Math.log10(Math.max(1, hz));
  return hz;
}

export function scaleToHz(value: number, scale: FrequencyScale): number {
  if (scale === 'mel') return melToHz(value);
  if (scale === 'log') return 10 ** value;
  return value;
}

export function canvasToTimeFrequency(x: number, y: number, width: number, height: number, viewport: ViewportConfig): { time: number; frequency: number } {
  const time = viewport.startTime + (x / width) * (viewport.endTime - viewport.startTime);
  const min = hzToScale(viewport.minFrequency, viewport.frequencyScale);
  const max = hzToScale(viewport.maxFrequency, viewport.frequencyScale);
  const scaled = max - (y / height) * (max - min);
  return { time, frequency: scaleToHz(scaled, viewport.frequencyScale) };
}

export function timeFrequencyToCanvas(time: number, frequency: number, width: number, height: number, viewport: ViewportConfig): { x: number; y: number } {
  const x = ((time - viewport.startTime) / (viewport.endTime - viewport.startTime)) * width;
  const min = hzToScale(viewport.minFrequency, viewport.frequencyScale);
  const max = hzToScale(viewport.maxFrequency, viewport.frequencyScale);
  const scaled = hzToScale(frequency, viewport.frequencyScale);
  const y = (1 - (scaled - min) / (max - min)) * height;
  return { x, y };
}
```

- [ ] **Step 3: Write color map tests**

Create `src/colormap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildColorMap, parseColor } from './colormap';

describe('colormap', () => {
  it('parses hex colors to rgba bytes', () => {
    expect(parseColor('#336699')).toEqual([51, 102, 153, 255]);
  });

  it('builds named maps with 256 entries', () => {
    expect(buildColorMap('viridis')).toHaveLength(256);
    expect(buildColorMap('gray')[0]).toEqual([0, 0, 0, 255]);
    expect(buildColorMap('gray')[255]).toEqual([255, 255, 255, 255]);
  });

  it('interpolates custom points', () => {
    const map = buildColorMap({ points: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] });
    expect(map[128]?.[0]).toBeGreaterThan(120);
    expect(map[128]?.[0]).toBeLessThan(136);
  });
});
```

- [ ] **Step 4: Implement color maps**

Create `src/colormap.ts` with lightweight built-in maps. Use small anchor lists for perceptual maps and interpolate to 256 entries:

```ts
import type { BuiltInColorMap, ColorMapConfig, Rgba } from './types';

const ANCHORS: Record<BuiltInColorMap, Array<{ at: number; color: Rgba }>> = {
  gray: [{ at: 0, color: [0, 0, 0, 255] }, { at: 1, color: [255, 255, 255, 255] }],
  viridis: [{ at: 0, color: [68, 1, 84, 255] }, { at: 0.33, color: [49, 104, 142, 255] }, { at: 0.66, color: [53, 183, 121, 255] }, { at: 1, color: [253, 231, 37, 255] }],
  magma: [{ at: 0, color: [0, 0, 4, 255] }, { at: 0.33, color: [87, 15, 109, 255] }, { at: 0.66, color: [187, 55, 84, 255] }, { at: 1, color: [252, 253, 191, 255] }],
  inferno: [{ at: 0, color: [0, 0, 4, 255] }, { at: 0.33, color: [120, 28, 109, 255] }, { at: 0.66, color: [237, 105, 37, 255] }, { at: 1, color: [252, 255, 164, 255] }],
  plasma: [{ at: 0, color: [13, 8, 135, 255] }, { at: 0.33, color: [126, 3, 168, 255] }, { at: 0.66, color: [240, 89, 97, 255] }, { at: 1, color: [240, 249, 33, 255] }],
  turbo: [{ at: 0, color: [48, 18, 59, 255] }, { at: 0.25, color: [50, 101, 214, 255] }, { at: 0.5, color: [37, 213, 118, 255] }, { at: 0.75, color: [249, 210, 60, 255] }, { at: 1, color: [122, 4, 3, 255] }],
};

export function parseColor(color: string | Rgba): Rgba {
  if (Array.isArray(color)) return color;
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) throw new Error(`Unsupported color format: ${color}`);
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16), 255];
}

function adjust(value: number, gamma: number, contrast: number, brightness: number): number {
  const normalized = Math.max(0, Math.min(1, value / 255));
  const gammaValue = normalized ** gamma;
  const contrasted = (gammaValue - 0.5) * contrast + 0.5 + brightness;
  return Math.round(Math.max(0, Math.min(1, contrasted)) * 255);
}

function interpolate(points: Array<{ at: number; color: Rgba }>, gamma = 1, contrast = 1, brightness = 0): Rgba[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  return Array.from({ length: 256 }, (_, index) => {
    const at = index / 255;
    const hi = sorted.find((point) => point.at >= at) ?? sorted[sorted.length - 1]!;
    const lo = [...sorted].reverse().find((point) => point.at <= at) ?? sorted[0]!;
    const span = hi.at - lo.at || 1;
    const t = (at - lo.at) / span;
    const rgba = lo.color.map((value, channel) => Math.round(value + (hi.color[channel]! - value) * t)) as Rgba;
    return [adjust(rgba[0], gamma, contrast, brightness), adjust(rgba[1], gamma, contrast, brightness), adjust(rgba[2], gamma, contrast, brightness), rgba[3]];
  });
}

export function buildColorMap(config: ColorMapConfig): Rgba[] {
  if (typeof config === 'string') return interpolate(ANCHORS[config]);
  if ('base' in config) return interpolate(ANCHORS[config.base], config.gamma ?? 1, config.contrast ?? 1, config.brightness ?? 0);
  return interpolate(config.points.map((point) => ({ at: point.at, color: parseColor(point.color) })), config.gamma ?? 1, config.contrast ?? 1, config.brightness ?? 0);
}
```

- [ ] **Step 5: Write value scale tests**

Create `src/value-scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dbFromMagnitude, normalizeValue } from './value-scale';

describe('value-scale', () => {
  it('computes digital db from magnitude', () => {
    expect(dbFromMagnitude(1)).toBeCloseTo(0);
    expect(dbFromMagnitude(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('normalizes and clamps values', () => {
    expect(normalizeValue(-50, { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true })).toBeCloseTo(0.5);
    expect(normalizeValue(10, { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true })).toBe(1);
  });
});
```

- [ ] **Step 6: Implement value scaling**

Create `src/value-scale.ts`:

```ts
import type { ValueScaleConfig } from './types';

const FLOOR = 1e-12;

export function dbFromMagnitude(magnitude: number): number {
  return 20 * Math.log10(Math.max(FLOOR, Math.abs(magnitude)));
}

export function normalizeValue(value: number, config: Required<ValueScaleConfig>): number {
  const min = config.min;
  const max = config.max;
  const span = max - min || 1;
  let normalized = (value - min) / span;
  if (config.clamp) normalized = Math.max(0, Math.min(1, normalized));
  return normalized ** config.gamma;
}

export function derivePower(magnitude: Float32Array): Float32Array {
  return Float32Array.from(magnitude, (value) => value * value);
}

export function deriveDb(magnitude: Float32Array): Float32Array {
  return Float32Array.from(magnitude, dbFromMagnitude);
}
```

- [ ] **Step 7: Export helpers**

Update `src/index.ts`:

```ts
export const version = '0.0.0';
export { buildColorMap, parseColor } from './colormap';
export { resolveConfig, stableHash } from './config';
export { TypedEventEmitter } from './events';
export { canvasToTimeFrequency, hzToMel, hzToScale, melToHz, scaleToHz, timeFrequencyToCanvas } from './frequency-scale';
export { DecodedAudioSource } from './source';
export { dbFromMagnitude, deriveDb, derivePower, normalizeValue } from './value-scale';
export type * from './types';
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- src/frequency-scale.test.ts src/colormap.test.ts src/value-scale.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/frequency-scale.ts src/frequency-scale.test.ts src/colormap.ts src/colormap.test.ts src/value-scale.ts src/value-scale.test.ts src/index.ts
git commit -m "feat: add scale color and value helpers"
```

---

### Task 4: STFT And Main-Thread Backend

**Files:**
- Create: `src/stft.ts`
- Create: `src/stft.test.ts`
- Create: `src/backend.ts`
- Create: `src/backend.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `AudioSource`, `SpectrogramMatrix`, `StftConfig`, `deriveDb`, `derivePower`.
- Produces: `computeStftMatrix`, `SpectrogramComputeBackend`, `MainThreadComputeBackend`.

- [ ] **Step 1: Write STFT tests**

Create `src/stft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeStftMatrix, createWindow } from './stft';

describe('stft', () => {
  it('creates known window functions', () => {
    expect(Array.from(createWindow('rectangular', 4))).toEqual([1, 1, 1, 1]);
    expect(createWindow('hann', 4)[0]).toBeCloseTo(0);
  });

  it('finds a sine peak near the expected frequency', () => {
    const sampleRate = 1024;
    const samples = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 128 * (i / sampleRate)));
    const matrix = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: 'hann' },
    });
    const firstFrame = matrix.magnitude.slice(0, matrix.binCount);
    let maxBin = 0;
    for (let i = 1; i < firstFrame.length; i++) if (firstFrame[i]! > firstFrame[maxBin]!) maxBin = i;
    expect(matrix.frequencies[maxBin]).toBeCloseTo(128, 0);
  });
});
```

- [ ] **Step 2: Implement STFT**

Create `src/stft.ts`:

```ts
import type { SpectrogramMatrix, StftConfig, WindowName } from './types';
import { deriveDb, derivePower } from './value-scale';

export function createWindow(name: WindowName, size: number): Float32Array {
  return Float32Array.from({ length: size }, (_, n) => {
    if (name === 'rectangular') return 1;
    if (name === 'hann') return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
    if (name === 'hamming') return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (size - 1));
    return 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (size - 1));
  });
}

function fftMagnitudes(realInput: Float32Array): Float32Array {
  const n = realInput.length;
  const real = Float64Array.from(realInput);
  const imag = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j]!, real[i]!];
      [imag[i], imag[j]] = [imag[j]!, imag[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j++) {
        const evenReal = real[i + j]!;
        const evenImag = imag[i + j]!;
        const oddReal = real[i + j + len / 2]! * wReal - imag[i + j + len / 2]! * wImag;
        const oddImag = real[i + j + len / 2]! * wImag + imag[i + j + len / 2]! * wReal;
        real[i + j] = evenReal + oddReal;
        imag[i + j] = evenImag + oddImag;
        real[i + j + len / 2] = evenReal - oddReal;
        imag[i + j + len / 2] = evenImag - oddImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }
  return Float32Array.from({ length: n / 2 }, (_, i) => Math.hypot(real[i]!, imag[i]!) / n);
}

export function computeStftMatrix(samples: Float32Array, options: { channel: number; timeStart: number; sampleRate: number; stft: StftConfig }): SpectrogramMatrix {
  const { stft, sampleRate } = options;
  const frameCount = Math.max(0, Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1);
  const binCount = stft.fftSize / 2;
  const window = createWindow(stft.window, stft.windowSize);
  const magnitude = new Float32Array(frameCount * binCount);
  const frame = new Float32Array(stft.fftSize);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    frame.fill(0);
    const offset = frameIndex * stft.hopSize;
    for (let i = 0; i < stft.windowSize; i++) frame[i] = samples[offset + i]! * window[i]!;
    magnitude.set(fftMagnitudes(frame), frameIndex * binCount);
  }
  const times = Float32Array.from({ length: frameCount }, (_, i) => options.timeStart + (i * stft.hopSize) / sampleRate);
  const frequencies = Float32Array.from({ length: binCount }, (_, i) => (i * sampleRate) / stft.fftSize);
  return {
    channel: options.channel,
    timeStart: options.timeStart,
    timeEnd: options.timeStart + samples.length / sampleRate,
    frameStart: Math.round((options.timeStart * sampleRate) / stft.hopSize),
    frameCount,
    binCount,
    sampleRate,
    times,
    frequencies,
    magnitude,
    power: derivePower(magnitude),
    db: deriveDb(magnitude),
  };
}
```

- [ ] **Step 3: Write backend tests**

Create `src/backend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MainThreadComputeBackend } from './backend';
import type { AudioSource } from './types';

describe('MainThreadComputeBackend', () => {
  it('reads a source range and computes a matrix', async () => {
    const source: AudioSource = {
      id: 'source',
      sampleRate: 1024,
      duration: 1,
      channelCount: 1,
      read: () => new Float32Array(1024),
    };
    const backend = new MainThreadComputeBackend();
    const matrix = await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: 'hann' },
    });
    expect(matrix.channel).toBe(0);
    expect(matrix.binCount).toBe(128);
  });
});
```

- [ ] **Step 4: Implement backend**

Create `src/backend.ts`:

```ts
import { computeStftMatrix } from './stft';
import type { AudioSource, SpectrogramMatrix, StftConfig } from './types';

export type ComputeTileRequest = {
  source: AudioSource;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stft: StftConfig;
};

export interface SpectrogramComputeBackend {
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy?(): void;
}

export class MainThreadComputeBackend implements SpectrogramComputeBackend {
  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const samples = await request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd });
    return computeStftMatrix(samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.source.sampleRate,
      stft: request.stft,
    });
  }
}
```

- [ ] **Step 5: Export backend and STFT helpers**

Update `src/index.ts` to include:

```ts
export { MainThreadComputeBackend } from './backend';
export type { ComputeTileRequest, SpectrogramComputeBackend } from './backend';
export { computeStftMatrix, createWindow } from './stft';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/stft.test.ts src/backend.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stft.ts src/stft.test.ts src/backend.ts src/backend.test.ts src/index.ts
git commit -m "feat: add main thread STFT backend"
```

---

### Task 5: Transform Pipeline And Tile Cache

**Files:**
- Create: `src/transforms.ts`
- Create: `src/transforms.test.ts`
- Create: `src/cache.ts`
- Create: `src/cache.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `SpectrogramTransform`, `SpectrogramMatrix`, `SpectrogramComputeBackend`, `stableHash`.
- Produces: `applyTransforms`, `getTransformPadding`, `SpectrogramCache`, `TileRequest`, `TileKey`.

- [ ] **Step 1: Write transform tests**

Create `src/transforms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyTransforms, getTransformPadding } from './transforms';
import type { SpectrogramMatrix, SpectrogramTransform } from './types';

function matrix(): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart: 0,
    timeEnd: 1,
    frameStart: 0,
    frameCount: 2,
    binCount: 2,
    sampleRate: 4,
    times: Float32Array.from([0, 0.5]),
    frequencies: Float32Array.from([0, 2]),
    magnitude: Float32Array.from([1, 2, 3, 4]),
  };
}

describe('transforms', () => {
  it('combines requested padding', () => {
    expect(getTransformPadding([{ name: 'a', version: '1', timePaddingSeconds: 1, frequencyPaddingBins: 2, apply: (m) => m }])).toEqual({ timePaddingSeconds: 1, frequencyPaddingBins: 2 });
  });

  it('applies transforms in order', async () => {
    const transforms: SpectrogramTransform[] = [
      { name: 'double', version: '1', apply: (m) => ({ ...m, magnitude: Float32Array.from(m.magnitude, (v) => v * 2) }) },
    ];
    expect(Array.from((await applyTransforms(matrix(), transforms, { requestedTimeStart: 0, requestedTimeEnd: 1, sampleRate: 4, stft: { windowSize: 2, fftSize: 2, hopSize: 1, window: 'hann' } })).magnitude)).toEqual([2, 4, 6, 8]);
  });
});
```

- [ ] **Step 2: Implement transform pipeline**

Create `src/transforms.ts`:

```ts
import type { SpectrogramMatrix, SpectrogramTransform, TransformContext } from './types';

export function getTransformPadding(transforms: SpectrogramTransform[]): { timePaddingSeconds: number; frequencyPaddingBins: number } {
  return transforms.reduce(
    (padding, transform) => ({
      timePaddingSeconds: Math.max(padding.timePaddingSeconds, transform.timePaddingSeconds ?? 0),
      frequencyPaddingBins: Math.max(padding.frequencyPaddingBins, transform.frequencyPaddingBins ?? 0),
    }),
    { timePaddingSeconds: 0, frequencyPaddingBins: 0 },
  );
}

export async function applyTransforms(matrix: SpectrogramMatrix, transforms: SpectrogramTransform[], context: TransformContext): Promise<SpectrogramMatrix> {
  let current = matrix;
  for (const transform of transforms) current = await transform.apply(current, context);
  return current;
}
```

- [ ] **Step 3: Write cache tests**

Create `src/cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SpectrogramCache, createTileKey } from './cache';
import type { SpectrogramMatrix } from './types';

function matrix(id: number): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart: id,
    timeEnd: id + 1,
    frameStart: 0,
    frameCount: 1,
    binCount: 1,
    sampleRate: 1,
    times: Float32Array.from([id]),
    frequencies: Float32Array.from([0]),
    magnitude: Float32Array.from([id]),
  };
}

describe('SpectrogramCache', () => {
  it('creates stable tile keys', () => {
    expect(createTileKey({ sourceId: 'a', channel: 0, timeStart: 0, timeEnd: 1, stftHash: 's', transformHash: 't' })).toBe('a|0|0.000000|1.000000|s|t');
  });

  it('evicts oldest tiles beyond maxCachedTiles', () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 1 });
    cache.set('a', matrix(1));
    cache.set('b', matrix(2));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.timeStart).toBe(2);
  });
});
```

- [ ] **Step 4: Implement cache**

Create `src/cache.ts`:

```ts
import type { SpectrogramMatrix } from './types';

export type TileKeyParts = {
  sourceId: string;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stftHash: string;
  transformHash: string;
};

export function createTileKey(parts: TileKeyParts): string {
  return [parts.sourceId, parts.channel, parts.timeStart.toFixed(6), parts.timeEnd.toFixed(6), parts.stftHash, parts.transformHash].join('|');
}

export class SpectrogramCache {
  private readonly tiles = new Map<string, SpectrogramMatrix>();

  constructor(private readonly options: { maxCachedTiles: number }) {}

  get(key: string): SpectrogramMatrix | undefined {
    const value = this.tiles.get(key);
    if (!value) return undefined;
    this.tiles.delete(key);
    this.tiles.set(key, value);
    return value;
  }

  set(key: string, matrix: SpectrogramMatrix): void {
    this.tiles.set(key, matrix);
    while (this.tiles.size > this.options.maxCachedTiles) {
      const oldest = this.tiles.keys().next().value as string | undefined;
      if (!oldest) break;
      this.tiles.delete(oldest);
    }
  }

  clear(): void {
    this.tiles.clear();
  }
}
```

- [ ] **Step 5: Export transform and cache modules**

Update `src/index.ts` to include:

```ts
export { createTileKey, SpectrogramCache } from './cache';
export type { TileKeyParts } from './cache';
export { applyTransforms, getTransformPadding } from './transforms';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/transforms.test.ts src/cache.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/transforms.ts src/transforms.test.ts src/cache.ts src/cache.test.ts src/index.ts
git commit -m "feat: add transform pipeline and tile cache"
```

---

### Task 6: Canvas Renderer

**Files:**
- Create: `src/renderer.ts`
- Create: `src/renderer.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `SpectrogramMatrix`, `ViewportConfig`, `ValueScaleConfig`, `buildColorMap`, coordinate mapping helpers.
- Produces: `CanvasSpectrogramRenderer`, `RenderInput`.

- [ ] **Step 1: Write renderer unit tests for non-DOM logic**

Create `src/renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickNearestBin, pickNearestFrame } from './renderer';

describe('renderer helpers', () => {
  it('picks nearest frame and bin indexes', () => {
    expect(pickNearestFrame(Float32Array.from([0, 0.5, 1]), 0.6)).toBe(1);
    expect(pickNearestBin(Float32Array.from([100, 200, 300]), 260)).toBe(2);
  });
});
```

- [ ] **Step 2: Implement renderer**

Create `src/renderer.ts`:

```ts
import { buildColorMap } from './colormap';
import { timeFrequencyToCanvas } from './frequency-scale';
import { normalizeValue } from './value-scale';
import type { ColorMapConfig, Rgba, SpectrogramMatrix, ValueScaleConfig, ViewportConfig } from './types';

export type RenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  tiles: SpectrogramMatrix[];
  playheadTime?: number;
};

export function pickNearestFrame(times: Float32Array, time: number): number {
  let best = 0;
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i]! - time) < Math.abs(times[best]! - time)) best = i;
  return best;
}

export function pickNearestBin(frequencies: Float32Array, frequency: number): number {
  let best = 0;
  for (let i = 1; i < frequencies.length; i++) if (Math.abs(frequencies[i]! - frequency) < Math.abs(frequencies[best]! - frequency)) best = i;
  return best;
}

function selectedValue(tile: SpectrogramMatrix, index: number, mode: ValueScaleConfig['mode']): number {
  if (mode === 'power') return tile.power?.[index] ?? tile.magnitude[index]! ** 2;
  if (mode === 'db') return tile.db?.[index] ?? 20 * Math.log10(Math.max(1e-12, Math.abs(tile.magnitude[index]!)));
  return tile.magnitude[index]!;
}

export class CanvasSpectrogramRenderer {
  render(input: RenderInput): void {
    const rect = input.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || input.canvas.width || 1));
    const height = Math.max(1, Math.round(rect.height || input.canvas.height || 1));
    const dpr = globalThis.devicePixelRatio || 1;
    input.canvas.width = Math.round(width * dpr);
    input.canvas.height = Math.round(height * dpr);
    const context = input.canvas.getContext('2d');
    if (!context) throw new Error('Unable to get 2D canvas context');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const colors = buildColorMap(input.colorMap);
    const image = context.createImageData(width, height);
    for (const tile of input.tiles) this.paintTile(image, width, height, tile, input.viewport, input.valueScale, colors);
    context.putImageData(image, 0, 0);
    if (input.playheadTime !== undefined) this.drawPlayhead(context, width, height, input.viewport, input.playheadTime);
  }

  private paintTile(image: ImageData, width: number, height: number, tile: SpectrogramMatrix, viewport: ViewportConfig, valueScale: Required<ValueScaleConfig>, colors: Rgba[]): void {
    for (let x = 0; x < width; x++) {
      const time = viewport.startTime + (x / width) * (viewport.endTime - viewport.startTime);
      if (time < tile.timeStart || time > tile.timeEnd || tile.frameCount === 0) continue;
      const frame = pickNearestFrame(tile.times, time);
      for (let y = 0; y < height; y++) {
        const frequency = viewport.maxFrequency - (y / height) * (viewport.maxFrequency - viewport.minFrequency);
        const bin = pickNearestBin(tile.frequencies, frequency);
        const matrixIndex = frame * tile.binCount + bin;
        const normalized = normalizeValue(selectedValue(tile, matrixIndex, valueScale.mode), valueScale);
        const color = colors[Math.max(0, Math.min(255, Math.round(normalized * 255)))]!;
        const pixelIndex = (y * width + x) * 4;
        image.data[pixelIndex] = color[0];
        image.data[pixelIndex + 1] = color[1];
        image.data[pixelIndex + 2] = color[2];
        image.data[pixelIndex + 3] = color[3];
      }
    }
  }

  private drawPlayhead(context: CanvasRenderingContext2D, width: number, height: number, viewport: ViewportConfig, time: number): void {
    if (time < viewport.startTime || time > viewport.endTime) return;
    const { x } = timeFrequencyToCanvas(time, viewport.minFrequency, width, height, viewport);
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.restore();
  }
}
```

- [ ] **Step 3: Export renderer**

Update `src/index.ts` to include:

```ts
export { CanvasSpectrogramRenderer, pickNearestBin, pickNearestFrame } from './renderer';
export type { RenderInput } from './renderer';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/renderer.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts src/renderer.test.ts src/index.ts
git commit -m "feat: add canvas spectrogram renderer"
```

---

### Task 7: SpectrogramViewer Orchestration And Queries

**Files:**
- Create: `src/viewer.ts`
- Create: `src/viewer.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: all previous modules.
- Produces: `SpectrogramViewer.create`, config/state methods, render events, coordinate conversion, query methods.

- [ ] **Step 1: Write viewer tests with an explicit source**

Create `src/viewer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SpectrogramViewer } from './viewer';
import type { AudioSource } from './types';

function canvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }),
  } as unknown as HTMLCanvasElement;
}

const source: AudioSource = {
  id: 'test',
  sampleRate: 1024,
  duration: 1,
  channelCount: 1,
  read: () => Float32Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 128 * (i / 1024))),
};

describe('SpectrogramViewer', () => {
  it('renders and emits progress', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const progress: number[] = [];
    viewer.on('renderprogress', (event) => progress.push(event.progress));
    await viewer.render();
    expect(progress.at(-1)).toBe(1);
  });

  it('queries a spectrum at a time point', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const spectrum = await viewer.querySpectrum({ time: 0.25, channel: 0 });
    expect(spectrum.values.frequency.length).toBeGreaterThan(0);
    expect(spectrum.values.magnitude?.length).toBe(spectrum.values.frequency.length);
  });
});
```

- [ ] **Step 2: Implement viewer orchestration**

Create `src/viewer.ts`:

```ts
import { MainThreadComputeBackend, type SpectrogramComputeBackend } from './backend';
import { createTileKey, SpectrogramCache } from './cache';
import { resolveConfig, stableHash } from './config';
import { TypedEventEmitter } from './events';
import { canvasToTimeFrequency as mapCanvasToTimeFrequency, timeFrequencyToCanvas as mapTimeFrequencyToCanvas } from './frequency-scale';
import { CanvasSpectrogramRenderer } from './renderer';
import { DecodedAudioSource } from './source';
import { applyTransforms } from './transforms';
import type { ResolvedSpectrogramConfig, SpectrogramConfig, SpectrogramEvents, SpectrogramMatrix, SpectrogramStatus } from './types';

export class SpectrogramViewer {
  private readonly events = new TypedEventEmitter<SpectrogramEvents>();
  private readonly cache: SpectrogramCache;
  private readonly renderer = new CanvasSpectrogramRenderer();
  private requestCounter = 0;
  private status: SpectrogramStatus = { state: 'idle' };

  private constructor(private config: ResolvedSpectrogramConfig, private readonly backend: SpectrogramComputeBackend) {
    this.cache = new SpectrogramCache({ maxCachedTiles: config.cache.maxCachedTiles });
  }

  static async create(input: SpectrogramConfig & { backend?: SpectrogramComputeBackend }): Promise<SpectrogramViewer> {
    let config = resolveConfig(input);
    if (!config.source && config.audio) {
      const url = config.audio.currentSrc || config.audio.src;
      if (!url) throw new Error('SpectrogramViewer requires audio.currentSrc or audio.src when source is omitted');
      config = { ...config, source: await DecodedAudioSource.fromUrl(url) };
    }
    return new SpectrogramViewer(config, input.backend ?? new MainThreadComputeBackend());
  }

  on<Name extends keyof SpectrogramEvents>(name: Name, handler: (event: SpectrogramEvents[Name]) => void): () => void {
    return this.events.on(name, handler);
  }

  getConfig(): ResolvedSpectrogramConfig {
    return this.config;
  }

  setConfig(input: Partial<SpectrogramConfig>): void {
    this.config = resolveConfig({ ...this.config, ...input, canvas: input.canvas ?? this.config.canvas, source: input.source ?? this.config.source });
    this.cache.clear();
    this.events.emit('configchange', { config: this.config });
  }

  getViewport() {
    return this.config.viewport;
  }

  setViewport(viewport: Partial<ResolvedSpectrogramConfig['viewport']>): void {
    this.config = resolveConfig({ ...this.config, viewport: { ...this.config.viewport, ...viewport }, canvas: this.config.canvas, source: this.config.source });
    this.events.emit('viewportchange', { viewport: this.config.viewport });
  }

  getStatus(): SpectrogramStatus {
    return this.status;
  }

  canvasToTimeFrequency(x: number, y: number) {
    const rect = this.config.canvas.getBoundingClientRect();
    return mapCanvasToTimeFrequency(x, y, rect.width || this.config.canvas.width, rect.height || this.config.canvas.height, this.config.viewport);
  }

  timeFrequencyToCanvas(time: number, frequency: number) {
    const rect = this.config.canvas.getBoundingClientRect();
    return mapTimeFrequencyToCanvas(time, frequency, rect.width || this.config.canvas.width, rect.height || this.config.canvas.height, this.config.viewport);
  }

  async render(): Promise<void> {
    if (!this.config.source) throw new Error('Cannot render without an AudioSource');
    const requestId = `render-${++this.requestCounter}`;
    const tiles = this.visibleTileRanges();
    this.status = { state: 'rendering' };
    this.events.emit('renderstart', { requestId, total: tiles.length });
    const matrices: SpectrogramMatrix[] = [];
    let completed = 0;
    for (const tile of tiles) {
      const matrix = await this.getTile(tile.channel, tile.timeStart, tile.timeEnd);
      matrices.push(matrix);
      completed += 1;
      this.events.emit('renderprogress', { requestId, completed, total: tiles.length, progress: completed / tiles.length, phase: 'computing' });
    }
    this.renderer.render({ canvas: this.config.canvas, viewport: this.config.viewport, valueScale: this.config.valueScale, colorMap: this.config.colorMap, tiles: matrices, playheadTime: this.config.playback.showPlayhead ? this.config.audio?.currentTime : undefined });
    this.events.emit('renderprogress', { requestId, completed: tiles.length, total: tiles.length, progress: 1, phase: 'rendering' });
    this.status = { state: 'ready' };
    this.events.emit('rendercomplete', { requestId, renderedTiles: matrices.length, missingTiles: 0 });
  }

  async queryPoint(input: { time: number; frequency: number; channel?: number }) {
    const spectrum = await this.querySpectrum({ time: input.time, channel: input.channel ?? 0 });
    let binIndex = 0;
    for (let i = 1; i < spectrum.values.frequency.length; i++) if (Math.abs(spectrum.values.frequency[i]! - input.frequency) < Math.abs(spectrum.values.frequency[binIndex]! - input.frequency)) binIndex = i;
    return { time: spectrum.time, frequency: spectrum.values.frequency[binIndex]!, frameIndex: spectrum.frameIndex, binIndex, channel: spectrum.channel, magnitude: spectrum.values.magnitude?.[binIndex], power: spectrum.values.power?.[binIndex], db: spectrum.values.db?.[binIndex] };
  }

  async queryCanvasPoint(input: { x: number; y: number; channel?: number }) {
    const point = this.canvasToTimeFrequency(input.x, input.y);
    return this.queryPoint({ ...point, channel: input.channel });
  }

  async querySpectrum(input: { time: number; channel?: number }) {
    const channel = input.channel ?? 0;
    const range = this.tileRangeForTime(input.time);
    const matrix = await this.getTile(channel, range.timeStart, range.timeEnd);
    let frameIndex = 0;
    for (let i = 1; i < matrix.times.length; i++) if (Math.abs(matrix.times[i]! - input.time) < Math.abs(matrix.times[frameIndex]! - input.time)) frameIndex = i;
    const start = frameIndex * matrix.binCount;
    const end = start + matrix.binCount;
    return { time: matrix.times[frameIndex]!, frameIndex, channel, frequencyScale: this.config.viewport.frequencyScale, values: { frequency: matrix.frequencies, magnitude: matrix.magnitude.slice(start, end), power: matrix.power?.slice(start, end), db: matrix.db?.slice(start, end), normalized: matrix.normalized?.slice(start, end) } };
  }

  async queryFrame(input: { frameIndex: number; channel?: number }) {
    const time = (input.frameIndex * this.config.stft.hopSize) / this.config.source!.sampleRate;
    return this.querySpectrum({ time, channel: input.channel });
  }

  destroy(): void {
    this.cache.clear();
    this.backend.destroy?.();
    this.events.clear();
    this.status = { state: 'destroyed' };
  }

  private visibleTileRanges(): Array<{ channel: number; timeStart: number; timeEnd: number }> {
    const channels = this.config.source?.channelCount ?? 1;
    const ranges: Array<{ channel: number; timeStart: number; timeEnd: number }> = [];
    for (let channel = 0; channel < channels; channel++) {
      for (let start = Math.floor(this.config.viewport.startTime / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds; start < this.config.viewport.endTime; start += this.config.cache.tileDurationSeconds) {
        ranges.push({ channel, timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source!.duration, start + this.config.cache.tileDurationSeconds) });
      }
    }
    return ranges;
  }

  private tileRangeForTime(time: number): { timeStart: number; timeEnd: number } {
    const start = Math.floor(time / this.config.cache.tileDurationSeconds) * this.config.cache.tileDurationSeconds;
    return { timeStart: Math.max(0, start), timeEnd: Math.min(this.config.source!.duration, start + this.config.cache.tileDurationSeconds) };
  }

  private async getTile(channel: number, timeStart: number, timeEnd: number): Promise<SpectrogramMatrix> {
    const key = createTileKey({ sourceId: this.config.source!.id, channel, timeStart, timeEnd, stftHash: stableHash(this.config.stft), transformHash: stableHash(this.config.transforms.map((t) => ({ name: t.name, version: t.version, config: t.config }))) });
    const cached = this.cache.get(key);
    if (cached) return cached;
    const raw = await this.backend.computeTile({ source: this.config.source!, channel, timeStart, timeEnd, stft: this.config.stft });
    const transformed = await applyTransforms(raw, this.config.transforms, { requestedTimeStart: timeStart, requestedTimeEnd: timeEnd, sampleRate: this.config.source!.sampleRate, stft: this.config.stft });
    this.cache.set(key, transformed);
    this.events.emit('tileload', { tileId: key, timeStart, timeEnd, channel });
    return transformed;
  }
}
```

- [ ] **Step 3: Export viewer**

Update `src/index.ts` to include:

```ts
export { SpectrogramViewer } from './viewer';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/viewer.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/viewer.ts src/viewer.test.ts src/index.ts
git commit -m "feat: add spectrogram viewer orchestration"
```

---

### Task 8: Playback Synchronization

**Files:**
- Modify: `src/viewer.ts`
- Create: `src/playback.test.ts`

**Interfaces:**
- Consumes: `SpectrogramViewer`, `PlaybackConfig`.
- Produces: audio event listeners, playhead rerendering, follow viewport behavior.

- [ ] **Step 1: Write playback sync tests**

Create `src/playback.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SpectrogramViewer } from './viewer';
import type { AudioSource } from './types';

function audio() {
  const listeners = new Map<string, () => void>();
  return {
    currentTime: 0,
    duration: 10,
    src: 'fixture.wav',
    currentSrc: 'fixture.wav',
    paused: true,
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
    emit: (name: string) => listeners.get(name)?.(),
  } as unknown as HTMLAudioElement & { emit(name: string): void };
}

function canvas(): HTMLCanvasElement {
  return { width: 100, height: 100, getBoundingClientRect: () => ({ width: 100, height: 100 }), getContext: () => null } as unknown as HTMLCanvasElement;
}

const source: AudioSource = { id: 's', sampleRate: 100, duration: 10, channelCount: 1, read: () => new Float32Array(100) };

describe('playback sync', () => {
  it('updates viewport when follow is enabled and seeked fires', async () => {
    const element = audio();
    const viewer = await SpectrogramViewer.create({ audio: element, canvas: canvas(), source, viewport: { startTime: 0, endTime: 2, minFrequency: 0, maxFrequency: 50 }, playback: { follow: true } });
    element.currentTime = 5;
    element.emit('seeked');
    expect(viewer.getViewport().startTime).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Implement listener setup in viewer**

Modify `src/viewer.ts`:

```ts
// Add fields inside SpectrogramViewer:
private playbackCleanup: Array<() => void> = [];
private animationFrame: number | undefined;

// Add this call at the end of the constructor:
this.attachPlaybackSync();

// Add these methods inside the class:
private attachPlaybackSync(): void {
  const audio = this.config.audio;
  if (!audio) return;
  const onSeeked = () => {
    this.followPlayheadIfNeeded();
    if (this.config.playback.renderOnSeek) void this.render();
  };
  const onPlay = () => this.startPlaybackLoop();
  const onPause = () => this.stopPlaybackLoop();
  audio.addEventListener('seeked', onSeeked);
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  this.playbackCleanup.push(() => audio.removeEventListener('seeked', onSeeked));
  this.playbackCleanup.push(() => audio.removeEventListener('play', onPlay));
  this.playbackCleanup.push(() => audio.removeEventListener('pause', onPause));
}

private startPlaybackLoop(): void {
  const tick = () => {
    this.followPlayheadIfNeeded();
    void this.render();
    this.animationFrame = requestAnimationFrame(tick);
  };
  this.stopPlaybackLoop();
  this.animationFrame = requestAnimationFrame(tick);
}

private stopPlaybackLoop(): void {
  if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
  this.animationFrame = undefined;
}

private followPlayheadIfNeeded(): void {
  const audio = this.config.audio;
  if (!audio || !this.config.playback.follow) return;
  const duration = this.config.viewport.endTime - this.config.viewport.startTime;
  const margin = duration * this.config.playback.followMargin;
  if (audio.currentTime < this.config.viewport.startTime + margin || audio.currentTime > this.config.viewport.endTime - margin) {
    const startTime = Math.max(0, audio.currentTime - duration * this.config.playback.followMargin);
    this.setViewport({ startTime, endTime: startTime + duration });
  }
}
```

Modify `destroy()` in `src/viewer.ts`:

```ts
this.stopPlaybackLoop();
for (const cleanup of this.playbackCleanup) cleanup();
this.playbackCleanup = [];
```

- [ ] **Step 3: Run playback tests and typecheck**

Run: `npm test -- src/playback.test.ts src/viewer.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/viewer.ts src/playback.test.ts
git commit -m "feat: synchronize spectrogram playback state"
```

---

### Task 9: README And Basic Example

**Files:**
- Create: `README.md`
- Create: `examples/basic/index.html`
- Create: `examples/basic/main.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SpectrogramViewer` public API.
- Produces: documented usage and manual browser demo.

- [ ] **Step 1: Add README**

Create `README.md`:

```md
# spectrogram-js

Framework-agnostic TypeScript spectrogram rendering for browser audio.

## Basic Usage

```ts
import { SpectrogramViewer } from 'spectrogram-js';

const audio = document.querySelector('audio')!;
const canvas = document.querySelector('canvas')!;

const viewer = await SpectrogramViewer.create({
  audio,
  canvas,
  colorMap: 'viridis',
});

await viewer.render();
```

## Audio Versus Source

`audio` and `source` serve different roles. The audio element is used for playback state, seeking, and playhead synchronization. The source is used for random-access sample reads during STFT computation. If `source` is omitted, the viewer decodes `audio.currentSrc || audio.src` into a `DecodedAudioSource`.

## Digital dB Values

`db` values are digital spectrogram display values derived from decoded sample amplitudes. They are not calibrated dB SPL values and should not be interpreted as physical acoustic units.

## Queries

```ts
await viewer.queryPoint({ time: 3.4, frequency: 1200 });
await viewer.queryCanvasPoint({ x: 120, y: 80 });
await viewer.querySpectrum({ time: 3.4 });
```
```

- [ ] **Step 2: Add basic example files**

Create `examples/basic/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>spectrogram-js basic example</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; background: #10131a; color: #f8fafc; }
      canvas { width: min(100%, 900px); height: 320px; border: 1px solid #334155; display: block; }
      audio { width: min(100%, 900px); margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <h1>spectrogram-js basic example</h1>
    <audio controls src="./example.wav"></audio>
    <canvas></canvas>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Create `examples/basic/main.ts`:

```ts
import { SpectrogramViewer } from '../../src';

const audio = document.querySelector('audio');
const canvas = document.querySelector('canvas');

if (!audio || !canvas) throw new Error('Missing audio or canvas element');

const viewer = await SpectrogramViewer.create({
  audio,
  canvas,
  colorMap: 'viridis',
  viewport: { startTime: 0, endTime: 10, minFrequency: 0, maxFrequency: 12000, frequencyScale: 'linear' },
});

await viewer.render();
```

- [ ] **Step 3: Add example script**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly",
    "dev:example": "vite --host 127.0.0.1 examples/basic",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Run documentation-adjacent checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md examples/basic/index.html examples/basic/main.ts package.json
git commit -m "docs: add usage guide and basic example"
```

---

### Task 10: Final Integration And Scope Audit

**Files:**
- Modify: any files needed to fix failures found by final checks.
- Create: no new feature files unless a previous task missed a required export.

**Interfaces:**
- Consumes: entire V1 public API.
- Produces: working build and test suite aligned with approved V1 scope.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Verify public exports manually**

Open `src/index.ts` and confirm it exports:

```ts
SpectrogramViewer
DecodedAudioSource
MainThreadComputeBackend
SpectrogramCache
CanvasSpectrogramRenderer
resolveConfig
buildColorMap
canvasToTimeFrequency
timeFrequencyToCanvas
normalizeValue
type AudioSource
type SpectrogramConfig
type ResolvedSpectrogramConfig
type SpectrogramMatrix
type SpectrogramTransform
```

- [ ] **Step 5: Verify V1 exclusions**

Confirm the codebase does not contain implementations named:

```txt
WorkerComputeBackend
WebGlRenderer
AxisRenderer
ReactSpectrogram
VueSpectrogram
```

Run: `rg "WorkerComputeBackend|WebGlRenderer|AxisRenderer|ReactSpectrogram|VueSpectrogram" src examples README.md`

Expected: no matches.

- [ ] **Step 6: Commit final fixes if any**

If Step 1-5 required changes, commit them:

```bash
git add src README.md examples package.json tsconfig.json vite.config.ts
git commit -m "chore: finalize spectrogram viewer v1"
```

If Step 1-5 required no changes, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: The plan covers package setup, framework-agnostic public API, source/audio split, decoded source, STFT, lazy cache, main-thread backend, color maps, transforms, rendering, playback sync, events, query APIs, tests, README, and example.
- Intentional V1 gaps: Worker backend, WebGL, calibrated SPL, chunked decode, axes, labels, annotations, and framework wrappers remain excluded as required.
- Type consistency: The plan uses `SpectrogramMatrix`, `SpectrogramViewer`, `AudioSource`, `ResolvedSpectrogramConfig`, `SpectrogramComputeBackend`, and `CanvasSpectrogramRenderer` consistently across tasks.
