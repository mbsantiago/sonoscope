import { describe, expect, it } from 'vitest';
import { textureValuesForTile } from './webgl2-renderer';
import type { SpectrogramMatrix } from './types';

describe('textureValuesForTile', () => {
  it('packs normalized values into rgba texture rows', () => {
    const tile: SpectrogramMatrix = {
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      frameStart: 0,
      frameCount: 2,
      binCount: 2,
      sampleRate: 10,
      times: Float32Array.from([0, 1]),
      frequencies: Float32Array.from([0, 100]),
      magnitude: Float32Array.from([0, 1, 1, 0]),
    };

    expect(Array.from(textureValuesForTile(tile, { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true }))).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
  });
});
