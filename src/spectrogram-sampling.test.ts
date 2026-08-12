import { describe, expect, it } from 'vitest';
import { pickNearestBin, pickNearestFrame, sampleSpectrogramValue } from './spectrogram-sampling';
import type { SpectrogramMatrix } from './types';

const matrix: SpectrogramMatrix = {
  channel: 0,
  timeStart: 0,
  timeEnd: 1,
  frameStart: 0,
  frameCount: 2,
  binCount: 2,
  sampleRate: 4,
  times: Float32Array.from([0, 1]),
  frequencies: Float32Array.from([100, 200]),
  magnitude: Float32Array.from([0, 1, 0.5, 0.25]),
};

describe('spectrogram sampling', () => {
  it('picks nearest frame and bin indexes', () => {
    expect(pickNearestFrame(Float32Array.from([0, 0.5, 1]), 0.6)).toBe(1);
    expect(pickNearestBin(Float32Array.from([100, 200, 300]), 260)).toBe(2);
  });

  it('bilinearly samples values between frames and bins', () => {
    expect(sampleSpectrogramValue(matrix, 0.5, 150, 'magnitude')).toBeCloseTo(0.4375);
  });

  it('clamps samples outside the matrix extent', () => {
    expect(sampleSpectrogramValue(matrix, -1, 50, 'magnitude')).toBe(0);
    expect(sampleSpectrogramValue(matrix, 2, 300, 'magnitude')).toBe(0.25);
  });
});
