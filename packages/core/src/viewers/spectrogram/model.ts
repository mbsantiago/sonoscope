/**
 * Leaf data model and abstract contracts for the spectrogram feature.
 *
 * This module must stay dependency-free with respect to implementations:
 * it may only import shared kernel utilities (root `types`, `performance`)
 * so that renderers, compute backends, and the viewer can all depend on it
 * without introducing cycles.
 */

import type { PerformanceProfiler } from "../../performance";
import type {
  AudioSource,
  ColorMapConfig,
  FrequencyScale,
  ViewportConfig,
} from "../../types";

// ---------------------------------------------------------------------------
// Core data model
// ---------------------------------------------------------------------------

export type ValueMode = "magnitude" | "power" | "db";

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

// ---------------------------------------------------------------------------
// Shader program contracts
// ---------------------------------------------------------------------------

export type WebGLRendererProgramName =
  | "normal"
  | "halftone"
  | "terrain"
  | "topographic";

export type HalftoneOptions = {
  dotFrequency?: number | undefined;
  minEnergyThreshold?: number | undefined;
  energyGamma?: number | undefined;
};

export type TopographicOptions = {
  contourInterval?: number | undefined;
  contourLineWidth?: number | undefined;
  contourLineOpacity?: number | undefined;
  minEnergyThreshold?: number | undefined;
};

export type WebGL2Frame = {
  width: number;
  height: number;
  dpr: number;
  deviceWidth: number;
  deviceHeight: number;
};

export type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

export type RenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  frequencyScale?: FrequencyScale;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  tiles: SpectrogramMatrix[];
  placeholders?: Array<{ timeStart: number; timeEnd: number }>;
  playheadTime?: number;
  webglProgram?: WebGL2RenderProgram;
  halftone?: HalftoneOptions | undefined;
  topographic?: TopographicOptions | undefined;
  profile?: PerformanceProfiler;
};

export type WebGL2RenderResources = {
  colorMapTexture: WebGLTexture;
  tiles: SpectrogramMatrix[];
  textureForTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
  ): TextureEntry;
};

/**
 * A paintable spectrogram shader program. The renderer owns any instance
 * handed to it and disposes it when replaced or destroyed.
 */
export type WebGL2RenderProgram = {
  /** Canonical program name for built-in programs; custom programs may omit it. */
  readonly name?: string;
  paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void;
  delete(): void;
};

// ---------------------------------------------------------------------------
// Compute backend contracts
// ---------------------------------------------------------------------------

export type ComputeTileRequest = {
  source: AudioSource;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stft: StftConfig;
  profile?: PerformanceProfiler;
};

export interface SpectrogramComputeBackend {
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy?(): void;
}

/**
 * Minimal worker surface required by pooled compute backends.
 */
export type SpectrogramWorkerLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};
