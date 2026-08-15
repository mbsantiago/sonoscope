import type {
  AudioSource,
  ColorMapConfig,
  FrequencyScale,
  ISonoscope,
  ViewportConfig,
} from "../../types";

export type {
  AudioSource,
  ColorMapConfig,
  FrequencyScale,
  ISonoscope,
  ViewportConfig,
};

import type { FrameStats } from "../../performance";
import type { SpectrogramComputeBackend } from "./backends/backend";
import type { SpectrogramWorkerLike } from "./backends/worker-backend";
import type { WebGL2RenderProgram } from "./renderers/webgl2-program";

export type ValueMode = "magnitude" | "power" | "db";
export type WebGLRendererProgram =
  | "normal"
  | "dither"
  | "sobel"
  | "terrain"
  | WebGL2RenderProgram;
export type WebGLRendererConfig = {
  type: "webgl";
  program?: WebGLRendererProgram;
};
export type RendererMode =
  | "auto"
  | "webgl"
  | "webgl2"
  | "canvas2d"
  | WebGLRendererConfig;

export type WasmBackendConfig = {
  type: "wasm";
  worker?: boolean;
  workerCount?: number;
  workerUrl?: URL | string;
  createWorker?: () => SpectrogramWorkerLike;
  wasmSource?: BufferSource | Response | PromiseLike<BufferSource | Response>;
};

export type WorkerBackendConfig = {
  type: "worker";
  workerCount?: number;
  workerUrl?: URL | string;
  createWorker?: () => SpectrogramWorkerLike;
};

export type MainThreadBackendConfig = {
  type: "main-thread";
};

export type BackendMode =
  | "auto"
  | "wasm"
  | "worker"
  | "main-thread"
  | WasmBackendConfig
  | WorkerBackendConfig
  | MainThreadBackendConfig
  | SpectrogramComputeBackend;

export type WindowName = "hann" | "hamming" | "blackman" | "rectangular";

export type StftConfig = {
  windowSize: number;
  fftSize: number;
  hopSize: number;
  window: WindowName;
};

export type ValueScaleConfig = {
  mode: ValueMode;
  min?: number;
  max?: number;
  gamma?: number;
  clamp?: boolean;
};

