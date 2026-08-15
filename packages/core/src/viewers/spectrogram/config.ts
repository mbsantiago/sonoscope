import type { AudioSource, FrequencyScale } from "../../types";
import type {
  ResolvedSpectrogramConfig,
  SpectrogramOptions,
  ValueMode,
  WindowName,
} from "./types";
import { clampViewportTimes } from "../../viewport-controller";

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

  const windowSize = input.windowSize ?? 1024;
  const fftSize = input.fftSize ?? 1024;
  const hopSize = input.hopSize ?? 256;
  const window: WindowName = input.window ?? "hann";

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
    input.minViewportDuration ?? 0.05,
    sourceDuration,
  );
  const maxViewportDuration = Math.max(
    minViewportDuration,
    input.maxViewportDuration !== undefined
      ? input.maxViewportDuration
      : Math.min(30, sourceDuration),
  );

  const initialStartTime = input.startTime ?? 0;
  const initialEndTime = input.endTime ?? sourceDuration;
  const minFrequency = input.minFrequency ?? 0;
  const maxFrequency = input.maxFrequency ?? source.sampleRate / 2;
  const frequencyScale: FrequencyScale = input.frequencyScale ?? "linear";

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

  const channel = input.channel ?? 0;
  if (!Number.isInteger(channel) || channel < 0)
    throw new Error("channel must be a non-negative integer");
  if (channel >= source.channelCount)
    throw new Error(
      `channel ${channel} is outside source channel count ${source.channelCount}`,
    );

  const valueMode: ValueMode = input.valueMode ?? "db";
  const minValue = input.minValue ?? -100;
  const maxValue = input.maxValue ?? 0;
  const valueGamma = input.valueGamma ?? 1;
  const clampValues = input.clampValues ?? true;

  const showPlayhead = input.showPlayhead ?? true;

  const tileDuration = input.tileDuration ?? 5;
  if (tileDuration <= 0)
    throw new Error("tileDuration must be greater than zero");

  const minimumTilesForMaxViewport =
    Math.ceil(maxViewportDuration / tileDuration) + 2;
  const prefetchTiles =
    input.prefetchTiles ?? Math.max(8, minimumTilesForMaxViewport);
  if (prefetchTiles < 0)
    throw new Error("prefetchTiles must be greater than or equal to zero");

  const maxCachedTiles = Math.max(
    input.maxCachedTiles ?? 64,
    minimumTilesForMaxViewport + prefetchTiles * 2,
  );

  return {
    autoRender: input.autoRender ?? true,
    renderer: input.renderer ?? "auto",
    backend: input.backend ?? "auto",
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
    minValue,
    maxValue,
    valueGamma,
    clampValues,

    // Playback Display
    showPlayhead,

    // Cache
    tileDuration,
    maxCachedTiles,
    prefetchTiles,

    // Modular
    colorMap: input.colorMap ?? "viridis",
    transforms: input.transforms ?? [],
  };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "function" ? "[function]" : item,
  );
}
