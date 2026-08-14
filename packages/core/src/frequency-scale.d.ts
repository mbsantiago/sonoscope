import type { FrequencyScale, ViewportConfig } from "./types";
export declare function hzToMel(hz: number): number;
export declare function melToHz(mel: number): number;
export declare function hzToScale(hz: number, scale: FrequencyScale): number;
export declare function scaleToHz(value: number, scale: FrequencyScale): number;
export declare function canvasToTimeFrequency(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: ViewportConfig,
): {
  time: number;
  frequency: number;
};
export declare function timeFrequencyToCanvas(
  time: number,
  frequency: number,
  width: number,
  height: number,
  viewport: ViewportConfig,
): {
  x: number;
  y: number;
};
//# sourceMappingURL=frequency-scale.d.ts.map
