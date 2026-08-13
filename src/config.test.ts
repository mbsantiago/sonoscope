import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config';
import type { AudioSource } from './types';

const source: AudioSource = {
  id: 'test-source',
  sampleRate: 48_000,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(0),
};

const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;

describe('resolveConfig', () => {
  it('fills defaults and preserves provided source', () => {
    const config = resolveConfig({ canvas, source });
    expect(config.source).toBe(source);
    expect(config.renderer).toBe('auto');
    expect(config.channel).toBe(0);
    expect(config.stft).toEqual({ windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' });
    expect(config.viewport.frequencyScale).toBe('linear');
    expect(config.colorMap).toBe('viridis');
    expect(config.superpowers.secretSpectrogram3d).toBe(false);
  });

  it('preserves hidden superpower flags', () => {
    expect(resolveConfig({ canvas, source, superpowers: { secretSpectrogram3d: true } }).superpowers.secretSpectrogram3d).toBe(true);
  });

  it('preserves explicit renderer modes', () => {
    expect(resolveConfig({ canvas, source, renderer: 'canvas2d' }).renderer).toBe('canvas2d');
    expect(resolveConfig({ canvas, source, renderer: 'webgl' }).renderer).toBe('webgl');
    expect(resolveConfig({ canvas, source, renderer: 'webgl2' }).renderer).toBe('webgl2');
    expect(resolveConfig({ canvas, source, renderer: { type: 'webgl', program: 'terrain' } }).renderer).toEqual({ type: 'webgl', program: 'terrain' });
  });

  it('validates selected channel against the source', () => {
    expect(resolveConfig({ canvas, source: { ...source, channelCount: 2 }, channel: 1 }).channel).toBe(1);
    expect(() => resolveConfig({ canvas, source, channel: 1 })).toThrow(/outside source channel count/);
    expect(() => resolveConfig({ canvas, source, channel: -1 })).toThrow(/non-negative integer/);
  });

  it('throws when fftSize is not a power of two', () => {
    expect(() => resolveConfig({ canvas, source, stft: { fftSize: 1000 } })).toThrow(/power of two/);
  });

  it('throws when neither source nor audio is provided', () => {
    expect(() => resolveConfig({ canvas })).toThrow(/source or audio/);
  });

  it('clamps viewport duration to configured bounds', () => {
    const config = resolveConfig({
      canvas,
      source,
      viewport: { startTime: 1, endTime: 9 },
      viewportConstraints: { minDurationSeconds: 1, maxDurationSeconds: 3 },
    });

    expect(config.viewport).toMatchObject({ startTime: 1, endTime: 4 });
    expect(config.viewportConstraints).toEqual({ minDurationSeconds: 1, maxDurationSeconds: 3 });
  });

  it('sizes cache to cover the maximum viewport duration with prefetch room', () => {
    const config = resolveConfig({
      canvas,
      source,
      viewportConstraints: { maxDurationSeconds: 20 },
      cache: { tileDurationSeconds: 5, maxCachedTiles: 2, prefetchTiles: 1 },
    });

    expect(config.cache.maxCachedTiles).toBeGreaterThanOrEqual(8);
  });
});
