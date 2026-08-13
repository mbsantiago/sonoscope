import type { ResolvedSpectrogramConfig, SpectrogramConfig, StftConfig } from './types';

const DEFAULT_STFT: StftConfig = { windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' };

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && 2 ** Math.round(Math.log2(value)) === value;
}

export function resolveConfig(input: SpectrogramConfig): ResolvedSpectrogramConfig {
  if (!input.canvas) throw new Error('SpectrogramViewer requires a canvas');
  if (!input.source && !input.audio) throw new Error('SpectrogramViewer requires either source or audio');

  const stft = { ...DEFAULT_STFT, ...input.stft };
  if (!isPowerOfTwo(stft.fftSize)) throw new Error('stft.fftSize must be a power of two');
  if (stft.fftSize < stft.windowSize) throw new Error('stft.fftSize must be greater than or equal to stft.windowSize');
  if (stft.windowSize <= 0) throw new Error('stft.windowSize must be greater than zero');
  if (stft.hopSize <= 0) throw new Error('stft.hopSize must be greater than zero');

  const sourceDuration = input.source?.duration ?? input.audio?.duration ?? 1;
  const viewportConstraints = {
    minDurationSeconds: 0.05,
    maxDurationSeconds: Math.min(30, sourceDuration),
    ...input.viewportConstraints,
  };
  if (viewportConstraints.minDurationSeconds <= 0) throw new Error('viewportConstraints.minDurationSeconds must be greater than zero');
  if (viewportConstraints.maxDurationSeconds < viewportConstraints.minDurationSeconds) throw new Error('viewportConstraints.maxDurationSeconds must be greater than or equal to viewportConstraints.minDurationSeconds');

  const viewport = clampViewport({
    startTime: 0,
    endTime: sourceDuration,
    minFrequency: 0,
    maxFrequency: input.source ? input.source.sampleRate / 2 : 22_050,
    frequencyScale: 'linear' as const,
    ...input.viewport,
  }, sourceDuration, viewportConstraints);
  if (viewport.endTime <= viewport.startTime) throw new Error('viewport.endTime must be greater than viewport.startTime');
  if (viewport.maxFrequency <= viewport.minFrequency) throw new Error('viewport.maxFrequency must be greater than viewport.minFrequency');
  const channel = input.channel ?? 0;
  if (!Number.isInteger(channel) || channel < 0) throw new Error('channel must be a non-negative integer');
  if (input.source && channel >= input.source.channelCount) throw new Error(`channel ${channel} is outside source channel count ${input.source.channelCount}`);

  return {
    ...(input.audio === undefined ? {} : { audio: input.audio }),
    canvas: input.canvas,
    ...(input.source === undefined ? {} : { source: input.source }),
    channel,
    stft,
    viewport,
    viewportConstraints,
    valueScale: { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true, ...input.valueScale },
    colorMap: input.colorMap ?? 'viridis',
    playback: { showPlayhead: true, follow: false, followMargin: 0.2, renderOnSeek: true, ...input.playback },
    cache: resolveCache(input.cache, viewportConstraints),
    transforms: input.transforms ?? [],
  };
}

function clampViewport<T extends { startTime: number; endTime: number }>(viewport: T, sourceDuration: number, constraints: { minDurationSeconds: number; maxDurationSeconds: number }): T {
  const duration = Math.min(Math.max(viewport.endTime - viewport.startTime, constraints.minDurationSeconds), constraints.maxDurationSeconds, sourceDuration);
  const startTime = Math.min(Math.max(0, viewport.startTime), Math.max(0, sourceDuration - duration));
  return { ...viewport, startTime, endTime: startTime + duration };
}

function resolveCache(input: SpectrogramConfig['cache'], viewportConstraints: { maxDurationSeconds: number }) {
  const tileDurationSeconds = input?.tileDurationSeconds ?? 5;
  if (tileDurationSeconds <= 0) throw new Error('cache.tileDurationSeconds must be greater than zero');
  const minimumTilesForMaxViewport = Math.ceil(viewportConstraints.maxDurationSeconds / tileDurationSeconds) + 2;
  const prefetchTiles = input?.prefetchTiles ?? Math.max(8, minimumTilesForMaxViewport);
  const maxCachedTiles = Math.max(input?.maxCachedTiles ?? 64, minimumTilesForMaxViewport + prefetchTiles * 2);
  if (prefetchTiles < 0) throw new Error('cache.prefetchTiles must be greater than or equal to zero');
  return { tileDurationSeconds, maxCachedTiles, prefetchTiles };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'function' ? '[function]' : item));
}
