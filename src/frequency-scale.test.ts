import { describe, expect, it } from 'vitest';
import { canvasToTimeFrequency, hzToMel, melToHz, timeFrequencyToCanvas } from './frequency-scale';

const viewport = { startTime: 10, endTime: 20, minFrequency: 100, maxFrequency: 10_000, frequencyScale: 'linear' as const };

describe('frequency-scale', () => {
  it('round-trips mel conversion', () => {
    expect(melToHz(hzToMel(1000))).toBeCloseTo(1000, 5);
  });

  it('maps canvas center to viewport center for linear axes', () => {
    expect(canvasToTimeFrequency(50, 50, 100, 100, viewport)).toEqual({ time: 15, frequency: 5050 });
  });

  it('round-trips time/frequency coordinates', () => {
    const point = timeFrequencyToCanvas(12.5, 2575, 100, 100, viewport);
    expect(canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).time).toBeCloseTo(12.5);
    expect(canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).frequency).toBeCloseTo(2575);
  });
});
