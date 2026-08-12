import { describe, expect, it } from 'vitest';
import { MainThreadComputeBackend } from './backend';
import type { AudioSource } from './types';

describe('MainThreadComputeBackend', () => {
  it('reads a source range and computes a matrix', async () => {
    const source: AudioSource = {
      id: 'source',
      sampleRate: 1024,
      duration: 1,
      channelCount: 1,
      read: () => new Float32Array(1024),
    };
    const backend = new MainThreadComputeBackend();
    const matrix = await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: 'hann' },
    });
    expect(matrix.channel).toBe(0);
    expect(matrix.binCount).toBe(128);
  });
});
