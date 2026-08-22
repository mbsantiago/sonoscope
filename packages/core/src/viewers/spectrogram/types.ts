import type { FrameStats } from "../../performance";
import type {
  AudioSource,
  ColorMapConfig,
  FrequencyScale,
  IViewportController,
  ViewportConfig,
} from "../../types";
import type { SpectrogramComputeBackend } from "./backends/backend";
import type { SpectrogramWorkerLike } from "./backends/worker-backend";
import type { WebGL2RenderProgram } from "./renderers/webgl2-program";

export type ValueMode = "magnitude" | "power" | "db";

export type WebGLRendererProgramName =
  | "normal"
  | "halftone"
  | "sobel"
  | "terrain";

export type WebGLRendererProgram =
  | WebGLRendererProgramName
  | WebGL2RenderProgram;

export type HalftoneOptions = {
  dotFrequency?: number | undefined;
  minEnergyThreshold?: number | undefined;
  energyGamma?: number | undefined;
};

export type HalftoneRendererConfig = {
  type: "halftone";
  program?: WebGLRendererProgram | undefined;
} & HalftoneOptions;

export type WebGLRendererConfig = {
  type: "webgl" | "webgl2" | WebGLRendererProgramName;
  program?: WebGLRendererProgram | undefined;
} & HalftoneOptions;

export type Canvas2DRendererConfig = {
  type: "canvas2d";
};

export type AutoRendererConfig = {
  type: "auto";
  program?: WebGLRendererProgram | undefined;
} & HalftoneOptions;

export type SpectrogramRendererConfig =
  | AutoRendererConfig
  | Canvas2DRendererConfig
  | WebGLRendererConfig
  | HalftoneRendererConfig;

export type RendererMode =
  | "auto"
  | "webgl"
  | "webgl2"
  | "canvas2d"
  | WebGLRendererProgramName
  | SpectrogramRendererConfig;

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
  /**
   * Whether to automatically re-render when viewport or configuration changes.
   * @default true
   */
  autoRender?: boolean | undefined;

  /**
   * Rendering engine:
   * - "auto": Uses WebGL2 if supported, falling back to Canvas 2D.
   * - "webgl" / "webgl2": Hardware-accelerated GPU shader renderer.
   * - "canvas2d": CPU Canvas 2D fallback renderer.
   * - Custom object with shader program (`{ type: "webgl", program: "normal" | "halftone" | "sobel" | "terrain" }`).
   * @default "auto"
   */
  renderer?: RendererMode | undefined;

  /**
   * STFT compute execution backend:
   * - "auto": Prefers WebAssembly workers, falling back to main thread.
   * - "wasm": Fast WebAssembly computation.
   * - "worker": Web Worker background thread computation.
   * - "main-thread": Synchronous main thread computation.
   * @default "auto"
   */
  backend?: BackendMode | undefined;

  /**
   * Audio channel index to analyze (0 for left/mono, 1 for right).
   * @default 0
   */
  channel?: number | undefined;

  // STFT

  /**
   * STFT analysis window length in audio samples.
   * @default 1024
   */
  windowSize?: number | undefined;

  /**
   * FFT length in samples. Must be a power of two >= windowSize.
   * @default 1024
   */
  fftSize?: number | undefined;

  /**
   * Hop size (step length) in samples between consecutive FFT frames.
   * @default 256
   */
  hopSize?: number | undefined;

  /**
   * Window function applied before FFT: "hann", "hamming", "blackman", or "rectangular".
   * @default "hann"
   */
  window?: WindowName | undefined;

  // Viewport & Constraints

  /**
   * Viewport start time in seconds.
   * @default 0
   */
  startTime?: number | undefined;

  /**
   * Viewport end time in seconds.
   * @default audio duration
   */
  endTime?: number | undefined;

  /**
   * Minimum visible frequency in Hertz.
   * @default 0
   */
  minFrequency?: number | undefined;

  /**
   * Maximum visible frequency in Hertz.
   * @default Nyquist frequency (sampleRate / 2)
   */
  maxFrequency?: number | undefined;

  /**
   * Frequency scale mapping: "linear", "mel", or "log".
   * @default "linear"
   */
  frequencyScale?: FrequencyScale | undefined;

  /**
   * Minimum viewport duration in seconds to prevent zooming in too far.
   * @default 0.05
   */
  minViewportDuration?: number | undefined;

  /**
   * Maximum viewport duration in seconds to prevent zooming out past bounds.
   * @default 30
   */
  maxViewportDuration?: number | undefined;

  // Value Scale

  /**
   * Intensity scale representation: "db" (decibels), "magnitude", or "power".
   * @default "db"
   */
  valueMode?: ValueMode | undefined;

  /**
   * Lower intensity limit mapped to the start of the colormap (always specified in dB; converted internally for non-dB value modes).
   * @default -100
   */
  minDb?: number | undefined;

  /**
   * Upper intensity limit mapped to the end of the colormap (in dB when valueMode is "db").
   * @default 0
   */
  maxDb?: number | undefined;

  /**
   * Power-law gamma exponent for dynamic range contrast adjustment.
   * @default 1.0
   */
  valueGamma?: number | undefined;

  /**
   * Whether to clamp intensity values strictly within [minDb, maxDb].
   * @default true
   */
  clampValues?: boolean | undefined;

  // Playback Display

  /**
   * Whether to draw an animated playhead indicator overlay during playback.
   * @default true
   */
  showPlayhead?: boolean | undefined;

  // Cache

  /**
   * Duration in seconds of each cached STFT computation tile.
   * @default 5
   */
  tileDuration?: number | undefined;

  /**
   * Maximum number of computed STFT tiles retained in memory cache.
   * @default 64
   */
  maxCachedTiles?: number | undefined;

  /**
   * Number of tiles to prefetch and compute ahead of the visible viewport.
   * @default 8
   */
  prefetchTiles?: number | undefined;

  // Sizing

  /**
   * Whether to automatically resize canvas pixel resolution when container dimensions change.
   * @default true
   */
  autoResize?: boolean | undefined;

  /**
   * Device pixel ratio scaling factor for HiDPI/Retina displays.
   * @default window.devicePixelRatio
   */
  devicePixelRatio?: boolean | number | undefined;

  // Modular

  /**
   * Colormap palette name (such as "inferno", "viridis", "magma", "turbo") or custom palette object.
   * @default "viridis"
   */
  colorMap?: ColorMapConfig | undefined;

  /**
   * Array of custom matrix transforms applied to STFT data before rendering.
   * @default undefined
   */
  transforms?: SpectrogramTransform[] | undefined;
};

