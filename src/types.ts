import type { SpectrogramComputeBackend } from "./backend";
import type { FrameStats, PerformanceMeasure } from "./performance";
import type { WebGL2RenderProgram } from "./renderers/webgl2-program";
import type { SpectrogramWorkerLike } from "./worker-backend";

export type FrequencyScale = "linear" | "log" | "mel";
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

export type ViewportConstraintsConfig = {
  minDurationSeconds: number;
  maxDurationSeconds: number;
};

export type ValueScaleConfig = {
  mode: ValueMode;
  min?: number;
  max?: number;
  gamma?: number;
  clamp?: boolean;
};

export type BuiltInColorMap =
  | "gray"
  | "viridis"
  | "magma"
  | "inferno"
  | "plasma"
  | "turbo";
export type ColorPoint = { at: number; color: string | Rgba };
export type ColorMapConfig =
  | BuiltInColorMap
  | {
      base: BuiltInColorMap;
      gamma?: number;
      contrast?: number;
      brightness?: number;
    }
  | {
      points: ColorPoint[];
      gamma?: number;
      contrast?: number;
      brightness?: number;
    };

export type PlaybackConfig = {
  showPlayhead: boolean;
  follow: boolean;
  followMargin: number;
  renderOnSeek: boolean;
};

export type CacheConfig = {
  tileDurationSeconds: number;
  maxCachedTiles: number;
  prefetchTiles: number;
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
    renderedTiles: number;
    missingTiles: number;
  };
  renderprofile: {
    requestId: string;
    generation: number;
    measures: PerformanceMeasure[];
  };
  playbackprofile: FrameStats;
  tileload: {
    tileId: string;
    timeStart: number;
    timeEnd: number;
    channel: number;
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

export type SpectrogramConfig = {
  audio?: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  source?: AudioSource;
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

  // Playback
  showPlayhead?: boolean;
  followPlayback?: boolean;
  followMargin?: number;
  renderOnSeek?: boolean;

  // Cache
  tileDuration?: number;
  maxCachedTiles?: number;
  prefetchTiles?: number;

  // Modular
  colorMap?: ColorMapConfig;
  transforms?: SpectrogramTransform[];

  // Legacy nested properties supported during transition
  stft?: Partial<StftConfig>;
  viewport?: Partial<ViewportConfig>;
  viewportConstraints?: Partial<ViewportConstraintsConfig>;
  valueScale?: Partial<ValueScaleConfig>;
  playback?: Partial<PlaybackConfig>;
  cache?: Partial<CacheConfig>;
};

export type ResolvedSpectrogramConfig = {
  canvas: HTMLCanvasElement;
  source: AudioSource;
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

  // Playback
  showPlayhead: boolean;
  followPlayback: boolean;
  followMargin: number;
  renderOnSeek: boolean;

  // Cache
  tileDuration: number;
  maxCachedTiles: number;
  prefetchTiles: number;

  // Modular
  colorMap: ColorMapConfig;
  transforms: SpectrogramTransform[];
};

export type FromUrlOptions = Omit<SpectrogramConfig, "source"> & {
  url: string;
  audio?: HTMLAudioElement;
};

export type FromAudioOptions = Omit<SpectrogramConfig, "source"> & {
  audio: HTMLAudioElement;
};

export type FromSourceOptions = Omit<SpectrogramConfig, "audio"> & {
  source: AudioSource;
  audio?: HTMLAudioElement;
};

export type AudioRange = { startTime: number; endTime: number };

export interface AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
  onRangeAvailable?(handler: (range: AudioRange) => void): () => void;
}
