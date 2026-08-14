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

    for (let i = 0; i < outLength; i++) {
      const t0 = startTime + (i / outLength) * timeSpan;
      const t1 = startTime + ((i + 1) / outLength) * timeSpan;

      const offset0 = Math.max(
        0,
        Math.min(len - 1, Math.floor((t0 - readStart) * sampleRate)),
      );
      const offset1 = Math.max(
        offset0 + 1,
        Math.min(len, Math.ceil((t1 - readStart) * sampleRate)),
      );

      let minVal = samples[offset0] ?? 0;
      let maxVal = samples[offset0] ?? 0;

      for (let j = offset0; j < offset1; j++) {
        const val = samples[j]!;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      min[i] = minVal;
      max[i] = maxVal;
    }

    return { min, max };
  }

  clear(): void {
    this.pyramid.clear();
  }
}