export type ResolvedSpectrogramConfig = {
  autoRender: boolean;
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
  minDb: number;
  maxDb: number;
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

/**
 * Spectrogram viewer canvas controller and inspector.
 */
export interface ISpectrogramViewer {
  /** Renders the current spectrogram viewport asynchronously. */
  render(): Promise<void>;
  /** Schedules a render on the next animation frame. */
  requestRender(): void;
  /** Disposes the renderer, WebGL resources, and event listeners. */
  destroy(): void;
  /** Returns the current render status. */
  getStatus(): SpectrogramStatus;
  /** Returns the bound HTML canvas element. */
  getCanvas(): HTMLCanvasElement;

  /** Returns the active audio source. */
  getSource(): AudioSource;
  /** Returns the bound viewport controller. */
  getViewportController(): IViewportController;
  /** Returns the visible time and frequency viewport. */
  getViewport(): ViewportConfig;
  /** Returns the active frequency scale (`linear`, `log`, or `mel`). */
  getFrequencyScale(): FrequencyScale;
  /** Returns the full available frequency bounds in Hz. */
  getFrequencyBounds(): {
    minFrequency: number;
    maxFrequency: number;
  };
  /** Returns the Nyquist frequency in Hz. */
  getNyquist(): number;

  /** Returns the resolved spectrogram configuration options. */
  getConfig(): ResolvedSpectrogramConfig;
  /** Updates configuration options and triggers a re-render. */
  updateConfig(input: Partial<SpectrogramOptions>): void;
  /** Alias for `updateConfig`. */
  setConfig(input: Partial<SpectrogramOptions>): void;
  /** Updates the audio source and invalidates the tile cache. */
  setSource(source: AudioSource): void;
  /** Returns the active rendering engine (`webgl2` or `canvas2d`). */
  getRendererKind(): "webgl2" | "canvas2d";

  /**
   * Converts canvas pixel coordinates to time (seconds) and frequency (Hz).
   */
  canvasToTimeFrequency(
    x: number,
    y: number,
  ): { time: number; frequency: number };
  /**
   * Converts time (seconds) and frequency (Hz) to canvas pixel coordinates.
   */
  timeFrequencyToCanvas(
    time: number,
    frequency: number,
  ): { x: number; y: number };

  /** Subscribes to spectrogram events. */
  on<Name extends keyof SpectrogramEvents>(
    name: Name,
    handler: (event: SpectrogramEvents[Name]) => void,
  ): () => void;

  /**
   * Queries spectral magnitudes across all frequency bins at a specific timestamp.
   * @param input Target time in seconds, optional channel, and value mode.
   */
  querySpectrum(input: {
    time: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice>;
  /**
   * Queries spectral magnitudes for a specific STFT frame index.
   * @param input Frame index, optional channel, and value mode.
   */
  queryFrame(input: {
    frameIndex: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumSlice>;
  /**
   * Queries the spectral intensity value at a specific time and frequency.
   * @param input Time in seconds, frequency in Hz, optional channel, and value mode.
   */
  queryPoint(input: {
    time: number;
    frequency: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint>;
  /**
   * Queries the spectral intensity value at canvas pixel coordinates.
   * @param input Canvas X and Y in pixels, optional channel, and value mode.
   */
  queryCanvasPoint(input: {
    x: number;
    y: number;
    channel?: number;
    mode?: ValueMode;
  }): Promise<SpectrumPoint>;
  /** Returns current STFT tile cache statistics. */
  getCacheStats(): CacheStats;
  /** Clears cached STFT tiles from memory. */
  clearCache(): void;
  /** Returns status information for all computation tiles. */
  getTileStates(): TileStateInfo[];
}
