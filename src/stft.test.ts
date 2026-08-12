import { describe, expect, it } from 'vitest';
import { computeStftMatrix, createWindow } from './stft';

describe('stft', () => {
  it('creates known window functions', () => {
    expect(Array.from(createWindow('rectangular', 4))).toEqual([1, 1, 1, 1]);
    expect(createWindow('hann', 4)[0]).toBeCloseTo(0);
  });

  it('finds a sine peak near the expected frequency', () => {
    const sampleRate = 1024;
    const samples = Float32Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 128 * (i / sampleRate)));
    const matrix = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: 'hann' },
    });
    const firstFrame = matrix.magnitude.slice(0, matrix.binCount);
    let maxBin = 0;
    for (let i = 1; i < firstFrame.length; i++) if (firstFrame[i]! > firstFrame[maxBin]!) maxBin = i;
    expect(matrix.frequencies[maxBin]).toBeCloseTo(128, 0);
  });
});
