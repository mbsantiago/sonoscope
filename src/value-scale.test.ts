import { describe, expect, it } from 'vitest';
import { dbFromMagnitude, deriveValueArrays, normalizeValue } from './value-scale';

describe('value-scale', () => {
  it('computes digital db from magnitude', () => {
    expect(dbFromMagnitude(1)).toBeCloseTo(0);
    expect(dbFromMagnitude(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('normalizes and clamps values', () => {
    expect(normalizeValue(-50, { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true })).toBeCloseTo(0.5);
    expect(normalizeValue(10, { mode: 'db', min: -100, max: 0, gamma: 1, clamp: true })).toBe(1);
  });

  it('derives missing power and db arrays', () => {
    const matrix = deriveValueArrays({
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      frameStart: 0,
      frameCount: 1,
      binCount: 2,
      sampleRate: 100,
      times: new Float32Array([0]),
      frequencies: new Float32Array([0, 50]),
      magnitude: new Float32Array([1, 0.5]),
    });

    expect(matrix.power?.[1]).toBeCloseTo(0.25);
    expect(matrix.db?.[1]).toBeCloseTo(-6.0206, 3);
  });
});
