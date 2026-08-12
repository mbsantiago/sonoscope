import type { PerformanceMeasure } from './performance';

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
  renderprofile: { requestId: string; generation: number; measures: PerformanceMeasure[] };
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
