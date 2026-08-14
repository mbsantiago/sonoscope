import type { SpectrogramMatrix, ValueScaleConfig } from "./types";

export type SamplePosition = { low: number; high: number; fraction: number };
export type SpectrogramValueData = {
  values: Float32Array | Uint8Array;
  binCount: number;
};

export function pickNearestFrame(times: Float32Array, time: number): number {
  return pickNearest(times, time);
}

export function pickNearestBin(
  frequencies: Float32Array,
  frequency: number,
): number {
  return pickNearest(frequencies, frequency);
}

export function sampleSpectrogramValue(
  tile: SpectrogramMatrix,
  time: number,
  frequency: number,
  mode: ValueScaleConfig["mode"],
): number {
  if (tile.frameCount === 0 || tile.binCount === 0) return 0;
  return sampleSpectrogramPosition(
    tile,
    locateSorted(tile.times, time),
    locateSorted(tile.frequencies, frequency),
    mode,
  );
}

export function sampleSpectrogramPosition(
  tile: SpectrogramMatrix,
  timePosition: SamplePosition,
  frequencyPosition: SamplePosition,
  mode: ValueScaleConfig["mode"],
): number {
  return sampleValueDataPosition(
    valueDataForMode(tile, mode),
    timePosition,
    frequencyPosition,
  );
}

export function sampleValueDataPosition(
  data: SpectrogramValueData,
  timePosition: SamplePosition,
  frequencyPosition: SamplePosition,
): number {
  const lowFrame = timePosition.low;
  const highFrame = timePosition.high;
  const lowBin = frequencyPosition.low;
  const highBin = frequencyPosition.high;
  const lowFrequencyValue = lerp(
    valueAt(data, lowFrame, lowBin),
    valueAt(data, highFrame, lowBin),
    timePosition.fraction,
  );
  const highFrequencyValue = lerp(
    valueAt(data, lowFrame, highBin),
    valueAt(data, highFrame, highBin),
    timePosition.fraction,
  );
  return lerp(
    lowFrequencyValue,
    highFrequencyValue,
    frequencyPosition.fraction,
  );
}

export function valueDataForMode(
  tile: SpectrogramMatrix,
  mode: ValueScaleConfig["mode"],
): SpectrogramValueData {
  if (mode === "power" && tile.power)
    return { values: tile.power, binCount: tile.binCount };
  if (mode === "db" && tile.db)
    return { values: tile.db, binCount: tile.binCount };
  if (mode === "power") {
    const values = new Float32Array(tile.magnitude.length);
    for (let index = 0; index < values.length; index++)
      values[index] = tile.magnitude[index]! ** 2;
    return { values, binCount: tile.binCount };
  }
  if (mode === "db") {
    const values = new Float32Array(tile.magnitude.length);
    for (let index = 0; index < values.length; index++)
      values[index] =
        20 * Math.log10(Math.max(1e-12, Math.abs(tile.magnitude[index]!)));
    return { values, binCount: tile.binCount };
  }
  return { values: tile.magnitude, binCount: tile.binCount };
}

export function locateSamplePosition(
  values: Float32Array,
  target: number,
): SamplePosition {
  return locateSorted(values, target);
}

function pickNearest(values: Float32Array, target: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]! - target) < Math.abs(values[best]! - target))
      best = i;
  }
  return best;
}

function locateSorted(values: Float32Array, target: number): SamplePosition {
  if (values.length <= 1 || target <= values[0]!)
    return { low: 0, high: 0, fraction: 0 };
  const last = values.length - 1;
  if (target >= values[last]!) return { low: last, high: last, fraction: 0 };

  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= target) low = middle;
    else high = middle;
  }

  return {
    low,
    high,
    fraction: (target - values[low]!) / (values[high]! - values[low]!),
  };
}

function valueAt(
  data: SpectrogramValueData,
  frame: number,
  bin: number,
): number {
  return data.values[frame * data.binCount + bin]!;
}

function lerp(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction;
}
