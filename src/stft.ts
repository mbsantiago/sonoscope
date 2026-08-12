import { deriveDb, derivePower } from './value-scale';
import type { SpectrogramMatrix, StftConfig, WindowName } from './types';

export function createWindow(name: WindowName, size: number): Float32Array {
  return Float32Array.from({ length: size }, (_, n) => {
    if (name === 'rectangular') return 1;
    if (name === 'hann') return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
    if (name === 'hamming') return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (size - 1));
    return 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (size - 1));
  });
}

function fftMagnitudes(realInput: Float32Array): Float32Array {
  const n = realInput.length;
  const real = Float64Array.from(realInput);
  const imag = new Float64Array(n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j]!, real[i]!];
      [imag[i], imag[j]] = [imag[j]!, imag[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j++) {
        const evenReal = real[i + j]!;
        const evenImag = imag[i + j]!;
        const oddReal = real[i + j + len / 2]! * wReal - imag[i + j + len / 2]! * wImag;
        const oddImag = real[i + j + len / 2]! * wImag + imag[i + j + len / 2]! * wReal;
        real[i + j] = evenReal + oddReal;
        imag[i + j] = evenImag + oddImag;
        real[i + j + len / 2] = evenReal - oddReal;
        imag[i + j + len / 2] = evenImag - oddImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }

  return Float32Array.from({ length: n / 2 }, (_, i) => Math.hypot(real[i]!, imag[i]!) / n);
}

export function computeStftMatrix(
  samples: Float32Array,
  options: { channel: number; timeStart: number; sampleRate: number; stft: StftConfig },
): SpectrogramMatrix {
  const { stft, sampleRate } = options;
  const frameCount = Math.max(0, Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1);
  const binCount = stft.fftSize / 2;
  const window = createWindow(stft.window, stft.windowSize);
  const magnitude = new Float32Array(frameCount * binCount);
  const frame = new Float32Array(stft.fftSize);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    frame.fill(0);
    const offset = frameIndex * stft.hopSize;
    for (let i = 0; i < stft.windowSize; i++) frame[i] = samples[offset + i]! * window[i]!;
    magnitude.set(fftMagnitudes(frame), frameIndex * binCount);
  }

  const times = Float32Array.from({ length: frameCount }, (_, i) => options.timeStart + (i * stft.hopSize) / sampleRate);
  const frequencies = Float32Array.from({ length: binCount }, (_, i) => (i * sampleRate) / stft.fftSize);

  return {
    channel: options.channel,
    timeStart: options.timeStart,
    timeEnd: options.timeStart + samples.length / sampleRate,
    frameStart: Math.round((options.timeStart * sampleRate) / stft.hopSize),
    frameCount,
    binCount,
    sampleRate,
    times,
    frequencies,
    magnitude,
    power: derivePower(magnitude),
    db: deriveDb(magnitude),
  };
}
