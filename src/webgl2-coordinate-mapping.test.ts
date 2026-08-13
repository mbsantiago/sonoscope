import { describe, expect, it } from 'vitest';
import { frequencyToTextureV, frequencyToWebGLTextureV, sourceValueIndex, textureVToBin, textureValueIndex, timeToFrame, timeToTextureU, viewportPixelToFrequency, viewportPixelToTileSample, viewportPixelToTime } from './webgl2-coordinate-mapping';

describe('webgl2 coordinate mapping', () => {
  it('maps canvas y pixels to frequency like the canvas renderer', () => {
    expect(viewportPixelToFrequency({ y: 0, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' })).toBe(8000);
    expect(viewportPixelToFrequency({ y: 100, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' })).toBe(0);
    expect(viewportPixelToFrequency({ y: 50, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' })).toBe(4000);
  });

  it('maps frequency to low-to-high texture rows', () => {
    expect(frequencyToTextureV({ frequency: 0, minFrequency: 0, maxFrequency: 8000 })).toBe(0);
    expect(frequencyToTextureV({ frequency: 4000, minFrequency: 0, maxFrequency: 8000 })).toBe(0.5);
    expect(frequencyToTextureV({ frequency: 8000, minFrequency: 0, maxFrequency: 8000 })).toBe(1);
  });

  it('maps texture v to bins with low frequencies in low rows', () => {
    expect(textureVToBin({ textureV: 0, binCount: 8 })).toBe(0);
    expect(textureVToBin({ textureV: 0.5, binCount: 8 })).toBe(4);
    expect(textureVToBin({ textureV: 1, binCount: 8 })).toBe(7);
  });

  it('maps WebGL texture v to compensate for bottom-left texture coordinates', () => {
    expect(frequencyToWebGLTextureV({ frequency: 0, minFrequency: 0, maxFrequency: 8000 })).toBe(1);
    expect(frequencyToWebGLTextureV({ frequency: 4000, minFrequency: 0, maxFrequency: 8000 })).toBe(0.5);
    expect(frequencyToWebGLTextureV({ frequency: 8000, minFrequency: 0, maxFrequency: 8000 })).toBe(0);
  });

  it('maps screen top to high frequency bins and screen bottom to low frequency bins', () => {
    const topFrequency = viewportPixelToFrequency({ y: 0, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' });
    const bottomFrequency = viewportPixelToFrequency({ y: 100, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' });

    expect(textureVToBin({ textureV: frequencyToTextureV({ frequency: topFrequency, minFrequency: 0, maxFrequency: 8000 }), binCount: 8 })).toBe(7);
    expect(textureVToBin({ textureV: frequencyToTextureV({ frequency: bottomFrequency, minFrequency: 0, maxFrequency: 8000 }), binCount: 8 })).toBe(0);
  });

  it('packs frame-major source values into row-major texture values without flipping bins', () => {
    expect(sourceValueIndex({ frame: 0, bin: 0, binCount: 8 })).toBe(0);
    expect(sourceValueIndex({ frame: 1, bin: 0, binCount: 8 })).toBe(8);
    expect(sourceValueIndex({ frame: 1, bin: 3, binCount: 8 })).toBe(11);

    expect(textureValueIndex({ frame: 0, bin: 0, frameCount: 8 })).toBe(0);
    expect(textureValueIndex({ frame: 1, bin: 0, frameCount: 8 })).toBe(1);
    expect(textureValueIndex({ frame: 1, bin: 3, frameCount: 8 })).toBe(25);
  });

  it('maps viewport x pixels to global time', () => {
    expect(viewportPixelToTime({ x: 0, width: 100, viewportStartTime: 2, viewportEndTime: 10 })).toBe(2);
    expect(viewportPixelToTime({ x: 50, width: 100, viewportStartTime: 2, viewportEndTime: 10 })).toBe(6);
    expect(viewportPixelToTime({ x: 100, width: 100, viewportStartTime: 2, viewportEndTime: 10 })).toBe(10);
  });

  it('maps global time into tile-local texture u for full and partial viewport overlaps', () => {
    expect(timeToTextureU({ time: 0, tileStartTime: 0, tileEndTime: 8 })).toBe(0);
    expect(timeToTextureU({ time: 4, tileStartTime: 0, tileEndTime: 8 })).toBe(0.5);
    expect(timeToTextureU({ time: 8, tileStartTime: 0, tileEndTime: 8 })).toBe(1);
    expect(timeToTextureU({ time: 5, tileStartTime: 5, tileEndTime: 10 })).toBe(0);
    expect(timeToTextureU({ time: 7.5, tileStartTime: 5, tileEndTime: 10 })).toBe(0.5);
  });

  it('maps screen pixels to tile frame and bin indices without clipping the visible viewport', () => {
    const time = viewportPixelToTime({ x: 50, width: 100, viewportStartTime: 0, viewportEndTime: 8 });
    const frequency = viewportPixelToFrequency({ y: 25, height: 100, minFrequency: 0, maxFrequency: 8000, frequencyScale: 'linear' });
    const frame = timeToFrame({ time, tileStartTime: 0, tileEndTime: 8, frameCount: 128 });
    const bin = textureVToBin({ textureV: frequencyToTextureV({ frequency, minFrequency: 0, maxFrequency: 8000 }), binCount: 128 });

    expect(frame).toBe(64);
    expect(bin).toBe(96);
  });

  it('maps partial viewport pixels through global time before tile-local frame lookup', () => {
    const sample = viewportPixelToTileSample({
      x: 25,
      y: 75,
      width: 100,
      height: 100,
      viewportStartTime: 4,
      viewportEndTime: 12,
      viewportMinFrequency: 0,
      viewportMaxFrequency: 8000,
      frequencyScale: 'linear' as const,
      tileStartTime: 0,
      tileEndTime: 16,
      tileMinFrequency: 0,
      tileMaxFrequency: 8000,
      frameCount: 160,
      binCount: 80,
    });

    expect(sample.time).toBe(6);
    expect(sample.textureU).toBe(0.375);
    expect(sample.frame).toBe(60);
    expect(sample.frequency).toBe(2000);
    expect(sample.textureV).toBe(0.75);
    expect(sample.bin).toBe(60);
  });

  it('maps viewport top and bottom to the same texture rows WebGL samples', () => {
    const input = {
      x: 0,
      width: 100,
      height: 100,
      viewportStartTime: 0,
      viewportEndTime: 1,
      viewportMinFrequency: 0,
      viewportMaxFrequency: 100,
      frequencyScale: 'linear' as const,
      tileStartTime: 0,
      tileEndTime: 1,
      tileMinFrequency: 0,
      tileMaxFrequency: 100,
      frameCount: 8,
      binCount: 8,
    };
    const top = viewportPixelToTileSample({ ...input, y: 0 });
    const bottom = viewportPixelToTileSample({ ...input, y: 100 });

    expect(top.bin).toBe(0);
    expect(bottom.bin).toBe(7);
  });
});
