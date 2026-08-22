import type { CacheStats, SpectrogramMatrix } from "./types";

export type TileKeyParts = {
  sourceId: string;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stftHash: string;
  transformHash: string;
};

export function createTileKey(parts: TileKeyParts): string {
  return [
    parts.sourceId,
    parts.channel,
    parts.timeStart.toFixed(6),
    parts.timeEnd.toFixed(6),
    parts.stftHash,
    parts.transformHash,
  ].join("|");
}

export class SpectrogramCache {
  private readonly tiles = new Map<
    string,
    { matrix: SpectrogramMatrix; tileTime: number }
  >();
  private bytes = 0;
  private peakTiles = 0;
  private peakBytes = 0;

  constructor(private readonly options: { maxCachedTiles: number }) {}

  get(key: string): SpectrogramMatrix | undefined {
    const entry = this.tiles.get(key);
    if (!entry) return undefined;
    this.tiles.delete(key);
    this.tiles.set(key, entry);
    return entry.matrix;
  }

  has(key: string): boolean {
    return this.tiles.has(key);
  }

  size(): number {
    return this.tiles.size;
  }

  stats(): CacheStats {
    return {
      tiles: this.tiles.size,
      bytes: this.bytes,
      peakTiles: this.peakTiles,
      peakBytes: this.peakBytes,
    };
  }

  set(
    key: string,
    matrix: SpectrogramMatrix,
    tileTime: number,
    viewportTime?: number,
  ): void {
    const existing = this.tiles.get(key);
    if (existing) {
      this.bytes -= matrixBytes(existing.matrix);
      this.tiles.delete(key);
    }
    this.tiles.set(key, { matrix, tileTime });
    this.bytes += matrixBytes(matrix);
    while (this.tiles.size > this.options.maxCachedTiles) {
      let keyToRemove = this.tiles.keys().next().value as string | undefined;
      if (viewportTime !== undefined) {
        let greatestDistance = -Infinity;
        for (const [candidateKey, entry] of this.tiles) {
          const distance = Math.abs(entry.tileTime - viewportTime);
          if (distance > greatestDistance) {
            greatestDistance = distance;
            keyToRemove = candidateKey;
          }
        }
      }
      if (!keyToRemove) break;
      const removed = this.tiles.get(keyToRemove);
      if (removed) this.bytes -= matrixBytes(removed.matrix);
      this.tiles.delete(keyToRemove);
    }
    this.peakTiles = Math.max(this.peakTiles, this.tiles.size);
    this.peakBytes = Math.max(this.peakBytes, this.bytes);
  }

  clear(): void {
    this.tiles.clear();
    this.bytes = 0;
  }
}

function matrixBytes(matrix: SpectrogramMatrix): number {
  return (
    matrix.times.byteLength +
    matrix.frequencies.byteLength +
    matrix.magnitude.byteLength +
    (matrix.power?.byteLength ?? 0) +
    (matrix.db?.byteLength ?? 0) +
    (matrix.normalized?.byteLength ?? 0)
  );
}
