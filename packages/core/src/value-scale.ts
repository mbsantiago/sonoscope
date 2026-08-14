import type { SpectrogramMatrix, ValueScaleConfig } from "./types";

const FLOOR = 1e-12;

export function dbFromMagnitude(magnitude: number): number {
  return 20 * Math.log10(Math.max(FLOOR, Math.abs(magnitude)));
}

export function magnitudeFromDb(db: number): number {
  return 10 ** (db / 20);
}

export function powerFromDb(db: number): number {
  return magnitudeFromDb(db) ** 2;
}

export function valueScaleBounds(config: Required<ValueScaleConfig>): {
  min: number;
  max: number;
} {
  if (config.mode === "magnitude")
    return {
      min: magnitudeFromDb(config.min),
      max: magnitudeFromDb(config.max),
    };
  if (config.mode === "power")
    return { min: powerFromDb(config.min), max: powerFromDb(config.max) };
  return { min: config.min, max: config.max };
}

export function normalizeValue(
  value: number,
  config: Required<ValueScaleConfig>,
): number {
  const { min, max } = valueScaleBounds(config);
  const span = max - min || 1;
  let normalized = (value - min) / span;
  if (config.clamp) normalized = Math.max(0, Math.min(1, normalized));
  return normalized ** config.gamma;
}

export function derivePower(magnitude: Float32Array): Float32Array {
  return Float32Array.from(magnitude, (value) => value * value);
}

export function deriveDb(magnitude: Float32Array): Float32Array {
  return Float32Array.from(magnitude, dbFromMagnitude);
}

export function deriveValueArrays(
  matrix: SpectrogramMatrix,
): SpectrogramMatrix {
  return {
    ...matrix,
    power: matrix.power ?? derivePower(matrix.magnitude),
    db: matrix.db ?? deriveDb(matrix.magnitude),
  };
}
