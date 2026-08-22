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
    const totalDuration = this.source.duration;
    const timeSpan = endTime - startTime;

    if (timeSpan <= 0 || targetWidth <= 0) {
      return {
        min: new Float32Array(0),
        max: new Float32Array(0),
        x: new Float32Array(0),
        isLineMode: false,
      };
    }

    const outWidth = Math.max(1, Math.round(targetWidth));
    const samplesPerPixel = (timeSpan * sampleRate) / outWidth;
    const isLineMode = samplesPerPixel <= 3;

    if (isLineMode) {
      // Sub-sample / high zoom mode: extract sample points with continuous exact coordinates
      const sStart = Math.max(0, Math.floor(startTime * sampleRate) - 1);
      const sEnd = Math.min(
        Math.round(totalDuration * sampleRate),
        Math.ceil(endTime * sampleRate) + 1,
      );
      const count = Math.max(0, sEnd - sStart + 1);

      if (count === 0) {
        return {
          min: new Float32Array(0),
          max: new Float32Array(0),
          x: new Float32Array(0),
          isLineMode: true,
        };
      }

      const samples = await this.source.read({
        channel: this.channel,
        startTime: sStart / sampleRate,
        endTime: sEnd / sampleRate,
      });

      const len = samples.length;
      const min = new Float32Array(count);
      const max = new Float32Array(count);
      const x = new Float32Array(count);

      for (let s = sStart; s <= sEnd; s++) {
        const idx = s - sStart;
        const sampleOffset = Math.max(0, Math.min(len - 1, idx));
        const val = samples[sampleOffset] ?? 0;
        min[idx] = val;
        max[idx] = val;
        const t = s / sampleRate;
        x[idx] = ((t - startTime) / timeSpan) * targetWidth;
      }

      return { min, max, x, isLineMode: true };
    }

    // Envelope mode: contiguous exact partition anchored to absolute time grid [k * deltaT, (k + 1) * deltaT]
    const deltaT = timeSpan / outWidth;
    const kStart = Math.max(0, Math.floor((startTime - deltaT) / deltaT));
    const kEnd = Math.min(
      Math.ceil(totalDuration / deltaT),
      Math.ceil((endTime + deltaT) / deltaT),
    );
    const count = Math.max(0, kEnd - kStart + 1);

    if (count === 0) {
      return {
        min: new Float32Array(0),
        max: new Float32Array(0),
        x: new Float32Array(0),
        isLineMode: false,
      };
    }

    const readStart = Math.max(0, kStart * deltaT);
    const readEnd = Math.min(totalDuration, (kEnd + 1) * deltaT);

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
    const min = new Float32Array(count);
    const max = new Float32Array(count);
    const x = new Float32Array(count);

    if (len === 0) {
      return { min, max, x, isLineMode: false };
    }

    for (let k = kStart; k <= kEnd; k++) {
      const idx = k - kStart;
      const s0 = Math.max(
        0,
        Math.min(
          len - 1,
          Math.round(k * deltaT * sampleRate - startSampleIndex),
        ),
      );
      const s1 = Math.max(
        s0 + 1,
        Math.min(
          len,
          Math.round((k + 1) * deltaT * sampleRate - startSampleIndex),
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
      const tCenter = (k + 0.5) * deltaT;
      x[idx] = ((tCenter - startTime) / timeSpan) * targetWidth;
    }

    return { min, max, x, isLineMode: false };
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
