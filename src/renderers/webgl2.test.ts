import { describe, expect, it } from 'vitest';
import { terrainVerticesForTile, textureValuesForTile, tileFrequencyRange } from './webgl2';
import type { SpectrogramMatrix } from '../types';

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

    expect(Array.from(textureValuesForTile(tile, { mode: 'magnitude', min: -240, max: 0, gamma: 1, clamp: true }))).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
  });

  it('normalizes magnitude and power texture values with db bounds', () => {
    const tile: SpectrogramMatrix = {
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      frameStart: 0,
      frameCount: 1,
      binCount: 1,
      sampleRate: 10,
      times: Float32Array.from([0]),
      frequencies: Float32Array.from([0]),
      magnitude: Float32Array.from([0.5]),
      power: Float32Array.from([0.25]),
    };

    expect(textureValuesForTile(tile, { mode: 'magnitude', min: -100, max: 0, gamma: 1, clamp: true })[0]).toBe(127);
    expect(textureValuesForTile(tile, { mode: 'power', min: -100, max: 0, gamma: 1, clamp: true })[0]).toBe(64);
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

describe('terrainVerticesForTile', () => {
  it('builds two triangles per terrain cell with position and uv pairs', () => {
    const vertices = terrainVerticesForTile({ frameCount: 3, binCount: 2 }, 3, 2);

    expect(vertices.length).toBe(2 * 1 * 6 * 4);
    expect(Array.from(vertices.slice(0, 8))).toEqual([0, 0, 0, 0, 0.5, 0, 0.5, 0]);
  });
});
