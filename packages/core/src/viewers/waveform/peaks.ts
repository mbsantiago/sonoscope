import type { AudioSource } from "../../types";
import type { BarPeakBlock, PeakBlock } from "./types";

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

    const padSamples = 2;
    const startSampleIndex = Math.max(
      0,
      Math.floor(startTime * sampleRate) - padSamples,
    );
    const endSampleIndex = Math.min(
      Math.round(this.source.duration * sampleRate),
      Math.ceil(endTime * sampleRate) + padSamples,
    );

    const readStart = startSampleIndex / sampleRate;
    const readEnd = endSampleIndex / sampleRate;

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

    if (samplesPerPixel <= 3) {
      // Sub-sample / high zoom mode: use continuous linear interpolation between samples
      for (let i = 0; i < outLength; i++) {
        const t = startTime + (i / Math.max(1, outLength - 1)) * timeSpan;
        const targetSample = t * sampleRate;
        const s = targetSample - startSampleIndex;
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

    // Envelope mode: contiguous exact partition anchored to absolute sample indices
    let prevOffset = Math.max(
      0,
      Math.min(len - 1, Math.round(startTime * sampleRate - startSampleIndex)),
    );

    for (let i = 0; i < outLength; i++) {
      const t1 = startTime + ((i + 1) / outLength) * timeSpan;
      const nextOffset = Math.max(
        prevOffset + 1,
        Math.min(len, Math.round(t1 * sampleRate - startSampleIndex)),
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

  async getBarPeaks(
    startTime: number,
    endTime: number,
    barDuration: number,
  ): Promise<BarPeakBlock> {
    const sampleRate = this.source.sampleRate;
    const totalDuration = this.source.duration;
    const timeSpan = endTime - startTime;

    if (timeSpan <= 0 || barDuration <= 0) {
      return {
        min: new Float32Array(0),
        max: new Float32Array(0),
        kStart: 0,
        kEnd: 0,
        barDuration: Math.max(0.001, barDuration),
      };
    }

    const kStart = Math.max(
      0,
      Math.floor((startTime - barDuration) / barDuration),
    );
    const kEnd = Math.min(
      Math.ceil(totalDuration / barDuration),
      Math.ceil((endTime + barDuration) / barDuration),
    );
    const count = Math.max(0, kEnd - kStart + 1);

    const min = new Float32Array(count);
    const max = new Float32Array(count);

    if (count === 0) {
      return { min, max, kStart, kEnd, barDuration };
    }

    const readStart = Math.max(0, kStart * barDuration);
    const readEnd = Math.min(totalDuration, (kEnd + 1) * barDuration);

    const startSampleIndex = Math.max(0, Math.floor(readStart * sampleRate));
    const endSampleIndex = Math.min(
      Math.round(totalDuration * sampleRate),
      Math.ceil(readEnd * sampleRate),
    );

    const samples = await this.source.read({
      channel: this.channel,
      startTime: startSampleIndex / sampleRate,
      endTime: endSampleIndex / sampleRate,
    });

    const len = samples.length;
    if (len === 0) {
      return { min, max, kStart, kEnd, barDuration };
    }

    for (let k = kStart; k <= kEnd; k++) {
      const idx = k - kStart;
      const s0 = Math.max(
        0,
        Math.min(
          len - 1,
          Math.round(k * barDuration * sampleRate - startSampleIndex),
        ),
      );
      const s1 = Math.max(
        s0 + 1,
        Math.min(
          len,
          Math.round((k + 1) * barDuration * sampleRate - startSampleIndex),
        ),
      );

      let minVal = samples[s0] ?? 0;
      let maxVal = samples[s0] ?? 0;

      for (let j = s0; j < s1; j++) {
        const val = samples[j]!;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      min[idx] = minVal;
      max[idx] = maxVal;
    }

    return { min, max, kStart, kEnd, barDuration };
  }

  clear(): void {
    this.pyramid.clear();
  }
}
