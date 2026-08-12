import { describe, expect, it } from 'vitest';
import { applyTransforms, getTransformPadding } from './transforms';
import type { SpectrogramMatrix, SpectrogramTransform } from './types';

function matrix(): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart: 0,
    timeEnd: 1,
    frameStart: 0,
    frameCount: 2,
    binCount: 2,
    sampleRate: 4,
    times: Float32Array.from([0, 0.5]),
    frequencies: Float32Array.from([0, 2]),
    magnitude: Float32Array.from([1, 2, 3, 4]),
  };
}

describe('transforms', () => {
  it('combines requested padding', () => {
    expect(getTransformPadding([{ name: 'a', version: '1', timePaddingSeconds: 1, frequencyPaddingBins: 2, apply: (m) => m }])).toEqual({
      timePaddingSeconds: 1,
      frequencyPaddingBins: 2,
    });
  });

  it('applies transforms in order', async () => {
    const transforms: SpectrogramTransform[] = [
      { name: 'double', version: '1', apply: (m) => ({ ...m, magnitude: Float32Array.from(m.magnitude, (v) => v * 2) }) },
    ];
    expect(
      Array.from(
        (
          await applyTransforms(matrix(), transforms, {
            requestedTimeStart: 0,
            requestedTimeEnd: 1,
            sampleRate: 4,
            stft: { windowSize: 2, fftSize: 2, hopSize: 1, window: 'hann' },
          })
        ).magnitude,
      ),
    ).toEqual([2, 4, 6, 8]);
  });
});
