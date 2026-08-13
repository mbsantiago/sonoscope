import type { SpectrogramMatrix } from '../types';

export function terrainVerticesForTile(tile: Pick<SpectrogramMatrix, 'frameCount' | 'binCount'>, maxColumns = 96, maxRows = 96): Float32Array {
  const columns = Math.max(2, Math.min(maxColumns, tile.frameCount));
  const rows = Math.max(2, Math.min(maxRows, tile.binCount));
  const vertices = new Float32Array((columns - 1) * (rows - 1) * 6 * 4);
  let offset = 0;
  for (let row = 0; row < rows - 1; row++) {
    const v0 = row / (rows - 1);
    const v1 = (row + 1) / (rows - 1);
    for (let column = 0; column < columns - 1; column++) {
      const u0 = column / (columns - 1);
      const u1 = (column + 1) / (columns - 1);
      offset = writeTerrainVertex(vertices, offset, u0, v0);
      offset = writeTerrainVertex(vertices, offset, u1, v0);
      offset = writeTerrainVertex(vertices, offset, u0, v1);
      offset = writeTerrainVertex(vertices, offset, u1, v0);
      offset = writeTerrainVertex(vertices, offset, u1, v1);
      offset = writeTerrainVertex(vertices, offset, u0, v1);
    }
  }
  return vertices;
}

function writeTerrainVertex(vertices: Float32Array, offset: number, u: number, v: number): number {
  vertices[offset] = u;
  vertices[offset + 1] = v;
  vertices[offset + 2] = u;
  vertices[offset + 3] = v;
  return offset + 4;
}

export function tileFrequencyRange(tile: Pick<SpectrogramMatrix, 'frequencies' | 'sampleRate'>): { min: number; max: number } {
  return {
    min: tile.frequencies[0] ?? 0,
    max: tile.frequencies[tile.frequencies.length - 1] ?? Math.max(1, tile.sampleRate / 2),
  };
}
