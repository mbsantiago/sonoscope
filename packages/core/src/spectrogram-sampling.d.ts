import type { SpectrogramMatrix, ValueScaleConfig } from "./types";
export type SamplePosition = {
  low: number;
  high: number;
  fraction: number;
};
export type SpectrogramValueData = {
  values: Float32Array | Uint8Array;
  binCount: number;
};
export declare function pickNearestFrame(
  times: Float32Array,
  time: number,
): number;
export declare function pickNearestBin(
  frequencies: Float32Array,
  frequency: number,
): number;
export declare function sampleSpectrogramValue(
  tile: SpectrogramMatrix,
  time: number,
  frequency: number,
  mode: ValueScaleConfig["mode"],
): number;
export declare function sampleSpectrogramPosition(
  tile: SpectrogramMatrix,
  timePosition: SamplePosition,
  frequencyPosition: SamplePosition,
  mode: ValueScaleConfig["mode"],
): number;
export declare function sampleValueDataPosition(
  data: SpectrogramValueData,
  timePosition: SamplePosition,
  frequencyPosition: SamplePosition,
): number;
export declare function valueDataForMode(
  tile: SpectrogramMatrix,
  mode: ValueScaleConfig["mode"],
): SpectrogramValueData;
export declare function locateSamplePosition(
  values: Float32Array,
  target: number,
): SamplePosition;
//# sourceMappingURL=spectrogram-sampling.d.ts.map
