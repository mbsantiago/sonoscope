import type { AudioSource, FrequencyScale } from "../../types";
import type {
  ResolvedSpectrogramConfig,
  SpectrogramOptions,
  ValueMode,
  WindowName,
} from "./types";

const DEFAULT_CONFIG: ResolvedSpectrogramConfig = {
  autoRender: true,
  renderer: "auto",
  backend: "auto",
  loading: "placeholder",
  channel: 0,
  windowSize: 1024,
  fftSize: 1024,
  hopSize: 256,
  window: "hann",
  frequencyScale: "linear",
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

  const frequencyScale: FrequencyScale =
    input.frequencyScale ?? DEFAULT_CONFIG.frequencyScale;

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
  if (!Number.isFinite(tileMaxCells) || tileMaxCells <= 0)
    throw new Error("tileMaxCells must be a finite number greater than zero");

  const prefetchTiles = input.prefetchTiles ?? DEFAULT_CONFIG.prefetchTiles;
  if (prefetchTiles < 0)
    throw new Error("prefetchTiles must be greater than or equal to zero");

  const maxCachedTiles = input.maxCachedTiles ?? DEFAULT_CONFIG.maxCachedTiles;

  return {
    autoRender: input.autoRender ?? DEFAULT_CONFIG.autoRender,
    renderer: input.renderer ?? DEFAULT_CONFIG.renderer,
    backend: input.backend ?? DEFAULT_CONFIG.backend,
    loading: input.loading ?? DEFAULT_CONFIG.loading,
    channel,

    // STFT
    windowSize,
    fftSize,
    hopSize,
    window,

    frequencyScale,

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
