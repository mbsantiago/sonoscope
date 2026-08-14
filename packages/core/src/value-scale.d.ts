import type { SpectrogramMatrix, ValueScaleConfig } from "./types";
export declare function dbFromMagnitude(magnitude: number): number;
export declare function magnitudeFromDb(db: number): number;
export declare function powerFromDb(db: number): number;
export declare function valueScaleBounds(config: Required<ValueScaleConfig>): {
  min: number;
  max: number;
};
export declare function normalizeValue(
  value: number,
  config: Required<ValueScaleConfig>,
): number;
export declare function derivePower(magnitude: Float32Array): Float32Array;
export declare function deriveDb(magnitude: Float32Array): Float32Array;
export declare function deriveValueArrays(
  matrix: SpectrogramMatrix,
): SpectrogramMatrix;
//# sourceMappingURL=value-scale.d.ts.map
