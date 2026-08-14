import type { SpectrogramMatrix } from "../types";
export declare function terrainVerticesForTile(
  tile: Pick<SpectrogramMatrix, "frameCount" | "binCount">,
  maxColumns?: number,
  maxRows?: number,
): Float32Array;
export declare function tileFrequencyRange(
  tile: Pick<SpectrogramMatrix, "frequencies" | "sampleRate">,
): {
  min: number;
  max: number;
};
//# sourceMappingURL=webgl2-geometry.d.ts.map
