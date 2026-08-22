import type { AudioSource } from "../../../types";
import type { BarPeakBlock } from "../types";

export class BarPeakPyramid {
  private pyramid = new Map<number, BarPeakBlock>();

  constructor(
    private readonly source: AudioSource,
    private readonly channel = 0,
  ) {}

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
      Math.ceil(readEnd * sampleRate) + 4,
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
      const targetS0 = Math.round(k * barDuration * sampleRate);
      const targetS1 = Math.round((k + 1) * barDuration * sampleRate);

      const s0 = Math.max(0, Math.min(len - 1, targetS0 - startSampleIndex));
      const s1 = Math.max(s0 + 1, Math.min(len, targetS1 - startSampleIndex));

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
