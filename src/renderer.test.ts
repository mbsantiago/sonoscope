import { describe, expect, it } from 'vitest';
import { pickNearestBin, pickNearestFrame } from './renderer';

describe('renderer helpers', () => {
  it('picks nearest frame and bin indexes', () => {
    expect(pickNearestFrame(Float32Array.from([0, 0.5, 1]), 0.6)).toBe(1);
    expect(pickNearestBin(Float32Array.from([100, 200, 300]), 260)).toBe(2);
  });
});
