import type { SpectrogramMatrix, StftConfig, WindowName } from "../types";
export declare function createWindow(
  name: WindowName,
  size: number,
): Float32Array;
export declare function computeStftMatrix(
  samples: Float32Array,
  options: {
    channel: number;
    timeStart: number;
    sampleRate: number;
    stft: StftConfig;
  },
): SpectrogramMatrix;
//# sourceMappingURL=stft.d.ts.map