export type CacheStats = {
  tiles: number;
  bytes: number;
  peakTiles: number;
  peakBytes: number;
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

export type TileState = "computed" | "computing" | "uncomputed";

export type TileStateInfo = {
  channel: number;
  timeStart: number;
  timeEnd: number;
  state: TileState;
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
  apply(
    matrix: SpectrogramMatrix,
    context: TransformContext,
  ): SpectrogramMatrix | Promise<SpectrogramMatrix>;
};

export type SpectrogramStatus =
  | {
      state: "idle" | "loading" | "rendering" | "ready" | "destroyed";
      error?: undefined;
    }
  | { state: "error"; error: Error };

export type SpectrogramEvents = {
  configchange: { config: ResolvedSpectrogramConfig };
  viewportchange: { viewport: ViewportConfig };
  renderstart: { requestId: string; total: number };
  renderprogress: {
    requestId: string;
    completed: number;
    total: number;
    progress: number;
    phase: "computing" | "rendering";
  };
  rendercomplete: {
    requestId: string;
    durationMs: number;
    renderedTiles: number;
    missingTiles: number;
  };
  playbackprofile: FrameStats;
  tileload: {
    tileId: string;
    timeStart: number;
    timeEnd: number;
    channel: number;
    cacheHit: boolean;
    durationMs?: number;
  };
  cacheclear: {
    clearedTiles: number;
  };
  error: {
    error: Error;
    recoverable: boolean;
    phase:
      | "decode"
      | "source"
      | "compute"
      | "transform"
      | "render"
      | "playback";
  };
};

export interface SpectrogramProfileStats {
  renderCount: number;
  lastDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  totalTilesLoaded: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatio: number;
  fps?: number;
  cache?: CacheStats;
  playback?: FrameStats;
}

export interface SpectrogramProfileEvent {
  requestId: string;
  durationMs: number;
  renderedTiles: number;
  missingTiles: number;
  timestamp: number;
  cacheHits?: number;
  cacheMisses?: number;
  cacheHitRatio?: number;
  cache?: CacheStats;
}

export interface SpectrogramProfilerOptions {
  sampleSize?: number;
  clock?: () => number;
}

export type SpectrogramConfig = {
  renderer?: RendererMode;
  backend?: BackendMode;
  channel?: number;

  // STFT
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  window?: WindowName;

  // Viewport & Constraints
  startTime?: number;
  endTime?: number;
  minFrequency?: number;
  maxFrequency?: number;
  frequencyScale?: FrequencyScale;
  minViewportDuration?: number;
  maxViewportDuration?: number;

  // Value Scale
  valueMode?: ValueMode;
  minValue?: number;
  maxValue?: number;
  valueGamma?: number;
  clampValues?: boolean;

  // Playback Display
  showPlayhead?: boolean;

  // Cache
  tileDuration?: number;
  maxCachedTiles?: number;
  prefetchTiles?: number;

  // Modular
  colorMap?: ColorMapConfig;
  transforms?: SpectrogramTransform[];
};

export type ResolvedSpectrogramConfig = {
  renderer: RendererMode;
  backend: BackendMode;
  channel: number;

  // STFT
  windowSize: number;
  fftSize: number;
  hopSize: number;
  window: WindowName;

  // Viewport & Constraints
  startTime: number;
  endTime: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
  minViewportDuration: number;
  maxViewportDuration: number;

  // Value Scale
  valueMode: ValueMode;
  minValue: number;
  maxValue: number;
  valueGamma: number;
  clampValues: boolean;

  // Playback Display
  showPlayhead: boolean;

  // Cache
  tileDuration: number;
  maxCachedTiles: number;
  prefetchTiles: number;

  // Modular
  colorMap: ColorMapConfig;
  transforms: SpectrogramTransform[];
};

export type SpectrogramOptions = SpectrogramConfig;

export type SpectrumSlice = {
  time: number;
  frameIndex: number;
  channel: number;
  mode: ValueMode;
  frequencyScale: FrequencyScale;
  frequencies: Float32Array;
  values: Float32Array;
};

export type SpectrumPoint = {
  time: number;
  frequency: number;
  frameIndex: number;
  binIndex: number;
  channel: number;
  mode: ValueMode;
  value: number;
};

export interface ISpectrogramViewer {
  // Rendering & Lifecycle
  render(): Promise<void>;
  requestRender(): void;
  destroy(): void;
  getStatus(): SpectrogramStatus;
  getCanvas(): HTMLCanvasElement;

  // Viewport & Navigation
  getScope(): ISonoscope;
  getViewport(): ViewportConfig;
  updateViewport(viewport: Partial<ViewportConfig>): void;
  setViewport(viewport: Partial<ViewportConfig>): void;
  getFrequencyBounds(): {
    minFrequency: number;
    maxFrequency: number;
  };
  getNyquist(): number;
  zoomFreq(factor: number, centerFrequency?: number): void;
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
  ): void;

  // Configuration
  getConfig(): ResolvedSpectrogramConfig;
  updateConfig(input: Partial<SpectrogramOptions>): void;
  setConfig(input: Partial<SpectrogramOptions>): void;
  getRendererKind(): "webgl2" | "canvas2d";

  // Coordinates (Annotations & Overlays)
  canvasToTimeFrequency(
    x: number,
    y: number,
  ): { time: number; frequency: number };
  timeFrequencyToCanvas(
    time: number,
    frequency: number,
  ): { x: number; y: number };

  // Events
  on<Name extends keyof SpectrogramEvents>(
    name: Name,
    handler: (event: SpectrogramEvents[Name]) => void,
  ): () => void;

  // Data Inspection & Spectrum Queries
  querySpectrum(input: {
    time: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice>;
  queryFrame(input: {
    frameIndex: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice>;
  queryPoint(input: {
    time: number;
    frequency: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint>;
  queryCanvasPoint(input: {
    x: number;
    y: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint>;
  getCacheStats(): CacheStats;
  clearCache(): void;
  getTileStates(): TileStateInfo[];
}
