import { describe, expect, it } from 'vitest';
import { SpectrogramCache, createTileKey } from './cache';
import type { SpectrogramMatrix } from './types';

function matrix(id: number): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart: id,
    timeEnd: id + 1,
    frameStart: 0,
    frameCount: 1,
    binCount: 1,
    sampleRate: 1,
    times: Float32Array.from([id]),
    frequencies: Float32Array.from([0]),
    magnitude: Float32Array.from([id]),
  };
}

describe('SpectrogramCache', () => {
  it('creates stable tile keys', () => {
    expect(createTileKey({ sourceId: 'a', channel: 0, timeStart: 0, timeEnd: 1, stftHash: 's', transformHash: 't' })).toBe(
      'a|0|0.000000|1.000000|s|t',
    );
  });

  it('evicts oldest tiles beyond maxCachedTiles', () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 1 });
    cache.set('a', matrix(1));
    cache.set('b', matrix(2));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.timeStart).toBe(2);
  });
});
