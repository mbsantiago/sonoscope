import type {
  AudioSource,
  FrequencyScale,
  ResolvedSpectrogramConfig,
  SpectrogramConfig,
  ValueMode,
  WindowName,
} from "./types";

function isPowerOfTwo(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 2 &&
    2 ** Math.round(Math.log2(value)) === value
  );
}

export function resolveConfig(
  input: SpectrogramConfig & { source: AudioSource },
): ResolvedSpectrogramConfig {
  if (!input.canvas) throw new Error("SpectrogramViewer requires a canvas");
  if (!input.source) throw new Error("SpectrogramViewer requires a source");

  const windowSize = input.windowSize ?? input.stft?.windowSize ?? 1024;
  const fftSize = input.fftSize ?? input.stft?.fftSize ?? 1024;
  const hopSize = input.hopSize ?? input.stft?.hopSize ?? 256;
  const window: WindowName = input.window ?? input.stft?.window ?? "hann";

  if (!isPowerOfTwo(fftSize)) throw new Error("fftSize must be a power of two");
  if (fftSize < windowSize)
    throw new Error("fftSize must be greater than or equal to windowSize");
  if (windowSize <= 0) throw new Error("windowSize must be greater than zero");
  if (hopSize <= 0) throw new Error("hopSize must be greater than zero");

  const sourceDuration = input.source.duration;

  const minViewportDuration =
    input.minViewportDuration ??
    input.viewportConstraints?.minDurationSeconds ??
    0.05;
  const maxViewportDuration =
    input.maxViewportDuration ??
    input.viewportConstraints?.maxDurationSeconds ??
    Math.min(30, sourceDuration);

  if (minViewportDuration <= 0)
    throw new Error("minViewportDuration must be greater than zero");
  if (maxViewportDuration < minViewportDuration)
    throw new Error(
      "maxViewportDuration must be greater than or equal to minViewportDuration",
    );

  const initialStartTime = input.startTime ?? input.viewport?.startTime ?? 0;
  const initialEndTime =
    input.endTime ?? input.viewport?.endTime ?? sourceDuration;
  const minFrequency = input.minFrequency ?? input.viewport?.minFrequency ?? 0;
  const maxFrequency =
    input.maxFrequency ??
    input.viewport?.maxFrequency ??
    input.source.sampleRate / 2;
  const frequencyScale: FrequencyScale =
    input.frequencyScale ?? input.viewport?.frequencyScale ?? "linear";

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
  if (channel >= input.source.channelCount)
    throw new Error(
      `channel ${channel} is outside source channel count ${input.source.channelCount}`,
    );

  const valueMode: ValueMode =
    input.valueMode ?? input.valueScale?.mode ?? "db";
  const minValue = input.minValue ?? input.valueScale?.min ?? -100;
  const maxValue = input.maxValue ?? input.valueScale?.max ?? 0;
  const valueGamma = input.valueGamma ?? input.valueScale?.gamma ?? 1;
  const clampValues = input.clampValues ?? input.valueScale?.clamp ?? true;

  const showPlayhead =
    input.showPlayhead ?? input.playback?.showPlayhead ?? true;
  const followPlayback =
    input.followPlayback ?? input.playback?.follow ?? false;
  const followMargin =
    input.followMargin ?? input.playback?.followMargin ?? 0.2;
  const renderOnSeek =
    input.renderOnSeek ?? input.playback?.renderOnSeek ?? true;

  const tileDuration =
    input.tileDuration ?? input.cache?.tileDurationSeconds ?? 5;
  if (tileDuration <= 0)
    throw new Error("tileDuration must be greater than zero");

  const minimumTilesForMaxViewport =
    Math.ceil(maxViewportDuration / tileDuration) + 2;
  const prefetchTiles =
    input.prefetchTiles ??
    input.cache?.prefetchTiles ??
    Math.max(8, minimumTilesForMaxViewport);
  if (prefetchTiles < 0)
    throw new Error("prefetchTiles must be greater than or equal to zero");

  const maxCachedTiles = Math.max(
    input.maxCachedTiles ?? input.cache?.maxCachedTiles ?? 64,
    minimumTilesForMaxViewport + prefetchTiles * 2,
  );

  return {
    canvas: input.canvas,
    source: input.source,
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

    // Playback
    showPlayhead,
    followPlayback,
    followMargin,
    renderOnSeek,

    // Cache
    tileDuration,
    maxCachedTiles,
    prefetchTiles,

    // Modular
    colorMap: input.colorMap ?? "viridis",
    transforms: input.transforms ?? [],
  };
}

function clampViewportTimes(
  startTime: number,
  endTime: number,
  sourceDuration: number,
  minDuration: number,
  maxDuration: number,
): { startTime: number; endTime: number } {
  const duration = Math.min(
    Math.max(endTime - startTime, minDuration),
    maxDuration,
    sourceDuration,
  );
  const clampedStart = Math.min(
    Math.max(0, startTime),
    Math.max(0, sourceDuration - duration),
  );
  return { startTime: clampedStart, endTime: clampedStart + duration };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "function" ? "[function]" : item,
  );
}
