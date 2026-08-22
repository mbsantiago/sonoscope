import type { AudioSource, FrequencyScale } from "../../types";
import type {
  ResolvedSpectrogramConfig,
  SpectrogramOptions,
  ValueMode,
  WindowName,
} from "./types";
import { clampViewportTimes } from "../../viewport-math";

const DEFAULT_CONFIG: ResolvedSpectrogramConfig = {
  autoRender: true,
  renderer: "auto",
  backend: "auto",
  channel: 0,
  windowSize: 1024,
  fftSize: 1024,
  hopSize: 256,
  window: "hann",
  startTime: 0,
  endTime: 0,
  minFrequency: 0,
  maxFrequency: 0,
  frequencyScale: "linear",
  minViewportDuration: 0.05,
  maxViewportDuration: 60,
  valueMode: "db",
  minDb: -100,
  maxDb: 0,
  valueGamma: 1,
  clampValues: true,
  tileMaxCells: 2 ** 17,
  maxCachedTiles: 64,
  prefetchTiles: 8,
  colorMap: "viridis",
  transforms: [],
};

function isPowerOfTwo(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 2 &&
    2 ** Math.round(Math.log2(value)) === value
  );
}

export function resolveConfig(
  source: AudioSource,
  input: SpectrogramOptions = {},
): ResolvedSpectrogramConfig {
  if (!source) throw new Error("SpectrogramViewer requires a source");

  const windowSize = input.windowSize ?? DEFAULT_CONFIG.windowSize;
  const fftSize = input.fftSize ?? DEFAULT_CONFIG.fftSize;
  const hopSize = input.hopSize ?? DEFAULT_CONFIG.hopSize;
  const window: WindowName = input.window ?? DEFAULT_CONFIG.window;

  if (!isPowerOfTwo(fftSize)) throw new Error("fftSize must be a power of two");
  if (fftSize < windowSize)
    throw new Error("fftSize must be greater than or equal to windowSize");
  if (windowSize <= 0) throw new Error("windowSize must be greater than zero");
  if (hopSize <= 0) throw new Error("hopSize must be greater than zero");

  const sourceDuration = Math.max(0.001, source.duration);

  if (
    input.minViewportDuration !== undefined &&
    input.minViewportDuration <= 0
  ) {
    throw new Error("minViewportDuration must be greater than zero");
  }

  if (
    input.maxViewportDuration !== undefined &&
    input.minViewportDuration !== undefined &&
    input.maxViewportDuration < input.minViewportDuration
  ) {
    throw new Error(
      "maxViewportDuration must be greater than or equal to minViewportDuration",
    );
  }

  const minViewportDuration = Math.min(
    input.minViewportDuration ?? DEFAULT_CONFIG.minViewportDuration,
    sourceDuration,
  );
  const maxViewportDuration = Math.max(
    minViewportDuration,
    input.maxViewportDuration !== undefined
      ? input.maxViewportDuration
      : Math.min(DEFAULT_CONFIG.maxViewportDuration, sourceDuration),
  );

  const initialStartTime = input.startTime ?? DEFAULT_CONFIG.startTime;
  const initialEndTime = input.endTime ?? sourceDuration;
  const minFrequency = input.minFrequency ?? DEFAULT_CONFIG.minFrequency;
  const maxFrequency = input.maxFrequency ?? source.sampleRate / 2;
  const frequencyScale: FrequencyScale =
    input.frequencyScale ?? DEFAULT_CONFIG.frequencyScale;

  const clampedTimes = clampViewportTimes(
    initialStartTime,
    initialEndTime,
    sourceDuration,
    minViewportDuration,
    maxViewportDuration,
  );

  if (clampedTimes.endTime <= clampedTimes.startTime)
    throw new Error("endTime must be greater than startTime");
  if (maxFrequency <= minFrequency)
    throw new Error("maxFrequency must be greater than minFrequency");

  const channel = input.channel ?? DEFAULT_CONFIG.channel;
  if (!Number.isInteger(channel) || channel < 0)
    throw new Error("channel must be a non-negative integer");
  if (channel >= source.channelCount)
    throw new Error(
      `channel ${channel} is outside source channel count ${source.channelCount}`,
    );

  const valueMode: ValueMode = input.valueMode ?? DEFAULT_CONFIG.valueMode;
  const minDb = input.minDb ?? DEFAULT_CONFIG.minDb;
  const maxDb = input.maxDb ?? DEFAULT_CONFIG.maxDb;
  const valueGamma = input.valueGamma ?? DEFAULT_CONFIG.valueGamma;
  const clampValues = input.clampValues ?? DEFAULT_CONFIG.clampValues;

  const tileMaxCells = input.tileMaxCells ?? DEFAULT_CONFIG.tileMaxCells;
  if (tileMaxCells <= 0)
    throw new Error("tileMaxCells must be greater than zero");

  const binCount = Math.max(1, Math.floor(fftSize / 2));
  const framesPerTile = Math.max(1, Math.floor(tileMaxCells / binCount));
  const tileDuration =
    (framesPerTile * hopSize) / Math.max(1, source.sampleRate);

  const minimumTilesForMaxViewport =
    Math.ceil(maxViewportDuration / Math.max(0.0001, tileDuration)) + 2;
  const prefetchTiles =
    input.prefetchTiles ??
    Math.max(DEFAULT_CONFIG.prefetchTiles, minimumTilesForMaxViewport);
  if (prefetchTiles < 0)
    throw new Error("prefetchTiles must be greater than or equal to zero");

  const maxCachedTiles = Math.max(
    input.maxCachedTiles ?? DEFAULT_CONFIG.maxCachedTiles,
    minimumTilesForMaxViewport + prefetchTiles * 2,
  );

  return {
    autoRender: input.autoRender ?? DEFAULT_CONFIG.autoRender,
    renderer: input.renderer ?? DEFAULT_CONFIG.renderer,
    backend: input.backend ?? DEFAULT_CONFIG.backend,
    channel,

    // STFT
    windowSize,
    fftSize,
    hopSize,
    window,

    // Viewport & Constraints
    startTime: clampedTimes.startTime,
    endTime: clampedTimes.endTime,
    minFrequency,
    maxFrequency,
    frequencyScale,
    minViewportDuration,
    maxViewportDuration,

    // Value Scale
    valueMode,
    minDb,
    maxDb,
    valueGamma,
    clampValues,

    // Cache
    tileMaxCells,
    maxCachedTiles,
    prefetchTiles,

    // Modular
    colorMap: input.colorMap ?? DEFAULT_CONFIG.colorMap,
    transforms: input.transforms ?? DEFAULT_CONFIG.transforms.slice(),
  };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "function" ? "[function]" : item,
  );
}
