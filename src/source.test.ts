import { describe, expect, it } from 'vitest';
import { DecodedAudioSource } from './source';

function makeBuffer(): AudioBuffer {
  return {
    sampleRate: 10,
    duration: 1,
    length: 10,
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  } as unknown as AudioBuffer;
}

describe('DecodedAudioSource', () => {
  it('reads a time range as a copied Float32Array', () => {
    const source = new DecodedAudioSource(makeBuffer(), 'fixture');
    expect(Array.from(source.read({ channel: 0, startTime: 0.2, endTime: 0.5 }))).toEqual([2, 3, 4]);
  });
});
