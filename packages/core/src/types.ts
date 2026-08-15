import type { SpectrogramComputeBackend } from "./backends/backend";
import type { SpectrogramWorkerLike } from "./backends/worker-backend";
import type { FrameStats, PerformanceMeasure } from "./performance";
import type { WebGL2RenderProgram } from "./renderers/webgl2-program";
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

export type ValueScaleConfig = {
  mode: ValueMode;
  min?: number;
  max?: number;
  gamma?: number;
  clamp?: boolean;
};

export type BuiltInColorMap =
  // Perceptually Uniform
  | "viridis"
  | "magma"
  | "inferno"
  | "plasma"
  | "turbo"
  | "cividis"
  | "gray"
  | "gray_r"
  | "gray_inverted"
  | "inverse_gray"
  | "greys"
  | "greys_r"
  | "Greys"
  | "Greys_r"
  | "gist_yarg"
  | "binary"
  | "bone"
  // Sequential / Colorbrewer
  | "purples"
  | "Purples"
  | "blues"
  | "Blues"
  | "greens"
  | "Greens"
  | "oranges"
  | "Oranges"
  | "reds"
  | "Reds"
  | "ylorbr"
  | "YlOrBr"
  | "ylorrd"
  | "YlOrRd"
  | "orrd"
  | "OrRd"
  | "purd"
  | "PuRd"
  | "rdpu"
  | "RdPu"
  | "bupu"
  | "BuPu"
  | "gnbu"
  | "GnBu"
  | "pubu"
  | "PuBu"
  | "ylgnbu"
  | "YlGnBu"
  | "pubugn"
  | "PuBuGn"
  | "bugn"
  | "BuGn"
  | "ylgn"
  | "YlGn"
  // Miscellaneous / Funnier
  | "ocean"
  | "gist_earth"
  | "terrain"
  | "gist_stern"
  | "gnuplot"
  | "gnuplot2"
  | "cmrmap"
  | "CMRmap"
  | "cubehelix"
  | "brg"
  | "gist_rainbow"
  | "rainbow"
  | "jet"
  | "nipy_spectral"
  | "gist_ncar"
  // Categorical
  | "tab20";
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

export type FollowPlaybackMode = "page" | "smooth" | "off";

export type ViewportState = {
  startTime: number;
  endTime: number;
  duration: number;
  totalDuration: number;
};

export type SonoscopeOptions = {
  source: AudioSource;
  audio?: HTMLAudioElement | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
};

export type SonoscopeEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  playbackchange: { mode: FollowPlaybackMode };
  timeupdate: { currentTime: number };
  sourcechange: { source: AudioSource };
  audiochange: { audio: HTMLAudioElement | undefined };
  destroy: undefined;
};

export interface ISonoscope {
  readonly source: AudioSource;
  getViewport(): ViewportState;
  setViewport(
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
  ): void;
  updateViewport(
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
  ): void;
  zoom(factor: number, centerTime?: number, source?: string): void;
  pan(deltaSeconds: number, source?: string): void;
  panTo(startTime: number, source?: string): void;
  getDuration(): number;
  getSampleRate(): number;
  getFollowPlayback(): FollowPlaybackMode;
  setFollowPlayback(mode: FollowPlaybackMode): void;

  getCurrentTime(): number;
  isPlaying(): boolean;
  seek(time: number): void;
  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;
  setSource(source: AudioSource): void;

  on<K extends keyof SonoscopeEvents>(
    event: K,
    handler: (e: SonoscopeEvents[K]) => void,
  ): () => void;
  destroy(): void;
}

export type FromUrlOptions = Omit<SpectrogramConfig, "source"> & {
  url: string;
  audio?: HTMLAudioElement;
};

export type FromAudioOptions = Omit<SpectrogramConfig, "source"> & {
  audio: HTMLAudioElement;
};

export type FromSourceOptions = SpectrogramConfig & {
  source: AudioSource;
  audio?: HTMLAudioElement;
};

export type SpectrogramViewerOptions = Omit<SpectrogramConfig, "source"> & {
  scope?: ISonoscope;
  source?: AudioSource;
  audio?: HTMLAudioElement;
};

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

  // Viewport & Navigation
  getScope(): ISonoscope;
  getViewport(): ViewportConfig;
  updateViewport(viewport: Partial<ViewportConfig>): void;
  setViewport(viewport: Partial<ViewportConfig>): void;
  getTimeBounds(): {
    startTime: number;
    endTime: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
  getFrequencyBounds(): {
    minFrequency: number;
    maxFrequency: number;
  };
  zoomTime(factor: number, centerTime?: number): void;
  zoomFreq(factor: number, centerFrequency?: number): void;
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
  ): void;
  bindViewport?(controller: {
    bind: (viewer: unknown) => () => void;
  }): () => void;

  // Configuration & Source
  getConfig(): ResolvedSpectrogramConfig;
  updateConfig(input: Partial<SpectrogramConfig>): void;
  setConfig(input: Partial<SpectrogramConfig>): void;
  getSource(): AudioSource;
  updateSource(source: AudioSource, options?: Partial<ViewportConfig>): void;
  setSource(source: AudioSource, options?: Partial<ViewportConfig>): void;
  updateSourceUrl(
    url: string,
    options?: Partial<ViewportConfig>,
  ): Promise<void>;
  setSourceUrl(url: string, options?: Partial<ViewportConfig>): Promise<void>;
  getRendererKind(): "webgl2" | "canvas2d";

  // Audio & Metadata
  getDuration(): number;
  getSampleRate(): number;
  getNyquist(): number;
  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;

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
  getTileStates(): TileStateInfo[];
}
