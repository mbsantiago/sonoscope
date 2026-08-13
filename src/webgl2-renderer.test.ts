import { describe, expect, it } from 'vitest';
import { textureValuesForTile, tileFrequencyRange } from './webgl2-renderer';
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

describe('tileFrequencyRange', () => {
  it('uses the tile frequency axis instead of the recording sample rate', () => {
    const tile = {
      sampleRate: 192_000,
      frequencies: Float32Array.from([0, 2_000, 8_000]),
    };

    expect(tileFrequencyRange(tile)).toEqual({ min: 0, max: 8_000 });
  });

  it('falls back to recording nyquist when the tile has no frequency axis', () => {
    const tile = {
      sampleRate: 192_000,
      frequencies: new Float32Array(),
    };

    expect(tileFrequencyRange(tile)).toEqual({ min: 0, max: 96_000 });
  });
});
