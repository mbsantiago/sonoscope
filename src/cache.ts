import type { SpectrogramMatrix } from './types';

export type TileKeyParts = {
  sourceId: string;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stftHash: string;
  transformHash: string;
};

export function createTileKey(parts: TileKeyParts): string {
  return [parts.sourceId, parts.channel, parts.timeStart.toFixed(6), parts.timeEnd.toFixed(6), parts.stftHash, parts.transformHash].join('|');
}

export class SpectrogramCache {
  private readonly tiles = new Map<string, SpectrogramMatrix>();

  constructor(private readonly options: { maxCachedTiles: number }) {}

  get(key: string): SpectrogramMatrix | undefined {
    const value = this.tiles.get(key);
    if (!value) return undefined;
    this.tiles.delete(key);
    this.tiles.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.tiles.has(key);
  }

  size(): number {
    return this.tiles.size;
  }

  set(key: string, matrix: SpectrogramMatrix): void {
    this.tiles.set(key, matrix);
    while (this.tiles.size > this.options.maxCachedTiles) {
      const oldest = this.tiles.keys().next().value as string | undefined;
      if (!oldest) break;
      this.tiles.delete(oldest);
    }
  }

  clear(): void {
    this.tiles.clear();
  }
}
