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
    const outLength = Math.max(1, Math.round(targetWidth));
    const min = new Float32Array(outLength);
    const max = new Float32Array(outLength);

    const padTime = 1 / sampleRate;
    const readStart = Math.max(0, startTime - padTime);
    const readEnd = Math.min(this.source.duration, endTime + padTime);

    const samples = await this.source.read({
      channel: this.channel,
      startTime: readStart,
      endTime: readEnd,
    });

    const len = samples.length;
    if (len === 0) {
      return { min, max };
    }

    const timeSpan = endTime - startTime;
    const samplesPerPixel = (timeSpan * sampleRate) / outLength;

    if (samplesPerPixel < 1) {
      // Sub-sample / high zoom mode: use continuous linear interpolation between samples
      for (let i = 0; i < outLength; i++) {
        const t = startTime + (i / Math.max(1, outLength - 1)) * timeSpan;
        const s = (t - readStart) * sampleRate;
        const s0 = Math.max(0, Math.min(len - 1, Math.floor(s)));
        const s1 = Math.max(0, Math.min(len - 1, s0 + 1));
        const frac = Math.max(0, Math.min(1, s - s0));
        const v0 = samples[s0] ?? 0;
        const v1 = samples[s1] ?? 0;
        const interpolated = v0 + (v1 - v0) * frac;
        min[i] = interpolated;
        max[i] = interpolated;
      }
      return { min, max };
    }

    // Envelope mode: contiguous exact partition without gaps or overlaps
    let prevOffset = Math.max(
      0,
      Math.min(len - 1, Math.round((startTime - readStart) * sampleRate)),
    );

    for (let i = 0; i < outLength; i++) {
      const t1 = startTime + ((i + 1) / outLength) * timeSpan;
      const nextOffset = Math.max(
        prevOffset + 1,
        Math.min(len, Math.round((t1 - readStart) * sampleRate)),
      );

      let minVal = samples[prevOffset] ?? 0;
      let maxVal = samples[prevOffset] ?? 0;

      for (let j = prevOffset; j < nextOffset; j++) {
        const val = samples[j]!;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      min[i] = minVal;
      max[i] = maxVal;
      prevOffset = nextOffset;
    }

    return { min, max };
  }

  clear(): void {
    this.pyramid.clear();
  }
}
