import type { SpectrogramMatrix, ValueScaleConfig } from './types';

export function pickNearestFrame(times: Float32Array, time: number): number {
  return pickNearest(times, time);
}

export function pickNearestBin(frequencies: Float32Array, frequency: number): number {
  return pickNearest(frequencies, frequency);
}

export function sampleSpectrogramValue(tile: SpectrogramMatrix, time: number, frequency: number, mode: ValueScaleConfig['mode']): number {
  if (tile.frameCount === 0 || tile.binCount === 0) return 0;
  const timePosition = locateSorted(tile.times, time);
  const frequencyPosition = locateSorted(tile.frequencies, frequency);
  const lowFrame = timePosition.low;
  const highFrame = timePosition.high;
  const lowBin = frequencyPosition.low;
  const highBin = frequencyPosition.high;
  const lowFrequencyValue = lerp(valueAt(tile, lowFrame, lowBin, mode), valueAt(tile, highFrame, lowBin, mode), timePosition.fraction);
  const highFrequencyValue = lerp(valueAt(tile, lowFrame, highBin, mode), valueAt(tile, highFrame, highBin, mode), timePosition.fraction);
  return lerp(lowFrequencyValue, highFrequencyValue, frequencyPosition.fraction);
}

function pickNearest(values: Float32Array, target: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]! - target) < Math.abs(values[best]! - target)) best = i;
  }
  return best;
}

function locateSorted(values: Float32Array, target: number): { low: number; high: number; fraction: number } {
  if (values.length <= 1 || target <= values[0]!) return { low: 0, high: 0, fraction: 0 };
  const last = values.length - 1;
  if (target >= values[last]!) return { low: last, high: last, fraction: 0 };

  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= target) low = middle;
    else high = middle;
  }

  return { low, high, fraction: (target - values[low]!) / (values[high]! - values[low]!) };
}

function valueAt(tile: SpectrogramMatrix, frame: number, bin: number, mode: ValueScaleConfig['mode']): number {
  const index = frame * tile.binCount + bin;
  if (mode === 'power') return tile.power?.[index] ?? tile.magnitude[index]! ** 2;
  if (mode === 'db') return tile.db?.[index] ?? 20 * Math.log10(Math.max(1e-12, Math.abs(tile.magnitude[index]!)));
  return tile.magnitude[index]!;
}

function lerp(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction;
}
