import type { CacheStats, SpectrogramMatrix } from "./types";
export type TileKeyParts = {
  sourceId: string;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stftHash: string;
  transformHash: string;
};
export declare function createTileKey(parts: TileKeyParts): string;
export declare class SpectrogramCache {
  private readonly options;
  private readonly tiles;
  private bytes;
  private peakTiles;
  private peakBytes;
  constructor(options: {
    maxCachedTiles: number;
  });
  get(key: string): SpectrogramMatrix | undefined;
  has(key: string): boolean;
  size(): number;
  stats(): CacheStats;
  set(key: string, matrix: SpectrogramMatrix): void;
  clear(): void;
}
//# sourceMappingURL=cache.d.ts.map
