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

  const viewport = {
    startTime: 0,
    endTime: input.source?.duration ?? input.audio?.duration ?? 1,
    minFrequency: 0,
    maxFrequency: input.source ? input.source.sampleRate / 2 : 22_050,
    frequencyScale: 'linear' as const,
    ...input.viewport,
  };
  if (viewport.endTime <= viewport.startTime) throw new Error('viewport.endTime must be greater than viewport.startTime');
  if (viewport.maxFrequency <= viewport.minFrequency) throw new Error('viewport.maxFrequency must be greater than viewport.minFrequency');

  return {
    ...(input.audio === undefined ? {} : { audio: input.audio }),
    canvas: input.canvas,
    ...(input.source === undefined ? {} : { source: input.source }),
    stft,
    viewport,
    valueScale: { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true, ...input.valueScale },
    colorMap: input.colorMap ?? 'viridis',
    playback: { showPlayhead: true, follow: false, followMargin: 0.2, renderOnSeek: true, ...input.playback },
    cache: { tileDurationSeconds: 5, maxCachedTiles: 64, prefetchTiles: 8, ...input.cache },
    transforms: input.transforms ?? [],
  };
}

export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'function' ? '[function]' : item));
}
