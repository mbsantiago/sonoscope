import { bench, describe } from 'vitest';
import { MainThreadComputeBackend } from './backend';
import { computeStftMatrix } from './stft';
import type { AudioSource, StftConfig } from './types';

const sampleRate = 48_000;
const durationSeconds = 2;

function samples(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => Math.sin((2 * Math.PI * 440 * index) / sampleRate));
}

function source(data: Float32Array): AudioSource {
  return {
    id: 'synthetic:48000:2',
    sampleRate,
    duration: durationSeconds,
    channelCount: 1,
    read: ({ startTime, endTime }) => data.slice(Math.floor(startTime * sampleRate), Math.ceil(endTime * sampleRate)),
  };
}

const configs: StftConfig[] = [
  { windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' },
  { windowSize: 2048, fftSize: 2048, hopSize: 512, window: 'hann' },
];

const data = samples(sampleRate * durationSeconds);
const audioSource = source(data);

describe('STFT compute', () => {
  for (const stft of configs) {
    bench(`computeStftMatrix fft=${stft.fftSize} hop=${stft.hopSize}`, () => {
      computeStftMatrix(data, { channel: 0, timeStart: 0, sampleRate, stft });
    });
  }
});

describe('MainThreadComputeBackend', () => {
  for (const stft of configs) {
    bench(`computeTile fft=${stft.fftSize} hop=${stft.hopSize}`, async () => {
      await new MainThreadComputeBackend().computeTile({ source: audioSource, channel: 0, timeStart: 0, timeEnd: durationSeconds, stft });
    });
  }
});
