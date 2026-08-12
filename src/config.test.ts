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
    expect(config.stft).toEqual({ windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' });
    expect(config.viewport.frequencyScale).toBe('linear');
    expect(config.colorMap).toBe('viridis');
  });

  it('throws when fftSize is not a power of two', () => {
    expect(() => resolveConfig({ canvas, source, stft: { fftSize: 1000 } })).toThrow(/power of two/);
  });

  it('throws when neither source nor audio is provided', () => {
    expect(() => resolveConfig({ canvas })).toThrow(/source or audio/);
  });
});
