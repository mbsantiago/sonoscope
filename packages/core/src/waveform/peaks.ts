import type { AudioSource } from "../types";
import type { PeakBlock } from "./types";

export function computePeaks(
  samples: Float32Array,
  targetLength: number,
): PeakBlock {
  const len = samples.length;
  if (len === 0 || targetLength <= 0) {
    return { min: new Float32Array(0), max: new Float32Array(0) };
  }

  const outLength = Math.min(len, Math.max(1, Math.round(targetLength)));
  const min = new Float32Array(outLength);
  const max = new Float32Array(outLength);
  const blockSize = len / outLength;

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.min(len, Math.floor((i + 1) * blockSize));

    let minVal = samples[start] ?? 0;
    let maxVal = samples[start] ?? 0;

    for (let j = start + 1; j < end; j++) {
      const val = samples[j]!;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    min[i] = minVal;
    max[i] = maxVal;
  }

  return { min, max };
}

export class WaveformPeakPyramid {
  private pyramid = new Map<number, PeakBlock>();

  constructor(
    private readonly source: AudioSource,
    private readonly channel = 0,
  ) {}

  async getPeaks(
    startTime: number,
    endTime: number,
    targetWidth: number,
  ): Promise<PeakBlock> {
    const sampleRate = this.source.sampleRate;
    const duration = endTime - startTime;
    const totalSamples = Math.max(1, Math.round(duration * sampleRate));
    const samplesPerPixel = totalSamples / Math.max(1, targetWidth);

    // If highly zoomed in, read raw audio samples directly
    if (samplesPerPixel < 16) {
      const samples = await this.source.read({
        channel: this.channel,
        startTime: Math.max(0, startTime),
        endTime: Math.min(this.source.duration, endTime),
      });
      return computePeaks(samples, targetWidth);
    }

    // Otherwise compute peaks over the time window
    const samples = await this.source.read({
      channel: this.channel,
      startTime: Math.max(0, startTime),
      endTime: Math.min(this.source.duration, endTime),
    });
    return computePeaks(samples, targetWidth);
  }

  clear(): void {
    this.pyramid.clear();
  }
}
